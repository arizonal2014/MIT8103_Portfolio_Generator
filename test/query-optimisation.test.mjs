import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {buildQueryExercise,compareQueryPlans,buildQueryDocuments} from '../lib/query-optimisation.mjs';
import {createCaseWorkflow} from '../lib/case-workflow.mjs';
import {validateCaseSpec} from '../lib/case-spec.mjs';
import {libraryExecution,studentExecution,snapshotFor} from './general-case-fixtures.mjs';

const plan=(ms,index=false)=>[{'Execution Time':ms,'Planning Time':0.2,Plan:{'Node Type':index?'Bitmap Heap Scan':'Seq Scan','Actual Rows':10,'Actual Loops':1,'Shared Hit Blocks':index?3:90,...(index?{Plans:[{'Node Type':'Bitmap Index Scan','Index Name':'p2_filter_idx','Actual Rows':10,'Actual Loops':1}]}:{})}}];
test('query SQL follows case links and quoted seed values; benchmarks use the declared field and row bound',()=>{
  const library=libraryExecution(),student=studentExecution();
  library.pkg.records[0].rows[0].full_name="O'Brien";
  const ex=buildQueryExercise(library.spec,library.pkg);
  assert.equal(ex.queries.length,3);assert.ok(ex.queries.find(q=>q.kind==='join').sql.includes('portfolio."loan"'));
  assert.ok(!ex.benchmark.setup.includes('DROP '));assert.ok(!ex.benchmark.setup.includes('SET enable_seqscan'));
  const other=buildQueryExercise(student.spec,student.pkg);
  assert.equal(other.benchmark.field,'score');assert.equal(other.benchmark.rows,10000);
  assert.ok(other.benchmark.setup.includes('portfolio."enrolment"'));assert.ok(!other.benchmark.setup.includes('loan'));
  student.spec.optimisation.filterField='full_name';assert.throws(()=>buildQueryExercise(student.spec,student.pkg),/validated case/);
});
test('benchmark SQL handles text, dates, timestamps, boolean and row-ID name collisions',()=>{
  const {spec,pkg}=libraryExecution();
  for(const [entity,field,type] of [['member','full_name','text'],['loan','due_at','timestamp']]){
    spec.optimisation.entity=entity;spec.optimisation.filterField=field;
    const ex=buildQueryExercise(spec,pkg);assert.equal(ex.benchmark.type,type);assert.ok(ex.benchmark.query.includes('ORDER BY "lab_row_id"'));
  }
  const e=spec.entities.find(e=>e.name==='member');e.fields.push({name:'lab_row_id',type:'boolean',required:false});
  pkg.records.find(g=>g.entity==='member').rows[0].lab_row_id=true;
  spec.optimisation.entity='member';spec.optimisation.filterField='lab_row_id';
  const ex=buildQueryExercise(spec,pkg);assert.equal(ex.benchmark.rowId,'lab_row_idx');assert.ok(ex.benchmark.query.includes('42 % 1000 = 42'));
});
test('comparison reports slower runs honestly and detects the actual index node',()=>{
  const c=compareQueryPlans([plan(1),plan(2),plan(3)],[plan(5,true),plan(4,true),plan(6,true)]);
  assert.equal(c.beforeMedianMs,2);assert.equal(c.afterMedianMs,5);assert.equal(c.changePercent,-150);assert.equal(c.indexUsed,true);
  assert.equal(c.after[0].sharedHitBlocks,3); // root counts, not double-counted child buffers
  const {spec,pkg}=studentExecution(),exercise=buildQueryExercise(spec,pkg);
  const report={status:'passed',title:'Case <script>',comparison:c,matchingRows:10,resultSha256:'fixture',indexBytes:8192,postgresVersion:'fixture',cleanup:'fixture',finishedAt:'fixture'};
  const docs=buildQueryDocuments(report,exercise,[],[],[]);
  assert.ok(docs.markdown.includes('slower in this run'));assert.ok(docs.performanceHTML.includes('Case &lt;script&gt;'));assert.ok(!docs.performanceHTML.includes('<script>'));
  report.status='failed';assert.throws(()=>buildQueryDocuments(report,exercise,[],[],[]),/Failed runs/);
  const noIndex=compareQueryPlans([plan(0),plan(0),plan(0)],[plan(0),plan(0),plan(0)]);assert.equal(noIndex.changePercent,null);assert.equal(noIndex.indexUsed,false);
});

