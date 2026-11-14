// Fixed public SOURCE adapter. Actual caller identity is captured by MCP HOST
// ingress; JSON selects bounded DATA, never an actor, native proof or provider.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {types} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {Store} from './store.mjs';
import {PeerLedger,FAMILIES,PEER_LAYOUT,PEER_PROTOCOL,canonical,peerDigest} from './peers/ledger.mjs';
import {requireCodexRootActor} from './mcp-host-context.mjs';
import {createPeerPublicOwnerLifecycle,createPeerPublicOwnerFreshReviewLifecycle,PEER_OWNER_MAINTENANCE_FRESH_ACTION,PEER_OWNER_MAINTENANCE_FRESH_PURPOSE,assertPeerPublicOwnerCustody} from './peers/owner-handover.mjs';
import {loadOriginalPeerOwnerTransferDecision,loadOriginalPeerOwnerTransferIntent} from './peers/owner-transfer-intent.mjs';
import {inspectPeerOwnerOperatingState} from './peers/owner-operating-state.mjs';
import {inspectPeerPublicContextFrom,readPeerPublicContextFrom,inspectPeerPublicPinsFrom,readPeerPublicPinsFrom} from './peer-public-context.mjs';
import {legacyEncodedReplyBytes} from './peers/legacy-origin.mjs';

const MAINTENANCE_URL=new URL('./peers/maintenance-launch.mjs',import.meta.url);
const MAX_REPLY=24576,MAX_REQUEST=100000;
const storageChanges=new WeakSet();
const fail=(code,message=code==='OWNER_STORAGE_LINK'?'OWNER_STORAGE_LINK: linked company storage is unsupported':code)=>{
 const error=Object.assign(Error(message),{code});
 if(code==='OWNER_STORAGE_CHANGED')storageChanges.add(error);
 throw error;
};
const need=(yes,code)=>{if(!yes)fail(code);};
const copy=v=>JSON.parse(canonical(v));
const same=(a,b)=>canonical(a)===canonical(b);
const text=(v,max=2000)=>typeof v==='string'&&v.trim()&&v.length<=max&&!v.includes('\0')&&Buffer.from(v,'utf8').toString('utf8')===v;
const str=max=>({type:'string',minLength:1,maxLength:max});
const integer=(minimum=1,maximum=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum,maximum});
const sha={...str(64),pattern:'^[a-f0-9]{64}$'};
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const ref=object({family:{enum:['work_items']},id:str(2000),revision:integer(),sha256:sha});
const rowRef=object({family:{enum:FAMILIES},id:str(2000),revision:integer(),sha256:sha});
const target=object({host:{enum:['codex','claude']},session_id:str(200),native_id:str(300)});
const primary=object({host:{enum:['codex','claude']},chat_id:str(300),turn_id:str(300),message_id:str(300),content_sha256:sha,quote:str(20000)});
const range={sha256:sha,offset:integer(0),length:integer(1,1024)};
const op={operation_id:str(160)};
const attempts={type:'array',maxItems:10000,items:object({phase_ref:ref,admission_ref:ref,context_ref:ref,slot_ref:object({...rowRef.properties,family:{enum:['slots']}}),effect_ref:object({...rowRef.properties,family:{enum:['effects']}}),phase_status:str(100),slot_status:str(100),effect_status:str(100),output_sha256:{anyOf:[sha,{type:'null'}]},late_evidence_refs:{type:'array',maxItems:10000,items:ref}})};
const fields={
 status:object({}),pinned_inspect:object({}),pinned_read:object({part:{enum:['plugin_version','governance','roles','cos_instructions']},reference:object({...rowRef.properties,family:{enum:['control']}}),sha256:sha,offset:integer(0),length:integer(1,4096)}),
 pause:object(op),record_transfer_decision:object({...op,target,reviewer_principal_id:str(200),review_grant_id:str(200),review_grant_generation:integer(),expires_at:str(100),max_review_calls:integer(),primary_human_message:primary,basis:{enum:['explicit']}}),
 issue_transfer_intent:object({...op,decision_ref:ref}),revoke_transfer_intent:object({...op,intent_ref:ref}),inspect_transfer_intent:object({intent_ref:ref}),read_transfer_intent:object({intent_ref:ref,...range}),begin:object({...op,intent_ref:ref}),
 inspect:object({}),read_subject:object({...op,...range}),refresh_preview:object({}),read_refresh_preview:object({preview_sha256:sha,offset:integer(0),length:integer(1,1024)}),refresh_subject:object({...op,previous_subject_ref:ref,preview_sha256:sha}),read_previous_subject:object({subject_ref:ref,offset:integer(0),length:integer(1,1024)}),submit:object({...op,subject_sha256:sha,content:str(8192)}),
 recovery_header:object(range,[]),read_recovery:object({...op,...range}),recover:object({...op,subject_sha256:sha,recovery_sha256:sha,attempt_refs:attempts,content:str(8192)}),review:object(op),activate:object({...op,review_ref:ref}),resume:object({...op,qualification_ref:ref},Object.keys(op)),
 context_inspect:object({family:{enum:FAMILIES},status:str(1000),principal_id:str(1000),task_id:str(1000),scope:str(1000),limit:integer(1,50),cursor:str(16000)},['family']),context_read:object({...rowRef.properties,offset:integer(0),length:integer(1,4096)},['family','id','revision','sha256'])
};
const sourceActions=new Set(['pause','record_transfer_decision','issue_transfer_intent','revoke_transfer_intent','begin','refresh_subject','submit','recover','review','activate','resume']);
// The original submit contract attributes the reconstruction to its actual
// incoming actor, operation and content; it has no source_instruction field.
const coreInstructionActions=new Set([...sourceActions].filter(action=>action!=='submit'&&action!=='review'));
const publicReads=new Set(['status','pinned_inspect','pinned_read']);
const reads=new Set([...publicReads,'inspect_transfer_intent','read_transfer_intent','inspect','refresh_preview','read_refresh_preview','read_previous_subject','recovery_header','context_inspect','context_read']);
const inputProperties=Object.assign({},...Object.values(fields).map(s=>s.properties));
export const peerOwnerToolSchema=Object.freeze({name:'company_owner',description:'Operate the existing layout-5 owner lifecycle through the actual root HOST caller and target-bound outgoing transfer intent. Current managed-hook checks, original decision/intent producers, finite authority and exact native review remain mandatory. Recorded CoS evidence does not attest human approval. Missing fixed native support Holds before custody or review admission. Status and pinned instructions are read-only; private context requires the actual current typed custodian. No actor, provider, callback, native proof or readiness flag is accepted.',inputSchema:object({root:str(4000),session_id:str(200),action:{enum:Object.keys(fields)},epoch:integer(),source_instruction:str(4000),input:object(inputProperties,[])},['root','session_id','action'])});

