// Real source MCP JSON stdio, packaged hook commands and fictional SQLite/P1.
// HOST _meta and hook payloads are SYNTHETIC transport inputs, not installed
// host provenance, native/provider QA, company adoption or permission.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {peerFixture} from './peer-fixture.mjs';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {captureLegacyPinnedTeam,legacySourceId} from '../plugins/soloco/runtime/peers/legacy-origin.mjs';
import {PACKAGE,VERSION} from '../plugins/soloco/runtime/store.mjs';
import {CATALOG_MAX_BYTES,REPLY_MAX_BYTES} from '../plugins/soloco/runtime/public-response.mjs';

const ENTRY=fileURLToPath(new URL('../plugins/soloco/runtime/main.mjs',import.meta.url));
const ROOT='11111111-1111-4111-8111-111111111111';
const CHILD='22222222-2222-4222-8222-222222222222';
const OTHER='33333333-3333-4333-8333-333333333333';
const ABSENT=Symbol('absent HOST metadata');
const PRIVATE='FICTIONAL_PRIVATE_CANONICAL_7b29';
const sha=value=>createHash('sha256').update(value).digest('hex');
const meta=(id=ROOT)=>({threadId:id,sessionId:id});
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const hookConfig=JSON.parse(fs.readFileSync(path.join(PACKAGE,'hooks/codex.json'),'utf8'));

