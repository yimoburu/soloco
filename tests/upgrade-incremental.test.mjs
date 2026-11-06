import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {upgrade,rehearse} from '../plugins/soloco/runtime/upgrade.mjs';
import {withStore,digest,id} from '../plugins/soloco/runtime/store.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {toolList,call} from '../plugins/soloco/runtime/main.mjs';
import {contractModel} from './helpers/upgrade-incremental-model.mjs';
const base=fs.mkdtempSync(path.join(os.tmpdir(),'upgrade-incremental-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'cache');
test.after(()=>fs.rmSync(base,{force:true,recursive:true}));
const opts={check:()=>({available:true,authenticated:true}),launch:()=>{}};
const read=a=>withStore(a.root,db=>db.read());
const edit=(a,fn)=>withStore(a.root,db=>db.transaction('fixture',s=>{fn(s);return s;}));
function prepare({large=false,legacy=false}={}) {
  const root=fs.mkdtempSync(path.join(base,'company-')),a={root,session_id:id('founder'),epoch:1,expected_epoch:1};
  engine.bind(root,a.session_id,'codex');engine.open({...a,idea:'Fictional source-only continuity fixture'},'codex');
  edit(a,s=>{
    s.schema=1;s.plugin_version='0.1.0';delete s.runtime_version;delete s.team_sha256;delete s.cos_instructions;
    s.governance='Preparation only; retain founder limits and all failed reviews.';s.governance_sha256=digest(s.governance);
    s.records.negative={id:'negative',kind:'review',content:'Fail: customer data remains held. This historical negative cannot be erased.'};
    if(large)s.records.synthetic={id:'synthetic',content:'Fictional distinct unknown semantic obligation. '.repeat(11000)};
  });
  withStore(root,db=>db.migrate());
  const inspection=upgrade({...a,action:'inspect'},'codex');
  const p=upgrade({...a,action:'prepare',candidate_hash:inspection.candidate_hash,source_instruction:'Upgrade this fictional company using bounded incremental continuity',...(!legacy?{workflow:'incremental-v1'}:{})},'codex',opts);
  return {...a,upgrade_id:p.upgrade.id,candidate_hash:inspection.candidate_hash,expected_epoch:p.owner.epoch};
}
const resume=a=>upgrade({...a,action:'resume',source_instruction:'Continue this exact interrupted upgrade under its original limits'},'codex',opts);
function interrupt(a,mode='page') {
  const child=spawnSync(process.execPath,['--no-warnings',fileURLToPath(new URL('./helpers/upgrade-interrupted-worker.mjs',import.meta.url)),a.root,a.upgrade_id,mode],{env:process.env,encoding:'utf8',timeout:20000});
  assert.equal(child.status,0,child.stderr);
  return read(a).upgrade;
}
async function continueWorker(a,model=contractModel()) {
  const token=read(a).upgrade.worker?.token;
  await rehearse(a.root,a.upgrade_id,model,token);
}
test('public schema exposes prospective workflow and explicit resume without changing legacy default',async()=>{
  const schema=toolList.find(t=>t.name==='company_upgrade').inputSchema;
  assert.ok(schema.properties.action.enum.includes('resume'));
  assert.deepEqual(schema.properties.workflow.enum,['incremental-v1']);
  const a=prepare({legacy:true});assert.equal(read(a).upgrade.workflow,undefined);
  assert.throws(()=>resume(a),/workflow/);
  await assert.rejects(call('company_upgrade',{root:a.root,session_id:a.session_id,action:'inspect',workflow:'incremental-v1'},'codex'),/prepare-only/);
});
test('many-page prepare inspect rehearse apply verify reduces calls and repeated input while final QA sees complete proposal, findings, negatives and coverage',async()=>{
  const totals=[];
  for(const legacy of [true,false]) {
    const a=prepare({large:true,legacy}),seen=[];
    await rehearse(a.root,a.upgrade_id,contractModel({observe:(t,p)=>seen.push({t,p})}));
    const u=read(a).upgrade;assert.equal(u.status,'ready',u.error);
    assert.ok(u.evidence.pages.length>=4);
    if(!legacy) {
      const pageTasks=seen.filter(x=>x.t.role==='qa'&&x.t.phase==='page');
      assert.ok(pageTasks.every(x=>x.t.cos_findings&&!Object.hasOwn(x.t,'proposed_handover')));
      assert.ok(pageTasks.map(x=>x.t.page.text).join('').includes('historical negative cannot be erased'));
      const final=seen.find(x=>x.t.role==='qa'&&x.t.phase==='synthesis').t;
      assert.deepEqual(final.proposed_handover,u.probe.artifact);
      assert.deepEqual(final.required_findings,{cos:u.cos_pages,qa:u.qa_pages});
      assert.equal(final.coverage.pages.length,u.evidence.pages.length);
      assert.equal(u.calls.length,2*u.evidence.pages.length+2);
      assert.equal(u.replays.length,0);
      const work=upgrade({...a,action:'inspect'},'codex').upgrade.work;
      assert.deepEqual(work.remaining,{cos_pages:0,qa_pages:0,cos_final:0,qa_final:0});
      assert.equal(work.observed.input_characters,seen.reduce((n,x)=>n+x.p.length,0));
      assert.equal(work.acceptance,false);assert.equal(work.context_fit_verified,false);
    }
    totals.push({calls:seen.length,input:seen.reduce((n,x)=>n+x.p.length,0)});
    upgrade({...a,action:'apply'},'codex');
    upgrade({...a,action:'verify',expected_epoch:read(a).owner.epoch},'codex');
    assert.equal(read(a).upgrade.status,'completed');
  }
  assert.equal(totals[0].calls-totals[1].calls,2);
  assert.ok(totals[1].input<totals[0].input,JSON.stringify(totals));
  console.log('Synthetic many-page measured traffic:',JSON.stringify(totals));
});
test('process loss after accepted page resumes without regenerating it, keeps native identities and immutable allowances',async()=>{
  const a=prepare({large:true}),before=interrupt(a),first=before.cos_pages[0],seen=[];
  assert.equal(before.cos_pages.length,1);assert.equal(before.steps[0].state,'returned');
  const r=resume(a);assert.equal(r.upgrade.status,'queued');
  assert.throws(()=>resume(a),/running or unknown/);
  await continueWorker(a,contractModel({observe:t=>seen.push(t)}));
  const after=read(a).upgrade;assert.equal(after.status,'ready',after.error);
  assert.deepEqual(after.cos_pages[0],first);
  assert.equal(seen.filter(t=>t.role==='cos'&&t.page?.page_id===first.page_id).length,0);
  assert.equal(after.calls.filter(c=>c.call_id===first.call_id).length,1);
  assert.equal(after.deadline_ms,before.deadline_ms);assert.equal(after.call_timeout_minutes,before.call_timeout_minutes);
  assert.equal(after.probe_instance,before.probe_instance);
  assert.notEqual(after.probe.native_id,after.review.native_id);
  upgrade({...a,action:'apply'},'codex');upgrade({...a,action:'verify',expected_epoch:read(a).owner.epoch},'codex');
});
test('lost call start remains ambiguous and cannot retry or reset its allowance',()=>{
  const a=prepare(),u=interrupt(a,'call');
  assert.equal(u.steps[0].state,'started');assert.equal(u.calls?.length??0,0);
  assert.throws(()=>resume(a),/Ambiguous interrupted call/);
  const work=upgrade({...a,action:'inspect'},'codex').upgrade.work;
  assert.match(work.blocked_reason,/Ambiguous/);assert.equal(work.observed.started_calls,1);
});
test('concurrent worker and resume cannot enter a running native call',async()=>{
  const a=prepare();let enter,release;
  const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r),model=contractModel();
  let first=true;
  const running=rehearse(a.root,a.upgrade_id,async(...args)=>{if(first){first=false;enter();await gate;}return model(...args);});
  await entered;
  const before=read(a).upgrade;
  assert.throws(()=>resume(a),/running or unknown/);
  await rehearse(a.root,a.upgrade_id,()=>{throw Error('Duplicate worker called');});
  assert.equal(read(a).upgrade.status,'checking');assert.deepEqual(read(a).upgrade.worker,before.worker);
  release();await running;assert.equal(read(a).upgrade.status,'ready',read(a).upgrade.error);
});
test('expired deadline, owner, candidate, checkpoint, history and rules changes hold continuation',()=>{
  for(const kind of ['deadline','owner','candidate','checkpoint','history','rules','protocol']) {
    const a=prepare(),u=interrupt(a);
    if(kind==='deadline') {
      const now=Date.now;Date.now=()=>u.deadline_ms+1;
      try{assert.throws(()=>resume(a),/deadline/);}finally{Date.now=now;}
    } else {
      edit(a,s=>{
        if(kind==='owner')s.owner.epoch++;
        if(kind==='candidate')s.upgrade.candidate.cos_instructions+='stale';
        if(kind==='checkpoint')s.records.extra={id:'extra',content:'New fact'};
        if(kind==='history')(s.upgrade_history??=[]).push({id:'new-history',status:'failed'});
        if(kind==='rules'){s.upgrade.workflow_rules_sha256='changed';s.upgrade.evidence.workflow_rules_sha256='changed';}
        if(kind==='protocol')s.upgrade.workflow='future';
      });
      assert.throws(()=>resume(a),/owner|changed|protocol|rules|epoch/);
    }
    assert.equal(read(a).upgrade.deadline_ms,u.deadline_ms);
  }
});
test('missing or tampered canonical output, delivery, accepted artifact or native proof rejects reuse and apply',async()=>{
  for(const field of ['output','delivery','artifact','native','missing-native','input']) {
    const a=prepare();interrupt(a);
    edit(a,s=>{
      if(field==='output')s.upgrade.calls[0].text+=' ';
      if(field==='delivery')s.upgrade.deliveries.pop();
      if(field==='artifact')s.upgrade.cos_pages[0].artifact.content='Forged later Pass';
      if(field==='native')s.upgrade.steps[0].native_id='forged';
      if(field==='missing-native')delete s.upgrade.calls[0].native_id;
      if(field==='input'){s.upgrade.steps[0].input_sha256='wrong';s.upgrade.calls[0].input_sha256='wrong';}
    });
    if(field==='input'){resume(a);await continueWorker(a);assert.match(read(a).upgrade.error,/exact input/);}
    else assert.throws(()=>resume(a),/proof|receipt|artifact|tampered/i);
  }
  const a=prepare();await rehearse(a.root,a.upgrade_id,contractModel());
  edit(a,s=>s.upgrade.deliveries.pop());assert.throws(()=>upgrade({...a,action:'apply'},'codex'),/receipt|proof/);
});
test('a canonical CoS page cannot replace the final probe at apply',async()=>{
  const a=prepare();await rehearse(a.root,a.upgrade_id,contractModel());
  const before=read(a).upgrade;assert.equal(before.status,'ready',before.error);
  edit(a,s=>s.upgrade.probe=s.upgrade.cos_pages[0]);
  const after=read(a).upgrade;
  for(const field of ['calls','deliveries','final_packets'])assert.deepEqual(after[field],before[field]);
  assert.throws(()=>upgrade({...a,action:'apply'},'codex'),/expected.*step/i);
  assert.equal(read(a).upgrade.status,'ready');
});
test('a canonical QA page cannot replace final QA during receipt reuse or apply',async()=>{
  const a=prepare();await rehearse(a.root,a.upgrade_id,contractModel());
  assert.equal(read(a).upgrade.status,'ready');
  edit(a,s=>s.upgrade.review=s.upgrade.qa_pages[0]);
  assert.throws(()=>upgrade({...a,action:'apply'},'codex'),/apply_preparation_team/);
  // Resume checks receipt provenance before final permission validation.
  edit(a,s=>s.upgrade.status='checking');
  assert.throws(()=>resume(a),/expected.*step/i);
});
test('page identities cannot be relabeled around canonical findings from another page',async()=>{
  for(const role of ['cos','qa']) {
    const a=prepare({large:true});await rehearse(a.root,a.upgrade_id,contractModel());
    const before=read(a).upgrade;assert.equal(before.status,'ready',before.error);
    assert.ok(before.evidence.pages.length>1);
    edit(a,s=>{
      const findings=s.upgrade[`${role}_pages`],[first,second]=findings;
      findings[0]={...second,page_id:first.page_id,range_sha256:first.range_sha256};
      findings[1]={...first,page_id:second.page_id,range_sha256:second.range_sha256};
    });
    const after=read(a).upgrade;
    for(const field of ['calls','deliveries','final_packets'])assert.deepEqual(after[field],before[field]);
    assert.throws(()=>upgrade({...a,action:'apply'},'codex'),/expected.*step/i);
  }
});
test('final QA remains bound to its exact proposal even if the CoS output proof is rewritten consistently',async()=>{
  const a=prepare();await rehearse(a.root,a.upgrade_id,contractModel());
  const before=read(a).upgrade;assert.equal(before.status,'ready',before.error);
  edit(a,s=>{
    const u=s.upgrade,probe=u.probe;
    probe.artifact.content='Changed'+probe.artifact.content.slice(7);
    const call=u.calls.find(c=>c.call_id===probe.call_id),step=u.steps.find(c=>c.id===probe.call_id);
    call.text=JSON.stringify(probe.artifact);step.output_sha256=digest(call.text);
    // Same-length rewrite preserves traffic accounting; QA's exact input stays fixed.
    assert.equal(call.text.length,call.response_characters);
  });
  const after=read(a).upgrade;
  assert.deepEqual(after.calls.filter(c=>c.role==='qa'),before.calls.filter(c=>c.role==='qa'));
  assert.deepEqual(after.final_packets,before.final_packets);
  assert.throws(()=>upgrade({...a,action:'apply'},'codex'),/proposal/i);
});
test('accepted page and synthesis receipts cannot skip their initial round',async()=>{
  for(const target of ['cos_pages','qa_pages','probe','review']) {
    const a=prepare();await rehearse(a.root,a.upgrade_id,contractModel());
    assert.equal(read(a).upgrade.status,'ready');
    edit(a,s=>{
      const u=s.upgrade,result=Array.isArray(u[target])?u[target][0]:u[target];
      const old=result.call_id,next=old.replace(/:0$/,':1');assert.notEqual(old,next);
      result.call_id=next;
      u.calls.find(c=>c.call_id===old).call_id=next;
      const step=u.steps.find(c=>c.id===old);step.id=next;
      for(const delivery of u.deliveries.filter(d=>d.call_id===old))delivery.call_id=next;
      step.deliveries_sha256=digest(JSON.stringify(u.deliveries.filter(d=>d.call_id===next)));
    });
    assert.throws(()=>upgrade({...a,action:'apply'},'codex'),/expected.*step/i);
  }
});
test('page and final synthesis receipts require consecutive reads-only retrieval rounds for each role',async()=>{
  const a=prepare(),model=contractModel(),rounds=new Map();
  await rehearse(a.root,a.upgrade_id,async(...args)=>{
    const task=JSON.parse(args[2]),phase=task.resume_phase??task.phase;
    const key=`${task.role}:${phase}:${task.page?.page_id??task.task?.page?.page_id??'final'}`;
    const round=rounds.get(key)??0;rounds.set(key,round+1);
    if(round<2) return {native_id:`local-${task.role}`,text:JSON.stringify(task.response_contract.reads_only_shape)};
    return model(...args);
  });
  const u=read(a).upgrade;assert.equal(u.status,'ready',u.error);
  for(const result of [...u.cos_pages,...u.qa_pages,u.probe,u.review])assert.ok(result.call_id.endsWith(':2'));
  for(const result of [u.cos_pages[0],u.qa_pages[0],u.probe,u.review]) {
    const first=result.call_id.replace(/:2$/,':0'),original=u.calls.find(c=>c.call_id===first).text;
    edit(a,s=>{
      const call=s.upgrade.calls.find(c=>c.call_id===first);
      call.text=call.text.replace('"reads":','"wrong":');assert.notEqual(call.text,original);
      s.upgrade.steps.find(c=>c.id===first).output_sha256=digest(call.text);
    });
    assert.throws(()=>upgrade({...a,action:'apply'},'codex'),/expected retrieval step/i);
    edit(a,s=>{
      s.upgrade.calls.find(c=>c.call_id===first).text=original;
      s.upgrade.steps.find(c=>c.id===first).output_sha256=digest(original);
    });
  }
  upgrade({...a,action:'apply'},'codex');
  upgrade({...a,action:'verify',expected_epoch:read(a).owner.epoch},'codex');
  assert.equal(read(a).upgrade.status,'completed');
});
test('negative, malformed and late output stays held; recovery keeps facts and prior failed evidence',async()=>{
  for(const kind of ['negative','malformed']) {
    const a=prepare(),model=contractModel({verdict:kind==='negative'?'Blocked':'Pass'});
    await rehearse(a.root,a.upgrade_id,async(...args)=>kind==='malformed'?{native_id:'local-cos',text:'{malformed'}:model(...args));
    const before=read(a).upgrade;assert.equal(before.status,'failed');assert.ok(before.calls.length);
    if(kind==='negative')assert.equal(before.qa_pages[0].artifact.review.verdict,'Blocked');
    assert.throws(()=>resume(a),/nonfailed/);
    edit(a,s=>s.records.newFact={id:'newFact',content:'Retain me through recovery'});
    upgrade({...a,action:'recover',source_instruction:'Recover definitions while retaining all evidence'},'codex');
    assert.deepEqual(read(a).upgrade.calls,before.calls);assert.ok(read(a).records.newFact);
  }
});
test('eligibility loss aborts outstanding injected local call promptly and retains its late output',async()=>{
  const a=prepare();let signaled=false;
  await rehearse(a.root,a.upgrade_id,async(_h,_n,_p,_d,_t,_s,{signal})=>{
    edit(a,s=>s.owner.epoch++);
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Abort not observed')),2000);signal.addEventListener('abort',()=>{clearTimeout(timeout);signaled=true;resolve();},{once:true});});
    return {native_id:'local-cos',text:'Late invalid output retained exactly'};
  });
  const u=read(a).upgrade;assert.ok(signaled);assert.equal(u.status,'failed');
  assert.equal(u.calls[0].text,'Late invalid output retained exactly');assert.equal(u.steps[0].state,'started');
});

test('transport fallback replays all QA and corresponding CoS findings without omitting exact final proposal',async()=>{
  const a=prepare({large:true}),seen=[];
  await rehearse(a.root,a.upgrade_id,contractModel({findingSize:90000,observe:t=>seen.push(t)}));
  const u=read(a).upgrade;assert.equal(u.status,'ready',u.error);
  assert.equal(u.final_packets.cos.mode,'inline');assert.equal(u.final_packets.qa.mode,'replay');
  const batches=seen.filter(t=>t.role==='qa'&&t.phase==='replay');assert.ok(batches.length>=2);
  assert.deepEqual(batches.flatMap(t=>t.findings),u.qa_pages);
  assert.deepEqual(batches.flatMap(t=>t.cos_findings),u.cos_pages);
  const final=seen.find(t=>t.role==='qa'&&t.phase==='synthesis');
  assert.deepEqual(final.proposed_handover,u.probe.artifact);
  assert.equal(final.coverage.pages.length,u.evidence.pages.length);
  upgrade({...a,action:'apply'},'codex');
});

test('output retained before completion receipt is still ambiguous after process loss',()=>{
  const a=prepare(),u=interrupt(a,'returned');
  assert.equal(u.calls.length,1);assert.equal(u.steps[0].state,'started');
  assert.throws(()=>resume(a),/Ambiguous interrupted call/);
});
test('resume cannot rewrite deadline, call cap, selection or original source authority',()=>{
  for(const field of ['deadline_ms','call_timeout_minutes','model_selection','source_instruction']) {
    const a=prepare();interrupt(a);
    edit(a,s=>{
      if(field==='deadline_ms'){s.upgrade.deadline_ms+=60000;s.upgrade.evidence.deadline_ms=s.upgrade.deadline_ms;}
      if(field==='call_timeout_minutes'){s.upgrade.call_timeout_minutes=30;s.upgrade.evidence.call_timeout_minutes=30;}
      if(field==='model_selection')s.upgrade.model_selection={mode:'default',reason:'Changed after interruption'};
      if(field==='source_instruction')s.upgrade.source_instruction='Changed original authority';
    });
    assert.throws(()=>resume(a),/changed/);
  }
});
test('missing worker termination proof and stale candidate request prevent launch',()=>{
  const a=prepare();interrupt(a);
  assert.throws(()=>upgrade({...a,action:'resume',candidate_hash:'stale',source_instruction:'Continue'},'codex',opts),/exact candidate_hash/);
  edit(a,s=>delete s.upgrade.worker);
  assert.throws(()=>resume(a),/termination is unknown/);
});

test('resumed retrieval rounds reconstruct only canonical own-session reads without repeating completed calls',async()=>{
  const a=prepare(),u=interrupt(a,'reads'),seen=[];
  assert.equal(u.steps.length,2);assert.equal(u.steps[0].id.endsWith(':0'),true);assert.equal(u.steps[1].id.endsWith(':1'),true);
  assert.equal(u.deliveries.length,2);
  resume(a);await continueWorker(a,contractModel({observe:t=>seen.push(t)}));
  const after=read(a).upgrade;assert.equal(after.status,'ready',after.error);
  assert.equal(seen.filter(t=>t.role==='cos' && ['page','retrieval'].includes(t.phase)).length,0);
  assert.deepEqual(after.calls.slice(0,2),u.calls);
  assert.deepEqual(after.deliveries.filter(d=>d.role==='cos'),u.deliveries);
});
test('oversized complete proposal holds before final QA without truncating or repeating it on pages',async()=>{
  const a=prepare(),seen=[],model=contractModel();
  await rehearse(a.root,a.upgrade_id,async(...args)=>{
    const task=JSON.parse(args[2]);seen.push(task);
    const result=await model(...args);
    if(task.role==='cos' && task.phase==='synthesis') {
      const artifact=JSON.parse(result.text);artifact.complete_proposal_detail='F'.repeat(830000);result.text=JSON.stringify(artifact);
    }
    return result;
  });
  const u=read(a).upgrade;assert.equal(u.status,'failed');assert.match(u.error,/request has/);
  assert.equal(u.probe.artifact.complete_proposal_detail.length,830000);
  assert.ok(seen.filter(t=>t.role==='qa'&&t.phase==='page').every(t=>!Object.hasOwn(t,'proposed_handover')));
  assert.equal(seen.filter(t=>t.role==='qa'&&t.phase==='synthesis').length,0);
  assert.throws(()=>resume(a),/nonfailed/);
});


test('queued eligibility failure is durably held without harming a different reserved worker',async()=>{
  for(const kind of ['deadline','checkpoint','candidate','rules']) {
    const a=prepare(),before=read(a).upgrade,now=Date.now;
    if(kind==='deadline')Date.now=()=>before.deadline_ms+1;
    else edit(a,s=>{if(kind==='checkpoint')s.records.newFact={id:'newFact',content:'Changed obligation'};if(kind==='candidate')s.upgrade.candidate.cos_instructions+='changed';if(kind==='rules')s.upgrade.workflow_rules_sha256='changed';});
    let calls=0;try{await rehearse(a.root,a.upgrade_id,()=>{calls++;throw Error('must not invoke');});}finally{Date.now=now;}
    const s=read(a);assert.equal(calls,0);assert.equal(s.upgrade.status,'failed',kind);assert.ok(s.upgrade.error);assert.ok(s.notices.some(n=>n.summary.includes(s.upgrade.error)));assert.equal(s.upgrade.deadline_ms,before.deadline_ms);
  }
  const a=prepare();edit(a,s=>{s.upgrade.worker={token:'different-worker',state:'reserved',pid:process.pid};s.upgrade.candidate.cos_instructions+='changed';});
  const before=read(a);await rehearse(a.root,a.upgrade_id,()=>{throw Error('must not invoke');},'wrong-token');
  const after=read(a);assert.equal(after.upgrade.status,'queued');assert.deepEqual(after.upgrade.worker,before.upgrade.worker);assert.deepEqual(after.notices,before.notices);
});
