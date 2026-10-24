import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateCaseSpec} from './case-spec.mjs';
import {identifier as id,literal,renderExecutionSQL} from './execution-package.mjs';
import {renderPostgresSchema} from './postgres-schema.mjs';
import {dockerCommand} from './postgres-pilot.mjs';
import {escapeHTML as esc,evidencePage} from './postgres-case.mjs';

// Query structure comes from validated names and links. AI text is never executed as SQL.
export function buildQueryExercise(spec,pkg){
  assert.ok(validateCaseSpec(spec).valid,'A validated case model is required.');
  const byName=new Map(spec.entities.map(e=>[e.name,e]));
  const rows=new Map(pkg.records.map(g=>[g.entity,g.rows]));
  const table=name=>'portfolio.'+id(name);
  const queries=spec.queries.map(q=>{
    const entities=q.entities.map(n=>byName.get(n));let sql,description;
    if(q.kind==='join'){
      const aliases=new Map([[entities[0].name,'t0']]);let from=`${table(entities[0].name)} t0`;
      while(aliases.size<entities.length){
        let next;
        for(const child of entities)for(const fk of child.foreignKeys){
          if(!q.entities.includes(fk.targetEntity)||child.name===fk.targetEntity)continue;
          if(aliases.has(child.name)!==aliases.has(fk.targetEntity)){next={child,fk};break;}
        }
        if(!next)throw new Error('Query links cannot be joined.');
        const {child,fk}=next,name=aliases.has(child.name)?fk.targetEntity:child.name;
        aliases.set(name,'t'+aliases.size);
        const on=fk.fields.map((f,i)=>`${aliases.get(child.name)}.${id(f)} = ${aliases.get(fk.targetEntity)}.${id(fk.targetFields[i])}`).join(' AND ');
        from+=`\nJOIN ${table(name)} ${aliases.get(name)} ON ${on}`;
      }
      const used=new Set(),columns=[];
      for(const [ei,e] of entities.entries()){
        const detail=e.fields.find(f=>!e.primaryKey.includes(f.name)&&!e.foreignKeys.some(fk=>fk.fields.includes(f.name)));
        for(const [fi,f] of [...e.primaryKey.map(n=>e.fields.find(f=>f.name===n)),...(detail?[detail]:[])].entries()){
          let label=(e.name+'_'+f.name).slice(0,63);if(used.has(label))label=label.slice(0,54)+'_'+ei+'_'+fi;used.add(label);
          columns.push(`${aliases.get(e.name)}.${id(f.name)} AS ${id(label)}`);
        }
      }
      sql=`SELECT ${columns.join(',\n       ')}\nFROM ${from}\nORDER BY ${entities.map(e=>e.primaryKey.map(f=>`${aliases.get(e.name)}.${id(f)}`).join(', ')).join(', ')}\nLIMIT 20;`;
      description='Show related '+entities.map(e=>e.name).join(', ')+' records (up to 20).';
    }else if(q.kind==='filter'){
      const e=entities[0],field=e.name===spec.optimisation.entity?spec.optimisation.filterField:(e.fields.find(f=>!e.primaryKey.includes(f.name))||e.fields[0]).name;
      const value=rows.get(e.name)?.[0]?.[field];assert.notEqual(value,undefined,'A filter example needs a saved seed value.');
      sql=`SELECT * FROM ${table(e.name)}\nWHERE ${id(field)} IS NOT DISTINCT FROM ${literal(value)}\nORDER BY ${e.primaryKey.map(id).join(', ')}\nLIMIT 20;`;
      description=`Find ${e.name} records where ${field} matches ${JSON.stringify(value)} (up to 20).`;
    }else{
      const e=entities.find(e=>e.foreignKeys.length)||entities[0],field=e.foreignKeys[0]?.fields[0]||(e.fields.find(f=>!e.primaryKey.includes(f.name))||e.fields[0]).name;
      sql=`SELECT ${id(field)}, count(*) AS record_count\nFROM ${table(e.name)}\nGROUP BY ${id(field)}\nORDER BY record_count DESC, ${id(field)} NULLS LAST\nLIMIT 20;`;
      description=`Count ${e.name} records for each ${field} (up to 20 groups).`;
    }
    return {id:q.id,kind:q.kind,proposedPurpose:q.purpose,description,sql};
  });
  const e=byName.get(spec.optimisation.entity),field=e.fields.find(f=>f.name===spec.optimisation.filterField),column=id(field.name),lab='query_lab.'+id(e.name),n=spec.optimisation.benchmarkRows;
  let rowId='lab_row_id';while(rowId===field.name)rowId+='x';
  const value=k=>({id:`(${k} % 1000)::bigint`,integer:`(${k} % 1000)::integer`,decimal:`((${k} % 1000)::numeric / 10)`,text:`('value-' || (${k} % 1000)::text)`,boolean:`(${k} % 1000 = 42)`,date:`(DATE '2030-01-01' + (${k} % 1000)::integer)`,timestamp:`(TIMESTAMPTZ '2030-01-01T00:00:00Z' + (${k} % 1000) * INTERVAL '1 second')`}[field.type]);
  const setup=`-- A separate performance table using the case's ${e.name}.${field.name} type.\n-- Only this field and a lab row ID are copied. Business constraints stay in Portfolio 1.\n-- Generated values are for measuring a selective lookup, not complete case records.\nCREATE SCHEMA query_lab;\nCREATE TABLE ${lab} AS\nSELECT ${column}, 0::bigint AS ${id(rowId)} FROM portfolio.${id(e.name)} WITH NO DATA;\nINSERT INTO ${lab} (${column}, ${id(rowId)})\nSELECT ${value('g')}, g FROM generate_series(1, ${n}) AS g;\nANALYZE ${lab};\n`;
  const query=`SELECT ${id(rowId)}, ${column}\nFROM ${lab}\nWHERE ${column} = ${value('42')}\nORDER BY ${id(rowId)};`;
  const index=`CREATE INDEX p2_filter_idx ON ${lab} USING btree (${column});`;
  const explain=`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)\n${query}`;
  return {queries,benchmark:{entity:e.name,field:field.name,type:field.type,rows:n,rowId,setup,query,index,explain,repetitions:3}};
}
export function summarisePlan(doc){
  const entry=doc[0];assert.ok(entry?.Plan&&Number.isFinite(entry['Execution Time']),'Invalid EXPLAIN ANALYZE result.');
  const nodes=[];const visit=n=>{nodes.push({type:n['Node Type'],...(n['Index Name']?{index:n['Index Name']}:{}),rows:n['Actual Rows'],loops:n['Actual Loops']});(n.Plans||[]).forEach(visit);};visit(entry.Plan);
  return {executionMs:entry['Execution Time'],planningMs:entry['Planning Time'],sharedHitBlocks:entry.Plan['Shared Hit Blocks']||0,sharedReadBlocks:entry.Plan['Shared Read Blocks']||0,nodes};
}
export function compareQueryPlans(before,after){
  assert.equal(before.length,3);assert.equal(after.length,3);
  const summaries={before:before.map(summarisePlan),after:after.map(summarisePlan)};
  const median=items=>items.map(s=>s.executionMs).sort((a,b)=>a-b)[1];
  const beforeMs=median(summaries.before),afterMs=median(summaries.after);
  return {...summaries,beforeMedianMs:beforeMs,afterMedianMs:afterMs,changePercent:beforeMs>0?(beforeMs-afterMs)/beforeMs*100:null,indexUsed:summaries.after.some(p=>p.nodes.some(n=>n.index==='p2_filter_idx'))};
}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const tableHTML=rows=>{if(!rows.length)return '<p>No matching rows.</p>';const fields=Object.keys(rows[0]);return `<div class="scroll"><table><thead><tr>${fields.map(f=>`<th>${esc(f)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,20).map(row=>`<tr>${fields.map(f=>`<td>${esc(typeof row[f]==='object'&&row[f]!==null?JSON.stringify(row[f]):row[f]===null?'NULL':row[f])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;};
export function buildQueryDocuments(report,exercise,results,before,after){
  assert.equal(report.status,'passed','Failed runs cannot produce passing documents.');
  const {benchmark:b}=exercise,c=report.comparison;
  const conclusion=`Median execution time changed from ${c.beforeMedianMs} ms to ${c.afterMedianMs} ms. ${c.afterMedianMs<c.beforeMedianMs?'The indexed query was faster in this run.':c.afterMedianMs===c.beforeMedianMs?'The measured median was unchanged.':'The indexed query was slower in this run.'} ${c.indexUsed?'PostgreSQL used p2_filter_idx.':'PostgreSQL did not choose p2_filter_idx; index creation alone does not guarantee its use.'}`;
  const method=`The original Portfolio 1 schema and sample rows were recreated in a temporary database. The query lab contains ${b.rows.toLocaleString('en-US')} generated rows using the ${b.entity}.${b.field} data type plus a lab row ID. It copies no business constraints and is a separate performance experiment. The original case tables are unchanged. A selective lookup is measured three times before and three times after a B-tree index, with a result query warming each phase. Normal planner settings are used. Results are identical (${report.matchingRows} rows; SHA-256 ${report.resultSha256}). This is a small warm-cache experiment on one machine, not a production benchmark. Indexes also consume storage and add work to inserts and updates.`;
  const queryBody=`<h1>${esc(report.title)} — query results</h1><p>Portfolio 2 · Query Processing and Optimisation (7 marks): SQL, actual results, execution plans, indexing and a short comparison.</p>${results.map((r,i)=>`<h2>${i+1}. ${esc(r.description)}</h2><pre>${esc(r.sql)}</pre>${tableHTML(r.rows)}<details><summary>Actual execution plan</summary><pre>${esc(JSON.stringify(r.plan,null,2))}</pre></details>`).join('')}<p>Captured: ${esc(report.finishedAt)}. SQL and plans are saved alongside this page.</p>`;
  const phaseRows=['before','after'].map(phase=>`<tr><td>${phase==='before'?'Before index':'After index'}</td><td>${c[phase+'MedianMs']}</td><td>${c[phase].map(p=>p.executionMs).join(', ')}</td><td>${c[phase][1].nodes.map(n=>n.type+(n.index?' ('+n.index+')':'')).join(' → ')}</td><td>${c[phase][1].sharedHitBlocks} / ${c[phase][1].sharedReadBlocks}</td></tr>`).join('');
  const performanceBody=`<h1>${esc(report.title)} — index comparison</h1><p>Portfolio 2 · ${b.rows.toLocaleString('en-US')} synthetic performance rows · ${report.matchingRows} matching rows · results unchanged</p><pre>${esc(b.query)}</pre><pre>${esc(b.index)}</pre><div class="scroll"><table><tr><th>Phase</th><th>Median execution (ms)</th><th>Three runs (ms)</th><th>Middle-run plan nodes</th><th>Shared hit / read blocks</th></tr>${phaseRows}</table></div><p class="note">${esc(conclusion)}</p><p>${esc(method)}</p><p>Index size: ${report.indexBytes} bytes. Database: ${esc(report.postgresVersion)}. Cleanup: ${esc(report.cleanup)}.</p>${['Before','After'].map((label,i)=>`<details><summary>${label}: all three actual JSON plans</summary><pre>${esc(JSON.stringify(i?after:before,null,2))}</pre></details>`).join('')}<p>Captured: ${esc(report.finishedAt)}</p>`;
  const markdown=`# ${report.title} — Portfolio 2\n\n## Query Processing and Optimisation (7 marks)\n\n${results.map((r,i)=>`### ${i+1}. ${r.description}\n\n\`\`\`sql\n${r.sql}\n\`\`\`\n\nActual result (${r.rows.length} rows, limited to 20):\n\n\`\`\`json\n${JSON.stringify(r.rows,null,2)}\n\`\`\``).join('\n\n')}\n\n## Index comparison\n\n${method}\n\n| Phase | Median execution (ms) | Three execution times (ms) |\n| --- | ---: | --- |\n| Before | ${c.beforeMedianMs} | ${c.before.map(p=>p.executionMs).join(', ')} |\n| After | ${c.afterMedianMs} | ${c.after.map(p=>p.executionMs).join(', ')} |\n\n${conclusion}\n\nIndex storage: ${report.indexBytes} bytes. The JSON plans include actual rows, node types and buffer counts. Lower execution time is not a guaranteed outcome.\n\n## Short explanation\n\nA sequential scan checks the table rows. A B-tree index can help PostgreSQL find a small matching group without checking every row. ANALYZE supplies statistics to the planner. EXPLAIN ANALYZE actually executes the query and records its plan and time; BUFFERS adds block access counts. Planning time is separate from execution time.\n\n## References\n\n- [PostgreSQL: Using EXPLAIN](https://www.postgresql.org/docs/17/using-explain.html)\n- [PostgreSQL: Indexes](https://www.postgresql.org/docs/17/indexes.html)\n- [PostgreSQL: ANALYZE](https://www.postgresql.org/docs/17/sql-analyze.html)\n\nGenerated from the saved case model and actual database output. Review the query choices, results and interpretation before submission.\n`;
  return {queriesHTML:evidencePage(report.title+' — query results',queryBody),performanceHTML:evidencePage(report.title+' — index comparison',performanceBody),markdown};
}

export async function runQueryOptimisation(spec,pkg,runsDirectory){
  const exercise=buildQueryExercise(spec,pkg),schema=renderPostgresSchema(spec,{version:1,rules:pkg.rules}),seed=renderExecutionSQL(spec,pkg).seed;
  const uuid=randomUUID(),directory=path.resolve(runsDirectory,'postgres-queries-'+uuid);await mkdir(directory,{mode:0o700});
  const save=(name,value)=>writeFile(path.join(directory,name),value,{flag:'wx',mode:0o600});
  const report={kind:'live_query_optimisation',title:spec.scenario.title,status:'running',directory,startedAt:new Date().toISOString(),reviewedFingerprint:schema.fingerprint,executionPackageSha256:digest(pkg),image:'postgres:17-alpine',container:'mit8103-queries-'+uuid,network:'none',publishedPorts:[],cleanup:'pending',databaseExecuted:false};
  const {benchmark:b}=exercise;let owned=false,results=[],before=[],after=[];
  await save('Queries.sql',exercise.queries.map(q=>`-- ${q.description}\n${q.sql}\n\nEXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)\n${q.sql}`).join('\n\n')+'\n');
  await save('Benchmark.sql',b.setup+'\n-- Before: warm the lookup, then measure it three times.\n'+b.query+'\n'+Array(3).fill(b.explain).join('\n')+'\n\n'+b.index+'\n\n-- After: run the same lookup and repeat the measurements.\n'+b.query+'\n'+Array(3).fill(b.explain).join('\n')+'\n');
  await save('QueryDefinitions.json',JSON.stringify(exercise,null,2)+'\n');
  try{
    report.imageId=(await dockerCommand(['image','inspect',report.image,'--format','{{.Id}}'])).stdout.trim();
    await dockerCommand(['run','-d','--name',report.container,'--label','mit8103.generator=queries','--network','none','--memory','512m','--cpus','1','--pids-limit','128','--security-opt','no-new-privileges','--env','POSTGRES_HOST_AUTH_METHOD=trust',report.image]);owned=true;
    let ready=false;for(let i=0;i<40;i++){try{await dockerCommand(['exec',report.container,'pg_isready','-h','127.0.0.1','-U','postgres'],'',5000);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}if(!ready)throw new Error('Query database did not become ready.');
    const psql=(sql,admin=false)=>dockerCommand(['exec','-i',report.container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-P','pager=off','-U',admin?'postgres':'portfolio_runner','-d',admin?'postgres':'portfolio_queries'],sql);
    const json=async sql=>JSON.parse((await psql(sql)).stdout.trim());
    const resultRows=sql=>json(`SELECT coalesce(json_agg(r),'[]'::json) FROM (${sql.trim().replace(/;$/,'')}) r;`);
    await psql('CREATE ROLE portfolio_runner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;\nCREATE DATABASE portfolio_queries OWNER portfolio_runner;',true);
    const setup=await psql(schema.sql+'\n'+seed);report.databaseExecuted=true;await save('DatabaseSetup.log',setup.stdout+setup.stderr);
    report.postgresVersion=(await psql('SELECT version();')).stdout.trim();
    for(const q of exercise.queries){const rows=await resultRows(q.sql),plan=await json('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)\n'+q.sql);summarisePlan(plan);results.push({...q,rows,plan});}
    await save('QueryResults.json',JSON.stringify(results,null,2)+'\n');
    const load=await psql(b.setup);await save('BenchmarkSetup.log',load.stdout+load.stderr);
    assert.equal(Number((await psql('SELECT count(*) FROM query_lab.'+id(b.entity)+';')).stdout.trim()),b.rows);
    const originalData=await json(`SELECT coalesce(json_agg(t),'[]'::json) FROM (SELECT * FROM portfolio.${id(b.entity)} ORDER BY ${spec.entities.find(e=>e.name===b.entity).primaryKey.map(id).join(', ')}) t;`);
    const initial=await resultRows(b.query);assert.ok(initial.length>0,'Benchmark lookup must match rows.');
    for(let i=0;i<3;i++)before.push(await json(b.explain));
    const index=await psql(b.index);await save('IndexCreation.log',index.stdout+index.stderr);
    const indexed=await resultRows(b.query);assert.deepEqual(indexed,initial,'Indexing changed the result rows.');
    for(let i=0;i<3;i++)after.push(await json(b.explain));
    const preserved=await json(`SELECT coalesce(json_agg(t),'[]'::json) FROM (SELECT * FROM portfolio.${id(b.entity)} ORDER BY ${spec.entities.find(e=>e.name===b.entity).primaryKey.map(id).join(', ')}) t;`);
    assert.deepEqual(preserved,originalData,'Benchmark changed the case table.');
    report.indexBytes=Number((await psql("SELECT pg_relation_size('query_lab.p2_filter_idx');")).stdout.trim());
    report.status='passed';report.comparison=compareQueryPlans(before,after);report.matchingRows=initial.length;report.resultSha256=digest(initial);report.checks={queries:results.length,benchmarkRows:b.rows,identicalResults:true,caseTableUnchanged:true,planRuns:6};
    await save('BeforePlans.json',JSON.stringify(before,null,2)+'\n');await save('AfterPlans.json',JSON.stringify(after,null,2)+'\n');await save('LookupResults.json',JSON.stringify(indexed,null,2)+'\n');
  }catch(error){report.status='failed';report.error=error.message;await save('Failure.log',error.message+'\n'+(error.stdout||'')+(error.stderr||''));}
  finally{
    if(owned){try{await dockerCommand(['rm','-f','-v',report.container]);report.cleanup='removed_owned_container_and_anonymous_volumes';}catch(error){report.status='failed';report.cleanup='failed';report.cleanupError=error.message;}}else report.cleanup='no_owned_container';
    report.finishedAt=new Date().toISOString();await save('Report.json',JSON.stringify(report,null,2)+'\n');
    if(report.status==='passed'){const docs=buildQueryDocuments(report,exercise,results,before,after);await save('QueryResults.html',docs.queriesHTML);await save('Performance.html',docs.performanceHTML);await save('Analysis.md',docs.markdown);}
  }
  return report;
}
