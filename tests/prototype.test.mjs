import {exactStatus} from './helpers/public-exact.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { id, withStore, teamHash, digest, installedTeam } from '../plugins/soloco/runtime/store.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import { call, hook } from '../plugins/soloco/runtime/main.mjs';
import { work } from '../plugins/soloco/runtime/worker.mjs';
import { prototypeAssignment, prototypeCapability } from '../plugins/soloco/runtime/prototype.mjs';
import { assignmentContext } from '../plugins/soloco/runtime/context.mjs';
import { upgrade, rehearse } from '../plugins/soloco/runtime/upgrade.mjs';

// Immutable published contract from 7adf94a8cf0943143fad5f83f3c2c4bda3a4a142:SPEC.md.
const v018Governance=fs.readFileSync(new URL('./fixtures/governance-v018.md',import.meta.url),'utf8');
assert.equal(digest(v018Governance),'185933ddeafe9709bef44e9a6605ba7adb5faaa8bc43c1c64f1da3b03ae5f400');
// Immutable published contract from 64bd2eb:SPEC.md.
const v019Governance=fs.readFileSync(new URL('./fixtures/governance-v019.md',import.meta.url),'utf8');
assert.equal(digest(v019Governance),'d79b73676543ab053ea5ce7e456364f68700d0340d47c852a83bc97308f6a422');

const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-prototype-test-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'cache');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const read=a=>withStore(a.root,db=>db.read());
function setup(host='codex') {
  const root=fs.mkdtempSync(path.join(base,'company-'));
  const a={root,session_id:id('founder'),epoch:1};
  engine.bind(root,a.session_id,host);engine.open({...a,idea:'An offline fictional calculator'},host);
  // Explicit synthetic fixture setup for later snapshot-based handover/upgrades.
  withStore(root,db=>db.migrate());
  fs.writeFileSync(path.join(root,'private.txt'),'PRIVATE_DO_NOT_READ');
  return a;
}
const files=[{path:'sum.mjs',content:'export const sum = values => values.reduce((a,b)=>a+b,0);\n'},
  {path:'sum.test.mjs',content:"import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport {sum} from './sum.mjs';\ntest('fictional sum',()=>assert.equal(sum(JSON.parse(fs.readFileSync(new URL('./fixtures/input.json',import.meta.url)))),6));\n"}];
function plan(a,host='codex',extra={}) {
  return engine.prototype({...a,action:'plan',output_dir:'prototypes/demo',paths:['fixtures/input.json','sum.mjs','sum.test.mjs'],test_paths:['sum.test.mjs'],fixtures:[{path:'fixtures/input.json',content:'[1,2,3]'}],fixture_source:'Founder supplied [1,2,3] as fictional numbers',acceptance:'Materialize source and tests for adding fictional numbers; functional acceptance remains pending execution.',stop_conditions:'Stop if a dependency, private input or network service is needed.',max_attempts:2,expires_at:new Date(Date.now()+3600000).toISOString(),...extra},host);
}
function queue(a,{role='engineer',prototype_id,review_of}={}) {
  const jid=id('job'),instance=id(role);
  withStore(a.root,db=>db.transaction('test.queue',s=>{
    const target=s.records[review_of];
    const j={id:jid,role,instance_id:instance,session_key:instance,host:s.owner.host,native_id:null,epoch:s.owner.epoch,status:'queued',task:'Honor the exact permitted scope',inputs:[],review_of:target?{id:target.id,revision:target.revision}:null,...(prototype_id?{prototype_id}:{}),created_at:new Date().toISOString()};
    prototypeAssignment(s,j,true);
    const c=assignmentContext(s,j);s.jobs[jid]={...j,inputs:c.inputs,context_sha256:c.hash};
    s.sessions[instance]={instance_id:instance,role,host:s.owner.host,native_id:null};return s;
  }));return jid;
}
function output(extra={},native=id('native')) {return {native_id:native,text:JSON.stringify({content:'Reviewable local source and explicit limitations',messages:[],notices:[],...extra})};}
async function review(a,target,{verdict='Pass',extra={},native}={}) {
  const j=queue(a,{role:'qa',review_of:target.id});
  await work(a.root,j,async(_h,_n,prompt)=>{
    assert.match(prompt,/NOT executed tests/);assert.ok(!prompt.includes('PRIVATE_DO_NOT_READ'));
    return output({review:{verdict,reason:'Checked exact scope, source and limitations',permitted_action:verdict==='Pass'?(target.prototype.type==='plan'?'authorize_local_prototype':'materialize_local_prototype'):'hold',scope_sha256:target.prototype.scope_sha256,...(target.prototype.bundle_sha256?{bundle_sha256:target.prototype.bundle_sha256}:{}),blockers:verdict==='Pass'?[]:['Needs a repair'],tests_executed:false,...extra}},native);
  });
  const s=read(a);return s.records[s.jobs[j].artifact_id]??s.jobs[j];
}
async function authorize(a,p,host='codex') {
  const r=await review(a,p);
  return engine.prototype({...a,action:'authorize',plan_id:p.id,scope_sha256:p.prototype.scope_sha256,review_id:r.id,source_instruction:'Create only the displayed code/test files with these fictional fixtures and limits. Do not run them.',fictional_fixtures_confirmed:true},host);
}
async function generate(a,p,{during,override}={}) {
  const j=queue(a,{prototype_id:p.id});
  await work(a.root,j,async(_h,native,prompt)=>{
    assert.equal(native,null);assert.match(prompt,/FILE GENERATION ONLY/);
    assert.match(prompt,/fictional_fixtures_only/);assert.ok(!prompt.includes('PRIVATE_DO_NOT_READ'));
    if(during) await during();return output(override??{files});
  });
  const s=read(a);return s.records[s.jobs[j].artifact_id]??s.jobs[j];
}
function materialize(a,p,b,r,host='codex') {
  return engine.prototype({...a,action:'materialize',plan_id:p.id,artifact_id:b.id,bundle_sha256:b.prototype.bundle_sha256,review_id:r.id},host);
}

