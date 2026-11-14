// Temporary SOURCE packaging and a fictional entry module only. No original
// producer, Python helper, compiler, install or company operation is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
function declared(){
 const native=path.join(ROOT,'native/codex'),pkg=JSON.parse(fs.readFileSync(path.join(native,'source-package.json')));
 return [{path:'source-package.json',mode:'100644'},{path:'tools/protected_native.py',mode:'100644'},...['handoff','bindings','patch'].map(k=>({...pkg.source_cut[k],mode:'100644'})),{...pkg.upstream.inventory,mode:'100644'},...pkg.upstream.attribution.map(v=>({...v,mode:'100644'})),...pkg.overlay.map(v=>({...v.payload,mode:v.mode})),{...pkg.cargo_lock,mode:'100644'},{...pkg.toolchain.inventory,mode:'100644'},{...pkg.toolchain.official_manifest,mode:'100644'}].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-recipe-package-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'tools'));fs.mkdirSync(path.join(root,'plugins/soloco'),{recursive:true});
 fs.copyFileSync(path.join(ROOT,'tools/package-context-producer.mjs'),path.join(root,'tools/package-context-producer.mjs'));
 const rows=declared();assert.equal(rows.length,174);
 for(const row of rows){const file=path.join(root,'native/codex',row.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(ROOT,'native/codex',row.path),file);fs.chmodSync(file,row.mode==='100755'?0o755:0o644);}
 return {root,rows,native:path.join(root,'plugins/soloco/producer-inputs/native/codex'),seal:path.join(root,'plugins/soloco/producer-inputs/native-recipe-inventory.json')};
}
function run(root,...args){return spawnSync(process.execPath,[path.join(root,'tools/package-context-producer.mjs'),...args],{encoding:'utf8',timeout:60000,maxBuffer:65536});}
function passed(result){assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);}
function aliasedRoot(root){
 const physical=fs.realpathSync(root),alias=path.join(root,'cli-alias');fs.symlinkSync(physical,alias,'dir');
 const entry=path.join(alias,'tools/package-context-producer.mjs');
 assert.notEqual(path.resolve(entry),fs.realpathSync(entry));
 assert.equal(fs.realpathSync(entry),path.join(physical,'tools/package-context-producer.mjs'));
 return alias;
}

test('fixed recipe packager reconstructs all 174 original assets with exact bytes modes and inventory',t=>{
 const f=fixture(t),missing=path.join(f.root,'missing-non-main-entry');
 const importOnly=`if(process.argv[1]!==${JSON.stringify(missing)})throw Error('IMPORT_FIXTURE_ARGUMENT');const p=await import(${JSON.stringify(pathToFileURL(path.join(f.root,'tools/package-context-producer.mjs')).href)});if(typeof p.packageContextProducer!=='function')throw Error('IMPORT_EXPORT_MISSING');process.stdout.write('IMPORTED_ONLY\\n');`;
 const imported=spawnSync(process.execPath,['--input-type=module','--eval',importOnly,missing],{encoding:'utf8',timeout:5000,maxBuffer:65536});
 passed(imported);assert.equal(imported.stdout,'IMPORTED_ONLY\n');assert.equal(fs.existsSync(f.seal),false);
 passed(run(aliasedRoot(f.root)));const seal=JSON.parse(fs.readFileSync(f.seal));
 assert.deepEqual(Object.keys(seal).sort(),['build_driver','files','protocol','source_package']);
 assert.equal(seal.protocol,'soloco-packaged-native-recipe-v1');assert.equal(seal.files.length,174);
 const expected=f.rows.map(row=>{const bytes=fs.readFileSync(path.join(f.root,'native/codex',row.path));assert.deepEqual(fs.readFileSync(path.join(f.native,row.path)),bytes);assert.equal(fs.statSync(path.join(f.native,row.path)).mode&0o777,row.mode==='100755'?0o755:0o644);return {path:row.path,bytes:bytes.length,sha256:hash(bytes),mode:row.mode};});
 assert.deepEqual(seal.files,expected);
 for(const [key,name] of [['source_package','source-package.json'],['build_driver','tools/protected_native.py']]){const bytes=fs.readFileSync(path.join(f.native,name));assert.deepEqual(seal[key],{bytes:bytes.length,sha256:hash(bytes)});}
 assert.equal(seal.files.some(v=>v.path==='native-recipe-inventory.json'),false);
 const before=fs.readFileSync(f.seal);passed(run(fs.realpathSync(f.root),'--check'));assert.deepEqual(fs.readFileSync(f.seal),before);
});

