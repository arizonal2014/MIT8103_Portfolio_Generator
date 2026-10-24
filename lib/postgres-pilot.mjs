import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {renderPostgresSchema} from './postgres-schema.mjs';
import {reviewHospitalPilot,hospitalAssertions} from '../examples/hospital-execution.mjs';
import {renderPostgresEvidence} from './postgres-evidence.mjs';

function command(args,input='',timeout=60000){
  return new Promise((resolve,reject)=>{
    const env={PATH:process.env.PATH,HOME:process.env.HOME};
    for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CONFIG'])if(process.env[key])env[key]=process.env[key];
    const child=spawn('docker',args,{env,stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='',overflow=false,timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},timeout);
    const collect=stream=>chunk=>{if(stream==='stdout')stdout+=chunk;else stderr+=chunk;if(Buffer.byteLength(stdout)+Buffer.byteLength(stderr)>2000000){overflow=true;child.kill('SIGTERM');}};
    child.stdout.on('data',collect('stdout'));child.stderr.on('data',collect('stderr'));
    child.stdin.on('error',()=>{});child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);const result={stdout,stderr,code};if(code!==0||overflow||timedOut)reject(Object.assign(new Error(timedOut?'Docker command timed out.':overflow?'Docker output limit exceeded.':`Docker command exited ${code}.`),result));else resolve(result);});
    child.stdin.end(input);
  });
}
export {command as dockerCommand};

const catalogSql=`SELECT json_build_object(
 'version',version(),
 'tables',(SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='portfolio'),
 'constraints',(SELECT json_agg(json_build_object('table',c.relname,'name',k.conname,'type',k.contype,'definition',pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='portfolio'),
 'indexes',(SELECT json_agg(json_build_object('name',indexname,'definition',indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='portfolio'),
 'columns',(SELECT json_agg(json_build_object('table',table_name,'column',column_name,'nullable',is_nullable) ORDER BY table_name,ordinal_position) FROM information_schema.columns WHERE table_schema='portfolio'),
 'bookings',(SELECT json_agg(json_build_object('id',booking_id,'status',status) ORDER BY booking_id) FROM portfolio.booking),
 'data',json_build_object(
   'patient',(SELECT json_agg(p ORDER BY patient_id) FROM portfolio.patient p),
   'doctor',(SELECT json_agg(d ORDER BY doctor_id) FROM portfolio.doctor d),
   'slot',(SELECT json_agg(s ORDER BY slot_id) FROM portfolio.slot s),
   'booking',(SELECT json_agg(b ORDER BY booking_id) FROM portfolio.booking b)));
`;

