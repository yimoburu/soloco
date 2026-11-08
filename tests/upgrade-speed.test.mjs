import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {upgrade,rehearse} from '../plugins/soloco/runtime/upgrade.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,digest,id} from '../plugins/soloco/runtime/store.mjs';
import {contractModel} from './helpers/upgrade-incremental-model.mjs';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'upgrade-speed-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'cache');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const options={check:()=>({available:true,authenticated:true}),launch:()=>{}};
const read=a=>withStore(a.root,db=>db.read());
const edit=(a,fn)=>withStore(a.root,db=>db.transaction('fictional.speed.fixture',s=>{fn(s);return s;}));
function prepare({large=false,workflow='incremental-v2'}={}) {
  const root=fs.mkdtempSync(path.join(base,'company-')),a={root,session_id:id('fixture-founder'),epoch:1,expected_epoch:1};
  engine.bind(root,a.session_id,'codex');engine.open({...a,idea:'Fictional upgrade speed contract fixture'},'codex');
  edit(a,s=>{
    s.schema=1;s.plugin_version='0.1.0';delete s.runtime_version;delete s.team_sha256;delete s.cos_instructions;
    s.governance='Fictional preparation only: retain all founder limits and unresolved negative evidence.';s.governance_sha256=digest(s.governance);
    s.records.blocker={id:'blocker',kind:'review',content:'Historical Fail: external customer data must remain held; no retry authorization.'};
    if(large)s.records.history={id:'history',kind:'artifact',content:'A distinct fictional unresolved obligation remains binding. '.repeat(11000)};
  });
  withStore(root,db=>db.migrate());
  const inspected=upgrade({...a,action:'inspect'},'codex');
  const result=upgrade({...a,action:'prepare',workflow,candidate_hash:inspected.candidate_hash,source_instruction:'Authorize one fictional preparation-only upgrade rehearsal; preserve all negative evidence.'},'codex',options);
  return {...a,upgrade_id:result.upgrade.id,candidate_hash:inspected.candidate_hash,expected_epoch:result.owner.epoch};
}
function applyAndVerify(a) {
  upgrade({...a,action:'apply'},'codex');
  upgrade({...a,action:'verify',expected_epoch:read(a).owner.epoch},'codex');
  assert.equal(read(a).upgrade.status,'completed');
}

test('bounded one-page v2 completes reconstruction and independent acceptance in two calls',async()=>{
  const a=prepare(),seen=[];
  await rehearse(a.root,a.upgrade_id,contractModel({observe:task=>seen.push(task)}));
  const u=read(a).upgrade;assert.equal(u.status,'ready',u.error);assert.equal(u.evidence.pages.length,1);
  assert.equal(u.evidence.execution_mode,'combined-v1');
  assert.ok(u.steps.every(step=>step.phase==='synthesis'&&step.id.includes(u.evidence.pages[0].page_id)));
  assert.equal(u.calls.length,2);assert.deepEqual(seen.map(t=>[t.role,t.phase]),[['cos','synthesis'],['qa','synthesis']]);
  assert.equal(u.cos_pages.length,1);assert.equal(u.qa_pages.length,1);
  assert.notEqual(u.probe.native_id,u.review.native_id);
  assert.deepEqual(seen[1].proposed_handover,u.probe.artifact);
  assert.match(JSON.stringify(seen[0]),/external customer data must remain held/);
  assert.match(JSON.stringify(seen[1]),/external customer data must remain held/);
  applyAndVerify(a);
});

test('v2 exposes measured timing without accepting unknown semantic metadata',async()=>{
  const a=prepare();await rehearse(a.root,a.upgrade_id,contractModel());
  const u=read(a).upgrade;assert.equal(u.status,'ready',u.error);
  assert.equal(u.timings.worker_runs,1);
  for(const key of ['preparation_ms','evidence_ms','worker_wall_ms','last_run_wall_ms'])assert(Number.isFinite(u.timings[key])&&u.timings[key]>=0,key);
  assert(u.calls.every(call=>Number.isFinite(call.elapsed_ms)&&call.elapsed_ms>=0));
  const timing=upgrade({...a,action:'inspect'},'codex').upgrade.work.observed.timing;
  assert.equal(timing.model_calls_measured,2);assert.equal(timing.model_work_ms,u.calls.reduce((n,c)=>n+c.elapsed_ms,0));
  edit(a,s=>{s.upgrade.timings.unreviewed_obligation='Do not hide a new company restriction in measurement data';});
  const held=read(a);assert.throws(()=>upgrade({...a,action:'apply'},'codex'),/timing metadata/);assert.deepEqual(read(a),held);
});

