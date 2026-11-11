// Source-owned executable associations. Empty until an independently reviewed
// compiler/input/lock/output receipt is pinned here. Runtime JSON/flags cannot add one.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {TextDecoder} from 'node:util';
import {createHash} from 'node:crypto';
const slots=Object.freeze([]);
const fail=code=>{throw Object.assign(Error(code),{code});};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function pin(slot){
 const p=slot.executable_path,st=fs.lstatSync(p);
 if(st.isSymbolicLink()||!st.isFile()||st.nlink!==1||fs.realpathSync(p)!==p||st.size!==slot.executable_bytes||!(st.mode&0o111))fail('SUPERVISOR_SOURCE_BUILD_UNQUALIFIED');
 const fd=fs.openSync(p,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
 try{const before=fs.fstatSync(fd),sha=createHash('sha256'),buffer=Buffer.alloc(65536);let offset=0;
  while(offset<before.size){const n=fs.readSync(fd,buffer,0,Math.min(buffer.length,before.size-offset),offset);if(!n)fail('SUPERVISOR_SOURCE_BUILD_UNQUALIFIED');offset+=n;sha.update(buffer.subarray(0,n));}
  const after=fs.fstatSync(fd),now=fs.lstatSync(p);if(['dev','ino','size','mtimeMs','ctimeMs','mode','uid','nlink'].some(k=>before[k]!==after[k]||before[k]!==now[k])||sha.digest('hex')!==slot.executable_sha256)fail('SUPERVISOR_SOURCE_BUILD_UNQUALIFIED');
 }finally{fs.closeSync(fd);}
 return slot;
}
export function resolveOriginalCompanionBuildSlot(){
 if(slots.length!==1)fail('SUPERVISOR_SOURCE_BUILD_UNQUALIFIED');
 const slot=slots[0];
 if(slot.source_commit!=='c40729ea5cf8e947481b130c59807273eda2f8e9'||!['executable_sha256','source_manifest_sha256','cargo_lock_sha256','toolchain_manifest_sha256','build_receipt_sha256'].every(k=>hash(slot[k]))||slot.entry!=='codex-soloco-protected-host'||slot.scope_policy!=='V4_SCOPED_LOOPBACK_ONLY')fail('SUPERVISOR_SOURCE_BUILD_UNQUALIFIED');
 // Source/lock/toolchain/receipt paths identify frozen build artifacts, not credentials.
 for(const [file,expected]of [[slot.source_manifest_path,slot.source_manifest_sha256],[slot.cargo_lock_path,slot.cargo_lock_sha256],[slot.toolchain_manifest_path,slot.toolchain_manifest_sha256],[slot.build_receipt_path,slot.build_receipt_sha256]]){
  const st=fs.lstatSync(file);if(st.isSymbolicLink()||!st.isFile()||st.size>16*1024*1024||digest(fs.readFileSync(file))!==expected)fail('SUPERVISOR_SOURCE_BUILD_UNQUALIFIED');
 }
 return Object.freeze(JSON.parse(JSON.stringify(pin(slot))));
}
export function originalCompanionSlotMatches(slot){
 try{return JSON.stringify(resolveOriginalCompanionBuildSlot())===JSON.stringify(slot);}catch{return false;}
}

const compiledSchema='soloco-compiled-native-inputs-v1';
const commit='c40729ea5cf8e947481b130c59807273eda2f8e9',tree='078c14cecf94b522a2eff48b30996bf3f4d1bf7a';
const object=v=>v!==null&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const within=(child,root)=>child===root||child.startsWith(root+path.sep);
function artifactPin(file,root,expected,maximum=16*1024*1024){
 if(typeof file!=='string'||!path.isAbsolute(file)||path.resolve(file)!==file||!within(file,root)||!hash(expected))fail('SUPERVISOR_SOURCE_BUILD_UNQUALIFIED');
 const named=fs.lstatSync(file);if(named.isSymbolicLink()||!named.isFile()||named.nlink!==1||named.size>maximum||(named.mode&0o777)!==0o444||fs.realpathSync(file)!==file)fail('SUPERVISOR_SOURCE_BUILD_UNQUALIFIED');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
 try{const before=fs.fstatSync(fd),bytes=fs.readFileSync(fd),after=fs.fstatSync(fd),now=fs.lstatSync(file);
  if(bytes.length!==before.size||['dev','ino','size','mtimeMs','ctimeMs','mode','uid','nlink'].some(k=>named[k]!==before[k]||before[k]!==after[k]||before[k]!==now[k])||digest(bytes)!==expected)fail('SUPERVISOR_SOURCE_BUILD_UNQUALIFIED');return bytes;
 }finally{fs.closeSync(fd);}
}
function asciiCanonical(value){
 const sorted=v=>Array.isArray(v)?v.map(sorted):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
 return JSON.stringify(sorted(value)).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'\n';
}
/** Only source-owned EMPTY-by-default slots select these files. No caller path,
 * digest, runtime flag or ready/authenticated Boolean can select a descriptor. */
export function resolveOriginalSourcePreparedCompanionBuildSlot(){
 if(slots.length!==1)fail('SUPERVISOR_SOURCE_BUILD_UNQUALIFIED');
 const owned=slots[0],root=owned.artifact_root,home=path.resolve(os.homedir()),configured=process.env.CODEX_HOME;
 const configuredHome=typeof configured==='string'&&path.isAbsolute(configured)?path.resolve(configured):null;
 if(typeof root!=='string'||!path.isAbsolute(root)||path.resolve(root)!==root||root===path.parse(root).root||root===home||within(home,root)||within(root,path.join(home,'.codex'))||within(root,path.join(home,'.cos'))||(configuredHome&&within(root,configuredHome))||fs.realpathSync(root)!==root||!fs.lstatSync(root).isDirectory())fail('SUPERVISOR_SOURCE_BUILD_UNQUALIFIED');
 // Check ALL reviewed artifact locations before the legacy resolver reads them.
 for(const file of [owned.executable_path,owned.source_manifest_path,owned.cargo_lock_path,owned.toolchain_manifest_path,owned.build_receipt_path,owned.source_package_path])if(typeof file!=='string'||!within(file,root))fail('SUPERVISOR_SOURCE_BUILD_UNQUALIFIED');
 const slot=resolveOriginalCompanionBuildSlot();
 const bytes=artifactPin(slot.source_manifest_path,root,slot.source_manifest_sha256);
 let document;try{document=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}catch{fail('SUPERVISOR_COMPILED_SOURCE_ASSOCIATION_HELD');}
 // This artifact is canonical V6 JSON, unlike gateway RPC (which retains its
 // unchanged100000-byte cap). Exact ASCII canonical byte equality below rejects
 // duplicate keys, alternate encodings/whitespace and malformed source rows.
 if(!exact(document,['schema','upstream','source_package_sha256','files_count','files'])||document.schema!==compiledSchema||!exact(document.upstream,['commit','tree'])||document.upstream.commit!==commit||document.upstream.tree!==tree||document.source_package_sha256!==slot.source_package_sha256||document.files_count!==9274||!Array.isArray(document.files)||document.files.length!==9274)fail('SUPERVISOR_COMPILED_SOURCE_ASSOCIATION_HELD');
 let prior='',total=0;for(const row of document.files){if(!exact(row,['path','bytes','sha256','mode'])||typeof row.path!=='string'||row.path.length>4096||Buffer.from(row.path,'utf8').toString('utf8')!==row.path||!row.path.startsWith('codex-rs/')||row.path<=prior||row.path.includes('\\')||row.path.split('/').some(p=>!p||p==='.'||p==='..')||!Number.isSafeInteger(row.bytes)||row.bytes<0||!hash(row.sha256)||!['100644','100755'].includes(row.mode))fail('SUPERVISOR_COMPILED_SOURCE_ASSOCIATION_HELD');prior=row.path;total+=row.bytes;}
 if(total>512*1024*1024||Buffer.from(asciiCanonical(document)).compare(bytes)!==0)fail('SUPERVISOR_COMPILED_SOURCE_ASSOCIATION_HELD');
 let sourcePackage,build;try{
  sourcePackage=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(artifactPin(slot.source_package_path,root,slot.source_package_sha256)));
  build=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(artifactPin(slot.build_receipt_path,root,slot.build_receipt_sha256)));
 }catch{fail('SUPERVISOR_COMPILED_SOURCE_ASSOCIATION_HELD');}
 const lock=document.files.find(row=>row.path==='codex-rs/Cargo.lock'),association=build?.compiled_source_manifest,binary=build?.binary;
 if(sourcePackage?.schema!=='soloco-protected-native-source-package-v1'||sourcePackage.upstream?.commit!==commit||sourcePackage.upstream?.tree!==tree||sourcePackage.cargo_lock?.sha256!==slot.cargo_lock_sha256||lock?.sha256!==slot.cargo_lock_sha256||sourcePackage.toolchain?.official_manifest?.sha256!==slot.toolchain_manifest_sha256||build?.schema!=='soloco-native-source-build-receipt-v1'||build.status!=='compiled-source-only'||build.exit_code!==0||build.manifest_sha256!==slot.source_package_sha256||build.native_qualified!==false||build.source_slot_populated!==false||!exact(association,['schema','path','bytes','sha256'])||association.schema!==compiledSchema||association.path!==slot.source_manifest_path||association.bytes!==bytes.length||association.sha256!==slot.source_manifest_sha256||!exact(binary,['path','bytes','sha256'])||binary.path!==slot.executable_path||binary.bytes!==slot.executable_bytes||binary.sha256!==slot.executable_sha256)fail('SUPERVISOR_COMPILED_SOURCE_ASSOCIATION_HELD');
 // Source/output association only. These are descriptive commitments from
 // the existing source-owned reviewed slot, NEVER auth/readiness/permission or
 // a native-semantic Pass. The source-purpose/actual grant gate is separate;
 // live native/auth/provenance/provider/final-send gates run only AFTER charge.
 return Object.freeze({...slot,compiled_source_schema:compiledSchema});
}