test('focused Rust test Source lineage joins complete bindings and current recipe consumers without transferring prior verdicts',()=>{
 const read=name=>fs.readFileSync(path.join(ROOT,name)),native='native/codex/',manifestBytes=read(native+'source-package.json'),pkg=JSON.parse(manifestBytes),handoffBytes=read(native+pkg.source_cut.handoff.path),handoff=JSON.parse(handoffBytes),increment=handoff.focused_native_test_source_increment,bindingsBytes=read(native+pkg.source_cut.bindings.path),bindings=JSON.parse(bindingsBytes);
 const reference=body=>({bytes:body.length,sha256:hash(body)});
 assert.deepEqual(reference(handoffBytes),{bytes:pkg.source_cut.handoff.bytes,sha256:pkg.source_cut.handoff.sha256});assert.deepEqual(reference(bindingsBytes),{bytes:pkg.source_cut.bindings.bytes,sha256:pkg.source_cut.bindings.sha256});
 assert.equal(increment.subject.head,'4679b2b5b3edc643dac326c7ad77b59314364fd8');assert.equal(increment.subject.sole_parent,'18faf66da781df137b89ba47e969782fb78ee689');
 assert.deepEqual(increment.current_complete_bindings,{path:pkg.source_cut.bindings.path,...reference(bindingsBytes),rows:9314});assert.equal(bindings.length,9314);assert.equal(pkg.overlay.length,163);assert.equal(increment.unchanged_other_binding_rows,9312);assert.equal(increment.unchanged_other_overlay_payloads,161);
 assert.equal(increment.current_graph_bytes,bindings.reduce((n,row)=>n+row.bytes,0));assert.equal(increment.current_graph_bytes-handoff.source_graph_bytes,9565,'The historical source byte total retains its original cut');
 assert.deepEqual(increment.selected_authored_definitions,{prior:68,current:71,added:3,status:'ALL_AUTHORED_UNRUN',global_total:null});assert.equal(increment.tests_executed,false);assert.equal(increment.rust_syntax_or_compiler_checked,false);assert.equal(increment.native_qualified,false);assert.equal(increment.compiled_artifact_created,false);assert.equal(increment.runtime_slot,null);assert.equal(pkg.status,'frozen-source-unqualified');assert.equal(pkg.qualified_binary,null);assert.equal(pkg.source_cut.review_state,'independent-review-required');
 assert.equal(handoff.source_graph_vector_sha256,'e53b191fdf12cd98b65482c30b5080fe9b81fbacc5a174e3c98eb2ea22e93333');assert.equal(handoff.original_coherent_handoff_sha256,'67ad9bf2fe5e16cc671a520b0af737b1dbfc430d3f2ed8d2f9184bf5b3524a23');assert.equal(pkg.source_cut.patch.sha256,'6c9ae7279a1a1089bef0a1adde566bf87ee644d2ea6cb6acd7d27bf3e1896a03');
 assert.equal(increment.changed_targets.length,2);for(const change of increment.changed_targets){const payload=read(native+'overlay/'+change.target),binding=bindings.find(row=>row.path===change.target),overlay=pkg.overlay.find(row=>row.target===change.target);assert.deepEqual(reference(payload),{bytes:change.after.bytes,sha256:change.after.sha256});assert.deepEqual(reference(payload.subarray(0,change.before.bytes)),{bytes:change.before.bytes,sha256:change.before.sha256},'Each old complete test body remains an exact prefix');assert.deepEqual(binding,{path:change.target,...reference(payload),mode:'100644'});assert.deepEqual(overlay.payload,{path:'overlay/'+change.target,...reference(payload)});}
 const sourcePin=(file,name)=>{const match=read(file).toString('utf8').match(new RegExp('(?:const '+name+"='|^"+name+' = \")([a-f0-9]{64})', 'm'));assert(match,file+' must retain its fixed source pin');return match[1];};
 const packageSha=hash(manifestBytes),driverSha=hash(read(native+'tools/protected_native.py'));
 assert.equal(sourcePin(native+'tools/protected_native.py','MANIFEST_SHA256'),packageSha);assert.equal(sourcePin('tools/package-context-producer.mjs','MANIFEST_SHA'),packageSha);assert.equal(sourcePin('tools/package-context-producer.mjs','DRIVER_SHA'),driverSha);assert.equal(sourcePin('plugins/soloco/runtime/peers/context-build-component.mjs','PACKAGE_SHA'),packageSha);assert.equal(sourcePin('plugins/soloco/runtime/peers/context-build-component.mjs','DRIVER_SHA'),driverSha);assert.equal(sourcePin('plugins/soloco/runtime/peers/context-component-deployment.mjs','EXPECTED_PACKAGE'),packageSha);
 const sort=value=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value;
 const compiledData=JSON.stringify(sort({schema:'soloco-compiled-native-inputs-v1',upstream:{commit:pkg.upstream.commit,tree:pkg.upstream.tree},source_package_sha256:packageSha,files_count:bindings.length,files:bindings})).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'\n';
 assert.equal(sourcePin('plugins/soloco/runtime/peers/context-component-deployment.mjs','EXPECTED_MANIFEST'),hash(compiledData));
});

