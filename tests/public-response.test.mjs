import { upgrade } from '../plugins/soloco/runtime/upgrade.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Store, withStore, VERSION, PACKAGE, digest, teamHash, installedTeam } from '../plugins/soloco/runtime/store.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {retainSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';
import { call, hook } from '../plugins/soloco/runtime/main.mjs';
import {submitTask,sendTaskMessage} from '../plugins/soloco/runtime/tasks.mjs';
import {installTaskIndex} from '../plugins/soloco/runtime/task-index.mjs';
import {setRuntimeControl} from '../plugins/soloco/runtime/task-runtime-authority.mjs';
import { currentView, publicPage, exactRead, mutationView, sourceReference, upgradeView, doctorView, fits, toolResult, rpcReply, MODEL_MAX_BYTES, REPLY_MAX_BYTES } from '../plugins/soloco/runtime/public-response.mjs';
const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'public-response-')));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'data');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const size=s=>Buffer.byteLength(s,'utf8');
const noise='"\\\n\r\t\u0000😀漢字\ud800';
const seed=()=>({schema:2,id:'fixture',revision:1,plugin_version:VERSION,runtime_version:VERSION,name:'Fixture',idea:'Bounded current truth',phase:'Frame',mode:'preparation',paused:false,owner:{host:'codex',session_id:'founder',epoch:1},governance:'Do not invent authority',governance_sha256:'hash',cos_instructions:'Pinned Chief of Staff instructions',roles:{engineer:{name:'Engineer'}},records:{},jobs:{},messages:[],notices:[],sessions:{}});
function checkReply(value,id='reply') {
 assert.ok(fits(value));
 const model=JSON.stringify(value),wire=rpcReply(id,toolResult(value)),decoded=JSON.parse(wire);
 assert.ok(size(model)<=MODEL_MAX_BYTES,`model ${size(model)}`);
 assert.ok(size(wire)<=REPLY_MAX_BYTES,`wire ${size(wire)}`);
 assert.equal(decoded.result.content[0].text,model);
 return {model_bytes:size(model),wire_bytes:size(wire)};
}
function fixture(normalized=false) {
 const root=fs.mkdtempSync(path.join(base,'company-')),args={root,session_id:'founder'};
 engine.bind(root,'founder','codex');engine.open({...args,idea:'Fixture'},'codex');
 if(normalized)withStore(root,db=>db.migrate());
 return args;
}
function readAll(state,ref) {
 let offset=0,text='';
 do {const page=exactRead(state,{id:ref.id,sha256:ref.sha256,offset,length:32768});checkReply(page);assert.equal(page.offset,offset);assert.ok(page.length>0);text+=page.text;offset=page.next_offset;}while(offset!==null);
 assert.equal(digest(text),ref.sha256);return JSON.parse(text);
}
function allItems(state,collection) {
 let cursor,items=[];
 do {const p=publicPage(state,{collection,cursor,limit:100});checkReply(p);assert.equal(p.returned,p.items.length);items.push(...p.items);cursor=p.next_cursor??undefined;if(!cursor){assert.equal(p.complete,true);assert.equal(p.total,items.length);}}while(cursor);
 return items;
}

test('current capability preserves published 0.7.0 model-selection compatibility and rejects unpublished teams',()=>{
 for(const version of ['0.6.2','0.7.0','0.7.1','0.7.2','0.7.6','0.7.7',VERSION])assert.equal(currentView({...seed(),plugin_version:version}).capabilities.model_selection.eligible,true,version);
 for(const version of ['0.6.14','999.0.0','unknown'])assert.equal(currentView({...seed(),plugin_version:version}).capabilities.model_selection.eligible,false,version);
});

test('1x/10x/100x archives keep full serialized default replies bounded; exact giant sources survive',()=>{
 const metrics=[];
 for(const scale of [1,10,100]) {
  const s=seed();
  for(let i=0;i<scale;i++) {
   s.records['r'+i]={id:'r'+i,kind:'artifact',revision:1,status:'Submitted',content:noise.repeat(1000),handover:{subject:{snapshot:'snapshot'.repeat(1000)}},reconstruction:'reconstruction'.repeat(1000),review:{verdict:'Fail',reasons:'failed evidence'.repeat(1000)},previous:[{revision:0,content:'old'.repeat(1000)}]};
   s.jobs['j'+i]={id:'j'+i,role:'engineer',status:'completed',artifact_id:'r'+i,task:noise.repeat(1000),probe:{output:'probe'.repeat(1000)},created_at:new Date(i).toISOString()};
   s.messages.push({id:'m'+i,to:'engineer',content:noise.repeat(1000)});
   s.notices.push({id:'n'+i,kind:'must_know',summary:noise.repeat(1000),deliveries:[]});
  }
  s.jobs.oldActive={id:'oldActive',status:'running',role:'engineer',started_at:new Date().toISOString(),created_at:new Date(0).toISOString(),native_id:'native-active'};
  s.upgrade={id:'upgrade',status:'verified',probe:{output:noise.repeat(10000)},cos:{reconstruction:'rebuild'.repeat(10000)},qa:{review:{output:'qa'.repeat(10000)}},candidate:{plugin_version:VERSION,cos_instructions:noise.repeat(10000)},previous:{plugin_version:'0.6.11'},checkpoint:{records:s.records}};
  s.handover={id:'handover',status:'pending',reconstruction:noise.repeat(10000),subject:{snapshot:s.records}};
  const before=digest(JSON.stringify(s)),status=currentView(s),open=currentView(s,{open:true});
  const observed=checkReply(status);checkReply(open);metrics.push({scale,archive_bytes:size(JSON.stringify(s)),...observed});
  assert.equal(status.response_format,'soloco-current-v2');assert.equal(status.active_jobs.total,1);assert.equal(status.active_jobs.items[0].id,'oldActive');
  if(scale>=10)assert.equal(status.jobs.items.some(j=>j.id==='oldActive'),false); // active truth is independent of recent results
  assert.equal(status.records.total,scale);assert.equal(status.notices.total,scale);
  assert.equal(status.records.complete,scale<=status.records.returned);
  assert.equal(JSON.stringify(status).includes('reconstruction'.repeat(10)),false);
  assert.equal(status.records.items[0].preview,true);
  assert.equal(readAll(s,status.records.items[0].source).content,s.records['r'+(scale-1)].content);
  assert.equal(readAll(s,status.upgrade.source).qa.review.output,s.upgrade.qa.review.output);
  assert.equal(digest(JSON.stringify(s)),before,'projection/read must preserve exact archive');
 }
 assert.ok(Math.max(...metrics.map(m=>m.wire_bytes))<40000);
 console.log('public-response growth metrics '+JSON.stringify(metrics));
});

