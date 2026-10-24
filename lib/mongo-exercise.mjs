import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateCaseSpec} from './case-spec.mjs';
import {renderExecutionSQL} from './execution-package.mjs';
import {dockerCommand} from './postgres-pilot.mjs';
import {escapeHTML as esc,evidencePage} from './postgres-case.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const keyFor=(entity,row)=>Object.fromEntries(entity.primaryKey.map(f=>[f,row[f]]));

export function buildMongoExercise(spec,pkg){
  const validation=validateCaseSpec(spec);assert.ok(validation.valid,'A validated case model is required.');
  renderExecutionSQL(spec,pkg); // Reuse the seed/key/rule preflight; no SQL is executed here.
  const model=spec.noSql,byName=new Map(spec.entities.map(e=>[e.name,e])),groups=new Map(pkg.records.map(g=>[g.entity,g.rows]));
  const reaches=name=>{const seen=new Set();const walk=n=>{if(seen.has(n))return;seen.add(n);byName.get(n).foreignKeys.forEach(f=>walk(f.targetEntity));};walk(name);return seen;};
  const candidates=[...new Set([pkg.normalisationRoot,spec.transactions.entity,...model.sourceEntities])].filter(n=>model.sourceEntities.includes(n));
  const rootName=candidates.find(n=>model.sourceEntities.every(s=>reaches(n).has(s)));
  if(!rootName)throw new Error('The NoSQL sources need a shared record that links to them. Review the saved source/embedding plan before retrying.');
  const root=byName.get(rootName),eventTypes=model.eventTypes.slice(0,2),documents=[],mapping=[];
  function relatedRows(row){
    const found=new Map(),seen=new Set(),queue=[{entity:root,row,via:rootName}];
    while(queue.length){
      const current=queue.shift(),signature=current.entity.name+':'+JSON.stringify(keyFor(current.entity,current.row));
      if(seen.has(signature)){const existing=found.get(signature);if(existing&&!existing.via.includes(current.via))existing.via.push(current.via);continue;}
      seen.add(signature);
      if(current.entity.name!==rootName&&model.sourceEntities.includes(current.entity.name))found.set(signature,{entity:current.entity.name,key:keyFor(current.entity,current.row),snapshot:structuredClone(current.row),via:[current.via]});
      for(const fk of current.entity.foreignKeys){
        if(fk.fields.some(f=>current.row[f]===null))continue;
        const matches=groups.get(fk.targetEntity).filter(r=>fk.fields.every((f,i)=>r[fk.targetFields[i]]===current.row[f]));
        if(matches.length!==1)throw new Error('A related snapshot does not have one matching saved record.');
        queue.push({entity:byName.get(fk.targetEntity),row:matches[0],via:current.via+'.'+fk.fields.join('+')+' → '+fk.targetEntity});
      }
    }
    return [...found.values()];
  }
  for(const [rowNumber,row] of groups.get(rootName).entries()){
    const related=relatedRows(row),embedded=Object.fromEntries(model.embeddedEntities.filter(n=>n!==rootName).map(n=>[n,related.filter(r=>r.entity===n).map(({entity,...value})=>value)]));
    const references=Object.fromEntries(model.sourceEntities.filter(n=>n!==rootName&&!model.embeddedEntities.includes(n)).map(n=>[n,related.filter(r=>r.entity===n).map(r=>({key:r.key,via:r.via}))]));
    const data=[{entity:rootName,key:keyFor(root,row),snapshot:row},...related],attributes=[],examples={};
    for(const field of model.variableFields){
      const matches=data.filter(r=>Object.hasOwn(r.snapshot,field));
      if(matches.length){for(const item of matches)attributes.push({entity:item.entity,key:item.key,field,value:item.snapshot[field]});}
      else examples[field]='illustrative '+field;
      if(rowNumber===0)mapping.push({field,mode:matches.length?'copied from linked seed records':'illustrative event metadata',entities:[...new Set(matches.map(r=>r.entity))]});
    }
    for(const [variant,eventType] of eventTypes.entries()){
      const sequence=documents.length;
      const details=variant===0?{channel:'web'}:{channel:'mobile',note:'Illustrative event-specific metadata',...(attributes.length?{attributes}:{}),...(Object.keys(examples).length?{examples}:{})};
      documents.push({_id:'event_'+String(sequence+1).padStart(6,'0'),schemaVersion:1,simulation:true,eventType,occurredAt:{$date:new Date(Date.UTC(2030,0,1,10,sequence)).toISOString()},source:{entity:rootName,key:keyFor(root,row),snapshot:structuredClone(row)},embedded,references,details});
    }
  }
  if(Buffer.byteLength(JSON.stringify(documents))>400000)throw new Error('Keep this document example small by embedding fewer source records (maximum 400 KB of sample documents).');
  const validator={$jsonSchema:{bsonType:'object',required:['_id','schemaVersion','simulation','eventType','occurredAt','source','embedded','references','details'],properties:{
    _id:{bsonType:'string',minLength:1},schemaVersion:{enum:[1]},simulation:{enum:[true]},eventType:{bsonType:'string',enum:eventTypes},occurredAt:{bsonType:'date'},
    source:{bsonType:'object',required:['entity','key','snapshot'],properties:{entity:{enum:[rootName]},key:{bsonType:'object',required:root.primaryKey},snapshot:{bsonType:'object'}}},embedded:{bsonType:'object'},references:{bsonType:'object'},details:{bsonType:'object'},
  }}};
  const firstKey=keyFor(root,groups.get(rootName)[0]);
  const queries=[
    {id:'event-type',description:'Find the first sample event type (up to five documents).',kind:'find',filter:{eventType:eventTypes[0]},limit:5},
    {id:'record-history',description:'Find events for the first source record using nested key fields (up to five).',kind:'find',filter:Object.fromEntries(Object.entries(firstKey).map(([f,value])=>['source.key.'+f,value])),limit:5},
    {id:'date-range',description:'Find events in the sample time range using a MongoDB Date filter (up to five).',kind:'find',filter:{occurredAt:{$gte:{$date:documents[0].occurredAt.$date},$lt:{$date:new Date(Date.UTC(2030,0,1,11)).toISOString()}}},limit:5},
    {id:'event-counts',description:'Count documents for each event type.',kind:'aggregate',pipeline:[{$group:{_id:'$eventType',documentCount:{$sum:1}}},{$sort:{_id:1}}]},
  ];
  const modelInfo={collection:model.collection,purpose:model.documentPurpose,sourceEntities:model.sourceEntities,anchorEntity:rootName,embeddedEntities:model.embeddedEntities.filter(n=>n!==rootName),referenceEntities:model.sourceEntities.filter(n=>n!==rootName&&!model.embeddedEntities.includes(n)),eventTypes,variableFieldMapping:mapping,coreFields:{_id:'Unique string event ID',schemaVersion:'Document model version',simulation:'true: all events are illustrative examples',eventType:'One of the two selected case event labels',occurredAt:'Native BSON Date; sample timestamps are in 2030',source:'Original entity, primary key and saved JSON snapshot',embedded:'Linked record snapshots read with the event',references:'Keys for linked sources kept outside the embedded snapshots',details:'Event metadata whose fields vary'},validator};
  return {fingerprint:validation.fingerprint,model:modelInfo,documents,queries};
}

