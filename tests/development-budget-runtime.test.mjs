// SOURCE fixtures only. All companies, HOST metadata, bindings, grants and
// supplied output below are fictional. Execution evidence belongs to its test
// receipt; API mechanics never establish native or installed-host qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {Store,SCHEMA,VERSION,installedTeam,teamHash,digest,withStore} from '../plugins/soloco/runtime/store.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call,toolList,toolListFor} from '../plugins/soloco/runtime/main.mjs';
import {CATALOG_MAX_BYTES,REPLY_MAX_BYTES,MODEL_MAX_BYTES,toolCatalogReply,rpcReply} from '../plugins/soloco/runtime/public-response.mjs';
import {runWithMcpHostContext} from '../plugins/soloco/runtime/mcp-host-context.mjs';
import {developmentLimits} from '../plugins/soloco/runtime/development-limits.mjs';
import {developmentReviewAuthority,developmentAssignment} from '../plugins/soloco/runtime/develop.mjs';
import {DEVELOPMENT_BUDGET_ACTIONS,developmentBudgetInputSchema,validateDevelopmentBudgetRequest,developmentBudgetRuntimeAction} from '../plugins/soloco/runtime/development-budget-runtime.mjs';
import {peerFixture} from './peer-fixture.mjs';

const POLICY='retain-original-explicit-cas-restore',INSTRUCTION='Fictional SOURCE-only ceiling/preflight fixture; no actual company, model or external action.';
const KEY='development_budget_control',ENTRY=fileURLToPath(new URL('../plugins/soloco/runtime/main.mjs',import.meta.url));
const code=expected=>error=>error?.code===expected;
function fixture(t,{raw,paused=true}={}){
  const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-budget-public-SOURCE-'))),root=path.join(temporary,'attached'),cache=path.join(temporary,'host-data');
  fs.mkdirSync(root);fs.mkdirSync(cache);const prior=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=cache;
  const session=randomUUID(),team=installedTeam(),state={...team,schema:SCHEMA,runtime_version:VERSION,id:'fictional-public-budget-'+randomUUID(),name:'Fictional SOURCE budget',idea:'No provider or actual company operation',phase:'preparation',mode:'preparation',paused,revision:0,owner:{host:'codex',session_id:session,epoch:1},records:{},jobs:{},sessions:{},notices:[],messages:[],upgrade_history:[]};
  state.team_sha256=teamHash(state);state.records.intent={id:'intent',kind:'intent',revision:1,content:'Original source intent'};
  state.records.decision={id:'decision',kind:'decision',revision:1,content:'Original finite fixture authorization'};
  state.records.plan={id:'plan',kind:'artifact',revision:1,development:{type:'plan',scope:{max_bytes:20000,max_attempts:3,timeout_ms:3000,max_output_bytes:10000,expires_at:'2099-01-01T00:00:00.000Z'},attempts:['original-consumed'],authorization:{decision_id:'decision'}}};
  state.records.plan.development.scope_sha256=digest(JSON.stringify(state.records.plan.development.scope));
  state.records.plan.development.authorization.authority_sha256=developmentReviewAuthority(state,'plan');
  const store=new Store(root,true);try{store.transaction('fictional.public-budget-genesis',()=>state);store.migrate();}finally{store.close();}
  const config=path.join(root,'.company','development.json');if(raw!==undefined)fs.writeFileSync(config,raw);
  engine.bind(root,session,'codex');const binding=path.join(cache,'bindings',digest(JSON.stringify([root,'codex',session]))+'.json');
  const closers=[];t.after(async()=>{try{for(const close of closers)await close();}finally{if(prior===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=prior;fs.rmSync(temporary,{recursive:true,force:true});}});
  const meta={threadId:session,sessionId:session},actor=Object.freeze({host:'codex',session_id:session,native_id:session});
  const args=(action,budget_input={},extra={})=>({root,session_id:session,epoch:1,action,budget_input,...extra});
  const publicCall=(action,input={},extra={})=>runWithMcpHostContext('codex',meta,()=>call('company_develop',args(action,input,extra),'codex'));
  const engineCall=(action,input={},extra={})=>runWithMcpHostContext('codex',meta,()=>engine.develop(args(action,input,extra),'codex'));
  const source=(name,body)=>{fs.writeFileSync(path.join(root,name),body);return body;};
  source('main.mjs','export const value = 0;\n');source('dependency.mjs','export const dependency = "你好😀";\n');source('main.test.mjs','// Complete selected fictional test source.\n');
  const preflight=(extra={})=>({source_instruction:INSTRUCTION,model_data_approved:true,data_policy:'Only these complete fictional source/dependency/test files.',read_paths:['main.mjs','dependency.mjs','main.test.mjs'],write_paths:['main.mjs'],test_paths:['main.test.mjs'],output_format:'files',requested_max_bytes:100000,headroom_bytes:0,...extra});
  return {temporary,root,cache,config,binding,session,meta,actor,args,publicCall,engineCall,source,preflight,track:close=>closers.push(close),read:()=>withStore(root,db=>db.read())};
}
function withoutAudit(state){const value=structuredClone(state);delete value[KEY];delete value.revision;delete value.updated_at;return value;}
function patch(t,object,key,wrap){const original=object[key];object[key]=wrap(original);const undo=()=>{object[key]=original;};t.after(undo);return undo;}
async function apply(f,max=400000){
  const inspected=await f.publicCall('budget_inspect'),proposal=await f.publicCall('budget_propose',{max_bytes_ceiling:max,expected_config:inspected.configuration,source_instruction:INSTRUCTION,restoration_policy:POLICY});
  return f.publicCall('budget_apply',{proposal_ref:proposal.proposal_ref,source_instruction:INSTRUCTION});
}

test('budget schemas extend the existing tool with six bounded actions and preserve the tool count',t=>{
  const f=fixture(t),tools=toolListFor(f.root),schema=tools.find(x=>x.name==='company_develop').inputSchema;
  assert.equal(tools.length,25);for(const action of DEVELOPMENT_BUDGET_ACTIONS)assert.ok(schema.properties.action.enum.includes(action));
  assert.deepEqual(schema.properties.budget_input,developmentBudgetInputSchema);
  const proposal=developmentBudgetInputSchema.oneOf.find(x=>x.properties.max_bytes_ceiling);
  assert.equal(proposal.additionalProperties,false);assert.equal(proposal.properties.max_bytes_ceiling.maximum,1000000);
  assert.equal(schema.properties.max_bytes.maximum,100000,'Old plan ceiling remains root-specific');
  fs.writeFileSync(f.config,'not json');const invalid=toolListFor(f.root).find(x=>x.name==='company_develop').inputSchema;
  assert.deepEqual(invalid.properties.budget_input,developmentBudgetInputSchema,'Malformed config cannot hide supported budget inspection');
});

test('pure request validation rejects injection before any actor, config, source or storage access',t=>{
  const f=fixture(t);let reads=0,invoked=0;
  const undo=patch(t,fs,'lstatSync',()=>()=>{reads++;throw Error('Pure validation attempted filesystem access');});
  const valid=validateDevelopmentBudgetRequest(f.args('budget_preflight',f.preflight()));assert.ok(Object.isFrozen(valid));assert.ok(Object.isFrozen(valid.budget_input));
  const accessor=f.args('budget_inspect');Object.defineProperty(accessor,'root',{enumerable:true,get(){invoked++;return f.root;}});
  const proxy=new Proxy(f.args('budget_inspect'),{ownKeys(){invoked++;throw Error('Proxy invoked');}});
  const badOutput=[{path:'main.mjs',content:'x',provider:()=>{invoked++;}}];
  for(const input of [
    accessor,proxy,f.args('budget_inspect',{}, {max_bytes:200000}),f.args('budget_inspect',{epoch:1}),
    f.args('budget_inspect',{actor:f.actor}),f.args('budget_inspect',{ref:{id:'budget-'+randomUUID(),revision:1,sha256:'0'.repeat(64)},cursor:'ignored'}),
    f.args('budget_preflight',f.preflight({model_data_approved:false})),f.args('budget_preflight',f.preflight({test_paths:['unselected.test.mjs']})),
    f.args('budget_preflight',f.preflight({read_paths:['../secret']})),f.args('budget_preflight',f.preflight({output:badOutput})),
    f.args('budget_preflight',f.preflight({requested_max_bytes:1000001})),f.args('budget_preflight',f.preflight({headroom_bytes:-1}))
  ])assert.throws(()=>validateDevelopmentBudgetRequest(input),code('DEVELOPMENT_BUDGET_REQUEST'));
  assert.equal(reads,0);assert.equal(invoked,0);undo();
});

test('missing or descendant HOST metadata and closed-argument violations cannot reach even a config guard',async t=>{
  const f=fixture(t);let reads=0;
  const undo=patch(t,fs,'lstatSync',()=>()=>{reads++;throw Error('Unqualified caller touched filesystem');});
  for(const metadata of [undefined,{}, {threadId:randomUUID(),sessionId:f.session}])await assert.rejects(runWithMcpHostContext('codex',metadata,()=>engine.develop(f.args('budget_inspect'),'codex')),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
  await assert.rejects(call('company_develop',f.args('budget_inspect',{}, {max_bytes:200000}),'codex'),code('DEVELOPMENT_BUDGET_REQUEST'));
  await assert.rejects(developmentBudgetRuntimeAction(f.args('budget_inspect'),f.actor),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
  assert.equal(reads,0);undo();assert.equal(f.read()[KEY],undefined);
});

test('MCP and direct engine classify action DATA without invoking getters or Proxy traps',async t=>{
  const f=fixture(t);let invoked=0,reads=0;
  const undo=patch(t,fs,'lstatSync',()=>()=>{reads++;throw Error('Classification attempted filesystem access');});
  try{
    const getter=f.args('budget_inspect');Object.defineProperty(getter,'action',{enumerable:true,get(){invoked++;return 'budget_inspect';}});
    const proxy=new Proxy(f.args('budget_inspect'),{get(){invoked++;throw Error('Proxy.get invoked');},getOwnPropertyDescriptor(){invoked++;throw Error('Proxy descriptor trap invoked');},ownKeys(){invoked++;throw Error('Proxy.ownKeys invoked');}});
    for(const args of [getter,proxy])for(const invoke of [value=>call('company_develop',value,'codex'),value=>engine.develop(value,'codex')]){
      await assert.rejects(async()=>invoke(args),code('DEVELOPMENT_BUDGET_REQUEST'));
    }
    assert.equal(invoked,0);assert.equal(reads,0);
  }finally{undo();}
});

test('public controls retain current-hook, canonical owner and current epoch checks',async t=>{
  const f=fixture(t),before=f.read(),original=fs.readFileSync(f.binding);
  fs.writeFileSync(f.binding,JSON.stringify({...JSON.parse(original),plugin_version:'0.0.0'}));
  await assert.rejects(f.publicCall('budget_inspect'),code('PEER_CURRENT_HOOK_REQUIRED'));fs.writeFileSync(f.binding,original);
  await assert.rejects(f.publicCall('budget_inspect',{}, {epoch:2}),/does not own/);
  const other=randomUUID();engine.bind(f.root,other,'codex');
  await assert.rejects(runWithMcpHostContext('codex',{threadId:other,sessionId:other},()=>call('company_develop',f.args('budget_inspect',{}, {session_id:other}),'codex')),/does not own/);
  await assert.rejects(runWithMcpHostContext('claude',f.meta,()=>engine.develop(f.args('budget_inspect'),'claude')),code('MCP_CODEX_ROOT_CALLER_REQUIRED'));
  assert.deepEqual(f.read(),before);
});

test('public paused administration applies and restores while preserving original scope, grant and attempt bytes',async t=>{
  const f=fixture(t),before=f.read(),first=await f.engineCall('budget_inspect');assert.equal(first.configuration.exists,false);assert.deepEqual(f.read(),before);
  const setting=await apply(f,400000);assert.equal(setting.status,'applied');assert.equal(developmentLimits(f.root).max_bytes,400000);assert.equal(f.read().paused,true);
  assert.deepEqual(withoutAudit(f.read()),withoutAudit(before));assert.equal(developmentReviewAuthority(f.read(),'plan'),before.records.plan.development.authorization.authority_sha256);
  assert.equal(f.read().records.plan.development.scope.max_bytes,20000);assert.deepEqual(f.read().records.plan.development.attempts,['original-consumed']);
  const restored=await f.publicCall('budget_restore',{applied_ref:setting.operation_ref,expected_config:setting.configuration,source_instruction:INSTRUCTION});
  assert.equal(restored.status,'applied');assert.equal(fs.existsSync(f.config),false);assert.deepEqual(withoutAudit(f.read()),withoutAudit(before));
});

test('public setter rejects stale preimages and exact replay cannot silently reapply or rewrite a new setting',async t=>{
  const f=fixture(t),i=await f.publicCall('budget_inspect'),p=await f.publicCall('budget_propose',{max_bytes_ceiling:400000,expected_config:i.configuration,source_instruction:INSTRUCTION,restoration_policy:POLICY});
  fs.writeFileSync(f.config,'{"max_bytes_ceiling":300000}');
  await assert.rejects(f.publicCall('budget_apply',{proposal_ref:p.proposal_ref,source_instruction:INSTRUCTION}),code('DEVELOPMENT_BUDGET_CONFIG_CAS'));
  assert.equal(developmentLimits(f.root).max_bytes,300000);
  const applied=await apply(f,500000),snapshot=fs.readFileSync(f.config);
  await assert.rejects(f.publicCall('budget_apply',{proposal_ref:applied.operation_ref,source_instruction:INSTRUCTION}),code('DEVELOPMENT_BUDGET_STALE_PROPOSAL'));
  assert.deepEqual(fs.readFileSync(f.config),snapshot);
});

test('public lowering preserves the original consumed grant and triggers its original budget Hold',async t=>{
  const f=fixture(t),original=f.read().records.plan,setting=await apply(f,1000);assert.equal(setting.status,'applied');
  const state=f.read();assert.deepEqual(state.records.plan,original);
  assert.throws(()=>developmentAssignment(state,{id:'original-consumed',development_id:'plan',role:'engineer'},false,f.root),/ceiling was lowered/);
  await f.publicCall('budget_restore',{applied_ref:setting.operation_ref,expected_config:setting.configuration,source_instruction:INSTRUCTION});assert.deepEqual(f.read().records.plan,original);
});

test('public reconciliation observes a prepared COMMIT acknowledgement loss without repeating a file action',async t=>{
  const f=fixture(t),before=f.read(),inspected=await f.publicCall('budget_inspect');
  const proposal=await f.publicCall('budget_propose',{max_bytes_ceiling:400000,expected_config:inspected.configuration,source_instruction:INSTRUCTION,restoration_policy:POLICY});
  let armed=false,injected=false;
  const undoTransaction=patch(t,Store.prototype,'selectedTransaction',original=>function(type,...args){
    if(type!=='development.budget.prepare')return Reflect.apply(original,this,[type,...args]);
    armed=true;try{return Reflect.apply(original,this,[type,...args]);}finally{armed=false;}
  });
  const undoExec=patch(t,DatabaseSync.prototype,'exec',original=>function(sql,...args){
    const returned=Reflect.apply(original,this,[sql,...args]);
    if(armed&&!injected&&sql.trim().toUpperCase()==='COMMIT'){injected=true;throw Object.assign(Error('Fictional acknowledgement loss after actual SQLite COMMIT'),{code:'EIO'});}
    return returned;
  });
  let uncertain;
  try{uncertain=await f.publicCall('budget_apply',{proposal_ref:proposal.proposal_ref,source_instruction:INSTRUCTION});}
  finally{undoExec();undoTransaction();}
  assert.equal(injected,true);assert.equal(uncertain.status,'held');assert.equal(uncertain.code,'DEVELOPMENT_BUDGET_OUTCOME_UNCERTAIN');
  assert.equal(uncertain.original_call_success_inferred,false);assert.equal(fs.existsSync(f.config),false);
  const current=await f.publicCall('budget_inspect');assert.ok(current.active_intent);
  const reconciled=await f.publicCall('budget_reconcile',{intent_ref:current.active_intent,source_instruction:INSTRUCTION});
  assert.equal(reconciled.status,'reconciled');assert.equal(reconciled.observed_outcome,'not_applied');
  assert.equal(reconciled.repeated_file_action,false);assert.equal(reconciled.original_call_success_inferred,false);
  assert.equal((await f.publicCall('budget_inspect')).active_intent,null);assert.equal(fs.existsSync(f.config),false);
  assert.deepEqual(withoutAudit(f.read()),withoutAudit(before));assert.equal(uncertain.status,'held','Reconciliation never regrades the failed original call');
});

test('layout5 never falls back into legacy budget storage or receives legacy tables',async t=>{
  const f=fixture(t),p=peerFixture(),root=fs.realpathSync(p.root),file=p.file;p.ledger.close();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  engine.bind(root,f.session,'codex');const read=()=>{const db=new DatabaseSync(file,{readOnly:true});try{return db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all();}finally{db.close();}};
  const before=read();await assert.rejects(f.publicCall('budget_inspect',{}, {root}),code('OWNER_LEGACY_LAYOUT4_REQUIRED'));assert.deepEqual(read(),before);
});

test('preflight measures actual complete sources above the default and labels output as supplied preview',async t=>{
  const f=fixture(t),original=f.source('main.mjs','export const value = 0;\n'+'// fictional complete padding 你好😀\n'.repeat(4000)),before=f.read();
  const incomplete=await f.publicCall('budget_preflight',f.preflight({requested_max_bytes:400000,headroom_bytes:5000}));
  const sources=['dependency.mjs','main.mjs','main.test.mjs'].map(name=>{const content=fs.readFileSync(path.join(f.root,name),'utf8');return {path:name,content,sha256:digest(content)};});
  assert.equal(incomplete.phases.sources.encoded_utf8_bytes,Buffer.byteLength(JSON.stringify(sources)));assert.ok(incomplete.phases.sources.encoded_utf8_bytes>100000);
  assert.equal(incomplete.status,'held');assert.ok(incomplete.blockers.some(x=>x.limit==='configured_max_bytes'));assert.equal(incomplete.phases.generated_output.known,false);assert.equal(incomplete.phases.complete_candidate.known,false);
  assert.equal(incomplete.preflight.canonical_generation,false);assert.equal(incomplete.preflight.creates_plan,false);assert.equal(incomplete.preflight.creates_grant,false);assert.match(incomplete.preflight.output_basis,/unknown/);assert.deepEqual(f.read(),before);
  await apply(f,400000);const current=f.read(),changed=original.replace('= 0;','= 1;'),output=[{path:'main.mjs',content:changed}];
  const measured=await f.publicCall('budget_preflight',f.preflight({requested_max_bytes:400000,headroom_bytes:5000,output}));
  const candidate=sources.map(({path:name,content})=>({path:name,content:name==='main.mjs'?changed:content}));
  assert.equal(measured.status,'within_byte_limits');assert.equal(measured.phases.generated_output.encoded_utf8_bytes,Buffer.byteLength(JSON.stringify(output)));
  assert.equal(measured.phases.complete_candidate.encoded_utf8_bytes,Buffer.byteLength(JSON.stringify(candidate)));assert.equal(measured.recommendation.complete,true);
  assert.match(measured.preflight.output_basis,/caller-supplied preview/);assert.equal(measured.preflight.canonical_generation,false);assert.equal(measured.preflight.tests_executed,false);
  assert.equal(measured.files.find(x=>x.path==='main.test.mjs').test,true);assert.equal(measured.files.find(x=>x.path==='dependency.mjs').written,false);assert.deepEqual(f.read(),current);
  assert.equal(fs.readFileSync(path.join(f.root,'main.mjs'),'utf8'),original);
});

test('preflight checks existing/new write membership and reconstructs a complete supplied patch without clipping dependencies',async t=>{
  const f=fixture(t),content=fs.readFileSync(path.join(f.root,'main.mjs'),'utf8'),start=content.indexOf('0;');
  const input=f.preflight({output_format:'patches',write_paths:['main.mjs','generated.test.mjs'],test_paths:['generated.test.mjs'],output:[{path:'main.mjs',base_sha256:digest(content),edits:[{start,end:start+1,text:'1'}]},{path:'generated.test.mjs',base_sha256:null,content:'// complete generated preview\n'}]});
  const before=f.read(),measured=await f.publicCall('budget_preflight',input);assert.equal(measured.phases.complete_candidate.known,true);assert.equal(measured.membership.selected_count,4);assert.equal(measured.files.find(x=>x.path==='generated.test.mjs').source,null);
  assert.equal(fs.existsSync(path.join(f.root,'generated.test.mjs')),false);assert.deepEqual(f.read(),before);
  await assert.rejects(f.publicCall('budget_preflight',f.preflight({read_paths:['main.test.mjs']})),code('DEVELOPMENT_BUDGET_EXISTING_WRITE'));
  await assert.rejects(f.publicCall('budget_preflight',{...input,output:[{...input.output[0],base_sha256:'0'.repeat(64)},input.output[1]]}),code('DEVELOPMENT_FOOTPRINT_INPUT'));
});

test('preflight refuses linked, malformed, missing or over-hard-bound inputs without creating audit or grants',async t=>{
  const f=fixture(t),source=path.join(f.root,'main.mjs'),held=path.join(f.root,'held.mjs');fs.renameSync(source,held);fs.symlinkSync(held,source);
  await assert.rejects(f.publicCall('budget_preflight',f.preflight()),code('DEVELOPMENT_BUDGET_SOURCE_FILE'));fs.unlinkSync(source);fs.renameSync(held,source);
  fs.linkSync(source,held);await assert.rejects(f.publicCall('budget_preflight',f.preflight()),code('DEVELOPMENT_BUDGET_SOURCE_FILE'));fs.unlinkSync(held);
  const linked=path.join(f.root,'linked');fs.symlinkSync(f.root,linked,'dir');
  await assert.rejects(f.publicCall('budget_preflight',f.preflight({read_paths:['linked/main.mjs','main.test.mjs'],write_paths:['linked/main.mjs']})),code('DEVELOPMENT_BUDGET_SOURCE_PATH'));fs.unlinkSync(linked);
  fs.writeFileSync(source,Buffer.from([0xff]));await assert.rejects(f.publicCall('budget_preflight',f.preflight()),code('DEVELOPMENT_BUDGET_SOURCE_UTF8'));
  fs.writeFileSync(source,'x'.repeat(1000001));await assert.rejects(f.publicCall('budget_preflight',f.preflight()),code('DEVELOPMENT_BUDGET_SOURCE_LIMIT'));
  fs.unlinkSync(source);await assert.rejects(f.publicCall('budget_preflight',f.preflight()),code('DEVELOPMENT_BUDGET_SOURCE_MISSING'));
  fs.writeFileSync(source,'// restored fictional source\n');fs.writeFileSync(f.config,'not json');
  await assert.rejects(f.publicCall('budget_inspect'),code('DEVELOPMENT_BUDGET_CONFIG_JSON'));
  await assert.rejects(f.publicCall('budget_preflight',f.preflight()),code('DEVELOPMENT_BUDGET_CONFIG_JSON'));assert.equal(f.read()[KEY],undefined);
});

test('actual source descriptor drift is retained as a read failure, never a complete stale preflight',async t=>{
  const f=fixture(t),file=path.join(f.root,'main.mjs'),target=fs.statSync(file);let hit=0;
  const undo=patch(t,fs,'readSync',original=>function(fd,...args){
    const current=fs.fstatSync(fd);if(current.dev===target.dev&&current.ino===target.ino&&hit++===0)fs.appendFileSync(file,'// actual concurrent fixture mutation\n');
    return Reflect.apply(original,this,[fd,...args]);
  });
  await assert.rejects(f.publicCall('budget_preflight',f.preflight()),code('DEVELOPMENT_BUDGET_SOURCE_CHANGED'));undo();assert.ok(hit>0);assert.equal(f.read()[KEY],undefined);
});

test('a source provider failure retains the original Error and does not switch readers or retry',async t=>{
  const f=fixture(t),target=fs.statSync(path.join(f.root,'main.mjs')),sentinel=Object.assign(Error('Fictional source read provider EIO'),{code:'EIO'});let hits=0;
  const undo=patch(t,fs,'readSync',original=>function(fd,...args){const current=fs.fstatSync(fd);if(current.dev===target.dev&&current.ino===target.ino){hits++;throw sentinel;}return Reflect.apply(original,this,[fd,...args]);});
  await assert.rejects(f.publicCall('budget_preflight',f.preflight()),error=>error===sentinel);undo();assert.equal(hits,1);assert.equal(f.read()[KEY],undefined);
});

function server(root,cache){
  const child=spawn(process.execPath,['--no-warnings',ENTRY,'serve','codex'],{cwd:root,env:{...process.env,COMPANY_PLUGIN_DATA:cache},stdio:['pipe','pipe','pipe']});
  const pending=new Map();let sequence=0,closed=false,stderr='';
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-12000);});
  const lines=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
  lines.on('line',line=>{let reply;try{reply=JSON.parse(line);}catch(error){for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();return;}const item=pending.get(reply.id);if(item){clearTimeout(item.timer);pending.delete(reply.id);item.resolve(reply);}});
  child.once('error',error=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();});
  const ended=new Promise(resolve=>child.once('close',(exit,signal)=>{closed=true;for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('SOURCE MCP closed before reply: '+exit+' '+signal+' '+stderr));}pending.clear();resolve({exit,signal});}));
  const request=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('SOURCE MCP response timeout: '+stderr));},10000);timer.unref?.();pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  return {request,call:(args,meta)=>request('tools/call',{name:'company_develop',arguments:args,...(meta===undefined?{}:{_meta:meta})}),close:async()=>{if(!closed)child.stdin.end();const timer=setTimeout(()=>{if(!closed)child.kill('SIGKILL');},3000);timer.unref?.();try{const result=await ended;assert.equal(result.exit,0,'SOURCE MCP exit: '+result.signal+' '+stderr);}finally{clearTimeout(timer);lines.close();}}};
}
function payload(reply){assert.equal(reply.error,undefined);assert.notEqual(reply.result?.isError,true,reply.result?.content?.[0]?.text);return JSON.parse(reply.result.content[0].text);}
function denied(reply,pattern){assert.equal(reply.error,undefined);assert.equal(reply.result?.isError,true);assert.match(reply.result.content.map(x=>x.text??'').join('\n'),pattern);}
test('actual MCP stdio forwards synthetic HOST metadata to budget inspection/preflight while missing metadata holds',async t=>{
  const f=fixture(t),before=f.read(),mcp=server(f.root,f.cache);f.track(()=>mcp.close());
  assert.equal((await mcp.request('initialize',{protocolVersion:'2024-11-05'})).result.serverInfo.name,'company');
  denied(await mcp.call(f.args('budget_inspect')),/MCP_CODEX_ROOT_CALLER_REQUIRED/);
  const inspected=payload(await mcp.call(f.args('budget_inspect'),f.meta));assert.equal(inspected.status,'inspected');assert.equal(inspected.configuration.max_bytes_ceiling,100000);
  const measured=payload(await mcp.call(f.args('budget_preflight',f.preflight()),f.meta));assert.equal(measured.preflight.canonical_generation,false);assert.equal(measured.phases.sources.known,true);assert.equal(measured.phases.complete_candidate.known,false);
  denied(await mcp.call(f.args('budget_inspect'),{threadId:randomUUID(),sessionId:f.session}),/MCP_CODEX_ROOT_CALLER_REQUIRED/);assert.deepEqual(f.read(),before);
});

