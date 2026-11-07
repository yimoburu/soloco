import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runModel} from '../plugins/soloco/runtime/adapters.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {snapshotBytes} from '../plugins/soloco/runtime/snapshot.mjs';
import * as scoped from '../plugins/soloco/runtime/scoped-context.mjs';

// Actual adapter/worker seams, event-only CLI double, disposable normalized
// stores. No native/provider calls or semantic/source acceptance claims.
const thread={type:'thread.started',thread_id:'fictional-native'};
const start={type:'turn.started'};
const done={type:'turn.completed'};
const warning={type:'error',message:'Reconnecting 2/5 (workspace routing discovery failed)'};
const message=text=>({type:'item.completed',item:{type:'agent_message',text}});
const wire=events=>events.map(e=>typeof e==='string'?e:JSON.stringify(e)).join('\n')+'\n';
const negative=(verdict='Blocked',content='Fictional unresolved negative')=>JSON.stringify({content,messages:[],notices:[],review:{verdict,reason:'Prior failure remains unresolved',permitted_action:'hold',blockers:['No retry']}});
function adapter(events,{code=0,limit}={}) {
 return (host,native,prompt,cwd,timeout,selection,options={})=>runModel(host,native,prompt,cwd,timeout,selection,{
  ...options,...(limit?{maxOutputCharacters:limit}:{}),resolveExecutable:()=>'/fictional/codex',spawn:()=>{
   const child=new EventEmitter();child.stdin=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
   child.kill=()=>{queueMicrotask(()=>child.emit('close',null));return true;};
   child.stdin.end=()=>queueMicrotask(()=>{child.emit('spawn');child.stdout.emit('data',wire(typeof events==='function'?events(prompt):events));child.emit('close',code);});
   return child;
  }
 });
}
const invoke=(events,options)=>adapter(events,options)('codex',null,'fictional prompt','/tmp',180000);
const diagnostic=(id='diagnostic')=>({type:'item.completed',item:{id,type:'error',message:'Fictional optional feature is unavailable'}});
for(const type of ['item.started','item.updated','item.completed'])test(type+' cannot reuse a completed diagnostic identity',async()=>{
 await assert.rejects(invoke([thread,start,diagnostic('same'),{type,item:{id:'same',type:'agent_message',text:negative('Pass')}},message(negative()),done]),/diagnostic item cannot be reused/);
});
for(const verdict of ['Pass','Blocked'])test('completed diagnostic items preserve a valid current '+verdict,async()=>{
 const raw=negative(verdict),result=await invoke([thread,diagnostic('startup'),start,diagnostic('during'),message(raw),done]);
 assert.equal(result.text,raw);assert.deepEqual(result.model_evidence.cli_warnings,[{type:'error',message:diagnostic().item.message},{type:'error',message:diagnostic().item.message}]);
});
for(const [name,events] of [
 ['diagnostic only',[thread,diagnostic()]],
 ['no current completion',[thread,start,diagnostic(),message(negative())]],
 ['terminal failure',[thread,start,diagnostic(),message(negative()),{type:'turn.failed'}]],
 ['post-terminal diagnostic',[thread,start,message(negative()),done,diagnostic()]],
 ['missing identity',[thread,start,{type:'item.completed',item:{type:'error',message:'warning'}},message(negative()),done]],
 ['malformed diagnostic',[thread,start,{type:'item.completed',item:{id:'bad',type:'error',message:7}},message(negative()),done]],
 ['replayed diagnostic',[thread,diagnostic(),start,diagnostic(),message(negative()),done]],
 ['diagnostic before thread',[diagnostic(),thread,start,message(negative()),done]],
])test(name+' cannot create successful adapter completion',async()=>{
 await assert.rejects(invoke(events),e=>e.termination_confirmed===true);
});
for(const verdict of ['Blocked','Pass'])test('reconnect warning coexists with current completed '+verdict,async()=>{
 const text=negative(verdict),result=await invoke([thread,start,warning,message(text),done]);
 assert.equal(result.text,text);assert.equal(result.native_id,thread.thread_id);
 assert.deepEqual(result.model_evidence.cli_warnings,[warning]);assert.equal(result.model_evidence.verification,'unverified');
});
for(const [name,events] of [
 ['errors only',[warning]],
 ['warning only',[thread,start,warning]],
 ['warning and message without completion',[thread,start,warning,message(negative())]],
 ['old message followed by new unfinished turn',[thread,start,message(negative()),done,start]],
 ['old message followed by failed turn',[thread,start,message(negative()),done,start,{type:'turn.failed'}]],
 ['failure then late message and completion',[thread,start,{type:'turn.failed'},message(negative()),done]],
 ['failure then new successful turn',[thread,start,{type:'turn.failed'},start,message(negative('Pass')),done]],
 ['interrupted',[thread,start,message(negative()),{type:'turn.interrupted'}]],
 ['cancelled',[thread,start,message(negative()),{type:'turn.cancelled'}]],
 ['message before turn',[thread,message(negative()),start,done]],
 ['duplicate completion',[thread,start,message(negative()),done,done]],
 ['changed thread',[thread,start,message(negative()),{type:'thread.started',thread_id:'other'},done]],
 ['changed event thread',[thread,start,{...message(negative()),thread_id:'other'},done]],
 ['stale item ID in current turn',[thread,start,{type:'item.completed',item:{id:'old-item',type:'agent_message',text:negative()}},done,start,{type:'item.completed',item:{id:'old-item',type:'agent_message',text:negative('Pass')}},done]],
 ['changed turn',[thread,{...start,turn_id:'new'},{...message(negative()),turn_id:'old'},done]],
 ['commentary only',[thread,start,{type:'item.completed',item:{type:'agent_message',phase:'commentary',text:negative()}},done]],
 ['unknown shape',[thread,start,message(negative()),{type:'mystery'},done]],
 ['truncated after completion',[thread,start,message(negative()),done,'{"type":']],
 ['malformed before completed negative',[thread,start,'not json',message(negative()),done]],
])test(name+' cannot manufacture adapter completion',async()=>{
 await assert.rejects(invoke(events),error=>{assert.equal(error.termination_confirmed,true);assert.ok(error.rejected_output?.text);return true;});
});
test('a late Pass cannot erase an earlier observed negative on terminal rejection',async()=>{
 const raw=negative();
 await assert.rejects(invoke([thread,start,message(raw),{type:'turn.failed',error:{message:'Fictional terminal cause'}},message(negative('Pass'))]),error=>{
  assert.equal(error.rejected_output.text,raw);assert.match(error.message,/Fictional terminal cause/);return true;
 });
});
test('exit status and resumed native identity fence otherwise complete messages',async()=>{
 const events=[thread,start,message(negative('Pass')),done];
 await assert.rejects(invoke(events,{code:7}),e=>e.code==='ROLE_EXIT_ERROR'&&e.rejected_output.text===negative('Pass'));
 await assert.rejects(adapter(events)('codex','old-native','fictional','/tmp',180000),/identity changed/);
});

