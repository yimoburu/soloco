// SYNTHETIC source checks only. No real company, model, compiler or native host.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import net from 'node:net';
import timers from 'node:timers';
import {syncBuiltinESMExports} from 'node:module';

async function withoutExternal(fn){
  const restore=[],attempts=[];
  const replace=(object,key)=>{const previous=object[key];object[key]=()=>{attempts.push(key);throw Error('Unexpected external execution: '+key);};restore.push(()=>{object[key]=previous;});};
  for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])replace(cp,key);
  for(const key of ['connect','createConnection','createServer'])replace(net,key);
  replace(net.Socket.prototype,'connect');replace(net.Server.prototype,'listen');
  replace(globalThis,'fetch');replace(globalThis,'setInterval');replace(timers,'setInterval');
  syncBuiltinESMExports();
  try{return await fn();}finally{for(const undo of restore.reverse())undo();syncBuiltinESMExports();assert.deepEqual(attempts,[],'Reads and imports must not attempt external execution or supervision');}
}

// Do not use engine.open/status/doctor: capability summaries can launch probes.
const [context,store,tasks,runtimeAuthority,index,runtime,main,presentation]=await withoutExternal(()=>Promise.all([
  import('../plugins/soloco/runtime/task-context.mjs'),import('../plugins/soloco/runtime/store.mjs'),
  import('../plugins/soloco/runtime/tasks.mjs'),import('../plugins/soloco/runtime/task-runtime-authority.mjs'),
  import('../plugins/soloco/runtime/task-index.mjs'),import('../plugins/soloco/runtime/task-runtime.mjs'),
  import('../plugins/soloco/runtime/main.mjs'),import('../plugins/soloco/runtime/public-response.mjs')
]));
const {taskCapacityContext,taskAssignmentContext,taskContextMatches,taskDefinitionBinding}=context;
const {Store,VERSION,SCHEMA,digest,teamHash}=store;
const {submitTask,amendTask,taskDefinitionHash}=tasks;
const {setRuntimeControl}=runtimeAuthority;
const args={session_id:'fictional-capacity-owner',epoch:1,source_instruction:'Fictional source-only preparation; no execution or retry.'};
const bytes=value=>Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value));
const ref=value=>({id:value.id,revision:value.revision??null,sha256:digest(JSON.stringify(value))});
function fixture(){
  const charter={name:'Fictional Engineer',mission:'Read supplied fictional evidence.',inputs:'Exact sources',outputs:'Assessment',block:'Missing evidence',success:'Preserved conditions',failure:'Omitted conditions',phase:'Preparation'};
  const s={schema:SCHEMA,id:'fictional-capacity-company',name:'Fictional capacity',idea:'Test read-only accounting',runtime_version:VERSION,plugin_version:VERSION,phase:'Frame',mode:'preparation',paused:false,
    owner:{host:'codex',session_id:args.session_id,epoch:1},governance:'Fictional rules: preserve unresolved obligations.',cos_instructions:'Fictional bounded source tests.',roles:{engineer:charter,qa:{...charter,name:'Fictional QA'}},records:{},jobs:{},sessions:{},notices:[],messages:[],created_at:'2026-11-12T00:00:00.000Z'};
  s.governance_sha256=digest(s.governance);s.team_sha256=teamHash(s);
  s.records.input={id:'input',kind:'artifact',revision:1,content:'PRIVATE_BODY_é_😀_"_\\_\n_END',status:'Draft'};
  s.records.rule={id:'rule',kind:'decision',revision:1,content:'PRIVATE_UNRESOLVED_RULE: uncertain closure; no automatic retry.'};
  setRuntimeControl(s,{...args,action:'start'},'codex');
  const record=makeTask(s,'one');return {s,id:record.id};
}
function makeTask(s,operation_id,extra={}){return submitTask(s,{...args,operation_id,spec:{role:'engineer',task:'Assess the fictional input.',acceptance:'Preserve every unresolved condition.',expected_deliverable:'A fictional assessment',input_ids:['input'],model_selection:{mode:'default',reason:'Fictional source check; no provider selection.'},...extra}},'codex');}
function previewJob(s,id){const record=s.records[id],spec=record.runtime_task.spec;return {id:null,instance_id:null,requester:null,role:spec.role,task:spec.task,context_scope:spec.context_scope,inputs:spec.input_ids.map(key=>({id:key,revision:s.records[key].revision??null})),review_of:null,coordination:null,model_selection:spec.model_selection,runtime_task:taskDefinitionBinding(record),supplemental_sources:[]};}
function collect(s,id,limit=3){
  const pages=[],items=[];let cursor;
  do{const page=taskCapacityContext(s,{task_id:id,limit,...(cursor?{cursor}:{})});
    assert(bytes(page)<=16000);assert.equal(page.offset,items.length);assert.equal(page.returned,page.items.length);
    assert(page.complete||page.returned>0,'Incomplete pages must make progress');assert.equal(page.complete,page.next_cursor===null);
    pages.push(page);items.push(...page.items);cursor=page.next_cursor;
    assert(pages.length<1000,'Pagination must terminate');
  }while(cursor);
  assert.equal(items.length,pages[0].total);assert.equal(new Set(pages.map(p=>p.subject.diagnostic_cut_sha256)).size,1);
  return {pages,items,first:pages[0]};
}

