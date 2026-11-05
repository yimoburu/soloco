import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { id, withStore, digest, installedTeam, teamHash } from '../plugins/soloco/runtime/store.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import { developmentAssignment, developmentCapability } from '../plugins/soloco/runtime/develop.mjs';
import { sandboxCapability } from '../plugins/soloco/runtime/local-sandbox.mjs';
import { assignmentContext } from '../plugins/soloco/runtime/context.mjs';
import { work } from '../plugins/soloco/runtime/worker.mjs';
import { call } from '../plugins/soloco/runtime/main.mjs';

// Immutable published contract from 7adf94a8cf0943143fad5f83f3c2c4bda3a4a142:SPEC.md.
const v018Governance=fs.readFileSync(new URL('./fixtures/governance-v018.md',import.meta.url),'utf8');
assert.equal(digest(v018Governance),'185933ddeafe9709bef44e9a6605ba7adb5faaa8bc43c1c64f1da3b03ae5f400');

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
function queue(a,{role='engineer',development_id,review_of}={}) {
  const jobId=id('job'),instance=id(role);
  withStore(a.root,db=>db.transaction('test.queue',s=>{
    const target=s.records[review_of];
    const j={id:jobId,role,instance_id:instance,session_key:instance,host:s.owner.host,native_id:null,epoch:s.owner.epoch,status:'queued',task:'Honor supplied development scope',inputs:[],review_of:target?{id:target.id,revision:target.revision}:null,...(development_id?{development_id}:{}),created_at:new Date().toISOString()};
    developmentAssignment(s,j,true);const context=assignmentContext(s,j);
    s.jobs[jobId]={...j,inputs:context.inputs,context_sha256:context.hash};
    s.sessions[instance]={instance_id:instance,role,host:s.owner.host,native_id:null};return s;
  }));return jobId;
}
const output=(extra={},native=id('native'))=>({native_id:native,text:JSON.stringify({content:'Attributable development candidate or independent assessment',messages:[],notices:[],...extra})});
async function generate(a,p,{files=good,extra={},during}={}) {
  const j=queue(a,{development_id:p.id});
  await work(a.root,j,async(_host,_native,prompt)=>{
    assert.match(prompt,/Bounded local development candidate/);
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

test('development capability fails closed without a supported sandbox, and MCP preserves binding',async()=>{
  const a=setup(),status=engine.status(a,'codex');
  assert.equal(status.capabilities.local_development.supported,capability.supported);
  if(!capability.supported) {
    assert.ok(status.capabilities.local_development.blocker);
    await assert.rejects(plan(a));assert.equal(Object.keys(read(a).records).length,0);
  }
  await assert.rejects(call('company_develop',{...a,session_id:'unbound',action:'inspect'},'codex'),/binding/);
  await assert.rejects(call('company_develop',{...a,action:'execute'},'codex'),/Invalid action/);
  await assert.rejects(call('company_develop',{...a,action:'inspect',command:'anything'},'codex'),/Unknown argument/);
});
test('installed development capability does not silently authorize older teams or modified governance',live,()=>{
  const team=installedTeam();assert.match(team.governance,/v0\.19/);
  assert.equal(developmentCapability(team).eligible,true);
  for(const changed of [{...team,plugin_version:'0.4.1'},{...team,governance_sha256:digest('changed rules')}])assert.equal(developmentCapability(changed).eligible,false);
});
for(const version of ['0.5.0','0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6'])test(`pinned v${version} preserves authorized development and original source after a runtime update`,live,async()=>{
  const a=setup();withStore(a.root,db=>db.transaction('test.pin_compatible_development',s=>{
    s.governance=v018Governance;s.governance_sha256=digest(s.governance);s.plugin_version=version;s.runtime_version=version;s.cos_instructions=`Pinned v${version} development instructions`;s.team_sha256=teamHash(s);return s;
  }));
  const p=await plan(a);await authorize(a,p);
  withStore(a.root,db=>db.transaction('test.pin_scope_producer',s=>{s.runtime_version=version;return s;}));
  const before=read(a);
  const resumed=engine.open(a,'codex');assert.equal(resumed.capabilities.local_development.eligible,true);
  assert.deepEqual(read(a),before);
  assert.deepEqual(before.records[p.id].development.attempts,[]);
  const candidate=await generate(a,p);assert.equal(candidate.status,'Submitted');
  const after=read(a);
  for(const key of ['id','plugin_version','governance','governance_sha256','cos_instructions','team_sha256','owner'])assert.deepEqual(after[key],before[key]);
  // Dispatch reserves one attempt; every other scope and authorization field stays pinned.
  assert.deepEqual(after.records[p.id].development.attempts,[candidate.job_id]);
  assert.equal(after.jobs[candidate.job_id].development_id,p.id);
  assert.equal(after.jobs[candidate.job_id].status,'completed');
  assert.deepEqual(after.records[p.id],{...before.records[p.id],development:{...before.records[p.id].development,attempts:[candidate.job_id]}});
  const grant=before.records[p.id].development.authorization.decision_id;
  assert.deepEqual(after.records[grant],before.records[grant]);
  assert.equal(after.upgrade,undefined);
  assert.equal(fs.readFileSync(path.join(a.root,'sum.mjs'),'utf8'),'export const sum = values => 0;\n');
  assert.equal(fs.existsSync(path.join(a.root,'sum.test.mjs')),false);
  assert.equal(fs.readFileSync(path.join(a.root,'private.txt'),'utf8'),'NOT_AUTHORIZED');
});
test('an actual isolated edit-test-review loop retains usable candidate and leaves original source untouched',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);
  const before=read(a),c=await generate(a,p);assert.equal(c.status,'Submitted');
  const t=await run(a,p,c);assert.equal(t.development.result.status,'passed',JSON.stringify(t.development.result));assert.equal(t.development.result.exit_code,0);
  const r=await review(a,t),accepted=await accept(a,p,t,r);
  assert.equal(accepted.source_integrated,false);
  for(const f of good)assert.equal(fs.readFileSync(path.join(accepted.directory,f.path),'utf8'),f.content);
  assert.equal(fs.readFileSync(path.join(a.root,'sum.mjs'),'utf8'),'export const sum = values => 0;\n');
  assert.equal(fs.existsSync(path.join(a.root,'sum.test.mjs')),false);assert.equal(fs.readFileSync(path.join(a.root,'private.txt'),'utf8'),'NOT_AUTHORIZED');
  assert.equal(read(a).id,before.id);assert.equal(read(a).mode,'preparation');
  assert.notEqual(read(a).jobs[c.job_id].native_id,read(a).jobs[r.job_id].native_id);
  await assert.rejects(accept(a,p,t,r));
});
test('scope needs exact authorization and explicit source-sharing consent, not a draft decision',live,async()=>{
  const a=setup(),p=await plan(a);
  engine.save({...a,kind:'decision',content:'Approved'},'codex');
  assert.throws(()=>queue(a,{development_id:p.id}),/authorization/);
  await assert.rejects(authorize(a,p,{model_data_approved:false}),/sharing/);
  await assert.rejects(authorize(a,p,{scope_sha256:'wrong'}),/exact scope/);
  const granted=await authorize(a,p);assert.ok(granted.development.authorization);
  await assert.rejects(authorize(a,p),/already decided/);
});
test('scopes reject undeclared reads, traversal, hidden files, symlinks, collisions and unbounded work',live,async()=>{
  const a=setup();
  const invalid=[{read_paths:['missing.mjs']},{read_paths:['../private.txt']},{read_paths:['.company/company.sqlite']},{write_paths:['../sum.mjs']},{write_paths:['AGENTS.md']},{write_paths:['SUM.mjs','sum.mjs']},{write_paths:['a','a/b']},{read_paths:[]},{test_paths:['absent.test.mjs']},{max_attempts:11},{timeout_ms:120001},{max_bytes:999},{expires_at:'2000-01-01'}];
  for(const extra of invalid)await assert.rejects(plan(a,extra),undefined,JSON.stringify(extra));
  fs.symlinkSync(path.join(a.root,'sum.mjs'),path.join(a.root,'link.mjs'));
  await assert.rejects(plan(a,{read_paths:['sum.mjs','link.mjs']}),/linked/);
  assert.deepEqual(Object.keys(read(a).records),[]);
});
test('source mutation and new-path collision invalidate the displayed scope before authorization',live,async()=>{
  for(const collision of [false,true]) {
    const a=setup(),p=await plan(a);
    fs.writeFileSync(path.join(a.root,collision?'sum.test.mjs':'sum.mjs'),'changed');
    await assert.rejects(authorize(a,p),/source changed|now exists/);
  }
});
test('development records are immutable through the generic record tool',live,async()=>{
  const a=setup(),p=await plan(a);
  assert.throws(()=>engine.save({...a,id:p.id,kind:'artifact',expected_revision:1,content:'No limits'},'codex'),/immutable/);
});
test('workers reject missing, additional and oversized generated paths without modifying source',live,async()=>{
  for(const files of [good.slice(0,1),[...good,{path:'private.txt',content:'changed'}],good.map(f=>({...f,content:'x'.repeat(15000)}))]) {
    const a=setup(),p=await plan(a);await authorize(a,p);const result=await generate(a,p,{files});
    assert.equal(result.status,'failed');assert.equal(fs.readFileSync(path.join(a.root,'sum.mjs'),'utf8'),'export const sum = values => 0;\n');
  }
});
test('a failed test and independent failed review permit bounded repair under the same standing grant',live,async()=>{
  const a=setup(),p=await plan(a,{max_attempts:2});await authorize(a,p);
  const bad=await generate(a,p,{files:good.map(f=>f.path==='sum.mjs'?{...f,content:'export const sum = values => 9;\n'}:f)}),failed=await run(a,p,bad);
  assert.notEqual(failed.development.result.status,'passed');const rejection=await review(a,failed,{verdict:'Fail'});
  assert.equal(rejection.review.verdict,'Fail');await assert.rejects(accept(a,p,failed,rejection),/passing runtime/);
  const repaired=await generate(a,p),passed=await run(a,p,repaired),qa=await review(a,passed),accepted=await accept(a,p,passed,qa);
  assert.equal(accepted.source_integrated,false);assert.equal(read(a).records[failed.id].development.result.status,failed.development.result.status);
  assert.equal(read(a).records[rejection.id].review.verdict,'Fail');
  assert.throws(()=>queue(a,{development_id:p.id}),/attempt limit/);
});
test('model-written test claims cannot replace the actual runtime receipt',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);
  const c=await generate(a,p,{extra:{tests_executed:true,result:{status:'passed',exit_code:0},development:{type:'test'}}});
  assert.equal(c.development.type,'candidate');assert.equal(c.development.result,undefined);
  await assert.rejects(engine.develop({...a,action:'accept',plan_id:p.id,receipt_id:c.id,review_id:'invented',receipt_sha256:'invented'},'codex'),/runtime test receipt/);
});
test('acceptance rejects wrong receipt hash, wrong action and reviewer reuse of the author native session',live,async()=>{
  for(const kind of ['receipt','action','native']) {
    const a=setup(),p=await plan(a);await authorize(a,p);const c=await generate(a,p),t=await run(a,p,c);
    const qa=await review(a,t,{...(kind==='action'?{extra:{permitted_action:'anything'}}:{}),...(kind==='native'?{native:read(a).jobs[c.job_id].native_id}:{})});
    await assert.rejects(accept(a,p,t,qa,kind==='receipt'?{receipt_sha256:'different'}:{}),/mismatch|QA Pass/);
  }
});
test('candidate tampering after test execution cannot inherit a passing review',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);const c=await generate(a,p),t=await run(a,p,c),r=await review(a,t);
  const f=path.join(t.development.result.directory,'sum.mjs');fs.chmodSync(f,0o600);fs.writeFileSync(f,'tampered');
  await assert.rejects(accept(a,p,t,r),/bytes changed/);
});
test('a test attempt is never repeated on the same candidate and expired grants cannot dispatch',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);const c=await generate(a,p);await run(a,p,c);
  await assert.rejects(engine.develop({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex'),/already has a test attempt/);
  const b=setup(),expiring=await plan(b,{expires_at:new Date(Date.now()+1000).toISOString()});await authorize(b,expiring);
  await new Promise(r=>setTimeout(r,1100));assert.throws(()=>queue(b,{development_id:expiring.id}),/expired/);
});
test('pause or revoke during an active test aborts it and retains a quarantined outcome',live,async()=>{
  for(const action of ['pause','revoke']) {
    const a=setup(),p=await plan(a,{timeout_ms:10000});await authorize(a,p);
    const c=await generate(a,p,{files:good.map(f=>f.path==='sum.test.mjs'?{...f,content:"import test from 'node:test';\ntest('slow',async()=>new Promise(r=>setTimeout(r,8000)));\n"}:f)});
    const j=await engine.develop({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex');
    const until=Date.now()+5000;while(read(a).jobs[j.id].status==='queued'&&Date.now()<until)await new Promise(r=>setTimeout(r,20));
    assert.equal(read(a).jobs[j.id].status,'running');
    if(action==='pause')engine.control({...a,action:'pause',expected_epoch:1,source_instruction:'Pause local work now'},'codex');
    else await engine.develop({...a,action:'revoke',plan_id:p.id,source_instruction:'Revoke local development scope'},'codex');
    // Cancellation is immediate; allow the worker to retain the final aborted receipt.
    const deadline=Date.now()+5000;let s;do{s=read(a);if(s.jobs[j.id].artifact_id)break;await new Promise(r=>setTimeout(r,30));}while(Date.now()<deadline);
    const t=s.records[s.jobs[j.id].artifact_id];assert.ok(t,JSON.stringify(s.jobs[j.id]));assert.equal(t.status,'Quarantined');
    assert.notEqual(t.development.result.status,'passed');assert.ok(s.notices.some(n=>n.reference===t.id));
  }
});
test('source changes and handover prevent acceptance without erasing prior evidence',live,async()=>{
  for(const change of ['source','handover']) {
    const a=setup(),p=await plan(a);await authorize(a,p);const c=await generate(a,p),t=await run(a,p,c),r=await review(a,t);
    if(change==='source')fs.writeFileSync(path.join(a.root,'sum.mjs'),'changed');
    else engine.control({...a,action:'handover',expected_epoch:1,source_instruction:'Replace coordinator'},'codex');
    await assert.rejects(accept(a,p,t,r));assert.ok(read(a).records[t.id]);assert.ok(read(a).records[r.id]);
  }
});

test('stdio MCP remains responsive to founder pause while a detached test runs',live,async()=>{
  const a=setup(),p=await plan(a,{timeout_ms:10000});await authorize(a,p);
  const c=await generate(a,p,{files:good.map(f=>f.path==='sum.test.mjs'?{...f,content:"import test from 'node:test';\ntest('slow',async()=>new Promise(r=>setTimeout(r,8000)));\n"}:f)});
  const server=spawn(process.execPath,['--no-warnings',fileURLToPath(new URL('../plugins/soloco/runtime/main.mjs',import.meta.url)),'serve','codex'],{stdio:['pipe','pipe','pipe'],env:process.env});
  const pending=new Map();let buffer='',sequence=0;
  server.stdout.on('data',chunk=>{
    buffer+=chunk;while(buffer.includes('\n')){
      const end=buffer.indexOf('\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+1);
      if(!line.trim())continue;
      const message=JSON.parse(line),entry=pending.get(message.id);if(entry){clearTimeout(entry.timer);pending.delete(message.id);entry.resolve(message);}
    }
  });
  const request=(method,params)=>new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('MCP response timed out'));},3000);
    pending.set(id,{resolve,timer});server.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  });
  const tool=async(name,args)=>{
    const response=await request('tools/call',{name,arguments:args});assert.ok(!response.error,JSON.stringify(response));
    assert.ok(!response.result.isError,JSON.stringify(response));return JSON.parse(response.result.content[0].text);
  };
  try {
    await request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'test',version:'1'}});
    const j=await tool('company_develop',{...a,action:'run',plan_id:p.id,candidate_id:c.id});
    const until=Date.now()+5000;while(read(a).jobs[j.id].status==='queued'&&Date.now()<until)await new Promise(r=>setTimeout(r,20));
    assert.equal(read(a).jobs[j.id].status,'running');
    const {epoch,...identity}=a;
    const paused=await tool('company_control',{...identity,action:'pause',expected_epoch:epoch,source_instruction:'Pause tests now'});
    assert.equal(paused.paused,true);
    const deadline=Date.now()+5000;let state;
    do {state=read(a);if(state.jobs[j.id].artifact_id)break;await new Promise(r=>setTimeout(r,30));}while(Date.now()<deadline);
    assert.equal(state.records[state.jobs[j.id].artifact_id]?.status,'Quarantined');
  } finally {server.kill('SIGTERM');for(const entry of pending.values())clearTimeout(entry.timer);}
});