// Pure transport DATA over the actual registered catalog. These cases add no
// company, filesystem, subprocess, server, provider or model operation.
const CATALOG_TRANSPORT_IDS=[
  {kind:'ASCII',id:'a'.repeat(256)},
  {kind:'BMP UTF-8',id:'é'.repeat(128)},
  {kind:'astral UTF-8',id:'😀'.repeat(64)},
  {kind:'escaped quote',id:'"'.repeat(128)},
  {kind:'escaped backslash',id:'\\'.repeat(128)},
  {kind:'escaped control',id:'\u0000'.repeat(42)+'abcd'}
];
function catalogTransportTools(ceiling){
  const tools=structuredClone(toolList);
  tools.find(tool=>tool.name==='company_develop').inputSchema.properties.max_bytes.maximum=ceiling;
  return tools;
}
const catalogJsonBytes=(id,tools)=>Buffer.byteLength(JSON.stringify({jsonrpc:'2.0',id,result:{tools}}),'utf8');

test('catalog transport preserves all 25 actual tools and six budget actions for maximum encoded IDs and both ceilings',()=>{
  assert.equal(CATALOG_MAX_BYTES,131072);assert.equal(REPLY_MAX_BYTES,65536);assert.equal(MODEL_MAX_BYTES,30000);
  assert.equal(DEVELOPMENT_BUDGET_ACTIONS.length,6);
  for(const ceiling of [100000,1000000]){
    const tools=catalogTransportTools(ceiling),expected=structuredClone(tools),before=JSON.stringify(tools);
    assert.equal(tools.length,25);assert.equal(new Set(tools.map(tool=>tool.name)).size,25);
    const schema=tools.find(tool=>tool.name==='company_develop').inputSchema;
    assert.equal(schema.properties.max_bytes.maximum,ceiling);
    assert.deepEqual(schema.properties.budget_input,developmentBudgetInputSchema);
    for(const action of DEVELOPMENT_BUDGET_ACTIONS)assert.ok(schema.properties.action.enum.includes(action));
    for(const {kind,id}of CATALOG_TRANSPORT_IDS){
      assert.equal(Buffer.byteLength(JSON.stringify(id),'utf8'),258,kind);
      const text=toolCatalogReply(id,tools),reply=JSON.parse(text);
      assert.ok(Buffer.byteLength(text,'utf8')<=CATALOG_MAX_BYTES,kind);
      assert.deepEqual(reply,{jsonrpc:'2.0',id,result:{tools:expected}},kind+' at ceiling '+ceiling);
      assert.equal(JSON.stringify(tools),before,'catalog serialization must not mutate actual schemas');
    }
  }
});

