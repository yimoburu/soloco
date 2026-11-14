// Compiler-free SOURCE operator routing. Temporary fictional H5/legacy SQLite
// supplies storage/owner guards only. A conditional fixed helper probe proves
// argument routing, never quarantine, Native authority or membership acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import childProcess from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';

// Install denial before every project import. Even a transitive Source change
// cannot execute a compiler, SDK lookup, sidecar, native CLI or network call.
const externalCalls=[],restoreExternal=[];
for(const [object,keys]of [[childProcess,['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']],[childProcess.ChildProcess.prototype,['spawn']],[net,['connect','createConnection','createServer']],[net.Socket.prototype,['connect']],[net.Server.prototype,['listen']],[tls,['connect','createServer']],[http,['request','get','createServer']],[https,['request','get','createServer']],[globalThis,['fetch']],[process,['kill']]])for(const key of keys){
 const descriptor=Object.getOwnPropertyDescriptor(object,key);if(!descriptor||typeof descriptor.value!=='function'||!descriptor.writable)continue;
 Object.defineProperty(object,key,{...descriptor,value(){externalCalls.push(key);throw Error('Compiler-free bootstrap Source forbids external '+key);}});restoreExternal.push(()=>Object.defineProperty(object,key,descriptor));
}
syncBuiltinESMExports();
test.after(()=>{try{assert.deepEqual(externalCalls,[]);}finally{for(const restore of restoreExternal.reverse())restore();syncBuiltinESMExports();}});
const {canonical,PeerLedger}=await import('../plugins/soloco/runtime/peers/ledger.mjs');
const {runWithMcpHostContext}=await import('../plugins/soloco/runtime/mcp-host-context.mjs');
const {peerOriginToolSchema,validatePeerOriginRequest,peerOriginRuntimeAction}=await import('../plugins/soloco/runtime/peer-origin-runtime.mjs');
const {legacyEncodedReplyBytes}=await import('../plugins/soloco/runtime/peers/legacy-origin.mjs');
const {Store,VERSION,teamHash,digest,compatibleRuntime}=await import('../plugins/soloco/runtime/store.mjs');
const {peerFixture}=await import('./peer-fixture.mjs');

