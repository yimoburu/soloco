import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import childProcess from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';

// AUTHORED_UNRUN. Fictional structured transport/channel DATA only. These
// software cases create no original admission, interpreter, Native birth,
// private pipe, completion issuer, company qualification or spending authority.
const peers=new URL('../plugins/soloco/runtime/peers/',import.meta.url);
const sha=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const code=expected=>error=>error?.code===expected;
const NATIVE='11111111-1111-7111-8111-111111111111';
const SESSION='22222222-2222-7222-8222-222222222222';
const TURN='SYNTHETIC-bootstrap-turn';
const CONTEXT='SYNTHETIC complete assigned context 雪😀; every character is required.';
const CONTEXT_SHA=sha(CONTEXT);
const FINAL='SYNTHETIC reconstruction preserves UNKNOWN and all finite limits.';

function denyExternal(){
  const undo=[],calls=[];
  const replace=(object,key)=>{const original=object[key];object[key]=()=>{calls.push(key);throw Error('Source bootstrap fixture forbids external '+key);};undo.push(()=>{object[key]=original;});};
  for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])replace(childProcess,key);
  replace(childProcess.ChildProcess.prototype,'spawn');replace(net.Socket.prototype,'connect');replace(net.Server.prototype,'listen');
  for(const [object,keys]of [[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['request','get','createServer']],[https,['request','get','createServer']],[dgram,['createSocket']]])for(const key of keys)replace(object,key);
  for(const key of ['bind','connect','send'])replace(dgram.Socket.prototype,key);
  replace(globalThis,'fetch');replace(process,'kill');syncBuiltinESMExports();
  return {calls,restore(){for(const undoOne of undo.reverse())undoOne();syncBuiltinESMExports();}};
}
async function source(body){
  const external=denyExternal(),selectors=Object.fromEntries(['HOME','CODEX_HOME','TMPDIR','TMP','TEMP'].map(key=>[key,process.env[key]]));
  try{
    // Guards precede every project import, including the runner's closure.
    const protocol=await import(new URL('bootstrap-membership-host-protocol.mjs',peers));
    const codec=await import(new URL('bootstrap-membership-delivery-frame.mjs',peers));
    const runner=await import(new URL('bootstrap-membership-native-runner.mjs',peers));
    const ledger=await import(new URL('ledger.mjs',peers));
    await body({protocol,codec,runner,ledger});
    assert.deepEqual(external.calls,[]);
    assert.deepEqual(Object.fromEntries(Object.keys(selectors).map(key=>[key,process.env[key]])),selectors);
  }finally{external.restore();}
}
function fictionalProtocol(module,overrides={}){
  const owner=Symbol('SYNTHETIC grammar owner'),sent=[],order=[],channelCalls={header:0,read:0,submit:0};let callbacks,readThrough=0,submitted=null,closed=0,call=0;
  const input=[{type:'text',text:'Work instruction:\nSYNTHETIC fixed bootstrap instruction DATA.'},{type:'text',text:'SYNTHETIC complete frame DATA; no original preflight token.'}];
  const launch={cwd:'/SYNTHETIC/bootstrap-project',profile_id:module.BOOTSTRAP_NATIVE_PERMISSION,instruction_sources:[],base_instructions:module.BOOTSTRAP_NATIVE_BASE,developer_instructions:module.BOOTSTRAP_NATIVE_DEVELOPER,environment:{}};
  const channel={
    header(){channelCalls.header++;return {SYNTHETIC_NONAUTHORIZING_CHANNEL:true,sha256:CONTEXT_SHA,total_characters:CONTEXT.length};},
    read(args){channelCalls.read++;assert.equal(args.sha256,CONTEXT_SHA);assert.equal(args.offset,readThrough);assert(args.length>0&&args.length<=4096);const end=Math.min(CONTEXT.length,args.offset+args.length);readThrough=end;return {sha256:CONTEXT_SHA,offset:args.offset,next_offset:end,text:CONTEXT.slice(args.offset,end)};},
    submit(args){channelCalls.submit++;if(readThrough!==CONTEXT.length)throw Object.assign(Error('SYNTHETIC_FULL_READ_REQUIRED'),{code:'SYNTHETIC_FULL_READ_REQUIRED'});assert.equal(args.sha256,CONTEXT_SHA);assert(submitted===null||submitted===args.content);submitted??=args.content;return {SYNTHETIC_NONAUTHORIZING_CHANNEL:true,attributed_submission:true,acceptance:false};}
  };
  const transport={attach(value){assert.equal(callbacks,undefined);callbacks=value;return ()=>{closed++;};},send(value){sent.push(clone(value));order.push('send:'+String(value.method??'tool-reply'));}};
  const options={owner,transport,launch,input,guard(stage){order.push('guard:'+stage);},onThread(native){assert.equal(native,NATIVE);order.push('SYNTHETIC-birth-before-turn');},channel,...overrides};
  const host=module.createBootstrapMembershipHostProtocol(options);
  const receive=frame=>callbacks.message(frame);
  const threadResult=(changes={})=>({thread:{id:NATIVE,sessionId:SESSION,parentThreadId:null,forkedFromId:null,turns:[],canAcceptDirectInput:true,ephemeral:false},cwd:launch.cwd,runtimeWorkspaceRoots:[launch.cwd],activePermissionProfile:{id:':read-only'},approvalPolicy:'never',instructionSources:[],...changes});
  const start=()=>{host.start(owner);receive({id:'soloco-peer-1',result:{SYNTHETIC_initialize:true}});};
  const thread=()=>receive({id:'soloco-peer-2',result:threadResult()});
  const running=()=>{start();thread();receive({id:'soloco-peer-3',result:{turn:{id:TURN,status:'inProgress'}}});};
  const frame=(tool,args,changes={})=>{call++;return {id:'SYNTHETIC-tool-rpc-'+call,method:'item/tool/call',params:{threadId:NATIVE,turnId:TURN,callId:'SYNTHETIC-call-'+call,namespace:null,tool,arguments:args},...changes};};
  const tool=(name,args)=>receive(frame(name,args));
  const delivery=()=>{tool('soloco_context_header',{});tool('soloco_context_read',{sha256:CONTEXT_SHA,offset:0,length:CONTEXT.length});tool('soloco_context_submit',{sha256:CONTEXT_SHA,content:FINAL});};
  const final=(value=FINAL,id='SYNTHETIC-final')=>receive({method:'item/completed',params:{threadId:NATIVE,turnId:TURN,item:{id,type:'agentMessage',phase:'final_answer',text:value}}});
  const terminal=(value={id:TURN,status:'completed',error:null})=>receive({method:'turn/completed',params:{threadId:NATIVE,turn:value}});
  return {owner,host,sent,order,input,launch,options,transport,receive,threadResult,start,thread,running,frame,tool,delivery,final,terminal,channelCalls,inspect:()=>host.inspect(owner),closed:()=>closed};
}

