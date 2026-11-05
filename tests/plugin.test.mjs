import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { withStore, id, VERSION, teamHash, digest } from '../plugins/soloco/runtime/store.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import { hook, call } from '../plugins/soloco/runtime/main.mjs';
import { work } from '../plugins/soloco/runtime/worker.mjs';
import { assignmentContext, contextMatches } from '../plugins/soloco/runtime/context.mjs';
import { developmentAssignment, developmentCapability } from '../plugins/soloco/runtime/develop.mjs';
import { commandArgs, parseOutput, modelCatalog } from '../plugins/soloco/runtime/adapters.mjs';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'company-test-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'cache');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
function setup(host='codex') {
  const root=fs.mkdtempSync(path.join(base,'venture-'));
  const a={root,session_id:id('founder'),epoch:1,idea:'Help freelancers collect project briefs'};
  engine.bind(root,a.session_id,host);
  engine.open(a,host);
  return a;
}
function queued(a,{role='pm',review_of=null,inputs=[]}={}) {
  const jid=id('job'), instance=id(role);
  withStore(a.root,db=>db.transaction('test.queue',s=>{
    s.sessions[instance]={instance_id:instance,role,native_id:null,host:s.owner.host};
    s.jobs[jid]={id:jid,role,session_key:instance,instance_id:instance,host:s.owner.host,epoch:s.owner.epoch,status:'queued',task:'Prepare a bounded experiment.',inputs,review_of,created_at:new Date().toISOString()};return s;
  }));return jid;
}
const result=(content='A bounded experiment.',extra={})=>({native_id:id('native'),text:JSON.stringify({content,messages:[],notices:[],...extra})});

