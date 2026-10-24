import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,readdir,lstat,realpath,access} from 'node:fs/promises';
import path from 'node:path';
import {validateInput,portfolios} from '../shared.mjs';
const run=promisify(execFile);
const validId=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export async function githubEnvironment(root){
 const env={...process.env},dir=path.join(root,'.workspace-state','github');
 try{await access(path.join(dir,'hosts.yml'));env.GH_CONFIG_DIR=dir;delete env.GH_TOKEN;delete env.GITHUB_TOKEN;}catch{}
 return env;
}
export async function inspectGithub(root){
 try{
  const env=await githubEnvironment(root),user=JSON.parse((await run('gh',['api','user'],{env,timeout:15000,maxBuffer:30000})).stdout);
  const needsLogin=process.env.CODESPACES==='true'&&env.GH_CONFIG_DIR!==path.join(root,'.workspace-state','github')&&Boolean(env.GITHUB_TOKEN||env.GH_TOKEN);
  return{verified:!needsLogin,login:user.login,message:needsLogin?'Connect GitHub once to allow private repository creation.':'GitHub connected as '+user.login+'.'};
 }catch{return{verified:false,message:'Connect GitHub once to create your private portfolio repository.'};}
}
const fail=message=>Object.assign(new Error(message),{statusCode:409});
export function createPortfolioRepository(root,{command=run,environment=()=>githubEnvironment(root)}={}){
 const gh=async(args,options={})=>command('gh',args,{cwd:root,env:await environment(),timeout:60000,maxBuffer:100000,...options});
 const git=async(directory,args)=>command('git',['-c','core.hooksPath=/dev/null','-c','credential.helper=','-c','credential.helper=!gh auth git-credential',...args],{cwd:directory,env:await environment(),timeout:60000,maxBuffer:100000});
 async function ensure(raw,id){
  const input=validateInput(raw);
  if(!validId.test(id)||!/^[-A-Za-z0-9_]{1,100}$/.test(input.prefix))throw fail('Use names and a student ID that form a GitHub repository name of up to 100 characters (letters, digits, underscores and hyphens).');
  let user;try{user=JSON.parse((await gh(['api','user'])).stdout);}catch{throw fail('Connect GitHub before creating your portfolio.');}
  const fullName=user.login+'/'+input.prefix,endpoint='repos/'+fullName;
  let repo,created=false;
  try{repo=JSON.parse((await gh(['api',endpoint])).stdout);}catch(error){
   if(!String(error.stderr||error.message).includes('404'))throw fail('GitHub could not check the repository. Check your connection and sign-in.');
   try{repo=JSON.parse((await gh(['api','user/repos','--method','POST','-f','name='+input.prefix,'-F','private=true','-f','description=MIT 8103 database portfolio'])).stdout);created=true;}
   catch{throw fail('GitHub could not create your private repository. Connect GitHub with permission to create repositories, then retry.');}
  }
  if(repo.owner?.login?.toLowerCase()!==user.login.toLowerCase()||repo.private!==true||repo.archived)throw fail('The named repository must be private, active and owned by your signed-in GitHub account.');
  const storage=path.join(root,'.workspace-state','repositories');await mkdir(storage,{recursive:true,mode:0o700});
  const directory=path.join(storage,id);
  try{await lstat(directory);}catch(error){if(error.code!=='ENOENT')throw error;await git(storage,['clone','--',`https://github.com/${fullName}.git`,id]);}
  try{await git(directory,['rev-parse','--verify','HEAD']);}catch{try{await git(directory,['rev-parse','--verify','origin/main']);await git(directory,['switch','--track','origin/main']);}catch{/* An empty new repository has no branch yet. */}}
  if((await lstat(directory)).isSymbolicLink())throw fail('Unsafe repository working directory.');
  const origin=(await git(directory,['config','--get','remote.origin.url'])).stdout.trim();
  if(origin!==`https://github.com/${fullName}.git`)throw fail('The saved repository belongs to a different portfolio.');
  const identityName=input.prefix+'_PortfolioIdentity.json';let identity;
  try{identity=JSON.parse(await readFile(path.join(directory,identityName),'utf8'));}catch{}
  const meaningful=(await readdir(directory)).filter(n=>n!=='.git');
  if(meaningful.length&&(!identity||identity.runId!==id||identity.prefix!==input.prefix))throw fail('A repository with this name already contains other work. It has been left untouched. Reopen its original saved run or use the correct student details.');
  await git(directory,['config','user.name',user.name||user.login]);await git(directory,['config','user.email',`${user.id}+${user.login}@users.noreply.github.com`]);
  if(!identity){
   await writeFile(path.join(directory,identityName),JSON.stringify({version:1,runId:id,prefix:input.prefix,createdAt:new Date().toISOString()},null,2)+'\n');
   for(const [i,[folder,title]]of portfolios.entries()){await mkdir(path.join(directory,folder),{recursive:true});await writeFile(path.join(directory,folder,`${input.prefix}_P${i+1}_README.md`),`# ${title}\n\nPending execution.\n`);}
   await writeFile(path.join(directory,input.prefix+'_README.md'),`# ${input.firstName} ${input.surname} — MIT 8103\n\nStudent ID: ${input.studentId}\n\n${input.caseStudy}\n\nThe portfolio is being generated. Completed stages will appear in the commit history.\n`);
   await writeFile(path.join(directory,'README.md'),await readFile(path.join(directory,input.prefix+'_README.md')));
   await git(directory,['add','--all']);await git(directory,['commit','-m','Create named database portfolio and five activity folders']);
  }
  await git(directory,['push','-u','origin','HEAD:main']);
  const sha=(await git(directory,['rev-parse','HEAD'])).stdout.trim();
  return{verified:true,created,url:`https://github.com/${fullName}`,portfolioUrl:`https://github.com/${fullName}`,branch:'main',owner:user.login,name:input.prefix,directory,runId:id,sha};
 }
 async function save(repository,source,prefix,label,{onlyFolders=null}={}){
  if(!repository?.verified||repository.name!==prefix||!validId.test(repository.runId))throw fail('A portfolio repository is required before saving.');
  const expected=path.join(root,'.workspace-state','repositories',repository.runId);
  if(repository.directory!==expected||await realpath(expected)!==path.join(await realpath(root),'.workspace-state','repositories',repository.runId))throw fail('Unsafe portfolio repository.');
  const directory=expected;
  // Fetch first. Never overwrite edits pushed by a student while generation is running.
  await git(directory,['fetch','origin','main']);
  const head=(await git(directory,['rev-parse','HEAD'])).stdout.trim(),remote=(await git(directory,['rev-parse','origin/main'])).stdout.trim();
  if(head!==remote){
   let ancestor=true;try{await git(directory,['merge-base','--is-ancestor',remote,head]);}catch{ancestor=false;}
   if(!ancestor)throw fail('The portfolio was edited on GitHub during generation. Your edits are safe. Resolve the repository changes before continuing.');
  }
  const files=[];
  async function copy(relative=''){
   for(const name of await readdir(path.join(source,relative))){
    const rel=path.join(relative,name),from=path.join(source,rel),info=await lstat(from);
    if(info.isSymbolicLink())throw fail('Symbolic links cannot be saved to the portfolio.');
    if(info.isDirectory()){
     if(!relative&&!portfolios.some(([folder])=>folder===name))throw fail('Unexpected portfolio directory.');
     if(!relative&&onlyFolders&&!onlyFolders.includes(name))continue;
     const target=path.join(directory,rel);try{if(!(await lstat(target)).isDirectory()||(await lstat(target)).isSymbolicLink())throw fail('Unsafe export directory.');}catch(e){if(e.code!=='ENOENT')throw e;}
     await mkdir(target,{recursive:true});await copy(rel);
    }else if(info.isFile()){
     if(!relative&&onlyFolders)continue;
     if(!name.startsWith(prefix+'_')||! /\.(md|json|sql|js|html|svg|mmd|log|txt|png|jpe?g|pdf)$/.test(name))throw fail('Unexpected portfolio file: '+name);
     const target=path.join(directory,rel);try{if((await lstat(target)).isSymbolicLink())throw fail('Unsafe export file.');}catch(e){if(e.code!=='ENOENT')throw e;}
     const bytes=await readFile(from);await writeFile(target,bytes);files.push(rel);
     if(!relative&&name===prefix+'_README.md'){const readme=path.join(directory,'README.md');try{if((await lstat(readme)).isSymbolicLink())throw fail('Unsafe repository README.');}catch(e){if(e.code!=='ENOENT')throw e;}await writeFile(readme,bytes);files.push('README.md');}
    }
   }
  }
  await copy();
  // Only generated paths are staged; no generator sources, credentials or diagnostics.
  if(files.length)await git(directory,['add','--',...files]);
  let changed=false;try{await git(directory,['diff','--cached','--quiet']);}catch{changed=true;}
  if(changed)await git(directory,['commit','-m',label]);
  await git(directory,['push','origin','HEAD:main']);
  const sha=(await git(directory,['rev-parse','HEAD'])).stdout.trim();
  return{sha,stage:label,savedAt:new Date().toISOString(),url:repository.url+'/commit/'+sha,files:files.length};
 }
 return{ensure,save};
}
