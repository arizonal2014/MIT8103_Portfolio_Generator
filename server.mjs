import http from 'node:http';
import {createGithubLogin} from './lib/github-login.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScaffold } from './lib/scaffold.mjs';
import { InputError } from './shared.mjs';
import { caseSpecSchema, validateCaseSpec } from './lib/case-spec.mjs';
import { libraryCase, hospitalCase } from './examples/cases.mjs';
import {inspectProviders,prepareProviderRequest}from './lib/providers.mjs';
import {createCaseWorkflow}from './lib/case-workflow.mjs';
import {createGuidedWorkflow}from './lib/guided-workflow.mjs';
import {workspaceAccess}from './lib/workspace-access.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const routes = new Map([
  ['/', ['public/index.html', 'text/html']],
  ['/style.css', ['public/style.css', 'text/css']],
  ['/app.mjs', ['public/app.mjs', 'text/javascript']],
  ['/shared.mjs', ['shared.mjs', 'text/javascript']],
  ['/case-input.mjs', ['case-input.mjs', 'text/javascript']],
  ['/fonts/IBMPlexSans-Regular.woff2', ['public/fonts/IBMPlexSans-Regular.woff2', 'font/woff2']],
  ['/fonts/IBMPlexSans-Medium.woff2', ['public/fonts/IBMPlexSans-Medium.woff2', 'font/woff2']],
  ['/fonts/IBMPlexSans-SemiBold.woff2', ['public/fonts/IBMPlexSans-SemiBold.woff2', 'font/woff2']],
  ['/fonts/IBMPlexMono-Regular.woff2', ['public/fonts/IBMPlexMono-Regular.woff2', 'font/woff2']],
]);
const securityHeaders = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Referrer-Policy': 'no-referrer',
};

