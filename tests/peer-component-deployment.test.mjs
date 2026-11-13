import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {prepareOriginalSelectedContextDeployment,inspectOriginalSelectedContextDeployment,loadOriginalSelectedPeerBridge,inspectOriginalLoadedPeerBridge,createOriginalLoadedTaskRuntime} from '../plugins/soloco/runtime/peers/context-component-deployment.mjs';

// Synthetic filesystem byte tests ONLY. The private test-copy exports below
// provide no selected component, original handle, module enrollment, build
// receipt, executable admission, native observation or qualification claim.
const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SOURCE=path.join(REPO,'plugins/soloco/runtime/peers/context-component-deployment.mjs');
const COMPONENT=pathToFileURL(path.join(REPO,'plugins/soloco/runtime/peers/context-build-component.mjs')).href;
const LAYOUT=pathToFileURL(path.join(REPO,'plugins/soloco/runtime/peers/context-component-layout.mjs')).href;
const code=expected=>error=>error?.code===expected;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const reference=bytes=>({bytes:bytes.length,sha256:sha(bytes)});
const mode=file=>fs.lstatSync(file).mode&0o777;
const ACCESS='\nexport const __syntheticFsDeploymentTestAccess=Object.freeze({read,pin,immutable,mkdir,noLinks,canonical});\n';
async function fixture(t){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-deployment-byte-test-')));
  const original=fs.readFileSync(SOURCE),modulePath=path.join(root,'deployment-under-test.mjs');
  // Preserve production exactly except for resolving its two fixed relative
  // imports from this moved TEST COPY and appending private byte-helper access.
  const text=original.toString('utf8').replace("'./context-build-component.mjs'",JSON.stringify(COMPONENT)).replace("'./context-component-layout.mjs'",JSON.stringify(LAYOUT));
  fs.writeFileSync(modulePath,text+ACCESS,{mode:0o444});
  const api=(await import(pathToFileURL(modulePath).href)).__syntheticFsDeploymentTestAccess;
  t.after(()=>{
    // Synthetic tests may seal directories: restore only their temporary tree
    // for cleanup. Original source and any real selected build are untouched.
    const writable=directory=>{fs.chmodSync(directory,0o700);for(const name of fs.readdirSync(directory)){const p=path.join(directory,name),s=fs.lstatSync(p);if(s.isDirectory()&&!s.isSymbolicLink())writable(p);}};
    try{assert.ok(fs.readFileSync(SOURCE).equals(original));}finally{writable(root);fs.rmSync(root,{recursive:true,force:true});}
  });
  return {root,api};
}

test('public no-argument entry points reject injected paths, namespaces and readiness labels before lookup',async()=>{
  const forged={root:'/synthetic',ready:true,host:{createCodexTaskRuntime(){assert.fail('Injected factory called');}}};
  for(const value of [forged,()=>forged,'/synthetic/binary',undefined]){
    assert.throws(()=>prepareOriginalSelectedContextDeployment(value),code('COMPONENT_DEPLOYMENT_NO_ARGUMENTS'));
    await assert.rejects(loadOriginalSelectedPeerBridge(value),code('COMPONENT_DEPLOYMENT_NO_ARGUMENTS'));
    assert.throws(()=>inspectOriginalLoadedPeerBridge(value),code('COMPONENT_DEPLOYMENT_NOT_LOADED'));
  }
});

test('forged deployment handles and runtime constructors cannot create an original loaded bridge',()=>{
  for(const value of [null,{},Object.freeze({protocol:'soloco-original-component-deployment-v1',native_qualified:false}),()=>{}])
    assert.throws(()=>inspectOriginalSelectedContextDeployment(value),code('COMPONENT_DEPLOYMENT_HANDLE_REQUIRED'));
  let calls=0;
  const injected={protected_launch:{},host:{createCodexTaskRuntime(){calls++;}},qualification:()=>{calls++;},spawn_child:()=>{calls++;}};
  assert.throws(()=>createOriginalLoadedTaskRuntime(injected),code('COMPONENT_DEPLOYMENT_NOT_LOADED'));
  assert.equal(calls,0);
  assert.throws(()=>inspectOriginalLoadedPeerBridge(),code('COMPONENT_DEPLOYMENT_NOT_LOADED'));
});

test('synthetic sealed bytes copy to a distinct executable-mode file without changing source bytes or mode',async t=>{
  const {root,api}=await fixture(t),source=path.join(root,'sealed-data'),target=path.join(root,'deployed-data');
  const bytes=Buffer.from('SYNTHETIC DATA ONLY; never execute. 雪😀\n');
  api.immutable(source,bytes,0o444);const original=fs.statSync(source);
  api.immutable(target,api.read(source),0o555);
  assert.notEqual(source,target);assert.notEqual(fs.statSync(target).ino,original.ino);
  assert.equal(mode(source),0o444);assert.equal(mode(target),0o555);
  assert.ok(api.pin(source,reference(bytes),0o444).equals(bytes));
  assert.ok(api.pin(target,reference(bytes),0o555).equals(bytes));
  assert.ok(fs.readFileSync(source).equals(bytes));assert.equal(fs.statSync(source).ino,original.ino);
});

