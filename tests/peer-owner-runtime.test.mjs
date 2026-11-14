import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {FAMILIES,PeerLedger,canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {captureLegacyPinnedTeam,legacySourceId} from '../plugins/soloco/runtime/peers/legacy-origin.mjs';
import {Store,originalStoreExecutionCustodyFrom} from '../plugins/soloco/runtime/store.mjs';
import {freshInventoryStore} from './original-global-worker-inventory-fixture.mjs';
import {open as openCompany} from '../plugins/soloco/runtime/engine.mjs';
import {peerFixture} from './peer-fixture.mjs';
import {runWithMcpHostContext} from '../plugins/soloco/runtime/mcp-host-context.mjs';
import {peerOwnerToolSchema,validatePeerOwnerRequest,peerOwnerStorageKind,peerOwnerRuntimeAction,withPeerPublicStorage} from '../plugins/soloco/runtime/peer-owner-runtime.mjs';
import {logicalSQLState} from './peer-task-effects-fixture.mjs';
import {ownerGateFixture,disposeOwnerGateFixture,core} from './peer-owner-operating-gate-fixture.mjs';

// Real public runtime, actual source HOST-context capture and disposable SQLite.
// HOST metadata, primary human messages and native/origin/deployment seams are
// explicitly SYNTHETIC inputs. No engine hook, live company, provider/model,
// native review, actual owner switch, installation or adoption is exercised.
test.after(disposeOwnerGateFixture);
const OUT='11111111-1111-4111-8111-111111111111',IN='22222222-2222-4222-8222-222222222222',OTHER='33333333-3333-4333-8333-333333333333';
const actor=session_id=>({host:'codex',session_id,native_id:session_id});
const instruction='SYNTHETIC bounded public routing fixture only; no actual execution or transfer authorization.';
const hash=value=>createHash('sha256').update(value).digest('hex');
const code=expected=>error=>error?.code===expected;
const inputError=error=>typeof error?.code==='string'&&error.code.includes('INPUT');
const typedHold=error=>typeof error?.code==='string'&&/^(OWNER|PEER)_/.test(error.code);
const req=(f,action,options={})=>{
  const {who=OUT,epoch,input={},source_instruction,...rest}=options,selectedEpoch=Object.hasOwn(options,'epoch')?epoch:7;
  return {root:f.root,session_id:who,action,...(selectedEpoch===undefined?{}:{epoch:selectedEpoch}),...(source_instruction===undefined?{}:{source_instruction}),input,...rest};
};
const invoke=(args,action=peerOwnerRuntimeAction,meta={threadId:args.session_id,sessionId:args.session_id},host='codex')=>runWithMcpHostContext(host,meta,()=>action(args,host));
function fixture(t){
  const f=ownerGateFixture(t);f.root=fs.realpathSync(f.root);const previous=f.get('principals','founder');
  f.seed('principals','founder',{...previous.value,host:'codex',session_id:OUT,native_id:OUT,legacy_owner:{host:'codex',session_id:OUT,epoch:7}});
  f.outgoing=core.createPeerPublicOwnerLifecycle({ledger:f.ledger,actor:actor(OUT)});
  f.incoming=core.createPeerPublicOwnerLifecycle({ledger:f.ledger,actor:actor(IN)});
  return f;
}
function issued(f){
  f.pause();
  const quote=`SYNTHETIC complete founder message: transfer this fictional company from ${OUT} to ${IN}, using only the existing independent reviewer and original bounded authority.`;
  const decision=f.outgoing.recordTransferDecision({operation_id:f.op(),epoch:7,source_instruction:instruction,basis:'explicit',target:actor(IN),reviewer_principal_id:'reviewer',review_grant_id:'owner-review-grant',review_grant_generation:1,max_review_calls:2,expires_at:new Date(Date.now()+1800000).toISOString(),primary_human_message:{host:'codex',chat_id:OUT,turn_id:OTHER,message_id:'44444444-4444-4444-8444-444444444444',content_sha256:hash(quote),quote}});
  const intent=f.outgoing.issueTransferIntent({operation_id:f.op(),epoch:7,source_instruction:instruction,decision_ref:decision.decision_ref});
  return {decision,intent};
}
function pending(f){const transfer=issued(f),begun=f.incoming.beginFromIntent({operation_id:f.op(),epoch:7,source_instruction:instruction,intent_ref:transfer.intent.intent_ref});assert.equal(begun.status,'pending');return {...transfer,begun};}
async function unchanged(f,operation,predicate=typedHold){const before=logicalSQLState(f);await assert.rejects(operation,predicate);assert.deepEqual(logicalSQLState(f),before);}
function temp(t,prefix='soloco-owner-public-'){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),prefix)));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function database(t,sql){const root=temp(t);fs.mkdirSync(path.join(root,'.company'));const file=path.join(root,'.company','company.sqlite'),db=new DatabaseSync(file);db.exec(sql);db.close();return {root,file};}
const selector=(source,extra={})=>({family:source.family,id:source.id,revision:source.revision,sha256:source.sha256,...extra});

// AUTHORED_UNRUN Source controls for the actual canonical readonly Store.
// Fresh company.created proves only this fictional software history. It is
// not a Native issuer, actual company adoption or historical-prefix recovery.
test('legacy public read snapshot lends only its actual canonical readonly Store and current Source history',async t=>{
  const f=await freshInventoryStore(t),before=f.state();let loan,store;
  await withPeerPublicStorage(f.root,true,async where=>{
    assert.equal(where.kind,'legacy');assert.equal(where.db.isTransaction,false);
    assert.throws(()=>originalStoreExecutionCustodyFrom(where.db),code('ORIGINAL_EXECUTION_STORE_EXPIRED'));
    await Promise.resolve();
    const facts=where.readSnapshot(actual=>{
      store=actual;assert.equal(Object.getPrototypeOf(actual),Store.prototype);assert.equal(actual.readOnly,true);assert.equal(actual.db,where.db);
      loan=originalStoreExecutionCustodyFrom(actual.db);assert.equal(loan.store,actual);assert.equal(loan.mode,'read');assert.equal(loan.root,f.root);loan.assert();
      assert.equal(actual.readSnapshot(()=>originalStoreExecutionCustodyFrom(actual).scope),loan.scope);
      return f.producer.inspectOriginalLocalExecutionInventoryFrom(actual.db);
    });
    assert.equal(facts.protocol,'original-local-execution-inventory-v1');assert.equal(facts.admission_launch_coverage_complete,true);assert.equal(facts.cardinality_known,true);
    assert.equal(where.db.isTransaction,false);assert.throws(()=>loan.assert(),code('ORIGINAL_EXECUTION_STORE_EXPIRED'));
  });
  assert.equal(store.closed,true);assert.throws(()=>loan.assert(),code('ORIGINAL_EXECUTION_STORE_EXPIRED'));assert.deepEqual(f.state(),before);
});

