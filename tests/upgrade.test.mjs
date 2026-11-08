import { exactSource, exactCollection } from './helpers/public-exact.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { withStore, Store, id, digest, VERSION, teamHash } from '../plugins/soloco/runtime/store.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import { upgrade, rehearse, checkpoint } from '../plugins/soloco/runtime/upgrade.mjs';
import { admitPrompt, REQUEST_LIMIT, RESPONSE_RESERVE } from '../plugins/soloco/runtime/upgrade-evidence.mjs';
import { MAX_EXECUTION_TIMEOUT_MS } from '../plugins/soloco/runtime/timeout.mjs';
import { hook, call } from '../plugins/soloco/runtime/main.mjs';
import {resolveSnapshotEntry,shallowSnapshotHistory} from '../plugins/soloco/runtime/snapshot.mjs';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'company-upgrade-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'cache');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const options={launch:()=>{},check:()=>({available:true,authenticated:true})};
const selectionCatalog={supported:true,source:'synthetic_catalog',models:[{id:'fixture-model',supported_efforts:['medium','high']}],speed_support:{fast_disabled:true}};
const selected={mode:'explicit',model:'fixture-model',effort:'high',reason:'Bounded fictional continuity review'};
const read=a=>withStore(a.root,db=>db.read());
function setup(host='codex') {
  const root=fs.mkdtempSync(path.join(base,'company-'));
  const a={root,session_id:id('founder'),expected_epoch:1,epoch:1};
  engine.bind(root,a.session_id,host);engine.open({...a,idea:'A sustainable solo company'},host);
  engine.save({...a,kind:'intent',content:'Stay within five founder hours/week and the agreed budget'},host);
  engine.save({...a,kind:'preference',content:'Short updates',basis:'explicit',source_reference:'founder message'},host);
  engine.notify({...a,kind:'decision_required',summary:'Customer data remains held'},host);
  engine.message({...a,to:'qa',content:'Preserve the failed review'},host);
  withStore(root,db=>db.transaction('test.legacy',s=>{
    s.schema=1;s.plugin_version='0.1.0';delete s.runtime_version;delete s.cos_instructions;delete s.team_sha256;
    s.governance='Legacy company governance: preparation only. Failed reviews and founder limits remain binding.';s.governance_sha256=digest(s.governance);
    s.records.failed={id:'failed',kind:'review',content:'Fail: evidence missing',revision:1,review:{verdict:'Fail',reason:'No evidence'},author_instance:'qa-old'};
    s.sessions.pm={instance_id:'pm-old',role:'pm',native_id:'native-old',host};
    s.extension={obligations:['retain user records'],limit:20};return s;
  }));withStore(root,db=>db.migrate());return a;
}
function prepare(a,host='codex',extra={}) {
  const {model_selection,review_window_minutes,call_timeout_minutes,...inspectionExtra}=extra;
  const args={...a,workflow:'legacy',...inspectionExtra,action:'inspect'};
  const inspection=upgrade(args,host);
  return upgrade({...args,workflow:'legacy',action:'prepare',candidate_hash:inspection.candidate_hash,source_instruction:'Upgrade my company team and resume after successful checks',...extra},host,{...options,catalog:()=>selectionCatalog});
}
function modelFor(a,{verdict='Pass',sameId=false,omit=false}={}) {
  const sessions=new Map();
  return async (_host,native,prompt)=>{
    const task=JSON.parse(prompt),role=task.role;
    const expected=sameId?'same-native':`native-${role}`;
    assert.equal(native,sessions.has(role)?expected:null);
    sessions.set(role,true);
    let citation;
    if(task.page) {
      citation={source_id:task.page.source_id,sha256:task.page.sha256,...task.page.citation_ranges[0]};
      sessions.set(`${role}-citation`,citation);
      if(role==='qa') {assert.ok(task.cos_findings);assert.ok(task.proposed_handover);}
    } else citation=sessions.get(`${role}-citation`);
    const continuity={company_id:task.authority.company_id,checkpoint_sha256:task.authority.checkpoint_sha256,
      inventory_sha256:omit?'omitted':task.authority.inventory_sha256,
      constraints:'Preparation only; five founder hours/week; customer data held',
      unresolved_work:'Failed review lacks evidence; founder notice unresolved',next_action:'Prepare research proposal only, with no external business execution'};
    for(const key of ['constraints','unresolved_work','next_action'])continuity[key]={text:continuity[key],citations:[citation]};
    return {native_id:expected,text:JSON.stringify({content:'Recovered objectives, limits, failed review and next permitted preparation',continuity,
      citations:[citation],...(role==='qa'?{review:{verdict,reason:'Compared raw records, failed review, limits, notices and proposed next action',permitted_action:verdict==='Pass'?(task.phase==='synthesis'?'apply_preparation_team':'continue_upgrade_review'):'hold',blockers:verdict==='Pass'?[]:['Continuity evidence failed']}}:{})})};
  };
}

async function ready(a,host='codex') {
  const p=prepare(a,host);await rehearse(a.root,p.upgrade.id,modelFor(a));
  assert.equal(read(a).upgrade.status,'ready',read(a).upgrade.error);
  return {...a,upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch};
}

test('prepare stores the default or selected review window and exposes the original grant and deadline for audit',()=>{
  for(const window of [undefined,45,90,null]) {
    const a=setup(),before=Date.now(),grant=window===null?'ignore the time limit':window===90?'Approve one 90-minute attempt':'Upgrade the fictional team with a 45-minute review window';
    const p=prepare(a,'codex',{...(window===undefined?{}:{review_window_minutes:window}),source_instruction:grant});
    const after=Date.now(),u=read(a).upgrade,minutes=window===undefined?45:window;
    assert.equal(u.review_window_minutes,minutes);
    assert.equal(u.review_deadline_policy,minutes===null?'none':'finite');
    if(minutes===null)assert.equal(u.deadline_ms,null);
    else assert.ok(u.deadline_ms>=before+minutes*60000 && u.deadline_ms<=after+minutes*60000);
    assert.equal(p.upgrade.review_window_minutes,minutes);
    assert.equal(p.upgrade.deadline_ms,u.deadline_ms);
    assert.equal(exactSource(a,'codex',p.upgrade.source).source_instruction,grant);
    const summary=engine.status(a,'codex').upgrade;
    assert.equal(summary.review_window_minutes,minutes);
    assert.equal(summary.deadline_ms,u.deadline_ms);
    assert.equal(upgrade({...a,action:'inspect'},'codex').upgrade.review_window_minutes,minutes);
    assert.ok(Object.values(read(a).records).some(r=>r.action==='prepare_team_upgrade' && r.content===grant));
  }
});

test('invalid review windows and non-prepare use reject before readiness, catalog, launch or state changes',async()=>{
  const a=setup(),inspection=upgrade({...a,action:'inspect'},'codex'),before=read(a);
  const {epoch,...toolArgs}=a;
  const args={...toolArgs,candidate_hash:inspection.candidate_hash,source_instruction:'Approve one 90-minute attempt',model_selection:selected};
  const forbidden=()=>{throw new Error('Unexpected external boundary');};
  const deps={launch:forbidden,check:forbidden,catalog:forbidden};
  for(const value of [undefined,false,true,'45','90',0,-45,44,46,60,89,91,45.5,90.1,NaN,Infinity,[],{},new Number(90)]) {
    assert.throws(()=>upgrade({...args,workflow:'legacy',action:'prepare',review_window_minutes:value},'codex',deps),/review_window_minutes/);
    await assert.rejects(call('company_upgrade',{...args,workflow:'legacy',action:'prepare',review_window_minutes:value},'codex'),/review_window_minutes/);
    assert.deepEqual(read(a),before);
  }
  for(const action of ['inspect','apply','verify','recover','unknown'])for(const value of [45,90,null]) {
    assert.throws(()=>upgrade({...args,action,review_window_minutes:value},'codex',deps),/only supported.*prepare/);
    await assert.rejects(call('company_upgrade',{...args,action,review_window_minutes:value},'codex'));
    assert.deepEqual(read(a),before);
  }
});

test('prepare cannot extend an active or expired attempt; recovery preserves it for a fresh request',()=>{
  for(const expired of [false,true]) {
    const a=setup(),p=prepare(a,'codex',{review_window_minutes:45});
    const now=Date.now;
    try {
      if(expired)Date.now=()=>p.upgrade.deadline_ms+1;
      const before=read(a);
      for(const requested of [90,null]) {
        assert.throws(()=>prepare({...a,expected_epoch:p.owner.epoch},'codex',{review_window_minutes:requested,call_timeout_minutes:30}),/already pending/);
        assert.deepEqual(read(a),before);
      }
      if(expired)assert.equal(engine.status(a,'codex').upgrade.status,'failed');
      const held=read(a).upgrade;
      assert.equal(held.deadline_ms,p.upgrade.deadline_ms);
      assert.equal(held.review_window_minutes,45);
      assert.equal(held.call_timeout_minutes,10);
      const recovered=upgrade({...a,action:'recover',expected_epoch:p.owner.epoch,upgrade_id:p.upgrade.id,source_instruction:'Recover the held attempt'},'codex');
      const old=read(a).upgrade;
      const fresh=prepare({...a,expected_epoch:recovered.owner.epoch},'codex',{review_window_minutes:90,call_timeout_minutes:30,source_instruction:'Approve one 90-minute attempt with a 30-minute call cap'});
      assert.notEqual(fresh.upgrade.id,p.upgrade.id);
      assert.equal(fresh.upgrade.review_window_minutes,90);
      assert.equal(exactSource(a,'codex',fresh.upgrade.source).call_timeout_minutes,30);
      assert.deepEqual(read(a).upgrade_history.at(-1),old);
    } finally {Date.now=now;}
  }
});

test('apply and verify use the stored deadline regardless of selected-window audit metadata',async()=>{
  for(const action of ['apply','verify'])for(const window of [45,90,'legacy-stored','legacy-fallback']) {
    const a=setup(),p=prepare(a,'codex',typeof window==='number'?{review_window_minutes:window}:{});
    if(typeof window==='string')withStore(a.root,db=>db.transaction('test.legacy_gate',s=>{
      delete s.upgrade.review_deadline_policy;delete s.upgrade.review_window_minutes;
      if(window==='legacy-fallback')delete s.upgrade.deadline_ms;
      return s;
    }));
    const original=read(a).upgrade;
    const originalDeadline=original.deadline_ms??Date.parse(original.created_at)+420000;
    await rehearse(a.root,p.upgrade.id,modelFor(a));
    assert.equal(read(a).upgrade.status,'ready',read(a).upgrade.error);
    let args={...a,upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch};
    if(action==='verify')args.expected_epoch=upgrade({...args,action:'apply'},'codex').owner.epoch;
    // Audit metadata never recomputes the deadline, even if altered in a fixture.
    withStore(a.root,db=>db.transaction('test.audit_only',s=>{s.upgrade.review_window_minutes=90;return s;}));
    const before=read(a),now=Date.now;
    try {
      Date.now=()=>originalDeadline;
      assert.throws(()=>upgrade({...args,action,review_window_minutes:90},'codex'),/only supported.*prepare/);
      assert.throws(()=>upgrade({...args,action},'codex'),/deadline expired/);
      assert.deepEqual(read(a),before);
    } finally {Date.now=now;}
  }
});

test('explicit none survives elapsed finite windows with no overall timer or serialization ambiguity',async t=>{
  const a=setup(),p=prepare(a,'codex',{review_window_minutes:null,source_instruction:'ignore the time limit'}),model=modelFor(a),now=Date.now;
  const original=read(a).upgrade;
  let calls=0,timers=0;
  t.mock.method(globalThis,'setTimeout',()=>{timers++;throw new Error('No overall timer permitted');});
  try {
    Date.now=()=>now()+3*60*60*1000;
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      calls++;
      assert.equal(args[4],600000);
      assert.equal(args[6].signal.aborted,false);
      const task=JSON.parse(args[2]);
      assert.equal(task.authority.deadline_ms,null);
      assert.equal(task.authority.review_deadline_policy,'none');
      assert.equal(engine.status(a,'codex').upgrade.status,'checking');
      return model(...args);
    });
    const u=read(a).upgrade;
    assert.equal(u.status,'ready',u.error);assert.ok(calls>1);assert.equal(timers,0);
    assert.equal(u.deadline_ms,null);assert.equal(u.review_deadline_policy,'none');
    assert.equal(u.created_at,original.created_at);
    const done=applyAndVerify({...a,upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch});
    assert.equal(done.upgrade.status,'completed');assert.equal(done.upgrade.deadline_ms,null);
    assert.equal(done.upgrade.review_deadline_policy,'none');
  } finally {Date.now=now;t.mock.restoreAll();}
});

