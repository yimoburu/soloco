// FICTIONAL contract doubles only: real public APIs, storage and worker receipts;
// no company exports, external execution, native semantic acceptance or fit claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import cp from 'node:child_process';
import net from 'node:net';
import {syncBuiltinESMExports} from 'node:module';
import {fixture,read,context,review,home,extraction,domainArgs,aggregate,sha} from './support/scoped-home-fixture.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import * as scoped from '../plugins/soloco/runtime/scoped-context.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {reviewedContext} from '../plugins/soloco/runtime/current-state.mjs';
import {operatingContext,operatingFrontier,validateOperatingIndex} from '../plugins/soloco/runtime/operating-state.mjs';
import {inheritSnapshots,resolveSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';

function forbidExternal(t){
 const attempts=[];
 // Capability presentation is irrelevant to this fixture; model the local
 // sandbox executable as absent so company_open cannot launch its OS probe.
 const exists=fs.existsSync;t.mock.method(fs,'existsSync',file=>file==='/usr/bin/sandbox-exec'?false:exists(file));
 const deny=(object,key)=>t.mock.method(object,key,()=>{attempts.push(key);throw Error('Unexpected external execution: '+key);});
 for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])deny(cp,key);
 for(const key of ['connect','createConnection','createServer'])deny(net,key);
 deny(net.Socket.prototype,'connect');deny(net.Server.prototype,'listen');deny(globalThis,'fetch');
 syncBuiltinESMExports();
 t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();assert.deepEqual(attempts,[]);});
}
const operating=(f,args)=>context(f,{protocol:'operating-state-v1',...args});
const clone=s=>inheritSnapshots(s,structuredClone(s));
async function preserve(f){
 const es=await extraction(f);await home(f);
 const d=await review(f,domainArgs(es));assert.equal(d.job.status,'completed',d.job.error);
 await aggregate(f,es,d);
}
async function publish(f){
 const p=await operating(f,{action:'plan',maintenance:true});assert.equal(p.held,false,JSON.stringify(p.frontier));
 const q=engine.dispatch({...f,role:'qa',review_of:p.id,task:'FICTIONAL scripted publication after exact frozen-parent preservation.'},'codex',{check:()=>({available:true,authenticated:true}),launch:()=>({on(){},unref(){}})});
 const s=read(f),assignment=assignmentContext(s,s.jobs[q.id]),evidence=assignment.operating_evidence??assignment.qualification_evidence;
 // Request one complete bounded range at a time so response framing cannot defer
 // a range that this fictional adapter has already removed from its queue.
 const stream=evidence?.sources[evidence.pages[0].source_id],reads=[];
 if(stream)for(let offset=0;offset<stream.length;){let length=Math.min(16000,stream.length-offset);if(/[\uD800-\uDBFF]/.test(stream.raw[offset+length-1]))length--;reads.push({source_id:stream.source_id,sha256:stream.sha256,offset,length});offset+=length;}
 else {const required=JSON.parse(assignment.text).required_evidence;for(const ref of required.sources.filter(ref=>!required.inline.some(x=>x.source.id===ref.id)))for(let offset=0;offset<ref.total_characters;offset+=16000)reads.push({id:ref.id,sha256:ref.sha256,offset,length:Math.min(16000,ref.total_characters-offset)});}
 let first=true;
 await work(f.root,q.id,async(_host,_session,_prompt,_dir,timeout,_selection,options)=>{
  if(first){first=false;options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));}
  const native_id='fictional-publication-'+q.id;
  if(reads.length)return {native_id,text:JSON.stringify({reads:reads.splice(0,1)})};
  return {native_id,text:JSON.stringify({content:'FICTIONAL scripted contract judgment; no native semantic QA.',messages:[],notices:[],review:{verdict:'Pass',reason:'FICTIONAL mechanics only; UNKNOWN, ZERO allowance and no execution retained.',permitted_action:'publish_operating_state',plan_sha256:sha(read(f).records[p.id].operating_plan),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}})};
 });
 const job=read(f).jobs[q.id];assert.equal(job.status,'completed',job.error);
 assert.equal((await operating(f,{action:'apply',plan_id:p.id,review_id:job.artifact_id})).published,true);
}

test('canonical frozen-intake parent is proof bookkeeping through synthetic operating publication',async t=>{
 forbidExternal(t);
 const f=await fixture({frozenIntake:true}),before=read(f),child=before.records[f.plan_id];
 const capsule=resolveSnapshot(before,child.scoped_context_plan.capsule),material=resolveSnapshot(before,capsule.projection);
 const parent=before.records[capsule.frozen_intake.parent.id];
 assert.equal(capsule.frozen_intake.parent.id,parent.id);
 assert.ok(!material.sources.some(r=>r.source.id===parent.id),'The parent is created after its own frozen capture');
 assert.ok(operatingFrontier(before).entries.some(e=>e.source.id===parent.id),'An unaccepted parent is still consequential');
 await preserve(f);
 const preserved=read(f),projection=reviewedContext(preserved);
 assert.ok(projection.proofs.has(parent.id),'Canonical validation must retain the exact frozen parent in proof bookkeeping');
 assert.ok(projection.excluded(parent.id));assert.deepEqual(operatingFrontier(preserved).entries,[]);
 assert.deepEqual(preserved.records[parent.id],parent,'Preservation must not rewrite its parent');
 await publish(f);
 const accepted=read(f);assert.equal(validateOperatingIndex(accepted),true);assert.equal(operatingContext(accepted).homes.length,1);
 assert.equal(accepted.paused,true);assert.equal(accepted.records.home.operating_record.remaining,0);assert.equal(accepted.records.home.operating_record.revoked,true);
});

test('frozen-parent bookkeeping does not exclude unrelated plans or accept changed parent evidence',async t=>{
 forbidExternal(t);
 const f=await fixture({frozenIntake:true}),initial=read(f),parentId=resolveSnapshot(initial,initial.records[f.plan_id].scoped_context_plan.capsule).frozen_intake.parent.id;
 const unrelated=await context(f,{action:'plan',source_id:'archive',partitioner:scoped.CORPUS_PARTITIONER,corpus_plan_id:parentId,maintenance:true});
 await preserve(f);
 const s=read(f),projection=reviewedContext(s),frontier=operatingFrontier(s);
 assert.equal(projection.excluded(unrelated.id),false);
 assert.ok(frontier.entries.some(e=>e.source.id===unrelated.id&&e.status==='DIRTY'));
 for(const [label,change] of [
  ['changed parent bytes',bad=>{bad.records[parentId].source_reference+=' changed';}],
  ['changed parent capsule',bad=>{bad.records[parentId].scoped_context_plan.capsule.immutable_snapshot.sha256='0'.repeat(64);}],
  ['revoked parent',bad=>{bad.records[parentId].context_maintenance.revoked_at='2026-11-01T00:00:00.000Z';}],
  ['stale owner',bad=>{bad.owner.epoch++;}]
 ]){const bad=clone(s);change(bad);assert.throws(()=>reviewedContext(bad),/changed|missing|corrupt|Held|hold|stale|authority/i,label);}
});