test('active jobs outside recent window, lifecycle versus review and acceptance, missing legacy fields',()=>{
 const s=seed();s.jobs.old={id:'old',status:'queued',created_at:new Date(0).toISOString()};
 for(let i=0;i<30;i++)s.jobs['j'+i]={id:'j'+i,status:'completed',artifact_id:'a'+i,created_at:new Date(i+1).toISOString()};
 s.jobs.uncertain={id:'uncertain',status:'cancelled',coordination:{resources:['source/held']},coordination_release:{termination_confirmed:false}};
 s.records.a29={id:'a29',kind:'review',status:'Submitted',review:{verdict:'Fail'},acceptance:{status:'rejected'}};
 const view=currentView(s);checkReply(view);
 assert.equal(view.resource_claims.total,1);assert.equal(view.resource_claims.jobs.items[0].id,'uncertain');assert.equal(view.resource_claims.jobs.items[0].coordination_release.termination_confirmed,false);
 assert.equal(view.active_jobs.items[0].id,'old');assert.equal(view.jobs.items.some(j=>j.id==='old'),false);
 assert.equal(view.jobs.items[0].status,'completed');assert.match(view.jobs.items[0].result_semantics,/not QA Pass/);
 assert.equal(view.records.items[0].review.verdict,'Fail');assert.equal(view.records.items[0].acceptance.recorded,true);
 const three=seed();for(let i=0;i<3;i++)three.jobs['busy'+i]={id:'busy'+i,role:'engineer',status:'running',started_at:new Date().toISOString(),task:noise.repeat(1000),error:noise.repeat(1000),model_evidence:{raw:noise.repeat(1000)}};
 const allActive=currentView(three);checkReply(allActive);assert.equal(allActive.active_jobs.returned,3);assert.equal(allActive.active_jobs.complete,true);
 const empty=currentView({records:{legacy:{}},jobs:{legacy:{status:'running'}},notices:[{summary:'legacy'}]});checkReply(empty);
 assert.equal(empty.jobs.items[0].timeout.state.state,'inspection');assert.equal(empty.records.items[0].source.revision,null);
 assert.doesNotThrow(()=>upgradeView({status:'checking'}));
 checkReply(currentView({...seed(),handover:null}));
 s.jobs.j0.finished_at=new Date().toISOString();assert.equal(currentView(s).jobs.items[0].id,'j0');
 // More legacy active jobs than normal admission capacity still have explicit paging.
 for(let i=0;i<20;i++)s.jobs['active'+i]={id:'active'+i,status:'running'};
 const paged=currentView(s);assert.equal(paged.active_jobs.total,21);assert.equal(paged.active_jobs.complete,false);assert.equal(allItems(s,'active_jobs').length,21);
});

test('every collection pages safely, hashes fail closed, namespaced handles retain exact family identity',()=>{
 const s=seed();
 for(let i=0;i<45;i++) {
  s.records['r'+i]={id:'r'+i,revision:i,kind:'artifact',content:'exact'+i};s.jobs['j'+i]={id:'j'+i,status:'completed'};
  s.notices.push({id:'n'+i,kind:i%2?'must_know':'decision_required',summary:noise.repeat(5000),resolution:i%3===0?{text:'done'}:null});
  s.messages.push({id:'m'+i,content:'message'+i});s.sessions['session'+i]={native_id:'native'+i};(s.upgrade_history??=[]).push({id:'u'+i,probe:{raw:'retained'}});
 }
 s.records['job:j0']={id:'job:j0',content:'legacy collision'};
 for(const collection of ['records','jobs','notices','unresolved_notices','messages','sessions','upgrade_history','sources']) {
  const items=allItems(s,collection);for(const item of items)assert.ok(item.source.sha256);
  assert.deepEqual(readAll(s,items[0].source),collection==='records'?s.records['job:j0']:collection==='jobs'?s.jobs.j44:collection==='messages'?s.messages[44]:collection==='upgrade_history'?s.upgrade_history[44]:collection==='sources'?s.governance:collection==='sessions'?s.sessions.session0:collection==='unresolved_notices'?s.notices[1]:s.notices[0]);
 }
 const page=publicPage(s,{collection:'unresolved_notices',limit:1});
 assert.throws(()=>publicPage(s,{collection:'records',cursor:page.next_cursor}),/invalid/);
 s.notices.push({id:'new',summary:'new'});assert.throws(()=>publicPage(s,{collection:'unresolved_notices',cursor:page.next_cursor}),/Stale/);
 const ref=sourceReference(s.records.r0,'r0');s.records.r0.content='changed';assert.throws(()=>exactRead(s,{...ref,length:1}),/changed/);
 const raw=JSON.stringify(s.records.r1);assert.equal(exactRead(s,{id:'r1',sha256:digest(raw),length:raw.length}).text,raw,'legacy raw record ID remains exact');
 assert.equal(readAll(s,sourceReference(s.jobs.j0,'@public:jobs:j0')).id,'j0');
});

test('long unicode/control instruction sources and mutation receipts fit escaped JSON-RPC without losing exact evidence',()=>{
 const s=seed();s.cos_instructions=noise.repeat(100000);s.governance=noise.repeat(10000);s.roles={engineer:{instructions:noise.repeat(10000)}};
 const view=currentView(s,{open:true});checkReply(view);assert.match(view.instruction_loading,/load exact pinned/);assert.equal(view.cos_instructions,undefined);
 const instructions=view.pinned.items.find(x=>x.source.id==='@public:pinned:cos_instructions');assert.equal(readAll(s,instructions.source),s.cos_instructions);
 const r={id:'large',kind:'artifact',revision:12,content:noise.repeat(100000),previous:[{content:noise.repeat(10000)}]};s.records.large=r;
 const receipt=mutationView(r,'large');checkReply(receipt);assert.equal(receipt.preview,true);assert.equal(readAll(s,receipt.source).content,r.content);
 const reply=rpcReply(noise.repeat(10000),toolResult(view));assert.ok(size(reply)<=REPLY_MAX_BYTES);assert.equal(JSON.parse(reply).id,null);
});

test('real open/status/wait and context paging; normalized wait avoids full state reads',async()=>{
 for(const normalized of [false,true]) {
  const args=fixture(normalized);
  withStore(args.root,db=>db.transaction('fixture',s=>{
   for(let i=0;i<20;i++)s.records['r'+i]={id:'r'+i,kind:'artifact',content:noise.repeat(2000)};
   s.jobs.pending={id:'pending',role:'engineer',status:'queued',created_at:new Date().toISOString()};return s;
  }));
  let reads=0,polls=0;const read=Store.prototype.read,token=Store.prototype.changeToken;
  Store.prototype.read=function(...a){reads++;return read.apply(this,a);};Store.prototype.changeToken=function(...a){polls++;return token.apply(this,a);};
  let waited;
  try {waited=await call('company_wait',{...args,seconds:1},'codex');}finally{Store.prototype.read=read;Store.prototype.changeToken=token;}
  checkReply(waited);assert.equal(reads,normalized?0:1);assert.ok(polls>=2);assert.equal(waited.active_jobs.items[0].status,'queued');
  checkReply(await call('company_status',args,'codex'));checkReply(await call('company_open',args,'codex'));
  const page=await call('company_context',{...args,action:'inspect',collection:'records',limit:2},'codex');checkReply(page);assert.equal(page.complete,false);
  if(normalized){let fullReads=0;const original=Store.prototype.read;Store.prototype.read=function(...a){fullReads++;return original.apply(this,a);};try{await call('company_context',{...args,action:'read',id:page.items[0].source.id,sha256:page.items[0].source.sha256,length:1},'codex');}finally{Store.prototype.read=original;}assert.equal(fullReads,0);}
  const ref=page.items[0].source,chunk=await call('company_context',{...args,action:'read',id:ref.id,sha256:ref.sha256,length:32768},'codex');checkReply(chunk);assert.equal(chunk.offset,0);
  assert.equal(withStore(args.root,db=>db.read()).records.r0.content,noise.repeat(2000));
 }
});

