// Original selected build -> separate executable deployment. Internal software
// composition only: no model tool, caller-selected binary, issuer or ready flag.
// The trusted source/Node loader assumption is explicit; this does not attest a
// hostile same-UID/source editor, grant execution, or claim native qualification.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {originalDeveloperComponentLayout,originalPackagedComponentLayout,originalComponentLayoutPaths,inspectOriginalComponentLayout,originalComponentNodePath} from './context-component-layout.mjs';
export {preflightOriginalBootstrapMembershipContext,inspectOriginalBootstrapMembershipPreflight} from './bootstrap-membership-preflight.mjs';
export {preflightOriginalInputFrontierContext,inspectOriginalInputFrontierPreflight} from './input-frontier-wire.mjs';
import {INPUT_FRONTIER_CONTEXT_SELECTION} from './input-frontier-wire.mjs';
import {resolveOriginalInputFrontierInterpreter,inspectOriginalInputFrontierInterpreter} from './protected-source-build-slot.mjs';
export function inspectOriginalInputFrontierSupport(...args){if(args.length)throw Object.assign(Error('FRONTIER_NATIVE_SOURCE_UNAVAILABLE'),{code:'FRONTIER_NATIVE_SOURCE_UNAVAILABLE'});const h=resolveOriginalInputFrontierInterpreter(),v=inspectOriginalInputFrontierInterpreter(h);return Object.freeze({protocol:'peer-input-frontier-assignment-v1',bridge_sha256:v.recipe_sha256,creation_mode:'fresh-original-protected-thread',selection:INPUT_FRONTIER_CONTEXT_SELECTION,native_qualified:false});}

export {preflightOriginalOriginMaintenanceContext,inspectOriginalOriginMaintenancePreflight,preflightOriginalOriginFrontierSealContext,inspectOriginalOriginFrontierSealPreflight,preflightOriginalOwnerMaintenanceContext,inspectOriginalOwnerMaintenancePreflight,preflightOriginalOwnerMaintenanceFreshContext,inspectOriginalOwnerMaintenanceFreshPreflight,OWNER_MAINTENANCE_INSTRUCTION,OWNER_MAINTENANCE_FRESH_INSTRUCTION} from './origin-maintenance-wire.mjs';
import {ORIGIN_MAINTENANCE_CONTEXT_SELECTION,ORIGIN_FINAL_REVIEW_CONTEXT_SELECTION,ORIGIN_ORDINARY_TASK_CONTEXT_SELECTION} from './origin-maintenance-wire.mjs';
import {resolveOriginalOriginMaintenanceInterpreter,inspectOriginalOriginMaintenanceInterpreter,resolveOriginalOriginFinalReviewInterpreter,inspectOriginalOriginFinalReviewInterpreter,resolveOriginalOriginOrdinaryTaskInterpreter,inspectOriginalOriginOrdinaryTaskInterpreter,isOriginalContextInterpreterUnavailable} from './protected-source-build-slot.mjs';
export function inspectOriginalOriginMaintenanceSupport(...args){if(args.length)throw Object.assign(Error('ORIGIN_NATIVE_SOURCE_UNAVAILABLE'),{code:'ORIGIN_NATIVE_SOURCE_UNAVAILABLE'});try{const h=resolveOriginalOriginMaintenanceInterpreter(),v=inspectOriginalOriginMaintenanceInterpreter(h);return Object.freeze({protocol:'peer-origin-maintenance-assignment-v1',bridge_sha256:v.recipe_sha256,creation_mode:'fresh-original-protected-thread',selection:ORIGIN_MAINTENANCE_CONTEXT_SELECTION,native_qualified:false});}catch(error){if(!isOriginalContextInterpreterUnavailable(error))throw error;throw Object.assign(Error('ORIGIN_NATIVE_SOURCE_UNAVAILABLE'),{code:'ORIGIN_NATIVE_SOURCE_UNAVAILABLE'});}}
export function inspectOriginalOriginFrontierSealSupport(...args){if(args.length)throw Object.assign(Error('ORIGIN_FINAL_SOURCE_UNAVAILABLE'),{code:'ORIGIN_FINAL_SOURCE_UNAVAILABLE'});try{const h=resolveOriginalOriginFinalReviewInterpreter(),v=inspectOriginalOriginFinalReviewInterpreter(h);return Object.freeze({protocol:'peer-origin-frontier-seal-assignment-v1',bridge_sha256:v.recipe_sha256,creation_mode:'fresh-original-protected-thread',selection:ORIGIN_FINAL_REVIEW_CONTEXT_SELECTION,native_qualified:false});}catch(error){if(!isOriginalContextInterpreterUnavailable(error))throw error;throw Object.assign(Error('ORIGIN_FRONTIER_SEAL_NATIVE_SOURCE_REQUIRED'),{code:'ORIGIN_FRONTIER_SEAL_NATIVE_SOURCE_REQUIRED'});}}
// No legacy owner Native route was selected. Keep old begin held even after
// the new final-review component is qualified; its geometry is not authority.
export function inspectOriginalOwnerMaintenanceSupport(...args){throw Object.assign(Error('OWNER_REVIEW_SOURCE_UNAVAILABLE'),{code:'OWNER_REVIEW_SOURCE_UNAVAILABLE'});}
export function inspectOriginalOwnerMaintenanceFreshSupport(...args){if(args.length)throw Object.assign(Error('OWNER_FRESH_SOURCE_UNAVAILABLE'),{code:'OWNER_FRESH_SOURCE_UNAVAILABLE'});try{const h=resolveOriginalOriginFinalReviewInterpreter(),v=inspectOriginalOriginFinalReviewInterpreter(h);return Object.freeze({protocol:'peer-owner-maintenance-fresh-purpose-v1',context_protocol:'peer-owner-maintenance-assignment-v1',bridge_sha256:v.recipe_sha256,creation_mode:'fresh-original-protected-thread',selection:ORIGIN_FINAL_REVIEW_CONTEXT_SELECTION,native_qualified:false});}catch(error){if(!isOriginalContextInterpreterUnavailable(error))throw error;throw Object.assign(Error('OWNER_FRESH_SOURCE_UNAVAILABLE'),{code:'OWNER_FRESH_SOURCE_UNAVAILABLE'});}}

