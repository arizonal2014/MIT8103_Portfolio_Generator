import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateCaseSpec, parseCaseSpec, buildCasePrompt } from '../lib/case-spec.mjs';
import { libraryCase, hospitalCase } from '../examples/cases.mjs';
import { createScaffold } from '../lib/scaffold.mjs';
import { createServer } from '../server.mjs';

for(const make of [libraryCase,hospitalCase])test(`accepts hand-authored ${make().scenario.title}`,()=>{
  const result=validateCaseSpec(make());
  assert.equal(result.valid,true,JSON.stringify(result.errors));
  assert.equal(result.relationships.length,3);
  assert.equal(result.fingerprint.length,64);
  assert.match(result.warnings[0],/Structural validation only/);
});
const mutations=[
  ['unknown entity',s=>s.entities[3].foreignKeys[0].targetEntity='missing'],
  ['unknown field',s=>s.entities[3].foreignKeys[0].fields=['missing']],
  ['duplicate table',s=>s.entities[1].name='member'],
  ['duplicate field',s=>s.entities[0].fields[1].name='member_id'],
  ['optional primary key',s=>s.entities[0].fields[0].required=false],
  ['nonunique target',s=>s.entities[3].foreignKeys[0].targetFields=['full_name']],
  ['incompatible types',s=>s.entities[3].fields[1].type='text'],
  ['wrong key length',s=>s.entities[3].foreignKeys[0].fields=['member_id','copy_id']],
  ['invalid transaction rule',s=>s.transactions.concurrencyRuleId='missing'],
  ['mismatched transaction entity',s=>s.transactions.entity='member'],
  ['unique concurrency on a check rule',s=>s.transactions.concurrencyRuleId='valid_due_date'],
  ['unknown NoSQL source',s=>s.noSql.sourceEntities.push('unknown')],
  ['embedded entity outside sources',s=>s.noSql.embeddedEntities.push('unknown')],
  ['missing query kind',s=>s.queries[2].kind='filter'],
  ['disconnected join',s=>s.queries[0].entities=['member','book']],
  ['unknown benchmark field',s=>s.optimisation.filterField='missing'],
  ['unsafe identifier',s=>s.entities[0].name='member;drop_table'],
  ['raw executable field',s=>s.shell='echo nope'],
  ['claimed distributed implementation',s=>s.distributed.mode='implemented'],
  ['real data flag',s=>s.syntheticDataOnly=false],
  ['empty scenario',s=>s.scenario.description='     '],
  ['duplicate query IDs',s=>s.queries[1].id=s.queries[0].id],
];
for(const [name,mutate]of mutations)test(`rejects ${name}`,()=>{
  const spec=libraryCase();mutate(spec);const result=validateCaseSpec(spec);
  assert.equal(result.valid,false);assert.ok(result.errors.length>0);assert.equal(result.fingerprint,undefined);
});
test('optional and unique foreign keys produce appropriate cardinalities',()=>{
  const spec=libraryCase();spec.entities[3].fields[1].required=false;spec.entities[3].uniqueKeys=[['member_id']];
  const result=validateCaseSpec(spec);assert.equal(result.valid,true);
  const relationship=result.relationships.find(r=>r.to==='member');
  assert.equal(relationship.parentPerChild,'zero_or_one');assert.equal(relationship.childrenPerParent,'zero_or_one');
});
test('normalises object key order in fingerprint without mutating the spec',()=>{
  const original=libraryCase();const copy=structuredClone(original);
  const reordered=Object.fromEntries(Object.entries(original).reverse());
  assert.equal(validateCaseSpec(original).fingerprint,validateCaseSpec(reordered).fingerprint);
  assert.deepEqual(original,copy);
});
test('rejects malformed, fenced or oversized responses',()=>{
  for(const value of ['not JSON','```json\n{}\n```','x'.repeat(100001),null])assert.equal(parseCaseSpec(value).valid,false);
  assert.equal(parseCaseSpec(JSON.stringify(libraryCase())).valid,true);
  assert.equal(validateCaseSpec(null).valid,false);
});
test('provider prompt uses only the scenario and schema, with no identity fields',()=>{
  const prompt=buildCasePrompt('Hospital appointment system');
  assert.match(prompt,/SCENARIO_JSON: "Hospital appointment system"/);
  assert.match(prompt,/SCHEMA_JSON/);assert.match(prompt,/Student names and IDs are intentionally omitted/);
  assert.throws(()=>buildCasePrompt(''));
});
test('invalid specification does not create a run; valid one saves named model and report',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'mit8103-case-test-'));
  const input={firstName:'Alex',surname:'Nwosu',studentId:'000123',provider:'copilot',caseStudy:'Hospital appointment system'};
  await assert.rejects(createScaffold({...input,caseSpec:{}},root));
  assert.deepEqual(await readdir(root),[]);
  const result=await createScaffold({...input,caseSpec:hospitalCase()},root);
  assert.equal(result.caseSpecification.status,'structurally_valid');
  assert.equal(result.caseSpecification.executionVerified,false);
  assert.ok(result.stages.every(s=>s.status==='pending'));
  const saved=JSON.parse(await readFile(path.join(result.outputDirectory,`${result.input.prefix}_CaseSpec.json`),'utf8'));
  assert.equal(saved.scenario.title,'Hospital appointment system');
});
test('validation endpoints report real structural results, not successful execution',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'mit8103-case-http-'));
  const server=createServer({runsDirectory:root});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const example=await fetch(origin+'/api/examples/hospital');assert.equal(example.status,200);
  const spec=await example.json();
  const post=data=>fetch(origin+'/api/case-spec/check',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
  const success=await post({spec});assert.equal(success.status,200);assert.equal((await success.json()).valid,true);
  spec.transactions.entity='made_up';
  const bad=await post({spec});assert.equal(bad.status,422);assert.equal((await bad.json()).valid,false);
  assert.deepEqual(await readdir(root),[]);
});
