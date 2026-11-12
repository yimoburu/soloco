import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {recordOriginalPeerTaskLateEvidence as unavailable} from '../plugins/soloco/runtime/peers/task-late-evidence.mjs';
import {peerTaskEffectsFixture,logicalSQLState,reference} from './peer-task-effects-fixture.mjs';

// Real temporary SQLite and genuine task/admit source commands. Only the
// original native diagnostic WeakMap is explicitly SYNTHETIC. These tests
// establish no actual native, process, provider, owner or company qualification.
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-task-late-source-'));
const source=fileURLToPath(new URL('../plugins/soloco/runtime/peers/task-late-evidence.mjs',import.meta.url));
const url=p=>pathToFileURL(p).href;
fs.writeFileSync(path.join(directory,'domain.mjs'),`
const tokens=new WeakMap();
export function mint(ledger,admission,context,data){const token=Object.freeze({});tokens.set(token,{ledger,admission,context,data});return token;}
export function assertOriginalProtectedOwnedTaskDiagnostic(token,expected){
 const r=tokens.get(token);
 if(!r||r.ledger!==expected.ledger||JSON.stringify(r.admission)!==JSON.stringify(expected.admission_ref)||r.context!==expected.context_sha256||expected.kind!=='task')throw Object.assign(Error('ORIGINAL_DIAGNOSTIC_REQUIRED'),{code:'ORIGINAL_DIAGNOSTIC_REQUIRED'});
 return structuredClone(r.data);
}
`);
const relocated=fs.readFileSync(source,'utf8')
  .replace("'./ledger.mjs'",JSON.stringify(url(path.join(path.dirname(source),'ledger.mjs'))))
  .replace("'./protected-codex-domain.mjs'",JSON.stringify(url(path.join(directory,'domain.mjs'))));
fs.writeFileSync(path.join(directory,'late.mjs'),relocated);
const {recordOriginalPeerTaskLateEvidence:record}=await import(url(path.join(directory,'late.mjs')));
const domain=await import(url(path.join(directory,'domain.mjs')));
test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));

function original(f,a){return f.ledger.read(tx=>{
  const effect=tx.get('effects',a.task.value.attempt.effect_id);
  const event=tx.events({after:effect.created_seq-1,limit:1}).items[0];
  const command=event.payload.changes.find(row=>row.family==='commands');
  return {family:'commands',id:command.id,revision:command.revision,sha256:command.sha256};
});}
function diagnostic(f,a,admission,extra={}){
  const body={protocol:'peer-owned-task-observation-v1',qualifies:false,kind:'task',
    admission_ref:admission,context_sha256:a.context.sha256,native_id:f.binding.native_id,
    thread_id:f.binding.native_id,turn_id:a.association.turn_id,process:{...a.association.process},
    output:'Exact late original output, including uncertain findings.',terminal_status:'completed',
    group_absent:null,remote_domain_closed:false,...extra};
  const data={...body,observation_sha256:peerDigest(body)};
  return {data,token:domain.mint(f.ledger,admission,a.context.sha256,data)};
}
function protectedState(f,a){return Object.fromEntries([
  ['task',['tasks',a.task.id]],['slot',['slots',a.task.id]],['effect',['effects',a.task.value.attempt.effect_id]],
  ['usage',['control','usage']],['grant',['grants','grant-cos-a']],['company',['control','company']]
].map(([name,[family,id]])=>[name,f.get(family,id)]));}

test('late output has one complete SOURCE home without replacing the original uncertain result or reservations',async t=>{
  const f=peerTaskEffectsFixture(t),a=f.start(),admission=original(f,a);
  f.finish(a,{output:'Original uncertain output.',error:'Original closure unknown.',termination_confirmed:false});
  const before=protectedState(f,a),d=diagnostic(f,a,admission),receipt=await record(f.ledger,admission,d.token);
  assert.deepEqual(protectedState(f,a),before);
  const notice=f.get('notices',receipt.notice_ref.id);
  assert.deepEqual(notice.value.observation,d.data);assert.equal(notice.value.scope,'*');
  assert.equal(notice.value.required_handoff,true);assert.equal(notice.value.uncertain_obligation,true);
  assert.equal(receipt.accepted,false);assert.equal(receipt.reservations_released,false);
  assert.equal(notice.value.source_observer,'fixed-original-native-task');
  assert.equal(notice.value.acceptance_authority,false);assert.equal(notice.value.reservation_release_authority,false);
});