const REPO=fileURLToPath(new URL('../../../../',import.meta.url));
const DEVELOPER=Object.freeze({lookup:'lookupOriginalSelectedContextComponentData',inspect:'inspectOriginalSelectedContextComponentData',layout:originalDeveloperComponentLayout}),PACKAGED=Object.freeze({lookup:'lookupOriginalSelectedPackagedContextComponentData',inspect:'inspectOriginalSelectedPackagedContextComponentData',layout:originalPackagedComponentLayout});
const deploymentRoot=service=>path.join(originalComponentLayoutPaths(service.layout()).durable_root,'deployments');
const EXPECTED_PACKAGE='b040811c46db685f647bfaf5bac3db26aa055035553ee83b8e2bc228f048f55c';
const EXPECTED_MANIFEST='13b54fb0381f0deef62d47070feb3022177cbe003e60010333729313aebe956b';
const HOST='plugins/soloco/runtime/peers/codex-task-host.mjs';
const INTERPRETER='plugins/soloco/runtime/peers/peer-context-interpreter.mjs';
const pins=new WeakMap(),sidecarPrograms=new WeakMap();let loaded=null,producer=null,loadService=null,loadPromise=null;
// General P2 libraries also import the slot guard in installed plugins. Delay
// the repository-only producer's eager entry/source reads until an explicit
// original deployment/load operation; ordinary imports and Holds need no repo.
async function originalProducer(){if(!producer)producer=await import('./context-build-component.mjs');return producer;}
const digest=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const copy=v=>JSON.parse(JSON.stringify(v));
const canonical=v=>{const sort=x=>Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;return JSON.stringify(sort(v)).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'\n';};
const same=(a,b)=>canonical(a)===canonical(b);
function noLinks(file){
 if(!path.isAbsolute(file)||path.resolve(file)!==file)fail('COMPONENT_DEPLOYMENT_PATH');
 for(let p=file;;p=path.dirname(p)){try{if(fs.lstatSync(p).isSymbolicLink())fail('COMPONENT_DEPLOYMENT_PATH');}catch(e){if(e.code!=='ENOENT')throw e;}if(p===path.dirname(p))break;}
}
function read(file,maximum=256*1024*1024){
 noLinks(file);const named=fs.lstatSync(file);if(!named.isFile()||named.nlink!==1||named.size>maximum)fail('COMPONENT_DEPLOYMENT_CHANGED');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const before=fs.fstatSync(fd),b=fs.readFileSync(fd),after=fs.fstatSync(fd),now=fs.lstatSync(file);if(b.length!==before.size||['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs'].some(k=>named[k]!==before[k]||before[k]!==after[k]||after[k]!==now[k]))fail('COMPONENT_DEPLOYMENT_CHANGED');return b;}finally{fs.closeSync(fd);}
}
const ref=b=>({bytes:b.length,sha256:digest(b)});
function pin(file,expected,mode,maximum=256*1024*1024){const b=read(file,maximum);if(!same(ref(b),expected)||(fs.lstatSync(file).mode&0o777)!==mode)fail('COMPONENT_DEPLOYMENT_CHANGED');return b;}
function sync(directory){const fd=fs.openSync(directory,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function mkdir(directory){noLinks(directory);try{fs.mkdirSync(directory,{mode:0o700});sync(path.dirname(directory));}catch(e){if(e.code!=='EEXIST')throw e;}const s=fs.lstatSync(directory);if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o077))fail('COMPONENT_DEPLOYMENT_PATH');}
function immutable(file,b,mode){const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,b);fs.fchmodSync(fd,mode);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}sync(path.dirname(file));}
function selected(service){if(!producer)fail('COMPONENT_DEPLOYMENT_NOT_LOADED');const h=producer[service.lookup]();return {h,data:producer[service.inspect](h)};}
function selection(data,service){
 const layout=service.layout(),paths=originalComponentLayoutPaths(layout),current=inspectOriginalComponentLayout(layout);
 if(service===PACKAGED?!same(data.layout,current):data.layout!==undefined)fail('COMPONENT_DEPLOYMENT_LAYOUT_CHANGED');
 if(data.protocol!=='soloco-selected-context-component-data-v1'||data.kind!=='SELECTED_COMPILED_COMPONENT_DATA'||data.command.status!=='COMPILED_COMPONENT'||data.native_qualified!==false||data.claims_released!==false)fail('COMPONENT_DEPLOYMENT_ORIGINAL_REQUIRED');
 const copies=new Map(data.copies.map(r=>[r.sealed_path,r]));
 const native=name=>{const p=copies.get('native/'+name);if(!p||p.bytes<1)fail('COMPONENT_DEPLOYMENT_CHANGED');const location=path.join(data.component_root,p.sealed_path);pin(location,{bytes:p.bytes,sha256:p.sha256},0o444,name==='origin-sidecar-capture'?16*1024*1024:256*1024*1024);return {path:location,bytes:p.bytes,sha256:p.sha256,original_path:p.original_path};};
 const files={executable:native('executable'),sidecar_capture:native('origin-sidecar-capture'),compiled_manifest:native('compiled-source-manifest.json'),build_receipt:native('build-receipt.json'),source_package:native('source-package.json'),cargo_lock:native('Cargo.lock'),toolchain_manifest:native('toolchain-manifest.toml')};
 if(files.source_package.sha256!==EXPECTED_PACKAGE||files.compiled_manifest.sha256!==EXPECTED_MANIFEST)fail('COMPONENT_DEPLOYMENT_SOURCE_UNSUPPORTED');
 const profile=data.node_profile.record;
 if(profile.version!==process.version||profile.platform!==process.platform||profile.arch!==process.arch||!same(profile.exec_argv,process.execArgv)||!same(profile.node,ref(read(fs.realpathSync(process.execPath)))))fail('COMPONENT_DEPLOYMENT_NODE_CHANGED');
 // The original producer already verifies the entire Node inventory/copy map.
 // These are actual original checkout modules used by the fixed loader below.
 for(const name of [HOST,INTERPRETER]){
  const row=copies.get('node-source/'+name);if(!row||row.original_path!==originalComponentNodePath(layout,name)||!same(ref(read(row.original_path)),{bytes:row.bytes,sha256:row.sha256}))fail('COMPONENT_DEPLOYMENT_NODE_CHANGED');
 }
 return {...(service===PACKAGED?{layout:current}:{}),protocol:'soloco-original-component-deployment-v1',input_key:data.input_key,intent_key:data.intent_key,original_output_sha256:data.output.sha256,owner_epoch:data.owner_epoch,original_component_root:data.component_root,files,node_manifest_sha256:data.node_inputs.sha256,node_profile:data.node_profile.record,qualified_interpreter:'SOURCE_ASSOCIATED_ONLY',native_qualified:false,claims_released:false};
}
function prepared(data,service){
 const s=selection(data,service),directory=path.join(deploymentRoot(service),s.intent_key),file=path.join(directory,'deployment.json');noLinks(directory);
 const record=JSON.parse(read(file,1024*1024).toString('utf8'));
 const expected={...s,executable:{path:path.join(directory,'codex-soloco-protected-host'),bytes:s.files.executable.bytes,sha256:s.files.executable.sha256,mode:'100555'},sidecar_capture_executable:{path:path.join(directory,'origin-sidecar-capture'),bytes:s.files.sidecar_capture.bytes,sha256:s.files.sidecar_capture.sha256,mode:'100555'}};
 if(!same(record,expected)||!read(file,1024*1024).equals(Buffer.from(canonical(expected)))||(fs.lstatSync(file).mode&0o777)!==0o444||(fs.lstatSync(directory).mode&0o777)!==0o555)fail('COMPONENT_DEPLOYMENT_CHANGED');
 pin(expected.executable.path,{bytes:expected.executable.bytes,sha256:expected.executable.sha256},0o555);pin(expected.sidecar_capture_executable.path,{bytes:expected.sidecar_capture_executable.bytes,sha256:expected.sidecar_capture_executable.sha256},0o555,16*1024*1024);return expected;
}

