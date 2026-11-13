// SOURCE-only draft pending explicit review/selection before its first run.
// No compiler, helper executable, native bridge, model or company is launched.
// Synthetic source namespaces exercise real fixed validators/opaque deployment
// handles; non-executed binary bytes are never native qualification evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const BUILDER='plugins/soloco/runtime/peers/context-build-component.mjs';
const DEPLOYMENT='plugins/soloco/runtime/peers/context-component-deployment.mjs';
const SOURCE='plugins/soloco/helpers/origin-sidecar-capture.c';
const HOST='plugins/soloco/runtime/peers/codex-task-host.mjs';
const INTERPRETER='plugins/soloco/runtime/peers/peer-context-interpreter.mjs';
const CLANG='/Applications/Xcode-26.3.0.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang';
const SDK='/Applications/Xcode-26.3.0.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk';
const FLAGS=['-std=c11','-O2','-Wall','-Wextra','-Werror','-target','arm64-apple-macos11.0'];
const bytes=name=>fs.readFileSync(path.join(ROOT,name));
const hash=value=>createHash('sha256').update(value).digest('hex');
const ref=value=>({bytes:value.length,sha256:hash(value)});
const clone=value=>JSON.parse(JSON.stringify(value));
function canonical(value){const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;return JSON.stringify(sort(value)).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'\n';}
const constant=(body,name)=>{const found=body.match(new RegExp('(?:const |^)'+name+"='([a-f0-9]{64})'",'m'));assert.ok(found,name);return found[1];};
const code=expected=>error=>error.code===expected;
function temporary(t){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'soloco-origin-capture-join-'));
 t.after(()=>{function writable(p){const s=fs.lstatSync(p);if(s.isDirectory()&&!s.isSymbolicLink()){fs.chmodSync(p,0o700);for(const n of fs.readdirSync(p))writable(path.join(p,n));}}writable(root);fs.rmSync(root,{recursive:true,force:true});});return root;
}
function put(root,name,value,mode=0o444){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value,{mode});fs.chmodSync(file,mode);return file;}
function manifest(){const pkg=JSON.parse(bytes('native/codex/source-package.json')),bindings=JSON.parse(bytes('native/codex/'+pkg.source_cut.bindings.path));return Buffer.from(canonical({schema:'soloco-compiled-native-inputs-v1',upstream:{commit:pkg.upstream.commit,tree:pkg.upstream.tree},source_package_sha256:hash(bytes('native/codex/source-package.json')),files_count:bindings.length,files:bindings}));}

test('new fixed package/driver/builder/deployment tuple binds the unchanged complete native source cut',()=>{
 const p=bytes('native/codex/source-package.json'),pkg=JSON.parse(p),driver=bytes('native/codex/tools/protected_native.py').toString(),builder=bytes(BUILDER).toString(),deployment=bytes(DEPLOYMENT).toString();
 assert.equal(pkg.overlay.length,158);assert.equal(pkg.qualified_binary,null);
 assert.deepEqual(pkg.sidecar_capture,{protocol:'soloco-origin-sidecar-source-build-v1',source:{path:SOURCE,...ref(bytes(SOURCE))},binary:'origin-sidecar-capture',arguments:['origin-sidecar-capture-v1'],target:'arm64-apple-macos11.0',flags:FLAGS});
 assert.equal(driver.match(/MANIFEST_SHA256 = "([a-f0-9]{64})"/)[1],hash(p));
 assert.equal(constant(builder,'PACKAGE_SHA'),hash(p));assert.equal(constant(builder,'DRIVER_SHA'),hash(bytes('native/codex/tools/protected_native.py')));
 assert.equal(constant(deployment,'EXPECTED_PACKAGE'),hash(p));assert.equal(constant(deployment,'EXPECTED_MANIFEST'),hash(manifest()));
});

