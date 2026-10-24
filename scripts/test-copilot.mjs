import {runCopilotProbe}from '../lib/copilot-probe.mjs';
const args=process.argv.slice(2);
const accountIndex=args.indexOf('--account');
try{
  const report=await runCopilotProbe({
    account:accountIndex>=0?args[accountIndex+1]:undefined,
    allowLive:args.includes('--allow-live'),
    caseStudy:'A small hospital appointment system using fictional patients, doctors, fixed appointment slots and bookings. A slot allows one active booking; cancelled bookings remain in history. No diagnoses, payments or real patient data.',
  });
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='validated')process.exitCode=1;
}catch(error){console.error('Copilot test could not start:',error.message);process.exitCode=1;}
