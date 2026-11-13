// SYNTHETIC source checks. No real company, native model or external execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import net from 'node:net';
import timers from 'node:timers';
import {syncBuiltinESMExports} from 'node:module';

async function withoutExternal(fn,{workerMonitor=false}={}){
  const restore=[],attempts=[];
  const deny=(object,key)=>{const old=object[key];object[key]=()=>{attempts.push(key);throw Error('Unexpected external execution: '+key);};restore.push(()=>{object[key]=old;});};
  for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])deny(cp,key);
  for(const key of ['connect','createConnection','createServer'])deny(net,key);
  deny(net.Socket.prototype,'connect');deny(net.Server.prototype,'listen');deny(globalThis,'fetch');
  const monitors=new Set();
  if(workerMonitor){const interval=globalThis.setInterval,clear=globalThis.clearInterval;globalThis.setInterval=(fn,delay,...args)=>{assert.equal(delay,100,'Only the source worker eligibility monitor is permitted');const timer=interval(fn,delay,...args);monitors.add(timer);return timer;};globalThis.clearInterval=timer=>{monitors.delete(timer);return clear(timer);};restore.push(()=>{globalThis.setInterval=interval;globalThis.clearInterval=clear;});deny(timers,'setInterval');}
  else{deny(globalThis,'setInterval');deny(timers,'setInterval');}
  syncBuiltinESMExports();
  try{return await fn();}finally{const leaked=monitors.size;for(const timer of monitors)clearInterval(timer);for(const undo of restore.reverse())undo();syncBuiltinESMExports();assert.equal(leaked,0,'Every worker monitor must close before returning');assert.deepEqual(attempts,[],'No import or source check may attempt external execution');}
}
const [store,tasks,context,authority,current,notices,presentation,assignment,main,engine,worker,timeout,snapshot,scoped,legacy]=await withoutExternal(()=>Promise.all([
  import('../plugins/soloco/runtime/store.mjs'),import('../plugins/soloco/runtime/tasks.mjs'),import('../plugins/soloco/runtime/task-context.mjs'),
  import('../plugins/soloco/runtime/task-runtime-authority.mjs'),import('../plugins/soloco/runtime/current-state.mjs'),import('../plugins/soloco/runtime/notice-sources.mjs'),
  import('../plugins/soloco/runtime/public-response.mjs'),import('../plugins/soloco/runtime/context.mjs'),import('../plugins/soloco/runtime/main.mjs'),
  import('../plugins/soloco/runtime/engine.mjs'),import('../plugins/soloco/runtime/worker.mjs'),import('../plugins/soloco/runtime/timeout.mjs'),import('../plugins/soloco/runtime/snapshot.mjs'),import('../plugins/soloco/runtime/scoped-context.mjs'),import('../plugins/soloco/runtime/legacy-operating.mjs')
]));
const {Store,VERSION,SCHEMA,digest,teamHash}=store;
const {taskAssignmentContext,taskContextMatches,taskDefinitionBinding}=context;
const owner={host:'codex',session_id:'fictional-notice-owner',epoch:1};
const args={session_id:owner.session_id,epoch:1,source_instruction:'FICTIONAL source preparation only. Preserve UNKNOWN, zero allowance and no retry.'};
const v2='async-task-context-v2',sha=value=>digest(JSON.stringify(value)),bytes=value=>Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value));
const projected=notice=>Object.fromEntries(Object.entries(notice).filter(([key])=>!['deliveries','seen_at'].includes(key)));
const noticeRef=notice=>({id:'notice:'+notice.id,revision:notice.revision??null,sha256:sha(projected(notice))});
function fixture(protocol){
  if(arguments.length===0)protocol=v2;
  const charter={name:'Fictional Engineer',mission:'Read complete source conditions',inputs:'Exact sources',outputs:'Assessment',block:'Missing evidence',success:'Conditions preserved',failure:'Omission',phase:'Preparation'};
  const s={schema:SCHEMA,id:'fictional-notice-company',name:'Fictional notice preservation',idea:'Preserve notice meaning',runtime_version:VERSION,plugin_version:VERSION,phase:'Frame',mode:'preparation',paused:false,owner:{...owner},
    governance:'Preparation only; no execution, renewed allowance or invented closure.',cos_instructions:'Retain every UNKNOWN and negative condition.',roles:{engineer:charter,qa:{...charter,name:'Independent fictional QA'}},records:{},jobs:{},sessions:{},notices:[],messages:[],created_at:'2026-11-12T00:00:00.000Z'};
  s.governance_sha256=digest(s.governance);s.team_sha256=teamHash(s);
  s.records.input={id:'input',revision:1,kind:'artifact',content:'Exact fictional evidence.'};
  s.records.rule={id:'rule',revision:1,kind:'decision',content:'Uncertain effects stay UNKNOWN; remaining allowance ZERO; never retry automatically.'};
  s.notices=[{id:'notice-one',kind:'must_know',summary:'NEGATIVE UNKNOWN: original timeout remains failed; allowance ZERO; no retry.',reference:'original-job',author_role:'qa',author_instance:'historical-independent-qa',created_at:'2026-11-11T00:00:00.000Z',deliveries:[],seen_at:null,seen:'SEMANTIC_SEEN_FIELD',resolution:null,unknown:{seen_at:'Nested qualifier remains semantic'}},
    {id:'notice-resolved',kind:'decision_required',summary:'Historical failure remains failed after disposition.',reference:'older-job',resolution:{reason:'Owner disposition only; does not prove physical closure.'},deliveries:[],seen_at:null}];
  authority.setRuntimeControl(s,{...args,action:'start'},'codex');
  const record=tasks.submitTask(s,{...args,operation_id:'initial',spec:{role:'engineer',task:'Assess the exact fictional source.',acceptance:'Preserve negative and UNKNOWN meaning.',expected_deliverable:'A bounded fictional assessment',input_ids:['input'],context_scope:'auth',model_selection:{mode:'default',reason:'Source checks, no provider.'},...(protocol===undefined?{}:{context_protocol:protocol})}},'codex');
  return {s,id:record.id};
}
function job(s,id){
  const spec=s.records[id].runtime_task.spec,control=authority.runtimeControlBinding(s);
  return {id:'fictional-assignment',instance_id:'fictional-engineer',host:owner.host,epoch:owner.epoch,role:spec.role,task:spec.task,context_format:tasks.taskContextFormat(spec),context_scope:spec.context_scope,
    requester:{role:'runtime',instance_id:control.instance_id,task_id:id,owner_epoch:owner.epoch},runtime_task:taskDefinitionBinding(s.records[id]),inputs:spec.input_ids.map(key=>({id:key,revision:s.records[key].revision??null})),review_of:null,coordination:null,model_selection:spec.model_selection,supplemental_sources:[]};
}
function packet(s,id){return JSON.parse(taskAssignmentContext(s,job(s,id)).text);}
function retainedOrHeld(s,id,expected){
  try{const value=packet(s,id);for(const original of expected)assert(value.notices.some(n=>JSON.stringify(n)===JSON.stringify(projected(original))),'Unqualified notice must remain complete raw evidence');return value;}
  catch(error){if(error instanceof assert.AssertionError)throw error;assert.match(error.message,/^Task context Held: |hold|changed|missing|ambiguous|collision|duplicate|negative|invalid/i);return null;}
}

