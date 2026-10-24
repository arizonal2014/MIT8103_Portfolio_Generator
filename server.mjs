import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScaffold } from './lib/scaffold.mjs';
import { InputError } from './shared.mjs';
import { caseSpecSchema, validateCaseSpec } from './lib/case-spec.mjs';
import { libraryCase, hospitalCase } from './examples/cases.mjs';
import {inspectProviders,prepareProviderRequest}from './lib/providers.mjs';
import {createCaseWorkflow}from './lib/case-workflow.mjs';
import {workspaceAccess}from './lib/workspace-access.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const routes = new Map([
  ['/', ['public/index.html', 'text/html']],
  ['/style.css', ['public/style.css', 'text/css']],
  ['/app.mjs', ['public/app.mjs', 'text/javascript']],
  ['/shared.mjs', ['shared.mjs', 'text/javascript']],
]);
const securityHeaders = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Referrer-Policy': 'no-referrer',
};

export function createServer({ runsDirectory = path.join(root, 'runs'), pilotAccount=process.env.MIT8103_PILOT_ACCOUNT, access=workspaceAccess() } = {}) {
  const workflow=createCaseWorkflow({runsDirectory,account:pilotAccount});
  return http.createServer(async (req, res) => {
    const json = (status, body) => { res.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if(!access.hostAllowed(req.headers.host)){json(403,{error:'Use this workspace\u2019s generator URL.'});return;}
      if(req.method==='GET'&&url.pathname==='/api/health'){json(200,{service:'mit8103-generator',workspace:root+path.sep,pid:process.pid});return;}
      await workflow.ready;
      if(req.method==='GET'&&url.pathname==='/api/pilot/config'){json(200,{enabled:workflow.enabled,account:workflow.account,scenario:'A library borrowing system for members, books, physical copies and loans. Keep borrowing and return history and allow only one open loan per copy.'});return;}
      const jobRoute=url.pathname.match(/^\/api\/pilot\/jobs\/([a-f0-9-]{36})(?:\/files\/([a-z-]+))?$/);
      if(req.method==='GET'&&jobRoute){
        if(!jobRoute[2]){const job=workflow.get(jobRoute[1]);json(job?200:404,job||{error:'Run not found in this server session. Saved files remain on disk.'});return;}
        const artifact=workflow.artifact(jobRoute[1],jobRoute[2]);if(!artifact){json(404,{error:'File not available.'});return;}
        const html=artifact.path.endsWith('.html'),svg=artifact.path.endsWith('.svg');const data=await readFile(artifact.path);
        res.writeHead(200,{...securityHeaders,...(html||svg?{'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}:{}),'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(path.basename(artifact.path))}`,'Content-Type':html?'text/html; charset=utf-8':svg?'image/svg+xml; charset=utf-8':'text/plain; charset=utf-8'});res.end(data);return;
      }
      if(req.method==='GET'&&url.pathname==='/api/case-spec/schema'){json(200,caseSpecSchema);return;}
      if(req.method==='GET'&&url.pathname==='/api/providers'){json(200,await inspectProviders());return;}
      if(req.method==='GET'&&url.pathname==='/api/examples/library'){json(200,libraryCase());return;}
      if(req.method==='GET'&&url.pathname==='/api/examples/hospital'){json(200,hospitalCase());return;}
      if (req.method === 'GET' && routes.has(url.pathname)) {
        const [file, type] = routes.get(url.pathname);
        const data = await readFile(path.join(root, file));
        res.writeHead(200, { ...securityHeaders, 'Content-Type': `${type}; charset=utf-8` }); res.end(data); return;
      }
      if (req.method !== 'POST' || !['/api/scaffold','/api/case-spec/check','/api/provider/prepare','/api/pilot/start'].includes(url.pathname)) { json(404, { error: 'Not found.' }); return; }
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
      if(url.pathname==='/api/case-spec/check'){const result=validateCaseSpec(input?.spec);json(result.valid?200:422,result);return;}
      if(url.pathname==='/api/provider/prepare'){json(200,prepareProviderRequest(input));return;}
      if(url.pathname==='/api/pilot/start'){json(202,await workflow.start(input));return;}
      const result = await createScaffold(input, runsDirectory);
      json(201, result);
    } catch (error) {
      if (error instanceof InputError) json(422, { error: error.message, fields: error.errors });
      else if(error.statusCode)json(error.statusCode,{error:error.message});
      else json(500, { error: 'Could not create the scaffold. Check workspace permissions and free space. Any partial run is retained; nothing was overwritten.' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4310);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  const access=workspaceAccess(process.env,port);
  createServer({access}).listen(port,access.listenHost,()=>console.log(`Workspace: ${access.url}\nCase generation ${process.env.MIT8103_PILOT_ACCOUNT?'enabled for the configured account':'disabled'}.`));
}
