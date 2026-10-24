import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceAccess} from '../lib/workspace-access.mjs';
import {createServer} from '../server.mjs';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('local access remains loopback-only',()=>{
  const access=workspaceAccess({});assert.equal(access.listenHost,'127.0.0.1');assert.equal(access.hostAllowed('malicious.example'),false);assert.equal(access.originAllowed('https://evil.example','localhost:4310'),false);
});
test('Codespaces accepts only its own fixed forwarding origin',()=>{
  const access=workspaceAccess({CODESPACES:'true',CODESPACE_NAME:'sample-codespace',GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'app.github.dev'});
  assert.equal(access.url,'https://sample-codespace-4310.app.github.dev');assert.equal(access.listenHost,'0.0.0.0');
  assert.equal(access.originAllowed(access.url,'localhost:4310'),true);assert.equal(access.hostAllowed(new URL(access.url).host),true);
  assert.equal(access.originAllowed('https://other-4310.app.github.dev','localhost:4310'),false);
  assert.throws(()=>workspaceAccess({CODESPACES:'true',CODESPACE_NAME:'sample',GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'evil.example'}),/unsupported/);
});
test('forwarded same-origin writes work while unrelated origins are blocked',async()=>{
  const access=workspaceAccess({CODESPACES:'true',CODESPACE_NAME:'sample',GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'app.github.dev'}),runsDirectory=await mkdtemp(path.join(tmpdir(),'mit8103-forward-'));
  const server=createServer({access,runsDirectory,pilotAccount:null});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  try{
    const post=origin=>fetch(url+'/api/provider/prepare',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({provider:'copilot',caseStudy:'A student course system.'})});
    assert.equal((await post(access.url)).status,200);assert.equal((await post('https://other-4310.app.github.dev')).status,403);
    assert.equal((await (await fetch(url+'/api/health')).json()).service,'mit8103-generator');
  }finally{await new Promise(r=>server.close(r));}
});
test('devcontainer installs dependencies and starts the app without public port settings',async()=>{
  const config=JSON.parse(await readFile(new URL('../.devcontainer/devcontainer.json',import.meta.url),'utf8'));
  assert.deepEqual(config.forwardPorts,[4310]);assert.equal(config.postCreateCommand,'npm run setup:workspace');assert.equal(config.postStartCommand,'npm run workspace');assert.ok(!JSON.stringify(config).includes('"public"'));
});
