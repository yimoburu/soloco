import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {types} from 'node:util';
import {digest,owner} from './store.mjs';
import {withLegacyPublicStore} from './peer-owner-runtime.mjs';
import {requireCodexRootActor} from './mcp-host-context.mjs';
import {DEFAULT_DEVELOPMENT_BYTES,MAX_DEVELOPMENT_BYTES} from './development-limits.mjs';

const PROTOCOL='legacy-development-budget-v1',KEY='development_budget_control';
const POLICY='retain-original-explicit-cas-restore',MAX_RESULT=24000,MAX_OPERATIONS=64;
const MAX_STATE_BYTES=1100000,TERMINAL_RESERVE=20000;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const OPTIONS={rootKeys:['id','schema','runtime_version','plugin_version','governance','team_sha256','roles','cos_instructions','owner','revision','updated_at',KEY],entities:{upgrade:['status']}};
const fail=(code,message=code)=>{throw Object.assign(Error(message),{code});};
const need=(condition,code)=>{if(!condition)fail(code);};
const encoded=value=>JSON.stringify(value),size=value=>Buffer.byteLength(typeof value==='string'?value:encoded(value));
const copy=value=>JSON.parse(encoded(value));
const reference=value=>({id:value.id,revision:value.revision,sha256:digest(encoded(value))});
const frozen=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))frozen(child);Object.freeze(value);}return value;};
function data(value,keys,required=keys){
 need(value&&typeof value==='object'&&!types.isProxy(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)),'DEVELOPMENT_BUDGET_INPUT');
 const out={};
 for(const key of Reflect.ownKeys(value)){
  const d=Object.getOwnPropertyDescriptor(value,key);
  need(typeof key==='string'&&keys.includes(key)&&d.enumerable&&Object.hasOwn(d,'value'),'DEVELOPMENT_BUDGET_INPUT');out[key]=d.value;
 }
 for(const key of required)need(Object.hasOwn(out,key),'DEVELOPMENT_BUDGET_INPUT');return out;
}
function text(value,max=1000){need(typeof value==='string'&&value.trim()&&value.length<=max&&!value.includes('\0')&&Buffer.from(value).toString('utf8')===value,'DEVELOPMENT_BUDGET_INPUT');return value;}
function ref(value){const r=data(value,['id','revision','sha256']);need(typeof r.id==='string'&&/^budget-[a-f0-9-]{36}$/.test(r.id)&&Number.isSafeInteger(r.revision)&&r.revision>0&&typeof r.sha256==='string'&&SHA.test(r.sha256),'DEVELOPMENT_BUDGET_INPUT');return {id:r.id,revision:r.revision,sha256:r.sha256};}
function configRef(value){const r=data(value,['exists','sha256','bytes','max_bytes_ceiling','snapshot_sha256']);need(typeof r.exists==='boolean'&&Number.isSafeInteger(r.bytes)&&r.bytes>=0&&r.bytes<=4096&&typeof r.snapshot_sha256==='string'&&SHA.test(r.snapshot_sha256)&&Number.isSafeInteger(r.max_bytes_ceiling)&&r.max_bytes_ceiling>=1000&&r.max_bytes_ceiling<=MAX_DEVELOPMENT_BYTES&&(r.exists?typeof r.sha256==='string'&&SHA.test(r.sha256):r.sha256===null&&r.bytes===0&&r.max_bytes_ceiling===DEFAULT_DEVELOPMENT_BYTES),'DEVELOPMENT_BUDGET_INPUT');return {exists:r.exists,sha256:r.sha256,bytes:r.bytes,max_bytes_ceiling:r.max_bytes_ceiling,snapshot_sha256:r.snapshot_sha256};}
function actorInput(value){const a=data(value,['host','session_id','native_id']);need(a.host==='codex'&&typeof a.session_id==='string'&&UUID.test(a.session_id)&&a.native_id===a.session_id,'DEVELOPMENT_BUDGET_ACTOR');observed(a);return {host:a.host,session_id:a.session_id,native_id:a.native_id};}
function observed(actor){const actual=requireCodexRootActor({host:actor.host,session_id:actor.session_id});need(actual.host===actor.host&&actual.session_id===actor.session_id&&actual.native_id===actor.native_id,'DEVELOPMENT_BUDGET_ACTOR');}
function input(value,keys,optional=[]){const a=data(value,['epoch',...keys,...optional],['epoch',...keys]);need(Number.isSafeInteger(a.epoch)&&a.epoch>0,'DEVELOPMENT_BUDGET_INPUT');if(Object.hasOwn(a,'source_instruction'))text(a.source_instruction);return a;}
function same(a,b){return encoded(a)===encoded(b);}
function identity(s){return {dev:String(s.dev),ino:String(s.ino),mode:String(s.mode),nlink:String(s.nlink),size:String(s.size),mtime_ns:String(s.mtimeNs),ctime_ns:String(s.ctimeNs)};}
function sameNode(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.mode===b.mode;}
const nodeIdentity=s=>({dev:s.dev,ino:s.ino,mode:s.mode});
function stat(file){try{return fs.lstatSync(file,{bigint:true});}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function flags(){const c=fs.constants;need([c.O_NOFOLLOW,c.O_NONBLOCK,c.O_DIRECTORY].every(Number.isInteger),'DEVELOPMENT_BUDGET_FILESYSTEM_UNSUPPORTED');return c;}
function directory(file,pins){const s=stat(file);need(s?.isDirectory()&&!s.isSymbolicLink(),'DEVELOPMENT_BUDGET_DIRECTORY_CHANGED');const c=flags(),fd=fs.openSync(file,c.O_RDONLY|c.O_DIRECTORY|c.O_NOFOLLOW|c.O_NONBLOCK);pins.fds.push(fd);need(sameNode(identity(s),identity(fs.fstatSync(fd,{bigint:true}))),'DEVELOPMENT_BUDGET_DIRECTORY_CHANGED');return {file,fd,identity:identity(s)};}
function stable(pins){for(const d of pins.directories){const named=stat(d.file),held=fs.fstatSync(d.fd,{bigint:true});need(named?.isDirectory()&&!named.isSymbolicLink()&&held.isDirectory()&&sameNode(d.identity,identity(named))&&sameNode(d.identity,identity(held)),'DEVELOPMENT_BUDGET_DIRECTORY_CHANGED');}}
function readFd(fd){const before=fs.fstatSync(fd,{bigint:true});need(before.isFile()&&before.nlink===1n&&before.size>=0n&&before.size<=4096n,'DEVELOPMENT_BUDGET_CONFIG_FILE');const b=Buffer.alloc(4097);let n=0;while(n<b.length){const got=fs.readSync(fd,b,n,b.length-n,n);if(!got)break;n+=got;}const after=fs.fstatSync(fd,{bigint:true});need(n<=4096&&BigInt(n)===before.size&&same(identity(before),identity(after)),'DEVELOPMENT_BUDGET_CONFIG_CHANGED');return {bytes:b.subarray(0,n),identity:identity(after)};}
function readFile(file,pins){const named=stat(file);if(!named)return null;need(named.isFile()&&!named.isSymbolicLink()&&named.nlink===1n&&named.size<=4096n,'DEVELOPMENT_BUDGET_CONFIG_FILE');const c=flags(),fd=fs.openSync(file,c.O_RDONLY|c.O_NOFOLLOW|c.O_NONBLOCK);pins.fds.push(fd);const held=fs.fstatSync(fd,{bigint:true});need(same(identity(named),identity(held)),'DEVELOPMENT_BUDGET_CONFIG_CHANGED');const r=readFd(fd),after=stat(file);need(after&&same(r.identity,identity(after)),'DEVELOPMENT_BUDGET_CONFIG_CHANGED');return {...r,fd};}
function config(store,pins){
 stable(pins);const found=readFile(path.join(store.dir,'development.json'),pins);let maximum=DEFAULT_DEVELOPMENT_BYTES;
 if(found){const t=found.bytes.toString('utf8');need(Buffer.from(t).equals(found.bytes),'DEVELOPMENT_BUDGET_CONFIG_UTF8');let v;try{v=JSON.parse(t);}catch{fail('DEVELOPMENT_BUDGET_CONFIG_JSON');}need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===1&&Object.hasOwn(v,'max_bytes_ceiling')&&Number.isSafeInteger(v.max_bytes_ceiling)&&v.max_bytes_ceiling>=1000&&v.max_bytes_ceiling<=MAX_DEVELOPMENT_BYTES,'DEVELOPMENT_BUDGET_CONFIG_RANGE');maximum=v.max_bytes_ceiling;}
 const capture={exists:Boolean(found),sha256:found?digest(found.bytes):null,bytes:found?.bytes.length??0,max_bytes_ceiling:maximum,identity:found?.identity??null,raw_base64:found?found.bytes.toString('base64'):null};
 const publicRef={exists:capture.exists,sha256:capture.sha256,bytes:capture.bytes,max_bytes_ceiling:maximum,snapshot_sha256:digest(encoded({root:nodeIdentity(pins.directories[0].identity),company:nodeIdentity(pins.directories[1].identity),...capture}))};stable(pins);return {...capture,ref:publicRef};
}
function namespace(s){
 const value=s[KEY];if(value===undefined)return {protocol:PROTOCOL,revision:0,generation:0,latest_effect_id:null,active_intent_id:null,operations:[]};
 need(value&&value.protocol===PROTOCOL&&Number.isSafeInteger(value.revision)&&value.revision>=0&&Number.isSafeInteger(value.generation)&&value.generation>=0&&Array.isArray(value.operations)&&value.operations.length<=MAX_OPERATIONS&&size(value)<=MAX_STATE_BYTES,'DEVELOPMENT_BUDGET_STATE');
 const ids=new Set();for(const o of value.operations){need(o&&typeof o.id==='string'&&/^budget-[a-f0-9-]{36}$/.test(o.id)&&!ids.has(o.id)&&Number.isSafeInteger(o.revision)&&o.revision>0&&o.protocol===PROTOCOL&&Array.isArray(o.phases)&&o.phases.length<=40&&['proposed','prepared','staged','applied','reconciled_applied','not_applied','conflict'].includes(o.status),'DEVELOPMENT_BUDGET_STATE');ids.add(o.id);}
 need(value.active_intent_id===null||ids.has(value.active_intent_id),'DEVELOPMENT_BUDGET_STATE');need(value.latest_effect_id===null||ids.has(value.latest_effect_id),'DEVELOPMENT_BUDGET_STATE');return value;
}
function exact(n,r){const o=n.operations.find(o=>o.id===r.id);need(o&&same(reference(o),r),'DEVELOPMENT_BUDGET_STALE_REFERENCE');return o;}
function phase(o,status,detail={}){need(o.phases.length<40,'DEVELOPMENT_BUDGET_AUDIT_CAPACITY');o.status=status;o.revision++;o.phases.push({status,at:new Date().toISOString(),...detail});}
function authorized(s,actor,epoch){observed(actor);owner(s,actor.session_id,actor.host,epoch);need(typeof s.id==='string','DEVELOPMENT_BUDGET_COMPANY');}
function result(value){const out={protocol:PROTOCOL,authority_granted:false,scope_changed:false,grants_changed:false,...value};need(size(out)<=MAX_RESULT,'DEVELOPMENT_BUDGET_RESULT_CAPACITY');return frozen(out);}
function hold(operationId,lastConfirmed,error,attempted){return result({status:'held',code:'DEVELOPMENT_BUDGET_OUTCOME_UNCERTAIN',operation_id:operationId,last_confirmed_ref:lastConfirmed??null,last_confirmed_ref_may_be_stale:true,persistence:'unknown; the attempted preparation might not have committed',external_outcome:attempted?'unknown':'config replacement not attempted; retained preparation may be partial',original_call_success_inferred:false,diagnostic:{code:typeof error?.code==='string'&&/^[A-Za-z0-9_]{1,64}$/.test(error.code)?error.code:'UNKNOWN',message_sha256:digest(String(error?.message??'Unknown original failure'))},retrieval:{operation:'inspect',operation_id:operationId,lookup:'Use current active_intent or find operation_id in the complete paged operation list. The last confirmed ref may be stale or no preparation may be present.',next:'Read the current exact ref. Reconcile only a current active intent; terminal records are observed facts, never success of the original RPC. Do not repeat apply or restore.'}});}
function summary(o){return {ref:reference(o),kind:o.kind,status:o.status,company_id:o.company_id,created_at:o.created_at,owner:o.actor,from_max_bytes:o.before.max_bytes_ceiling,to_max_bytes:o.target.max_bytes_ceiling};}
async function using(root,actor,a,fn){
 need(typeof root==='string'&&root.length<=4096&&!root.includes('\0')&&Buffer.from(root).toString('utf8')===root&&path.isAbsolute(root),'DEVELOPMENT_BUDGET_INPUT');observed(actor);
 return withLegacyPublicStore(root,async store=>{
  const pins={fds:[],directories:[]};let primary,failed=false,value;
  try{pins.directories.push(directory(store.root,pins),directory(store.dir,pins));const sync=store.db.prepare('PRAGMA synchronous').get();need(Object.values(sync)[0]>=2,'DEVELOPMENT_BUDGET_DURABILITY_REQUIRED');value=await fn(store,pins);}
  catch(error){failed=true;primary=error;}
  const errors=[];for(const fd of pins.fds.reverse())try{fs.closeSync(fd);}catch(error){errors.push(error);}
  if(failed){if(errors.length)throw new AggregateError([primary,...errors],'Budget operation and descriptor cleanup failed',{cause:primary});throw primary;}
  if(errors.length)throw errors.length===1?errors[0]:new AggregateError(errors,'Budget descriptor cleanup failed');return value;
 });
}
function snapshot(store,actor,a,fn){return store.readSnapshot(()=>{const s=store.readSelected(OPTIONS);authorized(s,actor,a.epoch);return fn(s,namespace(s));});}
function write(store,pins,actor,a,type,fn,final){return store.selectedTransaction('development.budget.'+type,OPTIONS,s=>{authorized(s,actor,a.epoch);const n=namespace(s),value=fn(s,n);n.revision++;need(size(n)<=MAX_STATE_BYTES,'DEVELOPMENT_BUDGET_AUDIT_CAPACITY');s[KEY]=n;return value;},{beforeCommit:()=>{const fresh=store.readSelected(OPTIONS);authorized(fresh,actor,a.epoch);namespace(fresh);stable(pins);if(final)final();}});}
function pending(n){need(n.active_intent_id===null,'DEVELOPMENT_BUDGET_RECONCILE_REQUIRED');}
function noLater(n,o){need(n.latest_effect_id===o.id&&n.generation===o.applied_generation,'DEVELOPMENT_BUDGET_LATER_CONFIGURATION');}
function expected(current,r){need(same(current.ref,r),'DEVELOPMENT_BUDGET_CONFIG_CAS');}
function evidence(store,pins){const file=path.join(store.dir,'development-budget'),s=stat(file);if(!s){stable(pins);fs.mkdirSync(file,{mode:0o700});}const d=directory(file,pins),held=fs.fstatSync(d.fd,{bigint:true});need((held.mode&0o077n)===0n&&(typeof process.getuid!=='function'||held.uid===BigInt(process.getuid())),'DEVELOPMENT_BUDGET_EVIDENCE_DIRECTORY');pins.directories.push(d);stable(pins);return d;}
function exclusive(file,body,pins){stable(pins);const c=flags(),fd=fs.openSync(file,c.O_RDWR|c.O_CREAT|c.O_EXCL|c.O_NOFOLLOW|c.O_NONBLOCK,0o600);pins.fds.push(fd);let offset=0;while(offset<body.length){const count=fs.writeSync(fd,body,offset,body.length-offset,offset);need(Number.isInteger(count)&&count>0,'DEVELOPMENT_BUDGET_WRITE');offset+=count;}fs.fsyncSync(fd);const r=readFd(fd);need(r.bytes.equals(body),'DEVELOPMENT_BUDGET_STAGE_CHANGED');return {file,fd,identity:r.identity,sha256:digest(body),bytes:body.length};}
function fileMatches(record,found){return Boolean(found&&sameNode(record.identity,found.identity)&&record.bytes===found.bytes.length&&record.sha256===digest(found.bytes));}
function targetOf(raw){return raw===null?{exists:false,raw_base64:null,sha256:null,bytes:0,max_bytes_ceiling:DEFAULT_DEVELOPMENT_BYTES}:{exists:true,raw_base64:raw.toString('base64'),sha256:digest(raw),bytes:raw.length,max_bytes_ceiling:JSON.parse(raw.toString('utf8')).max_bytes_ceiling};}

