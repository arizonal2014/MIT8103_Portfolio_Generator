import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {providerFailureMessage,recoveryAdvice,recoverSavedProviderFailure,unclassifiedCopilotFailureMessage} from '../lib/preflight.mjs';
import {runCopilotProbe} from '../lib/copilot-probe.mjs';
import {createCaseWorkflow} from '../lib/case-workflow.mjs';
import {createGuidedWorkflow} from '../lib/guided-workflow.mjs';
import {createServer} from '../server.mjs';
import {libraryExecution,snapshotFor} from './general-case-fixtures.mjs';
import {validateCaseSpec} from '../lib/case-spec.mjs';

const denial='Error: Access denied by policy settings (Request ID: fixture) Your Copilot CLI policy setting may be preventing access. Your organization has restricted Copilot access or your Copilot subscription does not include this feature.';
const legacy='Copilot sign-in failed. Reconnect the same GitHub account, then retry this saved run.';
const policyMessage=()=>providerFailureMessage('provider_failed',denial);

test('policy, license and generic forbidden failures do not tell students to reconnect GitHub',()=>{
 for(const diagnostic of [denial,'HTTP 403 Forbidden','Authentication failed: access denied by policy settings','No active Copilot license','Copilot subscription does not include this feature']){
  const message=providerFailureMessage('provider_failed',diagnostic),recovery=recoveryAdvice(message);
  assert.match(message,/Copilot access/);assert.doesNotMatch(message,/sign-in failed|Reconnect/);
  assert.equal(recovery.action,'copilot-settings');assert.match(recovery.hint,/same GitHub account/);assert.match(recovery.hint,/Retry remaining stages/);
 }
});
test('recovery also classifies raw policy errors before authentication words',()=>{
 for(const text of [denial,'Authentication failed: HTTP 403 Forbidden'])assert.equal(recoveryAdvice(text).action,'copilot-settings');
});
test('credentials, allowance and network failures retain distinct recovery paths',()=>{
 for(const [text,action,words]of [['HTTP 401 Unauthorized: invalid token','connect',/credentials were rejected/],['HTTP 403 rate limit exceeded','retry',/allowance/],['ECONNRESET network failure','retry',/could not connect/]]){
  const message=providerFailureMessage('provider_failed',text);assert.match(message,words);assert.equal(recoveryAdvice(message).action,action);
 }
 assert.match(providerFailureMessage('timed_out',''),/timed out/);
 assert.match(providerFailureMessage('invalid_response',denial),/validation/);
});
test('CLI policy failure is redacted and presented as access denial, not sign-in failure',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'policy-probe-'));let calls=0;
 const report=await runCopilotProbe({account:'student',caseStudy:'Library borrowing system',allowLive:true,runsDirectory:root,runCommand:async()=>{
  if(++calls===1)return{stdout:'fixture-secret'};if(calls===2)return{stdout:'student'};
  throw Object.assign(Error('Denied'),{code:1,stderr:denial+' fixture-secret'});
 }});
 assert.equal(report.status,'provider_failed');assert.equal(report.message,policyMessage());assert.doesNotMatch(report.message,/fixture|Request ID/);
 assert.doesNotMatch(await readFile(path.join(report.directory,'diagnostic.txt'),'utf8'),/fixture-secret/);
});

