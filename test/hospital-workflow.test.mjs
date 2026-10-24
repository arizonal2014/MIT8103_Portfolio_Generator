import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createHospitalWorkflow,hospitalScenario} from '../lib/hospital-workflow.mjs';
import {createServer} from '../server.mjs';
import {reviewHospitalPilot} from '../examples/hospital-execution.mjs';
import {validateCaseSpec} from '../lib/case-spec.mjs';
import {hospitalSnapshot} from './hospital-design-fixture.mjs';
const model=JSON.parse(await readFile(new URL('../examples/pilot-hospital.json',import.meta.url),'utf8'));
const input=()=>({firstName:'Alex',surname:'Nwosu',studentId:'000123',provider:'copilot',caseStudy:hospitalScenario,requestId:randomUUID(),allowLive:true});
const temp=()=>mkdtemp(path.join(tmpdir(),'mit8103-workflow-test-'));
async function generation(root,spec=model,status='validated'){
  const directory=path.join(root,randomUUID());await mkdir(directory);await writeFile(path.join(directory,'case-response.txt'),JSON.stringify(spec));return {directory,status};
}
test('disabled or unsupported pilot never invokes external work',async()=>{
  let calls=0;const never=async()=>{calls++;throw new Error('must not run');};
  const workflow=createHospitalWorkflow({runsDirectory:await temp(),generate:never,execute:never});
  await assert.rejects(workflow.start(input()),/not enabled/);
  const enabled=createHospitalWorkflow({runsDirectory:await temp(),account:'fixture',generate:never,execute:never});
  await assert.rejects(enabled.start({...input(),caseStudy:'Library loans'}),/highlighted/);assert.equal(calls,0);
});
test('one retry is bounded and a rejected design cannot reach the database',async()=>{
  const root=await temp();let calls=0,executions=0;
  const workflow=createHospitalWorkflow({runsDirectory:root,account:'fixture',generate:async()=>{calls++;return generation(root,{},'invalid_response');},execute:async()=>{executions++;}});
  const job=await workflow.start(input());await workflow.settled(job.id);
  assert.equal(calls,2);assert.equal(executions,0);assert.equal(workflow.get(job.id).status,'failed');
});
test('same request returns its job while concurrent new requests are rejected',async()=>{
  const root=await temp();let release;const waiting=new Promise(resolve=>{release=resolve;});
  const workflow=createHospitalWorkflow({runsDirectory:root,account:'fixture',generate:async()=>{await waiting;return {status:'provider_failed'};}});
  const raw=input(),job=await workflow.start(raw);assert.equal((await workflow.start(raw)).id,job.id);
  await assert.rejects(workflow.start(input()),/already running/);release();await workflow.settled(job.id);
});
test('mocked passing pipeline writes prefixed artifacts and leaves unfinished stages pending',async()=>{
  const root=await temp();const workflow=createHospitalWorkflow({runsDirectory:root,account:'fixture',generate:async options=>{assert.equal(options.caseStudy,hospitalScenario);assert.ok(!('studentId' in options));return generation(root);},execute:async()=>{
    const directory=path.join(root,'mock-database');await mkdir(directory);
    for(const file of ['Schema.sql','ConstraintTests.sql','ExecutionPlan.json','ReviewedCaseSpec.json','Catalog.json','Report.json','Evidence.html','SchemaExecution.log','TablesAndConstraints.log','ConstraintTests.log'])await writeFile(path.join(directory,file),'unit test fixture only');
    const reviewed=reviewHospitalPilot(model).spec;
    await writeFile(path.join(directory,'ReviewedCaseSpec.json'),JSON.stringify(reviewed));
    await writeFile(path.join(directory,'Catalog.json'),JSON.stringify(hospitalSnapshot()));
    return {status:'passed',directory,checks:{tables:4},reviewedFingerprint:validateCaseSpec(reviewed).fingerprint};
  }});
  const job=await workflow.start(input());await workflow.settled(job.id);const result=workflow.get(job.id);
  assert.equal(result.status,'complete');assert.ok(result.outputDirectory.endsWith('Nwosu_Alex_000123'));assert.equal(result.files.length,17);
  assert.equal(result.stages.find(s=>s.id===9).status,'complete');assert.equal(result.stages.find(s=>s.id===6).status,'complete');assert.equal(result.stages.find(s=>s.id===7).status,'complete');assert.equal(result.stages.find(s=>s.id===11).status,'pending');assert.equal(result.submissionReady,false);
  const manifest=JSON.parse(await readFile(workflow.artifact(job.id,'manifest').path,'utf8'));assert.equal(manifest.input.studentId,'000123');assert.equal(manifest.provider.connected,true);
  assert.equal(workflow.artifact(job.id,'../../secrets'),undefined);
});
test('live HTTP route stays disabled by default and rejects cross-origin starts',async()=>{
  const server=createServer({runsDirectory:await temp(),pilotAccount:null});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    assert.equal((await (await fetch(origin+'/api/pilot/config')).json()).enabled,false);
    assert.equal((await fetch(origin+'/api/pilot/start',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify(input())})).status,403);
    assert.equal((await fetch(origin+'/api/pilot/start',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input())})).status,503);
    assert.equal((await fetch(origin+'/api/pilot/jobs/'+randomUUID()+'/files/schema')).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