const SESSION='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222',actor={host:'codex',session_id:SESSION,native_id:SESSION},instruction='SYNTHETIC compiler-free routing only; no Native grant or acceptance.';
const code=expected=>error=>error?.code===expected,typed=error=>error instanceof Error;
const req=(f,action,input={},more={})=>({root:f.root,session_id:SESSION,epoch:9,action,input,...more});
const invoke=(args,action=peerOriginRuntimeAction,meta={threadId:SESSION,sessionId:SESSION},host='codex')=>runWithMcpHostContext(host,meta,()=>action(args,host));
const runtimeDirectory=fileURLToPath(new URL('../plugins/soloco/runtime/',import.meta.url)),temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-bootstrap-public-source-')));let sequence=0;
test.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
function sourceFile(name,body){const file=path.join(temporary,`${++sequence}-${name}.mjs`);fs.writeFileSync(file,body);return file;}
async function relocatedOriginRuntime({launch}={}){
 const original=fs.readFileSync(path.join(runtimeDirectory,'peer-origin-runtime.mjs'),'utf8'),mappings=[];
 for(const relative of ['./peers/ledger.mjs','./store.mjs','./record-storage.mjs','./mcp-host-context.mjs','./peer-owner-runtime.mjs','./peers/legacy-origin.mjs','./peers/owner-handover.mjs','./peers/origin-plan.mjs','./peers/origin-quarantine.mjs','./peers/origin-maintenance.mjs'])mappings.push(["from '"+relative+"'",'from '+JSON.stringify(pathToFileURL(path.resolve(runtimeDirectory,relative)).href)]);
 for(const [variable,relative]of [['FRONTIER_URL','./peers/input-frontier-maintenance.mjs'],['ORDINARY_URL','./peers/origin-ordinary-task.mjs'],['SEAL_URL','./peers/origin-frontier-seal.mjs'],['LAUNCH_URL','./peers/maintenance-launch.mjs'],['ENGINE_URL','./engine.mjs'],['AUTHORITY_URL','./peers/origin-maintenance-authority.mjs'],['MECHANICAL_URL','./peers/origin-mechanical-qa-policy.mjs']])mappings.push([`const ${variable}=new URL('${relative}',import.meta.url);`,`const ${variable}=new URL(${JSON.stringify(pathToFileURL(variable==='LAUNCH_URL'&&launch?launch:path.resolve(runtimeDirectory,relative)).href)});`]);
 let body=original;for(const [before,after]of mappings){assert.equal(body.split(before).length-1,1,'exact fixed Source import/entry mapping');body=body.replace(before,after);}
 let restored=body;for(const [before,after]of [...mappings].reverse())restored=restored.replace(after,before);assert.equal(restored,original,'all actual public guards and operation bodies remain unchanged');
 return import(pathToFileURL(sourceFile('actual-origin-adapter',body)).href);
}
function compilerFreePeerFixture(t){
 const f=peerFixture({control:{paused:true},principals:{founder:{host:'codex',session_id:SESSION,native_id:SESSION,legacy_owner:{host:'codex',session_id:SESSION,epoch:9}},scheduler:{status:'held'},publisher:{status:'held'}}});t.after(()=>f.close());return {...f,root:f.ledger.root,file:f.ledger.file};
}
function compilerFreeLegacyFixture(t){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-bootstrap-legacy-source-'))),directory=path.join(root,'.company'),file=path.join(directory,'company.sqlite');fs.mkdirSync(directory,{mode:0o700});
 const state={schema:2,id:'SYNTHETIC-bootstrap-legacy',name:'Fictional source only',idea:'Retain owner guard',runtime_version:VERSION,plugin_version:VERSION,governance:'SYNTHETIC',governance_sha256:digest('SYNTHETIC'),cos_instructions:'SYNTHETIC',roles:{},owner:{host:'codex',session_id:SESSION,epoch:9},paused:true,records:{},jobs:{},sessions:{},messages:[],notices:[],revision:0,updated_at:new Date().toISOString()};
 state.team_sha256=teamHash(state);assert.equal(compatibleRuntime(state),true);
 const db=new DatabaseSync(file);try{db.exec('CREATE TABLE company(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,type TEXT NOT NULL,value TEXT NOT NULL);');db.prepare('INSERT INTO company VALUES(1,?)').run(JSON.stringify(state));db.prepare('INSERT INTO events VALUES(1,?,?,?)').run(new Date().toISOString(),'SYNTHETIC historical source',JSON.stringify({revision:0,owner:state.owner}));}finally{db.close();}
 const store=new Store(root);try{store.migrate();}finally{store.close();}t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,file};
}
function logicalState(f){const db=new DatabaseSync(f.file,{readOnly:true});try{const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();return {schema,rows:Object.fromEntries(schema.filter(row=>row.type==='table').map(row=>[row.name,db.prepare('SELECT * FROM "'+row.name.replaceAll('"','""')+'"').all().map(canonical).sort()]))};}finally{db.close();}}
async function unchanged(f,operation,predicate=typed){const before=logicalState(f);await assert.rejects(operation,predicate);assert.deepEqual(logicalState(f),before);}

const bootstrapInputs=()=>({
 bootstrap_enroll:{operation_id:'SYNTHETIC-bootstrap-enroll',enrollment_id:'SYNTHETIC-enrollment',principal_id:'SYNTHETIC-reviewer',role:'reviewer',host:'codex',scope:'alpha',input_refs:[],expires_at:new Date(Date.now()+60000).toISOString(),max_model_calls:2,expected_generation:0},
 bootstrap_inspect:{enrollment_id:'SYNTHETIC-enrollment'},
 bootstrap_run:{operation_id:'SYNTHETIC-bootstrap-run',enrollment_id:'SYNTHETIC-enrollment',phase:'reconstruction'},
 bootstrap_activate:{operation_id:'SYNTHETIC-bootstrap-activate',enrollment_id:'SYNTHETIC-enrollment'},
 bootstrap_revoke:{operation_id:'SYNTHETIC-bootstrap-revoke',enrollment_id:'SYNTHETIC-enrollment'}
});
const bootstrapRequest=(f,action,input=bootstrapInputs()[action])=>req(f,action,input,action==='bootstrap_inspect'?{}:{source_instruction:instruction});

