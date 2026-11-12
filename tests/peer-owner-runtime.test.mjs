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
import {Store} from '../plugins/soloco/runtime/store.mjs';
import {open as openCompany} from '../plugins/soloco/runtime/engine.mjs';
import {peerFixture} from './peer-fixture.mjs';
import {runWithMcpHostContext} from '../plugins/soloco/runtime/mcp-host-context.mjs';
import {peerOwnerToolSchema,validatePeerOwnerRequest,peerOwnerStorageKind,peerOwnerRuntimeAction} from '../plugins/soloco/runtime/peer-owner-runtime.mjs';
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
