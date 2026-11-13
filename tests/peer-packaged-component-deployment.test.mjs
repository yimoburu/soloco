import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {packagedSourceFixture,hash} from './packaged-component-source-fixture.mjs';

// Synthetic selected DATA + opaque test-only producer. Actual fixed deployment
// and DATA projection bodies are copied unchanged except one dependency URL.
// No native/compiled-positive evidence, provider or build is produced here.
const REPO=fileURLToPath(new URL('../',import.meta.url));
const DEPLOYMENT='runtime/peers/context-component-deployment.mjs';
const HOST='plugins/soloco/runtime/peers/codex-task-host.mjs';
const INTERPRETER='plugins/soloco/runtime/peers/peer-context-interpreter.mjs';
const ref=b=>({bytes:Buffer.byteLength(b),sha256:hash(b)});
const clone=v=>JSON.parse(JSON.stringify(v));
function put(file,body,mode=0o444){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,body,{mode});fs.chmodSync(file,mode);}
async function fixture(t){
 const f=await packagedSourceFixture(t);f.layout.prepareOriginalPackagedComponentWorkspace();
 const layout=f.layout.inspectOriginalComponentLayout(f.layout.originalPackagedComponentLayout()),component=path.join(f.workspace,'sealed',hash('synthetic-intent')),copies=[];
 const pkg=fs.readFileSync(path.join(REPO,'native/codex/source-package.json')),p=JSON.parse(pkg),bindings=JSON.parse(fs.readFileSync(path.join(REPO,'native/codex',p.source_cut.bindings.path)));
 const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'\n';
 const manifest=Buffer.from(canonical({schema:'soloco-compiled-native-inputs-v1',upstream:{commit:p.upstream.commit,tree:p.upstream.tree},source_package_sha256:hash(pkg),files_count:bindings.length,files:bindings}));
 const native={executable:Buffer.from('NONEXECUTED-SYNTHETIC-HOST\n'),'origin-sidecar-capture':Buffer.from('NONEXECUTED-SYNTHETIC-HELPER\n'),'compiled-source-manifest.json':manifest,'build-receipt.json':Buffer.from('SYNTHETIC-UNQUALIFIED\n'),'source-package.json':pkg,'Cargo.lock':Buffer.from('SYNTHETIC-LOCK\n'),'toolchain-manifest.toml':Buffer.from('SYNTHETIC-TOOLCHAIN\n')};
 for(const [name,body] of Object.entries(native)){const file=path.join(component,'native',name);put(file,body);copies.push({sealed_path:'native/'+name,original_path:file,...ref(body)});}
 const brand="const handles=new WeakSet();export function mint(){const h=Object.freeze({});handles.add(h);return h;}export function accepts(h){return handles.has(h);}\n";
 f.put('runtime/peers/model.mjs',brand);f.put('runtime/peers/codex-task-host.mjs',"import {accepts} from './model.mjs';export function createCodexTaskRuntime(o){if(!accepts(o.membership))throw Error('FOREIGN_SOURCE_REALM');return {restriction:o.callback_restriction,same_original_realm:true};}\n");f.put('runtime/peers/peer-context-interpreter.mjs','export function prepareOriginalPeerContextDelivery(){throw Error("SYNTHETIC_INTERPRETER_NOT_INVOKED");}\n');
 f.put('helpers/origin-sidecar-capture.c',fs.readFileSync(path.join(REPO,'plugins/soloco/helpers/origin-sidecar-capture.c')));
 for(const logical of [HOST,INTERPRETER]){const original=path.join(f.packageRoot,logical.slice('plugins/soloco/'.length)),body=fs.readFileSync(original);put(path.join(component,'node-source',logical),body);copies.push({sealed_path:'node-source/'+logical,original_path:original,...ref(body)});}
 put(path.join(component,'node-source/plugins/soloco/runtime/peers/model.mjs'),"throw Error('SEALED_JS_MUST_NEVER_LOAD');\n");
 const data={protocol:'soloco-selected-context-component-data-v1',kind:'SELECTED_COMPILED_COMPONENT_DATA',layout,command:{status:'COMPILED_COMPONENT'},native_qualified:false,claims_released:false,copies,component_root:component,node_profile:{record:{layout,version:process.version,platform:process.platform,arch:process.arch,exec_argv:[...process.execArgv],node:ref(fs.readFileSync(fs.realpathSync(process.execPath)))}},input_key:hash('synthetic-input'),intent_key:hash('synthetic-intent'),output:{sha256:hash('synthetic-output')},owner_epoch:{owner_sha256:hash('synthetic-owner'),generation:0},node_inputs:ref('SYNTHETIC-NODE-INVENTORY')};
 const dataFile=path.join(f.root,'selected-data.json');put(dataFile,JSON.stringify(data));
 const producer=f.put('runtime/peers/synthetic-selected-producer.mjs',`import fs from 'node:fs';let h=Object.freeze({});export function replaceOriginalForSourceTest(){h=Object.freeze({});}export function lookupOriginalSelectedPackagedContextComponentData(){return h;}export function inspectOriginalSelectedPackagedContextComponentData(value){if(value!==h)throw Error('ORIGINAL_REQUIRED');return JSON.parse(fs.readFileSync(${JSON.stringify(dataFile)},'utf8'));}\n`);
 const original=fs.readFileSync(path.join(REPO,'plugins/soloco',DEPLOYMENT),'utf8'),dependency="'./context-build-component.mjs'",homeSelector="process.env.CODEX_HOME??path.join(os.homedir(),'.codex')";assert.equal(original.split(dependency).length,2);assert.equal(original.split(homeSelector).length,2);
 const source=original.replace(dependency,JSON.stringify(pathToFileURL(producer).href)).replace(homeSelector,JSON.stringify(f.home));assert.equal(source.replace(JSON.stringify(pathToFileURL(producer).href),dependency).replace(JSON.stringify(f.home),homeSelector),original);
 const file=f.put(DEPLOYMENT,source),module=await import(pathToFileURL(file).href),model=await import(pathToFileURL(path.join(f.packageRoot,'runtime/peers/model.mjs')).href);
 return {...f,module,model,data,dataFile,component,producer:await import(pathToFileURL(producer).href)};
}