export function createServer({ runsDirectory = path.join(root, 'runs'), pilotAccount=process.env.MIT8103_PILOT_ACCOUNT, access=workspaceAccess(),pilotWorkflow } = {}) {
  const githubLogin=createGithubLogin(root);
  const workflow=pilotWorkflow||createGuidedWorkflow(createCaseWorkflow({runsDirectory,account:pilotAccount}),{runsDirectory,root});
  return http.createServer(async (req, res) => {
    const json = (status, body) => { res.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if(!access.hostAllowed(req.headers.host)){json(403,{error:'Use this workspace\u2019s generator URL.'});return;}
      if(req.method==='GET'&&url.pathname==='/api/health'){json(200,{service:'mit8103-generator',workspace:root+path.sep,pid:process.pid});return;}
      await workflow.ready;
      if(req.method==='GET'&&url.pathname==='/api/github/login'){json(200,githubLogin.status());return;}
      if(req.method==='GET'&&url.pathname==='/api/pilot/config'){const repository=await workflow.context;if(pilotAccount!==null&&repository.verified&&workflow.account!==repository.login)workflow.setAccount(repository.login);json(200,{enabled:workflow.enabled,account:workflow.account,repository,latestJob:workflow.latestId(),scenario:'A library borrowing system for members, books, physical copies and loans. Keep borrowing and return history and allow only one open loan per copy.'});return;}
      const guidedRoute=url.pathname.match(/^\/api\/pilot\/jobs\/([a-f0-9-]{36})\/(continue|review)$/);
      const mongoRoute=url.pathname.match(/^\/api\/pilot\/jobs\/([a-f0-9-]{36})\/mongodb$/);
      const transactionRoute=url.pathname.match(/^\/api\/pilot\/jobs\/([a-f0-9-]{36})\/transactions$/);
      const queryRoute=url.pathname.match(/^\/api\/pilot\/jobs\/([a-f0-9-]{36})\/optimise$/);
      const jobRoute=url.pathname.match(/^\/api\/pilot\/jobs\/([a-f0-9-]{36})(?:\/files\/([a-z-]+))?$/);
      if(req.method==='GET'&&jobRoute){
        if(!jobRoute[2]){const job=workflow.get(jobRoute[1]);json(job?200:404,job||{error:'Run not found in this server session. Saved files remain on disk.'});return;}
        const artifact=await workflow.artifact(jobRoute[1],jobRoute[2]);if(!artifact){json(404,{error:'File not available.'});return;}
        const html=artifact.path.endsWith('.html'),svg=artifact.path.endsWith('.svg'),pdf=artifact.path.endsWith('.pdf'),zip=artifact.path.endsWith('.zip'),png=artifact.path.endsWith('.png');const data=await readFile(artifact.path);
        res.writeHead(200,{...securityHeaders,...(html||svg?{'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; frame-ancestors 'none'"}:{}),'Content-Disposition':`${zip?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(path.basename(artifact.path))}`,'Content-Type':html?'text/html; charset=utf-8':svg?'image/svg+xml; charset=utf-8':pdf?'application/pdf':zip?'application/zip':png?'image/png':'text/plain; charset=utf-8'});res.end(data);return;
      }
      if(req.method==='GET'&&url.pathname==='/api/case-spec/schema'){json(200,caseSpecSchema);return;}
      if(req.method==='GET'&&url.pathname==='/api/providers'){json(200,await inspectProviders());return;}
      if(req.method==='GET'&&url.pathname==='/api/examples/library'){json(200,libraryCase());return;}
      if(req.method==='GET'&&url.pathname==='/api/examples/hospital'){json(200,hospitalCase());return;}
      if (req.method === 'GET' && routes.has(url.pathname)) {
        const [file, type] = routes.get(url.pathname);
        const data = await readFile(path.join(root, file));
        res.writeHead(200, { ...securityHeaders, 'Content-Type': type==='font/woff2'?type:`${type}; charset=utf-8` }); res.end(data); return;
      }
      if (req.method !== 'POST' || (!queryRoute&&!transactionRoute&&!mongoRoute&&!guidedRoute)&&!['/api/scaffold','/api/case-spec/check','/api/provider/prepare','/api/pilot/start','/api/pilot/preflight','/api/github/login'].includes(url.pathname)) { json(404, { error: 'Not found.' }); return; }
      // The UI is local/private. Reject cross-origin writes and non-JSON forms.
      const origin = req.headers.origin;
      if (!access.originAllowed(origin,req.headers.host) || req.headers['content-type']?.split(';')[0] !== 'application/json') {
        json(403, { error: 'Open this form from its own local/private URL.' }); return;
      }
      const chunks=[];let bytes=0;
      for await (const chunk of req) {
        chunks.push(chunk);bytes+=chunk.length;
        if (bytes > 100000) { json(413, { error: 'The form is too large.' }); return; }
      }
      const body=Buffer.concat(chunks).toString('utf8');
      let input;
      try { input = JSON.parse(body); } catch { json(400, { error: 'The form could not be read. Try again.' }); return; }
      if(url.pathname==='/api/github/login'){json(202,githubLogin.start());return;}
      if(guidedRoute){json(202,await workflow[guidedRoute[2]==='review'?'review':'continueRun'](guidedRoute[1],input));return;}
      if(mongoRoute){json(202,await workflow.startMongo(mongoRoute[1],input));return;}
      if(transactionRoute){json(202,await workflow.startTransactions(transactionRoute[1],input));return;}
      if(queryRoute){json(202,await workflow.startQueries(queryRoute[1],input));return;}
      if(url.pathname==='/api/case-spec/check'){const result=validateCaseSpec(input?.spec);json(result.valid?200:422,result);return;}
      if(url.pathname==='/api/provider/prepare'){json(200,prepareProviderRequest(input));return;}
      if(url.pathname==='/api/pilot/preflight'){json(200,await workflow.preflight(input));return;}
      if(url.pathname==='/api/pilot/start'){json(202,await workflow.start(input));return;}
      const result = await createScaffold(input, runsDirectory);
      json(201, result);
    } catch (error) {
      if (error instanceof InputError) json(422, { error: error.message, fields: error.errors });
      else if(error.statusCode)json(error.statusCode,{error:error.message,...(error.preflight?{preflight:error.preflight}:{})});
      else json(500, { error: 'Could not complete the request. Check workspace permissions and free space. Any partial run is retained; nothing was overwritten.' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4310);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  const access=workspaceAccess(process.env,port);
  createServer({access}).listen(port,access.listenHost,()=>console.log(`Workspace: ${access.url}\nCase generation ${process.env.MIT8103_PILOT_ACCOUNT?'enabled for the configured account':'disabled'}.`));
}