test('oversized task portfolio reads return an inspection Hold without mutation bookkeeping',async()=>{
 const args=fixture(true);
 withStore(args.root,db=>db.transaction('fictional.portfolio',s=>{
  for(let i=0;i<400;i++)s.records['fictional-constraint-'+i]={id:'fictional-constraint-'+i,kind:'decision',revision:1,content:'Retain this fictional condition and its unresolved effects.'};
  return s;
 }));
 const query={...args,action:'context',context_scope:'fictional-trial',budget:200000,limit:1};
 const before=withStore(args.root,db=>({state:db.read(),token:db.changeToken()}));
 const portfolio=engine.tasks(query,'codex');
 assert.equal(portfolio.tasks.total,0);
 assert.equal(portfolio.constraints.complete,true);
 assert.ok(portfolio.constraints.total>=400);
 assert.equal(fits(portfolio),false,'fixture must exercise the public reply overflow');
 const held=await call('company_tasks',query,'codex');checkReply(held);
 assert.equal(held.operation,'company_tasks');assert.equal(held.action,'context');
 assert.equal(held.operation_returned,undefined,'read overflow must not be reported as a returned mutation');
 assert.equal(held.result_not_inlined,undefined);
 assert.match(held.hold,/Inspection exceeds the public budget/);
 assert.equal(held.operation_source,undefined);assert.equal(held.attribution_hold,undefined);
 const page=await call('company_tasks',{...query,budget:16000},'codex');checkReply(page);
 assert.equal(page.protocol,'async-portfolio-v1');assert.equal(page.complete,false);
 assert.equal(page.constraints.total,portfolio.constraints.total);
 assert.equal(page.constraints.complete,false);assert.ok(page.constraints.sources.length>0);
 assert.ok(page.constraints.sources.length<page.constraints.total);
 assert.ok(size(JSON.stringify(page))<=16000);
 for(const budget of [15998,15999,16001,16002]){
  const edge=await call('company_tasks',{...query,budget},'codex');checkReply(edge);
  assert.equal(edge.protocol,'async-portfolio-v1');assert.equal(edge.complete,false);
  assert.equal(edge.constraints.complete,false);assert.ok(size(JSON.stringify(edge))<=budget);
  assert.deepEqual(edge.constraints.sources,portfolio.constraints.sources.slice(0,edge.constraints.sources.length));
 }
 const nearFullBudget=size(JSON.stringify(portfolio))-1;
 const nearFull=engine.tasks({...query,budget:nearFullBudget},'codex');
 assert.ok(size(JSON.stringify(nearFull))<=nearFullBudget);
 assert.equal(nearFull.complete,false);assert.equal(nearFull.constraints.complete,false);
 assert.ok(nearFull.constraints.sources.length<portfolio.constraints.sources.length);
 const ref=page.constraints.sources.find(source=>source.id.startsWith('fictional-constraint-'));
 assert.ok(ref?.sha256);assert.equal(page.constraints.requires_exact_retrieval,true);
 const exact=await call('company_context',{...args,action:'read',id:ref.id,sha256:ref.sha256,length:32768},'codex');checkReply(exact);
 assert.deepEqual(JSON.parse(exact.text),before.state.records[ref.id]);
 const after=withStore(args.root,db=>({state:db.read(),token:db.changeToken()}));
 assert.deepEqual(after,before,'oversized and narrowed read calls must not change persisted state or revision');
});

test('oversized task checkpoint and inbox retain read-only reply semantics',async()=>{
 const args=fixture(true),setup={...args,epoch:1,source_instruction:'Create fictional read-only response fixtures; no worker execution.'};
 let taskId;
 withStore(args.root,db=>{
  db.transaction('fictional.task-read-replies',s=>{
   setRuntimeControl(s,{...setup,action:'start'},'codex');
   const record=submitTask(s,{...setup,operation_id:'checkpoint',spec:{role:'research',task:noise.repeat(1000),acceptance:'Preserve all fictional evidence.',expected_deliverable:'A fictional checkpoint',context_scope:'fictional-trial'}},'codex');
   taskId=record.id;
   for(let i=0;i<40;i++)sendTaskMessage(s,{...setup,operation_id:'inbox-'+i,to_task_id:taskId,content:noise.repeat(15)},'codex');
   return s;
  });
  installTaskIndex(db);
 });
 const before=withStore(args.root,db=>({state:db.read(),token:db.changeToken()}));
 for(const action of ['checkpoint','inbox']){
  const query={...args,action,task_id:taskId,...(action==='inbox'?{limit:100}:{})};
  assert.equal(fits(engine.tasks(query,'codex')),false,action+' must exercise reply overflow');
  const held=await call('company_tasks',query,'codex');checkReply(held);
  assert.equal(held.operation,'company_tasks');assert.equal(held.action,action);
  assert.equal(held.operation_returned,undefined,'read overflow must not be reported as a returned mutation');
  assert.equal(held.result_not_inlined,undefined);
  assert.match(held.hold,/Inspection exceeds the public budget/);
  assert.equal(held.operation_source,undefined);assert.equal(held.attribution_hold,undefined);
 }
 const inbox=await call('company_tasks',{...args,action:'inbox',task_id:taskId,limit:1},'codex');checkReply(inbox);
 assert.equal(inbox.returned,1);assert.equal(inbox.total,40);assert.equal(inbox.complete,false);
 assert.ok(inbox.items[0].source.sha256);
 const runtime=await call('company_runtime',{...args,action:'status'},'codex');checkReply(runtime);
 assert.equal(runtime.protocol,'async-runtime-v1');assert.equal(runtime.supervisor_is_model,false);
 assert.equal(runtime.operation_returned,undefined);
 const after=withStore(args.root,db=>({state:db.read(),token:db.changeToken()}));
 assert.deepEqual(after,before,'task reads and runtime status must preserve all fictional state');
});

test('tight task portfolio pages price cursors and no-progress metadata without changing state',async()=>{
 const args=fixture(true),setup={...args,epoch:1,source_instruction:'Create fictional pagination fixtures; no worker execution.'},ids=[];
 withStore(args.root,db=>{
  db.transaction('fictional.task-pages',s=>{
   setRuntimeControl(s,{...setup,action:'start'},'codex');
   for(let i=0;i<3;i++)ids.push(submitTask(s,{...setup,operation_id:'page-'+i,spec:{role:'research',task:'Inspect fictional task '+i,acceptance:'Retain exact task membership.',expected_deliverable:noise.repeat(20),context_scope:'fictional-pages'}},'codex').id);
   return s;
  });
  installTaskIndex(db);
 });
 const before=withStore(args.root,db=>({state:db.read(),token:db.changeToken()}));
 const query={...args,action:'context',context_scope:'fictional-pages',limit:1,budget:200000};
 const first=await call('company_tasks',query,'codex');checkReply(first);
 assert.equal(first.tasks.returned,1);assert.ok(first.tasks.next_cursor);
 const firstBytes=size(JSON.stringify(first));let stopped;
 for(let budget=firstBytes-1;budget>=512;budget-=64){
  const page=await call('company_tasks',{...query,budget},'codex');checkReply(page);
  assert.ok(size(JSON.stringify(page))<=budget);assert.equal(page.complete,false);
  if(!page.tasks.returned){stopped=page;break;}
  assert.ok(page.tasks.next_cursor);
 }
 assert.ok(stopped,'a bounded no-progress reply must precede an unfit control header');
 assert.equal(stopped.tasks.next_cursor,null);assert.equal(stopped.tasks.complete,false);
 assert.match(stopped.tasks.reason,/No zero-progress continuation/);
 const budget=firstBytes+4,seen=[];let cursor;
 do{
  const page=await call('company_tasks',{...query,budget,...(cursor?{cursor}:{})},'codex');checkReply(page);
  assert.ok(size(JSON.stringify(page))<=budget);assert.equal(page.tasks.returned,1);
  assert.equal(page.constraints.complete,true);assert.equal(page.notices.complete,true);
  assert.ok(!seen.includes(page.tasks.items[0].source.id),'continuations must advance to a new task');
  seen.push(page.tasks.items[0].source.id);cursor=page.tasks.next_cursor;
  assert.equal(page.tasks.complete,cursor===null);assert.equal(page.complete,cursor===null);
 }while(cursor);
 assert.deepEqual(seen.toSorted(),ids.toSorted());
 const after=withStore(args.root,db=>({state:db.read(),token:db.changeToken()}));
 assert.deepEqual(after,before,'bounded task pagination must preserve persisted state and revision');
});