test('initialize in existing folder without touching user files, resume pinned company',()=>{
  const a=setup();fs.writeFileSync(path.join(a.root,'existing.txt'),'preserve');
  const before=engine.status(a,'codex');
  const resumed=engine.open({...a,idea:'Must not reset'},'codex');
  assert.equal(resumed.company_id,before.company_id);assert.equal(resumed.idea,before.idea);
  assert.equal(fs.readFileSync(path.join(a.root,'existing.txt'),'utf8'),'preserve');
  assert.equal(resumed.capabilities.external_execution,false);assert.equal(resumed.phase,'Frame');
});
test('missing hook, path traversal and symbolic company directories are refused',()=>{
  const root=fs.mkdtempSync(path.join(base,'unbound-'));
  assert.throws(()=>engine.open({root,session_id:'invented',idea:'x'},'codex'),/binding/);
  assert.throws(()=>engine.bind('../relative','s','codex'),/absolute/);
  fs.symlinkSync(path.join(base,'cache'),path.join(root,'.company'));
  engine.bind(root,'s','codex');assert.throws(()=>engine.open({root,session_id:'s',idea:'x'},'codex'),/linked/);
});
test('hook ignores unrelated populated projects; empty folder supplies CoS without creating company',()=>{
  const root=fs.mkdtempSync(path.join(base,'hook-'));
  const input={cwd:root,session_id:'host-chat',hook_event_name:'UserPromptSubmit',prompt:'An idea for freelancers'};
  assert.match(hook(input,'claude').hookSpecificOutput.additionalContext,/Chief of Staff/);
  assert.equal(fs.existsSync(path.join(root,'.company')),false);
  fs.writeFileSync(path.join(root,'app.js'),'code');assert.deepEqual(hook({...input,prompt:'Fix this bug'},'claude'),{});
});
test('another chat cannot claim coordinator or amend its records',()=>{
  const a=setup(),b={...a,session_id:'other'};engine.bind(b.root,b.session_id,'codex');
  assert.throws(()=>engine.open(b,'codex'),/does not own/);
  assert.throws(()=>engine.save({...b,kind:'plan',content:'overwrite'},'codex'),/does not own/);
  assert.equal(engine.status(b,'codex').idea,a.idea);
});
test('optimistic revisions preserve older draft and reject stale amendments',()=>{
  const a=setup();const r=engine.save({...a,kind:'intent',content:'solo freelancers',source_reference:'founder message'},'codex');
  engine.save({...a,id:r.id,kind:'intent',expected_revision:1,content:'agencies'},'codex');
  assert.throws(()=>engine.save({...a,id:r.id,kind:'intent',expected_revision:1,content:'stale'},'codex'),/version conflict/);
  const saved=engine.status(a,'codex').records[0];assert.equal(saved.previous[0].content,'solo freelancers');assert.equal(saved.status,'Draft');
});
test('specialist artifact, direct peer message and notice survive a new connection',async()=>{
  const a=setup(),j=queued(a);
  await work(a.root,j,async()=>result('Scope proposal',{messages:[{to:'research',content:'Check the assumption'}],notices:[{kind:'must_know',summary:'Customer evidence is missing'}]}));
  const state=engine.status(a,'codex');assert.equal(state.jobs[0].status,'completed');assert.equal(state.records[0].status,'Submitted');
  assert.equal(state.messages[0].from,'pm');assert.equal(state.messages[0].to,'research');assert.equal(state.notices.length,1);
  assert.ok(Object.values(state.sessions)[0].native_id);
});
test('independent review binds exact author artifact version and does not approve Frame',async()=>{
  const a=setup(),r=engine.save({...a,kind:'plan',content:'Hypothesis and bounds'},'codex');
  const j=queued(a,{role:'qa',review_of:{id:r.id,revision:r.revision}});
  await work(a.root,j,async()=>result('Review evidence',{review:{verdict:'Pass',reason:'Explicit measurable criteria'}}));
  const s=engine.status(a,'codex');const review=s.records.find(r=>r.kind==='review');
  assert.notEqual(review.author_instance,r.author_instance);assert.equal(review.review.verdict,'Pass');assert.equal(s.phase,'Frame');assert.equal(s.mode,'preparation');
});
test('generation and review prompts assign bounded deliverable ownership on both hosts',async()=>{
  for(const host of ['codex','claude']) {
    const a=setup(host),producer=queued(a,{role:'engineer'});
    let generationPrompt,reviewPrompt;
    await work(a.root,producer,async(actualHost,_native,prompt)=>{
      assert.equal(actualHost,host);generationPrompt=prompt;return result('Candidate with evidence and limitations');
    });
    let s=engine.status(a,host),generation=s.jobs.find(j=>j.id===producer);
    assert.equal(generation.status,'completed',generation.error);
    const artifact=s.records.find(r=>r.id===generation.artifact_id);
    const reviewer=queued(a,{role:'qa',review_of:{id:artifact.id,revision:artifact.revision}});
    await work(a.root,reviewer,async(actualHost,_native,prompt)=>{
      assert.equal(actualHost,host);reviewPrompt=prompt;
      return result('Evidence is incomplete',{review:{verdict:'Blocked',reason:'Required acceptance evidence is missing'}});
    });
    s=engine.status(a,host);const reviewJob=s.jobs.find(j=>j.id===reviewer);
    assert.equal(reviewJob.status,'completed',reviewJob.error);
    const review=s.records.find(r=>r.id===reviewJob.artifact_id);
    assert.equal(review.review.verdict,'Blocked');assert.notEqual(review.author_instance,artifact.author_instance);
    for(const prompt of [generationPrompt,reviewPrompt]) {
      assert.match(prompt,/own the quality and completeness.*within your assigned scope/);
      assert.match(prompt,/independent domain judgment.*unsupported assumptions/);
      assert.match(prompt,/disclose uncertainty, disagreements, missing evidence and blockers/);
      assert.match(prompt,/assigned acceptance criteria and evidence/);
      assert.match(prompt,/pinned governance.*authority and permitted attempts/);
      assert.match(prompt,/ownership grants no additional authority and cannot waive a failed review/);
      assert.match(prompt,/Report Fail or Blocked honestly/);
      assert.match(prompt,/Do not call tools, access external services, execute commands, spend money, or directly alter files/);
      assert.match(prompt,/Return one JSON object only:/);
      assert.match(prompt,/Never invent customer evidence, authorization, qualifications, test execution, or a gate Pass/);
    }
    assert.match(generationPrompt,/standalone Software Engineer session/);
    assert.match(reviewPrompt,/standalone QA & Eval session/);
    assert.ok(reviewPrompt.includes(`Independent review of artifact ${artifact.id}, revision ${artifact.revision}`));
  }
});
test('changed reviewed artifact quarantines late review',async()=>{
  const a=setup(),r=engine.save({...a,kind:'plan',content:'v1'},'codex');
  const j=queued(a,{role:'qa',review_of:{id:r.id,revision:1}});
  await work(a.root,j,async()=>{engine.save({...a,id:r.id,kind:'plan',expected_revision:1,content:'v2'},'codex');return result('Review v1',{review:{verdict:'Pass',reason:'v1 only'}});});
  const s=engine.status(a,'codex');assert.equal(s.jobs[0].status,'quarantined');assert.equal(s.records.find(r=>r.kind==='review').status,'Quarantined');
});
test('pause works from a founder hook and quarantines in-flight output',async()=>{
  const a=setup(),j=queued(a);
  await work(a.root,j,async()=>{hook({cwd:a.root,session_id:a.session_id,hook_event_name:'UserPromptSubmit',prompt:'pause'},'codex');return result();});
  const s=engine.status(a,'codex');assert.equal(s.paused,true);assert.equal(s.jobs[0].status,'quarantined');
});
test('handover rejects active work, preserves records/notices, revokes old coordinator',()=>{
  const a=setup(),j=queued(a),b={...a,session_id:'incoming'};engine.bind(b.root,b.session_id,'claude');
  engine.notify({...a,kind:'decision_required',summary:'Choose audience'},'codex');
  assert.throws(()=>engine.control({...b,action:'handover',expected_epoch:1,source_instruction:'Continue in Claude'},'claude'),/active/);
  engine.control({...a,action:'pause',expected_epoch:1,source_instruction:'pause'},'codex');
  const s=engine.control({...b,action:'handover',expected_epoch:1,source_instruction:'Continue in Claude'},'claude');
  assert.equal(s.owner.epoch,2);assert.equal(s.paused,true);assert.equal(s.notices.length,1);assert.equal(s.jobs.find(x=>x.id===j).status,'cancelled');
  assert.throws(()=>engine.save({...a,kind:'plan',content:'old'},'codex'),/does not own/);
});
test('failed or malformed model output creates a notice and grants no success',async()=>{
  const a=setup(),j=queued(a);await work(a.root,j,async()=>({native_id:'n',text:'not JSON'}));
  const s=engine.status(a,'codex');assert.equal(s.jobs[0].status,'failed');assert.equal(s.notices.length,1);assert.equal(s.records.length,0);
});
test('invalid envelopes retain precise rejected evidence and never partially publish or route',async()=>{
  const invalid=[
    {messages:[{to:'pm',content:'valid first'},{to:'Chief of Staff',content:'wrong recipient'}],field:/message\[1\]\.to/},
    {messages:[{to:'runner',content:4}],field:/message\[0\]\.content/},
    {messages:[{to:'runner',content:'x'.repeat(20001)}],field:/message\[0\]\.content/},
    {messages:[{to:'pm',content:'valid'}],notices:[{kind:'unknown',summary:'invalid'}],field:/notice\[0\]\.kind/},
  ];
  for(const {field,...payload} of invalid) {
    const a=setup(),j=queued(a),out=result('Preserve this substantive candidate',payload);
    await work(a.root,j,async()=>out);
    const s=engine.status(a,'codex'),job=s.jobs[0];
    assert.equal(job.status,'failed');assert.match(job.error,field);
    assert.equal(job.native_id,out.native_id);assert.match(job.rejected_output.text,/Preserve this substantive candidate/);
    assert.equal(s.messages.length,0);assert.equal(s.records.length,0);assert.equal(s.notices.length,1);
    assert.equal(Object.values(s.sessions)[0].native_id,null);
  }
});
test('notice delivery, seeing, resolution, and authority remain distinct',()=>{
  const a=setup(),n=engine.notify({...a,kind:'decision_required',summary:'Choose the customer'},'codex');
  hook({cwd:a.root,session_id:a.session_id,hook_event_name:'UserPromptSubmit',prompt:'status'},'codex');
  let s=engine.status(a,'codex');assert.equal(s.notices[0].deliveries.length,1);assert.equal(s.notices[0].seen_at,null);
  engine.acknowledge({...a,notice_id:n.id,seen:true},'codex');s=engine.status(a,'codex');assert.ok(s.notices[0].seen_at);assert.equal(s.notices[0].resolution,null);assert.equal(s.capabilities.external_execution,false);
});
test('preferences require provenance and never mutate permission',()=>{
  const a=setup();assert.throws(()=>engine.save({...a,kind:'preference',content:'No updates'},'codex'),/basis/);
  engine.save({...a,kind:'preference',content:'Short updates',basis:'explicit',source_reference:'founder msg 1'},'codex');
  assert.equal(engine.status(a,'codex').mode,'preparation');
});
test('MCP validates arguments and does not expose arbitrary command execution',async()=>{
  await assert.rejects(call('company_dispatch',{root:base,session_id:'s',role:'pm',task:'x',command:'rm -rf'},'codex'),/Unknown argument/);
  await assert.rejects(call('company_control',{root:base,session_id:'s',action:'approve',expected_epoch:1,source_instruction:'x'},'codex'),/Invalid action/);
});
test('adapters preserve explicit native IDs without permission bypass flags',()=>{
  assert.ok(commandArgs('codex','native-123').includes('native-123'));
  assert.ok(commandArgs('claude','native-123').includes('--resume'));
  assert.ok(!JSON.stringify(commandArgs('codex')).includes('dangerously'));
  const parsed=parseOutput('codex','{"type":"thread.started","thread_id":"n"}\n{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}');
  assert.equal(parsed.native_id,'n');assert.equal(parsed.text,'ok');assert.equal(parsed.model_evidence.verification,'unverified');
  assert.throws(()=>parseOutput('claude','{"is_error":true,"result":"not signed in"}'),/not signed in/);
});
test('real stdio MCP initializes and lists tools without creating company state',async()=>{
  const child=spawn(process.execPath,['--no-warnings','plugins/soloco/runtime/main.mjs','serve','codex'],{stdio:['pipe','pipe','pipe']});
  let output='';child.stdout.on('data',c=>output+=c);
  child.stdin.end('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');
  const code=await new Promise(resolve=>child.on('close',resolve));assert.equal(code,0);
  const replies=output.trim().split('\n').map(JSON.parse);assert.equal(replies[0].result.serverInfo.name,'company');assert.ok(replies[1].result.tools.some(t=>t.name==='company_dispatch'));
});

