import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createScaffold} from '../lib/scaffold.mjs';
import {preparePortfolioExport} from '../lib/save-portfolio.mjs';
async function fixture(){
  const root=await mkdtemp(path.join(tmpdir(),'mit8103-export-')),run=path.join(root,'runs','case-run-00000000-0000-0000-0000-000000000001');await mkdir(run,{recursive:true});
  const scaffold=await createScaffold({firstName:'Jamie',surname:'Cole',studentId:'000456',caseStudy:'Library borrowing system.',provider:'copilot'},run);
  await writeFile(path.join(run,'Workflow.json'),JSON.stringify({status:'complete',prefix:scaffold.input.prefix,title:'Library',finishedAt:new Date().toISOString(),outputDirectory:scaffold.outputDirectory}));
  await writeFile(path.join(run,'diagnostic.txt'),'private diagnostic');return {root,run,scaffold};
}
test('export copies only named portfolio output, preserving leading-zero ID',async()=>{
  const {root}=await fixture(),result=await preparePortfolioExport(root);assert.equal(result.prefix,'Cole_Jamie_000456');
  assert.ok(result.files.every(f=>f.startsWith('Cole_Jamie_000456/')));assert.ok(!result.files.some(f=>f.includes('diagnostic')));
  assert.ok((await readFile(path.join(result.destination,'Cole_Jamie_000456_README.md'),'utf8')).includes('000456'));
});
test('export rejects symbolic links in source output',async()=>{
  const {root,scaffold}=await fixture();const secret=path.join(root,'secret.txt');await writeFile(secret,'do not export');
  await symlink(secret,path.join(scaffold.outputDirectory,'Cole_Jamie_000456_Extra.md'));await assert.rejects(preparePortfolioExport(root),/Symbolic links/);
});
test('export rejects a symbolic destination directory',async()=>{
  const {root}=await fixture(),other=await mkdtemp(path.join(tmpdir(),'mit8103-other-'));await mkdir(path.join(root,'Cole_Jamie_000456'));
  await symlink(other,path.join(root,'Cole_Jamie_000456','portfolio-1-database-design'));await assert.rejects(preparePortfolioExport(root),/Unsafe export destination/);
});
