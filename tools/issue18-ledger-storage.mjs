// Optional qualification tooling only. Storage custody is NOT a run loan,
// model allowance, Native capability, Store witness or business-schema proof.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const PROTOCOL='issue18-ledger-storage-io-v1',PYTHON='/usr/bin/python3';
const HELPER=fileURLToPath(new URL('./issue18-ledger-storage.py',import.meta.url));
const HELPER_SHA256='cdd85747baf82b25215c95ef08e8104fb6a24e4ca2f1ecb07219377ced139b5b';
const ARMS=Object.freeze(['1-files','1-patches','3-files','3-patches']);
export const ISSUE18_LEDGER_FILES=Object.freeze(['RUN.json',...ARMS.flatMap(a=>['engineer','qa'].map(p=>`slot-${a}-${p}.json`))]);
const limits=name=>name==='RUN.json'?32768:16384;
const hash=b=>createHash('sha256').update(b).digest('hex');
const sessions=new WeakMap();
const fail=code=>{throw Object.assign(Error(code),{code});};
const need=(condition,code)=>{if(!condition)fail(code);};
const exact=(value,keys)=>{
  need(value&&Object.getPrototypeOf(value)===Object.prototype,'ISSUE18_STORAGE_DATA');
  const descriptors=Object.getOwnPropertyDescriptors(value);
  need(Reflect.ownKeys(value).length===keys.length&&Object.keys(descriptors).sort().join('\0')===[...keys].sort().join('\0')&&Object.values(descriptors).every(d=>Object.hasOwn(d,'value')),'ISSUE18_STORAGE_DATA');
};
const frozen=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))frozen(v);Object.freeze(value);}return value;};

export function encodeIssue18LedgerData(value,maximum=32768){
  need(Number.isSafeInteger(maximum)&&maximum>0&&maximum<=32768,'ISSUE18_STORAGE_DATA_LIMIT');
  const parts=[],seen=new Set();let bytes=0,nodes=0;
  const emit=text=>{bytes+=Buffer.byteLength(text);need(bytes<=maximum,'ISSUE18_STORAGE_DATA_LIMIT');parts.push(text);};
  const text=s=>{need(Buffer.byteLength(s)<=maximum&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s),'ISSUE18_STORAGE_UNICODE');return JSON.stringify(s);};
  function visit(v,depth){
    need(++nodes<=8192&&depth<=32,'ISSUE18_STORAGE_DATA_LIMIT');
    if(v===null||typeof v==='boolean'){emit(String(v));return;}
    if(typeof v==='number'){need(Number.isSafeInteger(v)&&!Object.is(v,-0),'ISSUE18_STORAGE_INTEGER');emit(String(v));return;}
    if(typeof v==='string'){emit(text(v));return;}
    need(v&&typeof v==='object'&&!seen.has(v),'ISSUE18_STORAGE_DATA');seen.add(v);
    need(Reflect.ownKeys(v).every(k=>typeof k==='string'),'ISSUE18_STORAGE_DATA');
    const d=Object.getOwnPropertyDescriptors(v);
    need(Object.values(d).every(x=>Object.hasOwn(x,'value')),'ISSUE18_STORAGE_DATA');
    if(Array.isArray(v)){
      need(Object.getPrototypeOf(v)===Array.prototype&&Object.keys(d).length===v.length+1,'ISSUE18_STORAGE_DATA');emit('[');
      for(let i=0;i<v.length;i++){need(Object.hasOwn(d,String(i)),'ISSUE18_STORAGE_DATA');if(i)emit(',');visit(d[i].value,depth+1);}emit(']');
    }else{
      need(Object.getPrototypeOf(v)===Object.prototype,'ISSUE18_STORAGE_DATA');const keys=Object.keys(d).sort();emit('{');
      for(let i=0;i<keys.length;i++){const k=keys[i];need(/^[\x20-\x7e]{1,200}$/.test(k),'ISSUE18_STORAGE_DATA_KEY');if(i)emit(',');emit(text(k));emit(':');visit(d[k].value,depth+1);}emit('}');
    }
    seen.delete(v);
  }
  need(value&&Object.getPrototypeOf(value)===Object.prototype,'ISSUE18_STORAGE_DATA');visit(value,0);emit('\n');return Buffer.from(parts.join(''));
}