test('status and wait preserve explicit none after finite windows while legacy null still expires',async()=>{
  const a=setup(),p=prepare(a,'codex',{review_window_minutes:null}),now=Date.now;
  try {
    Date.now=()=>now()+3*60*60*1000;
    const status=engine.status(a,'codex');
    assert.equal(status.upgrade.status,'queued');assert.equal(status.upgrade.deadline_ms,null);
    const waited=await call('company_wait',{root:a.root,session_id:a.session_id,seconds:0},'codex');
    assert.equal(waited.upgrade.status,'queued');assert.equal(waited.upgrade.id,p.upgrade.id);
  } finally {Date.now=now;}
});

test('legacy null deadlines retain fallback; partial or corrupted explicit policies cannot disable expiry',async()=>{
  for(const kind of ['legacy-missing','legacy-null','legacy-null-selection','corrupt-none','corrupt-finite']) {
    const a=setup(),p=prepare(a);
    withStore(a.root,db=>db.transaction('test.null_deadline',s=>{
      const u=s.upgrade;u.created_at=new Date(Date.now()-8*60000).toISOString();
      delete u.review_deadline_policy;delete u.review_window_minutes;
      if(kind==='legacy-missing')delete u.deadline_ms;
      else u.deadline_ms=null;
      if(kind==='legacy-null-selection')u.review_window_minutes=null;
      if(kind==='corrupt-none')u.review_deadline_policy='none';
      if(kind==='corrupt-finite')u.review_deadline_policy='finite';
      return s;
    }));
    assert.equal(engine.status(a,'codex').upgrade.status,'failed',kind);
    let calls=0;await rehearse(a.root,p.upgrade.id,async()=>{calls++;});
    assert.equal(calls,0);assert.equal(read(a).upgrade.status,'failed');
  }
});

test('deadline policy remains immutable during review and before apply or verify',async()=>{
  for(const window of [45,null])for(const stage of ['call','apply','verify']) {
    const a=setup(),p=prepare(a,'codex',{review_window_minutes:window}),model=modelFor(a);
    const mutate=()=>withStore(a.root,db=>db.transaction('test.policy_changed',s=>{
      s.upgrade.review_deadline_policy=window===null?'finite':'none';
      s.upgrade.deadline_ms=window===null?Date.now()+5400000:null;
      s.upgrade.review_window_minutes=window===null?90:null;
      return s;
    }));
    let calls=0;
    await rehearse(a.root,p.upgrade.id,async(...args)=>{const output=await model(...args);if(stage==='call'&&calls++===0)mutate();return output;});
    if(stage==='call') {
      const u=read(a).upgrade;assert.equal(u.status,'failed');assert.equal(calls,1);assert.equal(u.calls.length,1);assert.equal(u.cos_pages.length,0);
    } else {
      let args={...a,upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch};
      assert.equal(read(a).upgrade.status,'ready',read(a).upgrade.error);
      if(stage==='verify')args.expected_epoch=upgrade({...args,action:'apply'},'codex').owner.epoch;
      mutate();assert.throws(()=>upgrade({...args,action:stage},'codex'),/deadline policy changed/);
    }
  }
});

test('explicit none retains native timeout and failed review evidence without retry or adoption',async()=>{
  for(const failure of ['timeout','review']) {
    const a=setup(),p=prepare(a,'codex',{review_window_minutes:null,call_timeout_minutes:30}),model=modelFor(a,{verdict:'Fail'});
    let calls=0;
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      calls++;assert.equal(args[4],1800000);
      if(failure==='timeout')throw Object.assign(new Error('Synthetic native call timed out at 1800000 ms'),{code:'ROLE_EXECUTION_TIMEOUT'});
      return model(...args);
    });
    const failed=read(a).upgrade;
    assert.equal(failed.status,'failed');assert.equal(failed.deadline_ms,null);
    const count=calls;
    await rehearse(a.root,p.upgrade.id,async()=>{calls++;});
    assert.equal(calls,count);assert.deepEqual(read(a).upgrade.calls,failed.calls);
    assert.throws(()=>upgrade({...a,action:'apply',upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch},'codex'),/passing continuity review/);
    if(failure==='timeout')assert.equal(failed.calls[0].error_code,'ROLE_EXECUTION_TIMEOUT');
    else assert.ok(failed.qa_pages.some(page=>page.artifact.review.verdict==='Fail'));
  }
});

test('upgrade selection rejects incompatible actions and invalid controls without partial preparation',async()=>{
  const a=setup(),inspection=upgrade({...a,action:'inspect'},'codex');
  const args={...a,candidate_hash:inspection.candidate_hash,source_instruction:'Upgrade the fictional team'};
  const before=read(a);let launches=0,checks=0;
  const deps={launch:()=>{launches++;},check:()=>{checks++;return {available:true,authenticated:true};},catalog:()=>selectionCatalog};
  for(const action of ['inspect','apply','verify','recover']) {
    assert.throws(()=>upgrade({...args,action,model_selection:selected},'codex',deps),/only supported.*prepare/);
    await assert.rejects(call('company_upgrade',{root:a.root,session_id:a.session_id,action,model_selection:selected},'codex'),/only supported.*prepare/);
  }
  for(const request of [
    {...selected,model:'unadvertised'}, {...selected,effort:'ultra'},
    {...selected,model:'bad model'}, {...selected,reason:' '},
    {...selected,mode:'default'}, {...selected,speed:'fast'},
    {...selected,speed:'fast_disabled'}, {...selected,service_tier:'priority'},
    [], 'fixture-model'
  ]) {
    assert.throws(()=>upgrade({...args,workflow:'legacy',action:'prepare',model_selection:request},'codex',deps));
    assert.deepEqual(read(a),before);
  }
  assert.throws(()=>upgrade({...args,workflow:'legacy',action:'prepare',model_selection:selected},'codex',{...deps,catalog:()=>({supported:false,error:'synthetic unavailable'})}),/unavailable/);
  assert.deepEqual(read(a),before);assert.equal(checks,0);assert.equal(launches,0);
});

test('one catalog-validated selection persists and reaches fresh independent roles, retrieval, replay and synthesis unchanged',async()=>{
  const a=setup(),inspection=upgrade({...a,action:'inspect'},'codex');let discoveries=0;
  const p=upgrade({...a,workflow:'legacy',action:'prepare',candidate_hash:inspection.candidate_hash,source_instruction:'Upgrade fictional team',call_timeout_minutes:30,model_selection:{...selected,reason:`  ${selected.reason}  `}},'codex',{
    ...options,catalog:host=>{assert.equal(host,'codex');discoveries++;return selectionCatalog;}
  });
  assert.equal(discoveries,1);assert.deepEqual(exactSource(a,'codex',p.upgrade.source).model_selection,selected);
  assert.deepEqual(read(a).upgrade.model_selection,selected);
  assert.equal(read(a).upgrade.model_selection_sha256,digest(JSON.stringify(selected)));
  assert.equal(read(a).upgrade.model_catalog.source,'synthetic_catalog');
  const model=modelFor(a),phases=new Map(),retrieved=new Set();
  const evidence={reported_models:[],reported_effort:null,reported_service_tier:null,applied_controls:{model:'fixture-model',effort:'high',verification:'applied_controls_not_effective_settings'},verification:'unverified',source:'exec_json',scope:'assignment'};
  await rehearse(a.root,p.upgrade.id,async(...args)=>{
    const task=JSON.parse(args[2]),role=task.role;
    assert.deepEqual(args[5],selected);
    assert.equal(args[4],1800000);
    assert.equal(args[6].timeoutContext,'upgrade-call');
    assert.equal(args[1],phases.has(role)?`native-${role}`:null);
    if(!phases.has(role))phases.set(role,new Set());
    phases.get(role).add(task.phase);
    if(task.phase==='page'&&!retrieved.has(role)) {
      retrieved.add(role);
      return {native_id:`native-${role}`,text:JSON.stringify({reads:[task.response_contract.reads_only_shape.reads[0]]}),model_evidence:evidence};
    }
    // The fixture model expects the resumed page shape after a retrieval.
    const effective=task.phase==='retrieval'?{...task.task,authority:task.authority,role}:task;
    // Its own session bookkeeping has not seen the reads-only round.
    const output=await model(args[0],task.phase==='retrieval'?null:args[1],JSON.stringify(effective));
    return {...output,model_evidence:evidence};
  });
  const u=read(a).upgrade;
  assert.equal(u.status,'ready',u.error);assert.equal(discoveries,1);
  for(const role of ['cos','qa'])assert.deepEqual([...phases.get(role)].sort(),['page','replay','retrieval','synthesis']);
  assert.notEqual(u.probe.native_id,u.review.native_id);
  assert.ok(u.calls.length>=8);
  for(const receipt of u.calls) {
    assert.deepEqual(receipt.model_selection,selected);
    assert.deepEqual(receipt.model_evidence,evidence);
    assert.deepEqual(receipt.model_evidence.reported_models,[]);
  }
  const done=applyAndVerify({...a,upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch});
  assert.equal(done.upgrade.status,'completed');
});

test('omitted, deliberate default and legacy upgrade selections preserve compatibility without catalog discovery',async()=>{
  for(const request of [undefined,{mode:'default',reason:'Keep host defaults'},'legacy']) {
    const a=setup(),inspection=upgrade({...a,action:'inspect'},'codex');
    const expected=request==='legacy'?null:request??null;
    const p=upgrade({...a,workflow:'legacy',action:'prepare',candidate_hash:inspection.candidate_hash,source_instruction:'Upgrade fictional team',...(expected?{model_selection:expected}:{})},'codex',{
      ...options,catalog:()=>{throw new Error('Default must not discover models');}
    });
    if(request==='legacy')withStore(a.root,db=>db.transaction('test.legacy_attempt',s=>{
      delete s.upgrade.model_selection;delete s.upgrade.model_selection_sha256;return s;
    }));
    const model=modelFor(a);let calls=0;
    await rehearse(a.root,p.upgrade.id,async(...args)=>{calls++;assert.deepEqual(args[5],expected);return model(...args);});
    const u=read(a).upgrade;assert.equal(u.status,'ready',u.error);assert.ok(calls>1);
    assert.equal(Object.hasOwn(u,'model_catalog'),false);
    for(const receipt of u.calls) {
      assert.deepEqual(receipt.model_selection,expected);
      assert.equal(receipt.model_evidence.applied_controls,null);
      assert.deepEqual(receipt.model_evidence.reported_models,[]);
    }
  }
});

test('Claude upgrade selection shares supported controls across both roles and rejects unverified effort before preparation',async()=>{
  const a=setup('claude'),before=read(a),inspection=upgrade({...a,action:'inspect'},'claude');
  const request={mode:'explicit',model:'fixture-model',speed:'fast_disabled',reason:'Synthetic supported controls'};
  assert.throws(()=>upgrade({...a,workflow:'legacy',action:'prepare',candidate_hash:inspection.candidate_hash,source_instruction:'Upgrade fictional team',model_selection:{...request,effort:'high'}},'claude',{
    ...options,catalog:()=>selectionCatalog
  }),/effort support is unverified/);
  assert.deepEqual(read(a),before);
  const p=prepare(a,'claude',{model_selection:request}),model=modelFor(a),roles=new Set();
  await rehearse(a.root,p.upgrade.id,async(...args)=>{
    assert.equal(args[0],'claude');assert.deepEqual(args[5],request);
    roles.add(JSON.parse(args[2]).role);return model(...args);
  });
  assert.deepEqual([...roles],['cos','qa']);assert.equal(read(a).upgrade.status,'ready',read(a).upgrade.error);
});

