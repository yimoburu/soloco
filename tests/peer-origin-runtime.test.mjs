import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {canonical,PeerLedger,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {runWithMcpHostContext} from '../plugins/soloco/runtime/mcp-host-context.mjs';
import {withPeerPublicStorage} from '../plugins/soloco/runtime/peer-owner-runtime.mjs';
import {peerOriginToolSchema,validatePeerOriginRequest,peerOriginRuntimeAction,preparePeerOriginMechanicalReviewRequest} from '../plugins/soloco/runtime/peer-origin-runtime.mjs';
import {legacyEncodedReplyBytes} from '../plugins/soloco/runtime/peers/legacy-origin.mjs';
import {SESSION,OTHER,actor,instruction,legacyFixture,logicalState,preparePlan,mechanical,quarantine,relocatedOriginRuntime,sourceFile,missingSourceFile,disposeOriginPublicFixture} from './peer-origin-public-fixture.mjs';
import {fixture as selectedFixture,completeReview,disposeMechanicalPublicFixture} from './peer-origin-mechanical-public-fixture.mjs';
import {freshInventoryStore} from './original-global-worker-inventory-fixture.mjs';

// All databases, HOST metadata, context witnesses, closure journals and source
// selection below are explicitly SYNTHETIC. No real company, native provider,
// managed-hook trust, policy selection or native QA is performed or claimed.
test.after(disposeOriginPublicFixture);
test.after(disposeMechanicalPublicFixture);
const hash=value=>createHash('sha256').update(value).digest('hex');
const code=value=>error=>error?.code===value;
const typed=error=>error instanceof Error;
const req=(f,action,input={},more={})=>({root:f.root,session_id:SESSION,epoch:9,action,input,...more});
const invoke=(args,action=peerOriginRuntimeAction,meta={threadId:SESSION,sessionId:SESSION},host='codex')=>runWithMcpHostContext(host,meta,()=>action(args,host));
function temp(t){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-origin-ingress-empty-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root};}
async function unchanged(f,operation,predicate=typed){const before=logicalState(f);await assert.rejects(operation,predicate);assert.deepEqual(logicalState(f),before);}
async function applied(t,changes={},prepare=()=>{}){
 const f=selectedFixture(t,changes,prepare),p=f.planned,review_ids=completeReview(f),runtime=await f.runtime();
 const receipt=await invoke(req(f,'quarantine',{plan_id:p.plan_id,review_ids},{source_instruction:instruction}),runtime.peerOriginRuntimeAction);
 assert.equal(receipt.protocol,'peer-origin-applied-receipt-v1');return {...f,p,review_ids,runtime,receipt};
}

// Conditional routing DATA only: the deliberately incomplete plan below can
// reach a TEST policy probe, never the actual mechanical policy/grant. The
// actual canonical Store/SQLite/fresh Source prefix and HOST adapter are used.
async function readonlyRouteFixture(t){
 const f=await freshInventoryStore(t,{stateOptions:{extra:{owner:{host:'codex',session_id:SESSION,epoch:9}}}});f.store.migrate();
 const plan_id='SYNTHETIC-readonly-route-plan',p={protocol:'peer-origin-quarantine-plan-v1',plan_id,company_id:f.state().id,owner:{host:'codex',session_id:SESSION,epoch:9},actor:{host:'codex',session_id:SESSION,native_id:SESSION},expires_at:new Date(Date.now()+60000).toISOString(),cut_sha256:'a'.repeat(64)};
 f.store.transaction('fixture.conditional-route-data',state=>{state.records[plan_id]={id:plan_id,kind:'plan',status:'Draft',revision:1,author_role:'cos',author_instance:SESSION,content:canonical(p),origin_quarantine_plan:p};return state;});
 return {...f,plan_id,grant_ref:{id:'SYNTHETIC-never-issued-grant',revision:1,sha256:'b'.repeat(64)}};
}

