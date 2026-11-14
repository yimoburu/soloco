// Optional process-local A-evidence custody only; no Native/model/Store grant.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {types} from 'node:util';
import {copyBlobBytes,verifyBlob} from './typed-capture.mjs';
import {encodeIssue18LedgerData} from '../issue18-ledger-storage.mjs';
import {consumeComparisonEvidenceStorageEntitlementFrom,completeComparisonEvidenceStorageFrom} from './integrated-comparison-issuer.mjs';
const PROTOCOL='issue18-comparison-evidence-io-v1',PYTHON='/usr/bin/python3';
const HELPER=fileURLToPath(new URL('./integrated-comparison-evidence-io.py',import.meta.url));
const HELPER_SHA256='cd7f7f90ff340ec151f0c3c1845c5369b6dada4a2a39415986ac4fe5258f167e';
const MAX=9975424,QUOTA=32;
const sessions=new WeakMap(),pins=new WeakMap();let activePins=0,openCapture=0;
const fail=code=>{throw Object.assign(Error('Issue18 evidence IO Hold: '+code),{code:'ISSUE18_EVIDENCE_IO_'+code});};
const need=(ok,code)=>{if(!ok)fail(code);};
const hash=body=>createHash('sha256').update(body).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
function exact(value,keys){
 need(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype,'PROTOCOL');
 const d=Object.getOwnPropertyDescriptors(value);need(Reflect.ownKeys(value).length===keys.length&&keys.every(k=>Object.hasOwn(d,k)&&Object.hasOwn(d[k],'value')),'PROTOCOL');
}
const identity=s=>Object.fromEntries(['dev','ino','mode','uid','gid'].map(k=>[k,String(s[k])]));
const fileFields=['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'];
const version=s=>Object.fromEntries(fileFields.map(k=>[k==='mtimeNs'?'mtime_ns':k==='ctimeNs'?'ctime_ns':k,String(s[k])]));
function directory(fd){const s=fs.fstatSync(fd,{bigint:true});need(s.isDirectory()&&(s.mode&0o777n)===0o700n&&s.uid===BigInt(process.getuid()),'DIRECTORY');return identity(s);}
function program(file,expected,system,deadline){
  const began=process.hrtime.bigint(),available=deadline-Date.now();need(Number.isSafeInteger(available)&&available>0,'DEADLINE');
  const check=()=>need(Date.now()<deadline&&process.hrtime.bigint()-began<BigInt(available)*1000000n,'DEADLINE');
  check();const before=fs.lstatSync(file,{bigint:true});
  need(before.isFile()&&!before.isSymbolicLink()&&before.size>0n&&before.size<=(system?150000000n:65536n),'PROGRAM');
  if(system)need(file===PYTHON&&before.nlink>0n&&before.uid===0n&&(before.mode&0o022n)===0n,'PROGRAM');else need(before.nlink===1n,'PROGRAM');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try{
    const unchanged=s=>fileFields.every(key=>s[key]===before[key]);need(unchanged(fs.fstatSync(fd,{bigint:true})),'PROGRAM');
    const digest=createHash('sha256'),buffer=Buffer.allocUnsafe(65536),chunks=[];let offset=0;
    while(offset<Number(before.size)){check();const count=fs.readSync(fd,buffer,0,Math.min(buffer.length,Number(before.size)-offset),offset);need(count>0,'PROGRAM');check();const part=buffer.subarray(0,count);digest.update(part);if(!system)chunks.push(Buffer.from(part));offset+=count;}
    need(fs.readSync(fd,buffer,0,1,offset)===0&&unchanged(fs.fstatSync(fd,{bigint:true}))&&unchanged(fs.lstatSync(file,{bigint:true}))&&digest.digest('hex')===expected,'PROGRAM');check();
    return system?null:Buffer.concat(chunks,offset).toString('utf8');
  }finally{fs.closeSync(fd);check();}
}
function parentCurrent(s){
 need(!s.closed&&!s.poisoned&&Date.now()<s.deadlineAtMs,'CLOSED_OR_EXPIRED');need(same(directory(s.parentFd),s.parentIdentity),'PARENT_CHANGED');
 const named=fs.lstatSync(s.parentPath,{bigint:true});need(named.isDirectory()&&!named.isSymbolicLink()&&same(identity(named),s.parentIdentity),'PARENT_NAME_CHANGED');
}
function readOriginal(s,fd,name,base,row){
 const before=fs.fstatSync(fd,{bigint:true});need(before.isFile()&&before.nlink===1n&&(before.mode&0o777n)===0o400n&&before.uid===BigInt(process.getuid())&&before.gid===BigInt(s.parentIdentity.gid)&&same(version(before),row.identity)&&Number(before.size)===row.bytes&&row.bytes>=0&&row.bytes<=MAX,'OBJECT_CHANGED');
 const named=()=>fs.lstatSync(path.join(base,name),{bigint:true});need(same(version(named()),row.identity),'OBJECT_NAME_CHANGED');
 const body=Buffer.alloc(row.bytes);let offset=0;
 while(offset<body.length){need(Date.now()<s.deadlineAtMs,'EXPIRED');const n=fs.readSync(fd,body,offset,Math.min(65536,body.length-offset),offset);need(n>0,'SHORT_READ');offset+=n;}
 need(fs.readSync(fd,Buffer.alloc(1),0,1,offset)===0&&same(version(fs.fstatSync(fd,{bigint:true})),row.identity)&&same(version(named()),row.identity)&&hash(body)===row.sha256,'OBJECT_CHANGED');return body;
}
function current(s){
 parentCurrent(s);need(same(directory(s.directoryFd),s.directoryIdentity)&&same(directory(s.objectsFd),s.objectsIdentity),'DIRECTORY_CHANGED');
 const root=fs.lstatSync(s.directoryPath,{bigint:true}),objects=fs.lstatSync(s.objectsPath,{bigint:true});need(root.isDirectory()&&objects.isDirectory()&&same(identity(root),s.directoryIdentity)&&same(identity(objects),s.objectsIdentity),'DIRECTORY_NAME_CHANGED');
 // Explicit selected IO only: the fixed read-only helper traverses EVERY
 // parent component with original-FD-relative O_NOFOLLOW and checks the
 // current parent/root/objects/file ACLs. Node mode bits alone cannot do this.
 const verified=invoke(s,'verify');exact(verified,['protocol','status','authority_claim']);
 readOriginal(s,s.initFd,s.directoryName+'.init.json',s.parentPath,s.init);
 need(same(fs.readdirSync(s.directoryPath).sort(),['objects']),'ROOT_NAMESPACE_CHANGED');
 const names=fs.readdirSync(s.objectsPath).sort(),expected=[...s.objects.values()].map(e=>e.row.name).sort();need(names.length<=QUOTA&&same(names,expected),'OBJECT_NAMESPACE_CHANGED');
 for(const entry of s.objects.values())readOriginal(s,entry.fd,entry.row.name,s.objectsPath,entry.row);
 need(s.charged<=s.capacityReservedBytes&&Date.now()<s.deadlineAtMs,'CAPACITY_OR_EXPIRY');
}
function accounting(s){return freeze({charged_bytes:s.charged,capacity_reserved_bytes:s.capacityReservedBytes,init_bytes:s.initBytes,header_bytes:s.headerBytes,event_bytes:s.eventBytes,pin_copy_bytes:s.pinCopyBytes,blob_staging_and_publication_bytes:s.blobBytes,objects_count:s.objects.size,active_pins:s.pins.size,open_capture:openCapture,physical_allocation_bytes:null,uncertain_charges_recycled:false});}
function charge(s,n,kind){need(Number.isSafeInteger(n)&&n>=0&&n<=s.capacityReservedBytes-s.charged,'CAPACITY');s.charged+=n;s[kind]+=n;}
function row(value){exact(value,['bytes','sha256','identity']);exact(value.identity,['dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns']);need(Number.isSafeInteger(value.bytes)&&value.bytes>=0&&value.bytes<=MAX&&/^[a-f0-9]{64}$/.test(value.sha256),'PROTOCOL');}
function invoke(s,operation,body){
 parentCurrent(s);program(PYTHON,s.pythonSha256,true,s.deadlineAtMs);
 const common={protocol:PROTOCOL,operation,parent_path:s.parentPath,parent_identity:s.parentIdentity,directory_name:s.directoryName,deadline_at_ms:s.deadlineAtMs};
 const retained={...common,directory_identity:s.directoryIdentity,objects_identity:s.objectsIdentity,init:s.init,expected_objects:[...s.objects.values()].map(e=>e.row)};
 const request=operation==='create'?{...common,init_base64:body.toString('base64'),init_sha256:hash(body)}:operation==='verify'?retained:{...retained,body_base64:body.toString('base64'),body_sha256:hash(body)};
 const input=Buffer.from(JSON.stringify(request));need(input.length<=14*1024*1024,'REQUEST_LIMIT');const remaining=Math.min(30000,s.deadlineAtMs-Date.now());need(remaining>0,'EXPIRED');
 const stdio=operation==='create'?['pipe','pipe','pipe',s.parentFd]:['pipe','pipe','pipe',s.parentFd,s.directoryFd,s.objectsFd,s.initFd];
 const child=spawnSync(PYTHON,['-I','-S','-B','-c',s.helper],{input,cwd:'/',env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'},stdio,timeout:remaining,maxBuffer:8192,killSignal:'SIGKILL'});
 let reply;try{reply=JSON.parse(child.stdout?.toString('utf8')??'');}catch{}
 if(child.error||child.signal||child.status!==0||child.stderr?.length||reply?.status==='held')throw Object.assign(Error('Evidence IO outcome uncertain; all charges and files retained'),{code:'ISSUE18_EVIDENCE_IO_OUTCOME_UNCERTAIN',receipt:freeze({status:'held',helper_code:typeof reply?.code==='string'?reply.code:'UNAVAILABLE',errno:Number.isSafeInteger(reply?.errno)?reply.errno:null,burn_attempted:reply?.burn_attempted??null,mkdir_attempted:reply?.mkdir_attempted??null,publication_attempted:reply?.publication_attempted??null,child_pid:child.pid??null,child_status:child.status??null,child_signal:child.signal??null,charged_bytes:s.charged,authority_claim:false,descendant_closure:'UNKNOWN',retry:false})},{cause:child.error});
 need(reply?.protocol===PROTOCOL&&reply.authority_claim===false&&reply.status===({create:'created',publish:'published',verify:'verified'})[operation],'PROTOCOL');return reply;
}
function get(handle){const s=sessions.get(handle);need(s,'FOREIGN_HANDLE');return s;}
function poison(s,error){s.poisoned=true;return error;}
function closeOwned(s){const errors=[];for(const fd of s.ownedFds.reverse())try{fs.closeSync(fd);}catch(e){errors.push(e);}s.ownedFds=[];return errors;}

export function createComparisonEvidenceStorageFrom(run,actualStore,request){
 // Selection and irreversible per-slot initialization spend belong to this
 // fixed genuine issuer, before any IO. Public flags/callbacks are not proof.
 const loan=consumeComparisonEvidenceStorageEntitlementFrom(run,actualStore,request);
 exact(loan,['parentFd','parentPath','directoryName','pythonSha256','deadlineAtMs','capacityReservedBytes','retentionRef','initialization','runId','armId','phase']);
 const s={...loan,closed:false,poisoned:false,ownedFds:[],objects:new Map(),refs:new Map(),pins:new Set(),charged:0,initBytes:0,headerBytes:0,eventBytes:0,pinCopyBytes:0,blobBytes:0};
 try{
  need(process.platform==='darwin'&&typeof process.getuid==='function','HOST_UNSUPPORTED');need(s.capacityReservedBytes===MAX&&Number.isSafeInteger(s.deadlineAtMs)&&s.deadlineAtMs>Date.now(),'POLICY');
  need(Number.isSafeInteger(s.parentFd)&&s.parentFd>=0&&typeof s.parentPath==='string'&&path.isAbsolute(s.parentPath)&&path.resolve(s.parentPath)===s.parentPath&&/^a-[a-f0-9]{64}$/.test(s.directoryName),'POLICY');
  s.parentIdentity=directory(s.parentFd);s.directoryPath=path.join(s.parentPath,s.directoryName);s.objectsPath=path.join(s.directoryPath,'objects');
  const init=encodeIssue18LedgerData({protocol:'issue18-A-storage-init-v1',run_id:s.runId,arm_id:s.armId,phase:s.phase,retention_ref:s.retentionRef,expires_at_ms:s.deadlineAtMs,capacity_reserved_bytes:s.capacityReservedBytes},4096);charge(s,init.length,'initBytes');
  parentCurrent(s);program(PYTHON,s.pythonSha256,true,s.deadlineAtMs);s.helper=program(HELPER,HELPER_SHA256,false,s.deadlineAtMs);
  const reply=invoke(s,'create',init);exact(reply,['protocol','status','directory_identity','objects_identity','init','authority_claim']);row(reply.init);need(reply.init.bytes===init.length&&reply.init.sha256===hash(init),'INIT_READBACK');
  s.directoryIdentity=reply.directory_identity;s.objectsIdentity=reply.objects_identity;s.init=reply.init;
  const open=(file,flags)=>{const fd=fs.openSync(file,flags|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);s.ownedFds.push(fd);return fd;};
  s.directoryFd=open(s.directoryPath,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);s.objectsFd=open(s.objectsPath,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);s.initFd=open(path.join(s.parentPath,s.directoryName+'.init.json'),fs.constants.O_RDONLY);
  current(s);const handle=Object.freeze({});sessions.set(handle,s);
  completeComparisonEvidenceStorageFrom(s.initialization,handle);delete s.initialization;return handle;
 }catch(error){s.poisoned=true;closeOwned(s);throw error;}
}
export function inspectComparisonEvidenceStorageFrom(handle){
 const s=get(handle);try{current(s);return freeze({parentFd:s.parentFd,parentPath:s.parentPath,directoryName:s.directoryName,directoryFd:s.directoryFd,objectsFd:s.objectsFd,pythonSha256:s.pythonSha256,deadlineAtMs:s.deadlineAtMs,capacityReservedBytes:s.capacityReservedBytes,retentionRef:s.retentionRef,runId:s.runId,armId:s.armId,phase:s.phase,parentIdentity:{...s.parentIdentity},directoryIdentity:{...s.directoryIdentity},objectsIdentity:{...s.objectsIdentity},accounting:accounting(s),expires_at_ms:s.deadlineAtMs,retention_ref:s.retentionRef});}catch(error){throw poison(s,error);}
}
export function chargeComparisonEvidenceMetadata(handle,increments){
 const s=get(handle);try{current(s);exact(increments,['header_bytes','event_bytes','pin_copy_bytes']);const values=Object.values(increments);need(values.every(n=>Number.isSafeInteger(n)&&n>=0),'METADATA_CHARGE');const total=values.reduce((a,b)=>a+b,0);need(Number.isSafeInteger(total)&&total<=s.capacityReservedBytes-s.charged,'CAPACITY');charge(s,increments.header_bytes,'headerBytes');charge(s,increments.event_bytes,'eventBytes');charge(s,increments.pin_copy_bytes,'pinCopyBytes');return accounting(s);}catch(error){throw poison(s,error);}
}
export function publishComparisonEvidenceBlob(handle,typedBlobHandle){
 const s=get(handle);try{
  current(s);need(openCapture===0,'OPEN_CAPTURE_QUOTA');openCapture++;
  try{
   // Authenticate the private typed-capture handle BEFORE reading its public
   // ref. No caller byte buffer, ref-shaped JSON or callback can substitute.
   const body=copyBlobBytes(typedBlobHandle),ref=verifyBlob(body,typedBlobHandle.ref),key=ref.sha256+':'+ref.encoding;
   const existing=s.objects.get(ref.sha256);if(existing){need(existing.row.bytes===body.length&&readOriginal(s,existing.fd,existing.row.name,s.objectsPath,existing.row).equals(body),'OBJECT_CHANGED');s.refs.set(key,ref);return ref;}
   need(s.objects.size<QUOTA,'OBJECT_QUOTA');charge(s,body.length*2,'blobBytes');
   const reply=invoke(s,'publish',body);exact(reply,['protocol','status','object','authority_claim']);const observed=reply.object;exact(observed,['bytes','sha256','identity','name']);row({bytes:observed.bytes,sha256:observed.sha256,identity:observed.identity});need(observed.name===ref.sha256+'.blob'&&observed.bytes===ref.bytes&&observed.sha256===ref.sha256,'BLOB_READBACK');
   const fd=fs.openSync(path.join(s.objectsPath,observed.name),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);s.ownedFds.push(fd);const retained=readOriginal(s,fd,observed.name,s.objectsPath,observed);need(retained.equals(body),'BLOB_READBACK');
   s.objects.set(ref.sha256,{fd,row:observed});s.refs.set(key,ref);current(s);return ref;
  }finally{openCapture--;}
 }catch(error){throw poison(s,error);}
}
function normalizedRefs(s,refs){
 need(Array.isArray(refs)&&!types.isProxy(refs)&&Object.getPrototypeOf(refs)===Array.prototype&&refs.length>0&&refs.length<=QUOTA,'PIN_REFS');
 const d=Object.getOwnPropertyDescriptors(refs);need(Reflect.ownKeys(d).length===refs.length+1,'PIN_REFS');const out=[];
 for(let i=0;i<refs.length;i++){need(Object.hasOwn(d,String(i))&&Object.hasOwn(d[i],'value'),'PIN_REFS');const ref=d[i].value;exact(ref,['sha256','bytes','encoding','object_name']);need(typeof ref.sha256==='string'&&/^[a-f0-9]{64}$/.test(ref.sha256)&&typeof ref.encoding==='string'&&Number.isSafeInteger(ref.bytes)&&ref.bytes>=0&&ref.bytes<=MAX&&typeof ref.object_name==='string'&&ref.object_name==='objects/'+ref.sha256+'.blob','PIN_REFS');const known=s.refs.get(ref.sha256+':'+ref.encoding);need(known&&known.bytes===ref.bytes&&known.object_name===ref.object_name,'UNPUBLISHED_REF');out.push(known);}
 return out;
}
export function pinComparisonEvidenceFrom(handle,refs){
 const s=get(handle);try{current(s);need(activePins<QUOTA,'PIN_QUOTA');const normalized=normalizedRefs(s,refs),bytes=Buffer.byteLength(JSON.stringify(normalized));charge(s,bytes,'pinCopyBytes');const pin=Object.freeze({});pins.set(pin,{s,refs:normalized,released:false});s.pins.add(pin);activePins++;return pin;}catch(error){throw poison(s,error);}
}
export function assertComparisonEvidencePin(pin){
 const p=pins.get(pin);need(p&&!p.released,'FOREIGN_OR_RELEASED_PIN');const s=p.s;
 try{current(s);for(const ref of p.refs){const entry=s.objects.get(ref.sha256);need(entry,'UNPUBLISHED_REF');readOriginal(s,entry.fd,entry.row.name,s.objectsPath,entry.row);}need(Date.now()<s.deadlineAtMs,'EXPIRED');return freeze({refs:[...p.refs],retention_ref:s.retentionRef,expires_at_ms:s.deadlineAtMs,accounting:accounting(s)});}catch(error){throw poison(s,error);}
}
export function releaseComparisonEvidencePin(pin){const p=pins.get(pin);need(p,'FOREIGN_PIN');if(p.released)return;p.released=true;p.s.pins.delete(pin);activePins--;/* Charges are never recycled. */}
export function closeComparisonEvidenceStorage(handle){
 const s=get(handle);if(s.closed)return;s.closed=true;for(const pin of [...s.pins])releaseComparisonEvidencePin(pin);const errors=closeOwned(s);if(errors.length)throw new AggregateError(errors,'Evidence descriptor cleanup held; immutable and uncertain files retained');
}
