import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateCaseSpec} from '../lib/case-spec.mjs';
import {validateExecutionPackage,renderExecutionSQL,parseExecutionPackage,entityOrder} from '../lib/execution-package.mjs';
import {buildCaseDesign,renderCaseER} from '../lib/case-design.mjs';
import {createCaseWorkflow} from '../lib/case-workflow.mjs';
import {libraryExecution,snapshotFor,studentModel,studentExecution} from './general-case-fixtures.mjs';

test('library package preflights without hospital fields or a fixed case template',()=>{
  const {spec,pkg}=libraryExecution();assert.equal(validateExecutionPackage(pkg,spec).valid,true);
  assert.equal(parseExecutionPackage(JSON.stringify(pkg),spec).valid,true);assert.equal(entityOrder(spec).at(-1).name,'loan');
  const sql=renderExecutionSQL(spec,pkg);assert.ok(!sql.seed.includes('patient'));assert.ok(sql.tests.includes('GET STACKED DIAGNOSTICS'));assert.ok(sql.tests.includes('actual_constraint IS DISTINCT FROM'));
});
test('package validation rejects raw SQL, missing coverage and broken seed references',()=>{
  const {spec,pkg}=libraryExecution();const raw=structuredClone(pkg);raw.rules[0].predicate={op:'sql',sql:'DROP TABLE book'};assert.equal(validateExecutionPackage(raw,spec).valid,false);
  const missing=structuredClone(pkg);missing.negativeTests=missing.negativeTests.filter(t=>t.kind!=='foreign_key');assert.equal(validateExecutionPackage(missing,spec).valid,false);
  const orphan=structuredClone(pkg);orphan.records.find(g=>g.entity==='loan').rows[0].member_id=999;assert.equal(validateExecutionPackage(orphan,spec).valid,false);
});
test('seed checks enforce required values, CHECK expressions and partial uniqueness',()=>{
  for(const mutate of [p=>p.records[0].rows[0].full_name=null,p=>p.records[3].rows[0].due_at='2029-01-01T00:00:00Z',p=>p.records[3].rows[1].returned_at=null]){
    const {spec,pkg}=libraryExecution();mutate(pkg);assert.equal(validateExecutionPackage(pkg,spec).valid,false);
  }
});
test('quoted text and dollar signs stay inside insert literals',()=>{
  const {spec,pkg}=libraryExecution();pkg.records[0].rows[0].full_name="O'Brien $$ example";
  pkg.negativeTests.find(t=>t.id==='duplicate_member').row.full_name="O'Brien $$ example";
  const sql=renderExecutionSQL(spec,pkg);assert.ok(sql.seed.includes("O''Brien $$ example"));assert.ok(sql.tests.includes('DO $t_'));
});
test('library diagram and normalisation are derived from the library model and records',()=>{
  const {spec,pkg}=libraryExecution(),fingerprint=validateCaseSpec(spec).fingerprint;
  const design=buildCaseDesign(spec,snapshotFor(pkg),pkg,fingerprint);
  assert.ok(design.er.mermaid.includes('book ||--o{ book_copy'));assert.ok(!design.er.html.includes('Hospital'));
  assert.equal(design.normalisation.proof.rowsBefore,2);assert.equal(design.normalisation.proof.losslessForSample,true);assert.equal(design.normalisation.proof.partialDependencies.length,0);
  assert.equal(design.normalisation.proof.twoNF.length,1);
});
test('student enrolment alternative composite candidate key produces a real 2NF split',()=>{
  const spec=studentModel();assert.equal(validateCaseSpec(spec).valid,true);
  const catalog={data:{student:[{student_id:1,full_name:'Example Student'}],course:[{course_id:1,title:'Databases'},{course_id:2,title:'Networks'}],enrolment:[{enrolment_id:1,student_id:1,course_id:1,score:75},{enrolment_id:2,student_id:1,course_id:2,score:85}]}};
  const design=buildCaseDesign(spec,catalog,{normalisationRoot:'enrolment'},validateCaseSpec(spec).fingerprint);
  assert.equal(design.normalisation.proof.partialDependencies.length,2);assert.equal(design.normalisation.proof.twoNF.length,3);assert.equal(design.normalisation.proof.losslessForSample,true);
  assert.ok(design.er.html.includes('Student course enrolment'));assert.ok(!design.er.html.includes('hospital'));
});
test('general design rejects missing snapshots, mismatched fingerprints and malformed joins',()=>{
  const {spec,pkg}=libraryExecution();assert.throws(()=>buildCaseDesign(spec,{},pkg,validateCaseSpec(spec).fingerprint),/missing/);
  assert.throws(()=>buildCaseDesign(spec,snapshotFor(pkg),pkg,'wrong'),/fingerprint/);
  const snapshot=snapshotFor(pkg);snapshot.data.loan[0].member_id=999;assert.throws(()=>buildCaseDesign(spec,snapshot,pkg,validateCaseSpec(spec).fingerprint),/missing or ambiguous/);
});
test('general ER layout accepts a different entity count',()=>{
  const er=renderCaseER(studentModel());assert.equal((er.mermaid.match(/--o\{/g)||[]).length,2);assert.ok(er.svg.includes('enrolment'));
});
test('numeric constraints support a different case without hospital or library rule names',()=>{
  const {spec,pkg}=studentExecution();assert.equal(validateExecutionPackage(pkg,spec).valid,true);
  const sql=renderExecutionSQL(spec,pkg);assert.ok(sql.tests.includes('valid_score'));
  pkg.records.find(g=>g.entity==='enrolment').rows[0].score=-1;assert.equal(validateExecutionPackage(pkg,spec).valid,false);
});
test('a redundant UNIQUE superkey does not invent a partial dependency',()=>{
  const {spec,pkg}=libraryExecution();spec.entities.find(e=>e.name==='loan').uniqueKeys.push(['loan_id','member_id']);
  const design=buildCaseDesign(spec,snapshotFor(pkg),pkg,validateCaseSpec(spec).fingerprint);
  assert.equal(design.normalisation.proof.partialDependencies.length,0);assert.equal(design.normalisation.proof.twoNF.length,1);
});
test('free-text workflow accepts a library case and saves model-specific outputs',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'mit8103-general-')),fixture=libraryExecution();
  const saveResponse=async(text,kind)=>{const directory=path.join(root,randomUUID());await mkdir(directory);await writeFile(path.join(directory,'case-response.txt'),text);return {directory,status:'validated'};};
  const workflow=createCaseWorkflow({runsDirectory:root,account:'fixture',generateSpec:async options=>{assert.equal(options.caseStudy,'Library borrowing at a small college.');assert.equal(options.pilotTemplate,undefined);assert.equal(options.generalProfile,true);return saveResponse(JSON.stringify(fixture.spec));},generateExecution:async options=>{assert.equal(options.validateResponse(JSON.stringify(fixture.pkg)).valid,true);return saveResponse(JSON.stringify(fixture.pkg));},execute:async(spec,pkg)=>{
    assert.equal(spec.scenario.title,'Library borrowing system');const directory=path.join(root,'mock-db');await mkdir(directory);
    for(const name of ['Schema.sql','Seed.sql','ConstraintTests.sql','ExecutionPlan.json','ExecutionPackage.json','ReviewedCaseSpec.json','Catalog.json','Report.json','Evidence.html','SchemaExecution.log','SeedExecution.log','TablesAndConstraints.log','ConstraintTests.log'])await writeFile(path.join(directory,name),name==='Catalog.json'?JSON.stringify(snapshotFor(pkg)):'unit fixture only');
    return {status:'passed',directory,reviewedFingerprint:validateCaseSpec(spec).fingerprint,checks:{tables:4,rejectedInvalidRecords:13}};
  }});
  const input={firstName:'Alex',surname:'Nwosu',studentId:'000123',provider:'copilot',caseStudy:'Library borrowing at a small college.',allowLive:true,requestId:randomUUID()};
  const job=await workflow.start(input);await workflow.settled(job.id);const result=workflow.get(job.id);
  assert.equal(result.status,'complete',result.message);assert.equal(result.title,'Library borrowing system');assert.equal(result.aiAttempts,2);assert.equal(result.files.length,22);assert.equal(result.submissionReady,false);
  assert.equal(result.stages.find(s=>s.id===11).status,'pending');assert.equal(result.stages.find(s=>s.id===6).status,'complete');
  assert.ok((await readFile(workflow.artifact(job.id,'normalisation-notes').path,'utf8')).includes('book_copy'));
  const restored=createCaseWorkflow({runsDirectory:root,account:'fixture'});await restored.ready;
  assert.equal(restored.get(job.id).status,'complete');assert.equal(restored.get(job.id).files.length,22);
  assert.ok(restored.artifact(job.id,'er-diagram').path.endsWith('_P1_ERDiagram.html'));
  assert.equal(restored.artifact(job.id,'../../secrets'),undefined);
});

test('initial retry keeps failed evidence and reruns the same job explicitly',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'mit8103-retry-'));let calls=0;
 const flow=createCaseWorkflow({runsDirectory:root,account:'fixture',generateSpec:async()=>{calls++;return {status:'provider_failed'};}});
 const raw={firstName:'Robin',surname:'Hart',studentId:'000987',caseStudy:'A garden plot allocation system.',provider:'copilot',requestId:randomUUID(),allowLive:true};
 const job=await flow.start(raw);await flow.settled(job.id);assert.equal(flow.get(job.id).status,'failed');
 await flow.retryInitial(job.id,raw);await flow.settled(job.id);assert.equal(calls,2);assert.equal(flow.get(job.id).status,'failed');
 const attempts=await (await import('node:fs/promises')).readdir(path.join(root,'.attempts'));assert.equal(attempts.length,1);assert.ok((await readFile(path.join(root,'.attempts',attempts[0],'Workflow.json'),'utf8')).includes('failed'));
});
