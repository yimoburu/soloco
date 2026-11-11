// Companion-only INTERNAL policy compiler. This module starts no process and
// provides no grant, credential issuer, callback probe or native qualification.
// Only an original selected interpreter/slot can produce a one-use plan.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {assertOriginalPeerContextInterpreterFinal,inspectOriginalPeerContextInterpreter,inspectOriginalPeerContextSlot,assertOriginalPeerContextSlot,originalCompanionSlotMatches} from './protected-source-build-slot.mjs';

const SELF=fileURLToPath(import.meta.url),SANDBOX='/usr/bin/sandbox-exec';
const MAX_FILE=256*1024*1024,plans=new WeakMap();
const fail=code=>{throw Object.assign(Error(code),{code});};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const copy=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const within=(child,root)=>child===root||child.startsWith(root+path.sep);
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function own(value,keys){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype)fail('SUPERVISOR_ARGUMENT');
 const found=Reflect.ownKeys(value);if(found.length!==keys.length||found.some(key=>typeof key!=='string'||!keys.includes(key)))fail('SUPERVISOR_ARGUMENT');
 const result={};for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))fail('SUPERVISOR_ARGUMENT');result[key]=descriptor.value;}return result;
}
function canonicalPath(value){
 if(typeof value!=='string'||!value.length||value.length>4096||!path.isAbsolute(value)||path.resolve(value)!==value||/[\x00-\x1f\x7f"\\]/.test(value)||Buffer.from(value).toString('utf8')!==value)fail('SUPERVISOR_PATH');return value;
}
function noLinks(value){
 canonicalPath(value);for(let cursor=value;;cursor=path.dirname(cursor)){const stat=fs.lstatSync(cursor);if(stat.isSymbolicLink())fail('SUPERVISOR_PATH');if(path.dirname(cursor)===cursor)break;}return value;
}
function directoryPin(value,privateOnly=false){
 noLinks(value);const stat=fs.lstatSync(value);if(!stat.isDirectory()||privateOnly&&(value===path.parse(value).root||value===fs.realpathSync(os.homedir())||stat.mode&0o077||stat.uid!==process.getuid()))fail('SUPERVISOR_PATH');
 return {path:value,dev:stat.dev,ino:stat.ino,mode:stat.mode,uid:stat.uid};
}
function filePin(value,maximum=MAX_FILE){
 noLinks(value);const named=fs.lstatSync(value);if(!named.isFile()||named.nlink!==1||named.size>maximum)fail('SUPERVISOR_CAPACITY');
 const fd=fs.openSync(value,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{
  const before=fs.fstatSync(fd),hash=createHash('sha256'),buffer=Buffer.alloc(65536);let offset=0;
  while(offset<before.size){const count=fs.readSync(fd,buffer,0,Math.min(buffer.length,before.size-offset),offset);if(!count)fail('SUPERVISOR_PLAN_CHANGED');hash.update(buffer.subarray(0,count));offset+=count;}
  const after=fs.fstatSync(fd),current=fs.lstatSync(value),fields=['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs'];
  if(fs.readSync(fd,buffer,0,1,offset)!==0||fields.some(key=>named[key]!==before[key]||before[key]!==after[key]||after[key]!==current[key]))fail('SUPERVISOR_PLAN_CHANGED');
  return {path:value,bytes:before.size,sha256:hash.digest('hex'),dev:before.dev,ino:before.ino,mode:before.mode,uid:before.uid,gid:before.gid,nlink:before.nlink,mtime_ms:before.mtimeMs,ctime_ms:before.ctimeMs};
 }finally{fs.closeSync(fd);}
}
const LOADED_SOURCE=freeze(filePin(SELF,100000));
function managedPin(file){
 canonicalPath(file);try{return {path:file,present:true,pin:filePin(file,16*1024*1024)};}catch(error){if(error.code!=='ENOENT')throw error;noLinks(path.dirname(file));return {path:file,present:false};}
}
function validateRequest(input){
 const request=own(input,['kind','cwd','read_paths','state_root','scratch_root','gateway_port']);
 const paths=request.read_paths;
 if(request.kind!=='codex-companion'||!Array.isArray(paths)||Object.getPrototypeOf(paths)!==Array.prototype||paths.length>32||!Number.isSafeInteger(request.gateway_port)||request.gateway_port<1||request.gateway_port>65535)fail('SUPERVISOR_ARGUMENT');
 if(Reflect.ownKeys(paths).length!==paths.length+1)fail('SUPERVISOR_ARGUMENT');
 const normalized=[];for(let index=0;index<paths.length;index++){const descriptor=Object.getOwnPropertyDescriptor(paths,String(index));if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))fail('SUPERVISOR_ARGUMENT');normalized.push(canonicalPath(descriptor.value));}
 if(new Set(normalized).size!==normalized.length)fail('SUPERVISOR_ARGUMENT');
 for(const value of [request.cwd,request.state_root,request.scratch_root])canonicalPath(value);return {...request,read_paths:normalized};
}
function fixedArgv(state,cwd){return Object.freeze(['--soloco-protected-host-v2','--state-root',canonicalPath(state),'--cwd',canonicalPath(cwd)]);}
function fixedEnvironment(home,originalHome,scratch){return Object.freeze({PATH:'/usr/bin:/bin',HOME:canonicalPath(home),CODEX_HOME:canonicalPath(originalHome),TMPDIR:canonicalPath(scratch),TMP:canonicalPath(scratch),TEMP:canonicalPath(scratch),LANG:'C',LC_ALL:'C'});}
function ancestors(paths){const result=new Set(['/']);for(const value of paths)for(let parent=path.dirname(value);;parent=path.dirname(parent)){result.add(parent);if(parent===path.dirname(parent))break;}return [...result].sort();}
function compileProfile(p){
 const literal=value=>'(literal '+JSON.stringify(canonicalPath(value))+')',subpath=value=>'(subpath '+JSON.stringify(canonicalPath(value))+')';
 if(!Number.isSafeInteger(p.gateway_port)||p.gateway_port<1||p.gateway_port>65535)fail('SUPERVISOR_ARGUMENT');
 const managed=['config.toml','auth.json'].map(name=>path.join(p.original_home,name)),writes=[p.state_root,p.scratch_root];
 const reads=[...p.reads.map(row=>(row.directory?subpath:literal)(row.path)),...p.runtime.map(row=>literal(row.path)),...managed.map(literal),literal('/dev/null'),literal('/dev/random'),literal('/dev/urandom'),subpath('/System/Library'),subpath('/usr/lib')];
 const metadata=ancestors([...p.reads.map(row=>row.path),...p.runtime.map(row=>row.path),...managed,...writes,p.cwd]).map(literal);
 return '(version 1)\n(deny default)\n(allow process-exec '+literal(p.executable)+')\n(allow sysctl-read)\n(allow file-read* '+reads.join(' ')+')\n(allow file-read-metadata '+metadata.join(' ')+')\n(allow file-read* '+writes.map(subpath).join(' ')+')\n(allow file-write* '+writes.map(subpath).join(' ')+' '+literal('/dev/null')+')\n(allow network-outbound (remote tcp4 "127.0.0.1:'+p.gateway_port+'"))\n';
}
function managedContext(slot){
 const context=slot.native_context_contract;
 if(slot.scope_policy!=='V5_ORIGINAL_MANAGED_PRIVATE_FD'||context?.mode!=='original-selected-source-managed-host'||context.scope_policy!==slot.scope_policy||context.upstream_url!=='https://chatgpt.com/backend-api/codex/responses'||typeof context.original_home!=='string'||digest(Buffer.from(context.original_home))!==context.original_home_sha256)fail('SUPERVISOR_ORIGINAL_HOST_CONTEXT_HELD');
 directoryPin(context.original_home);return context;
}
function validatePlan(record){
 const p=record.p;assertOriginalPeerContextInterpreterFinal(p.context_interpreter);assertOriginalPeerContextSlot(p.context_interpreter,p.companion_slot);
 if(!originalCompanionSlotMatches(p.companion_slot)||!same(inspectOriginalPeerContextInterpreter(p.context_interpreter),p.association))fail('SUPERVISOR_SOURCE_BUILD_UNQUALIFIED');
 const context=managedContext(p.companion_slot);
 if(!same(filePin(SELF,100000),p.source)||!same(p.source,LOADED_SOURCE)||!same(fixedArgv(p.state_root,p.cwd),p.argv)||!same(fixedEnvironment(fs.realpathSync(os.homedir()),context.original_home,p.scratch_root),p.environment))fail('SUPERVISOR_PLAN_CHANGED');
 for(const pin of [p.executable_pin,p.sandbox_pin,...p.runtime])if(!same(filePin(pin.path,pin.path===p.executable?p.companion_slot.executable_bytes:MAX_FILE),pin))fail('SUPERVISOR_PLAN_CHANGED');
 for(const expected of [p.root_pin,p.state_pin,p.scratch_pin])if(!same(directoryPin(expected.path,true),expected))fail('SUPERVISOR_PLAN_CHANGED');
 if(!same(directoryPin(p.cwd),p.cwd_pin))fail('SUPERVISOR_PLAN_CHANGED');
 for(const read of p.reads){if(read.directory){if(!same(directoryPin(read.path),read.pin))fail('SUPERVISOR_PLAN_CHANGED');}else if(!same(filePin(read.path),read.pin))fail('SUPERVISOR_PLAN_CHANGED');}
 for(const expected of p.managed_reads)if(!same(managedPin(expected.path),expected))fail('SUPERVISOR_ORIGINAL_HOST_CONTEXT_HELD');
 if(compileProfile(p)!==p.sbpl||digest(Buffer.from(p.sbpl))!==p.policy_sha256)fail('SUPERVISOR_PLAN_CHANGED');
}
function originalPlan(owner,handle){const record=plans.get(handle);if(!record||typeof owner!=='symbol'||record.owner!==owner)fail('SUPERVISOR_CODEX_PLAN_REQUIRED');return record;}
function declaration(record){
 const p=record.p;return freeze(copy({protocol:'original-compiled-codex-plan-v1',executable:p.executable,executable_pin:p.executable_pin,sandbox_executable:p.sandbox_pin.path,sandbox_pin:p.sandbox_pin,argv:p.argv,environment:p.environment,cwd:p.cwd,state_root:p.state_root,scratch_root:p.scratch_root,sbpl:p.sbpl,policy_sha256:p.policy_sha256,source:p.source,gateway_port:p.gateway_port,consumed:record.consumed,scope_root:p.root_pin.path,launch_mode:'companion-v2',companion_slot:p.companion_slot,native_auth_context:'original files read in place; native authentication remains unqualified',backend_build_qualification:'unqualified',whole_native_domain_qualification:'unqualified'}));
}
export function originalCompiledPeerContextInterpreter(owner,handle){const record=originalPlan(owner,handle);validatePlan(record);return record.p.context_interpreter;}
export function inspectOriginalCompiledCodexPlan(owner,handle){const record=originalPlan(owner,handle);validatePlan(record);return declaration(record);}
export function claimOriginalCompiledCodexPlan(owner,handle){
 const record=originalPlan(owner,handle);if(record.consumed)fail('SUPERVISOR_PLAN_CONSUMED');record.consumed=true;validatePlan(record);return declaration(record);
}
export function createPolicySupervisor(options={}){
 const {owner,directory:root}=own(options,['owner','directory']);if(typeof owner!=='symbol')fail('SUPERVISOR_OWNER');const rootPin=directoryPin(root,true);
 if(!same(filePin(SELF,100000),LOADED_SOURCE))fail('SUPERVISOR_PLAN_CHANGED');
 return Object.freeze({compile(token,input,privateBindings){
  if(token!==owner)fail('SUPERVISOR_OWNER');const request=validateRequest(input);
  if(privateBindings===undefined)fail('SUPERVISOR_CONTEXT_INTERPRETER_REQUIRED');const binding=own(privateBindings,['context_interpreter']),interpreter=binding.context_interpreter;
  const association=inspectOriginalPeerContextInterpreter(interpreter),slot=inspectOriginalPeerContextSlot(interpreter);assertOriginalPeerContextSlot(interpreter,slot);const context=managedContext(slot);
  if(process.platform!=='darwin')fail('SUPERVISOR_PLATFORM_HELD');
  const cwd=directoryPin(request.cwd),state=directoryPin(request.state_root,true),scratch=directoryPin(request.scratch_root,true),home=fs.realpathSync(os.homedir()),originalHome=context.original_home;
  if(cwd.path===path.parse(cwd.path).root||cwd.path===home||!within(state.path,root)||!within(scratch.path,root)||state.path===root||scratch.path===root||within(state.path,scratch.path)||within(scratch.path,state.path)||within(cwd.path,state.path)||within(cwd.path,scratch.path)||within(state.path,originalHome)||within(scratch.path,originalHome))fail('SUPERVISOR_PATH');
  const reads=request.read_paths.map(value=>{
   if(value===root||within(home,value)||within(originalHome,value)||within(value,originalHome)||within(value,state.path)||within(value,scratch.path)||within(state.path,value)||within(scratch.path,value))fail('SUPERVISOR_PATH');
   noLinks(value);const stat=fs.lstatSync(value);if(!stat.isFile()&&!stat.isDirectory())fail('SUPERVISOR_PATH');return {path:value,directory:stat.isDirectory(),pin:stat.isDirectory()?directoryPin(value):filePin(value)};
  });
  const executable=filePin(slot.executable_path,slot.executable_bytes),sandbox=filePin(SANDBOX,16*1024*1024),node=filePin(fs.realpathSync(process.execPath));
  if(executable.bytes!==slot.executable_bytes||executable.sha256!==slot.executable_sha256||(executable.mode&0o777)!==0o555||!(sandbox.mode&0o111)||sandbox.uid!==0||association.node.executable.bytes!==node.bytes||association.node.executable.sha256!==node.sha256)fail('SUPERVISOR_SOURCE_BUILD_UNQUALIFIED');
  const p={context_interpreter:interpreter,association:copy(association),companion_slot:copy(slot),source:copy(LOADED_SOURCE),root_pin:rootPin,cwd:cwd.path,cwd_pin:cwd,state_root:state.path,state_pin:state,scratch_root:scratch.path,scratch_pin:scratch,executable:executable.path,executable_pin:executable,sandbox_pin:sandbox,runtime:[executable,node,sandbox],reads,original_home:originalHome,managed_reads:['config.toml','auth.json'].map(name=>managedPin(path.join(originalHome,name))),gateway_port:request.gateway_port,argv:fixedArgv(state.path,cwd.path),environment:fixedEnvironment(home,originalHome,scratch.path)};
  p.sbpl=compileProfile(p);p.policy_sha256=digest(Buffer.from(p.sbpl));const record={owner,p:freeze(p),consumed:false};validatePlan(record);
  const handle=Object.freeze(Object.create(null));plans.set(handle,record);return handle;
 }});
}