test('immutable creation never overwrites an existing file, even with identical bytes',async t=>{
  const {root,api}=await fixture(t),target=path.join(root,'one-use-data'),bytes=Buffer.from('synthetic original');
  api.immutable(target,bytes,0o444);const before=fs.statSync(target);
  for(const next of [bytes,Buffer.from('replacement')])assert.throws(()=>api.immutable(target,next,0o555),code('EEXIST'));
  assert.ok(fs.readFileSync(target).equals(bytes));assert.equal(mode(target),0o444);assert.equal(fs.statSync(target).ino,before.ino);
});

test('pin rejects changed content, mode, size, and hash instead of promoting bytes',async t=>{
  const {root,api}=await fixture(t),target=path.join(root,'pin-data'),bytes=Buffer.from('synthetic pinned data');
  api.immutable(target,bytes,0o555);
  assert.throws(()=>api.pin(target,{...reference(bytes),bytes:bytes.length+1},0o555),code('COMPONENT_DEPLOYMENT_CHANGED'));
  assert.throws(()=>api.pin(target,{...reference(bytes),sha256:'0'.repeat(64)},0o555),code('COMPONENT_DEPLOYMENT_CHANGED'));
  fs.chmodSync(target,0o444);
  assert.throws(()=>api.pin(target,reference(bytes),0o555),code('COMPONENT_DEPLOYMENT_CHANGED'));
  fs.chmodSync(target,0o644);fs.writeFileSync(target,Buffer.from('different bytes'));fs.chmodSync(target,0o555);
  assert.throws(()=>api.pin(target,reference(bytes),0o555),code('COMPONENT_DEPLOYMENT_CHANGED'));
});

test('read rejects hard links, symlinks and files above its explicit bound',async t=>{
  const {root,api}=await fixture(t),target=path.join(root,'bounded-data'),bytes=Buffer.from('synthetic bounded data');
  api.immutable(target,bytes,0o444);
  assert.throws(()=>api.read(target,bytes.length-1),code('COMPONENT_DEPLOYMENT_CHANGED'));
  assert.ok(api.read(target,bytes.length).equals(bytes));
  const symlink=path.join(root,'symlink-data');fs.symlinkSync(target,symlink);
  assert.throws(()=>api.read(symlink),code('COMPONENT_DEPLOYMENT_PATH'));
  const hardlink=path.join(root,'hardlink-data');fs.linkSync(target,hardlink);
  assert.throws(()=>api.read(target),code('COMPONENT_DEPLOYMENT_CHANGED'));
  assert.throws(()=>api.read(hardlink),code('COMPONENT_DEPLOYMENT_CHANGED'));
});

test('private deployment directories reject linked ancestry and permissive existing directories',async t=>{
  const {root,api}=await fixture(t),privateRoot=path.join(root,'private');api.mkdir(privateRoot);
  assert.equal(mode(privateRoot),0o700);api.mkdir(privateRoot);
  const publicRoot=path.join(root,'public');fs.mkdirSync(publicRoot,{mode:0o755});
  assert.throws(()=>api.mkdir(publicRoot),code('COMPONENT_DEPLOYMENT_PATH'));
  const link=path.join(root,'linked');fs.symlinkSync(privateRoot,link);
  assert.throws(()=>api.noLinks(path.join(link,'nonexistent-child')),code('COMPONENT_DEPLOYMENT_PATH'));
});

test('synthetic deployment records preserve complete canonical bytes and reject receipt mutation',async t=>{
  const {root,api}=await fixture(t),file=path.join(root,'synthetic-record.json');
  const data={protocol:'SYNTHETIC_BYTE_TEST_ONLY',native_qualified:false,claims_released:false,executable:{bytes:17,mode:'100555',sha256:'a'.repeat(64)},unicode:'雪😀'};
  const bytes=Buffer.from(api.canonical(data)),commitment=reference(bytes);api.immutable(file,bytes,0o444);
  data.executable.bytes=999;data.unicode='changed';
  const stored=JSON.parse(api.pin(file,commitment,0o444).toString('utf8'));
  assert.equal(stored.executable.bytes,17);assert.equal(stored.unicode,'雪😀');
  assert.equal(stored.native_qualified,false);assert.equal(stored.claims_released,false);
  assert.ok(bytes.equals(Buffer.from(api.canonical(stored))));assert.ok(bytes.toString('utf8').endsWith('\n'));
  const alternate=Buffer.from(JSON.stringify(stored,null,2)+'\n');fs.chmodSync(file,0o644);fs.writeFileSync(file,alternate);fs.chmodSync(file,0o444);
  assert.throws(()=>api.pin(file,commitment,0o444),code('COMPONENT_DEPLOYMENT_CHANGED'));
});
