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
 const rows=declared();assert.equal(rows.length,169);
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

test('fixed recipe packager reconstructs all 169 original assets with exact bytes modes and inventory',t=>{
 const f=fixture(t),missing=path.join(f.root,'missing-non-main-entry');
 const importOnly=`if(process.argv[1]!==${JSON.stringify(missing)})throw Error('IMPORT_FIXTURE_ARGUMENT');const p=await import(${JSON.stringify(pathToFileURL(path.join(f.root,'tools/package-context-producer.mjs')).href)});if(typeof p.packageContextProducer!=='function')throw Error('IMPORT_EXPORT_MISSING');process.stdout.write('IMPORTED_ONLY\\n');`;
 const imported=spawnSync(process.execPath,['--input-type=module','--eval',importOnly,missing],{encoding:'utf8',timeout:5000,maxBuffer:65536});
 passed(imported);assert.equal(imported.stdout,'IMPORTED_ONLY\n');assert.equal(fs.existsSync(f.seal),false);
 passed(run(aliasedRoot(f.root)));const seal=JSON.parse(fs.readFileSync(f.seal));
 assert.deepEqual(Object.keys(seal).sort(),['build_driver','files','protocol','source_package']);
 assert.equal(seal.protocol,'soloco-packaged-native-recipe-v1');assert.equal(seal.files.length,169);
 const expected=f.rows.map(row=>{const bytes=fs.readFileSync(path.join(f.root,'native/codex',row.path));assert.deepEqual(fs.readFileSync(path.join(f.native,row.path)),bytes);assert.equal(fs.statSync(path.join(f.native,row.path)).mode&0o777,row.mode==='100755'?0o755:0o644);return {path:row.path,bytes:bytes.length,sha256:hash(bytes),mode:row.mode};});
 assert.deepEqual(seal.files,expected);
 for(const [key,name] of [['source_package','source-package.json'],['build_driver','tools/protected_native.py']]){const bytes=fs.readFileSync(path.join(f.native,name));assert.deepEqual(seal[key],{bytes:bytes.length,sha256:hash(bytes)});}
 assert.equal(seal.files.some(v=>v.path==='native-recipe-inventory.json'),false);
 const before=fs.readFileSync(f.seal);passed(run(fs.realpathSync(f.root),'--check'));assert.deepEqual(fs.readFileSync(f.seal),before);
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