test('fixed bootstrap catalogue retains exact three schemas and original callback bounds',{concurrency:false},()=>source(({protocol,codec})=>{
  const description='Private bootstrap membership context protocol; identity and authority are supplied only by the original protected composition.';
  assert.deepEqual(codec.bootstrapReadonly3Tools(),[
    {type:'function',name:'soloco_context_header',description,inputSchema:{type:'object',properties:{},required:[],additionalProperties:false}},
    {type:'function',name:'soloco_context_read',description,inputSchema:{type:'object',properties:{sha256:{type:'string'},offset:{type:'integer',minimum:0},length:{type:'integer',minimum:1,maximum:4096}},required:['sha256','offset','length'],additionalProperties:false}},
    {type:'function',name:'soloco_context_submit',description,inputSchema:{type:'object',properties:{sha256:{type:'string'},content:{type:'string'}},required:['sha256','content'],additionalProperties:false}}
  ]);
  assert.equal(protocol.BOOTSTRAP_NATIVE_PERMISSION,':read-only');assert.notEqual(protocol.BOOTSTRAP_NATIVE_PERMISSION,codec.BOOTSTRAP_PROFILE);
  assert.throws(()=>codec.bootstrapReadonly3Tools(['soloco_peer_execute']),code('DELIVERY_FRAME_ARGUMENT'));
}));

