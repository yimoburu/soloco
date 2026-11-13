import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {packagedSourceFixture,coldSource,hash} from './packaged-component-source-fixture.mjs';

// Fictional filesystem/source namespaces only; no build, original Native binary,
// model, provider, actual company, installation or environment override.
test('packaged lookup does not create B; explicit workspace publication preserves existing D0755',async t=>{
 const f=await packagedSourceFixture(t),h=f.layout.originalPackagedComponentLayout();
 assert.throws(()=>f.layout.inspectOriginalComponentLayout(h),e=>e.code==='COMPONENT_NOT_PREPARED');assert.equal(fs.existsSync(f.workspace),false);
 f.layout.prepareOriginalPackagedComponentWorkspace();assert.equal(fs.statSync(f.managed).mode&0o777,0o755);assert.equal(fs.statSync(f.workspace).mode&0o777,0o700);
 assert.deepEqual(fs.readdirSync(f.workspace),['workspace-origin.json']);assert.equal(fs.statSync(path.join(f.workspace,'workspace-origin.json')).mode&0o777,0o444);
 assert.throws(()=>f.builder.lookupOriginalSelectedPackagedContextComponentData());assert.deepEqual(fs.readdirSync(f.workspace),['workspace-origin.json'],'lookup must not initialize/provision');
});
test('fixed paths map only to this P and cross-realm copied handles stay nonauthority',async t=>{
 const f=await packagedSourceFixture(t);f.layout.prepareOriginalPackagedComponentWorkspace();const h=f.layout.originalPackagedComponentLayout(),p=f.layout.originalComponentLayoutPaths(h);
 assert.equal(p.source_root,f.packageRoot);assert.equal(p.durable_root,f.workspace);assert.equal(f.layout.originalComponentNodePath(h,'plugins/soloco/runtime/peers/model.mjs'),path.join(f.packageRoot,'runtime/peers/model.mjs'));
 for(const value of ['tools/build-peer-context.mjs','../caller','/caller','plugins/soloco/../caller'])assert.throws(()=>f.layout.originalComponentNodePath(h,value));
 assert.throws(()=>f.layout.inspectOriginalComponentLayout({...h}),e=>e.code==='COMPONENT_LAYOUT_ORIGINAL_REQUIRED');
 const foreign=await import(pathToFileURL(f.layoutFile).href+'?SOURCE-FOREIGN-NEGATIVE');assert.throws(()=>foreign.inspectOriginalComponentLayout(h),e=>e.code==='COMPONENT_LAYOUT_ORIGINAL_REQUIRED');
});
test('same-inode D mode change holds original physical binding',async t=>{
 const f=await packagedSourceFixture(t);f.layout.prepareOriginalPackagedComponentWorkspace();const h=f.layout.originalPackagedComponentLayout();f.layout.inspectOriginalComponentLayout(h);fs.chmodSync(f.managed,0o750);
 assert.throws(()=>f.layout.inspectOriginalComponentLayout(h),e=>e.code==='COMPONENT_LAYOUT_CHANGED');
});
test('workspace-only origin survives cold restart but empty preexisting B has no first-use permission',async t=>{
 const f=await packagedSourceFixture(t);f.layout.prepareOriginalPackagedComponentWorkspace();
 const before=fs.readFileSync(path.join(f.workspace,'workspace-origin.json'));
 const observed=coldSource(f,"layout.prepareOriginalPackagedComponentWorkspace();console.log(JSON.stringify(layout.inspectOriginalComponentLayout(layout.originalPackagedComponentLayout())));");assert.equal(observed.durable_root,f.workspace);assert.deepEqual(fs.readFileSync(path.join(f.workspace,'workspace-origin.json')),before);
 const other=await packagedSourceFixture(t);fs.mkdirSync(other.workspace,{recursive:true,mode:0o700});assert.throws(()=>other.layout.prepareOriginalPackagedComponentWorkspace(),e=>e.code==='ENOENT');assert.equal(fs.existsSync(path.join(other.workspace,'workspace-origin.json')),false);
});
test('one immutable initialization claim fences publication crash and lost-both on cold restart',async t=>{
 const f=await packagedSourceFixture(t);f.layout.prepareOriginalPackagedComponentWorkspace();const h=f.layout.originalPackagedComponentLayout();f.layout.assertOriginalComponentJournalInitialization(h);
 assert.deepEqual(fs.readdirSync(f.workspace).sort(),['journal-init.claim','workspace-origin.json']);assert.throws(()=>f.layout.assertOriginalComponentJournalInitialization(h),e=>e.code==='COMPONENT_JOURNAL_CHANGED');
 const result=coldSource(f,"let code;try{layout.prepareOriginalPackagedComponentWorkspace();layout.assertOriginalComponentJournalInitialization(layout.originalPackagedComponentLayout());}catch(e){code=e.code;}console.log(JSON.stringify({code}));");assert.equal(result.code,'COMPONENT_JOURNAL_CHANGED');
});

