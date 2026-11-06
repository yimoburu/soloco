// Standalone passing regression for exact NUL/lone-surrogate storage identity.
// The original failing fixture/log remain in the integration handoff evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../../plugins/soloco/runtime/engine.mjs';
import { withStore } from '../../plugins/soloco/runtime/store.mjs';
const base=fs.mkdtempSync(path.join(os.tmpdir(),'fictional-normalized-key-'));
const previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(base,'data');
const defects=[];
try {
 for(const [index,key] of ['nul\u0000suffix','surrogate\ud800suffix'].entries()) {
  const root=path.join(base,String(index));fs.mkdirSync(root);
  const args={root,session_id:'fictional-founder'};engine.bind(root,args.session_id,'codex');engine.open({...args,idea:'Fictional storage identity fixture'},'codex');
  withStore(root,db=>db.migrate());
  withStore(root,db=>db.transaction('fictional malformed identity',s=>{s.records[key]={id:key,revision:1,content:'Exact fictional value'};return s;}));
  const stored=withStore(root,db=>db.read()).records;
  if(!Object.hasOwn(stored,key))defects.push({requested:key,returned_keys:Object.keys(stored),value_id:Object.values(stored)[0]?.id});
 }
 console.log(JSON.stringify({storage_identity_defects:defects}));
 assert.deepEqual(defects,[],'Normalized storage changed exact collection keys; JSON value bodies still retain their original identity. This is separate from public shape migration.');
} finally {
 if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;
 fs.rmSync(base,{recursive:true,force:true});
}
