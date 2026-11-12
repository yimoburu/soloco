// Public read-only preparation through the actual registered transport.
// Fictional normalized-v4 SQLite only: no native/model/provider/network work,
// adoption application, new authority or semantic qualification is established.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Store,installedTeam,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {bind} from '../plugins/soloco/runtime/engine.mjs';
import {call,toolListFor} from '../plugins/soloco/runtime/main.mjs';
import {peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {fits,toolResult,rpcReply,MODEL_MAX_BYTES,REPLY_MAX_BYTES} from '../plugins/soloco/runtime/public-response.mjs';

const TOOL='company_peer_adoption',SESSION='fictional-public-adoption-owner',EPOCH=9;
const INSTRUCTION='Fictional read-only preparation only; preserve all failures, spent attempts and unknown closure. No execution or adoption.';
const rawHash=text=>createHash('sha256').update(text,'utf8').digest('hex');
const code=expected=>error=>error?.code===expected;
const capacityCode=value=>typeof value==='string'&&/(?:CAPACITY|BUDGET|LIMIT|TOO_LARGE|OVERSIZE|REPLY)/.test(value);

function sqlSnapshot(db){
 return {schema:db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),company:db.prepare('SELECT * FROM company ORDER BY id').all(),layout:db.prepare('SELECT * FROM company_layout ORDER BY id').all(),entries:db.prepare('SELECT * FROM state_entries ORDER BY family,key').all(),values:db.prepare('SELECT * FROM immutable_values ORDER BY sha256').all(),events:db.prepare('SELECT * FROM events ORDER BY seq').all()};
}
function fingerprint(db){return peerDigest(sqlSnapshot(db));}
function assertWire(value){
 assert.equal(fits(value),true,'Every delivered DATA result or explicit hold must fit both public budgets');
 assert(Buffer.byteLength(JSON.stringify(value))<=MODEL_MAX_BYTES);
 const content=toolResult(value),wire=rpcReply('r'.repeat(256),content);
 assert(Buffer.byteLength(wire)<=REPLY_MAX_BYTES);
 assert.deepEqual(JSON.parse(wire).result,content,'RPC serialization must not substitute its generic overflow reply');
 assert.equal(Object.hasOwn(value,'operation_returned'),false,'Read-only preparation must never enter mutation-receipt shaping');
}
function typedHold(value){
 if(!value||!capacityCode(value.code))return false;
 assert(value.held===true||value.status==='held'||value.delivered===false,'A capacity code must explicitly report a hold/no delivery');
 assert.notEqual(value.complete,true);
 assert.equal(Object.hasOwn(value,'items'),false,'A hold cannot present an incomplete item prefix');
 assert.equal(Object.hasOwn(value,'text'),false,'A hold cannot present a clipped range');
 return true;
}
function publicSchema(root){
 const tool=toolListFor(root).find(value=>value.name===TOOL);
 assert(tool,'The accepted public adoption tool must be registered before this suite runs');
 return tool.inputSchema;
}
function fixture(t,{changes={},bound=true}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-public-adoption-')),previous=process.env.COMPANY_PLUGIN_DATA;
 process.env.COMPANY_PLUGIN_DATA=path.join(root,'transport-cache');
 const team=installedTeam(),initial={schema:2,id:'fictional-public-adoption-company',name:'Fictional public preparation',idea:'Read-only preservation of current unknown obligations.',runtime_version:team.plugin_version,plugin_version:team.plugin_version,governance:team.governance,governance_sha256:team.governance_sha256,roles:team.roles,cos_instructions:team.cos_instructions,team_sha256:teamHash(team),owner:{host:'codex',session_id:SESSION,epoch:EPOCH},paused:true,records:{held:{id:'held',kind:'artifact',revision:1,status:'Draft',content:'FAILED; no retry; allowance remains ZERO.'}},jobs:{},sessions:{},notices:[],messages:[],context_classifications:{},unknown_future:{attempts_used:4,max_attempts:4,expiry:'2020-01-01T00:00:00.000Z',uncertain:true},...changes};
 const store=new Store(root,true);
 try{store.transaction('fictional.public-fixture',()=>initial);store.migrate();}finally{store.close();}
 const file=path.join(root,'.company','company.sqlite'),db=new DatabaseSync(file);
 t.after(()=>{db.close();if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(root,{recursive:true,force:true});});
 if(bound)bind(root,SESSION,'codex');
 const args=(action,input={},extra={})=>({root,session_id:SESSION,epoch:EPOCH,action,input,...extra});
 async function run(action,input={},extra={},host='codex'){
  const result=await call(TOOL,args(action,input,extra),host);assertWire(result);return result;
 }
 return {root,file,db,initial,args,run};
}
async function delivered(f,action,input,extra={}){
 try{
  const result=await f.run(action,input,extra);
  return typedHold(result)?{held:true,code:result.code}:{held:false,value:result};
 }catch(error){if(!capacityCode(error?.code))throw error;return {held:true,code:error.code};}
}
async function pages(f,kind,{limit=2,basis_sha256}={}){
 const items=[];let cursor=null,expectedOffset=0,basis=basis_sha256,requested=limit;
 for(let turns=0;turns<1000;turns++){
  const input={kind,limit:requested,...(cursor?{cursor}:{}),...(basis?{basis_sha256:basis}:{})},answer=await delivered(f,'inspect',input);
  if(answer.held){assert(requested>1,'A whole single item must fit or the fixture cannot be fully delivered');requested=Math.max(1,Math.floor(requested/2));continue;}
  const page=answer.value;assert(Array.isArray(page.items),'Generic company_context guidance is not a delivered adoption page');
  basis??=page.basis_sha256;assert.equal(page.basis_sha256,basis);assert.equal(page.offset,expectedOffset);assert.equal(page.returned,page.items.length);assert.equal(page.complete,page.next_cursor===null);
  items.push(...page.items);expectedOffset+=page.items.length;
  if(page.complete){assert.equal(items.length,page.total);return {items,basis_sha256:basis};}
  assert(page.items.length>0);assert.notEqual(page.next_cursor,cursor);cursor=page.next_cursor;
 }
 assert.fail('Public inventory pagination did not make bounded progress');
}
async function readBody(f,target,source,{source_id,expires_at,length=1000,source_instruction=INSTRUCTION}={}){
 let offset=0,body='',requested=length,total=null;
 for(let turns=0;turns<2000;turns++){
  const input={target,sha256:source.sha256,basis_sha256:source.basis_sha256,offset,length:requested,...(source_id?{source_id}:{}),...(target==='plan'?{expires_at}:{})};
  const answer=await delivered(f,'read',input,target==='plan'?{source_instruction}:{});
  if(answer.held){assert(requested>2,'Exact tiny ranges must fit this fictional source');requested=Math.max(2,Math.floor(requested/2));continue;}
  const range=answer.value;assert.equal(typeof range.text,'string','No exact range may be replaced by generic retrieval guidance');assert.equal(range.sha256,source.sha256);assert.equal(range.basis_sha256,source.basis_sha256);assert.equal(range.offset,offset);assert.equal(range.length,range.text.length);
  total??=range.total_characters;assert.equal(range.total_characters,total);assert(range.text.length>0);body+=range.text;
  const next=offset+range.text.length;assert.equal(range.complete,next===total);
  if(range.complete){assert.equal(range.next_offset,null);assert.equal(body.length,total);assert.equal(rawHash(body),source.sha256);return body;}
  assert.equal(range.next_offset,next);assert(next>offset);offset=next;
 }
 assert.fail('Exact public ranges did not make bounded progress');
}
function assertPublicCapacityHold(value,action){
 assert.equal(value.protocol,'peer-adoption-public-hold-v1');assert.equal(value.code,'LEGACY_READONLY_REPLY_CAPACITY');assert.equal(value.action,action);assert.equal(value.status,'held');assert.equal(value.delivered,false);assert.equal(value.complete,false);assert.equal(value.execution_authorized,false);assert.equal(typedHold(value),true);
 const guidance=value.retrieval;assert(guidance&&typeof guidance==='object');assert.equal(guidance.action,'read');assert.equal(guidance.input.target,'source');assert.match(guidance.input.source_id,/^legacy-source:[a-f0-9]{64}$/);assert.match(guidance.input.sha256,/^[a-f0-9]{64}$/);assert.match(guidance.input.basis_sha256,/^[a-f0-9]{64}$/);assert.equal(guidance.input.offset,0);
 const wire=JSON.parse(rpcReply('h'.repeat(256),toolResult(value)));
 assert.deepEqual(JSON.parse(wire.result.content[0].text).retrieval,guidance,'Structured exact retrieval must survive the final toolResult/RPC encoding unchanged');
 return guidance;
}
async function followExactSourcePointer(f,guidance){
 // The FIRST request is the actual action/input supplied by the source core,
 // without reconstructing its selector or dropping basis/hash/range fields.
 let range=await f.run(guidance.action,guidance.input),body='',offset=0;
 for(let turns=0;turns<100;turns++){
  assert.equal(range.sha256,guidance.input.sha256);assert.equal(range.basis_sha256,guidance.input.basis_sha256);assert.equal(range.offset,offset);assert.equal(range.length,range.text.length);body+=range.text;
  if(range.complete){assert.equal(range.next_offset,null);assert.equal(body.length,range.total_characters);assert.equal(rawHash(body),guidance.input.sha256);return body;}
  assert.equal(range.next_offset,offset+range.text.length);assert(range.next_offset>offset);offset=range.next_offset;
  range=await f.run(guidance.action,{...guidance.input,offset});
 }
 assert.fail('The exact capacity-hold source pointer did not reach a bounded complete result');
}

