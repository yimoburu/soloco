import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { withStore, id, digest, VERSION, teamHash } from '../plugins/company/runtime/store.mjs';
import * as engine from '../plugins/company/runtime/engine.mjs';
import { upgrade, rehearse } from '../plugins/company/runtime/upgrade.mjs';
import { hook, call } from '../plugins/company/runtime/main.mjs';

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
  let count=0;
  return async (_host,native,prompt)=>{
    assert.equal(native,null);count++;
    const u=read(a).upgrade,c=u.checkpoint;
    const continuity={company_id:c.id,checkpoint_sha256:u.checkpoint_sha256,record_ids:Object.keys(c.records),job_ids:Object.keys(c.jobs),notice_ids:c.notices.map(n=>n.id),message_ids:c.messages.map(m=>m.id),constraints:'Preparation only; five founder hours/week; customer data held',unresolved_work:'Failed review lacks evidence; founder notice unresolved',next_action:'Prepare research proposal only'};
    if(omit)continuity.notice_ids=[];
    return {native_id:sameId?'same-native':`native-${count}`,text:JSON.stringify({content:'Recovered objectives, limits, failed review and next permitted preparation',continuity,...(prompt.startsWith('You are an independent')?{review:{verdict,reason:'Compared raw records, failed review, limits, notices and proposed next action',permitted_action:verdict==='Pass'?'apply_preparation_team':'hold',blockers:verdict==='Pass'?[]:['Continuity evidence failed']}}:{})})};
  };
}
async function ready(a,host='codex') {
  const p=prepare(a,host);await rehearse(a.root,p.upgrade.id,modelFor(a));
  assert.equal(read(a).upgrade.status,'ready');
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
  assert.equal(read(a).upgrade.status,'ready');
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
  withStore(a.root,db=>db.transaction('test.timeout',s=>{s.upgrade.created_at='2000-01-01T00:00:00Z';return s;}));
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
 if(p.includes('Company checkpoint: ')) {
 const s=JSON.parse(p.split('Company checkpoint: ')[1].split('\\nCheckpoint SHA256: ')[0]);
 const hash=p.split('Checkpoint SHA256: ')[1].split('\\n')[0];
 text=JSON.stringify({content:'Recovered bounded preparation and open obligations',continuity:{company_id:s.id,checkpoint_sha256:hash,record_ids:Object.keys(s.records),job_ids:Object.keys(s.jobs),notice_ids:s.notices.map(n=>n.id),message_ids:s.messages.map(m=>m.id),constraints:'Preserve limits',unresolved_work:'Preserve notices and failed reviews',next_action:'Preparation only'},...(p.startsWith('You are an independent')?{review:{verdict:'Pass',reason:'Fixture checked raw checkpoint',permitted_action:'apply_preparation_team',blockers:[]}}:{})});
 } else text=JSON.stringify({content:'New specialist recovered company records and prepared the next bounded proposal',messages:[],notices:[]});
 const native=randomUUID();
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
  const url=new URL('../plugins/company/runtime/upgrade.mjs',import.meta.url).href;
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

test('oversized checkpoints fail before migration and never get silently truncated',()=>{
  const a=setup();withStore(a.root,db=>db.transaction('test.large',s=>{s.records.large={id:'large',content:'x'.repeat(310000)};return s;}));
  assert.throws(()=>prepare(a),/bounded rehearsal size/);
  assert.equal(read(a).schema,1);assert.equal(read(a).owner.epoch,1);assert.equal(read(a).records.large.content.length,310000);
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
      artifact.continuity.constraints=valid?['Preparation only','Founder workload and budget remain bounded']:[];
      artifact.continuity.unresolved_work=['Failed review remains unresolved'];
      artifact.continuity.next_action=['Prepare a proposal without external execution'];
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
      if(value.review)value.review=review;
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

test('schema-2 v0.2.0 companies can upgrade and recover their prior definitions on the patch runtime',async()=>{
  const a=setup();withStore(a.root,db=>db.transaction('test.previous_patch',s=>{
    s.schema=2;s.runtime_version='0.2.0';s.plugin_version='0.2.0';s.cos_instructions='Preserve founder limits and independently review preparation';s.team_sha256=teamHash(s);return s;
  }));
  assert.throws(()=>engine.open(a,'codex'),/checked runtime upgrade/);
  const args=await ready(a),done=applyAndVerify(args);
  assert.equal(done.runtime_version,'0.2.1');
  const recovered=upgrade({...a,expected_epoch:done.owner.epoch,upgrade_id:done.upgrade.id,action:'recover',source_instruction:'Recover prior team definitions'},'codex');
  assert.equal(recovered.plugin_version,'0.2.0');assert.equal(recovered.runtime_version,'0.2.1');
  assert.doesNotThrow(()=>engine.open(a,'codex'));
});