test('typed source identity survives reorder and omits only the two mechanical top-level fields',()=>withoutExternal(()=>{
  const {s}=fixture(),original=structuredClone(s.notices[0]),id='notice:'+original.id,expected=projected(original);
  assert.deepEqual(notices.projectNotice(original),expected);assert.deepEqual(notices.noticeSource(s,id),expected);assert.deepEqual(current.contextSource(s,id),expected);
  const before=sha(current.contextSource(s,id));s.notices.reverse();s.notices.unshift({id:'inserted',kind:'must_know',summary:'New raw global constraint.'});
  assert.equal(sha(current.contextSource(s,id)),before);assert.deepEqual(notices.noticeSourceEntries(s).find(entry=>entry.id===id).original,original);
  const currentNotice=s.notices.find(n=>n.id===original.id);currentNotice.deliveries.push({chat:'fictional-delivery'});currentNotice.seen_at='2026-11-12T01:00:00.000Z';assert.equal(sha(current.contextSource(s,id)),before);
  for(const mutate of [n=>n.seen='changed',n=>n.summary+=' changed',n=>n.reference='changed',n=>n.kind='decision_required',n=>n.author_instance='changed',n=>n.resolution={reason:'changed'},n=>n.unknown.seen_at='changed',n=>n.new_rule='UNKNOWN new qualifier']){
    const copy=structuredClone(s);mutate(copy.notices.find(n=>n.id===original.id));assert.notEqual(sha(current.contextSource(copy,id)),before);
  }
}));

