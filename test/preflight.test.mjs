import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {inspectCaseStudy,validatePortfolioInput} from '../case-input.mjs';
import {inspectRuntime,recoveryAdvice} from '../lib/preflight.mjs';
import {createGuidedWorkflow} from '../lib/guided-workflow.mjs';
import {createServer} from '../server.mjs';

const details={firstName:'Robin',surname:'Hart',studentId:'000246',provider:'copilot',caseStudy:'Community garden plot allocation'};
const raw=()=>({...details,requestId:randomUUID(),allowLive:true});

test('case check catches common typos without silently changing the input',()=>{
 const text='Hospital mangement sytem';const result=inspectCaseStudy(text);
 assert.equal(result.status,'suggestion');assert.equal(result.suggestions[0],'Hospital management system');assert.equal(text,'Hospital mangement sytem');
 assert.equal(inspectCaseStudy('Libary borrowing system').suggestions[0],'Library borrowing system');
});
test('vague descriptions ask for a subject and offer small examples',()=>{
 for(const value of ['Management system','A system','An online management system','Database','My project'])assert.equal(inspectCaseStudy(value).status,'clarify',value);
 assert.equal(inspectCaseStudy('Management system').suggestions.length,3);
});
test('obvious placeholder and nonword input cannot reach generation',()=>{
 for(const value of ['123456','!!!!!!','xxxxxx','qwerty','asdfasdf','hello world','testing','abcdefg'])assert.equal(inspectCaseStudy(value).status,'invalid',value);
});
test('free text supports unfamiliar domains without an approved case-study list',()=>{
 for(const value of ['Medusa coral restoration tracking','Hospital management system','Parcel locker collection','A cooperative tracks seed exchanges and returns.','A school records student enrolment and course capacity.','Gestion des prêts de vélos','管理图书借阅系统'])assert.equal(inspectCaseStudy(value).status,'ready',value);
});
test('repository-compatible identity validation keeps real IDs and leading zeroes',()=>{
 assert.equal(validatePortfolioInput(details).prefix,'Hart_Robin_000246');
 for(const patch of [{firstName:'../../x'},{studentId:'../001'},{surname:'李'},{firstName:'X'.repeat(70),surname:'Y'.repeat(70)}])assert.throws(()=>validatePortfolioInput({...details,...patch}));
});
test('runtime preflight only checks availability and reports actionable setup failures',async()=>{
 const commands=[];const ready=await inspectRuntime({command:async(cmd,args)=>{commands.push([cmd,args]);return{stdout:'29'};},provider:async()=>({installed:true})});
 assert.equal(ready.ready,true);assert.deepEqual(commands,[['docker',['info','--format','{{.ServerVersion}}']]]);
 assert.equal((await inspectRuntime({command:async()=>{throw Error('daemon');},provider:async()=>({installed:true})})).ready,false);
 assert.match((await inspectRuntime({command:async()=>({}),provider:async()=>({installed:false})})).message,/setup:workspace/);
});
test('recovery guidance distinguishes allowance, authentication, edits and runtime failures',()=>{
 assert.equal(recoveryAdvice('HTTP 401 authentication failed').action,'connect');
 assert.match(recoveryAdvice('Premium requests exhausted').hint,/allowance/);
 assert.equal(recoveryAdvice('The portfolio was edited on GitHub').action,'resolve');
 assert.match(recoveryAdvice('Docker daemon unavailable').hint,/Docker/);
 assert.match(recoveryAdvice('ENOSPC').hint,/storage/);
});

async function fixture({repoStatus='new',failOnce=false,initialFailure=false,runtimeReady=true}={}){
 const root=await mkdtemp(path.join(tmpdir(),'preflight-')),jobs=new Map(),calls={check:0,ensure:0,start:0,runtime:0,p2:0,p3:0,p4:0,save:0};let fail=failOnce,launchFail=initialFailure;
 const repository={
  check:async input=>{calls.check++;return{status:calls.ensure&&repoStatus==='new'?'setup':repoStatus,owner:'fixture',name:input.prefix,url:'https://github.com/fixture/'+input.prefix,message:'Existing work is safe.'};},
  ensure:async(input,id)=>{calls.ensure++;return{verified:true,owner:'fixture',name:input.prefix,runId:id,sha:'setup',url:'https://github.com/fixture/'+input.prefix};},
  save:async(repo,source,prefix,label)=>({sha:'checkpoint'+(++calls.save),url:repo.url+'/commit/'+calls.save,stage:label}),
 };
 const launch=async input=>{calls.start++;if(launchFail){launchFail=false;throw Error('Connection interrupted after repository setup');}await mkdir(path.join(root,'case-run-'+input.requestId),{recursive:true});const job={id:input.requestId,prefix:'Hart_Robin_000246',status:'complete',files:[],outputDirectory:root,checks:{tables:3,rejectedInvalidRecords:4}};jobs.set(job.id,job);return structuredClone(job);};
 const base={enabled:true,account:'fixture',ready:Promise.resolve(),list:()=>[...jobs.values()],get:id=>jobs.has(id)?structuredClone(jobs.get(id)):null,start:launch,retryInitial:async(id,input)=>launch({...input,requestId:id}),settled:async()=>{},artifact:()=>null,queriesSettled:async()=>{},transactionsSettled:async()=>{},mongoSettled:async()=>{}};
 for(const[n,key]of[[2,'startQueries'],[3,'startTransactions'],[4,'startMongo']])base[key]=async id=>{calls['p'+n]++;const status=n===4&&fail?'failed':'complete';if(n===4)fail=false;jobs.get(id)['portfolio'+n]={status,message:status==='failed'?'Copilot allowance exhausted':'Passed'};};
 const options={root,runsDirectory:root,repository,runtime:async()=>{calls.runtime++;return{ready:runtimeReady,message:'Docker is not ready.'};},inspect:async()=>({verified:true,login:'fixture'}),prepare:async()=>({output:root}),capture:async()=>[],finish:async()=>({stages:[],status:'complete'})};
 const flow=createGuidedWorkflow(base,options);await flow.ready;return{root,flow,base,options,calls};
}