test('catalog JSON body accepts exactly 131072 bytes and rejects one more with no partial tool list',()=>{
  for(const ceiling of [100000,1000000])for(const {kind,id}of CATALOG_TRANSPORT_IDS){
    const tools=catalogTransportTools(ceiling),padding=CATALOG_MAX_BYTES-catalogJsonBytes(id,tools);
    assert.ok(padding>=0,'the complete actual catalog must fit the selected catalog boundary');
    tools.at(-1).description+='x'.repeat(padding);
    const expected=structuredClone(tools),before=JSON.stringify(tools);
    assert.equal(catalogJsonBytes(id,tools),131072);
    const acceptedText=toolCatalogReply(id,tools),accepted=JSON.parse(acceptedText);
    assert.equal(Buffer.byteLength(acceptedText,'utf8'),131072,kind);
    assert.deepEqual(accepted,{jsonrpc:'2.0',id,result:{tools:expected}});
    assert.equal(JSON.stringify(tools),before,'the exact-boundary serializer must preserve all input data');
    tools.at(-1).description+='x';assert.equal(catalogJsonBytes(id,tools),131073);
    const rejectedText=toolCatalogReply(id,tools),rejected=JSON.parse(rejectedText);
    assert.ok(Buffer.byteLength(rejectedText,'utf8')<=REPLY_MAX_BYTES);
    assert.deepEqual(Object.keys(rejected).sort(),['error','id','jsonrpc']);
    assert.equal(rejected.jsonrpc,'2.0');assert.equal(rejected.id,id);assert.equal(rejected.error.code,-32603);
    assert.equal(typeof rejected.error.message,'string');assert.ok(rejected.error.message.length>0);
    assert.equal(Object.hasOwn(rejected,'result'),false);
    assert.equal(rejectedText.includes('"tools":'),false,'overflow must not publish a shortened catalog');
  }
});

