import test from 'node:test';
import assert from 'node:assert/strict';
import {libraryCase} from '../examples/cases.mjs';
import {renderPostgresSchema} from '../lib/postgres-schema.mjs';

const plan=()=>({version:1,rules:[
  {ruleId:'one_open_copy',keyFields:['copy_id'],predicate:{op:'is_null',field:'returned_at'}},
  {ruleId:'valid_due_date',predicate:{op:'gt_fields',left:'due_at',right:'borrowed_at'}},
]});
test('renders keys and explicit constraints from the same validated model',()=>{
  const {sql,fingerprint}=renderPostgresSchema(libraryCase(),plan());
  assert.match(sql,/CREATE UNIQUE INDEX "one_open_copy".*\("copy_id"\) WHERE \("returned_at" IS NULL\)/);
  assert.match(sql,/CHECK \("due_at" > "borrowed_at"\)/);assert.equal((sql.match(/CREATE TABLE/g)||[]).length,4);
  assert.equal((sql.match(/FOREIGN KEY/g)||[]).length,3);assert.equal(fingerprint.length,64);
  assert.ok(sql.lastIndexOf('CREATE TABLE')<sql.indexOf('ADD CONSTRAINT'));assert.ok(sql.endsWith('COMMIT;\n'));
});
test('refuses to infer missing, duplicate or unused rule bindings',()=>{
  assert.throws(()=>renderPostgresSchema(libraryCase(),{version:1,rules:[]}),/Missing explicit binding/);
  const p=plan();p.rules.push(p.rules[0]);assert.throws(()=>renderPostgresSchema(libraryCase(),p),/Duplicate/);
  const invalid=plan();invalid.rules[0].keyFields=['copy_id','member_id'];assert.throws(()=>renderPostgresSchema(libraryCase(),invalid),/outside/);
});
test('rejects raw SQL, unknown fields, extra properties and incompatible comparisons',()=>{
  for(const predicate of [{op:'raw',sql:'DROP TABLE member'},{op:'is_null',field:'missing'},
    {op:'is_null',field:'returned_at',sql:'injected'}, {op:'gt_fields',left:'copy_id',right:'returned_at'}]){
    const p=plan();p.rules[0].predicate=predicate;assert.throws(()=>renderPostgresSchema(libraryCase(),p));
  }
});
test('unsupported workflow rules stop generation instead of being omitted',()=>{
  const spec=libraryCase();spec.businessRules.push({id:'staff_approval',description:'Staff approval is required.',entity:'loan',fields:['loan_id'],enforcement:'workflow'});
  assert.throws(()=>renderPostgresSchema(spec,plan()),/Workflow rules/);
});
test('prose and malicious identifiers do not become executable SQL',()=>{
  const spec=libraryCase();spec.entities[0].purpose='DROP TABLE anything;';
  assert.ok(!renderPostgresSchema(spec,plan()).sql.includes('DROP TABLE'));
  spec.entities[0].name='member;DROP';assert.throws(()=>renderPostgresSchema(spec,plan()),/failed validation/);
});