test('unclear case is blocked before GitHub, runtime checks or generation',async()=>{
 const f=await fixture(),input={...raw(),caseStudy:'Management system'};
 assert.equal((await f.flow.preflight(input)).status,'clarify');
 await assert.rejects(f.flow.start(input),e=>e.preflight?.status==='clarify');
 assert.equal(f.calls.check,0);assert.equal(f.calls.ensure,0);assert.equal(f.calls.start,0);
});
test('suggestion must be accepted or explicitly kept; invalid text cannot bypass checks',async()=>{
 const f=await fixture(),input={...raw(),caseStudy:'Hospital mangement'};
 assert.equal((await f.flow.preflight(input)).status,'suggestion');
 assert.equal((await f.flow.preflight({...input,confirmedCaseStudy:input.caseStudy})).status,'ready');
 assert.equal((await f.flow.preflight({...input,confirmedCaseStudy:'another text'})).status,'suggestion');
 assert.equal((await f.flow.preflight({...input,caseStudy:'123456',confirmedCaseStudy:'123456'})).status,'invalid');
 assert.equal(f.calls.ensure,0);assert.equal(f.calls.start,0);
});
test('existing repository offers its URL and prevents writes even if start API is called directly',async()=>{
 const f=await fixture({repoStatus:'existing'}),input=raw(),result=await f.flow.preflight(input);
 assert.equal(result.status,'existing');assert.equal(result.repository.url,'https://github.com/fixture/Hart_Robin_000246');
 await assert.rejects(f.flow.start(input),e=>e.preflight?.status==='existing');assert.equal(f.calls.start,0);assert.equal(f.calls.ensure,0);assert.equal(f.calls.runtime,0);
});
test('unavailable runtime stops before repository creation and AI usage',async()=>{
 const f=await fixture({runtimeReady:false});await assert.rejects(f.flow.start(raw()),/Docker is not ready/);assert.equal(f.calls.ensure,0);assert.equal(f.calls.start,0);
});
test('a failed stage retries only unfinished work and retains its existing repository',async()=>{
 const f=await fixture({failOnce:true}),input=raw();await f.flow.start(input);await f.flow.guidedSettled(input.requestId);
 const first=f.flow.get(input.requestId);assert.equal(first.guided.status,'failed');assert.match(first.guided.recovery.hint,/allowance/);assert.equal(first.guided.checkpoints.length,4);
 await f.flow.continueRun(input.requestId,{allowRun:true});await f.flow.guidedSettled(input.requestId);
 assert.equal(f.flow.get(input.requestId).guided.status,'complete');assert.equal(f.calls.ensure,1);assert.equal(f.calls.start,1);assert.equal(f.calls.p2,1);assert.equal(f.calls.p3,1);assert.equal(f.calls.p4,2);assert.equal(f.flow.get(input.requestId).guided.checkpoints.length,7);
});
test('saved run is found by account and identity without starting another run',async()=>{
 const f=await fixture();const input=raw();await f.flow.start(input);await f.flow.guidedSettled(input.requestId);
 const result=await f.flow.preflight({...input,requestId:randomUUID()});assert.equal(result.status,'saved');assert.equal(result.run.id,input.requestId);assert.equal(f.calls.ensure,1);
 const other=await f.flow.start({...input,requestId:randomUUID()});assert.equal(other.id,input.requestId);assert.equal(f.calls.start,1);
});
test('failure immediately after setup is recoverable after a server restart',async()=>{
 const f=await fixture({initialFailure:true}),input=raw();const stopped=await f.flow.start(input);assert.equal(stopped.guided.status,'failed');assert.equal(f.calls.ensure,1);
 const saved=JSON.parse(await readFile(path.join(f.root,'.guided-runs',input.requestId+'.json')));assert.equal(saved.input.studentId,'000246');
 const restored=createGuidedWorkflow(f.base,f.options);await restored.ready;assert.equal(restored.latestId(),input.requestId);assert.equal(restored.get(input.requestId).guided.status,'failed');
 await restored.continueRun(input.requestId,{allowRun:true});await restored.guidedSettled(input.requestId);assert.equal(restored.get(input.requestId).guided.status,'complete');assert.equal(f.calls.ensure,1);assert.equal(f.calls.start,2);
});
test('lost response repeated with the same request cannot create a duplicate run',async()=>{
 const f=await fixture(),input=raw();await f.flow.start(input);await f.flow.guidedSettled(input.requestId);await f.flow.start(input);assert.equal(f.calls.start,1);assert.equal(f.calls.ensure,1);
 await assert.rejects(f.flow.start({...input,studentId:'000247'}),/different details/);
});
test('preflight HTTP route uses same-origin protection and structured start errors',async()=>{
 const f=await fixture(),server=createServer({pilotWorkflow:f.flow,runsDirectory:f.root,pilotAccount:null});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{
  const post=(route,body,origin=url)=>fetch(url+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const unclear={...raw(),caseStudy:'Management system'};
  assert.equal((await post('/api/pilot/preflight',unclear,'https://evil.example')).status,403);
  assert.equal((await (await post('/api/pilot/preflight',unclear)).json()).status,'clarify');
  const blocked=await post('/api/pilot/start',unclear);assert.equal(blocked.status,422);assert.equal((await blocked.json()).preflight.status,'clarify');
  assert.equal((await post('/api/pilot/preflight',{...raw(),studentId:'../001'})).status,422);
  assert.equal((await fetch(url+'/case-input.mjs')).status,200);assert.equal(f.calls.start,0);
 }finally{await new Promise(r=>server.close(r));}
});

test('retry checks the signed-in account before running or saving anything else',async()=>{
 const f=await fixture({failOnce:true}),input=raw();await f.flow.start(input);await f.flow.guidedSettled(input.requestId);
 f.options.repository.check=async()=>({status:'existing',url:'https://github.com/another/Hart_Robin_000246'});
 await assert.rejects(f.flow.continueRun(input.requestId,{allowRun:true}),/original GitHub account/);assert.equal(f.calls.p4,1);assert.equal(f.flow.get(input.requestId).guided.recovery.action,'connect');
});
test('a deleted remote repository stops retry before another database attempt',async()=>{
 const f=await fixture({failOnce:true}),input=raw();await f.flow.start(input);await f.flow.guidedSettled(input.requestId);
 f.options.repository.check=async()=>({status:'new',url:'https://github.com/fixture/Hart_Robin_000246'});
 await assert.rejects(f.flow.continueRun(input.requestId,{allowRun:true}),/no longer exists/);assert.equal(f.calls.p4,1);
});
test('a pending retry check reserves the workspace against a competing start',async()=>{
 const f=await fixture({failOnce:true}),input=raw();await f.flow.start(input);await f.flow.guidedSettled(input.requestId);
 let entered,release;const reached=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 f.options.repository.check=async()=>{entered();await gate;return{status:'setup',url:'https://github.com/fixture/Hart_Robin_000246'};};
 const retry=f.flow.continueRun(input.requestId,{allowRun:true});await reached;
 await assert.rejects(f.flow.start({...raw(),studentId:'000247'}),/portfolio is running/);release();await retry;await f.flow.guidedSettled(input.requestId);assert.equal(f.calls.ensure,1);assert.equal(f.calls.start,1);
});

test('failed initial design can be clarified without changing identity or creating a second repository',async()=>{
 const f=await fixture({initialFailure:true}),input=raw();await f.flow.start(input);assert.equal(f.flow.get(input.requestId).guided.canReviseCase,true);
 const suggested=await f.flow.preflight({...input,caseStudy:'Parcel locker collection system'});assert.equal(suggested.status,'saved');assert.equal(suggested.run.canReviseCase,true);
 await assert.rejects(f.flow.continueRun(input.requestId,{allowRun:true,caseStudy:'Management system'}),e=>e.preflight?.status==='clarify');
 await f.flow.continueRun(input.requestId,{allowRun:true,caseStudy:'Parcel locker collection system'});await f.flow.guidedSettled(input.requestId);
 const state=JSON.parse(await readFile(path.join(f.root,'.guided-runs',input.requestId+'.json')));assert.equal(state.input.caseStudy,'Parcel locker collection system');assert.equal(state.input.studentId,'000246');assert.equal(state.revisions.length,1);assert.equal(f.calls.ensure,1);assert.equal(f.flow.get(input.requestId).guided.status,'complete');
});
test('case cannot change after a completed design or during a later portfolio failure',async()=>{
 const f=await fixture({failOnce:true}),input=raw();await f.flow.start(input);await f.flow.guidedSettled(input.requestId);assert.equal(f.flow.get(input.requestId).guided.canReviseCase,false);
 await assert.rejects(f.flow.continueRun(input.requestId,{allowRun:true,caseStudy:'Hospital appointment system'}),/before Portfolio 1/);assert.equal(f.calls.start,1);
});