for(const verdict of ['Blocked','Fail'])for(const code of [0,7])for(const laterTurn of [false,true])test(`observed ${verdict} survives later Pass, exit ${code}, new turn ${laterTurn}`,async()=>{
 const raw=negative(verdict),events=[thread,start,message(raw),...(laterTurn?[done,start]:[]),message(negative('Pass')),done];
 await assert.rejects(invoke(events,{code}),e=>{
  assert.equal(e.rejected_output.text,raw);assert.equal(e.termination_confirmed,true);
  if(code)assert.equal(e.code,'ROLE_EXIT_ERROR');
  return true;
 });
});
for(const type of ['item.started','item.updated'])for(const id of [undefined,'unfinished-final'])test(`unfinished ${type} message ${id} cannot reuse a completed artifact`,async()=>{
 const pending={type,item:{type:'agent_message',phase:'final_answer',...(id?{id}:{})}};
 await assert.rejects(invoke([thread,start,message(negative('Pass')),pending,done]),/no completed artifact|requires item identity/);
});
test('a matching completed message closes its started final answer',async()=>{
 const raw=negative();const item={id:'final',type:'agent_message',phase:'final_answer'};
 assert.equal((await invoke([thread,start,{type:'item.started',item},{type:'item.completed',item:{...item,text:raw}},done])).text,raw);
});
test('anonymous starts and replayed turns cannot manufacture completion',async()=>{
 const anonymous={type:'item.started',item:{type:'agent_message',phase:'final_answer'}};
 await assert.rejects(invoke([thread,start,anonymous,anonymous,message(negative('Pass')),done]),/requires item identity/);
 const named={type:'item.started',item:{id:'duplicate-start',type:'agent_message',phase:'final_answer'}};
 await assert.rejects(invoke([thread,start,named,named,{type:'item.completed',item:{...named.item,text:negative('Pass')}},done]),/already started/);
 const tagged={...start,turn_id:'same-turn'},complete={...done,turn_id:'same-turn'};
 await assert.rejects(invoke([thread,tagged,message(negative('Pass')),complete,tagged,message(negative('Pass')),complete]),/multiple or replayed turns/);
});
for(const type of ['item.completed','item.started','item.updated'])test(`completed message ID cannot be replayed through ${type}`,async()=>{
 const item={id:'completed-final',type:'agent_message',phase:'final_answer',text:negative('Pass')};
 await assert.rejects(invoke([thread,start,{type:'item.completed',item},{type,item},done]),/already completed/);
});
test('distinct negatives remain rejected evidence together',async()=>{
 const first=negative('Blocked'),second=negative('Fail');
 await assert.rejects(invoke([thread,start,message(first),message(second),done]),e=>{
  assert.equal(e.rejected_output.text,first);assert.deepEqual(e.rejected_output.model_evidence.cli_observed_negative_outputs,[first,second]);return true;
 });
});

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-terminal-repair-'));
const previous=process.env.COMPANY_PLUGIN_DATA;
process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'fixture-data');
test.after(()=>{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(tmp,{recursive:true,force:true});});
const read=f=>withStore(f.root,db=>db.read());
function fixture(){
 const f={root:fs.mkdtempSync(path.join(tmp,'fictional-')),session_id:'fictional-founder',epoch:1,source_instruction:'Fictional source repair fixture; preserve failures and no execution authority.'};
 engine.bind(f.root,f.session_id,'codex');engine.open({...f,idea:'Fictional terminal-state fixture'},'codex');withStore(f.root,db=>db.migrate());
 withStore(f.root,db=>db.transaction('fixture.roles',s=>{s.roles={qa:{name:'QA'}};s.team_sha256=teamHash(s);s.records.old={id:'old',kind:'artifact',revision:1,content:'Fictional exhausted allowance; no retry.'};s.records.home={id:'home',kind:'artifact',revision:1,content:'Fictional exhausted allowance; no retry.',context_obligations:{version:1,scope:'*'}};return s;}));
 const plan=engine.contextControl({...f,action:'plan',protocol:scoped.SCOPED_PROTOCOL,source_id:'old'},'codex');
 const target=engine.contextControl({...f,action:'target',plan_id:plan.id,phase:'extract',unit_id:plan.units[0].id},'codex');
 const job=engine.dispatch({...f,role:'qa',review_of:target.id,task:'Fictional independent read-only review'},'codex',{check:()=>({available:true,authenticated:true}),launch:()=>({on(){},unref(){}})});
 return {...f,plan,target,job};
}
function boundEnvelope(prompt,verdict){
 const p=JSON.parse(prompt),r={...p.response_shape,verdict,reason:'Fictional source conditions independently checked by contract double only.',permitted_action:verdict==='Pass'?'continue':'hold',blockers:verdict==='Pass'?[]:['Fictional missing authority'],items:[]};
 return JSON.stringify({content:r.reason,messages:[],notices:[],review:{verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action},qualification_result:r});
}
for(const verdict of ['Blocked','Pass'])test('worker records completed current '+verdict+' with reconnect evidence',async()=>{
 const f=fixture();await work(f.root,f.job.id,adapter(prompt=>[thread,start,warning,message(boundEnvelope(prompt,verdict)),done]));
 const s=read(f),j=s.jobs[f.job.id];assert.equal(j.status,'completed',j.error);assert.equal(s.records[j.artifact_id].review.verdict,verdict);
 assert.deepEqual(j.model_evidence.cli_warnings,[warning]);assert.equal(j.qualification_delivery.native_id,thread.thread_id);
 assert.equal(s.context_classifications?.old,undefined,'model result does not apply source classification');
});
for(const [name,raw,tail,options] of [
 ['terminal rejected negative',negative(),[{type:'turn.failed'}]],
 ['nonzero completed negative',negative(),[done],{code:9}],
 ['malformed stream negative',negative(),['{bad']],
 ['schema-invalid negative',negative('Fail',''),[done]],
 ['oversized negative',negative('Fail','x'.repeat(120000)),[done]],
 ['adapter output overflow negative',negative('Blocked','x'.repeat(150000)),[done],{limit:100000}],
 ['invalid negative JSON','{"review":{"verdict":"Blocked","reason":"truncated',[done]],
 ['oversized invalid negative JSON','{"review":{"verdict":"Blocked","reason":"'+ 'x'.repeat(120000),[done]],
 ['unknown stream shape negative',negative(),[{type:'unknown'},done]],
])test('normalized worker retains '+name+' before rejection escapes',async()=>{
 const f=fixture();await work(f.root,f.job.id,adapter([thread,start,warning,message(raw),...tail],options));
 const s=read(f),j=s.jobs[f.job.id];assert.equal(j.status,'failed');assert.equal(j.artifact_id,undefined);assert.ok(!Object.values(s.records).some(r=>r.job_id===j.id));
 assert.equal(j.rejected_output.text,raw.slice(0,100000));assert.equal(j.rejected_output.truncated,raw.length>100000);
 if(raw.length>100000)assert.equal(withStore(f.root,db=>snapshotBytes(db.read(),j.rejected_output.original)),JSON.stringify(raw));
 assert.equal(j.rejected_output.context_sha256,j.context_sha256);assert.equal(j.rejected_output.author_instance,j.instance_id);
 assert.equal(j.rejected_output.qualification_negative,name.includes('invalid negative JSON')?null:JSON.parse(raw).review.verdict);
 assert.equal(s.sessions[j.session_key].native_id,null);assert.equal(s.context_classifications?.old,undefined);
 assert.deepEqual(j.model_evidence.cli_warnings,[warning]);assert.equal(j.coordination_release.termination_confirmed,true);
});

