import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Reuse the existing seven-native-file pure DATA fixture, below. Its pins are
// synthetic labels; no selected handle, file-read evidence or qualification.
const clone=v=>JSON.parse(JSON.stringify(v)),digest=v=>createHash('sha256').update(v).digest('hex'),pin=(label,bytes=128)=>({bytes,sha256:digest(label)});
async function moduleFor(t){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'soloco-packaged-descriptor-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=fs.readFileSync(fileURLToPath(new URL('../plugins/soloco/runtime/peers/context-component-descriptor-data.mjs',import.meta.url)),'utf8'),dependency="'./context-build-component.mjs'";assert.equal(source.split(dependency).length,2);
 const producer=path.join(root,'synthetic-unused-producer.mjs');fs.writeFileSync(producer,"export function lookupOriginalSelectedContextComponentData(){throw Error('UNUSED');}export function inspectOriginalSelectedContextComponentData(){throw Error('UNUSED');}export function lookupOriginalSelectedPackagedContextComponentData(){throw Error('UNUSED');}export function inspectOriginalSelectedPackagedContextComponentData(){throw Error('UNUSED');}\n");
 const mapped=source.replace(dependency,JSON.stringify(pathToFileURL(producer).href));assert.equal(mapped.replace(JSON.stringify(pathToFileURL(producer).href),dependency),source);const file=path.join(root,'descriptor.mjs');fs.writeFileSync(file,mapped+'\nexport {projectSelectedContextComponentDescriptorData as projectForTest};\n');return (await import(pathToFileURL(file).href)).projectForTest;
}
function projectionFixture({nodeCopy=true,sidecarBytes=2048}={}){
  // Synthetic projection DATA only: these labels are not file hashes, a selected
  // handle, original producer evidence, an executable or a native-positive case.
  const root=path.join(os.tmpdir(),'synthetic-selected-component','sealed');
  const original=path.join(os.tmpdir(),'synthetic-selected-component','original');
  const input=digest('synthetic-input'),intent=digest('synthetic-intent');
  const specs=[
    ['compiled_manifest','native/compiled-source-manifest.json','compiled-source-manifest.json',200],
    ['build_receipt','native/build-receipt.json','receipt.json',600],
    ['source_package','native/source-package.json','source-package.json',1000],
    ['cargo_lock','native/Cargo.lock','Cargo.lock',75],
    ['toolchain_manifest','native/toolchain-manifest.toml','toolchain-manifest.toml',90],
    ['sidecar_capture','native/origin-sidecar-capture','origin-sidecar-capture',sidecarBytes],
    ['executable','native/executable','target/aarch64-apple-darwin/release/codex-soloco-protected-host',4096],
  ];
  const nativePins=Object.fromEntries(specs.map(([name,sealed,recorded,bytes])=>[name,{sealed,recorded:path.join(original,recorded),...pin(sealed,bytes)}]));
  const copies=Object.values(nativePins).map(row=>({original_path:row.recorded,sealed_path:row.sealed,bytes:row.bytes,sha256:row.sha256}));
  if(nodeCopy)copies.push({original_path:path.join(original,'plugins/soloco/runtime/peers/model.mjs'),sealed_path:'node-source/plugins/soloco/runtime/peers/model.mjs',...pin('synthetic-node-copy',250)});
  const doc=(name,label,bytes,record)=>({path:path.join(root,name),...pin(label,bytes),record});
  const nodeInputs=doc('node-inputs.json','synthetic-node-inputs',800,{schema:'soloco-node-peer-context-inputs-v1',files:[],roots:[],edges:[]});
  const nodeProfile=doc('node-profile.json','synthetic-node-profile',500,{protocol:'synthetic-profile-data-only'});
  const selection=doc('selection.json','synthetic-selection',400,{protocol:'synthetic-selection-data-only'});
  const recipe=doc('recipe.json','synthetic-recipe',1800,{
    protocol:'soloco-context-component-copy-recipe-v1',result_kind:'COMPILED_COMPONENT',
    input_key:input,intent_key:intent,reservation_sha256:digest('synthetic-reservation'),
    process_sha256:digest('synthetic-process'),domain_closure:'unestablished',
    original_build_receipt:pin('native/build-receipt.json',600),copies:clone(copies),node_manifest:pin('synthetic-node-inputs',800),
  });
  const capsuleFiles=[
    ...copies.map(row=>({path:row.sealed_path,bytes:row.bytes,sha256:row.sha256,mode:'100644'})),
    ...[recipe,nodeInputs,nodeProfile,selection].map(row=>({path:path.basename(row.path),bytes:row.bytes,sha256:row.sha256,mode:'100644'})),
  ].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  const capsule=doc('capsule-manifest.json','synthetic-capsule',1600,{
    protocol:'soloco-context-component-capsule-v1',input_key:input,intent_key:intent,
    result_kind:'COMPILED_COMPONENT',domain_closure:'unestablished',files:capsuleFiles,
  });
  const output=doc('output.json','synthetic-output',1200,{
    protocol:'soloco-context-build-output-data-v1',result_kind:'COMPILED_COMPONENT',input_key:input,intent_key:intent,
    reservation_sha256:digest('synthetic-reservation'),process_sha256:digest('synthetic-process'),
    compiled_manifest:pin('native/compiled-source-manifest.json',200),
    build_receipt:pin('native/build-receipt.json',600),executable:pin('native/executable',4096),
    recipe:pin('synthetic-recipe',1800),capsule_manifest:pin('synthetic-capsule',1600),node_manifest:pin('synthetic-node-inputs',800),
  });
  const data={
    protocol:'soloco-selected-context-component-data-v1',kind:'SELECTED_COMPILED_COMPONENT_DATA',
    command:{protocol:'soloco-context-component-command-v1',status:'COMPILED_COMPONENT',result_kind:'COMPILED_COMPONENT',
      input_key:input,intent_key:intent,output_sha256:output.sha256,domain_closure:'unestablished',qualified_interpreter:'HELD',claims_released:false},
    owner_epoch:{owner_sha256:digest('synthetic-owner'),generation:0},input_key:input,intent_key:intent,
    journal_selection:{phase:'OUTPUT_SELECTED',revision:4,selection_sequence:5,state_record_sha256:digest('synthetic-journal-state')},
    journal_identity:{root:{dev:'1',ino:'2'},journal:{dev:'1',ino:'3'},anchor:{dev:'1',ino:'4',...pin('synthetic-anchor',100)}},
    component_root:root,output,recipe,capsule,node_inputs:nodeInputs,node_profile:nodeProfile,selection,copies:clone(copies),
    domain_closure:'unestablished',qualified_interpreter:'HELD',claims_released:false,native_qualified:false,
  };
  return {data,nativePins};
}


