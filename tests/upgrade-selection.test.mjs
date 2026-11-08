import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {upgrade} from '../plugins/soloco/runtime/upgrade.mjs';
import {call,toolList} from '../plugins/soloco/runtime/main.mjs';
import {withStore,digest,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'upgrade-selection-'));
process.env.COMPANY_PLUGIN_DATA=path.join(temp,'plugin-data');
test.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
const read=f=>withStore(f.root,db=>db.read());
const edit=(f,fn)=>withStore(f.root,db=>db.transaction('fictional.selection.fixture',s=>{fn(s);return s;}));
const opts={check:()=>({available:true,authenticated:true}),launch:()=>{}};
function fixture() {
  const f={root:fs.mkdtempSync(path.join(temp,'company-')),session_id:'fictional-founder',epoch:1,expected_epoch:1,source_instruction:'Fictional source-only upgrade selection; no external effects.'};
  engine.bind(f.root,f.session_id,'codex');engine.open({...f,idea:'Fictional selection fixture'},'codex');
  withStore(f.root,db=>db.migrate());
  edit(f,s=>{s.roles={qa:{name:'QA'},engineer:{name:'Engineer'}};s.governance='No external execution.';s.governance_sha256=digest(s.governance);s.cos_instructions='Preserve all original restrictions.';s.team_sha256=teamHash(s);});
  return f;
}
function inspect(f,extra={}) {return upgrade({...f,action:'inspect',...extra},'codex');}
function prepare(f,extra={},options=opts) {
  return upgrade({...f,action:'prepare',candidate_hash:inspect(f,extra.workflow?{workflow:extra.workflow}:{}).candidate_hash,...extra},'codex',options);
}
async function acceptedFixture() {
  const f=fixture(),{expected_epoch,...contextArgs}=f;
  engine.save({...f,id:'obligation',kind:'artifact',content:'Fictional obligation: keep all customer data local.',operating_record:{version:1,kind:'obligation',scope:'*',owner:'runner',conditions:'Always',exceptions:'None',clearing:'Independent exact closure',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:['obligation']}},'codex');
  const p=await call('company_context',{...contextArgs,action:'plan',protocol:'operating-state-v1'},'codex');
  const q=engine.dispatch({...f,role:'qa',review_of:p.id,task:'Fictional independent operating review'},'codex',{check:opts.check,launch:()=>({on(){},unref(){}})});
  const context=assignmentContext(read(f),read(f).jobs[q.id]),evidence=context.qualification_evidence??context.operating_evidence;
  const ranges=evidence?Object.values(evidence.sources).flatMap(source=>{
    const result=[];for(let offset=0;offset<source.length;) {
      let length=Math.min(16000,source.length-offset);if(/[\uD800-\uDBFF]/.test(source.raw[offset+length-1]))length--;
      result.push({source_id:source.source_id,sha256:source.sha256,offset,length});offset+=length;
    }return result;
  }):[];
  let spawned=false;
  await work(f.root,q.id,async(_host,_native,_prompt,_dir,timeout,_selection,options)=>{
    if(!spawned){spawned=true;options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));}
    const result=ranges.length?{reads:ranges.splice(0,4)}:{content:'FICTIONAL contract double: all fixture conditions retained; no native semantic acceptance claim.',messages:[],notices:[],review:{verdict:'Pass',reason:'Fictional complete conditions checked',permitted_action:'publish_operating_state',plan_sha256:digest(JSON.stringify(read(f).records[p.id].operating_plan)),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}};
    return {native_id:'fictional-independent-selection-qa',text:JSON.stringify(result)};
  });
  const job=read(f).jobs[q.id];assert.equal(job.status,'completed',job.error);
  const applied=await call('company_context',{...contextArgs,action:'apply',protocol:'operating-state-v1',plan_id:p.id,review_id:job.artifact_id},'codex');assert.equal(applied.published,true);
  return f;
}

