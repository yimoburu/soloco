import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { id, withStore, digest, installedTeam, teamHash, Store } from 'file:///Users/xwli/Documents/soloco/audit-scalability/plugins/soloco/runtime/store.mjs';
import * as engine from 'file:///Users/xwli/Documents/soloco/audit-scalability/plugins/soloco/runtime/engine.mjs';
import { developmentAssignment, developmentCapability, executeDevelopmentTest } from 'file:///Users/xwli/Documents/soloco/audit-scalability/plugins/soloco/runtime/develop.mjs';
import { sandboxCapability } from 'file:///Users/xwli/Documents/soloco/audit-scalability/plugins/soloco/runtime/local-sandbox.mjs';
import { assignmentContext, contextMatches } from 'file:///Users/xwli/Documents/soloco/audit-scalability/plugins/soloco/runtime/context.mjs';
import {captureScopedPlan,scopedPlanView} from 'file:///Users/xwli/Documents/soloco/audit-scalability/plugins/soloco/runtime/scoped-context.mjs';
import {resolveSnapshot,inheritSnapshots} from 'file:///Users/xwli/Documents/soloco/audit-scalability/plugins/soloco/runtime/snapshot.mjs';
import { recordReference } from 'file:///Users/xwli/Documents/soloco/audit-scalability/plugins/soloco/runtime/current-state.mjs';
import { work } from 'file:///Users/xwli/Documents/soloco/audit-scalability/plugins/soloco/runtime/worker.mjs';
import { call } from 'file:///Users/xwli/Documents/soloco/audit-scalability/plugins/soloco/runtime/main.mjs';

// Immutable published contract from 7adf94a8cf0943143fad5f83f3c2c4bda3a4a142:SPEC.md.
const v018Governance=fs.readFileSync(new URL('file:///Users/xwli/Documents/soloco/audit-scalability/tests/fixtures/governance-v018.md',import.meta.url),'utf8');
assert.equal(digest(v018Governance),'185933ddeafe9709bef44e9a6605ba7adb5faaa8bc43c1c64f1da3b03ae5f400');
// Immutable published contract from 64bd2eb:SPEC.md.
const v019Governance=fs.readFileSync(new URL('file:///Users/xwli/Documents/soloco/audit-scalability/tests/fixtures/governance-v019.md',import.meta.url),'utf8');
assert.equal(digest(v019Governance),'d79b73676543ab053ea5ce7e456364f68700d0340d47c852a83bc97308f6a422');

const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-development-test-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'cache');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const capability=sandboxCapability();
const live={skip:capability.supported?false:capability.blocker};
const read=a=>withStore(a.root,db=>db.read());
function setup(host='codex') {
  const root=fs.mkdtempSync(path.join(base,'company-'));
  const a={root,session_id:id('founder'),epoch:1};
  engine.bind(root,a.session_id,host);engine.open({...a,idea:'Bounded repair of existing local source'},host);
  fs.writeFileSync(path.join(root,'sum.mjs'),'export const sum = values => 0;\n');
  fs.writeFileSync(path.join(root,'private.txt'),'NOT_AUTHORIZED');
  return a;
}
const good=[{path:'sum.mjs',content:'export const sum = values => values.reduce((a,b)=>a+b,0);\n'},
  {path:'sum.test.mjs',content:"import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {sum} from './sum.mjs';\ntest('sum',()=>assert.equal(sum([1,2,3]),6));\n"}];
