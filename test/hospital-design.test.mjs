import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reviewHospitalPilot} from '../examples/hospital-execution.mjs';
import {validateCaseSpec} from '../lib/case-spec.mjs';
import {renderHospitalER,buildHospitalNormalisation,buildHospitalDesign} from '../lib/hospital-design.mjs';
import {hospitalSnapshot} from './hospital-design-fixture.mjs';
const model=JSON.parse(await readFile(new URL('../examples/pilot-hospital.json',import.meta.url),'utf8'));
const spec=()=>reviewHospitalPilot(model).spec;

test('ER uses the reviewed model keys and all three actual relationships',()=>{
  const er=renderHospitalER(spec());
  assert.equal((er.mermaid.match(/--o\{/g)||[]).length,3);
  for(const fragment of ['patient ||--o{ booking','doctor ||--o{ slot','slot ||--o{ booking'])assert.ok(er.mermaid.includes(fragment));
  assert.ok(er.svg.includes('patient_id'));assert.ok(er.svg.includes('PK'));assert.ok(er.svg.includes('FK'));
  assert.ok(er.html.includes('Only one can be active'));assert.ok(er.html.includes(er.fingerprint));
});
test('normalisation shows unchanged 2NF and reconstructs all captured history rows',()=>{
  const snapshot=hospitalSnapshot(),normal=buildHospitalNormalisation(spec(),snapshot);
  assert.deepEqual(normal.proof.oneNF,normal.proof.twoNF);
  assert.equal(normal.proof.rowsBefore,3);assert.equal(normal.proof.rowsAfter,3);assert.equal(normal.proof.losslessForSample,true);
  assert.deepEqual(normal.proof.threeNF,snapshot.data);assert.equal(normal.proof.unf[0].bookings.length,3);
  for(const text of ['1NF','2NF','3NF','booking_id','patient_name','transitive','candidate key'])assert.ok(normal.html.includes(text));
  assert.equal((normal.markdown.match(/\| booking_id \|/g)||[]).length,3);
});
test('design refuses absent or mismatched execution provenance',()=>{
  assert.throws(()=>buildHospitalDesign(spec(),hospitalSnapshot(),'wrong-fingerprint'),/different model fingerprints/);
  assert.throws(()=>buildHospitalNormalisation(spec(),{}),/actual database record snapshot/);
  const checked=validateCaseSpec(spec());assert.equal(buildHospitalDesign(spec(),hospitalSnapshot(),checked.fingerprint).er.fingerprint,checked.fingerprint);
});
test('normalisation rejects dangling links, duplicate IDs and non-atomic cells',()=>{
  const dangling=hospitalSnapshot();dangling.data.booking[0].patient_id=999;
  assert.throws(()=>buildHospitalNormalisation(spec(),dangling),/missing or ambiguous/);
  const duplicate=hospitalSnapshot();duplicate.data.patient.push({...duplicate.data.patient[0],display_name:'Conflicting patient'});
  assert.throws(()=>buildHospitalNormalisation(spec(),duplicate),/duplicated/);
  const nested=hospitalSnapshot();nested.data.patient[0].display_name=['Multiple','names'];
  assert.throws(()=>buildHospitalNormalisation(spec(),nested),/atomic/);
});
test('record values are escaped in HTML and cannot inject scripts',()=>{
  const snapshot=hospitalSnapshot();snapshot.data.patient[0].display_name='<script>alert("test")</script>';
  const html=buildHospitalNormalisation(spec(),snapshot).html;
  assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
});
test('required snapshot columns cannot silently disappear from the example',()=>{
  const snapshot=hospitalSnapshot();delete snapshot.data.slot[0].ends_at;
  assert.throws(()=>buildHospitalNormalisation(spec(),snapshot),/fields do not match/);
});
