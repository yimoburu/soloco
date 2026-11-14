import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {requestModelProcess,legacyRetentionModelRequestTransition,modelProcessProducerTransition} from '../plugins/soloco/runtime/model-process-closure.mjs';
import {beginRetentionPrimaryDelivery} from '../plugins/soloco/runtime/retention-primary-transport.mjs';
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));

// FICTIONAL structural history only. These objects confer no Store custody,
// process birth, Native QA, sharing permission or actual model invocation.
function example(){
 const at='2026-01-01T00:00:00.000Z',born='2026-01-01T00:00:00.001Z',closed='2026-01-01T00:00:00.002Z';
 const birth={protocol:'ordinary-model-process-birth-v1',launch_id:'fictional-old-cli',host:'codex',pid:333,worker_pid:222,spawned_at:born,command_sha256:'1'.repeat(64),argv_sha256:'2'.repeat(64),cwd_sha256:'3'.repeat(64)};
 const old={invocation_id:'fictional-old-invocation',job_id:'fictional-qa',instance_id:'fictional-instance',worker_pid:222,host:'codex',requested_at:at,birth,closure:{protocol:'ordinary-model-process-close-v1',birth_sha256:sha(birth),closed_at:closed,exit_code:0,signal:null,observation:'original-child-close'}};
 const before={id:'fictional-qa',role:'qa',status:'running',instance_id:'fictional-instance',worker_pid:222,host:'codex',native_id:'fictional-native',retention_repair_id:'fictional-ticket',task:'FICTIONAL structural review',legacy_runtime:{protocol:'unqualified-runtime-processes-v1',worker:{launch_id:'00000000-0000-4000-8000-000000000001',controller_pid:111,requested_at:at,deadline_at_ms:Date.parse(at)+60000,recipe:'ordinary_worker',descriptor_sha256:'4'.repeat(64),parent_launch_id:null,request_sha256:null,birth:{pid:222,observed_at:born},closure:null},watchdog:null,test_child:null},model_process_tracking:{version:1,current:old.invocation_id,invocations:[old]}};
 const after=clone(before),invocation={invocation_id:'fictional-final-invocation',job_id:after.id,instance_id:after.instance_id,worker_pid:after.worker_pid,host:after.host,requested_at:'2026-01-01T00:00:00.003Z'};
 requestModelProcess(after,invocation);
 const request=JSON.stringify({protocol:'development-retention-primary-final-v1',content:'FICTIONAL bounded frame; no semantic acceptance.'}),frame={text:request,sha256:sha(request),canonical_primary_sha256:'5'.repeat(64),snapshot_sha256:'6'.repeat(64)};
 beginRetentionPrimaryDelivery(after,{native_id:after.native_id,request,frame,invocation_id:invocation.invocation_id});
 return {before,after};
}

test('atomic legacy final request has one shared exact cold/operating producer grammar',()=>{
 const {before,after}=example();
 assert.equal(legacyRetentionModelRequestTransition(before,after),true);
 assert.equal(modelProcessProducerTransition(before,after,'job.model_process.requested'),true);
 assert.equal(modelProcessProducerTransition(before,after,'job.model_process.born'),false);
 const trackingOnly=clone(after);delete trackingOnly.retention_primary_delivery;
 assert.equal(modelProcessProducerTransition(before,trackingOnly,'job.model_process.requested'),true);
 assert.equal(legacyRetentionModelRequestTransition(before,trackingOnly),false);
});

test('joint request cannot hide unrelated changes, copied origins or mismatched delivery identity',()=>{
 const {before,after}=example();
 const mutations=[
  value=>{value.task='changed unrelated assignment';},
  value=>{value.retention_primary_delivery.unreviewed='extra';},
  value=>{value.retention_primary_delivery.native_id='different-native';},
  value=>{value.retention_primary_delivery.requested_invocation_id='fictional-old-invocation';},
  value=>{value.retention_primary_delivery.frame_sha256='not-a-hash';},
  value=>{value.model_process_tracking.invocations.at(-1).worker_pid=999;},
  value=>{value.legacy_runtime.worker.birth.pid=999;},
  value=>{value.status='completed';},
 ];
 for(const mutate of mutations){const changed=clone(after);mutate(changed);assert.equal(modelProcessProducerTransition(before,changed,'job.model_process.requested'),false);}
 for(const marker of [null,false,{}]){const old=clone(before),next=clone(after);old.original_execution_assignment=marker;next.original_execution_assignment=marker;assert.equal(modelProcessProducerTransition(old,next,'job.model_process.requested'),false);}
 const repeated=clone(before);repeated.retention_primary_delivery=null;
 assert.equal(modelProcessProducerTransition(repeated,after,'job.model_process.requested'),false);
});
