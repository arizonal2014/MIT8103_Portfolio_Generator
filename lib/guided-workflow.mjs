import {readFile,writeFile,readdir,realpath,lstat} from 'node:fs/promises';
import path from 'node:path';
import {validateInput} from '../shared.mjs';
import {finishPortfolio,finishFiles,finalArtifact,validateReview} from './portfolio-finish.mjs';
import {createPortfolioRepository,inspectGithub} from './portfolio-repository.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const pipelineNames=['Repository','Design and tables','SQL and optimisation','Transactions','MongoDB','Distributed design','Summary'];
const freshPipeline=()=>pipelineNames.map((name,id)=>({id,name,status:'pending',logs:[]}));
const publicRepo=repo=>repo?Object.fromEntries(Object.entries(repo).filter(([key])=>!['directory'].includes(key))):null;
export const inspectRepository=inspectGithub;
export function createGuidedWorkflow(base,{runsDirectory,root,finish=finishPortfolio,inspect=inspectGithub,repository=createPortfolioRepository(root)}={}){
 const states=new Map(),done=new Map();let active=null;
 const statePath=id=>path.join(runsDirectory,'case-run-'+id,'Guided.json');
 const persist=(id,state)=>writeFile(statePath(id),JSON.stringify(state,null,2)+'\n',{mode:0o600});
 const ready=(async()=>{await base.ready;let entries;try{entries=await readdir(runsDirectory);}catch{return;}
  for(const name of entries){if(!name.startsWith('case-run-')||!uuid.test(name.slice(9)))continue;const id=name.slice(9);if(!base.get(id))continue;
   try{if((await lstat(statePath(id))).isSymbolicLink())continue;const target=await realpath(statePath(id));const runsReal=await realpath(runsDirectory);if(!target.startsWith(runsReal+path.sep))continue;const state=JSON.parse(await readFile(target,'utf8'));if(state.id!==id)continue;
    if(state.status==='running'){state.status='interrupted';state.message='The workspace restarted. Retry to continue.';for(const item of state.pipeline||[])if(item.status==='running')item.status='interrupted';}
    states.set(id,state);
   }catch{}
  }
 })();
 function get(id){const job=base.get(id);if(!job)return null;const state=states.get(id);if(!state)return job;
  job.guided={status:state.status,message:state.message,checkpoints:state.checkpoints||[],pipeline:state.pipeline||[],repository:publicRepo(state.repository),startedAt:state.startedAt,finishedAt:state.finishedAt,saveToGithub:true};
  if(state.finish){job.finish=state.finish;job.stages=state.finish.stages;job.submissionReady=false;job.packageReady=state.status==='complete';for(const[key,[,,label,primary]]of Object.entries(finishFiles))job.files.push({label,primary:Boolean(primary),url:`/api/pilot/jobs/${id}/files/${key}`});job.files.push({label:'Download portfolio ZIP',primary:true,url:`/api/pilot/jobs/${id}/files/download`});}
  return job;
 }
 const assertIdle=()=>{if(active)throw Object.assign(new Error('A portfolio is running. Wait until it finishes.'),{statusCode:409});};
 async function stage(id,state,index,status,message){
  const item=state.pipeline[index];item.status=status;if(status==='running'){item.startedAt=new Date().toISOString();delete item.finishedAt;}else item.finishedAt=new Date().toISOString();
  if(message)item.logs.push({at:new Date().toISOString(),message});state.message=message||item.name;await persist(id,state);
 }
 async function save(id,state,index,label,options){
  const job=base.get(id),result=await repository.save(state.repository,job.outputDirectory,job.prefix,label,options);
  if(!state.checkpoints.some(c=>c.sha===result.sha))state.checkpoints.push(result);
  state.pipeline[index].commitUrl=result.url;state.pipeline[index].logs.push({at:result.savedAt,message:'Saved commit '+result.sha.slice(0,7)+': '+label});await persist(id,state);
 }
 async function continueRun(id,raw={}){
  await ready;if(raw.allowRun!==true)throw Object.assign(new Error('Use Retry to continue.'),{statusCode:400});
  if(active===id)return get(id);assertIdle();const job=base.get(id);if(!job)throw Object.assign(new Error('Run not found.'),{statusCode:404});
  const state=states.get(id);if(!state?.repository?.verified)throw Object.assign(new Error('This older run has no separate portfolio repository. Start a new portfolio using the updated flow.'),{statusCode:409});
  if(state.status==='complete'&&state.pipeline?.every(p=>p.status==='complete'))return get(id);
  if(!['running','complete'].includes(job.status)){if(!state.input||!base.retryInitial)throw Object.assign(new Error('Start a new portfolio for this older run.'),{statusCode:409});active=id;try{await base.retryInitial(id,state.input);}finally{active=null;}}
  state.pipeline||=freshPipeline();state.status='running';delete state.finishedAt;states.set(id,state);active=id;await persist(id,state);
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
   await save(id,state,6,'Add captured evidence, editable final summary, PDF and portfolio guide');
   await stage(id,state,6,'complete','All portfolio files and the final summary are on GitHub.');
   state.status='complete';state.message='Your portfolio is ready. Open the repository to review and edit the summary.';
  }catch(error){state.status='failed';state.message=error.message;const current=state.pipeline.find(p=>p.status==='running');if(current){current.status='failed';current.finishedAt=new Date().toISOString();current.logs.push({at:current.finishedAt,message:error.message});}}
  finally{active=null;state.finishedAt=new Date().toISOString();await persist(id,state);}})();
  done.set(id,run);run.catch(()=>{active=null;state.status='failed';state.message='Could not save run progress. Your completed files remain on disk.';});return get(id);
 }
 async function start(raw){
  await ready;assertIdle();if(base.enabled===false)throw Object.assign(new Error('Live generation is not enabled in this workspace.'),{statusCode:503});const input=validateInput(raw);
  if(!uuid.test(raw.requestId||'')||raw.allowLive!==true||input.provider!=='copilot')throw Object.assign(new Error('Enter your details and use Create portfolio.'),{statusCode:400});
  if(base.get(raw.requestId))return get(raw.requestId);
  // Repository creation finishes before the first AI or database request.
  active=raw.requestId;const launchedAt=new Date().toISOString();
  try{
   const repo=await repository.ensure(input,raw.requestId);
   const job=await base.start(raw),state={input,id:job.id,status:'running',startedAt:launchedAt,message:'Repository created. Starting the design.',repository:repo,pipeline:freshPipeline(),checkpoints:[{stage:'Create named database portfolio and five activity folders',sha:repo.sha,url:repo.url+'/commit/'+repo.sha,savedAt:new Date().toISOString()}]};
   Object.assign(state.pipeline[0],{status:'complete',startedAt:state.startedAt,finishedAt:new Date().toISOString(),commitUrl:repo.url+'/commit/'+repo.sha,logs:[{at:new Date().toISOString(),message:'Private repository: '+repo.url}]});
   states.set(job.id,state);await persist(job.id,state);active=null;return continueRun(job.id,{allowRun:true});
  }catch(error){active=null;throw error;}
 }
 async function review(id,raw){
  await ready;assertIdle();const details=validateReview(raw),state=states.get(id),job=base.get(id);
  if(!state?.finish||!job)throw Object.assign(new Error('Complete generation first.'),{statusCode:409});
  active=id;const run=(async()=>{try{state.finish=await finish({job,workflow:base,runsDirectory,review:details,repository:publicRepo(state.repository)});await save(id,state,6,'Update individual reflection and final summary');state.status='complete';}catch(e){state.status='failed';state.message=e.message;}finally{active=null;await persist(id,state);}})();done.set(id,run);return get(id);
 }
 return{...base,ready,get enabled(){return base.enabled;},get account(){return base.account;},get context(){return inspect(root);},get,latestId:()=>base.list?.().sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)))[0]?.id||null,start,
  async startQueries(...args){assertIdle();return base.startQueries(...args);},async startTransactions(...args){assertIdle();return base.startTransactions(...args);},async startMongo(...args){assertIdle();return base.startMongo(...args);},
  continueRun,review,guidedSettled:id=>done.get(id),
  async artifact(id,key){if((key==='download'||Object.hasOwn(finishFiles,key))&&states.get(id)?.finish)return finalArtifact(base.get(id),key,runsDirectory);return base.artifact(id,key);}
 };
}
