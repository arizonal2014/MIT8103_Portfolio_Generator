import {mkdir,readFile,writeFile,copyFile,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {validateInput,InputError} from '../shared.mjs';
import {createScaffold} from './scaffold.mjs';
import {runCopilotProbe,runCopilotJSON} from './copilot-probe.mjs';
import {executionPrompt,parseExecutionPackage} from './execution-package.mjs';
import {runCasePostgres} from './postgres-case.mjs';
import {buildCaseDesign} from './case-design.mjs';

export function createCaseWorkflow({runsDirectory,account,generateSpec=runCopilotProbe,generateExecution=runCopilotJSON,execute=runCasePostgres}={}){
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
        if(saved.status==='running'){saved.status='interrupted';saved.message='The server restarted before this run finished. Saved partial files remain; no automatic rerun was started.';}
        if(saved.outputDirectory){
          const output=await realpath(saved.outputDirectory);if(!output.startsWith(directory+path.sep))continue;
          const validFiles=[];
          for(const file of saved.files){
            const key=file.url?.match(new RegExp('^/api/pilot/jobs/'+saved.id+'/files/([a-z-]+)$'))?.[1];if(key!=='manifest'&&!Object.hasOwn(savedFiles,key||''))continue;
            const expected=key==='manifest'?path.join(output,saved.prefix+'_RunManifest.json'):path.join(output,'portfolio-1-database-design',key.endsWith('-log')?'logs':'',saved.prefix+'_P1_'+savedFiles[key]);
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
        const readme=`# ${spec.scenario.title}\n\n${input.firstName} ${input.surname} · ${input.studentId}\n\nThis automated run generated the case design with Copilot, validated its explicit execution package and ran the saved SQL in isolated PostgreSQL. ${database.checks.tables} tables and ${database.checks.rejectedInvalidRecords} record-rejection tests passed. The ER diagram and worked normalisation use that same model and the captured database rows. The temporary database was removed.\n\nPortfolio 1 files are ready for individual review. Portfolios 2–5, automatic screenshots, the final summary and personal reflection are pending. Nothing was pushed or submitted.\n`;
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
  return {start,ready,get:id=>jobs.has(id)?snapshot(jobs.get(id)):null,artifact:(id,key)=>jobs.get(id)?.artifacts.get(key),settled:id=>jobs.get(id)?.done,enabled:Boolean(account),account};
}