test('public mechanical routing reaches its fixed policy inside one actual readonly Store snapshot',async t=>{
 const f=await readonlyRouteFixture(t),storeUrl=new URL('../plugins/soloco/runtime/store.mjs',import.meta.url).href;
 const probe=sourceFile('readonly-custody-probe',`import {originalStoreExecutionCustodyFrom} from ${JSON.stringify(storeUrl)};export const observed={calls:0};export const failure=Object.freeze(new TypeError('SYNTHETIC conditional policy probe only'));export function preparePeerOriginMechanicalQaDispatchFrom(db,state){const loan=originalStoreExecutionCustodyFrom(db);if(loan.mode!=='read'||loan.store.readOnly!==true||loan.db!==db||state.id!==${JSON.stringify(f.state().id)})throw Error('Wrong actual readonly Store snapshot');observed.calls++;observed.loan=loan;throw failure;}`),policy=await import(pathToFileURL(probe).href),runtime=await relocatedOriginRuntime({mechanical:probe}),before=f.state(),exec=DatabaseSync.prototype.exec,begins=[];
 DatabaseSync.prototype.exec=function(sql,...args){if(/^BEGIN/.test(sql))begins.push(String(sql));return Reflect.apply(exec,this,[sql,...args]);};
 try{await assert.rejects(invoke(req(f,'mechanical_review',{plan_id:f.plan_id,grant_ref:f.grant_ref},{source_instruction:instruction}),runtime.preparePeerOriginMechanicalReviewRequest),error=>error===policy.failure);}
 finally{DatabaseSync.prototype.exec=exec;}
 assert.equal(policy.observed.calls,1);assert.deepEqual(begins,['BEGIN']);assert.throws(()=>policy.observed.loan.assert(),code('ORIGINAL_EXECUTION_STORE_EXPIRED'));assert.deepEqual(f.state(),before);
});

test('public mechanical routing revalidates the owner after module await before entering its Store snapshot',async t=>{
 const f=await readonlyRouteFixture(t),storeUrl=new URL('../plugins/soloco/runtime/store.mjs',import.meta.url).href;
 const probe=sourceFile('readonly-owner-change-at-load',`import {withStore} from ${JSON.stringify(storeUrl)};withStore(${JSON.stringify(f.root)},store=>store.transaction('fixture.original-owner-change',state=>{state.owner.epoch=10;return state;}));export let calls=0;export function preparePeerOriginMechanicalQaDispatchFrom(){calls++;throw Error('Changed owner must stop before policy');}`),runtime=await relocatedOriginRuntime({mechanical:probe});
 await assert.rejects(invoke(req(f,'mechanical_review',{plan_id:f.plan_id,grant_ref:f.grant_ref},{source_instruction:instruction}),runtime.preparePeerOriginMechanicalReviewRequest));
 const policy=await import(pathToFileURL(probe).href);assert.equal(policy.calls,0);assert.equal(f.state().owner.epoch,10);assert.equal(Object.keys(f.state().jobs).length,0);assert.equal(f.state().records[f.plan_id].origin_quarantine_plan.owner.epoch,9);
});

test('public maintenance status uses the original inspection API and preserves producer Holds',async t=>{
 const f=await applied(t),before=logicalState(f);
 // The actual factory reaches its fixed, undeployed sidecar producer. This
 // source fixture cannot turn an absent producer into a successful status.
 await assert.rejects(invoke(req(f,'maintenance_status'),f.runtime.peerOriginRuntimeAction),code('ORIGIN_SIDECAR_PROGRAM_UNAVAILABLE'));
 assert.deepEqual(logicalState(f),before);
});

