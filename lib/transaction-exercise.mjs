import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {identifier as id,literal,renderExecutionSQL} from './execution-package.mjs';
import {renderPostgresSchema} from './postgres-schema.mjs';
import {dockerCommand} from './postgres-pilot.mjs';
import {escapeHTML as esc,evidencePage} from './postgres-case.mjs';

export function buildTransactionExercise(spec,pkg){
  const schema=renderPostgresSchema(spec,{version:1,rules:pkg.rules});
  const seed=renderExecutionSQL(spec,pkg).seed;
  const entity=spec.entities.find(e=>e.name===spec.transactions.entity);
  const row=pkg.records.find(g=>g.entity===entity.name).rows[0];
  let field='p3_processed_count';while(entity.fields.some(f=>f.name===field))field+='x';
  let constraint='p3_count_nonnegative';while(spec.businessRules.some(r=>r.id===constraint))constraint+='x';
  const table='portfolio.'+id(entity.name),column=id(field);
  const where=entity.primaryKey.map(f=>`${id(f)} IS NOT DISTINCT FROM ${literal(row[f])}`).join(' AND ');
  const record=Object.fromEntries(entity.primaryKey.map(f=>[f,row[f]]));
  const state=`SELECT json_build_object('record',json_build_object(${entity.primaryKey.map(f=>`${literal(f)},${id(f)}`).join(',')}),'processed_count',${column}) FROM ${table} WHERE ${where}`;
  const set=value=>`UPDATE ${table} SET ${column} = ${value} WHERE ${where} RETURNING json_build_object('processed_count',${column});`;
  const setup=`-- This helper counter exists only in the temporary transaction exercise.\n-- Original case columns and constraints are preserved. It is not part of the P1 design.\nALTER TABLE ${table} ADD COLUMN ${column} integer NOT NULL DEFAULT 0;\nALTER TABLE ${table} ADD CONSTRAINT ${id(constraint)} CHECK (${column} >= 0);\n`;
  const begin='BEGIN ISOLATION LEVEL READ COMMITTED;';
  const commit=`${begin}\n${set(column+' + 1')}\nCOMMIT;\n${state};\n`;
  const rollback=`${begin}\n${set(column+' + 10')}\n-- A negative counter deliberately fails its CHECK. Keep psql open so ROLLBACK can run.\n\\set ON_ERROR_STOP off\n\\set VERBOSITY verbose\n${set('-1')}\n\\echo P3_ERROR_STATE :SQLSTATE\n-- A failed transaction rejects another statement until it is rolled back.\nSELECT 1;\n\\echo P3_ABORTED_STATE :SQLSTATE\nROLLBACK;\n\\set ON_ERROR_STOP on\n${state};\n`;
  const read=`${state};`,lock=`${state} FOR UPDATE;`;
  const concurrency=`-- Two-session exercise. Run numbered blocks in order, in the indicated psql terminal.\n-- Start after CommitRollback.sql has left the helper counter at 1.\n\n-- 1. Session A: read 1.\n${begin}\n${read}\n-- 2. Session B: also read 1 before A writes.\n${begin}\n${read}\n-- 3. Session A: write the value calculated from its earlier read.\n${set('2')}\nCOMMIT;\n-- 4. Session B: write its stale value. The final count is 2, so one increment is lost.\n${set('2')}\nCOMMIT;\n${read}\n\n-- 5. Reset for an equal starting point. Run outside both transactions.\n${set('1')}\n-- 6. Session A: lock the row before reading.\n${begin}\n${lock}\n-- 7. Session B: request the same row lock. This statement waits.\n${begin}\n${lock}\n-- 8. Session A: update and release the lock by committing.\n${set('2')}\nCOMMIT;\n-- 9. Session B: its SELECT now returns 2. Apply the second increment and commit.\n${set('3')}\nCOMMIT;\n${read}\n`;
  return {entity:entity.name,record,field,constraint,table,column,where,schema:schema.sql,fingerprint:schema.fingerprint,seed,setup,begin,read,lock,set,commit,rollback,concurrency};
}