test('public selection exposes v2 default and explicit prior workflows',()=>{
  const schema=toolList.find(t=>t.name==='company_upgrade').inputSchema;
  assert.deepEqual(schema.properties.workflow.enum,['legacy','incremental-v1','incremental-v2']);
  assert.equal(schema.properties.workflow.default,'incremental-v2');
  const f=fixture(),before=read(f),r=inspect(f);
  assert.equal(r.selection.workflow,'incremental-v2');assert.equal(r.selection.input_mode,'current-projection');assert.equal(r.selection.eligible,true);
  assert.deepEqual(read(f),before,'inspection changes no company facts');
  assert.equal(inspect(f,{workflow:'legacy'}).selection.workflow,'legacy');
  assert.equal(inspect(f,{workflow:'incremental-v1'}).selection.workflow,'incremental-v1');
  assert.equal(inspect(f,{context_mode:'full'}).selection.input_mode,'full-history');
});
test('fresh default stores v2 while explicit old requests retain unmarked/v1 contracts',()=>{
  for(const workflow of [undefined,'legacy','incremental-v1']) {
    const f=fixture();prepare(f,workflow?{workflow}:{});const u=read(f).upgrade;
    assert.equal(u.workflow,workflow==='legacy'?undefined:workflow??'incremental-v2');
    assert.equal(u.context_mode,'current');assert.equal(u.call_timeout_minutes,10);assert.equal(u.review_window_minutes,45);
    if(!workflow){assert(Number.isFinite(u.timings.preparation_ms));assert(u.timings.preparation_ms>=0);}
    else assert.equal(u.timings,undefined);
  }
});
test('inspection preserves the pending attempt protocol rather than reinterpreting defaults',()=>{
  const f=fixture();prepare(f,{workflow:'incremental-v1'});const before=read(f);
  const r=inspect(f);assert.equal(r.selection.existing_attempt,true);assert.equal(r.selection.workflow,'incremental-v1');
  assert.equal(inspect(f,{workflow:'incremental-v2'}).selection.workflow,'incremental-v1');
  assert.deepEqual(read(f),before);
  edit(f,s=>{s.upgrade.status='applied';s.owner.epoch++;});
  const applied=inspect(f);assert.equal(applied.selection.existing_attempt,true);assert.equal(applied.selection.workflow,'incremental-v1');
});
test('default v2 uses accepted current state automatically; full mode explicitly opts out',async()=>{
  const f=await acceptedFixture(),before=read(f),r=inspect(f);
  assert.equal(r.selection.input_mode,'accepted-operating-state');assert.equal(r.selection.eligible,true);
  assert.equal(r.projection_preview.kind,'accepted-operating-upgrade-preview');assert.equal(r.projection_preview.workflow,'incremental-v2');
  assert.equal(inspect(f,{context_mode:'full'}).selection.input_mode,'full-history');
  assert.deepEqual(read(f),before);
  prepare(f);const u=read(f).upgrade;assert.equal(u.workflow,'incremental-v2');assert.ok(u.operating_input);
});
test('invalid accepted current state is visibly held and never falls back or launches',async()=>{
  const f=await acceptedFixture();edit(f,s=>{s.records.obligation.operating_record.conditions='Changed fixture prohibition';});
  const before=read(f),r=inspect(f);assert.equal(r.selection.input_mode,'accepted-operating-state');assert.equal(r.selection.eligible,false);
  assert.equal(r.projection_preview.held,true);assert.match(r.selection.hold_reason,/Held|DIRTY|changed/i);
  let launches=0;assert.throws(()=>upgrade({...f,action:'prepare',candidate_hash:r.candidate_hash},'codex',{...opts,launch:()=>launches++}),/Held|DIRTY|changed/i);
  assert.equal(launches,0);assert.deepEqual(read(f),before);
});
test('accepted-input policy conflicts hold before launch without changing allowances or state',async()=>{
  const f=await acceptedFixture(),r=inspect(f),before=read(f);let launches=0;
  assert.equal(r.selection.required_call_timeout_minutes,10);assert.equal(r.selection.required_review_window_minutes,45);
  for(const extra of [{call_timeout_minutes:30},{review_window_minutes:90},{review_window_minutes:null}])assert.throws(()=>upgrade({...f,action:'prepare',candidate_hash:r.candidate_hash,...extra},'codex',{...opts,launch:()=>launches++}),/requested allowances were not changed/);
  assert.equal(launches,0);assert.deepEqual(read(f),before);
});