test('exact constructor accounting uses UTF-8 bytes and preserves full JSON semantics',()=>{
  const {s,id}=fixture(),before=JSON.stringify(s),result=collect(s,id),actual=taskAssignmentContext(s,previewJob(s,id)),packet=JSON.parse(actual.text);
  assert.equal(result.first.protocol,'async-task-context-capacity-v1');
  assert.equal(result.first.subject.kind,'new-prospective-diagnostic');assert.equal(result.first.subject.envelope,'source-owned-nonexecuting-v1');
  assert.deepEqual(result.first.subject.task_source,ref(s.records[id]));assert.deepEqual(result.first.subject.task_definition,taskDefinitionBinding(s.records[id]));
  assert.equal(result.first.measurement.packet_sha256,actual.hash);assert.equal(result.first.measurement.context_utf8_bytes,bytes(actual.text));assert.equal(result.first.measurement.context_utf16_characters,actual.text.length);
  assert.equal(result.first.measurement.task_budget_bytes,65536);assert.equal(result.first.measurement.semantic_classification,'NOT_ASSERTED');assert.equal(result.first.measurement.admission_or_readiness,'NOT_ASSERTED');
  const fields=result.items.filter(item=>item.kind==='field');assert.deepEqual(fields.map(item=>item.name),Object.keys(packet));
  assert.equal(fields.reduce((sum,item)=>sum+item.packet_contribution_utf8_bytes,2),bytes(actual.text));
  for(const item of fields){const text=JSON.stringify(packet[item.name]);assert.equal(item.json_utf8_bytes,bytes(text));assert.equal(item.json_utf16_characters,text.length);assert.equal(item.packet_contribution_utf8_bytes,item.json_utf8_bytes+item.overhead_utf8_bytes);}
  const input=result.items.find(item=>item.kind==='source'&&item.source.id==='input');
  assert.deepEqual(input.source,ref(s.records.input));assert.equal(input.value_utf8_bytes,bytes(JSON.stringify(s.records.input)));assert.equal(input.value_utf16_characters,JSON.stringify(s.records.input).length);assert(input.value_utf8_bytes>input.value_utf16_characters);
  const original=packet.records.find(entry=>entry.source.id==='input');assert.equal(input.wrapper_utf8_bytes,bytes(JSON.stringify(original)));assert.equal(input.wrapper_utf16_characters,JSON.stringify(original).length);
  assert.equal(input.current_retrieval,true);assert.equal(input.original_delivery,false);assert.equal(JSON.stringify(s),before);
  assert.equal(taskContextMatches(s,previewJob(s,id),actual.hash),true);
});

