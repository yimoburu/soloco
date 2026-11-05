import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,digest} from '../plugins/soloco/runtime/store.mjs';
import {backupCompany,restoreCompany} from '../plugins/soloco/runtime/storage-transfer.mjs';

const tmp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'transfer-integrity-')));
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
let sequence=0;
function fixture(){
  const directory=path.join(tmp,String(++sequence));fs.mkdirSync(directory);
  const root=path.join(directory,'project');fs.mkdirSync(root);
  const args={root,session_id:'fictional-transfer-owner-'+sequence,epoch:1};
  process.env.COMPANY_PLUGIN_DATA=path.join(directory,'binding-cache');
  engine.bind(root,args.session_id,'codex');
  engine.open({...args,idea:'Disposable fictional restore integrity fixture'},'codex');
  engine.control({...args,action:'pause',expected_epoch:1,source_instruction:'Pause this disposable fixture for backup and restore'},'codex');
  fs.writeFileSync(path.join(root,'.company','artifact.txt'),'original');
  const backup=path.join(directory,'backup');
  const manifest=withStore(root,db=>backupCompany(db,backup));
  return {args,backup,manifest,destination:path.join(directory,'restored')};
}
function duringCopy(inject,fn){
  const copy=fs.copyFileSync;
  try{fs.copyFileSync=(source,destination,...options)=>inject(copy,source,destination,options);return fn();}
  finally{fs.copyFileSync=copy;}
}
test('restore verifies every copied artifact and preserves exact logical database state',()=>{
  const f=fixture(),result=restoreCompany(f.backup,f.destination);
  assert.equal(result.restored,true);assert.equal(result.ownership_transferred,false);
  for(const entry of f.manifest.files){const bytes=fs.readFileSync(path.join(f.destination,entry.path));assert.equal(bytes.length,entry.bytes);assert.equal(digest(bytes),entry.sha256);}
  assert.equal(withStore(f.destination,db=>digest(JSON.stringify(db.read()))),f.manifest.state_sha256);
});
test('public restore refuses an artifact changed after source validation even when database readback would match',()=>{
  const f=fixture(),artifact=path.join(f.backup,'.company','artifact.txt');
  assert.throws(()=>duringCopy((copy,source,destination,options)=>{
    if(source===artifact)fs.writeFileSync(source,'tampered');
    return copy(source,destination,...options);
  },()=>engine.storageControl({...f.args,action:'restore',backup_dir:f.backup,directory:f.destination,source_instruction:'Restore the exact disposable fixture backup'},'codex')),/Restored file inventory differs/);
  // A DB-only success check misses this failure: the DB is still exact, while
  // the copied artifact changed. Keep the partial destination inspectable.
  assert.equal(withStore(f.destination,db=>digest(JSON.stringify(db.read()))),f.manifest.state_sha256);
  assert.equal(fs.readFileSync(path.join(f.destination,'.company','artifact.txt'),'utf8'),'tampered');
});
test('restore refuses unexpected destination files appearing during copying',()=>{
  const f=fixture(),last=path.join(f.backup,f.manifest.files.at(-1).path);
  assert.throws(()=>duringCopy((copy,source,destination,options)=>{
    const result=copy(source,destination,...options);
    if(source===last)fs.writeFileSync(path.join(f.destination,'unexpected.txt'),'not in the manifest');
    return result;
  },()=>restoreCompany(f.backup,f.destination)),/Restored file inventory differs/);
  assert.equal(fs.readFileSync(path.join(f.destination,'unexpected.txt'),'utf8'),'not in the manifest');
});
