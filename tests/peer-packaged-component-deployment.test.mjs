import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {packagedSourceFixture,hash} from './packaged-component-source-fixture.mjs';

// Synthetic selected DATA + opaque test-only producer. Actual fixed deployment
// and DATA projection bodies are copied with five fixed dependency URLs and the fictional home.
// No native/compiled-positive evidence, provider or build is produced here.
const REPO=fileURLToPath(new URL('../',import.meta.url));
const DEPLOYMENT='runtime/peers/context-component-deployment.mjs';
const HOST='plugins/soloco/runtime/peers/codex-task-host.mjs';
const INTERPRETER='plugins/soloco/runtime/peers/peer-context-interpreter.mjs';
const BOOTSTRAP='plugins/soloco/runtime/peers/bootstrap-membership.mjs';
const BOOTSTRAP_RUNNER='plugins/soloco/runtime/peers/bootstrap-membership-native-runner.mjs';
const ref=b=>({bytes:Buffer.byteLength(b),sha256:hash(b)});
const clone=v=>JSON.parse(JSON.stringify(v));
function put(file,body,mode=0o444){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,body,{mode});fs.chmodSync(file,mode);}
async function fixture(t,changes={}){
 const f=await packagedSourceFixture(t);f.layout.prepareOriginalPackagedComponentWorkspace();
 const layout=f.layout.inspectOriginalComponentLayout(f.layout.originalPackagedComponentLayout()),component=path.join(f.workspace,'sealed',hash('synthetic-intent')),copies=[];
 const pkg=fs.readFileSync(path.join(REPO,'native/codex/source-package.json')),p=JSON.parse(pkg),bindings=JSON.parse(fs.readFileSync(path.join(REPO,'native/codex',p.source_cut.bindings.path)));
 const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'\n';
 const manifest=Buffer.from(canonical({schema:'soloco-compiled-native-inputs-v1',upstream:{commit:p.upstream.commit,tree:p.upstream.tree},source_package_sha256:hash(pkg),files_count:bindings.length,files:bindings}));
 const native={executable:Buffer.from('NONEXECUTED-SYNTHETIC-HOST\n'),'origin-sidecar-capture':Buffer.from('NONEXECUTED-SYNTHETIC-HELPER\n'),'compiled-source-manifest.json':manifest,'build-receipt.json':Buffer.from('SYNTHETIC-UNQUALIFIED\n'),'source-package.json':pkg,'Cargo.lock':Buffer.from('SYNTHETIC-LOCK\n'),'toolchain-manifest.toml':Buffer.from('SYNTHETIC-TOOLCHAIN\n')};
 for(const [name,body] of Object.entries(native)){const file=path.join(component,'native',name);put(file,body);copies.push({sealed_path:'native/'+name,original_path:file,...ref(body)});}
 const brand="const handles=new WeakSet();export function mint(){const h=Object.freeze({});handles.add(h);return h;}export function accepts(h){return handles.has(h);}\n";
 f.put('runtime/peers/model.mjs',brand);f.put('runtime/peers/codex-task-host.mjs',"import {accepts} from './model.mjs';export function createCodexTaskRuntime(o){if(!accepts(o.membership))throw Error('FOREIGN_SOURCE_REALM');return {restriction:o.callback_restriction,same_original_realm:true};}\n");f.put('runtime/peers/peer-context-interpreter.mjs','export function prepareOriginalPeerContextDelivery(){throw Error("SYNTHETIC_INTERPRETER_NOT_INVOKED");}\n');
 // This fictional package supplies opaque services/caps only to test the real
 // deployment loader and facade. No original Native issuer, spawn or provider
 // exists here; the selected executable remains nonexecuted synthetic bytes.
 const bootstrapSource=`import {accepts} from './model.mjs';
 const services=new WeakMap(),caps=new WeakMap();
 export const observed={factories:[],enroll:[],inspect:[],activate:[],revoke:[],prepare:[],runs:[]};
 export const control={result:Object.freeze({status:'unknown',accepted:false,old_reservations_released:false,authority_issued:false}),prepareError:null,runError:null,afterPrepare:null};
 const fail=code=>{throw Object.assign(Error(code),{code});};
 function args(input,allowed){if(!input||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).some(k=>typeof k!=='string'||!allowed.includes(k)))fail('SYNTHETIC_BOOTSTRAP_INPUT');return input;}
 export function createPeerBootstrapMembership({ledger,actor}){
  if(!accepts(ledger))fail('SYNTHETIC_BOOTSTRAP_FOREIGN_LEDGER');
  observed.factories.push({ledger,actor});
  const service=Object.freeze(Object.fromEntries(['enroll','inspect','activate','revoke'].map(method=>[method,input=>{observed[method].push({service,input});return {SYNTHETIC_NONAUTHORIZING_METHOD:method,input};}])));
  services.set(service,{ledger,actor});return service;
 }
 export function prepareOriginalPeerBootstrapMembership(service,input){
  if(!services.has(service))fail('SYNTHETIC_BOOTSTRAP_FOREIGN_SERVICE');
  args(input,['operation_id','epoch','enrollment_id','phase','reviewer_principal_id']);
  observed.prepare.push({service,input});if(control.prepareError)throw control.prepareError;
  const cap=Object.freeze(Object.create(null));caps.set(cap,{service,input});observed.lastCap=cap;
  if(control.afterPrepare)control.afterPrepare();return cap;
 }
 export function inspectFixtureCap(cap){const value=caps.get(cap);if(!value)fail('SYNTHETIC_BOOTSTRAP_FOREIGN_CAP');return value;}
 `;
 const runnerSource=`import {inspectFixtureCap,observed,control} from './bootstrap-membership.mjs';
 export async function runOriginalPeerBootstrapMembership(cap,input){const original=inspectFixtureCap(cap);observed.runs.push({cap,input,original});if(control.runError)throw control.runError;return control.result;}
 `;
 f.put('runtime/peers/bootstrap-membership.mjs',changes.missingBootstrapExport?bootstrapSource.replace('export function '+changes.missingBootstrapExport,'function '+changes.missingBootstrapExport):bootstrapSource);
 f.put('runtime/peers/bootstrap-membership-native-runner.mjs',changes.missingRunnerExport?runnerSource.replace('export async function runOriginalPeerBootstrapMembership','async function runOriginalPeerBootstrapMembership'):runnerSource);
 f.put('helpers/origin-sidecar-capture.c',fs.readFileSync(path.join(REPO,'plugins/soloco/helpers/origin-sidecar-capture.c')));
 for(const logical of [HOST,INTERPRETER,BOOTSTRAP,BOOTSTRAP_RUNNER]){const original=path.join(f.packageRoot,logical.slice('plugins/soloco/'.length)),body=fs.readFileSync(original);put(path.join(component,'node-source',logical),body);copies.push({sealed_path:'node-source/'+logical,original_path:original,...ref(body)});}
 put(path.join(component,'node-source/plugins/soloco/runtime/peers/model.mjs'),"throw Error('SEALED_JS_MUST_NEVER_LOAD');\n");
 const data={protocol:'soloco-selected-context-component-data-v1',kind:'SELECTED_COMPILED_COMPONENT_DATA',layout,command:{status:'COMPILED_COMPONENT'},native_qualified:false,claims_released:false,copies,component_root:component,node_profile:{record:{layout,version:process.version,platform:process.platform,arch:process.arch,exec_argv:[...process.execArgv],node:ref(fs.readFileSync(fs.realpathSync(process.execPath)))}},input_key:hash('synthetic-input'),intent_key:hash('synthetic-intent'),output:{sha256:hash('synthetic-output')},owner_epoch:{owner_sha256:hash('synthetic-owner'),generation:0},node_inputs:ref('SYNTHETIC-NODE-INVENTORY')};
 const dataFile=path.join(f.root,'selected-data.json');put(dataFile,JSON.stringify(data));
 const producer=f.put('runtime/peers/synthetic-selected-producer.mjs',`import fs from 'node:fs';let h=Object.freeze({});export function replaceOriginalForSourceTest(){h=Object.freeze({});}export function lookupOriginalSelectedPackagedContextComponentData(){return h;}export function inspectOriginalSelectedPackagedContextComponentData(value){if(value!==h)throw Error('ORIGINAL_REQUIRED');return JSON.parse(fs.readFileSync(${JSON.stringify(dataFile)},'utf8'));}\n`);
 const original=fs.readFileSync(path.join(REPO,'plugins/soloco',DEPLOYMENT),'utf8'),homeSelector="process.env.CODEX_HOME??path.join(os.homedir(),'.codex')";
 const fixedDependencies=[
  ["'./context-build-component.mjs'",JSON.stringify(pathToFileURL(producer).href),1],
  ["'./bootstrap-membership-preflight.mjs'",JSON.stringify(pathToFileURL(path.join(REPO,'plugins/soloco/runtime/peers/bootstrap-membership-preflight.mjs')).href),1],
  ["'./input-frontier-wire.mjs'",JSON.stringify(pathToFileURL(path.join(REPO,'plugins/soloco/runtime/peers/input-frontier-wire.mjs')).href),2],
  ["'./origin-maintenance-wire.mjs'",JSON.stringify(pathToFileURL(path.join(REPO,'plugins/soloco/runtime/peers/origin-maintenance-wire.mjs')).href),3],
  ["'./protected-source-build-slot.mjs'",JSON.stringify(pathToFileURL(path.join(REPO,'plugins/soloco/runtime/peers/protected-source-build-slot.mjs')).href),2]
 ];
 let source=original;
 for(const [specifier,resolved,count] of fixedDependencies){
  assert.equal(source.split(specifier).length-1,count,'Resolve every exact copied-module dependency: '+specifier);
  assert.equal(source.split(resolved).length-1,0,'Fixed replacement URL must be new');source=source.replaceAll(specifier,resolved);
  assert.equal(source.split(resolved).length-1,count,'Preserve every fixed dependency occurrence: '+specifier);assert.equal(source.split(specifier).length-1,0);
 }
 assert.equal(source.split(homeSelector).length-1,1);source=source.replace(homeSelector,JSON.stringify(f.home));
 let restored=source.replace(JSON.stringify(f.home),homeSelector);for(const [specifier,resolved] of [...fixedDependencies].reverse())restored=restored.replaceAll(resolved,specifier);assert.equal(restored,original,'Only the five fixed dependency URLs and fictional home may change');
 const file=f.put(DEPLOYMENT,source),module=await import(pathToFileURL(file).href),model=await import(pathToFileURL(path.join(f.packageRoot,'runtime/peers/model.mjs')).href),bootstrap=await import(pathToFileURL(path.join(f.packageRoot,'runtime/peers/bootstrap-membership.mjs')).href);
 return {...f,module,model,bootstrap,data,dataFile,component,producer:await import(pathToFileURL(producer).href)};
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
 const f=await fixture(t),original=clone(f.data),foreign=clone(original);foreign.layout.package_root=path.join(f.root,'foreign-package');fs.chmodSync(f.dataFile,0o600);fs.writeFileSync(f.dataFile,JSON.stringify(foreign));await assert.rejects(f.module.prepareOriginalPackagedContextDeployment(),e=>e.code==='COMPONENT_DEPLOYMENT_LAYOUT_CHANGED');
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


const bootstrapArgument=error=>error?.code==='COMPONENT_DEPLOYMENT_BOOTSTRAP_ARGUMENT';
const bootstrapOptions=f=>({ledger:f.model.mint(),actor:{host:'codex',session_id:'SYNTHETIC-bootstrap-owner',native_id:'SYNTHETIC-founder-native'},scope_root:'/SYNTHETIC/bootstrap/scope',cwd:'/SYNTHETIC/bootstrap/project',read_paths:['/SYNTHETIC/bootstrap/read-one'],state_root:'/SYNTHETIC/bootstrap/state',scratch_root:'/SYNTHETIC/bootstrap/scratch'});
const phaseArgs=()=>({operation_id:'SYNTHETIC-bootstrap-phase-one',epoch:7,enrollment_id:'SYNTHETIC-enrollment',phase:'reconstruction'});
const bootstrapCalls=f=>Object.fromEntries(['factories','enroll','inspect','activate','revoke','prepare','runs'].map(key=>[key,f.bootstrap.observed[key].length]));
async function loadedBootstrapFixture(t,changes){const f=await fixture(t,changes);await f.module.prepareOriginalPackagedContextDeployment();await f.module.loadOriginalSelectedPackagedPeerBridge();return f;}
function replaceSelectedData(f,edit){const data=clone(f.data);edit(data);fs.chmodSync(f.dataFile,0o600);fs.writeFileSync(f.dataFile,JSON.stringify(data));}

test('loaded bootstrap facade preserves exact same-package cap and captured directories without starting work at creation',async t=>{
 const f=await fixture(t),m=f.module,options=bootstrapOptions(f),before=bootstrapCalls(f);
 assert.throws(()=>m.createOriginalLoadedBootstrapMembershipRuntime(options),e=>e.code==='COMPONENT_DEPLOYMENT_NOT_LOADED');assert.deepEqual(bootstrapCalls(f),before);
 await m.prepareOriginalPackagedContextDeployment();await m.loadOriginalSelectedPackagedPeerBridge();assert.deepEqual(bootstrapCalls(f),before);
 const actor=clone(options.actor),paths=[...options.read_paths],runtime=m.createOriginalLoadedBootstrapMembershipRuntime(options);
 assert(Object.isFrozen(runtime));assert.deepEqual(Object.keys(runtime).sort(),['activate','enroll','inspect','revoke','run']);
 assert.equal(f.bootstrap.observed.factories.length,1);assert.equal(f.bootstrap.observed.factories[0].ledger,options.ledger);assert.deepEqual(f.bootstrap.observed.factories[0].actor,actor);
 assert.equal(f.bootstrap.observed.prepare.length,0);assert.equal(f.bootstrap.observed.runs.length,0);assert.equal(f.bootstrap.observed.activate.length,0);
 options.scope_root='/SYNTHETIC/changed-scope';options.read_paths.push('/SYNTHETIC/changed-read');options.actor.session_id='SYNTHETIC-foreign-owner';
 const input=phaseArgs(),result=await runtime.run(input),seen=f.bootstrap.observed;
 assert.equal(result,f.bootstrap.control.result);assert.equal(seen.prepare.length,1);assert.equal(seen.runs.length,1);assert.equal(seen.runs[0].cap,seen.lastCap);assert.equal(seen.runs[0].original.service,seen.prepare[0].service);assert.equal(seen.prepare[0].input,input);
 assert.deepEqual(seen.runs[0].input,{scope_root:'/SYNTHETIC/bootstrap/scope',cwd:'/SYNTHETIC/bootstrap/project',read_paths:paths,state_root:'/SYNTHETIC/bootstrap/state',scratch_root:'/SYNTHETIC/bootstrap/scratch'});
 assert.deepEqual(seen.factories[0].actor,actor);assert.equal(seen.activate.length,0);
 for(const name of ['enroll','inspect','activate','revoke']){const command={SYNTHETIC_command:name};const reply=runtime[name](command);assert.equal(reply.SYNTHETIC_NONAUTHORIZING_METHOD,name);assert.equal(reply.input,command);assert.equal(seen[name].length,1);}
 assert.equal(seen.prepare.length,1);assert.equal(seen.runs.length,1,'control methods never prepare or execute another phase');
});

test('loaded bootstrap uses its original module realm and rejects foreign ledgers before admission',async t=>{
 const f=await loadedBootstrapFixture(t),foreign=await import(pathToFileURL(path.join(f.packageRoot,'runtime/peers/model.mjs')).href+'?FOREIGN-BOOTSTRAP-REALM'),before=bootstrapCalls(f);
 assert.throws(()=>f.module.createOriginalLoadedBootstrapMembershipRuntime({...bootstrapOptions(f),ledger:foreign.mint()}),e=>e.code==='SYNTHETIC_BOOTSTRAP_FOREIGN_LEDGER');assert.deepEqual(bootstrapCalls(f),before);
 const other=await loadedBootstrapFixture(t);assert.throws(()=>f.module.createOriginalLoadedBootstrapMembershipRuntime({...bootstrapOptions(f),ledger:other.model.mint()}),e=>e.code==='SYNTHETIC_BOOTSTRAP_FOREIGN_LEDGER');assert.deepEqual(bootstrapCalls(f),before);
});

test('loaded bootstrap rejects injected cap or code selectors and accessors before factory or admission',async t=>{
 const f=await loadedBootstrapFixture(t),m=f.module,before=bootstrapCalls(f);let getters=0,proxyTraps=0;
 const getter={...bootstrapOptions(f)};Object.defineProperty(getter,'cwd',{enumerable:true,get(){getters++;throw Error('GETTER_MUST_NOT_RUN');}});
 const actorGetter={...bootstrapOptions(f),actor:{host:'codex',session_id:'SYNTHETIC-owner'}};Object.defineProperty(actorGetter.actor,'native_id',{enumerable:true,get(){getters++;throw Error('ACTOR_GETTER_MUST_NOT_RUN');}});
 const proxy=new Proxy(bootstrapOptions(f),{getPrototypeOf(){proxyTraps++;throw Error('PROXY_MUST_NOT_RUN');},ownKeys(){proxyTraps++;throw Error('PROXY_MUST_NOT_RUN');}});
 const badPaths=bootstrapOptions(f);Object.defineProperty(badPaths.read_paths,0,{enumerable:true,get(){getters++;throw Error('READ_PATH_GETTER_MUST_NOT_RUN');}});
 const invalid=[getter,actorGetter,proxy,badPaths,{...bootstrapOptions(f),read_paths:['relative']},{...bootstrapOptions(f),read_paths:new Array(1)}];
 for(const name of ['signal','cap','runner','namespace','transport','spawn','callback','profile','native_id','module_url'])invalid.push({...bootstrapOptions(f),[name]:name==='cap'?Object.freeze({}):()=>{throw Error('INJECTED_CODE_MUST_NOT_RUN');}});
 for(const value of invalid)assert.throws(()=>m.createOriginalLoadedBootstrapMembershipRuntime(value),bootstrapArgument);
 assert.equal(getters,0);assert.equal(proxyTraps,0);assert.deepEqual(bootstrapCalls(f),before);
 const runtime=m.createOriginalLoadedBootstrapMembershipRuntime(bootstrapOptions(f)),afterFactory=bootstrapCalls(f);
 for(const name of ['enroll','inspect','activate','revoke'])assert.throws(()=>runtime[name]({},{}),bootstrapArgument);
 await assert.rejects(()=>runtime.run(phaseArgs(),{}),bootstrapArgument);
 for(const cap of [{},Object.freeze(Object.create(null)),{protocol:'peer-bootstrap-membership-admission-v1'},clone({protocol:'peer-bootstrap-membership-admission-v1'})])await assert.rejects(()=>runtime.run({...phaseArgs(),cap}),e=>e.code==='SYNTHETIC_BOOTSTRAP_INPUT');
 assert.deepEqual(bootstrapCalls(f),afterFactory,'neither extra args nor copied cap DATA can reserve a phase');
});

test('loaded bootstrap requires both fixed selected module copies and their original exports',async t=>{
 for(const logical of [BOOTSTRAP,BOOTSTRAP_RUNNER]){
  const f=await fixture(t);replaceSelectedData(f,data=>{data.copies=data.copies.filter(row=>row.sealed_path!=='node-source/'+logical);});
  await assert.rejects(()=>f.module.prepareOriginalPackagedContextDeployment(),e=>e.code==='COMPONENT_DEPLOYMENT_NODE_CHANGED');assert.equal(f.bootstrap.observed.factories.length,0);
 }
 for(const changes of [{missingBootstrapExport:'createPeerBootstrapMembership'},{missingBootstrapExport:'prepareOriginalPeerBootstrapMembership'},{missingRunnerExport:true}]){
  const f=await fixture(t,changes);await f.module.prepareOriginalPackagedContextDeployment();await assert.rejects(()=>f.module.loadOriginalSelectedPackagedPeerBridge(),e=>e.code==='COMPONENT_DEPLOYMENT_NODE_CHANGED');assert.equal(f.bootstrap.observed.factories.length,0);assert.equal(f.bootstrap.observed.runs.length,0);
 }
});

test('loaded bootstrap module drift and replaced selected producer fence every facade method',async t=>{
 const f=await loadedBootstrapFixture(t),runtime=f.module.createOriginalLoadedBootstrapMembershipRuntime(bootstrapOptions(f)),before=bootstrapCalls(f);
 const bootstrapFile=path.join(f.packageRoot,'runtime/peers/bootstrap-membership.mjs');fs.chmodSync(bootstrapFile,0o644);fs.appendFileSync(bootstrapFile,'\n// SYNTHETIC selected byte drift\n');
 for(const name of ['enroll','inspect','activate','revoke'])assert.throws(()=>runtime[name]({}),e=>e.code==='COMPONENT_DEPLOYMENT_NODE_CHANGED');await assert.rejects(()=>runtime.run(phaseArgs()),e=>e.code==='COMPONENT_DEPLOYMENT_NODE_CHANGED');assert.deepEqual(bootstrapCalls(f),before);
 const other=await loadedBootstrapFixture(t),live=other.module.createOriginalLoadedBootstrapMembershipRuntime(bootstrapOptions(other)),prior=bootstrapCalls(other);other.producer.replaceOriginalForSourceTest();
 for(const name of ['enroll','inspect','activate','revoke'])assert.throws(()=>live[name]({}),/ORIGINAL_REQUIRED/);await assert.rejects(()=>live.run(phaseArgs()),/ORIGINAL_REQUIRED/);assert.deepEqual(bootstrapCalls(other),prior);
});

test('loaded bootstrap rechecks the selected component after exact admission and before the runner',async t=>{
 const f=await loadedBootstrapFixture(t),runtime=f.module.createOriginalLoadedBootstrapMembershipRuntime(bootstrapOptions(f));
 f.bootstrap.control.afterPrepare=()=>f.producer.replaceOriginalForSourceTest();
 await assert.rejects(()=>runtime.run(phaseArgs()),/ORIGINAL_REQUIRED/);assert.equal(f.bootstrap.observed.prepare.length,1);assert.equal(f.bootstrap.observed.runs.length,0);assert.equal(f.bootstrap.observed.activate.length,0,'a held admission never autoactivates');
});

test('loaded bootstrap preserves exact UNKNOWN results and original errors without retry or activation',async t=>{
 const f=await loadedBootstrapFixture(t),runtime=f.module.createOriginalLoadedBootstrapMembershipRuntime(bootstrapOptions(f)),unknown=Object.freeze({status:'unknown',accepted:false,old_reservations_released:false,authority_issued:false,SYNTHETIC_evidence:'unchanged'});
 f.bootstrap.control.result=unknown;assert.equal(await runtime.run(phaseArgs()),unknown);assert.equal(f.bootstrap.observed.prepare.length,1);assert.equal(f.bootstrap.observed.runs.length,1);
 const runnerError=Object.assign(Error('SYNTHETIC exact original runner error'),{code:'SYNTHETIC_RUNNER_FAILURE'});f.bootstrap.control.runError=runnerError;
 await assert.rejects(()=>runtime.run({...phaseArgs(),operation_id:'SYNTHETIC-phase-two'}),error=>error===runnerError);assert.equal(f.bootstrap.observed.prepare.length,2);assert.equal(f.bootstrap.observed.runs.length,2);
 const prepareError=Object.assign(Error('SYNTHETIC exact original admission error'),{code:'SYNTHETIC_ADMISSION_FAILURE'});f.bootstrap.control.prepareError=prepareError;
 await assert.rejects(()=>runtime.run({...phaseArgs(),operation_id:'SYNTHETIC-phase-three'}),error=>error===prepareError);assert.equal(f.bootstrap.observed.prepare.length,3);assert.equal(f.bootstrap.observed.runs.length,2);assert.equal(f.bootstrap.observed.activate.length,0);
});