// Only this trusted template is executable. Scenario text and saved rows are JSON data.
export function mongoExecutionScript(exercise){
  const input=JSON.stringify(JSON.stringify({collection:exercise.model.collection,validator:exercise.model.validator,documents:exercise.documents,queries:exercise.queries}));
  return `// Run once in a fresh empty MongoDB database with mongosh --file this-file.js.\n// Illustrative case events; executing inserts is real, but the events are not inferred history.\n(async function runPortfolio4(){\nconst INPUT = EJSON.parse(${input});\nconst database = db;\nconst ping = await database.runCommand({ping:1});\nconst version = await database.version();\nawait database.createCollection(INPUT.collection,{validator:INPUT.validator,validationLevel:'strict',validationAction:'error'});\nconst collection=database.getCollection(INPUT.collection);\nconst inserted=await collection.insertMany(INPUT.documents,{ordered:true});\nawait collection.createIndex({eventType:1,occurredAt:-1},{name:'event_type_time'});\nconst queries=[];\nfor(const query of INPUT.queries){\n  const rows=query.kind==='find'?await collection.find(query.filter).sort({_id:1}).limit(query.limit).toArray():await collection.aggregate(query.pipeline).toArray();\n  queries.push({...query,rows});\n}\nconst rejections=[];\nfor(const test of [{name:'invalid_date',code:121,row:{...INPUT.documents[0],_id:'invalid_date_example',occurredAt:'not-a-date'}},{name:'duplicate_event_id',code:11000,row:{...INPUT.documents[0]}}]){\n  let actualCode=null;\n  try{await collection.insertOne(test.row);}catch(error){actualCode=error.code;}\n  if(actualCode!==test.code)throw new Error(test.name+': expected '+test.code+', received '+actualCode);\n  rejections.push({test:test.name,expectedCode:test.code,actualCode});\n}\nconst documents=await collection.find({}).sort({_id:1}).toArray();\nconst indexes=await collection.getIndexes();\nconst info=(await database.getCollectionInfos({name:INPUT.collection}))[0];\nprint('P4_RESULT '+EJSON.stringify({ping:ping.ok,version,collection:INPUT.collection,insertedCount:Object.keys(inserted.insertedIds).length,insertion:inserted,documents,queries,rejections,indexes,validator:info.options.validator,validationLevel:info.options.validationLevel,validationAction:info.options.validationAction},null,0,{relaxed:true}));\n})().catch(error=>{print(error.stack||String(error));quit(1);});\n`;
}

