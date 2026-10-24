import {documentStyle} from './document-style.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {dockerCommand as command} from './postgres-pilot.mjs';
import {renderPostgresSchema} from './postgres-schema.mjs';
import {identifier,literal,renderExecutionSQL} from './execution-package.mjs';

export const escapeHTML=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export const evidencePage=(title,body)=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHTML(title)}</title><style>${documentStyle}body{font:16px/1.6 "IBM Plex Sans",sans-serif;margin:32px auto;padding:0 24px;max-width:1160px;color:#000000;background:#ffffff}h1{font-size:30px;line-height:1.3}h2{font-size:23px;margin-top:32px}.note{background:#ffffff;padding:16px;border-radius:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;border:1px solid #777777;padding:16px;font:13px/1.5 ui-monospace,monospace}.scroll{overflow:auto;margin:12px 0 20px;border:1px solid #777777;background:white}table{border-collapse:collapse;font-size:13px;white-space:nowrap;width:100%}th,td{padding:8px 11px;text-align:left;border-bottom:1px solid #777777}th{background:#ffffff}svg{width:100%;height:auto}summary{cursor:pointer;font-weight:650}small{color:#000000}</style><main>${body}</main></html>`;

export function caseCatalogSQL(spec){
  const data=spec.entities.map(e=>`${literal(e.name)},(SELECT coalesce(json_agg(r ORDER BY ${e.primaryKey.map(identifier).join(', ')}),'[]'::json) FROM portfolio.${identifier(e.name)} r)`).join(',\n');
  return `SELECT json_build_object('version',version(),
 'tables',(SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='portfolio'),
 'constraints',(SELECT json_agg(json_build_object('table',c.relname,'name',k.conname,'type',k.contype,'definition',pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='portfolio'),
 'indexes',(SELECT json_agg(json_build_object('name',indexname,'definition',indexdef,'unique',i.indisunique,'predicate',pg_get_expr(i.indpred,i.indrelid)) ORDER BY indexname) FROM pg_indexes x JOIN pg_class c ON c.relname=x.indexname JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=x.schemaname JOIN pg_index i ON i.indexrelid=c.oid WHERE x.schemaname='portfolio'),
 'columns',(SELECT json_agg(json_build_object('table',table_name,'column',column_name,'nullable',is_nullable) ORDER BY table_name,ordinal_position) FROM information_schema.columns WHERE table_schema='portfolio'),
 'data',json_build_object(${data}));`;
}
export async function runCasePostgres(spec,pkg,runsDirectory){
  const plan={version:1,rules:pkg.rules},rendered=renderPostgresSchema(spec,plan),sql=renderExecutionSQL(spec,pkg);
  const id=randomUUID(),directory=path.resolve(runsDirectory,'postgres-case-'+id);await mkdir(directory,{mode:0o700});
  const save=(name,content)=>writeFile(path.join(directory,name),content,{flag:'wx',mode:0o600});
  for(const [name,content] of [['ReviewedCaseSpec.json',JSON.stringify(spec,null,2)],['ExecutionPackage.json',JSON.stringify(pkg,null,2)],['ExecutionPlan.json',JSON.stringify(plan,null,2)],['Schema.sql',rendered.sql],['Seed.sql',sql.seed],['ConstraintTests.sql',sql.tests]])await save(name,content+'\n');
  const report={kind:'live_case_postgres',title:spec.scenario.title,startedAt:new Date().toISOString(),status:'running',directory,reviewedFingerprint:rendered.fingerprint,executionPackageSha256:createHash('sha256').update(JSON.stringify(pkg)).digest('hex'),schemaSha256:createHash('sha256').update(rendered.sql).digest('hex'),image:'postgres:17-alpine',container:'mit8103-case-'+id,network:'none',publishedPorts:[],databaseExecuted:false,cleanup:'pending'};
  let owned=false;
  try{
    report.imageId=(await command(['image','inspect',report.image,'--format','{{.Id}}'])).stdout.trim();
    await command(['run','-d','--name',report.container,'--label','mit8103.generator=case','--network','none','--memory','512m','--cpus','1','--pids-limit','128','--security-opt','no-new-privileges','--env','POSTGRES_HOST_AUTH_METHOD=trust',report.image]);owned=true;
    let ready=false;for(let i=0;i<40;i++){try{await command(['exec',report.container,'pg_isready','-U','postgres'],'',5000);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
    if(!ready)throw new Error('The isolated database did not become ready.');
    const psql=(input,admin=false,compact=false)=>command(['exec','-i',report.container,'psql','-X','-v','ON_ERROR_STOP=1','-P','pager=off','-U',admin?'postgres':'portfolio_runner','-d',admin?'postgres':'portfolio_case',...(compact?['-A','-t']:[])],input);
    await psql('CREATE ROLE portfolio_runner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;\nCREATE DATABASE portfolio_case OWNER portfolio_runner;',true);
    const schema=await psql(rendered.sql);report.databaseExecuted=true;await save('SchemaExecution.log',schema.stdout+schema.stderr);
    const seed=await psql(sql.seed);await save('SeedExecution.log',seed.stdout+seed.stderr);
    const before=JSON.parse((await psql(caseCatalogSQL(spec),false,true)).stdout.trim());
    for(const group of pkg.records){const actual=before.data[group.entity],fields=spec.entities.find(e=>e.name===group.entity).fields;
      assert.equal(actual.length,group.rows.length,'Seed row count differs.');
      const signature=row=>JSON.stringify(fields.map(f=>f.type==='timestamp'&&row[f.name]!==null?Date.parse(row[f.name]):row[f.name]));
      assert.deepEqual(actual.map(signature).sort(),group.rows.map(signature).sort(),'Database seed values differ from the package.');
    }
    const tests=await psql(sql.tests);await save('ConstraintTests.log',tests.stdout+tests.stderr);
    assert.equal((tests.stderr.match(/NOTICE:  PASS /g)||[]).length,pkg.negativeTests.length,'A rejection check is missing.');
    const actual=JSON.parse((await psql(caseCatalogSQL(spec),false,true)).stdout.trim());await save('Catalog.json',JSON.stringify(actual,null,2)+'\n');
    assert.deepEqual(actual.data,before.data,'Negative tests changed the valid sample data.');
    assert.deepEqual(actual.tables,spec.entities.map(e=>e.name).sort());
    const expected={p:spec.entities.length,f:spec.entities.reduce((n,e)=>n+e.foreignKeys.length,0),u:spec.entities.reduce((n,e)=>n+e.uniqueKeys.length,0),c:spec.businessRules.filter(r=>r.enforcement==='check').length};
    for(const [type,count] of Object.entries(expected))assert.equal((actual.constraints||[]).filter(c=>c.type===type).length,count,`Catalog count differs: ${type}`);
    for(const e of spec.entities)for(const f of e.fields)assert.equal(actual.columns.find(c=>c.table===e.name&&c.column===f.name)?.nullable,f.required?'NO':'YES');
    for(const r of spec.businessRules.filter(r=>r.enforcement==='partial_unique')){const index=actual.indexes.find(i=>i.name===r.id);assert.ok(index?.unique&&index.predicate,'Partial unique index was not found.');}
    const inspection=await psql('\\dt portfolio.*\n'+spec.entities.map(e=>'\\d portfolio.'+e.name).join('\n')+'\n');await save('TablesAndConstraints.log',inspection.stdout+inspection.stderr);
    report.status='passed';report.checks={tables:expected.p,primaryKeys:expected.p,foreignKeys:expected.f,uniqueConstraints:expected.u,checkConstraints:expected.c,partialUniqueIndexes:spec.businessRules.filter(r=>r.enforcement==='partial_unique').length,rejectedInvalidRecords:pkg.negativeTests.length,seedRows:pkg.records.reduce((n,g)=>n+g.rows.length,0),requiredColumnsVerified:true,negativeTestsPreservedData:true};
  }catch(error){report.status='failed';report.error=error.message;if(error.stdout||error.stderr)await save('Failure.log',(error.stdout||'')+(error.stderr||''));}
  finally{
    if(owned){try{await command(['rm','-f','-v',report.container]);report.cleanup='removed_owned_container_and_anonymous_volumes';}catch(error){report.status='failed';report.cleanup='failed';report.cleanupError=error.message;}}else report.cleanup='no_owned_container';
    report.finishedAt=new Date().toISOString();await save('Report.json',JSON.stringify(report,null,2)+'\n');
    if(report.status==='passed')await save('Evidence.html',evidencePage(spec.scenario.title+' — database evidence',`<h1>${escapeHTML(spec.scenario.title)}</h1><p>Saved output from the automated PostgreSQL run.</p><p class="note">Status: passed · ${report.checks.tables} tables · ${report.checks.rejectedInvalidRecords} invalid-record tests rejected</p><p>Completed: ${report.finishedAt}<br>Cleanup: ${report.cleanup}</p><h2>Constraint tests</h2><pre>${escapeHTML(await readFile(path.join(directory,'ConstraintTests.log'),'utf8'))}</pre><details><summary>Tables, keys and constraints</summary><pre>${escapeHTML(await readFile(path.join(directory,'TablesAndConstraints.log'),'utf8'))}</pre></details>`));
  }
  return report;
}
