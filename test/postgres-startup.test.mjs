import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForPostgresReady} from '../lib/postgres-pilot.mjs';

test('readiness waits for final TCP server rather than the temporary setup socket',async()=>{
 let probes=0,pauses=0;
 await waitForPostgresReady('owned-fixture',{command:async(args,input,timeout)=>{
  assert.deepEqual(args,['exec','owned-fixture','pg_isready','-h','127.0.0.1','-U','postgres']);assert.equal(input,'');assert.equal(timeout,5000);
  // The temporary setup server would already answer a socket-only probe.
  if(++probes<3)throw Object.assign(Error('TCP not ready'),{code:1});
  return{stdout:'127.0.0.1:5432 - accepting connections'};
 },pause:async()=>{pauses++;}});
 assert.equal(probes,3);assert.equal(pauses,2);
});

test('readiness fails visibly when PostgreSQL never accepts TCP connections',async()=>{
 let probes=0;
 await assert.rejects(waitForPostgresReady('owned-fixture',{command:async()=>{probes++;throw Error('not ready');},pause:async()=>{}}),/PostgreSQL.*TCP/);
 assert.equal(probes,40);
});
