// AUTHORED SOURCE tests only. Every company/database below is temporary and
// fictional. This fixture never imports a Native issuer or starts a child.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import childProcess from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';

export function denyInventoryExternalEffects(t,{spawnChildren=[]}={}){
  const attempted=[],restore=[],spawnCalls=[];
  assert.ok(Array.isArray(spawnChildren));
  const replace=(target,key)=>{
    const descriptor=Object.getOwnPropertyDescriptor(target,key);if(!descriptor||typeof descriptor.value!=='function'||descriptor.writable!==true)return;
    Object.defineProperty(target,key,{...descriptor,value:(..._args)=>{attempted.push(key);throw Error('Original-inventory SOURCE fixture forbids external operation: '+key);}});
    restore.push(()=>Object.defineProperty(target,key,descriptor));
  };
  if(spawnChildren.length){
    const mocked=t.mock.method(childProcess,'spawn',(...args)=>{const index=spawnCalls.length;spawnCalls.push(args);assert.ok(index<spawnChildren.length,'unexpected additional original process creation');return spawnChildren[index];});
    restore.push(()=>mocked.mock.restore());
  }else replace(childProcess,'spawn');
  for(const key of ['spawnSync','exec','execSync','execFile','execFileSync','fork'])replace(childProcess,key);
  for(const [target,keys]of [[net,['connect','createConnection']],[tls,['connect']],[http,['request','get']],[https,['request','get']],[globalThis,['fetch']]])for(const key of keys)replace(target,key);
  syncBuiltinESMExports();
  t.after(()=>{try{assert.deepEqual(attempted,[]);}finally{for(const undo of restore.reverse())undo();syncBuiltinESMExports();}});
  Object.defineProperty(attempted,'spawnCalls',{value:spawnCalls});return attempted;
}

export function controlledInventoryChild(pid=process.pid+100000){
  const child=new EventEmitter();child.pid=pid;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=()=>{};
  child.signals=[];child.kill=signal=>{child.signals.push(signal);return true;};child.unref=()=>child;return child;
}

// Observe an ACTUAL final SQLite inventory read. Its real result is returned
// byte-for-byte unchanged; the test callback can only advance its own clock or
// count the read. This is never an inventory/provider or permission substitute.
export function afterInventoryEventsRead(t,observe){
  const original=DatabaseSync.prototype.prepare;
  t.mock.method(DatabaseSync.prototype,'prepare',function(sql,...args){
    const statement=Reflect.apply(original,this,[sql,...args]);
    if(sql!=='SELECT seq,at,type,value FROM events ORDER BY seq')return statement;
    return new Proxy(statement,{get(target,key){
      if(key==='all')return (...parameters)=>{const rows=Reflect.apply(target.all,target,parameters);observe(Object.freeze({count:rows.length}));return rows;};
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
  });
}

export async function inventorySourceModules(){
  // One original module identity is shared with the actual Store's fixed import.
  // No relocated producer, injected provider or cache-busted authority instance.
  const store=await import('../plugins/soloco/runtime/store.mjs');
  const producer=await import('../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs');
  return {store,producer};
}

export function fictionalInventoryState(storeModule,{id='SYNTHETIC-inventory-'+randomUUID(),jobs={},extra={}}={}){
  const team=storeModule.installedTeam();
  return {schema:storeModule.SCHEMA,runtime_version:storeModule.VERSION,plugin_version:storeModule.VERSION,
    id,name:'SYNTHETIC original-inventory SOURCE fixture',idea:'Exercise original Source census; no actual company or Native execution.',
    phase:'Frame',mode:'preparation',paused:true,...team,team_sha256:storeModule.teamHash(team),
    owner:{host:'codex',session_id:'SYNTHETIC-inventory-owner',epoch:1},records:{},sessions:{},retired_sessions:[],jobs,messages:[],notices:[],created_at:storeModule.stamp(),...extra};
}

export async function freshInventoryStore(t,{initialize=true,stateOptions={}}={}){
  const modules=await inventorySourceModules(),root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-original-inventory-SOURCE-'));
  const store=new modules.store.Store(root,true),file=path.join(root,'.company','company.sqlite');
  t.after(()=>{try{if(!store.closed)store.close();}finally{fs.rmSync(root,{recursive:true,force:true});}});
  if(initialize)store.transaction('company.created',()=>fictionalInventoryState(modules.store,stateOptions));
  const inspect=()=>store.readSnapshot(()=>modules.producer.inspectOriginalLocalExecutionInventoryFrom(store.db));
  const queue=(overrides={})=>{
    let job;
    store.transaction('job.queued',state=>{
      job=fictionalInventoryJob(state,overrides);
      modules.producer.recordOriginalWorkerAssignmentFrom(store,state,job);
      state.jobs[job.id]=job;state.sessions[job.session_key]={instance_id:job.instance_id,role:job.role,host:job.host,native_id:null,model_selection:job.model_selection};
      return state;
    });
    return store.read().jobs[job.id];
  };
  return {...modules,storeModule:modules.store,store,root,file,inspect,queue,state:()=>store.read()};
}

export function fictionalInventoryJob(state,overrides={}){
  const suffix=randomUUID(),role='research';
  return {id:'SYNTHETIC-inventory-job-'+suffix,role,session_key:role+':SYNTHETIC-inventory:'+suffix,
    instance_id:'SYNTHETIC-inventory-instance-'+suffix,native_id:null,host:'codex',epoch:state.owner.epoch,status:'queued',
    task:'SOURCE-only pending assignment; do not launch a model.',requester:{role:'runner',session_id:state.owner.session_id,host:state.owner.host,epoch:state.owner.epoch},
    context_format:3,timeout_policy_version:1,timeout_ms:60000,timeout_reason:'SYNTHETIC Source fixture retains the original finite 60-second execution bound.',model_selection:{mode:'default'},inputs:[],review_of:null,
    created_at:new Date().toISOString(),...overrides};
}

export async function historicalInventoryStore(t,{sourceState}={}){
  const modules=await inventorySourceModules(),root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-original-inventory-LEGACY-SOURCE-'));
  const directory=path.join(root,'.company');fs.mkdirSync(directory,{mode:0o700});
  const file=path.join(directory,'company.sqlite'),db=new DatabaseSync(file);
  // This deliberately pre-existing legacy database has no Source-owned fresh
  // launch-coverage genesis. Empty jobs or plausible copied origin DATA must
  // never enroll it retrospectively. Raw SQL is used ONLY for this negative.
  const state=sourceState??fictionalInventoryState(modules.store);
  try{
    db.exec('CREATE TABLE company(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,type TEXT NOT NULL,value TEXT NOT NULL);');
    db.prepare('INSERT INTO company VALUES(1,?)').run(JSON.stringify({...state,revision:0,updated_at:new Date().toISOString()}));
    db.prepare('INSERT INTO events VALUES(1,?,?,?)').run(new Date().toISOString(),'company.created',JSON.stringify({revision:0,owner:state.owner}));
  }finally{db.close();}
  const store=new modules.store.Store(root);
  t.after(()=>{try{if(!store.closed)store.close();}finally{fs.rmSync(root,{recursive:true,force:true});}});
  return {...modules,storeModule:modules.store,store,root,file,state:()=>store.read(),inspect:()=>store.readSnapshot(()=>modules.producer.inspectOriginalLocalExecutionInventoryFrom(store.db))};
}