function identity(fd){
  const s=fs.fstatSync(fd,{bigint:true});
  need(s.isDirectory()&&(s.mode&0o777n)===0o700n&&s.uid===BigInt(process.getuid()),'ISSUE18_STORAGE_DIRECTORY');
  return Object.fromEntries(['dev','ino','mode','uid','gid'].map(k=>[k,String(s[k])]));
}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function program(file,expected,system=false){
  const before=fs.lstatSync(file,{bigint:true});
  need(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size>0n&&before.size<=150000000n,'ISSUE18_STORAGE_PROGRAM');
  if(system)need(before.uid===0n&&(before.mode&0o022n)===0n,'ISSUE18_STORAGE_PROGRAM');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try{
    const fields=['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'];
    const same=s=>fields.every(k=>s[k]===before[k]);need(same(fs.fstatSync(fd,{bigint:true})),'ISSUE18_STORAGE_PROGRAM');
    const bytes=fs.readFileSync(fd);need(same(fs.fstatSync(fd,{bigint:true}))&&same(fs.lstatSync(file,{bigint:true}))&&hash(bytes)===expected,'ISSUE18_STORAGE_PROGRAM');return bytes;
  }finally{fs.closeSync(fd);}
}
function current(s){
  need(!s.closed&&Date.now()<s.deadlineAtMs,'ISSUE18_STORAGE_CLOSED_OR_EXPIRED');
  need(equal(identity(s.parentFd),s.parent)&&equal(identity(s.directoryFd),s.directory),'ISSUE18_STORAGE_DIRECTORY_CHANGED');
}
function rows(value){
  need(Array.isArray(value)&&value.length<=9,'ISSUE18_STORAGE_PROTOCOL');const names=new Set();
  for(const row of value){exact(row,['name','bytes','sha256','identity']);need(ISSUE18_LEDGER_FILES.includes(row.name)&&!names.has(row.name)&&Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=limits(row.name)&&/^[a-f0-9]{64}$/.test(row.sha256),'ISSUE18_STORAGE_PROTOCOL');names.add(row.name);exact(row.identity,['dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns']);}
  need(value.reduce((n,r)=>n+r.bytes,0)<=163840,'ISSUE18_STORAGE_CAPACITY');return value;
}
function invoke(s,operation,name=null,body=null){
  current(s);program(PYTHON,s.pythonSha256,true);
  const request={protocol:PROTOCOL,operation,name,directory_name:s.directoryName,parent_identity:s.parent,directory_identity:s.directory,deadline_at_ms:s.deadlineAtMs,body_base64:body?.toString('base64')??null,body_sha256:body?hash(body):null,manifest_sha256:s.manifestSha256,expected_rows:s.initialized?s.retainedRows:null};
  const input=Buffer.from(JSON.stringify(request));need(input.length<=65536,'ISSUE18_STORAGE_REQUEST_LIMIT');
  const remaining=Math.min(30000,s.deadlineAtMs-Date.now());need(remaining>0,'ISSUE18_STORAGE_DEADLINE');
  const env=Object.fromEntries(['PATH','TMPDIR','TMP','TEMP'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]));
  // The fixed program is supplied by value. Ledger operations receive only the
  // ORIGINAL descriptors, never a path, cwd switch, shell or caller program.
  const child=spawnSync(PYTHON,['-I','-S','-B','-c',s.helper],{input,env,stdio:['pipe','pipe','pipe',s.parentFd,s.directoryFd],timeout:remaining,maxBuffer:65536,killSignal:'SIGKILL'});
  let reply;
  try{reply=JSON.parse(child.stdout?.toString('utf8')??'');}catch{}
  if(child.error||child.signal||child.status!==0||child.stderr?.length||reply?.status==='held'){
    s.poisoned=true;
    const receipt=frozen({status:'held',code:'ISSUE18_STORAGE_OUTCOME_UNCERTAIN',helper_code:typeof reply?.code==='string'?reply.code:'UNAVAILABLE',errno:Number.isSafeInteger(reply?.errno)?reply.errno:null,burn_may_have_occurred:operation==='initialize'||operation==='publish',child_pid:child.pid??null,child_status:child.status??null,child_signal:child.signal??null,child_error_code:child.error?.code??null,authority_claim:false,cleanup:'direct spawnSync result only; no descendant closure claim; no retry or file deletion'});
    throw Object.assign(Error(receipt.code),{code:receipt.code,receipt},{cause:child.error});
  }
  exact(reply,['protocol','status','rows','body_base64','burn_may_have_occurred','authority_claim']);
  need(reply.protocol===PROTOCOL&&reply.authority_claim===false&&['committed','observed'].includes(reply.status),'ISSUE18_STORAGE_PROTOCOL');
  need(reply.status===(operation==='initialize'||operation==='publish'?'committed':'observed')&&typeof reply.burn_may_have_occurred==='boolean'&&(operation==='read'?typeof reply.body_base64==='string':reply.body_base64===null),'ISSUE18_STORAGE_PROTOCOL');
  current(s);const observed=rows(reply.rows),actual=observed.reduce((n,r)=>n+r.bytes,0);
  if(reply.status==='committed')s.retainedRows=observed;
  return frozen({...reply,accounting:{file_payload_bytes:actual,issuer_metadata_reserved_bytes:32768,total_reserved_or_observed_bytes:actual+32768,B_upper_bytes:196608,shared_pool_upper_bytes:65536,per_call_B_slot_reserved_bytes:16384,per_call_shared_reserved_bytes:8192,A_per_call_upper_bytes:9975424,run_evidence_upper_bytes:80000000,issuer_actual_bytes:'not observed by this storage-only component',physical_allocation_bytes:null},validation:'bounded canonical finite JSON only; full A/B business schema and authority must be established by the future supported issuer'});
}

