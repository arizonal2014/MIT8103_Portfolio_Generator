import {validateInput} from '/shared.mjs';
const $=selector=>document.querySelector(selector),form=$('#details');
const labels=['Repository','Design and tables','SQL and optimisation','Transactions','MongoDB','Distributed design','Summary'];
let config=null,currentJob=null,requestId=null,waiting=false,following=false,viewingPipeline=false,startedAt=null;
const storage={get(){try{return localStorage.getItem('case-generator-job');}catch{return null;}},set(id){try{localStorage.setItem('case-generator-job',id);}catch{}},clear(){try{localStorage.removeItem('case-generator-job');}catch{}}};
function step(number,focus=false){
 for(const [index,id]of ['details-section','build-section','result-section'].entries())$('#'+id).hidden=index+1!==number;
 for(let i=1;i<=3;i++)if(i===number)$('#step-'+i).setAttribute('aria-current','step');else $('#step-'+i).removeAttribute('aria-current');
 if(focus)$(number===1?'#details-title':number===2?'#build-title':'#result-title').focus();
}
const input=()=>({...Object.fromEntries(new FormData(form)),provider:'copilot'});
function clearErrors(){for(const el of document.querySelectorAll('.error'))el.textContent='';for(const el of form.elements)el.removeAttribute('aria-invalid');}
function showError(error){
 if(error.errors||error.fields){for(const [key,message]of Object.entries(error.errors||error.fields)){const element=$('#'+key+'-error');if(element)element.textContent=message;form.elements.namedItem(key)?.setAttribute('aria-invalid','true');}form.querySelector('[aria-invalid=true]')?.focus();}
 $('#form-error').textContent=error.message||String(error);
}
function preview(){try{$('#prefix').textContent=validateInput(input()).prefix;}catch{$('#prefix').textContent='Surname_Firstname_StudentID';}}
form.addEventListener('input',()=>{requestId=null;preview();});
function duration(start,end){const seconds=Math.max(0,Math.floor(((end?new Date(end):Date.now())-new Date(start))/1000));return seconds<60?seconds+'s':Math.floor(seconds/60)+'m '+seconds%60+'s';}
function updateTimes(){
 for(const el of document.querySelectorAll('[data-start]'))el.textContent=duration(el.dataset.start,el.dataset.end||null);
 if(startedAt)$('#elapsed').textContent=duration(startedAt,currentJob?.guided?.finishedAt);
}
function renderPipeline(items,job=null){
 const list=$('#pipeline');
 if(!list.children.length)for(let i=0;i<labels.length;i++){
  const li=document.createElement('li'),details=document.createElement('details'),summary=document.createElement('summary'),symbol=document.createElement('span'),title=document.createElement('span'),state=document.createElement('span'),time=document.createElement('span'),logs=document.createElement('div');
  symbol.className='stage-symbol';symbol.setAttribute('aria-hidden','true');title.className='stage-title';title.textContent=labels[i];state.className='stage-state';time.className='stage-time';logs.className='stage-logs';summary.append(symbol,title,state,time);details.append(summary,logs);li.append(details);list.append(li);
 }
 for(const [i,li]of [...list.children].entries()){
  const item=items?.[i]||{status:i===0&&waiting?'running':'pending',logs:[]},state=item.status;
  li.dataset.state=state;li.querySelector('.stage-symbol').textContent=state==='complete'?'✓':state==='failed'?'!':state==='running'?'':'○';
  li.querySelector('.stage-state').textContent=state==='pending'?'Waiting':state==='complete'?'Completed':state==='running'?'Running':state==='interrupted'?'Interrupted':'Failed';
  const time=li.querySelector('.stage-time');if(item.startedAt){time.dataset.start=item.startedAt;time.dataset.end=item.finishedAt||'';}else{delete time.dataset.start;time.textContent='';}
  const reports=[[],['evidence','schema-log'],['query-results','performance'],['commit-rollback','concurrency'],['mongo-results'],['distributed-design'],['summary-source','quick-guide']][i];
  const reportFiles=(job?.files||[]).filter(f=>reports.some(key=>f.url.endsWith('/'+key)));
  const internalSteps=i===1?job?.steps||[]:[];
  const logs=li.querySelector('.stage-logs'),signature=JSON.stringify([item.logs,item.commitUrl,reportFiles,internalSteps]);
  if(logs.dataset.signature!==signature){logs.replaceChildren();for(const entry of item.logs||[]){const p=document.createElement('p');p.textContent=entry.message;logs.append(p);}if(item.commitUrl){const a=document.createElement('a');a.href=item.commitUrl;a.target='_blank';a.rel='noopener';a.textContent='View commit ↗';logs.append(a);}for(const item of internalSteps){const p=document.createElement('p');p.textContent=item.name+' — '+item.status;logs.append(p);}for(const file of reportFiles){const p=document.createElement('p'),a=document.createElement('a');a.href=file.url;a.target='_blank';a.rel='noopener';a.textContent=file.label+' ↗';p.append(a);logs.append(p);}logs.dataset.signature=signature;}
 }
 updateTimes();
}
function display(job){
 currentJob=job;const guided=job.guided,running=guided?.status==='running'||job.status==='running';
 startedAt=guided?.startedAt||job.startedAt;$('#build-case').textContent=job.title||job.caseStudy||job.prefix;
 $('#build-message').textContent=guided?.status==='running'&&job.status==='running'?job.message:guided?.message||job.message;
 $('#build-spinner').hidden=!running;$('#build-title').textContent=running?'Building your portfolio':guided?.status==='complete'?'Completed stages':'Build paused';
 const failed=['failed','interrupted'].includes(guided?.status)||['failed','interrupted'].includes(job.status);
 $('#build-error').hidden=!failed;$('#build-error').textContent=failed?guided?.message||job.message:'';
 $('#retry').hidden=!failed||!guided?.pipeline?.length;$('#retry').disabled=running;
 renderPipeline(guided?.pipeline,job);
 const repo=guided?.repository;
 $('#running-repository').hidden=!repo?.url;if(repo?.url)$('#running-repository').href=repo.url;
 const complete=guided?.status==='complete'&&job.finish&&repo?.url;
 if(complete){
  $('#result-case').textContent=(job.title||job.caseStudy)+' · '+job.prefix;
  $('#result-count').textContent='Five portfolios · '+(guided.checkpoints?.length||0)+' saved commits';
  $('#open-repository').href=repo.url;$('#edit-summary').href=repo.url+'/edit/'+encodeURIComponent(repo.branch||'main')+'/'+encodeURIComponent(job.prefix+'_Summary.md');
  for(const [id,key]of [['summary-pdf','summary'],['summary-source','summary-source'],['portfolio-zip','download'],['quick-guide','quick-guide']]){const file=job.files.find(f=>f.url.endsWith('/'+key));if(file)$('#'+id).href=file.url;}
  if(!viewingPipeline)step(3);
 }else step(2);
 $('#return-to-run').hidden=!currentJob;$('#back-to-repository').hidden=!complete||!viewingPipeline;
}
async function json(url,body){const response=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);const data=await response.json();if(!response.ok){const error=new Error(data.error||'The request failed.');error.fields=data.fields;throw error;}return data;}
async function follow(id){
 if(following)return;following=true;let errors=0;
 try{while(true){try{const job=await json('/api/pilot/jobs/'+id);errors=0;display(job);if(job.guided?.status!=='running'&&job.status!=='running')break;}catch(error){if(++errors>=3){$('#build-error').hidden=false;$('#build-error').textContent='Connection interrupted. Reload to reconnect to your saved run.';break;}}await new Promise(r=>setTimeout(r,1200));}}
 finally{following=false;waiting=false;}
}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(waiting||following)return;clearErrors();let details;try{details=validateInput(input());}catch(error){showError(error);return;}
 waiting=true;requestId||=crypto.randomUUID();startedAt=new Date().toISOString();currentJob=null;viewingPipeline=false;$('#pipeline').replaceChildren();step(2,true);renderPipeline();$('#build-spinner').hidden=false;$('#build-error').hidden=true;$('#build-message').textContent='Creating your private repository…';$('#build-case').textContent=details.caseStudy;
 try{const job=await json('/api/pilot/start',{...details,requestId,allowLive:true,runAll:true});storage.set(job.id);display(job);await follow(job.id);}catch(error){waiting=false;step(1);showError(error);$('#connect-github').hidden=false;}
});
$('#retry').addEventListener('click',async()=>{if(!currentJob||following)return;try{await json('/api/pilot/jobs/'+currentJob.id+'/continue',{allowRun:true});await follow(currentJob.id);}catch(error){$('#build-error').textContent=error.message;}});
$('#view-pipeline').addEventListener('click',()=>{viewingPipeline=true;step(2,true);$('#back-to-repository').hidden=false;});
$('#back-to-repository').addEventListener('click',()=>{if(viewingPipeline&&currentJob?.guided?.status==='complete'){viewingPipeline=false;display(currentJob);}});
$('#new-portfolio').addEventListener('click',()=>{form.reset();requestId=null;preview();step(1,true);$('#return-to-run').hidden=!currentJob;});
$('#return-to-run').addEventListener('click',()=>{viewingPipeline=false;display(currentJob);});
async function loadConfig(){
 config=await json('/api/pilot/config');$('#connection-status').textContent=config.repository?.message||'GitHub connection unavailable.';
 $('#connect-github').hidden=Boolean(config.repository?.verified);$('#create-portfolio').disabled=!config.enabled||!config.repository?.verified;
}
$('#connect-github').addEventListener('click',async()=>{
 $('#connect-github').disabled=true;$('#login-instructions').hidden=false;
 try{await json('/api/github/login',{});while(true){const state=await json('/api/github/login');$('#login-message').textContent=state.message;$('#login-code').textContent=state.code||'';if(state.status==='complete'){await loadConfig();$('#login-instructions').hidden=true;break;}if(state.status==='failed')break;await new Promise(r=>setTimeout(r,1500));}}
 catch(error){$('#login-message').textContent=error.message;}finally{$('#connect-github').disabled=false;}
});
setInterval(updateTimes,1000);
(async()=>{try{await loadConfig();const id=storage.get()||config.latestJob;if(id){const job=await json('/api/pilot/jobs/'+id);storage.set(id);if(job.guided?.pipeline?.length){display(job);await follow(id);}else{$('#connection-status').textContent+=' Enter your details to use the new repository flow.';}}}catch(error){$('#connection-status').textContent=error.message;}})();
