import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {validateInput,InputError} from '../shared.mjs';
import {createScaffold} from './scaffold.mjs';
import {runCopilotProbe} from './copilot-probe.mjs';
import {runHospitalPostgresPilot} from './postgres-pilot.mjs';
import {buildHospitalDesign} from './hospital-design.mjs';

export const hospitalScenario='A small hospital appointment system using fictional patients, doctors, fixed appointment slots and bookings. A slot allows one active booking; cancelled bookings remain in history. No diagnoses, payments or real patient data.';
const template=JSON.parse(await readFile(new URL('../examples/pilot-hospital.json',import.meta.url),'utf8'));

export function createHospitalWorkflow({runsDirectory,account,generate=runCopilotProbe,execute=runHospitalPostgresPilot}={}){
  const jobs=new Map();let active=null;
  const snapshot=job=>JSON.parse(JSON.stringify(job.public));
  async function start(raw){
    if(!account)throw Object.assign(new Error('Live hospital pilot is not enabled on this server.'),{statusCode:503});
    if(!raw||raw.allowLive!==true||!/^[a-f0-9-]{36}$/.test(raw.requestId||''))throw new InputError({form:'Start the pilot using its Run button.'});
    const input=validateInput(raw);
    if(input.provider!=='copilot'||input.caseStudy!==hospitalScenario)throw new InputError({form:'Use the hospital pilot case and select Copilot. Other cases are not connected yet.'});
    if(jobs.has(raw.requestId))return snapshot(jobs.get(raw.requestId));
    if(active)throw Object.assign(new Error('A hospital pilot is already running. Wait for it to finish.'),{statusCode:409});
    active=raw.requestId;
    const directory=path.resolve(runsDirectory,'web-pilot-'+raw.requestId);
    try{await mkdir(runsDirectory,{mode:0o700,recursive:true});await mkdir(directory,{mode:0o700});}catch(error){active=null;throw error;}
    const job={directory,artifacts:new Map(),public:{id:raw.requestId,status:'running',prefix:input.prefix,account,startedAt:new Date().toISOString(),steps:[
      {id:'design',name:'Generate and validate hospital design',status:'pending'},
      {id:'database',name:'Create tables and test constraints',status:'pending'},
      {id:'documents',name:'Build ER diagram and normalisation tables',status:'pending'},
      {id:'files',name:'Save named files and evidence',status:'pending'},
    ],files:[],message:'Starting the hospital pilot.',submissionReady:false}};
    jobs.set(raw.requestId,job);active=raw.requestId;
    const persist=()=>writeFile(path.join(directory,'Workflow.json'),JSON.stringify(job.public,null,2)+'\n',{mode:0o600});
    const step=async(index,status,message)=>{job.public.steps[index].status=status;job.public.message=message;await persist();};
    job.done=(async()=>{
      try{
        await step(0,'running','Copilot is generating the hospital design.');
        let result=await generate({account,caseStudy:input.caseStudy,pilotTemplate:template,allowLive:true,runsDirectory:directory});
        job.public.aiAttempts=1;
        if(result.status==='invalid_response'){
          await step(0,'running','The design needs correction. Sending the validation errors to Copilot once.');
          const repairResponse=await readFile(path.join(result.directory,'case-response.txt'),'utf8');
          result=await generate({account,caseStudy:input.caseStudy,pilotTemplate:template,repairResponse,allowLive:true,runsDirectory:directory});job.public.aiAttempts=2;
        }
        if(result.status!=='validated')throw new Error(`Copilot stopped: ${result.status}. No database run was started. Inspect the local diagnostic folder.`);
        const spec=JSON.parse(await readFile(path.join(result.directory,'case-response.txt'),'utf8'));
        await step(0,'complete','Hospital design passed structural validation.');
        await step(1,'running','Running the schema and constraint tests in isolated PostgreSQL.');
        const database=await execute(spec,directory);
        if(database.status!=='passed')throw new Error(`PostgreSQL pilot failed: ${database.error||database.cleanupError||'check the local report'}`);
        job.public.checks=database.checks;await step(1,'complete','Four tables and the PostgreSQL constraint tests passed.');
        await step(2,'running','Building the ER diagram and normalisation from the tested model and records.');
        const reviewed=JSON.parse(await readFile(path.join(database.directory,'ReviewedCaseSpec.json'),'utf8'));
        const catalog=JSON.parse(await readFile(path.join(database.directory,'Catalog.json'),'utf8'));
        const design=buildHospitalDesign(reviewed,catalog,database.reviewedFingerprint);
        await step(2,'complete','ER diagram generated; normalisation sample reconstructs without losing or changing rows.');
        await step(3,'running','Saving the SQL, design documents and evidence with your filename prefix.');
        const scaffold=await createScaffold({...input,caseSpec:spec},directory),prefix=input.prefix,folder='portfolio-1-database-design';
        const add=async(key,source,relative,label)=>{
          const target=path.join(scaffold.outputDirectory,relative);await copyFile(path.join(database.directory,source),target);
          job.artifacts.set(key,{path:target,label});job.public.files.push({label,url:`/api/pilot/jobs/${job.public.id}/files/${key}`});
        };
        for(const [key,source,suffix,label] of [
          ['schema','Schema.sql','Schema.sql','Generated SQL schema'],['tests','ConstraintTests.sql','ConstraintTests.sql','Constraint test SQL'],
          ['plan','ExecutionPlan.json','ExecutionPlan.json','Explicit rule bindings'],['review','ReviewedCaseSpec.json','ReviewedCaseSpec.json','Reviewed database model'],
          ['catalog','Catalog.json','Catalog.json','Verified database keys and columns'],['report','Report.json','Report.json','Database execution report'],
          ['evidence','Evidence.html','Evidence.html','View recorded database evidence'],
        ])await add(key,source,`${folder}/${prefix}_P1_${suffix}`,label);
        for(const [key,source,label] of [['schema-log','SchemaExecution.log','Table creation output'],['tables-log','TablesAndConstraints.log','Tables, keys and constraints output'],['tests-log','ConstraintTests.log','Constraint test results']])await add(key,source,`${folder}/logs/${prefix}_P1_${source}`,label);
        for(const [key,suffix,content,label] of [
          ['er-diagram','ERDiagram.html',design.er.html,'View ER diagram'],['er-svg','ERDiagram.svg',design.er.svg,'ER diagram image (SVG)'],
          ['er-source','ERDiagram.mmd',design.er.mermaid,'ER diagram source (Mermaid)'],
          ['normalisation','Normalisation.html',design.normalisation.html,'View 1NF, 2NF and 3NF'],
          ['normalisation-notes','Normalisation.md',design.normalisation.markdown,'Normalisation tables and explanation'],
          ['normalisation-check','NormalisationCheck.json',JSON.stringify(design.normalisation.proof,null,2)+'\n','Normalisation reconstruction check'],
        ]){
          const target=path.join(scaffold.outputDirectory,folder,`${prefix}_P1_${suffix}`);
          await writeFile(target,content,{flag:'wx',mode:0o600});job.artifacts.set(key,{path:target,label});
          job.public.files.push({label,url:`/api/pilot/jobs/${job.public.id}/files/${key}`});
        }
        const manifestPath=path.join(scaffold.outputDirectory,`${prefix}_RunManifest.json`);
        const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
        manifest.provider={selected:'copilot',connected:true,account};
        for(const id of [3,6,7,8,9,10])manifest.stages.find(s=>s.id===id).status='complete';
        for(const id of [4,5])manifest.stages.find(s=>s.id===id).status='drafted';
        manifest.stages.find(s=>s.id===8).evidence=[`${folder}/${prefix}_P1_Report.json`];
        manifest.stages.find(s=>s.id===9).evidence=[`${folder}/${prefix}_P1_Schema.sql`,`${folder}/logs/${prefix}_P1_TablesAndConstraints.log`];
        manifest.stages.find(s=>s.id===10).evidence=[`${folder}/logs/${prefix}_P1_ConstraintTests.log`];
        manifest.stages.find(s=>s.id===6).evidence=[`${folder}/${prefix}_P1_ERDiagram.svg`,`${folder}/${prefix}_P1_ERDiagram.mmd`];
        manifest.stages.find(s=>s.id===7).evidence=[`${folder}/${prefix}_P1_Normalisation.md`,`${folder}/${prefix}_P1_NormalisationCheck.json`];
        manifest.caseSpecification.executionVerified=true;manifest.caseSpecification.reviewedFingerprint=database.reviewedFingerprint;
        manifest.pending=['Repository verification','Codespaces verification','Case description and design review','Portfolio 1 review','Remaining portfolios','Automatic screenshots','Summary','Personal reflection and review'];
        await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
        const readme=`# Hospital database pilot\n\n${input.firstName} ${input.surname} · ${input.studentId}\n\nThe hospital design was generated with Copilot, validated, and reviewed with explicit SQL rules. The isolated PostgreSQL run passed its schema, catalog and record-rejection checks. The ER diagram uses that reviewed model. Normalisation shows actual sample tables and a checked reconstruction of the captured records. Outputs are saved in Portfolio 1. The database container was removed after verification.\n\nCase/design review, remaining portfolios, automatic screenshot capture and the final summary are pending. This is not a complete submission.\n`;
        await writeFile(path.join(scaffold.outputDirectory,`${prefix}_README.md`),readme,{mode:0o600});
        await writeFile(path.join(scaffold.outputDirectory,folder,`${prefix}_P1_README.md`),'# Portfolio 1: hospital pilot\n\nTable creation and constraint tests passed. The ER diagram shows keys and relationships from the reviewed schema. Normalisation explains 1NF, the unchanged 2NF table and the 3NF split using captured PostgreSQL sample rows.\n\nOpen the named ERDiagram.html and Normalisation.html files, or their SVG/Mermaid/Markdown sources. The reconstruction check verifies that the example rows are preserved. Case description and design still require individual review; Portfolio 1 is not marked complete.\n',{mode:0o600});
        job.artifacts.set('manifest',{path:manifestPath,label:'Progress manifest'});job.public.files.push({label:'Progress manifest',url:`/api/pilot/jobs/${job.public.id}/files/manifest`});
        job.public.outputDirectory=scaffold.outputDirectory;job.public.stages=manifest.stages;
        await step(3,'complete','Hospital pilot finished. ER diagram, normalisation, SQL and evidence are ready.');job.public.status='complete';
      }catch(error){job.public.status='failed';job.public.message=error.message;const running=job.public.steps.find(s=>s.status==='running');if(running)running.status='failed';}
      finally{job.public.finishedAt=new Date().toISOString();active=null;await persist();}
    })();
    job.done.catch(()=>{job.public.status='failed';job.public.message='Could not save the workflow state. Check disk space and permissions.';active=null;});
    return snapshot(job);
  }
  return {start,get:id=>jobs.has(id)?snapshot(jobs.get(id)):null,artifact:(id,key)=>jobs.get(id)?.artifacts.get(key),settled:id=>jobs.get(id)?.done,enabled:Boolean(account),account};
}