test('a candidate and its QA review may emit valid notices without invalidating their own outputs',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);
  const c=await generate(a,p,{extra:{notices:[{kind:'must_know',summary:'The candidate adds the requested tests; inspect their assumptions.'}]}});
  assert.equal(c.status,'Submitted');
  const t=await run(a,p,c);assert.equal(t.development.result.status,'passed');
  const r=await review(a,t,{notices:[{kind:'must_know',summary:'QA accepts only the bounded candidate; integration remains separate.'}]});
  const accepted=await accept(a,p,t,r);assert.equal(accepted.source_integrated,false);
  const notices=read(a).notices;assert.equal(notices.length,2);
  assert.ok(notices.some(n=>n.reference===c.id));assert.ok(notices.some(n=>n.reference===r.id));
  assert.ok(notices.every(n=>n.resolution===null));
});
test('local test dispatch shares the global three-active-job limit',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);const c=await generate(a,p);
  withStore(a.root,db=>db.transaction('test.capacity',s=>{
    for(let i=0;i<3;i++){const key=id('busy');s.jobs[key]={id:key,role:'pm',status:'running',created_at:new Date().toISOString()};}return s;
  }));
  await assert.rejects(engine.develop({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex'),/Three|three|limit|active/i);
  assert.equal(read(a).records[c.id].development.run,undefined);
});
test('receipt acceptance verifies runtime provenance and completed execution, not payload hash alone',live,async()=>{
  for(const corrupt of ['author','job']) {
    const a=setup(),p=await plan(a);await authorize(a,p);const c=await generate(a,p),t=await run(a,p,c);
    withStore(a.root,db=>db.transaction('test.corrupt_receipt',s=>{
      if(corrupt==='author')s.records[t.id].author_role='engineer';
      else s.jobs[s.records[c.id].development.run.job_id].status='failed';
      return s;
    }));
    const r=await review(a,read(a).records[t.id]);
    await assert.rejects(accept(a,p,t,r),/runtime|receipt|execution|provenance/i);
  }
});

test('source-sharing consent precedes file inspection; planning review grants no execution authority',live,async()=>{
  const a=setup();
  for(const value of [false,undefined])await assert.rejects(plan(a,{model_data_approved:value,read_paths:['missing-secret.mjs']}),/sharing|authoriz|consent|approve/i);
  assert.equal(Object.keys(read(a).records).length,0);
  const p=await plan(a);
  const j=queue(a,{role:'qa',review_of:p.id});
  assert.equal(read(a).jobs[j].status,'queued');
  assert.throws(()=>queue(a,{development_id:p.id}),/authorization/);
});

test('a new external notice referencing a QA artifact still invalidates that earlier review',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);
  const c=await generate(a,p),t=await run(a,p,c),r=await review(a,t);
  assert.equal(r.review.verdict,'Pass');
  const n=engine.notify({...a,kind:'must_know',summary:'New evidence requires reconsidering this review.',reference:r.id},'codex');
  assert.equal(n.reference,r.id);assert.equal(n.job_id,undefined);
  await assert.rejects(accept(a,p,t,r),/fresh independent QA Pass|stale/);
  assert.ok(read(a).notices.some(x=>x.id===n.id&&x.resolution===null));
});