export async function inspectLegacyDevelopmentBudget(root,sourceActor,value){
 const actor=actorInput(sourceActor),a=input(value,[],['ref','cursor','limit','canonical_sha256','offset','length']);if(a.ref!==undefined)a.ref=ref(a.ref);need(!(a.ref!==undefined&&(a.cursor!==undefined||a.limit!==undefined)),'DEVELOPMENT_BUDGET_INPUT');
 const ranged=['canonical_sha256','offset','length'].some(k=>Object.hasOwn(a,k));
 if(ranged)need(a.ref&&typeof a.canonical_sha256==='string'&&a.canonical_sha256===a.ref.sha256&&Number.isSafeInteger(a.offset)&&a.offset>=0&&Number.isSafeInteger(a.length)&&a.length>=1&&a.length<=4096,'DEVELOPMENT_BUDGET_INPUT');
 if(a.limit!==undefined)need(Number.isSafeInteger(a.limit)&&a.limit>=1&&a.limit<=20,'DEVELOPMENT_BUDGET_INPUT');if(a.cursor!==undefined)text(a.cursor,300);
 return using(root,actor,a,(store,pins)=>snapshot(store,actor,a,(s,n)=>{
  const c=config(store,pins),basis=digest(encoded(n));
  if(a.ref){
   const o=exact(n,a.ref),body=encoded(o),split=i=>i>0&&i<body.length&&/[\uD800-\uDBFF]/.test(body[i-1])&&/[\uDC00-\uDFFF]/.test(body[i]);
   if(ranged){need(a.offset<body.length&&!split(a.offset),'DEVELOPMENT_BUDGET_RANGE');let end=Math.min(body.length,a.offset+a.length);if(split(end))end--;need(end>a.offset,'DEVELOPMENT_BUDGET_RANGE');return result({status:'read',company_id:s.id,ref:a.ref,canonical_sha256:a.ref.sha256,total_characters:body.length,total_utf8_bytes:size(body),offset:a.offset,length:end-a.offset,text:body.slice(a.offset,end),complete:end===body.length,next_offset:end<body.length?end:null,range_unit:'UTF16; exact surrogate-safe canonical JSON'});}
   const full={status:'inspected',company_id:s.id,configuration:c.ref,operation:copy(o),ref:a.ref};
   if(size({protocol:PROTOCOL,authority_granted:false,scope_changed:false,grants_changed:false,...full})>MAX_RESULT)return result({status:'held',code:'DEVELOPMENT_BUDGET_RESULT_CAPACITY',ref:a.ref,canonical_sha256:a.ref.sha256,total_characters:body.length,total_utf8_bytes:size(body),retrieval:{ref:a.ref,canonical_sha256:a.ref.sha256,offset:0,length:4096},complete:false,changes_configuration:false});
   return result(full);
  }
  let start=0;if(a.cursor!==undefined){let cur;try{cur=JSON.parse(Buffer.from(a.cursor,'base64url').toString('utf8'));}catch{fail('DEVELOPMENT_BUDGET_CURSOR');}const v=data(cur,['basis','offset']);need(v.basis===basis&&Number.isSafeInteger(v.offset)&&v.offset>=0&&v.offset<=n.operations.length,'DEVELOPMENT_BUDGET_CURSOR');start=v.offset;}
  const limit=a.limit??10,items=n.operations.slice(start,start+limit),next=start+items.length;
  return result({status:'inspected',company_id:s.id,configuration:c.ref,generation:n.generation,active_intent:n.active_intent_id?reference(n.operations.find(o=>o.id===n.active_intent_id)):null,operations:items.map(summary),total:n.operations.length,complete:next===n.operations.length,next_cursor:next<n.operations.length?Buffer.from(encoded({basis,offset:next})).toString('base64url'):null,context_policy:'Budget audit remains compulsory current extension evidence; no context exemption is granted.',serialization:'Checked filesystem CAS under the original SQLite writer; not atomic against uncoordinated external writers.'});
 }));
}

