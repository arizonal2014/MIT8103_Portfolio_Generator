import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access,readdir,readFile,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const run=promisify(execFile);
const bundledCopilot=async()=>{try{await access(fileURLToPath(new URL('../node_modules/.bin/copilot',import.meta.url)),constants.X_OK);return{installed:true};}catch{return{installed:false};}};
export async function inspectRuntime({command=run,provider=bundledCopilot}={}){
 const checks=await Promise.allSettled([
  command('docker',['info','--format','{{.ServerVersion}}'],{timeout:12000,maxBuffer:2000}),provider(),
 ]);
 if(checks[0].status!=='fulfilled')return{ready:false,message:'Docker is not ready. Start Docker Desktop locally, or wait for Codespaces setup to finish, then try again.'};
 if(checks[1].status!=='fulfilled'||!checks[1].value.installed)return{ready:false,message:'Copilot is not installed in this workspace. Run npm run setup:workspace, then try again.'};
 return{ready:true,message:'Database runtime and Copilot command are available. Copilot sign-in and remaining allowance are checked when generation runs.'};
}

export const legacyCopilotFailureMessage='Copilot sign-in failed. Reconnect the same GitHub account, then retry this saved run.';
export const unclassifiedCopilotFailureMessage='Copilot sign-in or access could not be verified. Check Copilot access first; reconnect GitHub only if the credentials were rejected.';
const accessDenied=/access denied|access is blocked|access was denied|policy settings|policy denied|restricted Copilot|Copilot (?:CLI )?policy|Copilot licen[cs]e|Copilot subscription|\b403\b|\bforbidden\b/i;
const allowanceLimited=/quota|allowance|credit|rate.?limit|\b429\b|premium requests|exhaust/i;

export function recoveryAdvice(message=''){
 if(/edited on GitHub|Resolve the repository|non-fast-forward|diverg/i.test(message))return{action:'resolve',hint:'Your GitHub edits are safe. Open the repository and resolve the changes before retrying. Do not delete your repository.'};
 if(allowanceLimited.test(message))return{action:'retry',hint:'Check your Copilot allowance or wait for the limit to reset. Then retry here; completed stages stay saved.'};
 if(message===legacyCopilotFailureMessage||message===unclassifiedCopilotFailureMessage)return{action:'copilot-settings',hint:'Check Copilot access first in the same GitHub account. This older error did not distinguish access restrictions from rejected credentials. Reconnect GitHub only for rejected credentials, then use Retry remaining stages. Keep this Codespace and repository.'};
 if(accessDenied.test(message))return{action:'copilot-settings',hint:'Open Copilot settings in the same GitHub account used here. Check your plan and CLI access; ask your administrator if access is managed. Once access is enabled, use Retry remaining stages. Keep this Codespace and repository.'};
 if(/sign.?in|authenticat|credentials were rejected|\b401\b|permission|connect GitHub|reconnect.*GitHub|account.*match/i.test(message))return{action:'connect',hint:'Reconnect the same GitHub account, then retry this run. Its completed stages stay saved.'};
 if(/docker|daemon|container.*start|runtime.*unavailable/i.test(message))return{action:'retry',hint:'Start Docker Desktop locally, or wait for Codespaces setup. Then retry this run.'};
 if(/space|ENOSPC|disk full/i.test(message))return{action:'retry',hint:'Free workspace storage, then retry. Keep the existing run folder and repository.'};
 return{action:'retry',hint:'Retry this saved run. Completed stages and commits stay saved. If it fails again, expand the failed stage to see its message.'};
}

// Only a short category reaches the UI. Raw provider diagnostics remain private.
export function providerFailureMessage(status,text=''){
 if(!['provider_failed','timed_out'].includes(status))return 'The generated response did not pass validation. Retry this saved run; no unverified result is marked complete.';
 if(allowanceLimited.test(text))return 'Copilot allowance or rate limit reached. Check your allowance, then retry this saved run.';
 if(accessDenied.test(text))return 'Copilot access was denied. Check your Copilot plan or organisation policy settings before retrying this saved run.';
 if(/unauthori[sz]ed|authentication|not authenticated|sign.?in|\b401\b|invalid token/i.test(text))return 'Copilot credentials were rejected. Reconnect the same GitHub account, then retry this saved run.';
 if(/ECONN|ENOTFOUND|EAI_AGAIN|network|fetch failed|connection reset/i.test(text))return 'Copilot could not connect. Check your connection, then retry this saved run.';
 if(status==='timed_out')return 'The Copilot request timed out. Retry this saved run; earlier completed stages stay saved.';
 return status==='provider_failed'?'Copilot could not complete the request. Retry this saved run.':'The generated response did not pass validation. Retry this saved run; no unverified result is marked complete.';
}

// Older runs saved the same sign-in message for policy and credential failures.
// Reclassify from their existing private diagnostics without making a new request.
export async function recoverSavedProviderFailure(directory){
 const saved=[];
 const boundedText=async(file,limit)=>{const info=await lstat(file);if(!info.isFile()||info.size>limit||await realpath(file)!==file)throw Error('Unsafe diagnostic file');return readFile(file,'utf8');};
 let names;try{names=await readdir(directory);}catch{return null;}
 for(const name of names){
  if(!/^copilot-probe-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(name))continue;
  try{
   const probe=path.join(directory,name);if(!(await lstat(probe)).isDirectory())continue;
   const report=JSON.parse(await boundedText(path.join(probe,'report.json'),100000)),time=Date.parse(report.finishedAt);
   if(report.provider!=='copilot'||report.kind!=='live_cli_probe'||!Number.isFinite(time))continue;
   saved.push({probe,report,time});
  }catch{/* Ignore incomplete or unsafe records. */}
 }
 saved.sort((a,b)=>b.time-a.time);const latest=saved[0];
 if(!latest||!['provider_failed','timed_out'].includes(latest.report.status))return null;
 try{
  const diagnostic=await boundedText(path.join(latest.probe,'diagnostic.txt'),600000);
  let output='';try{output=await boundedText(path.join(latest.probe,'response.txt'),600000);}catch{}
  return providerFailureMessage(latest.report.status,diagnostic+'\n'+output);
 }catch{return null;}
}