test('fictional fresh handshake preserves initialize1 thread2 turn3 and binds birth before exact input',{concurrency:false},()=>source(({protocol,codec})=>{
  const f=fictionalProtocol(protocol);f.start();assert.deepEqual(f.sent.map(v=>[v.id??null,v.method]),[['soloco-peer-1','initialize'],[null,'initialized'],['soloco-peer-2','thread/start']]);
  const start=f.sent[2];assert.deepEqual(start.params.dynamicTools,codec.bootstrapReadonly3Tools());assert.equal(start.params.permissions,':read-only');assert.equal(start.params.approvalPolicy,'never');assert.equal(start.params.ephemeral,false);assert.equal(Object.hasOwn(start.params,'threadId'),false);
  f.receive({method:'thread/started',params:{thread:{id:NATIVE}}});f.thread();
  assert.deepEqual(f.sent[3],{id:'soloco-peer-3',method:'turn/start',params:{threadId:NATIVE,input:f.input}});
  assert(f.order.indexOf('SYNTHETIC-birth-before-turn')<f.order.indexOf('send:turn/start'));
  f.receive({id:'soloco-peer-3',result:{turn:{id:TURN,status:'inProgress'}}});assert.equal(f.inspect().state,'running');
}));

test('fictional channel requires full delivery and final output equals its first attributed submission',{concurrency:false},()=>source(({protocol})=>{
  const f=fictionalProtocol(protocol);f.running();f.delivery();f.final();f.terminal();
  assert.deepEqual(f.channelCalls,{header:1,read:1,submit:1});assert.equal(f.inspect().state,'terminal');assert.equal(f.inspect().final,FINAL);assert.equal(f.inspect().submission,FINAL);assert.equal(f.inspect().terminal.status,'completed');assert.equal(f.inspect().pending,0);
  f.host.close(f.owner);assert.equal(f.closed(),1);
}));

test('a matching callback replay returns cached DATA and cannot call the channel twice',{concurrency:false},()=>source(({protocol})=>{
  const f=fictionalProtocol(protocol);f.running();const request=f.frame('soloco_context_header',{});f.receive(request);const answer=clone(f.sent.at(-1));f.receive(clone(request));
  assert.equal(f.channelCalls.header,1);assert.deepEqual(f.sent.at(-1),answer);
  const changed=clone(request);changed.id='SYNTHETIC-foreign-rpc';assert.throws(()=>f.receive(changed),code('BOOTSTRAP_HOST_CALL_REPLAY'));assert.equal(f.inspect().state,'held');
}));

test('fresh protocol refuses a transport already claimed by another instruction owner',{concurrency:false},()=>source(({protocol})=>{
  const f=fictionalProtocol(protocol);assert.throws(()=>protocol.createBootstrapMembershipHostProtocol({...f.options,owner:Symbol('SYNTHETIC other owner')}),code('BOOTSTRAP_HOST_ORIGINAL_SOURCE_REQUIRED'));
  assert.throws(()=>f.host.start(Symbol('SYNTHETIC copied owner')),code('BOOTSTRAP_HOST_OWNER'));assert.deepEqual(f.sent,[]);
}));

test('constructor rejects old resume inputs and substituted permission or instruction profiles',{concurrency:false},()=>source(({protocol})=>{
  for(const change of [{resume_native_id:NATIVE},{profile:'soloco-bootstrap-membership-readonly3-v1'}]){
    const f=fictionalProtocol(protocol);assert.throws(()=>protocol.createBootstrapMembershipHostProtocol({...f.options,transport:{attach(){return ()=>{};},send(){}},...change}),code('BOOTSTRAP_HOST_SHAPE'));
  }
  for(const change of [{profile_id:'soloco-bootstrap-membership-readonly3-v1'},{profile_id:':workspace'},{instruction_sources:['/SYNTHETIC/old/AGENTS.md']},{base_instructions:'SYNTHETIC substituted'}]){
    const f=fictionalProtocol(protocol);assert.throws(()=>protocol.createBootstrapMembershipHostProtocol({...f.options,transport:{attach(){return ()=>{};},send(){}},launch:{...f.launch,...change}}),code('BOOTSTRAP_HOST_ORIGINAL_SOURCE_REQUIRED'));
  }
}));