test('complete bounded occurrence pages retain aliases and different versions without leaking bodies',()=>{
  const {s,id}=fixture(),same={id:'legacy-original',status:'failed',error:'PRIVATE_LEGACY_UNKNOWN: closure unknown'};
  s.jobs.aliasA=structuredClone(same);s.jobs.aliasB=structuredClone(same);
  s.upgrade_history=[{id:'same-upgrade',status:'recovered',error:'PRIVATE_VERSION_ONE'},{id:'same-upgrade',status:'recovered',error:'PRIVATE_VERSION_TWO'}];
  for(let n=0;n<40;n++)s.records['extra-'+n]={id:'extra-'+n,kind:'artifact',revision:1,content:'PRIVATE_EXTRA_'+n};
  const {items,pages,first}=collect(s,id,100),sources=items.filter(item=>item.kind==='source');
  assert(pages.length>1,'Byte packing must bound a requested large page');assert.equal(first.totals.source_occurrences,sources.length);
  assert(sources.some(item=>item.source.id==='rule'));assert.equal(items.filter(item=>item.kind==='field').length,first.totals.field_entries);
  const aliases=sources.filter(item=>['job:aliasA','job:aliasB'].includes(item.source.id));assert.equal(aliases.length,2);
  assert.equal(aliases[0].value_sha256,aliases[1].value_sha256);assert(aliases.every(item=>item.duplicate_occurrences===2));
  const versions=sources.filter(item=>item.source.id==='upgrade:same-upgrade');assert.equal(versions.length,2);assert.notEqual(versions[0].source.sha256,versions[1].source.sha256);assert.notEqual(versions[0].value_sha256,versions[1].value_sha256);
  assert.equal(new Set(sources.map(item=>JSON.stringify(item.path))).size,sources.length);
  for(const page of pages){const text=JSON.stringify(page);assert(!text.includes('PRIVATE_'));assert(!text.includes('"content":'));assert(!text.includes('"value":'));}
});

test('null diagnostic identity retains absent and null job IDs in notices and role messages',()=>{
  const {s,id}=fixture();s.notices=[{id:'n1',kind:'must_know',summary:'PRIVATE_NOTICE: do not retry',seen_at:null,deliveries:[]},{id:'n2',kind:'decision_required',summary:'PRIVATE_DECISION',job_id:'old-job'},{id:'n3',kind:'must_know',summary:'PRIVATE_NULL_NOTICE',job_id:null}];
  s.messages=[{id:'m1',to:'engineer',content:'PRIVATE_ROLE_MESSAGE'},{id:'m2',to:'engineer',content:'PRIVATE_NULL_MESSAGE',job_id:null},{id:'m3',to:'qa',content:'OTHER_ROLE_MESSAGE',job_id:null}];s.new_unknown_extension={restriction:'PRIVATE_UNKNOWN: never infer closure'};
  const {items}=collect(s,id),actual=JSON.parse(taskAssignmentContext(s,previewJob(s,id)).text);
  assert.equal(actual.notices.length,3);assert.equal(actual.messages.length,2);assert.deepEqual(actual.state_extensions.new_unknown_extension,s.new_unknown_extension);
  for(const name of ['notices','messages','state_extensions']){const item=items.find(entry=>entry.kind==='field'&&entry.name===name);assert(item);assert.equal(item.json_utf8_bytes,bytes(JSON.stringify(actual[name])));}
});

test('stale cursors reject task, source, membership, controls and owner drift',()=>{
  for(const mode of ['source','membership','controls','pause','task','owner','different-task']){
    const {s,id}=fixture(),first=taskCapacityContext(s,{task_id:id,limit:1});assert(first.next_cursor);
    let target=id;
    if(mode==='source')s.records.input.content+=' Changed qualifier.';
    if(mode==='membership')s.records.newRule={id:'newRule',kind:'decision',revision:1,content:'New mandatory rule.'};
    if(mode==='controls'){s.records['async-runtime-control'].runtime_control.source_instruction+=' Changed limit.';s.records['async-runtime-control'].runtime_control.control_revision++;}
    if(mode==='pause')s.paused=true;
    if(mode==='task')amendTask(s,{...args,operation_id:'amend',task_id:id,expected_definition_revision:1,spec:{...s.records[id].runtime_task.spec,acceptance:'Changed acceptance.'}},'codex');
    if(mode==='owner')s.owner.epoch++;
    if(mode==='different-task')target=makeTask(s,'second').id;
    assert.throws(()=>taskCapacityContext(s,{task_id:target,limit:1,cursor:first.next_cursor}),undefined,mode);
  }
});