test('the identical observation deduplicates before and after a supported notice disposition',async t=>{
  const f=peerTaskEffectsFixture(t),a=f.start(),admission=original(f,a),d=diagnostic(f,a,admission);
  const first=await record(f.ledger,admission,d.token),before=logicalSQLState(f);
  const again=await record(f.ledger,admission,d.token);assert.equal(again.repeated,true);
  assert.deepEqual(again.original_notice_ref,first.original_notice_ref);assert.deepEqual(logicalSQLState(f),before);
  f.run('founder','notice/resolve',{notice_id:first.notice_ref.id,source_instruction:'Fictional attributed disposition preserves original uncertainty.'});
  const resolved=logicalSQLState(f),last=await record(f.ledger,admission,d.token);
  assert.equal(last.repeated,true);assert.deepEqual(last.original_notice_ref,first.original_notice_ref);
  assert.equal(f.get('notices',last.notice_ref.id).value.status,'resolved');assert.deepEqual(logicalSQLState(f),resolved);
});

test('a new observation appends evidence while preserving the first output and source ownership attribution',async t=>{
  const f=peerTaskEffectsFixture(t),a=f.start(),admission=original(f,a);
  f.finish(a,{error:'Uncertain original launch.',termination_confirmed:false});
  const first=await record(f.ledger,admission,diagnostic(f,a,admission).token),before=protectedState(f,a);
  const second=await record(f.ledger,admission,diagnostic(f,a,admission,{output:'A distinct exact late finding.'}).token);
  assert.notEqual(first.notice_ref.id,second.notice_ref.id);assert.deepEqual(protectedState(f,a),before);
});

test('negative evidence can arrive before first finish without creating a result, review or closure',async t=>{
  const f=peerTaskEffectsFixture(t),a=f.start(),admission=original(f,a),before=protectedState(f,a);
  await record(f.ledger,admission,diagnostic(f,a,admission).token);
  assert.deepEqual(protectedState(f,a),before);assert.equal(f.get('tasks',a.task.id).value.result,undefined);
  assert.equal(f.get('slots',a.task.id).value.status,'active');
});

test('expiry, pause, revocation and canonical owner replacement do not erase original negative facts',async t=>{
  const f=peerTaskEffectsFixture(t),a=f.start(),admission=original(f,a),d=diagnostic(f,a,admission);
  f.finish(a,{error:'Original uncertainty.',termination_confirmed:false});
  f.run('founder','company/pause',{source_instruction:'Fictional source pause preserves all original attempts.'});
  f.run('founder','grant/revoke',{grant_id:'grant-cos-a'});
  f.seed('principals','founder',value=>({...value,native_id:'incoming-native',generation:value.generation+1,legacy_owner:{host:'codex',session_id:'incoming-chat',epoch:2}}));
  f.clock+=7200000;const before=protectedState(f,a),receipt=await record(f.ledger,admission,d.token);
  assert.deepEqual(protectedState(f,a),before);
  assert.equal(f.get('notices',receipt.notice_ref.id).value.observed_current_owner.legacy_owner.epoch,2);
});

