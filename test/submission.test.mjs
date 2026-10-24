import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {libraryCase,hospitalCase} from '../examples/cases.mjs';
import {libraryExecution} from './general-case-fixtures.mjs';
import {submissionFiles,listSubmission} from '../lib/submission-files.mjs';
import {submissionMermaid} from '../lib/submission-diagram.mjs';
import {negativeTestSQL,sessionScripts,readableMongoScript} from '../lib/submission-output.mjs';
import {buildTransactionExercise} from '../lib/transaction-exercise.mjs';
import {summaryContent} from '../lib/portfolio-finish.mjs';
import {executionPlanText,markdownHTML} from '../lib/submission-format.mjs';

test('the submission contract contains every CA activity and excludes diagnostic formats',()=>{
 const files=[...submissionFiles('Doe_Ada_0001').keys()];assert.equal(files.length,28);assert.equal(files.filter(f=>f.endsWith('.png')).length,8);
 assert.ok(files.every(f=>!/(\.json$|\.html$|\.log$|\/logs\/|Manifest|QuickGuide|Reflection\.md)/.test(f)));
 for(let n=1;n<=5;n++)assert.ok(files.some(f=>f.includes('_P'+n+'_README.md')));
 assert.ok(files.includes('Doe_Ada_0001_FinalSummary.md'));assert.ok(files.includes('Doe_Ada_0001_FinalSummary.pdf'));
});
test('unexpected JSON cannot silently enter the ZIP or GitHub export',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'clean-files-'));await writeFile(path.join(root,'Doe_Ada_0001_RunManifest.json'),'{}');await assert.rejects(listSubmission(root,'Doe_Ada_0001'),/Unexpected submission file/);
});
test('a symlink in an evidence folder is rejected',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'clean-links-'));await symlink(os.tmpdir(),path.join(root,'images'));await assert.rejects(listSubmission(root,'Doe_Ada_0001'),/Symbolic links/);
});
test('Mermaid follows actual SQL types, primary/foreign/unique keys and nullable fields',()=>{
 const source=submissionMermaid(libraryCase());assert.match(source,/direction LR/);assert.match(source,/bigint member_id PK/);assert.match(source,/copy_id FK/);assert.match(source,/membership_number UK/);assert.match(source,/returned_at "Optional"/);assert.match(source,/book \|\|--o\{ book_copy/);
 assert.doesNotMatch(source,/\bid member_id/);assert.ok(submissionMermaid(hospitalCase()).includes('patient'));
});
test('readable constraint tests retain each verified INSERT and expected constraint',()=>{
 const{spec,pkg}=libraryExecution(),sql=negativeTestSQL(spec,pkg);assert.equal((sql.match(/^INSERT INTO/gm)||[]).length,pkg.negativeTests.length);assert.doesNotMatch(sql,/GET STACKED|DO \$|Generated from/);for(const check of pkg.negativeTests)assert.ok(sql.includes(check.target));
});
test('separate session scripts preserve the nine interleaved steps',()=>{
 const{spec,pkg}=libraryExecution(),exercise=buildTransactionExercise(spec,pkg),scripts=sessionScripts(exercise.concurrency);
 for(const n of [1,3,5,6,8])assert.ok(scripts.A.includes('-- '+n+'.'));
 for(const n of [2,4,7,9])assert.ok(scripts.B.includes('-- '+n+'.'));
 assert.doesNotMatch(scripts.A,/-- 7\./);assert.match(scripts.B,/FOR UPDATE/);
});
test('summary uses actual case results and a substantive reflection, without empty instructions',()=>{
 const spec=libraryCase(),job={prefix:'Doe_Ada_0001',checks:{tables:4,rejectedInvalidRecords:13},portfolio2:{checks:{queries:3,benchmarkRows:20000},comparison:{beforeMedianMs:2,afterMedianMs:0.3,indexUsed:true}},portfolio4:{checks:{insertedDocuments:4,verifiedQueries:4}}};
 const content=summaryContent({job,spec,input:{firstName:'Ada',surname:'Doe',studentId:'0001'},queries:[{kind:'join',rows:[{name:'Test Reader',title:'Test Book'}]}],repository:{portfolioUrl:'https://github.com/example/test'}});
 assert.match(content.markdown,/I ran three SQL queries/);assert.match(content.markdown,/Test Reader with Test Book/);assert.match(content.markdown,/2 ms to 0.3 ms/);assert.match(content.markdown,/Individual reflection/);assert.doesNotMatch(content.markdown,/\[Add |matched: true|logs\/|Captured:|Saved output from/);assert.match(content.markdown,/generator ran/);assert.equal(content.pages.length,3);
});
test('plan excerpts preserve measured nodes and timings without raw JSON',()=>{
 const text=executionPlanText([{Plan:{'Node Type':'Index Scan','Index Name':'example_idx','Actual Startup Time':0.1,'Actual Total Time':0.2,'Actual Rows':2,'Actual Loops':1},'Planning Time':0.3,'Execution Time':0.4}]);assert.match(text,/Index Scan using example_idx/);assert.match(text,/Execution Time: 0.4 ms/);assert.doesNotMatch(text,/"Node Type"/);
});
test('Markdown renderer escapes case content instead of executing it',()=>{const html=markdownHTML('# <script>alert(1)</script>\n\n```sql\nSELECT 1;\n```');assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('<pre><code>SELECT 1;'));
});