function data(value,seen=new Set(),budget={nodes:0},depth=0){
 if(++budget.nodes>20000||depth>40)return false;
 if(value===null||typeof value==='boolean'||typeof value==='string')return true;
 if(typeof value==='number')return Number.isFinite(value)&&!Object.is(value,-0);
 if(typeof value!=='object'||types.isProxy(value)||seen.has(value))return false;
 const array=Array.isArray(value),proto=Object.getPrototypeOf(value),descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
 if(array?proto!==Array.prototype||keys.length!==value.length+1||keys.some(k=>typeof k!=='string'||k!=='length'&&!/^(0|[1-9][0-9]*)$/.test(k)):proto!==Object.prototype)return false;
 seen.add(value);
 try{return keys.every(k=>array&&k==='length'||typeof k==='string'&&descriptors[k].enumerable&&Object.hasOwn(descriptors[k],'value')&&data(descriptors[k].value,seen,budget,depth+1));}finally{seen.delete(value);}
}
function rule(value,schema){
 if(schema.anyOf)return schema.anyOf.some(s=>rule(value,s));
 if(schema.enum&&!schema.enum.includes(value))return false;
 if(schema.type==='null')return value===null;
 if(schema.type==='string')return text(value,schema.maxLength??2000)&&value.length>=(schema.minLength??0)&&(!schema.pattern||new RegExp(schema.pattern).test(value));
 if(schema.type==='integer')return Number.isSafeInteger(value)&&value>=schema.minimum&&value<=schema.maximum;
 if(schema.type==='array')return Array.isArray(value)&&value.length<=(schema.maxItems??10000)&&value.every(v=>rule(v,schema.items));
 if(schema.type==='object')return value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).every(k=>Object.hasOwn(schema.properties,k)&&rule(value[k],schema.properties[k]))&&schema.required.every(k=>Object.hasOwn(value,k));
 return true;
}
export function validatePeerOwnerRequest(args,host){
 // Descriptor-only traversal precedes every input field read, filesystem call
 // and actual HOST actor lookup. A caller accessor/proxy cannot run here.
 need(data(args)&&args&&typeof args==='object'&&!Array.isArray(args),'OWNER_PUBLIC_INPUT');
 need(['codex','claude'].includes(host)&&rule(args,peerOwnerToolSchema.inputSchema)&&path.isAbsolute(args.root),'OWNER_PUBLIC_INPUT');
 const input=args.input??{};need(rule(input,fields[args.action]),'OWNER_PUBLIC_INPUT');
 need(publicReads.has(args.action)||Number.isSafeInteger(args.epoch)&&args.epoch>0,'OWNER_PUBLIC_EPOCH_REQUIRED');
 need(!sourceActions.has(args.action)||text(args.source_instruction,4000),'OWNER_PUBLIC_INSTRUCTION_REQUIRED');
 if(args.action==='recovery_header'&&Object.keys(input).length)need(Object.keys(range).every(k=>Object.hasOwn(input,k)),'OWNER_PUBLIC_INPUT');
 need(Buffer.byteLength(canonical(args))<=MAX_REQUEST,'OWNER_PUBLIC_INPUT');return copy(args);
}

