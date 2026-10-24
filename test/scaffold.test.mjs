import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateInput, InputError, createStagePlan, portfolios } from '../shared.mjs';
import { createScaffold } from '../lib/scaffold.mjs';
import { createServer } from '../server.mjs';

const sample = { firstName: 'Perete', surname: 'Harrison', studentId: '000001', caseStudy: 'Library borrowing system', provider: 'gemini' };
test('names, leading zeroes and provider selection', () => {
  const result = validateInput({ ...sample, firstName: ' Perete ', surname: "O’Neill Smith" });
  assert.equal(result.prefix, 'ONeill_Smith_Perete_000001');
  assert.equal(result.surname, 'O’Neill Smith');
  for (const provider of ['gemini','codex','copilot']) assert.equal(validateInput({...sample,provider}).provider,provider);
});
test('invalid input is rejected before writing', () => {
  for (const patch of [{surname:'../escape'},{firstName:'$(whoami)'},{studentId:1},{studentId:'../../x'},{caseStudy:''},{provider:''},{firstName:'<script>'}]) {
    assert.throws(()=>validateInput({...sample,...patch}),InputError);
  }
  assert.throws(()=>validateInput(null),InputError);
  assert.throws(()=>validateInput([]),InputError);
});
test('Unicode names supported, oversized byte prefixes rejected', () => {
  assert.match(validateInput({...sample,firstName:'Élodie',surname:'李'}).prefix,/^李_Élodie_/);
  assert.throws(()=>validateInput({...sample,firstName:'李'.repeat(70),surname:'李'.repeat(70)}),InputError);
});
test('nineteen stages start pending with no invented evidence', () => {
  const stages = createStagePlan();
  assert.equal(stages.length,19);
  assert.ok(stages.every(s=>s.status==='pending'&&s.evidence.length===0));
  assert.deepEqual(stages.map(s=>s.id),Array.from({length:19},(_,i)=>i+1));
});
test('creates named folders, manifests and evidence plan without overwriting prior runs', async () => {
  const base = await mkdtemp(path.join(tmpdir(),'mit8103-scaffold-test-'));
  const first = await createScaffold(sample,base);
  const second = await createScaffold(sample,base);
  assert.notEqual(first.runId,second.runId);
  assert.equal(first.submissionReady,false);
  assert.equal(first.provider.connected,false);
  const rootFiles = await readdir(first.outputDirectory);
  assert.ok(rootFiles.includes(`${first.input.prefix}_RunManifest.json`));
  for (const [i,[folder]] of portfolios.entries()) {
    const files = await readdir(path.join(first.outputDirectory,folder));
    assert.ok(files.includes(`${first.input.prefix}_P${i+1}_README.md`));
    assert.deepEqual(await readdir(path.join(first.outputDirectory,folder,'screenshots')),[]);
    assert.deepEqual(await readdir(path.join(first.outputDirectory,folder,'logs')),[]);
  }
  assert.equal(first.evidence.length,13);
  assert.ok(first.evidence.every(e=>e.status==='pending'&&e.image.includes(first.input.prefix)&&e.log.includes(first.input.prefix)));
  const manifest = JSON.parse(await readFile(path.join(first.outputDirectory,`${first.input.prefix}_RunManifest.json`),'utf8'));
  assert.equal(manifest.input.studentId,'000001');
  assert.ok(manifest.stages.every(s=>s.status==='pending'));
  assert.ok(first.files.every(f=>path.basename(f).startsWith(first.input.prefix)));
});
test('HTTP UI and validation with same-origin writes only', async t => {
  const runsDirectory = await mkdtemp(path.join(tmpdir(),'mit8103-http-test-'));
  const server = createServer({runsDirectory});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(origin);
  assert.equal(page.status,200);
  assert.match(await page.text(),/aria-label="Portfolio steps"/);
  const font=await fetch(origin+'/fonts/IBMPlexSans-Regular.woff2');
  assert.equal(font.headers.get('content-type'),'font/woff2');
  assert.equal(Buffer.from(await font.arrayBuffer()).subarray(0,4).toString(),'wOF2');
  assert.equal((await fetch(origin+'/fonts/unknown.woff2')).status,404);
  assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const post = (data, source=origin) => fetch(origin+'/api/scaffold',{method:'POST',headers:{'Content-Type':'application/json',Origin:source},body:JSON.stringify(data)});
  assert.equal((await post(sample,'https://unrelated.example')).status,403);
  assert.equal((await post({...sample,studentId:''})).status,422);
  const response = await post(sample);
  assert.equal(response.status,201);
  assert.equal((await response.json()).provider.connected,false);
  assert.equal((await fetch(origin+'/runs/')).status,404);
});