// Relaxed Extended JSON can omit .000; compare BSON Date instants, keeping raw output intact.
function canonicalDocuments(documents){
  return documents.map(doc=>{
    assert.ok(doc.occurredAt&&typeof doc.occurredAt==='object'&&Object.keys(doc.occurredAt).length===1&&typeof doc.occurredAt.$date==='string','Expected an Extended JSON BSON Date.');
    const instant=new Date(doc.occurredAt.$date);assert.ok(Number.isFinite(instant.getTime()),'Invalid BSON Date.');
    return {...doc,occurredAt:{$date:instant.toISOString()}};
  });
}

export function verifyMongoResults(exercise,result){
  assert.equal(result.ping,1);assert.equal(result.insertion.acknowledged,true);assert.deepEqual(Object.values(result.insertion.insertedIds),exercise.documents.map(d=>d._id));assert.equal(result.collection,exercise.model.collection);assert.equal(result.insertedCount,exercise.documents.length);
  assert.deepEqual(canonicalDocuments(result.documents),canonicalDocuments(exercise.documents),'Stored documents differ, or rejection checks changed data.');
  assert.deepEqual(result.validator,exercise.model.validator);assert.equal(result.validationLevel,'strict');assert.equal(result.validationAction,'error');
  assert.ok(result.indexes.some(i=>i.name==='_id_'&&i.key._id===1));assert.ok(result.indexes.some(i=>i.name==='event_type_time'&&i.key.eventType===1&&i.key.occurredAt===-1));
  assert.deepEqual(result.rejections.map(r=>[r.test,r.actualCode]),[['invalid_date',121],['duplicate_event_id',11000]]);
  assert.equal(result.queries.length,4);
  for(const [i,query] of exercise.queries.entries()){
    const actual=result.queries[i];assert.equal(actual.id,query.id);assert.equal(actual.kind,query.kind);
    let expected;
    if(query.id==='event-type')expected=exercise.documents.filter(d=>d.eventType===query.filter.eventType).slice(0,5);
    if(query.id==='record-history')expected=exercise.documents.filter(d=>Object.entries(query.filter).every(([field,value])=>d.source.key[field.slice('source.key.'.length)]===value)).slice(0,5);
    if(query.id==='date-range')expected=exercise.documents.filter(d=>Date.parse(d.occurredAt.$date)>=Date.parse(query.filter.occurredAt.$gte.$date)&&Date.parse(d.occurredAt.$date)<Date.parse(query.filter.occurredAt.$lt.$date)).slice(0,5);
    if(query.id==='event-counts')expected=exercise.model.eventTypes.map(type=>({_id:type,documentCount:exercise.documents.filter(d=>d.eventType===type).length})).sort((a,b)=>a._id<b._id?-1:a._id>b._id?1:0);
    assert.deepEqual(query.kind==='find'?canonicalDocuments(actual.rows):actual.rows,query.kind==='find'?canonicalDocuments(expected):expected,'Query results differ: '+query.id);
  }
  assert.notDeepEqual(exercise.documents[0].details,exercise.documents[1].details,'Metadata examples must vary.');
  return {connectionVerified:true,insertedDocuments:exercise.documents.length,verifiedQueries:4,eventTypes:2,validationRejections:2,storedDocumentsMatch:true,variableMetadataVerified:true,indexesVerified:true,validationVerified:true};
}

