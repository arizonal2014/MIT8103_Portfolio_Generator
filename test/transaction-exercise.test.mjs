import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {buildTransactionExercise,verifyTransactionResults,buildTransactionDocuments} from '../lib/transaction-exercise.mjs';
import {transactionFiles} from '../lib/transaction-artifacts.mjs';
import {createCaseWorkflow} from '../lib/case-workflow.mjs';
import {createScaffold} from '../lib/scaffold.mjs';
import {validateCaseSpec} from '../lib/case-spec.mjs';
import {preparePortfolioExport} from '../lib/save-portfolio.mjs';
import {libraryExecution,studentExecution} from './general-case-fixtures.mjs';

function results(){return {
 commit:{before:{processed_count:0},uncommitted:{processed_count:1},observerBeforeCommit:{processed_count:0},after:{processed_count:1}},
 rollback:{inside:{processed_count:11},observerDuring:{processed_count:1},errorState:'23514',abortedState:'25P02',after:{processed_count:1}},
 lostUpdate:{readA:{processed_count:1},readB:{processed_count:1},after:{processed_count:2}},
 locked:{sessionA:71,sessionB:72,isolationA:'read committed',isolationB:'read committed',readA:{processed_count:1},readB:{processed_count:2},after:{processed_count:3},wait:{waiting_pid:72,blockers:[71],wait_event_type:'Lock',wait_event:'transactionid'}}};}

test('transaction exercise follows the chosen case row and never executes operation prose',()=>{
  const library=libraryExecution(),student=studentExecution();library.spec.transactions.commit='DROP SCHEMA portfolio CASCADE;';
  const a=buildTransactionExercise(library.spec,library.pkg),b=buildTransactionExercise(student.spec,student.pkg);
  assert.equal(a.entity,'loan');assert.deepEqual(a.record,{loan_id:1});assert.ok(a.lock.includes('FOR UPDATE'));assert.ok(a.rollback.includes('ROLLBACK;'));
  assert.ok(!a.commit.includes('DROP SCHEMA'));assert.ok(b.setup.includes('portfolio."enrolment"'));assert.ok(!b.setup.includes('loan'));
  assert.ok(a.begin.includes('READ COMMITTED'));
});
test('helper field never overwrites a case field with the same name',()=>{
  const {spec,pkg}=libraryExecution();const e=spec.entities.find(e=>e.name==='loan');e.fields.push({name:'p3_processed_count',type:'integer',required:false});
  for(const row of pkg.records.find(g=>g.entity==='loan').rows)row.p3_processed_count=7;
  for(const t of pkg.negativeTests.filter(t=>t.entity==='loan'))t.row.p3_processed_count=7;
  const ex=buildTransactionExercise(spec,pkg);assert.equal(ex.field,'p3_processed_countx');assert.ok(ex.setup.includes('ADD COLUMN "p3_processed_countx"'));
});
test('transaction verification rejects leaked updates, missing rollback and fake blocking',()=>{
  assert.equal(verifyTransactionResults(results()).rowLockPreventedLostUpdate,true);
  for(const mutate of [r=>r.commit.observerBeforeCommit.processed_count=1,r=>r.rollback.after.processed_count=11,r=>r.rollback.errorState='00000',r=>r.locked.wait.blockers=[],r=>r.locked.sessionB=r.locked.sessionA,r=>r.locked.readB.processed_count=1,r=>r.locked.isolationB='repeatable read']){
    const r=results();mutate(r);assert.throws(()=>verifyTransactionResults(r));
  }
});
test('evidence distinguishes the temporary helper and implemented method and escapes case text',()=>{
  const {spec,pkg}=libraryExecution(),exercise=buildTransactionExercise(spec,pkg);
  const report={status:'passed',title:'Case <script>',results:results(),checks:{originalColumnsUnchanged:true},plannedConcurrencyMethod:'unique_constraint',cleanup:'removed fixture',finishedAt:'fixture'};
  const docs=buildTransactionDocuments(report,exercise);
  assert.ok(docs.commitHTML.includes('Case &lt;script&gt;'));assert.ok(!docs.commitHTML.includes('<script>'));assert.ok(docs.markdown.includes('not part of the original relational design'));assert.ok(docs.markdown.includes('model proposed unique_constraint'));assert.ok(docs.markdown.includes('implemented exercise uses row locking'));
  report.status='failed';assert.throws(()=>buildTransactionDocuments(report,exercise),/Failed transactions/);
});

