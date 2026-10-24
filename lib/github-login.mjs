import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
// Device sign-in stays in GitHub's own browser page; credentials never enter this form.
export function createGithubLogin(root,{spawnProcess=spawn}={}){
 let state={status:'idle'},child=null;
 function start(){
  if(child||state.status==='starting')return {...state};
  state={status:'starting',message:'Starting GitHub sign-in…'};
  const config=path.join(root,'.workspace-state','github');
  mkdir(config,{recursive:true,mode:0o700}).then(()=>{
   const env={...process.env,GH_CONFIG_DIR:config,BROWSER:'echo',GH_BROWSER:'echo',GH_PROMPT_DISABLED:'1'};delete env.GH_TOKEN;delete env.GITHUB_TOKEN;
   child=spawnProcess('gh',['auth','login','--hostname','github.com','--git-protocol','https','--web','--scopes','repo'],{cwd:root,env,stdio:['pipe','pipe','pipe']});
   let received='';const onData=data=>{received=(received+data.toString()).slice(-8000);const code=received.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/);if(code)state={status:'waiting',code:code[0],url:'https://github.com/login/device',message:'Open GitHub, enter this code and approve repository access.'};};
   child.stdout.on('data',onData);child.stderr.on('data',onData);child.stdin.end('\n');
   const timer=setTimeout(()=>child?.kill('SIGTERM'),600000);timer.unref();
   child.on('error',()=>{clearTimeout(timer);child=null;state={status:'failed',message:'GitHub CLI could not start. Check the workspace setup.'};});
   child.on('close',code=>{clearTimeout(timer);child=null;state=code===0?{status:'complete',message:'GitHub connected. You can create your portfolio.'}:{status:'failed',message:'Sign-in did not finish. Try connecting again.'};});
  }).catch(()=>{state={status:'failed',message:'Could not prepare GitHub sign-in.'};});
  return {...state};
 }
 return{start,status:()=>({...state})};
}
