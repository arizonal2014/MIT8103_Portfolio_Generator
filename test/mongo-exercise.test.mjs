import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {buildMongoExercise,mongoExecutionScript,verifyMongoResults,buildMongoDocuments,renderMongoQuery} from '../lib/mongo-exercise.mjs';
import {mongoFiles} from '../lib/mongo-artifacts.mjs';
import {libraryExecution,studentExecution} from './general-case-fixtures.mjs';
import {createCaseWorkflow} from '../lib/case-workflow.mjs';
import {createScaffold} from '../lib/scaffold.mjs';
import {validateCaseSpec} from '../lib/case-spec.mjs';
import {preparePortfolioExport} from '../lib/save-portfolio.mjs';

function sampleResult(exercise){
  const docs=structuredClone(exercise.documents),queries=structuredClone(exercise.queries);
  queries[0].rows=docs.filter(d=>d.eventType===exercise.model.eventTypes[0]).slice(0,5);
  queries[1].rows=docs.filter(d=>JSON.stringify(d.source.key)===JSON.stringify(docs[0].source.key)).slice(0,5);
  queries[2].rows=docs.slice(0,5);
  queries[3].rows=exercise.model.eventTypes.map(type=>({_id:type,documentCount:docs.filter(d=>d.eventType===type).length})).sort((a,b)=>a._id<b._id?-1:1);
  return {ping:1,version:'unit fixture',collection:exercise.model.collection,insertedCount:docs.length,insertion:{acknowledged:true,insertedIds:Object.fromEntries(docs.map((d,i)=>[i,d._id]))},documents:docs,queries,validator:structuredClone(exercise.model.validator),validationLevel:'strict',validationAction:'error',indexes:[{name:'_id_',key:{_id:1}},{name:'event_type_time',key:{eventType:1,occurredAt:-1}}],rejections:[{test:'invalid_date',expectedCode:121,actualCode:121},{test:'duplicate_event_id',expectedCode:11000,actualCode:11000}]};
}
test('MongoDB model follows library links and distinguishes embeddings, references and simulated events',()=>{
  const {spec,pkg}=libraryExecution(),ex=buildMongoExercise(spec,pkg);
  assert.equal(ex.model.anchorEntity,'loan');assert.equal(ex.documents.length,4);assert.equal(ex.documents[0].simulation,true);
  assert.equal(ex.documents[0].embedded.member[0].snapshot.member_id,1);assert.equal(ex.documents[0].references.book[0].key.book_id,1);
  assert.ok(!JSON.stringify(ex).includes('hospital'));assert.notDeepEqual(ex.documents[0].details,ex.documents[1].details);
  assert.equal(ex.model.validator.$jsonSchema.properties.occurredAt.bsonType,'date');
});
test('a different case uses the matching related record rather than an arbitrary first row',()=>{
  const {spec,pkg}=studentExecution();pkg.records.find(g=>g.entity==='student').rows.reverse();
  const ex=buildMongoExercise(spec,pkg);assert.equal(ex.model.collection,'enrolment_events');assert.equal(ex.documents[0].embedded.student[0].snapshot.student_id,1);
  assert.equal(ex.documents[1].details.attributes.find(a=>a.field==='score').value,75);assert.equal(ex.model.variableFieldMapping[0].mode,'copied from linked seed records');
});
test('unconnected NoSQL sources fail clearly instead of attaching unrelated snapshots',()=>{
  const {spec,pkg}=libraryExecution();spec.noSql.sourceEntities=['member','book'];spec.noSql.embeddedEntities=['member'];
  assert.equal(validateCaseSpec(spec).valid,true);assert.throws(()=>buildMongoExercise(spec,pkg),/shared record/);
});
test('exported mongosh code parses as a script and scenario values remain JSON data',()=>{
  const {spec,pkg}=libraryExecution(),payload='\"); quit(99); //';pkg.records.find(g=>g.entity==='member').rows[0].full_name=payload;
  const script=mongoExecutionScript(buildMongoExercise(spec,pkg));assert.doesNotThrow(()=>new vm.Script(script));
  const encoded=script.match(/const INPUT = EJSON.parse\((.*)\);/)[1],data=JSON.parse(JSON.parse(encoded));
  assert.equal(data.documents[0].embedded.member[0].snapshot.full_name,payload);assert.ok(!script.includes('dropDatabase'));
});
test('displayed date query uses native ISODate values rather than plain Extended JSON objects',()=>{
  const {spec,pkg}=libraryExecution(),ex=buildMongoExercise(spec,pkg),query=renderMongoQuery(ex.model.collection,ex.queries[2]);let observed;
  vm.runInNewContext(query,{ISODate:iso=>new Date(iso),db:{getCollection:()=>({find:filter=>{observed=filter;return {sort:()=>({limit:()=>[]})};}})}});
  assert.equal(observed.occurredAt.$gte.toISOString(),'2030-01-01T10:00:00.000Z');
});
test('Date verification accepts equivalent Extended JSON formatting but rejects a changed instant or type',()=>{
  const {spec,pkg}=libraryExecution(),ex=buildMongoExercise(spec,pkg),result=sampleResult(ex);
  result.documents[0].occurredAt.$date=result.documents[0].occurredAt.$date.replace('.000Z','Z');
  assert.equal(verifyMongoResults(ex,result).storedDocumentsMatch,true);
  result.documents[0].occurredAt.$date='2030-01-01T10:01:00Z';assert.throws(()=>verifyMongoResults(ex,result));
  result.documents[0].occurredAt='2030-01-01T10:00:00Z';assert.throws(()=>verifyMongoResults(ex,result),/BSON Date/);
});
test('verification rejects changed documents, wrong rows, missing validation and unacknowledged inserts',()=>{
  const {spec,pkg}=libraryExecution(),ex=buildMongoExercise(spec,pkg);assert.equal(verifyMongoResults(ex,sampleResult(ex)).verifiedQueries,4);
  for(const mutate of [r=>r.documents.pop(),r=>r.queries[0].rows=[],r=>r.rejections[0].actualCode=11000,r=>r.insertion.acknowledged=false,r=>r.indexes.pop(),r=>r.validationAction='warn']){const r=sampleResult(ex);mutate(r);assert.throws(()=>verifyMongoResults(ex,r));}
  const result=sampleResult(ex),report={status:'passed',title:'Case <script>',cleanup:'fixture',finishedAt:'fixture'};
  const docs=buildMongoDocuments(report,ex,result);assert.ok(docs.modelHTML.includes('Case &lt;script&gt;'));assert.ok(docs.markdown.includes('illustrative event'));report.status='failed';assert.throws(()=>buildMongoDocuments(report,ex,result),/Failed MongoDB/);
});