// Keep psql sessions alive: a separate docker exec per statement would lose the transaction.
export function openTransactionSession(container,label){
  const env={PATH:process.env.PATH,HOME:process.env.HOME};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CONFIG'])if(process.env[key])env[key]=process.env[key];
  const child=spawn('docker',['exec','-i','-e','PGAPPNAME=mit8103-'+label,container,'sh','-c','exec psql -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off -U portfolio_runner -d portfolio_transactions 2>&1'],{env,stdio:['pipe','pipe','pipe']});
  let pending=null,closed=false,output='',errors='',trace='',total=0;
  const fail=error=>{if(pending){const current=pending;pending=null;clearTimeout(current.timer);current.reject(error);}};
  child.stdin.on('error',()=>{});child.on('error',fail);
  const ended=new Promise(resolve=>child.on('close',code=>{closed=true;fail(new Error(`Session ${label} closed with code ${code}. ${errors.slice(-1000)}`));resolve();}));
  const collect=(kind,data)=>{
    const text=data.toString();total+=Buffer.byteLength(text);
    if(total>2000000){fail(new Error('Transaction session output limit exceeded.'));child.kill('SIGTERM');return;}
    if(kind==='stderr'){errors+=text;return;}
    output+=text;
    if(!pending)return;
    const marker='\n'+pending.marker+'\n',position=('\n'+output).indexOf(marker);
    if(position<0)return;
    const current=pending;pending=null;clearTimeout(current.timer);
    const stdout=output.slice(0,position).trim(),stderr=errors.slice(current.errorStart);
    trace+=stdout+'\n'+stderr;output='';current.resolve({stdout,stderr});
  };
  child.stdout.on('data',data=>collect('stdout',data));child.stderr.on('data',data=>collect('stderr',data));
  return {
    async query(sql){
      if(closed)throw new Error('Transaction session is closed.');if(pending)throw new Error('A query is already running in this session.');
      trace+=`\n-- ${new Date().toISOString()} · ${label}\n${sql}\n`;
      return new Promise((resolve,reject)=>{const marker='P3_DONE_'+randomUUID().replaceAll('-','');const timer=setTimeout(()=>{fail(new Error(`Session ${label} timed out.`));child.kill('SIGTERM');},20000);pending={marker,resolve,reject,timer,errorStart:errors.length};child.stdin.write(sql+'\n\\echo '+marker+'\n');});
    },
    transcript:()=>trace,
    async close(){if(closed)return;if(pending){fail(new Error('Session closed during a pending query.'));child.kill('SIGTERM');}else child.stdin.end('\\q\n');const timer=setTimeout(()=>child.kill('SIGTERM'),1500);await ended;clearTimeout(timer);},
  };
}
const jsonOutput=result=>JSON.parse(result.stdout.trim());
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function verifyTransactionResults(results){
  const {commit,rollback,lostUpdate,locked}=results;
  assert.equal(commit.before.processed_count,0);assert.equal(commit.uncommitted.processed_count,1);
  assert.equal(commit.observerBeforeCommit.processed_count,0,'Uncommitted changes leaked.');assert.equal(commit.after.processed_count,1,'Commit did not persist.');
  assert.equal(rollback.inside.processed_count,11);assert.equal(rollback.observerDuring.processed_count,1);
  assert.equal(rollback.errorState,'23514');assert.equal(rollback.abortedState,'25P02');assert.equal(rollback.after.processed_count,1,'Rollback did not restore the earlier state.');
  assert.equal(lostUpdate.readA.processed_count,1);assert.equal(lostUpdate.readB.processed_count,1);assert.equal(lostUpdate.after.processed_count,2);
  assert.equal(locked.readA.processed_count,1);assert.equal(locked.readB.processed_count,2);assert.equal(locked.after.processed_count,3);
  assert.notEqual(locked.sessionA,locked.sessionB);assert.ok(locked.wait.blockers.includes(locked.sessionA));assert.equal(locked.wait.waiting_pid,locked.sessionB);assert.equal(locked.wait.wait_event_type,'Lock');
  assert.equal(locked.isolationA,'read committed');assert.equal(locked.isolationB,'read committed');
  return {commitPersisted:true,uncommittedChangeHidden:true,rollbackRestoredState:true,expectedFailureVerified:true,lostUpdateObserved:true,blockingObserved:true,rowLockPreventedLostUpdate:true,distinctSessions:true,isolationVerified:true};
}