export async function runHospitalPostgresPilot(original,runsDirectory){
  const {spec,plan}=reviewHospitalPilot(original),rendered=renderPostgresSchema(spec,plan);
  const id=randomUUID(),directory=path.resolve(runsDirectory,`postgres-pilot-${id}`);
  await mkdir(directory,{recursive:true,mode:0o700});
  const save=(name,value)=>writeFile(path.join(directory,name),value,{flag:'wx',mode:0o600});
  await save('SourceCaseSpec.json',JSON.stringify(original,null,2)+'\n');
  await save('ReviewedCaseSpec.json',JSON.stringify(spec,null,2)+'\n');
  await save('ExecutionPlan.json',JSON.stringify(plan,null,2)+'\n');
  await save('Schema.sql',rendered.sql);await save('ConstraintTests.sql',hospitalAssertions);
  const report={kind:'live_postgres_pilot',startedAt:new Date().toISOString(),status:'running',directory,
    sourceSha256:createHash('sha256').update(JSON.stringify(original)).digest('hex'),reviewedFingerprint:rendered.fingerprint,
    amendment:'Added explicit slot-end-after-start rule; defined status/cancellation and partial-unique expressions.',
    image:'postgres:17-alpine',container:'mit8103-pilot-'+id,publishedPorts:[],network:'none',databaseExecuted:false,cleanup:'pending'};
  let owned=false;
  try{
    const image=await command(['image','inspect',report.image,'--format','{{.Id}}']);report.imageId=image.stdout.trim();
    await command(['run','-d','--name',report.container,'--label','mit8103.generator=postgres-pilot','--network','none','--memory','512m','--cpus','1','--pids-limit','128','--security-opt','no-new-privileges','--env','POSTGRES_HOST_AUTH_METHOD=trust',report.image]);owned=true;
    let ready=false;for(let i=0;i<40;i++){try{await command(['exec',report.container,'pg_isready','-U','postgres'], '',5000);ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,500));}}
    if(!ready)throw new Error('Isolated PostgreSQL did not become ready.');
    const psql=(sql,admin=false,compact=false)=>command(['exec','-i',report.container,'psql','-X','-v','ON_ERROR_STOP=1','-P','pager=off','-U',admin?'postgres':'portfolio_runner','-d',admin?'postgres':'portfolio_pilot',...(compact?['-A','-t']:[])],sql);
    await psql('CREATE ROLE portfolio_runner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;\nCREATE DATABASE portfolio_pilot OWNER portfolio_runner;\n',true);
    const schema=await psql(rendered.sql);report.databaseExecuted=true;await save('SchemaExecution.log',schema.stdout+schema.stderr);
    const inspection=await psql('\\dt portfolio.*\n\\d portfolio.patient\n\\d portfolio.doctor\n\\d portfolio.slot\n\\d portfolio.booking\n');await save('TablesAndConstraints.log',inspection.stdout+inspection.stderr);
    const tests=await psql(hospitalAssertions);await save('ConstraintTests.log',tests.stdout+tests.stderr);
    const notices=tests.stderr.match(/NOTICE:  PASS /g)||[];assert.equal(notices.length,10,'Expected ten database rejection checks.');
    assert.match(tests.stdout,/PASS cancelled history retained and new active booking accepted/);
    const actual=JSON.parse((await psql(catalogSql,false,true)).stdout.trim());await save('Catalog.json',JSON.stringify(actual,null,2)+'\n');
    assert.deepEqual(actual.tables,['booking','doctor','patient','slot']);
    const expected={p:4,f:3,u:1,c:2};for(const [type,count] of Object.entries(expected))assert.equal(actual.constraints.filter(c=>c.type===type).length,count,`Unexpected constraint count: ${type}`);
    for(const entity of spec.entities)for(const field of entity.fields)assert.equal(actual.columns.find(c=>c.table===entity.name&&c.column===field.name)?.nullable,field.required?'NO':'YES');
    const active=actual.indexes.find(i=>i.name==='one_active_booking_per_slot');assert.ok(active);assert.match(active.definition,/UNIQUE INDEX.*\(slot_id\) WHERE.*status.*active/);
    assert.deepEqual(actual.bookings,[{id:1,status:'cancelled'},{id:2,status:'cancelled'},{id:3,status:'active'}]);
    report.status='passed';report.checks={tables:4,primaryKeys:4,foreignKeys:3,uniqueConstraints:1,checkConstraints:2,partialUniqueIndexes:1,rejectedInvalidRecords:10,acceptedHistoryAndRebooking:true,requiredColumnsVerified:true};
  }catch(error){report.status='failed';report.error=error.message;if(error.stdout||error.stderr)await save('Failure.log',(error.stdout||'')+(error.stderr||''));}
  finally{
    if(owned){try{await command(['rm','-f','-v',report.container]);report.cleanup='removed_owned_container_and_anonymous_volumes';}catch(error){report.cleanup='failed';report.cleanupError=error.message;report.status='failed';}}
    else report.cleanup='no_owned_container';
    report.finishedAt=new Date().toISOString();await save('Report.json',JSON.stringify(report,null,2)+'\n');
    if(report.status==='passed')await save('Evidence.html',renderPostgresEvidence(report,await readFile(path.join(directory,'TablesAndConstraints.log'),'utf8'),await readFile(path.join(directory,'ConstraintTests.log'),'utf8')));
  }
  return report;
}
