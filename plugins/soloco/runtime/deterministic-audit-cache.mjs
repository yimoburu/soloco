// Process-local structural computation cache. No semantic verdict, permission,
// durable result, attempt counter or current eligibility is stored here.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const hash=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>hash(JSON.stringify(value));
const plain=value=>value!==null&&Object.getPrototypeOf(value)===Object.prototype;
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const need=(value,message)=>{if(!value)throw Error('Deterministic audit cache: '+message);};
const clone=value=>JSON.parse(JSON.stringify(value));
const allowed=new Set(['retention-review-geometry-v1']);
const resultKeys=['protocol','sources','frames','coverage','traffic','hold_reasons'];
const forbidden=new Set(['verdict','review','acceptance','authority','authorization','permissions','permitted_action','accepted','execution_authorized','dispatch_eligibility']);
function json(value,seen=new Set(),result=false){
  if(value===null||['string','boolean'].includes(typeof value))return;
  if(typeof value==='number'){need(Number.isFinite(value)&&!Object.is(value,-0),'noncanonical number');return;}
  need(Array.isArray(value)||plain(value),'plain JSON values required');need(!seen.has(value),'cycle');seen.add(value);
  const descriptors=Object.getOwnPropertyDescriptors(value);
  need(Object.getOwnPropertySymbols(value).length===0,'symbol key');
  if(Array.isArray(value))need(Object.keys(value).length===value.length,'sparse or extended array');
  for(const [key,d]of Object.entries(descriptors)){
    if(Array.isArray(value)&&key==='length')continue;
    need(d.enumerable&&Object.hasOwn(d,'value'),'hidden or accessor field');need(!result||!forbidden.has(key),'semantic/authority values are not cacheable');json(d.value,seen,result);
  }
  seen.delete(value);
}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function identity(value){
  json(value);need(plain(value)&&value.protocol==='deterministic-package-identity-v1'&&hex(value.package_path_sha256)&&Array.isArray(value.files)&&value.files.length>0&&value.files.length<=512&&plain(value.node)&&hex(value.sha256),'complete dependency identity required');
  let previous='';let bytes=0;
  for(const file of value.files){need(plain(file)&&typeof file.path==='string'&&file.path>previous&&!path.isAbsolute(file.path)&&!file.path.split('/').some(p=>!p||p==='.'||p==='..')&&hex(file.sha256)&&Number.isSafeInteger(file.bytes)&&file.bytes>=0,'invalid dependency manifest');previous=file.path;bytes+=file.bytes;}
  need(bytes<=16777216&&typeof value.node.version==='string'&&typeof value.node.platform==='string'&&typeof value.node.arch==='string'&&Array.isArray(value.node.execArgv)&&plain(value.node.versions),'incomplete Node/policy identity');
  need(digest(Object.fromEntries(Object.entries(value).filter(([key])=>key!=='sha256')))===value.sha256,'dependency identity hash changed');return value;
}

// The whole immutable package is a conservative superset of renderer/validator
// dependencies, including non-module assets. No company directory is inspected.
export function captureDeterministicPackageIdentity(packageRoot){
  need(typeof packageRoot==='string'&&path.isAbsolute(packageRoot),'absolute immutable package root required');
  const root=fs.realpathSync(packageRoot);need(root===path.resolve(packageRoot)&&fs.lstatSync(root).isDirectory(),'package root must be a real directory');
  const files=[];let bytes=0,directories=0;
  const walk=(directory,depth=0)=>{
    need(depth<=32&&++directories<=512,'package directory traversal exceeds its fixed bound');
    const entries=fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name));
    for(const entry of entries){
      const file=path.join(directory,entry.name),stat=fs.lstatSync(file);need(!stat.isSymbolicLink(),'linked package dependency');
      const real=fs.realpathSync(file);need(real.startsWith(root+path.sep),'dependency escaped package');
      if(stat.isDirectory()){walk(file,depth+1);continue;}
      need(stat.isFile()&&stat.size<=4194304,'dependency must be a bounded regular file');
      const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);let content;
      try{const before=fs.fstatSync(fd);need(before.isFile()&&before.size===stat.size&&before.ino===stat.ino&&before.dev===stat.dev,'dependency changed before read');content=fs.readFileSync(fd);const after=fs.fstatSync(fd);need(after.size===before.size&&after.mtimeMs===before.mtimeMs&&content.length===before.size,'dependency changed during read');}finally{fs.closeSync(fd);}
      bytes+=content.length;need(files.length<512&&bytes<=16777216,'package identity exceeds bounded manifest limits');files.push({path:path.relative(root,file).split(path.sep).join('/'),bytes:content.length,sha256:hash(content)});
    }
  };
  walk(root);files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  const result={protocol:'deterministic-package-identity-v1',package_path_sha256:hash(root),files,node:{version:process.version,platform:process.platform,arch:process.arch,execArgv:[...process.execArgv],versions:{...process.versions}}};result.sha256=digest(result);identity(result);return freeze(result);
}

export function createDeterministicAuditCache({max_entries=16,max_bytes=4194304}={}){
  need(Number.isSafeInteger(max_entries)&&max_entries>0&&max_entries<=128&&Number.isSafeInteger(max_bytes)&&max_bytes>0&&max_bytes<=16777216,'invalid cache bounds');
  const entries=new Map();let bytes=0;
  return Object.freeze({
    getOrCompute(key,{validateCurrent,compute}){
      need(plain(key)&&Object.keys(key).sort().join(',')==='dependency_identity,input_sha256,kind,options'&&allowed.has(key.kind)&&hex(key.input_sha256),'complete structural key required');identity(key.dependency_identity);json(key.options);
      need(typeof validateCurrent==='function'&&typeof compute==='function','fresh synchronous current validation and computation required');
      const check=()=>{const value=validateCurrent();if(value&&typeof value.then==='function')Promise.resolve(value).catch(()=>{});need(value===undefined,'current validation must complete synchronously without a result');};
      // Run on EVERY lookup, including hits. Expiry, owner, pause, adverse state,
      // actual source/closure and one-use admission remain the caller's guards.
      check();const fingerprint=digest(key),cached=entries.get(fingerprint);
      if(cached){check();entries.delete(fingerprint);entries.set(fingerprint,cached);return {value:freeze(clone(cached.value)),cache:{hit:true,key_sha256:fingerprint,dependency_sha256:key.dependency_identity.sha256}};}
      const computed=compute();if(computed&&typeof computed.then==='function')Promise.resolve(computed).catch(()=>{});json(computed,new Set(),true);
      need(plain(computed)&&Object.keys(computed).sort().join(',')===resultKeys.sort().join(',')&&computed.protocol===key.kind,'only closed structural geometry results are cacheable');
      check();const value=freeze(clone(computed)),size=Buffer.byteLength(JSON.stringify(value),'utf8');
      if(size<=max_bytes){while(entries.size>=max_entries||bytes+size>max_bytes){const oldest=entries.keys().next().value;bytes-=entries.get(oldest).size;entries.delete(oldest);}entries.set(fingerprint,{value,size});bytes+=size;}
      return {value:freeze(clone(value)),cache:{hit:false,key_sha256:fingerprint,dependency_sha256:key.dependency_identity.sha256}};
    },
    statistics(){return {entries:entries.size,bytes,max_entries,max_bytes};}
  });
}
