// Fixed original POSIX FD-relative reader. No caller helper/program/descriptor.
// SOURCE association is not native qualification or company execution authority.
import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as deployment from './context-component-deployment.mjs';

const SOURCE=fileURLToPath(new URL('../../helpers/origin-sidecar-capture.c',import.meta.url));
const MAX_FILES=1000,MAX_BYTES=64*1024*1024,MAX_OUTPUT=MAX_BYTES+MAX_FILES*(4096+12)+12;
const digest=b=>createHash('sha256').update(b).digest('hex');
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const fields=['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'];
const sameStat=(a,b)=>fields.every(k=>typeof a[k]==='bigint'&&a[k]===b[k]);
function fixedBytes(file,maximum){const named=fs.lstatSync(file,{bigint:true});need(named.isFile()&&!named.isSymbolicLink()&&named.nlink===1n&&named.size>=0n&&named.size<=BigInt(maximum),'ORIGIN_SIDECAR_PROGRAM_CHANGED');const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);try{need(sameStat(named,fs.fstatSync(fd,{bigint:true})),'ORIGIN_SIDECAR_PROGRAM_CHANGED');const b=Buffer.alloc(Number(named.size)+1);let n=0;while(n<b.length){const r=fs.readSync(fd,b,n,b.length-n,null);if(!r)break;n+=r;}need(n===Number(named.size)&&sameStat(named,fs.fstatSync(fd,{bigint:true}))&&sameStat(named,fs.lstatSync(file,{bigint:true})),'ORIGIN_SIDECAR_PROGRAM_CHANGED');return b.subarray(0,n);}finally{fs.closeSync(fd);}}
function originalProgram(){
 need(['darwin','linux'].includes(process.platform)&&fs.constants.O_NOFOLLOW&&fs.constants.O_NONBLOCK&&fs.constants.O_DIRECTORY,'ORIGIN_SIDECAR_FD_REQUIRED');
 need(typeof deployment.prepareOriginalOriginSidecarCaptureProgram==='function'&&typeof deployment.inspectOriginalOriginSidecarCaptureProgram==='function','ORIGIN_SIDECAR_PROGRAM_UNAVAILABLE');
 const handle=deployment.prepareOriginalOriginSidecarCaptureProgram(),record=deployment.inspectOriginalOriginSidecarCaptureProgram(handle),source=fixedBytes(SOURCE,1024*1024);
 need(record?.protocol==='soloco-original-origin-sidecar-capture-program-v1'&&record.native_qualified===false&&record.source_sha256===digest(source)&&['source_package_sha256','compiled_manifest_sha256'].every(k=>/^[a-f0-9]{64}$/.test(record[k]??''))&&typeof record.component_intent_key==='string'&&record.component_intent_key.length>0&&record.component_intent_key.length<=2000&&!record.component_intent_key.includes('\0')&&JSON.stringify(record.argv)==='["origin-sidecar-capture-v1"]'&&record.executable?.mode==='100555'&&path.isAbsolute(record.executable.path)&&Number.isSafeInteger(record.executable.bytes)&&record.executable.bytes>0&&record.executable.bytes<=16*1024*1024&&/^[a-f0-9]{64}$/.test(record.executable.sha256??''),'ORIGIN_SIDECAR_PROGRAM_CHANGED');
 const bytes=fixedBytes(record.executable.path,16*1024*1024);need(bytes.length===record.executable.bytes&&digest(bytes)===record.executable.sha256&&(fs.lstatSync(record.executable.path).mode&0o777)===0o555,'ORIGIN_SIDECAR_PROGRAM_CHANGED');return {handle,record};
}
export function assertOriginSidecarCaptureSupport(){const {record}=originalProgram();return {protocol:record.protocol,source_sha256:record.source_sha256,native_qualified:false};}
function decode(body){
 need(Buffer.isBuffer(body)&&body.length>=12&&body.length<=MAX_OUTPUT&&body.subarray(0,8).toString('ascii')==='SOCOFS1\n','ORIGIN_SIDECAR_FRAME');const count=body.readUInt32BE(8);need(count<=MAX_FILES,'ORIGIN_SIDECAR_CAPACITY');const result=[],seen=new Set();let offset=12,total=0;
 for(let i=0;i<count;i++){need(offset+12<=body.length,'ORIGIN_SIDECAR_FRAME');const length=body.readUInt32BE(offset),size=body.readBigUInt64BE(offset+4);offset+=12;need(length>0&&length<=4096&&size<=BigInt(MAX_BYTES-total)&&BigInt(offset)+BigInt(length)+size<=BigInt(body.length),'ORIGIN_SIDECAR_FRAME');const raw=body.subarray(offset,offset+length),name=raw.toString('utf8');offset+=length;need(Buffer.from(name).equals(raw)&&!path.isAbsolute(name)&&!name.includes('\0')&&name.split('/').every(v=>v&&v!=='.'&&v!=='..')&&!seen.has(name),'ORIGIN_SIDECAR_FRAME');seen.add(name);const content=Buffer.from(body.subarray(offset,offset+Number(size)));offset+=Number(size);total+=content.length;result.push({path:name,bytes:content.length,sha256:digest(content),content});}
 need(offset===body.length,'ORIGIN_SIDECAR_FRAME');return result.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export function captureOriginSidecarContents(directory){
 const {handle,record}=originalProgram();need(typeof directory==='string'&&path.isAbsolute(directory),'ORIGIN_SIDECAR_LINK');const named=fs.lstatSync(directory,{bigint:true});need(named.isDirectory()&&!named.isSymbolicLink(),'ORIGIN_SIDECAR_LINK');const root=fs.realpathSync(directory),before=fs.lstatSync(root,{bigint:true});need(sameStat(named,before),'ORIGIN_SIDECAR_CHANGED');
 const fd=fs.openSync(root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);try{
  need(sameStat(before,fs.fstatSync(fd,{bigint:true})),'ORIGIN_SIDECAR_CHANGED');
  const result=childProcess.spawnSync(record.executable.path,record.argv,{stdio:['ignore','pipe','pipe',fd],encoding:'buffer',env:{LANG:'C',LC_ALL:'C'},timeout:30000,killSignal:'SIGKILL',maxBuffer:MAX_OUTPUT});
  const current=deployment.inspectOriginalOriginSidecarCaptureProgram(handle);need(JSON.stringify(current)===JSON.stringify(record),'ORIGIN_SIDECAR_PROGRAM_CHANGED');
  if(result.error)throw result.error;if(result.status!==0||result.signal!==null){const code=({71:'ORIGIN_SIDECAR_CHANGED',72:'ORIGIN_SIDECAR_LINK',73:'ORIGIN_SIDECAR_CAPACITY',74:'ORIGIN_SIDECAR_FRAME',75:'ORIGIN_SIDECAR_IO'})[result.status]??'ORIGIN_SIDECAR_CHANGED';throw Object.assign(Error(code),{code,status:result.status,signal:result.signal});}need(sameStat(before,fs.fstatSync(fd,{bigint:true}))&&sameStat(before,fs.lstatSync(root,{bigint:true}))&&sameStat(named,fs.lstatSync(directory,{bigint:true}))&&fs.realpathSync(directory)===root,'ORIGIN_SIDECAR_CHANGED');return decode(result.stdout);
 }finally{fs.closeSync(fd);}
}