/** Explicit file preparation only. Fixed source-owned destination; no spawn. */
export function prepareOriginalSelectedContextDeployment(...args){
 if(args.length)fail('COMPONENT_DEPLOYMENT_NO_ARGUMENTS');return prepareDeployment(DEVELOPER);
}
export function prepareOriginalPackagedContextDeployment(...args){if(args.length)fail('COMPONENT_DEPLOYMENT_NO_ARGUMENTS');return prepareDeployment(PACKAGED);}
async function prepareDeployment(service){
 await originalProducer();const {h,data}=selected(service),s=selection(data,service),ROOT=deploymentRoot(service),directory=path.join(ROOT,s.intent_key);
 mkdir(ROOT);
 if(!fs.existsSync(directory)){
  mkdir(directory);const executable={path:path.join(directory,'codex-soloco-protected-host'),bytes:s.files.executable.bytes,sha256:s.files.executable.sha256,mode:'100555'},sidecar_capture_executable={path:path.join(directory,'origin-sidecar-capture'),bytes:s.files.sidecar_capture.bytes,sha256:s.files.sidecar_capture.sha256,mode:'100555'};
  // A crash leaves an unselected incomplete directory. Never overwrite, repair
  // or promote it on retry; the complete exact recipe below must already exist.
  immutable(executable.path,read(s.files.executable.path),0o555);
  immutable(sidecar_capture_executable.path,read(s.files.sidecar_capture.path,16*1024*1024),0o555);
  producer[service.inspect](h);
  immutable(path.join(directory,'deployment.json'),Buffer.from(canonical({...s,executable,sidecar_capture_executable})),0o444);
  fs.chmodSync(directory,0o555);sync(directory);sync(ROOT);
 }
 const record=prepared(producer[service.inspect](h),service),handle=Object.freeze(Object.create(null));pins.set(handle,{original:h,record,service});return handle;
}
function inspectDeployment(handle,service){const r=pins.get(handle);if(!r||r.service!==service)fail('COMPONENT_DEPLOYMENT_HANDLE_REQUIRED');const current=prepared(producer[service.inspect](r.original),service);if(!same(current,r.record))fail('COMPONENT_DEPLOYMENT_CHANGED');return Object.freeze(copy(current));}
export function inspectOriginalSelectedContextDeployment(handle){return inspectDeployment(handle,DEVELOPER);}
export function inspectOriginalPackagedContextDeployment(handle){return inspectDeployment(handle,PACKAGED);}
/** Load the actual fixed original module namespaces, under the existing trusted
 * source/runtime assumption. No caller namespace, callback or JSON enrolls one. */