test('actual Python fixed helper plan validates canonical C and never invokes a compiler',t=>{
 const root=temporary(t),fixture=path.join(root,'fixture');put(fixture,SOURCE,bytes(SOURCE));fs.mkdirSync(path.join(fixture,'native/codex'),{recursive:true});
 const script=String.raw`import json,pathlib,runpy,subprocess,sys
calls=[]
def forbidden(*a,**k):
 calls.append(1)
 raise AssertionError('no subprocess allowed by this SOURCE plan fixture')
subprocess.Popen=forbidden
module=runpy.run_path(sys.argv[1],run_name='source_plan_fixture_only')
root=pathlib.Path(sys.argv[2]);recipe=json.loads(pathlib.Path(sys.argv[3]).read_text())
output=root/'output';output.mkdir()
argv,record=module['sidecar_build_plan'](root/'native/codex',recipe,output,'FICTIONAL-UNEXECUTED-PROFILE')
assert (output/'origin-sidecar-capture.c').read_bytes()==(root/'plugins/soloco/helpers/origin-sidecar-capture.c').read_bytes()
assert (output/'origin-sidecar-capture.c').stat().st_mode&0o777==0o444
assert not (output/'origin-sidecar-capture').exists()
for mutate in ['extra','path','hash','argv']:
 bad=json.loads(json.dumps(recipe))
 if mutate=='extra':bad['sidecar_capture']['compiler']='caller-selected'
 elif mutate=='path':bad['sidecar_capture']['source']['path']='unselected.c'
 elif mutate=='hash':bad['sidecar_capture']['source']['sha256']='0'*64
 else:bad['sidecar_capture']['arguments']=['caller-selected']
 try:module['sidecar_source'](root/'native/codex',bad)
 except ValueError:pass
 else:raise AssertionError('bad recipe accepted: '+mutate)
assert calls==[]
print(json.dumps({'argv':argv,'record':record,'subprocess_calls':len(calls)}))`;
 const result=spawnSync('/usr/bin/python3',['-I','-S','-c',script,path.join(ROOT,'native/codex/tools/protected_native.py'),fixture,path.join(ROOT,'native/codex/source-package.json')],{encoding:'utf8',timeout:10000,maxBuffer:65536});
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.equal(result.signal,null);const data=JSON.parse(result.stdout);
 const output=path.join(fixture,'output');assert.deepEqual(data.argv,['/usr/bin/sandbox-exec','-p','FICTIONAL-UNEXECUTED-PROFILE',CLANG,...FLAGS,'-isysroot',SDK,path.join(output,'origin-sidecar-capture.c'),'-o',path.join(output,'origin-sidecar-capture')]);
 assert.equal(data.record.native_qualified,false);assert.equal(data.record.binary,null);assert.equal(data.subprocess_calls,0);
});

