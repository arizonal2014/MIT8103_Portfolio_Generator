import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPortfolioRepository} from '../lib/portfolio-repository.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
try{
 const args=process.argv.slice(2);if(args.length&&(args.length!==2||args[0]!=='--run'||!/^[a-f0-9-]{36}$/.test(args[1])))throw new Error('Use npm run save -- --run RUN_ID.');
 const candidates=[];for(const name of await readdir(path.join(root,'runs'))){if(!/^case-run-[a-f0-9-]{36}$/.test(name)||(args[1]&&name!=='case-run-'+args[1]))continue;try{const dir=path.join(root,'runs',name),state=JSON.parse(await readFile(path.join(dir,'Guided.json'))),job=JSON.parse(await readFile(path.join(dir,'Workflow.json')));if(state.status==='complete'&&state.repository?.verified)candidates.push({state,job,dir});}catch{}}
 candidates.sort((a,b)=>String(b.state.finishedAt).localeCompare(String(a.state.finishedAt)));if(!candidates.length)throw new Error('Complete a portfolio in the three-step flow first.');
 const {state,job,dir}=candidates[0];if(state.finish?.exportVersion!==2)throw new Error('Rebuild this older portfolio with the updated generator before saving.');const result=await createPortfolioRepository(root).save(state.repository,state.finish.submissionDirectory,job.prefix,'Update verified portfolio files');
 if(!state.checkpoints.some(c=>c.sha===result.sha))state.checkpoints.push(result);await writeFile(path.join(dir,'Guided.json'),JSON.stringify(state,null,2)+'\n');
 console.log('Saved portfolio: '+state.repository.url);
}catch(error){console.error('Could not save:',error.message);process.exitCode=1;}