async function savedFailure({diagnostic=denial,linked=false,onlyLegacy=false,baseOptions={}}={}){
 const root=await mkdtemp(path.join(tmpdir(),'saved-policy-')),id=randomUUID(),directory=path.join(root,'case-run-'+id);await mkdir(directory);
 const input={firstName:'Robin',surname:'Hart',studentId:'000246',prefix:'Hart_Robin_000246',caseStudy:'Library borrowing system',provider:'copilot'};
 const baseRecord={id,status:'failed',prefix:'Hart_Robin_000246',message:legacy,files:[],steps:[{id:'design',name:'Generate design',status:'failed'}]};
 await writeFile(path.join(directory,'Workflow.json'),JSON.stringify(baseRecord));
 if(!onlyLegacy){
  const probe=path.join(directory,'copilot-probe-'+randomUUID()),source=linked?await mkdtemp(path.join(tmpdir(),'unrelated-policy-')):probe;if(!linked)await mkdir(source);
  await writeFile(path.join(source,'report.json'),JSON.stringify({provider:'copilot',kind:'live_cli_probe',status:'provider_failed',finishedAt:'2026-10-25T10:00:00Z'}));
  await writeFile(path.join(source,'diagnostic.txt'),diagnostic);await writeFile(path.join(source,'response.txt'),'');
  if(linked)await symlink(source,probe);
 }
 const state={id,input,status:'failed',message:legacy,repository:{verified:true,url:'https://github.com/student/Hart_Robin_000246',name:'Hart_Robin_000246',runId:id},checkpoints:[{sha:'original'}],pipeline:['Repository','Design and tables','SQL and optimisation','Transactions','MongoDB','Distributed design','Summary'].map((name,i)=>({name,status:i===0?'complete':i===1?'failed':'pending',logs:i===1?[{message:legacy}]:[]}))};
 await mkdir(path.join(root,'.guided-runs'));await writeFile(path.join(root,'.guided-runs',id+'.json'),JSON.stringify(state));
 const base=createCaseWorkflow({runsDirectory:root,account:'student',...baseOptions});let saves=0,creates=0;
 const repository={check:async()=>({status:'setup',url:state.repository.url}),ensure:async()=>{creates++;},save:async()=>({sha:'next-'+(++saves),url:state.repository.url+'/commit/next-'+saves})};
 const options={root,runsDirectory:root,repository};
 const flow=createGuidedWorkflow(base,options);await flow.ready;
 return{root,id,directory,base,flow,options,counts:()=>({saves,creates})};
}
test('restart corrects legacy policy failures from saved diagnostics without new requests or repository changes',async()=>{
 const f=await savedFailure(),job=f.flow.get(f.id);
 assert.equal(job.message,policyMessage());assert.equal(job.guided.message,policyMessage());assert.equal(job.guided.recovery.action,'copilot-settings');
 assert.equal(job.guided.pipeline[1].logs.at(-1).message,policyMessage());assert.equal(job.guided.checkpoints[0].sha,'original');assert.equal(job.id,f.id);
 assert.deepEqual(f.counts(),{saves:0,creates:0});
 assert.equal(JSON.parse(await readFile(path.join(f.directory,'Workflow.json'),'utf8')).message,legacy,'original private record retained');
});