function layoutDependencies(root){
 for(const name of ['plugins/soloco/runtime/peers/context-component-layout.mjs','plugins/soloco/runtime/plugin-data.mjs'])put(root,name,bytes(name));
}
async function receiptFixture(t){
 const root=temporary(t);layoutDependencies(root);put(root,SOURCE,bytes(SOURCE));put(root,'tools/build-peer-context.mjs','// Synthetic SOURCE fixture entry. Never invoked.\n');
 put(root,'plugins/soloco/runtime/peers/context-build-data.mjs',bytes('plugins/soloco/runtime/peers/context-build-data.mjs'));
 // Additive private exports ONLY in this copied SOURCE namespace. Actual bodies,
 // imports and default guards remain unchanged. No journal/issuer is called.
 const file=put(root,BUILDER,Buffer.concat([bytes(BUILDER),Buffer.from('\nexport {verifyReceipt,successfulReceipt,treeRows};\n')]));
 const module=await import(pathToFileURL(file).href),output=path.join(root,'output'),compiled=Buffer.from('SYNTHETIC-UNQUALIFIED-MANIFEST\n'),binary=Buffer.from('NONEXECUTED-HOST-BYTES\n'),helper=Buffer.from('NONEXECUTED-HELPER-BYTES\n');
 put(output,'compiled-source-manifest.json',compiled);put(output,'target/aarch64-apple-darwin/release/codex-soloco-protected-host',binary);put(output,'origin-sidecar-capture',helper,0o555);put(output,'origin-sidecar-capture.c',bytes(SOURCE));
 const receipt={schema:'soloco-native-source-build-receipt-v1',status:'compiled-source-only',exit_code:0,manifest_sha256:hash(bytes('native/codex/source-package.json')),native_qualified:false,source_slot_populated:false,descendant_or_remote_closure:'not established',compiled_source_manifest:{schema:'soloco-compiled-native-inputs-v1',path:path.join(output,'compiled-source-manifest.json'),...ref(compiled)},binary:{path:path.join(output,'target/aarch64-apple-darwin/release/codex-soloco-protected-host'),...ref(binary)},selected_sdk:{compiler:CLANG,sdk_root:SDK},sidecar_capture:{protocol:'soloco-origin-sidecar-source-build-v1',status:'compiled-source-only',exit_code:0,native_qualified:false,source:{path:SOURCE,...ref(bytes(SOURCE))},source_copy:path.join(output,'origin-sidecar-capture.c'),arguments:['origin-sidecar-capture-v1'],compiler_argv:[CLANG,...FLAGS,'-isysroot',SDK,path.join(output,'origin-sidecar-capture.c'),'-o',path.join(output,'origin-sidecar-capture')],binary:{path:path.join(output,'origin-sidecar-capture'),...ref(helper),mode:'100555'}}};
 put(output,'receipt.json',JSON.stringify(receipt));return {root,module,output,compiled,binary,helper,receipt};
}
test('actual builder helper receipt requires source, compiler, fixed argv, status and binary association',async t=>{
 const f=await receiptFixture(t),check=value=>f.module.verifyReceipt(value,f.output,f.compiled,f.binary,f.helper);
 assert.doesNotThrow(()=>check(f.receipt));
 for(const mutate of [v=>delete v.sidecar_capture,v=>v.sidecar_capture.native_qualified=true,v=>v.sidecar_capture.exit_code=1,v=>v.sidecar_capture.source.sha256='0'.repeat(64),v=>v.sidecar_capture.source_copy+='.foreign',v=>v.sidecar_capture.compiler_argv[0]='/caller/compiler',v=>v.sidecar_capture.arguments=['caller'],v=>v.sidecar_capture.binary.sha256='0'.repeat(64),v=>v.selected_sdk.sdk_root='/caller/sdk']){const changed=clone(f.receipt);mutate(changed);assert.throws(()=>check(changed),e=>f.module.contextComponentErrorCode(e)==='COMPONENT_BUILD_RECEIPT_CHANGED');}
 const actual=f.module.successfulReceipt({compiledBytes:f.compiled},f.output);assert.deepEqual(actual.helperBytes,f.helper);
 fs.chmodSync(path.join(f.output,'origin-sidecar-capture'),0o444);assert.throws(()=>f.module.successfulReceipt({compiledBytes:f.compiled},f.output),e=>f.module.contextComponentErrorCode(e)==='COMPONENT_BUILD_RECEIPT_CHANGED');
});
test('actual source inventory admits only the exact canonical helper C path',async t=>{
 const f=await receiptFixture(t),tree=path.join(f.root,'plugins/soloco');assert.ok(f.module.treeRows(tree,'plugins/soloco',undefined,undefined,true).some(v=>v.path===SOURCE));
 put(f.root,'plugins/soloco/helpers/caller.c','UNSELECTED');assert.throws(()=>f.module.treeRows(tree,'plugins/soloco',undefined,undefined,true),e=>f.module.contextComponentErrorCode(e)==='COMPONENT_INPUT_COMPOSITION_UNAVAILABLE');
});