test('public discovery and actual dispatch expose preparation only, with hook and canonical owner gates',async t=>{
 const f=fixture(t,{bound:false}),schema=publicSchema(f.root),before=fingerprint(f.db);
 const listed={tools:toolListFor(f.root)},wire=rpcReply('i'.repeat(256),listed),discovery=JSON.parse(wire);
 assert(Buffer.byteLength(wire)<=REPLY_MAX_BYTES);assert.deepEqual(discovery.result,listed,'The full tools/list RPC must not become an overflow error');assert(discovery.result.tools.some(tool=>tool.name===TOOL));
 assert.equal(schema.additionalProperties,false);assert.equal(schema.properties.input.additionalProperties,false);
 for(const forbidden of ['apply','adopt','start','resume'])assert.equal(schema.properties.action.enum.includes(forbidden),false);
 await assert.rejects(f.run('readiness'),/No startup-hook binding/);
 bind(f.root,SESSION,'codex');const readiness=await f.run('readiness');assert.equal(readiness.company_id,f.initial.id);assert.equal(readiness.ready_for_apply,false);assert.equal(readiness.capabilities.apply,false);assert.equal(readiness.execution.whole_domain_qualified,false);
 for(const [session_id,epoch,host]of [['foreign-owner',EPOCH,'codex'],[SESSION,EPOCH-1,'codex'],[SESSION,EPOCH,'claude']]){
  bind(f.root,session_id,host);await assert.rejects(f.run('readiness',{}, {session_id,epoch},host),code('LEGACY_OPERATOR_REQUIRED'));
 }
 for(const action of ['apply','adopt','start','resume'])await assert.rejects(f.run(action),/Invalid action|LEGACY_ADOPTION_INPUT/);
 for(const input of [{ready:true},{environment:{boundary_mode:'enforced'}},{review:{verdict:'Pass'}},{native_proof:{qualified:true}}])await assert.rejects(f.run('plan',input,{source_instruction:INSTRUCTION}),code('LEGACY_ADOPTION_INPUT'));
 assert.equal(fingerprint(f.db),before);assert.equal(fs.existsSync(path.join(f.root,'.company','backups')),false);
});