test('correlated fresh thread metadata rejects history parents fork or non-v7 identity',{concurrency:false},()=>source(({protocol})=>{
  for(const change of [{turns:[{id:'SYNTHETIC old turn'}]},{parentThreadId:NATIVE},{forkedFromId:NATIVE},{id:'11111111-1111-4111-8111-111111111111'},{sessionId:'old-session'},{ephemeral:true},{canAcceptDirectInput:false}]){
    const f=fictionalProtocol(protocol);f.start();const value=f.threadResult();Object.assign(value.thread,change);assert.throws(()=>f.receive({id:'soloco-peer-2',result:value}),code('BOOTSTRAP_HOST_EFFECTIVE_PROFILE'));assert.equal(f.sent.some(v=>v.method==='turn/start'),false);assert.equal(f.order.includes('SYNTHETIC-birth-before-turn'),false);
  }
}));

test('correlated effective read-only profile cannot be replaced by a descriptor label or changed scope',{concurrency:false},()=>source(({protocol})=>{
  for(const change of [{activePermissionProfile:{id:'soloco-bootstrap-membership-readonly3-v1'}},{activePermissionProfile:{id:':workspace'}},{approvalPolicy:'on-request'},{cwd:'/SYNTHETIC/other'},{runtimeWorkspaceRoots:['/SYNTHETIC/other']},{instructionSources:['/SYNTHETIC/AGENTS.md']}]){
    const f=fictionalProtocol(protocol);f.start();assert.throws(()=>f.receive({id:'soloco-peer-2',result:f.threadResult(change)}),code('BOOTSTRAP_HOST_EFFECTIVE_PROFILE'));assert.equal(f.sent.some(v=>v.method==='turn/start'),false);
  }
}));

test('missing original birth callback or a synchronous source failure prevents the first turn',{concurrency:false},()=>source(({protocol})=>{
  assert.throws(()=>fictionalProtocol(protocol,{onThread:undefined}),code('BOOTSTRAP_HOST_ORIGINAL_SOURCE_REQUIRED'));
  const failure=Object.assign(Error('SYNTHETIC birth source unavailable'),{code:'SYNTHETIC_BIRTH_UNAVAILABLE'}),f=fictionalProtocol(protocol,{onThread(){throw failure;}});f.start();assert.throws(()=>f.thread(),error=>error===failure);assert.equal(f.inspect().state,'held');assert.equal(f.sent.some(v=>v.method==='turn/start'),false);
  const asyncBirth=fictionalProtocol(protocol,{onThread(){return Promise.resolve({native_id:NATIVE});}});asyncBirth.start();assert.throws(()=>asyncBirth.thread(),code('BOOTSTRAP_HOST_ASYNC_CALLBACK'));assert.equal(asyncBirth.sent.some(v=>v.method==='turn/start'),false);
}));

test('unread context cannot become the first attributed submission in the synthetic channel',{concurrency:false},()=>source(({protocol})=>{
  const f=fictionalProtocol(protocol);f.running();assert.throws(()=>f.tool('soloco_context_submit',{sha256:CONTEXT_SHA,content:FINAL}),code('SYNTHETIC_FULL_READ_REQUIRED'));assert.equal(f.inspect().submission,null);assert.equal(f.inspect().state,'held');
}));

test('read length and submit grammar preserve 4096 bounds without operation identity arguments',{concurrency:false},()=>source(({protocol})=>{
  for(const args of [{sha256:CONTEXT_SHA,offset:0,length:4097},{sha256:CONTEXT_SHA,offset:-1,length:1},{sha256:CONTEXT_SHA,offset:0,length:0},{sha256:CONTEXT_SHA,offset:0,length:1.5}]){const f=fictionalProtocol(protocol);f.running();assert.throws(()=>f.tool('soloco_context_read',args),code('BOOTSTRAP_HOST_READ_RANGE'));assert.equal(f.channelCalls.read,0);}
  const f=fictionalProtocol(protocol);f.running();assert.throws(()=>f.tool('soloco_context_submit',{operation_id:'SYNTHETIC operation',sha256:CONTEXT_SHA,content:FINAL}),code('BOOTSTRAP_HOST_SHAPE'));assert.equal(f.channelCalls.submit,0);
}));

