// Complete original PUBLIC source leaves; no job-code association, permission
// or historical-policy qualification. Never imported by production runtime.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

export const LEGACY_WORKER_RECIPE_SOURCE=Object.freeze({
  commit:'91e5609fe881ef1cd2b46bdcba0400c21bf0db07',
  engine_sha256:'f3cc2d3e6b217cb786d02658fa55341402dcac36e07c3a7bc203303f24364bcd',
  closure_sha256:'6572e0bf415988edba857dead658e17ab2e0c2ce55a4a8f57acda317ea58e72a'
});
const runtime=fileURLToPath(new URL('../plugins/soloco/runtime/',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=value=>{if(!value)throw Error('Fixed original worker SOURCE fixture changed');};
export function installLegacyWorkerRecipeSourceFixture(runtimeCopy){
  const archive=JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-worker-recipe-91e5609.json',import.meta.url),'utf8'));
  need(archive.protocol==='legacy-worker-fixed-source-fixture-v1'&&archive.source_commit===LEGACY_WORKER_RECIPE_SOURCE.commit&&archive.source_repository==='https://github.com/yimoburu/soloco'&&archive.historical_policy_association==='UNPROVED'&&archive.authority_issued===false&&Array.isArray(archive.files)&&archive.files.length===2);
  const expected=[['engine.mjs',75952,LEGACY_WORKER_RECIPE_SOURCE.engine_sha256],['model-process-closure.mjs',10126,LEGACY_WORKER_RECIPE_SOURCE.closure_sha256]];
  const originals=expected.map(([name,bytes,sha256],i)=>{
    const leaf=archive.files[i];need(leaf.path===name&&leaf.bytes===bytes&&leaf.sha256===sha256&&leaf.encoding==='gzip-base64'&&typeof leaf.content==='string');
    const compressed=Buffer.from(leaf.content,'base64');need(compressed.toString('base64')===leaf.content);
    const content=gunzipSync(compressed,{maxOutputLength:bytes});need(content.length===bytes&&hash(content)===sha256);return {name,content};
  });
  // Exactly these two complete leaves change in an otherwise current disposable
  // runtime. In particular, observer, ledger, storage and class identity stay
  // together; the production recipe/pins and current engine are untouched.
  for(const {name,content}of originals)fs.writeFileSync(path.join(runtimeCopy,name),content);
}
export function createLegacyWorkerRecipeRuntimeFixture(){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-SOURCE-legacy-worker-recipe-'))),runtimeCopy=path.join(root,'runtime');
  try{fs.cpSync(runtime,runtimeCopy,{recursive:true});installLegacyWorkerRecipeSourceFixture(runtimeCopy);}
  catch(error){fs.rmSync(root,{recursive:true,force:true});throw error;}
  return {runtimeCopy,load:relative=>import(pathToFileURL(path.join(runtimeCopy,relative)).href),dispose:()=>fs.rmSync(root,{recursive:true,force:true})};
}
