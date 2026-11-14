// Selected Source check, excluded from the ordinary *.test.mjs suite.
// Load this in a fresh Node process. Its clock, worker/model ChildProcesses
// and CLI output are explicitly controlled. Store SQL, the final COMMIT fence,
// Source worker/adapter, and pinned Python evidence IO remain real.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Install before ANY project import: Store/runtime retain this clock function.
// It follows wall time except during one synchronous, deliberately late write.
const wallNow=Date.now;
let clockOffset=0;
Date.now=()=>wallNow()+clockOffset;
const {Store}=await import('../plugins/soloco/runtime/store.mjs');
const {work}=await import('../plugins/soloco/runtime/worker.mjs');
const {runRuntimeModel}=await import('../plugins/soloco/runtime/adapters.mjs');
const {createComparisonWorkerPlanFrom}=await import('../plugins/soloco/runtime/integrated-comparison-worker.mjs');
const {fixture,queuedArm,optionalDarwin}=await import('./issue18-comparison-fixture.mjs');

function fullFileAnswer(arm){
  const frames=[];
  for(const file of arm.files){
    frames.push({seq:frames.length,type:'file_start',path:file.path});
    let chunk='',bytes=0;
    for(const scalar of file.target){
      const n=Buffer.byteLength(scalar);
      if(bytes+n>4096){frames.push({seq:frames.length,type:'chunk',path:file.path,text:chunk});chunk='';bytes=0;}
      chunk+=scalar;bytes+=n;
    }
    if(chunk)frames.push({seq:frames.length,type:'chunk',path:file.path,text:chunk});
    frames.push({seq:frames.length,type:'file_end',path:file.path});
  }
  frames.push({seq:frames.length,type:'output_end'});
  return JSON.stringify({content:'Controlled Source deadline fixture; no Native or acceptance claim.',messages:[],notices:[],full_file_output:{protocol:'full-file-output-chunks-v1',frames}});
}
for(const expireAfterBeforeCommit of [false,true]){
  test(expireAfterBeforeCommit?'short comparison deadline expires after publication guards and rolls back at physical COMMIT':'same actual publication commits while both deadlines remain live',optionalDarwin,async t=>{
    const f=fixture(t),run=f.initialize(),stores=f.enroll(run),a=await queuedArm(t,f,run,stores['1-files'],'1-files');
    const plan=createComparisonWorkerPlanFrom(run,a.store,a.armId,a.job.id),model=f.modelFor(a.store,a.job);
    const original=Store.prototype.transaction;
    let publicationReached=false,comparisonDeadline=null,ordinaryDeadline=null,advancedAt=null;
    const mock=t.mock.method(Store.prototype,'transaction',function(type,change,options={}){
      if(this.root!==a.store.root||type!=='job.completed')return Reflect.apply(original,this,[type,change,options]);
      try{
        return Reflect.apply(original,this,[type,change,{...options,beforeCommit:(db,state)=>{
          options.beforeCommit?.(db,state);
          assert.equal(publicationReached,false);publicationReached=true;
          const headers=Object.values(state.records).filter(record=>record.job_id===a.job.id&&record.runtime_wire_evidence);
          assert.equal(headers.length,1);assert.equal(headers[0].runtime_wire_evidence.state,'derived');
          comparisonDeadline=headers[0].runtime_wire_evidence.binding.call_policy.absolute_deadline_ms;
          ordinaryDeadline=Date.parse(state.jobs[a.job.id].execution_deadline_at);
          assert(Number.isSafeInteger(comparisonDeadline));assert(Number.isSafeInteger(ordinaryDeadline));
          assert(Date.now()<comparisonDeadline);assert(comparisonDeadline+1<ordinaryDeadline);
          if(expireAfterBeforeCommit){
            clockOffset=comparisonDeadline+1-wallNow();advancedAt=Date.now();
            assert(advancedAt>=comparisonDeadline);assert(advancedAt<ordinaryDeadline);
          }
        }}]);
      }finally{clockOffset=0;}
    });
    const completion=work(a.store.root,a.job.id,runRuntimeModel,plan);completion.catch(()=>{});
    try{
      await Promise.race([model.ready,completion.then(()=>{throw Error('Completed before controlled model entry');},error=>{throw error;})]);
      model.answer(fullFileAnswer(a));
      if(expireAfterBeforeCommit)await assert.rejects(completion,error=>error.code==='ROLE_TIMEOUT'&&error.message==='Comparison final pre-COMMIT deadline reached');
      else await completion;
      assert.equal(publicationReached,true);assert.equal(clockOffset,0);
      const state=a.store.read(),job=state.jobs[a.job.id];
      const candidates=Object.values(state.records).filter(record=>record.job_id===a.job.id&&record.development?.type==='candidate');
      const headers=Object.values(state.records).filter(record=>record.job_id===a.job.id&&record.runtime_wire_evidence);
      assert.equal(headers.length,1);assert.equal(headers[0].revision,3);assert.equal(headers[0].runtime_wire_evidence.state,'derived');
      assert.equal(a.store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='job.completed'").get().n,expireAfterBeforeCommit?0:1);
      assert.equal(candidates.length,expireAfterBeforeCommit?0:1);
      assert.equal(job.status,expireAfterBeforeCommit?'failed':'completed');
      if(expireAfterBeforeCommit){assert(advancedAt<ordinaryDeadline);assert.equal(job.artifact_id,undefined);}
      else{assert.equal(job.artifact_id,candidates[0].id);assert.equal(candidates[0].status,'Submitted');}
      assert.equal(f.boundary.effects.filter(effect=>effect.kind==='synthetic model creation').length,1);
      assert(fs.existsSync(path.join(f.parentPath,'selected-run','slot-1-files-engineer.json')));
      assert.equal(Object.values(state.records).filter(record=>record.runtime_candidate_test_guard).length,0);
      assert.equal(a.store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='development.accepted'").get().n,0);
      assert.equal(headers[0].runtime_wire_evidence.binding.run_id,f.selection.run_id);
      f.done();
    }finally{
      clockOffset=0;mock.mock.restore();
      if(!model.child.closed)model.close(1,'SIGTERM');
      await completion.catch(()=>{});
    }
  });
}
