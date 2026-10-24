import {readdir,readFile,realpath,mkdir,copyFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {validateInput} from '../shared.mjs';

// Copy only submission-style output. Never copy AI diagnostics, credentials or Git metadata.
export async function preparePortfolioExport(root,runId){
  const runs=path.join(root,'runs'),candidates=[];
  for(const name of await readdir(runs)){
    if(!/^case-run-[a-f0-9-]{36}$/.test(name)||(runId&&name!=='case-run-'+runId))continue;
    try{const job=JSON.parse(await readFile(path.join(runs,name,'Workflow.json'),'utf8'));if(job.status==='complete'&&job.outputDirectory)candidates.push({job,directory:path.join(runs,name)});}catch{}
  }
  candidates.sort((a,b)=>String(b.job.finishedAt).localeCompare(String(a.job.finishedAt)));if(!candidates.length)throw new Error('Generate a successful case first.');
  const {job,directory}=candidates[0];if(job.portfolio4?.status==='running')throw new Error('Wait for Portfolio 4 to finish before saving.');if(job.portfolio3?.status==='running')throw new Error('Wait for Portfolio 3 to finish before saving.');if(job.portfolio2?.status==='running')throw new Error('Wait for Portfolio 2 to finish before saving.');if(typeof job.prefix!=='string'||/[\/\\]/.test(job.prefix))throw new Error('Invalid portfolio prefix.');
  const source=await realpath(job.outputDirectory),allowed=await realpath(directory),runsReal=await realpath(runs);
  if(!allowed.startsWith(runsReal+path.sep))throw new Error('Run directory is outside this workspace.');
  if(!source.startsWith(allowed+path.sep))throw new Error('Saved output is outside its run.');
  const manifest=JSON.parse(await readFile(path.join(source,job.prefix+'_RunManifest.json'),'utf8'));
  if(validateInput(manifest.input).prefix!==job.prefix)throw new Error('The saved name/ID prefix is inconsistent.');
  const destination=path.join(root,job.prefix);const files=[];
  async function copy(relative=''){
    for(const name of await readdir(path.join(source,relative))){
      const from=path.join(source,relative,name),info=await lstat(from);if(info.isSymbolicLink())throw new Error('Symbolic links are not exported.');
      const rel=path.join(relative,name),to=path.join(destination,rel);
      if(info.isDirectory()){
        try{const target=await lstat(to);if(target.isSymbolicLink()||!target.isDirectory())throw new Error('Unsafe export destination.');}catch(error){if(error.code!=='ENOENT')throw error;}
        await mkdir(to,{recursive:true,mode:0o700});await copy(rel);
      }
      else if(info.isFile()){
        if(!name.startsWith(job.prefix+'_')||! /\.(md|json|sql|js|html|svg|mmd|log|txt|png|jpe?g|pdf)$/.test(name))throw new Error('Unexpected file in portfolio output: '+name);
        try{const target=await lstat(to);if(target.isSymbolicLink()||!target.isFile())throw new Error('Unsafe export file destination.');}catch(error){if(error.code!=='ENOENT')throw error;}
        await copyFile(from,to);files.push(path.join(job.prefix,rel));
      }
    }
  }
  try{const existing=await lstat(destination);if(existing.isSymbolicLink()||!existing.isDirectory())throw new Error('The destination is not a portfolio directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(destination,{recursive:true,mode:0o700});await copy();return {prefix:job.prefix,title:job.title,files,destination};
}
