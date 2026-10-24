import {copyFile,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

export const mongoFiles={
 'mongo-model':['DocumentModel.html','View Portfolio 4 MongoDB document model',true],
 'mongo-results':['MongoDBResults.html','View Portfolio 4 MongoDB results',true],
 'mongo-script':['Execute.js','MongoDB insert, query and validation script'],
 'mongo-documents':['Documents.json','Sample documents (Extended JSON)'],
 'mongo-model-data':['Model.json','Document model and validator'],
 'mongo-query-definitions':['QueryDefinitions.json','MongoDB query definitions'],
 'mongo-result-data':['Results.json','Actual MongoDB documents and query results'],
 'mongo-report':['Report.json','Portfolio 4 execution report'],
 'mongo-analysis':['Analysis.md','Portfolio 4 explanation and references'],
 'mongo-execution-log':['Execution.log','Actual mongosh output'],
 'mongo-server-log':['MongoDBServer.log','MongoDB startup and server output'],
};

export async function publishMongoArtifacts(job,result){
  const output=job.public.outputDirectory,prefix=job.public.prefix,folder='portfolio-4-nosql';
  const manifestPath=job.artifacts.get('manifest')?.path;if(!manifestPath)throw new Error('Saved progress manifest is missing.');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  if(result.status!=='passed'||result.reviewedFingerprint!==manifest.caseSpecification.reviewedFingerprint)throw new Error('Portfolio 4 does not match the verified case model.');
  const files=[];
  for(const [key,[name,label,primary]] of Object.entries(mongoFiles)){
    const target=path.join(output,folder,key.endsWith('-log')?'logs':'',prefix+'_P4_'+name);
    await copyFile(path.join(result.directory,name),target);files.push({key,path:target,label,primary:Boolean(primary),url:`/api/pilot/jobs/${job.public.id}/files/${key}`});
  }
  for(const stageId of [16,17]){const stage=manifest.stages.find(s=>s.id===stageId);stage.status='complete';stage.evidence=(stageId===16?['Report.json']:['Model.json','Documents.json','Execute.js','Results.json','MongoDBResults.html']).map(name=>`${folder}/${prefix}_P4_${name}`);}
  manifest.portfolio4={status:'execution_verified',finishedAt:result.finishedAt,checks:result.checks};
  manifest.evidence=manifest.evidence.filter(e=>!e.image.includes('_P4_MongoDBConnection')&&!e.image.includes('_P4_DocumentsAndQueries'));
  for(const [label,stage,log] of [['DocumentModel',17,'Model.json'],['MongoDBResults',17,'Results.json']])if(!manifest.evidence.some(e=>e.image.includes('_P4_'+label+'.')))manifest.evidence.push({stage,status:'pending',image:`${folder}/screenshots/${prefix}_P4_${label}.png`,log:`${folder}/${prefix}_P4_${log}`,description:'Capture this actual model/results page after execution.'});
  manifest.pending=['Repository and Codespaces verification','Individual review of Portfolios 1–4','Portfolio 5','Automatic screenshots','Final summary','Personal reflection and review'];
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
  await writeFile(path.join(output,prefix+'_EvidencePlan.md'),'# Screenshot record\n\nScreenshots are pending unless marked captured. Actual database output is saved automatically.\n\n'+manifest.evidence.map(e=>`- ${e.image} — ${e.status}\n  - Matching output: ${e.log}\n  - ${e.description}\n`).join(''),{mode:0o600});
  await writeFile(path.join(output,folder,prefix+'_P4_README.md'),`# ${job.public.title} — Portfolio 4\n\nNoSQL and Advanced Data Models (7 marks): a case-specific document model, actual MongoDB inserts and queries, and an explanation of embedding, references and flexible metadata.\n\nOpen ${prefix}_P4_DocumentModel.html and ${prefix}_P4_MongoDBResults.html. The JSON, mongosh script, analysis and execution log are saved alongside them.\n\nMongoDB ${result.mongoVersion} inserted ${result.checks.insertedDocuments} sample event documents in ${result.collection}. Four query results were checked. Validation rejected a wrong date type and a duplicate event ID. The documents are illustrative events derived from saved case records; their order and timestamps are not inferred business history. No extra AI request was needed.\n\nThe automated app uses a temporary MongoDB 7.0 container in your workspace. Run npm run setup:workspace if the image is missing, then retry. A new Codespace prepares it automatically. The container and its anonymous volumes are removed after the exercise.\n\nTo reproduce, connect mongosh to a fresh empty database and run ${prefix}_P4_Execute.js using --file. It creates the collection once and verifies its inserts/queries. Use a new empty database for another replay. The script also works with MongoDB Atlas or another MongoDB server when you supply that connection to mongosh; the app's automatic route uses its own local container. Connection credentials belong in your own client/session, not in committed files.\n\nOnly two screenshots are suggested. After npm run save, open your named folder and portfolio-4-nosql/screenshots in the Codespace Explorer. On macOS use Shift+Command+4; on Windows use Windows+Shift+S. Name the images ${prefix}_P4_DocumentModel.png and ${prefix}_P4_MongoDBResults.png (keep .jpg for an original JPEG). Right-click screenshots, choose Upload, select the images, then commit and push through Source Control. Automatic screenshot capture is pending.\n\nReview the document choices, sample metadata and explanation before using them in the assessment.\n`,{mode:0o600});
  await writeFile(path.join(output,prefix+'_README.md'),`# ${job.public.title}\n\nPortfolios 1–4 have generated files and actual database verification ready for individual review. Portfolio 4 includes its document model, MongoDB inserts, queries and validation checks.\n\nPortfolio 5, automatic screenshots, the final summary and personal reflection remain pending. Generation does not submit the assessment. After review, npm run save commits and pushes the named output to your repository.\n`,{mode:0o600});
  return {files,stages:manifest.stages};
}