test('unqualified v2 retains unresolved and resolved notice meaning without changing canonical data',()=>withoutExternal(()=>{
  const {s,id}=fixture(),before=JSON.stringify(s),value=packet(s,id);
  assert.equal(value.protocol,v2);assert.deepEqual(value.notices,s.notices.map(projected));assert.deepEqual(value.notice_representations,[]);
  assert(value.notices[0].summary.includes('UNKNOWN'));assert(value.notices[0].summary.includes('ZERO'));assert(value.notices[0].summary.includes('no retry'));
  assert.deepEqual(value.notices[1].resolution,s.notices[1].resolution);assert.equal(JSON.stringify(s),before);
}));

test('new, copied and invalidly classified notices cannot disappear behind an artifact or a stale flag',()=>withoutExternal(()=>{
  for(const mode of ['new','copied','fake-proof','duplicate','collision']){
    const {s,id}=fixture();
    if(mode==='new')s.notices.push({id:'new-notice',kind:'must_know',summary:'New UNKNOWN global no-retry condition.'});
    if(mode==='copied')s.records.copy={id:'copy',revision:1,kind:'artifact',content:JSON.stringify(projected(s.notices[0])),context_obligations:{version:1,scope:'auth'}};
    if(mode==='fake-proof')s.context_classifications={[noticeRef(s.notices[0]).id]:{source:noticeRef(s.notices[0]),disposition:'represented',plan:{id:'missing-plan',revision:1,sha256:'0'.repeat(64)},review:{id:'missing-review',revision:1,sha256:'0'.repeat(64)}}};
    if(mode==='duplicate')s.notices.push({...s.notices[0],summary:'Distinct required condition under a duplicate ID.'});
    if(mode==='collision'){const key=noticeRef(s.notices[0]).id;s.records[key]={id:key,revision:1,kind:'artifact',content:'A record cannot stand in for the canonical notice.'};}
    const before=JSON.stringify(s);retainedOrHeld(s,id,s.notices);assert.equal(JSON.stringify(s),before);
  }
}));

// This literal packet is the independently specified pre-change format-7
// contract for this small fixture; no current renderer output supplies its body.
function expectedV1(s,j,recordIds=['input','rule']){
  const record=s.records[j.runtime_task.id],t=record.runtime_task,records=recordIds.map(id=>({source:{id,revision:s.records[id].revision,sha256:sha(s.records[id])},value:s.records[id]}));
  const source=(id,value)=>({id,revision:null,sha256:sha(value)}),c=s.records['async-runtime-control'].runtime_control;
  return {protocol:'async-task-context-v1',controls:{company_id:s.id,name:s.name,idea:s.idea,owner:s.owner,paused:s.paused,mode:s.mode,phase:s.phase,team_sha256:s.team_sha256,governance_source:source('@public:pinned:governance',s.governance),cos_instructions_source:source('@public:pinned:cos_instructions',s.cos_instructions),roles_source:source('@public:pinned:roles',s.roles)},
    runtime:{version:1,enabled:c.enabled,instance_id:c.instance_id,owner:c.owner,team_sha256:c.team_sha256,source_instruction:c.source_instruction,control_revision:c.control_revision},governance:s.governance,charter:s.roles.engineer,
    task:{source:{id:record.id,definition_revision:t.definition_revision,definition_sha256:t.definition_sha256},owner:t.owner,spec:t.spec},peer_targets:[],assignment:{job_id:j.id,instance_id:j.instance_id,requester:j.requester,role:j.role,task:j.task,context_scope:t.spec.context_scope,review_of:null,coordination:null,model_selection:j.model_selection},
    records,producer_tasks:[],producer_evidence:[],mandatory_execution_evidence:[],notices:s.notices.map(projected),messages:[],coverage:{contract:'conservative-current-records-v1',complete_for_declared_inputs:true,scope:t.spec.context_scope,source_membership_sha256:sha({records:records.map(r=>r.source),execution:[]}),historical_meaning:'Original history remains retained. This task packet grants neither semantic classification of omitted history nor acceptance or permission.'},
    supplemental_evidence:{protocol:'record-reads-v1',available:true,sources:[],lookup:'company_context inspect/read',rule:'Exact known source IDs, revisions and hashes only. Missing evidence requires a bounded read or a Held result; native conversation memory is not current authority.'}};
}
test('omitted task version retains literal legacy packet bytes and hash; formats cannot be silently exchanged',()=>withoutExternal(()=>{
  const {s,id}=fixture(undefined),j=job(s,id),spec=s.records[id].runtime_task.spec;
  assert.equal(Object.hasOwn(spec,'context_protocol'),false);assert.equal(j.context_format,7);assert.equal(tasks.PRESERVED_NOTICE_TASK_CONTEXT,v2);
  const expected=JSON.stringify(expectedV1(s,j)),actual=taskAssignmentContext(s,j);assert.equal(actual.text,expected);assert.equal(actual.hash,digest(expected));
  assert.equal(taskContextMatches(s,j,actual.hash),true);assert.equal(JSON.parse(actual.text).notice_representations,undefined);
  assert.throws(()=>taskAssignmentContext(s,{...j,context_format:8}),/format|protocol|task/i);
  const modern=fixture(),modernJob=job(modern.s,modern.id);assert.equal(modernJob.context_format,8);assert.throws(()=>taskAssignmentContext(modern.s,{...modernJob,context_format:7}),/format|protocol|task/i);
  for(const protocol of ['async-task-context-v1','async-task-context-v3','',null])assert.throws(()=>fixture(protocol),/protocol/i);
}));

