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
 const job={id,status:'complete',prefix:'Doe_Ada_0001',files:[],portfolio2:{status:'complete'},portfolio3:{status:'complete'},portfolio4:{status:fail?'failed':'complete'}};let runs=0;
 const base={ready:Promise.resolve(),get:key=>key===id?structuredClone(job):null,artifact:()=>null,settled:()=>Promise.resolve(),startMongo:async()=>{runs++;job.portfolio4={status:'failed',message:'Mongo unavailable'};},mongoSettled:()=>Promise.resolve()};
 const flow=createGuidedWorkflow(base,{runsDirectory:root,root,inspect:async()=>({verified:false}),finish:async()=>({status:'awaiting_review',message:'Add reflection',stages:[],submissionReady:false})});await flow.ready;return{flow,id,runs:()=>runs,root};
}
test('guided continuation skips completed database work and exposes final files',async()=>{const{flow,id,runs}=await fixture();await flow.continueRun(id,{allowRun:true});await flow.guidedSettled(id);assert.equal(flow.get(id).guided.status,'awaiting_review');assert.equal(runs(),0);assert.ok(flow.get(id).files.some(f=>f.url.endsWith('/download')));assert.equal(flow.get(id).submissionReady,false);});
test('guided failure preserves completed work and never marks missing exercise complete',async()=>{const{flow,id,runs}=await fixture(true);await flow.continueRun(id,{allowRun:true});await flow.guidedSettled(id);assert.equal(flow.get(id).guided.status,'failed');assert.equal(flow.get(id).portfolio2.status,'complete');assert.equal(flow.get(id).portfolio4.status,'failed');assert.equal(flow.get(id).finish,undefined);assert.equal(runs(),1);});
test('automatic commits require a verified own private repository',async()=>{const{flow,id}=await fixture();await assert.rejects(flow.continueRun(id,{allowRun:true,saveToGithub:true}));});
test('restart keeps final results and marks unfinished guided execution interrupted',async()=>{const{flow,id,root}=await fixture();await flow.continueRun(id,{allowRun:true});await flow.guidedSettled(id);const state=JSON.parse(await readFile(path.join(root,'case-run-'+id,'Guided.json')));state.status='running';await writeFile(path.join(root,'case-run-'+id,'Guided.json'),JSON.stringify(state));const restored=createGuidedWorkflow({ready:Promise.resolve(),get:()=>({id,files:[]})},{runsDirectory:root,root,inspect:async()=>({verified:false})});await restored.ready;assert.equal(restored.get(id).guided.status,'interrupted');assert.ok(restored.get(id).files.some(f=>f.url.endsWith('/summary')));});
