import fs from 'node:fs';
import {createHash} from 'node:crypto';

// Apple's CFUtilities.c reads this fixed descriptor for ProductBuildVersion.
// Read it afresh: neither an earlier diagnostic nor a subprocess timeout proves
// the system version at the next validation boundary. No command fallback.
const DESCRIPTOR='/System/Library/CoreServices/SystemVersion.plist';
const LIMIT=16384;
const PROTOCOL='apple-system-version-plist-v1';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const identity=['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'];

function failure(phase,code,cause) {
  const error=new Error(`Cannot fingerprint system build from fixed system-version descriptor (${phase}: ${code})`,cause?{cause}:undefined);
  Object.assign(error,{code,phase,method:'system-version-plist'});
  return error;
}
function format() {throw failure('parse','SYSBUILD_FORMAT');}
function xmlText(text) {
  if(/&(?!amp;|lt;|gt;|apos;|quot;|#[0-9]+;|#x[0-9a-fA-F]+;)/.test(text))format();
  return text.replace(/&(amp|lt|gt|apos|quot|#[0-9]+|#x[0-9a-fA-F]+);/g,(_whole,key)=>{
    const predefined={amp:'&',lt:'<',gt:'>',apos:"'",quot:'"'};
    if(Object.hasOwn(predefined,key))return predefined[key];
    const code=key[1]==='x'?Number.parseInt(key.slice(2),16):Number(key.slice(1));
    if(!Number.isSafeInteger(code)||!(code===9||code===10||code===13||(code>=32&&code<=0xd7ff)||(code>=0xe000&&code<=0xfffd)||(code>=0x10000&&code<=0x10ffff)))format();
    return String.fromCodePoint(code);
  });
}

// Supported fixed Apple descriptor subset: UTF-8 XML 1.0, the standard external
// plist declaration (never fetched), one dict and unique string-valued keys.
// Binary plists, internal DTDs, custom entities and unsupported XML hold closed.
export function parseSystemBuildDescriptor(bytes) {
  if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>LIMIT)format();
  let text=bytes.toString('utf8');
  if(!Buffer.from(text,'utf8').equals(bytes)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(text)||text.includes(']]>'))format();
  if(text.startsWith('\ufeff'))text=text.slice(1);
  text=text.trim();
  if(text.startsWith('<?xml')) {
    const declaration=/^<\?xml\s+version=(['"])1\.0\1(?:\s+encoding=(['"])UTF-8\2)?\s*\?>/i.exec(text);
    if(!declaration)format();
    text=text.slice(declaration[0].length).trimStart();
  }
  if(text.startsWith('<!DOCTYPE')) {
    const doctype=/^<!DOCTYPE\s+plist\s+PUBLIC\s+(['"])-\/\/Apple\/\/DTD PLIST 1\.0\/\/EN\1\s+(['"])http:\/\/www\.apple\.com\/DTDs\/PropertyList-1\.0\.dtd\2\s*>/.exec(text);
    if(!doctype)format();
    text=text.slice(doctype[0].length).trimStart();
  }
  const root=/^<plist\s+version=(['"])1\.0\1\s*>\s*<dict>\s*([\s\S]*?)\s*<\/dict>\s*<\/plist>$/.exec(text);
  if(!root)format();
  let body=root[2],build;
  const keys=new Set();
  while(body.length) {
    const item=/^<key>([^<]*)<\/key>\s*(?:<string>([^<]*)<\/string>|<string\s*\/>)\s*/.exec(body);
    if(!item)format();
    const key=xmlText(item[1]),value=xmlText(item[2]??'');
    if(!key||keys.has(key))format();
    keys.add(key);
    if(key==='ProductBuildVersion')build=value;
    body=body.slice(item[0].length);
  }
  if(typeof build!=='string'||!/^\d{1,3}[A-Z]\d{1,6}[a-z]?$/.test(build))format();
  return {protocol:PROTOCOL,system_build:build,descriptor_sha256:hash(bytes)};
}

function metadata(stat) {
  if(!stat||!stat.isFile()||stat.isSymbolicLink()||identity.some(key=>typeof stat[key]!=='bigint')||stat.uid!==0n||stat.nlink!==1n||(stat.mode&0o022n)!==0n||stat.size<1n||stat.size>BigInt(LIMIT))throw failure('metadata','SYSBUILD_METADATA');
}
function same(left,right) {return identity.every(key=>left[key]===right[key]);}

// fsAdapter is a trusted in-process deterministic-test seam. It cannot select a
// different descriptor path and is never populated from a tool/worker request.
export function readSystemBuildDescriptor(fsAdapter=fs) {
  let fd,phase='lstat',primary;
  try {
    const before=fsAdapter.lstatSync(DESCRIPTOR,{bigint:true});metadata(before);
    phase='open';
    fd=fsAdapter.openSync(DESCRIPTOR,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
    phase='fstat';
    const opened=fsAdapter.fstatSync(fd,{bigint:true});metadata(opened);
    if(!same(before,opened))throw failure('identity','SYSBUILD_RACE');
    phase='read';
    const buffer=Buffer.alloc(LIMIT+1);let used=0;
    while(used<buffer.length) {
      const length=fsAdapter.readSync(fd,buffer,used,buffer.length-used,used);
      if(!Number.isSafeInteger(length)||length<0||length>buffer.length-used)throw failure('read','SYSBUILD_READ');
      if(!length)break;
      used+=length;
    }
    if(used>LIMIT||BigInt(used)!==opened.size)throw failure('read','SYSBUILD_SIZE');
    phase='recheck';
    const after=fsAdapter.fstatSync(fd,{bigint:true}),current=fsAdapter.lstatSync(DESCRIPTOR,{bigint:true});
    metadata(after);metadata(current);
    if(!same(opened,after)||!same(after,current))throw failure('recheck','SYSBUILD_RACE');
    phase='parse';
    return parseSystemBuildDescriptor(buffer.subarray(0,used));
  } catch(error) {
    primary=error?.method==='system-version-plist'?error:failure(phase,/^[A-Z][A-Z0-9_]{0,39}$/.test(error?.code??'')?error.code:'SYSBUILD_IO',error);
    throw primary;
  } finally {
    if(fd!==undefined) {
      try{fsAdapter.closeSync(fd);}catch(error){if(!primary)throw failure('close','SYSBUILD_CLOSE',error);}
    }
  }
}