for(const variant of ['json','other-ledger','other-admission','owner-kind','wrong-context'])test(`reject ${variant} evidence without writes`,async t=>{
  const f=peerTaskEffectsFixture(t),a=f.start(),admission=original(f,a),d=diagnostic(f,a,admission);let token=d.token;
  if(variant==='json')token=d.data;
  if(variant==='other-ledger')token=domain.mint(f.other,admission,a.context.sha256,d.data);
  if(variant==='other-admission')token=domain.mint(f.ledger,{...admission,id:'another'},a.context.sha256,d.data);
  if(variant==='owner-kind')token=diagnostic(f,a,admission,{kind:'owner-handover-review'}).token;
  if(variant==='wrong-context')token=diagnostic(f,a,admission,{context_sha256:'0'.repeat(64)}).token;
  const before=logicalSQLState(f);await assert.rejects(record(f.ledger,admission,token));assert.deepEqual(logicalSQLState(f),before);
});

for(const variant of ['missing-native','discrepant-native','discrepant-process'])test(`retain actual source ${variant} as uncertainty without identity authority`,async t=>{
  const f=peerTaskEffectsFixture(t),a=f.start(),admission=original(f,a);
  f.finish(a,{error:'Original uncertainty.',termination_confirmed:false});
  const extra=variant==='missing-native'?{native_id:null,thread_id:null,turn_id:null}:
    variant==='discrepant-native'?{native_id:'unexpected-native',thread_id:'unexpected-native'}:
    {process:{...a.association.process,pid:a.association.process.pid+1}};
  const d=diagnostic(f,a,admission,extra),before=protectedState(f,a),receipt=await record(f.ledger,admission,d.token);
  const notice=f.get('notices',receipt.notice_ref.id);
  assert.deepEqual(notice.value.observation,d.data);assert.deepEqual(protectedState(f,a),before);
  assert.equal(notice.value.identity[variant==='discrepant-process'?'process':'native'],variant==='missing-native'?'not-observed':'discrepant');
  assert.equal(notice.value.acceptance_authority,false);assert.equal(notice.value.reservation_release_authority,false);
});

test('non-admission commands and unavailable actual native producer cannot create evidence',async t=>{
  const f=peerTaskEffectsFixture(t),a=f.start(),admission=original(f,a),d=diagnostic(f,a,admission);
  const before=logicalSQLState(f);
  await assert.rejects(unavailable(f.ledger,admission,d.token),e=>e.code==='TASK_LATE_SOURCE_UNAVAILABLE');
  const wrong=f.ledger.read(tx=>tx.list('commands',{limit:100}).items.find(row=>row.value.action==='task/submit'));
  await assert.rejects(record(f.ledger,reference('commands',wrong),d.token));assert.deepEqual(logicalSQLState(f),before);
});

test('over-capacity raw evidence is held without a clipped record or changed task state',async t=>{
  const f=peerTaskEffectsFixture(t),a=f.start(),admission=original(f,a);
  const d=diagnostic(f,a,admission,{output:'漢'.repeat(400000)}),before=logicalSQLState(f);
  await assert.rejects(record(f.ledger,admission,d.token),e=>e.code==='TASK_LATE_EVIDENCE_CAPACITY');
  assert.deepEqual(logicalSQLState(f),before);
});

test('all immutable provenance is read before the first put and a caught late mutation poisons commit',async t=>{
  const f=peerTaskEffectsFixture(t),a=f.start(),admission=original(f,a),d=diagnostic(f,a,admission),before=logicalSQLState(f);
  const saved=f.ledger.guardedWrite;let lateHistory=0,caught;
  f.ledger.guardedWrite=function(type,principal,fn,terminal){return Reflect.apply(saved,this,[type,principal,tx=>{
    let wrote=false;const view={...tx,put(...args){wrote=true;return tx.put(...args);},getVersion(...args){if(wrote)lateHistory++;return tx.getVersion(...args);},events(...args){if(wrote)lateHistory++;return tx.events(...args);}};
    const result=fn(Object.freeze(view));
    try{const task=tx.get('tasks',a.task.id);tx.put('tasks',task.id,{...task.value,status:'returned'},task.revision);}catch(error){caught=error;}
    return result;
  },terminal]);};
  try{await assert.rejects(record(f.ledger,admission,d.token));}finally{f.ledger.guardedWrite=saved;}
  assert(caught);assert.equal(lateHistory,0);assert.deepEqual(logicalSQLState(f),before);
});
