import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createMembershipLifecycle} from '../plugins/soloco/runtime/peers/membership.mjs';
import {execute} from '../plugins/soloco/runtime/peers/model.mjs';
import {peerFixture} from './peer-fixture.mjs';

// Private source-guard DATA tests with real isolated P1 admissions. The local
// record passed to the helper is NOT an original launch, interpreter, process,
// provider witness or native capability. Nothing below creates a public issuer,
// spawns a child, contacts a provider or claims native acceptance.
const reference=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const held=error=>error?.code==='PROTECTED_CODEX_ORIGINAL_ADMISSION_HELD';
const source=fileURLToPath(new URL('../plugins/soloco/runtime/peers/protected-codex-domain.mjs',import.meta.url));
async function fixture(t,{recovery=false,review=false}={}){
  const f=peerFixture();t.after(()=>f.close());
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-membership-source-guard-')));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const original=fs.readFileSync(source,'utf8'),copy=path.join(directory,'domain-read-guard.mjs');
  const linked=original.replace(/from '(\.\/[^']+)'/g,(_whole,specifier)=>'from '+JSON.stringify(pathToFileURL(path.resolve(path.dirname(source),specifier)).href));
  fs.writeFileSync(copy,linked+'\nexport {currentNativeMembership as __testOnlyCurrentMembershipData};\n');
  const {__testOnlyCurrentMembershipData:guard}=await import(pathToFileURL(copy).href),service=createMembershipLifecycle(f.ledger);let sequence=0;
  const op=label=>label+'-'+(++sequence);
  const request={role:'cos',host:'codex',scope:'alpha',input_refs:[],expires_at:new Date(Date.now()+3600000).toISOString(),max_model_calls:4,source_instruction:'Synthetic source-guard scope only; no host or human authentication.'};
  let enrollment=service.operator.enroll({operation_id:op('enroll'),enrollment_id:'guard-enrollment',principal_id:'guard-member',expected_generation:0,...request});
  const admit=phase=>service.operator.admit({operation_id:op('admit'),enrollment_id:enrollment.value.enrollment_id,phase,...(phase==='review'?{reviewer_principal_id:'guard-reviewer'}:{})});
  let admission=admit('reconstruction'),prior=null;
  if(recovery){
    prior={enrollment,admission};
    service.operator.revoke({operation_id:op('revoke'),enrollment_id:enrollment.value.enrollment_id,source_instruction:'Synthetic explicit recovery from one preserved uncertain reservation.'});
    enrollment=service.operator.enroll({operation_id:op('recover'),enrollment_id:'guard-recovered-enrollment',principal_id:'guard-member',expected_generation:1,...request,max_model_calls:3});
    admission=admit('reconstruction');
  }
  if(review){
    const binding={enrollment_id:enrollment.value.enrollment_id,phase:'reconstruction',attempt_id:admission.phase.value.attempt_id},process={pid:34567,started_at:'2026-11-11T00:00:00.000Z'};
    service.host.bind({operation_id:op('bind-reconstruction'),...binding,native_id:'synthetic-reconstruction-native',observed_process:process});
    const channel=service.host.channel(binding),header=channel.header();let offset=0;
    while(offset<header.total_characters){const part=channel.read({sha256:header.sha256,offset,length:Math.min(8192,header.total_characters-offset)});offset=part.next_offset;}
    const output='Synthetic source reconstruction only.';channel.submit({operation_id:op('submit'),sha256:header.sha256,content:output});
    service.host.finish({operation_id:op('finish'),...binding,output,termination_confirmed:true,observed_process:{...process,close_observed:true}});
    admission=admit('review');
  }
  const phase=f.ledger.read(tx=>tx.getVersion(reference('work_items',admission.phase))),record={membership_admission:{ledger:f.ledger,phase},birth:null,native_thread:null};
  const mutate=(family,id,change)=>f.ledger.write('synthetic.source-guard-negative-control','founder',tx=>{const previous=tx.get(family,id);return tx.put(family,id,change(previous.value),previous.revision);});
  const current=(family,id)=>f.ledger.read(tx=>tx.get(family,id));
  return {...f,guard,service,enrollment,admission,record,mutate,current,prior};
}

