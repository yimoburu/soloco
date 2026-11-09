// Complete additional ordinary P3 composition root. Actual P1/P2/P3 journal;
// controlled JS executor only, with SYNTHETIC native/process observations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical} from '../plugins/soloco/runtime/peers/ledger.mjs';
import * as model from '../plugins/soloco/runtime/peers/model.mjs';
import {PeerScheduler} from '../plugins/soloco/runtime/peers/scheduler.mjs';
import {peerFixture} from './peer-fixture.mjs';
const actor=principal_id=>({principal_id});
function snapshot(f){return f.ledger.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name,sql})=>({name,sql,rows:f.ledger.db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(canonical).sort()}));}
function fixture(t){
 const f=peerFixture();t.after(()=>f.close());let n=0;
 f.run=(who,action,args={})=>model.execute(f.ledger,actor(who),action,{operation_id:'fixture-'+(++n),...args});f.get=(family,id)=>f.ledger.read(tx=>tx.get(family,id));
 f.run('founder','grant/create',{grant_id:'authority',to_principal_id:'cos-a',scope:'alpha',actions:['task/*'],resources:['home:fact'],max_model_calls:4,expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Synthetic existing bounded P2 authority.'});
 f.task=f.run('cos-a','task/submit',{grant_id:'authority',scope:'alpha',role:'engineer',instructions:'Synthetic complete source.',acceptance:'Retain original uncertainty.',resources:['home:fact']});f.run('cos-a','task/claim',{task_id:f.task.id});
 f.jobs=[];f.requests=[];f.executor={async probe(){return{available:true,authenticated:true};},execute(args){const process={pid:45000,started_at:'2026-01-01T00:00:00.000Z'};args.onProcess(process);return new Promise(resolve=>f.jobs.push({args,finish(){resolve({output:'Synthetic attributable controlled JS result.',native_id:'synthetic-native',termination_confirmed:true,observed_process:{...process,close_observed:true}});}}));}};
 f.api={...model,execute(...args){if(args[2]==='task/admit')f.requests.push(structuredClone(args[3]));return model.execute(...args);}};
 f.scheduler=new PeerScheduler({ledger:f.ledger,principal_id:'scheduler',observer:model.createRuntimeObserver(f.ledger),executor:f.executor,model:f.api});return f;
}
function grantFault(f,failure){const original=f.ledger.query;let reads=0;f.ledger.query=function(sql,...args){const statement=original.call(this,sql,...args);if(sql!=='SELECT * FROM peer_rows WHERE family=? AND id=?')return statement;return new Proxy(statement,{get(target,key){if(key==='get')return(...values)=>{if(values[0]==='grants'&&values[1]==='authority'){reads++;throw failure;}return target.get(...values);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});};return{restore(){f.ledger.query=original;},reads:()=>reads};}
const calls=f=>f.ledger.read(tx=>tx.list('commands',{principal_id:'scheduler',limit:100}).items.filter(r=>r.value.action==='task/admit'));
for(const aggregate of [false,true])test(`grant backend ${aggregate?'AggregateError':'Error'} survives actual admission replay without negative cache and recovers on unchanged ledger`,async t=>{
 const f=fixture(t),cause=new Error('Original lookup cause.'),member=new Error('Original aggregate member.'),failure=Object.assign(aggregate?new AggregateError([member],'Actual grant backend group failed.',{cause}):new Error('Actual grant backend failed.',{cause}),{code:aggregate?'RESOURCE_BUSY':'GRANT_INVALID'}),members=failure.errors,before=snapshot(f),fault=grantFault(f,failure);
 try{await f.scheduler.tick();}finally{fault.restore();}
 const first={reads:fault.reads(),jobs:f.jobs.length,errorRetained:f.scheduler.errors.includes(failure),original:f.scheduler.last_error?.original_error,held:f.scheduler.held.has(f.task.id),commands:calls(f).length,usage:f.get('control','usage'),attempt:f.get('tasks',f.task.id).value.attempt,state:snapshot(f),requests:structuredClone(f.requests)};
 // Restore only the real provider, with NO unrelated semantic ledger edit.
 await f.scheduler.tick();
 console.log(JSON.stringify({controlled_counterexample:'actual-grant-backend-admission',aggregate,first_grant_reads:first.reads,original_error_retained:first.errorRetained,first_negative_cache:first.held,first_committed_admission_commands:first.commands,first_launches:first.jobs,first_usage:first.usage?.value??null,first_attempt:first.attempt,recovery_launches:f.jobs.length,recovery_negative_cache:f.scheduler.held.has(f.task.id),recovery_commands:calls(f).length,recovery_usage:f.get('control','usage')?.value??null}));
 assert.equal(first.reads,2,'persistent fault reaches BOTH same-operation software replay reads');assert.equal(first.jobs,0);assert.equal(first.errorRetained,true);assert.equal(first.original,failure);assert.equal(failure.cause,cause);if(aggregate){assert.equal(failure.errors,members);assert.equal(failure.errors[0],member);}
 assert.equal(first.held,false);assert.equal(first.commands,0);assert.equal(first.usage,null);assert.equal(first.attempt,null);assert.deepEqual(first.state,before);assert.equal(first.requests.length,2);assert.deepEqual(first.requests[1],first.requests[0]);
 assert.equal(f.jobs.length,1);assert.equal(f.jobs[0].args.task.id,f.task.id);assert.equal(calls(f).length,1);assert.equal(f.get('control','usage').value.model_calls,1);assert.equal(f.get('control','usage:cos-a').value.model_calls,1);assert.equal(f.get('grants','authority').value.used_model_calls,1);assert.equal(f.scheduler.held.size,0);
 f.jobs[0].finish();await f.scheduler.drain();assert.equal(f.get('tasks',f.task.id).value.status,'returned');await f.scheduler.tick();assert.equal(f.jobs.length,1);assert.equal(f.get('control','usage').value.model_calls,1);assert.ok(f.scheduler.errors.includes(failure));
});
test('genuine revoked-grant semantic rejection remains cached with no execution or charge',async t=>{const f=fixture(t);f.run('founder','grant/revoke',{grant_id:'authority'});await f.scheduler.tick();assert.equal(f.jobs.length,0);assert.equal(f.scheduler.held.get(f.task.id).code,'GRANT_INVALID');assert.equal(calls(f).length,1);assert.equal(f.get('control','usage'),null);await f.scheduler.tick();assert.equal(f.jobs.length,0);assert.equal(calls(f).length,1);assert.equal(f.scheduler.errors.length,0);});
