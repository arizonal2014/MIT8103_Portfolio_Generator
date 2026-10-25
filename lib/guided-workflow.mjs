import {readFile,writeFile,readdir,realpath,lstat,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {validatePortfolioInput,inspectCaseStudy} from '../case-input.mjs';
import {inspectRuntime,recoveryAdvice,legacyCopilotFailureMessage,unclassifiedCopilotFailureMessage} from './preflight.mjs';
import {finishPortfolio,finishFiles,finalArtifact,validateReview,captureSubmission} from './portfolio-finish.mjs';
import {buildSubmissionStage} from './submission-output.mjs';
import {createPortfolioRepository,inspectGithub} from './portfolio-repository.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const pipelineNames=['Repository','Design and tables','SQL and optimisation','Transactions','MongoDB','Distributed design','Summary'];
const freshPipeline=()=>pipelineNames.map((name,id)=>({id,name,status:'pending',logs:[]}));
const publicRepo=repo=>repo?Object.fromEntries(Object.entries(repo).filter(([key])=>!['directory'].includes(key))):null;
export const inspectRepository=inspectGithub;
export function createGuidedWorkflow(base,{runsDirectory,root,finish=finishPortfolio,inspect=inspectGithub,repository=createPortfolioRepository(root),runtime=inspectRuntime,prepare=buildSubmissionStage,capture=captureSubmission}={}){
 const states=new Map(),done=new Map();let active=null;
 const statePath=id=>path.join(runsDirectory,'case-run-'+id,'Guided.json');
 const recoveryDirectory=path.join(runsDirectory,'.guided-runs');
 const persist=async(id,state)=>{
  await mkdir(recoveryDirectory,{recursive:true,mode:0o700});
  const body=JSON.stringify(state,null,2)+'\n',target=path.join(recoveryDirectory,id+'.json'),temp=target+'.tmp';
  await writeFile(temp,body,{mode:0o600});await rename(temp,target);
  // Keep the old per-run record readable by earlier local tooling.
  try{await writeFile(statePath(id),body,{mode:0o600});}catch(error){if(error.code!=='ENOENT')throw error;}
 };
 const ready=(async()=>{await base.ready;let entries;try{entries=await readdir(runsDirectory);}catch{return;}
  const records=new Map(entries.filter(n=>n.startsWith('case-run-')&&uuid.test(n.slice(9))).map(n=>[n.slice(9),statePath(n.slice(9))]));
  try{for(const file of await readdir(recoveryDirectory))if(uuid.test(file.slice(0,-5))&&file.endsWith('.json'))records.set(file.slice(0,-5),path.join(recoveryDirectory,file));}catch{}
  for(const [id,file]of records){
   try{if((await lstat(file)).isSymbolicLink())continue;const target=await realpath(file);const runsReal=await realpath(runsDirectory);if(!target.startsWith(runsReal+path.sep))continue;const state=JSON.parse(await readFile(target,'utf8'));if(state.id!==id||(!base.get(id)&&!state.input))continue;
    if(state.status==='running'){state.status='interrupted';state.message='The workspace restarted. Retry to continue.';for(const item of state.pipeline||[])if(item.status==='running')item.status='interrupted';}
    if(state.status==='failed'&&state.message===legacyCopilotFailureMessage){
     const previous=base.get(id),corrected=previous?.status==='failed'?previous.message:null;
     state.message=corrected&&corrected!==legacyCopilotFailureMessage?corrected:unclassifiedCopilotFailureMessage;
     for(const item of state.pipeline||[])for(const entry of item.logs||[])if(entry.message===legacyCopilotFailureMessage)entry.message=state.message;
    }
    states.set(id,state);
   }catch{}
  }
 })();
 function get(id){const state=states.get(id);const job=base.get(id)||(state?.input?{id,prefix:state.input.prefix,caseStudy:state.input.caseStudy,status:state.status==='running'?'running':'interrupted',files:[],message:state.message}:null);if(!job)return null;if(!state)return job;
  job.guided={status:state.status,message:state.message,checkpoints:state.checkpoints||[],pipeline:state.pipeline||[],repository:publicRepo(state.repository),startedAt:state.startedAt,finishedAt:state.finishedAt,saveToGithub:true};
  job.guided.canReviseCase=Boolean(state.input&&['failed','interrupted'].includes(state.status)&&state.pipeline?.[1]?.status!=='complete'&&['failed','interrupted'].includes(job.status));
  if(job.guided.canReviseCase)job.guided.details=Object.fromEntries(['firstName','surname','studentId','caseStudy'].map(k=>[k,state.input[k]]));
  if(['failed','interrupted'].includes(state.status))job.guided.recovery=recoveryAdvice(state.message);
  if(state.finish){job.finish=state.finish;job.stages=state.finish.stages;job.submissionReady=false;job.packageReady=state.status==='complete';for(const[key,[,,label,primary]]of Object.entries(finishFiles))job.files.push({label,primary:Boolean(primary),url:`/api/pilot/jobs/${id}/files/${key}`});job.files.push({label:'Download portfolio ZIP',primary:true,url:`/api/pilot/jobs/${id}/files/download`});}
  return job;
 }
 const assertIdle=()=>{if(active)throw Object.assign(new Error('A portfolio is running. Wait until it finishes.'),{statusCode:409});};
 async function preflight(raw){
  await ready;const input=validatePortfolioInput(raw),caseStudy=inspectCaseStudy(input.caseStudy);
  if(caseStudy.status!=='ready'&&!(caseStudy.status==='suggestion'&&raw.confirmedCaseStudy===input.caseStudy))return{status:caseStudy.status,caseStudy,message:caseStudy.message};
  const repo=repository.check?await repository.check(input,raw.requestId):{status:'new',url:null};
  if(repo.status==='blocked')return{status:'blocked',message:repo.message,repository:repo,action:repo.action};
  const saved=[...states.values()].filter(s=>s.input?.prefix===input.prefix&&s.repository?.url===repo.url).sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)))[0];
  if(saved&&repo.canContinue!==false)return{status:'saved',message:saved.status==='complete'?'Your completed portfolio is already saved. Open it below.':'A saved run already exists for these details. Continue it to keep its files and commits.',repository:repo,run:{id:saved.id,status:saved.status,caseStudy:saved.input.caseStudy,canReviseCase:get(saved.id).guided.canReviseCase}};
  if(repo.status==='existing')return{status:'existing',message:repo.message,repository:repo};
  if(base.enabled===false)return{status:'blocked',action:'connect',message:'Connect GitHub with Copilot access, then try again.'};
  const tools=await runtime();if(!tools.ready)return{status:'blocked',action:'retry',message:tools.message,repository:repo};
  return{status:'ready',message:'Checks passed. Starting your portfolio.',repository:repo};
 }
 async function stage(id,state,index,status,message){
  const item=state.pipeline[index];item.status=status;if(status==='running'){item.startedAt=new Date().toISOString();delete item.finishedAt;}else item.finishedAt=new Date().toISOString();
  if(message)item.logs.push({at:new Date().toISOString(),message});state.message=message||item.name;await persist(id,state);
 }
 async function save(id,state,index,label,options){
  const job=base.get(id);let source=state.finish?.exportVersion===2?state.finish.submissionDirectory:job.outputDirectory;
  if(index>=1&&index<=4){const bundle=await prepare({job,workflow:base,runsDirectory,through:index});await capture(bundle);source=bundle.output;}
  const result=await repository.save(state.repository,source,job.prefix,label,options);
  if(!state.checkpoints.some(c=>c.sha===result.sha))state.checkpoints.push(result);
  state.pipeline[index].commitUrl=result.url;state.pipeline[index].logs.push({at:result.savedAt,message:'Saved commit '+result.sha.slice(0,7)+': '+label});await persist(id,state);
 }
 async function continueRun(id,raw={}){
  await ready;if(raw.allowRun!==true)throw Object.assign(new Error('Use Retry to continue.'),{statusCode:400});
  if(active===id)return get(id);assertIdle();let job=base.get(id);
  const state=states.get(id);if(!state?.repository?.verified)throw Object.assign(new Error('This older run has no separate portfolio repository. Start a new portfolio using the updated flow.'),{statusCode:409});
  if(raw.caseStudy!==undefined&&raw.caseStudy!==state.input?.caseStudy&&!get(id).guided.canReviseCase)throw Object.assign(new Error('The case study can only be revised before Portfolio 1 has completed.'),{statusCode:409});
  if(state.status==='complete'&&state.pipeline?.every(p=>p.status==='complete')&&raw.rebuild!==true)return get(id);
  active=id;
  try{
   if(raw.caseStudy!==undefined&&raw.caseStudy!==state.input.caseStudy){
    if(!get(id).guided.canReviseCase)throw Object.assign(new Error('The case study can only be revised before Portfolio 1 has completed.'),{statusCode:409});
    const revised=validatePortfolioInput({...state.input,caseStudy:raw.caseStudy}),check=inspectCaseStudy(revised.caseStudy);
    if(check.status!=='ready'&&!(check.status==='suggestion'&&raw.confirmedCaseStudy===revised.caseStudy))throw Object.assign(new Error(check.message),{statusCode:422,preflight:{status:check.status,caseStudy:check,message:check.message}});
    state.revisions||=[];state.revisions.push({at:new Date().toISOString(),from:state.input.caseStudy,to:revised.caseStudy});state.input=revised;await persist(id,state);
   }
   if(repository.check){
    const repo=await repository.check(state.input,id);
    if(repo.status==='new')throw Object.assign(new Error('The saved GitHub repository no longer exists. Your local run files are retained. Restore the repository before retrying.'),{statusCode:409});
    if(repo.url!==state.repository.url||repo.status==='blocked'||repo.canContinue===false)throw Object.assign(new Error(repo.status==='blocked'?repo.message:'Reconnect the original GitHub account and check that this repository is private and active before retrying.'),{statusCode:409});
   }
   if(!job||!['running','complete'].includes(job.status)){
    if(!state.input||!base.retryInitial)throw Object.assign(new Error('Reopen this run in its original workspace to continue.'),{statusCode:409});
    await base.retryInitial(id,state.input);
   }
  }catch(error){active=null;state.status='failed';state.message=error.message;await persist(id,state);throw error;}
  state.pipeline||=freshPipeline();if(raw.rebuild===true){for(const i of [5,6])state.pipeline[i].status='pending';}state.status='running';delete state.finishedAt;states.set(id,state);active=id;await persist(id,state);
  const run=(async()=>{try{
   if(state.pipeline[1].status!=='complete'){
    await stage(id,state,1,'running','Creating the design, tables, diagram and normalisation.');
    await base.settled(id);if(base.get(id)?.status!=='complete')throw new Error(base.get(id)?.message||'Database design failed.');
    const checks=base.get(id).checks;
    await save(id,state,1,'Add relational design, ER diagram, normalisation and verified tables',{onlyFolders:['portfolio-1-database-design']});
    await stage(id,state,1,'complete',`${checks?.tables||''} tables verified; ${checks?.rejectedInvalidRecords||0} invalid records rejected.`);
   }
   for(const [number,index,start,settled,label,folder]of [
    [2,2,base.startQueries,base.queriesSettled,'Add SQL results, execution plans and measured index comparison','portfolio-2-query-optimisation'],
    [3,3,base.startTransactions,base.transactionsSettled,'Add commit, rollback and two-session concurrency results','portfolio-3-transactions-concurrency'],
    [4,4,base.startMongo,base.mongoSettled,'Add MongoDB model, inserts, queries and validation results','portfolio-4-nosql']]){
    if(state.pipeline[index].status==='complete')continue;
    await stage(id,state,index,'running','Running '+state.pipeline[index].name.toLowerCase()+'.');
    if(base.get(id)['portfolio'+number]?.status!=='complete'){await start(id,{allowRun:true});await settled(id);}
    const result=base.get(id)['portfolio'+number];if(result?.status!=='complete')throw new Error(result?.message||'Portfolio '+number+' failed.');
    await save(id,state,index,label,{onlyFolders:[folder]});await stage(id,state,index,'complete',result.message||'Execution checks passed.');
   }
   await stage(id,state,5,'running','Preparing the distributed design discussion.');
   state.finish=await finish({job:base.get(id),workflow:base,runsDirectory,review:state.finish?.review||null,repository:publicRepo(state.repository)});
   await save(id,state,5,'Add distributed architecture, availability and consistency discussion',{onlyFolders:['portfolio-5-distributed-cloud']});
   await stage(id,state,5,'complete','Distributed design and architecture diagram saved.');
   await stage(id,state,6,'running','Saving screenshots, editable summary, PDF and guide.');
   await save(id,state,6,'Save assessment scripts, evidence and final summary');
   await stage(id,state,6,'complete','All portfolio files and the final summary are on GitHub.');
   state.status='complete';state.message='Your portfolio is ready. Open the repository to review and edit the summary.';
  }catch(error){state.status='failed';state.message=error.message;const current=state.pipeline.find(p=>p.status==='running');if(current){current.status='failed';current.finishedAt=new Date().toISOString();current.logs.push({at:current.finishedAt,message:error.message});}}
  finally{active=null;state.finishedAt=new Date().toISOString();await persist(id,state);}})();
  done.set(id,run);run.catch(()=>{active=null;state.status='failed';state.message='Could not save run progress. Your completed files remain on disk.';});return get(id);
 }
 async function start(raw){
  await ready;if(base.enabled===false)throw Object.assign(new Error('Connect GitHub with Copilot access before starting generation.'),{statusCode:503});const input=validatePortfolioInput(raw);
  if(!uuid.test(raw.requestId||'')||raw.allowLive!==true||input.provider!=='copilot')throw Object.assign(new Error('Enter your details and use Create portfolio.'),{statusCode:400});
  if(states.has(raw.requestId)||base.get(raw.requestId)){
   const saved=states.get(raw.requestId);if(saved?.input&&(saved.input.prefix!==input.prefix||saved.input.caseStudy!==input.caseStudy))throw Object.assign(new Error('This request belongs to different details. Return to its saved run.'),{statusCode:409});return get(raw.requestId);
  }
  assertIdle();active=raw.requestId;const launchedAt=new Date().toISOString();
  try{
   const checked=await preflight(raw);
   if(checked.status==='saved')return get(checked.run.id);
   if(checked.status!=='ready')throw Object.assign(new Error(checked.message),{statusCode:422,preflight:checked});
   // Repository creation finishes before the first AI or database request.
   const repo=await repository.ensure(input,raw.requestId);
   const state={input,id:raw.requestId,status:'running',startedAt:launchedAt,message:'Repository created. Starting the design.',repository:repo,pipeline:freshPipeline(),checkpoints:[{stage:'Create named database portfolio and five activity folders',sha:repo.sha,url:repo.url+'/commit/'+repo.sha,savedAt:new Date().toISOString()}]};
   Object.assign(state.pipeline[0],{status:'complete',startedAt:state.startedAt,finishedAt:new Date().toISOString(),commitUrl:repo.url+'/commit/'+repo.sha,logs:[{at:new Date().toISOString(),message:'Private repository: '+repo.url}]});
   states.set(raw.requestId,state);await persist(raw.requestId,state);
   try{await base.start(raw);}catch(error){state.status='failed';state.message=error.message;Object.assign(state.pipeline[1],{status:'failed',logs:[{message:error.message}]});await persist(raw.requestId,state);return get(raw.requestId);}
   active=null;return continueRun(raw.requestId,{allowRun:true});
  }catch(error){
   const state=states.get(raw.requestId);if(state&&!done.has(raw.requestId)){state.status='failed';state.message=error.message;try{await persist(raw.requestId,state);}catch{}}
   throw error;
  }finally{if(active===raw.requestId&&!done.has(raw.requestId))active=null;}
 }
 async function review(id,raw){
  await ready;assertIdle();const details=validateReview(raw),state=states.get(id),job=base.get(id);
  if(!state?.finish||!job)throw Object.assign(new Error('Complete generation first.'),{statusCode:409});
  active=id;const run=(async()=>{try{state.finish=await finish({job,workflow:base,runsDirectory,review:details,repository:publicRepo(state.repository)});await save(id,state,6,'Update individual reflection and final summary');state.status='complete';}catch(e){state.status='failed';state.message=e.message;}finally{active=null;await persist(id,state);}})();done.set(id,run);return get(id);
 }
 return{...base,ready,get enabled(){return base.enabled;},get account(){return base.account;},get context(){return inspect(root);},get,latestId:()=>[...[...states.values()].map(s=>({id:s.id,startedAt:s.startedAt})),...(base.list?.()||[])].sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)))[0]?.id||null,start,
  async startQueries(...args){assertIdle();return base.startQueries(...args);},async startTransactions(...args){assertIdle();return base.startTransactions(...args);},async startMongo(...args){assertIdle();return base.startMongo(...args);},
  continueRun,preflight,review,guidedSettled:id=>done.get(id),
  async artifact(id,key){const clean={evidence:'P1_DatabaseResults','query-results':'P2_QueryResults',performance:'P2_IndexComparison','commit-rollback':'P3_CommitRollback',concurrency:'P3_ConcurrencyResult','mongo-results':'P4_DocumentsAndQueries'};if(clean[key]){const target=path.join(runsDirectory,'case-run-'+id,'submission-assets',clean[key]+'.html');try{const actual=await realpath(target);if(actual===target)return{path:target,label:'Recorded results'};}catch{}}if((key==='download'||Object.hasOwn(finishFiles,key))&&states.get(id)?.finish)return finalArtifact(base.get(id),key,runsDirectory);return base.artifact(id,key);}
 };
}
