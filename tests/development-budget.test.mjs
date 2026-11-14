import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Store,SCHEMA,VERSION,installedTeam,teamHash,digest,withStore,id} from '../plugins/soloco/runtime/store.mjs';
import {runWithMcpHostContext} from '../plugins/soloco/runtime/mcp-host-context.mjs';
import {developmentLimits} from '../plugins/soloco/runtime/development-limits.mjs';
import {developmentReviewAuthority,developmentAssignment} from '../plugins/soloco/runtime/develop.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {sandboxCapability} from '../plugins/soloco/runtime/local-sandbox.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {currentExtensions} from '../plugins/soloco/runtime/current-state.mjs';
import {peerFixture} from './peer-fixture.mjs';
import {inspectLegacyDevelopmentBudget as inspect,proposeLegacyDevelopmentBudget as propose,applyLegacyDevelopmentBudget as apply,restoreLegacyDevelopmentBudget as restore,reconcileLegacyDevelopmentBudget as reconcile} from '../plugins/soloco/runtime/development-budget.mjs';

// SOURCE fixtures only: HOST metadata, pinned owner and existing grant are
// fictional. No genuine native, installed hook, model or business proof exists.
const KEY='development_budget_control',instruction='Explicit fictional source-only project ceiling control; retain original bytes and grants.';
function fixture(t,{raw,beforeCleanup}={}){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-budget-source-'))),session_id=randomUUID(),actor=Object.freeze({host:'codex',session_id,native_id:session_id});
 const s={...installedTeam(),schema:SCHEMA,runtime_version:VERSION,id:'fictional-'+randomUUID(),name:'Fictional budget fixture',idea:'No company execution',mode:'preparation',phase:'preparation',paused:true,revision:0,owner:{host:'codex',session_id,epoch:1},records:{},jobs:{},sessions:{},notices:[],messages:[],upgrade_history:[]};
 s.team_sha256=teamHash(s);s.records.intent={id:'intent',kind:'intent',revision:1,content:'Original binding intent'};s.records.decision={id:'decision',kind:'decision',revision:1,content:'Original finite standing authorization'};
 s.records.plan={id:'plan',kind:'artifact',revision:1,development:{type:'plan',scope:{max_bytes:20000,max_attempts:3,timeout_ms:3000,max_output_bytes:10000,expires_at:'2099-01-01T00:00:00.000Z'},attempts:['original-consumed'],authorization:{decision_id:'decision'}}};
 s.records.plan.development.scope_sha256=digest(JSON.stringify(s.records.plan.development.scope));
 s.records.plan.development.authorization.authority_sha256=developmentReviewAuthority(s,'plan');
 const store=new Store(root,true);store.transaction('fixture.source',()=>s);store.migrate();store.close();
 const config=path.join(root,'.company','development.json');if(raw!==undefined)fs.writeFileSync(config,raw,{mode:0o640});
 t.after(async()=>{await beforeCleanup?.();fs.rmSync(root,{recursive:true,force:true});});
 const rawCall=(fn,a)=>runWithMcpHostContext('codex',{threadId:session_id,sessionId:session_id},()=>fn(root,actor,a));
 const call=(fn,a={})=>rawCall(fn,{epoch:1,...a});
 return {root,actor,config,call,rawCall,read:()=>withStore(root,db=>db.read())};
}
// Observe only the original run call's returned child. This is a close barrier,
// not descendant/group closure or native identity evidence; the execution
// controller owns those checks.
function observeOriginalDevelopmentWorker(f,plan,candidate) {
 const originalSpawn=childProcess.spawn,entry=fileURLToPath(new URL('../plugins/soloco/runtime/develop.mjs',import.meta.url));
 let calls=0,delegated=0,child,attached=false,spawned=false,closeEvidence=null,providerError,launchError,jobId,finishing;
 let resolveClose;const closed=new Promise(resolve=>{resolveClose=resolve;});
 const observedSpawn=function(file,argv,options){
  calls++;
  try{
   assert.equal(calls,1,'Only the exact original development worker may be spawned');
   assert.equal(file,process.execPath);assert.ok(Array.isArray(argv));assert.equal(argv.length,4);
   assert.deepEqual(argv.slice(0,3),['--no-warnings',entry,f.root]);
   assert.equal(typeof argv[3],'string');jobId=argv[3];
   const j=f.read().jobs[jobId];
   assert.ok(j&&j.id===jobId&&j.kind==='development_test'&&j.status==='queued'&&j.development_id===plan.id&&j.candidate_id===candidate.id&&j.session_id===f.actor.session_id&&j.host==='codex'&&j.epoch===1,'Exact reserved fictional test job required');
   assert.deepEqual(Object.keys(options).sort(),['detached','env','stdio']);
   assert.equal(options.detached,true);assert.equal(options.stdio,'ignore');
   const expectedEnv={...process.env,COMPANY_WORKER:'1'},keys=Object.keys(expectedEnv);
   assert.ok(options.env&&Object.keys(options.env).length===keys.length&&keys.every(key=>options.env[key]===expectedEnv[key]),'Original worker environment must pass through unchanged');
   delegated++;child=Reflect.apply(originalSpawn,this,[file,argv,options]);
   child.once('spawn',()=>{spawned=true;});
   child.once('error',error=>{providerError??=error;});
   child.once('close',(exit,signal)=>{closeEvidence=Object.freeze({exit,signal});resolveClose(closeEvidence);});
   attached=true;return child;
  }catch(error){if(delegated&&!attached)launchError??=error;else providerError??=error;throw error;}
 };
 const restore=()=>{
  const changed=childProcess.spawn!==observedSpawn;
  childProcess.spawn=originalSpawn;syncBuiltinESMExports();
  assert.equal(changed,false,'Original worker observer binding changed while active');
 };
 childProcess.spawn=observedSpawn;
 try{syncBuiltinESMExports();}catch(error){
  childProcess.spawn=originalSpawn;
  try{syncBuiltinESMExports();}catch(cleanup){throw new AggregateError([error,cleanup],'Original worker observer setup and restoration failed',{cause:error});}
  throw error;
 }
 const finish=()=>finishing??=(async()=>{
  let primary,timer;
  try{
   if(!calls)return Object.freeze({closure_basis:'never_started'});
   if(launchError)throw Object.assign(Error('Original worker launch outcome is unknown; fixture retained',{cause:launchError}),{code:'SOURCE_WORKER_CLOSE_UNKNOWN'});
   if(!delegated&&providerError)throw providerError;
   assert.equal(delegated,1,'Exactly one original worker delegation required');
   // A receipt/error/exit/PID is not close. A timeout never authorizes removal.
   const evidence=closeEvidence??await Promise.race([closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Original worker close was not observed within 10000ms; fixture retained'),{code:'SOURCE_WORKER_CLOSE_UNKNOWN'})),10000);})]);
   if(providerError)throw providerError;
   assert.equal(spawned,true,'Original worker spawn must be observed before close');
   assert.equal(evidence.exit,0);assert.equal(evidence.signal,null);
   return Object.freeze({closure_basis:'original_returned_child_close',exit:evidence.exit,signal:evidence.signal});
  }catch(error){primary=error;throw error;}
  finally{
   clearTimeout(timer);
   try{restore();}catch(cleanup){if(primary)throw new AggregateError([primary,cleanup],'Original worker close barrier and restoration failed',{cause:primary});throw cleanup;}
  }
 })();
 return {finish,assertJob:job=>{assert.equal(calls,1);assert.equal(delegated,1);assert.equal(job.id,jobId);}};
}

const planned=async(f,max=400000)=>{const i=await f.call(inspect);return f.call(propose,{max_bytes_ceiling:max,expected_config:i.configuration,source_instruction:instruction,restoration_policy:'retain-original-explicit-cas-restore'});};
const applied=async(f,max=400000)=>{const p=await planned(f,max);return f.call(apply,{proposal_ref:p.proposal_ref,source_instruction:instruction});};
function patch(t,object,key,fn){const old=object[key];object[key]=fn(old);t.after(()=>{object[key]=old;});return ()=>{object[key]=old;};}
const code=expected=>error=>error?.code===expected;
const withoutAudit=s=>{const c=structuredClone(s);delete c[KEY];delete c.revision;delete c.updated_at;return c;};

test('active original SOURCE HOST observation is required before storage, not matching actor DATA',async t=>{
 const f=fixture(t);let reads=0;const undo=patch(t,fs,'lstatSync',old=>(...a)=>{reads++;return old(...a);});
 await assert.rejects(inspect(f.root,f.actor,{epoch:1}),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
 await assert.rejects(runWithMcpHostContext('codex',{threadId:randomUUID(),sessionId:f.actor.session_id},()=>inspect(f.root,f.actor,{epoch:1})),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
 for(const root of ['/tmp/\ud800','/tmp/\0','/'+'x'.repeat(4096)])await assert.rejects(runWithMcpHostContext('codex',{threadId:f.actor.session_id,sessionId:f.actor.session_id},()=>inspect(root,f.actor,{epoch:1})),code('DEVELOPMENT_BUDGET_INPUT'));
 assert.equal(reads,0);undo();
 await assert.rejects(runWithMcpHostContext('codex',{threadId:f.actor.session_id,sessionId:f.actor.session_id},()=>inspect(f.root,{...f.actor,native_id:randomUUID()},{epoch:1})),code('DEVELOPMENT_BUDGET_ACTOR'));
 assert.equal(f.read()[KEY],undefined);
});

test('fresh owner/epoch and actual layout4 are required; no peer fallback or audit mutation',async t=>{
 const f=fixture(t),before=f.read();await assert.rejects(f.call(inspect,{epoch:2}),/does not own/);
 const other=randomUUID();await assert.rejects(runWithMcpHostContext('codex',{threadId:other,sessionId:other},()=>inspect(f.root,{host:'codex',session_id:other,native_id:other},{epoch:1})),/does not own/);
 assert.deepEqual(f.read(),before);
 const p=peerFixture(),tableBefore=p.ledger.db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all();p.ledger.close();t.after(()=>fs.rmSync(p.root,{recursive:true,force:true}));
 await assert.rejects(runWithMcpHostContext('codex',{threadId:f.actor.session_id,sessionId:f.actor.session_id},()=>inspect(fs.realpathSync(p.root),f.actor,{epoch:1})),code('OWNER_LEGACY_LAYOUT4_REQUIRED'));
 const db=new DatabaseSync(p.file,{readOnly:true});try{assert.deepEqual(db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all(),tableBefore);}finally{db.close();}
});

test('inspect is read-only; apply and explicit absence restore persist across fresh connections without changing grants',async t=>{
 const f=fixture(t),before=f.read(),first=await f.call(inspect);assert.deepEqual(f.read(),before);assert.equal(first.configuration.exists,false);assert.equal(first.configuration.max_bytes_ceiling,100000);
 withStore(f.root,db=>db.read()); // Ordinary cold WAL/SHM lifecycle cannot stale a config reference.
 const p=await f.call(propose,{max_bytes_ceiling:400000,expected_config:Object.fromEntries(Object.entries(first.configuration).reverse()),source_instruction:instruction,restoration_policy:'retain-original-explicit-cas-restore'}),a=await f.call(apply,{proposal_ref:Object.fromEntries(Object.entries(p.proposal_ref).reverse()),source_instruction:instruction});assert.equal(a.status,'applied');assert.equal(developmentLimits(f.root).max_bytes,400000);
 assert.deepEqual(withoutAudit(f.read()),withoutAudit(before));assert.equal(developmentReviewAuthority(f.read(),'plan'),before.records.plan.development.authorization.authority_sha256);
 assert.ok(Object.hasOwn(currentExtensions(f.read()),KEY),'new audit is compulsory context, not silently exempted');
 const inspectBefore=f.read(),page=await f.call(inspect,{ref:a.operation_ref});assert.deepEqual(f.read(),inspectBefore);assert.equal(page.operation.before.exists,false);assert.equal(page.operation.target.max_bytes_ceiling,400000);assert.ok(Object.isFrozen(page.operation));
 const r=await f.call(restore,{applied_ref:a.operation_ref,expected_config:a.configuration,source_instruction:instruction});assert.equal(r.status,'applied');assert.equal(fs.existsSync(f.config),false);assert.equal(developmentLimits(f.root).max_bytes,100000);assert.deepEqual(withoutAudit(f.read()),withoutAudit(before));
 const evidence=fs.readdirSync(path.join(f.root,'.company','development-budget'));assert.ok(evidence.some(n=>n.endsWith('.removed')));assert.ok(evidence.some(n=>n.endsWith('.before')));
});

test('restore retains exact original UTF8 bytes, refuses later manual config and later tool generations',async t=>{
 const original=' { "max_bytes_ceiling" : 250000 }\n',f=fixture(t,{raw:original}),a=await applied(f);
 const r=await f.call(restore,{applied_ref:a.operation_ref,expected_config:a.configuration,source_instruction:instruction});assert.equal(r.status,'applied');assert.equal(fs.readFileSync(f.config,'utf8'),original);
 const newer=await applied(f,500000);fs.writeFileSync(f.config,'{"max_bytes_ceiling":300000}');const manual=fs.readFileSync(f.config),i=await f.call(inspect);
 await assert.rejects(f.call(restore,{applied_ref:newer.operation_ref,expected_config:i.configuration,source_instruction:instruction}),code('DEVELOPMENT_BUDGET_CONFIG_CAS'));assert.deepEqual(fs.readFileSync(f.config),manual);
 const later=await applied(f,600000);assert.equal(later.status,'applied');await assert.rejects(f.call(restore,{applied_ref:newer.operation_ref,expected_config:later.configuration,source_instruction:instruction}),code('DEVELOPMENT_BUDGET_LATER_CONFIGURATION'));assert.equal(developmentLimits(f.root).max_bytes,600000);
});

test('lowering through the supported setter preserves original grant bytes and triggers its original budget Hold',async t=>{
 const f=fixture(t),original=f.read().records.plan,setting=await applied(f,1000);assert.equal(setting.status,'applied');const s=f.read();assert.deepEqual(s.records.plan,original);
 assert.throws(()=>developmentAssignment(s,{development_id:'plan',role:'engineer'},false,f.root),/ceiling was lowered/);assert.equal(s.records.plan.development.scope.max_bytes,20000);assert.deepEqual(s.records.plan.development.attempts,['original-consumed']);
 const restored=await f.call(restore,{applied_ref:setting.operation_ref,expected_config:setting.configuration,source_instruction:instruction});assert.equal(restored.status,'applied');assert.deepEqual(f.read().records.plan,original);
});

test('closed payloads, malformed refs, accessors/proxies and invalid ranges cannot invoke user code or persist proposals',async t=>{
 const f=fixture(t),i=await f.call(inspect),base={epoch:1,max_bytes_ceiling:400000,expected_config:i.configuration,source_instruction:instruction,restoration_policy:'retain-original-explicit-cas-restore'};let invoked=0;
 const getter={...base};Object.defineProperty(getter,'max_bytes_ceiling',{enumerable:true,get(){invoked++;return 400000;}});
 const proxy=new Proxy(base,{ownKeys(){invoked++;throw Error('executed');}}),coerce={...i.configuration,snapshot_sha256:{toString(){invoked++;return 'a'.repeat(64);}}};
 for(const a of [getter,proxy,{...base,max_bytes_ceiling:1000001},{...base,max_bytes_ceiling:999},{...base,max_bytes_ceiling:1.2},{...base,max_bytes_ceiling:'400000'},{...base,callback:()=>invoked++},{...base,actor:f.actor},{...base,expected_config:coerce},{...base,source_instruction:'\ud800'},{...base,source_instruction:'\0'}])await assert.rejects(f.rawCall(propose,a),code('DEVELOPMENT_BUDGET_INPUT'));
 await assert.rejects(f.call(apply,{proposal_ref:{id:{toString(){invoked++;return 'budget-'+randomUUID();}},revision:1,sha256:'a'.repeat(64)},source_instruction:instruction}),code('DEVELOPMENT_BUDGET_INPUT'));
 assert.equal(invoked,0);assert.equal(f.read()[KEY],undefined);
});

test('config bytes, inode preimage, proposal reference and original owner are independently bound',async t=>{
 const f=fixture(t),p=await planned(f);await assert.rejects(f.call(apply,{proposal_ref:{...p.proposal_ref,sha256:'0'.repeat(64)},source_instruction:instruction}),code('DEVELOPMENT_BUDGET_STALE_REFERENCE'));
 fs.writeFileSync(f.config,'{"max_bytes_ceiling":300000}');await assert.rejects(f.call(apply,{proposal_ref:p.proposal_ref,source_instruction:instruction}),code('DEVELOPMENT_BUDGET_CONFIG_CAS'));
 fs.unlinkSync(f.config);const q=await planned(f);withStore(f.root,db=>db.transaction('fixture.owner',s=>{s.owner.epoch=2;return s;}));
 await assert.rejects(f.call(apply,{epoch:2,proposal_ref:q.proposal_ref,source_instruction:instruction}),code('DEVELOPMENT_BUDGET_STALE_PROPOSAL'));assert.equal(fs.existsSync(f.config),false);assert.equal(f.read()[KEY].active_intent_id,null);
});

test('invalid regular config, symlink, hardlink, directory and original provider errors reject without persistent audit',async t=>{
 const f=fixture(t);for(const raw of ['not json','{"max_bytes_ceiling":1000001}','{"max_bytes_ceiling":1000,"extra":true}',Buffer.from([0xff]),' '.repeat(4097)]){fs.writeFileSync(f.config,raw);await assert.rejects(f.call(inspect));assert.equal(f.read()[KEY],undefined);}
 fs.unlinkSync(f.config);const outside=path.join(f.root,'unselected.json');fs.writeFileSync(outside,'{"max_bytes_ceiling":200000}');fs.symlinkSync(outside,f.config);await assert.rejects(f.call(inspect),code('DEVELOPMENT_BUDGET_CONFIG_FILE'));fs.unlinkSync(f.config);
 fs.linkSync(outside,f.config);await assert.rejects(f.call(inspect),code('DEVELOPMENT_BUDGET_CONFIG_FILE'));fs.unlinkSync(f.config);fs.mkdirSync(f.config);await assert.rejects(f.call(inspect),code('DEVELOPMENT_BUDGET_CONFIG_FILE'));fs.rmdirSync(f.config);
 const e=Object.assign(Error('fictional metadata provider error'),{code:'EIO'}),undo=patch(t,fs,'lstatSync',old=>(file,...args)=>{if(file===f.config)throw e;return old(file,...args);});await assert.rejects(f.call(inspect),error=>error===e);undo();assert.equal(f.read()[KEY],undefined);
});

test('preparation owner drift prevents staging; durable intent remains discoverable without automatic retry',async t=>{
 const f=fixture(t),p=await planned(f);let hit=0;
 const undo=patch(t,DatabaseSync.prototype,'exec',old=>function(sql){const value=old.call(this,sql);if(sql==='COMMIT'&&hit===0){hit++;withStore(f.root,db=>db.transaction('fixture.owner_after_prepare',s=>{s.owner.epoch=2;return s;}));}return value;});
 const held=await f.call(apply,{proposal_ref:p.proposal_ref,source_instruction:instruction});undo();assert.equal(hit,1);assert.equal(held.status,'held');assert.equal(fs.existsSync(f.config),false);assert.equal(fs.existsSync(path.join(f.root,'.company','development-budget')),false);
 const i=await f.call(inspect,{epoch:2});assert.equal(i.active_intent.id,p.proposal_ref.id);assert.equal(i.operations[0].status,'prepared');
 const r=await f.call(reconcile,{epoch:2,intent_ref:i.active_intent,source_instruction:instruction});assert.equal(r.observed_outcome,'not_applied');assert.equal(r.repeated_file_action,false);
});

test('partial stage write is retained and reconciled without touching config or reusing the attempt',async t=>{
 const f=fixture(t),p=await planned(f),fdNames=new Map();let hit=0;
 patch(t,fs,'openSync',old=>(file,...args)=>{const fd=old(file,...args);fdNames.set(fd,String(file));return fd;});const undo=patch(t,fs,'writeSync',old=>(fd,b,offset,length,position)=>{if(fdNames.get(fd)?.endsWith('.stage')){hit++;if(hit===1)return old(fd,b,offset,Math.min(7,length),position);throw Object.assign(Error('stage EIO'),{code:'EIO'});}return old(fd,b,offset,length,position);});
 const h=await f.call(apply,{proposal_ref:p.proposal_ref,source_instruction:instruction});undo();assert.equal(h.status,'held');assert.equal(hit,2);assert.equal(fs.existsSync(f.config),false);
 const dir=path.join(f.root,'.company','development-budget'),stage=fs.readdirSync(dir).find(n=>n.endsWith('.stage'));assert.equal(fs.statSync(path.join(dir,stage)).size,7);
 const i=await f.call(inspect),r=await f.call(reconcile,{intent_ref:i.active_intent,source_instruction:instruction});assert.equal(r.observed_outcome,'not_applied');await assert.rejects(f.call(apply,{proposal_ref:p.proposal_ref,source_instruction:instruction}),code('DEVELOPMENT_BUDGET_STALE_REFERENCE'));assert.equal(fs.statSync(path.join(dir,stage)).size,7);
});

test('failure before rename leaves STAGED; failure after actual rename is truthful uncertainty with factual reconciliation',async t=>{
 for(const after of [false,true]){const f=fixture(t),p=await planned(f);let hit=0;const undo=patch(t,fs,'renameSync',old=>(from,to)=>{if(String(from).endsWith('.stage')){hit++;if(after)old(from,to);throw Object.assign(Error('rename observation fault'),{code:'EIO'});}return old(from,to);});
  const h=await f.call(apply,{proposal_ref:p.proposal_ref,source_instruction:instruction});undo();assert.equal(hit,1);assert.equal(h.status,'held');assert.equal(h.external_outcome,'unknown');assert.equal(fs.existsSync(f.config),after);
  const i=await f.call(inspect);assert.equal(i.operations[0].status,'staged');const r=await f.call(reconcile,{intent_ref:i.active_intent,source_instruction:instruction});assert.equal(r.observed_outcome,after?'reconciled_applied':'not_applied');assert.equal(r.original_call_success_inferred,false);assert.equal(r.repeated_file_action,false);
  if(after){const restored=await f.call(restore,{applied_ref:r.operation_ref,expected_config:r.configuration,source_instruction:instruction});assert.equal(restored.status,'applied');assert.equal(fs.existsSync(f.config),false,'exact observed target is explicitly restore-eligible');}
 }
});

test('final SQL owner fence rolls back its audit while retaining the post-file uncertain outcome',async t=>{
 const f=fixture(t),p=await planned(f);withStore(f.root,db=>{
  const changed={...db.read().owner,epoch:2},bytes=JSON.stringify(changed),sha=digest(bytes);db.db.prepare('INSERT OR IGNORE INTO immutable_values VALUES(?,?)').run(sha,bytes);
  db.db.exec(`CREATE TRIGGER fixture_owner_drift AFTER UPDATE ON state_entries WHEN NEW.family='root' AND NEW.key='${KEY}' AND (SELECT bytes FROM immutable_values WHERE sha256=NEW.sha256) LIKE '%"status":"applied"%' BEGIN UPDATE state_entries SET sha256='${sha}' WHERE family='root' AND key='owner'; END;`);
 });
 const h=await f.call(apply,{proposal_ref:p.proposal_ref,source_instruction:instruction});assert.equal(h.status,'held');assert.equal(developmentLimits(f.root).max_bytes,400000);assert.equal(f.read().owner.epoch,1,'actual SQL owner mutation rolled back');assert.equal(f.read()[KEY].operations[0].status,'staged');
 withStore(f.root,db=>db.db.exec('DROP TRIGGER fixture_owner_drift'));const i=await f.call(inspect),r=await f.call(reconcile,{intent_ref:i.active_intent,source_instruction:instruction});assert.equal(r.observed_outcome,'reconciled_applied');
});

test('unresolved conflict never rewrites a later config; explicit read-only facts retain the active intent',async t=>{
 const f=fixture(t),p=await planned(f),undo=patch(t,fs,'renameSync',old=>(...a)=>{if(String(a[0]).endsWith('.stage'))throw Object.assign(Error('before rename'),{code:'EIO'});return old(...a);});await f.call(apply,{proposal_ref:p.proposal_ref,source_instruction:instruction});undo();
 fs.writeFileSync(f.config,'{"max_bytes_ceiling":350000}');const before=fs.readFileSync(f.config),i=await f.call(inspect),r=await f.call(reconcile,{intent_ref:i.active_intent,source_instruction:instruction});assert.equal(r.status,'held');assert.equal(r.observed_outcome,'conflict');assert.deepEqual(fs.readFileSync(f.config),before);assert.equal((await f.call(inspect)).active_intent.id,i.active_intent.id);
 await assert.rejects(planned(f,500000),code('DEVELOPMENT_BUDGET_RECONCILE_REQUIRED'));assert.deepEqual(fs.readFileSync(f.config),before);
});

test('bounded complete pages and exact records reject cursor drift without writing delivery metadata',async t=>{
 const f=fixture(t);for(let i=0;i<3;i++)await planned(f,300000+i*1000);const before=f.read(),page=await f.call(inspect,{limit:1});assert.equal(page.operations.length,1);assert.equal(page.total,3);assert.equal(page.complete,false);assert.ok(page.next_cursor);
 const second=await f.call(inspect,{limit:1,cursor:page.next_cursor});assert.notEqual(second.operations[0].ref.id,page.operations[0].ref.id);const record=await f.call(inspect,{ref:page.operations[0].ref});assert.equal(record.operation.status,'proposed');assert.ok(Buffer.byteLength(JSON.stringify(record))<=24000);assert.deepEqual(f.read(),before);
 await planned(f,600000);await assert.rejects(f.call(inspect,{cursor:page.next_cursor}),code('DEVELOPMENT_BUDGET_CURSOR'));
});

test('interrupted restore-to-absence requires both absence and retained original inode/bytes',async t=>{
 const f=fixture(t),a=await applied(f);let hit=0;const undo=patch(t,fs,'renameSync',old=>(from,to)=>{const r=old(from,to);if(String(to).endsWith('.removed')){hit++;throw Object.assign(Error('after absence rename'),{code:'EIO'});}return r;});
 const held=await f.call(restore,{applied_ref:a.operation_ref,expected_config:a.configuration,source_instruction:instruction});undo();assert.equal(held.status,'held');assert.equal(hit,1);assert.equal(fs.existsSync(f.config),false);
 const i=await f.call(inspect),directory=path.join(f.root,'.company','development-budget'),removed=path.join(directory,i.active_intent.id+'.removed'),retained=removed+'.retained';fs.renameSync(removed,retained);
 const missing=await f.call(reconcile,{intent_ref:i.active_intent,source_instruction:instruction});assert.equal(missing.observed_outcome,'conflict','absence alone cannot prove a restore effect');assert.ok((await f.call(inspect)).active_intent);
 fs.renameSync(retained,removed);const r=await f.call(reconcile,{intent_ref:missing.operation_ref,source_instruction:instruction});assert.equal(r.observed_outcome,'reconciled_applied');assert.equal(r.original_call_success_inferred,false);assert.equal((await f.call(inspect)).active_intent,null);
});

test('failed stage fsync preserves PREPARED and releases only its admin intent after explicit observed preimage',async t=>{
 const f=fixture(t),p=await planned(f),names=new Map();let hit=0;
 patch(t,fs,'openSync',old=>(file,...args)=>{const fd=old(file,...args);names.set(fd,String(file));return fd;});const undo=patch(t,fs,'fsyncSync',old=>fd=>{if(names.get(fd)?.endsWith('.stage')){hit++;throw Object.assign(Error('stage fsync EIO'),{code:'EIO'});}return old(fd);});
 const before=withoutAudit(f.read()),h=await f.call(apply,{proposal_ref:p.proposal_ref,source_instruction:instruction});undo();assert.equal(h.status,'held');assert.equal(hit,1);assert.equal(f.read()[KEY].operations[0].status,'prepared');assert.equal(fs.existsSync(f.config),false);
 const i=await f.call(inspect),r=await f.call(reconcile,{intent_ref:i.active_intent,source_instruction:instruction});assert.equal(r.observed_outcome,'not_applied');assert.equal((await f.call(inspect)).active_intent,null);assert.deepEqual(withoutAudit(f.read()),before);
});

test('oversized exact audit records remain fully retrievable by hash-bound surrogate-safe chunks',async t=>{
 const f=fixture(t),p=await planned(f),undo=patch(t,fs,'renameSync',old=>(...a)=>{if(String(a[0]).endsWith('.stage'))throw Object.assign(Error('retained staged attempt'),{code:'EIO'});return old(...a);});await f.call(apply,{proposal_ref:p.proposal_ref,source_instruction:instruction});undo();
 fs.writeFileSync(f.config,'{"max_bytes_ceiling":350000}');let active=(await f.call(inspect)).active_intent;
 for(let i=0;i<8;i++){const r=await f.call(reconcile,{intent_ref:active,source_instruction:'你'.repeat(998)+'😀'});assert.equal(r.status,'held');active=r.operation_ref;}
 const before=f.read(),full=JSON.stringify(before[KEY].operations[0]),h=await f.call(inspect,{ref:active});assert.equal(h.code,'DEVELOPMENT_BUDGET_RESULT_CAPACITY');assert.ok(Buffer.byteLength(full)>24000);assert.ok(Buffer.byteLength(JSON.stringify(h))<=24000);
 let text='',offset=0;do{const r=await f.call(inspect,{ref:active,canonical_sha256:active.sha256,offset,length:4096});assert.equal(r.offset,offset);assert.ok(Buffer.byteLength(JSON.stringify(r))<=24000);text+=r.text;offset=r.next_offset;}while(offset!==null);
 assert.equal(text,full);assert.equal(digest(text),active.sha256);assert.deepEqual(f.read(),before,'reads never write delivery metadata');
 await assert.rejects(f.call(inspect,{ref:active,canonical_sha256:'0'.repeat(64),offset:0,length:10}),code('DEVELOPMENT_BUDGET_INPUT'));
 const middle=full.indexOf('😀')+1;await assert.rejects(f.call(inspect,{ref:active,canonical_sha256:active.sha256,offset:middle,length:2}),code('DEVELOPMENT_BUDGET_RANGE'));
});

test('supported setter permits a complete over100K SOURCE candidate through real isolated tests and exact synthetic independent QA',async t=>{
 const capability=sandboxCapability();if(!capability.supported){t.skip('Actual isolated development executor unavailable: '+capability.blocker);return;}
 let observation;const f=fixture(t,{beforeCleanup:()=>observation?.finish()}),prior=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(f.root,'fictional-host-data');t.after(()=>{if(prior===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=prior;});
 engine.bind(f.root,f.actor.session_id,'codex');withStore(f.root,db=>db.transaction('fixture.allow_source_test',s=>{s.paused=false;return s;}));
 const setting=await applied(f,400000);assert.equal(setting.status,'applied');
 const source='export const sum = values => 0;\n'+'// fictional selected complete source padding\n'.repeat(3500),changed=source.replace('=> 0','=> values.reduce((a,b)=>a+b,0)'),testSource="import test from 'node:test';import assert from 'node:assert/strict';import {sum} from './sum.mjs';test('exact generated sum',()=>assert.equal(sum([1,2,3]),6));\n";
 fs.writeFileSync(path.join(f.root,'sum.mjs'),source);const args={root:f.root,session_id:f.actor.session_id,epoch:1};
 const p=await engine.develop({...args,action:'plan',model_data_approved:true,read_paths:['sum.mjs'],write_paths:['sum.mjs','sum.test.mjs'],test_paths:['sum.test.mjs'],acceptance:'Exact complete generated sum and test pass independently reviewed source fixture',stop_conditions:'No network, installation, integration or actual provider/native execution',data_policy:'Only fictional selected source',source_instruction:instruction,max_attempts:1,timeout_ms:5000,max_output_bytes:10000,max_bytes:300000,expires_at:new Date(Date.now()+90000).toISOString()},'codex');
 await engine.develop({...args,action:'authorize',plan_id:p.id,scope_sha256:p.development.scope_sha256,model_data_approved:true,source_instruction:instruction},'codex');
 function queue(role,target){const key=id('job'),instance=id(role);withStore(f.root,db=>db.transaction('fixture.synthetic_assignment',s=>{const j={id:key,role,instance_id:instance,session_key:instance,host:'codex',native_id:null,epoch:1,status:'queued',task:'SOURCE fixture only; no genuine native proof',inputs:[],review_of:target?{id:target.id,revision:target.revision}:null,...(!target?{development_id:p.id}:{}),created_at:new Date().toISOString()};developmentAssignment(s,j,true,f.root);const c=assignmentContext(s,j);s.jobs[key]={...j,inputs:c.inputs,context_sha256:c.hash};s.sessions[instance]={instance_id:instance,role,host:'codex',native_id:null};return s;}));return key;}
 const files=[{path:'sum.mjs',content:changed},{path:'sum.test.mjs',content:testSource}],generation=queue('engineer');
 await work(f.root,generation,async()=>({native_id:'fictional-engineer-'+randomUUID(),text:JSON.stringify({content:'Synthetic generator DATA only',messages:[],notices:[],files})}));
 const generated=f.read(),candidate=generated.records[generated.jobs[generation].artifact_id];assert.equal(candidate?.status,'Submitted');assert.ok(candidate.development.generation.candidate_bytes>100000);assert.deepEqual(candidate.development.files,files);
 observation=observeOriginalDevelopmentWorker(f,p,candidate);
 const job=await engine.develop({...args,action:'run',plan_id:p.id,candidate_id:candidate.id},'codex');observation.assertJob(job);let receipt;const deadline=Date.now()+30000;
 while(Date.now()<deadline){const s=f.read();receipt=s.records[s.jobs[job.id]?.artifact_id];if(receipt)break;await new Promise(resolve=>setTimeout(resolve,50));}
 assert.ok(receipt,'original test worker must retain actual terminal receipt');assert.equal(receipt.development.result.status,'passed');assert.equal(receipt.development.result.tests_executed,true);
 await observation.finish(); // Physical direct-child close precedes QA and fixture removal.
 const qa=queue('qa',receipt);await work(f.root,qa,async(_host,_native,prompt)=>{assert.ok(prompt.includes(JSON.stringify(candidate.development.files)),'complete exact candidate reaches independent review');assert.ok(prompt.includes(candidate.development.candidate_sha256));assert.ok(prompt.includes(receipt.development.receipt_sha256));return {native_id:'fictional-independent-qa-'+randomUUID(),text:JSON.stringify({content:'Synthetic independent source assessment; actual runtime tests attributed to original controller',messages:[],notices:[],review:{verdict:'Pass',reason:'Exact full candidate/test/receipt inspected by SOURCE fixture',permitted_action:'accept_local_development',candidate_sha256:candidate.development.candidate_sha256,receipt_sha256:receipt.development.receipt_sha256,blockers:[]}})};});
 const state=f.read(),review=state.records[state.jobs[qa].artifact_id];assert.equal(review?.status,'Submitted');assert.notEqual(review.author_instance,candidate.author_instance);assert.notEqual(state.jobs[qa].native_id,state.jobs[generation].native_id);
 const accepted=await engine.develop({...args,action:'accept',plan_id:p.id,receipt_id:receipt.id,review_id:review.id,receipt_sha256:receipt.development.receipt_sha256},'codex');assert.equal(accepted.source_integrated,false);assert.equal(fs.readFileSync(path.join(f.root,'sum.mjs'),'utf8'),source);assert.equal(fs.existsSync(path.join(f.root,'sum.test.mjs')),false);
 assert.equal(f.read().records[p.id].development.scope.max_bytes,300000);assert.equal(f.read().records[p.id].development.attempts.length,1);
});

for(const [phase,commitNumber,status] of [['PREPARED',1,'prepared'],['STAGED',2,'staged'],['APPLIED',3,'applied']])test(`actual ${phase} COMMIT acknowledgement loss gives a truthful current-list recovery locator`,async t=>{
 const f=fixture(t),p=await planned(f);let commits=0,hits=0;const original=Object.assign(Error('Fictional original acknowledgement fault at '+f.config),{code:'EIO'});
 const undo=patch(t,DatabaseSync.prototype,'exec',old=>function(sql){const value=old.call(this,sql);if(sql==='COMMIT'&&++commits===commitNumber){hits++;throw original;}return value;});
 const held=await f.call(apply,{proposal_ref:p.proposal_ref,source_instruction:instruction});undo();assert.equal(hits,1,'actual native COMMIT completed before the original injected error');assert.equal(held.status,'held');assert.equal(held.code,'DEVELOPMENT_BUDGET_OUTCOME_UNCERTAIN');assert.equal(held.operation_id,p.proposal_ref.id);assert.equal(held.original_call_success_inferred,false);assert.equal(held.last_confirmed_ref_may_be_stale,true);assert.equal(held.diagnostic.code,'EIO');assert.equal(held.diagnostic.message_sha256,digest(original.message));assert.ok(!JSON.stringify(held).includes(f.root));assert.ok(JSON.stringify(held).includes('Reconcile only a current active intent'));
 const state=f.read(),stored=state[KEY].operations.find(o=>o.id===held.operation_id);assert.equal(stored.status,status);assert.equal(fs.existsSync(f.config),phase==='APPLIED');
 if(phase==='PREPARED')assert.equal(held.last_confirmed_ref,null);else await assert.rejects(f.call(inspect,{ref:held.last_confirmed_ref}),code('DEVELOPMENT_BUDGET_STALE_REFERENCE'));
 const page=await f.call(inspect),current=page.operations.find(o=>o.ref.id===held.operation_id);assert.equal(current.status,status);assert.equal((await f.call(inspect,{ref:current.ref})).operation.status,status);
 if(phase==='APPLIED'){assert.equal(page.active_intent,null);await assert.rejects(f.call(reconcile,{intent_ref:current.ref,source_instruction:instruction}),code('DEVELOPMENT_BUDGET_RECONCILE_REQUIRED'));assert.equal(developmentLimits(f.root).max_bytes,400000);}
 else {assert.equal(page.active_intent.id,held.operation_id);const observed=await f.call(reconcile,{intent_ref:page.active_intent,source_instruction:instruction});assert.equal(observed.observed_outcome,'not_applied');assert.equal(observed.repeated_file_action,false);assert.equal(fs.existsSync(f.config),false);}
 assert.equal(hits,1,'recovery never repeats apply or restore');
});
