import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,open} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {workspaceAccess} from '../lib/workspace-access.mjs';
const run=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||4310),access=workspaceAccess(process.env,port);
const health=async()=>{try{const r=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1500)});const d=await r.json();return d.service==='mit8103-generator'&&d.workspace===root?d:null;}catch{return null;}};
try{
  if(await health()){console.log('Generator is already running: '+access.url);process.exit(0);}
  let account=process.env.MIT8103_PILOT_ACCOUNT;
  if(!account){try{account=(await run('gh',['api','user','--jq','.login'],{timeout:10000,maxBuffer:10000})).stdout.trim();}catch{console.log('GitHub sign-in is unavailable. The app will open with live generation disabled.');}}
  if(account&&!/^[a-z\d][a-z\d-]{0,38}$/i.test(account))throw new Error('Could not identify the signed-in GitHub account.');
  const state=path.join(root,'.workspace-state');await mkdir(state,{recursive:true,mode:0o700});const log=await open(path.join(state,'server.log'),'a',0o600);
  const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env:{...process.env,...(account?{MIT8103_PILOT_ACCOUNT:account}:{})},detached:true,stdio:['ignore',log.fd,log.fd]});child.unref();await log.close();
  for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,500));if(await health()){console.log('Open your generator: '+access.url);console.log('Use your own case study. Keep the forwarded port Private.');process.exit(0);}}
  throw new Error('App did not start. Read .workspace-state/server.log or run npm start in the terminal.');
}catch(error){console.error(error.message);process.exitCode=1;}