async function savedFixture(runner){
  const root=await mkdtemp(path.join(tmpdir(),'mit8103-mongo-test-')),runs=path.join(root,'runs');await mkdir(runs);
  const fixture=libraryExecution(),uuid=randomUUID(),directory=path.join(runs,'case-run-'+uuid);await mkdir(directory);
  const scaffold=await createScaffold({firstName:'Jamie',surname:'Cole',studentId:'000456',provider:'copilot',caseStudy:'Library borrowing fixture',caseSpec:fixture.spec},directory);
  const prefix=scaffold.input.prefix,output=scaffold.outputDirectory,manifestFile=path.join(output,prefix+'_RunManifest.json'),manifest=JSON.parse(await readFile(manifestFile));
  manifest.caseSpecification.reviewedFingerprint=validateCaseSpec(fixture.spec).fingerprint;for(const id of [3,4,5,6,7,8,9,10,12,13,14,15])manifest.stages.find(s=>s.id===id).status='complete';await writeFile(manifestFile,JSON.stringify(manifest));
  await writeFile(path.join(output,'portfolio-1-database-design',prefix+'_P1_ReviewedCaseSpec.json'),JSON.stringify(fixture.spec));await writeFile(path.join(output,'portfolio-1-database-design',prefix+'_P1_ExecutionPackage.json'),JSON.stringify(fixture.pkg));
  await writeFile(path.join(output,'portfolio-3-transactions-concurrency',prefix+'_P3_Concurrency.html'),'Earlier concurrency fixture');
  const saved={id:uuid,status:'complete',title:fixture.spec.scenario.title,prefix,outputDirectory:output,finishedAt:new Date().toISOString(),portfolio2:{status:'complete'},portfolio3:{status:'complete'},files:['review','execution-package','manifest','concurrency'].map(key=>({label:key,url:`/api/pilot/jobs/${uuid}/files/${key}`})),stages:manifest.stages};
  await writeFile(path.join(directory,'Workflow.json'),JSON.stringify(saved));const workflow=createCaseWorkflow({runsDirectory:runs,account:'fixture',mongo:(...args)=>runner(root,fixture,...args)});await workflow.ready;return {root,runs,directory,workflow,id:uuid};
}
async function passingRunner(root,fixture){
  const directory=path.join(root,'mongo-mock');await mkdir(directory);for(const [name] of Object.values(mongoFiles))await writeFile(path.join(directory,name),'Mock MongoDB evidence only');
  return {status:'passed',directory,collection:'borrowing_events',mongoVersion:'fixture',reviewedFingerprint:validateCaseSpec(fixture.spec).fingerprint,finishedAt:new Date().toISOString(),checks:{insertedDocuments:4,verifiedQueries:4}};
}
test('Portfolio 4 saves and restores MongoDB files, exports the JS script and preserves earlier portfolios',async()=>{
  let calls=0;const {root,runs,workflow,id}=await savedFixture((...args)=>{calls++;return passingRunner(...args);});await assert.rejects(workflow.startMongo(id,{}),/Run Portfolio 4/);
  await workflow.startMongo(id,{allowRun:true});await workflow.mongoSettled(id);const job=workflow.get(id);assert.equal(job.portfolio4.status,'complete',job.portfolio4.message);assert.equal(job.stages.find(s=>s.id===16).status,'complete');assert.equal(job.stages.find(s=>s.id===17).status,'complete');assert.equal(job.stages.find(s=>s.id===18).status,'pending');assert.ok(workflow.artifact(id,'concurrency'));
  await workflow.startMongo(id,{allowRun:true});assert.equal(calls,1);
  const restored=createCaseWorkflow({runsDirectory:runs,account:'fixture'});await restored.ready;assert.ok(restored.artifact(id,'mongo-model'));assert.ok(restored.artifact(id,'mongo-execution-log').path.includes('/logs/'));
  const exported=await preparePortfolioExport(root);assert.equal(exported.prefix,'Cole_Jamie_000456');assert.ok(exported.files.some(f=>f.endsWith('_P4_Execute.js')));
});
test('a failed MongoDB run leaves earlier results and unexecuted stages intact',async()=>{
  const {workflow,id}=await savedFixture(async()=>({status:'failed',error:'MongoDB runtime is unavailable'}));await workflow.startMongo(id,{allowRun:true});await workflow.mongoSettled(id);const job=workflow.get(id);
  assert.equal(job.portfolio4.status,'failed');assert.equal(job.portfolio3.status,'complete');assert.equal(job.stages.find(s=>s.id===16).status,'pending');assert.ok(workflow.artifact(id,'concurrency'));assert.equal(workflow.artifact(id,'mongo-results'),undefined);
});
test('an interrupted MongoDB run is not silently repeated and running output cannot be exported',async()=>{
  let calls=0;const {root,runs,directory,id}=await savedFixture(async()=>{calls++;throw Error('Unexpected database run');});const file=path.join(directory,'Workflow.json'),saved=JSON.parse(await readFile(file));saved.portfolio4={status:'running'};await writeFile(file,JSON.stringify(saved));
  await assert.rejects(preparePortfolioExport(root),/Wait for Portfolio 4/);const restored=createCaseWorkflow({runsDirectory:runs,account:'fixture',mongo:async()=>{calls++;}});await restored.ready;assert.equal(restored.get(id).portfolio4.status,'interrupted');assert.equal(calls,0);
});
