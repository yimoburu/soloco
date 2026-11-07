import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseOutput,runModel} from '../plugins/soloco/runtime/adapters.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';

const negative=JSON.stringify({content:'Fictional unresolved condition.',messages:[],notices:[],review:{verdict:'Blocked',reason:'Evidence is incomplete.'}});
const result=(extra={})=>({type:'result',subtype:'success',session_id:'fictional-native',result:negative,...extra});
function adapter(value,{code=0,limit}={}) {
  return (host,native,prompt,cwd,timeout,selection,options={})=>runModel(host,native,prompt,cwd,timeout,selection,{
    ...options,...(limit?{maxOutputCharacters:limit}:{}),resolveExecutable:()=>'/fictional/claude',spawn:()=>{
      const child=new EventEmitter();child.stdin=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
      child.kill=()=>{queueMicrotask(()=>child.emit('close',null));return true;};
      child.stdin.end=()=>queueMicrotask(()=>{child.emit('spawn');child.stdout.emit('data',JSON.stringify(value));child.emit('close',code);});
      return child;
    }
  });
}
const invoke=(value,options,native=null)=>adapter(value,options)('claude',native,'Fictional supplied evidence only','/tmp',180000);
test('Claude success requires a native identity and a nonempty text artifact',async()=>{
  for(const value of [null,[],42,result({session_id:undefined}),result({session_id:' '}),result({result:''}),result({result:{}})])
    assert.throws(()=>parseOutput('claude',JSON.stringify(value)),/Claude/);
  assert.equal((await invoke(result())).text,negative);
  assert.equal((await invoke(result(),{},'fictional-native')).native_id,'fictional-native');
});
for(const [name,value,options] of [
  ['provider error',result({is_error:true}),{}],
  ['incomplete turn',result({subtype:'error_max_turns'}),{}],
  ['nonzero process exit',result(),{code:7}],
  ['output overflow',result({result:negative+' '.repeat(120000)}),{limit:100000}],
])test(`Claude preserves returned evidence on ${name}`,async()=>{
  await assert.rejects(invoke(value,options),error=>{
    assert.equal(error.termination_confirmed,true);
    assert.equal(error.rejected_output.text,value.result);
    assert.equal(error.rejected_output.native_id,value.session_id);
    return true;
  });
});
test('Claude resume rejects an unexpected native identity while retaining evidence',async()=>{
  await assert.rejects(invoke(result(),{},'previous-native'),error=>{
    assert.match(error.message,/Claude resumed session identity changed/);
    assert.equal(error.rejected_output.text,negative);return true;
  });
});
test('failed Claude qualification worker retains its rejected review without accepting it or resuming its native',async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-claude-terminal-'));
  const previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(base,'data');
  try {
    const root=path.join(base,'company');fs.mkdirSync(root);
    const a={root,session_id:'fictional-founder',epoch:1,source_instruction:'Review this fictional fixture only; no external authority.'};engine.bind(root,a.session_id,'claude');engine.open({...a,idea:'Fictional parity fixture'},'claude');
    withStore(root,db=>db.migrate());
    const subject=engine.save({...a,kind:'artifact',content:'Fictional proposal needing independent review.'},'claude');
    const plan=engine.contextControl({...a,action:'plan',protocol:'scoped-context-v1',source_id:subject.id},'claude');
    const target=engine.contextControl({...a,action:'target',plan_id:plan.id,phase:'extract',unit_id:plan.units[0].id},'claude');
    const job=engine.dispatch({...a,role:'qa',review_of:target.id,task:'Review this fictional proposal only.'},'claude',{check:()=>({available:true,authenticated:true}),launch:()=>({on(){},unref(){}})});
    await work(root,job.id,adapter(result(),{code:7}));
    const state=withStore(root,db=>db.read()),stored=state.jobs[job.id];
    assert.equal(stored.status,'failed');assert.equal(stored.artifact_id,undefined);
    assert.ok(stored.rejected_output,stored.error);
    assert.equal(stored.rejected_output.text,negative);
    assert.equal(stored.rejected_output.author_instance,job.instance_id);
    assert.equal(stored.rejected_output.context_sha256,job.context_sha256);
    assert.equal(stored.coordination_release.termination_confirmed,true);
    assert.equal(state.sessions[job.session_key].native_id,null);
  } finally {
    if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;
    fs.rmSync(base,{recursive:true,force:true});
  }
});
