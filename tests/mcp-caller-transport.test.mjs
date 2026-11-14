// Actual Node MCP stdio/source integration with fictional temporary SQLite.
// _meta is SYNTHETIC HOST input here: this proves forwarding/guards only, never
// installed-host provenance, native qualification or execution permission.
import {seedPreexistingLegacyData} from './preexisting-legacy-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {peerFixture} from './peer-fixture.mjs';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {Store,installedTeam,teamHash,digest} from '../plugins/soloco/runtime/store.mjs';
import {bind} from '../plugins/soloco/runtime/engine.mjs';
import {hook} from '../plugins/soloco/runtime/main.mjs';

const ENTRY=fileURLToPath(new URL('../plugins/soloco/runtime/main.mjs',import.meta.url));
const ROOT='123e4567-e89b-12d3-a456-426614174000',CHILD='123e4567-e89b-42d3-8456-426614174001',OTHER='018f22aa-bb1c-7def-8123-123456789abc';
const ABSENT=Symbol('absent HOST metadata');
const rootMeta=id=>({threadId:id,sessionId:id});
const ROOT_HOLD='MCP_CODEX_ROOT_CALLER_REQUIRED: A supported Codex root HOST caller matching the session selector is required.';
function sqlState(db){
 const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
 const names=schema.filter(row=>row.type==='table').map(row=>row.name);
 return {names,sha256:peerDigest({schema,tables:Object.fromEntries(names.map(name=>[name,db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(canonical).sort()]))})};
}
function unchanged(db,before){
 const after=sqlState(db);assert.deepEqual(after.names,before.names,'MCP startup/request must not install SQLite tables');assert.equal(after.sha256,before.sha256,'All canonical SQL rows, schema, events, reservations and allowances must remain unchanged');
}
function payload(reply){
 assert.equal(reply.error,undefined);assert.notEqual(reply.result?.isError,true,reply.result?.content?.[0]?.text);
 assert.equal(reply.result.content[0].type,'text');return JSON.parse(reply.result.content[0].text);
}
function denied(reply,expected){
 assert.equal(reply.error,undefined);assert.equal(reply.result?.isError,true);
 const value=reply.result.content.map(item=>item.text??'').join('\n');
 if(expected instanceof RegExp)assert.match(value,expected);else assert.equal(value,expected);
 return value;
}
function mcpServer(root,cache,host){
 const child=spawn(process.execPath,['--no-warnings',ENTRY,'serve',host],{cwd:root,env:{...process.env,COMPANY_PLUGIN_DATA:cache},stdio:['pipe','pipe','pipe']});
 const pending=new Map();let sequence=0,closed=false,stderr='';
 child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-12000);});
 const lines=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
 lines.on('line',line=>{
  let reply;try{reply=JSON.parse(line);}catch(error){for(const entry of pending.values())entry.reject(error);pending.clear();return;}
  const entry=pending.get(reply.id);if(entry){pending.delete(reply.id);clearTimeout(entry.timer);entry.resolve(reply);}
 });
 child.once('error',error=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(error);}pending.clear();});
 const completion=new Promise(resolve=>child.once('close',(code,signal)=>{
  closed=true;for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(Error('Source MCP exited before reply: '+code+' '+signal+' '+stderr));}pending.clear();resolve({code,signal});
 }));
 function request(method,params,top={}){
  if(closed)return Promise.reject(Error('Source MCP is closed'));
  const id=++sequence;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(id);reject(Error('Source MCP reply timed out: '+method+' '+stderr));},10000);timer.unref?.();pending.set(id,{resolve,reject,timer});
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params,...top})+'\n');
  });
 }
 return {
  request,
  call(name,args,meta=ABSENT,top={}){return request('tools/call',{name,arguments:args,...(meta===ABSENT?{}:{_meta:meta})},top);},
  async close(){
   if(!closed)child.stdin.end();const timer=setTimeout(()=>{if(!closed)child.kill('SIGKILL');},3000);timer.unref?.();
   try{const outcome=await completion;assert.equal(outcome.code,0,'Source MCP exit: '+outcome.signal+' '+stderr);}finally{clearTimeout(timer);lines.close();}
  }
 };
}
function fixture(t,{legacyHost=null}={}){
 const cache=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-caller-cache-')),previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=cache;
 let root,file,db,peer,session=ROOT,host='codex';const servers=[];
 if(legacyHost){
  host=legacyHost;session='legacy-'+host+'-logical-owner';root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-caller-legacy-'));file=path.join(root,'.company','company.sqlite');
  const team=installedTeam(),store=new Store(root,true);
  try{seedPreexistingLegacyData(store,'fictional.transport-genesis',()=>({schema:2,id:'fictional-legacy-caller-company',name:'Fictional legacy preparation',idea:'No execution or adoption.',runtime_version:team.plugin_version,...team,team_sha256:teamHash(team),owner:{host,session_id:session,epoch:7},paused:true,records:{held:{id:'held',kind:'artifact',revision:1,content:'FAILED; ZERO allowance; no automatic retry.'}},jobs:{},sessions:{},notices:[],messages:[],context_classifications:{},unknown_future:{attempts_used:4,max_attempts:4}}));store.migrate();}finally{store.close();}
  db=new DatabaseSync(file);
 }else{
  peer=peerFixture({principals:{founder:{native_id:ROOT,session_id:ROOT,legacy_owner:{host:'codex',session_id:ROOT,epoch:7}}}});({root,file}=peer);db=peer.ledger.db;
  peer.ledger.write('fictional.persisted-transport-result','founder',tx=>tx.put('tasks','persisted-task',{status:'returned',scope:'alpha',owner_principal_id:'cos-a',result:{output:'Persisted fictional transport result.',termination_confirmed:false}},0));
 }
 function bindSession(id=session,selectedHost=host){
  bind(root,id,selectedHost);
  return path.join(cache,'bindings',digest(JSON.stringify([fs.realpathSync(root),selectedHost,id]))+'.json');
 }
 const bindingFile=bindSession();
 t.after(async()=>{
  try{for(const server of servers)await server.close();}finally{
   if(peer)peer.close();else{db.close();fs.rmSync(root,{recursive:true,force:true});}
   if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(cache,{recursive:true,force:true});
  }
 });
 const args=(action,input={},extra={})=>({root,session_id:session,epoch:7,action,...(['status','inspect','read'].includes(action)?{}:{source_instruction:'Fictional source guard only; do not start a provider.'}),input,...extra});
 async function start(selectedHost=host){
  const server=mcpServer(root,cache,selectedHost);servers.push(server);const initialized=await server.request('initialize',{protocolVersion:'2024-11-05'});assert.equal(initialized.result.serverInfo.name,'company');return server;
 }
 return {root,file,db,peer,cache,host,session,bindingFile,bindSession,args,start};
}

