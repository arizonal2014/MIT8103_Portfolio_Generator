// Unit fixtures only. Production normalisation requires captured PostgreSQL rows.
export function hospitalSnapshot(){return {data:{
  patient:[{patient_id:1,display_name:'Example Patient'}],
  doctor:[{doctor_id:1,display_name:'Example Doctor'}],
  slot:[{slot_id:1,doctor_id:1,starts_at:'2030-01-01T09:00:00+00:00',ends_at:'2030-01-01T09:30:00+00:00'}],
  booking:[
    {booking_id:1,patient_id:1,slot_id:1,status:'cancelled',created_at:'2030-01-01T08:00:00+00:00',cancelled_at:'2030-01-01T08:10:00+00:00'},
    {booking_id:2,patient_id:1,slot_id:1,status:'cancelled',created_at:'2030-01-01T08:00:00+00:00',cancelled_at:'2030-01-01T08:15:00+00:00'},
    {booking_id:3,patient_id:1,slot_id:1,status:'active',created_at:'2030-01-01T08:20:00+00:00',cancelled_at:null},
  ],
}};}