export async function proposeLegacyDevelopmentBudget(root,sourceActor,value){
 const actor=actorInput(sourceActor),a=input(value,['max_bytes_ceiling','expected_config','source_instruction','restoration_policy']);need(Number.isSafeInteger(a.max_bytes_ceiling)&&a.max_bytes_ceiling>=1000&&a.max_bytes_ceiling<=MAX_DEVELOPMENT_BYTES&&a.restoration_policy===POLICY,'DEVELOPMENT_BUDGET_INPUT');a.expected_config=configRef(a.expected_config);
 return using(root,actor,a,(store,pins)=>write(store,pins,actor,a,'propose',(s,n)=>{
  pending(n);need(n.operations.length<MAX_OPERATIONS,'DEVELOPMENT_BUDGET_AUDIT_CAPACITY');const before=config(store,pins);expected(before,a.expected_config);
  const o={protocol:PROTOCOL,id:'budget-'+randomUUID(),revision:1,kind:'apply',status:'proposed',company_id:s.id,actor:copy(actor),epoch:a.epoch,created_at:new Date().toISOString(),source_instruction:a.source_instruction,restoration_policy:POLICY,before:copy(before),target:targetOf(Buffer.from(encoded({max_bytes_ceiling:a.max_bytes_ceiling}))),phases:[]};n.operations.push(o);need(size(n)<=MAX_STATE_BYTES-TERMINAL_RESERVE,'DEVELOPMENT_BUDGET_AUDIT_CAPACITY');return result({status:'proposed',proposal_ref:reference(o),configuration:before.ref,proposal:summary(o),changes_configuration:false});
 },()=>expected(config(store,pins),a.expected_config)));
}