function plan(a,extra={}) {
  return engine.develop({...a,action:'plan',model_data_approved:true,read_paths:['sum.mjs'],write_paths:['sum.mjs','sum.test.mjs'],test_paths:['sum.test.mjs'],
    acceptance:'A retained candidate adds numbers correctly, without changing original source.',stop_conditions:'Stop for network, new services, undeclared files or exhausted repair limit.',
    data_policy:'Only declared source may be supplied to the configured model host; private.txt stays excluded.',source_instruction:'Inspect sum.mjs and prepare the shown local candidate scope.',
    max_attempts:3,timeout_ms:3000,max_output_bytes:10000,max_bytes:20000,expires_at:new Date(Date.now()+60000).toISOString(),...extra},'codex');
}
function authorize(a,p,extra={}) {
  return engine.develop({...a,action:'authorize',plan_id:p.id,scope_sha256:p.development.scope_sha256,model_data_approved:true,source_instruction:'Approve this exact local development scope and source sharing for up to three bounded attempts.',...extra},'codex');
}
function queue(a,{role='engineer',development_id,review_of,context_format,context_scope,evidence_ids=[]}={}) {
  const jobId=id('job'),instance=id(role);
  withStore(a.root,db=>db.transaction('test.queue',s=>{
    const target=s.records[review_of];
    const j={id:jobId,role,instance_id:instance,session_key:instance,host:s.owner.host,native_id:null,epoch:s.owner.epoch,status:'queued',task:'Honor supplied development scope',inputs:[],review_of:target?{id:target.id,revision:target.revision}:null,...(development_id?{development_id}:{}),...(context_format?{context_format}:{}),...(context_scope?{context_scope}:{}),...(evidence_ids.length?{supplemental_sources:evidence_ids.map(key=>recordReference(s.records[key]))}:{}),created_at:new Date().toISOString()};
    developmentAssignment(s,j,true,a.root);const context=assignmentContext(s,j);
    s.jobs[jobId]={...j,inputs:context.inputs,context_sha256:context.hash};
    s.sessions[instance]={instance_id:instance,role,host:s.owner.host,native_id:null};return s;
  }));return jobId;
}
const output=(extra={},native=id('native'))=>({native_id:native,text:JSON.stringify({content:'Attributable development candidate or independent assessment',messages:[],notices:[],...extra})});
async function generate(a,p,{files=good,extra={},during,context_format}={}) {
  const j=queue(a,{development_id:p.id,context_format});
  await work(a.root,j,async(_host,_native,prompt)=>{
    assert.match(prompt,/Bounded local development candidate/);
    if(p.development.scope.output_format==='patches') {assert.match(prompt,/\"patches\":\[/);assert.doesNotMatch(prompt,/\"files\":\[\{\"path\":\"permitted non-fixture/);}
    assert.ok(!prompt.includes('NOT_AUTHORIZED'));
    if(during)await during();return output({files,...extra});
  });
  const s=read(a);return s.records[s.jobs[j].artifact_id]??s.jobs[j];
}
async function waitJob(a,id,timeout=15000) {
  const until=Date.now()+timeout;
  while(Date.now()<until) {
    const s=read(a),j=s.jobs[id];if(!['queued','running'].includes(j.status))return {job:j,receipt:s.records[j.artifact_id]};
    await new Promise(r=>setTimeout(r,30));
  }
  assert.fail(`Local test worker did not finish: ${id}`);
}
async function waitQuarantinedReceipt(a,jobId,candidate,timeout=30000) {
  const until=Date.now()+timeout;let s;
  do {
    s=read(a);const job=s.jobs[jobId],receipt=s.records[job.artifact_id];
    // Pause/revoke may mark the job cancelled before the detached controller
    // publishes its outcome. Wait for that retained evidence, not terminal status.
    if(receipt) {
      assert.equal(job.status,'quarantined');assert.equal(receipt.status,'Quarantined');
      assert.equal(receipt.author_instance,jobId);assert.equal(receipt.author_role,'runtime');
      assert.equal(receipt.development.candidate_id,candidate.id);
      assert.equal(receipt.development.candidate_sha256,candidate.development.candidate_sha256);
      assert.deepEqual(JSON.parse(receipt.content),receipt.development.result,'retain the exact controller outcome');
      assert.equal(digest(receipt.content),receipt.development.receipt_sha256);
      assert.deepEqual(s.records[candidate.id].development.run,{job_id:jobId,status:'quarantined',receipt_id:receipt.id});
      assert.notEqual(receipt.development.result.status,'passed');
      assert.equal(receipt.development.acceptance,undefined);
      assert.ok(s.notices.some(n=>n.reference===receipt.id));
      return receipt;
    }
    await new Promise(r=>setTimeout(r,30));
  }while(Date.now()<until);
  assert.fail(`Local controller did not retain a quarantined receipt: ${JSON.stringify(s.jobs[jobId])}`);
}
async function run(a,p,c) {
  const j=await engine.develop({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex');
  assert.equal(j.kind,'development_test');const ended=await waitJob(a,j.id);
  assert.ok(ended.receipt,JSON.stringify(ended.job));return ended.receipt;
}
async function review(a,receipt,{verdict='Pass',extra={},native,notices=[]}={}) {
  const j=queue(a,{role:'qa',review_of:receipt.id});
  await work(a.root,j,async(_host,_native,prompt)=>{
    assert.match(prompt,/actual runtime test receipt/);
    assert.ok(prompt.includes(receipt.development.candidate_id));
    return output({notices,review:{verdict,reason:'Checked exact source, scope and recorded test evidence',permitted_action:verdict==='Pass'?'accept_local_development':'hold',candidate_sha256:receipt.development.candidate_sha256,receipt_sha256:receipt.development.receipt_sha256,blockers:verdict==='Pass'?[]:['Needs repair'],...extra}},native);
  });
  const s=read(a);return s.records[s.jobs[j].artifact_id]??s.jobs[j];
}
function accept(a,p,t,r,extra={}) {return engine.develop({...a,action:'accept',plan_id:p.id,receipt_id:t.id,review_id:r.id,receipt_sha256:t.development.receipt_sha256,...extra},'codex');}

function supplemental(a) {
  return engine.save({...a,kind:'artifact',content:'Required supplemental behavior: sum all supplied numbers.'},'codex');
}
function amendSupplemental(a,source) {
  return engine.save({...a,id:source.id,expected_revision:source.revision,kind:'artifact',content:'Changed required behavior: sum only positive supplied numbers.'},'codex');
}
async function generateWithSupplemental(a,p,source,{retrieve=true,files=good}={}) {
  const ref=recordReference(source),native=id('native');
  const key=queue(a,{development_id:p.id,context_format:3,context_scope:p.id,evidence_ids:[source.id]});
  let calls=0;
  await work(a.root,key,async(_host,session,prompt)=>{
    calls++;
    if(retrieve&&calls===1)return {native_id:native,text:JSON.stringify({reads:[{id:ref.id,sha256:ref.sha256,offset:0,length:JSON.stringify(source).length}]})};
    if(retrieve){assert.equal(session,native);assert.match(prompt,/record-reads-v1/);assert.ok(prompt.includes(source.content));}
    return output({files,notices:[{kind:'must_know',summary:'Generation used the exact supplemental behavior.'}]},native);
  });
  const state=read(a),job=state.jobs[key],candidate=state.records[job.artifact_id];
  assert.equal(job.status,'completed',JSON.stringify(job));assert.equal(candidate.status,'Submitted');
  assert.deepEqual(job.supplemental_sources,[ref]);
  assert.equal(job.retrieved_inputs?.length??0,retrieve?1:0);
  assert.ok(!job.inputs.some(input=>input.id===source.id),'supplement is outside the governing/full input revisions');
  return candidate;
}

test('independent probe: changed source author closure prevents fresh validation reuse',live,async()=>{
 const a=setup(),p=await plan(a);await authorize(a,p);const first=await generate(a,p),receipt=await run(a,p,first);
 const qa=await review(a,receipt,{extra:{deterministic_validation:{permitted_action:'reuse_exact_validation',fingerprint:receipt.development.validation_fingerprint,dependencies_complete:true,external_state:false}}});await accept(a,p,receipt,qa);
 withStore(a.root,db=>db.transaction('probe.author_uncertain',s=>{s.jobs[first.job_id].coordination_release.termination_confirmed=false;return s;}));
 const second=await generate(a,p),job=await engine.develop({...a,action:'run',plan_id:p.id,candidate_id:second.id,reuse_receipt_id:receipt.id},'codex'),ended=await waitJob(a,job.id);
 console.log('CLOSURE PROBE '+JSON.stringify({job:ended.job.status,error:ended.job.error,reused:ended.receipt?.development?.result?.reused}));
 assert.equal(ended.job.status,'failed');
});
test('independent probe: distinct changed source author native invalidates an existing reuse',live,async()=>{
 const a=setup(),p=await plan(a);await authorize(a,p);const first=await generate(a,p),receipt=await run(a,p,first);
 const qa=await review(a,receipt,{extra:{deterministic_validation:{permitted_action:'reuse_exact_validation',fingerprint:receipt.development.validation_fingerprint,dependencies_complete:true,external_state:false}}});await accept(a,p,receipt,qa);
 const second=await generate(a,p),job=await engine.develop({...a,action:'run',plan_id:p.id,candidate_id:second.id,reuse_receipt_id:receipt.id},'codex'),ended=await waitJob(a,job.id),reuse=ended.receipt;
 assert.equal(reuse.development.result.reused,true);
 withStore(a.root,db=>db.transaction('probe.author_native_changed',s=>{s.jobs[first.job_id].native_id='other-distinct-native';return s;}));
 const nextQa=await review(a,reuse);await assert.rejects(accept(a,p,reuse,nextQa),/valid passing runtime test receipt/);
});

test('independent probe: changed source receipt body is quarantined at publication',live,async()=>{
 const a=setup(),p=await plan(a);await authorize(a,p);const first=await generate(a,p),receipt=await run(a,p,first);
 const qa=await review(a,receipt,{extra:{deterministic_validation:{permitted_action:'reuse_exact_validation',fingerprint:receipt.development.validation_fingerprint,dependencies_complete:true,external_state:false}}});await accept(a,p,receipt,qa);
 const second=await generate(a,p),jobId=id('probe-controller');
 withStore(a.root,db=>db.transaction('probe.test_reserved',s=>{
  s.records[second.id].development.run={job_id:jobId,status:'queued'};
  s.jobs[jobId]={id:jobId,kind:'development_test',role:'engineer',development_id:p.id,candidate_id:second.id,epoch:a.epoch,session_id:a.session_id,host:'codex',reuse_receipt_id:receipt.id,status:'queued',created_at:new Date().toISOString(),inputs:[],native_id:null};return s;
 }));
 const original=Store.prototype.transaction;let mutated=false;
 Store.prototype.transaction=function(type,fn,...rest){
  if(type==='development.test_finished')return original.call(this,type,s=>{mutated=true;s.records[receipt.id].development.result.exit_code=9;return fn(s);},...rest);
  return original.call(this,type,fn,...rest);
 };
 let result;try{result=await executeDevelopmentTest(a.root,jobId);}finally{Store.prototype.transaction=original;}
 assert.equal(mutated,true);console.log('PUBLICATION PROBE '+JSON.stringify({status:result.status,reused:result.development.result.reused,job:read(a).jobs[jobId].status}));
 assert.equal(result.status,'Quarantined');
});
