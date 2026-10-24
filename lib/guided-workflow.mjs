import {readFile,writeFile,readdir,realpath,lstat} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {finishPortfolio,finishFiles,finalArtifact,validateReview} from './portfolio-finish.mjs';
const command=promisify(execFile);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export async function inspectRepository(root){
 try{
  const repo=JSON.parse((await command('gh',['repo','view','--json','url,isTemplate,owner,name,visibility,defaultBranchRef'],{cwd:root,timeout:15000})).stdout);
  const login=(await command('gh',['api','user','--jq','.login'],{cwd:root,timeout:15000})).stdout.trim();
  const verified=!repo.isTemplate&&repo.owner.login.toLowerCase()===login.toLowerCase()&&repo.visibility==='PRIVATE';
  return{verified,url:repo.url,branch:repo.defaultBranchRef?.name||'main',message:verified?'Your private repository is connected.':'Use your own private copy of the template for the assessment.'};
 }catch{return{verified:false,message:'GitHub repository not verified. Local generation can continue; connect your own private repository before submission.'};}
}
export function createGuidedWorkflow(base,{runsDirectory,root,finish=finishPortfolio,inspect=inspectRepository,checkpoint}={}){
 const states=new Map(),done=new Map();let active=null;
 const context=inspect(root);
 const statePath=id=>path.join(runsDirectory,'case-run-'+id,'Guided.json');
 const persist=(id,state)=>writeFile(statePath(id),JSON.stringify(state,null,2)+'\n',{mode:0o600});
 const ready=(async()=>{await base.ready;let entries;try{entries=await readdir(runsDirectory);}catch{return;}
  for(const name of entries){if(!name.startsWith('case-run-')||!uuid.test(name.slice(9)))continue;const id=name.slice(9);if(!base.get(id))continue;
   try{if((await lstat(statePath(id))).isSymbolicLink())continue;const target=await realpath(statePath(id));const runsReal=await realpath(runsDirectory);if(!target.startsWith(runsReal+path.sep))continue;const state=JSON.parse(await readFile(target,'utf8'));if(state.id!==id)continue;
    if(state.status==='running'){state.status='interrupted';state.message='The server restarted. Continue the saved run to resume its remaining steps.';}
    states.set(id,state);
   }catch{}
  }
 })();
 function get(id){const job=base.get(id);if(!job)return null;const state=states.get(id);if(!state)return job;
  job.guided={status:state.status,message:job.status==='running'?job.message:state.message,checkpoints:state.checkpoints||[],saveToGithub:state.saveToGithub};
  if(state.finish){job.finish=state.finish;job.stages=state.finish.stages;job.submissionReady=state.finish.submissionReady;for(const[key,[,,label,primary]]of Object.entries(finishFiles))job.files.push({label,primary:Boolean(primary),url:`/api/pilot/jobs/${id}/files/${key}`});job.files.push({label:'Download portfolio ZIP',primary:true,url:`/api/pilot/jobs/${id}/files/download`});}
  return job;
 }
 const assertIdle=()=>{if(active)throw Object.assign(new Error('A guided run is active. Wait until it finishes.'),{statusCode:409});};
 async function save(id,state,label){
  if(!state.saveToGithub)return;
  const before=(await command('git',['rev-parse','HEAD'],{cwd:root,timeout:5000})).stdout.trim();
  const result=checkpoint?await checkpoint(id,label):await command(process.execPath,['scripts/save-portfolio.mjs','--run',id],{cwd:root,timeout:90000,maxBuffer:100000});
  const sha=(await command('git',['rev-parse','HEAD'],{cwd:root,timeout:5000})).stdout.trim();
  if(sha!==before&&!state.checkpoints.some(c=>c.sha===sha))state.checkpoints.push({stage:label,sha,savedAt:new Date().toISOString()});
  await persist(id,state);
 }
 async function continueRun(id,raw={}){
  await ready;if(raw.allowRun!==true)throw Object.assign(new Error('Use Continue remaining steps.'),{statusCode:400});
  if(active===id)return get(id);assertIdle();const job=base.get(id);if(!job)throw Object.assign(new Error('Run not found.'),{statusCode:404});
  if(!['running','complete'].includes(job.status))throw Object.assign(new Error('Portfolio 1 did not complete. Inspect its failure and start a corrected case.'),{statusCode:409});
  const repo=await context;if(raw.saveToGithub===true&&!repo.verified)throw Object.assign(new Error(repo.message),{statusCode:409});
  const state=states.get(id)||{id,checkpoints:[],saveToGithub:false};
  if(raw.saveToGithub!==undefined)state.saveToGithub=raw.saveToGithub===true;
  state.status='running';state.message='Completing the remaining portfolio steps.';states.set(id,state);active=id;await persist(id,state);
  const run=(async()=>{try{
   await base.settled(id);if(base.get(id)?.status!=='complete')throw new Error(base.get(id)?.message||'Portfolio 1 failed.');
   await save(id,state,'Portfolio 1');
   for(const [number,start,settled]of [[2,base.startQueries,base.queriesSettled],[3,base.startTransactions,base.transactionsSettled],[4,base.startMongo,base.mongoSettled]]){
    if(base.get(id)['portfolio'+number]?.status!=='complete'){
     state.message='Running Portfolio '+number+' with the saved case model.';await persist(id,state);
     await start(id,{allowRun:true});await settled(id);
     const result=base.get(id)['portfolio'+number];if(result?.status!=='complete')throw new Error(result?.message||'Portfolio '+number+' failed.');
    }
    await save(id,state,'Portfolio '+number);
   }
   state.message='Building Portfolio 5, screenshots and the three-page summary.';await persist(id,state);
   const current=base.get(id),repository=repo.verified?{...repo,portfolioUrl:repo.url+'/tree/'+encodeURIComponent(repo.branch)+'/'+encodeURIComponent(current.prefix)}:repo;
   state.finish=await finish({job:current,workflow:base,runsDirectory,review:state.finish?.review||null,repository});
   await save(id,state,'Portfolio 5 and draft summary');
   state.status=state.finish.status;state.message=state.finish.message;
  }catch(error){state.status='failed';state.message=error.message;}
  finally{active=null;state.finishedAt=new Date().toISOString();await persist(id,state);}})();
  done.set(id,run);run.catch(()=>{active=null;state.status='failed';state.message='Could not persist the guided run. Retained files remain on disk.';});return get(id);
 }
 async function review(id,raw){
  await ready;assertIdle();const details=validateReview(raw),state=states.get(id),job=base.get(id);
  if(!state?.finish||!job)throw Object.assign(new Error('Complete the guided run before reviewing the final package.'),{statusCode:409});
  active=id;state.status='running';state.message='Saving your reflection and rebuilding the final package.';await persist(id,state);
  const run=(async()=>{try{
   state.finish=await finish({job,workflow:base,runsDirectory,review:details,repository:state.finish.repository});
   await save(id,state,'Personal reflection and final review');state.status=state.finish.status;state.message=state.finish.message;
  }catch(error){state.status='failed';state.message=error.message;}finally{active=null;await persist(id,state);}})();done.set(id,run);run.catch(()=>{active=null;state.status='failed';});return get(id);
 }
 return{...base,ready,context,get,
  async start(raw){await ready;assertIdle();const repo=await context;if(raw.saveToGithub===true&&!repo.verified)throw Object.assign(new Error(repo.message),{statusCode:409});const job=await base.start(raw);if(raw.runAll===true)return continueRun(job.id,{allowRun:true,saveToGithub:raw.saveToGithub===true});return job;},
  async startQueries(...args){assertIdle();return base.startQueries(...args);},async startTransactions(...args){assertIdle();return base.startTransactions(...args);},async startMongo(...args){assertIdle();return base.startMongo(...args);},
  continueRun,review,guidedSettled:id=>done.get(id),
  async artifact(id,key){if((key==='download'||Object.hasOwn(finishFiles,key))&&states.get(id)?.finish)return finalArtifact(base.get(id),key,runsDirectory);return base.artifact(id,key);}
 };
}