function packagedData(){
 const {data}=projectionFixture(),p=path.join(fs.realpathSync(os.tmpdir()),'fictional-P'),d=path.join(fs.realpathSync(os.tmpdir()),'fictional-D'),b=path.join(d,'peer-context-component/v1'),root=path.join(b,'sealed',data.intent_key),id=name=>({path:name,dev:'1',ino:name===p?'2':name===b?'3':'4',uid:'501',gid:'20',mode:'16877'});
 const layout={protocol:'soloco-context-component-layout-v1',kind:'packaged-plugin-v1',source_root:p,package_root:p,native_root:path.join(p,'producer-inputs/native/codex'),entry:path.join(p,'producer/build-peer-context.mjs'),durable_root:b,managed_data_root:d,layout_source:path.join(p,'runtime/peers/context-component-layout.mjs'),source_identity:id(p),package_identity:id(p),durable_identity:id(b),managed_identity:id(d)};
 data.component_root=root;for(const document of ['output','recipe','capsule','node_inputs','node_profile','selection'])data[document].path=path.join(root,path.basename(data[document].path));data.layout=layout;data.recipe.record.layout=clone(layout);data.capsule.record.layout=clone(layout);data.node_profile.record.layout=clone(layout);
 for(const list of [data.copies,data.recipe.record.copies])for(const row of list)if(row.sealed_path.startsWith('node-source/plugins/soloco/'))row.original_path=path.join(p,row.sealed_path.slice('node-source/plugins/soloco/'.length));
 return data;
}
test('packaged descriptor DATA preserves matching explicit layout and readonly executable/helper bytes',async t=>{
 const project=await moduleFor(t),data=packagedData(),result=project(data);assert.deepEqual(result.layout,data.layout);assert.ok(Object.isFrozen(result.layout.durable_identity));assert.equal(result.native_qualified,false);assert.equal(result.claims_released,false);
 for(const name of ['executable','sidecar_capture']){assert.equal(result.native[name].usage,'READ_ONLY_COMPONENT_BYTES');assert.equal(result.native[name].executable,false);assert.equal(result.native[name].deployment_required,true);}
 assert.equal(result.component_root,path.join(data.layout.durable_root,'sealed',data.intent_key));
});
test('packaged descriptor rejects layout downgrade, document drift and wrong P mapping',async t=>{
 const project=await moduleFor(t);
 for(const mutate of [v=>delete v.layout,v=>delete v.recipe.record.layout,v=>v.capsule.record.layout.durable_identity.ino='99',v=>v.node_profile.record.layout.package_root+='.foreign',v=>v.layout.source_identity.ino='99',v=>v.layout.extra='caller',v=>{for(const list of [v.copies,v.recipe.record.copies])list.find(row=>row.sealed_path.startsWith('node-source/')).original_path=path.join(v.component_root,'capsule-code.mjs');}]){const data=packagedData();mutate(data);assert.throws(()=>project(data),e=>e.code==='COMPONENT_DESCRIPTOR_DATA_INVALID');}
});