test('actual public readiness, inventories and exact source/plan/projection reads preserve current unknown authority without writes',async t=>{
 const value={unicode:'雪😀',ordering:[3,1,2],status:'UNKNOWN',spent:4},f=fixture(t,{changes:{unknown_future:value}}),before=fingerprint(f.db),readiness=await f.run('readiness');
 const sources=await pages(f,'sources',{limit:2,basis_sha256:readiness.basis_sha256}),issues=await pages(f,'issues',{limit:1,basis_sha256:readiness.basis_sha256});
 assert.equal(sources.items.length,readiness.current_source_inventory.rows);assert(issues.items.length>0);assert(issues.items.some(item=>item.code==='ORIGINAL_OBLIGATION_TRANSITION_PRODUCER_MISSING'));
 const reference=sources.items.find(item=>item.sha256===rawHash(JSON.stringify(value)));assert(reference);assert.equal(Object.hasOwn(reference,'key'),false);
 const raw=await readBody(f,'source',{sha256:reference.sha256,basis_sha256:readiness.basis_sha256},{source_id:reference.source_id});assert.deepEqual(JSON.parse(raw),value);
 const expires_at=new Date(Date.now()+3600000).toISOString(),prepared=await f.run('plan',{expires_at},{source_instruction:INSTRUCTION});assert.equal(prepared.ready_for_apply,false);assert.equal(prepared.permitted_action,'review-preparation-only');
 const plan=JSON.parse(await readBody(f,'plan',prepared.source,{expires_at}));assert.equal(peerDigest(plan),prepared.source.sha256);assert.equal(plan.sources.length,sources.items.length);assert.equal(plan.allowance_conversion,'none');assert.equal(plan.fresh_execution_authority,false);assert.equal(plan.execution_resumed,false);assert.equal(plan.native_qualification,false);
 assert(readiness.origin_projection_sha256,'The plain fixture has a real unclassified legacy frontier, not an injected projection');
 const projection=JSON.parse(await readBody(f,'projection',{sha256:readiness.origin_projection_sha256,basis_sha256:readiness.basis_sha256}));assert.equal(projection.protocol,'legacy-classification-frontier-v1');assert.equal(peerDigest(projection),readiness.origin_projection_sha256);assert(projection.unclassified_sources.length>0);
 assert.equal(fingerprint(f.db),before);assert.equal(fs.existsSync(path.join(f.root,'.company','backups')),false);
});

