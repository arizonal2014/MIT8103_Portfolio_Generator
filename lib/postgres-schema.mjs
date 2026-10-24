import {validateCaseSpec} from './case-spec.mjs';

const types={id:'bigint',integer:'bigint',text:'text',decimal:'numeric(18,2)',boolean:'boolean',timestamp:'timestamptz',date:'date'};
const quote=name=>{if(typeof name!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(name))throw new Error('Invalid SQL identifier.');return `"${name}"`;};
const exact=(value,keys)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!==[...keys].sort().join())throw new Error('Unsupported expression or plan properties.');
};
const list=fields=>fields.map(quote).join(', ');

// A deliberately small expression language: no raw SQL, functions or subqueries.
function expression(node,entity,seen,depth=0){
  if(depth>8)throw new Error('Expression nesting limit exceeded.');
  const field=name=>{const f=entity.fields.find(f=>f.name===name);if(!f)throw new Error(`Unknown expression field: ${name}`);seen.add(name);return f;};
  if(['and','or'].includes(node?.op)){
    exact(node,['op','args']);if(!Array.isArray(node.args)||node.args.length<2||node.args.length>8)throw new Error('Use 2-8 boolean operands.');
    return '('+node.args.map(n=>expression(n,entity,seen,depth+1)).join(node.op==='and'?' AND ':' OR ')+')';
  }
  if(['is_null','is_not_null'].includes(node?.op)){
    exact(node,['op','field']);field(node.field);return `(${quote(node.field)} IS ${node.op==='is_not_null'?'NOT ':''}NULL)`;
  }
  if(node?.op==='eq'){
    exact(node,['op','field','value']);const f=field(node.field);
    if(f.type!=='text'||typeof node.value!=='string'||node.value.length>100||/[\x00-\x1f]/.test(node.value))throw new Error('Equality supports bounded text values only.');
    return `(${quote(node.field)} = '${node.value.replaceAll("'","''")}')`;
  }
  if(node?.op==='gt_fields'){
    exact(node,['op','left','right']);const a=field(node.left),b=field(node.right);
    if(a.type!==b.type||!['timestamp','date','id','integer','decimal'].includes(a.type))throw new Error('Ordered fields must have compatible ordered types.');
    return `(${quote(node.left)} > ${quote(node.right)})`;
  }
  if(['gt_value','gte_value','lt_value','lte_value'].includes(node?.op)){
    exact(node,['op','field','value']);const f=field(node.field);
    if(!['id','integer','decimal'].includes(f.type)||typeof node.value!=='number'||!Number.isFinite(node.value)||Math.abs(node.value)>1000000000)throw new Error('Numeric comparison requires a bounded numeric value.');
    const operators={gt_value:'>',gte_value:'>=',lt_value:'<',lte_value:'<='};
    return `(${quote(node.field)} ${operators[node.op]} ${node.value})`;
  }
  throw new Error('Unsupported expression operation.');
}

export function renderPostgresSchema(spec,plan){
  const validation=validateCaseSpec(spec);if(!validation.valid)throw new Error('Case specification failed validation.');
  exact(plan,['version','rules']);if(plan.version!==1||!Array.isArray(plan.rules)||plan.rules.length>20)throw new Error('Invalid execution plan.');
  const rules=new Map();
  for(const binding of plan.rules){
    if(rules.has(binding.ruleId))throw new Error('Duplicate rule binding.');
    const rule=spec.businessRules.find(r=>r.id===binding.ruleId);
    if(!rule||!['check','partial_unique'].includes(rule.enforcement))throw new Error('Unknown or unnecessary rule binding.');
    exact(binding,rule.enforcement==='check'?['ruleId','predicate']:['ruleId','keyFields','predicate']);
    const entity=spec.entities.find(e=>e.name===rule.entity),seen=new Set();
    const predicate=expression(binding.predicate,entity,seen);
    if(rule.enforcement==='partial_unique'){
      if(!Array.isArray(binding.keyFields)||!binding.keyFields.length||binding.keyFields.length>8||new Set(binding.keyFields).size!==binding.keyFields.length)throw new Error('Invalid partial-unique key.');
      for(const name of binding.keyFields){if(!entity.fields.some(f=>f.name===name))throw new Error('Unknown index key.');if(!rule.fields.includes(name))throw new Error('Index key outside its declared rule.');seen.add(name);}
    }
    if(rule.enforcement==='check'&&[...seen].some(f=>!rule.fields.includes(f)))throw new Error('Expression uses fields outside its declared rule.');
    if(rule.fields.some(f=>!seen.has(f)))throw new Error('Rule binding leaves declared fields unused.');
    rules.set(binding.ruleId,{...binding,predicate});
  }
  for(const rule of spec.businessRules){
    if(rule.enforcement==='workflow')throw new Error('Workflow rules require a separate tested implementation.');
    if(['check','partial_unique'].includes(rule.enforcement)&&!rules.has(rule.id))throw new Error(`Missing explicit binding: ${rule.id}`);
  }
  const sql=['-- Generated from the validated model and explicit rule bindings.','-- Prose descriptions are never executed as SQL.','BEGIN;','SET LOCAL standard_conforming_strings = on;','CREATE SCHEMA portfolio;'];
  // Create all tables first so cyclic foreign keys do not depend on table order.
  for(const entity of spec.entities){
    const columns=entity.fields.map(f=>`  ${quote(f.name)} ${types[f.type]}${f.required?' NOT NULL':''}`);
    columns.push(`  CONSTRAINT ${quote('pk_'+entity.name)} PRIMARY KEY (${list(entity.primaryKey)})`);
    entity.uniqueKeys.forEach((key,i)=>columns.push(`  CONSTRAINT ${quote('uq_'+entity.name+'_'+i)} UNIQUE (${list(key)})`));
    sql.push(`CREATE TABLE portfolio.${quote(entity.name)} (\n${columns.join(',\n')}\n);`);
  }
  for(const entity of spec.entities)entity.foreignKeys.forEach((fk,i)=>sql.push(`ALTER TABLE portfolio.${quote(entity.name)} ADD CONSTRAINT ${quote('fk_'+entity.name+'_'+i)} FOREIGN KEY (${list(fk.fields)}) REFERENCES portfolio.${quote(fk.targetEntity)} (${list(fk.targetFields)});`));
  for(const rule of spec.businessRules){
    const binding=rules.get(rule.id);
    if(rule.enforcement==='check')sql.push(`ALTER TABLE portfolio.${quote(rule.entity)} ADD CONSTRAINT ${quote(rule.id)} CHECK ${binding.predicate};`);
    if(rule.enforcement==='partial_unique')sql.push(`CREATE UNIQUE INDEX ${quote(rule.id)} ON portfolio.${quote(rule.entity)} (${list(binding.keyFields)}) WHERE ${binding.predicate};`);
  }
  sql.push('COMMIT;','');return {sql:sql.join('\n'),fingerprint:validation.fingerprint};
}