test('bounded code/test bundle flows through independent reviews and founder authorization on both hosts',async()=>{
  for(const host of ['codex','claude']) {
    const a=setup(host),p=plan(a,host);
    const before=read(a);assert.throws(()=>queue(a,{prototype_id:p.id}),/authorization/);
    await authorize(a,p,host);const b=await generate(a,p);const r=await review(a,b);
    const receipt=materialize(a,p,b,r,host),s=read(a);
    assert.equal(receipt.status,'written');assert.equal(receipt.tests_executed,false);
    assert.equal(s.id,before.id);assert.equal(s.mode,'preparation');
    assert.equal(fs.readFileSync(path.join(a.root,'private.txt'),'utf8'),'PRIVATE_DO_NOT_READ');
    assert.equal(fs.readFileSync(path.join(receipt.directory,'fixtures/input.json'),'utf8'),'[1,2,3]');
    for(const f of files) assert.equal(fs.readFileSync(path.join(receipt.directory,f.path),'utf8'),f.content);
    assert.ok(s.notices.some(n=>/Tests were not run/.test(n.summary)));
    // This test harness executes only our hand-written deterministic fixture, not arbitrary model code.
    const ran=spawnSync(process.execPath,['--test','sum.test.mjs'],{cwd:receipt.directory,encoding:'utf8'});
    assert.equal(ran.status,0,ran.stdout+ran.stderr);
    assert.throws(()=>materialize(a,p,b,r,host),/export attempt/);
  }
});
test('no authorization bypass via a draft decision, notice receipt, wrong hash or missing fixture confirmation',async()=>{
  const a=setup(),p=plan(a);
  engine.save({...a,kind:'decision',content:'Approved'},'codex');
  const n=engine.notify({...a,kind:'decision_required',summary:'Prototype approval needed'},'codex');
  engine.acknowledge({...a,notice_id:n.id,seen:true},'codex');
  assert.throws(()=>queue(a,{prototype_id:p.id}),/authorization/);
  const r=await review(a,p),args={...a,action:'authorize',plan_id:p.id,scope_sha256:p.prototype.scope_sha256,review_id:r.id,source_instruction:'Approve exact scope',fictional_fixtures_confirmed:true};
  assert.throws(()=>engine.prototype({...args,scope_sha256:'wrong'},'codex'),/hash/);
  assert.throws(()=>engine.prototype({...args,fictional_fixtures_confirmed:false},'codex'),/fictional/);
  assert.throws(()=>engine.prototype({...args,review_id:'missing'},'codex'),/QA Pass/);
});
test('plan refuses traversal, config paths, collisions, absent tests, excessive attempts and expiry',()=>{
  const a=setup();
  for(const extra of [{output_dir:'../outside'},{paths:['../escape','sum.test.mjs']},{paths:['/tmp/file','sum.test.mjs']},{paths:['a\\b','sum.test.mjs']},{paths:['.env','sum.test.mjs']},{paths:['AGENTS.md','sum.test.mjs']},{paths:['a','A']},{paths:['a','a/b']},{test_paths:[]},{max_attempts:4},{expires_at:'2000-01-01'}]) assert.throws(()=>plan(a,'codex',extra));
  const outside=fs.mkdtempSync(path.join(base,'outside-'));fs.symlinkSync(outside,path.join(a.root,'prototypes'));
  assert.throws(()=>plan(a),/linked/);assert.deepEqual(fs.readdirSync(outside),[]);
});
test('prototype records cannot be edited through generic save',()=>{
  const a=setup(),p=plan(a);
  assert.throws(()=>engine.save({...a,id:p.id,kind:'artifact',expected_revision:1,content:'remove limits'},'codex'),/immutable/);
});
test('workers reject unauthorized files, fixture rewrites, missing paths and oversized bundles',async()=>{
  for(const override of [{files:[...files,{path:'../escape',content:'x'}]},{files:[...files,{path:'fixtures/input.json',content:'[9]'}]},{files:files.slice(0,1)},{files:files.map(f=>({...f,content:'x'.repeat(60000)}))},{blocked:'Needs a network dependency'}]) {
    const a=setup(),p=plan(a);await authorize(a,p);const failed=await generate(a,p,{override});
    assert.equal(failed.status,'failed');assert.equal(fs.existsSync(path.join(a.root,'prototypes/demo')),false);
    assert.ok(read(a).notices.length);
  }
  const a=setup(),j=queue(a);await work(a.root,j,async()=>output({files}));
  assert.equal(read(a).jobs[j].status,'failed');
});
test('pause, revocation and changed founder constraints quarantine late bundles',async()=>{
  for(const change of ['pause','revoke','constraint']) {
    const a=setup(),p=plan(a);await authorize(a,p);
    const b=await generate(a,p,{during:()=>{
      if(change==='pause') engine.control({...a,action:'pause',expected_epoch:1,source_instruction:'Pause'},'codex');
      else if(change==='revoke') engine.prototype({...a,action:'revoke',plan_id:p.id,scope_sha256:p.prototype.scope_sha256,source_instruction:'Withdraw this authorization'},'codex');
      else engine.save({...a,kind:'intent',content:'Do not produce code anymore'},'codex');
    }});
    assert.equal(b.status,'Quarantined');assert.ok(!b.prototype);assert.deepEqual(b.quarantined_files,files);
    assert.equal(fs.existsSync(path.join(a.root,'prototypes/demo')),false);
  }
});
test('expired scopes cannot dispatch even after a previous authorization',async()=>{
  const a=setup(),p=plan(a);await authorize(a,p);
  const original=Date.now;Date.now=()=>original()+7200000;
  try {assert.throws(()=>queue(a,{prototype_id:p.id}),/expired/);} finally {Date.now=original;}
});
test('failed candidate can be repaired within bounded attempts without erasing failed review',async()=>{
  const a=setup(),p=plan(a);await authorize(a,p);
  const b1=await generate(a,p),failed=await review(a,b1,{verdict:'Fail'});
  assert.throws(()=>materialize(a,p,b1,failed),/stale|QA Pass/);
  const b2=await generate(a,p),r=await review(a,b2);
  assert.equal(read(a).records[failed.id].review.verdict,'Fail');
  assert.throws(()=>queue(a,{prototype_id:p.id}),/retry limit/);
  assert.equal(materialize(a,p,b2,r).status,'written');
});
test('QA must permit exact bundle without test-execution claims or unresolved blockers',async()=>{
  for(const extra of [{permitted_action:'deploy'},{bundle_sha256:'wrong'},{scope_sha256:'wrong'},{blockers:['Unresolved']},{tests_executed:true}]) {
    const a=setup(),p=plan(a);await authorize(a,p);const b=await generate(a,p),r=await review(a,b,{extra});
    if(extra.blockers){
      assert.equal(r.status,'failed');assert.match(r.error,/Pass cannot contain/);
      assert.equal(r.artifact_id,undefined);assert.match(r.rejected_output.text,/Unresolved/);
      assert.throws(()=>materialize(a,p,b,r),/constraints changed|QA Pass/);
    }else assert.throws(()=>materialize(a,p,b,r),/QA Pass/);
    assert.equal(fs.existsSync(path.join(a.root,'prototypes/demo')),false);
  }
});
test('review sharing the actual author native session fails even with a different role instance',async()=>{
  const a=setup(),p=plan(a);await authorize(a,p);const b=await generate(a,p);
  const r=await review(a,b,{native:read(a).jobs[b.job_id].native_id});
  assert.equal(r.status,'failed');assert.match(r.error,/native session/);
});
test('prototype authorization retains resolved notice conditions and holds a later disposition',async()=>{
  const a=setup(),n=engine.notify({...a,kind:'must_know',summary:'Only fictional inputs are permitted'},'codex');
  const p=plan(a);await authorize(a,p);
  engine.acknowledge({...a,notice_id:n.id,resolution:'Planning is complete; do not materialize before another review',source_reference:'Fictional later founder disposition'},'codex');
  assert.throws(()=>queue(a,{prototype_id:p.id}),/changed|scope|constraint|environment/i);
  const s=read(a);assert.equal(s.records[p.id].prototype.attempts.length,0);
  assert.equal(s.notices.find(v=>v.id===n.id).resolution.text,'Planning is complete; do not materialize before another review');
});
test('existing files and symlinked output destinations are never overwritten',async()=>{
  for(const linked of [false,true]) {
    const a=setup(),p=plan(a);await authorize(a,p);const b=await generate(a,p),r=await review(a,b);
    fs.mkdirSync(path.join(a.root,'prototypes'));
    const dir=linked?fs.mkdtempSync(path.join(base,'linked-')):path.join(a.root,'prototypes/demo');
    if(linked)fs.symlinkSync(dir,path.join(a.root,'prototypes/demo'));else fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir,'keep.txt'),'keep');
    assert.throws(()=>materialize(a,p,b,r),/exists|linked/);
    assert.equal(fs.readFileSync(path.join(dir,'keep.txt'),'utf8'),'keep');assert.deepEqual(fs.readdirSync(dir),['keep.txt']);
  }
});
test('partial filesystem failure retains a failed receipt and blocks retry',async()=>{
  const a=setup(),p=plan(a);await authorize(a,p);const b=await generate(a,p),r=await review(a,b);
  const original=fs.writeFileSync;
  fs.writeFileSync=(file,...args)=>{if(String(file).endsWith('/sum.mjs'))throw new Error('Simulated disk failure');return original(file,...args);};
  try {assert.throws(()=>materialize(a,p,b,r),/disk failure/);}finally{fs.writeFileSync=original;}
  const after=read(a);assert.equal(after.records[p.id].prototype.export.status,'failed');
  assert.equal(fs.readFileSync(path.join(a.root,'prototypes/demo/fixtures/input.json'),'utf8'),'[1,2,3]');
  assert.throws(()=>materialize(a,p,b,r),/export attempt/);
  assert.ok(after.notices.some(n=>/partial files/.test(n.summary)));
});
test('host handover preserves evidence and notices but never transfers prototype permission',async()=>{
  const a=setup(),p=plan(a);await authorize(a,p);const b=await generate(a,p),r=await review(a,b);
  const next={...a,session_id:'next',epoch:2};engine.bind(a.root,next.session_id,'claude');
  engine.control({...next,action:'handover',expected_epoch:1,source_instruction:'Continue in Claude'},'claude');
  assert.throws(()=>engine.control({...next,action:'resume',expected_epoch:2,source_instruction:'Resume preparation'},'claude'),/reconstruction/);
  assert.throws(()=>materialize(next,p,b,r,'claude'),/paused|authority|constraints/);
  assert.ok(read(a).records[r.id]);assert.ok(read(a).records[p.id].prototype.authorization);
});
test('checked team replacement preserves prototype records but requires fresh authority afterward',async()=>{
  const a=setup();
  withStore(a.root,db=>db.transaction('test.prior_team',s=>{s.cos_instructions+='\nPrior reviewed company-specific CoS instructions.';s.team_sha256=teamHash(s);return s;}));
  engine.notify({...a,kind:'must_know',summary:'Deployment remains prohibited'},'codex');
  const p=plan(a);await authorize(a,p);const b=await generate(a,p),r=await review(a,b),before=read(a);
  const inspection=upgrade({...a,action:'inspect'},'codex');
  const prepared=upgrade({...a,action:'prepare',expected_epoch:1,candidate_hash:inspection.candidate_hash,source_instruction:'Adopt the installed team, preserve records and limits'},'codex',{launch:()=>{},check:()=>({available:true,authenticated:true})});
  const sessions=new Map(),citations=new Map();
  await rehearse(a.root,prepared.upgrade.id,async(_host,native,prompt)=>{
    const task=JSON.parse(prompt),role=task.role,a=task.authority,nativeId=`upgrade-${role}`;
    assert.equal(native,sessions.has(role)?nativeId:null);sessions.set(role,true);
    if(task.page) {
      citations.set(role,{source_id:task.page.source_id,sha256:task.page.sha256,...task.page.citation_ranges[0]});
    }
    const refs=[citations.get(role)],field=text=>({text,citations:refs});
    return {native_id:nativeId,text:JSON.stringify({content:'Reconstructed company constraints and retained prototype evidence; file-only grants do not transfer across ownership',citations:refs,
      continuity:{company_id:a.company_id,checkpoint_sha256:a.checkpoint_sha256,inventory_sha256:a.inventory_sha256,
        constraints:field('File-only grants do not transfer across ownership'),unresolved_work:field('Prototype bundle awaits a new authorized scope; deployment remains prohibited'),next_action:field('Preserve records and resume preparation without carrying prototype authority')},
      ...(role==='qa'?{review:{verdict:'Pass',reason:'Reconstructed all records and retained prototype limits',permitted_action:task.phase==='synthesis'?'apply_preparation_team':'continue_upgrade_review',blockers:[]}}:{})})};
  });
  const args={...a,expected_epoch:prepared.owner.epoch,upgrade_id:prepared.upgrade.id};
  const applied=upgrade({...args,action:'apply'},'codex');
  const verified=upgrade({...args,expected_epoch:applied.owner.epoch,action:'verify'},'codex');
  const next={...a,epoch:verified.owner.epoch};
  engine.control({...next,action:'resume',expected_epoch:next.epoch,source_instruction:'Resume preparation'},'codex');
  const after=read(a);for(const [key,value] of Object.entries(before.records))assert.deepEqual(after.records[key],value);
  assert.deepEqual(after.notices,before.notices);assert.equal(after.id,before.id);
  assert.throws(()=>materialize(next,p,b,r),/authority|constraints/);
  assert.equal(fs.existsSync(path.join(a.root,'prototypes/demo')),false);
});
test('old pinned teams or preserved governance disclose blockers rather than silently enabling implementation',async()=>{
  for(const legacy of ['team','governance']) {
    const a=setup();withStore(a.root,db=>db.transaction('test.old',s=>{
      if(legacy==='team')s.plugin_version='0.3.1';else{s.governance='Old preparation-only contract';s.governance_sha256=digest(s.governance);}
      s.team_sha256=teamHash(s);return s;
    }));
    const before=read(a),s=engine.status(a,'codex');assert.equal(s.capabilities.local_prototype.eligible,false);
    assert.throws(()=>plan(a),/Pinned/);assert.deepEqual(read(a).records,before.records);
    const guidance=JSON.parse(hook({cwd:a.root,session_id:a.session_id,hook_event_name:'SessionStart'},'codex').hookSpecificOutput.additionalContext);
    assert.match(guidance.instruction_loading,/company_open is required/);
    assert.ok(s.capabilities.local_prototype.blocker);
  }
});
test('contract simplification retains known prototype governance without allowing unknown rules or teams',()=>{
  const previous='5f0699c046128d71a42731acdfddaaab4b911361521015def133adcfbdb8fcb9';
  for(const plugin_version of ['0.4.0','0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6','0.6.7','0.7.1','0.7.2','0.7.3',installedTeam().plugin_version]) {
    for(const governance_sha256 of [previous,digest(v018Governance),digest(v019Governance),installedTeam().governance_sha256])
      assert.equal(prototypeCapability({plugin_version,governance_sha256}).eligible,true);
    assert.equal(prototypeCapability({plugin_version,governance_sha256:digest('Unknown rules')}).eligible,false);
    for(const governance of [v018Governance,v019Governance,installedTeam().governance])
      assert.equal(prototypeCapability({plugin_version,governance_sha256:digest(governance+'modified')}).eligible,false);
  }
  for(const plugin_version of ['0.3.1','99.0.0'])
    for(const governance_sha256 of [previous,digest(v018Governance),digest(v019Governance),installedTeam().governance_sha256])
      assert.equal(prototypeCapability({plugin_version,governance_sha256}).eligible,false);
});
test('MCP prototype endpoint validates scope and preserves startup binding and ownership checks',async()=>{
  const a=setup();const s=await call('company_prototype',{...a,action:'inspect'},'codex');assert.equal(s.capability.eligible,true);
  await assert.rejects(call('company_prototype',{...a,action:'execute'},'codex'),/Invalid action/);
  await assert.rejects(call('company_prototype',{...a,action:'inspect',command:'run'},'codex'),/Unknown argument/);
  await assert.rejects(call('company_prototype',{...a,session_id:'unbound',action:'inspect'},'codex'),/binding/);
  engine.bind(a.root,'other','codex');await assert.rejects(call('company_prototype',{...a,session_id:'other',action:'inspect'},'codex'),/own/);
});
test('status reconciles an interrupted write intent into a durable founder notice',()=>{
  const a=setup(),p=plan(a);
  withStore(a.root,db=>db.transaction('test.crashed',s=>{
    s.records[p.id].prototype.export={status:'writing',started_at:'2000-01-01T00:00:00Z',artifact_id:'interrupted'};return s;
  }));
  const s=exactStatus(a,'codex');
  assert.equal(s.records.find(r=>r.id===p.id).prototype.export.status,'failed');
  assert.ok(s.notices.some(n=>n.reference===p.id && /partial files/.test(n.summary)));
});
test('detached prototype and QA processes complete through the MCP tools on Codex and Claude adapters',async()=>{
  const bin=path.join(base,'native-fixture');fs.mkdirSync(bin);
  const script=`#!${process.execPath}
import {randomUUID} from 'node:crypto';
const args=process.argv.slice(2);
if(args.includes('--version')) console.log('synthetic CLI');
else if(args.includes('--help')) console.log('--ignore-user-config --json --sandbox --tools --strict-mcp-config --setting-sources --output-format');
else if(['login','auth'].includes(args[0])) console.log('synthetic signed-in fixture');
else {
 let prompt='';for await(const c of process.stdin)prompt+=c;
 const pack=JSON.parse(prompt.match(/^Assignment context: (.+)$/m)[1]);
 const targetId=prompt.match(/Independent review of artifact ([^,]+),/)?.[1];
 const target=pack.records.find(r=>r.id===targetId);
 const artifact={content:'Synthetic fixture source or static QA; no tests were executed',messages:[],notices:[]};
 if(target) artifact.review={verdict:'Pass',reason:'Fixture checked exact paths and restrictions',permitted_action:target.prototype.type==='plan'?'authorize_local_prototype':'materialize_local_prototype',scope_sha256:target.prototype.scope_sha256,...(target.prototype.bundle_sha256?{bundle_sha256:target.prototype.bundle_sha256}:{}),blockers:[],tests_executed:false};
 else artifact.files=${JSON.stringify(files)};
 const native=randomUUID(),text=JSON.stringify(artifact);
 if(args.includes('--output-format'))console.log(JSON.stringify({type:'result',subtype:'success',session_id:native,result:text}));
 else {console.log(JSON.stringify({type:'thread.started',thread_id:native}));console.log(JSON.stringify({type:'turn.started'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text}}));console.log(JSON.stringify({type:'turn.completed'}));}
}
`;
  for(const host of ['codex','claude'])fs.writeFileSync(path.join(bin,host),script,{mode:0o700});
  const oldPath=process.env.PATH;process.env.PATH=bin+path.delimiter+oldPath;
  try {
    for(const host of ['codex','claude']) {
      const a=setup(host),p=plan(a,host);
      const run=async(args)=>{
        const j=await call('company_dispatch',{...a,task:'Produce only the permitted prototype artifact',...args},host);
        for(let i=0;i<200;i++) {
          await new Promise(resolve=>setTimeout(resolve,20));
          const s=exactStatus(a,host),done=s.jobs.find(x=>x.id===j.id);
          if(!['queued','running'].includes(done.status)) {assert.equal(done.status,'completed',done.error);return s.records.find(r=>r.id===done.artifact_id);}
        }
        throw new Error('Synthetic native prototype process timed out');
      };
      await assert.rejects(call('company_dispatch',{...a,role:'engineer',task:'No authorization yet',prototype_id:p.id},host),/authorization/);
      const scopeReview=await run({role:'qa',review_of:p.id});
      await call('company_prototype',{...a,action:'authorize',plan_id:p.id,scope_sha256:p.prototype.scope_sha256,review_id:scopeReview.id,source_instruction:'Approve this exact fictional file-only scope',fictional_fixtures_confirmed:true},host);
      await assert.rejects(call('company_dispatch',{...a,role:'pm',task:'Wrong role',prototype_id:p.id},host),/Engineering/);
      const b=await run({role:'engineer',prototype_id:p.id}),r=await run({role:'qa',review_of:b.id});
      const receipt=await call('company_prototype',{...a,action:'materialize',plan_id:p.id,artifact_id:b.id,bundle_sha256:b.prototype.bundle_sha256,review_id:r.id},host);
      assert.equal(receipt.status,'written');assert.equal(receipt.tests_executed,false);
      const s=read(a);assert.notEqual(s.jobs[b.job_id].native_id,s.jobs[r.job_id].native_id);
      assert.ok(s.jobs[b.job_id].session_key.includes(':prototype:'));
      assert.equal(s.records[p.id].prototype.attempts.length,1);
    }
  } finally {process.env.PATH=oldPath;}
});

