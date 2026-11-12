import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,peerDigest,PeerLedger} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {bindPeerProductionScheduler} from '../plugins/soloco/runtime/peers/model.mjs';
import {createMembershipLifecycle} from '../plugins/soloco/runtime/peers/membership.mjs';
import {peerFixture} from './peer-fixture.mjs';

// Genuine P1 storage and original production facades, with explicitly fictional
// adopted owner and synthetic host/process observations. No native/provider,
// human acceptance, real process closure or execution authority is established.
const owner={host:'codex',session_id:'fictional-membership-founder',epoch:1};
const code=expected=>error=>error?.code===expected;
function fixture(t){
 const f=peerFixture({principals:{founder:{legacy_owner:owner}}});t.after(()=>f.close());
 const facade=bindPeerProductionScheduler(f.ledger),membership=createMembershipLifecycle(f.ledger,{},facade);let sequence=0;
 const operation=prefix=>prefix+'-'+(++sequence);
 const input=(extra={})=>({operation_id:operation('enroll'),enrollment_id:operation('enrollment'),principal_id:operation('incoming'),role:'cos',host:'codex',scope:'alpha',input_refs:[],expires_at:new Date(Date.now()+60000).toISOString(),max_model_calls:2,expected_generation:0,source_instruction:'Fictional protected operator fixture instruction.',...extra});
 const get=(family,id)=>f.ledger.read(tx=>tx.get(family,id));
 const drift=(ledger=f.ledger)=>ledger.write('fixture.change-owning-epoch','founder',tx=>{const p=tx.get('principals','founder');tx.put('principals',p.id,{...p.value,legacy_owner:{...p.value.legacy_owner,epoch:p.value.legacy_owner.epoch+1}},p.revision);});
 return {...f,facade,membership,operation,input,get,drift};
}
// Exact logical rows/schema for these bounded standard P1 fixtures (all native
// integer columns are small). This is not a database-image/hidden-rowid claim.
function sqlState(db){
 const schema=db.prepare("SELECT type,name,tbl_name,rootpage,sql FROM sqlite_master ORDER BY type,name,tbl_name").all();
 const tables=schema.filter(row=>row.type==='table'&&!row.name.startsWith('sqlite_')).map(row=>row.name).sort();
 return {schema,tables:tables.map(name=>({name,rows:db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(row=>JSON.stringify(row)).sort()}))};
}
function bind(f,enrollment,phase='reconstruction'){
 const admitted=f.membership.operator.admit({operation_id:f.operation('admit'),enrollment_id:enrollment.value.enrollment_id,phase,...(phase==='review'?{reviewer_principal_id:'reviewer'}:{})});
 const binding={enrollment_id:enrollment.value.enrollment_id,phase,attempt_id:admitted.phase.value.attempt_id};
 const process={pid:phase==='review'?71202:71201,started_at:new Date().toISOString()};
 f.membership.host.bind({operation_id:f.operation('bind'),...binding,native_id:'synthetic-native-'+phase,observed_process:process});
 return {binding,process,channel:f.membership.host.channel(binding)};
}
function submit(f,observed,output){
 const header=observed.channel.header();let offset=0;
 while(offset<header.total_characters){const part=observed.channel.read({sha256:header.sha256,offset,length:Math.min(8192,header.total_characters-offset)});assert(part.next_offset>offset);offset=part.next_offset;}
 const content=typeof output==='function'?output(header):output;
 observed.channel.submit({operation_id:f.operation('submit'),sha256:header.sha256,content});return content;
}
function finish(f,observed,output){return f.membership.host.finish({operation_id:f.operation('finish'),...observed.binding,output,termination_confirmed:true,observed_process:{...observed.process,close_observed:true}});}

test('only an original same-ledger production facade can enter the third trusted slot',t=>{
 const f=fixture(t),foreign=new PeerLedger(f.root);t.after(()=>foreign.close());let traps=0;
 const proxy=new Proxy(f.facade,{get(){traps++;throw Error('unreachable');},getPrototypeOf(){traps++;throw Error('unreachable');}});
 for(const facade of [{membershipWrite(){}},{...f.facade},JSON.parse(JSON.stringify(f.facade)),proxy,bindPeerProductionScheduler(foreign)])assert.throws(()=>createMembershipLifecycle(f.ledger,{},facade),code('PRODUCTION_OWNER_CHANGED'));
 assert.equal(traps,0);assert.throws(()=>createMembershipLifecycle(f.ledger,{productionFacade:{}}),code('INVALID_INPUT'));
 assert.doesNotThrow(()=>createMembershipLifecycle(f.ledger,{},f.facade));
});