test('the private guard reads an actual reserved admission without creating a capability or spending again',async t=>{
  const f=await fixture(t),before=f.ledger.read(tx=>tx.events({after:0,limit:100}).items),value=f.guard(f.record);
  assert.equal(value.membership_id,f.enrollment.value.enrollment_id);assert.equal(value.native_id,null);assert.equal(value.context_sha256,f.admission.context.sha256);
  assert.equal(Object.hasOwn(value,'native_qualified'),false);assert.equal(f.current('control','usage').value.model_calls,1);
  assert.deepEqual(f.ledger.read(tx=>tx.events({after:0,limit:100}).items),before);
});

test('changing the current context cannot fall back to its historical admitted bytes',async t=>{
  const f=await fixture(t);f.guard(f.record);
  f.mutate('work_items',f.admission.phase.value.context_ref.id,value=>({...value,text:value.text+' '}));
  assert.throws(()=>f.guard(f.record),held);assert.equal(f.current('control','usage').value.model_calls,1);
});

test('changed enrollment expiry or original operator reference cannot reuse the frozen admission',async t=>{
  for(const change of [value=>({...value,expires_at:new Date(Date.parse(value.expires_at)+60000).toISOString()}),value=>({...value,operator_ref:{...value.operator_ref,sha256:'0'.repeat(64)}})])await t.test('changed original authority',async t=>{
    const f=await fixture(t);f.guard(f.record);f.mutate('work_items',f.enrollment.id,change);
    assert.throws(()=>f.guard(f.record),held);
  });
});

test('a current pause or revoked operator blocks the source admission guard',async t=>{
  for(const [family,id,change] of [['control','company',value=>({...value,paused:true})],['principals','founder',value=>({...value,status:'revoked'})]])await t.test(id,async t=>{
    const f=await fixture(t);f.guard(f.record);f.mutate(family,id,change);assert.throws(()=>f.guard(f.record),held);
  });
});

test('an enrollment index or incoming principal incarnation change blocks the original phase',async t=>{
  for(const [family,id,change] of [['work_items','membership-index:guard-member',value=>({...value,enrollment_id:'other-enrollment'})],['principals','guard-member',value=>({...value,generation:value.generation+1})]])await t.test(id,async t=>{
    const f=await fixture(t);f.guard(f.record);f.mutate(family,id,change);assert.throws(()=>f.guard(f.record),held);
  });
});

test('new applicable source meaning invalidates the original membership context',async t=>{
  const f=await fixture(t);f.guard(f.record);
  execute(f.ledger,{principal_id:'founder'},'notice/create',{operation_id:'new-source-obligation',scope:'alpha',content:'Synthetic new unresolved obligation.'});
  assert.throws(()=>f.guard(f.record),held);
});

test('the final read cutoff rejects an original expiry without rewriting or extending it',async t=>{
  const f=await fixture(t);f.guard(f.record);const now=Date.now;
  Date.now=()=>Date.parse(f.enrollment.value.expires_at)+1;
  try{assert.throws(()=>f.guard(f.record),error=>error?.code==='PROTECTED_CODEX_ADMISSION_EXPIRED');}finally{Date.now=now;}
  assert.equal(f.current('work_items',f.enrollment.id).value.expires_at,f.enrollment.value.expires_at);
});

test('a running phase must match the original observed birth and native identity',async t=>{
  const f=await fixture(t),process={pid:45678,started_at:'2026-11-11T01:02:03.004Z'},native='synthetic-current-native';
  f.service.host.bind({operation_id:'bind-current',enrollment_id:f.enrollment.value.enrollment_id,phase:'reconstruction',attempt_id:f.admission.phase.value.attempt_id,native_id:native,observed_process:process});
  const record={...f.record,birth:{pid:process.pid,at:process.started_at},native_thread:native};assert.equal(f.guard(record).native_id,native);
  for(const changed of [{...record,birth:null},{...record,birth:{...record.birth,pid:process.pid+1}},{...record,birth:{...record.birth,at:'2026-11-11T01:02:03.005Z'}},{...record,native_thread:'another-native'}])assert.throws(()=>f.guard(changed),held);
});

test('current private reviewer changes cannot hide behind its originally admitted reference',async t=>{
  const f=await fixture(t,{review:true});f.guard(f.record);
  f.mutate('principals','guard-reviewer',value=>({...value,generation:value.generation+1}));assert.throws(()=>f.guard(f.record),held);
});

test('pending recovery retains its complete original history and detects a changed prior phase',async t=>{
  const f=await fixture(t,{recovery:true});f.guard(f.record);
  f.mutate('work_items',f.prior.admission.phase.id,value=>({...value,cancellation_requested:false}));assert.throws(()=>f.guard(f.record),held);
});
