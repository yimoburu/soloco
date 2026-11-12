import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {canonical,peerDigest,PeerLedger,installPeerSchema} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {execute,inspect,digest,bindPeerPrincipal,createRuntimeObserver,publicationPolicyEvidence} from '../plugins/soloco/runtime/peers/model.mjs';
import {createMembershipLifecycle} from '../plugins/soloco/runtime/peers/membership.mjs';
import {peerFixture} from './peer-fixture.mjs';
import {legacyPeerModel301b} from './peer-model-legacy-fixture.mjs';

// These are real SQLite/P1/P2 mechanics tests. Every host/native/process
// observation below is an explicitly SYNTHETIC trusted-host unit fixture.
// They establish no human authentication, actual native identity, process
// closure, production enrollment or host confinement.
const actor=principal_id=>({principal_id});
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const finitePolicy={worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:65536,max_model_calls:100};
const declaredDenial=error=>error instanceof Error&&typeof error.code==='string'&&error.code!=='ERR_ASSERTION';

function rows(f,family,options={}){
  return f.ledger.read(tx=>{const items=[];let cursor;for(;;){const page=tx.list(family,{...options,limit:100,...(cursor?{cursor}:{})});items.push(...page.items);if(page.complete)return items;assert(page.next_cursor);cursor=page.next_cursor;}});
}
function get(f,family,id){return f.ledger.read(tx=>tx.get(family,id));}
function seed(f,family,id,value){return f.ledger.write('unit-fixture-only','founder',tx=>{const old=tx.get(family,id);return tx.put(family,id,value,old?.revision??0);});}
function state(f){
  const names=f.ledger.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return Object.fromEntries(names.map(({name})=>[name,f.ledger.db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(row=>JSON.parse(JSON.stringify(row))).sort((a,b)=>canonical(a).localeCompare(canonical(b)))]));
}
function unchanged(f,operation,predicate=declaredDenial){const before=state(f);assert.throws(operation,predicate);assert.deepEqual(state(f),before);}
function actualOwningWriteHook(f,eventType,select,operation){
  const original=f.ledger.write;let fired=0,error=null,result=null;
  f.ledger.write=function(type,principal,callback){return original.call(this,type,principal,tx=>{
    const invoke=(method,args)=>{const value=tx[method](...args);if(type===eventType&&!fired&&select(method,args)){
      // Delegate actual P1 reads, then use that SAME real owning transaction
      // to perform an actual guarded put. No fabricated provider row/result.
      const old=tx.get('principals','cos-b');tx.put('principals',old.id,{...old.value,native_id:'actual-owning-write-hook-native'},old.revision);fired++;
    }return value;};
    return callback(Object.freeze({...tx,count:(...args)=>invoke('count',args),list:(...args)=>invoke('list',args)}));
  });};
  try{result=operation();}catch(caught){error=caught;}finally{f.ledger.write=original;}
  return {fired,error,result};
}
function fixture(t,{control={},principals={},company_id=null}={}){
  let initial;
  if(company_id===null)initial=peerFixture({control:{...control,...(control.policy?{policy:{...finitePolicy,...control.policy}}:{})},principals});
  else {
    // peerFixture intentionally has one fixed company label. A second actual
    // database with distinct authoritative metadata is needed for this oracle.
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-membership-company-'));
    fs.mkdirSync(path.join(root,'.company'),{mode:0o700});const file=path.join(root,'.company/company.sqlite'),db=new DatabaseSync(file);
    db.exec('CREATE TABLE company_layout(id INTEGER PRIMARY KEY,version INTEGER); INSERT INTO company_layout VALUES(1,5); CREATE TABLE immutable_values(sha256 TEXT PRIMARY KEY,bytes TEXT NOT NULL);');
    installPeerSchema(db,{company_id});db.close();const ledger=new PeerLedger(root);
    ledger.write('unit-fixture.genesis','founder',tx=>{
      tx.put('control','company',{protocol:'peer-cos-v1',paused:false,policy_generation:1,pause_generation:1,founder_principal_id:'founder',governance_sha256:peerDigest('fictional-governance'),...control,policy:{...finitePolicy,...control.policy}},0);
      for(const [id,kind]of[['founder','founder'],['scheduler','scheduler'],['publisher','publisher'],['cos-a','cos'],['cos-b','cos'],['reviewer','reviewer']])tx.put('principals',id,{principal_id:id,kind,status:'active',generation:1,native_id:id+'-native',host:'codex',...(principals[id]??{})},0);
    });initial={root,file,ledger};
  }
  const f={root:initial.root,file:initial.file,ledger:initial.ledger,ledgers:[initial.ledger],n:0,pid:4000};
  t.after(()=>{for(const ledger of f.ledgers)if(ledger.db.isOpen!==false)ledger.close();fs.rmSync(f.root,{recursive:true,force:true});});
  f.refresh=()=>{f.service=createMembershipLifecycle(f.ledger);return f.service;};f.refresh();
  f.op=prefix=>prefix+'-'+(++f.n);
  f.run=(who,action,args={})=>execute(f.ledger,actor(who),action,{operation_id:f.op('business'),...args});
  f.enroll=(args={})=>f.service.operator.enroll({operation_id:f.op('enroll'),enrollment_id:'membership-'+f.n,principal_id:'incoming-'+f.n,role:'cos',host:'codex',scope:'alpha',input_refs:[],expected_generation:0,max_model_calls:2,expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Fictional bounded human-operator fixture instruction; not authentication.',...args});
  f.admit=(enrollment,phase='reconstruction',args={})=>f.service.operator.admit({operation_id:f.op('admit'),enrollment_id:enrollment.value.enrollment_id,phase,...(phase==='review'?{reviewer_principal_id:'reviewer'}:{}),...args});
  f.activate=enrollment=>f.service.operator.activate({operation_id:f.op('activate'),enrollment_id:enrollment.value.enrollment_id,source_instruction:'Fictional unit activation under the protected operator handle.'});
  f.reopen=()=>{f.ledger.close();f.ledger=new PeerLedger(f.root);f.ledgers.push(f.ledger);f.refresh();};
  return f;
}
function observe(f,enrollment,admission,phase='reconstruction',native_id='unit-'+enrollment.id+'-'+phase){
  const attempt_id=admission.phase.value.attempt_id,process={pid:++f.pid,started_at:new Date().toISOString()};
  const binding={enrollment_id:enrollment.value.enrollment_id,phase,attempt_id};
  f.service.host.bind({operation_id:f.op('bind'),...binding,native_id,observed_process:process});
  return {binding,process,native_id,channel:f.service.host.channel(binding)};
}
function consume(channel){
  const header=channel.header();let offset=0,text='';
  while(offset<header.total_characters){const result=channel.read({sha256:header.sha256,offset,length:Math.min(8192,header.total_characters-offset)});assert.equal(result.offset,offset);assert.equal(result.sha256,header.sha256);assert.equal(typeof result.text,'string');text+=result.text;assert(Number.isSafeInteger(result.next_offset)&&result.next_offset>offset&&result.next_offset<=header.total_characters);offset=result.next_offset;assert.equal(result.complete,offset===header.total_characters);}
  assert.equal(text.length,header.total_characters);assert.equal(digest(text),header.sha256);assert.doesNotThrow(()=>JSON.parse(text));return {header,text};
}
function finish(f,observed,output,args={}){
  return f.service.host.finish({operation_id:f.op('finish'),...observed.binding,output,termination_confirmed:true,observed_process:{...observed.process,close_observed:true},...args});
}
function reconstruction(f,enrollment,{native_id,output='Unit reconstruction preserves the exact current scope, original limits, unresolved obligations and next permitted action.'}={}){
  const admission=f.admit(enrollment),observed=observe(f,enrollment,admission,'reconstruction',native_id);const consumed=consume(observed.channel);
  observed.channel.submit({operation_id:f.op('submit'),sha256:consumed.header.sha256,content:output});const result=finish(f,observed,output);assert.equal(result.accepted,true);return {admission,observed,output,result,...consumed};
}
function qualification(f,enrollment,{native_id,reviewer_principal_id='reviewer',verdict='Pass',reason='Independent SYNTHETIC trusted-host unit review; not native or human authentication.',blockers=verdict==='Pass'?[]:['Retained unit finding.']}={}){
  const admission=f.admit(enrollment,'review',{reviewer_principal_id}),observed=observe(f,enrollment,admission,'review',native_id),consumed=consume(observed.channel);
  const output=canonical({review:{subject:consumed.header.subject,verdict,reason,blockers}});
  observed.channel.submit({operation_id:f.op('submit-review'),sha256:consumed.header.sha256,content:output});
  return {admission,observed,output,result:finish(f,observed,output),...consumed};
}
function ready(f,enrollment=f.enroll()){const reconstructed=reconstruction(f,enrollment),reviewed=qualification(f,enrollment);assert.equal(reviewed.result.accepted,true);return {enrollment,reconstructed,reviewed};}
function grant(f,principal_id='cos-a'){
  return f.run('founder','grant/create',{grant_id:'grant-'+principal_id,to_principal_id:principal_id,scope:'*',actions:['task/*','home/*','message/*'],resources:[],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Bounded actual P2 unit-fixture grant.'});
}
function revokedPending(f,args={}){
  const enrollment=f.enroll({max_model_calls:4,...args}),admission=f.admit(enrollment),observed=observe(f,enrollment,admission);
  f.service.operator.revoke({operation_id:f.op('revoke-for-rescope'),enrollment_id:enrollment.value.enrollment_id,source_instruction:'Explicitly revoke this pending unit scope while its original execution remains uncertain.'});
  return {enrollment,admission,observed,revoked:get(f,'work_items',enrollment.id),principal:get(f,'principals',enrollment.value.principal_id)};
}
function recoveryRequest(f,prior,args={}){
  const v=prior.enrollment.value;
  return {operation_id:f.op('recover'),enrollment_id:'recovered-'+v.enrollment_id,principal_id:v.principal_id,role:v.role,host:v.host,scope:v.scope,input_refs:v.input_refs,expires_at:v.expires_at,expected_generation:prior.principal.value.generation,source_instruction:'Attributable pending recovery reason only; inherit the original authority, expiry and unused allowance.',...args};
}

test('forged whole-wire restrictions hold membership admission before any buffered put or model charge',t=>{
  const f=fixture(t),enrollment=f.enroll(),before=state(f);let invoked=0,puts=0;
  const write=f.ledger.write;
  f.ledger.write=function(type,principal,callback){return write.call(this,type,principal,tx=>callback(type==='membership/admit'?Object.freeze({...tx,put(...args){puts++;return tx.put(...args);}}):tx));};
  try{
    for(const forged of [{},false,0,()=>{invoked++;},Object.freeze({protocol:'original-first-turn-wire-restriction-v1'})])
      assert.throws(()=>f.service.operator.admit({operation_id:f.op('restricted-admit'),enrollment_id:enrollment.value.enrollment_id,phase:'reconstruction'},forged),error=>error.code==='CONTEXT_DELIVERY_ORIGINAL_REQUIRED');
  }finally{f.ledger.write=write;}
  assert.equal(invoked,0);assert.equal(puts,0);assert.deepEqual(state(f),before);assert.equal(get(f,'control','usage'),null);
});

test('membership delivery preparation is read-only and requires an original interpreter and exact current phase',t=>{
  const f=fixture(t),enrollment=f.enroll(),admission=f.admit(enrollment),before=state(f);
  const args={enrollment_id:enrollment.value.enrollment_id,phase:'reconstruction',attempt_id:admission.phase.value.attempt_id};
  assert.throws(()=>f.service.host.prepareDelivery(args,{}),error=>error.code==='CONTEXT_INTERPRETER_UNAVAILABLE');
  assert.deepEqual(state(f),before);
  assert.throws(()=>f.service.host.prepareDelivery({...args,attempt_id:'different-attempt'},{}),error=>error.code==='ATTEMPT_CHANGED');
  assert.deepEqual(state(f),before);assert.equal(get(f,'control','usage').value.model_calls,1);
  f.service.operator.revoke({operation_id:f.op('revoke-prepared-source'),enrollment_id:enrollment.value.enrollment_id,source_instruction:'Synthetic explicit revoke; retain the reserved unknown attempt.'});
  const revoked=state(f);
  assert.throws(()=>f.service.host.prepareDelivery(args,{}),error=>error.code==='ENROLLMENT_CLOSED');
  assert.deepEqual(state(f),revoked);
});

test('a forged review restriction cannot create its prospective private reviewer or consume a second model call',t=>{
  const f=fixture(t),enrollment=f.enroll();reconstruction(f,enrollment);
  const before=state(f),reviewer='prospective-restriction-reviewer';assert.equal(get(f,'principals',reviewer),null);
  assert.throws(()=>f.service.operator.admit({operation_id:f.op('restricted-review'),enrollment_id:enrollment.value.enrollment_id,phase:'review',reviewer_principal_id:reviewer},{}),error=>error.code==='CONTEXT_DELIVERY_ORIGINAL_REQUIRED');
  assert.deepEqual(state(f),before);assert.equal(get(f,'principals',reviewer),null);assert.equal(get(f,'control','usage').value.model_calls,1);
});

test('completed membership phases cannot prepare another original delivery',t=>{
  const f=fixture(t),enrollment=f.enroll(),completed=reconstruction(f,enrollment),before=state(f);
  assert.throws(()=>f.service.host.prepareDelivery(completed.observed.binding,{}),error=>error.code==='PHASE_CLOSED');
  assert.deepEqual(state(f),before);
});

test('synthetic host fixture: pending reconstruction and private qualification activate a fresh member through real SQLite',t=>{
  const f=fixture(t),enrollment=f.enroll({principal_id:'new-cos'});
  assert.equal(get(f,'principals','new-cos').value.status,'pending');
  unchanged(f,()=>inspect(f.ledger,actor('new-cos'),'runtime/status'));
  unchanged(f,()=>f.run('new-cos','notice/create',{scope:'alpha',content:'Pending may not exercise business notice rights.'}));
  const reconstructed=reconstruction(f,enrollment),reviewed=qualification(f,enrollment,{reviewer_principal_id:'provisional-reviewer'});
  assert.equal(reviewed.result.accepted,true);assert.equal(get(f,'principals','provisional-reviewer').value.status,'pending');
  unchanged(f,()=>inspect(f.ledger,actor('provisional-reviewer'),'runtime/status'));
  const result=f.activate(enrollment);assert.equal(result.principal.id,'new-cos');assert.equal(result.principal.value.status,'active');assert.equal(result.principal.value.generation,1);assert.equal(result.principal.value.native_id,reconstructed.observed.native_id);
  assert.equal(rows(f,'slots',{status:['active','unknown']}).length,0);assert.equal(get(f,'control','usage').value.model_calls,2);
  assert.equal(get(f,'control','usage:new-cos').value.model_calls,1);assert.equal(get(f,'control','usage:provisional-reviewer').value.model_calls,1);
  const client=bindPeerPrincipal(f.ledger,{principal_id:'new-cos',generation:1,native_id:reconstructed.observed.native_id});
  assert.equal(client.execute('notice/create',{operation_id:'new-active-notice',scope:'alpha',content:'Actual P2 notice after unit-only mechanical activation.'}).value.status,'pending');
  assert.equal(client.inspect('runtime/status').active_slots,0);
});

test('closed enrollment rejects privileged roles, identity overrides and invalid authority without writes',t=>{
  const f=fixture(t);
  for(const role of ['founder','scheduler','publisher'])unchanged(f,()=>f.enroll({role}));
  for(const field of ['root','company_id','native_id','observer_capability','actor'])unchanged(f,()=>f.enroll({[field]:'forged'}));
  unchanged(f,()=>f.enroll({principal_id:'founder',expected_generation:1}));
  unchanged(f,()=>f.enroll({principal_id:'cos-a',expected_generation:0}));
  unchanged(f,()=>f.enroll({max_model_calls:0}));
  unchanged(f,()=>f.enroll({expires_at:'2000-01-01T00:00:00.000Z'}));
  const enrollment=f.enroll();assert.equal(get(f,'work_items',enrollment.id).value.status,'pending');
});

test('pending handles expose only exact reads/submission and cannot obtain operator or observer rights',t=>{
  const f=fixture(t),enrollment=f.enroll(),admission=f.admit(enrollment),observed=observe(f,enrollment,admission),channel=observed.channel;
  assert.deepEqual(Object.keys(channel).sort(),['header','read','submit']);assert.equal(Object.isFrozen(channel),true);
  consume(channel); // Submission negatives must not pass only because reads were incomplete.
  for(const field of ['root','company_id','principal_id','generation','native_id','attempt_id','operator','observer_capability']){
    const header=channel.header();unchanged(f,()=>channel.read({sha256:header.sha256,offset:0,length:1,[field]:'forged'}));
    unchanged(f,()=>channel.submit({operation_id:'forged-'+field,sha256:header.sha256,content:'Unqualified content.',[field]:'forged'}));
  }
  assert.doesNotThrow(()=>channel.submit({operation_id:f.op('valid-submit'),sha256:channel.header().sha256,content:'Only a proposed reconstruction; this grants no membership.'}));
  unchanged(f,()=>f.activate(enrollment));
  unchanged(f,()=>bindPeerPrincipal(f.ledger,{principal_id:enrollment.value.principal_id,generation:1,native_id:observed.native_id}));
});

test('exact source ranges preserve Unicode and repeated partial reads cannot manufacture complete delivery',t=>{
  const f=fixture(t);f.run('cos-a','notice/create',{scope:'*',content:'Unicode source: '+('雪😀\\n"').repeat(1400)});
  const enrollment=f.enroll(),observed=observe(f,enrollment,f.admit(enrollment)),header=observed.channel.header();assert(header.total_characters>8192);
  const first=observed.channel.read({sha256:header.sha256,offset:0,length:32});assert.equal(first.complete,false);
  observed.channel.read({sha256:header.sha256,offset:0,length:32});
  unchanged(f,()=>observed.channel.submit({operation_id:'premature',sha256:header.sha256,content:'Only a prefix was read.'}));
  unchanged(f,()=>observed.channel.read({sha256:'0'.repeat(64),offset:0,length:32}));
  unchanged(f,()=>observed.channel.read({sha256:header.sha256,offset:-1,length:32}));
  unchanged(f,()=>observed.channel.read({sha256:header.sha256,offset:0,length:8193}));
  const all=consume(observed.channel);assert(all.text.includes('Unicode source: '));assert(all.text.includes('雪😀'));
  observed.channel.submit({operation_id:'complete',sha256:header.sha256,content:'Whole source was delivered, including Unicode and retained obligations.'});
});

test('an actual new global obligation invalidates the pending source cut before another read or activation',t=>{
  const f=fixture(t),enrollment=f.enroll(),observed=observe(f,enrollment,f.admit(enrollment)),header=observed.channel.header();
  observed.channel.read({sha256:header.sha256,offset:0,length:16});
  f.run('cos-b','notice/create',{scope:'*',content:'A new binding global must-know condition.'});
  unchanged(f,()=>observed.channel.read({sha256:header.sha256,offset:16,length:16}));
  unchanged(f,()=>f.activate(enrollment));
});

test('read-provider failures propagate by identity rather than being interpreted as absent or fresh',t=>{
  const f=fixture(t),enrollment=f.enroll(),observed=observe(f,enrollment,f.admit(enrollment)),error=Object.assign(Error('actual read-provider failure'),{code:'UNIT_READ_FAILURE'});
  const original=f.ledger.onQuery;f.ledger.onQuery=({sql})=>{if(sql.includes('FROM peer_rows'))throw error;};
  try{assert.throws(()=>observed.channel.header(),value=>value===error);}finally{f.ledger.onQuery=original;}
  assert(observed.channel.header().total_characters>0);
});

test('exact operator and pending submission replay retain one result and reject changed payloads',t=>{
  const f=fixture(t),request={operation_id:'exact-enroll',enrollment_id:'replayed-enrollment',principal_id:'replayed-member',role:'cos',host:'codex',scope:'alpha',input_refs:[],expected_generation:0,max_model_calls:2,expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Synthetic bounded operator fixture.'};
  const enrollment=f.service.operator.enroll(request),after=state(f);assert.deepEqual(f.service.operator.enroll(request),enrollment);assert.deepEqual(state(f),after);
  unchanged(f,()=>f.service.operator.enroll({...request,scope:'beta'}));
  const admission=f.admit(enrollment),observed=observe(f,enrollment,admission),{header}=consume(observed.channel),submission={operation_id:'exact-submit',sha256:header.sha256,content:'Exact attributable reconstruction.'};
  const submitted=observed.channel.submit(submission),written=state(f);assert.deepEqual(observed.channel.submit(submission),submitted);assert.deepEqual(state(f),written);
  unchanged(f,()=>observed.channel.submit({...submission,content:'Altered replay.'}));assert.equal(get(f,'control','usage').value.model_calls,1);
});

test('admission consumes shared global/principal limits exactly once and cannot refund through reconstruction',t=>{
  const f=fixture(t),enrollment=f.enroll(),request={operation_id:'once-admit',enrollment_id:enrollment.value.enrollment_id,phase:'reconstruction'};
  const admitted=f.service.operator.admit(request),after=state(f);assert.deepEqual(f.service.operator.admit(request),admitted);assert.deepEqual(state(f),after);
  assert.equal(get(f,'control','usage').value.model_calls,1);assert.equal(get(f,'control','usage:'+enrollment.value.principal_id).value.model_calls,1);
  unchanged(f,()=>f.admit(enrollment));
  const observed=observe(f,enrollment,admitted),{header}=consume(observed.channel),output='Single actual admitted synthetic invocation.';observed.channel.submit({operation_id:f.op('submit'),sha256:header.sha256,content:output});finish(f,observed,output);
  assert.equal(get(f,'control','usage').value.model_calls,1);assert.equal(rows(f,'slots',{status:['active','unknown']}).length,0);
});

test('active and unknown shared slots deny another private admission without spending or writes',t=>{
  const f=fixture(t),enrollment=f.enroll();
  for(let i=0;i<3;i++)seed(f,'slots','existing-slot-'+i,{status:i===2?'unknown':'active',principal_id:'cos-b',task_id:'existing-'+i,attempt_id:'old-attempt-'+i});
  unchanged(f,()=>f.admit(enrollment));assert.equal(get(f,'control','usage'),null);assert.equal(rows(f,'slots',{status:['active','unknown']}).length,3);
});

test('global and principal budget exhaustion and the enrollment allowance are actual admission fences',t=>{
  for(const mode of ['global','principal']){
    const f=fixture(t),enrollment=f.enroll();
    if(mode==='global')seed(f,'control','usage',{model_calls:100});else seed(f,'control','usage:'+enrollment.value.principal_id,{model_calls:100});
    unchanged(f,()=>f.admit(enrollment));assert.equal(rows(f,'slots').length,0);
  }
  const f=fixture(t),enrollment=f.enroll({max_model_calls:1});reconstruction(f,enrollment);unchanged(f,()=>f.admit(enrollment,'review'));assert.equal(get(f,'control','usage').value.model_calls,1);
});

test('human pause through actual P2 on another connection fences private admission',t=>{
  const f=fixture(t),enrollment=f.enroll(),other=new PeerLedger(f.root);f.ledgers.push(other);
  execute(other,actor('founder'),'company/pause',{operation_id:'other-pause',source_instruction:'Actual P2 fictional human-operator pause before admission.'});
  unchanged(f,()=>f.admit(enrollment));assert.equal(get(f,'control','usage'),null);
});

test('no reconstruction or review is accepted without complete reads and exact submitted observed output',t=>{
  const f=fixture(t),enrollment=f.enroll(),observed=observe(f,enrollment,f.admit(enrollment));
  unchanged(f,()=>finish(f,observed,'Output was never submitted.'));
  const {header}=consume(observed.channel);observed.channel.submit({operation_id:f.op('submit'),sha256:header.sha256,content:'Actual submitted raw reconstruction.'});
  unchanged(f,()=>finish(f,observed,'Altered observed output.'));
  const completed=finish(f,observed,'Actual submitted raw reconstruction.');assert.equal(completed.accepted,true);
  unchanged(f,()=>finish(f,observed,'Actual submitted raw reconstruction.'));
});

test('private qualification requires raw canonical exact-subject review and preserves negative verdicts',t=>{
  for(const verdict of ['Fail','Blocked']){
    const f=fixture(t),enrollment=f.enroll();reconstruction(f,enrollment);const q=qualification(f,enrollment,{verdict});
    assert.equal(q.result.result.value.review.verdict,verdict);unchanged(f,()=>f.activate(enrollment));
    unchanged(f,()=>f.admit(enrollment,'review'));assert.equal(get(f,'control','usage').value.model_calls,2);
  }
});

test('ordinary business reviews cannot accept a private lifecycle subject',t=>{
  const f=fixture(t),enrollment=f.enroll(),r=reconstruction(f,enrollment);grant(f,'cos-b');
  unchanged(f,()=>f.run('cos-b','task/submit',{grant_id:'grant-cos-b',scope:'alpha',role:'qa',stage:'review',instructions:'Must not coerce private bootstrap into semantic business evidence.',acceptance:'Rejected private family.',review_of:ref('work_items',r.result.result)}));
});

test('same reconstruction native or principal cannot supply independent private qualification',t=>{
  for(const mode of ['native','principal']){
    const f=fixture(t),enrollment=f.enroll(),r=reconstruction(f,enrollment);let denial=null,result=null;
    try{result=qualification(f,enrollment,mode==='native'?{native_id:r.observed.native_id}:{reviewer_principal_id:enrollment.value.principal_id});}catch(error){assert(declaredDenial(error));denial=error;}
    if(!denial)assert.equal(result.result.accepted,false);
    unchanged(f,()=>f.activate(enrollment));assert.equal(get(f,'principals',enrollment.value.principal_id).value.status,'pending');
  }
});

test('wrong private review subject and raw claimed Pass cannot replace a protected qualified result',t=>{
  const f=fixture(t),enrollment=f.enroll();reconstruction(f,enrollment);const observed=observe(f,enrollment,f.admit(enrollment,'review'),'review'),{header}=consume(observed.channel);
  const forged=canonical({review:{subject:{...header.subject,sha256:'0'.repeat(64)},verdict:'Pass',reason:'Forged wrong subject.',blockers:[]}});
  const wrongSubject=error=>error instanceof Error&&error.message==='Observed review subject/verdict/blockers invalid';
  const before=state(f);let earlyDenial=null;
  try{observed.channel.submit({operation_id:f.op('submit'),sha256:header.sha256,content:forged});}catch(error){assert(wrongSubject(error));earlyDenial=error;}
  if(earlyDenial)assert.deepEqual(state(f),before);else unchanged(f,()=>finish(f,observed,forged),wrongSubject);
  unchanged(f,()=>f.activate(enrollment));
});

test('expiration is rechecked at the final activation boundary without changing the original window',t=>{
  const f=fixture(t),enrollment=f.enroll(),prepared=ready(f,enrollment),before=state(f),original=Date.now;
  // Controlled unit clock only. This advances past the original expiry; it
  // never extends a real attempt, changes stored bounds or claims a host clock.
  try{Date.now=()=>original()+7200000;assert.throws(()=>f.activate(prepared.enrollment),declaredDenial);}finally{Date.now=original;}
  assert.deepEqual(state(f),before);assert.equal(f.activate(prepared.enrollment).principal.value.status,'active');
});

test('actual P2 pause, policy and source changes after qualification prevent stale activation atomically',t=>{
  for(const change of ['pause','policy','notice']){
    const f=fixture(t),{enrollment}=ready(f);
    if(change==='pause')f.run('founder','company/pause',{source_instruction:'Pause before private activation.'});
    else if(change==='policy'){const control=get(f,'control','company');seed(f,'control','company',{...control.value,policy_generation:control.value.policy_generation+1});}
    else f.run('cos-b','notice/create',{scope:'*',content:'Intervening global obligation after private review.'});
    unchanged(f,()=>f.activate(enrollment));assert.equal(get(f,'principals',enrollment.value.principal_id).value.status,'pending');
  }
});

test('same-ID replacement retains budgets, tasks and original native lineage and fences old clients in real P2',t=>{
  const f=fixture(t);grant(f);const old=bindPeerPrincipal(f.ledger,{principal_id:'cos-a',generation:1,native_id:'cos-a-native'});
  const task=old.execute('task/submit',{operation_id:'old-business-task',grant_id:'grant-cos-a',scope:'alpha',role:'engineer',instructions:'Existing accountable task survives membership replacement.',acceptance:'Retain exact definition and history.'});
  seed(f,'control','usage:cos-a',{model_calls:7});const enrollment=f.enroll({principal_id:'cos-a',expected_generation:1}),r=reconstruction(f,enrollment);assert.equal(old.inspect('runtime/status').paused,false);
  assert.equal(get(f,'principals','cos-a').value.generation,1);qualification(f,enrollment);const activated=f.activate(enrollment);
  assert.equal(activated.principal.value.generation,2);assert.equal(get(f,'control','usage:cos-a').value.model_calls,8);assert.deepEqual(get(f,'tasks',task.id),task);
  unchanged(f,()=>old.execute('notice/create',{operation_id:'stale-generation-write',scope:'alpha',content:'Old generation cannot mutate.'}));unchanged(f,()=>old.inspect('runtime/status'));
  const current=bindPeerPrincipal(f.ledger,{principal_id:'cos-a',generation:2,native_id:r.observed.native_id});assert.equal(current.execute('notice/create',{operation_id:'new-generation-write',scope:'alpha',content:'Current generation has normal actual P2 notice rights.'}).value.status,'pending');
  const history=f.ledger.db.prepare("SELECT revision,bytes FROM peer_versions WHERE family='principals' AND id='cos-a' ORDER BY revision").all().map(row=>({...row,value:JSON.parse(row.bytes)}));
  const revoked=history.findIndex(row=>row.value.status==='revoked');assert(revoked>=0&&revoked<history.length-1);assert.equal(history.at(-1).value.status,'active');assert.equal(history.at(-1).value.native_id,r.observed.native_id);
});

test('bound business clients reject principal/native/generation/root overrides and privileged identities',t=>{
  const f=fixture(t),client=bindPeerPrincipal(f.ledger,{principal_id:'cos-a',generation:1,native_id:'cos-a-native'});
  assert.equal(client.execute('notice/create',{operation_id:'bound-positive',scope:'alpha',content:'Positive actual P2 operation before override negatives.'}).value.status,'pending');
  for(const key of ['root','company_id','principal_id','generation','native_id','actor','session_id']){
    unchanged(f,()=>client.execute('notice/create',{operation_id:'bound-forged-'+key,scope:'alpha',content:'Forbidden top-level identity override.',[key]:'forged'}));
    unchanged(f,()=>client.inspect('runtime/status',{[key]:'forged'}));
  }
  unchanged(f,()=>bindPeerPrincipal(f.ledger,{principal_id:'founder',generation:1,native_id:'founder-native'}));
});

test('an old host factory cannot mint business clients after its protected observer generation is replaced',t=>{
  const f=fixture(t),{enrollment}=ready(f);f.activate(enrollment);const oldHost=f.service.host,args={enrollment_id:enrollment.value.enrollment_id};
  assert.equal(oldHost.activeClient(args).inspect('runtime/status').active_slots,0);
  const observer=get(f,'principals','scheduler');seed(f,'principals','scheduler',{...observer.value,generation:observer.value.generation+1});
  unchanged(f,()=>oldHost.activeClient(args));
  const fresh=createMembershipLifecycle(f.ledger);assert.equal(fresh.host.activeClient(args).inspect('runtime/status').active_slots,0);
});

test('managed same-ID replacement fences raw legacy actor labels for new commands, old replay and inspection',t=>{
  const f=fixture(t),request={operation_id:'unmanaged-original',scope:'alpha',content:'A valid unmanaged notice before membership adoption.'};
  grant(f);
  assert.equal(execute(f.ledger,actor('cos-a'),'notice/create',request).value.status,'pending');
  const enrollment=f.enroll({principal_id:'cos-a',expected_generation:1}),{reconstructed}=ready(f,enrollment);f.activate(enrollment);
  unchanged(f,()=>execute(f.ledger,actor('cos-a'),'notice/create',{...request,operation_id:'new-forged-managed-operation'}));
  unchanged(f,()=>execute(f.ledger,actor('cos-a'),'notice/create',request));
  unchanged(f,()=>inspect(f.ledger,actor('cos-a'),'runtime/status'));
  const current=bindPeerPrincipal(f.ledger,{principal_id:'cos-a',generation:2,native_id:reconstructed.observed.native_id});
  assert.equal(current.execute('notice/create',{operation_id:'bound-managed-positive',scope:'alpha',content:'The actual current bound client retains permitted rights.'}).value.status,'pending');
  assert.equal(current.inspect('runtime/status').active_slots,0);
  // A generation fence must not disable real internal P2 task admission and
  // protected completion for the newly authenticated bound member.
  const task=current.execute('task/submit',{operation_id:'bound-managed-task',grant_id:'grant-cos-a',scope:'alpha',role:'engineer',instructions:'Normal actual P2 work after the mechanical membership replacement.',acceptance:'Preserve the protected task/context/result path.'});
  current.execute('task/claim',{operation_id:'bound-managed-claim',task_id:task.id});
  const admitted=f.run('scheduler','task/admit',{task_id:task.id});assert.equal(admitted.admitted,true);
  const finished=createRuntimeObserver(f.ledger).record('task/finish',{operation_id:'bound-managed-finish',task_id:task.id,attempt_id:admitted.task.value.attempt.id,native_id:'synthetic-managed-business-task',output:'Synthetic task output under actual P2 production mechanics.',termination_confirmed:true,observed_process:{pid:9501,started_at:admitted.task.value.attempt.admitted_at,close_observed:true}});
  assert.equal(finished.accepted,true);assert.equal(get(f,'tasks',task.id).value.status,'returned');
});

for(const change of ['generation','revocation'])test('pending private reviewer '+change+' fences its already-created read and submission channel',t=>{
  const f=fixture(t),enrollment=f.enroll();reconstruction(f,enrollment);
  const admitted=f.admit(enrollment,'review',{reviewer_principal_id:'provisional-private-reviewer'}),observed=observe(f,enrollment,admitted,'review'),{header}=consume(observed.channel);
  const reviewer=get(f,'principals','provisional-private-reviewer');assert.equal(reviewer.value.status,'pending');
  const output=canonical({review:{subject:header.subject,verdict:'Pass',reason:'This otherwise valid unit review is submitted by a stale private incarnation.',blockers:[]}});
  seed(f,'principals',reviewer.id,{...reviewer.value,...(change==='generation'?{generation:reviewer.value.generation+1}:{status:'revoked'})});
  unchanged(f,()=>observed.channel.header());
  unchanged(f,()=>observed.channel.read({sha256:header.sha256,offset:0,length:16}));
  unchanged(f,()=>observed.channel.submit({operation_id:'stale-private-submission',sha256:header.sha256,content:output}));
  unchanged(f,()=>f.activate(enrollment));
});

test('a private reviewer revoked after submission cannot return a current qualification while closure is retained',t=>{
  const f=fixture(t),enrollment=f.enroll();reconstruction(f,enrollment);
  const admitted=f.admit(enrollment,'review',{reviewer_principal_id:'late-private-reviewer'}),observed=observe(f,enrollment,admitted,'review'),{header}=consume(observed.channel);
  const output=canonical({review:{subject:header.subject,verdict:'Pass',reason:'Otherwise exact unit review, submitted before revocation.',blockers:[]}});
  observed.channel.submit({operation_id:f.op('submitted-before-revoke'),sha256:header.sha256,content:output});
  const reviewer=get(f,'principals','late-private-reviewer');seed(f,'principals',reviewer.id,{...reviewer.value,status:'revoked'});
  const returned=finish(f,observed,output);assert.equal(returned.accepted,false);assert.equal(returned.result.value.status,'quarantined');
  assert.equal(returned.result.value.output,output);assert.equal(returned.result.value.termination_confirmed,true);
  assert.equal(rows(f,'slots',{status:['active','unknown']}).length,0);assert.equal(get(f,'control','usage').value.model_calls,2);
  unchanged(f,()=>f.activate(enrollment));
});

test('forced real SQLite late event failure rolls back the entire outgoing/incoming transition',t=>{
  const f=fixture(t),enrollment=f.enroll({principal_id:'cos-a',expected_generation:1});ready(f,enrollment);const before=state(f);
  f.ledger.db.exec("CREATE TEMP TRIGGER reject_membership_commit BEFORE INSERT ON peer_events BEGIN SELECT RAISE(ABORT,'injected membership commit failure'); END");
  try{assert.throws(()=>f.activate(enrollment),/injected membership commit failure/);assert.deepEqual(state(f),before);}finally{f.ledger.db.exec('DROP TRIGGER reject_membership_commit');}
  assert.equal(f.activate(enrollment).principal.value.generation,2);
});

test('second SQLite connection source change is observed before activation and cannot leave half replacement',t=>{
  const f=fixture(t),enrollment=f.enroll({principal_id:'cos-a',expected_generation:1});ready(f,enrollment);const other=new PeerLedger(f.root);f.ledgers.push(other);
  execute(other,actor('cos-b'),'notice/create',{operation_id:'other-global-change',scope:'*',content:'Real second-connection mutation invalidates the reviewed reconstruction.'});
  const before=state(f);assert.throws(()=>f.activate(enrollment),declaredDenial);assert.deepEqual(state(f),before);assert.equal(get(f,'principals','cos-a').value.generation,1);assert.equal(get(f,'principals','cos-a').value.status,'active');
});

test('real competing SQLite writer lock cannot partially activate and succeeds only after the lock closes',t=>{
  const f=fixture(t),enrollment=f.enroll({principal_id:'cos-a',expected_generation:1});ready(f,enrollment);const other=new PeerLedger(f.root);f.ledgers.push(other);const before=state(f);
  other.db.exec('BEGIN IMMEDIATE');
  try{assert.throws(()=>f.activate(enrollment),error=>error instanceof Error&&/locked|busy/i.test(error.message));assert.deepEqual(state(f),before);}finally{other.db.exec('ROLLBACK');}
  assert.equal(f.activate(enrollment).principal.value.generation,2);
});

test('unknown private execution retains slots and spent calls, and later closure never manufactures an accepted result',t=>{
  const f=fixture(t),enrollment=f.enroll(),observed=observe(f,enrollment,f.admit(enrollment)),{header}=consume(observed.channel),output='Retained output from a unit execution with unknown closure.';
  observed.channel.submit({operation_id:f.op('submit'),sha256:header.sha256,content:output});const result=finish(f,observed,output,{termination_confirmed:false,observed_process:{...observed.process,close_observed:false}});
  assert.equal(result.accepted,false);assert.equal(rows(f,'slots',{status:['active','unknown']}).length,1);assert.equal(get(f,'control','usage').value.model_calls,1);unchanged(f,()=>f.admit(enrollment));unchanged(f,()=>f.activate(enrollment));
  f.service.host.close({operation_id:f.op('close'),...observed.binding,termination_confirmed:true,observed_process:{...observed.process,close_observed:true}});
  assert.equal(rows(f,'slots',{status:['active','unknown']}).length,0);assert.equal(get(f,'control','usage').value.model_calls,1);unchanged(f,()=>f.activate(enrollment));
});

test('revoke fences pending tools without releasing uncertain physical reservations or refunding usage',t=>{
  const f=fixture(t),enrollment=f.enroll(),observed=observe(f,enrollment,f.admit(enrollment)),header=observed.channel.header();
  const revoked=f.service.operator.revoke({operation_id:f.op('revoke'),enrollment_id:enrollment.value.enrollment_id,source_instruction:'Revoke eligibility; actual unit process closure remains unobserved.'});assert.equal(revoked.value.status,'revoked');
  unchanged(f,()=>observed.channel.read({sha256:header.sha256,offset:0,length:16}));unchanged(f,()=>f.activate(enrollment));
  assert.equal(rows(f,'slots',{status:['active','unknown']}).length,1);assert.equal(get(f,'control','usage').value.model_calls,1);
});

test('old business unknown claims, effects and attempts survive same-ID replacement unchanged',t=>{
  const f=fixture(t);
  f.run('founder','grant/create',{grant_id:'old-business-grant',to_principal_id:'cos-a',scope:'alpha',actions:['task/*'],resources:['home:old-home'],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Actual P2 bounded fictional old work.'});
  const task=f.run('cos-a','task/submit',{grant_id:'old-business-grant',scope:'alpha',role:'engineer',instructions:'Real P2 attempted work with an uncertain unit observation.',acceptance:'Retain original uncertainty and resource reservation.',resources:['home:old-home']});
  f.run('cos-a','task/claim',{task_id:task.id});const admitted=f.run('scheduler','task/admit',{task_id:task.id});assert.equal(admitted.admitted,true);
  createRuntimeObserver(f.ledger).record('task/finish',{operation_id:'unknown-old-business',task_id:task.id,attempt_id:admitted.task.value.attempt.id,native_id:'synthetic-old-business-native',output:'Retained uncertain unit output.',error:{code:'UNIT_UNKNOWN',message:'Synthetic trusted host cannot prove closure.'},termination_confirmed:false,observed_process:{pid:9001,started_at:admitted.task.value.attempt.admitted_at,close_observed:false}});
  const protectedRows=[{family:'tasks',row:get(f,'tasks',task.id)},{family:'effects',row:get(f,'effects',admitted.task.value.attempt.effect_id)},{family:'slots',row:get(f,'slots',task.id)},...rows(f,'claims',{task_id:task.id}).map(row=>({family:'claims',row}))];
  assert.equal(protectedRows.find(x=>x.family==='tasks').row.value.status,'unknown');assert.equal(protectedRows.filter(x=>x.family==='claims').length,1);
  const enrollment=f.enroll({principal_id:'cos-a',expected_generation:1});
  ready(f,enrollment);f.activate(enrollment);for(const {family,row}of protectedRows)assert.deepEqual(get(f,family,row.id),row);
  assert.equal(rows(f,'slots',{status:['active','unknown']}).length,1);
});

test('cold reopen preserves exact pending binding, delivered ranges, raw submissions and replay state',t=>{
  const f=fixture(t),enrollment=f.enroll(),admission=f.admit(enrollment),observed=observe(f,enrollment,admission),{header}=consume(observed.channel),content='Durable unit reconstruction survives process-owner object loss.';
  const submitted=observed.channel.submit({operation_id:'cold-submission',sha256:header.sha256,content}),before=state(f);f.reopen();assert.deepEqual(state(f),before);
  const channel=f.service.host.channel(observed.binding);assert.deepEqual(channel.submit({operation_id:'cold-submission',sha256:header.sha256,content}),submitted);assert.deepEqual(state(f),before);
  assert.equal(finish(f,{...observed,channel},content).accepted,true);qualification(f,enrollment);assert.equal(f.activate(enrollment).principal.value.status,'active');
});

test('native alias beyond the first hundred principals is not treated as absent',t=>{
  const f=fixture(t,{control:{policy:{max_context_bytes:200000}}});f.ledger.write('unit.alias-fixture','founder',tx=>{for(let i=0;i<105;i++){const id='alias-'+String(i).padStart(3,'0');tx.put('principals',id,{principal_id:id,kind:'cos',status:'active',generation:1,host:'codex',native_id:i===104?'already-observed-late-native':'unused-native-'+i},0);}});
  const enrollment=f.enroll(),admission=f.admit(enrollment),before=state(f);
  assert.throws(()=>observe(f,enrollment,admission,'reconstruction','already-observed-late-native'),declaredDenial);assert.deepEqual(state(f),before);assert.equal(get(f,'control','usage').value.model_calls,1);
});

test('two actual SQLite companies cannot exchange a pending context hash or choose another root',t=>{
  const a=fixture(t,{company_id:'unit-company-a'}),b=fixture(t,{company_id:'unit-company-b'});
  a.run('cos-a','notice/create',{scope:'*',content:'Only company A owns this obligation.'});b.run('cos-a','notice/create',{scope:'*',content:'Only company B owns this obligation.'});
  const ea=a.enroll({enrollment_id:'same-enrollment',principal_id:'same-pending'}),eb=b.enroll({enrollment_id:'same-enrollment',principal_id:'same-pending'}),oa=observe(a,ea,a.admit(ea)),ob=observe(b,eb,b.admit(eb)),ha=oa.channel.header(),hb=ob.channel.header();
  assert.notEqual(ha.sha256,hb.sha256);unchanged(a,()=>oa.channel.read({sha256:hb.sha256,offset:0,length:64}));unchanged(a,()=>oa.channel.read({sha256:ha.sha256,offset:0,length:64,root:b.root}));
  const text=consume(oa.channel).text;assert(text.includes('Only company A'));assert.equal(text.includes('Only company B'),false);
});

test('complete enrollment authority and original producer assignment accompany independent private review',t=>{
  const f=fixture(t),enrollment=f.enroll({enrollment_id:'complete-authority',principal_id:'complete-authority-member',role:'specialist',host:'claude',max_model_calls:3,expires_at:new Date(Date.now()+600000).toISOString(),source_instruction:'Exact fictional operator instruction: reconstruct only this scope under its original expiry and allowance; no implicit business activation.'});
  const r=reconstruction(f,enrollment),q=qualification(f,enrollment);assert.equal(q.result.accepted,true);assert.equal(f.activate(enrollment).principal.value.status,'active');
  const {used_model_calls,...authority}=enrollment.value,producerFrame=JSON.parse(r.text),reviewFrame=JSON.parse(q.text);
  assert.deepEqual(producerFrame.enrollment,authority,'producer needs the complete original protected enrollment, not just role/default labels');
  assert.deepEqual(reviewFrame.enrollment,authority,'reviewer needs the same full role, host, expiry, allowance, scope and source instruction');
  const original=get(f,'work_items',r.admission.phase.id),assignment=reviewFrame.reconstruction.assignment,delivery=reviewFrame.reconstruction.delivery;
  assert.deepEqual(assignment.context_ref,r.header.context_ref);assert.equal(assignment.sha256,r.header.sha256);assert.equal(assignment.text,r.text);assert.equal(digest(assignment.text),assignment.sha256);
  assert.deepEqual(JSON.parse(assignment.text).enrollment,authority,'the full original producer assignment must be inspectable by the independent reviewer');
  assert.deepEqual(delivery.read_ranges,original.value.reads);assert.deepEqual(delivery.read_ranges,[[0,r.header.total_characters]]);
  assert.equal(delivery.submission_sha256,original.value.submission.sha256);assert.equal(delivery.submission_sha256,digest(r.output));
});

test('explicit revoked-pending same-ID recovery preserves old uncertainty and spends only the carried allowance',t=>{
  const f=fixture(t),prior=revokedPending(f,{principal_id:'recoverable-member',enrollment_id:'original-recoverable'}),oldPhase=get(f,'work_items',prior.admission.phase.id),oldSlot=get(f,'slots',prior.admission.phase.value.execution_id);
  assert.equal(prior.revoked.value.used_model_calls,1);assert.equal(oldSlot.value.status,'unknown');
  const recovered=f.service.operator.enroll(recoveryRequest(f,prior,{max_model_calls:3}));
  assert.equal(recovered.value.principal_id,prior.principal.id);assert.equal(recovered.value.generation,prior.principal.value.generation+1);assert.equal(recovered.value.max_model_calls,3);
  for(const key of ['expires_at','role','host','scope','input_refs','operator_ref','policy_generation','pause_generation'])assert.deepEqual(recovered.value[key],prior.enrollment.value[key],key);
  assert.deepEqual(get(f,'work_items',prior.enrollment.id),prior.revoked);assert.deepEqual(get(f,'work_items',prior.admission.phase.id),oldPhase);assert.deepEqual(get(f,'slots',oldSlot.id),oldSlot);
  assert.equal(get(f,'control','usage').value.model_calls,1);assert.equal(get(f,'control','usage:'+prior.principal.id).value.model_calls,1);
  unchanged(f,()=>prior.observed.channel.header());
  reconstruction(f,recovered);qualification(f,recovered);assert.equal(f.activate(recovered).principal.value.generation,2);
  assert.equal(get(f,'control','usage').value.model_calls,3);assert.equal(get(f,'control','usage:'+prior.principal.id).value.model_calls,2);
  assert.deepEqual(get(f,'slots',oldSlot.id),oldSlot);assert.equal(rows(f,'slots',{status:['active','unknown']}).length,1);
});

test('pending recovery cannot extend, reset or broaden original authority and default allowance is the exact remainder',t=>{
  const f=fixture(t);const notice=f.run('cos-b','notice/create',{scope:'alpha',content:'A real pre-existing semantic reference for recovery input-list checks.'});
  const prior=revokedPending(f),request=recoveryRequest(f,prior);
  const mutations=[
    {expires_at:new Date(Date.parse(request.expires_at)+1).toISOString()},
    {expires_at:new Date(Date.parse(request.expires_at)-1).toISOString()},
    {max_model_calls:4},
    {expected_generation:prior.principal.value.generation-1},
    {scope:'*'},
    {role:'reviewer'},
    {host:'claude'},
    {input_refs:[ref('notices',notice)]}
  ];
  for(let i=0;i<mutations.length;i++)unchanged(f,()=>f.service.operator.enroll({...request,operation_id:'bad-recovery-'+i,enrollment_id:'bad-recovery-'+i,...mutations[i]}));
  const recovered=f.service.operator.enroll(request);assert.equal(recovered.value.max_model_calls,3,'omission uses4 originally allowed minus1 actually spent');assert.equal(recovered.value.expires_at,request.expires_at);
  assert.equal(get(f,'control','usage').value.model_calls,1);assert.equal(get(f,'control','usage:'+prior.principal.id).value.model_calls,1);
});

test('exhausted, expired or changed-authority pending enrollment cannot be renewed through recovery',t=>{
  for(const mode of ['exhausted','expired','operator','policy']){
    const f=fixture(t),prior=revokedPending(f,{max_model_calls:mode==='exhausted'?1:4}),request=recoveryRequest(f,prior),original=Date.now;
    if(mode==='operator'){const row=get(f,'principals','founder');seed(f,'principals',row.id,{...row.value,generation:row.value.generation+1});f.refresh();}
    if(mode==='policy'){const row=get(f,'control','company');seed(f,'control',row.id,{...row.value,policy_generation:row.value.policy_generation+1});}
    try{if(mode==='expired')Date.now=()=>original()+7200000;unchanged(f,()=>f.service.operator.enroll(request));}finally{Date.now=original;}
    assert.equal(get(f,'control','usage').value.model_calls,1);assert.equal(rows(f,'slots',{status:['active','unknown']}).length,1);assert.equal(get(f,'principals',prior.principal.id).value.generation,1);
  }
});

test('same-ID recovery can prepare while capacity is full but cannot admit around retained unknown slots',t=>{
  const f=fixture(t),prior=revokedPending(f,{principal_id:'capacity-recovery',enrollment_id:'capacity-original'});
  revokedPending(f,{principal_id:'other-uncertain-a',enrollment_id:'other-uncertain-a'});revokedPending(f,{principal_id:'other-uncertain-b',enrollment_id:'other-uncertain-b'});
  assert.equal(rows(f,'slots',{status:'unknown'}).length,3);assert.equal(get(f,'control','usage').value.model_calls,3);
  const recovered=f.service.operator.enroll(recoveryRequest(f,prior));assert.equal(recovered.value.generation,2);
  unchanged(f,()=>f.admit(recovered));assert.equal(rows(f,'slots',{status:'unknown'}).length,3);assert.equal(get(f,'control','usage').value.model_calls,3);assert.equal(get(f,'control','usage:capacity-recovery').value.model_calls,1);
});

test('actual P2 publication publisher identity retains both native incarnations after membership replacement',t=>{
  const f=fixture(t),enrollment=f.enroll({enrollment_id:'publisher-incarnation',principal_id:'cos-a',expected_generation:1});
  const r=reconstruction(f,enrollment,{native_id:'new-publisher-native'}),q=qualification(f,enrollment,{reviewer_principal_id:'membership-only-reviewer',native_id:'membership-only-reviewer-native'});
  assert.equal(q.result.accepted,true);assert.equal(f.activate(enrollment).principal.value.native_id,r.observed.native_id);
  const expires_at=new Date(Date.now()+3600000).toISOString();
  f.run('founder','grant/create',{grant_id:'publisher-incarnation-grant',to_principal_id:'cos-a',scope:'alpha',actions:['github/*'],resources:['repo:owner/repo'],expires_at,source_instruction:'Synthetic protected operator authorizes this real P2 publication-policy fixture.'});
  f.run('founder','grant/create',{grant_id:'producer-incarnation-grant',to_principal_id:'cos-b',scope:'alpha',actions:['home/*'],resources:['home:publisher-identity-subject'],expires_at,source_instruction:'Bounded actual P2 fixture proposal production.'});
  f.run('founder','grant/create',{grant_id:'review-incarnation-grant',to_principal_id:'reviewer',scope:'alpha',actions:['task/*'],resources:[],expires_at,source_instruction:'Distinct actual P2 fixture review admission.'});
  const proposal=f.run('cos-b','home/propose',{grant_id:'producer-incarnation-grant',scope:'alpha',home_id:'publisher-identity-subject',expected_revision:0,content:'Actual P2 proposal produced after the publisher membership transition.',github_publication:{owner:'owner',repo:'repo'}});
  const task=f.run('reviewer','task/submit',{grant_id:'review-incarnation-grant',scope:'alpha',role:'qa',stage:'review',instructions:'Independently inspect the exact P2 proposal and its complete supplied context.',acceptance:'Return canonical exact-subject review under synthetic host observation only.',review_of:ref('proposals',proposal)});
  f.run('reviewer','task/claim',{task_id:task.id});const admitted=f.run('scheduler','task/admit',{task_id:task.id});assert.equal(admitted.admitted,true);
  const output=canonical({review:{subject:ref('proposals',proposal),verdict:'Pass',reason:'Real P2 review production mechanics; the host/native/process observations remain SYNTHETIC UNIT FIXTURES.',blockers:[]}});
  const finished=createRuntimeObserver(f.ledger).record('task/finish',{operation_id:'publisher-identity-protected-review',task_id:task.id,attempt_id:admitted.task.value.attempt.id,native_id:'publication-identity-independent-reviewer',output,termination_confirmed:true,observed_process:{pid:9601,started_at:admitted.task.value.attempt.admitted_at,close_observed:true}});
  assert.equal(finished.accepted,true);assert.equal(finished.review.value.proof.protocol,'peer-runtime-observation-v1');
  const before=state(f),facts=f.ledger.read(tx=>publicationPolicyEvidence(tx,actor('cos-a'),{subject_ref:ref('proposals',proposal),review_refs:[ref('reviews',finished.review)],grant_id:'publisher-incarnation-grant',action:'github/create_pr'}));
  assert.deepEqual(state(f),before);assert.equal(facts.protocol,'peer-publication-policy-v1');assert.deepEqual(facts.subject_ref,ref('proposals',proposal));
  assert.deepEqual(facts.metadata.github_publication,{owner:'owner',repo:'repo'});assert(facts.contributors.principals.includes('cos-b'));
  assert.equal(facts.reviews.length,1);assert.deepEqual(facts.reviews[0].review_ref,ref('reviews',finished.review));assert.deepEqual(facts.reviews[0].task_ref,ref('tasks',finished.task));assert.deepEqual(facts.reviews[0].observation_ref,finished.review.value.proof.observation);assert.equal(facts.reviews[0].native_id,'publication-identity-independent-reviewer');
  assert.equal(facts.identity_facts.publisher.principal_ref.id,'cos-a');assert(facts.identity_facts.publisher.native_ids.includes('new-publisher-native'));
  assert(facts.identity_facts.publisher.native_ids.includes('cos-a-native'),'the actual shared P2 identity predicate must retain the outgoing native from membership history');
});

test('pending recovery delivers complete prior private Fail and source assignments without regrading or omitting overflow',t=>{
  const condition='Keep the original expiry, unused allowance, pending failures and reconstruction boundaries binding. '.repeat(100);
  function previousNegative(f){
    const enrollment=f.enroll({enrollment_id:'negative-original',principal_id:'negative-recovery-member',max_model_calls:4});
    const reconstructed=reconstruction(f,enrollment),reviewed=qualification(f,enrollment,{verdict:'Fail',reason:'Unit-only prior negative qualification; the full binding condition remains compulsory.',blockers:[condition]});
    assert.equal(reviewed.result.result.value.review.verdict,'Fail');
    f.service.operator.revoke({operation_id:f.op('revoke-negative'),enrollment_id:enrollment.value.enrollment_id,source_instruction:'Explicitly revoke this failed pending scope; recovery preserves the original authority and adverse evidence.'});
    return {enrollment,reconstructed,reviewed,revoked:get(f,'work_items',enrollment.id),principal:get(f,'principals',enrollment.value.principal_id)};
  }
  function assertHistory(f,prior,frame){
    assert.equal(frame.recovery_history.length,1);const entry=frame.recovery_history[0];
    assert.deepEqual(entry.reference,ref('work_items',prior.revoked));assert.deepEqual(entry.enrollment,prior.revoked.value);assert.equal(entry.enrollment.status,'revoked');assert.equal(entry.enrollment.used_model_calls,2);
    for(const [name,old]of[['reconstruction',prior.reconstructed],['review',prior.reviewed]]){
      const phase=entry.phases.find(value=>value.value.phase===name),actual=get(f,'work_items',old.admission.phase.id);
      assert(phase);assert.deepEqual(phase.reference,ref('work_items',actual));assert.deepEqual(phase.value,actual.value);
      assert.deepEqual(phase.assignment.context_ref,old.header.context_ref);assert.equal(phase.assignment.sha256,old.header.sha256);assert.equal(phase.assignment.text,old.text);assert.equal(digest(phase.assignment.text),phase.assignment.sha256);
      assert.equal(JSON.parse(phase.assignment.text).source_cut_sha256,old.header.source_cut_sha256);
      assert.deepEqual(phase.value.reads,[[0,old.header.total_characters]]);assert.equal(phase.value.submission.sha256,digest(old.output));
      assert.deepEqual(phase.result.reference,ref('work_items',old.result.result));assert.deepEqual(phase.result.value,old.result.result.value);
    }
    const negative=entry.phases.find(value=>value.value.phase==='review').result.value;
    assert.equal(negative.output,prior.reviewed.output);assert.equal(negative.review.verdict,'Fail');assert.deepEqual(negative.review.blockers,[condition]);
  }
  // This separate finite UNIT fixture starts with the already-supported200k
  // policy. It does not raise any real company limit or provide host proof.
  const f=fixture(t,{control:{policy:{max_context_bytes:200000}}}),prior=previousNegative(f),recovered=f.service.operator.enroll(recoveryRequest(f,prior,{max_model_calls:2}));
  const reconstructed=reconstruction(f,recovered),reviewed=qualification(f,recovered),producerFrame=JSON.parse(reconstructed.text),reviewFrame=JSON.parse(reviewed.text);
  assertHistory(f,prior,producerFrame);assertHistory(f,prior,reviewFrame);assert.deepEqual(reviewFrame.recovery_history,producerFrame.recovery_history);
  assert.equal(f.activate(recovered).principal.value.status,'active');assert.deepEqual(get(f,'work_items',prior.reviewed.result.result.id),prior.reviewed.result.result);assert.deepEqual(get(f,'work_items',prior.enrollment.id),prior.revoked);
  assert.equal(get(f,'control','usage').value.model_calls,4);assert.equal(get(f,'control','usage:'+prior.principal.id).value.model_calls,2);
  // At the default65k bound the same large complete adverse evidence must hold
  // either fresh admission. It must never become a clean shortened prefix.
  const small=fixture(t),old=previousNegative(small),next=small.service.operator.enroll(recoveryRequest(small,old,{max_model_calls:2}));
  const before=state(small);let admitted=null;
  try{admitted=small.admit(next);}catch(error){assert.equal(error.code,'CONTEXT_CAPACITY');assert.deepEqual(state(small),before);}
  if(admitted){
    const observed=observe(small,next,admitted),{header,text}=consume(observed.channel);assertHistory(small,old,JSON.parse(text));
    const output='Complete inherited private negative evidence remains binding in this default-bound unit reconstruction.';
    observed.channel.submit({operation_id:small.op('bounded-submit'),sha256:header.sha256,content:output});assert.equal(finish(small,observed,output).accepted,true);
    unchanged(small,()=>small.admit(next,'review'),error=>error.code==='CONTEXT_CAPACITY');
  }
  assert.deepEqual(get(small,'work_items',old.reviewed.result.result.id),old.reviewed.result.result);assert.equal(get(small,'work_items',old.reviewed.result.result.id).value.review.verdict,'Fail');assert.equal(get(small,'principals',old.principal.id).value.status,'pending');
});

test('late actual owning-P1 count hook cannot commit stale reconstruction admission or its own mutation',t=>{
  const f=fixture(t),positive=ready(f);assert.equal(f.activate(positive.enrollment).principal.value.status,'active');
  const enrollment=f.enroll({enrollment_id:'late-admission-hook',principal_id:'late-admission-member'}),before=state(f);
  const observed=actualOwningWriteHook(f,'membership/admit',(method,[family])=>method==='count'&&family==='slots',()=>f.admit(enrollment));
  assert.equal(observed.fired,1,'the hook must actually perform its real P1 mutation after the real shared-capacity count');
  assert.throws(()=>{if(observed.error)throw observed.error;},/Peer historical lookup requires an owning snapshot before pending writes/);
  assert.deepEqual(state(f),before,'the hook mutation, private admission, counters, events and history must all roll back');
});

test('late actual owning-P1 private-alias list hook cannot commit stale activation or a partial replacement',t=>{
  const f=fixture(t),positive=ready(f);assert.equal(f.activate(positive.enrollment).principal.value.status,'active');
  const enrollment=f.enroll({enrollment_id:'late-activation-hook',principal_id:'cos-a',expected_generation:1});ready(f,enrollment);const before=state(f);
  const states=['reserved','running','unknown','closed'];
  const observed=actualOwningWriteHook(f,'membership/activate',(method,[family,options])=>method==='list'&&family==='work_items'&&options?.principal_id==='reviewer'&&Array.isArray(options.status)&&options.status.length===states.length&&states.every(value=>options.status.includes(value)),()=>f.activate(enrollment));
  assert.equal(observed.fired,1,'the independent private-alias read must really precede the same-transaction mutation');
  assert.throws(()=>{if(observed.error)throw observed.error;},/Peer historical lookup requires an owning snapshot before pending writes/);
  assert.deepEqual(state(f),before,'neither the hook nor outgoing/incoming transition may partially commit');
});

test('pure clock expiry after real finish reads cannot accept a private result; unchanged-clock pairs remain valid',t=>{
  const missedExpiry=[];
  for(const phase of ['review','reconstruction'])for(const advance of [false,true]){
    const f=fixture(t),enrollment=f.enroll();if(phase==='review')reconstruction(f,enrollment);
    const admission=f.admit(enrollment,phase),observed=observe(f,enrollment,admission,phase),consumed=consume(observed.channel);
    const output=phase==='review'?canonical({review:{subject:consumed.header.subject,verdict:'Pass',reason:'Independent synthetic unit qualification under the original expiry.',blockers:[]}}):'Exact attributed synthetic reconstruction under the original expiry.';
    observed.channel.submit({operation_id:f.op('submit-expiry-pair'),sha256:consumed.header.sha256,content:output});
    const before=state(f),originalWrite=f.ledger.write,originalNow=Date.now,deadline=Date.parse(enrollment.value.expires_at);let fired=0,finalEffectRead=false,clock=originalNow(),result,error,activationError;
    Date.now=()=>clock;
    f.ledger.write=function(type,principal,callback){return originalWrite.call(this,type,principal,tx=>{
      const invoke=(method,args)=>{const value=tx[method](...args),[family,options]=args;
        if(type==='membership/finish'&&method==='get'&&family==='effects'&&options===admission.phase.value.execution_id)finalEffectRead=true;
        const lastReviewAliases=phase==='review'&&method==='list'&&family==='work_items'&&options?.principal_id==='reviewer'&&canonical(options.status)===canonical(['reserved','running','unknown','closed']);
        const terminalProbe=phase==='reconstruction'&&finalEffectRead&&method==='getVersion'&&family?.family==='control'&&family.id==='company';
        if(type==='membership/finish'&&!fired&&(lastReviewAliases||terminalProbe)){fired++;if(advance)clock=deadline+1;}
        return value;
      };
      // Actual owning P1 results are returned unchanged. This hook advances
      // only the clock; it performs no transaction or provider mutation.
      return callback(Object.freeze({...tx,get:(...args)=>invoke('get',args),list:(...args)=>invoke('list',args),getVersion:(...args)=>invoke('getVersion',args)}));
    });};
    try{try{result=finish(f,observed,output);}catch(caught){error=caught;}
      if(advance)try{f.activate(enrollment);}catch(caught){activationError=caught;}
    }finally{f.ledger.write=originalWrite;Date.now=originalNow;}
    assert.equal(fired,1,'the paired clock hook must run after the actual selected P1 read');
    t.diagnostic(canonical({phase,advance,hook_fired:fired,result_status:result?.result.value.status??null,accepted:result?.accepted??null,error_code:error?.code??null,activation_error:activationError?.code??null}));
    if(!advance){assert.ifError(error);assert.equal(result.accepted,true);assert.equal(result.result.value.status,'returned');continue;}
    assert.equal(activationError?.code,'EXPIRED','activation independently rejects the expired original authority');
    if(error?.code!=='EXPIRED'){missedExpiry.push({phase,accepted:result?.accepted??null,error_code:error?.code??null});continue;}
    assert.deepEqual(state(f),before,'late expiry rolls back the result, closure, reservations, events and receipt');
    const retained=get(f,'work_items',admission.phase.id),slot=get(f,'slots',retained.value.execution_id),effect=get(f,'effects',retained.value.execution_id);
    assert.equal(retained.value.submission.content,output);assert.equal(retained.value.result_ref,null);assert.equal(retained.value.status,'running');assert.equal(slot.value.status,'active');assert.equal(effect.value.status,'reserved');
    assert.equal(get(f,'work_items',enrollment.id).value.expires_at,enrollment.value.expires_at);assert.equal(get(f,'control','usage').value.model_calls,phase==='review'?2:1);
    // Expiry does not erase attributed output, spend, or reservation truth.
    // The existing exact protected-close route can record known closure later.
    try{Date.now=()=>deadline+1;
      const closed=f.service.host.close({operation_id:f.op('close-after-expiry'),...observed.binding,termination_confirmed:true,observed_process:{...observed.process,close_observed:true}});
      assert.equal(closed.value.closed_without_result,true);assert.equal(get(f,'slots',slot.id).value.status,'released');assert.equal(get(f,'effects',effect.id).value.status,'failed');
      unchanged(f,()=>f.admit(enrollment,phase),caught=>caught.code==='EXPIRED');
    }finally{Date.now=originalNow;}
    assert.equal(get(f,'work_items',admission.phase.id).value.submission.content,output);assert.equal(get(f,'control','usage').value.model_calls,phase==='review'?2:1);
  }
  assert.deepEqual(missedExpiry,[],'finish must fail closed at the pure final check after all provider reads');
});


// Provider exceptions retain provenance; genuine local expiry still closes raw facts.
test('real membership finish rethrows provider failures with identity and rollback while local expiry quarantines',t=>{
  const prepare=phase=>{
    const f=fixture(t),enrollment=f.enroll();if(phase==='review')reconstruction(f,enrollment);
    const admission=f.admit(enrollment,phase),observed=observe(f,enrollment,admission,phase),consumed=consume(observed.channel);
    const output=phase==='review'?canonical({review:{subject:consumed.header.subject,verdict:'Pass',reason:'Independent synthetic unit judgment.',blockers:[]}}):'Synthetic complete source-bound reconstruction.';
    observed.channel.submit({operation_id:f.op('submit-provider-case'),sha256:consumed.header.sha256,content:output});return {f,enrollment,observed,output};
  };
  for(const [phase,code,aggregate]of [['reconstruction','EXPIRED',false],['review','AUTHORITY_CHANGED',true],['reconstruction','CONTEXT_CAPACITY',false]]){
    const {f,observed,output}=prepare(phase),cause=new Error('Retained provider cause'),inner=new Error('Retained aggregate member');
    const failure=Object.assign(aggregate?new AggregateError([inner],'Synthetic provider failure',{cause}):new Error('Synthetic provider failure',{cause}),{code});
    const before=state(f),originalWrite=f.ledger.write;let injected=0;
    f.ledger.write=function(type,principal,callback){return originalWrite.call(this,type,principal,tx=>callback(type!=='membership/finish'?tx:Object.freeze({...tx,get(family,id){
      // The real founder read is inside phaseCurrent, after host authorization.
      if(family==='principals'&&id==='founder'&&injected++===0)throw failure;return tx.get(family,id);
    }})));};
    try{assert.throws(()=>finish(f,observed,output),error=>error===failure);assert.equal(injected,1);}finally{f.ledger.write=originalWrite;}
    assert.deepEqual(state(f),before);assert.equal(failure.cause,cause);if(aggregate)assert.equal(failure.errors[0],inner);
    const row=get(f,'work_items',`membership-phase:${observed.binding.enrollment_id}:${phase}`);
    assert.equal(row.value.result_ref,null);assert.equal(row.value.submission.content,output);assert.equal(get(f,'slots',row.value.execution_id).value.status,'active');
  }
  const {f,enrollment,observed,output}=prepare('reconstruction'),realNow=Date.now;let result;
  try{Date.now=()=>Date.parse(enrollment.value.expires_at);result=finish(f,observed,output);}finally{Date.now=realNow;}
  assert.equal(result.accepted,false);assert.equal(result.result.value.status,'quarantined');assert.equal(result.result.value.held,'EXPIRED');
  assert.equal(result.result.value.output,output);assert.equal(result.result.value.termination_confirmed,true);assert.equal(result.phase.value.status,'closed');
  assert.equal(get(f,'slots',result.phase.value.execution_id).value.status,'released');assert.equal(get(f,'control','usage').value.model_calls,1);
});

async function optionalProviderFinishFixture(t,method){
  const f=fixture(t),producer=method==='getTaskHistory'?await legacyPeerModel301b():{execute,createRuntimeObserver};
  const run=(who,action,args={})=>producer.execute(f.ledger,actor(who),action,{operation_id:f.op('original-producer'),...args});
  for(const principal of ['cos-a','cos-b','reviewer'])run('founder','grant/create',{grant_id:'optional-provider-'+principal,to_principal_id:principal,scope:'*',actions:['task/*','home/*'],resources:[{kind:'home',id:'optional-provider-home'}],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'SYNTHETIC bounded original component producer grant.'});
  const proposal=run('cos-a','home/propose',{grant_id:'optional-provider-cos-a',home_id:'optional-provider-home',scope:'beta',content:'A source-produced qualified beta home, unrelated to the incoming alpha scope.'});
  const task=run('cos-b','task/submit',{grant_id:'optional-provider-cos-b',scope:'beta',role:'qa',stage:'review',instructions:'SYNTHETIC independent review of the exact proposal.',acceptance:'Return exact independent review JSON.',resources:[],review_of:ref('proposals',proposal)});
  run('cos-b','task/claim',{task_id:task.id});
  const admission=run('scheduler','task/admit',{task_id:task.id});assert.equal(admission.admitted,true);
  const observer=producer.createRuntimeObserver(f.ledger),output=canonical({review:{subject:ref('proposals',proposal),verdict:'Pass',reason:'SYNTHETIC original component review; not native qualification.',blockers:[]}});
  const finished=observer.record('task/finish',{operation_id:f.op('original-observation'),task_id:task.id,attempt_id:admission.task.value.attempt.id,output,native_id:'SYNTHETIC-optional-provider-'+method,termination_confirmed:true,observed_process:{pid:17001,started_at:new Date().toISOString(),close_observed:true}});
  assert.equal(finished.accepted,true);
  const home=run('cos-a','home/publish',{grant_id:'optional-provider-cos-a',proposal_id:proposal.id,review_id:finished.review.id});
  assert.equal(home.value.status,'current');
  const transferred=run('cos-b','task/transfer',{task_id:task.id,to_principal_id:'reviewer',to_grant_id:'optional-provider-reviewer'});
  assert.equal(transferred.value.owner_principal_id,'reviewer');
  assert.equal(Object.hasOwn(transferred.value,'authority_epoch'),method==='events');
  // The actual current/legacy producer determines which complete history path
  // is needed. No qualification flags or review proof bodies are hand-seeded.
  const enrollment=f.enroll(),admitted=f.admit(enrollment),observed=observe(f,enrollment,admitted),consumed=consume(observed.channel);
  const reconstructionOutput='SYNTHETIC complete reconstruction preserving exact scope, failures and authority.';
  observed.channel.submit({operation_id:f.op('submit-optional-provider'),sha256:consumed.header.sha256,content:reconstructionOutput});
  return {f,observed,output:reconstructionOutput};
}

for(const method of ['events','getTaskHistory'])for(const aggregate of [false,true])test(`optional membership ${method} preserves ${aggregate?'AggregateError':'Error'} provider identity through actual finish`,async t=>{
  const {f,observed,output}=await optionalProviderFinishFixture(t,method),cause=Error('Retained optional provider cause'),inner=Error('Retained optional aggregate member');
  const failure=Object.assign(aggregate?new AggregateError([inner],'Optional provider failed',{cause}):new Error('Optional provider failed',{cause}),{code:aggregate?'CONTEXT_CHANGED':'EXPIRED'});
  const before=state(f),originalWrite=f.ledger.write;let injected=0,actual,result;
  f.ledger.write=function(type,principal,callback){return originalWrite.call(this,type,principal,tx=>callback(type!=='membership/finish'?tx:Object.freeze({...tx,[method](){injected++;throw failure;}})));};
  try{try{result=finish(f,observed,output);}catch(error){actual=error;}}finally{f.ledger.write=originalWrite;}
  assert.equal(injected,1,'The source-produced transferred review must actually traverse this optional provider.');
  assert.equal(actual,failure,`Provider failure must escape unchanged instead of becoming ${result?.result?.value?.status??'another result'}.`);
  assert.deepEqual(state(f),before);
  assert.equal(failure.cause,cause);if(aggregate)assert.equal(failure.errors[0],inner);
  const phase=get(f,'work_items',`membership-phase:${observed.binding.enrollment_id}:reconstruction`);
  assert.equal(phase.value.result_ref,null);assert.equal(phase.value.submission.content,output);
  assert.equal(get(f,'slots',phase.value.execution_id).value.status,'active');
});
