// Real temporary P1/P2/P8 mechanics. Native/process labels are SYNTHETIC host
// observations, not authentication, native qualification or migration permission.
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {execute,inspect,authorize,createRuntimeObserver,digest} from '../plugins/soloco/runtime/peers/model.mjs';
import {createMembershipLifecycle} from '../plugins/soloco/runtime/peers/membership.mjs';
import {peerFixture} from './peer-fixture.mjs';

const origin={legacy_source_cut_sha256:'a'.repeat(64),legacy_backup:{directory:'synthetic-retained-backup',file:'synthetic/company.sqlite',sha256:'b'.repeat(64),source_cut_sha256:'a'.repeat(64)}};
const actor=principal_id=>({principal_id});
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const held=e=>e.code==='AUTHORITY_CHANGED'&&/legacy.*origin.*unqualified/i.test(e.message);
function state(f){return f.ledger.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name,sql})=>({name,sql,rows:f.ledger.db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(row=>canonical(row)).sort()}));}
function fixture(t,control={}){
  const f=peerFixture({control});t.after(()=>f.close());let n=0;
  f.id=prefix=>prefix+'-'+(++n);
  f.get=(family,id)=>f.ledger.read(tx=>tx.get(family,id));
  f.run=(who,action,args={})=>execute(f.ledger,actor(who),action,{operation_id:f.id('command'),...args});
  f.control=change=>f.ledger.write('synthetic-input-origin-change','founder',tx=>{const c=tx.get('control','company');return tx.put('control',c.id,{...c.value,...change},c.revision);});
  f.deny=fn=>{const before=state(f);assert.throws(fn,held);assert.deepEqual(state(f),before);};
  f.task=()=>{const row=f.run('founder','task/submit',{task_id:f.id('task'),scope:'alpha',role:'engineer',instructions:'Synthetic exact bounded work.',acceptance:'Return attributable output.'});f.run('founder','task/claim',{task_id:row.id});return row;};
  f.start=()=>{const task=f.task(),a=f.run('scheduler','task/admit',{task_id:task.id});assert.equal(a.admitted,true);return a;};
  f.member=createMembershipLifecycle(f.ledger);
  f.enroll=()=>f.member.operator.enroll({operation_id:f.id('enroll'),enrollment_id:f.id('membership'),principal_id:f.id('incoming'),role:'cos',host:'codex',scope:'alpha',input_refs:[],expected_generation:0,max_model_calls:2,expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Synthetic bounded operator instruction; not authentication.'});
  f.phase=(e,phase='reconstruction')=>f.member.operator.admit({operation_id:f.id('admit'),enrollment_id:e.value.enrollment_id,phase,...(phase==='review'?{reviewer_principal_id:'reviewer'}:{})});
  f.observe=(e,a,phase='reconstruction')=>{
    const binding={enrollment_id:e.value.enrollment_id,phase,attempt_id:a.phase.value.attempt_id},process={pid:9000+n,started_at:new Date().toISOString()};
    f.member.host.bind({operation_id:f.id('bind'),...binding,native_id:f.id('synthetic-native'),observed_process:process});
    const channel=f.member.host.channel(binding),header=channel.header();let offset=0,text='';
    while(offset<header.total_characters){const p=channel.read({sha256:header.sha256,offset,length:Math.min(8192,header.total_characters-offset)});text+=p.text;offset=p.next_offset;}
    assert.equal(digest(text),header.sha256);assert.equal(offset,header.total_characters);
    const output=phase==='review'?canonical({review:{subject:header.subject,verdict:'Pass',reason:'Independent synthetic unit review.',blockers:[]}}):'Synthetic complete current reconstruction.';
    channel.submit({operation_id:f.id('submit'),sha256:header.sha256,content:output});
    return {binding,process,output};
  };
  f.finish=o=>f.member.host.finish({operation_id:f.id('finish'),...o.binding,output:o.output,termination_confirmed:true,observed_process:{...o.process,close_observed:true}});
  return f;
}

test('both origin markers absent preserves genuine nonlegacy resume and charged task admission',t=>{
  const f=fixture(t,{paused:true});f.run('founder','company/resume',{source_instruction:'Synthetic explicit resume.'});
  const a=f.start();assert.equal(a.task.value.attempt.model_calls,1);assert.equal(f.get('control','usage').value.model_calls,1);assert.equal(f.get('control','usage:founder').value.model_calls,1);
});

const markerCases=[
  ['complete pair',origin],['source only',{legacy_source_cut_sha256:origin.legacy_source_cut_sha256}],['backup only',{legacy_backup:origin.legacy_backup}],
  ['null source',{legacy_source_cut_sha256:null}],['null backup',{legacy_backup:null}],['empty source',{legacy_source_cut_sha256:''}],
  ['malformed backup',{legacy_backup:17}],['false marker',{legacy_source_cut_sha256:false}],['forged ready',{...origin,legacy_ready:true,continuity:{status:'qualified',ready:true}}]
];
for(const [name,markers]of markerCases)test(`ANY own imported-origin marker holds resume without writes: ${name}`,t=>{
  const f=fixture(t,{paused:true,...markers});f.deny(()=>f.run('founder','company/resume',{source_instruction:'Synthetic resume must not erase original obligations.'}));assert.equal(f.get('control','company').value.paused,true);
});

test('nested user objects resembling origin/readiness metadata stay opaque nonlegacy data',t=>{
  const f=fixture(t,{paused:true,user_data:{...origin,legacy_ready:false}});f.run('founder','company/resume',{source_instruction:'Synthetic nonlegacy explicit resume.'});assert.equal(f.start().admitted,true);
});

test('fresh scheduler admission holds an already queued real task before any usage, slot, effect, claim or command write',t=>{
  const f=fixture(t),task=f.task();f.control(origin);f.deny(()=>f.run('scheduler','task/admit',{task_id:task.id}));assert.equal(f.get('tasks',task.id).value.attempt,null);assert.equal(f.get('control','usage'),null);
});

for(const action of ['task/submit','task/claim','home/publish','github/atomic-publish'])test(`same fresh pause-fenced authorization also holds imported origin: ${action}`,t=>{
  const f=fixture(t,origin);f.deny(()=>f.ledger.read(tx=>authorize(tx,actor('founder'),action,{scope:'alpha',resources:[]})));
});

test('fresh actual founder task producer cannot bypass unresolved origin',t=>{
  const f=fixture(t,origin);f.deny(()=>f.run('founder','task/submit',{scope:'alpha',role:'engineer',instructions:'Attempted successor work.',acceptance:'Must remain held.'}));
});

for(const imported of [false,true])test(`trusted scheduler direct claim has real resource mutation only for nonlegacy control: imported=${imported}`,t=>{
  const f=fixture(t),task=f.run('founder','task/submit',{scope:'alpha',role:'engineer',instructions:'Synthetic exact resource owner.',acceptance:'Retain original scope.',resources:['home:fact']});
  if(imported){f.control(origin);f.deny(()=>f.run('scheduler','task/claim',{task_id:task.id}));assert.equal(f.get('tasks',task.id).value.status,'planned');assert.equal(f.ledger.read(tx=>tx.count('claims',{status:'held'})),0);}
  else {assert.equal(f.run('scheduler','task/claim',{task_id:task.id}).value.status,'pending');assert.equal(f.ledger.read(tx=>tx.count('claims',{status:'held'})),1);}
});

test('origin hold does not block status, pause, notices or cancel an already queued task',t=>{
  const f=fixture(t),task=f.task();f.control(origin);assert.equal(inspect(f.ledger,actor('founder'),'runtime/status').pending_count,1);
  assert.equal(f.run('founder','notice/create',{scope:'alpha',content:'Original obligation remains unresolved.'}).value.status,'pending');
  assert.equal(f.run('founder','task/cancel',{task_id:task.id,reason:'Contain unresolved imported scope.'}).value.status,'cancelled');
  f.run('founder','company/pause',{source_instruction:'Synthetic founder containment.'});assert.equal(f.get('control','company').value.paused,true);
});

test('genuine nonlegacy P8 reconstruction and independent protected review still activate with two durable admissions',t=>{
  const f=fixture(t),e=f.enroll();for(const phase of ['reconstruction','review']){const a=f.phase(e,phase),o=f.observe(e,a,phase);assert.equal(f.finish(o).accepted,true);}
  const result=f.member.operator.activate({operation_id:f.id('activate'),enrollment_id:e.value.enrollment_id,source_instruction:'Synthetic checked activation.'});assert.equal(result.principal.value.status,'active');assert.equal(f.get('control','usage').value.model_calls,2);
});

for(const [name,markers]of [['complete pair',origin],['partial malformed',{legacy_backup:null,legacy_ready:true}]])test(`P8 actual private admission holds imported origin even when input paused is false: ${name}`,t=>{
  const f=fixture(t,markers),e=f.enroll();f.deny(()=>f.phase(e));assert.equal(f.get('control','usage'),null);assert.equal(f.get('work_items',e.id).value.used_model_calls,0);
});

test('prior genuine P2 unknown attempt preserves raw outcome, spent usage and exact protected closure after origin appears',t=>{
  const f=fixture(t),a=f.start(),observer=createRuntimeObserver(f.ledger),process={pid:19200,started_at:a.task.value.attempt.admitted_at};f.control(origin);
  const result=observer.record('task/finish',{operation_id:f.id('finish-unknown'),task_id:a.task.id,attempt_id:a.task.value.attempt.id,output:'Retain uncertain original output.',native_id:'synthetic-original-native',error:{message:'Synthetic lost closure.'},termination_confirmed:false,observed_process:process});
  assert.equal(result.accepted,false);assert.equal(result.task.value.status,'unknown');assert.equal(f.get('slots',a.task.id).value.status,'unknown');assert.equal(f.get('control','usage').value.model_calls,1);
  const closed=observer.record('task/closure',{operation_id:f.id('close'),task_id:a.task.id,attempt_id:a.task.value.attempt.id,termination_confirmed:true,observed_process:{...process,close_observed:true}});
  assert.equal(closed.value.status,'quarantined');assert.equal(closed.value.result.output,'Retain uncertain original output.');assert.equal(f.get('slots',a.task.id).value.status,'released');assert.equal(f.get('control','usage').value.model_calls,1);
});

test('prior genuine P2 closed finish quarantines after origin appears without granting acceptance or refund',t=>{
  const f=fixture(t),a=f.start(),observer=createRuntimeObserver(f.ledger);f.control(origin);
  const result=observer.record('task/finish',{operation_id:f.id('finish-closed'),task_id:a.task.id,attempt_id:a.task.value.attempt.id,output:'Retain closed original output.',native_id:'synthetic-original-native',termination_confirmed:true,observed_process:{pid:19201,started_at:a.task.value.attempt.admitted_at,close_observed:true}});
  assert.equal(result.accepted,false);assert.equal(result.task.value.status,'quarantined');assert.equal(f.get('slots',a.task.id).value.status,'released');assert.equal(f.get('control','usage').value.model_calls,1);
});

test('P8 prior genuine running phase retains submitted raw output and observed closure as quarantined after origin appears',t=>{
  const f=fixture(t),e=f.enroll(),a=f.phase(e),o=f.observe(e,a);f.control(origin);const result=f.finish(o);
  assert.equal(result.accepted,false);assert.equal(result.result.value.status,'quarantined');assert.equal(result.result.value.output,o.output);assert.equal(result.result.value.termination_confirmed,true);assert.equal(result.phase.value.status,'closed');assert.equal(f.get('slots',a.phase.value.execution_id).value.status,'released');assert.equal(f.get('control','usage').value.model_calls,1);
});

test('P8 exact host.close remains usable under imported origin without semantic acceptance or refund',t=>{
  const f=fixture(t),e=f.enroll(),a=f.phase(e),o=f.observe(e,a);f.control(origin);
  const result=f.member.host.close({operation_id:f.id('close'),...o.binding,termination_confirmed:true,observed_process:{...o.process,close_observed:true}});
  assert.equal(result.value.status,'closed');assert.equal(result.value.closed_without_result,true);assert.equal(f.get('effects',a.phase.value.execution_id).value.status,'failed');assert.equal(f.get('slots',a.phase.value.execution_id).value.status,'released');assert.equal(f.get('control','usage').value.model_calls,1);
});


// Additive real P1/P2/P8 regression; marker values never qualify readiness.
test('standalone own legacy_ready variants hold real resume and private admission without writes',t=>{
  for(const value of [false,null,true,{status:'partial'}]){
    const paused=fixture(t,{paused:true,legacy_ready:value});
    paused.deny(()=>paused.run('founder','company/resume',{source_instruction:'Synthetic resume cannot qualify imported origin.'}));
    assert.equal(paused.get('control','company').value.paused,true);
    const pending=fixture(t,{legacy_ready:value}),enrollment=pending.enroll();pending.deny(()=>pending.phase(enrollment));
    assert.equal(pending.get('control','usage'),null);assert.equal(pending.get('work_items',enrollment.id).value.used_model_calls,0);
  }
});
