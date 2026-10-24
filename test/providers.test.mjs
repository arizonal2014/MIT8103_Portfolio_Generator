import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,chmod}from 'node:fs/promises';
import {tmpdir}from 'node:os';
import path from 'node:path';
import {inspectProvider,inspectProviders,prepareProviderRequest}from '../lib/providers.mjs';
import {InputError}from '../shared.mjs';
import {createServer}from '../server.mjs';

test('all three choices are explicit, with no connected or default provider',async()=>{
  const result=await inspectProviders({searchPath:''});
  assert.deepEqual(result.map(p=>p.provider),['gemini','codex','copilot']);
  assert.ok(result.every(p=>!p.installed&&p.authentication==='not_checked'&&p.generationEnabled===false));
  await assert.rejects(inspectProvider('anything_else'),InputError);
  await assert.rejects(inspectProvider('__proto__'),InputError);
  await assert.rejects(inspectProvider({toString:'not a provider'}),InputError);
});
test('readiness checks executable presence without running it',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'mit8103-provider-test-'));
  const fake=path.join(root,'gemini');
  await writeFile(fake,'Not even executable program syntax. This file must not run.');
  await chmod(fake,0o700);
  const result=await inspectProvider('gemini',{searchPath:root});
  assert.equal(result.installed,true);assert.equal(result.authentication,'not_checked');assert.equal(result.adapter,'not_connected');
});
test('directories and relative PATH entries do not count as installed tools',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'mit8103-provider-test-'));
  await mkdir(path.join(root,'codex'));
  assert.equal((await inspectProvider('codex',{searchPath:root})).installed,false);
  assert.equal((await inspectProvider('codex',{searchPath:'.'+path.delimiter+'relative'})).installed,false);
});
for(const provider of ['gemini','codex','copilot'])test(`prepares an unsent ${provider} request`,()=>{
  const request=prepareProviderRequest({provider,caseStudy:'Hospital appointment system'});
  assert.equal(request.provider,provider);assert.equal(request.submitted,false);assert.equal(request.generationEnabled,false);assert.match(request.prompt,/Hospital appointment system/);
});
test('request preparation rejects identities, credentials and invalid selections',()=>{
  for(const patch of [{firstName:'Alex'},{studentId:'000123'},{apiKey:'placeholder'},{provider:'unknown'},{caseStudy:''}])assert.throws(()=>prepareProviderRequest({provider:'gemini',caseStudy:'Library system',...patch}),InputError);
});
test('HTTP preview does not sign in, submit or expose credential fields',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'mit8103-provider-http-'));
  const server=createServer({runsDirectory:root});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(origin+'/api/provider/prepare',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({provider:'copilot',caseStudy:'Student course registration system'})});
  assert.equal(response.status,200);assert.equal((await response.json()).submitted,false);
});