export function buildTransactionDocuments(report,exercise){
  assert.equal(report.status,'passed','Failed transactions cannot produce passing evidence.');verifyTransactionResults(report.results);
  const {results:r}=report,scope=`The exercise recreated the Portfolio 1 schema and seed data. It selected ${exercise.entity} record ${JSON.stringify(exercise.record)} and added the temporary helper field ${exercise.field}. That counter makes database changes visible without changing the original business fields. It is not part of the original relational design and is removed with the temporary database. This demonstrates transaction behaviour, not a full implementation of every case operation.`;
  const locking=`Two independent PostgreSQL sessions used READ COMMITTED. Without locking before reading, both read 1 and wrote 2, so one increment was lost. After resetting the counter to 1, Session A used SELECT FOR UPDATE. Session B waited for that same row. PostgreSQL reported B's actual blocking session. When A committed 2, B read 2 and committed 3. Both increments were retained. The model proposed ${report.plannedConcurrencyMethod}; this implemented exercise uses row locking to demonstrate the stale-read problem consistently across case studies. Existing unique constraints remain in force.`;
  const rows=[['Before',r.commit.before.processed_count],['Session A: uncommitted update',r.commit.uncommitted.processed_count],['Session B: before A commits',r.commit.observerBeforeCommit.processed_count],['After COMMIT (separate connection)',r.commit.after.processed_count],['Inside the later transaction',r.rollback.inside.processed_count],['Session B during that transaction',r.rollback.observerDuring.processed_count],['After the CHECK failure and ROLLBACK',r.rollback.after.processed_count]];
  const htmlTable=items=>`<div class="scroll"><table><tr><th>Observation</th><th>Actual value</th></tr>${items.map(([label,value])=>`<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`).join('')}</table></div>`;
  const commitHTML=evidencePage(report.title+' — commit and rollback',`<h1>${esc(report.title)} — commit and rollback</h1><p>Portfolio 3 · Transactions and Concurrency (7 marks)</p><p>${esc(scope)}</p>${htmlTable(rows)}<p class="note">CHECK failure: SQLSTATE ${r.rollback.errorState}. Statement in the aborted transaction: SQLSTATE ${r.rollback.abortedState}. Explicit ROLLBACK restored the committed value.</p><details><summary>Executed SQL example</summary><pre>${esc(exercise.commit+'\n'+exercise.rollback)}</pre></details><p>Original business columns unchanged: ${report.checks.originalColumnsUnchanged}. Cleanup: ${esc(report.cleanup)}. Captured: ${esc(report.finishedAt)}.</p>`);
  const concurrencyHTML=evidencePage(report.title+' — concurrency',`<h1>${esc(report.title)} — concurrent updates</h1><p>Portfolio 3 · Isolation: ${esc(r.locked.isolationA)} · actual two-session run</p><p>${esc(scope)}</p>${htmlTable([['Read before locking: both read',`${r.lostUpdate.readA.processed_count} and ${r.lostUpdate.readB.processed_count}`],['Read before locking: final counter',r.lostUpdate.after.processed_count],['Expected after two increments from 1',3],['With FOR UPDATE: A reads, then B reads',`${r.locked.readA.processed_count}, then ${r.locked.readB.processed_count}`],['With FOR UPDATE: final counter',r.locked.after.processed_count]])}<p class="note">Session B (${r.locked.sessionB}) was observed waiting for Session A (${r.locked.sessionA}). Wait type: ${esc(r.locked.wait.wait_event_type)}; event: ${esc(r.locked.wait.wait_event)}.</p><p>${esc(locking)}</p><details><summary>Actual PostgreSQL blocking observation</summary><pre>${esc(JSON.stringify(r.locked.wait,null,2))}</pre></details><details><summary>Two-session SQL steps</summary><pre>${esc(exercise.concurrency)}</pre></details><p>Row locks last until the transaction ends. Keep transactions short and lock multiple rows in a consistent order to reduce deadlocks. An atomic UPDATE counter = counter + 1 is another solution for this simple counter; larger workflows still need their own concurrency design.</p><p>Cleanup: ${esc(report.cleanup)}. Captured: ${esc(report.finishedAt)}.</p>`);
  const markdown=`# ${report.title} — Portfolio 3\n\n## Transactions and Concurrency (7 marks)\n\n${scope}\n\n## Commit and rollback\n\n| Observation | Actual value |\n| --- | ---: |\n${rows.map(([label,value])=>`| ${label} | ${value} |`).join('\n')}\n\nThe deliberate CHECK failure returned ${r.rollback.errorState}; the next statement returned ${r.rollback.abortedState} because the transaction was aborted. Explicit ROLLBACK returned the counter to 1. Another session could see only the committed value. This proves visibility and rollback behaviour; it is not a crash-recovery experiment.\n\n## Isolation and concurrent updates\n\n${locking}\n\nActual backend PIDs: A=${r.locked.sessionA}, B=${r.locked.sessionB}. Wait event: ${r.locked.wait.wait_event_type}/${r.locked.wait.wait_event}. Without an early lock, the final counter was ${r.lostUpdate.after.processed_count}; with locking, it was ${r.locked.after.processed_count}.\n\nREAD COMMITTED does not make an application-side read/compute/write sequence safe automatically. Lock before reading, read the latest value after obtaining the lock, update and commit. An atomic counter increment is another option for this particular example. Row locks are not a substitute for every domain constraint. Keep transactions short and use a consistent row-lock order.\n\n## References\n\n- [PostgreSQL: Transactions](https://www.postgresql.org/docs/17/tutorial-transactions.html)\n- [PostgreSQL: Transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html)\n- [PostgreSQL: Explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html)\n\nGenerated from actual session output. Review the SQL and its relation to the chosen case before submission.\n`;
  return {commitHTML,concurrencyHTML,markdown};
}

