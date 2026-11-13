import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const REPO=fileURLToPath(new URL('../',import.meta.url));
const MODULE=fileURLToPath(new URL('../plugins/soloco/runtime/peers/context-component-descriptor-data.mjs',import.meta.url));
const PRODUCER=fileURLToPath(new URL('../plugins/soloco/runtime/peers/context-build-component.mjs',import.meta.url));
const clone=value=>JSON.parse(JSON.stringify(value));
const digest=value=>createHash('sha256').update(value).digest('hex');
const pin=(label,bytes=128)=>({bytes,sha256:digest(label)});

async function fixtureModule(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-component-descriptor-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=fs.readFileSync(MODULE,'utf8');
  const dependency="'./context-build-component.mjs'";
  assert.ok(source.includes(dependency),'test copy must retain the production component dependency');
  // The complete production body is copied unchanged except for its relative
  // import location. Only this test-owned copy exposes the private pure helper.
  const testCopy=source.replace(dependency,JSON.stringify(pathToFileURL(PRODUCER).href))+
    '\nexport {projectSelectedContextComponentDescriptorData as projectForTest};\n';
  const copy=path.join(root,'descriptor-projection.mjs');
  fs.writeFileSync(copy,testCopy);
  const projection=await import(pathToFileURL(copy).href);
  const actual=await import(pathToFileURL(MODULE).href);
  const producer=await import(pathToFileURL(PRODUCER).href);
  return {project:projection.projectForTest,actual,producer};
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

function matchingCopies(data,mutate){
  mutate(data.copies);
  mutate(data.recipe.record.copies);
}

function rejectsProjection(project,data,label){
  assert.throws(()=>project(data),error=>error?.code==='COMPONENT_DESCRIPTOR_DATA_INVALID',label);
}

test('component descriptor DATA preserves recorded paths and reads different sealed copies',async t=>{
  const {project}=await fixtureModule(t),{data,nativePins}=projectionFixture();
  const before=clone(data),result=project(data);
  assert.equal(result.protocol,'soloco-context-component-descriptor-data-v1');
  assert.deepEqual(Object.keys(result.native).sort(),['build_receipt','cargo_lock','compiled_manifest','executable','sidecar_capture','source_package','toolchain_manifest']);
  for(const [name,expected] of Object.entries(nativePins)){
    assert.equal(result.native[name].original_path,expected.recorded);
    assert.equal(result.native[name].sealed_path,expected.sealed);
    assert.equal(result.native[name].read_path,path.join(data.component_root,expected.sealed));
    assert.notEqual(result.native[name].read_path,result.native[name].original_path);
    assert.equal(result.native[name].bytes,expected.bytes);
    assert.equal(result.native[name].sha256,expected.sha256);
  }
  assert.deepEqual(result.original_output.record,data.output.record);
  assert.deepEqual(data,before,'projection must not rewrite any supplied original record or pin');
});

test('component descriptor DATA never promotes readonly bytes or Held claims to execution',async t=>{
  const {project}=await fixtureModule(t),{data}=projectionFixture(),result=project(data);
  for(const name of ['executable','sidecar_capture']){
    assert.equal(result.native[name].usage,'READ_ONLY_COMPONENT_BYTES');
    assert.equal(result.native[name].executable,false);
    assert.equal(result.native[name].deployment_required,true);
  }
  assert.equal(result.deployment_required,true);
  assert.equal(result.result_kind,'COMPILED_COMPONENT');
  assert.equal(result.domain_closure,'unestablished');
  assert.equal(result.qualified_interpreter,'HELD');
  assert.equal(result.native_qualified,false);
  assert.equal(result.claims_released,false);
  const invalid=[
    ['established closure',x=>{x.domain_closure='established';}],
    ['ready interpreter',x=>{x.qualified_interpreter='READY';}],
    ['native qualified',x=>{x.native_qualified=true;}],
    ['released claims',x=>{x.claims_released=true;}],
    ['command closure promotion',x=>{x.command.domain_closure='established';}],
    ['command interpreter promotion',x=>{x.command.qualified_interpreter='READY';}],
    ['command claim release',x=>{x.command.claims_released=true;}],
    ['command status promotion',x=>{x.command.status='QUALIFIED';}],
    ['unselected journal',x=>{x.journal_selection.phase='UNKNOWN';}],
  ];
  for(const [label,mutate] of invalid){const changed=clone(data);mutate(changed);rejectsProjection(project,changed,label);}
});

test('component descriptor DATA is detached and deeply frozen',async t=>{
  const {project}=await fixtureModule(t),{data}=projectionFixture(),result=project(data);
  const check=value=>{if(value!==null&&typeof value==='object'){assert.equal(Object.isFrozen(value),true);for(const child of Object.values(value))check(child);}};
  check(result);
  assert.notEqual(result.owner_epoch,data.owner_epoch);
  assert.notEqual(result.journal.identity,data.journal_identity);
  assert.notEqual(result.original_output.record,data.output.record);
  const retained=clone(result);
  data.owner_epoch.generation++;
  data.journal_identity.root.ino='changed';
  data.output.record.executable.bytes++;
  assert.deepEqual(result,retained);
  assert.throws(()=>{result.native.executable.executable=true;},TypeError);
  assert.throws(()=>{result.owner_epoch.generation++;},TypeError);
});

test('component descriptor DATA rejects missing and duplicate native copy identities',async t=>{
  const {project}=await fixtureModule(t);
  for(const [label,mutate] of [
    ['missing executable',data=>matchingCopies(data,rows=>rows.splice(rows.findIndex(row=>row.sealed_path==='native/executable'),1))],
    ['duplicate executable',data=>matchingCopies(data,rows=>rows.push(clone(rows.find(row=>row.sealed_path==='native/executable'))))],
    ['duplicate original path',data=>matchingCopies(data,rows=>{rows.find(row=>row.sealed_path==='native/build-receipt.json').original_path=rows.find(row=>row.sealed_path==='native/compiled-source-manifest.json').original_path;})],
    ['duplicate capsule native file',data=>data.capsule.record.files.push(clone(data.capsule.record.files.find(row=>row.path==='native/executable')))],
  ]){const {data}=projectionFixture();mutate(data);rejectsProjection(project,data,label);}
});

test('component descriptor DATA rejects escaping or nonrelocated copy paths',async t=>{
  const {project}=await fixtureModule(t);
  for(const [label,mutate] of [
    ['parent escape',data=>matchingCopies(data,rows=>{rows.find(row=>row.sealed_path==='native/executable').sealed_path='../native/executable';})],
    ['absolute sealed path',data=>matchingCopies(data,rows=>{rows.find(row=>row.sealed_path==='native/executable').sealed_path=path.join(os.tmpdir(),'outside-executable');})],
    ['relative original path',data=>matchingCopies(data,rows=>{rows.find(row=>row.sealed_path==='native/executable').original_path='relative/executable';})],
    ['original equals selected read path',data=>matchingCopies(data,rows=>{rows.find(row=>row.sealed_path==='native/executable').original_path=path.join(data.component_root,'native/executable');})],
  ]){const {data}=projectionFixture();mutate(data);rejectsProjection(project,data,label);}
});

test('component descriptor DATA rejects pin, recipe and native-mode mismatches',async t=>{
  const {project}=await fixtureModule(t);
  for(const [label,mutate] of [
    ['copy differs from capsule',data=>matchingCopies(data,rows=>{rows.find(row=>row.sealed_path==='native/executable').sha256=digest('wrong-executable');})],
    ['copy differs from original recipe',data=>{data.copies.find(row=>row.sealed_path==='native/executable').bytes++;}],
    ['output executable pin differs',data=>{data.output.record.executable.sha256=digest('wrong-output-pin');}],
    ['original receipt pin differs',data=>{data.recipe.record.original_build_receipt.sha256=digest('wrong-receipt-pin');}],
    ['native executable mode promoted',data=>{data.capsule.record.files.find(row=>row.path==='native/executable').mode='100755';}],
    ['node manifest pin differs',data=>{data.output.record.node_manifest.sha256=digest('wrong-node-manifest');}],
  ]){const {data}=projectionFixture();mutate(data);rejectsProjection(project,data,label);}
});

test('component descriptor DATA rejects missing, duplicate, extra and changed sidecar copies',async t=>{
  const {project}=await fixtureModule(t),helper='native/origin-sidecar-capture';
  for(const [label,mutate] of [
    ['missing helper copy',data=>matchingCopies(data,rows=>rows.splice(rows.findIndex(row=>row.sealed_path===helper),1))],
    ['missing helper capsule entry',data=>{data.capsule.record.files=data.capsule.record.files.filter(row=>row.path!==helper);}],
    ['missing helper throughout',data=>{matchingCopies(data,rows=>rows.splice(rows.findIndex(row=>row.sealed_path===helper),1));data.capsule.record.files=data.capsule.record.files.filter(row=>row.path!==helper);}],
    ['duplicate helper copy',data=>matchingCopies(data,rows=>rows.push(clone(rows.find(row=>row.sealed_path===helper))))],
    ['duplicate helper capsule entry',data=>data.capsule.record.files.push(clone(data.capsule.record.files.find(row=>row.path===helper)))],
    ['extra native helper name',data=>{matchingCopies(data,rows=>rows.push({original_path:path.join(os.tmpdir(),'extra-sidecar'),sealed_path:helper+'-extra',...pin('extra-sidecar',64)}));data.capsule.record.files.push({path:helper+'-extra',...pin('extra-sidecar',64),mode:'100644'});}],
    ['helper differs from original recipe',data=>{data.copies.find(row=>row.sealed_path===helper).bytes++;}],
    ['helper copies differ from capsule',data=>matchingCopies(data,rows=>{rows.find(row=>row.sealed_path===helper).sha256=digest('wrong-sidecar');})],
    ['helper capsule pin differs',data=>{data.capsule.record.files.find(row=>row.path===helper).sha256=digest('wrong-sidecar-capsule');}],
    ['helper mode promoted',data=>{data.capsule.record.files.find(row=>row.path===helper).mode='100755';}],
  ]){const {data}=projectionFixture();mutate(data);rejectsProjection(project,data,label);}
});

test('component descriptor DATA requires positive sidecar bytes within the 16 MiB bound',async t=>{
  const {project}=await fixtureModule(t);
  for(const sidecarBytes of [1,16*1024*1024]){
    const {data}=projectionFixture({sidecarBytes}),result=project(data);
    assert.equal(result.native.sidecar_capture.bytes,sidecarBytes);
    assert.equal(result.native.sidecar_capture.executable,false);
  }
  for(const sidecarBytes of [0,16*1024*1024+1]){
    const {data}=projectionFixture({sidecarBytes});
    rejectsProjection(project,data,'sidecar bytes '+sidecarBytes);
  }
});

test('component descriptor projection permits no Node copies without claiming loaded closure',async t=>{
  const {project}=await fixtureModule(t),{data}=projectionFixture({nodeCopy:false});
  assert.equal(data.copies.some(row=>row.sealed_path.startsWith('node-source/')),false);
  const result=project(data);
  assert.equal(Object.keys(result.native).length,7);
  assert.deepEqual(result.node.input_manifest,{path:data.node_inputs.path,bytes:data.node_inputs.bytes,sha256:data.node_inputs.sha256});
  assert.equal(result.qualified_interpreter,'HELD');
  assert.equal(result.native_qualified,false);
  assert.equal(result.deployment_required,true);
});

test('actual public descriptor API accepts no supplied DATA and stays finite when unprepared',async t=>{
  const {actual,producer}=await fixtureModule(t),{data}=projectionFixture();
  const inspect=actual.inspectOriginalSelectedContextComponentDescriptorData;
  for(const supplied of [undefined,{},data,clone(data),'/caller/chosen/root']){
    assert.throws(()=>inspect(supplied),error=>error?.code==='COMPONENT_DESCRIPTOR_DATA_NO_ARGUMENTS');
  }
  const root=path.join(REPO,'work/peer-context-component'),journal=path.join(root,'journal.sqlite'),anchor=path.join(root,'journal-anchor.json');
  if(fs.existsSync(journal)){
    t.diagnostic('Existing component journal left unread: no genuine selected-positive claim belongs to this projection suite.');
    return;
  }
  const before={root:fs.existsSync(root),journal:false,anchor:fs.existsSync(anchor)};
  const holdCodes=new Set(['COMPONENT_NOT_PREPARED','COMPONENT_INPUT_COMPOSITION_UNAVAILABLE','COMPONENT_SOURCE_CHANGED','COMPONENT_PATH_CHANGED','COMPONENT_PRIVATE_ROOT_CHANGED','COMPONENT_PUBLIC_RUNTIME_CHANGED','COMPONENT_JOURNAL_CHANGED']);
  assert.throws(()=>inspect(),error=>holdCodes.has(producer.contextComponentErrorCode(error))||['ENOENT','ENOTDIR'].includes(error?.code));
  assert.deepEqual({root:fs.existsSync(root),journal:fs.existsSync(journal),anchor:fs.existsSync(anchor)},before,'unprepared inspection must not create a journal or anchor');
});