const sameNode=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.mode===b.mode;
function stat(file){try{return fs.lstatSync(file,{bigint:true});}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function noLinks(file){
 for(let current=file;;current=path.dirname(current)){const s=stat(current);if(s?.isSymbolicLink())fail('OWNER_STORAGE_LINK');if(current===path.dirname(current))break;}
}
function checkSidecar(s,suffix){
 const regular=s.isFile()&&!s.isSymbolicLink();
 if(regular&&s.nlink===1n)return;
 const type=regular?'regular':s.isSymbolicLink()?'symlink':s.isDirectory()?'directory':'other';
 const links=typeof s.nlink==='bigint'&&s.nlink>=0n&&s.nlink<=99999999999999999999n?String(s.nlink):'unknown';
 const detail=`component=${suffix==='-wal'?'wal':'shm'};type=${type};links=${links}`;
 // A zero-link SQLite sidecar is retired, not a valid snapshot. Only the
 // existing privately branded readonly-routing restart may discard it.
 if(regular&&s.nlink===0n)fail('OWNER_STORAGE_CHANGED',`OWNER_STORAGE_CHANGED: retired SQLite sidecar;${detail}`);
 fail('OWNER_STORAGE_LINK',`OWNER_STORAGE_LINK: linked company storage is unsupported;${detail}`);
}
function location(root){
 need(text(root,4000)&&path.isAbsolute(root),'OWNER_STORAGE_INPUT');noLinks(root);const namedRoot=stat(root);if(!namedRoot)return null;need(namedRoot.isDirectory(),'OWNER_STORAGE_INVALID');
 const real=fs.realpathSync(root),directory=path.join(real,'.company'),file=path.join(directory,'company.sqlite'),namedDirectory=stat(directory);if(!namedDirectory)return null;
 need(namedDirectory.isDirectory()&&!namedDirectory.isSymbolicLink(),'OWNER_STORAGE_LINK');
 const namedFile=stat(file);if(!namedFile){need(!stat(file+'-wal')&&!stat(file+'-shm'),'OWNER_STORAGE_LAYOUT');return null;}need(namedFile.isFile()&&!namedFile.isSymbolicLink()&&namedFile.nlink===1n,'OWNER_STORAGE_LINK');
 for(const suffix of ['-wal','-shm']){const s=stat(file+suffix);if(s)checkSidecar(s,suffix);}
 return {root:real,directory,file,namedRoot,namedDirectory,namedFile};
}
function stable(where){
 noLinks(where.root);
 for(const [file,before] of [[where.root,where.namedRoot],[where.directory,where.namedDirectory],[where.file,where.namedFile]]){const now=stat(file);need(now&&!now.isSymbolicLink()&&sameNode(before,now),'OWNER_STORAGE_CHANGED');}
 for(const suffix of ['-wal','-shm']){const s=stat(where.file+suffix);if(s)checkSidecar(s,suffix);}
}
function pinned(where){
 const {O_RDONLY,O_NOFOLLOW,O_DIRECTORY,O_NONBLOCK}=fs.constants;need([O_RDONLY,O_NOFOLLOW,O_DIRECTORY,O_NONBLOCK].every(Number.isInteger),'OWNER_STORAGE_UNSUPPORTED');
 const fds=[];let sourceFile,rootDirectory;
 try{
  for(const [file,before,directory] of [[where.root,where.namedRoot,true],[where.directory,where.namedDirectory,true],[where.file,where.namedFile,false]]){
   const fd=fs.openSync(file,O_RDONLY|O_NOFOLLOW|O_NONBLOCK|(directory?O_DIRECTORY:0));fds.push(fd);const actual=fs.fstatSync(fd,{bigint:true});need(sameNode(before,actual),'OWNER_STORAGE_CHANGED');
   if(file===where.root){need(typeof actual.ctimeNs==='bigint'&&typeof actual.mtimeNs==='bigint','OWNER_STORAGE_UNSUPPORTED');rootDirectory={fd,before:actual};}
   if(!directory){need(typeof actual.ctimeNs==='bigint'&&typeof actual.mtimeNs==='bigint','OWNER_STORAGE_UNSUPPORTED');sourceFile={fd,before:actual};}
  }
  stable(where);return {fds,sourceFile,rootDirectory};
 }catch(error){
  const cleanup=[];
  for(const fd of fds.reverse())try{fs.closeSync(fd);}catch(failure){cleanup.push(failure);}
  if(cleanup.length)throw new AggregateError([error,...cleanup],'Storage pin acquisition and descriptor cleanup failed',{cause:error});
  throw error;
 }
}
function openedOriginalFile(pin){
 // Retaining the original fd plus a restored pathname is insufficient: A can
 // be renamed away, SQLite can open valid B, then A can be restored before a
 // pathname check. Its SAME original fd records that rename in ctime. Require
 // the complete original file version to stay unchanged across the open and
 // post-open name checks, before any schema or canonical row is trusted.
 // Exclude atime (normal reads); do not extend this guard across the later
 // owning transaction, where normal WAL writes/checkpoints may change A.
 // A whole .company-directory swap leaves A's inode/version unchanged but
 // revises the pinned ROOT's directory entries. Bind that root version too.
 // Do not compare .company-directory timestamps: SQLite may legitimately
 // create WAL/SHM there while opening an otherwise original database.
 for(const {fd,before} of [pin.sourceFile,pin.rootDirectory]){
  const after=fs.fstatSync(fd,{bigint:true});
  need(['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].every(k=>before[k]===after[k]),'OWNER_STORAGE_CHANGED');
 }
}
function layout(db){
 // Connection-local only, matching the existing legacy Store's finite wait.
 // A readonly schema probe may meet an ordinary concurrent legacy writer.
 db.exec('PRAGMA busy_timeout=5000;');
 const names=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name)),peer=[...names].some(n=>n.startsWith('peer_'));
 let version=null;
 if(names.has('company_layout')){const rows=db.prepare('SELECT id,version FROM company_layout').all();need(rows.length===1&&rows[0].id===1&&Number.isSafeInteger(rows[0].version),'OWNER_STORAGE_LAYOUT');version=rows[0].version;}
 if(version===PEER_LAYOUT){need(['peer_meta','peer_rows','peer_versions','peer_events'].every(n=>names.has(n)),'OWNER_STORAGE_LAYOUT');const rows=db.prepare('SELECT id,protocol,company_id FROM peer_meta').all();need(rows.length===1&&rows[0].id===1&&rows[0].protocol===PEER_PROTOCOL&&text(rows[0].company_id,2000),'OWNER_STORAGE_PROTOCOL');return 'peer';}
 need(!peer,'OWNER_STORAGE_LAYOUT');
 need((version===null||[1,2,3,4].includes(version))&&names.has('company')&&names.has('events'),'OWNER_STORAGE_LAYOUT');return 'legacy';
}
function storagePreflight(root){
 const where=location(root);if(!where)return null;const pin=pinned(where);let db,result,failure,failed=false;
 const cleanup=[];
 try{
  stable(where);db=new DatabaseSync(where.file,{readOnly:true});stable(where);openedOriginalFile(pin);
  const actual=db.prepare('PRAGMA database_list').all().find(r=>r.name==='main');need(actual?.file&&fs.realpathSync(actual.file)===where.file,'OWNER_STORAGE_CHANGED');
  // Discovery is intentionally schema/protocol metadata only. Legacy cold
  // open/status and startup hooks use it before any actual caller is known.
  // Canonical peer rows and P1 proof reads belong after HOST authentication.
  const kind=layout(db);
  stable(where);result={where,kind};
 }catch(error){failed=true;failure=error;}
 finally{
  for(const close of [()=>db?.close(),...pin.fds.reverse().map(fd=>()=>fs.closeSync(fd))]){
   try{close();}catch(error){cleanup.push(error);}
  }
 }
 if(failed){if(cleanup.length)throw new AggregateError([failure,...cleanup],'Storage preflight and cleanup failed',{cause:failure});throw failure;}
 if(cleanup.length)throw cleanup.length===1?cleanup[0]:new AggregateError(cleanup,'Storage preflight cleanup failed');
 return result;
}
export function peerOwnerStorageKind(root){
 need(text(root,4000)&&path.isAbsolute(root),'OWNER_STORAGE_INPUT');
 if(!stat(root))return null;
 // Existing legacy tools canonicalize their attached folder, including the
 // standard macOS /var alias. Classify that original path without imposing
 // the NEW peer-only root-alias policy on a known legacy company.
 const canonicalRoot=fs.realpathSync(root),found=storagePreflight(canonicalRoot);
 need(fs.realpathSync(root)===canonicalRoot,'OWNER_STORAGE_CHANGED');
 if(found?.kind!=='peer')return null;
 noLinks(root);return 'peer';
}
// Unqualified routing DATA only. Discard a failed readonly classification and
// reopen from scratch; never repeat an actual operation or trust its old DB.
// Error strings/codes/provider lookalikes cannot authorize this bounded retry.
export function peerOwnerRoutingStorageKind(root){
 for(let attempt=0;attempt<3;attempt++){
  try{return peerOwnerStorageKind(root);}
  catch(error){if(!storageChanges.has(error)||attempt===2)throw error;}
 }
}
async function withLedger(root,readOnly,invoke){
 const found=storagePreflight(root);need(found?.kind==='peer','OWNER_PEER_ADOPTION_REQUIRED');const {where}=found,pin=pinned(where);let db;
 try{
  stable(where);db=new DatabaseSync(where.file,{readOnly});stable(where);openedOriginalFile(pin);need(layout(db)==='peer','OWNER_STORAGE_LAYOUT');
  const ledger=new PeerLedger(where.root,{connection:db});need(ledger.root===where.root&&ledger.file===where.file&&Object.getPrototypeOf(ledger)===PeerLedger.prototype,'OWNER_STORAGE_CHANGED');
  // withLedger is reached only after the public adapter's actual HOST caller
  // gate (and the engine's managed-hook gate). Full canonical/P1 validation
  // can now read peer rows; the unqualified kind probe above cannot.
  ledger.read(tx=>{const c=tx.get('control','company');need(c?.value.protocol===PEER_PROTOCOL&&text(c.value.founder_principal_id),'OWNER_STORAGE_PROTOCOL');});
  stable(where);const result=await invoke(ledger);stable(where);return result;
 }finally{db?.close();for(const fd of pin.fds.reverse())fs.closeSync(fd);}
}
// Trusted SOURCE composition only. The registered engine route checks actual
// HOST/current-hook identity first; this opener grants no caller authority.
// Peer access delegates to the unchanged original opener. Legacy access is
// strictly read-only and reuses the SAME original-fd/path binding checks.
export async function withPeerPublicStorage(root,readOnly,invoke){
 const found=storagePreflight(root);need(found,'OWNER_EXISTING_STORAGE_REQUIRED');
 if(found.kind==='peer')return withLedger(root,readOnly,ledger=>invoke({kind:'peer',ledger,db:ledger.db,root:ledger.root}));
 need(readOnly===true,'OWNER_LEGACY_READONLY_REQUIRED');
 const {where}=found,pin=pinned(where);let db,store;
 try{
  stable(where);store=new Store(where.root,false,{readOnly:true});db=store.db;stable(where);openedOriginalFile(pin);
  need(layout(db)==='legacy','OWNER_STORAGE_LAYOUT');
  const actual=db.prepare('PRAGMA database_list').all().find(row=>row.name==='main');need(actual?.file&&fs.realpathSync(actual.file)===where.file,'OWNER_STORAGE_CHANGED');
  const readSnapshot=fn=>{stable(where);return store.readSnapshot(()=>{stable(where);const result=fn(store);stable(where);return result;});};
  const result=await invoke({kind:'legacy',db,root:where.root,readSnapshot});stable(where);return result;
 }finally{if(db?.isTransaction)db.exec('ROLLBACK');store?.close();for(const fd of pin.fds.reverse())fs.closeSync(fd);}
}
// Fixed SOURCE writer seam, not a public operation or owner authorization.
// Keep legacy selection distinct: a peer rejection never falls back here.
export async function withLegacyPublicStore(root,invoke){
 need(typeof invoke==='function','OWNER_STORAGE_INPUT');
 const found=storagePreflight(root);need(found?.kind==='legacy','OWNER_LEGACY_LAYOUT4_REQUIRED');
 const {where}=found,pin=pinned(where);let db,store,result,failure,failed=false,active=true;
 const cleanup=[];
 const guard=()=>{
  need(active,'OWNER_STORAGE_CALLBACK_EXPIRED');stable(where);
  need(layout(db)==='legacy','OWNER_STORAGE_LAYOUT');
  need(stat(where.file)?.nlink===1n,'OWNER_STORAGE_LINK');
  need(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='company_layout'").get(),'OWNER_LEGACY_LAYOUT4_REQUIRED');
  const rows=db.prepare('SELECT id,version FROM company_layout').all();need(rows.length===1&&rows[0].id===1&&rows[0].version===4,'OWNER_LEGACY_LAYOUT4_REQUIRED');
  const actual=db.prepare('PRAGMA database_list').all().find(row=>row.name==='main');need(actual?.file&&fs.realpathSync(actual.file)===where.file,'OWNER_STORAGE_CHANGED');stable(where);
 };
 try{
  stable(where);db=new DatabaseSync(where.file);stable(where);openedOriginalFile(pin);guard();
  store=new Store(where.root,false,{connection:db,connectionGuard:guard});
  result=await invoke(store);guard();need(!db.isTransaction,'OWNER_STORAGE_TRANSACTION_OPEN');
 }catch(error){failed=true;failure=error;}
 finally{
  active=false;
  for(const close of [()=>store?.close(),()=>{if(db?.isTransaction)db.exec('ROLLBACK');},()=>db?.close(),...pin.fds.reverse().map(fd=>()=>fs.closeSync(fd))]){
   try{close();}catch(error){cleanup.push(error);}
  }
 }
 if(failed){if(cleanup.length)throw new AggregateError([failure,...cleanup],'Legacy Store operation and cleanup failed',{cause:failure});throw failure;}
 if(cleanup.length)throw cleanup.length===1?cleanup[0]:new AggregateError(cleanup,'Legacy Store cleanup failed');
 return result;
}
const connection=ledger=>({root:ledger.root,company_id:ledger.company_id,directory:ledger.directory});
function canonicalCaller(tx,actor,args,ledger,{privateContext=false}={}){
 const c=tx.get('control','company'),p=c&&tx.get('principals',c.value.founder_principal_id),o=p?.value.legacy_owner;
 need(c?.value.protocol===PEER_PROTOCOL&&p?.value.kind==='founder'&&o&&Number.isSafeInteger(o.epoch)&&o.epoch>0,'OWNER_CANONICAL_REQUIRED');
 if(args.epoch!==undefined)need(args.epoch===o.epoch,'OWNER_CHANGED');
 const actual=p.value.host===actor.host&&o.host===actor.host&&o.session_id===actor.session_id&&p.value.native_id===actor.native_id&&['active','pending'].includes(p.value.status);
 if(privateContext){need(actual,'OWNER_PUBLIC_CONTEXT_FORBIDDEN');inspectPeerOwnerOperatingState(tx);assertPeerPublicOwnerCustody({...tx,connection:connection(ledger)});}
 return {c,p,o,actual};
}
function bounded(value){need(legacyEncodedReplyBytes(value)<=MAX_REPLY,'OWNER_PUBLIC_REPLY_CAPACITY');return value;}
function coveragePreflight(length){
 // All current core credited-range replies have these bounded scalar/ref
 // fields. This pessimistic double-escaped envelope is checked BEFORE core
 // planning, so rejected range size cannot earn committed coverage credit.
 bounded({handover_id:'x'.repeat(2000),subject_ref:{family:'work_items',id:'x'.repeat(2000),revision:Number.MAX_SAFE_INTEGER,sha256:'f'.repeat(64)},sha256:'f'.repeat(64),offset:Number.MAX_SAFE_INTEGER,length,text:'\\'.repeat(length),next_offset:Number.MAX_SAFE_INTEGER,complete:false});
}
function headerRead(value,input){
 const body=canonical(value),sha256=peerDigest(value);
 if(!Object.keys(input).length){if(legacyEncodedReplyBytes(value)<=MAX_REPLY)return value;return bounded({protocol:value.protocol,sha256:value.sha256,total_characters:value.total_characters,attempt_refs_not_inlined:true,attempts_total:value.attempt_refs.length,header:{sha256,total_characters:body.length,read:{tool:'company_owner',action:'recovery_header',input:{sha256,offset:0,length:1024}}}});}
 need(input.sha256===sha256&&input.offset+input.length<=body.length,'OWNER_RECOVERY_CHANGED');
 for(const n of [input.offset,input.offset+input.length])need(!(n>0&&n<body.length&&/[\uD800-\uDBFF]/.test(body[n-1])&&/[\uDC00-\uDFFF]/.test(body[n])),'OWNER_READ_RANGE');
 return bounded({header_sha256:sha256,total_characters:body.length,offset:input.offset,length:input.length,text:body.slice(input.offset,input.offset+input.length),next_offset:input.offset+input.length,complete:input.offset+input.length===body.length,coverage_credit:false});
}
async function review(lifecycle,args,input){
 // Check only the FIXED direct entry path. A present entry's transitive import
 // or provider failures propagate unchanged; no broad MODULE_NOT_FOUND mask.
 let s;try{s=fs.lstatSync(fileURLToPath(MAINTENANCE_URL));}catch(error){if(error.code==='ENOENT')fail('OWNER_REVIEW_LAUNCH_UNAVAILABLE');throw error;}
 need(s.isFile()&&!s.isSymbolicLink(),'OWNER_REVIEW_LAUNCH_UNAVAILABLE');
 const native=await import(MAINTENANCE_URL.href);need(typeof native.runOriginalPeerOwnerMaintenanceReview==='function','OWNER_REVIEW_LAUNCH_UNAVAILABLE');
 const result=await native.runOriginalPeerOwnerMaintenanceReview(lifecycle,{operation_id:input.operation_id,epoch:args.epoch});
 if(legacyEncodedReplyBytes(result)<=MAX_REPLY)return result;
 return bounded({protocol:'peer-owner-review-returned-v1',returned:true,result_not_inlined:true,retrieval:{tool:'company_owner',action:'inspect'},qualification:'Review returned; inspect exact persisted owner records before any next action. This receipt does not establish owner acceptance, activation or closure. Do not repeat the review.'});
}

// Fixed host selection from original authority records only. No public mode,
// profile or purpose flag is added. Selection itself grants no authority; the
// original lifecycle revalidates actor, grant, intent and original begin.
function freshReviewLifecycleFrom(ledger,args,input){
 return ledger.read(tx=>{
  const literal=grant=>Array.isArray(grant?.value?.actions)&&grant.value.actions.includes(PEER_OWNER_MAINTENANCE_FRESH_ACTION);
  if(args.action==='record_transfer_decision'){
   const grant=tx.get('grants',input.review_grant_id);
   return grant?.value.status==='active'&&grant.value.generation===input.review_grant_generation&&literal(grant);
  }
  if(args.action==='issue_transfer_intent'){
   const decision=loadOriginalPeerOwnerTransferDecision(tx,connection(ledger),input.decision_ref);
   return literal(tx.getVersion(decision.row.value.review_grant_ref));
  }
  if(['revoke_transfer_intent','inspect_transfer_intent','read_transfer_intent','begin'].includes(args.action)){
   const intent=loadOriginalPeerOwnerTransferIntent(tx,connection(ledger),input.intent_ref);
   return literal(tx.getVersion(intent.row.value.review_grant_ref));
  }
  const c=tx.get('control','company'),h=c?.value.owner_handover&&tx.get('work_items',c.value.owner_handover.id);
  if(!h)return false;
  // Authenticate typed public custody and its original immutable begin before
  // examining purpose. A current-row label cannot convert an old handover.
  assertPeerPublicOwnerCustody({...tx,connection:connection(ledger)});
  const event=tx.events({after:h.created_seq-1,limit:1}).items[0],changes=event?.payload?.changes?.filter(change=>change.family==='work_items'&&change.id===h.id&&change.revision===1);
  need(event?.seq===h.created_seq&&event.type==='owner/handover.begin'&&changes?.length===1,'OWNER_TRANSFER_PRODUCER_REQUIRED');
  const first=tx.getVersion({family:'work_items',id:h.id,revision:1,sha256:changes[0].sha256});need(first?.value,'OWNER_TRANSFER_PRODUCER_REQUIRED');
  need(h.value.fresh_review_purpose===first.value.fresh_review_purpose&&h.value.creation_mode===first.value.creation_mode&&same(h.value.review_grant,first.value.review_grant),'OWNER_FRESH_REVIEW_PURPOSE_REQUIRED');
  return first.value.fresh_review_purpose===PEER_OWNER_MAINTENANCE_FRESH_PURPOSE&&first.value.creation_mode==='fresh-original-protected-thread'&&literal(tx.getVersion(first.value.review_grant));
 });
}

export async function peerOwnerRuntimeAction(request,host){
 const args=validatePeerOwnerRequest(request,host),actor=requireCodexRootActor({host,session_id:args.session_id}),input=args.input??{};
 if(['read_subject','read_recovery'].includes(args.action))coveragePreflight(input.length);
 return withLedger(args.root,reads.has(args.action),async ledger=>{
  if(args.action==='status')return ledger.read(tx=>{
   const {c,p,o,actual}=canonicalCaller(tx,actor,args,ledger),h=c.value.owner_handover&&tx.get('work_items',c.value.owner_handover.id);
   const eligible=actual&&(!h||Boolean(h.value.public_transfer_binding));if(eligible){inspectPeerOwnerOperatingState(tx);assertPeerPublicOwnerCustody({...tx,connection:connection(ledger)});}
   return bounded({protocol:'peer-public-owner-runtime-v1',company_id:ledger.company_id,owner:{host:o.host,session_id:o.session_id,epoch:o.epoch},paused:c.value.paused,caller_relation:actual?'owner':h&&same(h.value.incoming,actor)?'incoming':'other',private_context_available:eligible,custody:{controlled:Boolean(h),status:h?.value.status??'same-owner',typed_intent_bound:Boolean(h?.value.public_transfer_binding),ordinary_allowed:eligible&&(!h||h.value.status==='resumed')},pinned:inspectPeerPublicPinsFrom(tx,{company_id:ledger.company_id}),...(eligible?{notices:inspectPeerPublicContextFrom(tx,{company_id:ledger.company_id,family:'notices',status:'pending',limit:3})}:{}),context:{tool:'company_owner',action:'context_inspect',requires:'actual current canonical owner or typed pending custodian and exact current epoch'},physical_closure:'UNKNOWN',qualification:'Read-only SOURCE status; identity, typed custody and native/owner acceptance remain separate. Recorded instructions do not mechanically attest human approval.'});
  });
  if(args.action==='pinned_inspect'||args.action==='pinned_read')return ledger.read(tx=>{canonicalCaller(tx,actor,args,ledger);return args.action==='pinned_inspect'?inspectPeerPublicPinsFrom(tx,{company_id:ledger.company_id}):readPeerPublicPinsFrom(tx,input,{company_id:ledger.company_id});});
  if(args.action==='context_inspect'||args.action==='context_read')return ledger.read(tx=>{canonicalCaller(tx,actor,args,ledger,{privateContext:true});return args.action==='context_inspect'?inspectPeerPublicContextFrom(tx,{company_id:ledger.company_id,...input}):readPeerPublicContextFrom(tx,{company_id:ledger.company_id,...input});});
  const lifecycle=(freshReviewLifecycleFrom(ledger,args,input)?createPeerPublicOwnerFreshReviewLifecycle:createPeerPublicOwnerLifecycle)({ledger,actor});
  if(args.action==='inspect'){
   const value=lifecycle.inspect({epoch:args.epoch});
   return ledger.read(tx=>{
    const {c}=canonicalCaller(tx,actor,args,ledger,{privateContext:true}),row=tx.get('work_items',c.value.owner_handover?.id);need(row&&row.id===value.handover_id&&row.value.status===value.status&&row.value.subject_sha256===value.subject_sha256&&same(row.value.reconstruction_ref,value.reconstruction_ref)&&same(row.value.review_history,value.review_history),'OWNER_SOURCE_CHANGED');
    return bounded({protocol:value.protocol,handover_id:value.handover_id,status:value.status,epoch:value.epoch,paused:value.paused,held:value.held,subject_sha256:value.subject_sha256,total_characters:value.total_characters,reconstruction_ref:value.reconstruction_ref,expires_at_ms:value.expires_at_ms,used_review_calls:value.used_review_calls,max_review_calls:value.max_review_calls,subject_refresh_ref:value.subject_refresh_ref,refresh_available:value.refresh_available,history_totals:{reviews:value.review_history.length,subjects:value.subject_history.length},source:{family:'work_items',id:row.id,revision:row.revision,sha256:row.sha256,read:{tool:'company_owner',action:'context_read',input:{family:'work_items',id:row.id,revision:row.revision,sha256:row.sha256,offset:0,length:1024}}},physical_closure:'UNKNOWN'});
   });
  }
  if(args.action==='review')return review(lifecycle,args,input);
  if(args.action==='recovery_header')return headerRead(lifecycle.recoveryHeader({epoch:args.epoch}),input);
  const methods={pause:'pause',record_transfer_decision:'recordTransferDecision',issue_transfer_intent:'issueTransferIntent',revoke_transfer_intent:'revokeTransferIntent',inspect_transfer_intent:'inspectTransferIntent',read_transfer_intent:'readTransferIntent',begin:'beginFromIntent',read_subject:'read',refresh_preview:'previewSubjectRefresh',read_refresh_preview:'readSubjectRefresh',refresh_subject:'refreshSubject',read_previous_subject:'readPreviousSubject',submit:'submit',read_recovery:'readRecovery',recover:'recover',activate:'activate',resume:'resume'};
  const method=methods[args.action];need(method&&typeof lifecycle[method]==='function','OWNER_PUBLIC_ACTION_HELD');
  return bounded(await lifecycle[method]({...input,epoch:args.epoch,...(coreInstructionActions.has(args.action)?{source_instruction:args.source_instruction}:{})}));
 });
}