test('bootstrap operator plan and five actions expose closed finite DATA with conditional reviewer and Codex enrollment',()=>{
 const f={root:'/SYNTHETIC/bootstrap-source'},schemas=peerOriginToolSchema.inputSchema.properties.input.properties,purpose=schemas.paused_bootstrap;
 assert.deepEqual(purpose.required,['protocol','purpose','max_enrollments','max_model_calls','max_review_calls']);assert.equal(purpose.additionalProperties,false);assert.deepEqual(purpose.properties.purpose.enum,['membership-qualification-only']);
 const planInput={expires_at:new Date(Date.now()+60000).toISOString(),policy:{worker_cap:3,queue_limit:10,principal_queue_limit:10,max_context_bytes:65536,max_model_calls:10},maintenance:{scope:'*',source_instruction:instruction,max_model_calls:4,max_review_calls:2},paused_bootstrap:{protocol:'peer-origin-paused-bootstrap-purpose-v1',purpose:'membership-qualification-only',max_enrollments:1,max_model_calls:2,max_review_calls:1}};
 assert.deepEqual(validatePeerOriginRequest(req(f,'plan',planInput,{source_instruction:instruction}),'codex').input,planInput);
 for(const value of [{...planInput.paused_bootstrap,ready:true},{...planInput.paused_bootstrap,max_enrollments:0},{...planInput.paused_bootstrap,purpose:'ordinary-execution'}])assert.throws(()=>validatePeerOriginRequest(req(f,'plan',{...planInput,paused_bootstrap:value},{source_instruction:instruction}),'codex'),code('ORIGIN_PUBLIC_INPUT'));
 for(const [action,input]of Object.entries(bootstrapInputs())){
  const request=bootstrapRequest(f,action,input);assert.deepEqual(validatePeerOriginRequest(request,'codex'),request);
  if(action!=='bootstrap_inspect'){const {source_instruction:omit,...missing}=request;assert.throws(()=>validatePeerOriginRequest(missing,'codex'),code('ORIGIN_PUBLIC_INSTRUCTION_REQUIRED'));}
  for(const selector of ['actor','ledger','scope_root','cwd','read_paths','state_root','scratch_root','profile','cap','provider','callback','epoch','source_instruction'])assert.throws(()=>validatePeerOriginRequest({...request,input:{...input,[selector]:selector==='epoch'?9:'SYNTHETIC-injected'}},'codex'),code('ORIGIN_PUBLIC_INPUT'));
 }
 const run=bootstrapRequest(f,'bootstrap_run');assert.throws(()=>validatePeerOriginRequest({...run,input:{...run.input,phase:'review'}},'codex'),code('ORIGIN_PUBLIC_INPUT'));
 assert.deepEqual(validatePeerOriginRequest({...run,input:{...run.input,phase:'review',reviewer_principal_id:'SYNTHETIC-independent-reviewer'}},'codex').input.phase,'review');
 assert.throws(()=>validatePeerOriginRequest({...run,input:{...run.input,reviewer_principal_id:'SYNTHETIC-not-a-review'}},'codex'),code('ORIGIN_PUBLIC_INPUT'));
 const enroll=bootstrapRequest(f,'bootstrap_enroll');for(const input of [{...enroll.input,host:'claude'},{...enroll.input,max_model_calls:0},{...enroll.input,expected_generation:-1},{...enroll.input,role:'x'.repeat(101)},{...enroll.input,input_refs:Array(101).fill({family:'tasks',id:'x',revision:1,sha256:'a'.repeat(64)})}])assert.throws(()=>validatePeerOriginRequest({...enroll,input},'codex'),code('ORIGIN_PUBLIC_INPUT'));
});

