// Hand-authored validator examples, not AI outputs or completed assessments.
const field=(name,type='text',required=true)=>({name,type,required});
const entity=(name,fields,uniqueKeys=[],foreignKeys=[])=>({name,purpose:`Stores ${name} records.`,fields,primaryKey:[fields[0].name],uniqueKeys,foreignKeys});
const fk=(fields,targetEntity,targetFields)=>({fields,targetEntity,targetFields});

export function libraryCase(){return {
  version:1,syntheticDataOnly:true,
  scenario:{title:'Library borrowing system',description:'One branch lends physical copies to registered members.',users:['Library staff','Registered members'],operations:['Borrow a copy','Record a return'],scope:'One branch and fictional lending records.',assumptions:['No fines or reservations in this exercise.']},
  entities:[
    entity('member',[field('member_id','id'),field('membership_number'),field('full_name')],[['membership_number']]),
    entity('book',[field('book_id','id'),field('isbn'),field('title')],[['isbn']]),
    entity('book_copy',[field('copy_id','id'),field('book_id','id'),field('barcode')],[['barcode']],[fk(['book_id'],'book',['book_id'])]),
    entity('loan',[field('loan_id','id'),field('member_id','id'),field('copy_id','id'),field('borrowed_at','timestamp'),field('due_at','timestamp'),field('returned_at','timestamp',false)],[],[fk(['member_id'],'member',['member_id']),fk(['copy_id'],'book_copy',['copy_id'])]),
  ],
  businessRules:[
    {id:'one_open_copy',description:'A physical copy has at most one unreturned loan.',entity:'loan',fields:['copy_id'],enforcement:'partial_unique'},
    {id:'valid_due_date',description:'The due date is later than the borrowing date.',entity:'loan',fields:['borrowed_at','due_at'],enforcement:'check'},
  ],
  queries:[{id:'open_loans',purpose:'List members with their open loans.',entities:['loan','member'],kind:'join'},{id:'date_filter',purpose:'Find loans within a date range.',entities:['loan'],kind:'filter'},{id:'loan_counts',purpose:'Count loans for each member.',entities:['loan','member'],kind:'aggregate'}],
  optimisation:{entity:'loan',filterField:'borrowed_at',indexType:'btree',benchmarkRows:100000},
  transactions:{entity:'loan',commit:'Commit a return for an open loan.',rollback:'Roll back a new loan after a due-date error.',concurrencyRuleId:'one_open_copy',concurrencyMethod:'unique_constraint'},
  noSql:{collection:'borrowing_events',sourceEntities:['member','book','book_copy','loan'],embeddedEntities:['member','book_copy'],documentPurpose:'Store one fictional borrowing or return event per document.',eventTypes:['borrowed','returned'],variableFields:['due_at','condition']},
  distributed:{mode:'discussion',replicationMembers:3,description:'Propose replication for library event records, without claiming implementation.'},
};}

export function hospitalCase(){return {
  version:1,syntheticDataOnly:true,
  scenario:{title:'Hospital appointment system',description:'A clinic schedules patient visits using fixed doctor appointment slots.',users:['Clinic receptionist','Treating doctor'],operations:['Book an appointment','Cancel an appointment'],scope:'Fictional appointment scheduling only; no real medical records.',assumptions:['Doctors offer non-overlapping fixed slots; capacity is one patient per slot.']},
  entities:[
    entity('patient',[field('patient_id','id'),field('patient_number'),field('full_name')],[['patient_number']]),
    entity('doctor',[field('doctor_id','id'),field('registration_number'),field('full_name')],[['registration_number']]),
    entity('appointment_slot',[field('slot_id','id'),field('doctor_id','id'),field('starts_at','timestamp'),field('ends_at','timestamp')],[['doctor_id','starts_at']],[fk(['doctor_id'],'doctor',['doctor_id'])]),
    entity('appointment',[field('appointment_id','id'),field('slot_id','id'),field('patient_id','id'),field('booked_at','timestamp'),field('cancelled_at','timestamp',false)],[],[fk(['slot_id'],'appointment_slot',['slot_id']),fk(['patient_id'],'patient',['patient_id'])]),
  ],
  businessRules:[{id:'one_active_booking',description:'A slot can have at most one appointment that has not been cancelled.',entity:'appointment',fields:['slot_id'],enforcement:'partial_unique'},{id:'valid_slot_times',description:'A slot must end after it starts.',entity:'appointment_slot',fields:['starts_at','ends_at'],enforcement:'check'}],
  queries:[{id:'patient_bookings',purpose:'List patient names with their appointments.',entities:['patient','appointment'],kind:'join'},{id:'slots_by_date',purpose:'Find appointment slots within a date range.',entities:['appointment_slot'],kind:'filter'},{id:'bookings_per_patient',purpose:'Count appointments per patient.',entities:['appointment','patient'],kind:'aggregate'}],
  optimisation:{entity:'appointment_slot',filterField:'starts_at',indexType:'btree',benchmarkRows:100000},
  transactions:{entity:'appointment',commit:'Commit a cancellation of an active appointment.',rollback:'Roll back a booking after an invalid patient link.',concurrencyRuleId:'one_active_booking',concurrencyMethod:'unique_constraint'},
  noSql:{collection:'appointment_events',sourceEntities:['appointment','appointment_slot','patient','doctor'],embeddedEntities:['patient','doctor'],documentPurpose:'Store fictional booking and cancellation events with differing metadata.',eventTypes:['booked','cancelled'],variableFields:['confirmation_channel','cancellation_reason']},
  distributed:{mode:'discussion',replicationMembers:3,description:'Propose replication for appointment events while keeping authoritative scheduling rules in PostgreSQL.'},
};}