export async function loadOriginalSelectedPeerBridge(...args){if(args.length)fail('COMPONENT_DEPLOYMENT_NO_ARGUMENTS');return loadBridge(DEVELOPER);}
export async function loadOriginalSelectedPackagedPeerBridge(...args){if(args.length)fail('COMPONENT_DEPLOYMENT_NO_ARGUMENTS');return loadBridge(PACKAGED);}
async function loadBridge(service){
 // Latch before the first await: neither a competing service nor a failed
 // first load can select another realm. Retain the one original load promise.
 if(loadService&&loadService!==service)fail('COMPONENT_DEPLOYMENT_LAYOUT_MIXED');loadService??=service;
 if(loaded)return inspectOriginalLoadedPeerBridge();
 if(!loadPromise)loadPromise=loadBridgeOnce(service);return loadPromise;
}
async function loadBridgeOnce(service){
 await originalProducer();if(loadService!==service)fail('COMPONENT_DEPLOYMENT_LAYOUT_MIXED');const {h,data}=selected(service),record=prepared(data,service),layout=service.layout();
 const host=await import(pathToFileURL(originalComponentNodePath(layout,HOST)).href),interpreter=await import(pathToFileURL(originalComponentNodePath(layout,INTERPRETER)).href);
 if(typeof host.createCodexTaskRuntime!=='function'||typeof interpreter.prepareOriginalPeerContextDelivery!=='function')fail('COMPONENT_DEPLOYMENT_NODE_CHANGED');
 const after=prepared(producer[service.inspect](h),service);if(!same(after,record)||loadService!==service)fail('COMPONENT_DEPLOYMENT_CHANGED');
 if(loaded){if(loaded.service!==service||!same(loaded.record,record))fail('COMPONENT_DEPLOYMENT_CHANGED');return inspectOriginalLoadedPeerBridge();}
 loaded={original:h,record,host,interpreter,service,layout};return inspectOriginalLoadedPeerBridge();
}
const originalBridgeUnavailable=new WeakSet();
export const isOriginalLoadedPeerBridgeUnavailable=error=>Boolean(error&&typeof error==='object'&&originalBridgeUnavailable.has(error));
export function inspectOriginalLoadedPeerBridge(...args){
 if(args.length)fail('COMPONENT_DEPLOYMENT_NOT_LOADED');if(!loaded){const error=Object.assign(Error('COMPONENT_DEPLOYMENT_NOT_LOADED'),{code:'COMPONENT_DEPLOYMENT_NOT_LOADED'});originalBridgeUnavailable.add(error);throw error;}const current=prepared(producer[loaded.service.inspect](loaded.original),loaded.service);if(!same(current,loaded.record))fail('COMPONENT_DEPLOYMENT_CHANGED');
 const originalHome=fs.realpathSync(process.env.CODEX_HOME??path.join(os.homedir(),'.codex'));
 return Object.freeze({...copy(current),node:{root:originalComponentLayoutPaths(loaded.layout).source_root,executable:{path:process.execPath,...ref(read(fs.realpathSync(process.execPath)))},version:process.version,platform:process.platform,arch:process.arch,flags:[...process.execArgv],profile:'original-node-peer-context-interpreter-v1'},original_home:originalHome,original_home_sha256:digest(Buffer.from(originalHome))});
}
// The caller supplies normal trusted host composition inputs, never code,
// interpreter namespaces or a source association. Admission stays with P2.
export function createOriginalLoadedTaskRuntime(options){
 inspectOriginalLoadedPeerBridge();
 if(!options||Object.getPrototypeOf(options)!==Object.prototype||!options.protected_launch||Object.keys(options).some(k=>!['owner','ledger','membership','launch','protected_launch','limits','scheduler_principal_id'].includes(k)))fail('COMPONENT_DEPLOYMENT_RUNTIME_ARGUMENT');
 // Preserve the historical read-only foundation composition. The separate
 // production composition below binds its source-produced task effect client.
 return loaded.host.createCodexTaskRuntime({...options,callback_restriction:'local-foundation-qualification'});
}