for(const mode of ['recovered-final','missing-final-completion','early-negative'])test('stream ledger and raw negative: '+mode,async()=>{
 const f=fixture();
 await work(f.root,f.job.id,adapter(prompt=>[thread,start,message(boundEnvelope(prompt,'Pass')),done]));
 const extraction=read(f).jobs[f.job.id];assert.equal(extraction.status,'completed',extraction.error);
 withStore(f.root,db=>db.transaction('fixture.large-global',s=>{s.cos_instructions='Fictional compulsory global rule: no retry. '.repeat(4000);s.team_sha256=teamHash(s);return s;}));
 const target=engine.contextControl({...f,action:'target',plan_id:f.plan.id,phase:'applicability',delivery_protocol:scoped.SCOPED_STREAM,extraction_review_ids:[extraction.artifact_id],counterpart_ids:['home'],context_scope:'*'},'codex');
 const q=engine.dispatch({...f,role:'qa',review_of:target.id,task:'Fictional streamed review'},'codex',{check:()=>({available:true,authenticated:true}),launch:()=>({on(){},unref(){}})});
 const parts=[];let finalRaw,calls=0;
 await work(f.root,q.id,adapter(prompt=>{
  calls++;const page=JSON.parse(prompt);parts.push(page.text);
  let text;
  if(mode==='early-negative')text=finalRaw=negative();
  else if(!page.final)text=JSON.stringify({scoped_stream_ack:{body_sha256:page.body_sha256,sequence:page.sequence,range_sha256:page.range_sha256}});
  else {
   const packet=JSON.parse(parts.join('')),r={...packet.response_shape,verdict:'Blocked',reason:'Fictional unresolved condition after complete delivery',permitted_action:'hold',blockers:['No retry'],summary:'Fictional full negative',mappings:[],interfaces:[],reviewed_interfaces:[]};
   text=finalRaw=JSON.stringify({content:r.reason,messages:[],notices:[],review:{verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action},qualification_result:r});
  }
  return [{...thread,thread_id:'fictional-stream-native'},start,warning,message(text),...(mode==='missing-final-completion'&&page.final?[]:[done])];
 }));
 const s=read(f),j=s.jobs[q.id];assert.equal(s.context_classifications?.old,undefined);assert.equal(read(f).jobs[f.job.id].status,'completed');
 if(mode==='recovered-final'){
  assert.equal(j.status,'completed',j.error);assert.equal(s.records[j.artifact_id].review.verdict,'Blocked');assert.equal(j.qualification_delivery.complete,true);assert.ok(calls>1);
 }else{
  assert.equal(j.status,'failed');assert.equal(j.artifact_id,undefined);assert.equal(j.rejected_output.text,finalRaw);assert.equal(j.rejected_output.qualification_negative,'Blocked');assert.equal(j.qualification_delivery.complete,false);
  if(mode==='early-negative')assert.equal(calls,1);else assert.ok(calls>1);
 }
 assert.deepEqual(j.model_evidence.cli_warnings,[warning]);
});