test('production operators use the guarded facade while original host journaling stays separate',t=>{
 const f=fixture(t),guarded=[],plain=[],originalGuarded=f.ledger.guardedWrite,originalWrite=f.ledger.write;
 f.ledger.guardedWrite=function(type,...args){guarded.push(type);return Reflect.apply(originalGuarded,this,[type,...args]);};
 f.ledger.write=function(type,...args){plain.push(type);return Reflect.apply(originalWrite,this,[type,...args]);};
 const enrollment=f.membership.operator.enroll(f.input()),reconstruction=bind(f,enrollment);
 assert.equal(finish(f,reconstruction,submit(f,reconstruction,'Synthetic reconstruction retains the whole bounded source.')).accepted,true);
 const review=bind(f,enrollment,'review');
 const output=submit(f,review,h=>canonical({review:{subject:h.subject,verdict:'Pass',reason:'Independent synthetic source fixture only.',blockers:[]}}));assert.equal(finish(f,review,output).accepted,true);
 const activated=f.membership.operator.activate({operation_id:f.operation('activate'),enrollment_id:enrollment.value.enrollment_id,source_instruction:'Synthetic operator activation.'});assert.equal(activated.principal.value.status,'active');
 const pending=f.membership.operator.enroll(f.input());f.membership.operator.revoke({operation_id:f.operation('revoke'),enrollment_id:pending.value.enrollment_id,source_instruction:'Synthetic bounded revocation.'});
 assert.deepEqual(guarded,['membership/enroll','membership/admit','membership/admit','membership/activate','membership/enroll','membership/revoke']);
 assert(plain.includes('membership/bind'));assert(plain.includes('membership/read'));assert(plain.includes('membership/submit'));assert(plain.includes('membership/finish'));
 assert(plain.every(type=>!['membership/enroll','membership/admit','membership/activate','membership/revoke'].includes(type)));assert.equal(f.get('control','usage').value.model_calls,2);
});

test('omitting the production slot preserves the original generic lifecycle writer',t=>{
 const f=fixture(t),generic=createMembershipLifecycle(f.ledger);f.ledger.guardedWrite=()=>assert.fail('Generic lifecycle must retain original writer');
 assert.equal(generic.operator.enroll(f.input()).value.status,'pending');
});

test('an owner change after construction but before BEGIN is checked in the actual transaction',t=>{
 const f=fixture(t),other=new PeerLedger(f.root);t.after(()=>other.close());
 const original=f.ledger.db.exec;let hits=0,expected;
 f.ledger.db.exec=function(sql){
  if(sql==='BEGIN IMMEDIATE'&&!hits){hits++;f.drift(other);expected=sqlState(other.db);}
  return Reflect.apply(original,this,[sql]);
 };
 try{assert.throws(()=>f.membership.operator.enroll(f.input()),code('PRODUCTION_OWNER_CHANGED'));}finally{f.ledger.db.exec=original;}
 assert.equal(hits,1);assert.deepEqual(sqlState(f.ledger.db),expected);assert.equal(f.get('control','usage'),null);
});