test('packaged deployment loads only actual P modules and preserves same-P opaque brands',async t=>{
 const f=await fixture(t),m=f.module;const handle=await m.prepareOriginalPackagedContextDeployment();const record=m.inspectOriginalPackagedContextDeployment(handle);assert.equal(record.layout.durable_root,f.workspace);assert.equal(record.native_qualified,false);assert.equal(record.claims_released,false);
 assert.throws(()=>m.inspectOriginalSelectedContextDeployment(handle),e=>e.code==='COMPONENT_DEPLOYMENT_HANDLE_REQUIRED');assert.throws(()=>m.inspectOriginalPackagedContextDeployment({...handle}),e=>e.code==='COMPONENT_DEPLOYMENT_HANDLE_REQUIRED');
 const bridge=await m.loadOriginalSelectedPackagedPeerBridge();assert.equal(bridge.node.root,f.packageRoot);assert.equal(bridge.qualified_interpreter,'SOURCE_ASSOCIATED_ONLY');assert.equal(bridge.native_qualified,false);
 const options={owner:Symbol('SOURCE-owner'),ledger:{},membership:f.model.mint(),protected_launch:{}};assert.deepEqual(m.createOriginalLoadedProductionTaskRuntime(options),{restriction:'task-bound-effects',same_original_realm:true});
 const foreign=await import(pathToFileURL(path.join(f.packageRoot,'runtime/peers/model.mjs')).href+'?FOREIGN-SOURCE-NEGATIVE');assert.throws(()=>m.createOriginalLoadedProductionTaskRuntime({...options,membership:foreign.mint()}),/FOREIGN_SOURCE_REALM/);
 const program=m.prepareOriginalOriginSidecarCaptureProgram(),programData=m.inspectOriginalOriginSidecarCaptureProgram(program);assert.equal(programData.native_qualified,false);assert.deepEqual(programData.argv,['origin-sidecar-capture-v1']);assert.equal(fs.readFileSync(programData.executable.path,'utf8'),'NONEXECUTED-SYNTHETIC-HELPER\n');
 await assert.rejects(m.loadOriginalSelectedPeerBridge(),e=>e.code==='COMPONENT_DEPLOYMENT_LAYOUT_MIXED');
});

test('packaged deployment rejects foreign layout DATA and retained physical drift',async t=>{
 const f=await fixture(t),original=clone(f.data);f.data.layout.package_root=path.join(f.root,'foreign-package');fs.chmodSync(f.dataFile,0o600);fs.writeFileSync(f.dataFile,JSON.stringify(f.data));await assert.rejects(f.module.prepareOriginalPackagedContextDeployment(),e=>e.code==='COMPONENT_DEPLOYMENT_LAYOUT_CHANGED');
 fs.writeFileSync(f.dataFile,JSON.stringify(original));const h=await f.module.prepareOriginalPackagedContextDeployment();fs.chmodSync(f.managed,0o750);assert.throws(()=>f.module.inspectOriginalPackagedContextDeployment(h),e=>e.code==='COMPONENT_LAYOUT_CHANGED');
});


test('concurrent fixed loaders latch one service before awaiting and share one first selection',async t=>{
 const f=await fixture(t),m=f.module;await m.prepareOriginalPackagedContextDeployment();
 const first=m.loadOriginalSelectedPackagedPeerBridge(),same=m.loadOriginalSelectedPackagedPeerBridge(),other=m.loadOriginalSelectedPeerBridge();
 await assert.rejects(other,e=>e.code==='COMPONENT_DEPLOYMENT_LAYOUT_MIXED');const [a,b]=await Promise.all([first,same]);assert.deepEqual(a,b);assert.equal(m.inspectOriginalLoadedPeerBridge().node.root,f.packageRoot);
 const failed=await fixture(t);await assert.rejects(failed.module.loadOriginalSelectedPeerBridge());await assert.rejects(failed.module.loadOriginalSelectedPackagedPeerBridge(),e=>e.code==='COMPONENT_DEPLOYMENT_LAYOUT_MIXED');assert.throws(()=>failed.module.inspectOriginalLoadedPeerBridge(),e=>e.code==='COMPONENT_DEPLOYMENT_NOT_LOADED');
});

test('same-service reload cannot renew a different selected producer handle in an active realm',async t=>{
 const f=await fixture(t),m=f.module;await m.prepareOriginalPackagedContextDeployment();await m.loadOriginalSelectedPackagedPeerBridge();const h=m.prepareOriginalOriginSidecarCaptureProgram();
 f.producer.replaceOriginalForSourceTest();await assert.rejects(m.loadOriginalSelectedPackagedPeerBridge(),/ORIGINAL_REQUIRED/);assert.throws(()=>m.inspectOriginalOriginSidecarCaptureProgram(h),e=>e.code==='ORIGIN_SIDECAR_PROGRAM_UNAVAILABLE');await assert.rejects(m.loadOriginalSelectedPeerBridge(),e=>e.code==='COMPONENT_DEPLOYMENT_LAYOUT_MIXED');
});