test('selection mutation holds before calls, during review, and before apply or verify',async()=>{
  for(const stage of ['queued','call','ready','applied']) {
    const a=setup(),p=prepare(a,'codex',{model_selection:selected}),model=modelFor(a);let calls=0;
    const mutate=()=>withStore(a.root,db=>db.transaction('test.selection_changed',s=>{
      s.upgrade.model_selection.effort='medium';
      // Even repinning cannot replace a request already frozen for review.
      if(stage!=='queued')s.upgrade.model_selection_sha256=digest(JSON.stringify(s.upgrade.model_selection));
      return s;
    }));
    if(stage==='queued')mutate();
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      calls++;if(stage==='call')mutate();return model(...args);
    });
    if(['queued','call'].includes(stage)) {
      const u=read(a).upgrade;
      assert.equal(u.status,'failed');assert.equal(calls,stage==='queued'?0:1);
      if(stage==='call')assert.deepEqual(u.calls[0].model_selection,selected);
    } else {
      assert.equal(read(a).upgrade.status,'ready',read(a).upgrade.error);
      let epoch=p.owner.epoch;
      if(stage==='applied')epoch=upgrade({...a,action:'apply',upgrade_id:p.upgrade.id,expected_epoch:epoch},'codex').owner.epoch;
      mutate();
      assert.throws(()=>upgrade({...a,action:stage==='ready'?'apply':'verify',upgrade_id:p.upgrade.id,expected_epoch:epoch},'codex'),/model selection changed/);
    }
  }
});

test('selected upgrade timeouts retain request and unknown execution evidence, without retry or permission',async()=>{
  for(const role of ['cos','qa']) {
    const a=setup(),p=prepare(a,'codex',{model_selection:selected}),model=modelFor(a);let calls=0;
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      calls++;assert.deepEqual(args[5],selected);
      if(JSON.parse(args[2]).role===role)throw Object.assign(new Error('Synthetic native timeout'),{code:'ROLE_EXECUTION_TIMEOUT'});
      return model(...args);
    });
    const u=read(a).upgrade,last=u.calls.at(-1);
    assert.equal(u.status,'failed');assert.equal(last.role,role);assert.deepEqual(last.model_selection,selected);
    assert.match(last.error,/timeout/);assert.equal(last.error_code,'ROLE_EXECUTION_TIMEOUT');
    assert.equal(last.model_evidence.applied_controls,null);
    assert.deepEqual(last.model_evidence.reported_models,[]);
    assert.equal(last.model_evidence.reported_effort,null);assert.equal(last.model_evidence.reported_service_tier,null);
    assert.equal(last.model_evidence.verification,'unverified');
    const before=calls;
    await rehearse(a.root,p.upgrade.id,async()=>{calls++;});assert.equal(calls,before);
    assert.throws(()=>upgrade({...a,action:'apply',upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch},'codex'),/passing continuity review/);
  }
});

test('changing selection after recovery creates fresh role sessions and preserves the failed attempt evidence',async()=>{
  const a=setup(),p=prepare(a,'codex',{model_selection:selected}),firstModel=modelFor(a);
  await rehearse(a.root,p.upgrade.id,async(...args)=>{
    if(JSON.parse(args[2]).role==='qa')throw new Error('Synthetic QA timeout');
    return firstModel(...args);
  });
  const failed=read(a).upgrade;
  assert.equal(failed.status,'failed');assert.ok(failed.cos_pages.length>0);
  const recovered=upgrade({...a,action:'recover',upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch,source_instruction:'Recover fictional failed review'},'codex');
  const prior=read(a).upgrade,request={...selected,effort:'medium',reason:'Fresh authorized fictional review'};
  const fresh=prepare({...a,expected_epoch:recovered.owner.epoch},'codex',{model_selection:request});
  assert.notEqual(fresh.upgrade.id,failed.id);
  assert.deepEqual(read(a).upgrade_history.at(-1),prior);
  const model=modelFor(a),seen=new Set();
  await rehearse(a.root,fresh.upgrade.id,async(...args)=>{
    const role=JSON.parse(args[2]).role;
    assert.deepEqual(args[5],request);
    if(!seen.has(role)) {assert.equal(args[1],null);seen.add(role);}
    return model(...args);
  });
  const state=read(a);
  assert.equal(state.upgrade.status,'ready',state.upgrade.error);
  assert.notEqual(state.upgrade.probe_instance,failed.probe_instance);
  assert.notEqual(state.upgrade.reviewer_instance,failed.reviewer_instance);
  assert.deepEqual(state.upgrade_history.at(-1),prior);
  assert.deepEqual([...seen],['cos','qa']);
  assert.equal(state.upgrade.cos_pages.length,state.upgrade.evidence.pages.length);
  assert.equal(state.upgrade.qa_pages.length,state.upgrade.evidence.pages.length);
  for(const call of state.upgrade.calls)assert.deepEqual(call.model_selection,request);
});
function applyAndVerify(a,host='codex') {
  const applied=upgrade({...a,action:'apply'},host);
  assert.throws(()=>engine.control({...a,action:'resume',expected_epoch:applied.owner.epoch,source_instruction:'resume'},host),/pending/);
  return upgrade({...a,action:'verify',expected_epoch:applied.owner.epoch},host);
}

test('legacy inspection is read-only and hooks never inject new operating instructions before adoption',()=>{
  const a=setup(),before=read(a);
  const plan=upgrade({...a,action:'inspect'},'codex');
  assert.equal(read(a).revision,before.revision);assert.equal(plan.governance.policy,'preserve');assert.equal(plan.changes.governance_changed,false);
  const text=hook({cwd:a.root,session_id:a.session_id,hook_event_name:'UserPromptSubmit',prompt:'hello'},'codex').hookSpecificOutput.additionalContext;
  assert.match(text,/requires upgrade maintenance/);assert.doesNotMatch(text,/Make the work visible/);
  assert.throws(()=>engine.open(a,'codex'),/upgrade/);
});

test('upgrade preserves company facts and rules, uses independent native sessions, fences old writes and verifies before resume',async()=>{
  const a=setup(),before=read(a),args=await ready(a);
  const staged=read(a);assert.equal(staged.schema,2);assert.equal(staged.plugin_version,'0.1.0');
  assert.notEqual(staged.upgrade.probe.native_id,staged.upgrade.review.native_id);
  assert.throws(()=>engine.save({...a,kind:'plan',content:'old write'},'codex'),/own/);
  assert.throws(()=>engine.save({...a,epoch:staged.owner.epoch,kind:'plan',content:'new epoch bypass'},'codex'),/held/);
  const finished=applyAndVerify(args);assert.equal(finished.upgrade.status,'completed');assert.equal(finished.paused,true);
  const after=read(a);assert.equal(after.id,before.id);assert.equal(after.plugin_version,VERSION);assert.equal(after.governance,before.governance);
  for(const [key,r]of Object.entries(before.records))assert.deepEqual(after.records[key],r);
  assert.deepEqual(after.extension,before.extension);assert.deepEqual(after.messages,before.messages);
  assert.deepEqual(after.notices,before.notices);assert.deepEqual(after.sessions,{});assert.equal(after.retired_sessions[0].native_id,'native-old');
  const opened=engine.open({...a,epoch:after.owner.epoch},'codex');assert.equal(exactSource(a,'codex',opened.pinned.items.find(item=>item.source.id==='@public:pinned:cos_instructions').source),after.cos_instructions);
  engine.control({...a,expected_epoch:after.owner.epoch,action:'resume',source_instruction:'Original request included resume'},'codex');
  assert.equal(read(a).paused,false);assert.equal(read(a).mode,'preparation');
});

test('governance adoption requires separate explicit instruction and preserves prior governance for recovery',async()=>{
  const a=setup();assert.throws(()=>prepare(a,'codex',{governance:'installed'}),/governance_instruction/);
  assert.equal(read(a).schema,1);
  const p=prepare(a,'codex',{governance:'installed',governance_instruction:'Adopt the shown ongoing-company governance; keep my business limits'});
  await rehearse(a.root,p.upgrade.id,modelFor(a));
  const done=applyAndVerify({...a,upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch});
  assert.notEqual(read(a).governance,read(a).upgrade.previous.governance);
  assert.match(read(a).governance,/optional milestones/);
  assert.match(read(a).upgrade.previous.governance,/Legacy company/);
});

test('failed review, incomplete coverage and reused native identity all prevent adoption',async()=>{
  for(const mode of [{verdict:'Fail'},{omit:true},{sameId:true}]) {
    const a=setup(),p=prepare(a);await rehearse(a.root,p.upgrade.id,modelFor(a,mode));
    assert.equal(read(a).upgrade.status,'failed');assert.equal(read(a).plugin_version,'0.1.0');
    assert.throws(()=>upgrade({...a,upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch,action:'apply'},'codex'),/passing/);
  }
});

test('unsupported state, stale candidate, missing login and duplicate prepare make no adoption',()=>{
  const a=setup(),inspection=upgrade({...a,action:'inspect'},'codex');
  assert.throws(()=>upgrade({...a,workflow:'legacy',action:'prepare',candidate_hash:'stale',source_instruction:'upgrade'},'codex',options),/Candidate changed/);
  assert.throws(()=>upgrade({...a,workflow:'legacy',action:'prepare',candidate_hash:inspection.candidate_hash,source_instruction:'upgrade'},'codex',{...options,check:()=>({available:true,authenticated:false})}),/signed in/);
  const p=prepare(a);
  assert.throws(()=>prepare({...a,expected_epoch:p.owner.epoch}),/pending/);
  withStore(a.root,db=>db.transaction('test.incompatible',s=>{s.mode='execution';return s;}));
  assert.throws(()=>upgrade({...a,action:'inspect'},'codex'),/Unsupported/);
});

test('active legacy work must reach a safe boundary; pause is available across versions',()=>{
  const a=setup();withStore(a.root,db=>db.transaction('test.job',s=>{s.jobs.j={id:'j',status:'running'};return s;}));
  assert.throws(()=>prepare(a),/Assignments are active/);
  engine.control({...a,action:'pause',source_instruction:'Pause before upgrade'},'codex');
  assert.equal(read(a).jobs.j.status,'cancelled');assert.equal(prepare(a).upgrade.status,'queued');
});

test('late business changes invalidate rehearsal, but delivery attempts do not',async()=>{
  const a=setup(),p=prepare(a);const model=modelFor(a);
  await rehearse(a.root,p.upgrade.id,async(...args)=>{hook({cwd:a.root,session_id:a.session_id,hook_event_name:'UserPromptSubmit',prompt:'status'},'codex');return model(...args);});
  assert.equal(read(a).upgrade.status,'ready',read(a).upgrade.error);
  withStore(a.root,db=>db.transaction('test.late',s=>{s.records.late={id:'late',content:'Quarantined old output'};return s;}));
  assert.throws(()=>upgrade({...a,expected_epoch:p.owner.epoch,upgrade_id:p.upgrade.id,action:'apply'},'codex'),/changed after rehearsal/);
});

test('recovery restores definitions, retains new facts, and does not restore old native sessions',async()=>{
  const a=setup(),args=await ready(a),done=applyAndVerify(args);
  engine.save({...a,epoch:done.owner.epoch,kind:'plan',content:'New evidence after adoption'},'codex');
  const result=upgrade({...a,action:'recover',upgrade_id:done.upgrade.id,expected_epoch:done.owner.epoch,source_instruction:'Recover the previous team definitions'},'codex');
  assert.equal(result.upgrade.status,'recovered');assert.equal(result.plugin_version,'0.1.0');assert.equal(result.runtime_version,VERSION);
  assert.ok(Object.values(read(a).records).some(r=>r.content==='New evidence after adoption'));
  assert.deepEqual(read(a).sessions,{});assert.equal(read(a).schema,2);
  assert.doesNotThrow(()=>engine.open(a,'codex'));
});

test('crashed checks are held, recoverable, and late model results cannot reactivate them',async()=>{
  const a=setup(),p=prepare(a);
  withStore(a.root,db=>db.transaction('test.timeout',s=>{s.upgrade.deadline_ms=1;return s;}));
  assert.equal(engine.status(a,'codex').upgrade.status,'failed');
  await rehearse(a.root,p.upgrade.id,modelFor(a));assert.equal(read(a).upgrade.status,'failed');
  upgrade({...a,action:'recover',upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch,source_instruction:'Recover interrupted upgrade'},'codex');
  assert.equal(read(a).upgrade.status,'recovered');
});

test('pause or recovery during checks revokes the pending review',async()=>{
  for(const action of ['pause','recover']) {
    const a=setup(),p=prepare(a,'codex',{call_timeout_minutes:30}),model=modelFor(a);let invoked=0;
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      invoked++;const output=await model(...args);
      if(action==='pause')engine.control({...a,expected_epoch:p.owner.epoch,action,source_instruction:'pause'},'codex');
      else upgrade({...a,expected_epoch:p.owner.epoch,upgrade_id:p.upgrade.id,action,source_instruction:'recover'},'codex');
      return output;
    });
    assert.equal(invoked,1);assert.notEqual(read(a).upgrade.status,'ready');
  }
});