// A separate fixed composition keeps the historical foundation profile intact.
// The TaskHost still requires the original protected launch and produces an
// actual running-turn incarnation before binding the transaction-local client.
export function createOriginalLoadedProductionTaskRuntime(options){
 inspectOriginalLoadedPeerBridge();
 if(!options||Object.getPrototypeOf(options)!==Object.prototype||!options.protected_launch||Object.keys(options).some(k=>!['owner','ledger','membership','launch','protected_launch','limits','scheduler_principal_id'].includes(k)))fail('COMPONENT_DEPLOYMENT_RUNTIME_ARGUMENT');
 return loaded.host.createCodexTaskRuntime({...options,callback_restriction:'task-bound-effects'});
}

function originalSidecarProgramRecord(){
 const bridge=inspectOriginalLoadedPeerBridge(),pkg=JSON.parse(read(bridge.files.source_package.path,16*1024*1024).toString('utf8')),sourcePath='plugins/soloco/helpers/origin-sidecar-capture.c',source=read(originalComponentNodePath(loaded.layout,sourcePath),1024*1024);
 if(pkg.sidecar_capture?.protocol!=='soloco-origin-sidecar-source-build-v1'||!same(pkg.sidecar_capture.source,{path:sourcePath,...ref(source)})||!same(pkg.sidecar_capture.arguments,['origin-sidecar-capture-v1'])||!bridge.sidecar_capture_executable||bridge.sidecar_capture_executable.mode!=='100555')fail('ORIGIN_SIDECAR_PROGRAM_UNAVAILABLE');
 return {protocol:'soloco-original-origin-sidecar-capture-program-v1',executable:copy(bridge.sidecar_capture_executable),source_sha256:digest(source),source_package_sha256:bridge.files.source_package.sha256,compiled_manifest_sha256:bridge.files.compiled_manifest.sha256,component_intent_key:bridge.intent_key,argv:['origin-sidecar-capture-v1'],native_qualified:false};
}
/** No caller path/descriptor/program and no compilation at capture time. The
 * selected NEW build/capsule/deployment must already exist and remain current. */