for(const operation of ['enroll','revoke'])test('stale production owner is rejected before '+operation+' command replay lookup',t=>{
 const f=fixture(t),enrollArgs=f.input(),enrollment=f.membership.operator.enroll(enrollArgs),args=operation==='enroll'?enrollArgs:{operation_id:f.operation('revoke'),enrollment_id:enrollment.value.enrollment_id,source_instruction:'Synthetic replayable revocation.'};
 if(operation==='revoke')f.membership.operator.revoke(args);
 f.drift();const before=sqlState(f.ledger.db),original=f.ledger.query;let commands=0;
 f.ledger.query=function(sql,...params){
  const statement=Reflect.apply(original,this,[sql,...params]);if(sql!=='SELECT * FROM peer_rows WHERE family=? AND id=?')return statement;
  return new Proxy(statement,{get(target,key){if(key==='get')return(...values)=>{if(values[0]==='commands')commands++;return Reflect.apply(target.get,target,values);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 };
 try{assert.throws(()=>f.membership.operator[operation](args),code('PRODUCTION_OWNER_CHANGED'));}finally{f.ledger.query=original;}
 assert.equal(commands,0);assert.deepEqual(sqlState(f.ledger.db),before);
});

for(const operation of ['enroll','revoke'])test('owner drift after '+operation+' metadata staging rolls back all original rows and journals',t=>{
 const f=fixture(t),enrollArgs=f.input(),enrollment=operation==='revoke'?f.membership.operator.enroll(enrollArgs):null;
 const args=operation==='enroll'?enrollArgs:{operation_id:f.operation('revoke'),enrollment_id:enrollment.value.enrollment_id,source_instruction:'Synthetic final-boundary revocation.'};
 const before=sqlState(f.ledger.db),founder=f.get('principals','founder'),changed={...founder.value,legacy_owner:{...owner,epoch:2}},bytes=canonical(changed),sha256=peerDigest(changed),original=f.ledger.query;let staged=0,ownMutation=0;
 f.ledger.query=function(sql,...params){
  const statement=Reflect.apply(original,this,[sql,...params]);if(sql!=='UPDATE peer_meta SET last_event_sha256=? WHERE id=1')return statement;
  return new Proxy(statement,{get(target,key){
   if(key==='run')return(...values)=>{
    const result=Reflect.apply(target.run,target,values);staged++;
    const current=f.ledger.db.prepare("SELECT bytes FROM peer_rows WHERE family='work_items' AND id=?").get('membership:'+args.enrollment_id);assert(current);assert.equal(JSON.parse(current.bytes).status,operation==='enroll'?'pending':'revoked');ownMutation++;
    // Deliberate same-connection fixture mutation after the operation's real
    // row/event/outbox/meta SQL. Preserve exact version-byte binding so the
    // ORIGINAL production-owner final guard is the intended failing oracle.
    f.ledger.db.prepare('INSERT INTO peer_versions(family,id,revision,sha256,bytes) VALUES(?,?,?,?,?)').run('principals','founder',founder.revision+1,sha256,bytes);
    f.ledger.db.prepare("UPDATE peer_rows SET revision=?,sha256=?,bytes=? WHERE family='principals' AND id='founder'").run(founder.revision+1,sha256,bytes);return result;
   };
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
 };
 try{assert.throws(()=>f.membership.operator[operation](args),code('PRODUCTION_OWNER_CHANGED'));}finally{f.ledger.query=original;}
 assert.equal(staged,1);assert.equal(ownMutation,1);assert.deepEqual(sqlState(f.ledger.db),before);assert.equal(f.get('principals','founder').value.legacy_owner.epoch,1);
});

test('old-owner host finish remains recordable as quarantined observation without acceptance',t=>{
 const f=fixture(t),enrollment=f.membership.operator.enroll(f.input()),observed=bind(f,enrollment),output=submit(f,observed,'Synthetic exact output returned after owner drift.');
 f.drift();const guarded=f.ledger.guardedWrite;f.ledger.guardedWrite=()=>assert.fail('Host observation cannot demand stale operator authority');
 const result=finish(f,observed,output);assert.equal(result.accepted,false);assert.equal(result.result.value.status,'quarantined');assert.equal(result.result.value.held,'AUTHORITY_CHANGED');assert.equal(result.result.value.output,output);assert.equal(result.result.value.termination_confirmed,true);assert.equal(f.get('control','usage').value.model_calls,1);
 f.ledger.guardedWrite=guarded;assert.throws(()=>f.membership.operator.revoke({operation_id:f.operation('old-revoke'),enrollment_id:enrollment.value.enrollment_id,source_instruction:'Old operator cannot resume.'}),code('PRODUCTION_OWNER_CHANGED'));
});

test('original host closure journal remains available after canonical founder replacement',t=>{
 const f=fixture(t),enrollment=f.membership.operator.enroll(f.input()),observed=bind(f,enrollment),phase=f.get('work_items','membership-phase:'+enrollment.value.enrollment_id+':reconstruction');
 f.ledger.write('fixture.replace-canonical-founder','founder',tx=>{tx.put('principals','successor',{kind:'founder',status:'active',generation:1,host:'codex',native_id:'synthetic-successor',legacy_owner:{...owner,epoch:2}},0);const c=tx.get('control','company');tx.put('control',c.id,{...c.value,founder_principal_id:'successor'},c.revision);});
 f.ledger.guardedWrite=()=>assert.fail('Original close journaling cannot require old operator authority');
 const closed=f.membership.host.close({operation_id:f.operation('close'),...observed.binding,termination_confirmed:true,observed_process:{...observed.process,close_observed:true}});
 assert.equal(closed.value.closed_without_result,true);assert.equal(closed.value.status,'closed');assert.equal(f.get('slots',phase.value.execution_id).value.status,'released');assert.equal(f.get('effects',phase.value.execution_id).value.status,'failed');assert.equal(f.get('control','usage').value.model_calls,1);
 assert.equal(f.get('work_items','membership-result:'+observed.binding.attempt_id),null);
});