for(const [version,governance] of [['0.18',v018Governance],['0.19',v019Governance]])test(`v${version} pinned company retains its original prototype grant across source update`,async()=>{
  const a=setup();
  withStore(a.root,db=>db.transaction('test.pin_governance',s=>{
    s.governance=governance;s.governance_sha256=digest(s.governance);
    s.cos_instructions=`Original pinned v${version} instructions`;s.team_sha256=teamHash(s);return s;
  }));
  engine.notify({...a,kind:'must_know',summary:'Retain the pinned company constraints.'},'codex');
  const p=plan(a);await authorize(a,p);const before=read(a);
  engine.open(a,'codex');assert.deepEqual(read(a),before);
  const b=await generate(a,p),prepared=read(a);
  assert.equal(b.status,'Submitted');
  for(const [key,record] of Object.entries(before.records))
    assert.deepEqual(prepared.records[key],key===p.id?{...record,prototype:{...record.prototype,attempts:[b.job_id]}}:record);
  assert.deepEqual(prepared.notices,before.notices);assert.equal(prepared.paused,before.paused);
  const r=await review(a,b);materialize(a,p,b,r);
  const after=read(a);
  for(const key of ['id','plugin_version','governance','governance_sha256','cos_instructions','team_sha256','owner'])assert.deepEqual(after[key],before[key]);
  assert.deepEqual(after.records[p.id].prototype.authorization,before.records[p.id].prototype.authorization);
  const decision=before.records[p.id].prototype.authorization.decision_id;
  assert.deepEqual(after.records[decision],before.records[decision]);
  assert.equal(after.upgrade,undefined);
});