test('foreign thread turn namespace call identity and RPC responses cannot bind this protocol',{concurrency:false},()=>source(({protocol})=>{
  for(const change of [{threadId:SESSION},{turnId:'SYNTHETIC foreign turn'},{namespace:'functions'},{tool:'soloco_peer_execute'},{callId:''}]){const f=fictionalProtocol(protocol);f.running();const frame=f.frame('soloco_context_header',{});Object.assign(frame.params,change);assert.throws(()=>f.receive(frame),code('BOOTSTRAP_HOST_TOOL_BINDING'));assert.deepEqual(f.channelCalls,{header:0,read:0,submit:0});}
  for(const id of [{SYNTHETIC:'object-id'},[],null,-1,1.5,'']){const f=fictionalProtocol(protocol);f.running();assert.throws(()=>f.receive(f.frame('soloco_context_header',{},{id})),code('BOOTSTRAP_HOST_RPC_ID'));assert.equal(f.channelCalls.header,0);}
  const f=fictionalProtocol(protocol);f.start();assert.throws(()=>f.receive({id:'SYNTHETIC foreign RPC',result:{}}),code('BOOTSTRAP_HOST_RPC_REPLAY'));assert.equal(f.inspect().state,'held');
}));

test('unsupported server requests and notifications are held without widening the tool catalogue',{concurrency:false},()=>source(({protocol})=>{
  for(const method of ['thread/resume','file/read','item/tool/unknown']){const f=fictionalProtocol(protocol);f.running();assert.throws(()=>f.receive({id:'SYNTHETIC request',method,params:{}}),code('BOOTSTRAP_HOST_SERVER_METHOD'));assert.equal(f.inspect().state,'held');}
  const f=fictionalProtocol(protocol);f.running();assert.throws(()=>f.receive({method:'SYNTHETIC/unknown',params:{threadId:NATIVE,turnId:TURN}}),code('BOOTSTRAP_HOST_NOTIFICATION'));
}));

test('oversized or invalid Unicode input and submission never substitute UTF8 bytes',{concurrency:false},()=>source(({protocol})=>{
  const lone=String.fromCharCode(0xd800);
  for(const text of [lone,'x'.repeat(100001)]){const f=fictionalProtocol(protocol);assert.throws(()=>protocol.createBootstrapMembershipHostProtocol({...f.options,transport:{attach(){return ()=>{};},send(){}},input:[{type:'text',text},{type:'text',text:'SYNTHETIC frame'}]}),code('BOOTSTRAP_HOST_INPUT'));}
  for(const content of [lone,'x'.repeat(12001)]){const f=fictionalProtocol(protocol);f.running();assert.throws(()=>f.tool('soloco_context_submit',{sha256:CONTEXT_SHA,content}),code('BOOTSTRAP_HOST_FIRST_SUBMISSION'));assert.equal(f.channelCalls.submit,0);}
  const f=fictionalProtocol(protocol);f.running();assert.throws(()=>f.receive({method:'SYNTHETIC/oversized',params:{threadId:NATIVE,turnId:TURN,text:'x'.repeat(100001)}}),code('BOOTSTRAP_HOST_MESSAGES'));
}));

test('completed turn requires the unchanged first submission and rejects post-terminal messages',{concurrency:false},()=>source(({protocol})=>{
  const noSubmission=fictionalProtocol(protocol);noSubmission.running();noSubmission.final();assert.throws(()=>noSubmission.terminal(),code('BOOTSTRAP_HOST_TERMINAL'));
  const changed=fictionalProtocol(protocol);changed.running();changed.delivery();changed.final(FINAL+' changed');assert.throws(()=>changed.terminal(),code('BOOTSTRAP_HOST_TERMINAL'));
  const second=fictionalProtocol(protocol);second.running();second.delivery();assert.throws(()=>second.tool('soloco_context_submit',{sha256:CONTEXT_SHA,content:FINAL+' changed'}),code('BOOTSTRAP_HOST_FIRST_SUBMISSION'));assert.equal(second.channelCalls.submit,1);
  const f=fictionalProtocol(protocol);f.running();f.delivery();f.final();f.terminal();assert.throws(()=>f.receive({method:'turn/started',params:{threadId:NATIVE,turn:{id:TURN,status:'inProgress'}}}),code('BOOTSTRAP_HOST_CLOSED'));assert.equal(f.inspect().terminal.status,'completed');
}));