test('post-apply continuity readback catches missing company records',async()=>{
  const a=setup(),args=await ready(a),applied=upgrade({...args,action:'apply'},'codex');
  withStore(a.root,db=>db.transaction('test.corruption',s=>{delete s.records.failed;return s;}));
  assert.throws(()=>upgrade({...args,expected_epoch:applied.owner.epoch,action:'verify'},'codex'),/record failed/);
  assert.equal(read(a).paused,true);
});

test('new companies and recovered teams use pinned CoS instructions, not installed replacements',()=>{
  const a=setup();withStore(a.root,db=>db.transaction('test.pinned',s=>{
    s.schema=2;s.runtime_version=VERSION;s.cos_instructions='PINNED COMPANY COS';s.team_sha256=teamHash(s);return s;
  }));
  const text=hook({cwd:a.root,session_id:a.session_id,hook_event_name:'SessionStart'},'codex').hookSpecificOutput.additionalContext;
  assert.match(text,/company_open is required/);const opened=engine.open(a,'codex');assert.equal(exactSource(a,'codex',opened.pinned.items.find(item=>item.source.id==='@public:pinned:cos_instructions').source),'PINNED COMPANY COS');assert.doesNotMatch(text,/Make the work visible/);
});

// Synthetic native CLIs exercise actual detached worker launch and both adapter protocols.
// They are deterministic integration fixtures, not evidence of live provider acceptance.
test('MCP upgrade completes through detached native processes on both host adapters',async()=>{
  const bin=path.join(base,'bin');fs.mkdirSync(bin,{recursive:true});
  const source=`#!${process.execPath}
import {randomUUID} from 'node:crypto';
const a=process.argv.slice(2),claude=process.argv[1].endsWith('claude');
if(a.includes('--version'))console.log('synthetic CLI');
else if(a.includes('--help'))console.log('--model --ignore-user-config --json --sandbox --tools --strict-mcp-config --setting-sources --output-format');
else if(a[0]==='login'||a[0]==='auth')process.exit(0);
else {
 let p='';for await(const c of process.stdin)p+=c;
 let text;
 if(p.includes('soloco-upgrade-pages-v2')) {
 if(claude && process.argv[process.argv.indexOf('--model')+1]!=='sonnet')throw new Error('Synthetic public upgrade lost the selected model');
 const task=JSON.parse(p),a=task.authority,role=task.role;
 const fs=await import('node:fs');
 const file=role+'.json';
 let citation;
 if(task.page) {
 citation={source_id:task.page.source_id,sha256:task.page.sha256,...task.page.citation_ranges[0]};
 fs.writeFileSync(file,JSON.stringify(citation));
 } else citation=JSON.parse(fs.readFileSync(file,'utf8'));
 const field=text=>({text,citations:[citation]});
 text=JSON.stringify({content:'Recovered bounded preparation and unresolved historical obligations',citations:[citation],continuity:{company_id:a.company_id,checkpoint_sha256:a.checkpoint_sha256,inventory_sha256:a.inventory_sha256,constraints:field('Preserve preparation limits and founder authority'),unresolved_work:field('Preserve notices and all unresolved failed reviews'),next_action:field('Preparation only; guarded adoption and separate readback')},...(role==='qa'?{review:{verdict:'Pass',reason:'Fixture checked raw semantic pages and proposed reconstruction',permitted_action:task.phase==='synthesis'?'apply_preparation_team':'continue_upgrade_review',blockers:[]}}:{})});
 } else text=JSON.stringify({content:'New specialist recovered company records and prepared the next bounded proposal',messages:[],notices:[]});
 const resumeAt=a.indexOf('--resume');
 const native=claude?(resumeAt>=0?a[resumeAt+1]:randomUUID()):(a[1]==='resume'?a[a.length-2]:randomUUID());
 if(claude)console.log(JSON.stringify({subtype:'success',session_id:native,result:text}));
 else {console.log(JSON.stringify({type:'thread.started',thread_id:native}));console.log(JSON.stringify({type:'turn.started'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text}}));console.log(JSON.stringify({type:'turn.completed'}));}
}
`;
  for(const name of ['codex','claude'])fs.writeFileSync(path.join(bin,name),source,{mode:0o700});
  const oldPath=process.env.PATH;process.env.PATH=bin+path.delimiter+oldPath;
  try {
    for(const host of ['codex','claude']) {
      const a=setup(host);
      const args={root:a.root,session_id:a.session_id};
      const inspection=await call('company_upgrade',{...args,action:'inspect'},host);
      const selection=host==='claude'?{mode:'explicit',model:'sonnet',reason:'Synthetic public upgrade fixture'}:undefined;
      const started=await call('company_upgrade',{...args,workflow:'legacy',action:'prepare',expected_epoch:1,candidate_hash:inspection.candidate_hash,source_instruction:'Upgrade this team',...(selection?{model_selection:selection}:{})},host);
      const s=await call('company_wait',{...args,seconds:10},host);
      assert.equal(s.upgrade.status,'ready',s.upgrade.error);
      const exact=exactSource(args,host,s.upgrade.source);assert.notEqual(exact.probe.native_id,exact.review.native_id);
      for(const receipt of read(a).upgrade.calls) {
        assert.deepEqual(receipt.model_selection,selection??null);
        assert.equal(receipt.model_evidence.applied_controls.model,selection?.model??null);
        assert.equal(receipt.model_evidence.reported_effort,null);
        assert.deepEqual(receipt.model_evidence.reported_models,[]);
      }
      const applied=await call('company_upgrade',{...args,action:'apply',expected_epoch:started.owner.epoch,upgrade_id:started.upgrade.id},host);
      const verified=await call('company_upgrade',{...args,action:'verify',expected_epoch:applied.owner.epoch,upgrade_id:started.upgrade.id},host);
      assert.equal(verified.upgrade.status,'completed');
      await call('company_open',args,host);
      await call('company_control',{...args,action:'resume',expected_epoch:verified.owner.epoch,source_instruction:'Resume the upgraded preparation team'},host);
      const job=await call('company_dispatch',{...args,epoch:verified.owner.epoch,role:'pm',task:'Recover company intent and prepare the next bounded proposal'},host);
      const resumed=await call('company_wait',{...args,seconds:10},host);
      assert.equal(exactCollection(args,host,'jobs').map(row=>row.value).find(j=>j.id===job.id).status,'completed');
      assert.notEqual(exactCollection(args,host,'sessions').find(row=>row.source.id==='@public:sessions:pm').value.native_id,'native-old');
      assert.notEqual(exactCollection(args,host,'sessions').find(row=>row.source.id==='@public:sessions:pm').value.instance_id,'pm-old');
    }
  } finally {process.env.PATH=oldPath;}
});

test('a new founder chat needs explicit paused takeover, then old chat writes remain revoked',async()=>{
  const a=setup(),b={...a,session_id:'new-founder-chat'};engine.bind(b.root,b.session_id,'claude');
  assert.throws(()=>prepare(b,'claude'),/takeover_instruction/);
  assert.throws(()=>prepare(b,'claude',{takeover_instruction:'Continue this company here and upgrade'}),/Pause/);
  engine.control({...b,action:'pause',source_instruction:'Pause this company'},'claude');
  const p=prepare(b,'claude',{takeover_instruction:'Continue this company here and upgrade'});
  assert.equal(p.owner.host,'claude');assert.equal(p.owner.session_id,b.session_id);
  await rehearse(b.root,p.upgrade.id,modelFor(b));
  const done=applyAndVerify({...b,expected_epoch:p.owner.epoch,upgrade_id:p.upgrade.id},'claude');
  assert.throws(()=>engine.save({...a,epoch:done.owner.epoch,kind:'plan',content:'old coordinator'},'codex'),/own/);
});

test('parallel prepare attempts cannot acquire the same upgrade epoch',async()=>{
  const {spawn}=await import('node:child_process');
  const a=setup(),inspection=upgrade({...a,action:'inspect'},'codex');
  const url=new URL('../plugins/soloco/runtime/upgrade.mjs',import.meta.url).href;
  const args={...a,workflow:'legacy',action:'prepare',candidate_hash:inspection.candidate_hash,source_instruction:'Upgrade'};
  const script=`import {upgrade} from ${JSON.stringify(url)};try{upgrade(${JSON.stringify(args)},'codex',{launch:()=>{},check:()=>({available:true,authenticated:true})});}catch{process.exitCode=1;}`;
  const codes=await Promise.all([1,2].map(()=>new Promise(resolve=>{const child=spawn(process.execPath,['--no-warnings','--input-type=module','-e',script],{stdio:'ignore'});child.on('close',resolve);})));
  assert.deepEqual(codes.sort(),[0,1]);assert.equal(read(a).owner.epoch,2);
});

test('a cancelled old assignment returning after apply is quarantined and retained through verification',async()=>{
  const a=setup();
  withStore(a.root,db=>db.transaction('test.cancelled',s=>{s.jobs.old={id:'old',instance_id:'pm-old',task:'old preparation',status:'cancelled',inputs:[]};return s;}));
  const args=await ready(a),applied=upgrade({...args,action:'apply'},'codex');
  // The v0.1 worker's late-result path only publishes quarantined output and a notice.
  withStore(a.root,db=>db.transaction('test.late_quarantine',s=>{
    s.jobs.old.status='quarantined';s.jobs.old.artifact_id='late';s.jobs.old.finished_at=new Date().toISOString();
    s.records.late={id:'late',kind:'artifact',status:'Quarantined',content:'Old model output'};
    s.notices.push({id:'late-notice',kind:'must_know',summary:'Late result quarantined',deliveries:[]});return s;
  }));
  const result=upgrade({...args,expected_epoch:applied.owner.epoch,action:'verify'},'codex');
  assert.equal(result.upgrade.status,'completed');assert.equal(read(a).records.late.status,'Quarantined');
  assert.ok(read(a).notices.some(n=>n.id==='late-notice'));
});

test('repeated recover and reprepare retains upgrade history and preserves the original failed verdict',async()=>{
  const a=setup(),p=prepare(a);await rehearse(a.root,p.upgrade.id,modelFor(a,{verdict:'Fail'}));
  const r=upgrade({...a,expected_epoch:p.owner.epoch,upgrade_id:p.upgrade.id,action:'recover',source_instruction:'Recover failed attempt'},'codex');
  const next=prepare({...a,expected_epoch:r.owner.epoch});
  assert.equal(read(a).upgrade_history.length,1);assert.equal(read(a).upgrade_history[0].review.artifact.review.verdict,'Fail');
  assert.notEqual(next.upgrade.id,p.upgrade.id);assert.equal(read(a).records.failed.review.verdict,'Fail');
});

test('large semantic checkpoints page without truncation and preserve exact records through apply',async()=>{
  const a=setup(),content='UNKNOWN old obligation: never spend without founder approval. '.repeat(22000);
  withStore(a.root,db=>db.transaction('test.large',s=>{s.records.large={id:'large',content,previous:[{revision:1,content:'Unresolved old founder constraint'}]};return s;}));
  const args=await ready(a),u=read(a).upgrade;
  assert.ok(u.evidence.pages.length>10);
  assert.equal(u.cos_pages.length,u.evidence.pages.length);
  assert.equal(u.qa_pages.length,u.evidence.pages.length);
  assert.ok(u.calls.filter(c=>c.role==='cos').reduce((n,c)=>n+c.budget.prompt_characters,0)>1000000);
  for(const c of u.calls)assert.ok(c.budget.prompt_characters+c.budget.response_reserve<=900000);
  applyAndVerify(args);
  assert.equal(read(a).records.large.content,content);
});

test('an interrupted upgrade can be recovered from a replacement founder chat without the old coordinator',()=>{
  const a=setup(),p=prepare(a),b={...a,session_id:'replacement-cos',expected_epoch:p.owner.epoch};engine.bind(b.root,b.session_id,'claude');
  const request={...b,upgrade_id:p.upgrade.id,action:'recover',source_instruction:'Continue here and recover the interrupted upgrade'};
  assert.throws(()=>upgrade(request,'claude'),/takeover_instruction/);
  const recovered=upgrade({...request,takeover_instruction:request.source_instruction},'claude');
  assert.equal(recovered.owner.session_id,b.session_id);assert.equal(recovered.owner.host,'claude');assert.equal(recovered.upgrade.status,'recovered');
  assert.doesNotThrow(()=>engine.open(b,'claude'));
});