test('a raw readonly connection to the same real file cannot substitute for original Store custody',async t=>{
  const f=await freshInventoryStore(t),before=f.state(),raw=new DatabaseSync(f.file,{readOnly:true});
  try{raw.exec('BEGIN');assert.throws(()=>f.producer.inspectOriginalLocalExecutionInventoryFrom(raw),code('ORIGINAL_EXECUTION_STORE_REQUIRED'));}
  finally{if(raw.isTransaction)raw.exec('ROLLBACK');raw.close();}
  await withPeerPublicStorage(f.root,true,where=>where.readSnapshot(store=>assert.equal(f.producer.inspectOriginalLocalExecutionInventoryFrom(store.db).cardinality_known,true)));
  assert.deepEqual(f.state(),before);
});

test('an expired original Store loan cannot revive in the next real snapshot on the same connection',async t=>{
  const f=await freshInventoryStore(t);let old;
  await withPeerPublicStorage(f.root,true,async where=>{
    where.readSnapshot(store=>{old=originalStoreExecutionCustodyFrom(store);old.assert();});
    await Promise.resolve();
    where.readSnapshot(store=>{const current=originalStoreExecutionCustodyFrom(store);assert.equal(current.db,old.db);assert.notEqual(current.scope,old.scope);assert.throws(()=>old.assert(),code('ORIGINAL_EXECUTION_STORE_EXPIRED'));current.assert();});
  });
  assert.throws(()=>old.assert(),code('ORIGINAL_EXECUTION_STORE_EXPIRED'));
});

test('readonly Store rejects every write entry before callback and remains OS readonly after public flag changes',async t=>{
  const f=await freshInventoryStore(t),before=f.state();let callbacks=0;
  await withPeerPublicStorage(f.root,true,where=>where.readSnapshot(store=>{
    Object.defineProperty(store,'readOnly',{value:false});
    for(const action of [()=>store.migrate(),()=>store.peerLayoutTransition(()=>{callbacks++;}),()=>store.appendUpgradeCall('not-an-attempt',{}),()=>store.selectedTransaction('not-a-writer',{},()=>{callbacks++;}),()=>store.transaction('not-a-writer',()=>{callbacks++;})])assert.throws(action,code('STORE_READONLY_WRITE_FORBIDDEN'));
    store.db.exec('PRAGMA query_only=OFF;');
    assert.throws(()=>store.db.exec('CREATE TABLE forbidden_readonly_write(value TEXT)'));
    assert.throws(()=>store.db.prepare('UPDATE company SET value=? WHERE id=1').run('{}'));
  }));
  assert.equal(callbacks,0);assert.deepEqual(f.state(),before);
});

test('readonly Store rejects a promise snapshot and expires its real loan before asynchronous continuation',async t=>{
  const f=await freshInventoryStore(t);let release,continuation,loan,finished=false;const gate=new Promise(resolve=>{release=resolve;});
  await withPeerPublicStorage(f.root,true,async where=>{
    assert.throws(()=>where.readSnapshot(store=>{
      loan=originalStoreExecutionCustodyFrom(store);
      continuation=(async()=>{await gate;assert.throws(()=>loan.assert(),code('ORIGINAL_EXECUTION_STORE_EXPIRED'));finished=true;})();return continuation;
    }),code('STORE_READONLY_SNAPSHOT_ASYNC'));
    assert.equal(where.db.isTransaction,false);assert.throws(()=>loan.assert(),code('ORIGINAL_EXECUTION_STORE_EXPIRED'));release();await continuation;
  });
  assert.equal(finished,true);
});

test('readonly public snapshot preserves original frozen provider Error and AggregateError identity',async t=>{
  const f=await freshInventoryStore(t),before=f.state(),member=Object.freeze(new TypeError('SYNTHETIC readonly provider member')),failure=Object.freeze(new AggregateError([member],'SYNTHETIC readonly provider failure',{cause:member}));let loan;
  await assert.rejects(withPeerPublicStorage(f.root,true,where=>where.readSnapshot(store=>{loan=originalStoreExecutionCustodyFrom(store);throw failure;})),error=>error===failure);
  assert.equal(failure.cause,member);assert.equal(failure.errors[0],member);assert.throws(()=>loan.assert(),code('ORIGINAL_EXECUTION_STORE_EXPIRED'));assert.deepEqual(f.state(),before);
});

test('readonly Store does not create absent storage or run legacy setup and migration SQL',async t=>{
  const absent=temp(t),dir=path.join(absent,'.company');fs.mkdirSync(dir);const names=fs.readdirSync(dir);
  assert.throws(()=>new Store(absent,false,{readOnly:true}));assert.throws(()=>new Store(absent,true,{readOnly:true}),code('STORE_READONLY_WRITE_FORBIDDEN'));assert.deepEqual(fs.readdirSync(dir),names);
  const legacy=database(t,"CREATE TABLE company(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO company VALUES(1,'{}'); CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT,type TEXT,value TEXT);"),before=hash(fs.readFileSync(legacy.file)),exec=DatabaseSync.prototype.exec,sql=[];
  DatabaseSync.prototype.exec=function(text,...args){sql.push(String(text));return Reflect.apply(exec,this,[text,...args]);};
  try{await withPeerPublicStorage(legacy.root,true,where=>where.readSnapshot(store=>{assert.equal(store.readOnly,true);assert.equal(store.storageInfo().migration_required,true);assert.equal(store.db.prepare('SELECT count(*) AS n FROM company').get().n,1);}));}
  finally{DatabaseSync.prototype.exec=exec;}
  assert.equal(sql.some(text=>/CREATE|ALTER|INSERT|UPDATE|DELETE|journal_mode|synchronous\s*=/i.test(text)),false);assert.equal(hash(fs.readFileSync(legacy.file)),before);
});

test('legacy public snapshot rechecks original pathname after an await before lending Store custody',async t=>{
  const f=await freshInventoryStore(t),file=f.file,held=path.join(f.root,'.company','held-original.sqlite'),other=path.join(f.root,'.company','replacement.sqlite');
  const replacement=new DatabaseSync(other);replacement.exec('CREATE TABLE unrelated(value TEXT)');replacement.close();let callbacks=0;
  await withPeerPublicStorage(f.root,true,async where=>{
    await Promise.resolve();fs.renameSync(file,held);fs.renameSync(other,file);
    try{assert.throws(()=>where.readSnapshot(()=>{callbacks++;}),code('OWNER_STORAGE_CHANGED'));assert.equal(where.db.isTransaction,false);}
    finally{fs.renameSync(file,other);fs.renameSync(held,file);}
  });
  assert.equal(callbacks,0);
});

