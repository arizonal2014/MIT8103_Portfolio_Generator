import {validateCaseSpec} from './case-spec.mjs';

const esc=value=>String(value??'NULL').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const cell=value=>value===null?'NULL':String(value);
const displayType={id:'bigint',integer:'bigint',decimal:'numeric',timestamp:'timestamptz',text:'text',date:'date',boolean:'boolean'};
const page=(title,body)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>
body{font:16px/1.6 "IBM Plex Sans",sans-serif,sans-serif;color:#000000;background:#ffffff;margin:0}main{max-width:1160px;margin:32px auto;padding:0 24px 48px}h1{font-size:30px;line-height:1.25}h2{font-size:23px;margin-top:34px}h3{font-size:18px}.note{background:#ffffff;padding:14px 18px;border-radius:7px}.scroll{overflow-x:auto;background:white;border:1px solid #777777;border-radius:6px;margin:12px 0 20px}table{border-collapse:collapse;font-size:13px;white-space:nowrap;width:100%}th,td{padding:8px 11px;border-bottom:1px solid #777777;text-align:left}th{background:#ffffff}pre{white-space:pre-wrap;background:white;padding:16px;border:1px solid #777777;overflow-wrap:anywhere;font-size:13px}svg{width:100%;height:auto}summary{cursor:pointer;font-weight:650}code{font-size:14px}small{color:#000000}</style></head><body><main>${body}</main></body></html>`;
const table=(rows,columns)=>`<div class="scroll"><table><thead><tr>${columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${columns.map(c=>`<td>${esc(cell(row[c]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const mdTable=(rows,columns)=>'| '+columns.join(' | ')+' |\n| '+columns.map(()=>'---').join(' | ')+' |\n'+rows.map(row=>'| '+columns.map(c=>cell(row[c]).replaceAll('|','\\|').replaceAll('\n',' ')).join(' | ')+' |').join('\n');

export function renderHospitalER(spec){
  const check=validateCaseSpec(spec);if(!check.valid)throw new Error('ER diagram requires a validated model.');
  const positions={patient:[24,40],doctor:[584,40],booking:[24,350],slot:[584,350]};
  if(spec.entities.length!==4||spec.entities.some(e=>!positions[e.name]))throw new Error('ER layout currently supports the four-table hospital pilot only.');
  const box=new Map(spec.entities.map(e=>{const [x,y]=positions[e.name];return [e.name,{x,y,w:390,h:58+27*e.fields.length}];}));
  let edges='';
  for(const rel of check.relationships){
    const child=box.get(rel.from),parent=box.get(rel.to),childLabel=rel.childrenPerParent==='zero_or_one'?'0..1':'0..*',parentLabel=rel.parentPerChild==='exactly_one'?'1':'0..1';
    if(child.x===parent.x){
      const x=child.x+child.w/2,y1=parent.y+parent.h,y2=child.y;
      edges+=`<path d="M ${x} ${y1} L ${x} ${y2}" stroke="#777777" stroke-width="2" fill="none"/><text x="${x+12}" y="${y1+23}">${parentLabel}</text><text x="${x+12}" y="${y2-12}">${childLabel}</text><text x="${x+12}" y="${(y1+y2)/2}">${esc(rel.fields.join(', '))}</text>`;
    }else{
      const x1=child.x+child.w,x2=parent.x,y1=child.y+child.h/2,y2=parent.y+parent.h/2;
      edges+=`<path d="M ${x1} ${y1} H 500 V ${y2} H ${x2}" stroke="#777777" stroke-width="2" fill="none"/><text x="${x1+8}" y="${y1-12}">${childLabel}</text><text x="${x2-22}" y="${y2-12}">${parentLabel}</text><text x="450" y="${Math.max(y1,y2)+28}">${esc(rel.fields.join(', '))}</text>`;
    }
  }
  const nodes=spec.entities.map(entity=>{
    const b=box.get(entity.name);
    return `<g><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" fill="white" stroke="#777777"/><rect x="${b.x}" y="${b.y}" width="${b.w}" height="38" rx="8" fill="#ffffff"/><text x="${b.x+15}" y="${b.y+26}" font-weight="700">${esc(entity.name)}</text>${entity.fields.map((f,i)=>{
      const keys=[entity.primaryKey.includes(f.name)?'PK':'',entity.foreignKeys.some(k=>k.fields.includes(f.name))?'FK':'',...entity.uniqueKeys.map((key,i)=>key.includes(f.name)?'UQ'+(i+1):'')].filter(Boolean).join(', ');
      return `<text x="${b.x+14}" y="${b.y+62+i*27}" font-size="14">${esc(f.name)} · ${esc(displayType[f.type])}${keys?' · '+keys:''}${f.required?'':' · optional'}</text>`;
    }).join('')}</g>`;
  }).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 650" role="img" aria-labelledby="title desc"><title id="title">Hospital appointment ER diagram</title><desc id="desc">Patient and slot each have zero or many bookings. Doctor has zero or many slots. Every booking requires one patient and one slot; every slot requires one doctor.</desc><rect width="1000" height="650" fill="#ffffff"/><g fill="#000000" font-family="IBM Plex Sans,sans-serif" font-size="14">${edges}</g><g fill="#000000" font-family="IBM Plex Sans,sans-serif" font-size="18" stroke="none">${nodes}<text x="24" y="617" font-size="14">PK: primary key · FK: foreign key · UQ1: parts of the same unique key</text><text x="24" y="642" font-size="14">1: exactly one · 0..*: zero or many · fields are required unless marked optional</text></g></svg>`;
  const mermaid=['erDiagram',...spec.entities.map(e=>`    ${e.name} {\n${e.fields.map(f=>`        ${f.type==='text'?'string':f.type} ${f.name}${e.primaryKey.includes(f.name)?' PK':e.foreignKeys.some(k=>k.fields.includes(f.name))?' FK':''}`).join('\n')}\n    }`),...check.relationships.map(r=>`    ${r.to} ${r.parentPerChild==='exactly_one'?'||':'o|'}--${r.childrenPerParent==='zero_or_one'?'o|':'o{'} ${r.from} : "${r.fields.join('_')}"`)].join('\n')+'\n';
  const html=page('Hospital ER diagram',`<h1>Hospital appointment ER diagram</h1><p class="note">Portfolio 1 requires an ER diagram, keys and relationships. This diagram uses the same reviewed model as the executed SQL.</p>${svg}<h2>Read the relationships</h2><ul><li>One patient can have several bookings. Every booking belongs to one patient.</li><li>One doctor can have several slots. Every slot belongs to one doctor.</li><li>One slot can have several historical bookings. Only one can be active at a time.</li></ul><p>The active-booking rule uses a partial unique index. It does not make all historical bookings one-to-one.</p><small>Model fingerprint: ${check.fingerprint}</small>`);
  return {svg,mermaid,html,fingerprint:check.fingerprint};
}

export function buildHospitalNormalisation(spec,catalog){
  const checked=validateCaseSpec(spec);if(!checked.valid)throw new Error('Normalisation requires a validated model.');
  const data=catalog?.data;if(!data)throw new Error('Normalisation requires the actual database record snapshot. Rerun PostgreSQL to capture it.');
  for(const entity of spec.entities){
    const rows=data[entity.name];if(!Array.isArray(rows)||!rows.length||rows.length>100)throw new Error('Missing or oversized pilot record snapshot.');
    const ids=new Set();
    for(const row of rows){
      if(!row||Object.keys(row).sort().join()!==entity.fields.map(f=>f.name).sort().join())throw new Error('Snapshot fields do not match the reviewed model.');
      if(entity.primaryKey.length!==1)throw new Error('This worked normalisation currently requires single-column primary keys.');
      const key=row[entity.primaryKey[0]];if(key===null||key===undefined||ids.has(key))throw new Error('Snapshot primary key is missing or duplicated.');ids.add(key);
      if(Object.values(row).some(v=>v!==null&&!['string','number','boolean'].includes(typeof v)))throw new Error('Snapshot values must be atomic.');
    }
  }
  const lookup=(entity,field,value)=>{const matches=data[entity].filter(r=>r[field]===value);if(matches.length!==1)throw new Error('Snapshot join is missing or ambiguous.');return matches[0];};
  const wide=data.booking.map(b=>{
    const patient=lookup('patient','patient_id',b.patient_id),slot=lookup('slot','slot_id',b.slot_id),doctor=lookup('doctor','doctor_id',slot.doctor_id);
    return {booking_id:b.booking_id,patient_id:patient.patient_id,patient_name:patient.display_name,slot_id:slot.slot_id,doctor_id:doctor.doctor_id,doctor_name:doctor.display_name,starts_at:slot.starts_at,ends_at:slot.ends_at,status:b.status,created_at:b.created_at,cancelled_at:b.cancelled_at};
  });
  const unf=data.patient.map(p=>({patient_id:p.patient_id,patient_name:p.display_name,bookings:wide.filter(r=>r.patient_id===p.patient_id).map(({patient_id,patient_name,...booking})=>booking)}));
  const columns=Object.keys(wide[0]);
  const deps=spec.entities.map(e=>`${e.name}: ${e.primaryKey.join(', ')} → ${e.fields.filter(f=>!e.primaryKey.includes(f.name)).map(f=>f.name).join(', ')}`);
  const stable=value=>JSON.stringify(value,Object.keys(value).sort());
  // Decompose the wide sample, then join it back. Reject conflicting dependencies.
  const decompose=(entity,projection)=>{
    const records=new Map();
    for(const row of wide){const record=projection(row),id=record[spec.entities.find(e=>e.name===entity).primaryKey[0]];
      if(records.has(id)&&stable(records.get(id))!==stable(record))throw new Error('Sample violates a declared dependency.');records.set(id,record);}
    return [...records.values()];
  };
  const decomposed={
    patient:decompose('patient',r=>({patient_id:r.patient_id,display_name:r.patient_name})),
    doctor:decompose('doctor',r=>({doctor_id:r.doctor_id,display_name:r.doctor_name})),
    slot:decompose('slot',r=>({slot_id:r.slot_id,doctor_id:r.doctor_id,starts_at:r.starts_at,ends_at:r.ends_at})),
    booking:decompose('booking',r=>({booking_id:r.booking_id,patient_id:r.patient_id,slot_id:r.slot_id,status:r.status,created_at:r.created_at,cancelled_at:r.cancelled_at})),
  };
  for(const entity of spec.entities){
    const referenced=decomposed[entity.name];
    if(referenced.some(row=>!data[entity.name].some(original=>stable(original)===stable(row))))throw new Error('Decomposition differs from the captured database records.');
  }
  const rejoined=decomposed.booking.map(b=>{
    const p=decomposed.patient.find(p=>p.patient_id===b.patient_id),s=decomposed.slot.find(s=>s.slot_id===b.slot_id),d=decomposed.doctor.find(d=>d.doctor_id===s.doctor_id);
    return {booking_id:b.booking_id,patient_id:p.patient_id,patient_name:p.display_name,slot_id:s.slot_id,doctor_id:d.doctor_id,doctor_name:d.display_name,starts_at:s.starts_at,ends_at:s.ends_at,status:b.status,created_at:b.created_at,cancelled_at:b.cancelled_at};
  });
  if(JSON.stringify(wide)!==JSON.stringify(rejoined))throw new Error('Normalisation reconstruction lost or changed sample rows.');
  const sections={
    intro:'Portfolio 1 requires a normalisation explanation. These tables use fictional records captured from the PostgreSQL test. They show a worked reconstruction of the design, not a claim that the live database was migrated through three versions.',
    unf:'Before 1NF: bookings are grouped in a list inside each patient record. That repeating group is unsuitable for this relational table.',
    one:'1NF: use one row per booking, with one value in each cell. booking_id identifies the row. Patient, doctor and slot details repeat.',
    two:'2NF: the table is unchanged. The only assumed candidate key in this wide example is the single column booking_id, so no value can depend on only part of that key. 2NF does not require a new table when the design already meets it.',
    three:'3NF: move patient, doctor and slot details into their own tables. booking_id determines patient_id, which determines the patient name. Likewise slot_id determines slot times and doctor_id, while doctor_id determines the doctor name. Keeping those descriptions once removes these transitive dependencies from booking.',
  };
  const proof={kind:'worked_normalisation_reconstruction',modelFingerprint:checked.fingerprint,source:'PostgreSQL Catalog.json data snapshot',rowsBefore:wide.length,rowsAfter:rejoined.length,losslessForSample:true,dependencies:deps,unreferencedRecordsRetainedInDatabase:true,unf,oneNF:wide,twoNF:wide,threeNF:data};
  const threeHTML=spec.entities.map(e=>`<h3>${esc(e.name)}</h3><p>Primary key: <code>${esc(e.primaryKey.join(', '))}</code></p>${table(data[e.name],e.fields.map(f=>f.name))}`).join('');
  const preview=unf.map(p=>({patient_id:p.patient_id,patient_name:p.patient_name,'bookings (list)':p.bookings.map(b=>`#${b.booking_id} (${b.status})`).join(', ')}));
  const html=page('Hospital normalisation: 1NF, 2NF and 3NF',`<h1>Hospital normalisation</h1><p class="note">${esc(sections.intro)}</p><h2>Before 1NF: a repeating group</h2><p>${esc(sections.unf)}</p>${table(preview,['patient_id','patient_name','bookings (list)'])}<details><summary>Show the complete grouped example</summary><pre>${esc(JSON.stringify(unf,null,2))}</pre></details><h2>1NF: one booking per row</h2><p>${esc(sections.one)}</p>${table(wide,columns)}<h2>2NF: check the whole key</h2><p>${esc(sections.two)}</p><details><summary>Show the unchanged 2NF table</summary>${table(wide,columns)}</details><h2>3NF: keep each fact in its own table</h2><p>${esc(sections.three)}</p>${threeHTML}<h2>Why the split works</h2><pre>${esc(deps.join('\n'))}</pre><p>A name change is stored once in patient or doctor. A booking stores their IDs through its links.</p><p class="note">Sample reconstruction passed: ${wide.length} wide rows → four related tables → ${rejoined.length} identical wide rows. This checks the sample; the dependency argument comes from the case rules, not from three rows alone.</p><p>The slot's additional unique key is (doctor_id, starts_at). The active-only booking index is a business rule, not a key for the complete booking history.</p><small>Model fingerprint: ${checked.fingerprint}</small>`);
  const markdown=['# Hospital normalisation',sections.intro,'## Before 1NF',sections.unf,'```json',JSON.stringify(unf,null,2),'```','## 1NF',sections.one,mdTable(wide,columns),'## 2NF',sections.two,mdTable(wide,columns),'## 3NF',sections.three,...spec.entities.map(e=>'### '+e.name+'\n\n'+mdTable(data[e.name],e.fields.map(f=>f.name))),'## Dependencies',...deps.map(d=>'- '+d),`\nSample reconstruction: ${wide.length} rows before and ${rejoined.length} identical rows after. This is a sample check, not a proof based on row counts alone.\n`].join('\n\n');
  return {html,markdown,proof};
}

export function buildHospitalDesign(spec,catalog,expectedFingerprint){
  const er=renderHospitalER(spec);if(er.fingerprint!==expectedFingerprint)throw new Error('Design artifacts and executed schema have different model fingerprints.');
  return {er,normalisation:buildHospitalNormalisation(spec,catalog)};
}