async function deploymentFixture(t,{incomplete=false}={}){
 const root=temporary(t),home=path.join(root,'fictional-home');fs.mkdirSync(path.join(root,'work/peer-context-component'),{recursive:true,mode:0o700});fs.mkdirSync(home);
 const originalDeployment=bytes(DEPLOYMENT).toString(),homeSelector="process.env.CODEX_HOME??path.join(os.homedir(),'.codex')";
 assert.equal(originalDeployment.split(homeSelector).length,2);
 const homeLiteral=JSON.stringify(home),deploymentSource=originalDeployment.replace(homeSelector,homeLiteral);
 assert.equal(deploymentSource.split(homeLiteral).length,2);assert.equal(deploymentSource.replace(homeLiteral,homeSelector),originalDeployment);
 const deploymentFile=put(root,DEPLOYMENT,deploymentSource);layoutDependencies(root);put(root,SOURCE,bytes(SOURCE));
 put(root,HOST,'export function createCodexTaskRuntime(){throw Error("SYNTHETIC HOST MUST NOT EXECUTE");}\n');
 put(root,INTERPRETER,'export function prepareOriginalPeerContextDelivery(){throw Error("SYNTHETIC INTERPRETER MUST NOT EXECUTE");}\n');
 const component=path.join(root,'fictional-sealed-component'),copies=[],files={executable:Buffer.from('NEVER-EXECUTED-HOST\n'),'origin-sidecar-capture':Buffer.from('NEVER-EXECUTED-CENSUS-HELPER\n'),'compiled-source-manifest.json':manifest(),'build-receipt.json':Buffer.from('SYNTHETIC-UNQUALIFIED\n'),'source-package.json':bytes('native/codex/source-package.json'),'Cargo.lock':Buffer.from('SYNTHETIC LOCK\n'),'toolchain-manifest.toml':Buffer.from('SYNTHETIC TOOLCHAIN\n')};
 for(const [name,body] of Object.entries(files)){const file=put(component,'native/'+name,body);copies.push({sealed_path:'native/'+name,original_path:file,...ref(body)});}
 for(const name of [HOST,INTERPRETER])copies.push({sealed_path:'node-source/'+name,original_path:path.join(root,name),...ref(fs.readFileSync(path.join(root,name)))});
 const data={protocol:'soloco-selected-context-component-data-v1',kind:'SELECTED_COMPILED_COMPONENT_DATA',command:{status:'COMPILED_COMPONENT'},native_qualified:false,claims_released:false,copies,component_root:component,node_profile:{record:{version:process.version,platform:process.platform,arch:process.arch,exec_argv:[...process.execArgv],node:ref(fs.readFileSync(fs.realpathSync(process.execPath)))}},input_key:'SYNTHETIC-INPUT',intent_key:'SYNTHETIC-INTENT',output:{sha256:hash('SYNTHETIC-OUTPUT')},owner_epoch:{owner_sha256:hash('SYNTHETIC-OWNER'),generation:0},node_inputs:ref(Buffer.from('SYNTHETIC NODE INVENTORY'))};
 const dataFile=put(root,'fixture-data.json',JSON.stringify(data));
 const producerFile=put(root,BUILDER,`import fs from 'node:fs';let original=Object.freeze({});export function lookupOriginalSelectedContextComponentData(){return original;}export function inspectOriginalSelectedContextComponentData(h){if(h!==original)throw Error('SYNTHETIC_OLD_SELECTION');return JSON.parse(fs.readFileSync(${JSON.stringify(dataFile)},'utf8'));}export function replaceOriginalForSourceTest(){original=Object.freeze({});}\n`);
 if(incomplete){const deployments=path.join(root,'work/peer-context-component/deployments');fs.mkdirSync(deployments,{mode:0o700});const d=path.join(deployments,data.intent_key);fs.mkdirSync(d,{mode:0o700});put(d,'sentinel','INCOMPLETE');}
 return {root,data,files,module:await import(pathToFileURL(deploymentFile).href),producer:await import(pathToFileURL(producerFile).href),deploymentFile,deploymentSource};
}
test('opaque selectors stay held until real deployment functions see the synthetic original loaded bridge',async t=>{
 const f=await deploymentFixture(t),m=f.module;
 assert.throws(()=>m.prepareOriginalOriginSidecarCaptureProgram(),code('ORIGIN_SIDECAR_PROGRAM_UNAVAILABLE'));
 assert.throws(()=>m.prepareOriginalOriginSidecarCaptureProgram({ready:true}),code('ORIGIN_SIDECAR_PROGRAM_UNAVAILABLE'));
 assert.throws(()=>m.inspectOriginalOriginSidecarCaptureProgram({}),code('ORIGIN_SIDECAR_ORIGINAL_PROGRAM_REQUIRED'));
 await m.prepareOriginalSelectedContextDeployment();await m.loadOriginalSelectedPeerBridge();
 const h=m.prepareOriginalOriginSidecarCaptureProgram(),r=m.inspectOriginalOriginSidecarCaptureProgram(h);
 assert.equal(Object.getPrototypeOf(h),null);assert.ok(Object.isFrozen(h));assert.deepEqual(Object.keys(r).sort(),['protocol','executable','source_sha256','source_package_sha256','compiled_manifest_sha256','component_intent_key','argv','native_qualified'].sort());assert.equal(r.native_qualified,false);assert.deepEqual(r.argv,['origin-sidecar-capture-v1']);
 assert.equal(fs.readFileSync(r.executable.path).toString(),f.files['origin-sidecar-capture'].toString());assert.equal(fs.statSync(r.executable.path).mode&0o777,0o555);
 assert.throws(()=>m.inspectOriginalOriginSidecarCaptureProgram({...h}),code('ORIGIN_SIDECAR_ORIGINAL_PROGRAM_REQUIRED'));assert.throws(()=>m.inspectOriginalOriginSidecarCaptureProgram(h,{}),code('ORIGIN_SIDECAR_ORIGINAL_PROGRAM_REQUIRED'));
 const foreignFile=path.join(path.dirname(f.deploymentFile),'foreign-deployment.mjs');fs.writeFileSync(foreignFile,f.deploymentSource);const foreign=await import(pathToFileURL(foreignFile).href);assert.throws(()=>foreign.inspectOriginalOriginSidecarCaptureProgram(h),code('ORIGIN_SIDECAR_ORIGINAL_PROGRAM_REQUIRED'));
 r.executable.path='/caller-path';assert.notEqual(m.inspectOriginalOriginSidecarCaptureProgram(h).executable.path,'/caller-path');
 fs.chmodSync(m.inspectOriginalOriginSidecarCaptureProgram(h).executable.path,0o444);assert.throws(()=>m.inspectOriginalOriginSidecarCaptureProgram(h),code('ORIGIN_SIDECAR_PROGRAM_UNAVAILABLE'));
});
test('original selection replacement and physical helper drift cannot renew a retained program handle',async t=>{
 const f=await deploymentFixture(t),m=f.module;await m.prepareOriginalSelectedContextDeployment();await m.loadOriginalSelectedPeerBridge();const h=m.prepareOriginalOriginSidecarCaptureProgram();
 f.producer.replaceOriginalForSourceTest();assert.throws(()=>m.inspectOriginalOriginSidecarCaptureProgram(h),code('ORIGIN_SIDECAR_PROGRAM_UNAVAILABLE'));
 await assert.rejects(m.loadOriginalSelectedPeerBridge(),/SYNTHETIC_OLD_SELECTION/);assert.throws(()=>m.inspectOriginalOriginSidecarCaptureProgram(h),code('ORIGIN_SIDECAR_PROGRAM_UNAVAILABLE'));
 // A loaded module never renews its first original selection. Exercise the
 // independent physical-drift guard in a fresh fictional module instead.
 const separate=await deploymentFixture(t),freshModule=separate.module;await freshModule.prepareOriginalSelectedContextDeployment();await freshModule.loadOriginalSelectedPeerBridge();
 const fresh=freshModule.prepareOriginalOriginSidecarCaptureProgram(),r=freshModule.inspectOriginalOriginSidecarCaptureProgram(fresh);fs.chmodSync(r.executable.path,0o755);fs.writeFileSync(r.executable.path,'CHANGED');fs.chmodSync(r.executable.path,0o555);assert.throws(()=>freshModule.inspectOriginalOriginSidecarCaptureProgram(fresh),code('ORIGIN_SIDECAR_PROGRAM_UNAVAILABLE'));
});
test('an incomplete deployment is held without repair or promotion',async t=>{
 const f=await deploymentFixture(t,{incomplete:true}),directory=path.join(f.root,'work/peer-context-component/deployments',f.data.intent_key);await assert.rejects(f.module.prepareOriginalSelectedContextDeployment());assert.deepEqual(fs.readdirSync(directory),['sentinel']);assert.equal(fs.readFileSync(path.join(directory,'sentinel'),'utf8'),'INCOMPLETE');
});