test('changed notice meaning invalidates v2 currentness while mechanical delivery does not',()=>withoutExternal(()=>{
  const {s,id}=fixture(),j=job(s,id),before=taskAssignmentContext(s,j);
  s.notices[0].deliveries.push({at:'fictional'});s.notices[0].seen_at='2026-11-12T02:00:00.000Z';assert.equal(taskContextMatches(s,j,before.hash),true);
  for(const mutate of [n=>n.summary+=' Changed condition.',n=>n.resolution={reason:'Owner disposition'},n=>n.seen='Changed semantic field',n=>n.unknown.seen_at='Changed nested condition']){const copy=structuredClone(s);mutate(copy.notices[0]);assert.equal(taskContextMatches(copy,j,before.hash),false);}
  s.notices.push({id:'late',kind:'must_know',summary:'A new unknown condition.'});assert.equal(taskContextMatches(s,j,before.hash),false);
}));

test('format8 keeps the actual 64KiB cap even when a caller requests a larger context budget',()=>withoutExternal(()=>{
  for(const protocol of [undefined,v2]){
    const {s,id}=fixture(protocol),j=job(s,id);s.notices[0].summary='UNKNOWN: no retry; exhausted allowance. '.repeat(2200);
    assert.equal(assignment.contextBudgetForJob(s,j),65536);assert.throws(()=>taskAssignmentContext(s,j),error=>error.code==='CONTEXT_CAPACITY'&&/nothing was truncated/.test(error.message));
    if(protocol===v2)assert.throws(()=>taskAssignmentContext(s,j,{budget:200000}),error=>error.code==='CONTEXT_CAPACITY');
    else assert(taskAssignmentContext(s,j,{budget:200000}).context_bytes>65536,'Legacy diagnostic-only budget behavior must remain unchanged');
  }
}));

