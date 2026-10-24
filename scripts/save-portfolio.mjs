import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {preparePortfolioExport} from '../lib/save-portfolio.mjs';
const run=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
try{
  const repo=JSON.parse((await run('gh',['repo','view','--json','isTemplate,owner,name,url'],{cwd:root})).stdout);
  const login=(await run('gh',['api','user','--jq','.login'],{cwd:root})).stdout.trim();
  if(repo.isTemplate)throw new Error('Create your own repository from the template before saving.');
  if(repo.owner.login.toLowerCase()!==login.toLowerCase())throw new Error('Save is restricted to your own repository.');
  if((await run('git',['status','--porcelain'],{cwd:root})).stdout.trim())throw new Error('Commit or set aside your current repository edits before exporting a new checkpoint.');
  const output=await preparePortfolioExport(root);
  await run('git',['add','--',output.prefix],{cwd:root});
  let changes=true;try{await run('git',['diff','--cached','--quiet','--',output.prefix],{cwd:root});changes=false;}catch{}
  if(changes)await run('git',['commit','-m','Add verified database portfolio checkpoint','--',output.prefix],{cwd:root,maxBuffer:100000});
  await run('git',['push','origin','HEAD'],{cwd:root,timeout:60000,maxBuffer:100000});
  console.log('Saved your actual checkpoint: '+repo.url+'/tree/main/'+encodeURIComponent(output.prefix));
  console.log('This saves the currently completed work. Remaining assessment stages still need completion and review.');
}catch(error){console.error('Could not save:',error.message);process.exitCode=1;}