test('one-page v2 retains independent negative verdict and never publishes ready',async()=>{
  const a=prepare();await rehearse(a.root,a.upgrade_id,contractModel({verdict:'Blocked'}));
  const u=read(a).upgrade;assert.equal(u.status,'failed');
  const qa=u.calls.find(c=>c.role==='qa'&&c.text);assert.ok(qa);assert.equal(JSON.parse(qa.text).review.verdict,'Blocked');
  assert.equal(u.calls.length,2);const held=read(a);
  assert.throws(()=>upgrade({...a,action:'apply'},'codex'));
  assert.deepEqual(read(a),held,'an apply attempt must not adopt or alter a held negative review');
});

test('combined v2 acceptance rejects author-native reuse and canonical proposal tampering',async()=>{
  const reused=prepare(),model=contractModel();
  await rehearse(reused.root,reused.upgrade_id,async(...args)=>{const output=await model(...args);return JSON.parse(args[2]).role==='qa'?{...output,native_id:'local-cos'}:output;});
  assert.equal(read(reused).upgrade.status,'failed');assert.match(read(reused).upgrade.error,/author session|independent|identity/i);
  const altered=prepare();await rehearse(altered.root,altered.upgrade_id,model);assert.equal(read(altered).upgrade.status,'ready');
  edit(altered,s=>{s.upgrade.probe.artifact.content+=' Different reconstructed condition';});
  assert.throws(()=>upgrade({...altered,action:'apply'},'codex'),/proof|proposal|artifact|changed/i);
});

test('multi-page v2 pipelines different roles while preserving per-role call order and exact final QA input',async()=>{
  const a=prepare({large:true}),active={cos:0,qa:0},max={cos:0,qa:0},starts=[],model=contractModel();let overlap=false;
  await rehearse(a.root,a.upgrade_id,async(...args)=>{
    const task=JSON.parse(args[2]),role=task.role;starts.push({role,phase:task.phase,page:task.page?.page_id});
    active[role]++;max[role]=Math.max(max[role],active[role]);overlap||=active.cos>0&&active.qa>0;
    try {await new Promise(resolve=>setTimeout(resolve,20));return await model(...args);}
    finally {active[role]--;}
  });
  const u=read(a).upgrade;assert.equal(u.status,'ready',u.error);assert.ok(u.evidence.pages.length>1);assert.equal(u.evidence.execution_mode,'pipelined-v1');
  assert.equal(overlap,true,'QA should process a completed CoS page while CoS processes another page');assert.deepEqual(max,{cos:1,qa:1});
  assert.ok(starts.findIndex(t=>t.role==='qa'&&t.phase==='page')<starts.findIndex(t=>t.role==='cos'&&t.phase==='synthesis'));
  for(const role of ['cos','qa'])assert.deepEqual(starts.filter(t=>t.role===role&&t.phase==='page').map(t=>t.page),u.evidence.pages.map(p=>p.page_id));
  assert.equal(u.calls.length,2*u.evidence.pages.length+2);
  assert.deepEqual(u.cos_pages.map(p=>p.page_id),u.qa_pages.map(p=>p.page_id));
  edit(a,s=>{s.upgrade.evidence.execution_mode='combined-v1';});
  assert.throws(()=>upgrade({...a,action:'apply'},'codex'),/mode|combined|execution/i);
  edit(a,s=>{s.upgrade.evidence.execution_mode='pipelined-v1';});
  applyAndVerify(a);
});

test('pipeline QA failure closes both role invocations and retains the negative before worker closure',async()=>{
  const a=prepare({large:true}),model=contractModel(),active=new Set();let qaFailed=false;
  await rehearse(a.root,a.upgrade_id,async(...args)=>{
    const task=JSON.parse(args[2]),key=task.role+':'+(task.page?.page_id??task.phase);active.add(key);
    try {
      await new Promise(resolve=>setTimeout(resolve,task.role==='cos'?30:5));
      const output=await model(...args);
      if(task.role==='qa'&&task.phase==='page'){
        qaFailed=true;const artifact=JSON.parse(output.text);artifact.review={verdict:'Fail',reason:'A material fictional restriction was not preserved',permitted_action:'hold',blockers:['Preserve the restriction']};return {...output,text:JSON.stringify(artifact)};
      }
      return output;
    } finally {active.delete(key);}
  });
  const u=read(a).upgrade;assert.equal(qaFailed,true);assert.equal(u.status,'failed');assert.equal(active.size,0,'worker may close only after both role invocations settle');
  assert.equal(u.worker.state,'closed');assert.ok(u.calls.some(c=>c.role==='qa'&&c.text&&JSON.parse(c.text).review?.verdict==='Fail'));
  assert.throws(()=>upgrade({...a,action:'resume',source_instruction:'Do not retry a semantic failure'},'codex',options),/nonfailed|failed|Only interrupted/i);
});