test('public schema and pure request validation accept closed DATA without retaining caller objects',()=>{
  assert.equal(peerOwnerToolSchema.name,'company_owner');assert.equal(peerOwnerToolSchema.inputSchema.additionalProperties,false);assert.equal(peerOwnerToolSchema.inputSchema.properties.input.additionalProperties,false);
  const args={root:'/fictional-not-existing-owner-root',session_id:OUT,action:'context_inspect',epoch:7,input:{family:'tasks',limit:2}};
  const result=validatePeerOwnerRequest(args,'codex');assert.deepEqual(result,args);assert.notEqual(result,args);assert.notEqual(result.input,args.input);
  const bad=[{actor:actor(OUT)},{native_id:OUT},{provider:{}},{proof:{qualified:true}},{ready:true},{epoch:0},{input:{family:'not-a-peer-family'}},{input:{family:'tasks',limit:51}},{input:{family:'tasks',path:['result']}}];
  for(const patch of bad)assert.throws(()=>validatePeerOwnerRequest({...args,...patch},'codex'),inputError);
  let observed=0;const getter={...args};Object.defineProperty(getter,'input',{enumerable:true,get(){observed++;throw Error('Getter must not run');}});
  assert.throws(()=>validatePeerOwnerRequest(getter,'codex'),inputError);
  const proxy=new Proxy(args.input,{getOwnPropertyDescriptor(){observed++;throw Error('Proxy trap must not run');}});
  assert.throws(()=>validatePeerOwnerRequest({...args,input:proxy},'codex'),inputError);assert.equal(observed,0);
  assert.throws(()=>validatePeerOwnerRequest({...args,[Symbol('provider')]:true},'codex'),inputError);
});

