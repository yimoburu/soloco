// SOURCE observation of an explicitly supplied frozen archive. Never infer
// original historical applicability from a version, present package or hash.
import fs from 'node:fs';
import path from 'node:path';
import {types} from 'node:util';
import {createHash} from 'node:crypto';
import {canonical,peerDigest} from './ledger.mjs';

const ARCHIVE='legacy-original-policy-source-archive-v1',OBSERVATION='legacy-occupancy-policy-source-observation-v1';
const caps=new WeakMap();
const MAX_ARCHIVE=16*1024*1024,MAX_FILES=1000,MAX_SOURCE=64*1024*1024,MAX_FILE=16*1024*1024;
const required=['.claude-plugin/plugin.json','runtime/adapters.mjs','runtime/coordination.mjs','runtime/develop.mjs','runtime/engine.mjs','runtime/model-process-closure.mjs','runtime/record-storage.mjs','runtime/state-projections.mjs','runtime/store.mjs','runtime/team-source.mjs','runtime/worker.mjs'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const copy=value=>JSON.parse(canonical(value));
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fail=(code,cause)=>{throw Object.assign(Error(code,{cause}),{code});};
const need=(yes,code='LEGACY_POLICY_SOURCE_INVALID')=>{if(!yes)fail(code);};
const sameStat=(a,b)=>['dev','ino','mode','nlink','size','mtimeNs','ctimeNs'].every(k=>a[k]===b[k]);
function json(text){try{return JSON.parse(text);}catch(cause){fail('LEGACY_POLICY_SOURCE_JSON',cause);}}
function closed(value,keys){
  need(value&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype);
  const all=Reflect.ownKeys(value),descriptors=Object.getOwnPropertyDescriptors(value);
  need(all.length===keys.length&&all.every(k=>typeof k==='string'&&keys.includes(k)&&descriptors[k].enumerable&&Object.hasOwn(descriptors[k],'value')));
  return value;
}
function relative(value){return typeof value==='string'&&value.length>0&&value.length<=2000&&!/[\u0000\ud800-\udfff]/u.test(value)&&!value.includes('\\')&&!value.startsWith('/')&&value.split('/').every(p=>p&&p!=='.'&&p!=='..')&&path.posix.normalize(value)===value;}
function original(cap){const r=caps.get(cap);need(r,'LEGACY_POLICY_ORIGINAL_SOURCE_REQUIRED');return r;}
function observe(bytes){
  const text=bytes.toString('utf8');need(Buffer.from(text,'utf8').equals(bytes),'LEGACY_POLICY_SOURCE_BYTES');
  const body=closed(json(text),['protocol','runtime_version','files']);
  need(body.protocol===ARCHIVE&&typeof body.runtime_version==='string'&&body.runtime_version.length>0&&body.runtime_version.length<=100&&Array.isArray(body.files)&&body.files.length>0&&body.files.length<=MAX_FILES);
  const names=new Set(),manifest=[];let previous=null,total=0;
  for(const entry of body.files){
    closed(entry,['path','sha256','content']);need(relative(entry.path)&&!names.has(entry.path)&&(previous===null||previous<entry.path)&&hex(entry.sha256)&&typeof entry.content==='string');
    const raw=Buffer.from(entry.content,'utf8');need(raw.toString('utf8')===entry.content&&raw.length<=MAX_FILE&&hash(raw)===entry.sha256,'LEGACY_POLICY_SOURCE_BYTES');
    total+=raw.length;need(total<=MAX_SOURCE,'LEGACY_POLICY_SOURCE_CAPACITY');names.add(entry.path);previous=entry.path;
    manifest.push({path:entry.path,sha256:entry.sha256,characters:entry.content.length,utf8_bytes:raw.length});
  }
  need(required.every(name=>names.has(name)),'LEGACY_POLICY_SOURCE_INCOMPLETE');
  const pkg=json(body.files.find(f=>f.path==='.claude-plugin/plugin.json').content);
  need(pkg?.name==='soloco'&&pkg.version===body.runtime_version,'LEGACY_POLICY_SOURCE_VERSION');
  return {body,text,header:{protocol:OBSERVATION,archive_protocol:ARCHIVE,archive_sha256:hash(bytes),archive_characters:text.length,archive_utf8_bytes:bytes.length,runtime_version:body.runtime_version,source_manifest:manifest,source_manifest_sha256:peerDigest(manifest),source_utf8_bytes:total,coverage:'complete-supplied-archive-only',historical_applicability:'UNPROVED',original_policy_qualified:false,authority_issued:false}};
}

// The trusted source caller supplies ONE frozen archive file. This routine
// reads no neighboring engine, current installation, Git or company storage.
export function captureOriginalLegacyOccupancyPolicySourceFrom(archiveFile){
  need(arguments.length===1&&typeof archiveFile==='string'&&path.isAbsolute(archiveFile),'LEGACY_POLICY_SOURCE_INPUT');
  const before=fs.lstatSync(archiveFile,{bigint:true});
  need(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size>0n&&before.size<=BigInt(MAX_ARCHIVE),'LEGACY_POLICY_SOURCE_CAPACITY');
  const {O_RDONLY,O_NOFOLLOW,O_NONBLOCK}=fs.constants;
  need(Number.isInteger(O_NOFOLLOW)&&Number.isInteger(O_NONBLOCK),'LEGACY_POLICY_SOURCE_PLATFORM');
  let fd=null,primary=null;
  try{
    fd=fs.openSync(archiveFile,O_RDONLY|O_NOFOLLOW|O_NONBLOCK);
    const opened=fs.fstatSync(fd,{bigint:true});need(opened.isFile()&&sameStat(before,opened),'LEGACY_POLICY_SOURCE_CHANGED');
    const buffer=Buffer.alloc(Number(opened.size)+1);let n=0;
    while(n<buffer.length){const got=fs.readSync(fd,buffer,n,buffer.length-n,n);if(!got)break;n+=got;}
    const after=fs.fstatSync(fd,{bigint:true}),named=fs.lstatSync(archiveFile,{bigint:true});
    need(n===Number(opened.size)&&sameStat(opened,after)&&sameStat(after,named)&&!named.isSymbolicLink(),'LEGACY_POLICY_SOURCE_CHANGED');
    const value=observe(buffer.subarray(0,n)),cap=Object.freeze(Object.create(null));caps.set(cap,value);return cap;
  }catch(error){primary=error;throw error;}
  finally{if(fd!==null)try{fs.closeSync(fd);}catch(error){if(primary===null)throw error;}}
}
export function inspectOriginalLegacyOccupancyPolicySource(cap){need(arguments.length===1,'LEGACY_POLICY_SOURCE_INPUT');const r=original(cap);return copy({...r.header,archive_text:r.text,archive:r.body});}
// Cold-record DATA consistency only. This creates no original file capability,
// historical witness, review, qualification or operational authority.
export function verifyLegacyOccupancyPolicySourceData(value){
  need(arguments.length===1,'LEGACY_POLICY_SOURCE_INPUT');
  const keys=['protocol','archive_protocol','archive_sha256','archive_characters','archive_utf8_bytes','runtime_version','source_manifest','source_manifest_sha256','source_utf8_bytes','coverage','historical_applicability','original_policy_qualified','authority_issued','archive_text','archive'];
  closed(value,keys);need(typeof value.archive_text==='string'&&Buffer.byteLength(value.archive_text)<=MAX_ARCHIVE,'LEGACY_POLICY_SOURCE_CAPACITY');
  const r=observe(Buffer.from(value.archive_text)),expected={...r.header,archive_text:r.text,archive:r.body};
  need(canonical(value)===canonical(expected),'LEGACY_POLICY_SOURCE_CHANGED');return copy(expected);
}
export function readOriginalLegacyOccupancyPolicySource(cap,input){
  need(arguments.length===2,'LEGACY_POLICY_SOURCE_INPUT');const r=original(cap),a=closed(input,['path','sha256','offset','length']);
  need(relative(a.path)&&hex(a.sha256)&&Number.isSafeInteger(a.offset)&&a.offset>=0&&Number.isSafeInteger(a.length)&&a.length>0&&a.length<=4096,'LEGACY_POLICY_SOURCE_RANGE');
  const file=r.body.files.find(f=>f.path===a.path);need(file&&file.sha256===a.sha256,'LEGACY_POLICY_SOURCE_CHANGED');
  const split=i=>i>0&&i<file.content.length&&/[\uD800-\uDBFF]/.test(file.content[i-1])&&/[\uDC00-\uDFFF]/.test(file.content[i]);
  need(a.offset<file.content.length&&!split(a.offset),'LEGACY_POLICY_SOURCE_RANGE');let end=Math.min(file.content.length,a.offset+a.length);if(split(end))end--;need(end>a.offset,'LEGACY_POLICY_SOURCE_RANGE');
  return {path:file.path,sha256:file.sha256,offset:a.offset,length:end-a.offset,text:file.content.slice(a.offset,end),total_characters:file.content.length,next_offset:end<file.content.length?end:null,complete:end===file.content.length,historical_applicability:'UNPROVED',authority_issued:false};
}