test('actual public basis, cursor, source hash and Unicode range drift fail closed without incidental writes',async t=>{
 const value='prefix😀tail',f=fixture(t,{changes:{unknown_future:value}}),readiness=await f.run('readiness'),inventory=await pages(f,'sources'),source=inventory.items.find(item=>item.sha256===rawHash(JSON.stringify(value)));assert(source);
 const selector={target:'source',source_id:source.source_id,sha256:source.sha256,basis_sha256:readiness.basis_sha256},raw=JSON.stringify(value),emoji=raw.indexOf('😀'),before=fingerprint(f.db);
 await assert.rejects(f.run('read',{...selector,sha256:'f'.repeat(64)}),code('LEGACY_SOURCE_CHANGED'));
 await assert.rejects(f.run('read',{...selector,offset:emoji+1,length:2}),code('LEGACY_RANGE_INVALID'));
 await assert.rejects(f.run('read',{...selector,offset:emoji,length:1}),code('LEGACY_RANGE_INVALID'));
 const boundary=await f.run('read',{...selector,offset:0,length:emoji+1});assert.equal(boundary.next_offset,emoji);assert.equal(boundary.text,raw.slice(0,emoji));assert.equal(fingerprint(f.db),before);
 const first=await f.run('inspect',{kind:'sources',limit:1});assert(first.next_cursor);
 f.db.prepare("UPDATE state_entries SET position=position+1 WHERE family='records' AND key='held'").run();const changed=fingerprint(f.db);
 await assert.rejects(f.run('inspect',{kind:'sources',limit:1,cursor:first.next_cursor}),code('LEGACY_CURSOR_CHANGED'));
 await assert.rejects(f.run('inspect',{kind:'sources',basis_sha256:readiness.basis_sha256}),code('LEGACY_SOURCE_CHANGED'));
 await assert.rejects(f.run('read',selector),code('LEGACY_SOURCE_CHANGED'));assert.equal(fingerprint(f.db),changed);
});

for(const [name,text]of [['escaped','"\\\n\t\u0001'.repeat(10000)],['CJK','雪漢字'.repeat(10000)],['surrogate-pairs','😀🚀'.repeat(10000)]])test('actual public '+name+' ranges remain exact through both reply encodings or an explicit typed capacity hold',async t=>{
 const f=fixture(t,{changes:{unknown_future:text}}),before=fingerprint(f.db),schema=publicSchema(f.root),readiness=await f.run('readiness'),inventory=await pages(f,'sources',{limit:schema.properties.input.properties.limit.maximum,basis_sha256:readiness.basis_sha256}),source=inventory.items.find(item=>item.sha256===rawHash(JSON.stringify(text)));assert(source);
 const length=schema.properties.input.properties.length.maximum;assert(Number.isSafeInteger(length)&&length>=2);
 const raw=await readBody(f,'source',{sha256:source.sha256,basis_sha256:readiness.basis_sha256},{source_id:source.source_id,length});assert.equal(raw,JSON.stringify(text));assert.equal(JSON.parse(raw),text);
 assert.equal(fingerprint(f.db),before);assert.equal(fs.existsSync(path.join(f.root,'.company','backups')),false);
});

