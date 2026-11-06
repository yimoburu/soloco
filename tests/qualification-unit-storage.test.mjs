import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {PACKAGE} from '../plugins/soloco/runtime/store.mjs';
import {contractResult} from '../tools/qualify-fictional.mjs';

// Instrument a retained copy of production modules, never the shared runtime.
// This measures actual projection construction; reviewers remain contract doubles.
test('immutable qualification unit lookup preserves exact wire and canonical proof without rebuilding projections',async()=>{
 const tmp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'unit-lookup-'))),plugin=path.join(tmp,'plugin'),root=path.join(tmp,'fictional-company'),previous=process.env.COMPANY_PLUGIN_DATA;
 fs.cpSync(PACKAGE,plugin,{recursive:true});fs.mkdirSync(root);process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'cache');
 const file=path.join(plugin,'runtime/upgrade-evidence.mjs');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('export function buildEvidence(', 'export let qualificationBuildCount=0;\nexport function buildEvidence(').replace('  if (!object(checkpoint) || !Array.isArray(history))', '  qualificationBuildCount++;\n  if (!object(checkpoint) || !Array.isArray(history))'));
 fs.appendFileSync(path.join(plugin,'runtime/context-qualification.mjs'),'\nexport const clearFixtureProjectionCache=()=>{projectionCache.clear();projectionCacheBytes=0;};\n');
 try{
  const module=async name=>import(pathToFileURL(path.join(plugin,'runtime',name+'.mjs'))),e=await module('engine'),s=await module('store'),q=await module('context-qualification'),snap=await module('snapshot'),evidence=await module('upgrade-evidence'),worker=await module('worker'),timing=await module('timeout');
  const base={root,session_id:'fictional-founder',epoch:1};e.bind(root,base.session_id,'codex');e.open({...base,idea:'Fictional immutable unit fixture.'},'codex');s.withStore(root,db=>db.migrate());
  s.withStore(root,db=>db.transaction('fixture.inputs',state=>{state.governance='No business execution.';state.cos_instructions='Preserve evidence.';state.roles={qa:{name:'QA'},engineer:{name:'Engineer'}};state.team_sha256=s.teamHash(state);state.records.old={id:'old',kind:'artifact',revision:1,author_instance:'old-author',content:'Unknown fictional history '.repeat(4000)};state.records.home={id:'home',kind:'artifact',revision:1,author_instance:'home-author',content:'No business execution.'};return state;}));
  const plan=e.contextControl({...base,action:'plan',source_id:'old',counterpart_ids:['home'],source_instruction:'Fictional readonly classification.'},'codex'),state=s.withStore(root,db=>db.read()),p=state.records[plan.id];
  const capsule=snap.resolveSnapshot(state,p.context_units),before=evidence.qualificationBuildCount;
  assert.ok(capsule.units.length>8);
  // Derivation and lookup deliver exactly the same framed unit, including ranges.
  const clone=structuredClone(state);delete clone.records[plan.id].context_units;
  const expected=q.qualificationReadUnit(clone,{plan_id:plan.id,unit_id:p.context_partition_plan.units[0].id});
  q.clearFixtureProjectionCache(); // Simulate eviction/fresh runtime; no cache may hide a rebuild.
  const count=evidence.qualificationBuildCount;
  const actual=e.contextControl({...base,action:'read',plan_id:plan.id,unit_id:p.context_partition_plan.units[0].id},'codex');assert.deepEqual(actual,expected);
  const proofs=new Map(),run=async args=>{
   const target=e.contextControl({...base,action:'target',plan_id:plan.id,...args,source_instruction:'Exact fictional QA node.'},'codex');
   const j=e.dispatch({...base,role:'qa',task:'Review all supplied fictional values.',review_of:target.id},'codex',{launch:()=>({on(){},unref(){}}),check:()=>({available:true,authenticated:true,version:'synthetic'})});
   await worker.work(root,j.id,async(h,native,wire,dir,remaining,selection,options)=>{options.onSpawn(timing.executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));const r=contractResult(JSON.parse(wire));return {native_id:'synthetic-'+j.id,text:JSON.stringify({content:r.reason,messages:[],notices:[],review:{verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action},qualification_result:r})};});
   const job=s.withStore(root,db=>db.read()).jobs[j.id];assert.equal(job.status,'completed',job.error);return job.artifact_id;
  };
  for(const unit of p.context_partition_plan.units)proofs.set(unit.id,await run({unit_id:unit.id}));
  for(const node of p.context_partition_plan.nodes)proofs.set(node.id,await run({node_id:node.id,child_review_ids:node.children.map(id=>proofs.get(id))}));
  const roots=p.context_partition_plan.roots,aggregate=await run({root_review_ids:[proofs.get(roots.historical),proofs.get(roots.current)]});
  e.contextControl({...base,action:'apply',aggregate_review_id:aggregate,source_instruction:'Apply canonical fictional representation only.'},'codex');
  const applied=s.withStore(root,db=>db.read()),proof=applied.context_classifications.old.partition_qualification;q.validateQualificationExclusion(applied,proof);
  assert.equal(evidence.qualificationBuildCount,count,'targets, worker nodes, apply and exclusion must not rebuild projected originals');
  assert.ok(before>0);
  const incoming={...base,session_id:'fictional-successor',epoch:2};e.bind(root,incoming.session_id,'codex');
  const pending=e.control({...incoming,action:'handover',expected_epoch:1,source_instruction:'Continue exactly the same fictional preparation.'},'codex');
  assert.equal(pending.paused,true);assert.ok(pending.required_semantics.length<10000);
  const successor=s.withStore(root,db=>db.read());assert.deepEqual(q.validateQualificationExclusion(successor,proof),proof);assert.throws(()=>q.validateQualificationApply(successor,{aggregate_review_id:aggregate}),/epoch/);
  const current=await module('current-state'),unknown=structuredClone(applied);snap.inheritSnapshots(applied,unknown);unknown.context_classifications.old.unknown_authority='Do not ignore';assert.throws(()=>current.governingRecords(unknown,{role:'engineer'}),/Unknown context tree/);
  for(const mutate of [state=>state.records.old.content+=' changed',state=>state.records.home.content+=' changed',state=>state.records[plan.id].context_partition_plan.units[0].sha256='0'.repeat(64),state=>state.governance+=' changed']){const changed=structuredClone(applied);snap.inheritSnapshots(applied,changed);mutate(changed);assert.throws(()=>q.validateQualificationExclusion(changed,proof),/hold:/);}
  // Missing/corrupt source-independent unit and as-of originals still hold even
  // when every logical company row and canonical native receipt is unchanged.
  for(const ref of [capsule.units[0].snapshot,p.context_originals.subject]){
   s.withStore(root,db=>{const sha=ref.immutable_snapshot.sha256,row=db.db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(sha);db.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run(row.bytes+' ',sha);try{assert.throws(()=>q.validateQualificationExclusion(db.read(),proof),/corrupt|missing|hash mismatch/);}finally{db.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run(row.bytes,sha);}});
  }
 }finally{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(tmp,{recursive:true,force:true});}
});