test('normalized-v2 lifecycle hints wait for active jobs and pending upgrades',async()=>{
 const args=fixture(true);
 // Materialize a real v2 layout with persisted immutable bytes, rather than
 // relabeling storageInfo. No journals or v4-only identities enter this fixture.
 withStore(args.root,db=>{db.db.exec('UPDATE company_layout SET version=2 WHERE id=1');db.transaction('fixture.v2-original',s=>{s.records.original={id:'original',revision:1,snapshot:retainSnapshot(s,{constraint:'REAL_V2_NO_RETRY'})};return s;});assert.equal(db.storageInfo().format,'normalized-v2');});
 {
  for(const pending of ['job','upgrade']) {
   withStore(args.root,db=>db.transaction('fixture.lifecycle',s=>{
    s.jobs={};s.upgrade=null;
    if(pending==='job')s.jobs.active={id:'active',role:'engineer',status:'queued',created_at:new Date().toISOString()};
    else s.upgrade={id:'pending',status:'checking',review_deadline_policy:'none',deadline_ms:null,review_window_minutes:null};
    return s;
   }));
   const start=Date.now();const result=await call('company_wait',{...args,seconds:1},'codex');
   assert.ok(Date.now()-start>=900,'supported normalized layout must retain pending lifecycle work');
   if(pending==='job')assert.equal(result.active_jobs.total,1);else assert.equal(result.upgrade.status,'checking');
  }
 }
});

test('wait retains overdue/interrupted/export/upgrade reconciliation and notice truth',async()=>{
 const args=fixture(true);
 withStore(args.root,db=>db.transaction('fixture',s=>{
  s.jobs.old={id:'old',status:'queued',created_at:new Date(0).toISOString()};
  s.jobs.unclear={id:'unclear',status:'running'};
  s.records.export={id:'export',prototype:{export:{status:'writing',started_at:new Date(0).toISOString()}}};
  s.upgrade={id:'old-upgrade',status:'checking',deadline_ms:0};return s;
 }));
 const view=await call('company_wait',{...args,seconds:20},'codex');checkReply(view);
 const persisted=withStore(args.root,db=>db.read());assert.equal(persisted.jobs.old.status,'interrupted');assert.equal(persisted.jobs.old.timeout_reconciliation.termination_confirmed,false);
 assert.equal(persisted.jobs.unclear.timeout_reconciliation.state,'inspection');assert.equal(persisted.records.export.prototype.export.status,'failed');assert.equal(persisted.upgrade.status,'failed');assert.equal(view.notices.total,4);
 withStore(args.root,db=>db.transaction('unlimited upgrade',s=>{s.upgrade={id:'unlimited',status:'checking',review_deadline_policy:'none',deadline_ms:null,review_window_minutes:null};return s;}));
 const unlimited=await call('company_wait',{...args,seconds:0},'codex');assert.equal(unlimited.upgrade.status,'checking');
});

test('hooks bind exact session, require initial/team-change open, page notices, and never acknowledge delivery',()=>{
 const args=fixture(true),input={cwd:args.root,session_id:'new-chat',hook_event_name:'UserPromptSubmit',prompt:'status'};
 withStore(args.root,db=>db.transaction('fixture',s=>{for(let i=0;i<25;i++)s.notices.push({id:'n'+i,kind:'must_know',summary:noise.repeat(2000),deliveries:[]});return s;}));
 const first=hook(input,'codex'),ctx=JSON.parse(first.hookSpecificOutput.additionalContext);
 assert.ok(size(JSON.stringify(first))<16000);assert.match(ctx.instruction_loading,/company_open is required/);assert.equal(ctx.notices.total,25);assert.equal(ctx.notices.complete,false);
 const state=withStore(args.root,db=>db.read());assert.equal(state.notices.filter(n=>n.deliveries.length).length,ctx.notices.returned);assert.equal(state.notices[0].deliveries[0].summary_complete,false);
 assert.equal(state.notices.some(n=>n.seen_at||n.resolution),false);assert.equal(readAll(state,ctx.notices.items[0].source).summary,state.notices[0].summary);
 const deliveredRevision=state.revision,deliveredToken=withStore(args.root,db=>db.changeToken());
 hook(input,'codex');
 const repeated=withStore(args.root,db=>db.read());assert.equal(repeated.notices[0].deliveries.length,1);
 assert.equal(repeated.revision,deliveredRevision,'unchanged preview delivery must not rewrite company state');
 assert.equal(withStore(args.root,db=>db.changeToken()),deliveredToken);
 withStore(args.root,db=>db.transaction('fixture.notice-change',s=>{s.notices[0].summary+=' New uncertainty';return s;}));
 hook(input,'codex');assert.equal(withStore(args.root,db=>db.read()).notices[0].deliveries.length,2,'changed notice needs a new exact preview delivery');
 // Existing owner opens once; another session still needs handover/open authority.
 const ownerInput={...input,session_id:'founder'};assert.match(JSON.parse(hook(ownerInput,'codex').hookSpecificOutput.additionalContext).instruction_loading,/was opened/);
 withStore(args.root,db=>db.transaction('changed team',s=>{s.cos_instructions+=' changed';s.team_sha256=teamHash(s);return s;}));
 assert.match(JSON.parse(hook(ownerInput,'codex').hookSpecificOutput.additionalContext).instruction_loading,/company_open is required/);
 engine.open(args,'codex');assert.match(JSON.parse(hook(ownerInput,'codex').hookSpecificOutput.additionalContext).instruction_loading,/was opened/);
 const paused=JSON.parse(hook({...ownerInput,prompt:'pause'},'codex').hookSpecificOutput.additionalContext);assert.equal(paused.paused,true);
 assert.equal(withStore(args.root,db=>db.read()).paused,true);
 const restarted=JSON.parse(hook({...ownerInput,hook_event_name:'SessionStart'},'codex').hookSpecificOutput.additionalContext);assert.match(restarted.instruction_loading,/company_open is required/);
 assert.throws(()=>engine.status({...args,session_id:'never-bound'},'codex'),/binding/);
});

test('actual JSON-RPC server bounds default tools, large save, message and error output',()=>{
 const args=fixture(true);
 const requests=[['company_status',args],['company_open',args],['company_wait',{...args,seconds:0}],['company_save',{...args,epoch:1,kind:'artifact',content:noise.repeat(7000)}],['company_message',{...args,epoch:1,to:'engineer',content:noise.repeat(1000)}],['company_status',{...args,unexpected:noise.repeat(10000)}]];
 const input=requests.map(([name,a],i)=>JSON.stringify({jsonrpc:'2.0',id:i,method:'tools/call',params:{name,arguments:a}})).join('\n')+'\n';
 const proc=spawnSync(process.execPath,[path.join(PACKAGE,'runtime/main.mjs'),'serve','codex'],{env:process.env,input,encoding:'utf8',maxBuffer:2e6});assert.equal(proc.status,0,proc.stderr);
 const lines=proc.stdout.trim().split('\n');assert.equal(lines.length,requests.length);
 for(const line of lines){assert.ok(size(line)<=REPLY_MAX_BYTES);const result=JSON.parse(line).result;assert.ok(size(result.content[0].text)<=MODEL_MAX_BYTES);}
 assert.equal(JSON.parse(JSON.parse(lines[3]).result.content[0].text).preview,true);
 assert.equal(JSON.parse(lines[5]).result.isError,true);
});

test('oversized handover mutation returns persisted exact source and never implies independent acceptance',async()=>{
 const args=fixture(true),incoming={...args,session_id:'incoming',epoch:2};
 withStore(args.root,db=>db.transaction('fixture',s=>{s.records.archive={id:'archive',kind:'artifact',content:noise.repeat(2000),reconstruction:{snapshot:'retained'.repeat(1000)}};return s;}));
 engine.bind(args.root,incoming.session_id,'codex');
 engine.control({...incoming,action:'handover',expected_epoch:1,source_instruction:'Synthetic founder-directed handover'},'codex');
 const result=await call('company_handover',{...incoming,action:'submit',content:'Objectives, rules, authority, pending work, uncertainty and next action remain subject to independent QA. '+noise.repeat(1300)},'codex');
 checkReply(result);assert.equal(result.operation_returned,true);assert.equal(result.result_not_inlined,true);
 const state=withStore(args.root,db=>db.read()),record=state.records[state.handover.reconstruction_id],ref=result.current?.operation_source??result.operation_source;
 assert.equal(ref.id,'@public:records:'+record.id);assert.equal(ref.sha256,digest(JSON.stringify(record)));assert.equal(state.handover.status,'pending');assert.equal(state.paused,true);
 assert.throws(()=>engine.control({...incoming,action:'resume',expected_epoch:2,source_instruction:'Synthetic premature resume'},'codex'),/Pass|QA|review|reconstruction/i);
});

