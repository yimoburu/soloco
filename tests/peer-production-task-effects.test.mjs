import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {bindPeerTaskEffects} from '../plugins/soloco/runtime/peers/model.mjs';
import * as model from '../plugins/soloco/runtime/peers/model.mjs';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {createPeerExecutorIncarnationSource,assertOriginalPeerExecutorIncarnation} from '../plugins/soloco/runtime/peers/executor-incarnation.mjs';
import {peerTaskEffectsFixture,rows,logicalSQLState} from './peer-task-effects-fixture.mjs';

const MODULE=fileURLToPath(new URL('../plugins/soloco/runtime/peers/protected-codex-domain.mjs',import.meta.url));
const code=expected=>error=>error?.code===expected;
const productionHold=code('PRODUCTION_OWNER_CHANGED');
const message=operation_id=>({operation_id,to_principal_id:'cos-b',content:'Composed offline fixture handoff.'});

// Original production launch/observer bodies, real P1 admission and SQLite
// COMMIT guard. ONLY predecessor qualification, process and final-send facts
// are synthetic. These tests make no native/provider/account/OS operation and
// establish no native acceptance or physical closure. Private fixture exports
// exist solely in a temporary exact-source copy, never in production.
async function composed(t,{production=false}={}){
 const f=peerTaskEffectsFixture(t,{peerFixtureOptions:{principals:{founder:{legacy_owner:{host:'codex',session_id:'synthetic-owner-session',epoch:1}},'cos-a':{enrollment_id:'SYNTHETIC-composed-enrollment',membership_qualification:{SYNTHETIC_ONLY:true}}}}});
 const submitted=f.connection.execute('task/submit',{operation_id:'composed-submit',grant_id:'grant-cos-a',scope:'alpha',role:'engineer',instructions:'Inspect synthetic offline evidence.',acceptance:'Retain attributable scoped handoff.',resources:['home:fact']});
 f.connection.execute('task/claim',{operation_id:'composed-claim',task_id:submitted.id});
 const scheduler=production?model.bindPeerProductionScheduler(f.ledger):null;
 const admitted=scheduler?scheduler.execute(f.ledger,{principal_id:'scheduler'},'task/admit',{operation_id:'composed-production-admit',task_id:submitted.id}):f.run('scheduler','task/admit',{task_id:submitted.id});assert.equal(admitted.admitted,true);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-composed-executor-'));
 let domain,shim,source,child;
 t.after(()=>{
  source?.stop();
  if(shim){shim.child.exitCode=0;shim.child.emit('exit',0,null);shim.child.emit('close',0,null);}
  for(const stream of [...(shim?.child.stdio??[]),child?.stdin,child?.stdout])stream?.destroy();
  assert.equal(fs.readFileSync(MODULE,'utf8'),original);fs.rmSync(directory,{recursive:true,force:true});
 });
 const original=fs.readFileSync(MODULE,'utf8'),shimFile=path.join(directory,'synthetic-predecessors.mjs');
 fs.writeFileSync(shimFile,`
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
export const ORIGINAL_CONTEXT_SELECTION=Object.freeze({synthetic:true});
export const compiledPlan=Object.freeze({SYNTHETIC_ONLY:true});
export const child=new EventEmitter();child.pid=424242;child.exitCode=null;child.signalCode=null;
child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
child.stdio=[child.stdin,child.stdout,child.stderr,new PassThrough(),new PassThrough()];
child.stdin.resume();child.stdio[4].resume();child.kill=()=>true;
const slot=Object.freeze({slot_id:'synthetic-composition',scope_policy:'SYNTHETIC_ONLY',executable_sha256:'a'.repeat(64),source_manifest_sha256:'b'.repeat(64),native_context_contract:{original_home_sha256:'c'.repeat(64),upstream_url:'https://example.invalid/responses'}});
const plan={launch_mode:'companion-v2',companion_slot:slot,executable_pin:{sha256:'a'.repeat(64)},sandbox_executable:'/synthetic/sandbox',executable:'/synthetic/companion',argv:[],cwd:'/synthetic-project',state_root:'/synthetic-state',scratch_root:'/synthetic-scratch',policy_sha256:'d'.repeat(64),environment:{}};
let owner,claimed=false;
export function install(value){owner=value;}
const check=(o,h)=>{if(o!==owner||h!==compiledPlan)throw Error('Synthetic predecessor identity');};
export function inspectOriginalCompiledCodexPlan(o,h){check(o,h);return {...plan,consumed:claimed};}
export function claimOriginalCompiledCodexPlan(o,h){check(o,h);if(claimed)throw Error('Synthetic consumed');claimed=true;return {...plan,consumed:true};}
export function originalCompiledPeerContextInterpreter(o,h){check(o,h);return null;}
export function originalCompanionSlotMatches(s){return s===slot;}
export function isOriginalBootstrapMembershipInterpreter(){return false;}
export function originalBootstrapCompanionSlotMatches(){return false;}
export function spawn(){return child;}
const unavailable=()=>{throw Error('Unused synthetic predecessor');};
export {unavailable as resolveOriginalPeerContextInterpreter,unavailable as assertOriginalPeerContextInterpreterFinal,unavailable as assertOriginalPeerContextSlot,unavailable as inspectOriginalPeerContextInterpreter,unavailable as assertOriginalBootstrapMembershipInterpreterFinal,unavailable as inspectOriginalBootstrapMembershipInterpreter,unavailable as assertOriginalBootstrapMembershipSlot,unavailable as inspectOriginalCompiledBootstrapScope};
`);
 const shimURL=pathToFileURL(shimFile).href;
 const relocated=original.split('\n').map(line=>{
  const match=line.match(/^(import .* from )'([^']+)';$/);if(!match)return line;
  const [,prefix,specifier]=match;
  if(['node:child_process','./protected-source-build-slot.mjs','./policy-supervisor.mjs'].includes(specifier))return prefix+JSON.stringify(shimURL)+';';
  return specifier.startsWith('./')?prefix+JSON.stringify(new URL(specifier,pathToFileURL(MODULE)).href)+';':line;
 }).join('\n');
 const body=text=>text.split('\n').filter(line=>!line.startsWith('import ')).join('\n');
 assert.equal(body(relocated),body(original),'original domain and incarnation producer bodies unchanged');
 const seam=`
export function __syntheticTurn(owner,handle,native_id,turn_id){
 const r=record(owner,handle),s=r.plan.companion_slot;
 const bootstrap={protocol:PERMIT_PROTOCOL,kind:'host_bootstrap',nonce:r.nonce,pid:r.birth.pid,slot_id:s.slot_id,executable_sha256:s.executable_sha256,source_manifest_sha256:s.source_manifest_sha256,original_home_sha256:s.native_context_contract.original_home_sha256,state_root:r.plan.state_root,cwd:r.plan.cwd,host_instance_id:'SYNTHETIC_ONLY',sources:{}};
 backendFrame(r,bootstrap,Buffer.from(JSON.stringify(bootstrap)));
 controlFrame(r,{id:1,method:'thread/resume',params:{cwd:r.plan.cwd,runtimeWorkspaceRoots:[r.plan.cwd],permissions:r.launch.profile_id,approvalPolicy:'never',baseInstructions:r.launch.base_instructions,developerInstructions:r.launch.developer_instructions}});
 serverFrame(r,{id:1,result:{thread:{id:native_id}}});
 controlFrame(r,{id:2,method:'turn/start',params:{input:[{type:'text',text:'Synthetic offline context.'}]}});
 serverFrame(r,{id:2,result:{turn:{id:turn_id}}});
 // An explicitly synthetic final-send fact, never a native permit/proof.
 r.backend.last_step={thread_id:native_id,turn_id};
 return {pid:r.birth.pid,started_at:r.birth.at};
}
export function __syntheticTurnDrift(owner,handle,turn_id){record(owner,handle).native_turn=turn_id;}
`;
 const copy=path.join(directory,'domain.mjs');fs.writeFileSync(copy,relocated+seam);
 domain=await import(pathToFileURL(copy).href);shim=await import(shimURL);const owner=Symbol('synthetic composed owner');shim.install(owner);
 const handle=domain.createOriginalProtectedCodexLaunch(owner,shim.compiledPlan);
 domain.bindOriginalProtectedCodexLaunch(owner,handle,{cwd:'/synthetic-project',profile_id:'synthetic',instruction_sources:[],base_instructions:'Synthetic instructions',developer_instructions:'Synthetic developer instructions',environment:{}});
 domain.bindOriginalProtectedTaskAdmission(owner,handle,f.ledger,admitted.task.id,admitted.context);
 child=domain.spawnOriginalProtectedCodex(owner,handle);child.stdout.resume();shim.child.emit('spawn');
 const process=domain.__syntheticTurn(owner,handle,f.binding.native_id,'synthetic-composed-turn');
 source=createPeerExecutorIncarnationSource(f.ledger);
 let turn={state:'running',yield_requested:false,hold:null,native_id:f.binding.native_id,turn_id:'synthetic-composed-turn',attempt_id:admitted.task.value.attempt.id,principal_id:f.binding.principal_id};
 const incarnation=domain.observeOriginalProtectedPeerExecutorIncarnation(owner,handle,source,{deadline_at_ms:Date.parse(admitted.task.value.attempt.effect_authority.expires_at),readTurn:()=>turn});
 const client=bindPeerTaskEffects(f.connection,{task_id:admitted.task.id},incarnation);
 return {...f,...admitted,domain,owner,handle,source,incarnation,client,process,scheduler,child:shim.child,setTurn:value=>{turn=value;}};
}