test('catalog hostile IDs normalize to null without invoking caller getters, Proxy traps or coercion',()=>{
  const tools=catalogTransportTools(1000000),expected=structuredClone(tools);let invoked=0;
  const rejectInspection=()=>{invoked++;throw Error('Hostile catalog ID was inspected or coerced');};
  const getter=Object.defineProperty({[Symbol.toPrimitive]:rejectInspection},'toJSON',{get:rejectInspection});
  const proxy=new Proxy({},{get:rejectInspection,ownKeys:rejectInspection,getOwnPropertyDescriptor:rejectInspection,getPrototypeOf:rejectInspection});
  const hostile=[
    {kind:'oversized ASCII',id:'a'.repeat(257)},{kind:'oversized escaped quote',id:'"'.repeat(129)},
    {kind:'oversized astral',id:'😀'.repeat(65)},{kind:'getter object',id:getter},{kind:'Proxy object',id:proxy},
    {kind:'array',id:[]},{kind:'boolean',id:true},{kind:'undefined',id:undefined},{kind:'null',id:null},
    {kind:'BigInt',id:1n},{kind:'Symbol',id:Symbol('fictional-id')},{kind:'function',id:rejectInspection},
    {kind:'NaN',id:NaN},{kind:'positive infinity',id:Infinity},{kind:'negative infinity',id:-Infinity}
  ];
  for(const {kind,id}of hostile){
    const text=toolCatalogReply(id,tools),reply=JSON.parse(text);
    assert.ok(Buffer.byteLength(text,'utf8')<=CATALOG_MAX_BYTES);
    assert.deepEqual(reply,{jsonrpc:'2.0',id:null,result:{tools:expected}},kind);
  }
  assert.equal(invoked,0);
  for(const id of [0,17])assert.deepEqual(JSON.parse(toolCatalogReply(id,tools)),{jsonrpc:'2.0',id,result:{tools:expected}});
});

