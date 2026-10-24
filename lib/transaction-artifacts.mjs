import {copyFile,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

export const transactionFiles={
 'commit-rollback':['CommitRollback.html','View Portfolio 3 commit and rollback',true],
 concurrency:['Concurrency.html','View Portfolio 3 concurrency comparison',true],
 'transaction-setup':['Setup.sql','Portfolio 3 temporary helper setup'],
 'transaction-sql':['CommitRollback.sql','Commit and rollback SQL'],
 'concurrency-sql':['Concurrency.sql','Two-session concurrency SQL'],
 'transaction-results':['Results.json','Actual transaction and concurrency values'],
 blocking:['Blocking.json','Actual waiting session and blocker'],
 'transaction-report':['Report.json','Portfolio 3 execution report'],
 'transaction-analysis':['Analysis.md','Portfolio 3 explanation and references'],
 'session-a-log':['SessionA.log','Actual Session A transcript'],
 'session-b-log':['SessionB.log','Actual Session B transcript'],
 'transaction-setup-log':['DatabaseSetup.log','Portfolio 3 database setup output'],
};

export async function publishTransactionArtifacts(job,result){
  const output=job.public.outputDirectory,prefix=job.public.prefix,folder='portfolio-3-transactions-concurrency';
  const manifestPath=job.artifacts.get('manifest')?.path;if(!manifestPath)throw new Error('Saved progress manifest is missing.');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  if(result.status!=='passed'||result.reviewedFingerprint!==manifest.caseSpecification.reviewedFingerprint)throw new Error('Portfolio 3 does not match the verified case model.');
  const files=[];
  for(const [key,[name,label,primary]] of Object.entries(transactionFiles)){
    const target=path.join(output,folder,key.endsWith('-log')?'logs':'',prefix+'_P3_'+name);
    await copyFile(path.join(result.directory,name),target);files.push({key,path:target,label,primary:Boolean(primary),url:`/api/pilot/jobs/${job.public.id}/files/${key}`});
  }
  for(const stageId of [14,15]){const stage=manifest.stages.find(s=>s.id===stageId);stage.status='complete';stage.evidence=(stageId===14?['CommitRollback.sql','Results.json','CommitRollback.html']:['Concurrency.sql','Blocking.json','Concurrency.html','Report.json']).map(name=>`${folder}/${prefix}_P3_${name}`);}
  manifest.portfolio3={status:'execution_verified',finishedAt:result.finishedAt,checks:result.checks,implementedConcurrencyMethod:'row_lock'};
  manifest.evidence=manifest.evidence.filter(e=>!e.image.includes('_P3_SessionsWaiting')&&!e.image.includes('_P3_ConcurrencyResult'));
  const commitShot=manifest.evidence.find(e=>e.image.endsWith('_P3_CommitRollback.png'));if(commitShot)commitShot.log=`${folder}/${prefix}_P3_Results.json`;
  if(!manifest.evidence.some(e=>e.image.includes('_P3_ConcurrencyComparison.')))manifest.evidence.push({stage:15,status:'pending',image:`${folder}/screenshots/${prefix}_P3_ConcurrencyComparison.png`,log:`${folder}/${prefix}_P3_Blocking.json`,description:'Capture the actual concurrency comparison after execution.'});
  manifest.pending=['Repository and Codespaces verification','Individual review of Portfolios 1–3','Portfolios 4 and 5','Automatic screenshots','Final summary','Personal reflection and review'];
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
  await writeFile(path.join(output,prefix+'_EvidencePlan.md'),'# Screenshot record\n\nScreenshots are pending unless marked captured. Actual session output is saved automatically.\n\n'+manifest.evidence.map(e=>`- ${e.image} — ${e.status}\n  - Matching output: ${e.log}\n  - ${e.description}\n`).join(''),{mode:0o600});
  await writeFile(path.join(output,folder,prefix+'_P3_README.md'),`# ${job.public.title} — Portfolio 3\n\nTransactions and Concurrency (7 marks): successful COMMIT, a failed transaction and explicit ROLLBACK, READ COMMITTED isolation, a lost update and row locking with two actual sessions.\n\nOpen ${prefix}_P3_CommitRollback.html and ${prefix}_P3_Concurrency.html. The analysis, JSON values and Session A/B logs explain the results. No additional AI request was needed.\n\nThe temporary exercise adds ${result.helperField} to the ${result.entity} table. It makes changes easy to observe while preserving the original business columns. This helper is not part of the Portfolio 1 design. The implemented concurrency method is row locking, with actual blocking observed through PostgreSQL. The temporary database is removed afterwards.\n\nTo reproduce, create a fresh PostgreSQL database. Run Portfolio 1 Schema.sql and Seed.sql, then this folder's Setup.sql and CommitRollback.sql in psql. Concurrency.sql contains numbered blocks to follow in two psql terminals; both connect to that same database. Read each terminal label before running its block. The deliberate CHECK error is expected; the script then explicitly rolls back.\n\nOnly two screenshots are suggested. After npm run save, open your named folder and portfolio-3-transactions-concurrency/screenshots in the Codespace Explorer. On macOS use Shift+Command+4; on Windows use Windows+Shift+S. Name the images ${prefix}_P3_CommitRollback.png and ${prefix}_P3_ConcurrencyComparison.png (keep .jpg if that is the original format). Right-click screenshots, choose Upload, select the images, then commit and push through Source Control. Automatic screenshot capture is pending.\n\nReview the generated SQL and interpretation before using them in the assessment.\n`,{mode:0o600});
  await writeFile(path.join(output,prefix+'_README.md'),`# ${job.public.title}\n\nPortfolios 1–3 have generated files and actual PostgreSQL verification ready for individual review. Portfolio 3 includes commit, rollback, visibility and two-session concurrency evidence.\n\nPortfolios 4 and 5, automatic screenshots, the final summary and personal reflection remain pending. Generation does not submit the assessment. After review, npm run save commits and pushes the named output to your repository.\n`,{mode:0o600});
  return {files,stages:manifest.stages};
}