async function publicReadAll(args,ref) {
 let text='',offset=0;
 do {
  const part=await call('company_context',{...args,action:'read',id:ref.id,sha256:ref.sha256,offset,length:32768},'codex');
  checkReply(part);assert.equal(part.offset,offset);assert.ok(part.length>0);text+=part.text;offset=part.next_offset;
 }while(offset!==null);
 assert.equal(digest(text),ref.sha256);return JSON.parse(text);
}
function stdio(requests) {
 const input=requests.map(([name,args],i)=>JSON.stringify({jsonrpc:'2.0',id:i,method:'tools/call',params:{name,arguments:args}})).join('\n')+'\n';
 const proc=spawnSync(process.execPath,[path.join(PACKAGE,'runtime/main.mjs'),'serve','codex'],{env:process.env,input,encoding:'utf8',maxBuffer:4e6});
 assert.equal(proc.status,0,proc.stderr);
 const lines=proc.stdout.trim().split('\n');assert.equal(lines.length,requests.length);
 return lines.map(line=>{assert.ok(size(line)<=REPLY_MAX_BYTES);const reply=JSON.parse(line);assert.equal(reply.error,undefined);assert.equal(reply.result.isError,undefined,reply.result.content?.[0]?.text);assert.ok(size(reply.result.content[0].text)<=MODEL_MAX_BYTES);return JSON.parse(reply.result.content[0].text);});
}

test('actual upgrade inspection and stdio retain preflight and exact pinned/installed/candidate instructions without persisted copies',async()=>{
 for(const normalized of [false,true]) {
  const args=fixture(normalized),installed=installedTeam();
  if(normalized)withStore(args.root,db=>db.transaction('fictional pinned changes',s=>{s.governance+='\nFictional founder restriction '+noise.repeat(3000);s.cos_instructions+=noise.repeat(10000);s.governance_sha256=digest(s.governance);s.team_sha256=teamHash(s);return s;}));
  const before=withStore(args.root,db=>db.read());
  assert.ok(size(JSON.stringify({prior_instructions:before.cos_instructions,candidate_instructions:installed.cos_instructions,governance:{current:before.governance,installed:installed.governance}}))>MODEL_MAX_BYTES,'the original inline inspection must overflow even on the empty fictional company');
  for(const policy of ['preserve','installed']) {
   const inspectArgs={...args,action:'inspect',governance:policy};
   const raw=upgrade(inspectArgs,'codex');checkReply(raw); // Direct rpcReply must also succeed.
   const result=await call('company_upgrade',inspectArgs,'codex');checkReply(result);
   const [wire]=stdio([['company_upgrade',inspectArgs]]);assert.deepEqual(wire,result);
   assert.equal(result.operation_returned,undefined);assert.equal(result.owner.epoch,1);assert.equal(result.owner.session_id,args.session_id);
   const candidate={...installed,...(policy==='preserve'?{governance:before.governance,governance_sha256:before.governance_sha256}:{})};
   assert.equal(result.candidate_hash,teamHash(candidate));assert.equal(result.candidate_version,VERSION);assert.equal(result.governance.policy,policy);
   assert.equal(result.changes.governance_changed,before.governance!==candidate.governance);
   assert.equal(result.projection_preview.exact_reservation,false);
   for(const metric of ['baseline','candidate']){assert.ok(result.projection_preview[metric].stream_characters>0);assert.ok(result.projection_preview[metric].pages>0);assert.match(result.projection_preview[metric].stream_sha256,/^[a-f0-9]{64}$/);}
   const requests=[],expected=[];
   for(const [kind,team] of Object.entries({pinned:before,installed,candidate}))for(const field of ['governance','cos_instructions','roles']) {
    const ref=result.instruction_sources[kind][field];assert.equal(ref.sha256,digest(JSON.stringify(team[field])));
    assert.deepEqual(await publicReadAll(args,ref),team[field]);
    // Exercise all ranges through actual stdio as well, including wire-adapted lengths.
    let offset=0;
    do {const query={...args,action:'read',id:ref.id,sha256:ref.sha256,offset,length:32768};const part=await call('company_context',query,'codex');requests.push(['company_context',query]);expected.push(part);offset=part.next_offset;}while(offset!==null);
   }
   assert.deepEqual(stdio(requests),expected);
  }
  assert.deepEqual(withStore(args.root,db=>db.read()),before,'inspection/read must not persist giant response copies or mutate company state');
  const old=(await call('company_upgrade',{...args,action:'inspect'},'codex')).instruction_sources.candidate.governance;
  withStore(args.root,db=>db.transaction('fictional governance change',s=>{s.governance+='changed';s.governance_sha256=digest(s.governance);s.team_sha256=teamHash(s);return s;}));
  await assert.rejects(call('company_context',{...args,action:'read',id:old.id,sha256:old.sha256,length:1},'codex'),/changed/);
 }
});

test('public calls and stdio retain exact unknown long identities and disclose source omissions',async()=>{
 const args=fixture(true),key='unknown-'+ '😀漢字"'.repeat(3000),native='native-'+noise.repeat(3000),ownerIdentity='founder-'+noise.repeat(3000);
 withStore(args.root,db=>db.transaction('fictional long identities',s=>{
  s.id='company-'+noise.repeat(3000);s.owner.session_id=ownerIdentity; // Read APIs require binding, not current ownership.
  s.records[key]={id:key,revision:noise.repeat(1000),kind:'artifact',content:'Original long identity'};
  s.records['@public:pinned:owner']={id:'collision',content:'A record cannot shadow the reserved owner source'};
  s.notices.push({id:'long-reference',kind:'must_know',summary:'Exact long reference',reference:key});
  s.jobs.long={id:'long',status:'completed',native_id:native,artifact_id:key};
  return s;
 }));
 const view=await call('company_status',args,'codex');checkReply(view);assert.equal(view.company_id,undefined);assert.ok(view.fields_not_inlined.includes('company_id'));
 assert.match(await publicReadAll(args,view.company_source),/^company-/);
 const page=await call('company_context',{...args,action:'inspect',collection:'records',limit:100},'codex');checkReply(page);
 const item=page.items.find(i=>i.source.id==='@public:key:records:'+digest(JSON.stringify(key)));assert.ok(item);assert.equal(item.id,undefined);assert.ok(item.fields_not_inlined.includes('id'));assert.match(item.hold,/exact/);
 assert.equal((await publicReadAll(args,item.source)).id,key);assert.equal(await publicReadAll(args,item.storage_key_source),key);assert.equal(item.source.revision,null);assert.equal(item.source.revision_not_inlined,true);assert.ok(item.fields_not_inlined.includes('revision'));
 const notice=view.notices.items[0];assert.equal(notice.reference,undefined);assert.equal(notice.reference_not_inlined,true);assert.equal((await publicReadAll(args,notice.source)).reference,key);
 const job=view.jobs.items[0];assert.equal(job.native_id,undefined);assert.equal(job.artifact_id,undefined);assert.equal((await publicReadAll(args,job.source)).native_id,native);
 const owner=view.pinned.items.find(i=>i.source.id==='@public:pinned:owner');assert.equal(view.owner.session_id,undefined);assert.ok(view.owner.fields_not_inlined.includes('session_id'));assert.equal((await publicReadAll(args,owner.source)).session_id,ownerIdentity);
 const sources=await call('company_context',{...args,action:'inspect',collection:'sources',limit:1},'codex');assert.equal(sources.complete,false);assert.ok(sources.next_cursor);assert.ok(sources.total>sources.returned);
 const wire=stdio([['company_status',args],['company_context',{...args,action:'inspect',collection:'records',limit:100}]]);assert.deepEqual(wire,[view,page]);
});

