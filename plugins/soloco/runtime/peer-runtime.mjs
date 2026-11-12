// Fixed public operator route. Model inputs select bounded DATA only. Native
// peer connections and effect clients are created exclusively by TaskHost.
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {types} from 'node:util';
import {PeerLedger,PEER_LAYOUT,PEER_PROTOCOL,canonical,peerDigest} from './peers/ledger.mjs';
import * as model from './peers/model.mjs';
import {reviewReference} from './peers/review-selection.mjs';
import {createOriginalPeerProductionProvider,peerProductionRecipe} from './peers/production-host.mjs';
import {createPeerProductionRouter} from './peers/production-router.mjs';
import {assertPeerPublicOwnerCustody} from './peers/owner-handover.mjs';
import {assertPeerOwnerOperatingState} from './peers/owner-operating-state.mjs';

const services=new Map(),starting=new Map();
const readActions=['status','inspect','read'];
const recordFamilies=['tasks','notices','messages','proposals','reviews','homes','deliveries','work_items','grants','conflicts'];
const PAGE_BYTES=24000;
const fail=(code,message=code)=>{throw Object.assign(Error(message),{code});};
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max&&!v.includes('\0')&&Buffer.from(v).toString('utf8')===v;
const copy=v=>JSON.parse(canonical(v));
function plain(value){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).some(k=>typeof k!=='string'))return false;
 return Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>Object.hasOwn(d,'value')&&d.enumerable);
}
function data(value,seen=new Set(),budget={nodes:0},depth=0){
 if(++budget.nodes>10000||depth>16)return false;
 if(value===null||typeof value==='string'||typeof value==='boolean')return true;
 if(typeof value==='number')return Number.isFinite(value);
 if(typeof value!=='object'||types.isProxy(value)||seen.has(value))return false;
 seen.add(value);
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
 if(Array.isArray(value)){
  if(Object.getPrototypeOf(value)!==Array.prototype||keys.some(k=>typeof k!=='string'||k!=='length'&&!/^(0|[1-9][0-9]*)$/.test(k))||keys.length!==value.length+1)return false;
 }else if(!plain(value))return false;
 return keys.every(k=>k==='length'&&Array.isArray(value)||Object.hasOwn(descriptors[k],'value')&&descriptors[k].enumerable&&data(descriptors[k].value,seen,budget,depth+1));
}
const fields={
 status:[],start:[],stop:[],tick:[],
 inspect:['family','part','status','principal_id','task_id','scope','limit','cursor'],
 read:['family','id','revision','sha256','part','offset','length'],
 enroll:['operation_id','enrollment_id','principal_id','role','host','scope','input_refs','expires_at','max_model_calls','expected_generation'],
 stage:['enrollment_id','phase','reviewer_principal_id','instruction'],
 activate:['operation_id','enrollment_id'],revoke:['operation_id','enrollment_id'],
 grant_create:['operation_id','grant_id','to_principal_id','scope','actions','resources','expires_at','max_model_calls'],
 grant_revoke:['operation_id','grant_id'],
 assign:['operation_id','task_id','to_principal_id','grant_id','grant_generation','scope','role','stage','instructions','acceptance','resources','input_refs','review_of','parent_task_id','outcome']
};
const required={inspect:['family'],read:['family','id','revision','sha256'],enroll:['operation_id','enrollment_id','principal_id','expires_at','expected_generation'],stage:['enrollment_id','phase','instruction'],activate:['operation_id','enrollment_id'],revoke:['operation_id','enrollment_id'],grant_create:['operation_id','grant_id','to_principal_id','actions','expires_at'],grant_revoke:['operation_id','grant_id'],assign:['operation_id','to_principal_id','grant_id','grant_generation','role','instructions','acceptance']};
const exactReference={type:'object',properties:{family:{enum:['tasks','homes','proposals','reviews','conflicts','notices','messages','deliveries']},id:{type:'string',minLength:1,maxLength:2000},revision:{type:'integer',minimum:1},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'}},required:['family','id','revision','sha256'],additionalProperties:false};
const boundedString=maxLength=>({type:'string',minLength:1,maxLength});
const inputProperties={operation_id:boundedString(160),enrollment_id:boundedString(200),principal_id:boundedString(200),role:boundedString(100),host:{enum:['codex','claude']},scope:boundedString(160),input_refs:{type:'array',maxItems:100,items:exactReference},expires_at:boundedString(100),max_model_calls:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},expected_generation:{type:'integer',minimum:0},phase:{enum:['reconstruction','review']},reviewer_principal_id:boundedString(200),instruction:boundedString(64000),task_id:boundedString(200),to_principal_id:boundedString(200),grant_id:boundedString(200),grant_generation:{type:'integer',minimum:1},actions:{type:'array',minItems:1,maxItems:100,items:boundedString(100)},stage:boundedString(40),instructions:boundedString(20000),acceptance:boundedString(4000),resources:{type:'array',maxItems:32,items:boundedString(2000)},review_of:exactReference,parent_task_id:boundedString(200),outcome:{type:'object'}};
Object.assign(inputProperties,{family:{enum:recordFamilies},part:{enum:['value','result']},id:boundedString(2000),revision:{type:'integer',minimum:1},sha256:{type:'string',pattern:'^[a-f0-9]{64}$',minLength:64,maxLength:64},offset:{type:'integer',minimum:0},length:{type:'integer',minimum:1,maximum:4096},limit:{type:'integer',minimum:1,maximum:50},cursor:boundedString(16000),status:boundedString(160)});
export const peerRuntimeFields=Object.freeze({action:{enum:Object.keys(fields)},epoch:{type:'integer',minimum:1},source_instruction:boundedString(4000),input:{type:'object',properties:inputProperties,additionalProperties:false}});

function request(args,host){
 if(!data(args))fail('PEER_RUNTIME_INPUT','Only bounded plain JSON DATA is accepted');
 if(!plain(args)||Object.keys(args).some(k=>!['root','session_id','action','epoch','source_instruction','input'].includes(k))||!Object.hasOwn(fields,args.action)||!['codex','claude'].includes(host)||!path.isAbsolute(args.root??'')||!text(args.session_id,200)||!Number.isSafeInteger(args.epoch)||args.epoch<1)fail('PEER_RUNTIME_INPUT','Closed peer request and current operator epoch required');
 if(!readActions.includes(args.action)&&!text(args.source_instruction,4000)||args.source_instruction!==undefined&&!text(args.source_instruction,4000))fail('PEER_RUNTIME_INPUT','Exact bounded operator instruction required');
 const a=args.input??{};
 if(!plain(a)||Object.keys(a).some(k=>!fields[args.action].includes(k))||required[args.action]?.some(k=>a[k]===undefined))fail('PEER_RUNTIME_INPUT','Closed action-specific peer DATA required');
 for(const [key,value]of Object.entries(a)){
  const rule=inputProperties[key];
  if(rule.type==='string'&&!text(value,rule.maxLength)||rule.type==='integer'&&(!Number.isSafeInteger(value)||value<rule.minimum||value>(rule.maximum??Number.MAX_SAFE_INTEGER))||rule.enum&&!rule.enum.includes(value))fail('PEER_RUNTIME_INPUT',`Invalid ${key}`);
  if(rule.pattern&&!new RegExp(rule.pattern).test(value))fail('PEER_RUNTIME_INPUT',`Invalid ${key}`);
  if(key==='input_refs'){if(!Array.isArray(value)||value.length>100)fail('PEER_RUNTIME_INPUT');for(const r of value)reviewReference(r);}
  if(key==='review_of')reviewReference(value);
  if(key==='resources'&&(!Array.isArray(value)||value.length>32||value.some(v=>!text(v,2000))))fail('PEER_RUNTIME_INPUT');
  if(key==='actions'&&(!Array.isArray(value)||value.length<1||value.length>100||value.some(v=>!text(v,100))))fail('PEER_RUNTIME_INPUT');
  if(key==='outcome'&&(!value||Object.getPrototypeOf(value)!==Object.prototype||Buffer.byteLength(canonical(value))>8000))fail('PEER_RUNTIME_INPUT');
 }
 if(args.action==='stage'&&(a.phase==='review'?!text(a.reviewer_principal_id,200):a.reviewer_principal_id!==undefined))fail('PEER_RUNTIME_INPUT');
 if(a.part==='result'&&a.family!=='tasks')fail('PEER_RUNTIME_INPUT','The static result part is available only for tasks');
 if(Buffer.byteLength(canonical(args))>100000)fail('PEER_RUNTIME_INPUT','Peer request exceeds bounded encoded DATA');
 return copy(a);
}

function storage(root){
 const canonicalRoot=fs.realpathSync(root),directory=path.join(canonicalRoot,'.company'),file=path.join(directory,'company.sqlite');
 if(!fs.statSync(canonicalRoot).isDirectory())fail('PEER_ADOPTION_REQUIRED');
 for(const candidate of [directory,file,file+'-wal',file+'-shm']){
  try{if(fs.lstatSync(candidate).isSymbolicLink())fail('PEER_STORAGE_LINK');}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 if(!fs.existsSync(file))fail('PEER_ADOPTION_REQUIRED','Existing checked peer adoption required; this route never initializes storage');
 return {root:canonicalRoot,file};
}
function operator(tx,args,host,ledger){
 const c=tx.get('control','company'),p=c&&tx.get('principals',c.value.founder_principal_id),legacy=p?.value.legacy_owner;
 if(c?.value.protocol!==PEER_PROTOCOL||p?.value.kind!=='founder'||p.value.status!=='active'||p.value.host!==host||!text(p.value.native_id,300)||legacy?.host!==host||legacy.session_id!==args.session_id||legacy.epoch!==args.epoch)fail('PEER_OPERATOR_REQUIRED','Current canonical founder operator and adopted owning session required');
 const view={...tx,connection:{root:ledger.root,company_id:ledger.company_id,directory:ledger.directory}};
 assertPeerPublicOwnerCustody(view);
 if(!readActions.includes(args.action)&&args.action!=='stop')assertPeerOwnerOperatingState(view,'peer/runtime-'+args.action);
 return {control:c,principal:p,authority:peerDigest({company:c.value.founder_principal_id,principal:p})};
}
function readonly(root,args,host,fn){
 const where=storage(root);let db;
 try{
  db=new DatabaseSync(where.file,{readOnly:true});
  const names=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
  if(!names.has('company_layout')||!names.has('peer_meta'))fail('PEER_ADOPTION_REQUIRED','Existing checked layout-5 adoption required');
  if(db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version!==PEER_LAYOUT||db.prepare('SELECT protocol FROM peer_meta WHERE id=1').get()?.protocol!==PEER_PROTOCOL)fail('PEER_ADOPTION_REQUIRED','Existing checked layout-5 adoption required');
  const ledger=new PeerLedger(where.root,{connection:db});
  const authenticated=ledger.read(tx=>operator(tx,args,host,ledger));
  return fn({ledger,...authenticated});
 }finally{db?.close();}
}
const boundary=(s,n)=>!(n>0&&n<s.length&&/[\uD800-\uDBFF]/.test(s[n-1])&&/[\uDC00-\uDFFF]/.test(s[n]));
function selectedRecord(family,row,part){
 const source={family,id:row.id,revision:row.revision,sha256:row.sha256,part};
 if(part==='result'&&(!row.value||typeof row.value!=='object'||!Object.hasOwn(row.value,'result')))return {source:{...source,available:false},body:null};
 const value=part==='result'?row.value.result:row.value,body=canonical(value);
 return {body,source:{...source,available:true,content_sha256:peerDigest(value),total_characters:body.length,utf8_bytes:Buffer.byteLength(body),read:{tool:'company_peers',action:'read'}}};
}
function recordMetadata(family,row,part){
 const item={source:selectedRecord(family,row,part).source},omitted=[];
 for(const key of ['kind','status','scope','principal_id','owner_principal_id','task_id','role','stage']){
  if(row.value?.[key]===undefined)continue;
  if(text(row.value[key],200))item[key]=row.value[key];else omitted.push(key);
 }
 if(omitted.length)item.fields_not_inlined=omitted;
 return item;
}
function inspectRecords(tx,company_id,input){
 const {family,part='value',cursor}=input,filters={};
 for(const key of ['status','principal_id','task_id','scope'])if(input[key]!==undefined)filters[key]=input[key];
 let limit=input.limit??20;
 for(;;){
  const page=tx.list(family,{...filters,limit,...(cursor?{cursor}:{})});
  const result={protocol:'peer-record-page-v1',company_id,family,part,items:page.items.map(row=>recordMetadata(family,row,part)),total:page.total,returned:page.items.length,complete:page.complete,next_cursor:page.next_cursor,effective_limit:limit};
  if(Buffer.byteLength(JSON.stringify(result))<=PAGE_BYTES)return result;
  if(limit===1)fail('PEER_RECORD_CAPACITY','Exact record metadata exceeds the public page budget');
  limit=Math.max(1,Math.floor(limit/2));
 }
}
function readRecord(tx,company_id,input){
 const row=tx.get(input.family,input.id);
 if(!row||row.revision!==input.revision||row.sha256!==input.sha256)fail('PEER_RECORD_CHANGED','Current peer record revision/hash changed; inspect again. Historical fallback is unavailable');
 const selected=selectedRecord(input.family,row,input.part??'value'),{body,source}=selected;
 if(!source.available)fail('PEER_RECORD_PART_MISSING','This current task has no persisted result');
 const offset=input.offset??0,length=input.length??4096;
 if(offset>body.length||!boundary(body,offset))fail('PEER_RECORD_RANGE','Exact offset must be a current Unicode boundary');
 let end=Math.min(body.length,offset+length);if(!boundary(body,end))end--;
 if(end===offset&&offset<body.length)fail('PEER_RECORD_RANGE','Length must include a complete Unicode character');
 const result={protocol:'peer-record-read-v1',company_id,source,offset,text:body.slice(offset,end),next_offset:end,complete:end===body.length};
 if(Buffer.byteLength(JSON.stringify(result))>PAGE_BYTES)fail('PEER_RECORD_CAPACITY','Exact record range exceeds the public reply budget');
 return result;
}
function live(service,args,host){
 const authority=service.ledger.read(tx=>operator(tx,args,host,service.ledger));
 if(authority.authority!==service.authority)fail('PEER_OPERATOR_CHANGED','Runtime operator incarnation changed; stop and inspect');
 return authority;
}
function audit(service,args,host,event,{current=false}={}){
 const principal=service.ledger.read(tx=>operator(tx,args,host,service.ledger).principal.id);
 return service.ledger.write(event,principal,tx=>{
  const actual=operator(tx,args,host,service.ledger);if(actual.principal.id!==principal||!current&&actual.authority!==service.authority)fail('PEER_OPERATOR_CHANGED');
  tx.event(event,{source_instruction:args.source_instruction,session_id:args.session_id,epoch:args.epoch});
 });
}
function drainStopped(root,service){
 if(!service.drainPromise)service.drainPromise=service.router.drain(service.owner).then(()=>{
  service.ledger.close();if(services.get(root)===service)services.delete(root);
 }).catch(error=>{service.drain_error=String(error?.code??error?.message??error).slice(0,300);});
 return service.drainPromise;
}

export async function peerRuntimeAction(args,host){
 const input=request(args,host);
 if(['inspect','read'].includes(args.action))return readonly(args.root,args,host,({ledger})=>ledger.read(tx=>{
  operator(tx,args,host,ledger);
  return args.action==='inspect'?inspectRecords(tx,ledger.company_id,input):readRecord(tx,ledger.company_id,input);
 }));
 // Read-only preflight precedes every write connection or provider construction.
 const checked=readonly(args.root,args,host,({ledger,principal,control,authority})=>({root:ledger.root,company_id:ledger.company_id,principal_id:principal.id,authority,...(args.action==='status'?{state:model.inspect(ledger,{principal_id:principal.id},'runtime/status'),recipe_present:Boolean(control.value.activation?.environment?.peer_runtime)}:{})}));
 if(args.action==='status'){
  const service=services.get(checked.root),local=service?.router.snapshot(service.owner);
  return {protocol:'peer-production-runtime-v1',company_id:checked.company_id,...checked.state,started:Boolean(service&&!service.stopping&&!local.stopped&&service.authority===checked.authority),held:Boolean(local?.stopped&&!service?.stopping),stopping:Boolean(service?.stopping),operator_changed:Boolean(service&&service.authority!==checked.authority),starting:starting.has(checked.root),...(local?{router:local}:{}),launch_recipe_present:checked.recipe_present,...(service?.drain_error?{drain_error:service.drain_error}:{}),qualification:'Source routing status only; native acceptance and physical closure are separate'};
 }
 if(args.action==='start'){
  if(services.has(checked.root)){
   const existing=services.get(checked.root);if(existing.stopping)fail('PEER_RUNTIME_STOPPING','Prior local runtime drain remains held');live(existing,args,host);
   const local=existing.router.snapshot(existing.owner);
   if(local.stopped)return {started:false,already_started:false,held:true,code:'PEER_RUNTIME_HELD',company_id:checked.company_id,router:local,physical_closure:'UNKNOWN'};
   return {started:true,already_started:true,company_id:checked.company_id};
  }
  if(starting.has(checked.root))fail('PEER_RUNTIME_STARTING');
  const marker={cancelled:false};starting.set(checked.root,marker);let ledger,provider,router,owner;
  try{
   ledger=new PeerLedger(checked.root);
   const current=ledger.read(tx=>operator(tx,args,host,ledger));if(current.authority!==checked.authority)fail('PEER_OPERATOR_CHANGED');
   peerProductionRecipe(current.control.value);
   if(typeof model.bindPeerProductionScheduler!=='function')fail('PEER_OPERATOR_PRODUCER_HELD','Original atomic operator authority producer required');
   const boundModel=model.bindPeerProductionScheduler(ledger);
   owner=Symbol('original-peer-production-owner');provider=createOriginalPeerProductionProvider({owner,ledger});
   await provider.initialize();
   if(marker.cancelled)fail('PEER_RUNTIME_START_CANCELLED');
   const service={ledger,owner,provider,model:boundModel,principal_id:current.principal.id,authority:current.authority};
   live(service,args,host);router=createPeerProductionRouter({owner,ledger,provider});service.router=router;
   audit(service,args,host,'peer.production.started');
   router.start(owner);services.set(checked.root,service);
   return {started:true,company_id:ledger.company_id,qualification:'Reviewed source composition loaded; each native admission retains its own grants, budgets and physical closure checks'};
  }catch(error){if(router)await router.stop(owner);ledger?.close();throw error;}
  finally{if(starting.get(checked.root)===marker)starting.delete(checked.root);}
 }
 const service=services.get(checked.root);
 if(!service){if(args.action==='stop'){const pending=starting.get(checked.root);if(pending)pending.cancelled=true;return {stopped:true,already_stopped:!pending,pending_preparation:Boolean(pending),physical_closure:'UNKNOWN'};}fail('PEER_RUNTIME_NOT_STARTED','Explicit company_peers start is required');}
 if(args.action==='stop'){
  audit(service,args,host,'peer.production.stopped',{current:true});
  service.stopping=true;const result=await service.router.stop(service.owner);
  // Closing a local connection waits for its own outstanding work, without
  // interpreting settled promises as process/domain closure.
  void drainStopped(checked.root,service);
  return {...result,physical_closure:'UNKNOWN'};
 }
 if(service.stopping)fail('PEER_RUNTIME_STOPPING','Prior local runtime drain remains held');
 live(service,args,host);
 if(['tick','stage'].includes(args.action))audit(service,args,host,'peer.production.'+args.action+'.requested');
 if(args.action==='tick')return service.router.tick(service.owner);
 const modelAction={assign:'task/assign',grant_create:'grant/create',grant_revoke:'grant/revoke'}[args.action];
 if(modelAction)return service.model.execute(service.ledger,{principal_id:service.principal_id},modelAction,{...input,source_instruction:args.source_instruction});
 return service.router[args.action](service.owner,{...input,...(args.action==='stage'?{}:{source_instruction:args.source_instruction})});
}

// Trusted MCP-host lifecycle only. This function is not exposed as a model tool
// and does not confer an operator token, native identity or closure proof.
export function stopPeerRuntimeHosts(){
 for(const pending of starting.values())pending.cancelled=true;
 for(const [root,service]of services){
  service.stopping=true;
  void service.router.stop(service.owner).then(()=>drainStopped(root,service)).catch(error=>{service.drain_error=String(error?.code??error?.message??error).slice(0,300);});
 }
}