function storedFixture(t,protocol){
  const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-notice-source-'))),root=path.join(temp,'attached'),data=path.join(temp,'plugin-data');fs.mkdirSync(root);fs.mkdirSync(data);
  const previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=data;
  const {s,id}=arguments.length>1?fixture(protocol):fixture(),db=new Store(root,true);db.transaction('fictional.notice.setup',()=>s);db.migrate();
  const dir=path.join(data,'bindings');fs.mkdirSync(dir);const binding=path.join(dir,digest(JSON.stringify([root,'codex',owner.session_id]))+'.json');fs.writeFileSync(binding,JSON.stringify({root,host:'codex',session_id:owner.session_id}));
  t.after(()=>{db.close();if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(temp,{recursive:true,force:true});});
  return {root,db,id,binding};
}
async function readAll(f,source,length=127){
  let text='',offset=0;
  do{const part=await main.call('company_context',{root:f.root,session_id:owner.session_id,action:'read',id:source.id,sha256:source.sha256,offset,length},'codex');assert.equal(part.offset,offset);assert(part.length>0);text+=part.text;offset=part.next_offset;assert.equal(part.complete,offset===null);assert(bytes(part)<=30000);}while(offset!==null);
  assert.equal(digest(text),source.sha256);return JSON.parse(text);
}
test('public normalized range reads keep typed semantic and raw positional notices distinct',async t=>{
  const f=storedFixture(t);f.db.transaction('fictional.notice.unicode',s=>{s.notices[0].summary+=' é😀 "quoted" \\ boundary\n'.repeat(80);return s;});
  await withoutExternal(async()=>{
    const original=f.db.read().notices[0],semantic=noticeRef(original),raw={id:'@public:notices:0',sha256:sha(original)};
    assert.deepEqual(await readAll(f,semantic),projected(original));assert.deepEqual(await readAll(f,raw),original);
    f.db.transaction('fictional.notice.delivery',s=>{s.notices[0].deliveries.push({chat:'fictional'});s.notices[0].seen_at='2026-11-12T03:00:00.000Z';return s;});
    assert.deepEqual(await readAll(f,semantic),projected(original));await assert.rejects(readAll(f,raw),/changed|missing/i);
    f.db.transaction('fictional.notice.reorder',s=>{s.notices.reverse();return s;});assert.deepEqual(await readAll(f,semantic),projected(original));
    f.db.transaction('fictional.notice.semantic-change',s=>{s.notices.find(n=>n.id===original.id).summary+=' Changed uncertainty.';return s;});await assert.rejects(readAll(f,semantic),/changed|missing/i);
  });
});

test('actual source catalog retains bounded maximum-ID JSON-RPC across task version exposure',()=>withoutExternal(()=>{
  assert.equal(presentation.REPLY_MAX_BYTES,65536);const tool=main.toolList.find(t=>t.name==='company_tasks');assert.deepEqual(tool.inputSchema.properties.spec.properties.context_protocol.enum,[v2]);
  const ids=['x'.repeat(256),'\\'.repeat(128),'"'.repeat(128),'\0'.repeat(42)+'xxxx','é'.repeat(128),'😀'.repeat(64)];
  for(const id of ids)assert.equal(bytes(JSON.stringify(id)),258);
  for(const ceiling of [100000,1000000])for(const id of ids){const tools=structuredClone(main.toolList);tools.find(t=>t.name==='company_develop').inputSchema.properties.max_bytes.maximum=ceiling;const wire=presentation.rpcReply(id,{tools})+'\n',decoded=JSON.parse(wire);assert(bytes(wire)<=65536);assert.equal(decoded.id,id);assert.deepEqual(decoded.result,{tools});}
}));

