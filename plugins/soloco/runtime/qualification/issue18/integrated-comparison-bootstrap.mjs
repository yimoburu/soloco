// Optional Source qualification IO. A private selected initialization is spent
// once; this component supplies physical storage custody, never Native/model,
// Store, run-admission, slot or company authority. No cold adoption or retries.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {types} from 'node:util';
import {encodeIssue18LedgerData} from '../issue18-ledger-storage.mjs';
import {consumeComparisonBootstrapEntitlement,consumeComparisonJournalEntitlement} from './integrated-comparison-issuer.mjs';

const PROTOCOL='issue18-comparison-bootstrap-io-v1',PYTHON='/usr/bin/python3';
const HELPER=fileURLToPath(new URL('./integrated-comparison-bootstrap.py',import.meta.url));
const HELPER_SHA256='ce51a651759a1b0c868e6caccb911d413e83d329b1f9b5f5c41fc029eaab0b07';
export const COMPARISON_METADATA_MAX_BYTES=32768;
export const COMPARISON_JOURNAL_ENTRY_MAX_BYTES=4096;
const sessions=new WeakMap();
const fail=code=>{throw Object.assign(Error('Issue18 bootstrap Hold: '+code),{code:'ISSUE18_BOOTSTRAP_'+code});};
const need=(ok,code)=>{if(!ok)fail(code);};
const hash=body=>createHash('sha256').update(body).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const freeze=value=>{if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;};
function exact(value,keys){
  need(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype,'PROTOCOL');
  const descriptors=Object.getOwnPropertyDescriptors(value);
  need(Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(descriptors,key)&&Object.hasOwn(descriptors[key],'value')),'PROTOCOL');
}
function canonicalText(text,maximum,{empty=false}={}){
  need(typeof text==='string'&&(empty||text.length>0),'METADATA_TEXT');
  const body=Buffer.from(text,'utf8');need(body.length<=maximum&&body.toString('utf8')===text,'METADATA_CAPACITY');
  if(!body.length)return body;
  let value;try{value=JSON.parse(text);}catch{fail('METADATA_TEXT');}
  need(encodeIssue18LedgerData(value,maximum).equals(body),'NONCANONICAL_METADATA');return body;
}
function identityFromStat(s){return Object.fromEntries(['dev','ino','mode','uid','gid'].map(key=>[key,String(s[key])]));}
function directory(fd){
  const s=fs.fstatSync(fd,{bigint:true});
  need(s.isDirectory()&&(s.mode&0o777n)===0o700n&&s.uid===BigInt(process.getuid()),'DIRECTORY');return identityFromStat(s);
}
const fileFields=['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'];
function fileVersion(s){return Object.fromEntries(fileFields.map(key=>[key==='mtimeNs'?'mtime_ns':key==='ctimeNs'?'ctime_ns':key,String(s[key])]));}
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
  need(!s.closed&&!s.poisoned&&Date.now()<s.deadlineAtMs,'CLOSED_OR_EXPIRED');
  need(same(directory(s.parentFd),s.parentIdentity),'PARENT_CHANGED');
  const named=fs.lstatSync(s.parentPath,{bigint:true});need(named.isDirectory()&&!named.isSymbolicLink()&&same(identityFromStat(named),s.parentIdentity),'PARENT_NAME_CHANGED');
}
function joinedFile(s,fd,name,expected,mode){
  const before=fs.fstatSync(fd,{bigint:true});
  need(before.isFile()&&before.nlink===1n&&(before.mode&0o777n)===BigInt(mode)&&before.uid===BigInt(process.getuid())&&before.gid===BigInt(s.parentIdentity.gid),'METADATA_FILE');
  need(same(fileVersion(before),expected.identity)&&Number(before.size)===expected.bytes&&expected.bytes>=0&&expected.bytes<=COMPARISON_METADATA_MAX_BYTES,'METADATA_CHANGED');
  const named=()=>fs.lstatSync(path.join(s.parentPath,name),{bigint:true});need(same(fileVersion(named()),expected.identity),'METADATA_NAME_CHANGED');
  const body=Buffer.alloc(expected.bytes);let offset=0;
  while(offset<body.length){need(Date.now()<s.deadlineAtMs,'DEADLINE');const n=fs.readSync(fd,body,offset,body.length-offset,offset);need(n>0,'METADATA_READ');offset+=n;}
  need(fs.readSync(fd,Buffer.alloc(1),0,1,offset)===0&&same(fileVersion(fs.fstatSync(fd,{bigint:true})),expected.identity)&&same(fileVersion(named()),expected.identity)&&hash(body)===expected.sha256,'METADATA_CHANGED');return body;
}
function physicalCurrent(s){
  parentCurrent(s);
  need(same(directory(s.directoryFd),s.directoryIdentity),'DIRECTORY_CHANGED');
  const named=fs.lstatSync(path.join(s.parentPath,s.directoryName),{bigint:true});need(named.isDirectory()&&!named.isSymbolicLink()&&same(identityFromStat(named),s.directoryIdentity),'DIRECTORY_NAME_CHANGED');
  joinedFile(s,s.anchorFd,s.anchorName,s.anchor,0o400);const journal=joinedFile(s,s.journalFd,s.journalName,s.journal,0o600);
  // Optional selected IO only. Recheck the complete NOFOLLOW ancestry and
  // current directory/metadata ACLs through the fixed original-FD helper.
  const verified=invoke(s,'verify');need(same(verified.anchor,s.anchor)&&same(verified.journal,s.journal)&&same(verified.directory_identity,s.directoryIdentity),'READBACK');
  need(s.issuerStoredBytes+s.anchor.bytes+s.journal.bytes<=COMPARISON_METADATA_MAX_BYTES,'METADATA_CAPACITY');return journal;
}
function checkedRow(row){
  exact(row,['bytes','sha256','identity']);exact(row.identity,['dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns']);
  need(Number.isSafeInteger(row.bytes)&&row.bytes>=0&&row.bytes<=COMPARISON_METADATA_MAX_BYTES&&/^[a-f0-9]{64}$/.test(row.sha256)&&Object.values(row.identity).every(value=>typeof value==='string'&&/^[0-9]+$/.test(value)),'PROTOCOL');
}
function invoke(s,operation,event=null){
  parentCurrent(s);program(PYTHON,s.pythonSha256,true,s.deadlineAtMs);
  const common={protocol:PROTOCOL,operation,parent_path:s.parentPath,parent_identity:s.parentIdentity,directory_name:s.directoryName,deadline_at_ms:s.deadlineAtMs,issuer_stored_bytes:s.issuerStoredBytes};
  const retained={...common,directory_identity:s.directoryIdentity,anchor:s.anchor,journal:s.journal};
  const request=operation==='create'?{...common,anchor_base64:s.anchorBody.toString('base64'),anchor_sha256:hash(s.anchorBody),journal_base64:s.initialJournalBody.toString('base64'),journal_sha256:hash(s.initialJournalBody)}:
    operation==='verify'?retained:{...retained,event_base64:event.toString('base64'),event_sha256:hash(event)};
  const input=Buffer.from(JSON.stringify(request));need(input.length<=65536,'REQUEST_LIMIT');
  const remaining=Math.min(30000,s.deadlineAtMs-Date.now());need(remaining>0,'DEADLINE');s.helperAttempted=true;
  const descriptors=operation==='create'?['pipe','pipe','pipe',s.parentFd]:['pipe','pipe','pipe',s.parentFd,s.journalFd,s.anchorFd,s.directoryFd];
  const child=spawnSync(PYTHON,['-I','-S','-B','-c',s.helper],{input,cwd:'/',env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'},stdio:descriptors,timeout:remaining,maxBuffer:8192,killSignal:'SIGKILL'});
  let reply;try{reply=JSON.parse(child.stdout?.toString('utf8')??'');}catch{}
  if(child.error||child.signal||child.status!==0||child.stderr?.length||reply?.status==='held'){
    throw Object.assign(Error('Issue18 bootstrap helper outcome held'),{code:'ISSUE18_BOOTSTRAP_OUTCOME_UNCERTAIN',receipt:freeze({status:'held',helper_code:typeof reply?.code==='string'?reply.code:'UNAVAILABLE',errno:Number.isSafeInteger(reply?.errno)?reply.errno:null,initialization_spent:true,burn_may_have_occurred:reply?.burn_may_have_occurred??true,mkdir_attempted:reply?.mkdir_attempted??null,directory_created:reply?.directory_created??null,append_attempted:reply?.append_attempted??null,child_pid:child.pid??null,child_status:child.status??null,child_signal:child.signal??null,child_error_code:child.error?.code??null,authority_claim:false,cleanup:'direct spawnSync result only; descendant closure unknown; retain all files, no retry'})},{cause:child.error});
  }
  exact(reply,['protocol','status','directory_identity','anchor','journal','issuer_stored_bytes','external_metadata_bytes','actual_metadata_bytes','authority_claim']);exact(reply.directory_identity,['dev','ino','mode','uid','gid']);checkedRow(reply.anchor);checkedRow(reply.journal);
  need(reply.protocol===PROTOCOL&&reply.status===({create:'created',append:'appended',verify:'verified'})[operation]&&reply.authority_claim===false&&reply.issuer_stored_bytes===s.issuerStoredBytes&&reply.external_metadata_bytes===reply.anchor.bytes+reply.journal.bytes&&reply.actual_metadata_bytes===s.issuerStoredBytes+reply.external_metadata_bytes&&reply.actual_metadata_bytes<=COMPARISON_METADATA_MAX_BYTES,'PROTOCOL');
  return reply;
}
function get(handle){const s=sessions.get(handle);need(s,'FOREIGN_HANDLE');return s;}
function held(s,error){s.poisoned=true;return error;}

export function createComparisonStorage(entitlement){
  // This fixed private issuer, rather than an injected predicate or DATA flag,
  // irreversibly consumes the genuine Store-derived initialization entitlement.
  const loan=consumeComparisonBootstrapEntitlement(entitlement);
  exact(loan,['parentFd','parentPath','directoryName','pythonSha256','deadlineAtMs','selectionRecordText','selectionRef','runId','initialJournalText','issuerStoredBytes']);
  const s={...loan,closed:false,poisoned:false,helperAttempted:false,ownedFds:[]};
  try{
    need(process.platform==='darwin'&&typeof process.getuid==='function','HOST_UNSUPPORTED');
    need(Number.isSafeInteger(s.parentFd)&&s.parentFd>=0&&typeof s.parentPath==='string'&&path.isAbsolute(s.parentPath)&&s.parentPath!=='/'&&path.resolve(s.parentPath)===s.parentPath&&!s.parentPath.endsWith('/'),'PARENT');
    need(typeof s.directoryName==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(s.directoryName)&&/^[a-f0-9]{64}$/.test(s.pythonSha256),'POLICY');
    need(Number.isSafeInteger(s.deadlineAtMs)&&s.deadlineAtMs>Date.now(),'DEADLINE');
    need(Number.isSafeInteger(s.issuerStoredBytes)&&s.issuerStoredBytes>=0&&s.issuerStoredBytes<=COMPARISON_METADATA_MAX_BYTES,'METADATA_CAPACITY');
    s.parentIdentity=directory(s.parentFd);s.anchorName=s.directoryName+'.selection.json';s.journalName=s.directoryName+'.journal.jsonl';
    s.anchorBody=canonicalText(s.selectionRecordText,COMPARISON_METADATA_MAX_BYTES);s.initialJournalBody=canonicalText(s.initialJournalText,COMPARISON_JOURNAL_ENTRY_MAX_BYTES);
    need(s.issuerStoredBytes+s.anchorBody.length+s.initialJournalBody.length<=COMPARISON_METADATA_MAX_BYTES,'METADATA_CAPACITY');
    parentCurrent(s);program(PYTHON,s.pythonSha256,true,s.deadlineAtMs);s.helper=program(HELPER,HELPER_SHA256,false,s.deadlineAtMs);
    const reply=invoke(s,'create');need(reply.anchor.bytes===s.anchorBody.length&&reply.anchor.sha256===hash(s.anchorBody)&&reply.journal.bytes===s.initialJournalBody.length&&reply.journal.sha256===hash(s.initialJournalBody),'READBACK');
    s.directoryIdentity=reply.directory_identity;s.anchor=reply.anchor;s.journal=reply.journal;
    // Acquisition may use the current selected name only to acquire a candidate
    // FD. It is accepted solely after the original-parent/created-identity join.
    const open=(name,flags)=>{const fd=fs.openSync(path.join(s.parentPath,name),flags|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);s.ownedFds.push(fd);return fd;};
    s.directoryFd=open(s.directoryName,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);
    s.anchorFd=open(s.anchorName,fs.constants.O_RDONLY);s.journalFd=open(s.journalName,fs.constants.O_RDWR|fs.constants.O_APPEND);
    physicalCurrent(s);delete s.anchorBody;delete s.initialJournalBody;
    const handle=Object.freeze({});sessions.set(handle,s);return handle;
  }catch(error){
    s.poisoned=true;for(const fd of s.ownedFds.reverse())try{fs.closeSync(fd);}catch{/* Spent files are retained; no cleanup or retry claim. */}
    throw error;
  }
}
export function inspectComparisonStorage(handle){
  const s=get(handle);try{
    physicalCurrent(s);
    return freeze({parentFd:s.parentFd,directoryFd:s.directoryFd,directoryName:s.directoryName,parentPath:s.parentPath,
      pythonSha256:s.pythonSha256,deadlineAtMs:s.deadlineAtMs,selectionRef:s.selectionRef,
      anchorSha256:s.anchor.sha256,journalSha256:s.journal.sha256,journalBytes:s.journal.bytes,anchorBytes:s.anchor.bytes,
      issuerStoredBytes:s.issuerStoredBytes,externalMetadataBytes:s.anchor.bytes+s.journal.bytes,
      actualMetadataBytes:s.issuerStoredBytes+s.anchor.bytes+s.journal.bytes,parentIdentity:{...s.parentIdentity},directoryIdentity:{...s.directoryIdentity}});
  }catch(error){throw held(s,error);}
}
export function appendComparisonJournal(handle,journalEntitlement){
  const s=get(handle);try{
    const previous=physicalCurrent(s),loan=consumeComparisonJournalEntitlement(journalEntitlement,handle);
    exact(loan,['text','maximumTotalBytes']);need(loan.maximumTotalBytes===COMPARISON_METADATA_MAX_BYTES,'METADATA_CAPACITY');
    const body=canonicalText(loan.text,COMPARISON_JOURNAL_ENTRY_MAX_BYTES);
    need(s.issuerStoredBytes+s.anchor.bytes+s.journal.bytes+body.length<=COMPARISON_METADATA_MAX_BYTES,'METADATA_CAPACITY');
    const expected=Buffer.concat([previous,body]),reply=invoke(s,'append',body);
    need(same(reply.anchor,s.anchor)&&same(reply.directory_identity,s.directoryIdentity)&&reply.journal.bytes===expected.length&&reply.journal.sha256===hash(expected),'READBACK');
    s.journal=reply.journal;physicalCurrent(s);
    return freeze({status:'appended',journalSha256:s.journal.sha256,journalBytes:s.journal.bytes,anchorBytes:s.anchor.bytes,
      issuerStoredBytes:s.issuerStoredBytes,externalMetadataBytes:s.anchor.bytes+s.journal.bytes,
      actualMetadataBytes:s.issuerStoredBytes+s.anchor.bytes+s.journal.bytes,maximumTotalBytes:COMPARISON_METADATA_MAX_BYTES,authority_claim:false});
  }catch(error){throw held(s,error);}
}
export function closeComparisonStorage(handle){
  const s=get(handle);if(s.closed)return;s.closed=true;
  const errors=[];for(const fd of s.ownedFds.reverse())try{fs.closeSync(fd);}catch(error){errors.push(error);}s.ownedFds=[];
  // Parent is issuer-owned. Child/metadata FDs are closed; all durable files
  // remain. There is no unlink, repair, cold adoption or authority transfer.
  if(errors.length)throw new AggregateError(errors,'Issue18 bootstrap descriptor cleanup held; files retained');
}