test('a founder pause after apply prevents verification from silently continuing the upgrade',async()=>{
  const a=setup(),args=await ready(a),applied=upgrade({...args,action:'apply'},'codex');
  engine.control({...a,expected_epoch:applied.owner.epoch,action:'pause',source_instruction:'Pause, do not continue'},'codex');
  assert.throws(()=>upgrade({...args,expected_epoch:applied.owner.epoch,action:'verify'},'codex'),/does not match/);
  assert.equal(read(a).paused,true);assert.equal(read(a).upgrade.status,'failed');
});

test('continuity explanations accept substantive lists but reject empty explanations',async()=>{
  for(const valid of [true,false]) {
    const a=setup(),p=prepare(a),model=modelFor(a);
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      const result=await model(...args),artifact=JSON.parse(result.text);
      artifact.continuity.constraints.text=valid?['Preparation only','Founder workload and budget remain bounded']:[];
      artifact.continuity.unresolved_work.text=['Failed review remains unresolved'];
      artifact.continuity.next_action.text=['Prepare a proposal without external execution'];
      return {...result,text:JSON.stringify(artifact)};
    });
    assert.equal(read(a).upgrade.status,valid?'ready':'failed');
  }
});

test('qualified Pass with blockers or withheld adoption permission never reaches ready',async()=>{
  for (const review of [
    {verdict:'Pass',reason:'Continuity only; do not apply',permitted_action:'hold',blockers:[]},
    {verdict:'Pass',reason:'Missing constraints',permitted_action:'apply_preparation_team',blockers:['Limits unresolved']},
  ]) {
    const a=setup(),p=prepare(a),model=modelFor(a);
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      const output=await model(...args),value=JSON.parse(output.text);
      if(value.review && JSON.parse(args[2]).phase==='synthesis')value.review=review;
      return {...output,text:JSON.stringify(value)};
    });
    assert.equal(read(a).upgrade.status,'failed');assert.equal(read(a).plugin_version,'0.1.0');
    assert.ok(read(a).upgrade.reviewer_native_id);
    assert.deepEqual(read(a).upgrade.review.artifact.review,review);
  }
});

test('a company checkpoint above 200000 characters upgrades without dropping any record content',async()=>{
  const a=setup(),content='Retain the complete source evidence. '.repeat(5800);
  withStore(a.root,db=>db.transaction('test.large_supported',s=>{s.records.large={id:'large',content};return s;}));
  const args=await ready(a);
  const frozen=read(a);assert.ok(JSON.stringify(frozen.upgrade.checkpoint).length<200000);
  assert.equal(resolveSnapshotEntry(frozen,frozen.upgrade.checkpoint.records.large).content,content);
  applyAndVerify(args);
  assert.equal(read(a).records.large.content,content);
});

for(const version of ['0.2.0','0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6','0.6.7']) test(`compatible ${version} companies can optionally adopt and recover team definitions`,async()=>{
  const a=setup();withStore(a.root,db=>db.transaction('test.previous_patch',s=>{
    s.schema=2;s.runtime_version=version;s.plugin_version=version;s.cos_instructions='Preserve founder limits and independently review preparation';s.team_sha256=teamHash(s);return s;
  }));
  assert.doesNotThrow(()=>engine.open(a,'codex'));
  const before=read(a),args=await ready(a),done=applyAndVerify(args);
  assert.equal(done.plugin_version,VERSION);assert.equal(done.runtime_version,VERSION);
  for(const key of ['id','governance','notices','extension'])assert.deepEqual(read(a)[key],before[key]);
  for(const [key,value] of Object.entries(before.records))assert.deepEqual(read(a).records[key],value);
  const recovered=upgrade({...a,expected_epoch:done.owner.epoch,upgrade_id:done.upgrade.id,action:'recover',source_instruction:'Recover prior team definitions'},'codex');
  assert.equal(recovered.plugin_version,version);assert.equal(recovered.runtime_version,VERSION);
  for(const key of ['id','governance','cos_instructions','team_sha256','notices','extension'])assert.deepEqual(read(a)[key],before[key]);
  for(const [key,value] of Object.entries(before.records))assert.deepEqual(read(a).records[key],value);
  assert.doesNotThrow(()=>engine.open(a,'codex'));
});


test('company rename cannot change a pending upgrade checkpoint',()=>{
  const a=setup(),p=prepare(a),before=read(a);
  assert.throws(()=>engine.control({...a,action:'rename',expected_epoch:p.owner.epoch,expected_name:before.name,name:'Changed during upgrade',source_instruction:'Rename'},'codex'),/pending team upgrade/);
  assert.deepEqual(read(a),before);
});

test('both roles retrieve exact huge frozen source excerpts through JSON requests in their existing sessions',async()=>{
  const {buildEvidence}=await import('../plugins/soloco/runtime/upgrade-evidence.mjs');
  const a=setup(),body='frozen-source-line\n'.repeat(130000);
  withStore(a.root,db=>db.transaction('test.source',s=>{
    s.records.source={id:'source',kind:'artifact',content:JSON.stringify({file:{path:'src/huge.mjs',content:body},claim:'Source delivery alone does not prove correct implementation'})};
    s.upgrade_history=[{id:'original-failed',status:'failed',error:'input_too_large actual2254398',checkpoint:checkpoint(s),previous:{plugin_version:'0.1.0',governance:s.governance,governance_sha256:s.governance_sha256,roles:s.roles,cos_instructions:'Original retained CoS instructions'},review:{verdict:'Blocked',reason:'Missing evidence is still unresolved'}}];return s;
  }));
  const originalHistory=read(a).upgrade_history;
  const p=prepare(a),state=read(a),u=state.upgrade,subject=buildEvidence(u.checkpoint,originalHistory,{snapshotState:state});
  const source=Object.values(subject.sources).find(s=>s.reason==='typed-file-body');
  const model=modelFor(a),pending=new Map(),requested=new Set(),readCounts={cos:0,qa:0};
  await rehearse(a.root,p.upgrade.id,async(...args)=>{
    const task=JSON.parse(args[2]),role=task.role;
    if(task.phase==='retrieval') {
      assert.equal(args[1],`native-${role}`);
      assert.equal(task.reads[0].text,body.slice(123,123+32000));
      assert.equal(task.reads[0].range_sha256,digest(task.reads[0].text));
      readCounts[role]++;
      const output=pending.get(role),artifact=JSON.parse(output.text),r=task.reads[0];
      artifact.citations.push({source_id:r.source_id,sha256:r.sha256,offset:r.offset,length:r.length,range_sha256:r.range_sha256});
      return {...output,text:JSON.stringify(artifact)};
    }
    const output=await model(...args);
    if(task.phase==='page' && !requested.has(role)) {
      requested.add(role);pending.set(role,output);
      return {...output,text:JSON.stringify({reads:[{source_id:source.source_id,sha256:source.sha256,offset:123,length:32000}]})};
    }
    return output;
  });
  assert.equal(read(a).upgrade.status,'ready',read(a).upgrade.error);
  assert.deepEqual(readCounts,{cos:1,qa:1});
  const delivered=read(a).upgrade.deliveries.filter(d=>d.source_id===source.source_id);
  assert.equal(delivered.length,2);assert.notEqual(delivered[0].session_id,delivered[1].session_id);
  applyAndVerify({...a,upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch});
  assert.equal(read(a).records.source.content,resolveSnapshotEntry(state,u.checkpoint.records.source).content);
  assert.deepEqual(read(a).upgrade_history,originalHistory);
  assert.ok(subject.inventory.entries.some(s=>s.reason==='prior-full-checkpoint-snapshot'));
  assert.ok(subject.inventory.entries.some(s=>s.reason==='prior-team-snapshot'));
  assert.ok(JSON.stringify(subject.handover).includes('input_too_large actual2254398'));
});

test('QA page Blocked cannot be erased by later page and final Pass',async()=>{
  const a=setup();withStore(a.root,db=>db.transaction('test.pages',s=>{s.records.large={id:'large',content:'old unresolved constraint '.repeat(12000)};return s;}));
  const p=prepare(a),model=modelFor(a);let blocked=false,finalPass=false;
  await rehearse(a.root,p.upgrade.id,async(...args)=>{
    const task=JSON.parse(args[2]),result=await model(...args),artifact=JSON.parse(result.text);
    if(task.role==='qa' && task.phase==='page' && !blocked){blocked=true;artifact.review={verdict:'Blocked',reason:'Old obligation has no resolution evidence',permitted_action:'hold',blockers:['Unresolved older obligation']};}
    if(task.role==='qa' && task.phase==='synthesis')finalPass=true;
    return {...result,text:JSON.stringify(artifact)};
  });
  const u=read(a).upgrade;
  assert.ok(finalPass);assert.equal(u.review.artifact.review.verdict,'Pass');assert.equal(u.qa_pages[0].artifact.review.verdict,'Blocked');
  assert.equal(u.status,'failed');assert.match(u.error,/page blocker/);
});

test('history mutation, owner change, checkpoint change and deadline expiry retain late evidence without permission',async()=>{
  for(const selection of [undefined,selected])for(const change of ['history','owner','checkpoint','deadline','candidate']) {
    const a=setup(),p=prepare(a,'codex',selection?{model_selection:selection}:{}),model=modelFor(a),now=Date.now;
    let calls=0;
    try {
      await rehearse(a.root,p.upgrade.id,async(...args)=>{
        calls++;const output=await model(...args);
        if(change==='deadline')Date.now=()=>now()+46*60*1000;
        else withStore(a.root,db=>db.transaction('test.stale',s=>{
          if(change==='history')s.upgrade_history=[{id:'late-history',error:'Retained'}];
          if(change==='owner')s.owner.epoch++;
          if(change==='checkpoint')s.messages.push({id:'late-message',content:'Founder says hold'});
          if(change==='candidate')s.upgrade.candidate.cos_instructions+=' late alteration';
          return s;
        }));
        return output;
      });
    } finally {Date.now=now;}
    const u=read(a).upgrade;
    assert.equal(calls,1);assert.equal(u.status,'failed',change);assert.equal(u.calls.length,1);
    assert.equal(u.calls[0].native_id,'native-cos');assert.ok(u.calls[0].text.includes('Recovered objectives'));
    assert.equal(u.cos_pages.length,0);
  }
});

test('bound full prior history survives apply and verify and cannot disappear through references',async()=>{
  for(const phase of ['apply','verify']) {
    const a=setup();withStore(a.root,db=>db.transaction('test.history',s=>{s.upgrade_history=[{id:'failed-original',error:'input_too_large',review:{verdict:'Blocked',reason:'Never accepted'}}];return s;}));
    const args=await ready(a);
    if(phase==='verify')args.expected_epoch=upgrade({...args,action:'apply'},'codex').owner.epoch;
    withStore(a.root,db=>db.transaction('test.erase-history',s=>{s.upgrade_history=[];return s;}));
    assert.throws(()=>upgrade({...args,action:phase},'codex'),/history/);
  }
});

test('45 minute deadline is consistent with status; old attempts retain seven minute fallback',()=>{
  for(const legacy of [false,true]) {
    const a=setup(),p=prepare(a);
    withStore(a.root,db=>db.transaction('test.old-created',s=>{s.upgrade.created_at=new Date(Date.now()-8*60*1000).toISOString();if(legacy){delete s.upgrade.deadline_ms;delete s.upgrade.review_deadline_policy;}return s;}));
    assert.equal(engine.status(a,'codex').upgrade.status,legacy?'failed':'queued');
    assert.equal(read(a).upgrade.id,p.upgrade.id);
  }
});