test('stopped or paused diagnostics do not grant readiness; actual admission and overflow stay fenced',()=>{
  const {s,id}=fixture(),job=previewJob(s,id),original=taskAssignmentContext(s,job);
  s.records.large={id:'large',kind:'artifact',revision:1,content:'PRIVATE_OVERSIZED_UNKNOWN '.repeat(4000)};
  const measured=collect(s,id).first;assert(measured.measurement.context_utf8_bytes>65536);
  assert.throws(()=>taskAssignmentContext(s,job),error=>error.code==='CONTEXT_CAPACITY'&&/nothing was truncated/.test(error.message));assert.equal(taskContextMatches(s,job,original.hash),false);
  setRuntimeControl(s,{...args,action:'stop'},'codex');s.paused=true;const before=JSON.stringify(s),diagnostic=collect(s,id).first;
  assert(diagnostic.measurement.context_utf8_bytes>65536);assert.equal(diagnostic.measurement.admission_or_readiness,'NOT_ASSERTED');assert.throws(()=>taskAssignmentContext(s,job),/paused|stopped/);assert.equal(JSON.stringify(s),before);assert.deepEqual(s.records[id].runtime_task.attempts,[]);
});

test('invalid proofs, missing prerequisites and unsupported profiles retain construction Holds',()=>{
  for(const mode of ['proof','prerequisite','profile']){
    const {s,id}=fixture();let target=id;
    if(mode==='proof')s.context_classifications={input:{source:ref(s.records.input),disposition:'represented',plan:{id:'missing-plan',sha256:'0'.repeat(64)},review:{id:'missing-review',sha256:'0'.repeat(64)}}};
    if(mode==='prerequisite')target=makeTask(s,'dependent',{depends_on:[{task_id:id,gate:'output'}]}).id;
    if(mode==='profile'){const task=s.records[id].runtime_task;task.spec.specialist_ref={id:'missing-profile',revision:1,sha256:'0'.repeat(64)};task.definition_sha256=taskDefinitionHash(task.spec);}
    const before=JSON.stringify(s);assert.throws(()=>taskCapacityContext(s,{task_id:target}));assert.equal(JSON.stringify(s),before);
  }
});

test('malformed selectors and metadata overflow never emit a zero-progress continuation',()=>{
  const {s,id}=fixture();
  for(const limit of [0,101,1.5,'2'])assert.throws(()=>taskCapacityContext(s,{task_id:id,limit}));
  for(const cursor of ['not-a-cursor',Buffer.from('{}').toString('base64url')])assert.throws(()=>taskCapacityContext(s,{task_id:id,cursor}));
  assert.throws(()=>taskCapacityContext(s,{task_id:'missing'}));
  const huge='oversized-source-'+ 'x'.repeat(20000);s.records[huge]={id:huge,revision:1,kind:'artifact',content:'PRIVATE_BODY_MUST_NOT_LEAK'};
  assert.throws(()=>collect(s,id,100),error=>/metadata.*bounded reply/.test(error.message)&&!/PRIVATE_BODY_MUST_NOT_LEAK/.test(error.message));
});