test('original RPC failures and negative turn terminals remain non-success evidence',{concurrency:false},()=>source(({protocol})=>{
  const errored=fictionalProtocol(protocol);errored.host.start(errored.owner);assert.throws(()=>errored.receive({id:'soloco-peer-1',error:{code:-1,message:'SYNTHETIC unavailable'}}),code('BOOTSTRAP_HOST_RPC_ERROR'));assert.equal(errored.inspect().state,'held');
  for(const status of ['failed','interrupted']){const f=fictionalProtocol(protocol);f.running();f.terminal({id:TURN,status,error:{message:'SYNTHETIC negative terminal'}});assert.equal(f.inspect().terminal.status,status);assert.notEqual(f.inspect().terminal.status,'completed');assert.equal(f.inspect().submission,null);}
}));

test('thread turn and item replay cannot start another attempt or replace a final answer',{concurrency:false},()=>source(({protocol})=>{
  const thread=fictionalProtocol(protocol);thread.start();thread.receive({method:'thread/started',params:{thread:{id:NATIVE}}});assert.throws(()=>thread.receive({method:'thread/started',params:{thread:{id:NATIVE}}}),code('BOOTSTRAP_HOST_THREAD_REPLAY'));
  const turn=fictionalProtocol(protocol);turn.running();turn.receive({method:'turn/started',params:{threadId:NATIVE,turn:{id:TURN,status:'inProgress'}}});assert.throws(()=>turn.receive({method:'turn/started',params:{threadId:NATIVE,turn:{id:TURN,status:'inProgress'}}}),code('BOOTSTRAP_HOST_TURN_REPLAY'));
  const item=fictionalProtocol(protocol);item.running();item.final();assert.throws(()=>item.final(),code('BOOTSTRAP_HOST_ITEM_REPLAY'));
}));

test('foreign and serialized runner caps reject before policy reads spawn or any charge writer',{concurrency:false},()=>source(async({runner,ledger})=>{
  const options={scope_root:'/SYNTHETIC/not-created/scope',cwd:'/SYNTHETIC/not-created/project',read_paths:[],state_root:'/SYNTHETIC/not-created/state',scratch_root:'/SYNTHETIC/not-created/scratch'};
  const originalStat=fs.lstatSync,write=ledger.PeerLedger.prototype.write,guarded=ledger.PeerLedger.prototype.guardedWrite;let policyReads=0,charges=0;
  fs.lstatSync=()=>{policyReads++;throw Error('SYNTHETIC policy read must not happen');};
  ledger.PeerLedger.prototype.write=ledger.PeerLedger.prototype.guardedWrite=()=>{charges++;throw Error('SYNTHETIC charge must not happen');};
  try{
    const serialized={protocol:'peer-bootstrap-membership-admission-v1',kind:'peer-bootstrap-membership-reconstruction',admission_ref:{family:'work_items',id:'SYNTHETIC admission',revision:1,sha256:'f'.repeat(64)}};
    for(const fake of [{},Object.freeze(Object.create(null)),serialized,clone(serialized)])await assert.rejects(()=>runner.runOriginalPeerBootstrapMembership(fake,options),code('BOOTSTRAP_ORIGINAL_CAP_REQUIRED'));
    assert.equal(policyReads,0);assert.equal(charges,0);
  }finally{fs.lstatSync=originalStat;ledger.PeerLedger.prototype.write=write;ledger.PeerLedger.prototype.guardedWrite=guarded;}
}));