test('oversized development/prototype inspections page exact records through public calls and stdio',async()=>{
 const args={...fixture(true),epoch:1};
 withStore(args.root,db=>db.transaction('fictional inspection records',s=>{
  for(let i=0;i<14;i++)s.records['plan-'+i]={id:'plan-'+i,revision:1,kind:'plan',content:noise.repeat(3000),development:{type:'plan',scope_sha256:'scope-'+i},prototype:{type:'plan',scope_sha256:'scope-'+i}};
  return s;
 }));
 for(const tool of ['company_develop','company_prototype']) {
  const inspectArgs={...args,action:'inspect'},result=await call(tool,inspectArgs,'codex');checkReply(result);assert.equal(result.operation_returned,undefined);
  assert.equal(result.records.total,14);assert.equal(result.records.complete,false);assert.ok(result.records.next_cursor);
  assert.equal((await publicReadAll(args,result.records.items[0].source)).content,noise.repeat(3000));
  const [wire]=stdio([[tool,inspectArgs]]);assert.deepEqual(wire,result);
  let count=result.records.returned,cursor=result.records.next_cursor;
  while(cursor){const page=await call('company_context',{...args,action:'inspect',collection:result.records.collection,cursor},'codex');checkReply(page);count+=page.returned;cursor=page.next_cursor;}
  assert.equal(count,14);
 }
});

test('stdio oversized completed handover mutation retains attributable receipt and exact source without duplicate mutation',async()=>{
 const args=fixture(true),incoming={...args,session_id:'stdio-incoming',epoch:2};engine.bind(args.root,incoming.session_id,'codex');
 engine.control({...incoming,action:'handover',expected_epoch:1,source_instruction:'Fictional authorized transfer'},'codex');
 const [receipt]=stdio([['company_handover',{...incoming,action:'submit',content:'Fictional reconstruction retains independent QA hold. '+noise.repeat(1400)}]]);
 checkReply(receipt);assert.equal(receipt.operation_returned,true);assert.match(receipt.note,/not QA acceptance/);assert.ok(receipt.operation_source);assert.equal(receipt.result.status,'Submitted');
 const original=await publicReadAll(incoming,receipt.operation_source);assert.match(original.content,/Fictional reconstruction/);
 const state=withStore(args.root,db=>db.read());assert.equal(Object.values(state.records).filter(r=>r.handover&&r.author_role==='runner').length,1);assert.equal(state.handover.status,'pending');assert.equal(state.paused,true);
});

test('oversized progress read retains actionable current pages and exact attention through public call and stdio',async()=>{
 const args=fixture(true);
 withStore(args.root,db=>db.transaction('fictional progress attention',s=>{for(let i=0;i<20;i++)s.notices.push({id:'notice-'+i,kind:'decision_required',summary:'Exact fictional restriction '+noise.repeat(1000),resolution:null});return s;}));
 const result=await call('company_progress',{...args,format:'json'},'codex');checkReply(result);
 assert.equal(result.operation_returned,undefined);assert.equal(result.render_not_inlined,true);assert.equal(result.attention.total,20);assert.equal(result.attention.complete,false);
 assert.match((await publicReadAll(args,result.attention.items[0].source)).summary,/Exact fictional restriction/);
 const wire=stdio([['company_progress',{...args,format:'json'}]])[0];checkReply(wire);assert.equal(wire.attention.total,20);
 const {envelope}=await progressReadAll(args,wire.artifact);assert.equal(envelope.result.attention.length,20);assert.equal(envelope.result.attention[0].notice.summary,(await publicReadAll(args,wire.attention.items[0].source)).summary);
});

test('oversized storage backup/restore stdio receipts retain status and exact existing manifest without duplicate mutation',()=>{
 const args={...fixture(true),epoch:1};engine.control({...args,action:'pause',expected_epoch:1,source_instruction:'Pause fictional fixture for backup'},'codex');
 const assets=path.join(args.root,'.company','fictional-assets');fs.mkdirSync(assets);
 for(let i=0;i<240;i++)fs.writeFileSync(path.join(assets,`fixture-${i}-${'x'.repeat(90)}.txt`),'Fictional backup bytes');
 const directory=path.join(base,'fictional-backup-'+path.basename(args.root));
 const [receipt]=stdio([['company_storage',{...args,action:'backup',directory,source_instruction:'Back up fictional fixture only'}]]);
 checkReply(receipt);assert.equal(receipt.operation_returned,true);assert.equal(receipt.status,'backup_written');assert.match(receipt.note,/not QA acceptance/);
 const file=path.join(directory,'manifest.json'),raw=fs.readFileSync(file),manifest=JSON.parse(raw);
 assert.equal(receipt.manifest_source.path,file);assert.equal(receipt.manifest_source.sha256,digest(raw));assert.equal(receipt.files.total,manifest.files.length);assert.equal(receipt.files.complete,false);assert.equal(receipt.files.omitted,manifest.files.length);assert.equal(receipt.state_sha256,manifest.state_sha256);
 assert.ok(manifest.files.length>=240);assert.ok(size(JSON.stringify(manifest))>MODEL_MAX_BYTES);
 for(const entry of manifest.files){const data=fs.readFileSync(path.join(directory,entry.path));assert.equal(digest(data),entry.sha256);assert.equal(data.length,entry.bytes);}
 const destination=directory+'-restored';
 const [restored]=stdio([['company_storage',{...args,action:'restore',backup_dir:directory,directory:destination,source_instruction:'Restore fictional fixture only'}]]);
 checkReply(restored);assert.equal(restored.operation_returned,true);assert.equal(restored.status,'restored');assert.equal(restored.readback_verified,true);assert.equal(restored.ownership_transferred,false);assert.equal(restored.destination_directory,destination);assert.deepEqual(restored.manifest_source,receipt.manifest_source);
 assert.equal(digest(JSON.stringify(withStore(destination,db=>db.read()))),manifest.state_sha256);
});

test('oversized handover inspection preserves exact registry/semantic handles and explicitly discloses omitted windows',async()=>{
 const args=fixture(true);
 withStore(args.root,db=>db.transaction('fictional handover windows',s=>{
  for(let i=0;i<80;i++) {
   s.notices.push({id:'notice-'+i,kind:'decision_required',summary:noise.repeat(20),resolution:null});
   s.jobs['job-'+i]={id:'job-'+i,role:'engineer',status:'completed',native_id:'fictional-native-'+String(i)+'x'.repeat(400),epoch:1};
  }
  return s;
 }));
 const raw=engine.handover({...args,action:'inspect'},'codex');assert.equal(fits(raw),false,'fixture must cross the real public budget');
 const result=await call('company_handover',{...args,action:'inspect'},'codex');checkReply(result);assert.equal(result.operation_returned,undefined);
 assert.equal(result.subject_sha256,raw.subject_sha256);assert.deepEqual(result.registry,raw.registry);assert.deepEqual(result.required_semantics,raw.required_semantics);
 assert.equal(result.windows.notices.total,80);assert.equal(result.windows.notices.returned,0);assert.equal(result.windows.notices.omitted,80);
 assert.equal(result.windows.jobs.omitted,80);assert.equal(result.entry_points_window.omitted,raw.entry_points.length);
 assert.deepEqual(stdio([['company_handover',{...args,action:'inspect'}]])[0],result);
 const requests=[],expected=[];let offset=0,text='';
 while(offset<result.registry.length) {
  const query={...args,action:'read',subject_sha256:result.subject_sha256,source_id:result.registry.source_id,sha256:result.registry.sha256,offset,length:Math.min(2000,result.registry.length-offset)};
  const part=await call('company_handover',query,'codex');checkReply(part);assert.equal(part.offset,offset);assert.ok(part.length>0);text+=part.text;offset+=part.length;requests.push(['company_handover',query]);expected.push(part);
 }
 assert.equal(digest(text),result.registry.sha256);assert.ok(JSON.parse(text));assert.deepEqual(stdio(requests),expected);
});

