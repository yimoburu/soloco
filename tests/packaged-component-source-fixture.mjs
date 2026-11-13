// SOURCE-only, never a native/component-positive fixture. Importing this helper
// defines functions only. Tests copy exact source into a fictional package and
// expose private journal functions ONLY in that copied test namespace.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const REPO=fileURLToPath(new URL('../',import.meta.url));
const LAYOUT='runtime/peers/context-component-layout.mjs';
const BUILDER='runtime/peers/context-build-component.mjs';
const DATA='runtime/peers/context-build-data.mjs';
const bytes=name=>fs.readFileSync(path.join(REPO,'plugins/soloco',name));
const selector="process.env.CODEX_HOME??path.join(os.homedir(),'.codex')";
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function sourceInputs(owner,label='one'){
 const p=label=>({bytes:100,sha256:hash(label)});
 return {protocol:'soloco-context-build-input-data-v1',owner_epoch:owner,native:{source_package:p('package'),compiled_manifest:p('native'),cargo_lock:p('lock'),toolchain_manifest:p('toolchain'),build_driver:p('driver')},node:{manifest:p('node-'+label),executable:p('node-executable'),codec:p('codec'),resource:p('resource'),profile:p('profile')},selection:p('selection')};
}
function put(root,name,body,mode=0o644){const f=path.join(root,name);fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o700});fs.writeFileSync(f,body,{mode});fs.chmodSync(f,mode);return f;}
export async function packagedSourceFixture(t){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'soloco-packaged-source-'));
 t.after(()=>{const unlock=p=>{if(fs.lstatSync(p).isDirectory()){fs.chmodSync(p,0o700);for(const n of fs.readdirSync(p))unlock(path.join(p,n));}};unlock(root);fs.rmSync(root,{recursive:true,force:true});});
 const home=path.join(root,'fictional-home'),managed=path.join(home,'plugins/data/soloco'),packageRoot=path.join(root,'repo/plugins/soloco');fs.mkdirSync(managed,{recursive:true,mode:0o700});fs.chmodSync(managed,0o755);
 put(packageRoot,'runtime/plugin-data.mjs',`export function dataDir(){return ${JSON.stringify(managed)};}\n`);
 const original=bytes(LAYOUT).toString(),literal=JSON.stringify(home);assert.equal(original.split(selector).length,4,'reviewed fixed home selector count');const mapped=original.replaceAll(selector,literal);assert.equal(mapped.replaceAll(literal,selector),original,'only fictional home literal mapping');
 const layoutFile=put(packageRoot,LAYOUT,mapped);
 put(packageRoot,DATA,bytes(DATA));
 put(packageRoot,'producer/build-peer-context.mjs',bytes('producer/build-peer-context.mjs'));
 put(path.join(root,'repo'),'tools/build-peer-context.mjs','// SOURCE fixture developer entry bytes, never invoked.\n');
 const builderOriginal=bytes(BUILDER).toString(),returnLine=' return Object.freeze({lookupOriginalSelectedContextComponentData,inspectOriginalSelectedContextComponentData,inspectOriginalContextComponent,buildOriginalContextComponent,verifyReceipt,successfulReceipt,treeRows});';
 assert.equal(builderOriginal.split(returnLine).length,2);
 const replacement=returnLine.replace('treeRows});','treeRows,__journal:Object.freeze({withJournal,prepareIntent,advance,readState,fixedIssuer})});');
 const builderCopy=builderOriginal.replace(returnLine,replacement)+'\nexport function sourceJournalForTest(){return pkg().__journal;}\n';assert.equal(builderCopy.replace(replacement,returnLine).slice(0,builderOriginal.length),builderOriginal);
 const builderFile=put(packageRoot,BUILDER,builderCopy),layout=await import(pathToFileURL(layoutFile).href),builder=await import(pathToFileURL(builderFile).href);
 return {root,home,managed,packageRoot,workspace:path.join(managed,'peer-context-component/v1'),layout,layoutFile,builder,builderFile,journal:()=>builder.sourceJournalForTest(),put:(n,b,m)=>put(packageRoot,n,b,m)};
}
export function coldSource(f,body){
 const code=`import {pathToFileURL} from 'node:url';const module=await import(pathToFileURL(${JSON.stringify(f.builderFile)}).href);const layout=await import(pathToFileURL(${JSON.stringify(f.layoutFile)}).href);const journal=module.sourceJournalForTest();${body}`;
 const r=spawnSync(process.execPath,['--no-warnings','--input-type=module','-e',code],{encoding:'utf8',timeout:10000,maxBuffer:65536});assert.ifError(r.error);assert.equal(r.status,0,r.stderr);assert.equal(r.signal,null);return JSON.parse(r.stdout);
}