const sourceCall=(f,input)=>main.call('company_context',{root:f.root,...args,...input},'codex');
// These callbacks judge only our declared fictional language and exercise the
// actual source worker/proof path. Their synthetic IDs are not native evidence.
function scriptedJudgment(p,meaning){
  const shape=p.response_shape,reason='SYNTHETIC complete fixture preservation; no native QA or execution permission.';
  const r={protocol:scoped.SCOPED_PROTOCOL,phase:p.phase,extraction_identity:p.extraction_identity,target_sha256:shape.target_sha256,verdict:'Pass',reason,permitted_action:p.phase==='integration'?'apply_scoped_context':'continue',preservation_complete:true,interfaces_complete:true,authority_checked:true,scope_complete:true,blockers:[]};
  if(p.phase==='extract'){
    const b=p.reviewed_unit_bundle,fragment=b.primary.fragment;
    Object.assign(r,{unit_id:b.primary.id,unit_sha256:sha(b.primary),reviewed_unit_bundle_sha256:sha(b),items:fragment.text.includes('NEGATIVE UNKNOWN')?[{id:'notice-meaning',kind:'negative_finding',text:meaning,scope:'*',provenance:b.provenance_sha256,interfaces:[]}]:[]});
  }else if(p.phase==='applicability'){
    const items=p.extractions.flatMap(e=>e.items.map(item=>({key:e.review.id+'/'+item.id,item}))).filter(item=>p.item_keys.includes(item.key));
    r.summary='All complete fictional negative, UNKNOWN, resolution and zero-allowance conditions remain global; no retry.';
    r.mappings=items.map(({key,item})=>({item:key,status:'represented',homes:p.homes.filter(h=>h.value.content.includes(item.text)).map(h=>h.source.id),reason:'Complete exact fictional notice view retained, no new permission.'}));
    assert(r.mappings.every(mapping=>mapping.homes.length));r.interfaces=[];r.reviewed_interfaces=p.interface_keys;
  }else{r.summary='All independently reviewed fixture conditions remain global and UNKNOWN; no authority.';r.domain_review_ids=shape.domain_review_ids;r.interface_review_ids=shape.interface_review_ids;r.unreviewed_interfaces=[];}
  return {content:reason,messages:[],notices:[],review:{verdict:r.verdict,reason,permitted_action:r.permitted_action},qualification_result:r};
}
async function scriptedReview(f,planId,input,meaning){
  const target=await sourceCall(f,{action:'target',plan_id:planId,...input});assert.equal(target.reused,undefined);
  const queued=engine.dispatch({root:f.root,...args,role:'qa',review_of:target.id,task:'SYNTHETIC bounded notice preservation review.'},'codex',{check:()=>({available:true,authenticated:true,version:'synthetic-source-adapter'}),launch:()=>({on(){},unref(){}})});
  await worker.work(f.root,queued.id,async(_host,_native,prompt,_dir,ceiling,_selection,options)=>{
    options.onSpawn(timeout.executionTiming(Date.now(),{timeout_ms:ceiling}));
    return {native_id:'synthetic-independent-'+queued.id,text:JSON.stringify(scriptedJudgment(JSON.parse(prompt),meaning))};
  });
  const s=f.db.read(),result=s.jobs[queued.id];assert.equal(result.status,'completed',result.error);assert.equal(result.coordination_release.termination_confirmed,true);
  return {target,job:result,record:s.records[result.artifact_id]};
}
async function qualifyFictionalSource(f,sourceId){
  const before=f.db.read(),meaning=JSON.stringify(projected(before.notices[0]));
  f.db.transaction('fictional.notice.home',s=>{s.records['notice-home']={id:'notice-home',revision:1,kind:'artifact',content:meaning,context_obligations:{version:1,scope:'*'}};return s;});
  const plan=await sourceCall(f,{action:'plan',protocol:scoped.SCOPED_PROTOCOL,source_id:sourceId}),extractions=[];let offset=0;
  do{const page=await sourceCall(f,{action:'inspect',plan_id:plan.id,offset,limit:16});for(const unit of page.units)extractions.push(await scriptedReview(f,plan.id,{phase:'extract',unit_id:unit.id},meaning));offset=page.next_offset;}while(offset!==null);
  assert(extractions.some(result=>result.record.qualification_result.items.some(item=>item.kind==='negative_finding'&&item.text===meaning)),'The scripted source path must actually extract the complete negative fixture meaning');
  const domain=await scriptedReview(f,plan.id,{phase:'applicability',extraction_review_ids:extractions.map(value=>value.record.id),counterpart_ids:['notice-home'],context_scope:'*'},meaning);
  const integrated=await scriptedReview(f,plan.id,{phase:'integration',domain_review_ids:[domain.record.id],counterpart_ids:['notice-home']},meaning);
  const applied=await sourceCall(f,{action:'apply',integration_review_id:integrated.record.id});assert.equal(applied.applied,true);
  return {plan,domain,integrated,extractions};
}
test('canonical scripted scoped preservation substitutes only the original notice and full global home',async t=>{
  const f=storedFixture(t),canonical=JSON.stringify(f.db.read().notices);
  await withoutExternal(async()=>{
    const accepted=await qualifyFictionalSource(f,'notice:notice-one'),s=f.db.read(),value=packet(s,f.id),representation=value.notice_representations[0];
    const frozen=snapshot.resolveSnapshot(s,s.records[accepted.domain.target.id].scoped_context_target.global_snapshot);assert.deepEqual(frozen.notices,s.notices.map(projected),'Fresh typed-notice QA receives every semantic field, including seen');
    assert.equal(value.notice_representations.length,1);assert.deepEqual(representation.source,noticeRef(s.notices[0]));assert.equal(representation.occurrence.notice_id,'notice-one');
    assert(representation.homes.some(home=>home.id==='notice-home'));assert(value.records.some(entry=>entry.source.id==='notice-home'&&entry.value.content===JSON.stringify(projected(s.notices[0]))));
    assert.deepEqual(value.notices,[projected(s.notices[1])]);assert.equal(JSON.stringify(s.notices),canonical);assert.equal(s.notices[0].resolution,null);
    const legacy=tasks.submitTask(s,{...args,operation_id:'legacy-after-preservation',spec:{role:'engineer',task:'Read legacy notice context.',acceptance:'Preserve raw notices.',expected_deliverable:'A fixture assessment',input_ids:['input']}},'codex');
    const legacyPacket=packet(s,legacy.id);assert.equal(legacyPacket.protocol,'async-task-context-v1');assert.deepEqual(legacyPacket.notices,s.notices.map(projected));assert.equal(legacyPacket.notice_representations,undefined);
    for(const mode of ['notice','home','proof','closure','native','negative']){
      const copy=snapshot.inheritSnapshots(s,structuredClone(s));
      if(mode==='notice')copy.notices[0].summary+=' A new UNKNOWN qualifier.';
      if(mode==='home')copy.records['notice-home'].content+=' A changed clearing condition.';
      if(mode==='proof')copy.context_classifications['notice:notice-one'].scoped_qualification.integration.sha256='0'.repeat(64);
      if(mode==='closure')copy.jobs[accepted.integrated.job.id].coordination_release.termination_confirmed=false;
      if(mode==='native')copy.jobs[accepted.integrated.job.id].native_id=owner.session_id;
      if(mode==='negative')copy.records['late-negative']={id:'late-negative',kind:'review',revision:1,status:'Submitted',review_of:{id:accepted.integrated.target.id,revision:1},review:{verdict:'Blocked',reason:'Retained later negative; no retry.'}};
      retainedOrHeld(copy,f.id,copy.notices);
    }
  },{workerMonitor:true});
});
test('independently qualified copied artifact never qualifies the canonical notice source',async t=>{
  const f=storedFixture(t);f.db.transaction('fictional.notice.copy',s=>{s.records.copy={id:'copy',revision:1,kind:'artifact',content:JSON.stringify(projected(s.notices[0]))};return s;});
  await withoutExternal(async()=>{
    const accepted=await qualifyFictionalSource(f,'copy'),s=f.db.read(),value=packet(s,f.id);
    const frozen=snapshot.resolveSnapshot(s,s.records[accepted.domain.target.id].scoped_context_target.global_snapshot),legacy=s.notices.map(n=>Object.fromEntries(Object.entries(n).filter(([key])=>!['deliveries','seen','seen_at'].includes(key))));assert.deepEqual(frozen.notices,legacy,'Existing non-notice scoped proof derivation retains its original notice snapshot');
    assert(s.context_classifications.copy);assert.equal(s.context_classifications['notice:notice-one'],undefined);assert.deepEqual(value.notice_representations,[]);assert.deepEqual(value.notices,s.notices.map(projected));
  },{workerMonitor:true});
});