test('bootstrap operator rejects getters proxies selectors and missing HOST before filesystem access',async()=>{
 const f={root:'/SYNTHETIC/not-opened-bootstrap'},request=bootstrapRequest(f,'bootstrap_run'),lstat=fs.lstatSync;let reads=0,executed=0;
 const getter={...request};Object.defineProperty(getter,'input',{enumerable:true,get(){executed++;throw Error('SYNTHETIC getter must not run');}});
 const proxy=new Proxy(request.input,{getPrototypeOf(){executed++;throw Error('SYNTHETIC proxy must not run');},ownKeys(){executed++;throw Error('SYNTHETIC proxy must not run');}});
 fs.lstatSync=(...args)=>{reads++;return Reflect.apply(lstat,fs,args);};
 try{
  for(const invalid of [getter,{...request,input:proxy},{...request,actor},{...request,input:{...request.input,spawn:()=>{executed++;}}}])await assert.rejects(peerOriginRuntimeAction(invalid,'codex'),typed);
  await assert.rejects(peerOriginRuntimeAction(request,'codex'),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
  await assert.rejects(invoke(request,peerOriginRuntimeAction,{threadId:OTHER,sessionId:SESSION}),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
 }finally{fs.lstatSync=lstat;}
 assert.equal(reads,0);assert.equal(executed,0);
});

async function bootstrapPublicRouteFixture(t){
 const f=compilerFreePeerFixture(t),ledgerURL=new URL('../plugins/soloco/runtime/peers/ledger.mjs',import.meta.url).href;
 const entry=sourceFile('bootstrap-fixed-public-route',`import assert from 'node:assert/strict';import {PeerLedger} from ${JSON.stringify(ledgerURL)};
export const calls=[],control={oversized:false};
export function runOriginalPeerBootstrapMembershipOperation(...args){
 assert.equal(args.length,4);const [ledger,actor,action,input]=args;assert.equal(Object.getPrototypeOf(ledger),PeerLedger.prototype);assert.equal(ledger.root,${JSON.stringify(f.root)});assert.deepEqual(actor,${JSON.stringify(actor)});
 ledger.read(tx=>{assert.equal(tx.get('control','company').value.protocol,'peer-cos-v1');});
 let readonly=false;if(action==='bootstrap_inspect'){try{ledger.db.exec('CREATE TABLE SYNTHETIC_FORBIDDEN_BOOTSTRAP_WRITE(value TEXT)');}catch(error){readonly=/readonly/i.test(error.message);}assert.equal(readonly,true,'inspect must retain the actual readonly SQLite connection');}
 calls.push({ledger,actor,action,input,readonly});if(control.oversized)return {protocol:'SYNTHETIC-bootstrap-routing-only',content:'SYNTHETIC retained result '.repeat(2000),authority_issued:false,native_qualified:false};return {protocol:'SYNTHETIC-bootstrap-routing-only',action,authority_issued:false,native_qualified:false};
}`),probe=await import(pathToFileURL(entry).href),runtime=await relocatedOriginRuntime({launch:entry});return {...f,runtime,probe};
}

test('bootstrap operator routes actual HOST owner custody through exactly four fixed arguments and retains inspect readonly',async t=>{
 const f=await bootstrapPublicRouteFixture(t),before=logicalState(f);
 for(const [action,input]of Object.entries(bootstrapInputs())){
  const result=await invoke(bootstrapRequest(f,action,input),f.runtime.peerOriginRuntimeAction);assert.equal(result.authority_issued,false);assert.equal(result.native_qualified,false);
  const observed=f.probe.calls.at(-1),expected={...input,epoch:9};if(['bootstrap_enroll','bootstrap_activate','bootstrap_revoke'].includes(action))expected.source_instruction=instruction;
  assert.equal(observed.action,action);assert.deepEqual(observed.actor,actor);assert.deepEqual(observed.input,expected);assert.equal(observed.readonly,action==='bootstrap_inspect');assert.equal(Object.hasOwn(observed.input,'source_instruction'),['bootstrap_enroll','bootstrap_activate','bootstrap_revoke'].includes(action));
 }
 assert.equal(f.probe.calls.length,5);assert.deepEqual(logicalState(f),before);
 await unchanged(f,()=>invoke(bootstrapRequest(f,'bootstrap_inspect'),f.runtime.peerOriginRuntimeAction,{threadId:OTHER,sessionId:OTHER}),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
 await unchanged(f,()=>invoke({...bootstrapRequest(f,'bootstrap_inspect'),epoch:10},f.runtime.peerOriginRuntimeAction),code('ORIGIN_PUBLIC_OWNER_REQUIRED'));assert.equal(f.probe.calls.length,5);
});

test('bootstrap operator legacy storage and changed original custody cannot reach the fixed helper',async t=>{
 const legacy=compilerFreeLegacyFixture(t),entry=sourceFile('bootstrap-helper-must-not-run','export let calls=0;export function runOriginalPeerBootstrapMembershipOperation(){calls++;throw Error("SYNTHETIC helper must not run");}'),probe=await import(pathToFileURL(entry).href),runtime=await relocatedOriginRuntime({launch:entry});
 for(const action of Object.keys(bootstrapInputs()))await unchanged(legacy,()=>invoke(bootstrapRequest(legacy,action),runtime.peerOriginRuntimeAction),code(action==='bootstrap_inspect'?'ORIGIN_PEER_QUARANTINE_REQUIRED':'OWNER_LEGACY_READONLY_REQUIRED'));assert.equal(probe.calls,0);
 const f=compilerFreePeerFixture(t),ledger=new PeerLedger(f.root);try{ledger.write('fixture.bootstrap-invalid-custody','founder',tx=>{const c=tx.get('control','company');tx.put('control','company',{...c.value,owner_handover:{family:'work_items',id:'SYNTHETIC-missing-transfer',revision:1,sha256:'a'.repeat(64)}},c.revision);});}finally{ledger.close();}
 await unchanged(f,()=>invoke(bootstrapRequest(f,'bootstrap_inspect'),runtime.peerOriginRuntimeAction),code('OWNER_PUBLIC_TRANSFER_REQUIRED'));assert.equal(probe.calls,0);
});

test('bootstrap operator rechecks the actual owner after awaiting its fixed module before calling the helper',async t=>{
 const f=compilerFreePeerFixture(t),ledgerURL=new URL('../plugins/soloco/runtime/peers/ledger.mjs',import.meta.url).href;
 const entry=sourceFile('bootstrap-owner-drift-at-module-load',`import {PeerLedger} from ${JSON.stringify(ledgerURL)};const ledger=new PeerLedger(${JSON.stringify(f.root)});try{ledger.write('fixture.bootstrap-owner-drift','founder',tx=>{const company=tx.get('control','company'),p=tx.get('principals',company.value.founder_principal_id);tx.put('principals',p.id,{...p.value,legacy_owner:{...p.value.legacy_owner,epoch:10}},p.revision);});}finally{ledger.close();}export let calls=0;export function runOriginalPeerBootstrapMembershipOperation(){calls++;throw Error('Changed owner must stop first');}`),runtime=await relocatedOriginRuntime({launch:entry});
 await assert.rejects(invoke(bootstrapRequest(f,'bootstrap_run'),runtime.peerOriginRuntimeAction),code('ORIGIN_PUBLIC_OWNER_REQUIRED'));const probe=await import(pathToFileURL(entry).href);assert.equal(probe.calls,0);
});

test('bootstrap operator inspection preserves the real missing paused-purpose Hold rather than waiving ordinary authority',async t=>{
 const f=compilerFreePeerFixture(t),before=logicalState(f);await assert.rejects(invoke(bootstrapRequest(f,'bootstrap_inspect'),peerOriginRuntimeAction),code('ORIGIN_MAINTENANCE_SELECTION_REQUIRED'));assert.deepEqual(logicalState(f),before);
});


test('bootstrap operator oversized returned result points to the exact enrollment without repeating an operation',async t=>{
 const f=await bootstrapPublicRouteFixture(t),before=logicalState(f),request=bootstrapRequest(f,'bootstrap_enroll');f.probe.control.oversized=true;
 const receipt=await invoke(request,f.runtime.peerOriginRuntimeAction);assert.equal(receipt.protocol,'peer-origin-operation-returned-v1');assert.equal(receipt.operation_returned,true);assert.equal(receipt.result_not_inlined,true);assert.equal(receipt.action,'bootstrap_enroll');assert.equal(receipt.operation_id,request.input.operation_id);
 assert.deepEqual(receipt.retrieval,{tool:'company_origin',action:'bootstrap_inspect',epoch:9,input:{enrollment_id:request.input.enrollment_id}});assert.ok(legacyEncodedReplyBytes(receipt)<=24576);assert.equal(receipt.accepted,undefined);assert.equal(receipt.native_qualified,undefined);assert.match(receipt.note,/no acceptance or authority/);assert.equal(f.probe.calls.length,1);assert.deepEqual(logicalState(f),before);
});