async function perform(root,actor,a,kind){
 return using(root,actor,a,async(store,pins)=>{
  let durable,preparationId,attempted=false;
  try{
   const prepared=write(store,pins,actor,a,'prepare',(s,n)=>{
    pending(n);let o;
    if(kind==='apply'){o=exact(n,a.proposal_ref);need(o.status==='proposed'&&o.kind==='apply'&&o.company_id===s.id&&same(o.actor,actor)&&o.epoch===a.epoch,'DEVELOPMENT_BUDGET_STALE_PROPOSAL');expected(config(store,pins),o.before.ref);}
    else {const previous=exact(n,a.applied_ref);need(['applied','reconciled_applied'].includes(previous.status),'DEVELOPMENT_BUDGET_RESTORE_REQUIRED');noLater(n,previous);const before=config(store,pins);expected(before,a.expected_config);need(same(before.ref,previous.after.ref),'DEVELOPMENT_BUDGET_CONFIG_CAS');need(n.operations.length<MAX_OPERATIONS,'DEVELOPMENT_BUDGET_AUDIT_CAPACITY');o={protocol:PROTOCOL,id:'budget-'+randomUUID(),revision:1,kind:'restore',status:'proposed',company_id:s.id,actor:copy(actor),epoch:a.epoch,created_at:new Date().toISOString(),source_instruction:a.source_instruction,restoration_policy:POLICY,before:copy(before),target:targetOf(previous.before.exists?Buffer.from(previous.before.raw_base64,'base64'):null),restores:a.applied_ref,phases:[]};n.operations.push(o);}
    o.apply_instruction=a.source_instruction;phase(o,'prepared',{by:copy(actor),epoch:a.epoch});n.active_intent_id=o.id;need(size(n)<=MAX_STATE_BYTES-TERMINAL_RESERVE,'DEVELOPMENT_BUDGET_AUDIT_CAPACITY');preparationId=o.id;return copy(o);
   });durable=reference(prepared);
   let d,prefix;
   const ready=write(store,pins,actor,a,'stage',(s,n)=>{
    const o=exact(n,durable);need(n.active_intent_id===o.id&&o.status==='prepared','DEVELOPMENT_BUDGET_STATE');expected(config(store,pins),o.before.ref);
    d=evidence(store,pins);prefix=path.join(d.file,prepared.id);
    exclusive(prefix+'.before',prepared.before.exists?Buffer.from(prepared.before.raw_base64,'base64'):Buffer.from('ORIGINAL_CONFIG_ABSENT\n'),pins);
    const staged=prepared.target.exists?exclusive(prefix+'.stage',Buffer.from(prepared.target.raw_base64,'base64'),pins):null;fs.fsyncSync(d.fd);
    o.stage=staged?{identity:staged.identity,sha256:staged.sha256,bytes:staged.bytes}:null;phase(o,'staged');return copy(o);
   });durable=reference(ready);
   return write(store,pins,actor,a,kind,(s,n)=>{
    const o=exact(n,durable);need(n.active_intent_id===o.id&&o.status==='staged','DEVELOPMENT_BUDGET_STATE');expected(config(store,pins),o.before.ref);stable(pins);
    if(o.target.exists){const found=readFile(prefix+'.stage',pins);need(fileMatches(o.stage,found),'DEVELOPMENT_BUDGET_STAGE_CHANGED');attempted=true;fs.renameSync(prefix+'.stage',path.join(store.dir,'development.json'));}
    else {need(!stat(prefix+'.removed'),'DEVELOPMENT_BUDGET_STAGE_CHANGED');attempted=true;fs.renameSync(path.join(store.dir,'development.json'),prefix+'.removed');}
    fs.fsyncSync(pins.directories[1].fd);fs.fsyncSync(d.fd);const after=config(store,pins);
    need(o.target.exists?after.exists&&sameNode(o.stage.identity,after.identity)&&after.sha256===o.target.sha256:!after.exists,'DEVELOPMENT_BUDGET_READBACK');o.after=copy(after);n.generation++;o.applied_generation=n.generation;n.latest_effect_id=o.id;n.active_intent_id=null;phase(o,'applied');
    return result({status:'applied',operation_ref:reference(o),configuration:after.ref,generation:n.generation,restoration_policy:POLICY,original_bytes_retained:true,sql_and_file_atomic:false});
   },()=>{const s=store.readSelected(OPTIONS),n=namespace(s),o=n.operations.find(o=>o.id===prepared.id);need(o?.status==='applied','DEVELOPMENT_BUDGET_STATE');expected(config(store,pins),o.after.ref);});
  }catch(error){if(!preparationId)throw error;return hold(preparationId,durable,error,attempted);}
 });
}
export async function applyLegacyDevelopmentBudget(root,sourceActor,value){const actor=actorInput(sourceActor),a=input(value,['proposal_ref','source_instruction']);a.proposal_ref=ref(a.proposal_ref);return perform(root,actor,a,'apply');}
export async function restoreLegacyDevelopmentBudget(root,sourceActor,value){const actor=actorInput(sourceActor),a=input(value,['applied_ref','expected_config','source_instruction']);a.applied_ref=ref(a.applied_ref);a.expected_config=configRef(a.expected_config);return perform(root,actor,a,'restore');}