test('B directory replacement cannot substitute a new physical root',async t=>{
 const f=await packagedSourceFixture(t);f.layout.prepareOriginalPackagedComponentWorkspace();const h=f.layout.originalPackagedComponentLayout();f.layout.inspectOriginalComponentLayout(h);fs.renameSync(f.workspace,f.workspace+'.original');fs.mkdirSync(f.workspace,{mode:0o700});assert.throws(()=>f.layout.inspectOriginalComponentLayout(h),e=>e.code==='COMPONENT_LAYOUT_CHANGED');
});

function nativeRecipeFixture(f){
 const source=fileURLToPath(new URL('../native/codex/',import.meta.url)),packageBytes=fs.readFileSync(path.join(source,'source-package.json')),driverBytes=fs.readFileSync(path.join(source,'tools/protected_native.py')),pkg=JSON.parse(packageBytes),specs=[];
 const add=(pin,mode='100644')=>specs.push({path:pin.path,body:fs.readFileSync(path.join(source,pin.path)),mode});
 specs.push({path:'source-package.json',body:packageBytes,mode:'100644'},{path:'tools/protected_native.py',body:driverBytes,mode:'100644'});
 for(const p of [pkg.source_cut.handoff,pkg.source_cut.bindings,pkg.source_cut.patch,pkg.upstream.inventory,...pkg.upstream.attribution,pkg.cargo_lock,pkg.toolchain.inventory,pkg.toolchain.official_manifest])add(p);
 for(const overlay of pkg.overlay)add(overlay.payload,overlay.mode);
 specs.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);assert.equal(specs.length,170);
 const root=path.join(f.packageRoot,'producer-inputs/native/codex');for(const row of specs){const file=path.join(root,row.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,row.body);fs.chmodSync(file,row.mode==='100755'?0o755:0o644);}
 const ref=body=>({bytes:body.length,sha256:hash(body)}),files=specs.map(row=>({path:row.path,...ref(row.body),mode:row.mode}));fs.writeFileSync(path.join(f.packageRoot,'producer-inputs/native-recipe-inventory.json'),JSON.stringify({protocol:'soloco-packaged-native-recipe-v1',source_package:ref(packageBytes),build_driver:ref(driverBytes),files},null,2)+'\n');
 return {packageBytes,driverBytes,root,files};
}
test('closed 170-file Native recipe partition preserves executable overlay mode and complete ordinary Node rows',async t=>{
 const f=await packagedSourceFixture(t),input=nativeRecipeFixture(f),h=f.layout.originalPackagedComponentLayout(),recipe=f.layout.inspectOriginalPackagedRecipeInventory(h,input.packageBytes,input.driverBytes),rows=f.layout.inspectOriginalComponentNodeInventory(h,recipe);
 assert.equal(recipe.files.length,170);assert.ok(recipe.files.some(row=>row.mode==='100755'));assert.equal(rows.some(row=>row.path.includes('/producer-inputs/')),false);assert.ok(rows.some(row=>row.path==='plugins/soloco/runtime/peers/context-component-layout.mjs'));assert.ok(rows.some(row=>row.path==='plugins/soloco/producer/build-peer-context.mjs'));
 const executable=input.files.find(row=>row.mode==='100755'),file=path.join(input.root,executable.path);fs.chmodSync(file,0o754);assert.throws(()=>f.layout.inspectOriginalPackagedRecipeInventory(h,input.packageBytes,input.driverBytes),e=>e.code==='COMPONENT_SOURCE_CHANGED');
});
test('unassigned Native-namespace siblings cannot become ordinary JSON or JS Node input',async t=>{
 const f=await packagedSourceFixture(t),input=nativeRecipeFixture(f),h=f.layout.originalPackagedComponentLayout(),recipe=f.layout.inspectOriginalPackagedRecipeInventory(h,input.packageBytes,input.driverBytes),namespace=path.join(f.packageRoot,'producer-inputs');
 for(const name of ['sibling.json','sibling.mjs']){const file=path.join(namespace,name);fs.writeFileSync(file,'{}');assert.throws(()=>f.layout.inspectOriginalComponentNodeInventory(h,recipe),e=>e.code==='COMPONENT_SOURCE_CHANGED');fs.unlinkSync(file);}
 const empty=path.join(namespace,'unassigned');fs.mkdirSync(empty);assert.throws(()=>f.layout.inspectOriginalComponentNodeInventory(h,recipe),e=>e.code==='COMPONENT_SOURCE_CHANGED');
});
