// Reviewed bindings for the generated hospital pilot, not an arbitrary-case adapter.
export function reviewHospitalPilot(original){
  const spec=structuredClone(original);
  for(const [table,fields] of Object.entries({patient:['patient_id','display_name'],doctor:['doctor_id','display_name'],slot:['slot_id','doctor_id','starts_at','ends_at'],booking:['booking_id','patient_id','slot_id','status','created_at','cancelled_at']})){
    const entity=spec.entities.find(e=>e.name===table);
    if(!entity||entity.fields.map(f=>f.name).sort().join()!==fields.sort().join())throw new Error('This binding only supports the reviewed hospital pilot.');
  }
  // Explicit review amendment: the source model did not declare slot chronology.
  spec.businessRules.push({id:'slot_end_after_start',description:'A fixed appointment slot ends after it starts.',entity:'slot',fields:['starts_at','ends_at'],enforcement:'check'});
  const eq=(field,value)=>({op:'eq',field,value}),is=(op,field)=>({op,field});
  return {spec,plan:{version:1,rules:[
    {ruleId:'booking_status_values',predicate:{op:'or',args:[
      {op:'and',args:[eq('status','active'),is('is_null','cancelled_at')]},
      {op:'and',args:[eq('status','cancelled'),is('is_not_null','cancelled_at')]},
    ]}},
    {ruleId:'one_active_booking_per_slot',keyFields:['slot_id'],predicate:eq('status','active')},
    {ruleId:'slot_end_after_start',predicate:{op:'gt_fields',left:'ends_at',right:'starts_at'}},
  ]}};
}

// Hand-written test records and assertions. These are real tests when run, not AI results.
export const hospitalAssertions=`
BEGIN;
INSERT INTO portfolio.patient VALUES (1, 'Example Patient');
INSERT INTO portfolio.doctor VALUES (1, 'Example Doctor');
INSERT INTO portfolio.slot VALUES (1, 1, '2030-01-01 09:00+00', '2030-01-01 09:30+00');
INSERT INTO portfolio.booking VALUES (1, 1, 1, 'active', '2030-01-01 08:00+00', NULL);
DO $$ BEGIN
  BEGIN
    INSERT INTO portfolio.patient VALUES (1, 'Duplicate');
    RAISE EXCEPTION 'FAIL duplicate primary key accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS duplicate primary key rejected'; END;
  BEGIN
    INSERT INTO portfolio.patient VALUES (2, NULL);
    RAISE EXCEPTION 'FAIL missing required value accepted';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS missing required value rejected'; END;
  BEGIN
    INSERT INTO portfolio.slot VALUES (2, 999, '2030-01-01 10:00+00', '2030-01-01 10:30+00');
    RAISE EXCEPTION 'FAIL missing doctor accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS missing doctor rejected'; END;
  BEGIN
    INSERT INTO portfolio.booking VALUES (2, 999, 1, 'cancelled', '2030-01-01 08:00+00', '2030-01-01 08:10+00');
    RAISE EXCEPTION 'FAIL missing patient accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS missing patient rejected'; END;
  BEGIN
    INSERT INTO portfolio.booking VALUES (2, 1, 999, 'active', '2030-01-01 08:00+00', NULL);
    RAISE EXCEPTION 'FAIL missing slot accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS missing slot rejected'; END;
  BEGIN
    INSERT INTO portfolio.booking VALUES (2, 1, 1, 'active', '2030-01-01 08:00+00', NULL);
    RAISE EXCEPTION 'FAIL second active booking accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS second active booking rejected'; END;
  BEGIN
    INSERT INTO portfolio.booking VALUES (2, 1, 1, 'unknown', '2030-01-01 08:00+00', NULL);
    RAISE EXCEPTION 'FAIL invalid status accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS invalid status rejected'; END;
  BEGIN
    INSERT INTO portfolio.booking VALUES (2, 1, 1, 'cancelled', '2030-01-01 08:00+00', NULL);
    RAISE EXCEPTION 'FAIL cancellation without time accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS cancellation without time rejected'; END;
  BEGIN
    INSERT INTO portfolio.slot VALUES (2, 1, '2030-01-01 11:00+00', '2030-01-01 10:30+00');
    RAISE EXCEPTION 'FAIL reversed slot times accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS reversed slot times rejected'; END;
  BEGIN
    INSERT INTO portfolio.slot VALUES (2, 1, '2030-01-01 09:00+00', '2030-01-01 09:30+00');
    RAISE EXCEPTION 'FAIL duplicate doctor start accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS duplicate doctor start rejected'; END;
END $$;
UPDATE portfolio.booking SET status='cancelled', cancelled_at='2030-01-01 08:10+00' WHERE booking_id=1;
INSERT INTO portfolio.booking VALUES (2, 1, 1, 'cancelled', '2030-01-01 08:00+00', '2030-01-01 08:15+00');
INSERT INTO portfolio.booking VALUES (3, 1, 1, 'active', '2030-01-01 08:20+00', NULL);
SELECT 'PASS cancelled history retained and new active booking accepted' AS result WHERE (SELECT count(*) FROM portfolio.booking)=3;
COMMIT;
`;