function mongoLiteral(value){
  if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&typeof value.$date==='string')return `ISODate(${JSON.stringify(value.$date)})`;
  if(Array.isArray(value))return '['+value.map(mongoLiteral).join(', ')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+':'+mongoLiteral(item)).join(', ')+'}';
  return JSON.stringify(value);
}
export function renderMongoQuery(collection,query){
  const target=`db.getCollection(${JSON.stringify(collection)})`;
  return query.kind==='find'?`${target}.find(${mongoLiteral(query.filter)}).sort({_id:1}).limit(${query.limit})`:`${target}.aggregate(${mongoLiteral(query.pipeline)})`;
}

export function buildMongoDocuments(report,exercise,result){
  assert.equal(report.status,'passed','Failed MongoDB runs cannot produce passing evidence.');verifyMongoResults(exercise,result);
  const m=exercise.model,scope='These are illustrative event documents built from saved case records. Their labels, order and sample timestamps do not assert real business history. The inserts and query results below came from an actual MongoDB run.';
  const rationale=`The collection ${m.collection} keeps a stable event envelope while details can differ between ${m.eventTypes.join(' and ')}. ${m.embeddedEntities.length?'Related '+m.embeddedEntities.join(', ')+' snapshots can be read with an event.':'The source snapshot is embedded in each event.'} ${m.referenceEntities.length?m.referenceEntities.join(', ')+' is identified by reference keys.':'The source record is identified by its saved key.'} Embedding reduces extra reads but duplicates data, and snapshots can become stale. MongoDB does not enforce PostgreSQL foreign keys or synchronise these stores. The original relational model remains the reference for its keys and business rules.`;
  const shape=`<div class="scroll"><table><tr><th>Field</th><th>Meaning</th></tr>${Object.entries(m.coreFields).map(([field,meaning])=>`<tr><td>${esc(field)}</td><td>${esc(meaning)}</td></tr>`).join('')}</table></div>`;
  const modelHTML=evidencePage(report.title+' — MongoDB document model',`<h1>${esc(report.title)} — MongoDB model</h1><p>Portfolio 4 · NoSQL and Advanced Data Models (7 marks)</p><p>Collection: <strong>${esc(m.collection)}</strong> · Source entity: ${esc(m.anchorEntity)}</p>${shape}<p>${esc(rationale)}</p><details><summary>Two example documents with different metadata</summary><pre>${esc(JSON.stringify(exercise.documents.slice(0,2),null,2))}</pre></details><details><summary>Core-field validator and metadata mapping</summary><pre>${esc(JSON.stringify({validator:m.validator,variableFieldMapping:m.variableFieldMapping},null,2))}</pre></details><p>${esc(scope)}</p>`);
  const querySource=q=>renderMongoQuery(m.collection,q);
  const resultsHTML=evidencePage(report.title+' — MongoDB results',`<h1>${esc(report.title)} — MongoDB results</h1><p>Portfolio 4 · MongoDB ${esc(result.version)} · Collection: ${esc(m.collection)}</p><p class="note">${result.insertedCount} documents inserted · 4 query results verified · 2 expected rejections · stored documents unchanged after the rejection tests</p><div class="scroll"><table><tr><th>Query</th><th>Returned rows</th></tr>${result.queries.map(q=>`<tr><td>${esc(q.description)}</td><td>${q.rows.length}</td></tr>`).join('')}</table></div><p>Indexes: ${result.indexes.map(i=>esc(i.name)).join(', ')}. Schema validation rejected the wrong date type (121); the unique event ID rejected a duplicate (11000).</p>${result.queries.map(q=>`<details><summary>${esc(q.description)}</summary><pre>${esc(querySource(q))}</pre><pre>${esc(JSON.stringify(q.rows,null,2))}</pre></details>`).join('')}<p>${esc(scope)}</p><p>Cleanup: ${esc(report.cleanup)}. Captured: ${esc(report.finishedAt)}.</p>`);
  const markdown=`# ${report.title} — Portfolio 4\n\n## NoSQL and Advanced Data Models (7 marks)\n\nCollection: ${m.collection}. Anchor entity: ${m.anchorEntity}.\n\n${scope}\n\n## Document model\n\n${Object.entries(m.coreFields).map(([field,meaning])=>'- '+field+': '+meaning).join('\n')}\n\n${rationale}\n\nThe event timestamp is a native BSON Date. Imported snapshot dates remain the saved JSON ISO strings. Variable fields copied from linked records are labelled in Model.json; unmatched fields have clearly illustrative example values. Core fields are validated while details can vary.\n\n## Implementation and queries\n\nMongoDB ${result.version} inserted ${result.insertedCount} documents. The four query outputs were checked against the generated examples. A compound index supports the event type/time access pattern; this exercise does not claim a measured speed improvement.\n\n${result.queries.map(q=>'### '+q.description+'\n\n```javascript\n'+querySource(q)+'\n```\n\nActual result:\n\n```json\n'+JSON.stringify(q.rows,null,2)+'\n```').join('\n\n')}\n\n## Validation\n\nA wrong timestamp type was rejected with error 121. Reusing an event ID was rejected with 11000. All stored documents still matched the input afterwards.\n\nThe local run uses one isolated MongoDB instance. Replication, availability and cloud deployment are separate Portfolio 5 work. The saved script also accepts a manually supplied mongosh connection to Atlas or another MongoDB server; the app's automated route currently uses its own temporary container.\n\n## References\n\n- [MongoDB: Write scripts](https://www.mongodb.com/docs/mongodb-shell/write-scripts/)\n- [MongoDB: Schema validation](https://www.mongodb.com/docs/manual/core/schema-validation/)\n- [MongoDB: Data modelling](https://www.mongodb.com/docs/manual/data-modeling/best-practices/)\n\nReview the document choices and their suitability for the chosen case before submission.\n`;
  return {modelHTML,resultsHTML,markdown};
}

