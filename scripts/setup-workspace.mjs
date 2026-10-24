import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
try{
  console.log('Installing the generator dependencies…');await run('npm',['ci'],{timeout:300000,maxBuffer:1000000});
  console.log('Preparing the temporary database runtime…');let ready=false;
  for(let i=0;i<30;i++){try{await run('docker',['info','--format','{{.ServerVersion}}'],{timeout:5000,maxBuffer:10000});ready=true;break;}catch{await new Promise(r=>setTimeout(r,2000));}}
  if(!ready)throw new Error('Docker did not start. Rebuild the Codespace container, then run npm run setup:workspace.');
  try{await run('docker',['image','inspect','postgres:17-alpine'],{timeout:10000,maxBuffer:100000});}catch{await run('docker',['pull','postgres:17-alpine'],{timeout:300000,maxBuffer:1000000});}
  console.log('Setup complete. The app starts automatically. To start it again, run: npm run workspace');
}catch(error){console.error('Setup could not finish:',error.message);process.exitCode=1;}