test('pipelined v2 resumes a completed page without duplicate calls or changing role identities',async()=>{
  const a=prepare({large:true});
  const child=spawnSync(process.execPath,['--no-warnings',fileURLToPath(new URL('./helpers/upgrade-interrupted-worker.mjs',import.meta.url)),a.root,a.upgrade_id,'page'],{env:process.env,encoding:'utf8',timeout:20000});
  assert.equal(child.status,0,child.stderr);
  const before=read(a).upgrade;assert.equal(before.cos_pages.length,1);assert.equal(before.steps.length,1);assert.equal(before.steps[0].state,'returned');
  upgrade({...a,action:'resume',source_instruction:'Continue the exact interrupted fictional attempt without retrying completed calls'},'codex',options);
  const seen=[];await rehearse(a.root,a.upgrade_id,contractModel({observe:t=>seen.push(t)}),read(a).upgrade.worker.token);
  const after=read(a).upgrade;assert.equal(after.status,'ready',after.error);
  assert.deepEqual(after.cos_pages[0],before.cos_pages[0]);assert.deepEqual(after.calls[0],before.calls[0]);
  assert.equal(seen.filter(t=>t.role==='cos'&&t.phase==='page'&&t.page.page_id===before.cos_pages[0].page_id).length,0);
  assert.equal(new Set(after.calls.map(c=>c.call_id)).size,after.calls.length);
  assert.equal(after.probe.native_id,before.calls[0].native_id);assert.equal(after.deadline_ms,before.deadline_ms);
  applyAndVerify(a);
});

test('combined v2 interrupted call-start remains ambiguous and cannot be resumed',()=>{
  const a=prepare();
  const child=spawnSync(process.execPath,['--no-warnings',fileURLToPath(new URL('./helpers/upgrade-interrupted-worker.mjs',import.meta.url)),a.root,a.upgrade_id,'call'],{env:process.env,encoding:'utf8',timeout:20000});
  assert.equal(child.status,0,child.stderr);
  const u=read(a).upgrade;assert.equal(u.steps.length,1);assert.equal(u.steps[0].state,'started');assert.equal(u.calls?.length??0,0);
  assert.throws(()=>upgrade({...a,action:'resume',source_instruction:'Inspect ambiguous call; never retry automatically'},'codex',options),/Ambiguous/i);
  assert.equal(read(a).upgrade.deadline_ms,u.deadline_ms);
});

test('combined v2 keeps consecutive retrieval proof and exact QA proposal binding',async()=>{
  const a=prepare(),model=contractModel(),seen=new Set();
  await rehearse(a.root,a.upgrade_id,async(...args)=>{
    const task=JSON.parse(args[2]);
    if(!seen.has(task.role)){seen.add(task.role);return {native_id:'local-'+task.role,text:JSON.stringify(task.response_contract.reads_only_shape)};}
    return model(...args);
  });
  const u=read(a).upgrade;assert.equal(u.status,'ready',u.error);assert.equal(u.calls.length,4);
  assert.ok(u.probe.call_id.endsWith(':1'));assert.ok(u.review.call_id.endsWith(':1'));
  const qa=u.steps.filter(step=>step.role==='qa');
  assert.equal(qa.length,2);assert.ok(qa.every(step=>step.proposed_handover_sha256===digest(JSON.stringify(u.probe.artifact))));
  edit(a,s=>{
    const call=s.upgrade.calls.find(c=>c.call_id===qa[0].id);call.text=call.text.replace('"reads":','"wrong":');
    s.upgrade.steps.find(step=>step.id===call.call_id).output_sha256=digest(call.text);
  });
  assert.throws(()=>upgrade({...a,action:'apply'},'codex'),/retrieval|step/i);
});