export function openIssue18LedgerStorage(policy){
  exact(policy,['parentFd','directoryFd','directoryName','pythonSha256','deadlineAtMs']);
  need(process.platform==='darwin'&&typeof process.getuid==='function','ISSUE18_STORAGE_HOST_UNSUPPORTED');
  need([policy.parentFd,policy.directoryFd].every(v=>Number.isSafeInteger(v)&&v>=0)&&policy.parentFd!==policy.directoryFd,'ISSUE18_STORAGE_FD');
  need(typeof policy.directoryName==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(policy.directoryName)&&/^[a-f0-9]{64}$/.test(policy.pythonSha256),'ISSUE18_STORAGE_POLICY');
  need(Number.isSafeInteger(policy.deadlineAtMs)&&policy.deadlineAtMs>Date.now(),'ISSUE18_STORAGE_DEADLINE');
  program(PYTHON,policy.pythonSha256,true);const helper=program(HELPER,HELPER_SHA256).toString('utf8');
  const s={...policy,parent:identity(policy.parentFd),directory:identity(policy.directoryFd),helper,initialized:false,manifestSha256:null,retainedRows:[],spent:new Set(),poisoned:false,closed:false};
  const handle=Object.freeze({});sessions.set(handle,s);return handle;
}
function state(handle){const s=sessions.get(handle);need(s,'ISSUE18_STORAGE_FOREIGN_HANDLE');current(s);return s;}
export function initializeIssue18LedgerStorage(handle,manifest){
  const s=state(handle);need(!s.initialized&&!s.poisoned&&!s.spent.has('RUN.json'),'ISSUE18_STORAGE_SPENT');
  const body=encodeIssue18LedgerData(manifest,32768);s.spent.add('RUN.json');
  try{const receipt=invoke(s,'initialize','RUN.json',body);need(receipt.status==='committed','ISSUE18_STORAGE_PROTOCOL');s.initialized=true;s.manifestSha256=hash(body);return receipt;}catch(e){s.poisoned=true;throw e;}
}
export function publishIssue18LedgerSlot(handle,arm,phase,record){
  const s=state(handle);need(ARMS.includes(arm)&&['engineer','qa'].includes(phase),'ISSUE18_STORAGE_SLOT');
  const name=`slot-${arm}-${phase}.json`;need(s.initialized&&!s.poisoned&&!s.spent.has(name),'ISSUE18_STORAGE_SPENT');
  const body=encodeIssue18LedgerData(record,16384);s.spent.add(name);
  try{return invoke(s,'publish',name,body);}catch(e){s.poisoned=true;throw e;}
}
export function inspectIssue18LedgerStorage(handle){return invoke(state(handle),'inspect');}
export function readIssue18LedgerStorage(handle,name){
  need(ISSUE18_LEDGER_FILES.includes(name),'ISSUE18_STORAGE_SLOT');const reply=invoke(state(handle),'read',name);
  const body=Buffer.from(reply.body_base64,'base64'),value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));need(encodeIssue18LedgerData(value,limits(name)).equals(body),'ISSUE18_STORAGE_NONCANONICAL');
  const row=reply.rows.find(r=>r.name===name);need(row&&row.bytes===body.length&&row.sha256===hash(body),'ISSUE18_STORAGE_READBACK');
  return frozen({value,bytes:body.length,sha256:hash(body),authority_claim:false});
}
export function closeIssue18LedgerStorage(handle){const s=sessions.get(handle);need(s,'ISSUE18_STORAGE_FOREIGN_HANDLE');s.closed=true;/* Original caller-owned FDs and immutable/partial files remain untouched. */}