async function savedFixture(runner){
  const root=await mkdtemp(path.join(tmpdir(),'mit8103-tx-test-')),runs=path.join(root,'runs');await mkdir(runs);
  const fixture=libraryExecution(),uuid=randomUUID(),directory=path.join(runs,'case-run-'+uuid);await mkdir(directory);
  const scaffold=await createScaffold({firstName:'Jamie',surname:'Cole',studentId:'000456',provider:'copilot',caseStudy:'Library borrowing fixture',caseSpec:fixture.spec},directory);
  const prefix=scaffold.input.prefix,output=scaffold.outputDirectory,manifestFile=path.join(output,prefix+'_RunManifest.json');
  const manifest=JSON.parse(await readFile(manifestFile));manifest.caseSpecification.reviewedFingerprint=validateCaseSpec(fixture.spec).fingerprint;
  for(const id of [3,4,5,6,7,8,9,10,12,13])manifest.stages.find(s=>s.id===id).status='complete';await writeFile(manifestFile,JSON.stringify(manifest));
  await writeFile(path.join(output,'portfolio-1-database-design',prefix+'_P1_ReviewedCaseSpec.json'),JSON.stringify(fixture.spec));await writeFile(path.join(output,'portfolio-1-database-design',prefix+'_P1_ExecutionPackage.json'),JSON.stringify(fixture.pkg));
  await writeFile(path.join(output,'portfolio-2-query-optimisation',prefix+'_P2_Performance.html'),'Earlier Portfolio 2 fixture');
  const saved={id:uuid,status:'complete',title:fixture.spec.scenario.title,prefix,outputDirectory:output,finishedAt:new Date().toISOString(),portfolio2:{status:'complete'},files:['review','execution-package','manifest','performance'].map(key=>({label:key,url:`/api/pilot/jobs/${uuid}/files/${key}`})),stages:manifest.stages};
  await writeFile(path.join(directory,'Workflow.json'),JSON.stringify(saved));
  const workflow=createCaseWorkflow({runsDirectory:runs,account:'fixture',transact:(...args)=>runner(root,fixture,...args)});await workflow.ready;return {root,runs,directory,fixture,workflow,id:uuid};
}
async function passingRunner(root,fixture){
  const directory=path.join(root,'tx-mock');await mkdir(directory);for(const [name] of Object.values(transactionFiles))await writeFile(path.join(directory,name),'Mock session evidence only');
  return {status:'passed',directory,entity:'loan',helperField:'p3_processed_count',reviewedFingerprint:validateCaseSpec(fixture.spec).fingerprint,finishedAt:new Date().toISOString(),checks:verifyTransactionResults(results())};
}
test('Portfolio 3 saves both session transcripts, restores links and preserves earlier portfolios',async()=>{
  let calls=0;const {runs,workflow,id}=await savedFixture((...args)=>{calls++;return passingRunner(...args);});
  await assert.rejects(workflow.startTransactions(id,{}),/Run Portfolio 3/);
  await workflow.startTransactions(id,{allowRun:true});await workflow.transactionsSettled(id);const job=workflow.get(id);
  assert.equal(job.portfolio3.status,'complete',job.portfolio3.message);assert.equal(job.stages.find(s=>s.id===14).status,'complete');assert.equal(job.stages.find(s=>s.id===15).status,'complete');assert.equal(job.stages.find(s=>s.id===16).status,'pending');assert.equal(job.stages.find(s=>s.id===11).status,'pending');
  assert.ok(workflow.artifact(id,'session-a-log').path.includes('/logs/'));assert.ok(workflow.artifact(id,'session-b-log'));assert.ok(workflow.artifact(id,'performance'));
  await workflow.startTransactions(id,{allowRun:true});assert.equal(calls,1);
  const restored=createCaseWorkflow({runsDirectory:runs,account:'fixture'});await restored.ready;assert.equal(restored.get(id).portfolio3.status,'complete');assert.ok(restored.artifact(id,'concurrency'));assert.ok(restored.artifact(id,'performance'));
});
test('failed transactions leave completed portfolios and pending stages intact',async()=>{
  const {workflow,id}=await savedFixture(async()=>({status:'failed',error:'Observed blocking did not match'}));await workflow.startTransactions(id,{allowRun:true});await workflow.transactionsSettled(id);
  const job=workflow.get(id);assert.equal(job.portfolio2.status,'complete');assert.equal(job.portfolio3.status,'failed');assert.equal(job.stages.find(s=>s.id===14).status,'pending');assert.ok(workflow.artifact(id,'performance'));assert.equal(workflow.artifact(id,'concurrency'),undefined);
});
test('an interrupted transaction run is not rerun on startup and running output cannot be exported',async()=>{
  let calls=0;const {root,runs,directory,id}=await savedFixture(async()=>{calls++;throw Error('Unexpected execution');});
  const file=path.join(directory,'Workflow.json'),saved=JSON.parse(await readFile(file));saved.portfolio3={status:'running'};await writeFile(file,JSON.stringify(saved));
  await assert.rejects(preparePortfolioExport(root),/Wait for Portfolio 3/);
  const restored=createCaseWorkflow({runsDirectory:runs,account:'fixture',transact:async()=>{calls++;}});await restored.ready;assert.equal(restored.get(id).portfolio3.status,'interrupted');assert.equal(calls,0);
});