test('native page calls use the selected ceiling capped by the unchanged rehearsal deadline',async()=>{
  for(const cap of [10,30])for(const window of [45,90,'legacy-stored','legacy-fallback']) {
    const a=setup(),p=prepare(a,'codex',{call_timeout_minutes:cap,...(typeof window==='number'?{review_window_minutes:window}:{})}),model=modelFor(a),now=Date.now;
    if(typeof window==='string')withStore(a.root,db=>db.transaction('test.legacy_window',s=>{
      delete s.upgrade.review_deadline_policy;delete s.upgrade.review_window_minutes;
      if(window==='legacy-fallback')delete s.upgrade.deadline_ms;
      return s;
    }));
    const original=read(a).upgrade;
    const originalDeadline=original.deadline_ms??Date.parse(original.created_at)+420000;
    let calls=0;
    try {
      Date.now=()=>originalDeadline-(window==='legacy-fallback'?420000:45*60*1000);
      await rehearse(a.root,p.upgrade.id,async(...args)=>{
        const task=JSON.parse(args[2]);
        assert.equal(args[4],calls===0?(window==='legacy-fallback'?420000:cap*60000):90000);
        assert.equal(task.authority.deadline_ms,originalDeadline);
        assert.equal(args[5],null);
        assert.equal(args[6].timeoutReason,'Runtime execution ceiling capped by remaining immutable upgrade rehearsal deadline');
        assert.equal(args[6].signal.aborted,false);
        if(calls++===0) {
          assert.equal(task.phase,'page');assert.equal(args[1],null);
          Date.now=()=>originalDeadline-90000;
        }
        return model(...args);
      });
    } finally {Date.now=now;}
    const u=read(a).upgrade;
    assert.ok(calls>1);assert.equal(u.status,'ready',u.error);
    assert.equal(u.deadline_ms,original.deadline_ms);
    assert.equal(u.review_window_minutes,original.review_window_minutes);
  }
});

test('native timeout remains held with its evidence and cannot restart the failed rehearsal',async()=>{
  const a=setup(),p=prepare(a);let calls=0;
  await rehearse(a.root,p.upgrade.id,async(...args)=>{
    calls++;assert.equal(args[4],MAX_EXECUTION_TIMEOUT_MS);
    throw new Error('Role session timed out; held for inspection, not automatically retried');
  });
  const failed=read(a).upgrade;
  assert.equal(failed.status,'failed');assert.match(failed.error,/timed out/);
  assert.equal(failed.calls.length,1);assert.equal(failed.calls[0].error,failed.error);
  assert.equal(failed.cos_pages.length,0);
  await rehearse(a.root,p.upgrade.id,async()=>{calls++;});
  assert.equal(calls,1);assert.equal(read(a).upgrade.status,'failed');
  assert.deepEqual(read(a).upgrade.calls,failed.calls);
  assert.throws(()=>upgrade({...a,action:'apply',upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch},'codex'),/passing continuity review/);
});

test('immutable rehearsal deadline aborts an active native call and holds adoption',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const a=setup(),p=prepare(a),now=Date.now,originalDeadline=read(a).upgrade.deadline_ms;
  let calls=0;
  try {
    Date.now=()=>originalDeadline-30000;
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      calls++;assert.equal(args[4],30000);
      const signal=args[6].signal;
      const pending=new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Native call cancelled at immutable deadline')),{once:true}));
      Date.now=()=>originalDeadline;
      t.mock.timers.tick(30000);
      assert.equal(signal.aborted,true);
      return pending;
    });
  } finally {Date.now=now;t.mock.timers.reset();}
  const u=read(a).upgrade;
  assert.equal(calls,1);assert.equal(u.status,'failed');assert.match(u.error,/cancelled/);
  assert.equal(u.deadline_ms,originalDeadline);assert.equal(u.calls.length,1);
  assert.equal(u.cos_pages.length,0);
});

test('unexpected native identity changes fail without silent restart',async()=>{
  const a=setup(),p=prepare(a),model=modelFor(a);let calls=0;
  await rehearse(a.root,p.upgrade.id,async(...args)=>{const result=await model(...args);return {...result,native_id:++calls===2?'unexpected-native':result.native_id};});
  const u=read(a).upgrade;assert.equal(u.status,'failed');assert.match(u.error,/identity change/);assert.equal(calls,2);assert.equal(u.calls[1].native_id,'unexpected-native');
});

test('tool-less protocol copies every citation only from actual prompt metadata and batches small findings into one replay per role',async()=>{
  const a=setup();withStore(a.root,db=>db.transaction('test.prompt-only',s=>{
    s.records.large={id:'large',content:'Keep old founder limits and unresolved obligations visible. '.repeat(7000)};return s;
  }));
  const p=prepare(a),model=modelFor(a),allowed={cos:[],qa:[]},replayed={cos:[],qa:[]};let fullPage=false;
  await rehearse(a.root,p.upgrade.id,async(...args)=>{
    const prompt=JSON.parse(args[2]),role=prompt.role;
    if(prompt.page) {
      fullPage ||= prompt.page.length===120000;
      for(const range of prompt.page.citation_ranges) {
        assert.ok(range.length<=32768);
        allowed[role].push({source_id:prompt.page.source_id,sha256:prompt.page.sha256,...range});
      }
    }
    if(prompt.phase==='replay')replayed[role].push(prompt.findings.map(f=>f.page_id));
    const output=await model(...args),artifact=JSON.parse(output.text);
    // The fake model above uses only JSON from its prompt and its own memory:
    // no frozen subject, private read API, hash computation or fixture source IDs.
    for(const citation of artifact.citations)assert.ok(allowed[role].some(value=>JSON.stringify(value)===JSON.stringify(citation)));
    if(role==='qa' && prompt.phase==='page') {
      assert.equal(prompt.required_review.scope,'page');
      assert.equal(prompt.required_review.pass_permitted_action,'continue_upgrade_review');
      assert.equal(artifact.review.permitted_action,'continue_upgrade_review');
      assert.equal(read(a).upgrade.status,'checking');
    }
    if(role==='qa' && prompt.phase==='synthesis') {
      assert.equal(prompt.required_review.scope,'final');
      assert.equal(artifact.review.permitted_action,'apply_preparation_team');
    }
    return output;
  });
  const u=read(a).upgrade;
  assert.equal(u.status,'ready',u.error);assert.ok(fullPage);assert.ok(u.evidence.pages.length>1);
  for(const role of ['cos','qa']) {
    assert.equal(replayed[role].length,1);
    assert.deepEqual(replayed[role][0],u[`${role}_pages`].map(f=>f.page_id));
    const receipts=u.replays.filter(receipt=>receipt.role===role);
    assert.equal(receipts.length,1);assert.deepEqual(receipts[0].page_ids,replayed[role][0]);
    assert.equal(receipts[0].findings_sha256,digest(JSON.stringify(u[`${role}_pages`])));
  }
  applyAndVerify({...a,upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch});
});

test('QA page adoption permission and final continuation permission both fail closed',async()=>{
  for(const phase of ['page','synthesis']) {
    const a=setup(),p=prepare(a),model=modelFor(a);
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      const task=JSON.parse(args[2]),output=await model(...args),artifact=JSON.parse(output.text);
      if(task.role==='qa' && task.phase===phase)artifact.review.permitted_action=phase==='page'?'apply_preparation_team':'continue_upgrade_review';
      return {...output,text:JSON.stringify(artifact)};
    });
    const u=read(a).upgrade;
    assert.equal(u.status,'failed');assert.match(u.error,new RegExp(phase==='page'?'continue_upgrade_review':'apply_preparation_team'));
    assert.throws(()=>upgrade({...a,action:'apply',upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch},'codex'),/passing continuity/);
  }
});

test('apply rechecks QA page permission and complete replay receipts',async()=>{
  for(const corruption of ['page-permission','replay']) {
    const a=setup(),args=await ready(a);
    withStore(a.root,db=>db.transaction('test.corrupt-evidence',s=>{
      if(corruption==='page-permission')s.upgrade.qa_pages[0].artifact.review.permitted_action='apply_preparation_team';
      else s.upgrade.replays=s.upgrade.replays.filter(receipt=>receipt.role!=='qa');
      return s;
    }));
    assert.throws(()=>upgrade({...args,action:'apply'},'codex'),corruption==='page-permission'?/continue_upgrade_review/:/replay coverage/);
    assert.equal(read(a).plugin_version,'0.1.0');
  }
});

test('large replay batches deliver every durable finding and preserve the union of QA page blockers',async()=>{
  const a=setup();withStore(a.root,db=>db.transaction('test.large-replay',s=>{
    s.records.large={id:'large',content:'Historical founder obligation remains binding. '.repeat(70000)};return s;
  }));
  const p=prepare(a),model=modelFor(a);
  const replayed={cos:[],qa:[]};let qaPages=0;
  await rehearse(a.root,p.upgrade.id,async(...args)=>{
    const task=JSON.parse(args[2]),role=task.role;
    assert.ok(args[2].length+RESPONSE_RESERVE<=REQUEST_LIMIT);
    if(task.phase==='replay')replayed[role].push(task.findings);
    const output=await model(...args),artifact=JSON.parse(output.text);
    if(task.phase==='page') {
      artifact.content+=' Preserve every unresolved founder constraint.'.repeat(350);
      for(const key of ['constraints','unresolved_work','next_action'])artifact.continuity[key].text+=' Retain this old obligation pending explicit resolution.'.repeat(110);
      if(role==='qa' && qaPages++<2)artifact.review={verdict:qaPages===1?'Blocked':'Fail',
        reason:'An older constraint is unresolved',permitted_action:'hold',blockers:[`Unresolved page obligation ${qaPages}`]};
    }
    const text=JSON.stringify(artifact);assert.ok(text.length<=40000);
    return {...output,text};
  });
  const u=read(a).upgrade;
  assert.equal(u.status,'failed');assert.match(u.error,/page blocker/);
  assert.equal(u.review.artifact.review.verdict,'Pass');
  assert.deepEqual(u.qa_pages.flatMap(f=>f.artifact.review.blockers),['Unresolved page obligation 1','Unresolved page obligation 2']);
  for(const role of ['cos','qa']) {
    assert.ok(replayed[role].length>1,`${role} needed more than one bounded batch`);
    assert.ok(replayed[role].some(batch=>batch.length>1));
    assert.deepEqual(replayed[role].flat(),u[`${role}_pages`]);
    const receipts=u.replays.filter(r=>r.role===role);
    assert.equal(receipts.length,replayed[role].length);
    receipts.forEach((receipt,index)=>{
      assert.deepEqual(receipt.page_ids,replayed[role][index].map(f=>f.page_id));
      assert.equal(receipt.findings_sha256,digest(JSON.stringify(replayed[role][index])));
      assert.equal(receipt.native_id,`native-${role}`);
    });
  }
});

function corruptSavedCheckpoint(s,mode='saved') {
  const u=s.upgrade,intent=Object.values(s.records).find(record=>record.kind==='intent');
  if(mode!=='pin')delete u.checkpoint.records[intent.id];
  if(mode==='pin')u.checkpoint_sha256='0'.repeat(64);
  if(mode==='repinned')u.checkpoint_sha256=digest(JSON.stringify(u.checkpoint));
  return s;
}

test('corrupted saved checkpoint is rejected before any native call while authoritative intent remains',async()=>{
  const a=setup(),p=prepare(a),model=modelFor(a);let calls=0;
  const original=read(a),intent=Object.values(original.records).find(record=>record.kind==='intent');
  withStore(a.root,db=>db.transaction('test.saved-checkpoint-corruption',s=>corruptSavedCheckpoint(s)));
  await rehearse(a.root,p.upgrade.id,async(...args)=>{calls++;return model(...args);});
  const s=read(a);
  assert.equal(calls,0);assert.equal(s.upgrade.status,'failed');assert.match(s.upgrade.error,/Saved upgrade checkpoint/);
  assert.deepEqual(s.records[intent.id],intent);assert.equal(s.upgrade.checkpoint_sha256,original.upgrade.checkpoint_sha256);
});

test('saved checkpoint corruption and changed pins during calls retain late evidence but never authorize adoption',async()=>{
  for(const mode of ['saved','pin','repinned']) {
    const a=setup(),p=prepare(a),model=modelFor(a);let calls=0;
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      calls++;const output=await model(...args);
      withStore(a.root,db=>db.transaction('test.corrupt-returned-checkpoint',s=>corruptSavedCheckpoint(s,mode)));
      return output;
    });
    const s=read(a),u=s.upgrade;
    assert.equal(calls,1);assert.equal(u.status,'failed');assert.match(u.error,/Saved upgrade checkpoint/);
    assert.equal(u.calls.length,1);assert.equal(u.calls[0].native_id,'native-cos');assert.ok(u.calls[0].text.includes('Recovered objectives'));
    assert.equal(u.cos_pages.length,0);assert.ok(Object.values(s.records).some(record=>record.kind==='intent'));
    assert.throws(()=>upgrade({...a,action:'apply',upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch},'codex'),/Saved upgrade checkpoint/);
  }
});