export function prepareOriginalOriginSidecarCaptureProgram(...args){
 if(args.length)fail('ORIGIN_SIDECAR_PROGRAM_UNAVAILABLE');let record;
 try{record=originalSidecarProgramRecord();}catch{fail('ORIGIN_SIDECAR_PROGRAM_UNAVAILABLE');}
 const h=Object.freeze(Object.create(null));sidecarPrograms.set(h,{original:loaded.original,record});return h;
}
export function inspectOriginalOriginSidecarCaptureProgram(h,...args){
 const r=sidecarPrograms.get(h);if(args.length||!r)fail('ORIGIN_SIDECAR_ORIGINAL_PROGRAM_REQUIRED');
 let current;try{current=originalSidecarProgramRecord();}catch{fail('ORIGIN_SIDECAR_PROGRAM_UNAVAILABLE');}
 if(loaded.original!==r.original||!same(current,r.record))fail('ORIGIN_SIDECAR_PROGRAM_CHANGED');return Object.freeze(copy(r.record));
}

export {preflightOriginalOriginOrdinaryTaskContext,inspectOriginalOriginOrdinaryTaskPreflight} from './origin-maintenance-wire.mjs';
export function inspectOriginalOriginOrdinaryTaskSupport(...args){if(args.length)throw Object.assign(Error('ORIGIN_ORDINARY_NATIVE_SOURCE_REQUIRED'),{code:'ORIGIN_ORDINARY_NATIVE_SOURCE_REQUIRED'});try{const h=resolveOriginalOriginOrdinaryTaskInterpreter(),v=inspectOriginalOriginOrdinaryTaskInterpreter(h);return Object.freeze({protocol:'peer-origin-ordinary-task-assignment-v1',bridge_sha256:v.recipe_sha256,creation_mode:'fresh-original-protected-thread',selection:ORIGIN_ORDINARY_TASK_CONTEXT_SELECTION,native_qualified:false});}catch(error){if(!isOriginalContextInterpreterUnavailable(error))throw error;throw Object.assign(Error('ORIGIN_ORDINARY_NATIVE_SOURCE_REQUIRED'),{code:'ORIGIN_ORDINARY_NATIVE_SOURCE_REQUIRED'});}}
