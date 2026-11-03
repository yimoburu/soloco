import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { withStore, id, VERSION, teamHash, digest } from '../plugins/company/runtime/store.mjs';
import * as engine from '../plugins/company/runtime/engine.mjs';
import { hook, call } from '../plugins/company/runtime/main.mjs';
import { work } from '../plugins/company/runtime/worker.mjs';
import { assignmentContext } from '../plugins/company/runtime/context.mjs';
import { commandArgs, parseOutput } from '../plugins/company/runtime/adapters.mjs';

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
  assert.deepEqual(parseOutput('codex','{"type":"thread.started","thread_id":"n"}\n{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}'),{native_id:'n',text:'ok'});
  assert.throws(()=>parseOutput('claude','{"is_error":true,"result":"not signed in"}'),/not signed in/);
});
test('real stdio MCP initializes and lists tools without creating company state',async()=>{
  const child=spawn(process.execPath,['--no-warnings','plugins/company/runtime/main.mjs','serve','codex'],{stdio:['pipe','pipe','pipe']});
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
  const url=new URL('../plugins/company/runtime/engine.mjs',import.meta.url).href;
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
  for(const version of ['0.2.0','0.2.1']) {
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