export async function reconcileLegacyDevelopmentBudget(root,sourceActor,value){
 const actor=actorInput(sourceActor),a=input(value,['intent_ref','source_instruction']);a.intent_ref=ref(a.intent_ref);
 return using(root,actor,a,(store,pins)=>write(store,pins,actor,a,'reconcile',(s,n)=>{
  const o=exact(n,a.intent_ref);need(n.active_intent_id===o.id&&['prepared','staged','conflict'].includes(o.status),'DEVELOPMENT_BUDGET_RECONCILE_REQUIRED');const current=config(store,pins),prefix=path.join(store.dir,'development-budget',o.id);let found=false;
  if(o.stage&&o.target.exists)found=current.exists&&sameNode(o.stage.identity,current.identity)&&current.sha256===o.target.sha256;
  else if(!o.target.exists&&!current.exists){const removed=readFile(prefix+'.removed',pins);found=Boolean(removed&&sameNode(o.before.identity,removed.identity)&&digest(removed.bytes)===o.before.sha256);}
  let status;if(found){status='reconciled_applied';n.generation++;o.applied_generation=n.generation;n.latest_effect_id=o.id;o.after=copy(current);n.active_intent_id=null;}
  else if(same(current.ref,o.before.ref)){status='not_applied';n.active_intent_id=null;}
  else {status='conflict';need(o.phases.length<39,'DEVELOPMENT_BUDGET_AUDIT_CAPACITY');}
  phase(o,status,{by:copy(actor),epoch:a.epoch,source_instruction:a.source_instruction,observed_config:current.ref});if(status==='conflict')need(size(n)<=MAX_STATE_BYTES-TERMINAL_RESERVE,'DEVELOPMENT_BUDGET_AUDIT_CAPACITY');return result({status:status==='conflict'?'held':'reconciled',observed_outcome:status,operation_ref:reference(o),configuration:current.ref,original_call_success_inferred:false,repeated_file_action:false,original_bytes_retained:true});
 },()=>{const n=namespace(store.readSelected(OPTIONS)),o=n.operations.find(o=>o.id===a.intent_ref.id);need(o,'DEVELOPMENT_BUDGET_STATE');const p=o.phases.at(-1);expected(config(store,pins),p.observed_config);}));
}