function sqlState(db){
  const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  const names=schema.filter(row=>row.type==='table').map(row=>row.name);
  return {names,sha256:peerDigest({schema,tables:Object.fromEntries(names.map(name=>[name,db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(canonical).sort()]))})};
}
function success(reply){
  assert.equal(reply.error,undefined);
  assert.notEqual(reply.result?.isError,true,reply.result?.content?.map(item=>item.text??'').join('\n'));
  assert.equal(reply.result?.content?.[0]?.type,'text');
  return JSON.parse(reply.result.content[0].text);
}
function denied(reply,expected){
  assert.equal(reply.error,undefined);assert.equal(reply.result?.isError,true);
  const text=reply.result.content.map(item=>item.text??'').join('\n');assert.match(text,expected);
  assert.equal(text.includes(PRIVATE),false);return text;
}
function server(f,host='codex'){
  const child=spawn(process.execPath,['--no-warnings',ENTRY,'serve',host],{cwd:f.root,env:f.env,stdio:['pipe','pipe','pipe']});
  const waiting=new Map();let sequence=0,closed=false,stderr='';
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-12000);});
  const lines=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
  lines.on('line',line=>{
    let reply;try{reply=JSON.parse(line);}catch(error){for(const p of waiting.values()){clearTimeout(p.timer);p.reject(error);}waiting.clear();return;}
    const p=waiting.get(reply.id);if(p){waiting.delete(reply.id);clearTimeout(p.timer);p.resolve(reply);}
  });
  const completion=new Promise(resolve=>{
    child.once('error',error=>{for(const p of waiting.values()){clearTimeout(p.timer);p.reject(error);}waiting.clear();});
    child.once('close',(code,signal)=>{closed=true;for(const p of waiting.values()){clearTimeout(p.timer);p.reject(Error('MCP exited: '+code+' '+signal+' '+stderr));}waiting.clear();resolve({code,signal});});
  });
  function request(method,params,top={}){
    assert.equal(closed,false,'Source MCP is still open');const id=++sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{waiting.delete(id);reject(Error('MCP timeout: '+method+' '+stderr));},10000);timer.unref?.();waiting.set(id,{resolve,reject,timer});
      child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params,...top})+'\n');
    });
  }
  const api={request,call(name,args,metadata=ABSENT,top={}){return request('tools/call',{name,arguments:args,...(metadata===ABSENT?{}:{_meta:metadata})},top);},async close(){
    if(!closed)child.stdin.end();const timer=setTimeout(()=>{if(!closed)child.kill('SIGKILL');},3000);timer.unref?.();
    try{const outcome=await completion;assert.equal(outcome.code,0,'Source MCP exit '+outcome.signal+' '+stderr);}finally{clearTimeout(timer);lines.close();}
  }};
  f.servers.push(api);return api;
}
function fixture(t,{paused=true}={}){
  const peer=peerFixture({control:{paused},principals:{founder:{host:'codex',session_id:ROOT,native_id:ROOT,legacy_owner:{host:'codex',session_id:ROOT,epoch:7}}}});
  const root=fs.realpathSync(peer.root),temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-owner-ingress-'))),profile=path.join(temporary,'profile'),cache=path.join(profile,'plugins/data/soloco');
  const state={id:peer.ledger.company_id,plugin_version:'fictional-original-version',runtime_version:'fictional-original-runtime',governance:'Fictional original governance '+PRIVATE,cos_instructions:'Fictional original instructions '+PRIVATE,roles:{z:{mission:'Original z'},a:{mission:'Original a'}},owner:{host:'codex',session_id:ROOT,epoch:7}};
  state.governance_sha256=sha(state.governance);state.team_sha256=sha(JSON.stringify([state.plugin_version,state.governance,state.roles,state.cos_instructions]));
  const sources=['plugin_version','governance','roles','cos_instructions'].map((key,position)=>{
    const bytes=JSON.stringify(state[key]),source={family:'root',key,position,encoding:'json',sha256:sha(bytes)};source.source_id=legacySourceId(source);
    peer.ledger.db.prepare('INSERT INTO immutable_values(sha256,bytes) VALUES(?,?)').run(source.sha256,bytes);return source;
  });
  const cut=sha('FICTIONAL complete original source cut'),bundle=captureLegacyPinnedTeam(state,sources,cut);
  peer.ledger.write('fixture.public-ingress','founder',tx=>{
    const pinned=tx.put('control','pinned-team',{protocol:'peer-pinned-team-record-v1',bundle,bundle_sha256:peerDigest(bundle)},0),c=tx.get('control','company');
    tx.put('control','company',{...c.value,pinned_team:ref('control',pinned),legacy_source_cut_sha256:cut,team_sha256:state.team_sha256,governance_sha256:state.governance_sha256},c.revision);
    tx.put('control','usage',{model_calls:7},0);
    tx.put('tasks','private-task',{status:'returned',scope:'fictional',result:{content:PRIVATE,acceptance:false,closure:'UNKNOWN'}},0);
    tx.put('slots','old-unknown',{status:'unknown',scope:'*',termination_confirmed:false,used_calls:3},0);
    tx.put('effects','old-unknown',{status:'unknown',scope:'*',termination_confirmed:false,used_calls:3},0);
    for(let i=0;i<5;i++)tx.put('notices','private-notice-'+i,{kind:'decision_required',status:'pending',scope:'*',summary:PRIVATE+' notice '+i,acknowledged:false,required_handoff:true},0);
  });
  // Observation only: delegate the original SQLite methods unchanged. Query
  // preparation/execution of canonical tables is recorded in the child process.
  // Schema/layout metadata (including peer_meta) is deliberately not private.
  const observer=path.join(temporary,'observe-sql.mjs'),audit=path.join(temporary,'canonical-sql.jsonl');
  fs.writeFileSync(audit,'');
  fs.writeFileSync(observer,`import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';
const privateTable=/\\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\\s+["\x60\\[]?(?:peer_rows|peer_versions|peer_events|peer_outbox|immutable_values|company|events)\\b/i;
for(const method of ['prepare','exec']){const original=DatabaseSync.prototype[method];DatabaseSync.prototype[method]=function(sql,...rest){if(typeof sql==='string'&&privateTable.test(sql))fs.appendFileSync(process.env.SOLOCO_TEST_SQL_AUDIT,JSON.stringify({method,sql})+'\\n');return Reflect.apply(original,this,[sql,...rest]);};}
`);
  const env={...process.env,CODEX_HOME:profile,COMPANY_PLUGIN_DATA:cache,PLUGIN_ROOT:PACKAGE,COMPANY_WORKER:'0',NODE_OPTIONS:'--import='+pathToFileURL(observer).href,SOLOCO_TEST_SQL_AUDIT:audit,PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH};
  const f={root,file:peer.file,db:peer.ledger.db,ledger:peer.ledger,temporary,profile,cache,env,audit,state,servers:[],
    args:(action='status',input={},session_id=ROOT)=>({root,session_id,action,input}),
    queries:()=>fs.readFileSync(audit,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line)),
    clearQueries:()=>fs.writeFileSync(audit,''),
    unchanged(before){assert.deepEqual(sqlState(peer.ledger.db),before,'Canonical SQL rows/schema/events/allowances/reservations must remain unchanged');for(const name of ['company','events','jobs','sessions'])assert.equal(before.names.includes(name),false,'Fictional H5 has no legacy '+name+' table');},
    hook(event='SessionStart',prompt,session_id=ROOT){
      const input={cwd:root,session_id,hook_event_name:event,...(prompt===undefined?{}:{prompt})};
      const command=hookConfig.hooks[event][0].hooks[0].command;
      const result=spawnSync('/bin/sh',['-c',command],{cwd:root,env,input:JSON.stringify(input),encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
      assert.ifError(result.error);assert.equal(result.status,0,result.stderr);const output=JSON.parse(result.stdout);assert(output.hookSpecificOutput?.additionalContext,result.stdout);return {output,context:JSON.parse(output.hookSpecificOutput.additionalContext)};
    },
    binding(session_id=ROOT){return path.join(cache,'bindings',sha(JSON.stringify([root,'codex',session_id]))+'.json');},
    async start(host='codex'){const s=server(f,host);const reply=await s.request('initialize',{protocolVersion:'2024-11-05'});assert.equal(reply.result.serverInfo.name,'company');return s;}
  };
  t.after(async()=>{try{for(const s of f.servers)await s.close();}finally{peer.close();fs.rmSync(temporary,{recursive:true,force:true});}});
  return f;
}
function noPrivateQueries(f){assert.deepEqual(f.queries(),[],'No private canonical SQL may be prepared/executed before the actual caller/current hook gate or by an unqualified H5 hook');}

test('real tools/list registers exactly one closed company_owner schema without opening private canonical rows',async t=>{
  const f=fixture(t),before=sqlState(f.db),s=await f.start(),reply=await s.request('tools/list',{});
  assert.equal(REPLY_MAX_BYTES,65536);assert.equal(CATALOG_MAX_BYTES,131072);assert.equal(reply.error,undefined);assert(Buffer.byteLength(JSON.stringify(reply))<=CATALOG_MAX_BYTES);assert.equal(reply.result.tools.length,25);
  const tools=reply.result.tools.filter(tool=>tool.name==='company_owner');assert.equal(tools.length,1);
  const schema=tools[0].inputSchema;assert.equal(schema.additionalProperties,false);assert.equal(schema.properties.input.additionalProperties,false);
  assert.deepEqual(schema.required,['root','session_id','action']);
  for(const field of ['actor','native_id','provider','proof','ready','threadId','sessionId'])assert.equal(Object.hasOwn(schema.properties,field),false);
  for(const action of ['status','pinned_inspect','pinned_read','context_inspect','context_read','begin','refresh_subject'])assert(schema.properties.action.enum.includes(action));
  noPrivateQueries(f);f.unchanged(before);
});

test('packaged SessionStart emits only an unqualified H5 routing hint and produces a real current managed-hook record',t=>{
  const f=fixture(t),before=sqlState(f.db),{output,context}=f.hook();
  assert.equal(context.storage_layout,5);assert.equal(context.identity_basis,'LEGACY_UNQUALIFIED');assert.equal(context.native_identity_proof,false);
  assert.equal(context.notices.complete,false);assert.equal(context.notices.retrieval.tool,'company_owner');assert.match(context.notice_rule,/does not acknowledge, resolve or authorize/);
  assert.match(context.instruction_loading,/company_open/);assert.match(context.instruction_loading,/pinned_inspect\/pinned_read/);
  for(const field of ['owner','epoch','paused','governance','roles','cos_instructions'])assert.equal(Object.hasOwn(context,field),false);
  assert.equal(JSON.stringify(output).includes(PRIVATE),false);
  const binding=JSON.parse(fs.readFileSync(f.binding(),'utf8'));assert.equal(binding.root,f.root);assert.equal(binding.session_id,ROOT);assert.equal(binding.host,'codex');assert.equal(binding.plugin_root,PACKAGE);assert.equal(binding.plugin_version,VERSION);assert.equal(binding.data_directory,f.cache);
  noPrivateQueries(f);f.unchanged(before);
});

for(const paused of [false,true])test('packaged UserPromptSubmit reports pause_requested without claiming or applying pause when paused='+paused,t=>{
  const f=fixture(t,{paused}),before=sqlState(f.db),{context,output}=f.hook('UserPromptSubmit','Please pause the company.');
  assert.equal(context.pause_requested,true);assert.equal(context.pause_applied,false);assert.deepEqual(context.control_retrieval,{tool:'company_owner',action:'pause'});
  assert.match(output.systemMessage,/this hook did not apply/);assert.equal(JSON.stringify(output).includes(PRIVATE),false);
  noPrivateQueries(f);f.unchanged(before);assert.equal(f.ledger.read(tx=>tx.get('control','company')).value.paused,paused);
});

test('real root stdio routes company_open/status to owner status and reads original pins without legacy tables or writes',async t=>{
  const f=fixture(t);f.hook();f.clearQueries();const before=sqlState(f.db),s=await f.start();
  for(const name of ['company_open','company_status','company_owner']){
    const value=success(await s.call(name,name==='company_owner'?f.args():{root:f.root,session_id:ROOT},meta()));
    assert.equal(value.protocol,'peer-public-owner-runtime-v1');assert.equal(value.company_id,f.ledger.company_id);assert.deepEqual(value.owner,{host:'codex',session_id:ROOT,epoch:7});
    assert.equal(value.paused,true);assert.equal(value.caller_relation,'owner');assert.equal(value.private_context_available,true);assert.equal(value.physical_closure,'UNKNOWN');
  }
  const header=success(await s.call('company_owner',f.args('pinned_inspect'),meta()));assert.equal(header.sources.length,4);
  for(const source of header.sources){
    const body=success(await s.call('company_owner',f.args('pinned_read',{part:source.part,reference:header.reference,sha256:source.sha256,offset:0,length:source.characters}),meta()));
    assert.equal(body.complete,true);assert.equal(body.text,JSON.stringify(f.state[source.part]));assert.equal(sha(body.text),source.sha256);
  }
  assert(f.queries().some(q=>/\bpeer_rows\b/.test(q.sql)),'Valid stdio call is the positive control for the private-query observer');
  assert.equal(fs.existsSync(path.join(f.root,'.company','peer-execution')),false);f.unchanged(before);
});

test('missing, descendant, mismatched and top-level-only HOST metadata fail on all real public routes before private access',async t=>{
  const f=fixture(t);f.hook();f.clearQueries();const before=sqlState(f.db),s=await f.start();
  for(const name of ['company_owner','company_open','company_status']){
    const args=name==='company_owner'?f.args():{root:f.root,session_id:ROOT};
    for(const metadata of [ABSENT,null,{}, {threadId:CHILD,sessionId:ROOT},meta(OTHER)])denied(await s.call(name,args,metadata),/MCP_CODEX_ROOT_CALLER_REQUIRED/);
    denied(await s.call(name,args,ABSENT,{_meta:meta(),threadId:ROOT,sessionId:ROOT}),/MCP_CODEX_ROOT_CALLER_REQUIRED/);
  }
  noPrivateQueries(f);f.unchanged(before);
});

test('valid HOST metadata still requires an actual current managed hook, with recovery through the packaged producer',async t=>{
  const f=fixture(t),before=sqlState(f.db),s=await f.start();
  const calls=async()=>{for(const name of ['company_owner','company_open','company_status'])denied(await s.call(name,name==='company_owner'?f.args():{root:f.root,session_id:ROOT},meta()),/PEER_CURRENT_HOOK_REQUIRED/);};
  await calls();noPrivateQueries(f);
  f.hook();assert.equal(success(await s.call('company_owner',f.args(),meta())).caller_relation,'owner');
  assert(f.queries().length>0,'The same server can access source through a real current record');f.clearQueries();
  const record=JSON.parse(fs.readFileSync(f.binding(),'utf8'));fs.writeFileSync(f.binding(),JSON.stringify({...record,plugin_version:'fictional-stale-version'}));
  await calls();noPrivateQueries(f);
  f.hook();assert.equal(success(await s.call('company_status',{root:f.root,session_id:ROOT},meta())).private_context_available,true);f.unchanged(before);
});

test('stdio arguments cannot substitute caller metadata or inject actor/provider/proof/readiness fields',async t=>{
  const f=fixture(t);f.hook();f.clearQueries();const before=sqlState(f.db),s=await f.start();
  for(const [key,value]of Object.entries({actor:{host:'codex',session_id:ROOT,native_id:ROOT},native_id:ROOT,threadId:ROOT,sessionId:ROOT,_meta:meta(),provider:{},proof:{qualified:true},ready:true})){
    denied(await s.call('company_owner',{...f.args(),[key]:value},meta()),/Unknown argument|OWNER_PUBLIC_INPUT/);
  }
  denied(await s.call('company_owner',f.args('status',{provider:{}}),meta()),/OWNER_PUBLIC_INPUT/);
  denied(await s.call('company_owner',f.args(),ABSENT,{actor:{host:'codex',session_id:ROOT,native_id:ROOT},native_identity_proof:true}),/MCP_CODEX_ROOT_CALLER_REQUIRED/);
  noPrivateQueries(f);f.unchanged(before);
});

test('unsupported MCP host cannot use matching Codex metadata and a current Codex hook to obtain private rows',async t=>{
  const f=fixture(t);f.hook();f.clearQueries();const before=sqlState(f.db),s=await f.start('claude');
  denied(await s.call('company_owner',f.args(),meta()),/MCP_CODEX_ROOT_CALLER_REQUIRED/);
  noPrivateQueries(f);f.unchanged(before);
});

test('a different real root caller with its own current hook cannot read canonical private company context',async t=>{
  const f=fixture(t);f.hook('SessionStart',undefined,OTHER);f.clearQueries();const before=sqlState(f.db),s=await f.start();
  const args=f.args('context_read',{family:'tasks',id:'private-task',revision:1,sha256:'a'.repeat(64),offset:0,length:1024},OTHER);args.epoch=7;
  denied(await s.call('company_owner',args,meta(OTHER)),/OWNER_PUBLIC_CONTEXT_FORBIDDEN/);
  f.unchanged(before);
});