function logicalState(db){
  const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  const tables=Object.fromEntries(schema.filter(row=>row.type==='table').map(({name})=>[name,db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(row=>JSON.stringify(row)).sort()]));
  return JSON.stringify({schema,tables});
}
function storedFixture(t){
  const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-capacity-'))),root=path.join(temporary,'attached'),data=path.join(temporary,'plugin-data');fs.mkdirSync(root);fs.mkdirSync(data);
  const previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=data;
  const {s,id}=fixture(),db=new Store(root,true);db.transaction('fictional.capacity.setup',()=>s);db.migrate();index.installTaskIndex(db);
  const directory=path.join(data,'bindings');fs.mkdirSync(directory);const binding=path.join(directory,digest(JSON.stringify([root,'codex',args.session_id]))+'.json');fs.writeFileSync(binding,JSON.stringify({root,host:'codex',session_id:args.session_id}));
  t.after(()=>{db.close();if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(temporary,{recursive:true,force:true});});
  return {root,id,db,binding};
}
test('public capacity reads preserve every logical row, event, attempt, grant and binding',async t=>{
  const f=storedFixture(t);f.db.transaction('fictional.stop',s=>{setRuntimeControl(s,{...args,action:'stop'},'codex');s.paused=true;return s;});
  const before=logicalState(f.db.db),binding=fs.readFileSync(f.binding),request={root:f.root,session_id:args.session_id,action:'capacity',task_id:f.id,limit:2};
  await withoutExternal(async()=>{
    let cursor,pages=0;do{const result=runtime.taskAction({...request,...(cursor?{cursor}:{})},'codex',{wake:()=>assert.fail('A read must never wake the supervisor')});assert(bytes(result)<=16000);assert(result.complete||result.returned>0);cursor=result.next_cursor;assert(++pages<100);}while(cursor);
    const publicResult=await main.call('company_tasks',request,'codex');assert.equal(publicResult.protocol,'async-task-context-capacity-v1');
    for(const extra of [{budget:200000},{context_scope:'*'},{epoch:1},{spec:{}},{operation_id:'must-not-write'}])await assert.rejects(main.call('company_tasks',{...request,...extra},'codex'));
    await assert.rejects(main.call('company_tasks',{...request,cursor:'broken'},'codex'));
  });
  assert.equal(logicalState(f.db.db),before);assert.deepEqual(fs.readFileSync(f.binding),binding);
  const state=f.db.read();assert.deepEqual(state.records[f.id].runtime_task.attempts,[]);assert.equal(state.records['async-runtime-control'].runtime_control.enabled,false);assert.equal(state.paused,true);
});

test('actual catalog and maximum serialized-ID RPC frames fit without increasing caps',async()=>{
  const oldDescription='Persist bounded background preparation tasks/exact prerequisites. Runtime is software, no AI supervisor. submit/amend/cancel/message/dispose require actual owner/epoch, source_instruction and replay-safe operation_id. Pause/scope/review/one-attempt limits stay. inspect/context/checkpoint/inbox use bounded pages; incomplete context gives no permission. Planned tasks have no native session.';
  const baseline=structuredClone(main.toolList),prior=baseline.find(tool=>tool.name==='company_tasks');prior.description=oldDescription;prior.inputSchema.properties.action.enum=prior.inputSchema.properties.action.enum.filter(action=>action!=='capacity');
  assert.equal(bytes(main.toolList)-bytes(baseline),-60);assert.equal(main.toolList.length,baseline.length);assert.equal(presentation.REPLY_MAX_BYTES,65536);
  const tool=main.toolList.find(tool=>tool.name==='company_tasks');assert(tool.inputSchema.properties.action.enum.includes('capacity'));assert.equal(tool.inputSchema.properties.section,undefined);
  const ids=['x'.repeat(256),'\\'.repeat(128),'"'.repeat(128),'\n'.repeat(128),'\0'.repeat(42)+'xxxx','é'.repeat(128),'😀'.repeat(64)];
  for(const id of ids)assert.equal(bytes(JSON.stringify(id)),258);
  for(const ceiling of [100000,1000000])for(const id of ids){
    const tools=structuredClone(main.toolList);tools.find(tool=>tool.name==='company_develop').inputSchema.properties.max_bytes.maximum=ceiling;
    const wire=presentation.rpcReply(id,{tools})+'\n',decoded=JSON.parse(wire);assert(bytes(wire)<=65536);assert.equal(decoded.id,id);assert.equal(decoded.error,undefined);assert.deepEqual(decoded.result,{tools});
  }
});
