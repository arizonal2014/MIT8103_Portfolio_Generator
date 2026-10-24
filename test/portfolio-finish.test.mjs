import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {unzipSync} from 'fflate';
import {libraryCase,hospitalCase} from '../examples/cases.mjs';
import {distributedDesign,validateReview,archivePortfolio,safeOutput} from '../lib/portfolio-finish.mjs';
import {createGuidedWorkflow} from '../lib/guided-workflow.mjs';

test('distributed discussion follows each case and never claims a tested deployment',()=>{
 for(const spec of[libraryCase(),hospitalCase()]){const out=distributedDesign(spec);assert.ok(out.markdown.includes(spec.noSql.collection));assert.match(out.html,/No live distributed deployment is claimed/);assert.match(out.markdown,/No cloud service was provisioned/);assert.match(out.svg,/NOT EXECUTED/);}
});
test('unimplemented distributed experiment is rejected rather than invented',()=>{const s=libraryCase();s.distributed.mode='replica_set';assert.throws(()=>distributedDesign(s),/discussion/);});
test('reflection requires actual review, rejects missing or excessive text',()=>{
 assert.throws(()=>validateReview({reviewed:false,reflection:'x'.repeat(100)}));assert.throws(()=>validateReview({reviewed:true,reflection:'short'}));assert.throws(()=>validateReview({reviewed:true,reflection:'x'.repeat(1801)}));assert.equal(validateReview({reviewed:true,reflection:'x'.repeat(100)}).reflection.length,100);
});
test('ZIP contains only named portfolio files and rejects symlinks',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'portfolio-zip-')),output=path.join(root,'Doe_Ada_0001');await mkdir(output);await writeFile(path.join(output,'Doe_Ada_0001_README.md'),'recorded result');
 await archivePortfolio(output,'Doe_Ada_0001',path.join(root,'download.zip'));const zip=unzipSync(await readFile(path.join(root,'download.zip')));assert.deepEqual(Object.keys(zip),['Doe_Ada_0001/Doe_Ada_0001_README.md']);
 await symlink(path.join(output,'Doe_Ada_0001_README.md'),path.join(output,'Doe_Ada_0001_hidden.md'));await assert.rejects(archivePortfolio(output,'Doe_Ada_0001',path.join(root,'bad.zip')),/Symbolic links/);
});
test('saved output outside its own case run is rejected',async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'portfolio-root-'));await mkdir(path.join(root,'case-run-test'));await mkdir(path.join(root,'outside'));await assert.rejects(safeOutput({id:'test',prefix:'outside',outputDirectory:path.join(root,'outside')},root),/Unsafe/);});
async function fixture(fail=false){
 const root=await mkdtemp(path.join(os.tmpdir(),'guided-')),id='12345678-1234-1234-1234-123456789abc';await mkdir(path.join(root,'case-run-'+id));
 const job={id,status:'complete',prefix:'Doe_Ada_0001',files:[],checks:{tables:3,rejectedInvalidRecords:8},outputDirectory:path.join(root,'output')};let started=false,runs=0;const sequence=[];let counter=0;
 const base={enabled:true,ready:Promise.resolve(),get:key=>started&&key===id?structuredClone(job):null,artifact:()=>null,start:async()=>{started=true;return structuredClone(job);},settled:async()=>{},queriesSettled:async()=>{},transactionsSettled:async()=>{},mongoSettled:async()=>{}};
 for(const[n,method]of[[2,'startQueries'],[3,'startTransactions'],[4,'startMongo']])base[method]=async()=>{sequence.push(n);if(n===4)runs++;job['portfolio'+n]={status:n===4&&fail?'failed':'complete',message:n===4&&fail?'Mongo unavailable':'Checks passed'};};
 const repository={ensure:async()=>({verified:true,name:job.prefix,sha:'initial',url:'https://github.com/fixture/'+job.prefix}),save:async(repo,source,prefix,label)=>({stage:label,sha:'sha'+(++counter),savedAt:new Date().toISOString(),url:repo.url+'/commit/'+counter})};
 const flow=createGuidedWorkflow(base,{runsDirectory:root,root,repository,runtime:async()=>({ready:true}),prepare:async()=>({output:'fixture-only'}),capture:async()=>[],inspect:async()=>({verified:true}),finish:async()=>{sequence.push(5);return{status:'complete',message:'Package ready',stages:[],submissionReady:false};}});await flow.ready;
 const begin=()=>flow.start({firstName:'Ada',surname:'Doe',studentId:'0001',provider:'copilot',caseStudy:'A library borrowing system.',requestId:id,allowLive:true});
 return{flow,id,runs:()=>runs,root,base,sequence,begin};
}
test('guided flow saves each real stage and completes without a reflection form',async()=>{const{flow,id,sequence,begin}=await fixture();await begin();await flow.guidedSettled(id);const job=flow.get(id);assert.equal(job.guided.status,'complete');assert.deepEqual(sequence,[2,3,4,5]);assert.equal(job.guided.checkpoints.length,7);assert.ok(job.guided.pipeline.every(p=>p.status==='complete'));assert.equal(job.packageReady,true);assert.equal(job.submissionReady,false);assert.ok(job.files.some(f=>f.url.endsWith('/summary-source')));});
test('guided failure preserves earlier commits and leaves later stages pending',async()=>{const{flow,id,begin}=await fixture(true);await begin();await flow.guidedSettled(id);const job=flow.get(id);assert.equal(job.guided.status,'failed');assert.equal(job.portfolio2.status,'complete');assert.equal(job.portfolio4.status,'failed');assert.equal(job.finish,undefined);assert.equal(job.guided.checkpoints.length,4);assert.equal(job.guided.pipeline[4].status,'failed');assert.equal(job.guided.pipeline[5].status,'pending');});
test('repository failure stops before AI or databases',async()=>{let generated=false;const root=await mkdtemp(path.join(os.tmpdir(),'guided-guard-'));const flow=createGuidedWorkflow({enabled:true,ready:Promise.resolve(),get:()=>null,start:()=>{generated=true;}},{root,runsDirectory:root,runtime:async()=>({ready:true}),repository:{ensure:async()=>{throw new Error('Repository access denied');}}});await assert.rejects(flow.start({firstName:'Ada',surname:'Doe',studentId:'0001',provider:'copilot',caseStudy:'A library borrowing system.',requestId:'12345678-1234-1234-1234-123456789abc',allowLive:true}),/access denied/);assert.equal(generated,false);});
test('restart preserves pipeline, repository and completed artifacts',async()=>{const{flow,id,root,base,begin}=await fixture();await begin();await flow.guidedSettled(id);const state=JSON.parse(await readFile(path.join(root,'.guided-runs',id+'.json')));state.status='running';await writeFile(path.join(root,'.guided-runs',id+'.json'),JSON.stringify(state));const restored=createGuidedWorkflow(base,{runsDirectory:root,root,inspect:async()=>({verified:true})});await restored.ready;assert.equal(restored.get(id).guided.status,'interrupted');assert.ok(restored.get(id).files.some(f=>f.url.endsWith('/summary')));assert.equal(restored.get(id).guided.repository.directory,undefined);});
test('retry skips completed database stages and does not create duplicate commits',async()=>{const{flow,id,sequence,begin}=await fixture();await begin();await flow.guidedSettled(id);await flow.continueRun(id,{allowRun:true});await flow.guidedSettled(id);assert.deepEqual(sequence,[2,3,4,5]);assert.equal(flow.get(id).guided.checkpoints.length,7);assert.equal(flow.get(id).guided.pipeline.every(p=>p.status==='complete'),true);});