async function fixtureWorkflow(optimise){
  const root=await mkdtemp(path.join(tmpdir(),'mit8103-query-workflow-')),fixture=libraryExecution();
  const response=async value=>{const directory=path.join(root,randomUUID());await mkdir(directory);await writeFile(path.join(directory,'case-response.txt'),JSON.stringify(value));return {directory,status:'validated'};};
  const workflow=createCaseWorkflow({runsDirectory:root,account:'fixture',generateSpec:()=>response(fixture.spec),generateExecution:()=>response(fixture.pkg),execute:async()=>{
    const directory=path.join(root,'db');await mkdir(directory);
    for(const name of ['Schema.sql','Seed.sql','ConstraintTests.sql','ExecutionPlan.json','ExecutionPackage.json','ReviewedCaseSpec.json','Catalog.json','Report.json','Evidence.html','SchemaExecution.log','SeedExecution.log','TablesAndConstraints.log','ConstraintTests.log']){
      const content=name==='Catalog.json'?JSON.stringify(snapshotFor(fixture.pkg)):name==='ExecutionPackage.json'?JSON.stringify(fixture.pkg):name==='ReviewedCaseSpec.json'?JSON.stringify(fixture.spec):'mock only';await writeFile(path.join(directory,name),content);
    }
    return {status:'passed',directory,reviewedFingerprint:validateCaseSpec(fixture.spec).fingerprint,checks:{tables:4,rejectedInvalidRecords:13}};
  },optimise:(...args)=>optimise(root,fixture,...args)});
  const job=await workflow.start({firstName:'Jamie',surname:'Cole',studentId:'000456',provider:'copilot',caseStudy:'Library lending example',allowLive:true,requestId:randomUUID()});await workflow.settled(job.id);assert.equal(workflow.get(job.id).status,'complete');
  return {root,workflow,job};
}
test('Portfolio 2 completes real stages only after a passing result, restores its links and preserves Portfolio 1',async()=>{
  let calls=0;
  const {root,workflow,job}=await fixtureWorkflow(async(root,fixture)=>{
    calls++;const directory=path.join(root,'queries');await mkdir(directory);
    for(const name of ['QueryResults.html','Performance.html','Queries.sql','Benchmark.sql','QueryDefinitions.json','QueryResults.json','BeforePlans.json','AfterPlans.json','LookupResults.json','Report.json','Analysis.md','DatabaseSetup.log','BenchmarkSetup.log','IndexCreation.log'])await writeFile(path.join(directory,name),'mock query evidence');
    return {status:'passed',directory,reviewedFingerprint:validateCaseSpec(fixture.spec).fingerprint,finishedAt:new Date().toISOString(),checks:{queries:3,benchmarkRows:10000},comparison:{beforeMedianMs:2,afterMedianMs:1}};
  });
  await assert.rejects(workflow.startQueries(job.id,{}),/Run Portfolio 2/);
  await workflow.startQueries(job.id,{allowRun:true});await workflow.queriesSettled(job.id);
  const result=workflow.get(job.id);assert.equal(result.portfolio2.status,'complete',result.portfolio2.message);assert.equal(result.status,'complete');assert.equal(result.stages.find(s=>s.id===12).status,'complete');assert.equal(result.stages.find(s=>s.id===14).status,'pending');assert.equal(result.stages.find(s=>s.id===11).status,'pending');
  assert.equal(result.aiAttempts,2);assert.ok(workflow.artifact(job.id,'performance').path.includes('portfolio-2-query-optimisation'));assert.ok(workflow.artifact(job.id,'schema'));
  const manifest=JSON.parse(await readFile(workflow.artifact(job.id,'manifest').path));assert.equal(manifest.portfolio2.status,'execution_verified');
  await workflow.startQueries(job.id,{allowRun:true});assert.equal(calls,1,'A completed run is not silently repeated.');
  const restored=createCaseWorkflow({runsDirectory:root,account:'fixture'});await restored.ready;assert.equal(restored.get(job.id).portfolio2.status,'complete');assert.ok(restored.artifact(job.id,'performance'));assert.equal(restored.get(job.id).files.length,result.files.length);
});
test('a failed Portfolio 2 run leaves earlier results intact and later stages pending',async()=>{
  const {workflow,job}=await fixtureWorkflow(async()=>({status:'failed',error:'Actual query failed'}));
  await workflow.startQueries(job.id,{allowRun:true});await workflow.queriesSettled(job.id);const result=workflow.get(job.id);
  assert.equal(result.status,'complete');assert.equal(result.portfolio2.status,'failed');assert.match(result.portfolio2.message,/Actual query failed/);assert.equal(result.stages.find(s=>s.id===12).status,'pending');assert.equal(workflow.artifact(job.id,'performance'),undefined);assert.ok(workflow.artifact(job.id,'schema'));
});
