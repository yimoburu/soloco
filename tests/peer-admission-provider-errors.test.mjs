// Real temporary SQLite/P1/P2 admission. Only the backend grant-read failure
// is synthetic; no company, provider launch or native authentication is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {execute} from '../plugins/soloco/runtime/peers/model.mjs';
import {peerFixture} from './peer-fixture.mjs';

const actor=principal_id=>({principal_id});
function snapshot(f){return f.ledger.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name,sql})=>({name,sql,rows:f.ledger.db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(canonical).sort()}));}
function fixture(t){
  const f=peerFixture();t.after(()=>f.close());let operation=0;
  f.run=(who,action,args={})=>execute(f.ledger,actor(who),action,{operation_id:'direct-'+(++operation),...args});
  f.get=(family,id)=>f.ledger.read(tx=>tx.get(family,id));
  f.run('founder','grant/create',{grant_id:'authority',to_principal_id:'cos-a',scope:'alpha',actions:['task/*'],resources:['home:fact'],max_model_calls:4,expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Synthetic bounded actual P2 authority.'});
  f.task=f.run('cos-a','task/submit',{grant_id:'authority',scope:'alpha',role:'engineer',instructions:'Synthetic exact complete work.',acceptance:'Preserve provider uncertainty.',resources:['home:fact']});
  f.run('cos-a','task/claim',{task_id:f.task.id});
  f.admit=()=>f.run('scheduler','task/admit',{operation_id:'exact-admission-request',task_id:f.task.id});
  return f;
}
function grantFault(f,failure){
  const original=f.ledger.query;let reads=0;
  f.ledger.query=function(sql,...args){const statement=original.call(this,sql,...args);if(sql!=='SELECT * FROM peer_rows WHERE family=? AND id=?')return statement;
    return new Proxy(statement,{get(target,key){if(key==='get')return(...values)=>{if(values[0]==='grants'&&values[1]==='authority'){reads++;throw failure;}return target.get(...values);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  };
  return {restore(){f.ledger.query=original;},reads:()=>reads};
}
const semanticCodes=['RESOURCE_BUSY','RESOURCE_AUTHORITY','CONTEXT_CAPACITY','CONTEXT_CONFLICT','GRANT_INVALID','GRANT_CHANGED','MODEL_BUDGET','PRINCIPAL_INACTIVE','SOURCE_CHANGED','DEPENDENCY_CYCLE','LEGACY_SOURCE_MISSING','DEFINITION_CHANGED'];
for(const code of semanticCodes)test(`actual grant-read provider Error carrying ${code} propagates unchanged and consumes nothing`,t=>{
  const f=fixture(t),cause=new Error('Original backend cause.'),failure=Object.assign(new Error('Actual grant lookup backend failed.',{cause}),{code}),before=snapshot(f),fault=grantFault(f,failure);let caught;
  try{f.admit();}catch(error){caught=error;}finally{fault.restore();}
  assert.equal(fault.reads(),1);assert.equal(caught,failure,'a provider-origin exception is not a semantic negative receipt');assert.equal(caught.cause,cause);assert.deepEqual(snapshot(f),before);
  assert.equal(f.get('control','usage'),null);assert.equal(f.get('tasks',f.task.id).value.attempt,null);assert.equal(f.get('slots',f.task.id),null);assert.equal(f.get('grants','authority').value.used_model_calls,0);
  const admitted=f.admit();assert.equal(admitted.admitted,true);assert.equal(f.get('control','usage').value.model_calls,1);assert.equal(f.get('control','usage:cos-a').value.model_calls,1);assert.equal(f.get('grants','authority').value.used_model_calls,1);
  assert.deepEqual(f.admit(),admitted,'same exact successful operation is replay, not another charge');assert.equal(f.get('control','usage').value.model_calls,1);
});

test('grant provider AggregateError preserves outer identity, original members and cause before same-context recovery',t=>{
  const f=fixture(t),cause=new Error('Outer backend cause.'),member=new Error('Original member failure.'),failure=Object.assign(new AggregateError([member],'Backend group unavailable.',{cause}),{code:'GRANT_INVALID'}),members=failure.errors,before=snapshot(f),fault=grantFault(f,failure);let caught;
  try{f.admit();}catch(error){caught=error;}finally{fault.restore();}
  assert.equal(fault.reads(),1);assert.equal(caught,failure);assert.equal(caught.cause,cause);assert.equal(caught.errors,members);assert.equal(caught.errors[0],member);assert.deepEqual(snapshot(f),before);assert.equal(f.admit().admitted,true);
});

test('provider Error without a semantic code remains the same propagated object',t=>{
  const f=fixture(t),failure=new TypeError('Original unclassified backend failure.'),before=snapshot(f),fault=grantFault(f,failure);let caught;
  try{f.admit();}catch(error){caught=error;}finally{fault.restore();}
  assert.equal(caught,failure);assert.deepEqual(snapshot(f),before);assert.equal(f.admit().admitted,true);
});

test('actual revoked grant remains a committed semantic denial with no attempt, charge, slot or effect',t=>{
  const f=fixture(t);f.run('founder','grant/revoke',{grant_id:'authority'});const denied=f.admit();assert.equal(denied.admitted,false);assert.equal(denied.code,'GRANT_INVALID');
  assert.deepEqual(f.admit(),denied);assert.equal(f.get('control','usage'),null);assert.equal(f.get('tasks',f.task.id).value.attempt,null);assert.equal(f.get('slots',f.task.id),null);assert.equal(f.get('grants','authority').value.used_model_calls,0);
  assert.equal(f.ledger.read(tx=>tx.list('commands',{principal_id:'scheduler',limit:100}).items.filter(r=>r.value.action==='task/admit').length),1);
});
