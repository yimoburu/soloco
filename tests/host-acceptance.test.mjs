import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runAsyncRuntimeAcceptance} from '../tools/async-runtime-acceptance.mjs';
import {withStore} from '../plugins/soloco/runtime/store.mjs';

for(const host of ['codex','claude'])test(`${host} native acceptance preparation selects the same pipeline without launching models`,async()=>{
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-host-acceptance-'));
  try {
    const receipt=await runAsyncRuntimeAcceptance({directory:path.join(parent,'evidence'),host});
    assert.equal(receipt.status,'prepared',JSON.stringify(receipt.error));
    assert.equal(receipt.host,host);assert.equal(receipt.native_execution_authorized,false);
    assert.equal(receipt.checks.prepared_without_native_jobs,true);
    const state=withStore(receipt.fixture_root,db=>db.read());
    assert.equal(state.owner.host,host);assert.equal(Object.keys(state.jobs).length,0);
    const tasks=Object.values(state.records).filter(r=>r.runtime_task);
    assert.equal(tasks.length,3);
    for(const task of tasks) {
      const selection=task.runtime_task.spec.model_selection;
      assert.equal(selection.model,host==='claude'?'sonnet':'gpt-6.1-sol');
      if(host==='claude')assert.equal(selection.effort,undefined);
      else assert.ok(['low','medium'].includes(selection.effort));
    }
  } finally {fs.rmSync(parent,{recursive:true,force:true});}
});