test('opening a paused v0.19 company preserves its pins, records, notices and prototype authority',async()=>{
  const a=setup();
  withStore(a.root,db=>db.transaction('test.pin_v019',s=>{
    s.governance=v019Governance;s.governance_sha256=digest(s.governance);
    s.cos_instructions='Original pinned v0.19 instructions';s.team_sha256=teamHash(s);return s;
  }));
  engine.notify({...a,kind:'must_know',summary:'Keep this unresolved notice.'},'codex');
  const p=plan(a);await authorize(a,p);
  engine.control({...a,action:'pause',expected_epoch:1,source_instruction:'Pause local preparation.'},'codex');
  const before=read(a);
  engine.open(a,'codex');assert.deepEqual(read(a),before);
  assert.throws(()=>queue(a,{prototype_id:p.id}),/paused/);
  assert.deepEqual(read(a),before);
});

test('supported pure rename preserves prototype authority; unknown preferences stay binding',async()=>{
 const a=setup(),p=plan(a);await authorize(a,p);const name=read(a).name;
 engine.control({...a,action:'rename',name:'Renamed Fixture',expected_name:name,expected_epoch:1,source_instruction:'Rename the company to Renamed Fixture'},'codex');
 assert.doesNotThrow(()=>queue(a,{prototype_id:p.id}));
 const b=setup(),q=plan(b);await authorize(b,q);
 engine.save({...b,kind:'preference',content:'New unknown condition',basis:'explicit',source_reference:'Founder'},'codex');
 assert.throws(()=>queue(b,{prototype_id:q.id}),/authority|constraints/);
});
