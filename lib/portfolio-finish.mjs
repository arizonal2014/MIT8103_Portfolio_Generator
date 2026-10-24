import {documentStyle} from './document-style.mjs';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';
import {zipSync} from 'fflate';
import {escapeHTML as h,evidencePage} from './postgres-case.mjs';
import {buildSubmissionStage,submissionDirectory} from './submission-output.mjs';
import {submissionFolders,listSubmission,submissionFiles} from './submission-files.mjs';
import {markdownHTML,reportPage,readable} from './submission-format.mjs';
const p5folder='portfolio-5-distributed-cloud';
export const finishFiles={
 'distributed-design':[p5folder,'P5_README.md','Portfolio 5 discussion',true],
 'summary':['','FinalSummary.pdf','Download three-page summary',true],
 'summary-preview':['','FinalSummary.html','Read summary',true],
 'summary-source':['','FinalSummary.md','Edit final summary',true],
 'quick-guide':['','QuickGuide.md','What happened and why',true],
 'er-image':['images','ERDiagram.png','ER diagram'],
 'database-image':[submissionFolders[0]+'/screenshots','P1_DatabaseResults.png','Table and constraint evidence'],
 'queries-image':[submissionFolders[1]+'/screenshots','P2_QueryResults.png','Query results'],
 'performance-image':[submissionFolders[1]+'/screenshots','P2_IndexComparison.png','Index comparison'],
 'transactions-image':[submissionFolders[2]+'/screenshots','P3_CommitRollback.png','Commit and rollback'],
 'concurrency-image':[submissionFolders[2]+'/screenshots','P3_ConcurrencyResult.png','Concurrency results'],
 'mongo-image':[submissionFolders[3]+'/screenshots','P4_DocumentsAndQueries.png','MongoDB evidence'],
 'proposal-image':[submissionFolders[4]+'/screenshots','P5_ProposedDesign.png','Proposed architecture'],
};
const references=[
 ['PostgreSQL: constraints','https://www.postgresql.org/docs/17/ddl-constraints.html'],
 ['PostgreSQL: EXPLAIN','https://www.postgresql.org/docs/17/using-explain.html'],
 ['PostgreSQL: isolation','https://www.postgresql.org/docs/17/transaction-iso.html'],
 ['PostgreSQL: row locks','https://www.postgresql.org/docs/17/explicit-locking.html'],
 ['MongoDB: data modelling','https://www.mongodb.com/docs/manual/data-modeling/'],
 ['MongoDB: replication','https://www.mongodb.com/docs/manual/replication/'],
 ['MongoDB: sharding','https://www.mongodb.com/docs/manual/sharding/'],
 ['Mermaid: ER diagrams','https://mermaid.js.org/syntax/entityRelationshipDiagram.html'],
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
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 260" role="img" aria-label="Proposed architecture, not a running deployment"><style>text{font:16px sans-serif;fill:#000000}rect{fill:#ffffff;stroke:#000000;stroke-width:2}path{fill:none;stroke:#000000;stroke-width:2}</style><text x="25" y="28">PROPOSED ARCHITECTURE — NOT EXECUTED</text><rect x="25" y="100" width="150" height="65" rx="8"/><text x="48" y="139">Application</text><path d="M175 130 H235 M235 130 V65 H290 M235 130 V205 H290"/><rect x="290" y="35" width="230" height="65" rx="8"/><text x="315" y="74">PostgreSQL records</text><rect x="290" y="170" width="170" height="65" rx="8"/><text x="310" y="197">MongoDB primary</text><text x="310" y="218">Zone A</text><path d="M460 202 H530 M530 202 V135 H590 M530 202 V220 H590"/><rect x="590" y="105" width="240" height="65" rx="8"/><text x="610" y="143">Secondary · Zone B</text><rect x="590" y="190" width="240" height="65" rx="8"/><text x="610" y="228">Secondary · Zone C</text></svg>`;
 const markdown=`# ${title} — Portfolio 5\n\nAssessment: Distributed and Cloud Databases (6 marks). This uses the discussion option.\n\n`+sections.map(([t,p])=>`## ${t}\n\n${p}\n`).join('\n')+'\n## References\n\n'+references.filter(([title])=>['MongoDB: replication','MongoDB: sharding'].includes(title)).map(([t,u])=>`- [${t}](${u})`).join('\n')+'\n';
 const html=evidencePage(title+' — proposed distributed design',`<h1>${h(title)} — Portfolio 5</h1><p class="note">Assessment: Distributed and Cloud Databases (6 marks). Proposed architecture and discussion. No live distributed deployment is claimed.</p>${svg}${sections.map(([t,p])=>`<h2>${h(t)}</h2><p>${h(p)}</p>`).join('')}<h2>References</h2>${references.filter(([title])=>['MongoDB: replication','MongoDB: sharding'].includes(title)).map(([t,u])=>`<p>${h(t)}: ${h(u)}</p>`).join('')}`);
 return{html,markdown,svg};
}
export function validateReview(raw={}){
 raw=raw||{};const reflection=typeof raw.reflection==='string'?raw.reflection.trim():'';
 if(raw.reviewed!==true||reflection.length<80||reflection.length>1800)throw Object.assign(new Error('Add a reflection of 80–1,800 characters and confirm your review.'),{statusCode:422});
 return{reviewed:true,reflection,reviewedAt:new Date().toISOString()};
}
export async function safeOutput(job,runsDirectory){
 const allowed=await realpath(path.join(runsDirectory,'case-run-'+job.id)),runs=await realpath(runsDirectory),output=await realpath(job.outputDirectory);
 if(!allowed.startsWith(runs+path.sep)||!output.startsWith(allowed+path.sep)||path.basename(output)!==job.prefix||!job.prefix||/[\/\\]/.test(job.prefix))throw new Error('Unsafe portfolio output location.');return output;
}
const digest=data=>createHash('sha256').update(data).digest('hex');
export async function renderPortfolio({html,pdfPath,screenshots=[]}){
 const browser=await chromium.launch({chromiumSandbox:process.platform==='linux'});
 try{
  const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:1280,height:900},deviceScaleFactor:1});await context.route('**/*',route=>route.abort());const page=await context.newPage();
  for(const shot of screenshots){await page.setContent(shot.html,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:shot.path,fullPage:true,animations:'disabled'});}
  if(pdfPath){
   await page.setContent(html,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
   const clipped=await page.locator('article').evaluateAll(nodes=>nodes.some(article=>Array.from(article.children).filter(el=>el.tagName!=='FOOTER').some(el=>el.getBoundingClientRect().bottom>article.querySelector('footer').getBoundingClientRect().top-6)));if(clipped)throw new Error('The summary exceeds three pages. Shorten its case text or reflection.');
   await page.pdf({path:pdfPath,format:'A4',printBackground:true,preferCSSPageSize:true});
  }
 }finally{await browser.close();}
 if(pdfPath){const pdf=await PDFDocument.load(await readFile(pdfPath));if(pdf.getPageCount()!==3)throw new Error('The final summary must contain three pages.');return{pages:3};}return{};
}
export async function captureSubmission(bundle,{render=renderPortfolio}={}){
 const shots=[],records=[];await mkdir(bundle.assets,{recursive:true,mode:0o700});
 for(const page of bundle.pages){const folder=submissionFolders[page.portfolio-1]+'/screenshots';await mkdir(path.join(bundle.output,folder),{recursive:true});const image=folder+'/'+bundle.facts.prefix+'_P'+page.portfolio+'_'+page.name+'.png';
  const source=path.join(bundle.assets,'P'+page.portfolio+'_'+page.name+'.html'),html=page.html||reportPage(bundle.facts.spec.scenario.title,page.markdown);await writeFile(source,html);
  shots.push({html,path:path.join(bundle.output,image)});records.push({image,source,sourceSha256:digest(html),stage:page.portfolio});
 }
 if(shots.length)await render({screenshots:shots});
 for(const record of records){record.imageSha256=digest(await readFile(path.join(bundle.output,record.image)));record.capturedAt=new Date().toISOString();record.method='Rendered from recorded database results; not a manual terminal screenshot.';}
 return records;
}
export async function archivePortfolio(output,prefix,zipPath){
 const files=await listSubmission(output,prefix),entries={};let total=0;
 for(const rel of files){const bytes=await readFile(path.join(output,rel));total+=bytes.length;if(total>150*1024*1024)throw new Error('Portfolio download exceeds 150 MB.');entries[prefix+'/'+rel]=new Uint8Array(bytes);}
 await writeFile(zipPath,zipSync(entries,{level:6}),{mode:0o600});return files.length;
}
export function summaryContent({job,spec,input,queries=[],transaction,comparison=job.portfolio2?.comparison,review,repository}){
 const small=n=>['zero','one','two','three','four','five','six','seven','eight'][n]||String(n);
 const list=values=>values.length>1?values.slice(0,-1).join(', ')+' and '+values.at(-1):values[0];
 const lower=value=>value.replace(/^[A-Z][a-z]+/,s=>s.toLowerCase());
 const tables=spec.entities.map(e=>e.name),queryCount=small(job.portfolio2.checks.queries),join=queries.find(q=>q.kind==='join');
 const names=join?.rows?.[0]?Object.values(join.rows[0]).filter(v=>typeof v==='string'&&!/^\d{4}-\d\d-\d\d/.test(v)).slice(0,2):[];
 const joinText=join?` The join returned ${join.rows.length} rows${names.length?' and included '+names.join(' with '):''}.`:'';
 const firstRule=spec.businessRules.find(r=>r.enforcement==='partial_unique')||spec.businessRules.find(r=>r.enforcement==='check')||spec.businessRules[0];
 const reflection=review?.reflection||`I kept ${tables.join(', ')} in separate tables so their details could be maintained without repeating them in every related record. ${firstRule.description} The constraint tests check this alongside the required values and record links. One issue illustrated by the two-session exercise is that both sessions can read the same value before either update is committed. Locking the row before reading preserves both increments. The index comparison also shows why I need to check the execution plan as well as the final answer: the same result can require different amounts of database work.`;
 const declaration='I used GitHub Copilot and the portfolio generator to help prepare the database model, scripts and explanations. The generator ran the PostgreSQL and MongoDB exercises, checked their outputs and captured the result images. '+(review?'I reviewed the scripts and results and added my own reflection.':'')+' I remain responsible for checking and explaining the submitted work.';
 const sections={
  case:`My case study is ${spec.scenario.title}. I designed the database for ${list(spec.scenario.users.map(lower))}, with separate tables named ${list(tables)}. It supports these operations: ${spec.scenario.operations.map(s=>lower(s.replace(/[.!]$/,''))).join('; ')}.`,
  p1:`I organised the relational design into ${job.checks.tables} tables. Primary keys identify records, foreign keys preserve the links, and checks enforce the stated business rules. ${firstRule.description} The normalisation examples show the sample data at 1NF, 2NF and 3NF. All ${job.checks.rejectedInvalidRecords} deliberately invalid inserts were rejected without changing the valid sample rows.`,
  p2:`I ran ${queryCount} SQL queries against the sample records.${joinText} For the index comparison, I used ${job.portfolio2.checks.benchmarkRows.toLocaleString('en-US')} separate performance rows. The median lookup time changed from ${comparison.beforeMedianMs} ms to ${comparison.afterMedianMs} ms. Both phases returned the same records. The measured plan ${comparison.indexUsed?'used the new index':'did not use the new index'}. These timings apply to this lookup and environment.`,
  p3:`I used a temporary counter on ${transaction?.entity||spec.transactions.entity} to test COMMIT, ROLLBACK and READ COMMITTED isolation. The uncommitted update remained hidden from the other session, and ROLLBACK restored the earlier committed value. Without locking, two increments left the counter at 2. With SELECT FOR UPDATE, Session B waited for Session A and the final value was 3. The helper is confined to this exercise; the case's original business fields stay unchanged.`,
  p4:`I used ${spec.noSql.collection} for the case's event documents. MongoDB inserted ${job.portfolio4.checks.insertedDocuments} sample events and returned the expected results for ${job.portfolio4.checks.verifiedQueries} queries. Validation rejected an invalid date type and a duplicate event ID. Embedded snapshots keep related details with an event, while the details field can differ by event type. These are fictional events; PostgreSQL continues to enforce its relational rules.`,
  p5:`I proposed three MongoDB replica members across separate failure zones. The discussion covers primary elections, majority acknowledgement, secondary lag and sharding trade-offs for ${spec.noSql.collection}. Replication supports availability, while backups address recovery. PostgreSQL needs its own availability plan. This is the permitted discussion option; no live replica set or failover test was deployed.`,
  reflection,declaration,repository:repository?.portfolioUrl||'Repository connection required',
 };
 const heading=(title,text)=>'## '+title+'\n\n'+text+'\n\n';
 const pages=[
  `# MIT 8103 Advanced Database Systems\n\n**${spec.scenario.title}** · ${input.firstName} ${input.surname} · Student ID ${input.studentId}\n\n`+heading('Case study',sections.case)+heading('Portfolio 1: Database Design and Modelling',sections.p1)+`![${spec.scenario.title} ER diagram](images/${job.prefix}_ERDiagram.png)\n\nFigure 1. Tables, keys and relationships. PK: primary key; FK: foreign key; UK: unique value.\n`,
  heading('Portfolio 2: Query Processing and Optimisation',sections.p2)+heading('Portfolio 3: Transactions and Concurrency',sections.p3)+heading('Portfolio 4: NoSQL and Advanced Data Models',sections.p4)+heading('Repository and evidence',sections.repository+'\n\nThe portfolio folders contain the SQL and JavaScript, explanations, query plans, result tables and screenshots.'),
  heading('Portfolio 5: Distributed and Cloud Database Exercise',sections.p5)+heading('Individual reflection',sections.reflection)+heading('AI-use declaration',sections.declaration)+heading('References',references.map(([title,url])=>'- ['+title+']('+url+')').join('\n')),
 ];
 return{sections,pages,markdown:pages.join('\n<!-- PAGE BREAK -->\n\n')};
}
export function summaryHTML(content,pngData){
 const imageKey=content.markdown.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1],images=imageKey?{[imageKey]:'data:image/png;base64,'+pngData.toString('base64')}:{};
 return `<!doctype html><html><head><meta charset="utf-8"><title>Portfolio summary</title><style>${documentStyle}@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;color:#111;font:10.5pt/1.42 'IBM Plex Sans',sans-serif}article{width:210mm;height:297mm;padding:16mm 18mm;position:relative;break-after:page;overflow:hidden}article:last-child{break-after:auto}h1{font-size:18pt;line-height:1.2;margin:0 0 12pt}h2{font-size:12pt;line-height:1.2;margin:15pt 0 6pt}p{margin:6pt 0;overflow-wrap:anywhere}figure{height:106mm;margin:15pt 0 8pt;display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100%;object-fit:contain}footer{position:absolute;bottom:11mm;font-size:9pt}ul{padding-left:15pt;font-size:8.3pt;line-height:1.35}li{margin-bottom:5pt;overflow-wrap:anywhere}a{color:#111;text-decoration:none}</style></head><body>${content.pages.map((md,i)=>'<article>'+markdownHTML(md,images)+'<footer>'+(i+1)+' / 3</footer></article>').join('')}</body></html>`;
}
export async function finishPortfolio({job,workflow,runsDirectory,review=null,repository=null,render=renderPortfolio}){
 if(job.portfolio4?.status!=='complete')throw new Error('Finish Portfolios 1–4 before building the final package.');await safeOutput(job,runsDirectory);
 const bundle=await buildSubmissionStage({job,workflow,runsDirectory,through:4});bundle.facts.prefix=job.prefix;
 const {spec}=bundle.facts,proposal=distributedDesign(spec),prefix=job.prefix;
 // Discussion stays in one README; the image presents its proposed architecture.
 const p5=proposal.markdown.replace(/Assessment: Distributed and Cloud Databases \(6 marks\)\. This uses the discussion option\./,'This is the proposed distributed design for the case study.');
 await bundle.save(bundle.file(5,'README.md'),p5+'\n![Proposed architecture](screenshots/'+prefix+'_P5_ProposedDesign.png)\n');
 bundle.pages.push({portfolio:5,name:'ProposedDesign',html:reportPage(spec.scenario.title+' — proposed architecture','# Proposed distributed architecture\n\nThe diagram is a proposal for '+spec.noSql.collection+'. No live distributed deployment is claimed.') .replace('</body>',proposal.svg+'</body>')});
 const evidence=await captureSubmission(bundle,{render});
 const manifestPath=path.join(job.outputDirectory,prefix+'_RunManifest.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 const content=summaryContent({job,spec,input:manifest.input,queries:bundle.facts.queries,transaction:bundle.facts.transaction,review,repository});
 await bundle.save(prefix+'_FinalSummary.md',content.markdown);const html=summaryHTML(content,await readFile(path.join(bundle.output,'images',prefix+'_ERDiagram.png')));
 const htmlPath=path.join(bundle.assets,'FinalSummary.html');await writeFile(htmlPath,html);
 await render({html,pdfPath:path.join(bundle.output,prefix+'_FinalSummary.pdf')});
 const stages=structuredClone(manifest.stages);for(const stage of stages)stage.status='complete';stages[0].status=repository?.verified?'complete':'pending';
 const packageReady=stages.every(s=>s.status==='complete'),submissionReady=Boolean(review)&&packageReady;
 Object.assign(manifest,{stages,evidence,repository,portfolio5:{status:'discussion_complete',liveDeployment:false},review,packageReady,submissionReady,submissionDirectory:bundle.output,exportVersion:2,pending:review?[]:['Personal review of the technical reflection and final summary']});await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 const guide=Object.entries(content.sections).filter(([k])=>!['declaration','reflection','repository'].includes(k)).map(([k,v])=>'## '+readable(k)+'\n\n'+v).join('\n\n');await writeFile(path.join(bundle.assets,'QuickGuide.md'),'# '+spec.scenario.title+' — short guide\n\n'+guide);
 const expected=submissionFiles(prefix),actual=new Set(await listSubmission(bundle.output,prefix));const missing=[...expected.keys()].filter(name=>!actual.has(name));if(missing.length)throw new Error('Missing assessment evidence: '+missing.join(', '));
 const zipPath=path.join(runsDirectory,'case-run-'+job.id,prefix+'_Portfolio.zip'),fileCount=await archivePortfolio(bundle.output,prefix,zipPath);
 return{status:'complete',message:'The assessment files and editable summary are ready.',stages,packageReady,submissionReady,review,repository,evidence,exportVersion:2,submissionDirectory:bundle.output,fileCount,finishedAt:new Date().toISOString()};
}
export async function finalArtifact(job,key,runsDirectory){
 if(key!=='download'&&!Object.hasOwn(finishFiles,key))return null;
 const output=await submissionDirectory(job,runsDirectory),assets=path.join(runsDirectory,'case-run-'+job.id,'submission-assets');
 const [folder,suffix,label]=finishFiles[key]||[];
 const target=key==='download'?path.join(runsDirectory,'case-run-'+job.id,job.prefix+'_Portfolio.zip'):key==='summary-preview'?path.join(assets,'FinalSummary.html'):key==='quick-guide'?path.join(assets,'QuickGuide.md'):path.join(output,folder,job.prefix+'_'+suffix);
 const actual=await realpath(target);if(actual!==target)throw new Error('Unsafe final artifact.');return{path:actual,label:label||'Download portfolio ZIP'};
}
