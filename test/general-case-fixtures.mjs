import {libraryCase} from '../examples/cases.mjs';
export function libraryExecution(){
  const spec=libraryCase(),time='2030-01-01T09:00:00Z',later='2030-01-08T09:00:00Z';
  const member={member_id:1,membership_number:'M001',full_name:'Example Reader'},book={book_id:1,isbn:'9780000000001',title:'Example Book'},copy={copy_id:1,book_id:1,barcode:'C001'},loan={loan_id:1,member_id:1,copy_id:1,borrowed_at:time,due_at:later,returned_at:null};
  const test=(id,entity,row,kind,target)=>({id,entity,row,kind,target});
  return {spec,pkg:{version:1,normalisationRoot:'loan',rules:[
    {ruleId:'one_open_copy',keyFields:['copy_id'],predicate:{op:'is_null',field:'returned_at'}},
    {ruleId:'valid_due_date',predicate:{op:'gt_fields',left:'due_at',right:'borrowed_at'}},
  ],records:[{entity:'member',rows:[member]},{entity:'book',rows:[book]},{entity:'book_copy',rows:[copy]},{entity:'loan',rows:[loan,{...loan,loan_id:2,returned_at:later}]}],negativeTests:[
    test('duplicate_member','member',member,'primary_key','pk_member'),test('duplicate_book','book',book,'primary_key','pk_book'),test('duplicate_copy','book_copy',copy,'primary_key','pk_book_copy'),test('duplicate_loan','loan',loan,'primary_key','pk_loan'),
    test('member_number','member',{...member,member_id:99},'unique','uq_member_0'),test('book_isbn','book',{...book,book_id:99},'unique','uq_book_0'),test('copy_barcode','book_copy',{...copy,copy_id:99},'unique','uq_book_copy_0'),
    test('missing_book','book_copy',{...copy,copy_id:99,book_id:999,barcode:'C099'},'foreign_key','fk_book_copy_0'),
    test('missing_member','loan',{...loan,loan_id:99,member_id:999,returned_at:later},'foreign_key','fk_loan_0'),test('missing_copy','loan',{...loan,loan_id:99,copy_id:999,returned_at:later},'foreign_key','fk_loan_1'),
    test('missing_name','member',{...member,member_id:99,membership_number:'M099',full_name:null},'not_null','full_name'),
    test('bad_due_date','loan',{...loan,loan_id:99,due_at:'2029-12-31T09:00:00Z',returned_at:later},'check','valid_due_date'),
    test('second_open_loan','loan',{...loan,loan_id:99},'partial_unique','one_open_copy'),
  ]}};
}
export function snapshotFor(pkg){return {data:Object.fromEntries(pkg.records.map(g=>[g.entity,structuredClone(g.rows)]))};}

export function studentModel(){
  const base=libraryCase(),field=(name,type='text')=>({name,type,required:true});
  const entity=(name,fields,uniqueKeys=[],foreignKeys=[])=>({name,purpose:'Stores '+name+' records.',fields,primaryKey:[fields[0].name],uniqueKeys,foreignKeys});
  return {...base,scenario:{title:'Student course enrolment',description:'Students enrol in available courses.',users:['Course administrators'],operations:['Enrol a student','Record a score'],scope:'Synthetic student enrolments only.',assumptions:['Each student enrols at most once in a course.']},entities:[
    entity('student',[field('student_id','id'),field('full_name')]),entity('course',[field('course_id','id'),field('title')]),
    entity('enrolment',[field('enrolment_id','id'),field('student_id','id'),field('course_id','id'),field('score','integer')],[['student_id','course_id']],[{fields:['student_id'],targetEntity:'student',targetFields:['student_id']},{fields:['course_id'],targetEntity:'course',targetFields:['course_id']}]),
  ],businessRules:[{id:'one_enrolment',description:'A student enrols once per course.',entity:'enrolment',fields:['student_id','course_id'],enforcement:'unique'},{id:'valid_score',description:'Scores must be non-negative.',entity:'enrolment',fields:['score'],enforcement:'check'}],queries:[{id:'enrolments',purpose:'List students and their courses.',kind:'join',entities:['student','enrolment','course']},{id:'scores',purpose:'Find enrolments by score.',kind:'filter',entities:['enrolment']},{id:'counts',purpose:'Count students per course.',kind:'aggregate',entities:['enrolment','course']}],optimisation:{entity:'enrolment',filterField:'score',indexType:'btree',benchmarkRows:10000},transactions:{entity:'enrolment',commit:'Commit a new enrolment.',rollback:'Roll back an invalid score.',concurrencyRuleId:'one_enrolment',concurrencyMethod:'unique_constraint'},noSql:{collection:'enrolment_events',sourceEntities:['student','course','enrolment'],embeddedEntities:['student','course'],documentPurpose:'Store enrolment status events.',eventTypes:['enrolled','scored'],variableFields:['score']},distributed:{mode:'discussion',replicationMembers:3,description:'Propose replication for student enrolment events without claiming a running deployment.'}};
}
export function studentExecution(){
  const spec=studentModel(),student={student_id:1,full_name:'Example Student'},course={course_id:1,title:'Databases'},enrolment={enrolment_id:1,student_id:1,course_id:1,score:75};
  const test=(id,entity,row,kind,target)=>({id,entity,row,kind,target});
  return {spec,pkg:{version:1,normalisationRoot:'enrolment',rules:[{ruleId:'valid_score',predicate:{op:'gte_value',field:'score',value:0}}],records:[{entity:'student',rows:[student,{student_id:2,full_name:'Second Example'}]},{entity:'course',rows:[course,{course_id:2,title:'Networks'}]},{entity:'enrolment',rows:[enrolment,{enrolment_id:2,student_id:1,course_id:2,score:85}]}],negativeTests:[
    test('duplicate_student','student',student,'primary_key','pk_student'),test('duplicate_course','course',course,'primary_key','pk_course'),test('duplicate_enrolment','enrolment',enrolment,'primary_key','pk_enrolment'),
    test('duplicate_pair','enrolment',{...enrolment,enrolment_id:99},'unique','uq_enrolment_0'),
    test('missing_student','enrolment',{...enrolment,enrolment_id:99,student_id:999},'foreign_key','fk_enrolment_0'),test('missing_course','enrolment',{...enrolment,enrolment_id:99,course_id:999},'foreign_key','fk_enrolment_1'),
    test('negative_score','enrolment',{enrolment_id:99,student_id:2,course_id:2,score:-1},'check','valid_score'),test('missing_name','student',{student_id:99,full_name:null},'not_null','full_name'),
  ]}};
}
