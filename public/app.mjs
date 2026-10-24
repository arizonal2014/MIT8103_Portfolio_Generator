import { validateInput, createStagePlan } from '/shared.mjs';

const form = document.querySelector('#details');
const status = document.querySelector('#form-status');
const button = document.querySelector('#create');
const prefix = document.querySelector('#prefix');
const stages = document.querySelector('#stages');
function renderStages(plan){
stages.replaceChildren();
for (const stage of plan) {
  const row = document.createElement('li');
  const label = document.createElement('span'); label.textContent = `${String(stage.id).padStart(2,'0')}  ${stage.name}`;
  const state = document.createElement('span'); state.className = stage.status; state.textContent = stage.status;
  row.append(label, state); stages.append(row);
}
document.querySelector('#count').textContent=`${plan.filter(s=>s.status==='complete').length} / 19 steps complete`;
}
renderStages(createStagePlan());
const values = () => Object.fromEntries(new FormData(form));
form.addEventListener('input', () => {
  const raw = values();
  try { prefix.textContent = validateInput({ ...raw, caseStudy: raw.caseStudy || 'Preview', provider: raw.provider || 'gemini' }).prefix; }
  catch { prefix.textContent = 'Surname_Firstname_StudentID'; }
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  status.textContent = '';
  document.querySelectorAll('.error').forEach(el => { el.textContent = ''; });
  for (const el of form.elements) el.removeAttribute('aria-invalid');
  let input;
  try { input = validateInput(values()); }
  catch (error) { showErrors(error.errors); return; }
  button.disabled = true; button.textContent = 'Creating scaffold…';
  document.querySelector('#result').hidden = true;
  try {
    const response = await fetch('/api/scaffold', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const result = await response.json();
    if (!response.ok) { if (result.fields) showErrors(result.fields); else status.textContent = result.error; return; }
    prefix.textContent = result.input.prefix;
    document.querySelector('#saved-path').textContent = `Saved in: ${result.outputDirectory}`;
    renderList('#files', result.files);
    renderList('#evidence', result.evidence.map(item => `${item.image} — Pending capture`));
    document.querySelector('#result').hidden = false;
    status.textContent = 'Scaffold created. No AI or database exercises have run.';
  } catch { status.textContent = 'Could not reach the local server. Restart it and try again.'; }
  finally { button.disabled = false; button.textContent = 'Create another workspace scaffold'; }
});
function showErrors(errors = {}) {
  for (const [key, message] of Object.entries(errors)) {
    const error = document.getElementById(`${key}-error`);
    if (error) error.textContent = message;
    form.elements.namedItem(key)?.setAttribute('aria-invalid','true');
  }
  status.textContent = errors.form || 'Please check the highlighted fields.';
  form.querySelector('[aria-invalid="true"]')?.focus();
}
function renderList(selector, items) {
  const list = document.querySelector(selector); list.replaceChildren();
  for (const item of items) { const li = document.createElement('li'); li.textContent = item; list.append(li); }
}

const providerStatus=document.querySelector('#provider-status');
let providerCheckId=0;
form.elements.provider.addEventListener('change',()=>{providerCheckId++;providerStatus.textContent='Selection changed. Installation and sign-in have not been checked.';document.querySelector('#request-preview').hidden=true;document.querySelector('#request-text').value='';});
form.elements.caseStudy.addEventListener('input',()=>{providerCheckId++;document.querySelector('#request-preview').hidden=true;document.querySelector('#request-text').value='';});
document.querySelector('#check-provider').addEventListener('click',async()=>{
  const provider=form.elements.provider.value;if(!provider){providerStatus.textContent='Choose Gemini, Codex or Copilot first.';return;}
  const requestId=++providerCheckId;providerStatus.textContent='Checking the local command path only…';
  try{const response=await fetch('/api/providers');if(!response.ok)throw new Error();const selected=(await response.json()).find(p=>p.provider===provider);if(requestId!==providerCheckId)return;providerStatus.textContent=`${selected.name}: ${selected.message} This check does not verify sign-in or quota. Use Generate and test my database for live Copilot generation.`;}
  catch{if(requestId===providerCheckId)providerStatus.textContent='Could not check the local tool. Check the server.';}
});
document.querySelector('#prepare-request').addEventListener('click',async()=>{
  const requestId=++providerCheckId;document.querySelector('#request-preview').hidden=true;
  try{
    const response=await fetch('/api/provider/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:form.elements.provider.value,caseStudy:form.elements.caseStudy.value})});
    const data=await response.json();if(requestId!==providerCheckId)return;
    if(!response.ok){providerStatus.textContent=Object.values(data.fields||{}).join(' ')||data.error;return;}
    document.querySelector('#request-text').value=data.prompt;document.querySelector('#request-preview').hidden=false;
    providerStatus.textContent='Request prepared locally, not sent. The separately entered name and student ID are omitted. No AI usage was incurred.';
  }catch{if(requestId===providerCheckId)providerStatus.textContent='Could not prepare the request. Check the local server.';}
});

const caseInput=document.querySelector('#case-json');
const caseStatus=document.querySelector('#case-status');
for(const name of ['library','hospital'])document.querySelector(`#${name}-example`).addEventListener('click',async()=>{
  try{const response=await fetch(`/api/examples/${name}`);if(!response.ok)throw new Error();caseInput.value=JSON.stringify(await response.json(),null,2);caseStatus.textContent='Hand-written test model loaded. No AI or database execution.';renderList('#case-errors',[]);document.querySelector('#case-detail').textContent='';}
  catch{caseStatus.textContent='Could not load the test model. Check the local server.';}
});
caseInput.addEventListener('input',()=>{caseStatus.textContent='Model edited. Check its structure again.';renderList('#case-errors',[]);document.querySelector('#case-detail').textContent='';});
document.querySelector('#validate-case').addEventListener('click',async()=>{
  renderList('#case-errors',[]);document.querySelector('#case-detail').textContent='';
  let spec;try{spec=JSON.parse(caseInput.value);}catch{caseStatus.textContent='Enter valid JSON without Markdown fences.';return;}
  try{
    const response=await fetch('/api/case-spec/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spec})});
    const result=await response.json();
    if(![200,422].includes(response.status)){caseStatus.textContent=result.error||'Could not check the model.';return;}
    caseStatus.textContent=result.valid?'Structure checks passed. No database exercise has run.':'Structure checks failed. Correct the items below.';
    renderList('#case-errors',result.errors.map(e=>`${e.path}: ${e.message}`));
    document.querySelector('#case-detail').textContent=result.valid?`${spec.entities.length} entities; ${result.relationships.length} relationships. Model fingerprint: ${result.fingerprint}. Domain correctness, executable rules, normalisation examples and results still require review and tests.`:'';
  }catch{caseStatus.textContent='Could not reach the local server.';}
});

let pilotConfig=null,pilotBusy=false,currentJob=null;
const runQueries=document.querySelector('#run-queries');
const runTransactions=document.querySelector('#run-transactions');
const runMongo=document.querySelector('#run-mongo');
const runPilot=document.querySelector('#run-pilot');
function busy(value){pilotBusy=value;for(const field of form.elements)field.disabled=value;runPilot.disabled=value||!pilotConfig?.enabled;document.querySelector('#save-github').disabled=value||!pilotConfig?.repository?.verified;}
function displayJob(job){
  if(currentJob?.id!==job.id){document.querySelector('#reflection-text').value='';document.querySelector('#review-form input[name=reviewed]').checked=false;}
  currentJob=job;
  const running=job.guided?.status==='running';
  document.querySelector('#finish-controls').hidden=job.status!=='complete';
  document.querySelector('#guided-message').textContent=job.guided?job.guided.message:'Continue to finish all remaining portfolios, screenshots and the summary.';
  document.querySelector('#continue-run').hidden=Boolean(job.finish)&&!['failed','interrupted'].includes(job.guided?.status);
  document.querySelector('#continue-run').disabled=running;
  document.querySelector('#review-form').hidden=!job.finish;
  document.querySelector('#finish-review').disabled=running;
  if(job.finish?.review&&!document.querySelector('#reflection-text').value)document.querySelector('#reflection-text').value=job.finish.review.reflection;

  document.querySelector('#mongo-controls').hidden=Boolean(job.guided)||job.portfolio3?.status!=='complete';
  runMongo.disabled=job.portfolio3?.status!=='complete'||['running','complete'].includes(job.portfolio4?.status);
  runMongo.textContent=job.portfolio4?.status==='complete'?'Portfolio 4 complete':['failed','interrupted'].includes(job.portfolio4?.status)?'Retry Portfolio 4':'Run Portfolio 4';
  document.querySelector('#mongo-message').textContent=job.portfolio4?`${job.portfolio4.status}: ${job.portfolio4.message}`:'';
  document.querySelector('#transaction-controls').hidden=Boolean(job.guided)||job.portfolio2?.status!=='complete';
  runTransactions.disabled=job.portfolio2?.status!=='complete'||['running','complete'].includes(job.portfolio3?.status);
  runTransactions.textContent=job.portfolio3?.status==='complete'?'Portfolio 3 complete':['failed','interrupted'].includes(job.portfolio3?.status)?'Retry Portfolio 3':'Run Portfolio 3';
  document.querySelector('#transaction-message').textContent=job.portfolio3?`${job.portfolio3.status}: ${job.portfolio3.message}`:'';
  document.querySelector('#query-controls').hidden=Boolean(job.guided)||job.status!=='complete';
  runQueries.disabled=job.status!=='complete'||job.portfolio2?.status==='running'||job.portfolio2?.status==='complete';
  runQueries.textContent=job.portfolio2?.status==='complete'?'Portfolio 2 complete':job.portfolio2?.status==='failed'||job.portfolio2?.status==='interrupted'?'Retry Portfolio 2':'Run Portfolio 2';
  document.querySelector('#query-message').textContent=job.portfolio2?`${job.portfolio2.status}: ${job.portfolio2.message}`:'';
  document.querySelector('#pilot-result').hidden=false;
  document.querySelector('#pilot-message').textContent=job.guided?`${job.guided.status}: ${job.guided.message}`:`${job.status}: ${job.message}`;
  renderList('#pilot-steps',job.steps.map(s=>`${s.name} — ${s.status}`));
  document.querySelector('#pilot-output').textContent=job.outputDirectory?`Saved in: ${job.outputDirectory}`:'';
  const files=document.querySelector('#pilot-files'),other=document.querySelector('#other-files');files.replaceChildren();other.replaceChildren();
  for(const file of job.files){const li=document.createElement('li'),a=document.createElement('a');a.href=file.url;a.textContent=file.label;a.target='_blank';a.rel='noopener';li.append(a);(file.primary?files:other).append(li);}
  renderStages(job.stages||createStagePlan());
}
async function followJob(id){
  let failures=0;
  while(true){
    try{
      const response=await fetch(`/api/pilot/jobs/${id}`);const job=await response.json();
      if(response.status===404){sessionStorage.removeItem('case-generator-job');document.querySelector('#pilot-result').hidden=false;document.querySelector('#pilot-message').textContent='The server restarted. Earlier files remain on disk; start a new run when ready.';busy(false);return;}
      if(!response.ok)throw new Error(job.error||'Could not read the run.');
      failures=0;displayJob(job);
      if(job.guided?.status!=='running'&&job.status!=='running'&&job.portfolio2?.status!=='running'&&job.portfolio3?.status!=='running'&&job.portfolio4?.status!=='running'){busy(false);return;}
    }catch(error){
      if(++failures>=3){document.querySelector('#pilot-message').textContent=`Progress connection stopped: ${error.message} Saved output remains on disk. Reload to reconnect; do not start a duplicate run.`;busy(false);return;}
    }
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
}
document.querySelector('#use-hospital').addEventListener('click',()=>{
  if(!pilotConfig)return;form.elements.caseStudy.value=pilotConfig.scenario;form.elements.provider.value='copilot';
  form.dispatchEvent(new Event('input'));form.elements.provider.dispatchEvent(new Event('change'));
  document.querySelector('#form-status').textContent='Library example selected. You can replace it with your own case study.';
});
runPilot.addEventListener('click',async()=>{
  if(pilotBusy||!pilotConfig?.enabled)return;
  let input;try{input=validateInput(values());}catch(error){showErrors(error.errors);return;}
  if(input.provider!=='copilot'){status.textContent='Select Copilot for live generation. Other tools are not connected yet.';return;}
  busy(true);const requestId=crypto.randomUUID();
  try{
    const response=await fetch('/api/pilot/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,requestId,allowLive:true,runAll:true,saveToGithub:document.querySelector('#save-github').checked})});
    const job=await response.json();if(!response.ok)throw new Error(job.error||Object.values(job.fields||{}).join(' '));
    sessionStorage.setItem('case-generator-job',job.id);displayJob(job);await followJob(job.id);
  }catch(error){status.textContent=`Could not start generation: ${error.message}`;busy(false);}
});
(async()=>{
  try{
    const response=await fetch('/api/pilot/config');if(!response.ok)throw new Error();pilotConfig=await response.json();
    document.querySelector('#pilot-config').textContent=pilotConfig.enabled?`Connected account: ${pilotConfig.account}. Uses that account's Copilot allowance.`:'Live generation is disabled on this server. Local checks and scaffolds remain available.';
    runPilot.disabled=!pilotConfig.enabled;
    const connected=pilotConfig.repository?.verified;
    document.querySelector('#repository-status').textContent=pilotConfig.repository?.message||'';
    document.querySelector('#save-github').checked=Boolean(connected);
    document.querySelector('#save-github').disabled=!connected;
    const id=sessionStorage.getItem('case-generator-job');if(id){busy(true);await followJob(id);}
  }catch{document.querySelector('#pilot-config').textContent='Could not check generation availability. Check the local server.';}
})();

runQueries.addEventListener('click',async()=>{
  if(pilotBusy||!currentJob||currentJob.status!=='complete')return;
  busy(true);runQueries.disabled=true;
  try{
    const response=await fetch(`/api/pilot/jobs/${currentJob.id}/optimise`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({allowRun:true})});
    const job=await response.json();if(!response.ok)throw new Error(job.error||'Could not start Portfolio 2.');
    displayJob(job);await followJob(job.id);
  }catch(error){document.querySelector('#query-message').textContent=error.message;runQueries.disabled=false;busy(false);}
});

runTransactions.addEventListener('click',async()=>{
  if(pilotBusy||currentJob?.portfolio2?.status!=='complete')return;
  busy(true);runTransactions.disabled=true;
  try{
    const response=await fetch(`/api/pilot/jobs/${currentJob.id}/transactions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({allowRun:true})});
    const job=await response.json();if(!response.ok)throw new Error(job.error||'Could not start Portfolio 3.');
    displayJob(job);await followJob(job.id);
  }catch(error){document.querySelector('#transaction-message').textContent=error.message;runTransactions.disabled=false;busy(false);}
});

runMongo.addEventListener('click',async()=>{
  if(pilotBusy||currentJob?.portfolio3?.status!=='complete')return;
  busy(true);runMongo.disabled=true;
  try{
    const response=await fetch(`/api/pilot/jobs/${currentJob.id}/mongodb`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({allowRun:true})});
    const job=await response.json();if(!response.ok)throw new Error(job.error||'Could not start Portfolio 4.');
    displayJob(job);await followJob(job.id);
  }catch(error){document.querySelector('#mongo-message').textContent=error.message;runMongo.disabled=false;busy(false);}
});

async function guidedAction(action,payload){
 if(pilotBusy||!currentJob)return;busy(true);
 try{const response=await fetch(`/api/pilot/jobs/${currentJob.id}/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const job=await response.json();if(!response.ok)throw new Error(job.error||'Could not continue.');displayJob(job);await followJob(job.id);}
 catch(error){document.querySelector('#guided-message').textContent=error.message;busy(false);}
}
document.querySelector('#continue-run').addEventListener('click',()=>guidedAction('continue',{allowRun:true,saveToGithub:document.querySelector('#save-github').checked}));
document.querySelector('#review-form').addEventListener('submit',event=>{event.preventDefault();const raw=new FormData(event.target);guidedAction('review',{reflection:raw.get('reflection'),reviewed:raw.get('reviewed')==='on'});});