test('a generic-only QA Pass stays inspectable but cannot accept; a complete fresh review can',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);
  const c=await generate(a,p),t=await run(a,p,c);
  const j=queue(a,{role:'qa',review_of:t.id});
  let responseExample;
  await work(a.root,j,async(_host,_native,prompt)=>{
    responseExample=prompt.slice(prompt.lastIndexOf('Return one JSON object only:'));
    return output({review:{verdict:'Pass',reason:'Generic assessment without action or evidence identifiers'}});
  });
  const state=read(a),incomplete=state.records[state.jobs[j].artifact_id];
  assert.equal(incomplete.status,'Submitted');assert.deepEqual(Object.keys(incomplete.review).sort(),['reason','verdict']);
  await assert.rejects(accept(a,p,t,incomplete),/fresh independent QA Pass/);
  assert.equal(read(a).records[incomplete.id].review.verdict,'Pass');
  for(const field of ['permitted_action','candidate_sha256','receipt_sha256','blockers'])assert.match(responseExample,new RegExp('"'+field+'"\\s*:'));
  assert.ok(responseExample.includes(t.development.candidate_sha256));assert.ok(responseExample.includes(t.development.receipt_sha256));
  const complete=await review(a,t),accepted=await accept(a,p,t,complete);
  assert.equal(accepted.review_id,complete.id);assert.equal(accepted.source_integrated,false);
  assert.ok(read(a).records[incomplete.id]);assert.notEqual(complete.job_id,incomplete.job_id);
});

test('exact v0.18 development compatibility retains sandbox and team restrictions',()=>{
  const governance=v018Governance;
  for(const plugin_version of ['0.5.0','0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6',installedTeam().plugin_version]) {
    const s={...installedTeam(),plugin_version,governance,governance_sha256:digest(governance)};
    const before=structuredClone(s),c=developmentCapability(s);
    assert.equal(c.eligible,capability.supported);
    assert.equal(c.blocker,capability.supported?null:capability.blocker);
    assert.deepEqual(s,before);
    for(const changed of [{...s,plugin_version:'0.4.1'},{...s,plugin_version:'99.0.0'},{...s,governance_sha256:digest(governance+'modified')}])
      assert.equal(developmentCapability(changed).eligible,false);
  }
});