test('retrieval return rechecks the saved checkpoint and retains the held source response',async()=>{
  const a=setup(),p=prepare(a),model=modelFor(a);let calls=0,pending;
  await rehearse(a.root,p.upgrade.id,async(...args)=>{
    calls++;const task=JSON.parse(args[2]);
    if(task.phase==='page') {
      pending=await model(...args);
      return {...pending,text:JSON.stringify({reads:[{source_id:task.page.source_id,sha256:task.page.sha256,
        offset:task.page.offset,length:Math.min(task.page.length,32000)}]})};
    }
    assert.equal(task.phase,'retrieval');assert.equal(args[1],'native-cos');assert.ok(task.reads[0].text);
    withStore(a.root,db=>db.transaction('test.corrupt-during-read',s=>corruptSavedCheckpoint(s)));
    return pending;
  });
  const u=read(a).upgrade;
  assert.equal(calls,2);assert.equal(u.status,'failed');assert.match(u.error,/Saved upgrade checkpoint/);
  assert.equal(u.calls.length,2);assert.ok(u.calls[1].text.includes('Recovered objectives'));assert.equal(u.cos_pages.length,0);
});

test('apply and verify reject saved checkpoint corruption or a repinned checkpoint',async()=>{
  for(const action of ['apply','verify'])for(const mode of ['saved','pin','repinned']) {
    const a=setup(),args=await ready(a),original=read(a),intent=Object.values(original.records).find(record=>record.kind==='intent');
    assert.equal(original.upgrade.evidence.checkpoint_sha256,original.upgrade.checkpoint_sha256);
    if(action==='verify')args.expected_epoch=upgrade({...args,action:'apply'},'codex').owner.epoch;
    withStore(a.root,db=>db.transaction('test.corrupt-before-adoption-readback',s=>corruptSavedCheckpoint(s,mode)));
    assert.throws(()=>upgrade({...args,action},'codex'),/Saved upgrade checkpoint/);
    assert.deepEqual(read(a).records[intent.id],intent);assert.equal(read(a).paused,true);
    assert.equal(read(a).upgrade.status,action==='apply'?'ready':'applied');
  }
});

test('recovery remains available for a corrupted saved checkpoint and retains later business facts',async()=>{
  const a=setup(),p=prepare(a),original=read(a);
  withStore(a.root,db=>db.transaction('test.corrupt-recoverable-checkpoint',s=>corruptSavedCheckpoint(s)));
  await rehearse(a.root,p.upgrade.id,modelFor(a));
  withStore(a.root,db=>db.transaction('test.later-fact',s=>{
    s.records.later={id:'later',kind:'artifact',content:'Late quarantined business evidence',status:'Quarantined'};return s;
  }));
  const recovered=upgrade({...a,action:'recover',upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch,source_instruction:'Recover prior definitions; preserve all later evidence'},'codex');
  const s=read(a);assert.equal(recovered.upgrade.status,'recovered');
  assert.equal(s.plugin_version,original.upgrade.previous.plugin_version);assert.equal(s.runtime_version,VERSION);
  assert.equal(s.records.later.content,'Late quarantined business evidence');assert.match(s.upgrade.error,/Saved upgrade checkpoint/);
  for(const [key,value]of Object.entries(original.records))assert.deepEqual(s.records[key],value);
  assert.deepEqual(s.roles,original.upgrade.previous.roles);assert.equal(s.governance,original.governance);
});

test('actual prompt contracts produce valid page, replay, synthesis and reads-only responses on both roles',async()=>{
  const a=setup(),p=prepare(a),requested=new Set(),seen=new Set(),contracts=new Map();let calls=0;
  await rehearse(a.root,p.upgrade.id,async(_host,native,prompt)=>{
    calls++;
    const task=JSON.parse(prompt),contract=task.response_contract,phase=task.resume_phase??task.phase,role=task.role;
    const key=`${role}:${phase}`;seen.add(`${role}:${task.phase}:${phase}`);
    assert.equal(contract.phase,phase);
    assert.match(task.instructions,/REQUIRED top-level content must be a string and citations must be an array/);
    assert.match(task.instructions,/nested findings array cannot replace them/);
    const expectedFields=['content','citations',...(phase==='synthesis'?['continuity']:[]),...(role==='qa'&&phase!=='replay'?['review']:[])];
    assert.deepEqual(contract.required_top_level_fields,expectedFields);
    assert.deepEqual(Object.keys(contract.required_json_shape),expectedFields);
    assert.deepEqual(Object.keys(contract.reads_only_shape),['reads']);
    for(const request of contract.reads_only_shape.reads) {
      assert.deepEqual(Object.keys(request),['source_id','sha256','offset','length']);
      assert.ok(request.length<=32768);
    }
    const nativeId=`contract-native-${role}`;
    if(native!==null)assert.equal(native,nativeId);
    if(task.phase!=='retrieval') {
      assert.ok(!requested.has(key));requested.add(key);contracts.set(key,structuredClone(contract));
      if(task.page)assert.deepEqual(contract.required_json_shape.citations[0],{
        source_id:task.page.source_id,sha256:task.page.sha256,...task.page.citation_ranges[0]
      });
      return {native_id:nativeId,text:JSON.stringify(contract.reads_only_shape)};
    }
    assert.equal(task.resume_phase,phase);assert.ok(task.reads[0].text);
    assert.deepEqual(contract,contracts.get(key));
    assert.equal(task.reads[0].range_sha256,contract.required_json_shape.citations[0].range_sha256);
    // Populate only the supplied contract. Citation IDs/hashes/ranges are copied
    // from the actual prompt; the fake has no subject, private reads or crypto.
    const artifact=structuredClone(contract.required_json_shape);
    artifact.content=phase==='replay'?'Retained every batch finding and unresolved blocker without changing earlier reviews.':
      'Recovered binding founder limits, unresolved customer-data hold and failed review from the supplied evidence.';
    if(phase==='synthesis') {
      assert.equal(artifact.continuity.company_id,task.authority.company_id);
      assert.equal(artifact.continuity.checkpoint_sha256,task.authority.checkpoint_sha256);
      assert.equal(artifact.continuity.inventory_sha256,task.authority.inventory_sha256);
      artifact.continuity.constraints.text='Preparation only; five founder hours per week and the agreed budget remain binding.';
      artifact.continuity.unresolved_work.text='The failed review and customer-data hold remain unresolved and require evidence.';
      artifact.continuity.next_action.text='Guarded preparation-team adoption and separate readback may precede any authorized resume; business execution stays prohibited.';
    }
    if(role==='qa'&&phase!=='replay') {
      assert.equal(contract.review_rules.Pass.permitted_action,phase==='page'?'continue_upgrade_review':'apply_preparation_team');
      for(const verdict of ['Fail','Blocked'])assert.equal(contract.review_rules[verdict].permitted_action,'hold');
      artifact.review={verdict:'Pass',reason:'Compared the supplied evidence, retained all unresolved limits, and checked this precise review scope.',...contract.review_rules.Pass};
    } else {assert.equal(artifact.review,undefined);assert.equal(contract.review_rules,undefined);}
    return {native_id:nativeId,text:JSON.stringify(artifact)};
  });
  const u=read(a).upgrade;
  assert.equal(u.status,'ready',u.error);assert.equal(calls,12);assert.equal(requested.size,6);
  for(const role of ['cos','qa'])for(const phase of ['page','replay','synthesis']) {
    assert.ok(seen.has(`${role}:${phase}:${phase}`));assert.ok(seen.has(`${role}:retrieval:${phase}`));
  }
  assert.equal(u.replays.length,2);assert.notEqual(u.probe.native_id,u.review.native_id);
  applyAndVerify({...a,upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch});
});

test('nested findings alone, uncited replay and incomplete synthesis remain held with their exact invalid output retained',async()=>{
  for(const phase of ['page','replay','synthesis']) {
    const a=setup(),p=prepare(a),model=modelFor(a);let invalid,calls=0;
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      calls++;const task=JSON.parse(args[2]),output=await model(...args),artifact=JSON.parse(output.text);
      if(task.role==='cos'&&task.phase===phase) {
        if(phase==='page')invalid={page_id:task.page.page_id,role:task.role,
          findings:[{text:artifact.content,citations:artifact.citations}],next_action:artifact.continuity.next_action};
        else {invalid=artifact;delete invalid[phase==='replay'?'citations':'continuity'];}
        return {...output,text:JSON.stringify(invalid)};
      }
      return output;
    });
    const u=read(a).upgrade;
    assert.equal(u.status,'failed');assert.equal(calls,phase==='page'?1:phase==='replay'?2:3);
    assert.deepEqual(JSON.parse(u.calls.at(-1).text),invalid);
    assert.equal(u.probe_native_id,'native-cos');assert.equal(u.reviewer_native_id,undefined);
    assert.match(u.error,phase==='page'?/Role must return nonempty content/:phase==='replay'?/citations must be a nonempty array/:/Incomplete rehearsal coverage/);
    if(phase==='page')assert.equal(u.cos_pages.length,0);
    if(phase==='replay')assert.equal(u.replays.length,0);
    assert.throws(()=>upgrade({...a,action:'apply',upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch},'codex'),/passing continuity/);
  }
});


test('inspect compares identical current inputs including terminal history without authoritative transactions or external calls', async () => {
  const { buildEvidence, evidencePage } = await import('../plugins/soloco/runtime/upgrade-evidence.mjs');
  for (const status of ['recovered', 'completed']) {
    const a = setup();
    withStore(a.root, db => db.transaction('test.preview', s => {
      const artifact = { content: 'Fictional long historical unresolved finding. '.repeat(320), unknown: 'Keep unknown field' };
      s.upgrade_history = [{ id: 'older-fail', status: 'failed', review: { verdict: 'Fail', reason: 'Keep failure' } }];
      s.upgrade = { id: 'terminal', status, previous: { plugin_version: '0.1.0' }, candidate: { plugin_version: VERSION }, cos_pages: [{ native_id: 'old-cos', artifact }],
        calls: [{ role: 'cos', phase: 'page', native_id: 'old-cos', text: JSON.stringify(artifact, null, 2) }] };
      return s;
    }));
    const before = read(a), events = () => withStore(a.root, db => db.db.prepare('SELECT * FROM events ORDER BY seq').all());
    const oldEvents = events(), transaction = Store.prototype.transaction;
    const forbidden = () => { throw new Error('Inspect must not call this'); };
    let inspection;
    Store.prototype.transaction = forbidden;
    try { inspection = upgrade({ ...a, action: 'inspect' }, 'codex', { launch: forbidden, check: forbidden, catalog: forbidden }); }
    finally { Store.prototype.transaction = transaction; }
    assert.deepEqual(read(a), before); assert.deepEqual(events(), oldEvents);
    const shallow=shallowSnapshotHistory(before),history = [...shallow.upgrade_history, shallow.upgrade], input = checkpoint(before);
    const baseline = buildEvidence(input, history, { wholeBodyAliases: false,snapshotState:before }), candidate = buildEvidence(input, history,{currentState:true,checkpointContinuity:true,snapshotState:before,contextState:before});
    const metrics = subject => {
      const stream = subject.pages.map(page => evidencePage(subject, page).text).join('');
      return { format: subject.handover.format, checkpoint_sha256: digest(JSON.stringify(input)),
        history_sha256: digest(JSON.stringify(history)), stream_sha256: digest(stream), stream_characters: stream.length, pages: subject.pages.length };
    };
    const preview = inspection.projection_preview;
    assert.deepEqual(preview.baseline, metrics(baseline)); assert.deepEqual(preview.candidate, metrics(candidate));
    assert.equal(preview.current_upgrade_included, true); assert.equal(preview.prepare_adds_decision_record, true);
    assert.equal(preview.exact_reservation, false); assert.equal(preview.time_forecast, false);
    assert.equal(preview.matched_bodies, 1); assert.equal(preview.matched_occurrences, 2); assert.equal(preview.aliased_occurrences, 1);
    assert.equal(preview.net_characters_saved, preview.baseline.stream_characters - preview.candidate.stream_characters);
    assert.ok(!JSON.stringify(preview).includes('Fictional long historical'));
  }
});

