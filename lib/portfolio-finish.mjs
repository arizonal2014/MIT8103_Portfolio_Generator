import {readFile,writeFile,mkdir,readdir,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';
import {zipSync} from 'fflate';
import {escapeHTML as h,evidencePage} from './postgres-case.mjs';

const p5folder='portfolio-5-distributed-cloud';
export const finishFiles={
 'distributed-design':[p5folder,'P5_ProposedDesign.html','Portfolio 5: proposed distributed design',true],
 'distributed-notes':[p5folder,'P5_Discussion.md','Portfolio 5 explanation and references'],
 'summary':['','Summary.pdf','Download three-page summary',true],
 'summary-preview':['','Summary.html','Read summary',true],
 'quick-guide':['','QuickGuide.md','What happened and why',true],
 'ai-declaration':['','AIUseDeclaration.md','AI-use declaration'],
 'reflection':['','Reflection.md','Personal reflection'],
};
const references=[
 ['PostgreSQL: constraints','https://www.postgresql.org/docs/17/ddl-constraints.html'],
 ['PostgreSQL: EXPLAIN','https://www.postgresql.org/docs/17/using-explain.html'],
 ['PostgreSQL: isolation','https://www.postgresql.org/docs/17/transaction-iso.html'],
 ['PostgreSQL: row locks','https://www.postgresql.org/docs/17/explicit-locking.html'],
 ['MongoDB: data modelling','https://www.mongodb.com/docs/manual/data-modeling/'],
 ['MongoDB: replication','https://www.mongodb.com/docs/manual/replication/'],
 ['MongoDB: sharding','https://www.mongodb.com/docs/manual/sharding/'],
];
export function distributedDesign(spec){
 if(spec.distributed.mode!=='discussion')throw new Error('Only the assessed discussion route is implemented for Portfolio 5.');
 const title=spec.scenario.title,collection=spec.noSql.collection;
 const sections=[
 ['Case and proposed deployment',`${title} keeps its relational records in PostgreSQL. MongoDB stores ${collection}: ${spec.noSql.documentPurpose} Proposed deployment: the application connects to a three-member MongoDB replica set across three availability zones in one region. PostgreSQL also needs its own managed high-availability configuration. These are separate databases; a MongoDB replica set does not replicate PostgreSQL.`],
 ['Replication and availability','One primary accepts writes. Two secondaries copy the oplog asynchronously. If the primary fails, eligible members can elect a replacement when a voting majority is available. Writes can pause during election. A partition without a majority cannot elect a primary. Three containers on one computer would not protect against loss of that computer.'],
 ['Consistency and the case',`For ${collection}, a proposed client policy is majority write concern with a finite timeout, primary reads and majority read concern where committed data is required. Secondary reads can lag. Application retries need an idempotency key so the same event is not recorded twice. PostgreSQL constraints remain authoritative for ${spec.businessRules[0].description} These settings do not create an atomic transaction across PostgreSQL and MongoDB. An outbox and retrying consumer would be a separate implementation.`],
 ['Sharding trade-off',`Sharding partitions documents; replication copies them for availability. The small sample in this portfolio does not need sharding. If ${collection} becomes large, evaluate a high-cardinality source-record identifier as a possible hashed shard key against actual query and write patterns. A time-only increasing key can concentrate new writes, while a hashed key can make time-range queries contact multiple shards. Validate distribution and query plans before choosing a key.`],
 ['Cloud deployment and recovery','A real deployment would use private networking, authentication, least-privilege roles, TLS, monitoring and tested backups. Replication also copies accidental deletions, so it does not replace backups. Availability zones do not provide regional disaster recovery. No cloud service was provisioned and no failover, replication, sharding or recovery experiment was run for this discussion.'],
 ];
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 260" role="img" aria-label="Proposed architecture, not a running deployment"><style>text{font:16px sans-serif;fill:#19313a}rect{fill:#edf5f3;stroke:#166875;stroke-width:2}path{fill:none;stroke:#166875;stroke-width:2}</style><text x="25" y="28">PROPOSED ARCHITECTURE — NOT EXECUTED</text><rect x="25" y="100" width="150" height="65" rx="8"/><text x="48" y="139">Application</text><path d="M175 130 H235 M235 130 V65 H290 M235 130 V205 H290"/><rect x="290" y="35" width="230" height="65" rx="8"/><text x="315" y="74">PostgreSQL records</text><rect x="290" y="170" width="170" height="65" rx="8"/><text x="310" y="197">MongoDB primary</text><text x="310" y="218">Zone A</text><path d="M460 202 H530 M530 202 V135 H590 M530 202 V220 H590"/><rect x="590" y="105" width="240" height="65" rx="8"/><text x="610" y="143">Secondary · Zone B</text><rect x="590" y="190" width="240" height="65" rx="8"/><text x="610" y="228">Secondary · Zone C</text></svg>`;
 const markdown=`# ${title} — Portfolio 5\n\nAssessment: Distributed and Cloud Databases (6 marks). This uses the discussion option.\n\n`+sections.map(([t,p])=>`## ${t}\n\n${p}\n`).join('\n')+'\n## References\n\n'+references.slice(-2).map(([t,u])=>`- [${t}](${u})`).join('\n')+'\n';
 const html=evidencePage(title+' — proposed distributed design',`<h1>${h(title)} — Portfolio 5</h1><p class="note">Assessment: Distributed and Cloud Databases (6 marks). Proposed architecture and discussion. No live distributed deployment is claimed.</p>${svg}${sections.map(([t,p])=>`<h2>${h(t)}</h2><p>${h(p)}</p>`).join('')}<h2>References</h2>${references.slice(-2).map(([t,u])=>`<p>${h(t)}: ${h(u)}</p>`).join('')}`);
 return{html,markdown,svg};
}
export function validateReview(raw={}){
 raw=raw||{};
 const reflection=typeof raw.reflection==='string'?raw.reflection.trim():'';
 if(raw.reviewed!==true||reflection.length<80||reflection.length>1800)throw Object.assign(new Error('Add your own reflection (80–1,800 characters) and confirm that you reviewed the files and results.'),{statusCode:422});
 return{reviewed:true,reflection,reviewedAt:new Date().toISOString()};
}
export async function safeOutput(job,runsDirectory){
 const allowed=await realpath(path.join(runsDirectory,'case-run-'+job.id));
 const runs=await realpath(runsDirectory),output=await realpath(job.outputDirectory);
 if(!allowed.startsWith(runs+path.sep)||!output.startsWith(allowed+path.sep)||path.basename(output)!==job.prefix||!job.prefix||/[\/\\]/.test(job.prefix))throw new Error('Unsafe portfolio output location.');
 return output;
}
export async function renderPortfolio({html,pdfPath,screenshots=[]}){
 const browser=await chromium.launch({chromiumSandbox:process.platform==='linux'});
 try{
  const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:1280,height:900},deviceScaleFactor:1});
  await context.route('**/*',route=>route.abort());
  const page=await context.newPage();
  for(const shot of screenshots){await page.setContent(shot.html,{waitUntil:'load'});await page.screenshot({path:shot.path,fullPage:true,animations:'disabled'});}
  await page.setContent(html,{waitUntil:'load'});
  const clipped=await page.locator('article').evaluateAll(nodes=>nodes.some(article=>Array.from(article.children).filter(el=>el.tagName!=='FOOTER').some(el=>el.getBoundingClientRect().bottom>article.querySelector('footer').getBoundingClientRect().top-8)));if(clipped)throw new Error('The summary content exceeds its three-page layout. Shorten the reflection or case description.');
  await page.pdf({path:pdfPath,format:'A4',printBackground:true,preferCSSPageSize:true});
 }finally{await browser.close();}
 const pdf=await PDFDocument.load(await readFile(pdfPath));if(pdf.getPageCount()!==3)throw new Error(`The summary has ${pdf.getPageCount()} pages; expected exactly three. Shorten the case text and regenerate.`);
 return{pages:3};
}
const digest=data=>createHash('sha256').update(data).digest('hex');
export async function archivePortfolio(output,prefix,zipPath){
 const entries={};let total=0;
 async function walk(relative=''){
  for(const name of await readdir(path.join(output,relative))){
   const absolute=path.join(output,relative,name),info=await lstat(absolute),rel=path.join(relative,name);
   if(info.isSymbolicLink())throw new Error('Symbolic links cannot enter the download.');
   if(info.isDirectory()){await walk(rel);continue;}
   if(!info.isFile()||!name.startsWith(prefix+'_')||! /\.(md|json|sql|js|html|svg|mmd|log|txt|png|jpe?g|pdf)$/.test(name))throw new Error('Unexpected download file: '+name);
   total+=info.size;if(total>150*1024*1024)throw new Error('Portfolio download exceeds 150 MB.');
   entries[(prefix+'/'+rel).split(path.sep).join('/')]=new Uint8Array(await readFile(absolute));
  }
 }
 await walk();await writeFile(zipPath,zipSync(entries,{level:6}),{mode:0o600});return Object.keys(entries).length;
}
function summaryHTML({job,spec,input,svg,review,repository}){
 const clip=(v,n=550)=>String(v??'').slice(0,n),p=job.prefix;
 const declaration=`GitHub Copilot helped generate the case model and sample-data package. The portfolio generator produced the scripts and explanations, executed the PostgreSQL and MongoDB exercises, captured report screenshots and assembled this summary. ${review?'I reviewed the generated files, checked the recorded results and added the reflection below.':'Personal review and reflection are pending.'} I am responsible for checking the work and explaining the submitted results.`;
 const link=repository?.portfolioUrl||'Repository link pending: save this portfolio to your own GitHub repository.';
 const result=`${job.portfolio2.checks.queries} queries; ${job.portfolio2.checks.benchmarkRows.toLocaleString()} performance rows; median execution ${job.portfolio2.comparison.beforeMedianMs} ms before and ${job.portfolio2.comparison.afterMedianMs} ms after indexing. Identical lookup results: ${job.portfolio2.checks.identicalResults}. Index used: ${job.portfolio2.comparison.indexUsed}.`;
 const section=(title,body)=>`<h2>${h(title)}</h2>${body}`;
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>${h(spec.scenario.title)} — summary</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;color:#19313a;font:10pt/1.4 Arial,sans-serif}article{width:210mm;height:297mm;padding:16mm 18mm;break-after:page;position:relative;overflow:hidden}article:last-child{break-after:auto}h1{font-size:20pt;line-height:1.15;margin:0 0 10pt}h2{font-size:12pt;margin:13pt 0 5pt}p{margin:5pt 0;overflow-wrap:anywhere}.meta{color:#526b70;font-size:9pt}.diagram{height:113mm;display:flex;align-items:center;justify-content:center}.diagram svg{width:100%;height:100%;object-fit:contain}footer{position:absolute;bottom:12mm;font-size:8pt;color:#526b70}.refs{font-size:8pt;line-height:1.4}.refs p{margin:3pt 0}.label{padding:6pt;background:#edf5f3}.reflection{white-space:pre-wrap;font-size:9.5pt}</style>
 <article><p class="meta">MIT 8103 · Advanced Database Systems · Individual portfolio summary</p><h1>${h(clip(spec.scenario.title,110))}</h1><p>${h(input.firstName+' '+input.surname)} · Student ID ${h(input.studentId)}</p><p class="label">${review?'Reviewed summary':'Draft — add your reflection and review before submission'}</p>${section('Case study',`<p>${h(clip(spec.scenario.description,650))}</p><p>${h(clip(spec.scenario.scope,400))}</p>`)}${section('Portfolio 1 — Database Design and Modelling (7 marks)',`<p>${job.checks.tables} tables were created in PostgreSQL. Primary keys, foreign keys, required fields and business constraints were inspected; ${job.checks.rejectedInvalidRecords} invalid records were rejected by the expected constraints. The saved normalisation tables show 1NF, 2NF and 3NF with a reconstruction check.</p><p>Tables: ${h(spec.entities.map(e=>e.name).join(', '))}.</p>`)}<div class="diagram">${svg}</div><p class="meta">ER diagram from the same model used to create and inspect the tables. Detailed schema, keys, rules and normalisation are in portfolio-1-database-design/.</p><footer>1 / 3 · Synthetic data</footer></article>
 <article><h1>Implementation and results</h1>${section('Portfolio 2 — Query Processing and Optimisation (7 marks)',`<p>${h(result)}</p><p>The benchmark uses a separate performance projection, not complete business records. Six actual EXPLAIN ANALYZE plans were saved. Timings vary between runs.</p>`)}${section('Portfolio 3 — Transactions and Concurrency (7 marks)',`<p>COMMIT persisted a change; an uncommitted change stayed hidden from another session. A failed operation was rolled back. Two real PostgreSQL sessions demonstrated a lost update, then SELECT FOR UPDATE made the second session wait and preserved both updates.</p><p>A temporary helper counter on the case record makes the comparison visible. This demonstrates transaction behaviour; it does not claim the complete business operation was implemented.</p>`)}${section('Portfolio 4 — NoSQL and Advanced Data Models (7 marks)',`<p>MongoDB collection: ${h(spec.noSql.collection)}. ${job.portfolio4.checks.insertedDocuments} synthetic event documents, ${job.portfolio4.checks.verifiedQueries} verified queries and ${job.portfolio4.checks.validationRejections} expected validation/uniqueness rejections. Documents include embedded case snapshots and variable metadata. Events are simulated examples, not a reconstructed historical event stream.</p><p>PostgreSQL retains relational rules. MongoDB supports flexible event details; no cross-database atomic transaction is claimed.</p>`)}${section('Portfolio 5 — Distributed and Cloud Databases (6 marks)',`<p>This uses the permitted discussion option: a proposed three-member MongoDB replica set across availability zones, majority-based availability and consistency, sharding trade-offs and cloud recovery considerations for ${h(spec.noSql.collection)}.</p><p>No live replication, failover, sharding or cloud deployment was performed. See the proposed architecture and discussion in portfolio-5-distributed-cloud/.</p>`)}${section('Repository and evidence',`<p>${h(link)}</p><p>SQL, JavaScript, models, measured plans, execution logs and screenshots are organised by portfolio. Screenshots are automated renderings of saved execution reports; the Portfolio 5 screenshot shows a proposal.</p>`)}<footer>2 / 3 · Recorded results from this run</footer></article>
 <article><h1>Reflection and references</h1>${section('Personal reflection',`<p class="reflection">${h(review?.reflection||'Pending: describe what you learned, a difficulty you investigated and how you checked the results. This must reflect your own experience.')}</p>`)}${section('AI-use declaration',`<p>${h(declaration)}</p>`)}${section('References',`<div class="refs"><p>MIT 8103 Advanced Database Systems CA, September Cohort 2026. Assessment brief and separate submission instructions.</p>${references.map(([t,u])=>`<p>${h(t)} — ${h(u)}</p>`).join('')}</div>`)}${section('Scope of the evidence','<p>Results come from temporary local/Codespaces database containers. Each exercise recreates the saved model and removes its temporary database after execution. This portfolio demonstrates database concepts with synthetic data, rather than a deployed production application. Git history records actual checkpoints with their real timestamps.</p>')}<footer>3 / 3 · Review and explain all submitted work</footer></article></html>`;
 return{html,declaration};
}
export async function finishPortfolio({job,workflow,runsDirectory,review=null,repository=null,render=renderPortfolio}){
 if(job.portfolio4?.status!=='complete')throw new Error('Finish Portfolios 1–4 before building the final package.');
 const output=await safeOutput(job,runsDirectory),prefix=job.prefix;
 const manifestPath=path.join(output,prefix+'_RunManifest.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 const spec=JSON.parse(await readFile(workflow.artifact(job.id,'review').path,'utf8'));
 const proposal=distributedDesign(spec);await mkdir(path.join(output,p5folder),{recursive:true});
 await writeFile(path.join(output,p5folder,prefix+'_P5_ProposedDesign.html'),proposal.html);
 await writeFile(path.join(output,p5folder,prefix+'_P5_Discussion.md'),proposal.markdown);
 await writeFile(path.join(output,p5folder,prefix+'_P5_ProposedDesign.svg'),proposal.svg);
 await writeFile(path.join(output,p5folder,prefix+'_P5_README.md'),`# Portfolio 5\n\nDistributed and Cloud Databases (6 marks). Open ${prefix}_P5_ProposedDesign.html or read ${prefix}_P5_Discussion.md. This is a proposed design using the discussion option, not an executed deployment.\n`);
 const svg=await readFile(workflow.artifact(job.id,'er-svg').path,'utf8');
 const summary=summaryHTML({job,spec,input:manifest.input,svg,review,repository});
 await writeFile(path.join(output,prefix+'_Summary.html'),summary.html);
 await writeFile(path.join(output,prefix+'_AIUseDeclaration.md'),'# AI-use declaration\n\n'+summary.declaration+'\n');
 await writeFile(path.join(output,prefix+'_Reflection.md'),'# Personal reflection\n\n'+(review?.reflection||'Pending: add your own reflection through the app.')+'\n');
 const shots=[];
 for(const [num,key,suffix]of [[1,'evidence','DatabaseResults'],[2,'query-results','QueryResults'],[2,'performance','IndexComparison'],[3,'commit-rollback','CommitRollback'],[3,'concurrency','ConcurrencyResult'],[4,'mongo-results','DocumentsAndQueries'],[5,'distributed-design','ProposedDesign']]){
  const folder= num===5?p5folder:['portfolio-1-database-design','portfolio-2-query-optimisation','portfolio-3-transactions-concurrency','portfolio-4-nosql'][num-1];
  const source=key==='distributed-design'?path.join(output,p5folder,prefix+'_P5_ProposedDesign.html'):workflow.artifact(job.id,key)?.path;
  if(!source)throw new Error('Missing execution report: '+key);
  const sourceReal=await realpath(source);if(!sourceReal.startsWith(output+path.sep))throw new Error('Screenshot source is outside the portfolio.');
  const image=`${folder}/screenshots/${prefix}_P${num}_${suffix}.png`,sourceBytes=await readFile(sourceReal);
  await mkdir(path.join(output,folder,'screenshots'),{recursive:true});shots.push({html:sourceBytes.toString('utf8'),path:path.join(output,image),image,source:path.relative(output,sourceReal),sourceSha256:digest(sourceBytes),stage:[10,13,15,17,18][num-1]});
 }
 await render({html:summary.html,pdfPath:path.join(output,prefix+'_Summary.pdf'),screenshots:shots});
 const evidence=[];for(const s of shots)evidence.push({stage:s.stage,status:'captured',image:s.image,log:s.source,sourceSha256:s.sourceSha256,imageSha256:digest(await readFile(s.path)),capturedAt:new Date().toISOString(),method:'Isolated Chromium rendering of the saved HTML report; not a terminal screenshot.'});
 await writeFile(path.join(output,prefix+'_EvidencePlan.md'),'# Captured evidence\n\nImages render the actual saved execution reports. Portfolio 5 is a proposed architecture. Original logs and JSON results are retained.\n\n'+evidence.map(e=>`- ${e.image}\n  - Source: ${e.log}\n  - SHA-256: ${e.imageSha256}`).join('\n')+'\n');
 const stages=structuredClone(manifest.stages);
 for(const id of [2,18])stages.find(s=>s.id===id).status='complete';
 stages.find(s=>s.id===2).name='Check workspace and tools';
 stages.find(s=>s.id===1).status=repository?.verified?'complete':'pending';
 stages.find(s=>s.id===11).status=review?'complete':'pending';stages.find(s=>s.id===19).status=review?'complete':'drafted';
 const submissionReady=stages.every(s=>s.status==='complete');
 Object.assign(manifest,{stages,evidence,repository,portfolio5:{status:'discussion_complete',liveDeployment:false},review,submissionReady,pending:[...(!repository?.verified?['Verify and save to your own GitHub repository']:[]),...(!review?['Personal reflection and final review']:[])]});
 await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 const guide=`# ${spec.scenario.title} — short guide\n\n1. **Design:** ${spec.entities.map(e=>e.name).join(', ')} store the case records. Read the ER diagram, keys, constraints and actual 1NF–3NF tables in Portfolio 1. ${job.checks.rejectedInvalidRecords} expected invalid records were rejected.\n2. **Queries:** three useful SQL queries ran. A separate ${job.portfolio2.checks.benchmarkRows}-row projection compares the same lookup before and after indexing. Inspect the actual plans; repeated timings are not a universal speed guarantee.\n3. **Transactions:** COMMIT keeps a change; ROLLBACK undoes it. Two separate sessions show a lost update, then row locking. The helper counter isolates this database concept from the original business fields.\n4. **Documents:** ${spec.noSql.collection} stores synthetic events with embedded case snapshots and variable fields. The MongoDB script inserts, queries, aggregates and checks invalid documents.\n5. **Distributed design:** the three-member design is a proposal. Explain voting majority, replication lag, sharding and backups; no failover experiment was run.\n6. **Evidence:** screenshots are generated from saved execution-report HTML, backed by raw logs and result JSON. Read the SQL and JavaScript alongside the outputs.\n7. **Review:** write your own reflection, verify the summary and explain the choices. Names and student IDs are not sent to Copilot by the generator.\n\nThe manual learning guide is https://github.com/arizonal2014/MIT8103_Codelab .\n`;
 await writeFile(path.join(output,prefix+'_QuickGuide.md'),guide);
 for(const [i,folder]of ['portfolio-1-database-design','portfolio-2-query-optimisation','portfolio-3-transactions-concurrency','portfolio-4-nosql'].entries()){await writeFile(path.join(output,folder,`${prefix}_P${i+1}_README.md`),`# ${spec.scenario.title} — Portfolio ${i+1}\n\nExecuted results, scripts and logs are saved in this folder. Open the HTML reports and read the matching SQL or JavaScript. Automatically captured report images are in screenshots/. See the root QuickGuide.md and RunManifest.json for the explanation and evidence provenance.\n`);}
 await writeFile(path.join(output,prefix+'_README.md'),`# ${spec.scenario.title}\n\n${manifest.input.firstName} ${manifest.input.surname} · ${manifest.input.studentId}\n\nPortfolios 1–4 contain executed database exercises. Portfolio 5 uses the permitted distributed-design discussion option. The three-page summary includes the ER diagram, recorded results, references and AI-use declaration.\n\n${review?'Personal reflection and review recorded.':'Draft: personal reflection and review are pending.'} ${repository?.verified?'Repository: '+repository.portfolioUrl:'Save this output to your own repository before submission.'}\n\nRead ${prefix}_QuickGuide.md. See ${prefix}_RunManifest.json for checks and evidence provenance. No assessment form is submitted automatically.\n`);
 const zipPath=path.join(runsDirectory,'case-run-'+job.id,prefix+'_Portfolio.zip');await archivePortfolio(output,prefix,zipPath);
 return{status:review?'complete':'awaiting_review',message:review?'Summary, reflection, evidence and download package are ready.':'All five activities and screenshots are ready. Add your own reflection and review the draft summary.',stages,submissionReady,review,repository,evidence,finishedAt:new Date().toISOString()};
}
export async function finalArtifact(job,key,runsDirectory){
 if(key!=='download'&&!Object.hasOwn(finishFiles,key))return null;
 const output=await safeOutput(job,runsDirectory);
 const [folder,suffix,label]=finishFiles[key]||[];
 const target=key==='download'?path.join(runsDirectory,'case-run-'+job.id,job.prefix+'_Portfolio.zip'):path.join(output,folder,job.prefix+'_'+suffix);
 const actual=await realpath(target);if(actual!==target)throw new Error('Unsafe final artifact.');return{path:actual,label:label||'Download portfolio ZIP'};
}