test('immutable runtime tasks cannot escape validation through legacy or unknown dispatch formats',()=>withoutExternal(()=>{
  for(const protocol of [undefined,v2]){
    const {s,id}=fixture(protocol),j=job(s,id),accepted=assignment.assignmentContext(s,j);
    for(const format of [3,5,6,999]){
      const wrong={...j,context_format:format,status:'queued'},before=JSON.stringify(s);
      assert.equal(assignment.contextBudgetForJob(s,wrong),65536,'Runtime task markers cannot select the legacy larger budget');
      assert.throws(()=>assignment.assignmentContext(s,wrong),/task|format|protocol/i);assert.equal(assignment.contextMatches(s,wrong,accepted.hash),false);
      assert.throws(()=>tasks.bindTaskAttempt(s,s.records[id],wrong),/task|format|protocol/i);assert.equal(JSON.stringify(s),before,'Rejected format cannot bind an attempt');
    }
    const malformed={...j,context_format:3,runtime_task:null};assert.throws(()=>assignment.assignmentContext(s,malformed),/task|binding/i);assert.equal(assignment.contextMatches(s,malformed,accepted.hash),false);
  }
}));

test('legacy notice-prefix record precedence survives BOTH while explicit canonical notice access denies ambiguity',async t=>{
  const f=storedFixture(t,undefined),key='notice:legacy-only',original={id:key,revision:1,kind:'artifact',content:'LEGACY_RECORD: UNKNOWN; no retry; not a canonical notice.',seen:'A record field, not notice metadata.'};
  f.db.transaction('fictional.legacy-prefix-record',s=>{s.records[key]=original;tasks.amendTask(s,{...args,operation_id:'legacy-prefix-input',task_id:f.id,expected_definition_revision:1,spec:{...s.records[f.id].runtime_task.spec,input_ids:['input',key]}},'codex');return s;});
  await withoutExternal(async()=>{
    const s=f.db.read(),j=job(s,f.id),expected=JSON.stringify(expectedV1(s,j,['input',key,'rule'])),actual=taskAssignmentContext(s,j);
    assert.deepEqual(current.contextSource(s,key),original);assert.equal(actual.text,expected);assert.equal(actual.hash,digest(expected));assert.equal(taskContextMatches(s,j,actual.hash),true);
    assert.deepEqual(await readAll(f,{id:key,sha256:sha(original)}),original);
    const material=legacy.buildLegacyCoherentPlan(s),decoded=legacy.decodeLegacyCoherentPlan(material);assert.equal(Object.getPrototypeOf(decoded.state.records[key]),null,'Decoded object nodes retain the safe null prototype');assert.equal(JSON.stringify(decoded.state.records[key]),JSON.stringify(original));assert.equal(JSON.stringify(decoded.state.notices),JSON.stringify(s.notices));assert.equal(JSON.stringify(decoded.state),JSON.stringify(s),'The entire logical JSON state, field order and notice conditions survive the typed inverse');
    const plan=scoped.captureScopedPlan(s,{source_id:key}),capsule=snapshot.resolveSnapshot(s,plan.capsule);assert.deepEqual(plan.source,{id:key,revision:1,sha256:sha(original)});assert.deepEqual(snapshot.resolveSnapshot(s,capsule.original),original);
    f.db.transaction('fictional.prefix-and-notice',state=>{state.notices.push({id:'legacy-only',kind:'must_know',summary:'A real canonical notice now collides with the record.'});return state;});
    const ambiguous=f.db.read(),canonical=ambiguous.notices.find(n=>n.id==='legacy-only');
    assert.deepEqual(current.contextSource(ambiguous,key),original,'Legacy record lookup precedence cannot be reinterpreted');assert.deepEqual(await readAll(f,{id:key,sha256:sha(original)}),original);
    assert.throws(()=>notices.noticeSource(ambiguous,key),/ambiguous|colli/i);assert.throws(()=>scoped.captureScopedPlan(ambiguous,{source_id:key}),/ambiguous|colli/i);await assert.rejects(readAll(f,noticeRef(canonical)),/ambiguous|colli|changed|missing/i);
    const modern=tasks.submitTask(ambiguous,{...args,operation_id:'ambiguous-modern',spec:{role:'engineer',task:'Preserve ambiguous source.',acceptance:'Never omit either condition.',expected_deliverable:'A held or complete raw fixture result',input_ids:['input'],context_protocol:v2}},'codex');retainedOrHeld(ambiguous,modern.id,ambiguous.notices);
  });
});