test('fixed packager rejects the preserved historical Rust test body as stale current input before package effects',t=>{
 const f=fixture(t),handoff=JSON.parse(fs.readFileSync(path.join(f.root,'native/codex/pins/coherent-source-handoff.json'))),change=handoff.focused_native_test_source_increment.changed_targets[0],file=path.join(f.root,'native/codex/overlay',change.target),historical=fs.readFileSync(file).subarray(0,change.before.bytes);assert.equal(hash(historical),change.before.sha256);fs.writeFileSync(file,historical);
 const result=run(f.root);assert.notEqual(result.status,0);assert.match(result.stderr,/declared payload changed/);assert.equal(fs.existsSync(path.join(f.root,'plugins/soloco/producer-inputs')),false);
});

test('fixed recipe check rejects missing changed extra linked and mode-changed package assets',t=>{
 const f=fixture(t);passed(run(f.root));const row=f.rows.find(v=>v.mode==='100644'),file=path.join(f.native,row.path),bytes=fs.readFileSync(file);
 fs.unlinkSync(file);assert.notEqual(run(f.root,'--check').status,0);fs.writeFileSync(file,bytes,{mode:0o644});
 fs.writeFileSync(file,'changed');assert.notEqual(run(f.root,'--check').status,0);fs.writeFileSync(file,bytes);
 fs.chmodSync(file,0o755);assert.notEqual(run(f.root,'--check').status,0);fs.chmodSync(file,0o644);
 const retained=path.join(f.root,'retained-outside-package');fs.renameSync(file,retained);fs.symlinkSync(retained,file);assert.notEqual(run(f.root,'--check').status,0);fs.unlinkSync(file);fs.renameSync(retained,file);
 const extra=path.join(f.native,'unassigned.bin');fs.writeFileSync(extra,'compiled output is not a recipe');assert.notEqual(run(f.root).status,0);assert.equal(fs.readFileSync(extra,'utf8'),'compiled output is not a recipe');fs.unlinkSync(extra);
 const extraDirectory=path.join(path.dirname(path.dirname(f.native)),'unassigned');fs.mkdirSync(extraDirectory);assert.notEqual(run(f.root,'--check').status,0);fs.rmdirSync(extraDirectory);
 const seal=fs.readFileSync(f.seal);fs.writeFileSync(f.seal,JSON.stringify({...JSON.parse(seal),extra:true}));assert.notEqual(run(f.root,'--check').status,0);fs.writeFileSync(f.seal,seal);
 passed(run(f.root,'--check'));
});

test('fixed packager validates the entire original recipe before creating package assets',t=>{
 const f=fixture(t),payload=f.rows.find(v=>v.path.startsWith('overlay/')),file=path.join(f.root,'native/codex',payload.path);
 fs.appendFileSync(file,'changed source');const result=run(aliasedRoot(f.root));assert.notEqual(result.status,0);assert.match(result.stderr,/declared payload changed/);assert.equal(fs.existsSync(path.join(f.root,'plugins/soloco/producer-inputs')),false);
});

test('normal build-plugin composes the fixed recipe check and preserves cache-rooted launcher',()=>{
 const source=fs.readFileSync(path.join(ROOT,'tools/build-plugin.mjs'),'utf8');
 assert.match(source,/import \{packageContextProducer\} from '\.\/package-context-producer\.mjs';/);
 assert.match(source,/packageContextProducer\(check\);/);
 assert.match(source,/plugins\/cache\/soloco\/soloco\//);
 assert.doesNotMatch(source,/buildOriginal|protected_native\.py|build-packaged|child_process/);
});

test('packaged build entry calls the same package service without accepting arguments',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-entry-source-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'producer'));fs.mkdirSync(path.join(root,'runtime/peers'),{recursive:true});
 fs.copyFileSync(path.join(ROOT,'plugins/soloco/producer/build-peer-context.mjs'),path.join(root,'producer/build-peer-context.mjs'));
 fs.writeFileSync(path.join(root,'runtime/peers/context-build-component.mjs'),"export async function buildOriginalPackagedContextComponent(...args){if(args.length)throw Error('ARGS');return {status:'COMPILED_COMPONENT',source_fixture:true};}export const contextComponentErrorCode=()=> 'FICTIONAL_HOLD';\n");
 const entry=path.join(root,'producer/build-peer-context.mjs'),invoke=args=>spawnSync(process.execPath,[entry,...args],{encoding:'utf8',timeout:5000,maxBuffer:65536});
 const good=invoke([]);passed(good);assert.deepEqual(JSON.parse(good.stdout),{status:'COMPILED_COMPONENT',source_fixture:true});
 const rejected=invoke(['--root','/caller-selected']);assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/COMPONENT_NO_ARGUMENTS/);assert.equal(rejected.stdout,'');
 fs.writeFileSync(path.join(root,'runtime/peers/context-build-component.mjs'),"export async function buildOriginalPackagedContextComponent(){throw Error('unprepared');}export const contextComponentErrorCode=()=> 'COMPONENT_PREPARED_INPUTS_UNAVAILABLE';\n");
 const held=invoke([]);assert.equal(held.status,1);assert.deepEqual(JSON.parse(held.stdout),{protocol:'soloco-context-component-command-v1',status:'HELD',code:'COMPONENT_PREPARED_INPUTS_UNAVAILABLE'});
});