test('closed copied tool DATA rejects unknown authority and accessors before filesystem or HOST access',()=>{
 assert.equal(peerOriginToolSchema.name,'company_origin');assert.equal(peerOriginToolSchema.inputSchema.additionalProperties,false);
 const args={root:'/fictional-not-existing',session_id:SESSION,epoch:9,action:'status',input:{}};
 const copy=validatePeerOriginRequest(args,'codex');assert.deepEqual(copy,args);assert.notEqual(copy,args);assert.notEqual(copy.input,args.input);
 let observed=0;const access={...args};Object.defineProperty(access,'input',{enumerable:true,get(){observed++;throw Error('Accessor must not run');}});
 const proxy=new Proxy(args.input,{getOwnPropertyDescriptor(){observed++;throw Error('Proxy must not run');}});
 for(const value of [access,{...args,input:proxy},{...args,[Symbol('authority')]:true},...['actor','provider','ledger','callback','launch','native_proof','ready'].map(key=>({...args,[key]:{}})),{...args,epoch:0},{...args,input:{ready:true}},{...args,action:'source_read',input:{source_id:'x',sha256:'a'.repeat(64),offset:0,length:4097}}])assert.throws(()=>validatePeerOriginRequest(value,'codex'),typed);
 assert.equal(observed,0);
});