test('actual stdio forwards valid root HOST metadata for private peer status and persisted reads without starting runtime',async t=>{
 const f=fixture(t),before=sqlState(f.db),server=await f.start();
 assert.equal(payload(await server.call('company_peers',f.args('status'),rootMeta(ROOT))).started,false);
 const page=payload(await server.call('company_peers',f.args('inspect',{family:'tasks',part:'result',status:'returned'}),rootMeta(ROOT))),source=page.items[0].source;
 assert.equal(source.id,'persisted-task');
 const value=payload(await server.call('company_peers',f.args('read',{family:source.family,id:source.id,revision:source.revision,sha256:source.sha256,part:source.part}),rootMeta(ROOT)));assert.equal(value.complete,true);assert.equal(JSON.parse(value.text).output,'Persisted fictional transport result.');
 denied(await server.call('company_peers',f.args('tick'),rootMeta(ROOT)),'Explicit company_peers start is required');
 // Cover the real legacy watcher's next idle poll as well as serve startup.
 await new Promise(resolve=>setTimeout(resolve,2100));
 unchanged(f.db,before);assert.equal(fs.existsSync(path.join(f.root,'.company','peer-execution')),false);
});

test('same-process missing, malformed, descendant and spoofed metadata never inherit an earlier root context',async t=>{
 const f=fixture(t),before=sqlState(f.db),server=await f.start();f.bindSession(OTHER);
 payload(await server.call('company_peers',f.args('status'),rootMeta(ROOT)));
 for(const meta of [ABSENT,null,'text',[],7,{}, {threadId:7,sessionId:ROOT},{threadId:ROOT,sessionId:false},{threadId:CHILD,sessionId:ROOT},{threadId:ROOT,sessionId:OTHER},{root:true,observed:true,identity_basis:'CODEX_HOST_META_OBSERVED',native_id:ROOT,session_id:ROOT}])denied(await server.call('company_peers',f.args('status'),meta),ROOT_HOLD);
 denied(await server.call('company_peers',f.args('status',{}, {session_id:OTHER}),rootMeta(ROOT)),ROOT_HOLD);
 denied(await server.call('company_peers',f.args('status'),ABSENT,{_meta:rootMeta(ROOT)}),ROOT_HOLD);
 denied(await server.call('company_peers',f.args('status',{}, {_meta:rootMeta(ROOT)})),/Unknown argument: _meta/);
 denied(await server.call('company_peers',f.args('status',{}, {caller_context:{root:true,native_id:ROOT}})),/Unknown argument: caller_context/);
 assert.equal(payload(await server.call('company_peers',f.args('status'),rootMeta(ROOT))).started,false);
 unchanged(f.db,before);
});