test('legacy storage exact key locators distinguish lone surrogates and retain NUL suffixes through public call and stdio',async()=>{
 const args=fixture(false),keys=['large-'+ 'x'.repeat(600)+'\ud800','large-'+ 'x'.repeat(600)+'\ud801','large-'+ 'x'.repeat(600)+'\u0000suffix'];
 withStore(args.root,db=>db.transaction('fictional exact legacy keys',s=>{for(const key of keys)s.records[key]={id:key,revision:1,kind:'artifact',content:'Retain exact legacy identity'};return s;}));
 const page=await call('company_context',{...args,action:'inspect',collection:'records'},'codex');checkReply(page);assert.equal(page.total,3);assert.equal(page.complete,true);
 assert.equal(new Set(page.items.map(item=>item.source.id)).size,3);
 for(const item of page.items){const key=await publicReadAll(args,item.storage_key_source);assert.ok(keys.includes(key));assert.equal((await publicReadAll(args,item.source)).id,key);}
 assert.deepEqual(stdio([['company_context',{...args,action:'inspect',collection:'records'}]])[0],page);
});


async function progressReadAll(args,ref) {
 let offset=0,text='',requests=[],expected=[];
 do {
  const request={...args,action:'read',artifact:ref.id,sha256:ref.sha256,offset,length:32768};
  const page=await call('company_progress',request,'codex');checkReply(page);assert.equal(page.offset,offset);assert.ok(page.length>0);
  requests.push(['company_progress',request]);expected.push(page);text+=page.text;offset=page.next_offset;
 }while(offset!==null);
 assert.equal(text.length,ref.total_characters);assert.equal(digest(text),ref.sha256);
 return {envelope:JSON.parse(text),requests,expected};
}
test('compatibility ordinary ten-job HTML and twenty-job JSON retain the exact computed render over public call and stdio',async()=>{
 for(const [count,format] of [[10,'html'],[20,'json']]) {
  const args=fixture(true);
  withStore(args.root,db=>db.transaction('fictional concise progress',s=>{
   for(let i=0;i<count;i++){
    const id='fictional-job-'+i,artifact='fictional-artifact-'+i;
    s.jobs[id]={id,role:i%2?'qa':'engineer',instance_id:'fictional-instance-'+i,native_id:'fictional-native-'+i,status:'completed',created_at:new Date(1730000000000+i*60000).toISOString(),finished_at:new Date(1730000030000+i*60000).toISOString(),task_summary:'Review the bounded fictional change 😀',expected_deliverable:'A concrete report and evidence',next_handoff:'Chief of Staff reviews the result',artifact_id:artifact,requester:{role:'runner',session_id:args.session_id,host:'codex',epoch:1},inputs:i?[{id:'fictional-artifact-'+(i-1),revision:1}]:[]};
    s.records[artifact]={id:artifact,revision:1,kind:'artifact',status:'Submitted',job_id:id,author_role:s.jobs[id].role,author_instance:s.jobs[id].instance_id,content:'Fictional concise report'};
   }return s;
  }));
  const request={...args,format,...(format==='html'?{render_id:'compat'}:{})},before=withStore(args.root,db=>db.read());
  const direct=engine.progress(request,'codex'),receipt=await call('company_progress',request,'codex');checkReply(receipt);assert.equal(receipt.render_not_inlined,true);assert.equal(receipt.current,undefined);
  const recovered=await progressReadAll(args,receipt.artifact);assert.deepEqual(recovered.envelope.snapshot,receipt.snapshot);
  // Direct calls now use the same boundary; exact underlying projection/render is retained.
  const {progressSnapshot,renderProgress}=await import('../plugins/soloco/runtime/progress-view.mjs');
  const projection=progressSnapshot(before);
  assert.deepEqual(recovered.envelope.result,format==='html'?renderProgress(projection,'html',{renderId:'compat'}):projection);
  assert.equal(receipt.snapshot.source_sha256,digest(JSON.stringify(before)));assert.equal(receipt.snapshot.projection_sha256,digest(JSON.stringify(projection)));
  assert.deepEqual(stdio(recovered.requests),recovered.expected,'reads in a fresh process retrieve the retained bytes');
  if(format==='html'){assert.match(recovered.envelope.result,/Primary DAG/);assert.match(recovered.envelope.result,/data-focus=/);assert.match(recovered.envelope.result,/Chronology/);}
  else {assert.equal(recovered.envelope.result.nodes.length,count);assert.equal(recovered.envelope.result.graph.edges.length,count-1);}
  assert.deepEqual(withStore(args.root,db=>db.read()),before,'render retention does not mutate company evidence');
  withStore(args.root,db=>db.transaction('fictional changed source',s=>{s.jobs['fictional-job-0'].task_summary='Later task';return s;}));
  assert.deepEqual((await progressReadAll(args,receipt.artifact)).envelope,recovered.envelope,'frozen render survives source changes and passage of time');
  const other=fixture(true);await assert.rejects(call('company_progress',{...other,action:'read',artifact:format,sha256:receipt.artifact.sha256},'codex'),/Missing|changed/);
  const newer=await call('company_progress',request,'codex');assert.notEqual(newer.artifact.sha256,receipt.artifact.sha256);
  await assert.rejects(call('company_progress',{...args,action:'read',artifact:format,sha256:receipt.artifact.sha256},'codex'),/changed/);
  const file=path.join(process.env.COMPANY_PLUGIN_DATA,'progress-renders',digest(JSON.stringify([fs.realpathSync(args.root),'codex'])),format+'.json');
  fs.appendFileSync(file,'tamper');await assert.rejects(call('company_progress',{...args,action:'read',artifact:format,sha256:newer.artifact.sha256},'codex'),/changed/);
  fs.rmSync(file);await assert.rejects(call('company_progress',{...args,action:'read',artifact:format,sha256:newer.artifact.sha256},'codex'),/Missing/);
  assert.ok(direct.artifact);
 }
});