test('dispatch launches a separate process and resumes that role through a second assignment',async()=>{
  const bin=path.join(base,'bin');fs.mkdirSync(bin,{recursive:true});
  fs.writeFileSync(path.join(bin,'codex'),`#!${process.execPath}
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
const args=process.argv.slice(2);
if(args.includes('--version'))console.log('codex-cli test');
else if(args.includes('--help'))console.log('--ignore-user-config --json --sandbox');
else if(args[0]==='login')console.log('signed in');
else {
 let prompt='';for await(const c of process.stdin)prompt+=c;
 const file='.native-id';const native=fs.existsSync(file)?fs.readFileSync(file,'utf8'):randomUUID();fs.writeFileSync(file,native);
 console.log(JSON.stringify({type:'thread.started',thread_id:native}));
 console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({content:'Prepared in a standalone process',messages:[],notices:[]})}}));
}
`,{mode:0o700});
  const oldPath=process.env.PATH;process.env.PATH=bin+path.delimiter+oldPath;
  try {
    const a=setup();
    const intent=engine.save({...a,kind:'intent',content:'Stay within founder limits'},'codex');
    async function run() {
      const j=engine.dispatch({...a,role:'pm',task:'Prepare a proposal'},'codex');
      assert.ok(j.context_sha256);assert.ok(j.inputs.some(ref=>ref.id===intent.id && ref.revision===1));
      for(let i=0;i<100;i++) {await new Promise(r=>setTimeout(r,30));const s=engine.status(a,'codex');const job=s.jobs.find(x=>x.id===j.id);if(!['queued','running'].includes(job.status))return {job,s};}
      throw new Error('Worker did not finish');
    }
    const first=await run();assert.equal(first.job.status,'completed',first.job.error);
    const second=await run();assert.equal(second.job.status,'completed',second.job.error);
    assert.equal(first.s.sessions.pm.native_id,second.s.sessions.pm.native_id);
    assert.notEqual(first.job.worker_pid,process.pid);
    assert.equal(first.job.instance_id,second.job.instance_id);
  } finally {process.env.PATH=oldPath;}
});

test('concurrent processes cannot both commit the same expected record revision',async()=>{
  const a=setup();const r=engine.save({...a,kind:'plan',content:'v1'},'codex');
  const url=new URL('../plugins/soloco/runtime/engine.mjs',import.meta.url).href;
  const source=`import {save} from ${JSON.stringify(url)}; try {save(${JSON.stringify({...a,id:r.id,expected_revision:1,kind:'plan',content:'v2'})},'codex');}catch{process.exitCode=1;}`;
  const codes=await Promise.all([1,2].map(()=>new Promise(resolve=>{const p=spawn(process.execPath,['--no-warnings','--input-type=module','-e',source],{stdio:'ignore'});p.on('close',resolve);})));
  assert.deepEqual(codes.sort(),[0,1]);assert.equal(engine.status(a,'codex').records[0].revision,2);
});

test('same chat cannot reuse a revoked epoch after a handover',()=>{
  const a=setup();
  engine.control({...a,action:'handover',expected_epoch:1,source_instruction:'Replace these preparation sessions'},'codex');
  assert.throws(()=>engine.save({...a,kind:'plan',content:'stale pending write'},'codex'),/does not own/);
  const current=engine.status(a,'codex');
  const saved=engine.save({...a,epoch:current.owner.epoch,kind:'plan',content:'current proposal'},'codex');
  assert.equal(saved.status,'Draft');
});


test('compatible runtime patches preserve pinned team, ownership and native sessions without adoption',async()=>{
  for(const version of ['0.2.0','0.2.1','0.2.2','0.3.0','0.3.1','0.4.0','0.4.1','0.5.0','0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5']) {
    const a=setup();
    withStore(a.root,db=>db.transaction('test.old_patch',s=>{
      s.plugin_version=version;s.runtime_version=version;
      s.governance='Pinned preparation governance; preserve founder limits';s.governance_sha256=digest(s.governance);
      s.cos_instructions='PINNED OLD COS';s.team_sha256=teamHash(s);
      s.sessions.pm={instance_id:'existing-pm',role:'pm',native_id:'persisted-native',host:'codex'};return s;
    }));
    const before=withStore(a.root,db=>db.read());
    const resumed=engine.open(a,'codex');
    assert.equal(resumed.executing_runtime_version,VERSION);assert.equal(resumed.runtime_version,version);
    assert.equal(resumed.cos_instructions,'PINNED OLD COS');
    assert.deepEqual(withStore(a.root,db=>db.read()),before);
    const injected=hook({cwd:a.root,session_id:a.session_id,hook_event_name:'SessionStart'},'codex').hookSpecificOutput.additionalContext;
    assert.match(injected,/PINNED OLD COS/);assert.doesNotMatch(injected,/Company requires upgrade maintenance/);
    engine.save({...a,kind:'intent',content:'Keep the existing budget'},'codex');
    const j=queued(a);await work(a.root,j,async()=>result());
    const s=engine.status(a,'codex');assert.equal(s.jobs[0].status,'completed');
    assert.equal(s.plugin_version,version);assert.equal(s.sessions.pm.native_id,'persisted-native');
    assert.equal(s.owner.epoch,before.owner.epoch);assert.equal(s.upgrade,null);
    engine.control({...a,action:'pause',expected_epoch:1,source_instruction:'Pause'},'codex');
    engine.control({...a,action:'resume',expected_epoch:1,source_instruction:'Resume'},'codex');
    engine.control({...a,action:'handover',expected_epoch:1,source_instruction:'Replace the coordinator'},'codex');
    assert.equal(engine.status(a,'codex').owner.epoch,2);
  }
});

test('unknown runtimes and tampered teams remain held despite patch compatibility',()=>{
  const a=setup();withStore(a.root,db=>db.transaction('test.future',s=>{s.runtime_version='0.2.99';return s;}));
  assert.throws(()=>engine.open(a,'codex'),/checked runtime upgrade/);
  assert.throws(()=>engine.save({...a,kind:'intent',content:'bypass'},'codex'),/checked runtime upgrade/);
  assert.throws(()=>engine.control({...a,action:'resume',expected_epoch:1,source_instruction:'resume'},'codex'),/upgrade/);
  withStore(a.root,db=>db.transaction('test.tamper',s=>{s.runtime_version='0.2.1';s.cos_instructions='tampered';return s;}));
  assert.throws(()=>engine.open(a,'codex'),/integrity/);
});

test('assignment packs retain constraints, failed evidence, notices and named inputs without unrelated artifacts',async()=>{
  const a=setup();
  const intent=engine.save({...a,kind:'intent',content:'No customer data'},'codex');
  const evidence=engine.save({...a,kind:'artifact',content:'Relevant source evidence'},'codex');
  const unrelated=engine.save({...a,kind:'artifact',content:'UNRELATED_CONTENT'},'codex');
  engine.notify({...a,kind:'decision_required',summary:'Hold paid commitments'},'codex');
  engine.message({...a,to:'pm',content:'Missing source needs follow-up'},'codex');
  withStore(a.root,db=>db.transaction('test.failed_review',s=>{s.records.failure={id:'failure',kind:'review',revision:1,content:'Keep the failed check',review:{verdict:'Fail'}};return s;}));
  const j=queued(a,{inputs:[{id:evidence.id,revision:1}]});
  await work(a.root,j,async(_host,_native,prompt)=>{
    assert.match(prompt,/No customer data/);assert.match(prompt,/Relevant source evidence/);
    assert.match(prompt,/Keep the failed check/);assert.match(prompt,/Hold paid commitments/);
    assert.match(prompt,/Missing source needs follow-up/);assert.ok(!prompt.includes(unrelated.content));
    return result();
  });
  const job=engine.status(a,'codex').jobs[0];assert.equal(job.status,'completed');
  assert.ok(job.inputs.some(r=>r.id===intent.id));assert.ok(job.inputs.some(r=>r.id==='failure'));
  assert.ok(job.context_sha256);
});

