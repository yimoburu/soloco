// Exact public base301b producer, retained as DATA for historical compatibility
// tests. It never replaces current product source or mints an executor handle.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {after} from 'node:test';

let loaded;
export function legacyPeerModel301b(){
  if(!loaded){
    const bytes=fs.readFileSync(new URL('./fixtures/peer-model-301bb56.mjs.txt',import.meta.url));
    if(bytes.length!==124810||createHash('sha256').update(bytes).digest('hex')!=='52ed56f1e9fb0a90e01844db2707ee673213ebc55c8af6fec0bacff33d24548f')throw Error('Exact base301b legacy producer fixture changed');
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-legacy-peer-producer-'));
    after(()=>fs.rmSync(directory,{recursive:true,force:true}));
    fs.writeFileSync(path.join(directory,'model.mjs'),bytes,{flag:'wx'});
    // Preserve the producer's exact bytes and relative import names. Like the
    // independent counterexample, it runs with current trusted dependencies.
    for(const name of ['ledger.mjs','review-selection.mjs','peer-context-interpreter.mjs'])fs.symlinkSync(fileURLToPath(new URL('../plugins/soloco/runtime/peers/'+name,import.meta.url)),path.join(directory,name));
    loaded=import(pathToFileURL(path.join(directory,'model.mjs')).href);
  }
  return loaded;
}