test('aliased historical Fail and Blocked remain intact through independent paging, apply, verify and recovery guards', async () => {
  const a = setup();
  withStore(a.root, db => db.transaction('test.alias-history', s => {
    s.upgrade_history = ['Fail', 'Blocked'].map((verdict, i) => {
      const artifact = { content: 'Fictional earlier unresolved obligation. '.repeat(300),
        review: { verdict, permitted_action: 'hold', reason: 'Unresolved historical failure', blockers: [`Blocker ${i}`] } };
      return { id: `old-${i}`, status: 'failed', calls: [{ role: 'qa', phase: 'synthesis', native_id: `old-qa-${i}`, text: JSON.stringify(artifact, null, 2) }],
        review: { native_id: `old-qa-${i}`, artifact } };
    }); return s;
  }));
  const originalHistory = read(a).upgrade_history, originalRoles = read(a).roles;
  const p = prepare(a), model = modelFor(a), delivered = { cos: [], qa: [] };
  await rehearse(a.root, p.upgrade.id, async (...args) => {
    const task = JSON.parse(args[2]);
    assert.equal(task.protocol, 'soloco-upgrade-pages-v2');
    assert.match(task.instructions, /Alias delivery does not deliver its target body or original source/);
    assert.match(task.instructions, /Keep findings page-specific/);
    if (task.phase === 'page') delivered[task.role].push(task.page.page_id);
    return model(...args);
  });
  const checked = read(a);
  assert.equal(checked.upgrade.status, 'ready', checked.upgrade.error);
  assert.equal(checked.upgrade.evidence.counts.aliased_occurrences, 2);
  const ids = checked.upgrade.evidence.pages.map(page => page.page_id);
  assert.deepEqual(delivered.cos, ids); assert.deepEqual(delivered.qa, ids);
  assert.notEqual(checked.upgrade.probe.native_id, checked.upgrade.review.native_id);
  assert.deepEqual(checked.upgrade_history, originalHistory); assert.deepEqual(checked.roles, originalRoles);
  const args = { ...a, upgrade_id: p.upgrade.id, expected_epoch: p.owner.epoch };
  assert.throws(() => upgrade({ ...args, action: 'apply', expected_epoch: p.owner.epoch - 1 }, 'codex'), /epoch/);
  const applied = upgrade({ ...args, action: 'apply' }, 'codex');
  upgrade({ ...args, expected_epoch: applied.owner.epoch, action: 'verify' }, 'codex');
  assert.deepEqual(read(a).upgrade_history, originalHistory);
  const recovered = upgrade({ ...args, expected_epoch: applied.owner.epoch, action: 'recover', source_instruction: 'Recover fictional candidate definitions' }, 'codex');
  assert.equal(recovered.upgrade.status, 'recovered');
  assert.deepEqual(read(a).roles, originalRoles); assert.deepEqual(read(a).upgrade_history, originalHistory);
  assert.deepEqual(read(a).upgrade_history.map(h => h.review.artifact.review.verdict), ['Fail', 'Blocked']);
  assert.equal(read(a).records.failed.review.verdict, 'Fail');
});


test('fresh attempts persist the exact call ceiling; legacy absence retains ten minutes',async()=>{
  for(const choice of [undefined,10,30,'legacy']) {
    const a=setup(),p=prepare(a,'codex',{review_window_minutes:null,...(typeof choice==='number'?{call_timeout_minutes:choice}:{})});
    if(choice==='legacy')withStore(a.root,db=>db.transaction('test.legacy_cap',s=>{
      delete s.upgrade.call_timeout_minutes;delete s.upgrade.evidence.call_timeout_minutes;return s;
    }));
    else {
      assert.equal(read(a).upgrade.call_timeout_minutes,choice??10);
      assert.equal(read(a).upgrade.evidence.call_timeout_minutes,choice??10);
      assert.equal(exactSource(a,'codex',p.upgrade.source).call_timeout_minutes,choice??10);
    }
    const model=modelFor(a);let calls=0;
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      calls++;assert.equal(args[4],choice===30?1800000:600000);
      assert.equal(args[6].timeoutContext,'upgrade-call');return model(...args);
    });
    assert.ok(calls>1);assert.equal(read(a).upgrade.status,'ready',read(a).upgrade.error);
  }
});

test('call ceiling cannot change while queued, during review, before apply or verify',async()=>{
  for(const stage of ['queued','call','apply','verify'])for(const value of [30,null,'30',undefined]) {
    const a=setup(),p=prepare(a),model=modelFor(a);let calls=0;
    const mutate=()=>withStore(a.root,db=>db.transaction('test.changed_cap',s=>{
      if(value===undefined)delete s.upgrade.call_timeout_minutes;
      else s.upgrade.call_timeout_minutes=value;
      return s;
    }));
    if(stage==='queued')mutate();
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      calls++;const output=await model(...args);if(stage==='call')mutate();return output;
    });
    if(['queued','call'].includes(stage)) {
      assert.equal(calls,stage==='queued'?0:1);
      assert.equal(read(a).upgrade.status,'failed');
      assert.match(read(a).upgrade.error,/call timeout policy/);
      const before=calls;await rehearse(a.root,p.upgrade.id,async()=>{calls++;});assert.equal(calls,before);
    } else {
      assert.equal(read(a).upgrade.status,'ready',read(a).upgrade.error);
      let args={...a,upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch};
      if(stage==='verify')args.expected_epoch=upgrade({...args,action:'apply'},'codex').owner.epoch;
      mutate();assert.throws(()=>upgrade({...args,action:stage},'codex'),/call timeout policy/);
    }
  }
});

test('frozen call ceiling rejects a stale response even if stored evidence is also rewritten',async()=>{
  const a=setup(),p=prepare(a),model=modelFor(a);let calls=0;
  await rehearse(a.root,p.upgrade.id,async(...args)=>{
    calls++;const output=await model(...args);
    withStore(a.root,db=>db.transaction('test.stale_cap',s=>{
      s.upgrade.call_timeout_minutes=30;s.upgrade.evidence.call_timeout_minutes=30;return s;
    }));return output;
  });
  assert.equal(calls,1);assert.equal(read(a).upgrade.status,'failed');
  assert.equal(read(a).upgrade.calls.length,1);assert.equal(read(a).upgrade.cos_pages.length,0);
});

test('large final envelopes pass guarded rehearsal with exact QA input and actual traffic accounting',async()=>{
  for(const size of [47445,90001]) {
    const a=setup(),p=prepare(a),model=modelFor(a),prompts=[],finals={};
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      const task=JSON.parse(args[2]);prompts.push(args[2]);
      assert.equal(task.response_contract.content_target_characters,20000);
      assert.equal(task.response_contract.content_max_characters,undefined);
      assert.doesNotMatch(task.instructions,/Total response <=/);
      assert.match(task.instructions,/planning reserve is not an acceptance ceiling/);
      if(task.role==='qa' && task.phase!=='replay')assert.deepEqual(task.proposed_handover,finals.cos);
      const output=await model(...args);
      if(task.phase!=='synthesis')return output;
      const artifact=JSON.parse(output.text);
      // Escaping and structured continuity add to the whole JSON independently
      // of the concise content target. Every field remains structurally valid.
      for(const field of Object.values(artifact.continuity))if(field?.text) {
        field.text+=size===47445?' "quoted" \\ provenance 😀'.repeat(330):' "\\'.repeat(3900);
        assert.ok(field.text.length<=12000);
      }
      const remaining=size-JSON.stringify(artifact).length;
      assert.ok(remaining>0);
      artifact.content+='"'.repeat(Math.floor(remaining/2))+(remaining%2?'x':'');
      const text=JSON.stringify(artifact);
      assert.equal(text.length,size);
      assert.ok(artifact.content.length<=20000);
      finals[task.role]=artifact;
      return {...output,text};
    });
    const u=read(a).upgrade;
    assert.equal(u.status,'ready',u.error);
    assert.equal(u.cos_pages.length,u.evidence.pages.length);
    assert.equal(u.qa_pages.length,u.evidence.pages.length);
    assert.deepEqual(u.replays.map(r=>r.role),['cos','qa']);
    let used={cos:0,qa:0};
    u.calls.forEach((call,index)=>{
      assert.equal(call.budget.prompt_characters,prompts[index].length);
      assert.equal(call.budget.used_before,used[call.role]);
      assert.equal(call.budget.response_reserve,80000);
      assert.equal(call.response_characters,call.text.length);
      used[call.role]+=prompts[index].length+call.text.length;
      if(call.phase==='synthesis')assert.equal(call.response_characters,size);
    });
    assert.notEqual(u.probe.native_id,u.review.native_id);
    assert.equal(read(a).plugin_version,'0.1.0'); // preparation only
  }
});

test('large final reports still hold on malformed JSON, invalid citations, continuity, independence and non-Pass',async()=>{
  for(const corruption of ['json','citation','continuity','independence','Fail','Blocked','content-bound','continuity-bound']) {
    const a=setup(),p=prepare(a),model=modelFor(a);let invalid;
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      const task=JSON.parse(args[2]),output=await model(...args);
      if(task.role!=='qa'||task.phase!=='synthesis')return output;
      const artifact=JSON.parse(output.text);
      if(corruption==='citation')artifact.citations[0].range_sha256='0'.repeat(64);
      if(corruption==='continuity')artifact.continuity.inventory_sha256='0'.repeat(64);
      if(corruption==='content-bound')artifact.content='x'.repeat(100001);
      if(corruption==='continuity-bound')artifact.continuity.constraints.text='x'.repeat(12001);
      if(['Fail','Blocked'].includes(corruption))artifact.review={verdict:corruption,reason:'Fictional unresolved obligation remains binding',permitted_action:'hold',blockers:['Retain the earlier failed review']};
      invalid=corruption==='json'?'{'+' '.repeat(90000):JSON.stringify(artifact).padEnd(90001,' ');
      return {...output,text:invalid,...(corruption==='independence'?{native_id:'native-cos'}:{})};
    });
    const u=read(a).upgrade;
    assert.equal(u.status,'failed',corruption);
    const errors={json:/JSON/,citation:/citation range hash/,continuity:/Incomplete rehearsal coverage/,independence:/identity change|author session/,Fail:/Fail:/,Blocked:/Blocked:/,'content-bound':/content under 100000/,'continuity-bound':/bounded explanation/};
    assert.match(u.error,errors[corruption]);
    assert.equal(u.calls.at(-1).text,invalid);
    assert.equal(u.calls.at(-1).response_characters,invalid.length);
    assert.equal(read(a).plugin_version,'0.1.0');
    assert.throws(()=>upgrade({...a,action:'apply',upgrade_id:p.upgrade.id,expected_epoch:p.owner.epoch},'codex'),/passing continuity/);
  }
});

test('complete large actual author report holds before QA dispatch when request plus reserve cannot fit',async()=>{
  const a=setup(),p=prepare(a),model=modelFor(a);let author,qaCalls=0;
  await rehearse(a.root,p.upgrade.id,async(...args)=>{
    const task=JSON.parse(args[2]);if(task.role==='qa')qaCalls++;
    const output=await model(...args);
    if(task.role!=='cos'||task.phase!=='synthesis')return output;
    const artifact=JSON.parse(output.text);
    // A permitted extension models a complete detailed report; neither the
    // parser nor the new planning reserve imposes a whole-envelope cap.
    artifact.supporting_findings='Fictional cited obligation "quoted" \\ remains unresolved. '.repeat(16000);
    author=JSON.stringify(artifact);
    assert.ok(author.length>REQUEST_LIMIT-RESPONSE_RESERVE);
    assert.ok(author.length<2000000);
    return {...output,text:author};
  });
  const u=read(a).upgrade;
  assert.equal(u.status,'failed');assert.match(u.error,/request has (\d+) characters; limit 900000/);
  const rejectedLength=Number(u.error.match(/request has (\d+)/)[1]);
  assert.ok(rejectedLength>author.length);
  assert.throws(()=>admitPrompt('x'.repeat(rejectedLength)),/request has/);
  assert.equal(qaCalls,0);assert.equal(u.qa_pages.length,0);
  assert.deepEqual(u.probe.artifact,JSON.parse(author));
  assert.equal(u.calls.at(-1).text,author);
  assert.equal(u.calls.at(-1).response_characters,author.length);
  assert.equal(u.calls.length,u.cos_pages.length+2); // all pages, one replay, final; no retry
  assert.equal(read(a).plugin_version,'0.1.0');
});