test('a genuine old record-prefix proof cannot qualify a later matching canonical notice',async t=>{
  const f=storedFixture(t),key='notice:legacy-proved';f.db.transaction('fictional.old-prefix-proof-source',s=>{s.records[key]={id:key,revision:1,kind:'artifact',content:JSON.stringify(projected(s.notices[0]))};return s;});
  await withoutExternal(async()=>{
    const accepted=await qualifyFictionalSource(f,key),original=f.db.read().records[key];assert(f.db.read().context_classifications[key]);
    f.db.transaction('fictional.old-proof-new-notice',s=>{s.notices.push({id:'legacy-proved',kind:'must_know',summary:'New UNKNOWN restriction; the old record proof grants no notice exclusion.'});return s;});
    const s=f.db.read(),canonical=s.notices.find(n=>n.id==='legacy-proved');assert.deepEqual(current.contextSource(s,key),original);assert.deepEqual(await readAll(f,{id:key,sha256:sha(original)}),original);
    const oldPlan=scoped.scopedPlanView(s,{plan_id:accepted.plan.id});assert.deepEqual(oldPlan.source,{id:key,revision:1,sha256:sha(original)});assert.deepEqual(snapshot.resolveSnapshot(s,oldPlan.original),original);
    assert.throws(()=>notices.noticeSource(s,key),/ambiguous|colli/i);assert.throws(()=>scoped.captureScopedPlan(s,{source_id:key}),/ambiguous|colli/i);await assert.rejects(readAll(f,noticeRef(canonical)),/ambiguous|colli|changed|missing/i);
    const result=retainedOrHeld(s,f.id,s.notices);if(result)assert(!result.notice_representations.some(entry=>entry.source.id===key),'Record proof cannot be borrowed for the new notice');
  },{workerMonitor:true});
});