test('new constraints, pending notices and recipient messages quarantine in-flight results',async()=>{
  for(const change of [
    a=>engine.save({...a,kind:'intent',content:'New material limit'},'codex'),
    a=>engine.notify({...a,kind:'must_know',summary:'New material concern'},'codex'),
    a=>engine.message({...a,to:'pm',content:'Changed requirement'},'codex'),
  ]) {
    const a=setup(),j=queued(a);
    await work(a.root,j,async()=>{change(a);return result();});
    assert.equal(engine.status(a,'codex').jobs[0].status,'quarantined');
  }
});

test('notice presentation and seen bookkeeping do not invalidate an assignment',async()=>{
  const a=setup(),n=engine.notify({...a,kind:'must_know',summary:'Existing concern'},'codex'),j=queued(a);
  await work(a.root,j,async()=>{
    hook({cwd:a.root,session_id:a.session_id,hook_event_name:'UserPromptSubmit',prompt:'status'},'codex');
    engine.acknowledge({...a,notice_id:n.id,seen:true},'codex');return result();
  });
  assert.equal(engine.status(a,'codex').jobs[0].status,'completed');
});

test('changed queued dependencies are held before spending a model call',async()=>{
  for(const addConstraint of [false,true]) {
    const a=setup(),r=engine.save({...a,kind:'plan',content:'Version one'},'codex');
    const j=queued(a,{inputs:[{id:r.id,revision:1}]});
    withStore(a.root,db=>db.transaction('test.context_at_dispatch',s=>{s.jobs[j].context_sha256=assignmentContext(s,s.jobs[j]).hash;return s;}));
    if(addConstraint)engine.save({...a,kind:'decision',content:'New founder limit'},'codex');
    else engine.save({...a,id:r.id,expected_revision:1,kind:'plan',content:'Version two'},'codex');
    let calls=0;await work(a.root,j,async()=>{calls++;return result();});
    assert.equal(calls,0);assert.equal(engine.status(a,'codex').jobs[0].status,'failed');
  }
});

test('oversized assignment context is held intact instead of silently truncated',async()=>{
  const a=setup();for(let i=0;i<3;i++)engine.save({...a,kind:'intent',content:'x'.repeat(80000)},'codex');
  const j=queued(a);let calls=0;await work(a.root,j,async()=>{calls++;return result();});
  const s=engine.status(a,'codex');assert.equal(calls,0);assert.equal(s.jobs[0].status,'failed');
  assert.match(s.jobs[0].error,/Nothing was truncated/);
  assert.equal(s.records.filter(r=>r.kind==='intent').reduce((n,r)=>n+r.content.length,0),240000);
});

test('unrelated artifacts do not invalidate the bounded assignment',async()=>{
  const a=setup(),r=engine.save({...a,kind:'artifact',content:'Unrelated v1'},'codex'),j=queued(a);
  await work(a.root,j,async()=>{
    engine.save({...a,id:r.id,expected_revision:1,kind:'artifact',content:'Unrelated v2'},'codex');return result();
  });
  assert.equal(engine.status(a,'codex').jobs[0].status,'completed');
});

test('legacy generator folders remain protected after retiring the generator',()=>{
  const root=fs.mkdtempSync(path.join(base,'legacy-'));fs.mkdirSync(path.join(root,'team'));
  const manifest=path.join(root,'team/manifest.json');fs.writeFileSync(manifest,'{"legacy":true}');
  engine.bind(root,'founder','codex');
  assert.throws(()=>engine.open({root,session_id:'founder',idea:'Do not overwrite'},'codex'),/Legacy workspace/);
  assert.equal(fs.readFileSync(manifest,'utf8'),'{"legacy":true}');
});


test('company names are optional display labels independent of stable identity',()=>{
  const a=setup(),first=engine.open(a,'codex');assert.equal(first.name,'Untitled Venture');
  const root=fs.mkdtempSync(path.join(base,'named-'));engine.bind(root,'named-founder','codex');
  const named=engine.open({root,session_id:'named-founder',idea:'Another idea',name:'  BriefLink  '},'codex');
  assert.equal(named.name,'BriefLink');assert.notEqual(named.company_id,first.company_id);
  const reopened=engine.open({root,session_id:'named-founder',idea:'Different idea',name:'Do not rename'},'codex');
  assert.equal(reopened.name,'BriefLink');assert.equal(reopened.idea,'Another idea');
  assert.equal(reopened.company_id,named.company_id);
});

test('renaming records founder intent while preserving company state and native sessions',async()=>{
  const a=setup();engine.save({...a,kind:'intent',content:'Original business boundaries'},'codex');
  engine.notify({...a,kind:'decision_required',summary:'Open obligation'},'codex');
  const j=queued(a);await work(a.root,j,async()=>result());
  engine.control({...a,action:'pause',expected_epoch:1,source_instruction:'Pause'},'codex');
  const before=withStore(a.root,db=>db.read());
  const renamed=await call('company_control',{root:a.root,session_id:a.session_id,action:'rename',name:'BriefLink',expected_name:before.name,expected_epoch:1,source_instruction:'Rename my company to BriefLink'},'codex');
  const after=withStore(a.root,db=>db.read());
  assert.equal(renamed.name,'BriefLink');
  for(const key of ['id','idea','owner','sessions','jobs','notices','messages','governance','roles','cos_instructions','team_sha256','paused','phase','mode'])assert.deepEqual(after[key],before[key]);
  for(const [key,value]of Object.entries(before.records))assert.deepEqual(after.records[key],value);
  const decision=Object.values(after.records).find(r=>r.action==='rename');
  assert.equal(decision.previous_name,'Untitled Venture');assert.equal(decision.name,'BriefLink');
  assert.equal(decision.content,'Rename my company to BriefLink');assert.equal(decision.recorded_by,a.session_id);
  assert.ok(fs.existsSync(a.root));assert.equal(engine.open(a,'codex').name,'BriefLink');
});

test('rename requires current owner, current name, valid label and source instruction',()=>{
  const a=setup(),request={...a,action:'rename',expected_epoch:1,expected_name:'Untitled Venture',name:'BriefLink',source_instruction:'Rename to BriefLink'};
  engine.bind(a.root,'other','codex');
  for(const changes of [{session_id:'other'},{expected_epoch:0},{expected_name:'outdated'},{name:'   '},{name:'x'.repeat(201)},{source_instruction:''},{expected_name:undefined}]) {
    const before=withStore(a.root,db=>db.read());assert.throws(()=>engine.control({...request,...changes},'codex'));
    assert.deepEqual(withStore(a.root,db=>db.read()),before);
  }
  engine.control(request,'codex');
  assert.throws(()=>engine.control({...request,name:'Stale competing rename'},'codex'),/name changed/);
  assert.equal(engine.status(a,'codex').name,'BriefLink');
});

test('rename waits for active assignments and does not resume a held company',()=>{
  const a=setup(),j=queued(a),request={...a,action:'rename',expected_epoch:1,expected_name:'Untitled Venture',name:'New name',source_instruction:'Rename'};
  assert.throws(()=>engine.control(request,'codex'),/Assignments are active/);
  assert.equal(engine.status(a,'codex').jobs[0].status,'queued');
  engine.control({...a,action:'pause',expected_epoch:1,source_instruction:'Pause'},'codex');
  const s=engine.control(request,'codex');assert.equal(s.name,'New name');assert.equal(s.paused,true);assert.equal(s.jobs[0].status,'cancelled');
});

