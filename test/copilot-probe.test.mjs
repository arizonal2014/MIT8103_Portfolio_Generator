import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile}from 'node:fs/promises';
import path from 'node:path';
import {tmpdir}from 'node:os';
import {buildCopilotProbePrompt,copilotProbeArguments,extractCopilotResponse,redactProbeText,runCopilotProbe}from '../lib/copilot-probe.mjs';
import {hospitalCase}from '../examples/cases.mjs';

test('live probe requires explicit approval before invoking anything',async()=>{
  await assert.rejects(runCopilotProbe({account:'sample',caseStudy:'Hospital system',runCommand:()=>{throw new Error('must not run');}}),/disabled/);
});
test('probe flags expose no tools or permissive switches',()=>{
  const args=copilotProbeArguments('fixture prompt');
  assert.ok(args.includes('--available-tools'));assert.equal(args[args.indexOf('--available-tools')+1],'--deny-tool');
  for(const flag of ['--allow-all','--allow-all-tools','--allow-all-paths','--fleet'])assert.ok(!args.includes(flag));
  assert.ok(args.includes('--disable-builtin-mcps'));assert.ok(args.includes('--no-custom-instructions'));
  assert.equal(args[args.indexOf('--output-format')+1],'json');
});
test('credential-like diagnostics are redacted',()=>{
  assert.equal(redactProbeText('token fixture-secret','fixture-secret'),'token [redacted]');
  assert.equal(redactProbeText('gho_testfixture123'),'[redacted]');
});
test('mocked probe validates response, keeps token out of argv and records actual provenance',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'mit8103-probe-test-'));
  const calls=[];
  const runCommand=async(command,args,options)=>{
    calls.push({command,args,options});
    if(calls.length===1)return {stdout:'fixture-secret\n',stderr:''};
    if(calls.length===2)return {stdout:'sample\n',stderr:''};
    assert.ok(!args.some(v=>v.includes('fixture-secret')));
    assert.equal(options.env.COPILOT_GITHUB_TOKEN,'fixture-secret');
    assert.equal(options.env.COPILOT_ALLOW_ALL,'false');
    return {stdout:JSON.stringify({type:'assistant.message',data:{content:JSON.stringify(hospitalCase())}}),stderr:'fixture-secret'};
  };
  const report=await runCopilotProbe({account:'sample',caseStudy:'Hospital system',allowLive:true,runsDirectory:root,runCommand});
  assert.equal(calls.length,3);assert.equal(report.status,'validated');assert.equal(report.databaseExecuted,false);
  assert.equal(await readFile(path.join(report.directory,'diagnostic.txt'),'utf8'),'[redacted]');
});
test('machine envelope preserves JSON string escapes and ignores lifecycle events',()=>{
  const content=JSON.stringify({description:'Line one\nLine two',quote:'A "title"'});
  const stdout=[{type:'session.start',data:{}},{type:'assistant.message',data:{content:'',toolRequests:[]}},{type:'assistant.message',data:{content}},{type:'session.idle',data:{}}].map(JSON.stringify).join('\n');
  assert.equal(extractCopilotResponse(stdout),content);
});
test('ambiguous, malformed and tool-using envelopes are rejected',()=>{
  for(const value of ['plain text','',JSON.stringify({type:'assistant.message',data:{}}),
    [1,2].map(()=>JSON.stringify({type:'assistant.message',data:{content:'{}'}})).join('\n'),
    JSON.stringify({type:'assistant.message',data:{content:'{}',toolRequests:[{name:'shell'}]}}),
    [{type:'assistant.message',data:{content:'',toolRequests:[{name:'shell'}]}},{type:'assistant.message',data:{content:'{}'}}].map(JSON.stringify).join('\n')])assert.throws(()=>extractCopilotResponse(value));
});
test('invalid model JSON stays invalid and its original bytes are retained',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'mit8103-probe-invalid-'));
  const content='{"description":"broken\nstring"}';let calls=0;
  const stdout=JSON.stringify({type:'assistant.message',data:{content}});
  const report=await runCopilotProbe({account:'sample',caseStudy:'Hospital system',allowLive:true,runsDirectory:root,runCommand:async()=>({stdout:++calls===1?'fixture-secret':calls===2?'sample':stdout,stderr:''})});
  assert.equal(report.status,'invalid_response');
  assert.equal(await readFile(path.join(report.directory,'response.txt'),'utf8'),stdout);
  assert.equal(await readFile(path.join(report.directory,'case-response.txt'),'utf8'),content);
});
test('account mismatch stops before any model request',async()=>{
  let calls=0;
  await assert.rejects(runCopilotProbe({account:'approved',caseStudy:'Hospital system',allowLive:true,runCommand:async()=>({stdout:++calls===1?'fixture-secret':'different',stderr:''})}),/does not match/);
  assert.equal(calls,2);
});
test('correction prompt includes actual validation errors and refuses passing or oversized input',()=>{
  const spec=hospitalCase();spec.noSql.embeddedEntities=['unknown_snapshot'];
  const prompt=buildCopilotProbePrompt('Hospital appointments',JSON.stringify(spec));
  assert.ok(prompt.includes('unknown_snapshot'));assert.ok(prompt.includes('VALIDATION_ERRORS_JSON:'));
  assert.throws(()=>buildCopilotProbePrompt('Hospital appointments',JSON.stringify(hospitalCase())),/already passes/);
  assert.throws(()=>buildCopilotProbePrompt('Hospital appointments','x'.repeat(100001)),/100 KB/);
});