export async function runMongoExercise(spec,pkg,runsDirectory){
  const exercise=buildMongoExercise(spec,pkg),uuid=randomUUID(),directory=path.resolve(runsDirectory,'mongo-documents-'+uuid);await mkdir(directory,{mode:0o700});
  const save=(name,data)=>writeFile(path.join(directory,name),data,{flag:'wx',mode:0o600});
  const report={kind:'live_mongodb_exercise',title:spec.scenario.title,directory,status:'running',startedAt:new Date().toISOString(),reviewedFingerprint:exercise.fingerprint,executionPackageSha256:hash(pkg),image:'mongo:7.0',container:'mit8103-mongo-'+uuid,network:'none',publishedPorts:[],cleanup:'pending',databaseExecuted:false,scriptCompleted:false};
  const script=mongoExecutionScript(exercise),scriptPath=path.join(directory,'Execute.js');
  for(const [name,data] of [['Execute.js',script],['Model.json',JSON.stringify(exercise.model,null,2)+'\n'],['Documents.json',JSON.stringify(exercise.documents,null,2)+'\n'],['QueryDefinitions.json',JSON.stringify(exercise.queries,null,2)+'\n']])await save(name,data);
  let owned=false,result;
  try{
    try{report.imageId=(await dockerCommand(['image','inspect',report.image,'--format','{{.Id}}'])).stdout.trim();}catch{throw new Error('Prepare MongoDB first: run npm run setup:workspace in the workspace terminal, then retry Portfolio 4.');}
    await dockerCommand(['run','-d','--name',report.container,'--label','mit8103.generator=mongodb','--network','none','--memory','1g','--cpus','1','--pids-limit','256','--security-opt','no-new-privileges',report.image,'--bind_ip','127.0.0.1','--quiet','--setParameter','diagnosticDataCollectionEnabled=false']);owned=true;
    let ready=false;for(let i=0;i<20;i++){try{await dockerCommand(['exec',report.container,'mongosh','--norc','--quiet','mongodb://127.0.0.1:27017/portfolio_nosql','--eval','if(db.runCommand({ping:1}).ok!==1)throw new Error("MongoDB is not ready");'],'',10000);ready=true;break;}catch{const running=(await dockerCommand(['inspect',report.container,'--format','{{.State.Running}}'])).stdout.trim();if(running!=='true')throw new Error('MongoDB exited during startup. See the retained MongoDBServer.log.');await new Promise(r=>setTimeout(r,500));}}if(!ready)throw new Error('The isolated MongoDB instance did not become ready.');
    report.databaseExecuted=true;
    await dockerCommand(['cp',scriptPath,report.container+':/tmp/portfolio.js']);
    const executed=await dockerCommand(['exec',report.container,'mongosh','--norc','--quiet','mongodb://127.0.0.1:27017/portfolio_nosql','--file','/tmp/portfolio.js'],'',60000);report.scriptCompleted=true;
    await save('Execution.log',executed.stdout+executed.stderr);
    const lines=executed.stdout.split('\n').filter(line=>line.startsWith('P4_RESULT '));assert.equal(lines.length,1,'Expected exactly one MongoDB result record.');
    result=JSON.parse(lines[0].slice('P4_RESULT '.length));await save('Results.json',JSON.stringify(result,null,2)+'\n');
    report.checks=verifyMongoResults(exercise,result);report.mongoVersion=result.version;report.collection=result.collection;report.documentsSha256=hash(result.documents);report.status='passed';
  }catch(error){report.status='failed';report.error=error.message;await save('Failure.log',error.message+'\n'+(error.stdout||'')+(error.stderr||''));}
  finally{
    if(owned){try{const logs=await dockerCommand(['logs','--tail','100',report.container]);await save('MongoDBServer.log',logs.stdout+logs.stderr);}catch{}try{await dockerCommand(['rm','-f','-v',report.container]);report.cleanup='removed_owned_container_and_anonymous_volumes';}catch(error){report.status='failed';report.cleanup='failed';report.cleanupError=error.message;}}else report.cleanup='no_owned_container';
    report.finishedAt=new Date().toISOString();await save('Report.json',JSON.stringify(report,null,2)+'\n');
    if(report.status==='passed'){const docs=buildMongoDocuments(report,exercise,result);await save('DocumentModel.html',docs.modelHTML);await save('MongoDBResults.html',docs.resultsHTML);await save('Analysis.md',docs.markdown);}
  }
  return report;
}
