import {mkdir,readFile,writeFile,copyFile,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {validateInput,InputError} from '../shared.mjs';
import {createScaffold} from './scaffold.mjs';
import {runCopilotProbe,runCopilotJSON} from './copilot-probe.mjs';
import {executionPrompt,parseExecutionPackage} from './execution-package.mjs';
import {runCasePostgres} from './postgres-case.mjs';
import {buildCaseDesign} from './case-design.mjs';
import {runQueryOptimisation} from './query-optimisation.mjs';
import {runTransactionExercise} from './transaction-exercise.mjs';
import {transactionFiles,publishTransactionArtifacts} from './transaction-artifacts.mjs';

const queryFiles={
 'query-results':['QueryResults.html','View Portfolio 2 query results',true],
 performance:['Performance.html','View Portfolio 2 index comparison',true],
 'queries-sql':['Queries.sql','Portfolio 2 SQL queries'],
 'benchmark-sql':['Benchmark.sql','Portfolio 2 benchmark and index SQL'],
 'query-definitions':['QueryDefinitions.json','Query and benchmark definitions'],
 'query-result-data':['QueryResults.json','Actual query rows and plans'],
 'before-plans':['BeforePlans.json','Three plans before indexing'],
 'after-plans':['AfterPlans.json','Three plans after indexing'],
 'lookup-results':['LookupResults.json','Verified benchmark result rows'],
 'query-report':['Report.json','Portfolio 2 execution report'],
 'query-analysis':['Analysis.md','Portfolio 2 analysis and references'],
 'query-database-log':['DatabaseSetup.log','Portfolio 2 database setup output'],
 'query-setup-log':['BenchmarkSetup.log','Performance data setup output'],
 'query-index-log':['IndexCreation.log','Index creation output'],
};

export function createCaseWorkflow({runsDirectory,account,generateSpec=runCopilotProbe,generateExecution=runCopilotJSON,execute=runCasePostgres,optimise=runQueryOptimisation,transact=runTransactionExercise}={}){
  const jobs=new Map();let active=null;
  const snapshot=job=>JSON.parse(JSON.stringify(job.public));
  const savedFiles={schema:'Schema.sql',seed:'Seed.sql',tests:'ConstraintTests.sql',plan:'ExecutionPlan.json','execution-package':'ExecutionPackage.json',review:'ReviewedCaseSpec.json',catalog:'Catalog.json',report:'Report.json',evidence:'Evidence.html','schema-log':'SchemaExecution.log','seed-log':'SeedExecution.log','tables-log':'TablesAndConstraints.log','tests-log':'ConstraintTests.log','case-study':'CaseStudy.md','schema-notes':'RelationalDesign.md','er-diagram':'ERDiagram.html','er-svg':'ERDiagram.svg','er-source':'ERDiagram.mmd',normalisation:'Normalisation.html','normalisation-notes':'Normalisation.md','normalisation-check':'NormalisationCheck.json'};
  const ready=(async()=>{
    let names,rootReal;try{names=await readdir(runsDirectory);rootReal=await realpath(runsDirectory);}catch{return;}
    for(const name of names.filter(n=>/^case-run-[a-f0-9-]{36}$/.test(n))){
      try{
        const directory=await realpath(path.join(runsDirectory,name));if(!directory.startsWith(rootReal+path.sep))continue;
        const text=await readFile(path.join(directory,'Workflow.json'),'utf8');if(Buffer.byteLength(text)>100000)continue;
        const saved=JSON.parse(text);if(saved.id!==name.slice(9)||!Array.isArray(saved.files)||typeof saved.prefix!=='string'||/[\/\\]/.test(saved.prefix))continue;
        const job={directory,artifacts:new Map(),public:saved};
        if(saved.portfolio3?.status==='running'){saved.portfolio3.status='interrupted';saved.portfolio3.message='The server restarted during Portfolio 3. Retry explicitly; no successful transaction result was assumed.';}
        if(saved.portfolio2?.status==='running'){saved.portfolio2.status='interrupted';saved.portfolio2.message='The server restarted during Portfolio 2. Retry to run a new experiment; no results were assumed.';}
        if(saved.status==='running'){saved.status='interrupted';saved.message='The server restarted before this run finished. Saved partial files remain; no automatic rerun was started.';}
        if(saved.outputDirectory){
          const output=await realpath(saved.outputDirectory);if(!output.startsWith(directory+path.sep))continue;
          const validFiles=[];
          for(const file of saved.files){
            const key=file.url?.match(new RegExp('^/api/pilot/jobs/'+saved.id+'/files/([a-z-]+)$'))?.[1];if(key!=='manifest'&&!Object.hasOwn(savedFiles,key||'')&&!Object.hasOwn(queryFiles,key||'')&&!Object.hasOwn(transactionFiles,key||''))continue;
            const expected=Object.hasOwn(transactionFiles,key||'')?path.join(output,'portfolio-3-transactions-concurrency',key.endsWith('-log')?'logs':'',saved.prefix+'_P3_'+transactionFiles[key][0]):Object.hasOwn(queryFiles,key||'')?path.join(output,'portfolio-2-query-optimisation',key.endsWith('-log')?'logs':'',saved.prefix+'_P2_'+queryFiles[key][0]):key==='manifest'?path.join(output,saved.prefix+'_RunManifest.json'):path.join(output,'portfolio-1-database-design',key.endsWith('-log')?'logs':'',saved.prefix+'_P1_'+savedFiles[key]);
            try{const actual=await realpath(expected);if(!actual.startsWith(output+path.sep))continue;job.artifacts.set(key,{path:actual,label:file.label});validFiles.push(file);}catch{}
          }
          saved.files=validFiles;
        }
        jobs.set(saved.id,job);
      }catch{}
    }
  })();
  async function start(raw){
    await ready;
    if(!account)throw Object.assign(new Error('Live generation is not enabled on this server.'),{statusCode:503});
    if(!raw||raw.allowLive!==true||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw.requestId||''))throw new InputError({form:'Start generation using its Run button.'});
    const input=validateInput(raw);
    if(input.provider!=='copilot')throw new InputError({provider:'Live generation currently supports Copilot. Other providers have preparation only.'});
    if(jobs.has(raw.requestId))return snapshot(jobs.get(raw.requestId));
    if(active)throw Object.assign(new Error('A generation run is already active. Wait for it to finish.'),{statusCode:409});
    active=raw.requestId;
    const directory=path.resolve(runsDirectory,'case-run-'+raw.requestId);
    try{await mkdir(runsDirectory,{mode:0o700,recursive:true});await mkdir(directory,{mode:0o700});}catch(error){active=null;throw error;}
    const job={directory,artifacts:new Map(),public:{id:raw.requestId,status:'running',prefix:input.prefix,caseStudy:input.caseStudy,account,startedAt:new Date().toISOString(),aiAttempts:0,attempts:[],steps:[
      {id:'design',name:'Generate and validate your case design',status:'pending'},
      {id:'execution',name:'Prepare case-specific data and constraint tests',status:'pending'},
      {id:'database',name:'Run PostgreSQL and verify actual results',status:'pending'},
      {id:'documents',name:'Build ER diagram and normalisation tables',status:'pending'},
      {id:'files',name:'Save named files and evidence',status:'pending'},
    ],files:[],message:'Starting your case study.',submissionReady:false}};
    jobs.set(raw.requestId,job);
    const persist=()=>writeFile(path.join(directory,'Workflow.json'),JSON.stringify(job.public,null,2)+'\n',{mode:0o600});
    const step=async(i,status,message)=>{job.public.steps[i].status=status;job.public.message=message;await persist();};
    job.done=(async()=>{
      try{
        await step(0,'running','Copilot is generating a model for your case study.');
        let model=await generateSpec({account,caseStudy:input.caseStudy,generalProfile:true,allowLive:true,runsDirectory:directory});job.public.aiAttempts++;
        job.public.attempts.push({kind:'case_specification',status:model.status});
        if(model.status==='invalid_response'){
          await step(0,'running','Correcting the case model using its validation errors.');
          const repairResponse=await readFile(path.join(model.directory,'case-response.txt'),'utf8');
          model=await generateSpec({account,caseStudy:input.caseStudy,generalProfile:true,repairResponse,allowLive:true,runsDirectory:directory});job.public.aiAttempts++;
          job.public.attempts.push({kind:'case_specification',status:model.status});
        }
        if(model.status!=='validated')throw new Error(`Case generation stopped: ${model.status}. No database was run.`);
        const spec=JSON.parse(await readFile(path.join(model.directory,'case-response.txt'),'utf8'));
        job.public.title=spec.scenario.title;await step(0,'complete','The case model passed structural checks.');
        let previous,feedback,database,pkg;
        for(let attempt=0;attempt<2;attempt++){
          await step(1,'running',attempt?'Correcting the case data/tests using the saved errors.':'Preparing rules, valid sample rows and expected record rejections.');
          const result=await generateExecution({account,caseStudy:input.caseStudy,prompt:executionPrompt(spec,previous,feedback),validateResponse:text=>parseExecutionPackage(text,spec),responseKind:'execution_package',correctionAttempt:attempt>0,allowLive:true,runsDirectory:directory});
          job.public.aiAttempts++;job.public.attempts.push({kind:'execution_package',status:result.status});
          previous=await readFile(path.join(result.directory,'case-response.txt'),'utf8');
          if(result.status!=='validated'){
            feedback=result.validation?.errors||[{message:result.status}];
            if(attempt===0&&result.status==='invalid_response')continue;
            throw new Error(`Execution package stopped: ${result.status}. ${feedback.map(e=>e.message).join(' ')}`);
          }
          pkg=JSON.parse(previous);await step(1,'complete','Rules, seed rows and expected constraint targets passed preflight.');
          await step(2,'running','Executing saved SQL in an isolated PostgreSQL database.');
          database=await execute(spec,pkg,directory);job.public.attempts.push({kind:'postgres',status:database.status});
          if(database.status==='passed')break;
          let details='';try{details=(await readFile(path.join(database.directory,'Failure.log'),'utf8')).slice(0,6000);}catch{}
          feedback=[{message:database.error||database.cleanupError||'Database checks failed.',details}];
          if(database.cleanup==='failed'||attempt===1)throw new Error('PostgreSQL verification failed. '+feedback[0].message);
          job.public.steps[2].status='failed';
        }
        if(database?.status!=='passed')throw new Error('No verified database result is available.');
        job.public.checks=database.checks;await step(2,'complete','PostgreSQL verified the schema, seed records and all expected rejections.');
        await step(3,'running','Building the diagram and normalisation from the executed model and captured records.');
        const catalog=JSON.parse(await readFile(path.join(database.directory,'Catalog.json'),'utf8'));
        const design=buildCaseDesign(spec,catalog,pkg,database.reviewedFingerprint);
        await step(3,'complete','ER diagram and worked normalisation passed their model and row-reconstruction checks.');
        await step(4,'running','Saving your named files and the real execution evidence.');
        const scaffold=await createScaffold({...input,caseSpec:spec},directory),prefix=input.prefix,folder='portfolio-1-database-design';
        const register=(key,target,label,primary=false)=>{job.artifacts.set(key,{path:target,label});job.public.files.push({label,primary,url:`/api/pilot/jobs/${job.public.id}/files/${key}`});};
        for(const [key,source,label,log] of [
          ['schema','Schema.sql','SQL schema'],['seed','Seed.sql','SQL sample records'],['tests','ConstraintTests.sql','SQL constraint tests'],['plan','ExecutionPlan.json','Explicit rule bindings'],
          ['execution-package','ExecutionPackage.json','Case execution package'],['review','ReviewedCaseSpec.json','Generated case model'],['catalog','Catalog.json','Verified database catalog and records'],['report','Report.json','Database execution report'],['evidence','Evidence.html','View database results'],
          ['schema-log','SchemaExecution.log','Table creation output',true],['seed-log','SeedExecution.log','Inserted-record output',true],['tables-log','TablesAndConstraints.log','Tables, keys and constraints output',true],['tests-log','ConstraintTests.log','Record-rejection results',true],
        ]){const target=path.join(scaffold.outputDirectory,folder,log?'logs':'',`${prefix}_P1_${source}`);await copyFile(path.join(database.directory,source),target);register(key,target,label,key==='evidence');}
        for(const [key,suffix,content,label,primary] of [
          ['case-study','CaseStudy.md',design.caseStudy,'Case study description',true],['schema-notes','RelationalDesign.md',design.schemaNotes,'Tables, keys and business rules',true],
          ['er-diagram','ERDiagram.html',design.er.html,'View ER diagram',true],['er-svg','ERDiagram.svg',design.er.svg,'ER diagram image (SVG)'],['er-source','ERDiagram.mmd',design.er.mermaid,'ER diagram source (Mermaid)'],
          ['normalisation','Normalisation.html',design.normalisation.html,'View 1NF, 2NF and 3NF',true],['normalisation-notes','Normalisation.md',design.normalisation.markdown,'Normalisation tables (Markdown)'],
          ['normalisation-check','NormalisationCheck.json',JSON.stringify(design.normalisation.proof,null,2)+'\n','Normalisation reconstruction check'],
        ]){const target=path.join(scaffold.outputDirectory,folder,`${prefix}_P1_${suffix}`);await writeFile(target,content,{flag:'wx',mode:0o600});register(key,target,label,primary);}
        const manifestPath=path.join(scaffold.outputDirectory,`${prefix}_RunManifest.json`),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
        manifest.provider={selected:'copilot',connected:true,account};
        for(const id of [3,4,5,6,7,8,9,10])manifest.stages.find(s=>s.id===id).status='complete';
        for(const [id,suffixes] of [[4,['CaseStudy.md']],[5,['RelationalDesign.md']],[6,['ERDiagram.svg','ERDiagram.mmd']],[7,['Normalisation.md','NormalisationCheck.json']],[8,['Report.json']],[9,['Schema.sql']],[10,['ConstraintTests.sql']]])manifest.stages.find(s=>s.id===id).evidence=suffixes.map(s=>`${folder}/${prefix}_P1_${s}`);
        manifest.caseSpecification.executionVerified=true;manifest.caseSpecification.reviewedFingerprint=database.reviewedFingerprint;
        manifest.pending=['Repository and Codespaces verification','Portfolio 1 individual review','Portfolios 2–5','Automatic screenshots','Final summary','Personal reflection and review'];
        await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});register('manifest',manifestPath,'Progress manifest');
        const readme=`# ${spec.scenario.title}\n\n${input.firstName} ${input.surname} · ${input.studentId}\n\nThis automated run generated the case design with Copilot, validated its explicit execution package and ran the saved SQL in isolated PostgreSQL. ${database.checks.tables} tables and ${database.checks.rejectedInvalidRecords} record-rejection tests passed. The ER diagram and worked normalisation use that same model and the captured database rows. The temporary database was removed.\n\nPortfolio 1 files are ready for individual review. Open the app and choose Run Portfolio 2 to generate and measure the queries. Portfolios 3–5, automatic screenshots, the final summary and personal reflection are pending. Generation does not push or submit the assessment.\n`;
        await writeFile(path.join(scaffold.outputDirectory,`${prefix}_README.md`),readme,{mode:0o600});
        await writeFile(path.join(scaffold.outputDirectory,folder,`${prefix}_P1_README.md`),readme,{mode:0o600});
        job.public.outputDirectory=scaffold.outputDirectory;job.public.stages=manifest.stages;
        await step(4,'complete','Your case design, SQL, diagram, normalisation and database evidence are ready for review.');job.public.status='complete';
      }catch(error){job.public.status='failed';job.public.message=error.message;const current=job.public.steps.find(s=>s.status==='running');if(current)current.status='failed';}
      finally{job.public.finishedAt=new Date().toISOString();active=null;await persist();}
    })();
    job.done.catch(()=>{job.public.status='failed';job.public.message='Could not persist the run state. Saved partial files remain on disk.';active=null;});
    return snapshot(job);
  }
  async function startQueries(id,raw){
    await ready;
    if(raw?.allowRun!==true)throw Object.assign(new Error('Use Run Portfolio 2 to start the database experiment.'),{statusCode:400});
    const job=jobs.get(id);
    if(!job)throw Object.assign(new Error('Case run not found.'),{statusCode:404});
    if(job.public.status!=='complete'||!job.public.outputDirectory)throw Object.assign(new Error('Complete Portfolio 1 before running its queries.'),{statusCode:409});
    if(job.public.portfolio2?.status==='complete'||job.public.portfolio2?.status==='running')return snapshot(job);
    if(active)throw Object.assign(new Error('Another database run is active. Wait for it to finish.'),{statusCode:409});
    active=id;
    job.public.portfolio2={status:'running',startedAt:new Date().toISOString(),message:'Running case-specific SQL, then measuring the same lookup before and after an index.'};
    const persist=()=>writeFile(path.join(job.directory,'Workflow.json'),JSON.stringify(job.public,null,2)+'\n',{mode:0o600});
    try{await persist();}catch(error){active=null;job.public.portfolio2.status='failed';throw error;}
    job.queryDone=(async()=>{
      try{
        const model=job.artifacts.get('review'),execution=job.artifacts.get('execution-package');
        if(!model||!execution)throw new Error('Saved Portfolio 1 model or execution package is missing.');
        const spec=JSON.parse(await readFile(model.path,'utf8')),pkg=JSON.parse(await readFile(execution.path,'utf8'));
        const result=await optimise(spec,pkg,job.directory);
        if(result.status!=='passed')throw new Error(result.error||result.cleanupError||'Portfolio 2 database experiment failed. Saved diagnostics remain in this run.');
        const manifestPath=job.artifacts.get('manifest').path,manifest=JSON.parse(await readFile(manifestPath,'utf8'));
        if(result.reviewedFingerprint!==manifest.caseSpecification.reviewedFingerprint)throw new Error('Portfolio 2 does not match the executed Portfolio 1 model.');
        const output=job.public.outputDirectory,prefix=job.public.prefix,folder='portfolio-2-query-optimisation';
        for(const [key,[name,label,primary]] of Object.entries(queryFiles)){
          const target=path.join(output,folder,key.endsWith('-log')?'logs':'',prefix+'_P2_'+name);
          await copyFile(path.join(result.directory,name),target);job.artifacts.set(key,{path:target,label});
          job.public.files=job.public.files.filter(f=>!f.url.endsWith('/'+key));
          job.public.files.push({label,primary:Boolean(primary),url:`/api/pilot/jobs/${id}/files/${key}`});
        }
        for(const stageId of [12,13]){const stage=manifest.stages.find(s=>s.id===stageId);stage.status='complete';stage.evidence=(stageId===12?['Queries.sql','QueryResults.json','QueryResults.html']:['Benchmark.sql','BeforePlans.json','AfterPlans.json','Performance.html','Report.json']).map(name=>`${folder}/${prefix}_P2_${name}`);}
        manifest.evidence=manifest.evidence.filter(e=>!e.image.includes('_P2_BeforeIndex')&&!e.image.includes('_P2_AfterIndex'));
        if(!manifest.evidence.some(e=>e.image.endsWith('_P2_IndexComparison.png')))manifest.evidence.push({stage:13,status:'pending',image:`${folder}/screenshots/${prefix}_P2_IndexComparison.png`,log:`${folder}/${prefix}_P2_Report.json`,description:'Capture the actual comparison page after execution.'});
        const queryShot=manifest.evidence.find(e=>e.image.endsWith('_P2_QueryResults.png'));if(queryShot)queryShot.log=`${folder}/${prefix}_P2_QueryResults.json`;
        manifest.portfolio2={status:'execution_verified',finishedAt:result.finishedAt,checks:result.checks};
        manifest.pending=['Repository and Codespaces verification','Individual review of Portfolios 1 and 2','Portfolios 3–5','Automatic screenshots','Final summary','Personal reflection and review'];
        await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
        await writeFile(path.join(output,prefix+'_EvidencePlan.md'),'# Screenshot plan\n\nScreenshots are pending unless explicitly marked captured. Database output is already saved in the linked HTML, JSON and log files.\n\n'+manifest.evidence.map(e=>`- Step ${e.stage}: ${e.image} — ${e.status}\n  - Matching output: ${e.log}\n`).join(''),{mode:0o600});
        const p2readme=`# ${spec.scenario.title} — Portfolio 2\n\nQuery Processing and Optimisation (7 marks): SQL results, actual EXPLAIN ANALYZE plans, B-tree indexing and a measured comparison.\n\nOpen ${prefix}_P2_QueryResults.html and ${prefix}_P2_Performance.html. Read ${prefix}_P2_Analysis.md for the explanation and references.\n\n${result.checks.queries} queries ran against the recreated Portfolio 1 tables. A separate ${result.checks.benchmarkRows}-row performance projection uses the case's selected field type. It contains no complete business records. Before/after lookup results matched. The temporary database was removed.\n\nTo reproduce, create a fresh PostgreSQL database. Run the Portfolio 1 Schema.sql and Seed.sql files first, then this folder's Queries.sql and Benchmark.sql with psql and ON_ERROR_STOP=1. Benchmark.sql creates query_lab once; use a fresh database for another replay. Timings vary.\n\nFor two screenshots, open the query-results page and the comparison page. On macOS use Shift+Command+4; on Windows use Windows+Shift+S. Save and upload them into screenshots/ as ${prefix}_P2_QueryResults.png and ${prefix}_P2_IndexComparison.png. Automatic screenshot capture is pending; the HTML and JSON files already contain the real execution output.\n\nReview the generated query choices and explanation. Generation uses the saved case model and deterministic SQL templates, without additional AI calls.\n`;
        await writeFile(path.join(output,folder,prefix+'_P2_README.md'),p2readme,{mode:0o600});
        await writeFile(path.join(output,prefix+'_README.md'),`# ${spec.scenario.title}\n\nPortfolios 1 and 2 have generated files and actual PostgreSQL verification ready for individual review. Portfolio 2 includes ${result.checks.queries} query results and six measured index-comparison plans.\n\nPortfolios 3–5, automatic screenshots, the final summary and personal reflection remain pending. No assessment is submitted automatically. After review, npm run save commits and pushes the named output to your repository.\n`,{mode:0o600});
        job.public.stages=manifest.stages;
        job.public.portfolio2={...job.public.portfolio2,status:'complete',message:'Queries, actual plans and the index comparison are ready for review.',checks:result.checks,comparison:result.comparison,finishedAt:result.finishedAt};
      }catch(error){job.public.portfolio2.status='failed';job.public.portfolio2.message=error.message;}
      finally{active=null;await persist();}
    })();
    job.queryDone.catch(()=>{job.public.portfolio2.status='failed';job.public.portfolio2.message='Could not save Portfolio 2 state. Inspect the retained run files.';active=null;});
    return snapshot(job);
  }
  async function startTransactions(id,raw){
    await ready;
    if(raw?.allowRun!==true)throw Object.assign(new Error('Use Run Portfolio 3 to start the transaction exercise.'),{statusCode:400});
    const job=jobs.get(id);if(!job)throw Object.assign(new Error('Case run not found.'),{statusCode:404});
    if(job.public.status!=='complete'||job.public.portfolio2?.status!=='complete')throw Object.assign(new Error('Finish Portfolio 2 before starting Portfolio 3.'),{statusCode:409});
    if(['running','complete'].includes(job.public.portfolio3?.status))return snapshot(job);
    if(active)throw Object.assign(new Error('Another database run is active. Wait for it to finish.'),{statusCode:409});
    active=id;job.public.portfolio3={status:'running',startedAt:new Date().toISOString(),message:'Running commit, rollback and two real PostgreSQL sessions for the concurrency comparison.'};
    const persist=()=>writeFile(path.join(job.directory,'Workflow.json'),JSON.stringify(job.public,null,2)+'\n',{mode:0o600});
    try{await persist();}catch(error){active=null;job.public.portfolio3.status='failed';throw error;}
    job.transactionDone=(async()=>{
      try{
        const model=job.artifacts.get('review'),execution=job.artifacts.get('execution-package');if(!model||!execution)throw new Error('Saved case model or execution package is missing.');
        const result=await transact(JSON.parse(await readFile(model.path,'utf8')),JSON.parse(await readFile(execution.path,'utf8')),job.directory);
        if(result.status!=='passed')throw new Error(result.error||result.cleanupError||'Transaction verification failed. Retained diagnostics show the failure.');
        const published=await publishTransactionArtifacts(job,result);
        for(const file of published.files){job.artifacts.set(file.key,{path:file.path,label:file.label});job.public.files=job.public.files.filter(f=>!f.url.endsWith('/'+file.key));job.public.files.push({label:file.label,primary:file.primary,url:file.url});}
        job.public.stages=published.stages;
        job.public.portfolio3={...job.public.portfolio3,status:'complete',message:'Commit, rollback and actual two-session concurrency evidence are ready for review.',finishedAt:result.finishedAt,checks:result.checks};
      }catch(error){job.public.portfolio3.status='failed';job.public.portfolio3.message=error.message;}
      finally{active=null;await persist();}
    })();
    job.transactionDone.catch(()=>{job.public.portfolio3.status='failed';job.public.portfolio3.message='Could not save Portfolio 3 state. Inspect the retained run files.';active=null;});
    return snapshot(job);
  }
  return {start,startQueries,startTransactions,ready,transactionsSettled:id=>jobs.get(id)?.transactionDone,queriesSettled:id=>jobs.get(id)?.queryDone,get:id=>jobs.has(id)?snapshot(jobs.get(id)):null,artifact:(id,key)=>jobs.get(id)?.artifacts.get(key),settled:id=>jobs.get(id)?.done,enabled:Boolean(account),account};
}