test('ordinary replies cannot obtain the catalog budget by shape and retain the 30000-byte text limit',()=>{
  assert.equal(REPLY_MAX_BYTES,65536);assert.equal(MODEL_MAX_BYTES,30000);
  for(const ceiling of [100000,1000000])for(const {id}of CATALOG_TRANSPORT_IDS){
    const tools=catalogTransportTools(ceiling),bodyBytes=catalogJsonBytes(id,tools);
    assert.ok(bodyBytes>REPLY_MAX_BYTES);assert.ok(bodyBytes<=CATALOG_MAX_BYTES);
    assert.deepEqual(JSON.parse(toolCatalogReply(id,tools)),{jsonrpc:'2.0',id,result:{tools}});
    const text=rpcReply(id,{tools}),reply=JSON.parse(text);
    assert.ok(Buffer.byteLength(text,'utf8')<=REPLY_MAX_BYTES);
    assert.equal(reply.id,id);assert.equal(reply.result.isError,true);assert.equal(reply.result.tools,undefined);
  }
  const exactText='é'.repeat(15000);assert.equal(Buffer.byteLength(exactText,'utf8'),30000);
  const exact={content:[{type:'text',text:exactText}]};
  assert.deepEqual(JSON.parse(rpcReply('ordinary-text',exact)),{jsonrpc:'2.0',id:'ordinary-text',result:exact});
  const oversized={content:[{type:'text',text:exactText+'a'}]};assert.equal(Buffer.byteLength(oversized.content[0].text,'utf8'),30001);
  const text=rpcReply('ordinary-text',oversized),reply=JSON.parse(text);
  assert.ok(Buffer.byteLength(text,'utf8')<=REPLY_MAX_BYTES);
  assert.equal(reply.result.isError,true);assert.notEqual(reply.result.content[0].text,oversized.content[0].text);
});