test('SoloCo can rebind the same founder chat after a plugin cache replacement',async()=>{
  const a=setup();engine.save({...a,kind:'intent',content:'Keep original company intent'},'codex');
  const j=queued(a);await work(a.root,j,async()=>result());
  engine.control({...a,action:'pause',expected_epoch:1,source_instruction:'Pause before replacing plugin'},'codex');
  const before=withStore(a.root,db=>db.read()),oldCache=process.env.COMPANY_PLUGIN_DATA;
  process.env.COMPANY_PLUGIN_DATA=path.join(base,'new-plugin-cache');
  try {
    assert.throws(()=>engine.open(a,'codex'),/binding/);
    hook({cwd:a.root,session_id:a.session_id,hook_event_name:'SessionStart'},'codex');
    assert.deepEqual(withStore(a.root,db=>db.read()),before);
    const current=engine.open(a,'codex');assert.equal(current.company_id,before.id);assert.deepEqual(current.sessions,before.sessions);
    engine.control({...a,action:'resume',expected_epoch:1,source_instruction:'Continue the same company'},'codex');
    assert.equal(engine.status(a,'codex').paused,false);
  } finally {process.env.COMPANY_PLUGIN_DATA=oldCache;}
});

// Every executable below is a synthetic CLI in a disposable directory; no
// account or real model is contacted by the model-routing integration checks.
function selectionHost() {
  const bin=fs.mkdtempSync(path.join(base,'selection-bin-')),log=path.join(bin,'calls.jsonl');
  fs.writeFileSync(path.join(bin,'codex'),`#!${process.execPath}
import fs from 'node:fs';
import readline from 'node:readline';
import {randomUUID} from 'node:crypto';
const args=process.argv.slice(2);
if(args.includes('--version'))console.log('codex-cli selection-test');
else if(args.includes('--help'))console.log('--ignore-user-config --json --sandbox --model --config');
else if(args[0]==='login')console.log('signed in');
else if(args[0]==='app-server') {
 const send=value=>process.stdout.write(JSON.stringify(value)+'\\n');
 const lines=readline.createInterface({input:process.stdin});
 for await(const line of lines) {
  const m=JSON.parse(line);
  if(m.method==='initialize')send({id:m.id,result:{userAgent:'synthetic'}});
  if(m.method==='model/list')send({id:m.id,result:{data:[
   {id:'small',model:'test-small',displayName:'Small',hidden:false,supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'medium'}],defaultReasoningEffort:'low',isDefault:true},
   {id:'review',model:'test-review',displayName:'Review',hidden:false,supportedReasoningEfforts:[{reasoningEffort:'medium'},{reasoningEffort:'high'},{reasoningEffort:'ultra'}],defaultReasoningEffort:'medium'},
   {id:'denied',model:'test-unavailable',displayName:'Unavailable at inference',hidden:false,supportedReasoningEfforts:[{reasoningEffort:'low'}],defaultReasoningEffort:'low'},
   {id:'hidden',model:'test-hidden',displayName:'Internal',hidden:true,supportedReasoningEfforts:[{reasoningEffort:'low'}],defaultReasoningEffort:'low'}
  ],nextCursor:null}});
 }
} else {
 let prompt='';for await(const c of process.stdin)prompt+=c;
 fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({args,cwd:process.cwd()})+'\\n');
 if(args[args.indexOf('--model')+1]==='test-unavailable'){console.error('Selected model unavailable');process.exit(1);}
 const file='.native-id';const native=fs.existsSync(file)?fs.readFileSync(file,'utf8'):randomUUID();fs.writeFileSync(file,native);
 console.log(JSON.stringify({type:'thread.started',thread_id:native}));
 const review=prompt.includes('Independent review of artifact')?{review:{verdict:'Pass',reason:'Synthetic review of supplied artifact'}}:{};
 console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({content:'Synthetic selected-model artifact',messages:[],notices:[],...review})}}));
}
`,{mode:0o700});
  return {bin,log};
}
async function selectionRun(a,extra={}) {
  const j=engine.dispatch({...a,role:'pm',task:'Prepare a scope with unchanged authority',task_summary:'Prepare the bounded scope',next_handoff:'Engineering checks the proposal',...extra},'codex');
  for(let i=0;i<200;i++) {
    await new Promise(r=>setTimeout(r,30));
    const s=engine.status(a,'codex'),job=s.jobs.find(v=>v.id===j.id);
    if(!['queued','running'].includes(job.status))return {job,state:s,artifact:s.records.find(r=>r.id===job.artifact_id)};
  }
  throw new Error('Synthetic selection worker did not finish');
}
const selected=(extra={})=>({mode:'explicit',model:'test-small',effort:'low',reason:'Clear scoped preparation task',...extra});

test('model catalog uses advertised choices and never offers hidden internal models',()=>{
  const fake=selectionHost(),oldPath=process.env.PATH;process.env.PATH=fake.bin+path.delimiter+oldPath;
  try {
    const catalog=modelCatalog('codex',{refresh:true});
    assert.equal(catalog.supported,true,catalog.error);assert.equal(catalog.source,'host_catalog');
    assert.deepEqual(catalog.models.map(m=>m.id).sort(),['test-review','test-small','test-unavailable']);
    assert.deepEqual(catalog.models.find(m=>m.id==='test-review').supported_efforts,['medium','high','ultra']);
    assert.equal(catalog.account_availability,'unverified');assert.equal(fs.existsSync(fake.log),false);
  } finally {process.env.PATH=oldPath;}
});