test('the production scheduler admission composes through the original executor and physical effect commit',async t=>{
 const f=await composed(t,{production:true});
 assert(f.task.value.attempt.effect_authority.production_authority);
 const result=f.client.execute('message/send',message('production-composed-send')),committed=logicalSQLState(f);
 assert.equal(result.value.task_id,f.task.id);assert.equal(rows(f,'messages').length,1);
 assert.deepEqual(f.client.execute('message/send',message('production-composed-send')),result);
 assert.deepEqual(logicalSQLState(f),committed);
});

test('replacing the production operator fences an otherwise current executor and exact message replay',async t=>{
 const f=await composed(t,{production:true}),args=message('production-owner-replay');f.client.execute('message/send',args);
 f.seed('principals','founder',value=>({...value,legacy_owner:{...value.legacy_owner,epoch:2}}));
 const before=logicalSQLState(f);
 assert.throws(()=>f.client.execute('message/send',args),productionHold);
 assert.throws(()=>f.client.execute('message/send',message('production-owner-new')),productionHold);
 assert.throws(()=>f.client.inspect('task/get',{}),productionHold);
 assert.deepEqual(logicalSQLState(f),before);assert.equal(rows(f,'messages').length,1);
});

test('production operator drift after metadata staging rolls back the original composed effect transaction',async t=>{
 const f=await composed(t,{production:true}),before=logicalSQLState(f),original=f.ledger.query;let staged=0;
 const founder=f.get('principals','founder'),changed={...founder.value,legacy_owner:{...founder.value.legacy_owner,epoch:2}},bytes=canonical(changed),sha256=peerDigest(changed);
 f.ledger.query=function(sql,...params){
  const statement=Reflect.apply(original,this,[sql,...params]);
  if(sql!=='UPDATE peer_meta SET last_event_sha256=? WHERE id=1')return statement;
  return new Proxy(statement,{get(target,key){
   if(key==='run')return(...values)=>{
    const result=target.run(...values);staged++;
    // Controlled same-connection mutation in the isolated fixture only. The
    // final guard must reread the actual original SQL rows after all staging.
    f.ledger.db.prepare('INSERT INTO peer_versions(family,id,revision,sha256,bytes) VALUES(?,?,?,?,?)').run('principals','founder',founder.revision+1,sha256,bytes);
    f.ledger.db.prepare("UPDATE peer_rows SET revision=?,sha256=?,bytes=? WHERE family='principals' AND id='founder'").run(founder.revision+1,sha256,bytes);
    return result;
   };
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
 };
 try{assert.throws(()=>f.client.execute('message/send',message('production-final-owner-drift')),productionHold);}finally{f.ledger.query=original;}
 assert.equal(staged,1);assert.deepEqual(logicalSQLState(f),before);assert.equal(rows(f,'messages').length,0);
});

test('original protected executor observer composes with the task client and same physical ledger',async t=>{
 const f=await composed(t),binding=assertOriginalPeerExecutorIncarnation(f.incarnation,{ledger:f.ledger,task_id:f.task.id,attempt_id:f.task.value.attempt.id,context_sha256:f.context.sha256});
 assert.deepEqual(binding.process,f.process);assert.equal(binding.native_id,f.binding.native_id);assert.equal(binding.turn_id,'synthetic-composed-turn');
 assert.throws(()=>f.domain.assertOriginalProtectedCodexBoundary(f.owner,f.handle,'physical_close'),code('PROTECTED_CODEX_WHOLE_DOMAIN_CLOSURE_UNPROVED'));
 const original=f.ledger.guardedWrite,seen=[];
 f.ledger.guardedWrite=function(...args){seen.push({ledger:this,action:args[0],guard:typeof args[3]});return Reflect.apply(original,this,args);};
 try{
  const result=f.client.execute('message/send',message('composed-send')),committed=logicalSQLState(f);
  assert.equal(result.value.task_id,f.task.id);assert.equal(result.value.attempt_id,f.task.value.attempt.id);
  assert.equal(rows(f,'messages').length,1);assert.deepEqual(f.client.execute('message/send',message('composed-send')),result);
  assert.deepEqual(logicalSQLState(f),committed,'replay creates no second durable effect/event/outbox/receipt');
 }finally{f.ledger.guardedWrite=original;}
 assert.equal(seen.length,2);assert(seen.every(s=>s.ledger===f.ledger&&s.action==='message/send'&&s.guard==='function'));
 assert.throws(()=>assertOriginalPeerExecutorIncarnation(f.incarnation,{ledger:f.other,task_id:f.task.id,attempt_id:f.task.value.attempt.id,context_sha256:f.context.sha256}),code('EXECUTOR_INCARNATION_CHANGED'));
});

for(const drift of ['native-turn','protocol-turn','leader-exit','stop'])test('composed executor permanently revokes on '+drift+' before replay',async t=>{
 const f=await composed(t),args=message('composed-replay-'+drift);f.client.execute('message/send',args);
 const before=logicalSQLState(f);
 if(drift==='native-turn')f.domain.__syntheticTurnDrift(f.owner,f.handle,'different-turn');
 if(drift==='protocol-turn')f.setTurn({state:'completed'});
 if(drift==='leader-exit'){f.child.exitCode=0;f.child.emit('exit',0,null);}
 if(drift==='stop')f.domain.requestOriginalProtectedCodexStop(f.owner,f.handle);
 assert.throws(()=>f.client.execute('message/send',args),code(drift==='protocol-turn'?'PROTECTED_CODEX_EXECUTOR_TURN_CHANGED':'PROTECTED_CODEX_EXECUTOR_INACTIVE'));
 assert.throws(()=>f.client.execute('message/send',message('different-operation')),code('EXECUTOR_INCARNATION_REVOKED'));
 assert.deepEqual(logicalSQLState(f),before);assert.equal(rows(f,'messages').length,1);
});

test('original executor drift after metadata staging rolls back the same physical COMMIT',async t=>{
 const f=await composed(t),before=logicalSQLState(f),original=f.ledger.query;let staged=0;
 f.ledger.query=function(sql,...params){
  const statement=Reflect.apply(original,this,[sql,...params]);
  if(sql!=='UPDATE peer_meta SET last_event_sha256=? WHERE id=1')return statement;
  return new Proxy(statement,{get(target,key){if(key==='run')return(...values)=>{const result=target.run(...values);staged++;f.domain.__syntheticTurnDrift(f.owner,f.handle,'stale-before-commit');return result;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 };
 try{assert.throws(()=>f.client.execute('message/send',message('final-stage-drift')),code('PROTECTED_CODEX_EXECUTOR_INACTIVE'));}finally{f.ledger.query=original;}
 assert.equal(staged,1);assert.deepEqual(logicalSQLState(f),before);assert.equal(rows(f,'messages').length,0);
});