const fictionalUsage=()=>({totalTokens:8,inputTokens:3,cachedInputTokens:1,cacheWriteInputTokens:0,outputTokens:5,reasoningOutputTokens:2});
test('pinned normal status reasoning usage and plan notifications preserve the attributed lifecycle',{concurrency:false},()=>source(({protocol})=>{
  const f=fictionalProtocol(protocol);f.start();
  f.receive({method:'thread/status/changed',params:{threadId:NATIVE,status:{type:'idle'}}});
  assert.equal(f.inspect().native_id,null);assert.equal(f.sent.some(v=>v.method==='turn/start'),false,'progress cannot create a thread');
  f.thread();f.receive({method:'thread/status/changed',params:{threadId:NATIVE,status:{type:'active',activeFlags:[]}}});
  f.receive({method:'turn/started',params:{threadId:NATIVE,turn:{id:TURN,status:'inProgress'}}});
  assert.equal(f.inspect().turn_id,null,'status and TurnStarted cannot replace correlated turn/start');
  f.receive({id:'soloco-peer-3',result:{turn:{id:TURN,status:'inProgress'}}});
  const progress=[
    ['item/reasoning/summaryPartAdded',{itemId:'SYNTHETIC-reasoning',summaryIndex:0}],
    ['item/reasoning/summaryTextDelta',{itemId:'SYNTHETIC-reasoning',summaryIndex:0,delta:'SYNTHETIC summary'}],
    ['item/reasoning/textDelta',{itemId:'SYNTHETIC-reasoning',contentIndex:0,delta:'SYNTHETIC reasoning'}],
    ['item/plan/delta',{itemId:'SYNTHETIC-plan',delta:'SYNTHETIC plan'}],
    ['turn/plan/updated',{explanation:null,plan:[{step:'Read complete context',status:'inProgress'}]}],
    ['thread/tokenUsage/updated',{tokenUsage:{total:fictionalUsage(),last:fictionalUsage(),modelContextWindow:null}}],
    ['rawResponse/completed',{responseId:'SYNTHETIC-response',usage:fictionalUsage(),usageMetadata:{amount:null,metadata:{SYNTHETIC_untrusted_business_DATA:true}}}],
    ['rawResponseItem/completed',{item:{type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'SYNTHETIC opaque raw item cannot be final evidence'}]}}]
  ];
  for(const [method,params]of progress)f.receive({method,params:{threadId:NATIVE,turnId:TURN,...params}});
  assert.equal(f.inspect().final,null);assert.equal(f.inspect().submission,null);
  f.delivery();f.receive({method:'serverRequest/resolved',params:{threadId:NATIVE,requestId:'SYNTHETIC-tool-rpc-1'}});f.final();
  f.receive({method:'thread/status/changed',params:{threadId:NATIVE,status:{type:'idle'}}});f.terminal();
  const original=f.inspect();
  f.receive({method:'thread/tokenUsage/updated',params:{threadId:NATIVE,turnId:TURN,tokenUsage:{total:fictionalUsage(),last:fictionalUsage(),modelContextWindow:65536}}});
  f.receive({method:'thread/status/changed',params:{threadId:NATIVE,status:{type:'notLoaded'}}});
  f.receive({method:'thread/readState/changed',params:{threadId:NATIVE,readState:{firstUnread:{type:'turn',turnId:TURN},revision:'SYNTHETIC-revision'}}});
  assert.deepEqual(f.inspect(),original,'bounded non-authorizing tail cannot change terminal evidence');
}));

test('pinned account and thread metadata remain bounded DATA with no birth turn or quota authority',{concurrency:false},()=>source(({protocol})=>{
  const f=fictionalProtocol(protocol);f.start();
  const rateLimits={limitId:null,limitName:null,normalModelSlug:null,primary:{usedPercent:17,windowDurationMins:60,resetsAt:123},secondary:null,credits:{hasCredits:true,unlimited:false,balance:'SYNTHETIC 4'},individualLimit:null,spendControlReached:null,planType:'unknown',rateLimitReachedType:null};
  f.receive({method:'account/rateLimits/updated',params:{rateLimits}});assert.equal(f.inspect().native_id,null);assert.equal(f.inspect().turn_id,null);
  f.thread();f.receive({id:'soloco-peer-3',result:{turn:{id:TURN,status:'inProgress'}}});
  f.receive({method:'thread/name/updated',params:{threadId:NATIVE,threadName:'SYNTHETIC name'}});
  f.receive({method:'thread/readState/changed',params:{threadId:NATIVE,readState:{firstUnread:null,revision:'SYNTHETIC-revision'}}});
  assert.equal(f.inspect().final,null);assert.equal(f.inspect().submission,null);assert.deepEqual(f.channelCalls,{header:0,read:0,submit:0});
}));

