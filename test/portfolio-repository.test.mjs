import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createPortfolioRepository} from '../lib/portfolio-repository.mjs';
const execute=promisify(execFile),id='aaaa1111-1234-1234-1234-123456789abc';
const input={firstName:'Robin',surname:'Test',studentId:'0009',caseStudy:'Library borrowing system.',provider:'copilot'};
async function fixture({existing=false}={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'portfolio-repo-')),remote=path.join(root,'remote.git');await execute('git',['init','--bare',remote]);let created=existing,posts=0;
 const url='https://github.com/fixture/Test_Robin_0009.git';
 const command=async(cmd,args,options)=>{
  if(cmd==='gh'){
   if(args[1]==='user')return{stdout:JSON.stringify({login:'fixture',id:9,name:'Fixture Student'})};
   if(args[1]==='user/repos'){posts++;created=true;return{stdout:JSON.stringify({owner:{login:'fixture'},private:true})};}
   if(!created)throw Object.assign(new Error('HTTP 404'),{stderr:'HTTP 404'});
   return{stdout:JSON.stringify({owner:{login:'fixture'},private:true})};
  }
  return execute(cmd,['-c',`url.${remote}.insteadOf=${url}`,...args],options);
 };
 const repo=createPortfolioRepository(root,{command,environment:async()=>({...process.env})});return{root,remote,repo,posts:()=>posts};
}
test('creates correctly named private repository, clean root and progressive commits',async()=>{
 const {root,remote,repo,posts}=await fixture();const target=await repo.ensure(input,id);assert.equal(target.name,'Test_Robin_0009');assert.equal(posts(),1);
 const source=path.join(root,'output');await mkdir(path.join(source,'portfolio-1-database-design'),{recursive:true});await writeFile(path.join(source,'portfolio-1-database-design','Test_Robin_0009_P1_Schema.sql'),'CREATE TABLE example(id integer primary key);');
 await repo.save(target,source,target.name,'Add database design',{onlyFolders:['portfolio-1-database-design']});
 await writeFile(path.join(source,'Test_Robin_0009_FinalSummary.md'),'# Library\n');await repo.save(target,source,target.name,'Add final summary');
 const files=(await execute('git',['--git-dir',remote,'ls-tree','-r','--name-only','main'])).stdout;assert.match(files,/^portfolio-1-database-design\/Test_Robin_0009_P1_Schema.sql/m);assert.doesNotMatch(files,/^Test_Robin_0009\//m);assert.doesNotMatch(files,/package.json|server.mjs/);
 const commits=(await execute('git',['--git-dir',remote,'log','main','--format=%s'])).stdout.trim().split('\n');assert.deepEqual(commits,['Add final summary','Add database design','Create named database portfolio and five activity folders']);
});
test('same run resumes without adding a fake setup commit',async()=>{const{repo,posts}=await fixture();const one=await repo.ensure(input,id),two=await repo.ensure(input,id);assert.equal(one.sha,two.sha);assert.equal(posts(),1);});
test('repository collision leaves the existing work untouched',async()=>{const{repo,remote}=await fixture();await repo.ensure(input,id);await assert.rejects(repo.ensure(input,'bbbb1111-1234-1234-1234-123456789abc'),/other work/);assert.equal((await execute('git',['--git-dir',remote,'rev-list','--count','main'])).stdout.trim(),'1');});
test('malformed naming is rejected before contacting GitHub',async()=>{const{repo}=await fixture();await assert.rejects(repo.ensure({...input,surname:'Ändersson'},id),/repository name/);});
test('a symbolic source cannot enter the assessment repository',async()=>{const{repo,root}=await fixture();const target=await repo.ensure(input,id);const source=path.join(root,'output');await mkdir(source);await writeFile(path.join(root,'secret'),'private');await symlink(path.join(root,'secret'),path.join(source,'Test_Robin_0009_Readme.md'));await assert.rejects(repo.save(target,source,target.name,'Save'),/Symbolic links/);});

test('remote student edits stop an export instead of overwriting their changes',async()=>{
 const{root,remote,repo}=await fixture();const target=await repo.ensure(input,id),other=path.join(root,'student-copy');await execute('git',['clone','--branch','main',remote,other]);
 await execute('git',['config','user.name','Student'],{cwd:other});await execute('git',['config','user.email','student@example.invalid'],{cwd:other});await writeFile(path.join(other,'Test_Robin_0009_FinalSummary.md'),'My individual edits');await execute('git',['add','.'],{cwd:other});await execute('git',['commit','-m','Write my reflection'],{cwd:other});await execute('git',['push','origin','HEAD:main'],{cwd:other});
 const source=path.join(root,'output');await mkdir(source);await writeFile(path.join(source,'Test_Robin_0009_FinalSummary.md'),'generated');await assert.rejects(repo.save(target,source,target.name,'Save'),/edited on GitHub/);
 assert.equal((await execute('git',['--git-dir',remote,'show','main:Test_Robin_0009_FinalSummary.md'])).stdout,'My individual edits');
});

test('cleanup removes old diagnostics through an ordinary commit and keeps history',async()=>{
 const{repo,root,remote}=await fixture(),target=await repo.ensure(input,id);
 await writeFile(path.join(target.directory,'Test_Robin_0009_RunManifest.json'),'private internal state');await execute('git',['add','.'],{cwd:target.directory});await execute('git',['commit','-m','Older export with diagnostic'],{cwd:target.directory});
 const source=path.join(root,'output');await mkdir(source);await writeFile(path.join(source,'Test_Robin_0009_README.md'),'# Clean assessment');await repo.save(target,source,target.name,'Clean assessment export');
 const files=(await execute('git',['--git-dir',remote,'ls-tree','-r','--name-only','main'])).stdout;assert.doesNotMatch(files,/\.json$/m);assert.doesNotMatch(files,/^Test_Robin_0009_README.md/m);assert.match(files,/README.md/);const history=(await execute('git',['--git-dir',remote,'log','main','--format=%s'])).stdout;assert.match(history,/Older export with diagnostic/);assert.equal((await repo.ensure(input,id)).sha.length,40);
});