test('another valid root and actual current binding do not replace canonical peer founder permission',async t=>{
 const f=fixture(t),before=sqlState(f.db),server=await f.start();f.bindSession(OTHER);
 denied(await server.call('company_peers',f.args('status',{}, {session_id:OTHER}),rootMeta(OTHER)),/Current canonical founder operator/);
 assert.equal(payload(await server.call('company_peers',f.args('status'),rootMeta(ROOT))).started,false);unchanged(f.db,before);
});

test('current managed hook fields are checked independently of valid HOST identity on every actual request',async t=>{
 const f=fixture(t),before=sqlState(f.db),server=await f.start(),original=JSON.parse(fs.readFileSync(f.bindingFile,'utf8'));
 const changes=[{plugin_version:'0.0.0'},{plugin_root:'/fictional/different-plugin'},{data_directory:'/fictional/different-data'},{root:'/fictional/different-root'},{session_id:OTHER},{host:'claude'},{at:'not-a-time'},{}];
 for(const change of changes){
  fs.writeFileSync(f.bindingFile,JSON.stringify(Object.keys(change).length?{...original,...change}:{}));
  denied(await server.call('company_peers',f.args('status'),rootMeta(ROOT)),/^PEER_CURRENT_HOOK_REQUIRED:/);
  fs.unlinkSync(f.bindingFile);f.bindSession();
 }
 for(const malformed of ['broken JSON','null','[]']){
  fs.writeFileSync(f.bindingFile,malformed);denied(await server.call('company_peers',f.args('status'),rootMeta(ROOT)),/^PEER_CURRENT_HOOK_REQUIRED:/);fs.unlinkSync(f.bindingFile);f.bindSession();
 }
 fs.unlinkSync(f.bindingFile);denied(await server.call('company_peers',f.args('status'),rootMeta(ROOT)),/^PEER_CURRENT_HOOK_REQUIRED:/);f.bindSession();
 assert.equal(payload(await server.call('company_peers',f.args('status'),rootMeta(ROOT))).started,false);unchanged(f.db,before);
});

test('Claude cannot use new private peer routes even with matching metadata and an actual Claude binding',async t=>{
 const f=fixture(t),before=sqlState(f.db);f.bindSession(ROOT,'claude');const server=await f.start('claude');
 denied(await server.call('company_peers',f.args('status'),rootMeta(ROOT)),ROOT_HOLD);unchanged(f.db,before);
});

for(const host of ['codex','claude'])test('legacy '+host+' read-only adoption stays logically compatible and explicitly unqualified without root metadata',async t=>{
 const f=fixture(t,{legacyHost:host}),before=sqlState(f.db);
 const injected=hook({cwd:f.root,session_id:f.session,hook_event_name:'SessionStart'},host),context=JSON.parse(injected.hookSpecificOutput.additionalContext);assert.equal(context.identity_basis,'LEGACY_UNQUALIFIED');assert.equal(context.native_identity_proof,false);
 const server=await f.start();
 for(const meta of [ABSENT,null,'text',[],{threadId:CHILD,sessionId:ROOT}]){
  const reply=payload(await server.call('company_peer_adoption',{root:f.root,session_id:f.session,epoch:7,action:'readiness'},meta));
  assert.equal(reply.owner.host,host);assert.equal(reply.owner.session_id,f.session);assert.equal(reply.capabilities.apply,false);assert.equal(reply.ready_for_apply,false);assert.equal(reply.execution.whole_domain_qualified,false);
 }
 unchanged(f.db,before);assert.equal(fs.existsSync(path.join(f.root,'.company','backups')),false);
});