test('normal metadata rejects foreign identity malformed usage waiting status and external raw tools',{concurrency:false},()=>source(({protocol})=>{
  const cases=[
    ['thread/status/changed',{threadId:SESSION,status:{type:'idle'}},'BOOTSTRAP_HOST_TURN_BINDING'],
    ['thread/status/changed',{threadId:NATIVE,status:{type:'active',activeFlags:['waitingOnApproval']}},'BOOTSTRAP_HOST_ACTIVE_STATUS'],
    ['thread/status/changed',{threadId:NATIVE,status:{type:'systemError'}},'BOOTSTRAP_HOST_STATUS'],
    ['thread/tokenUsage/updated',{threadId:NATIVE,turnId:'SYNTHETIC-other',tokenUsage:{}},'BOOTSTRAP_HOST_TURN_BINDING'],
    ['thread/tokenUsage/updated',{threadId:NATIVE,turnId:TURN,tokenUsage:{total:{...fictionalUsage(),outputTokens:-1},last:fictionalUsage(),modelContextWindow:null}},'BOOTSTRAP_HOST_USAGE'],
    ['rawResponseItem/completed',{threadId:NATIVE,turnId:TURN,item:{type:'local_shell_call'}},'BOOTSTRAP_HOST_EXTERNAL_ITEM'],
    ['rawResponseItem/completed',{threadId:NATIVE,turnId:TURN,item:{type:'function_call',name:'soloco_peer_execute',arguments:'{}'}},'BOOTSTRAP_HOST_EXTERNAL_ITEM'],
    ['item/reasoning/textDelta',{threadId:NATIVE,turnId:TURN,itemId:'SYNTHETIC-r',delta:'DATA',contentIndex:-1},'BOOTSTRAP_HOST_METADATA'],
    ['serverRequest/resolved',{threadId:NATIVE,requestId:'SYNTHETIC-unseen'},'BOOTSTRAP_HOST_RPC_REPLAY']
  ];
  for(const [method,params,expected]of cases){const f=fictionalProtocol(protocol);f.running();assert.throws(()=>f.receive({method,params}),code(expected));assert.equal(f.inspect().state,'held');assert.equal(f.inspect().final,null);assert.deepEqual(f.channelCalls,{header:0,read:0,submit:0});}
}));

test('metadata tails cannot hide new activity or resolve the same owned server request twice',{concurrency:false},()=>source(({protocol})=>{
  const f=fictionalProtocol(protocol);f.running();f.tool('soloco_context_header',{});const resolved={method:'serverRequest/resolved',params:{threadId:NATIVE,requestId:'SYNTHETIC-tool-rpc-1'}};f.receive(resolved);assert.throws(()=>f.receive(resolved),code('BOOTSTRAP_HOST_RPC_REPLAY'));
  for(const method of ['item/reasoning/textDelta','rawResponseItem/completed','item/tool/call']){const tail=fictionalProtocol(protocol);tail.running();tail.delivery();tail.final();tail.terminal();assert.throws(()=>tail.receive({method,params:{threadId:NATIVE,turnId:TURN}}),code('BOOTSTRAP_HOST_CLOSED'));assert.equal(tail.inspect().terminal.status,'completed');}
  const active=fictionalProtocol(protocol);active.running();active.delivery();active.final();active.terminal();assert.throws(()=>active.receive({method:'thread/status/changed',params:{threadId:NATIVE,status:{type:'active',activeFlags:[]}}}),code('BOOTSTRAP_HOST_ACTIVE_STATUS'));
}));