test('largest advertised public inventory pages preserve their real cursor and complete collection under reply budgets',async t=>{
 const records=Object.fromEntries(Array.from({length:240},(_,i)=>{const id='fictional-'+String(i).padStart(3,'0');return [id,{id,kind:'artifact',revision:1,content:'UNKNOWN; spent allowance; preserve original '+i}];})),f=fixture(t,{changes:{records}}),before=fingerprint(f.db),schema=publicSchema(f.root),readiness=await f.run('readiness');
 const inventory=await pages(f,'sources',{limit:schema.properties.input.properties.limit.maximum,basis_sha256:readiness.basis_sha256});assert.equal(inventory.items.length,readiness.current_source_inventory.rows);assert.equal(new Set(inventory.items.map(item=>item.source_id)).size,inventory.items.length);assert.equal(fingerprint(f.db),before);
});

test('oversized actual readiness preserves its typed readonly hold and exact source pointer through public RPC',async t=>{
 const id='"\\'.repeat(8000),f=fixture(t,{changes:{id}}),before=fingerprint(f.db);
 const held=await f.run('readiness'),guidance=assertPublicCapacityHold(held,'readiness');
 assert.equal(guidance.input.sha256,rawHash(JSON.stringify(id)));assert.equal(guidance.input.length,publicSchema(f.root).properties.input.properties.length.maximum);
 const raw=await followExactSourcePointer(f,guidance);assert.equal(JSON.parse(raw),id);assert.equal(raw,JSON.stringify(id));
 const expires_at=new Date(Date.now()+3600000).toISOString(),prepared=await f.run('plan',{expires_at},{source_instruction:INSTRUCTION});assert.equal(prepared.status,'preparation-held');assert.equal(prepared.ready_for_apply,false);assert.equal(Object.hasOwn(prepared,'operation_source'),false);
 const plan=JSON.parse(await readBody(f,'plan',prepared.source,{expires_at}));assert.equal(typeof plan.authority?.company_id,'string');assert.equal(rawHash(plan.authority.company_id),rawHash(id));assert.equal(plan.authority.company_id.length,id.length);assert.equal(plan.native_qualification,false);
 assert.equal(fingerprint(f.db),before);assert.equal(fs.existsSync(path.join(f.root,'.company','backups')),false);
});

test('one oversized actual descriptor returns a structured no-delivery hold with an executable exact source pointer',async t=>{
 const f=fixture(t),sha256=f.db.prepare("SELECT sha256 FROM state_entries WHERE family='records' AND key='held'").get().sha256;
 f.db.prepare("INSERT INTO state_entries(family,key,position,sha256,encoding) VALUES(?,? ,0,?,'json')").run('"\\'.repeat(8000),'fictional',sha256);
 const before=fingerprint(f.db),held=await f.run('inspect',{kind:'sources',limit:publicSchema(f.root).properties.input.properties.limit.maximum}),guidance=assertPublicCapacityHold(held,'inspect');
 assert.equal(guidance.input.sha256,sha256);assert.equal(guidance.input.length,publicSchema(f.root).properties.input.properties.length.maximum);
 const raw=await followExactSourcePointer(f,guidance);assert.deepEqual(JSON.parse(raw),f.initial.records.held);
 assert.equal(fingerprint(f.db),before);assert.equal(fs.existsSync(path.join(f.root,'.company','backups')),false);
});

test('public preparation rejects missing and layout5 state without initializing or migrating it',async t=>{
 const f=fixture(t),empty=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-public-adoption-empty-'));t.after(()=>fs.rmSync(empty,{recursive:true,force:true}));bind(empty,SESSION,'codex');
 await assert.rejects(call(TOOL,{root:empty,session_id:SESSION,epoch:EPOCH,action:'readiness'},'codex'));assert.equal(fs.existsSync(path.join(empty,'.company')),false);
 f.db.prepare('UPDATE company_layout SET version=5 WHERE id=1').run();const before=fingerprint(f.db);await assert.rejects(f.run('readiness'),code('LEGACY_LAYOUT4_REQUIRED'));assert.equal(fingerprint(f.db),before);
});