test('selected dispatch reaches the host, rotates on model/effort/reset, retains history and keeps reviewers independent',async()=>{
  const fake=selectionHost(),oldPath=process.env.PATH;process.env.PATH=fake.bin+path.delimiter+oldPath;
  try {
    const a=setup(),first=await selectionRun(a,{model_selection:selected()});
    assert.equal(first.job.status,'completed',first.job.error);assert.equal(first.job.context_format,2);
    assert.equal(first.job.model_selection.model,'test-small');assert.equal(first.job.cli_version,'codex-cli selection-test');
    assert.equal(first.job.model_evidence.verification,'unverified');assert.deepEqual(first.job.model_evidence.reported_models,[]);
    const same=await selectionRun(a,{model_selection:selected({reason:'Different explanation, same settings'})});
    assert.equal(same.job.status,'completed',same.job.error);assert.equal(same.job.instance_id,first.job.instance_id);assert.equal(same.job.native_id,first.job.native_id);
    const effort=await selectionRun(a,{model_selection:selected({effort:'medium'})});
    assert.equal(effort.job.status,'completed',effort.job.error);assert.notEqual(effort.job.instance_id,first.job.instance_id);assert.notEqual(effort.job.native_id,first.job.native_id);
    const model=await selectionRun(a,{model_selection:selected({model:'test-review',effort:'medium'})});
    assert.equal(model.job.status,'completed',model.job.error);assert.notEqual(model.job.instance_id,effort.job.instance_id);assert.notEqual(model.job.native_id,effort.job.native_id);
    const reset=await selectionRun(a,{model_selection:{mode:'default',reason:'Return this role to the host default'}});
    assert.equal(reset.job.status,'completed',reset.job.error);assert.notEqual(reset.job.instance_id,model.job.instance_id);assert.notEqual(reset.job.native_id,model.job.native_id);
    const defaultAgain=await selectionRun(a);assert.equal(defaultAgain.job.native_id,reset.job.native_id);
    const stored=withStore(a.root,db=>db.read());
    assert.ok(stored.retired_sessions.some(s=>s.native_id===first.job.native_id));
    assert.ok(stored.retired_sessions.some(s=>s.native_id===effort.job.native_id));
    assert.ok(stored.retired_sessions.some(s=>s.native_id===model.job.native_id));
    const review=await selectionRun(a,{role:'qa',review_of:first.artifact.id,model_selection:selected({model:'test-review',effort:'high'})});
    assert.equal(review.job.status,'completed',review.job.error);assert.notEqual(review.job.native_id,first.job.native_id);assert.notEqual(review.job.instance_id,first.job.instance_id);
    const calls=fs.readFileSync(fake.log,'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(calls[0].args[calls[0].args.indexOf('--model')+1],'test-small');
    assert.ok(calls[0].args.includes('model_reasoning_effort="low"'));
    assert.ok(calls[1].args.includes('resume'));assert.ok(calls[2].args.includes('model_reasoning_effort="medium"'));
    assert.equal(calls[3].args[calls[3].args.indexOf('--model')+1],'test-review');
    assert.ok(!calls[4].args.includes('--model'));assert.ok(!calls[4].args.some(v=>v.startsWith('model_reasoning_effort=')));
    const activity=review.state.activity.find(row=>row.job_id===first.job.id);
    assert.equal(activity.status,'returned');assert.equal(activity.requested_model,'test-small');
    assert.equal(review.state.selection_usage.scope,'specialist_assignments_only');
    assert.equal(review.state.selection_usage.assignments,review.state.jobs.length);
    assert.ok(review.state.selection_usage.groups.some(g=>g.model==='test-small'));
    assert.equal(activity.model_evidence.verification,'unverified');assert.equal(activity.next_handoff.status,'planned');
  } finally {process.env.PATH=oldPath;}
});

test('unsupported and unavailable selected models fail visibly without fallback or stray calls',async()=>{
  const fake=selectionHost(),oldPath=process.env.PATH;process.env.PATH=fake.bin+path.delimiter+oldPath;
  try {
    const a=setup();
    for(const model of ['test-hidden','not-advertised'])assert.throws(()=>engine.dispatch({...a,role:'pm',task:'No inference permitted',model_selection:selected({model})},'codex'),/choice|advertised|model/i);
    assert.equal(fs.existsSync(fake.log),false);assert.equal(engine.status(a,'codex').jobs.length,0);
    const unavailable=await selectionRun(a,{model_selection:selected({model:'test-unavailable'})});
    assert.equal(unavailable.job.status,'failed');assert.match(unavailable.job.error,/unavailable|no completed artifact/i);
    assert.equal(unavailable.state.records.length,0);assert.equal(unavailable.state.notices.length,1);
    assert.equal(fs.readFileSync(fake.log,'utf8').trim().split('\n').length,1);
    assert.equal(unavailable.state.activity[0].status,'failed');
  } finally {process.env.PATH=oldPath;}
});

test('pinned v0.5.0 preserves prior local capabilities but does not silently adopt selected-model behavior',()=>{
  const fake=selectionHost(),oldPath=process.env.PATH;process.env.PATH=fake.bin+path.delimiter+oldPath;
  try {
    const a=setup();withStore(a.root,db=>db.transaction('test.pin_prior_team',s=>{s.plugin_version='0.5.0';s.runtime_version='0.5.0';s.team_sha256=teamHash(s);return s;}));
    const before=engine.status(a,'codex');assert.equal(before.capabilities.local_prototype.eligible,true);
    assert.doesNotMatch(before.capabilities.local_development.blocker??'',/adopt|team|governance/i);
    assert.throws(()=>engine.dispatch({...a,role:'pm',task:'Must preserve pinned instructions',model_selection:selected()},'codex'),/adopt|pinned|team/i);
    assert.equal(engine.status(a,'codex').jobs.length,0);assert.equal(fs.existsSync(fake.log),false);
    assert.equal(engine.open(a,'codex').plugin_version,'0.5.0');
  } finally {process.env.PATH=oldPath;}
});

for(const version of ['0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5'])test(`pinned v${version} retains selection and local capabilities after a compatible runtime update`,async()=>{
  const fake=selectionHost(),oldPath=process.env.PATH;process.env.PATH=fake.bin+path.delimiter+oldPath;
  try {
    const a=setup();withStore(a.root,db=>db.transaction('test.pin_v060',s=>{s.plugin_version=version;s.runtime_version=version;s.cos_instructions=`Preserve pinned v${version} instructions`;s.team_sha256=teamHash(s);return s;}));
    const before=engine.open(a,'codex');
    assert.equal(before.capabilities.model_selection.eligible,true);
    assert.equal(before.capabilities.local_prototype.eligible,true);
    assert.doesNotMatch(before.capabilities.local_development.blocker??'',/adopt|team|governance/i);
    assert.equal(before.capabilities.local_development.eligible,before.capabilities.local_development.supported);
    const run=await selectionRun(a,{model_selection:selected()});
    assert.equal(run.job.status,'completed',run.job.error);
    const after=engine.open(a,'codex');
    assert.equal(after.company_id,before.company_id);assert.equal(after.plugin_version,version);
    assert.equal(after.cos_instructions,before.cos_instructions);assert.equal(after.governance,before.governance);
    assert.equal(after.owner.epoch,before.owner.epoch);
  } finally {process.env.PATH=oldPath;}
});

test('worker forwards the exact recorded selection and preserves separately attributed model evidence',async()=>{
  const a=setup(),j=queued(a),choice=selected();
  withStore(a.root,db=>db.transaction('test.selected_job',s=>{Object.assign(s.jobs[j],{model_selection:choice,context_format:2,cli_version:'test-cli',task_summary:'Visible task',next_handoff:'QA review'});return s;}));
  const evidence={reported_models:['provider-model'],reported_effort:null,verification:'host_reported',source:'result.modelUsage',scope:'session_cumulative_including_internal_calls'};
  await work(a.root,j,async(...args)=>{assert.deepEqual(args[5],choice);return {...result(),model_evidence:evidence};});
  const s=engine.status(a,'codex'),job=s.jobs.find(v=>v.id===j);
  assert.equal(job.status,'completed',job.error);assert.deepEqual(job.model_evidence,evidence);
  assert.equal(job.model_selection.model,'test-small');assert.equal(job.cli_version,'test-cli');
  const activity=s.activity.find(v=>v.job_id===j);assert.equal(activity.task,'Visible task');assert.equal(activity.requested_model,'test-small');
  assert.deepEqual(activity.model_evidence.reported_models,['provider-model']);
});

test('new assignment hashes bind selection and task metadata; legacy hashes remain compatible',async()=>{
  const a=setup(),j=queued(a),state=withStore(a.root,db=>db.read()),legacy=state.jobs[j];
  const oldHash=assignmentContext(state,legacy).hash;
  assert.equal(assignmentContext(state,{...legacy,task:'Changed old task'}).hash,oldHash);
  const current={...legacy,context_format:2,model_selection:selected(),task_summary:'Short task',next_handoff:'QA review'};
  state.jobs[j]=current;const hash=assignmentContext(state,current).hash;
  for(const changes of [{task:'Changed full task'},{task_summary:'Changed display task'},{next_handoff:'Changed handoff'},{model_selection:selected({effort:'medium'})},{model_catalog:{source:'invented',model:{id:'test-small'}}}]) {
    const changed={...current,...changes},view={...state,jobs:{...state.jobs,[j]:changed}};
    assert.equal(contextMatches(view,current,hash),false);
  }
  assert.equal(contextMatches({...state,jobs:{...state.jobs,[j]:{...current,status:'completed',finished_at:new Date().toISOString(),model_evidence:{verification:'unverified'}}}},current,hash),true);
  for(const mutate of [job=>job.task='Changed full task',job=>job.model_selection.effort='medium']) {
    const b=setup(),jid=queued(b);
    withStore(b.root,db=>db.transaction('test.pin_selection',s=>{Object.assign(s.jobs[jid],{context_format:2,model_selection:selected()});s.jobs[jid].context_sha256=assignmentContext(s,s.jobs[jid]).hash;mutate(s.jobs[jid]);return s;}));
    let calls=0;await work(b.root,jid,async()=>{calls++;return result();});
    const job=engine.status(b,'codex').jobs.find(v=>v.id===jid);assert.equal(calls,0);assert.equal(job.status,'failed');
  }
});

test('company_progress schema and read-only endpoint preserve status and expose equivalent safe formats',async()=>{
  const {root,session_id,epoch}=setup();const a={root,session_id,epoch};
  const intent=engine.save({...a,kind:'intent',content:'SECRET_FOUNDER_BODY'},'codex');
  const j=queued(a,{inputs:[{id:intent.id,revision:1}]});
  await work(a.root,j,async()=>result('SECRET_RESPONSE_BODY',{notices:[{kind:'decision_required',summary:'Exact founder decision notice'}]}));
  const before=withStore(a.root,db=>db.read());
  const json=await call('company_progress',{root:a.root,session_id:a.session_id},'codex');
  assert.equal(json.graph.valid,true);assert.equal(json.nodes.length,1);
  assert.equal(json.nodes[0].native_id,before.jobs[j].native_id);
  assert.deepEqual(json.nodes[0].context_inputs,[{id:intent.id,revision:1}]);
  assert.equal(json.attention[0].notice.summary,'Exact founder decision notice');
  for(const format of ['json','html','text','mermaid']) {
    const output=await call('company_progress',{root:a.root,session_id:a.session_id,format,recent_jobs:1,render_id:'endpoint-check'},'codex');
    assert.equal(JSON.stringify(output).includes('SECRET_RESPONSE_BODY'),false);
    assert.equal(JSON.stringify(output).includes('SECRET_FOUNDER_BODY'),false);
  }
  assert.deepEqual(withStore(a.root,db=>db.read()),before);
  const status=engine.status(a,'codex');
  assert.equal(status.records.find(r=>r.id===intent.id).content,'SECRET_FOUNDER_BODY');
  assert.equal(Object.hasOwn(status,'graph'),false);
  for(const extra of [{format:'replay'},{format:'html'},{format:'html',render_id:'bad</script>'},{recent_jobs:0},{recent_jobs:51},{action:'run'}])await assert.rejects(call('company_progress',{root:a.root,session_id:a.session_id,...extra},'codex'));
  await assert.rejects(call('company_progress',{root:a.root,session_id:a.session_id,session_id:'unbound'},'codex'),/binding/);
});

test('new dispatch metadata reaches the actual synthetic worker and changes assignment hashes only when present',async()=>{
  const fake=selectionHost(),oldPath=process.env.PATH;process.env.PATH=fake.bin+path.delimiter+oldPath;
  try {
    const {root,session_id,epoch}=setup();const a={root,session_id,epoch};
    const {job}=await selectionRun(a,{expected_deliverable:'A concrete scope artifact'});
    assert.equal(job.status,'completed');
    assert.equal(job.expected_deliverable,'A concrete scope artifact');
    assert.deepEqual(job.requester,{role:'runner',session_id:a.session_id,host:'codex',epoch:1});
    const s=withStore(a.root,db=>db.read());
    const context=assignmentContext(s,job),pack=JSON.parse(context.text);
    assert.equal(pack.assignment.expected_deliverable,job.expected_deliverable);
    assert.deepEqual(pack.assignment.requester,job.requester);
    for(const changed of [{...job,expected_deliverable:'Different output'},{...job,requester:{...job.requester,session_id:'other'}}])assert.notEqual(assignmentContext(s,changed).hash,context.hash);
    const {expected_deliverable,requester,...historical}=job;
    const oldPack=JSON.parse(assignmentContext(s,historical).text);
    const {assignment,...rest}=oldPack;
    const legacyAssignment={task:historical.task,task_summary:historical.task_summary??null,next_handoff:historical.next_handoff??null,model_selection:historical.model_selection??{mode:'default'},model_catalog:historical.model_catalog??null};
    assert.equal(assignmentContext(s,historical).hash,digest(JSON.stringify({...rest,assignment:legacyAssignment})));
    await assert.rejects(call('company_dispatch',{...a,role:'pm',task:'x',expected_deliverable:'x'.repeat(301)},'codex'),/expected_deliverable/);
    await assert.rejects(call('company_dispatch',{...a,role:'pm',task:'x',requester:{session_id:'spoof'}},'codex'),/Unknown argument/);
    const p=await call('company_progress',{root:a.root,session_id:a.session_id},'codex');
    assert.equal(p.nodes.find(n=>n.id===job.id).expected_deliverable,expected_deliverable);
  } finally {process.env.PATH=oldPath;}
});

test('progress follows actual local controller candidate, software tests, independent QA and acceptance',{
  skip:developmentCapability().supported?false:developmentCapability().blocker
},async()=>{
  const {root,session_id,epoch}=setup(),a={root,session_id,epoch},readArgs={root,session_id};
  fs.writeFileSync(path.join(root,'sum.mjs'),'export const sum = () => 0;\n');
  const files=[{path:'sum.mjs',content:'export const sum = (a,b) => a+b;\n'},
    {path:'sum.test.mjs',content:"import test from 'node:test';import assert from 'node:assert/strict';import {sum} from './sum.mjs';test('sum',()=>assert.equal(sum(2,3),5));\n"}];
  const plan=await call('company_develop',{...a,action:'plan',read_paths:['sum.mjs'],write_paths:['sum.mjs','sum.test.mjs'],test_paths:['sum.test.mjs'],
    acceptance:'Adds two numbers; original source untouched.',stop_conditions:'No network or extra files.',data_policy:'Synthetic files only.',source_instruction:'Inspect and repair these fictional files.',model_data_approved:true,
    max_attempts:2,timeout_ms:5000,max_output_bytes:10000,max_bytes:20000,expires_at:new Date(Date.now()+60000).toISOString()},'codex');
  await call('company_develop',{...a,action:'authorize',plan_id:plan.id,scope_sha256:plan.development.scope_sha256,model_data_approved:true,source_instruction:'Authorize this exact synthetic scope.'},'codex');
  function controllerQueue({role,review_of=null,...details}) {
    const jid=id('job'),instance=id(role);
    withStore(root,db=>db.transaction('test.controller_queue',s=>{
      s.sessions[instance]={instance_id:instance,role,native_id:null,host:s.owner.host};
      const job={id:jid,role,session_key:instance,instance_id:instance,native_id:null,host:s.owner.host,epoch:s.owner.epoch,
        requester:{role:'runner',session_id:s.owner.session_id,host:s.owner.host,epoch:s.owner.epoch},context_format:2,
        status:'queued',task:'Prepare a bounded synthetic development deliverable.',inputs:[],review_of,created_at:new Date().toISOString(),...details};
      // Match dispatch: reserve before insertion, then capture the authorized context.
      developmentAssignment(s,job,true);
      const context=assignmentContext(s,job);
      s.jobs[jid]={...job,inputs:context.inputs,context_sha256:context.hash};return s;
    }));return jid;
  }
  const engineering=controllerQueue({role:'engineer',development_id:plan.id,expected_deliverable:'Candidate files',next_handoff:'QA after software test output; not summoned'});
  assert.throws(()=>controllerQueue({role:'engineer',development_id:plan.id}),/Development scope already has active work/);
  assert.deepEqual(withStore(root,db=>db.read()).records[plan.id].development.attempts,[engineering]);
  const parallel=controllerQueue({role:'research'});
  const initial=await call('company_progress',readArgs,'codex');
  assert.equal(initial.graph.valid,true,JSON.stringify(initial.diagnostics));
  assert.equal(initial.state.active_jobs,2);assert.equal(initial.nodes.some(n=>n.role==='qa'),false);
  assert.equal(initial.graph.edges.some(e=>e.from===parallel||e.to===parallel),false);
  await work(root,engineering,async()=>result('Synthetic candidate',{files}));
  await work(root,parallel,async()=>result('Synthetic independent research'));
  let state=withStore(root,db=>db.read());const candidate=state.records[state.jobs[engineering].artifact_id];
  assert.equal(candidate.status,'Submitted');
  const software=await call('company_develop',{...a,action:'run',plan_id:plan.id,candidate_id:candidate.id},'codex');
  assert.equal(software.kind,'development_test');
  for(let i=0;i<300;i++) {
    state=withStore(root,db=>db.read());
    if(!['queued','running'].includes(state.jobs[software.id].status))break;
    await new Promise(r=>setTimeout(r,30));
  }
  const receipt=state.records[state.jobs[software.id].artifact_id];
  assert.ok(receipt,JSON.stringify(state.jobs[software.id]));
  assert.equal(receipt.development.result.status,'passed');
  assert.equal(receipt.development.result.tests_executed,true);
  assert.equal(receipt.development.result.exit_code,0);
  const qa=controllerQueue({role:'qa',review_of:{id:receipt.id,revision:receipt.revision}});
  await work(root,qa,async()=>result('Synthetic independent QA assessment',{review:{verdict:'Pass',reason:'Exact candidate and actual test receipt checked',permitted_action:'accept_local_development',candidate_sha256:receipt.development.candidate_sha256,receipt_sha256:receipt.development.receipt_sha256,blockers:[]}}));
  state=withStore(root,db=>db.read());const review=state.records[state.jobs[qa].artifact_id];
  assert.equal(review.status,'Submitted');
  const reviewed=await call('company_progress',readArgs,'codex');
  assert.equal(reviewed.evidence.find(r=>r.id===review.id).review.recorded.verdict,'Pass');
  assert.equal(reviewed.evidence.find(r=>r.id===receipt.id).acceptance,null);
  assert.notEqual(state.jobs[qa].native_id,state.jobs[engineering].native_id);
  const acceptance=await call('company_develop',{...a,action:'accept',plan_id:plan.id,receipt_id:receipt.id,review_id:review.id,receipt_sha256:receipt.development.receipt_sha256},'codex');
  assert.equal(acceptance.source_integrated,false);
  const accepted=await call('company_progress',readArgs,'codex');
  assert.equal(accepted.graph.valid,true,JSON.stringify(accepted.diagnostics));
  assert.equal(accepted.evidence.find(r=>r.id===receipt.id).acceptance.bindings_match,true);
  assert.ok(accepted.graph.edges.some(e=>e.from===engineering&&e.to===software.id&&e.type==='candidate'));
  assert.ok(accepted.graph.edges.some(e=>e.from===software.id&&e.to===qa&&e.type==='review'));
  assert.equal(accepted.graph.edges.some(e=>e.from===parallel||e.to===parallel),false);
  const html=await call('company_progress',{...readArgs,format:'html',render_id:'workflow-check'},'codex');
  assert.ok(html.includes('runtime receiver acceptance recorded'));assert.equal(html.includes(files[1].content),false);
  assert.equal(fs.readFileSync(path.join(root,'sum.mjs'),'utf8'),'export const sum = () => 0;\n');
});

test('company_progress observes successive synthetic parallel/candidate/test/QA/acceptance snapshots without replay',async()=>{
  const {root,session_id}=setup(),args={root,session_id},at='2026-01-01T00:00:00Z';
  const baseJob={status:'completed',created_at:at,inputs:[],task:'PRIVATE instructions',task_summary:'Concrete synthetic task'};
  withStore(root,db=>db.transaction('test.synthetic_progress_chain',s=>{
    s.jobs={build:{...baseJob,id:'build',role:'engineer',instance_id:'eng',native_id:'native-eng',artifact_id:'candidate'},
      parallel:{...baseJob,id:'parallel',role:'research',status:'running',next_handoff:'QA awaits output; not summoned'},
      test:{...baseJob,id:'test',kind:'development_test',candidate_id:'candidate',development_id:'plan',artifact_id:'receipt'}};
    s.records={candidate:{id:'candidate',job_id:'build',revision:1,kind:'artifact',status:'Submitted',created_at:at,development:{type:'candidate',plan_id:'plan',candidate_sha256:'hash',run:{job_id:'test',receipt_id:'receipt'}}},
      receipt:{id:'receipt',revision:1,kind:'artifact',status:'Submitted',author_role:'runtime',author_instance:'test',created_at:at,development:{type:'test',plan_id:'plan',candidate_id:'candidate',candidate_sha256:'hash',receipt_sha256:'receipt-hash',result:{tests_executed:true,status:'passed',exit_code:0}}}};
    return s;
  }));
  const returned=await call('company_progress',args,'codex');
  assert.deepEqual(returned.graph.edges.map(e=>[e.from,e.to,e.type]),[['build','test','candidate']]);
  assert.equal(returned.nodes.some(n=>n.role==='qa'),false);
  assert.equal(returned.evidence.find(r=>r.id==='receipt').acceptance,null);
  withStore(root,db=>db.transaction('test.synthetic_qa_return',s=>{
    s.jobs.qa={...baseJob,id:'qa',role:'qa',instance_id:'qa-instance',native_id:'native-qa',artifact_id:'review',review_of:{id:'receipt',revision:1}};
    s.records.review={id:'review',job_id:'qa',revision:1,kind:'review',status:'Submitted',created_at:at,review_of:{id:'receipt',revision:1},review:{verdict:'Pass',candidate_sha256:'hash',receipt_sha256:'receipt-hash'}};
    return s;
  }));
  const reviewed=await call('company_progress',args,'codex');
  assert.equal(reviewed.evidence.find(r=>r.id==='review').review.recorded.verdict,'Pass');
  assert.equal(reviewed.evidence.find(r=>r.id==='receipt').acceptance,null);
  withStore(root,db=>db.transaction('test.synthetic_acceptance_fact',s=>{
    s.records.receipt.development.acceptance={at,review_id:'review',candidate_sha256:'hash',receipt_sha256:'receipt-hash',source_integrated:false};return s;
  }));
  const accepted=await call('company_progress',args,'codex');
  assert.equal(accepted.evidence.find(r=>r.id==='receipt').acceptance.bindings_match,true);
  assert.equal(accepted.evidence.find(r=>r.id==='receipt').acceptance.current_applicability,'unknown');
  assert.ok(accepted.graph.edges.some(e=>e.from==='test'&&e.to==='qa'&&e.reference.revision===1));
  assert.equal(accepted.graph.edges.some(e=>e.from==='parallel'||e.to==='parallel'),false);
  assert.equal(returned.evidence.some(r=>r.kind==='review'),false); // Earlier response is detached, not retroactively reconstructed.
  assert.equal(JSON.stringify(accepted).includes('PRIVATE instructions'),false);
});
