import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {fileURLToPath} from 'node:url';

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

export function recoveryAdvice(message=''){
 if(/edited on GitHub|Resolve the repository|non-fast-forward|diverg/i.test(message))return{action:'resolve',hint:'Your GitHub edits are safe. Open the repository and resolve the changes before retrying. Do not delete your repository.'};
 if(/quota|allowance|credit|rate.?limit|429|premium requests|exhaust/i.test(message))return{action:'retry',hint:'Check your Copilot allowance or wait for the limit to reset. Then retry here; completed stages stay saved.'};
 if(/sign.?in|authenticat|401|403|permission|access denied|connect GitHub|reconnect.*GitHub|account.*match/i.test(message))return{action:'connect',hint:'Reconnect the same GitHub account, then retry this run. Its completed stages stay saved.'};
 if(/docker|daemon|container.*start|runtime.*unavailable/i.test(message))return{action:'retry',hint:'Start Docker Desktop locally, or wait for Codespaces setup. Then retry this run.'};
 if(/space|ENOSPC|disk full/i.test(message))return{action:'retry',hint:'Free workspace storage, then retry. Keep the existing run folder and repository.'};
 return{action:'retry',hint:'Retry this saved run. Completed stages and commits stay saved. If it fails again, expand the failed stage to see its message.'};
}

// Only a short category reaches the UI. Raw provider diagnostics remain private.
export function providerFailureMessage(status,text=''){
 if(!['provider_failed','timed_out'].includes(status))return 'The generated response did not pass validation. Retry this saved run; no unverified result is marked complete.';
 if(/quota|allowance|credit|rate.?limit|429|premium requests|exhaust/i.test(text))return 'Copilot allowance or rate limit reached. Check your allowance, then retry this saved run.';
 if(/unauthori[sz]ed|authentication|not authenticated|sign.?in|401|403|access denied|invalid token/i.test(text))return 'Copilot sign-in failed. Reconnect the same GitHub account, then retry this saved run.';
 if(/ECONN|ENOTFOUND|EAI_AGAIN|network|fetch failed|connection reset/i.test(text))return 'Copilot could not connect. Check your connection, then retry this saved run.';
 if(status==='timed_out')return 'The Copilot request timed out. Retry this saved run; earlier completed stages stay saved.';
 return status==='provider_failed'?'Copilot could not complete the request. Retry this saved run.':'The generated response did not pass validation. Retry this saved run; no unverified result is marked complete.';
}