test('native independence rejection retains completed negative before artifact assignment',async()=>{
 const f=fixture(),raw=negative();
 await work(f.root,f.job.id,adapter([{...thread,thread_id:f.session_id},start,warning,message(raw),done]));
 const s=read(f),j=s.jobs[f.job.id];assert.equal(j.status,'failed');assert.equal(j.artifact_id,undefined);assert.equal(j.rejected_output.text,raw);assert.equal(j.rejected_output.qualification_negative,'Blocked');
 assert.equal(j.native_id,null);assert.equal(j.rejected_native_id,f.session_id);assert.equal(s.sessions[j.session_key].native_id,null);
});

test('worker cannot accept later Pass over a completed negative',async()=>{
 const f=fixture(),raw=negative();
 await work(f.root,f.job.id,adapter(prompt=>[thread,start,message(raw),message(boundEnvelope(prompt,'Pass')),done]));
 const j=read(f).jobs[f.job.id];assert.equal(j.status,'failed');assert.equal(j.artifact_id,undefined);
 assert.equal(j.rejected_output.text,raw);assert.equal(j.rejected_output.qualification_negative,'Blocked');
});

const startupWarning={type:'item.completed',item:{id:'startup-warning',type:'error',message:'Ignoring unknown `features` requirement `ultrafast_mode` from requirements layers: fictional managed requirements'}};
test('known pre-turn CLI startup diagnostic is retained and requires a complete turn',async()=>{
 const result=await invoke([thread,startupWarning,start,message(negative('Pass')),done]);
 assert.deepEqual(result.model_evidence.cli_warnings,[{type:'error',message:startupWarning.item.message}]);
 assert.equal(result.model_evidence.verification,'unverified');
 for(const events of [
  [thread,startupWarning],
  [thread,startupWarning,start,message(negative('Pass'))],
  [thread,startupWarning,start,{type:'turn.failed'},message(negative('Pass')),done],
  [thread,startupWarning,startupWarning,start,message(negative('Pass')),done],
  [thread,start,message(negative('Pass')),done,startupWarning],
       ])await assert.rejects(invoke(events));
});

test('skill-budget diagnostic preserves warning evidence and still requires successful terminal completion',async()=>{
 const event={type:'item.completed',item:{id:'skill-warning',type:'error',message:'Skill descriptions were shortened to fit the skills context budget. Codex can still see every skill, but some descriptions are shorter. Disable unused skills or plugins to leave more room for the rest.'}};
 const result=await invoke([thread,start,event,message(negative('Pass')),done]);
 assert.deepEqual(result.model_evidence.cli_warnings,[{type:'error',message:event.item.message}]);
 const {proofJobSafe}=await import('../plugins/soloco/runtime/current-state.mjs');assert(proofJobSafe({model_evidence:result.model_evidence}));
 assert.deepEqual((await invoke([thread,start,message(negative('Pass')),event,done])).model_evidence.cli_warnings,[{type:'error',message:event.item.message}]);
 await assert.rejects(invoke([thread,start,event,{type:'turn.failed'},message(negative('Pass')),done]));
});