test('saved policy failure survives HTTP reload and retries the original repository after access is restored',async()=>{
 let enabled=false,requests=0,executions=0;const example=libraryExecution();
 const saveResponse=async(text,root)=>{const directory=path.join(root,randomUUID());await mkdir(directory);await writeFile(path.join(directory,'case-response.txt'),JSON.stringify(text));return{directory,status:'validated'};};
 const f=await savedFailure({baseOptions:{
  generateSpec:async options=>{requests++;return enabled?saveResponse(example.spec,options.runsDirectory):{status:'provider_failed',message:policyMessage()};},
  generateExecution:async options=>saveResponse(example.pkg,options.runsDirectory),
  execute:async(spec,pkg,root)=>{
   executions++;const directory=path.join(root,'fixture-database');await mkdir(directory);
   for(const name of ['Schema.sql','Seed.sql','ConstraintTests.sql','ExecutionPlan.json','ExecutionPackage.json','ReviewedCaseSpec.json','Catalog.json','Report.json','Evidence.html','SchemaExecution.log','SeedExecution.log','TablesAndConstraints.log','ConstraintTests.log'])await writeFile(path.join(directory,name),name==='Catalog.json'?JSON.stringify(snapshotFor(pkg)):'controlled fixture');
   return{status:'passed',directory,reviewedFingerprint:validateCaseSpec(spec).fingerprint,checks:{tables:4,rejectedInvalidRecords:13}};
  },
 }});
 const later={};const base={...f.base,get:id=>{const job=f.base.get(id);return job?{...job,...later}:null;}};
 for(const[n,name]of[[2,'startQueries'],[3,'startTransactions'],[4,'startMongo']])base[name]=async()=>{later['portfolio'+n]={status:'complete',message:'Fixture passed'};};
 const flow=createGuidedWorkflow(base,{...f.options,prepare:async()=>({output:f.root}),capture:async()=>[],finish:async()=>({stages:[],status:'complete'})});await flow.ready;
 const server=createServer({runsDirectory:f.root,pilotWorkflow:flow,pilotAccount:null});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const get=async()=>{const response=await fetch(url+'/api/pilot/jobs/'+f.id);assert.equal(response.status,200);return response.json();};
 const retry=async()=>{const response=await fetch(url+'/api/pilot/jobs/'+f.id+'/continue',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({allowRun:true})});assert.equal(response.status,202);await flow.guidedSettled(f.id);};
 try{
  assert.equal((await get()).guided.recovery.action,'copilot-settings');assert.equal(requests,0);
  await retry();const stillBlocked=await get();assert.equal(stillBlocked.guided.status,'failed');assert.equal(executions,0);assert.equal(requests,1);assert.deepEqual(f.counts(),{saves:0,creates:0});
  enabled=true;await retry();const complete=await get();assert.equal(complete.guided.status,'complete',complete.guided.message);assert.equal(complete.id,f.id);assert.equal(complete.guided.checkpoints[0].sha,'original');assert.equal(complete.guided.checkpoints.length,7);assert.equal(complete.guided.repository.url,'https://github.com/student/Hart_Robin_000246');assert.equal(executions,1);assert.deepEqual(f.counts(),{saves:6,creates:0});
 }finally{await new Promise(r=>server.close(r));}
});
test('legacy credential failures remain reconnectable; missing or unsafe diagnostics are not guessed',async()=>{
 const credentials=await savedFailure({diagnostic:'HTTP 401 Unauthorized: invalid token'});assert.equal(credentials.flow.get(credentials.id).guided.recovery.action,'connect');
 for(const options of [{onlyLegacy:true},{linked:true}]){
  const f=await savedFailure(options),job=f.flow.get(f.id);assert.doesNotMatch(job.guided.message,/access is blocked/);
  assert.equal(job.guided.recovery.action,'copilot-settings');assert.match(job.guided.recovery.hint,/Check Copilot access first/);
 }
});

test('newer successful requests and oversized or linked files cannot mislabel an older saved run',async()=>{
 for(const variant of ['success','oversized','linked']){
  const f=await savedFailure(),probe=path.join(f.directory,'copilot-probe-'+randomUUID());await mkdir(probe);
  await writeFile(path.join(probe,'report.json'),JSON.stringify({provider:'copilot',kind:'live_cli_probe',status:variant==='success'?'validated':'provider_failed',finishedAt:'2026-10-25T11:00:00Z'}));
  const file=path.join(probe,'diagnostic.txt');
  if(variant==='linked')await symlink(path.join(f.directory,'Workflow.json'),file);else await writeFile(file,variant==='oversized'?'x'.repeat(600001):denial);
  assert.equal(await recoverSavedProviderFailure(await (await import('node:fs/promises')).realpath(f.directory)),null,variant);
  const restored=createCaseWorkflow({runsDirectory:f.root,account:'student'});await restored.ready;assert.equal(restored.get(f.id).message,unclassifiedCopilotFailureMessage,variant);
 }
});

test('an unrelated completed stage message cannot replace an old failure message',async()=>{
 const f=await savedFailure(),base={...f.base,get:id=>({...f.base.get(id),status:'complete',message:'Design completed successfully'})};
 const restored=createGuidedWorkflow(base,f.options);await restored.ready;
 assert.equal(restored.get(f.id).guided.message,unclassifiedCopilotFailureMessage);assert.equal(restored.get(f.id).guided.pipeline[1].status,'failed');
});
