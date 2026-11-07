import test from 'node:test';
import assert from 'node:assert/strict';
import * as scoped from '../plugins/soloco/runtime/scoped-context.mjs';
import {withStore,digest} from '../plugins/soloco/runtime/store.mjs';
import {inheritSnapshots} from '../plugins/soloco/runtime/snapshot.mjs';
import {fixture,read,save,home,extraction,domainArgs,review,blockedJudgment,dispositions,context} from './support/scoped-home-fixture.mjs';

test('FICTIONAL historical home negative: exact repeated packets and live controls',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 const start=performance.now(),f=await fixture();console.error('profile: fixture');const es=await extraction(f);console.error('profile: extraction');await home(f);
 const args=domainArgs(es),blocked=await review(f,args,blockedJudgment);
 assert.equal(blocked.job.status,'completed',blocked.job.error);console.error('profile: negative');
 const old=read(f).records.home;
 await save(f,{id:'home',expected_revision:1,kind:'artifact',content:old.content+' Explicit corrected reconciliation of distant restrictions; UNKNOWN remains OPEN.',operating_record:{...old.operating_record,clearing:'Independent explicit reconciliation of all distant conditions.'},bootstrap_plan_id:f.plan_id});
 const repair={...args,repair_of:[blocked.record.id]},d=await review(f,repair,dispositions);
 assert.equal(d.job.status,'completed',d.job.error);
 const state=read(f),before=structuredClone(globalThis.__historicalProfile);
 globalThis.__historicalUncached=true;const coldStart=performance.now(),cold=scoped.scopedAssignment(state,d.job),cold_ms=performance.now()-coldStart;globalThis.__historicalUncached=false;
 const proofs=globalThis.__historicalProfile?.proofs,warmStart=performance.now(),warm=scoped.scopedAssignment(read(f),d.job),warm_ms=performance.now()-warmStart;
 if(proofs!==undefined&&process.env.HISTORICAL_BASELINE===undefined)assert.equal(globalThis.__historicalProfile.proofs,proofs,'warm path revalidates dependencies without canonical replay');
 assert.deepEqual(warm,cold);assert.equal(JSON.stringify(warm),JSON.stringify(cold));assert.equal(warm.hash,cold.hash);
 assert.deepEqual(warm.stream.pages,cold.stream.pages);
 console.error(JSON.stringify({checkpoint:'repeated-domain',profile:globalThis.__historicalProfile}));
 if(process.env.HISTORICAL_BOUNDED==='1'){t.diagnostic(JSON.stringify({node:process.version,elapsed_ms:performance.now()-start,profile:globalThis.__historicalProfile}));return;}
 const ready=read(f);
 for(const edit of [s=>s.paused=false,s=>s.owner.epoch++,s=>s.records.home.content+=' changed',s=>s.records.archive.content+=' changed',s=>s.records.home.operating_record.revoked=false,s=>s.notices.push({id:'new-notice',content:'UNKNOWN unresolved restriction'}),s=>s.records.newnegative={...structuredClone(blocked.record),id:'newnegative'},s=>s.records.newordinary={id:'newordinary',revision:1,kind:'artifact',content:'UNKNOWN new input'}]){
  const bad=inheritSnapshots(ready,structuredClone(ready));edit(bad);assert.throws(()=>scoped.scopedAssignment(bad,d.job),/hold|held/i);
 }
 assert.throws(()=>scoped.validateScopedNativeAdmission(ready,d.job,blocked.job.native_id),/independent|reused/);
 // Exact refs cannot hide missing/corrupt historical snapshot backing.
 const historical=ready.records[blocked.target.id].scoped_context_target.global_snapshot.immutable_snapshot.sha256;
 withStore(f.root,store=>{
  const original=store.db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(historical).bytes;
  try{
   store.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run('{}',historical);
   assert.throws(()=>scoped.scopedAssignment(ready,d.job),/Immutable (snapshot missing or corrupt|storage value missing or hash mismatch)/i);
   store.db.prepare('DELETE FROM immutable_values WHERE sha256=?').run(historical);
   assert.throws(()=>scoped.scopedAssignment(ready,d.job),/Immutable (snapshot missing or corrupt|storage value missing or hash mismatch)/i);
  }finally{store.db.prepare('INSERT OR REPLACE INTO immutable_values(sha256,bytes) VALUES(?,?)').run(historical,original);}
 });
 // Re-seal a different valid prefix with identical state and completion bytes.
 // It must cause a fresh canonical proof, never share the old cached proof.
 withStore(f.root,store=>{
  const rows=store.db.prepare('SELECT seq,at,type,value FROM events ORDER BY seq').all();
  const capsule=JSON.parse(store.db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(ready.records[f.plan_id].scoped_context_plan.capsule.immutable_snapshot.sha256).bytes);
  const changed=rows.filter(r=>r.seq>capsule.home_intake.baseline.seq),proofs=globalThis.__historicalProfile?.proofs;
  try{
   let previous=capsule.home_intake.baseline.event_sha256;
   for(const [i,row] of changed.entries()){
    const payload=JSON.parse(row.value),{sha256,...body}=payload.storage_delta;
    body.previous_event_sha256=previous;const at=i===0?'2001-01-01T00:00:00.000Z':row.at;
    const unsigned={...payload,storage_delta:body};
    const value=JSON.stringify({...unsigned,storage_delta:{...body,sha256:digest(JSON.stringify([row.seq,at,row.type,unsigned]))}});
    store.db.prepare('UPDATE events SET at=?,value=? WHERE seq=?').run(at,value,row.seq);
    previous=digest(JSON.stringify([row.seq,at,row.type,value]));
   }
   assert.deepEqual(scoped.scopedAssignment(ready,d.job),warm);
   if(proofs!==undefined)assert.ok(globalThis.__historicalProfile.proofs>proofs,'different prefix must miss');
   store.db.prepare('UPDATE events SET at=? WHERE seq=?').run('corrupt',changed[0].seq);
   assert.throws(()=>scoped.scopedAssignment(ready,d.job),/hold|held/i);
  }finally{for(const row of changed)store.db.prepare('UPDATE events SET at=?,value=? WHERE seq=?').run(row.at,row.value,row.seq);}
 });
 assert.deepEqual(read(f).records[blocked.record.id],blocked.record);assert.deepEqual(read(f).jobs[blocked.job.id],blocked.job);
 t.diagnostic(JSON.stringify({node:process.version,elapsed_ms:performance.now()-start,cold_ms,warm_ms,before_repeats:before,profile:globalThis.__historicalProfile,fictional_only:true}));
});
