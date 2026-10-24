import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {runHospitalPostgresPilot} from '../lib/postgres-pilot.mjs';

const args=process.argv.slice(2),index=args.indexOf('--spec');
try{
  if(!args.includes('--allow-live')||index<0||!args[index+1])throw new Error('Use --spec PATH --allow-live to run the isolated hospital pilot.');
  const text=await readFile(args[index+1],'utf8');if(Buffer.byteLength(text)>100000)throw new Error('Specification is too large.');
  const report=await runHospitalPostgresPilot(JSON.parse(text),fileURLToPath(new URL('../runs/',import.meta.url)));
  console.log(JSON.stringify(report,null,2));if(report.status!=='passed')process.exitCode=1;
}catch(error){console.error(error.message);process.exitCode=1;}