export async function runTransactionExercise(spec,pkg,runsDirectory){
  const exercise=buildTransactionExercise(spec,pkg),uuid=randomUUID(),directory=path.resolve(runsDirectory,'postgres-transactions-'+uuid);await mkdir(directory,{mode:0o700});
  const save=(name,data)=>writeFile(path.join(directory,name),data,{flag:'wx',mode:0o600});
  const report={kind:'live_transaction_exercise',title:spec.scenario.title,directory,status:'running',startedAt:new Date().toISOString(),reviewedFingerprint:exercise.fingerprint,executionPackageSha256:hash(pkg),image:'postgres:17-alpine',container:'mit8103-transactions-'+uuid,network:'none',publishedPorts:[],cleanup:'pending',databaseExecuted:false,plannedConcurrencyMethod:spec.transactions.concurrencyMethod,implementedConcurrencyMethod:'row_lock',entity:exercise.entity,record:exercise.record,helperField:exercise.field};
  for(const [name,data] of [['Setup.sql',exercise.setup],['CommitRollback.sql',exercise.commit+'\n'+exercise.rollback],['Concurrency.sql',exercise.concurrency]])await save(name,data);
  let owned=false,A,B;
  try{
    report.imageId=(await dockerCommand(['image','inspect',report.image,'--format','{{.Id}}'])).stdout.trim();
    await dockerCommand(['run','-d','--name',report.container,'--label','mit8103.generator=transactions','--network','none','--memory','512m','--cpus','1','--pids-limit','128','--security-opt','no-new-privileges','--env','POSTGRES_HOST_AUTH_METHOD=trust',report.image]);owned=true;
    let ready=false;for(let i=0;i<40;i++){try{await dockerCommand(['exec',report.container,'pg_isready','-h','127.0.0.1','-U','postgres'],'',5000);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}if(!ready)throw new Error('Transaction database did not become ready.');
    const psql=(sql,admin=false)=>dockerCommand(['exec','-i',report.container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-P','pager=off','-U',admin?'postgres':'portfolio_runner','-d',admin?'postgres':'portfolio_transactions'],sql);
    const json=async(sql,admin=false)=>JSON.parse((await psql(sql,admin)).stdout.trim());
    await psql('CREATE ROLE portfolio_runner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;\nCREATE DATABASE portfolio_transactions OWNER portfolio_runner;',true);
    const setup=await psql(exercise.schema+'\n'+exercise.seed+'\n'+exercise.setup);report.databaseExecuted=true;await save('DatabaseSetup.log',setup.stdout+setup.stderr);
    const sourceSnapshotSQL='SELECT json_build_object('+spec.entities.map(e=>`${literal(e.name)},(SELECT coalesce(json_agg(r),'[]'::json) FROM (SELECT ${e.fields.map(f=>id(f.name)).join(', ')} FROM portfolio.${id(e.name)} ORDER BY ${e.primaryKey.map(id).join(', ')}) r)`).join(', ')+');';
    const original=await json(sourceSnapshotSQL);A=openTransactionSession(report.container,'session-a');B=openTransactionSession(report.container,'session-b');
    const sessionA=Number((await A.query('SELECT pg_backend_pid();')).stdout),sessionB=Number((await B.query('SELECT pg_backend_pid();')).stdout);assert.ok(Number.isInteger(sessionA)&&sessionA>0&&Number.isInteger(sessionB)&&sessionB>0&&sessionA!==sessionB,'Two separate PostgreSQL sessions are required.');
    const state=()=>json(exercise.read),results={commit:{before:await state()},rollback:{},lostUpdate:{},locked:{sessionA,sessionB}};
    await A.query(exercise.begin);results.locked.isolationA=(await A.query('SHOW transaction_isolation;')).stdout.trim();
    results.commit.uncommitted=jsonOutput(await A.query(exercise.set(exercise.column+' + 1')));
    results.commit.observerBeforeCommit=jsonOutput(await B.query(exercise.read));await A.query('COMMIT;');results.commit.after=await state();
    await A.query(exercise.begin);results.rollback.inside=jsonOutput(await A.query(exercise.set(exercise.column+' + 10')));results.rollback.observerDuring=jsonOutput(await B.query(exercise.read));
    const failure=await A.query(`\\set ON_ERROR_STOP off\n\\set VERBOSITY verbose\n${exercise.set('-1')}\n\\echo P3_ERROR_STATE :SQLSTATE\nSELECT 1;\n\\echo P3_ABORTED_STATE :SQLSTATE\nROLLBACK;\n\\set ON_ERROR_STOP on`);
    results.rollback.errorState=failure.stdout.match(/P3_ERROR_STATE ([A-Z0-9]{5})/)?.[1];results.rollback.abortedState=failure.stdout.match(/P3_ABORTED_STATE ([A-Z0-9]{5})/)?.[1];
    assert.ok((failure.stdout+failure.stderr).includes(exercise.constraint),'The intended CHECK constraint was not reported.');results.rollback.after=await state();
    await A.query(exercise.begin);await B.query(exercise.begin);
    results.lostUpdate.readA=jsonOutput(await A.query(exercise.read));results.lostUpdate.readB=jsonOutput(await B.query(exercise.read));
    await A.query(exercise.set(String(results.lostUpdate.readA.processed_count+1))+'\nCOMMIT;');await B.query(exercise.set(String(results.lostUpdate.readB.processed_count+1))+'\nCOMMIT;');results.lostUpdate.after=await state();
    await psql('-- Reset only the helper counter so the two experiments start equally.\n'+exercise.set('1'));
    await A.query(exercise.begin);results.locked.readA=jsonOutput(await A.query(exercise.lock));await B.query(exercise.begin);results.locked.isolationB=(await B.query('SHOW transaction_isolation;')).stdout.trim();
    // Launch B without awaiting it. Inspect the real blocker before allowing A to commit.
    const pending=B.query(exercise.lock).catch(error=>({error}));
    for(let i=0;i<35;i++){
      const wait=await json(`SELECT row_to_json(s) FROM (SELECT pid AS waiting_pid,pg_blocking_pids(pid) AS blockers,wait_event_type,wait_event,state FROM pg_stat_activity WHERE pid=${sessionB}) s;`,true);
      if(wait?.blockers?.includes(sessionA)&&wait.wait_event_type==='Lock'){results.locked.wait=wait;break;}
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(results.locked.wait,'PostgreSQL did not report B waiting for A.');
    await A.query(exercise.set(String(results.locked.readA.processed_count+1))+'\nCOMMIT;');const resumed=await pending;if(resumed.error)throw resumed.error;results.locked.readB=jsonOutput(resumed);
    await B.query(exercise.set(String(results.locked.readB.processed_count+1))+'\nCOMMIT;');results.locked.after=await state();
    report.results=results;report.checks=verifyTransactionResults(results);
    assert.deepEqual(await json(sourceSnapshotSQL),original,'Original business columns changed.');report.checks.originalColumnsUnchanged=true;
    report.postgresVersion=(await psql('SELECT version();')).stdout.trim();report.status='passed';await save('Results.json',JSON.stringify(results,null,2)+'\n');await save('Blocking.json',JSON.stringify(results.locked.wait,null,2)+'\n');
  }catch(error){report.status='failed';report.error=error.message;await save('Failure.log',error.message+'\n'+(error.stdout||'')+(error.stderr||''));}
  finally{
    for(const [label,session] of [['SessionA',A],['SessionB',B]])if(session){try{await session.close();}catch{}await save(label+'.log',session.transcript());}
    if(owned){try{await dockerCommand(['rm','-f','-v',report.container]);report.cleanup='removed_owned_container_and_anonymous_volumes';}catch(error){report.status='failed';report.cleanup='failed';report.cleanupError=error.message;}}else report.cleanup='no_owned_container';
    report.finishedAt=new Date().toISOString();await save('Report.json',JSON.stringify(report,null,2)+'\n');
    if(report.status==='passed'){const docs=buildTransactionDocuments(report,exercise);await save('CommitRollback.html',docs.commitHTML);await save('Concurrency.html',docs.concurrencyHTML);await save('Analysis.md',docs.markdown);}
  }
  return report;
}