test('missing, descendant and mismatched HOST callers hold before any company storage exists',async t=>{
  const root=temp(t),args={root,session_id:OUT,action:'status',input:{}};
  await assert.rejects(async()=>peerOwnerRuntimeAction(args,'codex'),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
  await assert.rejects(invoke(args,peerOwnerRuntimeAction,{threadId:OTHER,sessionId:OUT}),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
  await assert.rejects(invoke(args,peerOwnerRuntimeAction,{threadId:IN,sessionId:IN}),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
  await assert.rejects(invoke(args,peerOwnerRuntimeAction,{threadId:OUT,sessionId:OUT},'claude'),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
  assert.deepEqual(fs.readdirSync(root),[]);
});

test('layout classification preserves absent and known legacy storage and never silently classifies malformed peer state as legacy',t=>{
  const root=temp(t);assert.equal(peerOwnerStorageKind(root),null);assert.deepEqual(fs.readdirSync(root),[]);
  const legacy=database(t,'CREATE TABLE company_layout(id INTEGER PRIMARY KEY,version INTEGER); INSERT INTO company_layout VALUES(1,4); CREATE TABLE company(id INTEGER PRIMARY KEY,value TEXT); CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT,type TEXT,value TEXT);');
  const before=hash(fs.readFileSync(legacy.file));assert.equal(peerOwnerStorageKind(legacy.root),null);assert.equal(hash(fs.readFileSync(legacy.file)),before);
  assert.equal(fs.existsSync(legacy.file+'-wal'),false);assert.equal(fs.existsSync(legacy.file+'-shm'),false);
  for(const sql of [
    'CREATE TABLE unrelated(value TEXT);',
    'CREATE TABLE company_layout(id INTEGER PRIMARY KEY,version INTEGER); INSERT INTO company_layout VALUES(1,99);',
    'CREATE TABLE company_layout(id INTEGER PRIMARY KEY,version INTEGER); INSERT INTO company_layout VALUES(1,5);',
    'CREATE TABLE peer_meta(id INTEGER PRIMARY KEY,protocol TEXT); INSERT INTO peer_meta VALUES(1,\'peer-cos-v1\');',
    'CREATE TABLE company_layout(id INTEGER PRIMARY KEY,version INTEGER); INSERT INTO company_layout VALUES(1,4); CREATE TABLE company(id INTEGER PRIMARY KEY,value TEXT); CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT,type TEXT,value TEXT); CREATE TABLE peer_slots(id TEXT);'
  ]){const broken=database(t,sql),original=hash(fs.readFileSync(broken.file));assert.throws(()=>peerOwnerStorageKind(broken.root),typedHold);assert.equal(hash(fs.readFileSync(broken.file)),original);}
  for(const suffix of ['-wal','-shm']){
    const orphan=temp(t);fs.mkdirSync(path.join(orphan,'.company'));const file=path.join(orphan,'.company','company.sqlite'+suffix);fs.writeFileSync(file,'SYNTHETIC retained orphan sidecar');
    assert.throws(()=>peerOwnerStorageKind(orphan),code('OWNER_STORAGE_LAYOUT'));assert.equal(fs.readFileSync(file,'utf8'),'SYNTHETIC retained orphan sidecar');assert.equal(fs.existsSync(path.join(orphan,'.company','company.sqlite')),false);
  }
});

test('linked existing peer storage is held without following it or changing either directory',t=>{
  const f=fixture(t),root=temp(t);fs.symlinkSync(path.join(f.root,'.company'),path.join(root,'.company'));
  const before=logicalSQLState(f);assert.throws(()=>peerOwnerStorageKind(root),typedHold);assert.deepEqual(logicalSQLState(f),before);assert(fs.lstatSync(path.join(root,'.company')).isSymbolicLink());
});

// Independent root counters, retained as real integration regressions. Kind
// discovery must preserve legacy folder semantics without reading private P1
// state before the existing engine caller gate.
test('existing legacy root aliases keep legacy behavior while peer aliases retain the strict source policy',t=>{
  const root=temp(t,'soloco-legacy-probe-compat-');
  const store=new Store(root,true);store.db.close();
  const canonicalRoot=fs.realpathSync(root),links=temp(t,'soloco-root-aliases-'),alias=path.join(links,'legacy-root-alias');fs.symlinkSync(canonicalRoot,alias,'dir');
  assert.equal(peerOwnerStorageKind(canonicalRoot),null);
  assert.equal(peerOwnerStorageKind(alias),null,'An existing legacy route must remain on its original legacy path');
  const macAlias=canonicalRoot.replace(/^\/private\/var\//,'/var/');if(macAlias!==canonicalRoot)assert.equal(peerOwnerStorageKind(macAlias),null);
  const f=fixture(t),peerAlias=path.join(links,'peer-root-alias');fs.symlinkSync(f.root,peerAlias,'dir');assert.throws(()=>peerOwnerStorageKind(peerAlias),typedHold);
});

test('layout-only discovery does not read private peer rows before the actual MCP caller gate',async t=>{
  const f=peerFixture();t.after(()=>f.close());let peerReads=0;
  const original=PeerLedger.prototype.read;
  PeerLedger.prototype.read=function(fn){peerReads++;return original.call(this,fn);};
  t.after(()=>{PeerLedger.prototype.read=original;});
  let error;try{await openCompany({root:fs.realpathSync(f.root),session_id:'11111111-1111-1111-1111-111111111111'},'codex');}catch(e){error=e;}
  assert(error instanceof Error,'Missing actual HOST metadata must Hold');
  assert.equal(peerReads,0,'The unqualified layout probe may inspect schema, not canonical peer control rows');
});

test('a directory swap after opening original descriptors cannot produce a clean peer layout result',t=>{
  const f=fixture(t),directory=path.join(f.root,'.company'),held=path.join(f.root,'.company-held'),file=path.join(directory,'company.sqlite'),before=logicalSQLState(f),open=fs.openSync;let swapped=0;
  fs.openSync=function(name,...rest){const fd=Reflect.apply(open,this,[name,...rest]);if(name===file&&swapped===0){fs.renameSync(directory,held);fs.mkdirSync(directory);swapped++;}return fd;};
  try{assert.throws(()=>peerOwnerStorageKind(f.root),code('OWNER_STORAGE_CHANGED'));}
  finally{fs.openSync=open;if(swapped){fs.rmSync(directory,{recursive:true,force:true});fs.renameSync(held,directory);}}
  assert.equal(swapped,1,'the real file-open boundary was exercised');assert.deepEqual(logicalSQLState(f),before);
});

// The original independent ABA counter is retained unchanged under /private/tmp.
// These two fully valid, CLOSED SQLite fixtures differ in a real current value;
// B is selected only in the SQLite-open window and A is restored before later
// named-path checks. Pinned-fd identity alone cannot distinguish that sequence.
function closedStorageFixture(t,paused){
  const f=peerFixture({control:{paused},principals:{founder:{native_id:OUT,legacy_owner:{host:'codex',session_id:OUT,epoch:7}}}}),roles={cos:{mission:'SYNTHETIC source fixture'}},state={id:f.ledger.company_id,plugin_version:'fixture',runtime_version:'fixture',governance:'Fictional governance.',cos_instructions:'Fictional instructions.',roles,owner:{host:'codex',session_id:OUT,epoch:7}};
  state.governance_sha256=hash(state.governance);state.team_sha256=hash(JSON.stringify([state.plugin_version,state.governance,roles,state.cos_instructions]));
  const sources=['plugin_version','governance','roles','cos_instructions'].map((key,position)=>{const bytes=JSON.stringify(state[key]),source={family:'root',key,position,encoding:'json',sha256:hash(bytes)};source.source_id=legacySourceId(source);f.ledger.db.prepare('INSERT INTO immutable_values VALUES(?,?)').run(source.sha256,bytes);return source;});
  const cut=hash('SYNTHETIC source'),bundle=captureLegacyPinnedTeam(state,sources,cut);
  f.ledger.write('fixture.pins','founder',tx=>{const p=tx.put('control','pinned-team',{protocol:'peer-pinned-team-record-v1',bundle,bundle_sha256:peerDigest(bundle)},0),c=tx.get('control','company');tx.put('control','company',{...c.value,pinned_team:{family:'control',id:p.id,revision:p.revision,sha256:p.sha256},legacy_source_cut_sha256:cut,team_sha256:state.team_sha256,governance_sha256:state.governance_sha256},c.revision);});
  const root=f.ledger.root,file=f.ledger.file;f.ledger.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');f.ledger.close();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,file};
}
function closedSQLState(file){const db=new DatabaseSync(file,{readOnly:true});try{return logicalSQLState({ledger:{db}});}finally{db.close();}}

test('SQLite pathname ABA during open cannot serve a valid replacement after the original path is restored',async t=>{
  const a=closedStorageFixture(t,false),b=closedStorageFixture(t,true),directory=path.dirname(a.file),held=path.join(directory,'held-original.sqlite'),other=path.join(directory,'swap-source.sqlite');fs.copyFileSync(b.file,other);
  const args={root:a.root,session_id:OUT,action:'status'},meta={threadId:OUT,sessionId:OUT};
  assert.equal((await invoke(args,peerOwnerRuntimeAction,meta)).paused,false);assert.equal((await invoke({root:b.root,session_id:OUT,action:'status'},peerOwnerRuntimeAction,meta)).paused,true);
  const before=closedSQLState(a.file),names=fs.readdirSync(directory).sort(),originalBytes=hash(fs.readFileSync(a.file)),replacementBytes=hash(fs.readFileSync(other)),original=fs.lstatSync,move=fs.renameSync;let attacked=false,swapped=false,restored=0;
  function restore(){if(swapped){move(a.file,other);move(held,a.file);swapped=false;restored++;}}
  fs.lstatSync=function(file,...rest){
    if(swapped&&file===a.root)restore();
    const result=original.call(fs,file,...rest),stack=new Error().stack;
    if(!attacked&&file===a.file&&stack.includes('at withLedger (')&&!stack.includes('at storagePreflight (')&&!stack.includes('at pinned (')&&!stack.includes('at location (')){move(a.file,held);move(other,a.file);swapped=true;attacked=true;}
    return result;
  };
  let error,result;try{result=await invoke(args,peerOwnerRuntimeAction,meta);}catch(value){error=value;}finally{fs.lstatSync=original;restore();}
  assert.equal(attacked,true,'the independent counter concrete source-open race must run');assert.equal(restored,1);assert(error instanceof Error,'ambiguous binding cannot return '+JSON.stringify({paused:result?.paused}));assert.equal(error.code,'OWNER_STORAGE_CHANGED');
  assert.equal(hash(fs.readFileSync(a.file)),originalBytes);assert.equal(hash(fs.readFileSync(other)),replacementBytes);assert.equal(fs.existsSync(held),false);assert.deepEqual(closedSQLState(a.file),before);assert.deepEqual(fs.readdirSync(directory).sort(),names);
});

test('whole company directory ABA during open cannot serve another valid source after restoration',async t=>{
  const a=closedStorageFixture(t,false),b=closedStorageFixture(t,true),directory=path.dirname(a.file),held=path.join(a.root,'.company-held-original'),other=path.join(a.root,'.company-swap-source');fs.cpSync(path.dirname(b.file),other,{recursive:true});
  const args={root:a.root,session_id:OUT,action:'status'},meta={threadId:OUT,sessionId:OUT};assert.equal((await invoke(args,peerOwnerRuntimeAction,meta)).paused,false);
  const before=closedSQLState(a.file),names=fs.readdirSync(a.root).sort(),originalBytes=hash(fs.readFileSync(a.file)),replacementBytes=hash(fs.readFileSync(path.join(other,'company.sqlite'))),original=fs.lstatSync,move=fs.renameSync,fd=fs.openSync(a.file,fs.constants.O_RDONLY),fileVersion=fs.fstatSync(fd,{bigint:true}),rootVersion=fs.statSync(a.root,{bigint:true});let attacked=false,swapped=false,restored=0;
  function restore(){if(swapped){move(directory,other);move(held,directory);swapped=false;restored++;}}
  fs.lstatSync=function(file,...rest){
    if(swapped&&file===a.root)restore();
    const result=original.call(fs,file,...rest),stack=new Error().stack;
    if(!attacked&&file===a.file&&stack.includes('at withLedger (')&&!stack.includes('at storagePreflight (')&&!stack.includes('at pinned (')&&!stack.includes('at location (')){move(directory,held);move(other,directory);swapped=true;attacked=true;}
    return result;
  };
  let error,result,afterFile;try{result=await invoke(args,peerOwnerRuntimeAction,meta);}catch(value){error=value;}finally{fs.lstatSync=original;restore();afterFile=fs.fstatSync(fd,{bigint:true});fs.closeSync(fd);}
  assert.equal(attacked,true,'the whole-directory source-open race must run');assert.equal(restored,1);
  for(const key of ['dev','ino','size','mtimeNs','ctimeNs','nlink'])assert.equal(afterFile[key],fileVersion[key],`a directory rename preserves the original MAIN fd ${key}`);
  assert.notEqual(fs.statSync(a.root,{bigint:true}).ctimeNs,rootVersion.ctimeNs,'this concrete filesystem exposes the changed original ROOT fd version');
  assert(error instanceof Error,'directory ABA cannot return '+JSON.stringify({paused:result?.paused,company_id:result?.company_id}));assert.equal(error.code,'OWNER_STORAGE_CHANGED');
  assert.equal(hash(fs.readFileSync(a.file)),originalBytes);assert.equal(hash(fs.readFileSync(path.join(other,'company.sqlite'))),replacementBytes);assert.equal(fs.existsSync(held),false);assert.deepEqual(closedSQLState(a.file),before);assert.deepEqual(fs.readdirSync(a.root).sort(),names);
});

test('ordinary owned WAL writes and a later checkpoint remain valid across fresh public operations',async t=>{
  const f=fixture(t);assert.equal((await invoke(req(f,'status',{epoch:undefined}))).paused,false);
  const result=await invoke(req(f,'pause',{source_instruction:instruction,input:{operation_id:f.op()}}));assert.equal(result.paused,true);
  const checkpoint=f.ledger.db.prepare('PRAGMA wal_checkpoint(FULL)').get();assert.equal(checkpoint.busy,0);assert(checkpoint.log>0);assert.equal(checkpoint.checkpointed,checkpoint.log);
  assert.equal((await invoke(req(f,'status',{epoch:undefined}))).paused,true);assert.equal((await invoke(req(f,'pinned_inspect'))).sources.length,4);
  assert.equal(f.get('grants','owner-review-grant').value.used_model_calls,0);assert.equal(f.get('control','usage'),null);
});

test('current-owner status and full pinned instructions are read-only without loading any review provider',async t=>{
  const f=fixture(t),before=logicalSQLState(f);assert.equal(peerOwnerStorageKind(f.root),'peer');
  const status=await invoke(req(f,'status',{epoch:undefined}));assert.equal(status.protocol,'peer-public-owner-runtime-v1');assert.equal(status.company_id,f.ledger.company_id);assert.deepEqual(status.owner,{host:'codex',session_id:OUT,epoch:7});assert.equal(status.caller_relation,'owner');assert.equal(status.private_context_available,true);
  const pins=await invoke(req(f,'pinned_inspect'));
  assert.deepEqual(pins.sources.map(s=>s.part),['plugin_version','governance','roles','cos_instructions']);
  for(const source of pins.sources){let text='',offset=0;for(let i=0;i<100;i++){
    const part=await invoke(req(f,'pinned_read',{input:{part:source.part,reference:pins.reference,sha256:source.sha256,offset,length:Math.min(4096,source.characters-offset)}}));text+=part.text;if(part.complete)break;assert(part.next_offset>offset);offset=part.next_offset;
  }assert.equal(text.length,source.characters);assert.equal(hash(text),source.sha256);}
  assert.deepEqual(logicalSQLState(f),before);assert.equal(fs.existsSync(path.join(f.root,'.company','peer-execution')),false);
});

test('current owner can retrieve full canonical values from all 17 families while pages remain metadata only',async t=>{
  const f=fixture(t),expected=new Map();
  f.ledger.write('SYNTHETIC-public-context-fixture','founder',tx=>{for(const family of FAMILIES){const body={kind:'SYNTHETIC-independent-source',status:'current',scope:'public-runtime-test',content:'UNABRIDGED α😀\\"'.repeat(300),unknown_extension:{preserved:true,nested:[1,{source:family}]}};tx.put(family,'public-runtime-source',body,0);expected.set(family,body);}});
  const before=logicalSQLState(f);
  for(const family of FAMILIES){
    const page=await invoke(req(f,'context_inspect',{input:{family,scope:'public-runtime-test',limit:2}}));assert.equal(page.metadata_only,true);assert.equal(page.total,1);assert.equal(page.items.length,1);assert.equal(page.items[0].value,undefined);assert(!JSON.stringify(page).includes(expected.get(family).content));
    const source=page.items[0].source;let offset=0,text='';
    for(let i=0;i<100;i++){const part=await invoke(req(f,'context_read',{input:selector(source,{offset,length:4096})}));assert.equal(part.offset,offset);assert(part.length<=4096);text+=part.text;if(part.complete)break;assert(part.next_offset>offset);offset=part.next_offset;}
    assert.equal(text,canonical(expected.get(family)));assert.equal(peerDigest(JSON.parse(text)),source.sha256);
  }
  assert.equal(FAMILIES.length,17);assert.deepEqual(logicalSQLState(f),before);
});

test('private context reads reject a stale current hash instead of serving an immutable historical alias',async t=>{
  const f=fixture(t);f.seed('tasks','runtime-drift',{status:'current',scope:'runtime-drift',retained_unknown:{fact:1}});
  const page=await invoke(req(f,'context_inspect',{input:{family:'tasks',scope:'runtime-drift'}})),source=page.items[0].source;
  f.seed('tasks','runtime-drift',{status:'current',scope:'runtime-drift',retained_unknown:{fact:2}});
  await unchanged(f,()=>invoke(req(f,'context_read',{input:selector(source)})),code('PEER_CONTEXT_CHANGED'));
});

test('a real pre-begin incoming HOST caller gets pins and minimal status but cannot read generic company context',async t=>{
  const f=fixture(t),{intent}=issued(f),before=logicalSQLState(f);
  const status=await invoke(req(f,'status',{who:IN,epoch:undefined}));assert.equal(status.private_context_available,false);assert.equal(status.owner.session_id,OUT);
  assert.equal((await invoke(req(f,'pinned_inspect',{who:IN}))).sources.length,4);
  const header=await invoke(req(f,'inspect_transfer_intent',{who:IN,input:{intent_ref:intent.intent_ref}}));assert.equal(header.status,'issued');
  const part=await invoke(req(f,'read_transfer_intent',{who:IN,input:{intent_ref:intent.intent_ref,sha256:header.sha256,offset:0,length:Math.min(1024,header.total_characters)}}));assert.equal(part.sha256,header.sha256);assert(part.length<=1024);
  await unchanged(f,()=>invoke(req(f,'context_inspect',{who:IN,input:{family:'tasks'}})));
  await unchanged(f,()=>invoke(req(f,'context_read',{who:IN,input:{family:'control',id:'company',revision:1,sha256:'0'.repeat(64)}})));
  assert.deepEqual(logicalSQLState(f),before);
});

test('genuine typed pending custody can read current context and credit bounded complete subject ranges',async t=>{
  const f=fixture(t);pending(f);const before=logicalSQLState(f);
  const status=await invoke(req(f,'status',{who:IN,epoch:undefined}));assert.equal(status.owner.session_id,IN);assert.equal(status.owner.epoch,8);assert.equal(status.paused,true);assert.equal(status.private_context_available,true);
  const page=await invoke(req(f,'context_inspect',{who:IN,epoch:8,input:{family:'work_items',limit:2}}));assert(page.total>0);assert.deepEqual(logicalSQLState(f),before,'context reads do not create custody delivery credit');
  const info=f.incoming.inspect({epoch:8}),length=Math.min(1024,info.total_characters);
  await unchanged(f,()=>invoke(req(f,'read_subject',{who:IN,epoch:8,input:{operation_id:f.op(),sha256:info.subject_sha256,offset:0,length:1025}})),inputError);
  const result=await invoke(req(f,'read_subject',{who:IN,epoch:8,input:{operation_id:f.op(),sha256:info.subject_sha256,offset:0,length}}));assert.equal(result.sha256,info.subject_sha256);assert.equal(result.length,length);assert.equal(result.offset,0);
  const after=logicalSQLState(f);assert.notDeepEqual(after,before);assert.equal(f.get('principals','founder').value.status,'pending');assert.equal(f.get('grants','owner-review-grant').value.used_model_calls,0);assert.equal(f.get('control','usage'),null);
  await unchanged(f,()=>invoke(req(f,'context_inspect',{who:OUT,epoch:7,input:{family:'tasks'}})));
});

test('public submit before complete source delivery retains the original delivery-incomplete Hold',async t=>{
  const f=fixture(t);pending(f);const info=f.incoming.inspect({epoch:8});
  await unchanged(f,()=>invoke(req(f,'submit',{who:IN,epoch:8,source_instruction:instruction,input:{operation_id:f.op(),subject_sha256:info.subject_sha256,content:'SYNTHETIC premature reconstruction cannot replace full original subject delivery.'}})),code('OWNER_DELIVERY_INCOMPLETE'));
});

test('complete credited public subject reads support a useful public reconstruction submission',async t=>{
  const f=fixture(t);pending(f);const info=f.incoming.inspect({epoch:8});let text='';
  for(let offset=0;offset<info.total_characters;offset+=1024){const part=await invoke(req(f,'read_subject',{who:IN,epoch:8,input:{operation_id:f.op(),sha256:info.subject_sha256,offset,length:Math.min(1024,info.total_characters-offset)}}));text+=part.text;}
  assert.equal(peerDigest(JSON.parse(text)),info.subject_sha256);
  const result=await invoke(req(f,'submit',{who:IN,epoch:8,source_instruction:instruction,input:{operation_id:f.op(),subject_sha256:info.subject_sha256,content:'SYNTHETIC incoming reconstruction preserves all complete original records, typed target intent, founder instruction provenance, unresolved obligations and original review limits.'}}));
  assert.equal(result.status,'reconstructed');assert(result.reconstruction_ref);assert.equal(f.incoming.inspect({epoch:8}).status,'reconstructed');
  assert.equal(f.get('grants','owner-review-grant').value.used_model_calls,0);assert.equal(f.get('control','usage'),null);
});

test('public begin preserves the original outgoing owner and spend when the fixed native support is missing',async t=>{
  const f=fixture(t),{intent}=issued(f);
  await unchanged(f,()=>invoke(req(f,'begin',{who:IN,source_instruction:instruction,input:{operation_id:f.op(),intent_ref:intent.intent_ref}})),code('OWNER_REVIEW_SOURCE_UNAVAILABLE'));
  assert.equal(f.get('principals','founder').value.legacy_owner.session_id,OUT);assert.equal(f.get('principals','founder').value.status,'active');assert.equal(f.get('work_items',intent.intent_ref.id).value.status,'issued');
  assert.equal(f.get('grants','owner-review-grant').value.used_model_calls,0);assert.equal(f.get('control','usage'),null);
});

// Only this source-copy fixture replaces the fixed high-level launch MODULE
// location. Public inputs remain unchanged; no callback/provider/tool flag can
// choose it. Missing/throwing modules run no native or model implementation.
async function runtimeWithLaunch(t,moduleText){
  const directory=temp(t,'soloco-owner-launch-routing-'),runtimeFile=fileURLToPath(new URL('../plugins/soloco/runtime/peer-owner-runtime.mjs',import.meta.url)),runtimeDirectory=path.dirname(runtimeFile),target=path.join(directory,'maintenance-launch.mjs');
  if(moduleText!==null)fs.writeFileSync(target,moduleText);
  let source=fs.readFileSync(runtimeFile,'utf8');
  const marker="new URL('./peers/maintenance-launch.mjs',import.meta.url)";
  assert(source.includes(marker),'the source-owned high-level launch seam must remain explicit');
  source=source.replace(marker,`new URL(${JSON.stringify(pathToFileURL(target).href)})`);
  source=source.replace(/(['"])(\.{1,2}\/[^'"]+\.mjs)\1/g,(_match,_quote,relative)=>JSON.stringify(pathToFileURL(path.resolve(runtimeDirectory,relative)).href));
  const file=path.join(directory,'runtime.mjs');fs.writeFileSync(file,source);return import(pathToFileURL(file).href);
}

test('missing fixed high-level review launcher holds before admission, slot reservation or accounting charge',async t=>{
  const f=fixture(t);pending(f);f.reconstruct();const runtime=await runtimeWithLaunch(t,null);
  await unchanged(f,()=>invoke(req(f,'review',{who:IN,epoch:8,source_instruction:instruction,input:{operation_id:f.op()}}),runtime.peerOwnerRuntimeAction),code('OWNER_REVIEW_LAUNCH_UNAVAILABLE'));
  assert.equal(f.incoming.inspect({epoch:8}).used_review_calls,0);assert.equal(f.get('grants','owner-review-grant').value.used_model_calls,0);assert.equal(f.get('control','usage'),null);
});

test('an existing launch module with a missing transitive dependency is not relabeled as an unavailable launch module',async t=>{
  const f=fixture(t);pending(f);f.reconstruct();const runtime=await runtimeWithLaunch(t,"import './SYNTHETIC-missing-transitive-dependency.mjs';\n");
  await unchanged(f,()=>invoke(req(f,'review',{who:IN,epoch:8,source_instruction:instruction,input:{operation_id:f.op()}}),runtime.peerOwnerRuntimeAction),error=>error?.code==='ERR_MODULE_NOT_FOUND'&&String(error.url).includes('SYNTHETIC-missing-transitive-dependency.mjs'));
  assert.equal(f.get('grants','owner-review-grant').value.used_model_calls,0);assert.equal(f.get('control','usage'),null);
});

test('an existing fixed launch module retains the original grouped provider failure and causes',async t=>{
  const f=fixture(t);pending(f);f.reconstruct();const key=Symbol.for('soloco-owner-runtime-SYNTHETIC-launch-error'),cause=Error('Original SYNTHETIC launcher cause.'),member=Error('Original SYNTHETIC grouped launcher member.');
  const failure=Object.assign(new AggregateError([member],'Original SYNTHETIC launcher failure.',{cause}),{code:'ERR_MODULE_NOT_FOUND'});globalThis[key]=failure;t.after(()=>delete globalThis[key]);
  const runtime=await runtimeWithLaunch(t,"throw globalThis[Symbol.for('soloco-owner-runtime-SYNTHETIC-launch-error')];\n");
  await unchanged(f,()=>invoke(req(f,'review',{who:IN,epoch:8,source_instruction:instruction,input:{operation_id:f.op()}}),runtime.peerOwnerRuntimeAction),error=>{assert.equal(error,failure);assert.equal(error.cause,cause);assert.equal(error.errors[0],member);return true;});
  assert.equal(f.get('grants','owner-review-grant').value.used_model_calls,0);assert.equal(f.get('control','usage'),null);
});


// Additive fresh-purpose public SOURCE controls, AUTHORED_UNRUN. The public
// schema stays unchanged; only exact original grant/decision/intent records
// select the fixed new constructor. Native/provider execution remains unproved.
const FRESH_OWNER_ACTION='owner/handover-fresh-review-v1';
async function publicFreshTransfer(t,{actions=[FRESH_OWNER_ACTION],runtime=peerOwnerRuntimeAction}={}){
 const f=fixture(t),grant_id='public-fresh-owner-grant';
 f.run('founder','grant/create',{grant_id,to_principal_id:'reviewer',scope:'*',actions,resources:[],expires_at:new Date(Date.now()+3600000).toISOString(),max_model_calls:3,source_instruction:instruction});f.pause();
 const quote='SYNTHETIC exact founder instruction for a new bounded fresh owner review; retain all original limits and obligations.';
 const input={operation_id:f.op(),target:actor(IN),reviewer_principal_id:'reviewer',review_grant_id:grant_id,review_grant_generation:1,expires_at:new Date(Date.now()+1800000).toISOString(),max_review_calls:2,primary_human_message:{host:'codex',chat_id:OUT,turn_id:OTHER,message_id:'55555555-5555-4555-8555-555555555555',content_sha256:hash(quote),quote},basis:'explicit'};
 const decision=await invoke(req(f,'record_transfer_decision',{source_instruction:instruction,input}),runtime);
 const intent=await invoke(req(f,'issue_transfer_intent',{source_instruction:instruction,input:{operation_id:f.op(),decision_ref:decision.decision_ref}}),runtime);
 return {f,decision,intent,input,grant_id};
}

// This fixture relocates only the fixed owner SOURCE module and high-level
// launch seam. Its wire plan is a synthetic private issuer, never Native proof.
async function runtimeWithFreshOwnerSource(t){
 const directory=temp(t,'soloco-public-fresh-owner-source-'),runtimeFile=fileURLToPath(new URL('../plugins/soloco/runtime/peer-owner-runtime.mjs',import.meta.url)),runtimeDirectory=path.dirname(runtimeFile),ownerFile=path.join(runtimeDirectory,'peers','owner-handover.mjs'),ownerDirectory=path.dirname(ownerFile),deploymentFile=path.join(directory,'deployment.mjs'),copy=path.join(directory,'owner.mjs'),launcher=path.join(directory,'maintenance-launch.mjs');
 const pool=pathToFileURL(path.join(ownerDirectory,'owner-context-pool.mjs')).href;
 fs.writeFileSync(deploymentFile,String.raw`import {createHash} from 'node:crypto';
import {PEER_OWNER_CONTEXT_POOL_INSTRUCTION} from ${JSON.stringify(pool)};
const hash=v=>createHash('sha256').update(v).digest('hex'),plans=new WeakMap();
export const OWNER_MAINTENANCE_FRESH_INSTRUCTION='SYNTHETIC public fresh owner wire. '+PEER_OWNER_CONTEXT_POOL_INSTRUCTION;
export function inspectOriginalOwnerMaintenanceFreshSupport(){return {protocol:'peer-owner-maintenance-fresh-purpose-v1',context_protocol:'peer-owner-maintenance-assignment-v1',creation_mode:'fresh-original-protected-thread',bridge_sha256:'b'.repeat(64),synthetic_source_test:true};}
export function preflightOriginalOwnerMaintenanceFreshContext(text){const body=JSON.parse(text),input=OWNER_MAINTENANCE_FRESH_INSTRUCTION+'\n'+text,frame=JSON.stringify({SYNTHETIC:true,input}),rpc=JSON.stringify({id:1,method:'turn/start',params:{threadId:'ffffffff-ffff-7fff-bfff-ffffffffffff',input}}),plan=Object.freeze(Object.create(null));plans.set(plan,{protocol:'peer-owner-maintenance-fresh-first-rpc-v1',context_sha256:hash(text),payload_sha256:hash(text),native_identity:'UNOBSERVED_GEOMETRY_ONLY',instruction_sha256:hash(OWNER_MAINTENANCE_FRESH_INSTRUCTION),frame_sha256:hash(frame),recipe_sha256:hash('SYNTHETIC public fresh owner recipe'),frame_bytes:100000,wire_bytes:4000000,context_utf8_bytes:Buffer.byteLength(text),policy_maximum_context_bytes:body.authority.peer_policy.max_context_bytes,input_utf8_bytes:Buffer.byteLength(input),whole_rpc_utf8_bytes:Buffer.byteLength(rpc)});return plan;}
export function inspectOriginalOwnerMaintenanceFreshPreflight(plan){if(!plans.has(plan))throw Error('SYNTHETIC original fresh wire plan required');return structuredClone(plans.get(plan));}
`);
 let ownerSource=fs.readFileSync(ownerFile,'utf8');
 ownerSource=ownerSource.replace(/(['"])(\.\/[^'"]+\.mjs)\1/g,(_match,_quote,relative)=>JSON.stringify(pathToFileURL(relative==='./context-component-deployment.mjs'?deploymentFile:path.resolve(ownerDirectory,relative)).href));
 fs.writeFileSync(copy,ownerSource);
 fs.writeFileSync(launcher,`import {prepareOriginalPeerOwnerMaintenanceFreshReview,inspectOriginalPeerOwnerMaintenance} from ${JSON.stringify(pathToFileURL(copy).href)};
export async function runOriginalPeerOwnerMaintenanceReview(lifecycle,args){const cap=prepareOriginalPeerOwnerMaintenanceFreshReview(lifecycle,args);return {protocol:'SYNTHETIC-public-fresh-owner-admission',binding:inspectOriginalPeerOwnerMaintenance(cap),native_executed:false,owner_activated:false};}
`);
 let source=fs.readFileSync(runtimeFile,'utf8');const marker="new URL('./peers/maintenance-launch.mjs',import.meta.url)";assert(source.includes(marker));source=source.replace(marker,`new URL(${JSON.stringify(pathToFileURL(launcher).href)})`);
 source=source.replace(/(['"])(\.{1,2}\/[^'"]+\.mjs)\1/g,(_match,_quote,relative)=>JSON.stringify(pathToFileURL(relative==='./peers/owner-handover.mjs'?copy:path.resolve(runtimeDirectory,relative)).href));
 const file=path.join(directory,'runtime.mjs');fs.writeFileSync(file,source);return (await import(pathToFileURL(file).href)).peerOwnerRuntimeAction;
}

test('actual public runtime selects the literal fresh grant through original decision and typed intent',async t=>{
 const {f,decision,intent,grant_id}=await publicFreshTransfer(t),d=f.get('work_items',decision.decision_ref.id),i=f.get('work_items',intent.intent_ref.id),before=logicalSQLState(f);
 assert.deepEqual(d.value.review_grant_ref,i.value.review_grant_ref);assert.equal(d.value.review_grant_ref.id,grant_id);assert.deepEqual(f.get('grants',grant_id).value.actions,[FRESH_OWNER_ACTION]);
 const header=await invoke(req(f,'inspect_transfer_intent',{who:IN,input:{intent_ref:intent.intent_ref}}));assert.equal(header.status,'issued');
 const part=await invoke(req(f,'read_transfer_intent',{who:IN,input:{intent_ref:intent.intent_ref,sha256:header.sha256,offset:0,length:Math.min(1024,header.total_characters)}}));assert.equal(part.sha256,header.sha256);assert.deepEqual(logicalSQLState(f),before);
 await unchanged(f,()=>invoke(req(f,'begin',{who:IN,source_instruction:instruction,input:{operation_id:f.op(),intent_ref:intent.intent_ref}})),code('OWNER_FRESH_SOURCE_UNAVAILABLE'));
 assert.equal(f.get('principals','founder').value.status,'active');assert.equal(f.get('grants',grant_id).value.used_model_calls,0);
});

test('public wildcard and old grant actions keep their legacy Hold rather than converting to fresh purpose',async t=>{
 for(const actions of [['*'],['owner/handover-review']]){
  const {f,intent,grant_id}=await publicFreshTransfer(t,{actions});
  await unchanged(f,()=>invoke(req(f,'begin',{who:IN,source_instruction:instruction,input:{operation_id:f.op(),intent_ref:intent.intent_ref}})),code('OWNER_REVIEW_SOURCE_UNAVAILABLE'));
  assert.equal(f.get('principals','founder').value.status,'active');assert.equal(f.get('grants',grant_id).value.used_model_calls,0);
 }
});

test('public fresh selection still rejects a foreign actual HOST and stale original grant',async t=>{
 const {f,intent,grant_id,input}=await publicFreshTransfer(t);
 await unchanged(f,()=>invoke(req(f,'record_transfer_decision',{who:OTHER,source_instruction:instruction,input:{...input,operation_id:f.op()}})),code('OWNER_CHANGED'));
 f.run('founder','grant/revoke',{grant_id});
 await unchanged(f,()=>invoke(req(f,'begin',{who:IN,source_instruction:instruction,input:{operation_id:f.op(),intent_ref:intent.intent_ref}})),code('OWNER_REVIEW_GRANT_REQUIRED'));
 assert.equal(f.get('work_items',intent.intent_ref.id).value.status,'issued');assert.equal(f.get('control','usage'),null);
});

test('public fresh selection authenticates the original decision and rejects a foreign typed intent',async t=>{
 const a=await publicFreshTransfer(t),b=fixture(t);
 await unchanged(b,()=>invoke(req(b,'issue_transfer_intent',{source_instruction:instruction,input:{operation_id:b.op(),decision_ref:a.decision.decision_ref}})),error=>error instanceof Error);
 await unchanged(b,()=>invoke(req(b,'inspect_transfer_intent',{who:IN,input:{intent_ref:a.intent.intent_ref}})),error=>error instanceof Error);
 assert.equal(b.get('principals','founder').value.status,'active');assert.equal(b.get('control','usage'),null);
});

test('synthetic fixed Source composition routes public fresh begin reconstruction and opaque review admission',async t=>{
 const runtime=await runtimeWithFreshOwnerSource(t),{f,intent,grant_id}=await publicFreshTransfer(t,{runtime});
 const begun=await invoke(req(f,'begin',{who:IN,source_instruction:instruction,input:{operation_id:f.op(),intent_ref:intent.intent_ref}}),runtime);
 assert.equal(begun.status,'pending');const h=f.get('work_items',begun.handover_id);assert.equal(h.value.fresh_review_purpose,'peer-owner-maintenance-fresh-purpose-v1');assert.equal(h.value.creation_mode,'fresh-original-protected-thread');assert(h.value.public_transfer_binding);
 const info=await invoke(req(f,'inspect',{who:IN,epoch:8}),runtime);let delivered='';
 for(let offset=0;offset<info.total_characters;offset+=1024){const part=await invoke(req(f,'read_subject',{who:IN,epoch:8,input:{operation_id:f.op(),sha256:info.subject_sha256,offset,length:Math.min(1024,info.total_characters-offset)}}),runtime);delivered+=part.text;}
 assert.equal(peerDigest(JSON.parse(delivered)),info.subject_sha256);
 await invoke(req(f,'submit',{who:IN,epoch:8,source_instruction:instruction,input:{operation_id:f.op(),subject_sha256:info.subject_sha256,content:'SYNTHETIC full public reconstruction preserves original typed intent, complete source, failed obligations, deadlines and remaining limits.'}}),runtime);
 const reviewed=await invoke(req(f,'review',{who:IN,epoch:8,source_instruction:instruction,input:{operation_id:f.op()}}),runtime);
 assert.equal(reviewed.protocol,'SYNTHETIC-public-fresh-owner-admission');assert.equal(reviewed.binding.fresh_review_purpose,'peer-owner-maintenance-fresh-purpose-v1');assert.equal(reviewed.binding.native_id,null);assert.equal(reviewed.binding.reviewer_native_id,'reviewer-native');assert.equal(reviewed.native_executed,false);assert.equal(reviewed.owner_activated,false);
 assert.equal(f.get('grants',grant_id).value.used_model_calls,1);assert.equal(f.get('control','usage').value.model_calls,1);assert.equal(f.get('control','usage:reviewer').value.model_calls,1);assert.equal(f.get('principals','founder').value.status,'pending');assert.equal(f.get('control','company').value.paused,true);
});


test('public ongoing fresh selection rejects current purpose drift from the original begin',async t=>{
 const runtime=await runtimeWithFreshOwnerSource(t),{f,intent,grant_id}=await publicFreshTransfer(t,{runtime});
 const begun=await invoke(req(f,'begin',{who:IN,source_instruction:instruction,input:{operation_id:f.op(),intent_ref:intent.intent_ref}}),runtime),h=f.get('work_items',begun.handover_id);
 const changed={...h.value};delete changed.fresh_review_purpose;f.seed('work_items',h.id,changed);
 await unchanged(f,()=>invoke(req(f,'inspect',{who:IN,epoch:8}),runtime),code('OWNER_FRESH_REVIEW_PURPOSE_REQUIRED'));
 await unchanged(f,()=>invoke(req(f,'activate',{who:IN,epoch:8,source_instruction:instruction,input:{operation_id:f.op(),review_ref:{family:'work_items',id:'unqualified',revision:1,sha256:'0'.repeat(64)}}}),runtime),code('OWNER_FRESH_REVIEW_PURPOSE_REQUIRED'));
 assert.equal(f.get('principals','founder').value.status,'pending');assert.equal(f.get('grants',grant_id).value.used_model_calls,0);
});

test('fresh public routing adds no caller-selected lifecycle purpose profile or readiness flag',()=>{
 const base={root:'/SYNTHETIC-owner-root',session_id:OUT,action:'review',epoch:8,source_instruction:instruction,input:{operation_id:'SYNTHETIC'}};
 for(const key of ['freshReview','fresh_review_purpose','purpose','profile','ready'])assert.throws(()=>validatePeerOwnerRequest({...base,input:{...base.input,[key]:true}},'codex'),inputError);
});
