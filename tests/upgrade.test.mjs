import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { withStore, id, digest, VERSION, teamHash } from '../plugins/soloco/runtime/store.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import { upgrade, rehearse, checkpoint } from '../plugins/soloco/runtime/upgrade.mjs';
import { MAX_EXECUTION_TIMEOUT_MS } from '../plugins/soloco/runtime/timeout.mjs';
import { hook, call } from '../plugins/soloco/runtime/main.mjs';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'company-upgrade-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'cache');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const options={launch:()=>{},check:()=>({available:true,authenticated:true})};
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
  }));return a;
}
function prepare(a,host='codex',extra={}) {
  const args={...a,...extra,action:'inspect'};
  const inspection=upgrade(args,host);
  return upgrade({...args,action:'prepare',candidate_hash:inspection.candidate_hash,source_instruction:'Upgrade my company team and resume after successful checks',...extra},host,options);
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
  assert.equal(engine.open({...a,epoch:after.owner.epoch},'codex').cos_instructions,after.cos_instructions);
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
  assert.throws(()=>upgrade({...a,action:'prepare',candidate_hash:'stale',source_instruction:'upgrade'},'codex',options),/Candidate changed/);
  assert.throws(()=>upgrade({...a,action:'prepare',candidate_hash:inspection.candidate_hash,source_instruction:'upgrade'},'codex',{...options,check:()=>({available:true,authenticated:false})}),/signed in/);
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
    const a=setup(),p=prepare(a),model=modelFor(a);let invoked=0;
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
  assert.match(text,/PINNED COMPANY COS/);assert.doesNotMatch(text,/Make the work visible/);
});

// Synthetic native CLIs exercise actual detached worker launch and both adapter protocols.
// They are deterministic integration fixtures, not evidence of live provider acceptance.
test('MCP upgrade completes through detached native processes on both host adapters',async()=>{
  const bin=path.join(base,'bin');fs.mkdirSync(bin,{recursive:true});
  const source=`#!${process.execPath}
import {randomUUID} from 'node:crypto';
const a=process.argv.slice(2),claude=process.argv[1].endsWith('claude');
if(a.includes('--version'))console.log('synthetic CLI');
else if(a.includes('--help'))console.log('--ignore-user-config --json --sandbox --tools --strict-mcp-config --setting-sources --output-format');
else if(a[0]==='login'||a[0]==='auth')process.exit(0);
else {
 let p='';for await(const c of process.stdin)p+=c;
 let text;
 if(p.includes('soloco-upgrade-pages-v1')) {
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
 else {console.log(JSON.stringify({type:'thread.started',thread_id:native}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text}}));}
}
`;
  for(const name of ['codex','claude'])fs.writeFileSync(path.join(bin,name),source,{mode:0o700});
  const oldPath=process.env.PATH;process.env.PATH=bin+path.delimiter+oldPath;
  try {
    for(const host of ['codex','claude']) {
      const a=setup(host);
      const args={root:a.root,session_id:a.session_id};
      const inspection=await call('company_upgrade',{...args,action:'inspect'},host);
      const started=await call('company_upgrade',{...args,action:'prepare',expected_epoch:1,candidate_hash:inspection.candidate_hash,source_instruction:'Upgrade this team'},host);
      const s=await call('company_wait',{...args,seconds:10},host);
      assert.equal(s.upgrade.status,'ready',s.upgrade.error);
      assert.notEqual(s.upgrade.probe.native_id,s.upgrade.review.native_id);
      const applied=await call('company_upgrade',{...args,action:'apply',expected_epoch:started.owner.epoch,upgrade_id:started.upgrade.id},host);
      const verified=await call('company_upgrade',{...args,action:'verify',expected_epoch:applied.owner.epoch,upgrade_id:started.upgrade.id},host);
      assert.equal(verified.upgrade.status,'completed');
      await call('company_open',args,host);
      await call('company_control',{...args,action:'resume',expected_epoch:verified.owner.epoch,source_instruction:'Resume the upgraded preparation team'},host);
      const job=await call('company_dispatch',{...args,epoch:verified.owner.epoch,role:'pm',task:'Recover company intent and prepare the next bounded proposal'},host);
      const resumed=await call('company_wait',{...args,seconds:10},host);
      assert.equal(resumed.jobs.find(j=>j.id===job.id).status,'completed');
      assert.notEqual(resumed.sessions.pm.native_id,'native-old');
      assert.notEqual(resumed.sessions.pm.instance_id,'pm-old');
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
  const args={...a,action:'prepare',candidate_hash:inspection.candidate_hash,source_instruction:'Upgrade'};
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
  assert.ok(JSON.stringify(read(a).upgrade.checkpoint).length>200000);
  applyAndVerify(args);
  assert.equal(read(a).records.large.content,content);
});

for(const version of ['0.2.0','0.6.0','0.6.1','0.6.2','0.6.3']) test(`compatible ${version} companies can optionally adopt and recover team definitions`,async()=>{
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
  const p=prepare(a),u=read(a).upgrade,subject=buildEvidence(u.checkpoint,originalHistory);
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
  assert.equal(read(a).records.source.content,u.checkpoint.records.source.content);
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
  for(const change of ['history','owner','checkpoint','deadline','candidate']) {
    const a=setup(),p=prepare(a),model=modelFor(a),now=Date.now;
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
    withStore(a.root,db=>db.transaction('test.old-created',s=>{s.upgrade.created_at=new Date(Date.now()-8*60*1000).toISOString();if(legacy)delete s.upgrade.deadline_ms;return s;}));
    assert.equal(engine.status(a,'codex').upgrade.status,legacy?'failed':'queued');
    assert.equal(read(a).upgrade.id,p.upgrade.id);
  }
});

test('native page calls use the runtime ceiling capped by the unchanged rehearsal deadline',async()=>{
  const a=setup(),p=prepare(a),model=modelFor(a),now=Date.now;
  const originalDeadline=read(a).upgrade.deadline_ms;
  let calls=0;
  try {
    Date.now=()=>originalDeadline-45*60*1000;
    await rehearse(a.root,p.upgrade.id,async(...args)=>{
      const task=JSON.parse(args[2]);
      assert.equal(args[4],calls===0?MAX_EXECUTION_TIMEOUT_MS:90000);
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
  assert.equal(u.deadline_ms,originalDeadline);
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
    assert.ok(args[2].length+40000<=900000);
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
