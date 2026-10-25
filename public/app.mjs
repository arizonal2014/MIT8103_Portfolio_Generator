import {validatePortfolioInput} from '/case-input.mjs';
const $=selector=>document.querySelector(selector),form=$('#details');
const labels=['Repository','Design and tables','SQL and optimisation','Transactions','MongoDB','Distributed design','Summary'];
let config=null,currentJob=null,requestId=null,waiting=false,following=false,viewingPipeline=false,startedAt=null,confirmedCaseStudy=null;
const storage={get(){try{return localStorage.getItem('case-generator-job');}catch{return null;}},set(id){try{localStorage.setItem('case-generator-job',id);}catch{}},clear(){try{localStorage.removeItem('case-generator-job');}catch{}}};
const pending={get(){try{return JSON.parse(localStorage.getItem('case-generator-pending'));}catch{return null;}},set(value){try{localStorage.setItem('case-generator-pending',JSON.stringify(value));}catch{}},clear(){try{localStorage.removeItem('case-generator-pending');}catch{}}};
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
function preview(){try{$('#prefix').textContent=validatePortfolioInput(input()).prefix;}catch{$('#prefix').textContent='Surname_Firstname_StudentID';}}
form.addEventListener('input',()=>{if(waiting)return;requestId=null;confirmedCaseStudy=null;pending.clear();$('#preflight-feedback').hidden=true;clearErrors();preview();});
function busyDetails(value){
 for(const element of form.querySelectorAll('input,textarea,button'))element.disabled=value;
 $('#create-portfolio').textContent=value?'Checking…':'Create portfolio →';form.setAttribute('aria-busy',String(value));
}
function fillDetails(details){for(const key of ['firstName','surname','studentId','caseStudy'])if(typeof details?.[key]==='string')form.elements.namedItem(key).value=details[key];preview();}
function showPreflight(result){
 const panel=$('#preflight-feedback'),actions=$('#preflight-actions');panel.hidden=false;actions.replaceChildren();$('#preflight-message').textContent=result.message;
 const button=(label,click)=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.addEventListener('click',click);actions.append(b);};
 for(const suggestion of result.caseStudy?.suggestions||[])button(result.caseStudy.status==='suggestion'?'Use “'+suggestion+'”':suggestion,()=>{form.elements.namedItem('caseStudy').value=suggestion;confirmedCaseStudy=null;requestId=null;pending.clear();clearErrors();preview();form.requestSubmit();});
 if(result.caseStudy?.status==='suggestion')button('Keep my wording',()=>{confirmedCaseStudy=form.elements.namedItem('caseStudy').value.trim();form.requestSubmit();});
 if(['invalid','clarify'].includes(result.status))form.elements.namedItem('caseStudy').setAttribute('aria-invalid','true');
 if(result.repository?.url){const a=document.createElement('a');a.href=result.repository.url;a.target='_blank';a.rel='noopener';a.textContent='Open existing repository ↗';actions.append(a);}
 if(result.run){
  const p=document.createElement('p');p.textContent='Saved case: '+result.run.caseStudy;actions.before(p);p.className='saved-case';
  for(const old of panel.querySelectorAll('.saved-case'))if(old!==p)old.remove();
  button(result.run.status==='complete'?'Open saved result':'Return to saved run',async()=>{try{const job=await json('/api/pilot/jobs/'+result.run.id);storage.set(result.run.id);pending.clear();viewingPipeline=false;display(job);await follow(job.id);}catch(error){showError(error);}});
  if(result.run.canReviseCase&&result.run.caseStudy!==form.elements.namedItem('caseStudy').value.trim())button('Retry with revised case study',async()=>{
   if(waiting||following)return;const caseStudy=form.elements.namedItem('caseStudy').value.trim();waiting=true;busyDetails(true);
   try{await json('/api/pilot/jobs/'+result.run.id+'/continue',{allowRun:true,caseStudy,confirmedCaseStudy});storage.set(result.run.id);display(await json('/api/pilot/jobs/'+result.run.id));busyDetails(false);await follow(result.run.id);}catch(error){if(error.preflight)showPreflight(error.preflight);else showError(error);}finally{waiting=false;busyDetails(false);}
  });
 }else for(const old of panel.querySelectorAll('.saved-case'))old.remove();
 if(result.action==='connect')$('#connect-github').hidden=false;
}
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
 $('#build-recovery').hidden=!failed;$('#build-recovery').textContent=failed?guided?.recovery?.hint||'Retry this saved run. Completed stages stay saved.':'';
 if(failed&&guided?.recovery?.action==='copilot-settings'){
  const link=document.createElement('a');link.href='https://github.com/settings/copilot';link.target='_blank';link.rel='noopener';link.textContent='Open Copilot settings ↗';
  $('#build-recovery').append(document.createTextNode(' '),link);
 }
 $('#reconnect-github').hidden=!failed||guided?.recovery?.action!=='connect';
 $('#revise-case').hidden=!failed||!guided?.canReviseCase||guided?.recovery?.action==='copilot-settings';
 $('#retry').hidden=!failed||!guided?.pipeline?.length;$('#retry').disabled=running;
 renderPipeline(guided?.pipeline,job);
 const repo=guided?.repository;
 $('#running-repository').hidden=!repo?.url;if(repo?.url)$('#running-repository').href=repo.url;
 const complete=guided?.status==='complete'&&job.finish&&repo?.url;
 if(complete){
  $('#result-case').textContent=(job.title||job.caseStudy)+' · '+job.prefix;
  $('#result-count').textContent='Five portfolios · '+(guided.checkpoints?.length||0)+' saved commits';
  $('#open-repository').href=repo.url;$('#edit-summary').href=repo.url+'/edit/'+encodeURIComponent(repo.branch||'main')+'/'+encodeURIComponent(job.prefix+'_FinalSummary.md');
  for(const [id,key]of [['summary-pdf','summary'],['summary-source','summary-source'],['portfolio-zip','download'],['quick-guide','quick-guide']]){const file=job.files.find(f=>f.url.endsWith('/'+key));if(file)$('#'+id).href=file.url;}
  if(!viewingPipeline)step(3);
 }else step(2);
 $('#return-to-run').hidden=!currentJob;$('#back-to-repository').hidden=!complete||!viewingPipeline;
}
async function json(url,body){const response=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);const data=await response.json();if(!response.ok){const error=new Error(data.error||'The request failed.');error.fields=data.fields;error.preflight=data.preflight;error.status=response.status;throw error;}return data;}
async function follow(id){
 if(following)return;following=true;let errors=0;
 try{while(true){try{const job=await json('/api/pilot/jobs/'+id);errors=0;display(job);if(job.guided?.status!=='running'&&job.status!=='running')break;}catch(error){if(++errors>=3){$('#build-spinner').hidden=true;$('#build-title').textContent='Connection interrupted';$('#build-error').hidden=false;$('#build-error').textContent='Reload this page to reconnect to your saved run. Do not start another portfolio.';break;}}await new Promise(r=>setTimeout(r,1200));}}
 finally{following=false;waiting=false;}
}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(waiting||following)return;clearErrors();let details;try{details=validatePortfolioInput(input());}catch(error){showError(error);return;}
 waiting=true;requestId||=crypto.randomUUID();const payload={...details,requestId,confirmedCaseStudy,allowLive:true,runAll:true};busyDetails(true);$('#preflight-feedback').hidden=false;$('#preflight-message').textContent='Checking your case study, repository and workspace…';$('#preflight-actions').replaceChildren();for(const old of $('#preflight-feedback').querySelectorAll('.saved-case'))old.remove();
 try{
  const checked=await json('/api/pilot/preflight',payload);if(checked.status!=='ready'){showPreflight(checked);return;}
  pending.set(payload);startedAt=new Date().toISOString();viewingPipeline=false;$('#pipeline').replaceChildren();step(2,true);renderPipeline();$('#build-spinner').hidden=false;$('#build-error').hidden=true;$('#build-message').textContent='Creating your private repository…';$('#build-case').textContent=details.caseStudy;
  const job=await json('/api/pilot/start',payload);storage.set(job.id);pending.clear();display(job);busyDetails(false);await follow(job.id);
 }catch(error){step(1);if(error.preflight)showPreflight(error.preflight);else showError(error);if(pending.get()&&!error.fields&&!error.preflight)$('#form-error').textContent=error.message+' Click Create portfolio again to reconnect or retry the same request.';}
 finally{waiting=false;busyDetails(false);}
});
$('#retry').addEventListener('click',async()=>{if(!currentJob||following||waiting)return;waiting=true;$('#retry').disabled=true;try{await json('/api/pilot/jobs/'+currentJob.id+'/continue',{allowRun:true});await follow(currentJob.id);}catch(error){try{display(await json('/api/pilot/jobs/'+currentJob.id));}catch{}$('#build-error').hidden=false;$('#build-error').textContent=error.message;}finally{waiting=false;$('#retry').disabled=false;}});
$('#view-pipeline').addEventListener('click',()=>{viewingPipeline=true;step(2,true);$('#back-to-repository').hidden=false;});
$('#back-to-repository').addEventListener('click',()=>{if(viewingPipeline&&currentJob?.guided?.status==='complete'){viewingPipeline=false;display(currentJob);}});
$('#new-portfolio').addEventListener('click',()=>{form.reset();requestId=null;confirmedCaseStudy=null;pending.clear();clearErrors();$('#preflight-feedback').hidden=true;preview();step(1,true);$('#return-to-run').hidden=!currentJob;});
$('#return-to-run').addEventListener('click',()=>{viewingPipeline=false;display(currentJob);});
$('#revise-case').addEventListener('click',()=>{fillDetails(currentJob.guided.details);confirmedCaseStudy=null;requestId=null;clearErrors();$('#preflight-feedback').hidden=true;step(1,true);form.elements.namedItem('caseStudy').focus();});
async function loadConfig(){
 config=await json('/api/pilot/config');$('#connection-status').textContent=config.repository?.message||'GitHub connection unavailable.';
 $('#connect-github').hidden=Boolean(config.repository?.verified);$('#create-portfolio').disabled=!config.enabled||!config.repository?.verified;
}
async function connectGithub(){
 step(1);
 $('#connect-github').disabled=true;$('#login-instructions').hidden=false;
 try{await json('/api/github/login',{});while(true){const state=await json('/api/github/login');$('#login-message').textContent=state.message;$('#login-code').textContent=state.code||'';if(state.status==='complete'){await loadConfig();$('#login-instructions').hidden=true;break;}if(state.status==='failed')break;await new Promise(r=>setTimeout(r,1500));}}
 catch(error){$('#login-message').textContent=error.message;}finally{$('#connect-github').disabled=false;}
}
$('#connect-github').addEventListener('click',connectGithub);
$('#reconnect-github').addEventListener('click',connectGithub);
setInterval(updateTimes,1000);
(async()=>{try{await loadConfig();const saved=pending.get(),id=saved?.requestId||storage.get()||config.latestJob;if(id){let job;try{job=await json('/api/pilot/jobs/'+id);}catch(error){if(error.status!==404)throw error;if(saved){fillDetails(saved);requestId=saved.requestId;confirmedCaseStudy=saved.confirmedCaseStudy;$('#form-error').textContent='Your last start request was interrupted. Click Create portfolio to reconnect or retry it safely.';}else{storage.clear();$('#form-error').textContent='This run is not in the current workspace. Enter your details to find the existing GitHub repository, or reopen the original Codespace.';}return;}storage.set(id);pending.clear();if(job.guided?.pipeline?.length){display(job);await follow(id);}else{$('#connection-status').textContent+=' Enter your details to use the new repository flow.';}}}catch(error){$('#connection-status').textContent=error.message;}})();