// Distinct NEW source-owned interpreter output association. Old9274 rules above
// are unchanged. Runtime callers cannot populate the EMPTY original slots.
// The association is later output DATA: its SHA must stay external to its own
// complete immutable Node/Rust INPUT manifests. No self-hash fixed points.
import {fileURLToPath} from 'node:url';
const contextHandles=new WeakMap(),contextErrors=new WeakSet();
export const ORIGINAL_CONTEXT_SELECTION=Object.freeze({protocol:'soloco-peer-context-contract-v2',contract_id:'peer-task-and-whole-membership-context-v2-delivery-frame-v3',resource_sha256:'832fdd1c965fa0e834c030f7c1e5636e2f32636b0df899ba8aa0fa940e9032fc',context_encoding:'soloco-peer-context-frame-v2',scope_profile_id:'protected_scoped_explicit_nonincremental_rlite_v1'});
const forms=Object.freeze([
 Object.freeze({delivery_kind:'task-context',payload_protocol:'peer-task-context-v1',source_cut_protocol:null,basis_protocol:null}),
 Object.freeze({delivery_kind:'task-context',payload_protocol:'peer-task-context-v2',source_cut_protocol:null,basis_protocol:'peer-legacy-current-meaning-basis-v2'}),
 Object.freeze({delivery_kind:'membership-assignment',payload_protocol:'peer-membership-assignment-v1',source_cut_protocol:'peer-membership-context-v1',basis_protocol:null}),
 Object.freeze({delivery_kind:'membership-assignment',payload_protocol:'peer-membership-assignment-v1',source_cut_protocol:'peer-membership-context-v2',basis_protocol:'peer-legacy-current-meaning-basis-v2'})
]);
const contextHold=()=>{const e=Object.assign(Error('CONTEXT_INTERPRETER_UNAVAILABLE'),{code:'CONTEXT_INTERPRETER_UNAVAILABLE'});contextErrors.add(e);throw e;};
export const isOriginalContextInterpreterUnavailable=e=>Boolean(e&&typeof e==='object'&&contextErrors.has(e));
function ownContext(v,names){
 if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))contextHold();
 const found=Reflect.ownKeys(v);if(found.length!==names.length||found.some(k=>typeof k!=='string'||!names.includes(k)))contextHold();
 const result={};for(const k of names){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))contextHold();result[k]=d.value;}return result;
}
const copyContext=v=>JSON.parse(JSON.stringify(v)),sameContext=(a,b)=>asciiCanonical(a)===asciiCanonical(b);
function contextArtifact(input,root,maximum){const v=ownContext(input,['path','bytes','sha256']);if(!Number.isSafeInteger(v.bytes)||v.bytes<1||v.bytes>maximum)contextHold();let bytes;try{bytes=artifactPin(v.path,root,v.sha256,maximum);}catch{contextHold();}if(bytes.length!==v.bytes)contextHold();return bytes;}
function contextDocument(ref,root){const bytes=contextArtifact(ref,root,16*1024*1024);let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}catch{contextHold();}if(Buffer.from(asciiCanonical(value)).compare(bytes)!==0)contextHold();return value;}
// Source package and build receipt use their original producer's pretty JSON.
// Authenticate the exact pinned bytes first; never normalize their hashes or
// rewrite paths. These private readers confer no authority or slot selection.
function contextProducerDocument(ref,root){const bytes=contextArtifact(ref,root,16*1024*1024);try{return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}catch{contextHold();}}
function verifyContextAssociation(slot){
 const root=slot.artifact_root,home=path.resolve(os.homedir());
 if(typeof root!=='string'||!path.isAbsolute(root)||path.resolve(root)!==root||root===path.parse(root).root||within(home,root)||within(root,path.join(home,'.codex'))||within(root,path.join(home,'.cos'))||fs.realpathSync(root)!==root||!fs.lstatSync(root).isDirectory())contextHold();
 const recipeRef=ownContext(slot.context_interpreter_recipe,['path','bytes','sha256']),recipe=contextDocument(recipeRef,root);ownContext(recipe,['schema','native','node','selection','supported_forms']);
 if(recipe.schema!=='soloco-peer-context-interpreter-output-association-v1'||!sameContext(recipe.selection,ORIGINAL_CONTEXT_SELECTION)||!sameContext(recipe.supported_forms,forms))contextHold();
 const native=ownContext(recipe.native,['compiled_manifest','source_package','cargo_lock','toolchain_manifest','build_receipt','executable','upstream','entry']);
 if(!sameContext(native.upstream,{commit,tree})||native.entry!=='codex-soloco-protected-host')contextHold();
 const manifest=contextDocument(native.compiled_manifest,root),build=contextProducerDocument(native.build_receipt,root),sourcePackage=contextProducerDocument(native.source_package,root);
 ownContext(manifest,['schema','upstream','source_package_sha256','files_count','files']);
 if(manifest.source_package_sha256!==native.source_package.sha256||sourcePackage.schema!=='soloco-protected-native-source-package-v1')contextHold();
 ownContext(build.compiled_source_manifest,['schema','path','bytes','sha256']);ownContext(build.binary,['path','bytes','sha256']);
 if(build.compiled_source_manifest.schema!==manifest.schema||build.compiled_source_manifest.path!==native.compiled_manifest.path||build.compiled_source_manifest.bytes!==native.compiled_manifest.bytes)contextHold();
 if(manifest.schema!=='soloco-compiled-native-inputs-v1'||!sameContext(manifest.upstream,native.upstream)||!Array.isArray(manifest.files)||manifest.files_count!==manifest.files.length||manifest.files_count<1||manifest.files_count>20000)contextHold();
 let prior='',total=0;for(const row of manifest.files){ownContext(row,['path','bytes','sha256','mode']);if(typeof row.path!=='string'||!row.path.startsWith('codex-rs/')||row.path<=prior||row.path.includes('\\')||row.path.split('/').some(p=>!p||p==='.'||p==='..')||!Number.isSafeInteger(row.bytes)||row.bytes<0||!hash(row.sha256)||!['100644','100755'].includes(row.mode))contextHold();prior=row.path;total+=row.bytes;}if(total>512*1024*1024||manifest.files.find(row=>row.path==='codex-rs/Cargo.lock')?.sha256!==native.cargo_lock.sha256)contextHold();
 for(const ref of [native.cargo_lock,native.toolchain_manifest])contextArtifact(ref,root,16*1024*1024);
 if(build.schema!=='soloco-native-source-build-receipt-v1'||build.status!=='compiled-source-only'||build.exit_code!==0||build.native_qualified!==false||build.compiled_source_manifest?.sha256!==native.compiled_manifest.sha256||build.binary?.sha256!==native.executable.sha256||build.binary?.bytes!==native.executable.bytes||build.binary?.path!==native.executable.path||build.manifest_sha256!==native.source_package.sha256||sourcePackage.upstream?.commit!==commit||sourcePackage.upstream?.tree!==tree||sourcePackage.cargo_lock?.sha256!==native.cargo_lock.sha256||sourcePackage.toolchain?.official_manifest?.sha256!==native.toolchain_manifest.sha256)contextHold();
 if(native.executable.path!==slot.executable_path||native.executable.sha256!==slot.executable_sha256||native.executable.bytes!==slot.executable_bytes||native.compiled_manifest.path!==slot.source_manifest_path||native.compiled_manifest.sha256!==slot.source_manifest_sha256)contextHold();try{pin(slot);}catch{contextHold();}
 const node=ownContext(recipe.node,['manifest','root','executable','version','platform','arch','flags','codec','resource','profile']);
 if(node.version!==process.version||node.platform!==process.platform||node.arch!==process.arch||!sameContext(node.flags,process.execArgv)||node.executable.path!==process.execPath||node.codec.sha256!=='e174dee61f38567b3c01ae4a2593612a664b8434a775478c091aae532ef30746'||node.resource.sha256!==ORIGINAL_CONTEXT_SELECTION.resource_sha256||node.profile!=='original-node-peer-context-interpreter-v1')contextHold();
 // Runtime executable identity is the actual fixed current Node process, not
 // a caller path and not an invented requirement to copy Node into buildroot.
 ownContext(node.executable,['path','bytes','sha256']);try{pin({executable_path:node.executable.path,executable_bytes:node.executable.bytes,executable_sha256:node.executable.sha256});}catch{contextHold();}
 if(typeof node.root!=='string'||!path.isAbsolute(node.root)||path.resolve(node.root)!==node.root||!within(node.root,root)||fs.realpathSync(node.root)!==node.root)contextHold();
 const inputs=contextDocument(node.manifest,root);ownContext(inputs,['schema','files','roots','edges']);if(inputs.schema!=='soloco-node-peer-context-inputs-v1'||!Array.isArray(inputs.files)||!inputs.files.length||inputs.files.length>10000||!Array.isArray(inputs.roots)||!Array.isArray(inputs.edges))contextHold();
 prior='';total=0;const names=new Set();for(const row of inputs.files){ownContext(row,['path','bytes','sha256','mode']);if(typeof row.path!=='string'||row.path<=prior||path.isAbsolute(row.path)||row.path.includes('\\')||row.path.split('/').some(p=>!p||p==='.'||p==='..')||!['100644','100755'].includes(row.mode))contextHold();prior=row.path;names.add(row.path);total+=row.bytes;if(total>64*1024*1024)contextHold();contextArtifact({path:path.join(node.root,row.path),bytes:row.bytes,sha256:row.sha256},node.root,16*1024*1024);}
 for(const file of ['model.mjs','membership.mjs','codex-task-host.mjs','codex-host.mjs','host-protocol.mjs','peer-context-interpreter.mjs','peer-delivery-frame.mjs','peer-context-contract-v2.json','protected-source-build-slot.mjs'])if(!names.has('plugins/soloco/runtime/peers/'+file))contextHold();
 const reached=new Set(inputs.roots),todo=[...reached],edges=new Map();if(inputs.roots.some(p=>!names.has(p)))contextHold();for(const e of inputs.edges){ownContext(e,['from','to']);if(!names.has(e.from)||!names.has(e.to))contextHold();if(!edges.has(e.from))edges.set(e.from,[]);edges.get(e.from).push(e.to);}while(todo.length)for(const v of edges.get(todo.pop())??[])if(!reached.has(v)){reached.add(v);todo.push(v);}if(reached.size!==names.size)contextHold();
 for(const [ref,name,bytes,sha256] of [[node.codec,'peer-delivery-frame.mjs',7660,'e174dee61f38567b3c01ae4a2593612a664b8434a775478c091aae532ef30746'],[node.resource,'peer-context-contract-v2.json',28656,ORIGINAL_CONTEXT_SELECTION.resource_sha256]]){
  const relative='plugins/soloco/runtime/peers/'+name,row=inputs.files.find(v=>v.path===relative);
  if(!row||ref.path!==path.join(node.root,relative)||ref.path!==fileURLToPath(new URL('./'+name,import.meta.url))||ref.bytes!==bytes||ref.sha256!==sha256||row.bytes!==ref.bytes||row.sha256!==ref.sha256)contextHold();contextArtifact(ref,node.root,1024*1024);
 }
 if(path.join(node.root,'plugins/soloco/runtime/peers/protected-source-build-slot.mjs')!==fileURLToPath(import.meta.url))contextHold();
 // Full import-graph completeness and *executed* module identity additionally
 // require the original reviewed loader/deployment, not an after-the-fact hash.
 return {protocol:'soloco-peer-context-interpreter-binding-v1',recipe_sha256:recipeRef.sha256,selection:copyContext(ORIGINAL_CONTEXT_SELECTION),supported_forms:copyContext(forms),native:copyContext(native),node:copyContext(node)};
}
export function resolveOriginalPeerContextInterpreter(){
 // No hook, filesystem/provider, environment or native operation before this
 // original source selection. Empty/old unassociated slots are a finite Hold.
 if(slots.length!==1||!slots[0].context_interpreter_recipe)contextHold();
 const selected=slots[0],association=verifyContextAssociation(selected),h=Object.freeze(Object.create(null));contextHandles.set(h,{selected,association});return h;
}
function originalContext(h){const r=contextHandles.get(h);if(!r||slots.length!==1||slots[0]!==r.selected)contextHold();return r;}
export function assertOriginalPeerContextInterpreter(h,request){const r=originalContext(h),form=ownContext(request,['delivery_kind','payload_protocol','source_cut_protocol','basis_protocol']);if(!forms.some(v=>sameContext(v,form))||!sameContext(verifyContextAssociation(r.selected),r.association))contextHold();}
export function assertOriginalPeerContextInterpreterFinal(h){originalContext(h);}
export function inspectOriginalPeerContextInterpreter(h){return Object.freeze(copyContext(originalContext(h).association));}
export function inspectOriginalPeerContextSlot(h){return Object.freeze(copyContext(originalContext(h).selected));}
export function assertOriginalPeerContextSlot(h,declared){if(!sameContext(originalContext(h).selected,declared))contextHold();}
