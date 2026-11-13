// Inspectable component DATA, not an active interpreter recipe or deployment.
import path from 'node:path';
import {
  lookupOriginalSelectedContextComponentData,
  inspectOriginalSelectedContextComponentData,
  lookupOriginalSelectedPackagedContextComponentData,
  inspectOriginalSelectedPackagedContextComponentData,
} from './context-build-component.mjs';

const PROTOCOL='soloco-context-component-descriptor-data-v1';
const NATIVE=Object.freeze({
  compiled_manifest:'native/compiled-source-manifest.json',
  build_receipt:'native/build-receipt.json',
  source_package:'native/source-package.json',
  cargo_lock:'native/Cargo.lock',
  toolchain_manifest:'native/toolchain-manifest.toml',
  sidecar_capture:'native/origin-sidecar-capture',
  executable:'native/executable',
});
const nativeNames=new Set(Object.values(NATIVE));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=(code='COMPONENT_DESCRIPTOR_DATA_INVALID')=>{throw Object.assign(Error(code),{code});};
function own(v,keys){
  if(!object(v)||Reflect.ownKeys(v).length!==keys.length)fail();
  for(const key of Reflect.ownKeys(v)){
    const descriptor=Object.getOwnPropertyDescriptor(v,key);
    if(typeof key!=='string'||!keys.includes(key)||!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))fail();
  }
  return v;
}
function absolute(value){
  if(typeof value!=='string'||value.length>4096||value.includes('\0')||value.includes('\\')||!path.isAbsolute(value)||path.resolve(value)!==value)fail();
  return value;
}
function relative(value){
  if(typeof value!=='string'||!value||value.length>4096||value.includes('\0')||value.includes('\\')||path.isAbsolute(value)||value.split('/').some(v=>!v||v==='.'||v==='..'))fail();
  return value;
}
function pin(value){
  own(value,['bytes','sha256']);
  if(!Number.isSafeInteger(value.bytes)||value.bytes<0||value.bytes>256*1024*1024||!hash(value.sha256))fail();
  return value;
}
const samePin=(left,right)=>object(left)&&object(right)&&left.bytes===right.bytes&&left.sha256===right.sha256;
const sameData=(left,right)=>{const sorted=v=>Array.isArray(v)?v.map(sorted):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;return JSON.stringify(sorted(left))===JSON.stringify(sorted(right));};
function reference(document){
  if(!object(document)||document.bytes<1)fail();absolute(document.path);pin({bytes:document.bytes,sha256:document.sha256});
  return {path:document.path,bytes:document.bytes,sha256:document.sha256};
}
function frozenCopy(value){
  const detached=JSON.parse(JSON.stringify(value));
  const freeze=v=>{if(v!==null&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
  return freeze(detached);
}

function packagedLayout(data){
  if(data.layout===undefined)return null;
  const v=own(data.layout,['protocol','kind','source_root','package_root','native_root','entry','durable_root','managed_data_root','layout_source','source_identity','package_identity','durable_identity','managed_identity']);
  if(v.protocol!=='soloco-context-component-layout-v1'||v.kind!=='packaged-plugin-v1')fail();
  for(const key of ['source_root','package_root','native_root','entry','durable_root','managed_data_root','layout_source'])absolute(v[key]);
  if(v.source_root!==v.package_root||v.native_root!==path.join(v.package_root,'producer-inputs/native/codex')||v.entry!==path.join(v.package_root,'producer/build-peer-context.mjs')||v.layout_source!==path.join(v.package_root,'runtime/peers/context-component-layout.mjs')||v.durable_root!==path.join(v.managed_data_root,'peer-context-component/v1')||data.component_root!==path.join(v.durable_root,'sealed',data.intent_key))fail();
  for(const [key,expected] of [['source_identity',v.source_root],['package_identity',v.package_root],['durable_identity',v.durable_root],['managed_identity',v.managed_data_root]]){const id=own(v[key],['path','dev','ino','uid','gid','mode']);if(id.path!==expected||!['dev','ino','uid','gid','mode'].every(k=>typeof id[k]==='string'&&/^[0-9]+$/.test(id[k])))fail();}
  if(!sameData(v.source_identity,v.package_identity))fail();
  return v;
}

// Private pure projection. Public callers cannot supply this DATA or a path.
function projectSelectedContextComponentDescriptorData(data){
  if(!object(data)||data.protocol!=='soloco-selected-context-component-data-v1'||data.kind!=='SELECTED_COMPILED_COMPONENT_DATA'||data.domain_closure!=='unestablished'||data.qualified_interpreter!=='HELD'||data.native_qualified!==false||data.claims_released!==false)fail();
  const root=absolute(data.component_root),command=data.command,layout=packagedLayout(data);
  if(!object(command)||command.protocol!=='soloco-context-component-command-v1'||command.status!=='COMPILED_COMPONENT'||command.result_kind!=='COMPILED_COMPONENT'||command.domain_closure!=='unestablished'||command.qualified_interpreter!=='HELD'||command.claims_released!==false||!hash(data.input_key)||!hash(data.intent_key)||command.input_key!==data.input_key||command.intent_key!==data.intent_key)fail();
  const output=reference(data.output),recipe=reference(data.recipe),capsule=reference(data.capsule);
  if(output.path!==path.join(root,'output.json')||recipe.path!==path.join(root,'recipe.json')||capsule.path!==path.join(root,'capsule-manifest.json')||output.sha256!==command.output_sha256)fail();
  const record=data.output.record,recipeRecord=data.recipe.record,capsuleRecord=data.capsule.record;
  if(layout&&(!sameData(recipeRecord?.layout,layout)||!sameData(capsuleRecord?.layout,layout)||!sameData(data.node_profile?.record?.layout,layout)))fail();
  if(!layout&&[recipeRecord,capsuleRecord,data.node_profile?.record].some(v=>object(v)&&Object.hasOwn(v,'layout')))fail();
  if(!object(record)||record.protocol!=='soloco-context-build-output-data-v1'||record.result_kind!=='COMPILED_COMPONENT'||record.input_key!==data.input_key||record.intent_key!==data.intent_key||!samePin(record.recipe,recipe)||!samePin(record.capsule_manifest,capsule))fail();
  if(!object(recipeRecord)||recipeRecord.protocol!=='soloco-context-component-copy-recipe-v1'||recipeRecord.input_key!==data.input_key||recipeRecord.intent_key!==data.intent_key||recipeRecord.result_kind!=='COMPILED_COMPONENT'||recipeRecord.domain_closure!=='unestablished'||!Array.isArray(recipeRecord.copies))fail();
  if(!hash(record.reservation_sha256)||!hash(record.process_sha256)||recipeRecord.reservation_sha256!==record.reservation_sha256||recipeRecord.process_sha256!==record.process_sha256)fail();
  if(!object(capsuleRecord)||capsuleRecord.protocol!=='soloco-context-component-capsule-v1'||capsuleRecord.input_key!==data.input_key||capsuleRecord.intent_key!==data.intent_key||capsuleRecord.result_kind!=='COMPILED_COMPONENT'||capsuleRecord.domain_closure!=='unestablished'||!Array.isArray(capsuleRecord.files)||capsuleRecord.files.length>20000)fail();
  if(!Array.isArray(data.copies)||data.copies.length!==recipeRecord.copies.length||data.copies.length>20000)fail();
  const files=new Map(),originals=new Set(),sealed=new Map();let total=0;
  for(const file of capsuleRecord.files){
    own(file,['path','bytes','sha256','mode']);relative(file.path);pin({bytes:file.bytes,sha256:file.sha256});
    total+=file.bytes;if(total>512*1024*1024||files.has(file.path)||!['100644','100755'].includes(file.mode)||(file.path.startsWith('native/')&&!nativeNames.has(file.path)))fail();files.set(file.path,file);
  }
  for(let index=0;index<data.copies.length;index++){
    const copy=own(data.copies[index],['original_path','sealed_path','bytes','sha256']);
    const original=own(recipeRecord.copies[index],['original_path','sealed_path','bytes','sha256']);
    absolute(copy.original_path);relative(copy.sealed_path);pin({bytes:copy.bytes,sha256:copy.sha256});
    if(layout&&copy.sealed_path.startsWith('node-source/')){const logical=copy.sealed_path.slice('node-source/'.length);if(!logical.startsWith('plugins/soloco/')||copy.original_path!==path.join(layout.package_root,logical.slice('plugins/soloco/'.length)))fail();}
    if(copy.original_path!==original.original_path||copy.sealed_path!==original.sealed_path||!samePin(copy,original)||originals.has(copy.original_path)||sealed.has(copy.sealed_path))fail();
    if(copy.sealed_path.startsWith('native/')?!nativeNames.has(copy.sealed_path):!copy.sealed_path.startsWith('node-source/'))fail();
    const file=files.get(copy.sealed_path);if(!file||!samePin(file,copy))fail();
    const readPath=path.join(root,copy.sealed_path);if(!readPath.startsWith(root+path.sep)||copy.original_path===readPath)fail();
    originals.add(copy.original_path);sealed.set(copy.sealed_path,{original_path:copy.original_path,sealed_path:copy.sealed_path,read_path:readPath,bytes:copy.bytes,sha256:copy.sha256});
  }
  const native={};
  for(const [name,sealedPath] of Object.entries(NATIVE)){
    const copy=sealed.get(sealedPath),file=files.get(sealedPath);if(!copy||copy.bytes<1||file.mode!=='100644'||(name==='sidecar_capture'&&copy.bytes>16*1024*1024))fail();
    native[name]=name==='executable'||name==='sidecar_capture'?{...copy,usage:'READ_ONLY_COMPONENT_BYTES',executable:false,deployment_required:true}:copy;
  }
  for(const name of ['compiled_manifest','build_receipt','executable']){
    pin(record[name]);if(!samePin(record[name],native[name]))fail();
  }
  pin(recipeRecord.original_build_receipt);if(!samePin(recipeRecord.original_build_receipt,native.build_receipt))fail();
  own(data.owner_epoch,['owner_sha256','generation']);
  if(!hash(data.owner_epoch.owner_sha256)||!Number.isSafeInteger(data.owner_epoch.generation)||data.owner_epoch.generation<0)fail();
  own(data.journal_selection,['phase','revision','selection_sequence','state_record_sha256']);
  if(data.journal_selection.phase!=='OUTPUT_SELECTED'||!hash(data.journal_selection.state_record_sha256)||!Number.isSafeInteger(data.journal_selection.revision)||data.journal_selection.revision<1||!Number.isSafeInteger(data.journal_selection.selection_sequence)||data.journal_selection.selection_sequence<1)fail();
  own(data.journal_identity,['root','journal','anchor']);
  for(const key of ['root','journal','anchor']){
    const identity=own(data.journal_identity[key],key==='anchor'?['dev','ino','bytes','sha256']:['dev','ino']);
    if(!['dev','ino'].every(name=>typeof identity[name]==='string'&&/^[0-9]+$/.test(identity[name])))fail();
    if(key==='anchor')pin({bytes:identity.bytes,sha256:identity.sha256});
  }
  for(const [name,ref] of [['recipe.json',recipe],['node-inputs.json',data.node_inputs],['node-profile.json',data.node_profile],['selection.json',data.selection]])if(!samePin(files.get(name),ref))fail();
  const nodeInputs=reference(data.node_inputs),nodeProfile=reference(data.node_profile),selection=reference(data.selection);
  if(nodeInputs.path!==path.join(root,'node-inputs.json')||nodeProfile.path!==path.join(root,'node-profile.json')||selection.path!==path.join(root,'selection.json')||!samePin(record.node_manifest,nodeInputs))fail();
  return frozenCopy({...(layout?{layout}:{}),protocol:PROTOCOL,result_kind:'COMPILED_COMPONENT',input_key:data.input_key,intent_key:data.intent_key,
    owner_epoch:data.owner_epoch,journal:{identity:data.journal_identity,selection:data.journal_selection},component_root:root,
    original_output:{...output,record},original_recipe:recipe,original_capsule:capsule,
    node:{input_manifest:nodeInputs,runtime_profile:nodeProfile,selection},native,
    domain_closure:'unestablished',qualified_interpreter:'HELD',native_qualified:false,claims_released:false,deployment_required:true});
}

export function inspectOriginalSelectedContextComponentDescriptorData(...args){
  if(args.length)fail('COMPONENT_DESCRIPTOR_DATA_NO_ARGUMENTS');
  const handle=lookupOriginalSelectedContextComponentData();
  return projectSelectedContextComponentDescriptorData(inspectOriginalSelectedContextComponentData(handle));
}

export function inspectOriginalSelectedPackagedContextComponentDescriptorData(...args){
  if(args.length)fail('COMPONENT_DESCRIPTOR_DATA_NO_ARGUMENTS');
  const handle=lookupOriginalSelectedPackagedContextComponentData();
  return projectSelectedContextComponentDescriptorData(inspectOriginalSelectedPackagedContextComponentData(handle));
}