test('compatibility stored classification pages preserve replacements, invalid proofs and future tree metadata exactly',async()=>{
 for(const normalized of [false,true]) {
  const args=fixture(normalized),metadata={source:{id:'classified',revision:1,sha256:'stored-not-validated'},disposition:'resolved',roles:['engineer'],scopes:['scope'],plan:{id:'plan',revision:1},review:{id:'review',revision:1},counterparts:[{id:'other',sha256:'old'}],partition_qualification:{tree:{children:['leaf']},proofs:[{id:'invalid-proof',sha256:'invalid'}]},source_instruction:noise.repeat(1000),at:'2026-01-01T00:00:00Z'};
  withStore(args.root,db=>db.transaction('fictional stored metadata',s=>{s.context_classifications={classified:metadata};for(let i=0;i<12;i++)s.context_classifications['tree:'+i]={...metadata,disposition:'represented-by',counterparts:[{id:'leaf-'+i}]};return s;}));
  const first=await call('company_context',{...args,action:'inspect',collection:'context_classifications',limit:1},'codex');checkReply(first);assert.equal(first.items[0].stored_metadata,true);assert.match(first.items[0].current_applicability,/Not validated/);assert.deepEqual(await publicReadAll(args,first.items[0].source),metadata);
  assert.deepEqual(stdio([['company_context',{...args,action:'inspect',collection:'context_classifications',limit:1}]]),[first]);
  let count=first.returned,cursor=first.next_cursor;while(cursor){const p=await call('company_context',{...args,action:'inspect',collection:'context_classifications',cursor},'codex');checkReply(p);count+=p.returned;cursor=p.next_cursor;}assert.equal(count,13);
  const sources=await call('company_context',{...args,action:'inspect',collection:'sources',limit:100},'codex');
  let page=sources,index=page.items.find(i=>i.source.id==='@public:pinned:context_classifications');while(!index&&page.next_cursor){page=await call('company_context',{...args,action:'inspect',collection:'sources',cursor:page.next_cursor,limit:100},'codex');index=page.items.find(i=>i.source.id==='@public:pinned:context_classifications');}assert.ok(index);assert.deepEqual((await publicReadAll(args,index.source)).classified,metadata);
  withStore(args.root,db=>db.transaction('fictional replacement',s=>{s.context_classifications.classified={...metadata,disposition:'current',review:{id:'replacement-review'}};return s;}));
  await assert.rejects(call('company_context',{...args,action:'read',id:first.items[0].source.id,sha256:first.items[0].source.sha256},'codex'),/changed/);
  const replacement=await call('company_context',{...args,action:'inspect',collection:'context_classifications',limit:1},'codex');assert.equal((await publicReadAll(args,replacement.items[0].source)).review.id,'replacement-review');
 }
});

test('compatibility fictional doctor catalogs retain provider advertised choices and exact continuation over public call and stdio',async()=>{
 const directIdentity={identity_basis:'LEGACY_UNQUALIFIED',context_active:false,host_supported:false,host_matches:false,metadata_supplied:false,metadata_object:false,identity_fields_data:false,observed:false,root:false,selector_observed:false,selector_matches:false,authority_granted:false,native_qualification:false};
 // Stdio establishes a request scope even when it supplies no identity metadata.
 // Its observations differ from a direct call, without granting authority.
 const stdioDoctor=value=>({...value,caller_identity:{...directIdentity,context_active:true,host_supported:true,host_matches:true}});
 const bin=fs.mkdtempSync(path.join(base,'fake-bin-')),executable=path.join(bin,'codex');
 const models=Array.from({length:60},(_,i)=>({model:'fictional-model-'+i,displayName:'Fictional model '+i,description:'Fictional advertised metadata. '.repeat(16),supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'high'}],defaultReasoningEffort:'high',isDefault:i===3,serviceTiers:[{id:'fictional-tier',name:'Fictional',description:'Only advertised, not enabled'}],defaultServiceTier:'fictional-tier',additionalSpeedTiers:['fictional-fast']}));
 fs.writeFileSync(executable,'#!'+process.execPath+'\n'+String.raw`
const args=process.argv.slice(2);
if(args.includes('--version'))console.log('fictional-codex 1.0');
else if(args.includes('--help'))console.log('--ignore-user-config --json --sandbox --model --config');
else if(args[0]==='login')process.exit(0);
else if(args[0]==='app-server'){
 const rl=require('node:readline').createInterface({input:process.stdin});
 rl.on('line',line=>{const q=JSON.parse(line);const result=q.method==='initialize'?{}:q.method==='model/list'?{data:MODELS,nextCursor:null}:undefined;if(result)console.log(JSON.stringify({id:q.id,result}));});
}else process.exit(2);
`.replace('MODELS',JSON.stringify(models)),{mode:0o700});
 const oldPath=process.env.PATH;process.env.PATH=bin;
 try {
  const {modelCatalog}=await import('../plugins/soloco/runtime/adapters.mjs'),catalog=modelCatalog('codex',{refresh:true});assert.equal(catalog.supported,true);assert.equal(catalog.models.length,60);assert.ok(size(JSON.stringify(catalog))>39000);
  const doctor=await call('company_doctor',{},'codex');checkReply(doctor);assert.deepEqual(doctor.caller_identity,directIdentity);assert.equal(doctor.models.supported,true);assert.equal(doctor.models.models.length,60);assert.equal(doctor.models.window.complete,true);assert.equal(doctor.models.source,'host_catalog');assert.deepEqual(doctor.models.observability,catalog.observability);assert.deepEqual(doctor.models.speed_support,catalog.speed_support);
  const compact=model=>{const {name,description,serviceTiers,...v}=model;return {...v,serviceTiers:serviceTiers.map(({name,description,...tier})=>tier)};};
  assert.deepEqual(doctor.models.models,catalog.models.map(compact));assert.deepEqual(stdio([['company_doctor',{}]])[0],stdioDoctor(doctor));
  let page=await call('company_doctor',{limit:7},'codex'),all=[...page.models.models],requests=[['company_doctor',{limit:7}]],expected=[page];
  while(page.models.window.next_cursor){const a={cursor:page.models.window.next_cursor,limit:7};page=await call('company_doctor',a,'codex');checkReply(page);assert.deepEqual(page.caller_identity,directIdentity);assert.equal(page.models.window.offset,all.length);all.push(...page.models.models);requests.push(['company_doctor',a]);expected.push(page);}assert.deepEqual(all,doctor.models.models);assert.deepEqual(stdio(requests),expected.map(stdioDoctor));
  const changed={...doctor,models:{...catalog,models:catalog.models.slice(1)}};
  assert.throws(()=>doctorView(changed,{cursor:expected[0].models.window.next_cursor,limit:7}),/Stale|invalid/);
  // Bounded valid fields can also exceed the compact budget; real cursor pages still work.
  const huge={...doctor,models:{...catalog,models:catalog.models.map(m=>({...m,serviceTiers:Array.from({length:16},(_,i)=>({id:'fictional-tier-'+i+'x'.repeat(100)})),additionalSpeedTiers:Array.from({length:16},(_,i)=>'fictional-fast-'+i+'x'.repeat(100))}))}};
  page=doctorView(huge);let ids=page.models.models.map(m=>m.id);assert.equal(page.models.window.complete,false);while(page.models.window.next_cursor){page=doctorView(huge,{cursor:page.models.window.next_cursor});checkReply(page);ids.push(...page.models.models.map(m=>m.id));}assert.deepEqual(ids,huge.models.models.map(m=>m.id));
 }finally{process.env.PATH=oldPath;}
});


test('compatibility current exact sources fail closed for second writers, missing originals, hash mismatch and isolated roots',async()=>{
 const args=fixture(true);
 withStore(args.root,db=>db.transaction('fictional exact source',s=>{s.records.large={id:'large',revision:1,content:noise.repeat(10000)};return s;}));
 const page=await call('company_context',{...args,action:'inspect',collection:'records'},'codex'),ref=page.items[0].source;
 const read=()=>call('company_context',{...args,action:'read',id:ref.id,sha256:ref.sha256,length:8000},'codex');
 checkReply(await read());
 const other=fixture(true);await assert.rejects(call('company_context',{...other,action:'read',id:ref.id,sha256:ref.sha256},'codex'),/Missing|changed/);
 const writer=new Store(args.root);
 try {
  writer.transaction('fictional second writer',s=>{s.records.large.content='Changed original';return s;});
  await assert.rejects(read(),/changed/);
  writer.transaction('fictional restore original',s=>{s.records.large={id:'large',revision:1,content:noise.repeat(10000)};return s;});
  checkReply(await read());
  const row=writer.db.prepare("SELECT sha256 FROM state_entries WHERE family='records' AND key='large'").get();
  writer.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run('{"tampered":true}',row.sha256);
  await assert.rejects(read(),/hash mismatch/);
  writer.db.exec('PRAGMA foreign_keys=OFF'); // Simulate an out-of-band missing original, bypassing the normal writer fence.
  writer.db.prepare('DELETE FROM immutable_values WHERE sha256=?').run(row.sha256);
  await assert.rejects(read(),/hash mismatch/);
 }finally{writer.close();}
});