test('missing, descendant, unsupported and selector-mismatched HOST callers stop before filesystem access',async t=>{
 const f=temp(t),args=req(f,'status'),lstat=fs.lstatSync;let reads=0;
 fs.lstatSync=function(...args){reads++;return Reflect.apply(lstat,this,args);};
 try{
  await assert.rejects(peerOriginRuntimeAction(args,'codex'),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
  await assert.rejects(invoke(args,peerOriginRuntimeAction,{threadId:OTHER,sessionId:SESSION}),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
  await assert.rejects(invoke(args,peerOriginRuntimeAction,{threadId:OTHER,sessionId:OTHER}),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
  await assert.rejects(invoke(args,peerOriginRuntimeAction,{threadId:SESSION,sessionId:SESSION},'claude'),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
  await assert.rejects(invoke({...args,input:{provider:{}}}),typed);
 }finally{fs.lstatSync=lstat;}
 assert.equal(reads,0);assert.deepEqual(fs.readdirSync(f.root),[]);
});

test('qualified caller never initializes absent, empty, foreign or linked storage',async t=>{
 const empty=temp(t);await assert.rejects(invoke(req(empty,'status')),code('OWNER_EXISTING_STORAGE_REQUIRED'));assert.deepEqual(fs.readdirSync(empty.root),[]);
 const foreign=temp(t);fs.mkdirSync(path.join(foreign.root,'.company'));const file=path.join(foreign.root,'.company','company.sqlite'),db=new DatabaseSync(file);db.exec('CREATE TABLE fictional_unrelated(value TEXT)');db.close();const before=hash(fs.readFileSync(file));await assert.rejects(invoke(req(foreign,'status')),typed);assert.equal(hash(fs.readFileSync(file)),before);
 const f=legacyFixture(t),linked=temp(t);fs.symlinkSync(path.join(f.root,'.company'),path.join(linked.root,'.company'));await unchanged(f,()=>invoke(req(linked,'status')),code('OWNER_STORAGE_LINK'));
});

test('legacy status and trusted readonly opener preserve all logical state/schema and cannot write',async t=>{
 const f=legacyFixture(t),before=logicalState(f),result=await invoke(req(f,'status'));
 assert.equal(result.storage_layout,4);assert.equal(result.paused,true);assert.equal(result.owner.epoch,9);assert.deepEqual(logicalState(f),before);
 await assert.rejects(withPeerPublicStorage(f.root,false,()=>{}),code('OWNER_LEGACY_READONLY_REQUIRED'));
 await assert.rejects(withPeerPublicStorage(f.root,true,({db})=>db.exec('CREATE TABLE forbidden_write(x)')),typed);assert.deepEqual(logicalState(f),before);
});

test('current legacy owner/epoch and unresolved handover gate private output before any plan read',async t=>{
 const f=legacyFixture(t),prepare=DatabaseSync.prototype.prepare;let recordReads=0;
 DatabaseSync.prototype.prepare=function(sql,...rest){if(String(sql).includes('state_entries')&&new Error().stack.includes('legacyPlan'))recordReads++;return Reflect.apply(prepare,this,[sql,...rest]);};
 try{await unchanged(f,()=>invoke(req(f,'plan_inspect',{plan_id:'private-plan'},{epoch:8})));await unchanged(f,()=>invoke(req(f,'plan_inspect',{plan_id:'private-plan'},{session_id:OTHER}),peerOriginRuntimeAction,{threadId:OTHER,sessionId:OTHER}));}finally{DatabaseSync.prototype.prepare=prepare;}
 assert.equal(recordReads,0);
 const held=legacyFixture(t,{handover:{status:'pending'}});await unchanged(held,()=>invoke(req(held,'status')),code('ORIGIN_LEGACY_HANDOVER_UNQUALIFIED'));
});

test('genuine original plan has exact canonical inspect/read handles, Unicode-safe bounded ranges and no read mutation',async t=>{
 const content='Original \\" 😀 漢字'.repeat(1000),f=legacyFixture(t,{records:{original:{id:'original',kind:'artifact',status:'Draft',revision:1,content}}});f.input.maintenance.source_instruction='SYNTHETIC original \\" 😀 漢字'.repeat(100);const p=preparePlan(f),before=logicalState(f);
 const header=await invoke(req(f,'plan_inspect',{plan_id:p.plan_id}));assert.equal(header.plan_sha256,p.plan_sha256);assert.equal(header.cut_sha256,p.cut_sha256);assert.equal(header.authority_issued,false);assert.equal(header.representation,'canonical-origin-plan-record-v1');
 let body='',offset=0,chunks=0;
 while(offset<header.total_characters){const piece=await invoke(req(f,'plan_read',{plan_id:p.plan_id,sha256:header.sha256,offset,length:4096}));assert.ok(legacyEncodedReplyBytes(piece)<=24576);assert.equal(Buffer.from(piece.text).toString('utf8'),piece.text);assert.equal(piece.qualification_by_read,false);body+=piece.text;offset+=piece.length;chunks++;assert.equal(piece.next_offset,offset===header.total_characters?null:offset);}
 assert.ok(chunks>1);assert.equal(hash(body),header.sha256);assert.equal(JSON.parse(body).origin_quarantine_plan.plan_id,p.plan_id);assert.equal(body,canonical(f.state().records[p.plan_id]));
 await unchanged(f,()=>invoke(req(f,'plan_read',{plan_id:p.plan_id,sha256:'0'.repeat(64),offset:0,length:4096})),code('ORIGIN_PUBLIC_SOURCE_CHANGED'));
 const split=body.indexOf('😀')+1;assert.ok(split>0);await unchanged(f,()=>invoke(req(f,'plan_read',{plan_id:p.plan_id,sha256:header.sha256,offset:split,length:10})),code('ORIGIN_PUBLIC_RANGE'));assert.deepEqual(logicalState(f),before);
});

test('missing checked-epoch plan producer holds without creating a plan or spending original grant',async t=>{
 const f=legacyFixture(t),missing=sourceFile('no-checked-epoch-producer',`export {originSafeData,ORIGIN_PLAN_PROTOCOL,ORIGIN_LIMITS,ORIGIN_REVIEW_CONTEXT} from ${JSON.stringify(new URL('../plugins/soloco/runtime/peers/origin-plan.mjs',import.meta.url).href)};`),runtime=await relocatedOriginRuntime({planModule:missing});await unchanged(f,()=>invoke(req(f,'plan',f.input,{source_instruction:instruction}),runtime.peerOriginRuntimeAction),code('ORIGIN_PUBLIC_PLAN_EPOCH_PRODUCER_UNAVAILABLE'));
});

test('original selected request binds exact grant and fixed engine DATA; missing dispatcher cannot queue or spend',async t=>{
 const f=selectedFixture(t),p=f.planned,args=req(f,'mechanical_review',{plan_id:p.plan_id,grant_ref:f.grant_ref},{source_instruction:instruction}),before=logicalState(f),selectedRuntime=await f.runtime(),prepared=await invoke(args,selectedRuntime.preparePeerOriginMechanicalReviewRequest);
 assert.equal(prepared.planned_not_dispatched,true);assert.deepEqual(prepared.arguments,{root:f.root,session_id:SESSION,epoch:9,input:{plan_id:p.plan_id,grant_ref:f.grant_ref}});assert.equal(prepared.context_sha256,f.packet.context_sha256);assert.equal(prepared.context_utf8_bytes,f.packet.context_utf8_bytes);assert.equal(prepared.context,undefined);assert.deepEqual(logicalState(f),before);
 const runtime=await relocatedOriginRuntime({engine:sourceFile('no-mechanical-dispatcher','export {};'),planModule:f.planModulePath,quarantineModule:f.quarantineModulePath,mechanical:f.policyModulePath});await unchanged(f,()=>invoke(args,runtime.peerOriginRuntimeAction),code('ORIGIN_MECHANICAL_DISPATCH_SOURCE_UNAVAILABLE'));
 completeReview(f);await unchanged(f,()=>invoke(args,selectedRuntime.preparePeerOriginMechanicalReviewRequest),code('ORIGIN_MECHANICAL_QA_SOURCE_CHANGED'));
});

test('fictional original mechanical preflight validates actual journal; JSON-shaped Pass cannot replace it',async t=>{
 const f=selectedFixture(t),p=f.planned,runtime=await f.runtime(),before=logicalState(f);
 await unchanged(f,()=>invoke(req(f,'mechanical_preflight',{plan_id:p.plan_id,review_ids:['invented-review']}),runtime.peerOriginRuntimeAction),code('ORIGIN_MECHANICAL_REVIEW_REQUIRED'));
 const review_ids=completeReview(f),completed=logicalState(f),checked=await invoke(req(f,'mechanical_preflight',{plan_id:p.plan_id,review_ids}),runtime.peerOriginRuntimeAction);
 assert.equal(checked.mechanical_preflight_passed,true);assert.equal(checked.quarantine_requires_current_revalidation,true);assert.equal(checked.authority_issued,false);assert.equal(checked.observed.length,1);assert.deepEqual(logicalState(f),completed);assert.notDeepEqual(completed,before);
});

test('checked source apply reopens H5/current owner and returns exact persisted receipt, retaining original UNKNOWN and spent limits',async t=>{
 const f=await applied(t),receipt=f.receipt;assert.equal(receipt.persisted,true);assert.equal(receipt.execution_resumed,false);assert.equal(receipt.authority_issued,false);assert.ok(legacyEncodedReplyBytes(receipt)<=24576);
 const ledger=new PeerLedger(f.root);try{ledger.read(tx=>{const o=tx.get('control','origin'),c=tx.get('control','company');assert.deepEqual(receipt.origin_ref,{family:'control',id:o.id,revision:o.revision,sha256:o.sha256});assert.equal(c.value.paused,true);assert.equal(o.value.status,'quarantined');assert.equal(o.value.execution_resumed,false);assert.ok(o.value.legacy_unknown_reservations.length>0);assert.equal(receipt.full_origin_record.action,'context_read');assert.equal(receipt.full_origin_record.input.sha256,o.sha256);const grant=o.value.manifest.sources.pages.flatMap(p=>tx.getVersion(p).value.items).find(s=>s.family==='root'&&s.key==='original_grant');assert.deepEqual(tx.resolveLegacy(grant),{max_attempts:2,used_attempts:2,expires_at:'2020-01-01T00:00:00.000Z'});});}finally{ledger.close();}
 const status=await invoke(req(f,'status'));assert.equal(status.storage_layout,5);assert.equal(status.ordinary_authority,false);assert.equal(status.origin.status,'quarantined');
 await unchanged(f,()=>invoke(req(f,'plan_inspect',{plan_id:f.p.plan_id})),code('ORIGIN_LAYOUT4_REQUIRED'));
});

test('oversized original backup result returns one bounded persisted receipt and exact retrieval handle without repeating apply',async t=>{
 const f=await applied(t,{},f=>{for(let n=0;n<100;n++)fs.writeFileSync(path.join(f.root,'.company','SYNTHETIC-'+String(n).padStart(3,'0')+'-'+('a'.repeat(160))+'.txt'),'Fictional original retained sidecar '+n);}),ledger=new PeerLedger(f.root);
 try{ledger.read(tx=>{const origin=tx.get('control','origin');assert.ok(legacyEncodedReplyBytes({backup:origin.value.backup})>24576);assert.equal(f.receipt.backup.files_count,origin.value.backup.files.length);assert.equal(f.receipt.full_origin_record.input.sha256,origin.sha256);});}finally{ledger.close();}
 assert.ok(legacyEncodedReplyBytes(f.receipt)<=24576);assert.equal(fs.readdirSync(path.join(f.root,'.origin-quarantine-backups')).length,1);
});

test('all H5 original manifest pages expose exact bounded bytes without schema/state changes',async t=>{
 const f=await applied(t,{records:{original:{id:'original',kind:'artifact',status:'Draft',revision:1,content:'\\"😀'.repeat(3000)}}}),before=logicalState(f),status=await invoke(req(f,'status'));
 for(const [section,descriptor]of Object.entries(status.origin.manifest))for(let page=0;page<descriptor.pages;page++){
  const header=await invoke(req(f,'manifest_inspect',{section,page}));let body='',offset=0;
  while(offset<header.total_characters){const part=await invoke(req(f,'manifest_read',{section,page,sha256:header.sha256,offset,length:4096}));assert.ok(legacyEncodedReplyBytes(part)<=24576);body+=part.text;offset+=part.length;}
  assert.equal(hash(body),header.sha256);assert.equal(JSON.parse(body).section,section);assert.equal(JSON.parse(body).page,page);
 }
 assert.deepEqual(logicalState(f),before);
});

test('H5 original source reads deliver exact complete Unicode/escaped original with stale-hash and split-range negatives',async t=>{
 const content='Original \\" 😀 漢字'.repeat(1000),f=await applied(t,{records:{original:{id:'original',kind:'artifact',status:'Draft',revision:1,content}}}),before=logicalState(f),ledger=new PeerLedger(f.root);let selected;
 try{selected=ledger.read(tx=>{const o=tx.get('control','origin');return o.value.manifest.sources.pages.flatMap(ref=>tx.getVersion(ref).value.items).find(s=>s.family==='records'&&s.key==='original');});}finally{ledger.close();}
 assert.ok(selected);let body='',offset=0,next=0;
 do{const part=await invoke(req(f,'source_read',{source_id:selected.source_id,sha256:selected.sha256,offset,length:4096}));assert.ok(legacyEncodedReplyBytes(part)<=24576);assert.equal(Buffer.from(part.text).toString('utf8'),part.text);body+=part.text;offset+=part.length;next=part.next_offset;}while(next!==null);
 assert.equal(hash(body),selected.sha256);assert.equal(JSON.parse(body).content,content);
 await unchanged(f,()=>invoke(req(f,'source_read',{source_id:selected.source_id,sha256:'0'.repeat(64),offset:0,length:4096})),code('ORIGIN_SOURCE_CHANGED'));
 await unchanged(f,()=>invoke(req(f,'source_read',{source_id:selected.source_id,sha256:selected.sha256,offset:body.indexOf('😀')+1,length:10})),code('ORIGIN_SOURCE_RANGE'));assert.deepEqual(logicalState(f),before);
});

test('H5 actual owner, epoch and typed custody reject private access and preserve all SQL',async t=>{
 const f=await applied(t);await unchanged(f,()=>invoke(req(f,'status',{}, {epoch:10})),code('ORIGIN_PUBLIC_OWNER_REQUIRED'));
 await unchanged(f,()=>invoke(req(f,'status',{}, {session_id:OTHER}),peerOriginRuntimeAction,{threadId:OTHER,sessionId:OTHER}),code('ORIGIN_PUBLIC_OWNER_REQUIRED'));
 const ledger=new PeerLedger(f.root);try{ledger.write('fixture.invalid-custody','founder',tx=>{const c=tx.get('control','company');tx.put('control','company',{...c.value,owner_handover:{family:'work_items',id:'fictional-no-original-binding',revision:1,sha256:'a'.repeat(64)}},c.revision);});}finally{ledger.close();}
 await unchanged(f,()=>invoke(req(f,'status')),code('OWNER_PUBLIC_TRANSFER_REQUIRED'));
});

test('missing direct native/frontier/final entries Hold before any original prepare or charge',async t=>{
 const f=await applied(t),runtime=await relocatedOriginRuntime({launch:missingSourceFile(),frontier:missingSourceFile(),seal:missingSourceFile()}),ref={family:'work_items',id:'fictional',revision:1,sha256:'a'.repeat(64)};
 for(const [action,input,error]of [['maintenance_run',{operation_id:'source-only',kind:'peer-origin-reconstruction',segments:[{source_id:'fictional',sha256:'a'.repeat(64),offset:0,length:1}]},'ORIGIN_NATIVE_LAUNCH_SOURCE_UNAVAILABLE'],['frontier_capture',{operation_id:'source-only'},'ORIGIN_INPUT_FRONTIER_SOURCE_UNAVAILABLE'],['final_seal_review',{operation_id:'source-only',frontier_ref:ref,root_result_ref:ref},'ORIGIN_FRONTIER_SEAL_SOURCE_UNAVAILABLE']])await unchanged(f,()=>invoke(req(f,action,input,{source_instruction:instruction}),runtime.peerOriginRuntimeAction),code(error));
});

// Conditional routing predecessors only. The actual HOST/public storage path
// must await the SAME fixed zero-argument Seal API before any positive route.
async function fixedSealSupportRoute(t){
 const f=await applied(t),entry=sourceFile('fixed-seal-support-route',`
export const trace=[];let resolve,reject,ready=false;const supportPromise=new Promise((yes,no)=>{resolve=yes;reject=no;}).then(()=>{ready=true;trace.push('support-ready');});
export const member=Object.freeze(new TypeError('SYNTHETIC original checkpoint member')),failure=Object.freeze(new AggregateError([member],'SYNTHETIC original checkpoint provider',{cause:member})),absent=Object.freeze(Object.assign(Error('SYNTHETIC checkpoint absent'),{code:'ORIGIN_FRONTIER_SEAL_CHECKPOINT_SOURCE_REQUIRED'}));
export function loadPeerOriginFrontierSealCheckpointSupport(...args){if(args.length)throw Error('SYNTHETIC fixed zero-argument support');trace.push('support');return supportPromise;}
export function settle(error){if(error)reject(error);else resolve();}
const mark=name=>{if(!ready)throw Error('SYNTHETIC support was not awaited');trace.push(name);};const api=Object.freeze({});
export function assertPeerOriginSelectedMaintenanceFrom(){mark('selected');return {};}
export function createPeerOriginFrontierSeal(){mark('factory');return api;}
export function runOriginalPeerOriginFrontierSealReview(value){if(value!==api)throw Error('SYNTHETIC exact API');mark('review');return {protocol:'SYNTHETIC routing-only',authority_issued:false};}
export function sealPeerOriginFromCheckedFrontier(value){if(value!==api)throw Error('SYNTHETIC exact API');mark('apply');return {protocol:'SYNTHETIC routing-only',authority_issued:false};}
`),support=await import(pathToFileURL(entry).href),runtime=await relocatedOriginRuntime({seal:entry,authority:entry,launch:entry}),reference={family:'work_items',id:'SYNTHETIC-unqualified-result',revision:1,sha256:'a'.repeat(64)};
 return {...f,support,runtime,args(action){return req(f,action,action==='final_seal_apply'?{review_ref:reference}:{operation_id:'SYNTHETIC-route',frontier_ref:reference,root_result_ref:reference},{source_instruction:instruction});}};
}
for(const action of ['final_seal_review','final_seal_apply']){
 test(action+' public ingress awaits fixed Seal support before selected authority factory or dispatch',async t=>{
  const f=await fixedSealSupportRoute(t),before=logicalState(f),pending=invoke(f.args(action),f.runtime.peerOriginRuntimeAction);pending.catch(()=>{});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.support.trace,['support']);assert.deepEqual(logicalState(f),before);
  f.support.settle();const result=await pending;assert.equal(result.authority_issued,false);assert.deepEqual(f.support.trace,['support','support-ready','selected','factory',action==='final_seal_apply'?'apply':'review']);assert.deepEqual(logicalState(f),before);
 });
 for(const failureKind of ['absent','provider'])test(action+' fixed support '+failureKind+' retains exact failure with no selected authority or charge',async t=>{
  const f=await fixedSealSupportRoute(t),before=logicalState(f),pending=invoke(f.args(action),f.runtime.peerOriginRuntimeAction);pending.catch(()=>{});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.support.trace,['support']);const failure=failureKind==='absent'?f.support.absent:f.support.failure;f.support.settle(failure);await assert.rejects(pending,error=>error===failure);assert.deepEqual(f.support.trace,['support']);assert.deepEqual(logicalState(f),before);
  if(failureKind==='provider'){assert.equal(failure.cause,f.support.member);assert.equal(failure.errors[0],f.support.member);}else assert.equal(failure.code,'ORIGIN_FRONTIER_SEAL_CHECKPOINT_SOURCE_REQUIRED');
 });
}

test('a PRESENT fixed native entry error retains exact AggregateError/cause/member identity despite missing-module code/url lookalikes',async t=>{
 const f=await applied(t),provider=sourceFile('throwing-provider',`export const child=Object.assign(new TypeError('SYNTHETIC original child'),{code:'ERR_MODULE_NOT_FOUND'});export const failure=new AggregateError([child],'SYNTHETIC original provider',{cause:child});export function setUrl(url){failure.code='ERR_MODULE_NOT_FOUND';failure.url=url;}`),providerModule=await import(pathToFileURL(provider).href),entry=sourceFile('present-native-entry',`import {failure,setUrl} from ${JSON.stringify(pathToFileURL(provider).href)};setUrl(import.meta.url);throw failure;`),runtime=await relocatedOriginRuntime({launch:entry});
 const args=req(f,'maintenance_run',{operation_id:'source-only',kind:'peer-origin-reconstruction',segments:[{source_id:'fictional',sha256:'a'.repeat(64),offset:0,length:1}]},{source_instruction:instruction});
 await unchanged(f,()=>invoke(args,runtime.peerOriginRuntimeAction),error=>error===providerModule.failure);assert.equal(providerModule.failure.cause,providerModule.child);assert.equal(providerModule.failure.errors[0],providerModule.child);assert.equal(providerModule.failure.url,pathToFileURL(entry).href);
});

test('missing selected-generation source/export and original provider failure Hold before positive range seal without renewal or writes',async t=>{
 const f=await applied(t),input={qualification_refs:[{family:'work_items',id:'fictional-unqualified-result',revision:1,sha256:'a'.repeat(64)}]},args=req(f,'range_seal',input,{source_instruction:instruction});
 for(const authority of [missingSourceFile(),sourceFile('no-selected-generation-export','export {};')]){const runtime=await relocatedOriginRuntime({authority});await unchanged(f,()=>invoke(args,runtime.peerOriginRuntimeAction),code('ORIGIN_SELECTED_MAINTENANCE_SOURCE_UNAVAILABLE'));}
 const provider=sourceFile('selected-generation-provider',`export const member=new TypeError('SYNTHETIC original selected-generation provider');export const failure=new AggregateError([member],'SYNTHETIC original selected-generation failure',{cause:member});export function assertPeerOriginSelectedMaintenanceFrom(){throw failure;}`),original=await import(pathToFileURL(provider).href),runtime=await relocatedOriginRuntime({authority:provider});
 await unchanged(f,()=>invoke(args,runtime.peerOriginRuntimeAction),error=>error===original.failure);assert.equal(original.failure.cause,original.member);assert.equal(original.failure.errors[0],original.member);
});
