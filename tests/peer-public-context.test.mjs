import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {peerFixture} from './peer-fixture.mjs';
import {FAMILIES,canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {captureLegacyPinnedTeam,legacySourceId,legacyEncodedReplyBytes} from '../plugins/soloco/runtime/peers/legacy-origin.mjs';
import {inspectPeerPublicContextFrom,readPeerPublicContextFrom,inspectPeerPublicPinsFrom,readPeerPublicPinsFrom,PEER_PUBLIC_CONTEXT_LIMITS} from '../plugins/soloco/runtime/peer-public-context.mjs';

// Every database, policy and legacy source below is explicitly fictional.
const sha=text=>createHash('sha256').update(text).digest('hex');
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const fingerprint=f=>peerDigest(Object.fromEntries(['peer_rows','peer_versions','peer_events','peer_outbox','peer_meta','peer_generations','peer_membership','immutable_values'].map(table=>[table,f.ledger.db.prepare('SELECT * FROM '+table).all()])));
function fixture(t){const f=peerFixture();t.after(()=>f.close());return f;}
const inspect=(f,input)=>f.ledger.read(tx=>inspectPeerPublicContextFrom(tx,{company_id:f.ledger.company_id,...input}));
const read=(f,source,input={})=>f.ledger.read(tx=>readPeerPublicContextFrom(tx,{company_id:f.ledger.company_id,...ref(source.family,source),...input}));

test('cold selectors expose every actual family through exact metadata, retaining UNKNOWN and spent units without writes',t=>{
 const f=fixture(t);
 f.ledger.write('fixture.cold-source','founder',tx=>{for(const family of FAMILIES)tx.put(family,'cold-source',{kind:'fictional',status:'unknown',scope:'fixture',spent_units:7,release_authority:false,content:'Retained original failure and uncertainty.'},0);});
 const before=fingerprint(f);
 for(const family of FAMILIES){
  const page=inspect(f,{family,scope:'fixture'});assert.equal(page.metadata_only,true);assert.equal(page.items.length,1);
  const item=page.items[0];assert.equal(item.status,'unknown');assert.equal(item.source.family,family);assert.equal(item.source.read.tool,'company_owner');
  const result=read(f,item.source);assert.equal(result.complete,true);assert.equal(sha(result.text),item.source.content_sha256);
  assert.deepEqual(JSON.parse(result.text),{kind:'fictional',status:'unknown',scope:'fixture',spent_units:7,release_authority:false,content:'Retained original failure and uncertainty.'});
 }
 assert.equal(fingerprint(f),before);
});

test('metadata does not inline large source bodies, and escaped identities page under the actual encoded reply limit',t=>{
 const f=fixture(t),ids=Array.from({length:12},(_,i)=>String(i).padStart(2,'0')+'\\'.repeat(1200)),content='FULL_REQUIRED_ORIGINAL_VALUE'.repeat(300);
 f.ledger.write('fixture.cold-large','founder',tx=>{for(const id of ids)tx.put('work_items',id,{kind:'fictional',status:'unknown',scope:'large',content},0);});
 const before=fingerprint(f),seen=[];let cursor;
 for(let pages=0;pages<30;pages++){
  const page=inspect(f,{family:'work_items',scope:'large',limit:50,...(cursor?{cursor}:{})});
  assert(legacyEncodedReplyBytes(page)<=PEER_PUBLIC_CONTEXT_LIMITS.encoded_reply_bytes);if(pages===0)assert(page.effective_limit<50);
  assert.equal(JSON.stringify(page).includes('FULL_REQUIRED_ORIGINAL_VALUE'),false);
  for(const item of page.items){seen.push(item.source.id);assert(item.fields_not_inlined.includes('content'));assert.equal(item.source.id.length,1202);}
  if(page.complete)break;assert(page.next_cursor&&page.next_cursor!==cursor);cursor=page.next_cursor;
 }
 assert.deepEqual(seen,ids);assert.equal(fingerprint(f),before);
});

test('full current values reconstruct through Unicode-safe ranges and never use an old version as current',t=>{
 const f=fixture(t),value={status:'unknown',content:'α😀'+String.fromCharCode(1).repeat(5500)+'Complete retained source.'};
 f.ledger.write('fixture.cold-ranges','founder',tx=>tx.put('tasks','ranged',value,0));
 const selected=inspect(f,{family:'tasks'}).items.find(x=>x.source.id==='ranged').source,before=fingerprint(f);
 let offset=0,body='';
 for(let ranges=0;ranges<40;ranges++){
  const part=read(f,selected,{offset,length:4096});assert(legacyEncodedReplyBytes(part)<=24576);assert.equal(part.offset,offset);body+=part.text;
  if(part.complete){assert.equal(part.next_offset,null);break;}assert(part.next_offset>offset);offset=part.next_offset;
 }
 assert.equal(body,canonical(value));assert.equal(sha(body),selected.content_sha256);assert.deepEqual(JSON.parse(body),value);
 const emoji=body.indexOf('😀');assert.throws(()=>read(f,selected,{offset:emoji+1,length:2}),e=>e.code==='PEER_CONTEXT_RANGE');
 assert.throws(()=>read(f,selected,{offset:emoji,length:1}),e=>e.code==='PEER_CONTEXT_RANGE');
 assert.equal(fingerprint(f),before);
 f.ledger.write('fixture.cold-change','founder',tx=>{const old=tx.get('tasks','ranged');tx.put('tasks',old.id,{...old.value,correction:'New current fact.'},old.revision);});
 assert(f.ledger.read(tx=>tx.getVersion(ref('tasks',selected))));
 assert.throws(()=>read(f,selected),e=>e.code==='PEER_CONTEXT_CHANGED');
});

test('foreign cursors and unsupported selectors fail before accessors or provider calls',t=>{
 const f=fixture(t);f.ledger.write('fixture.cold-cursors','founder',tx=>{for(let i=0;i<4;i++)tx.put('tasks','t'+i,{status:'unknown',scope:'a'},0);});
 const page=inspect(f,{family:'tasks',scope:'a',limit:1});assert(page.next_cursor);
 assert.throws(()=>inspect(f,{family:'tasks',scope:'b',cursor:page.next_cursor}),/cursor/i);
 let called=0;const tx={get(){called++;},list(){called++;}};
 const base={company_id:f.ledger.company_id,family:'tasks',id:'x',revision:1,sha256:'0'.repeat(64)};
 for(const bad of [{...base,family:'filesystem'},{...base,length:4097},{...base,offset:-1},{...base,provider:{}},new Proxy(base,{get(){throw Error('Proxy must not run');}})])assert.throws(()=>readPeerPublicContextFrom(tx,bad),e=>e.code==='PEER_CONTEXT_INPUT');
 const getter={...base};Object.defineProperty(getter,'id',{enumerable:true,get(){called++;throw Error('Getter must not run');}});
 assert.throws(()=>readPeerPublicContextFrom(tx,getter),e=>e.code==='PEER_CONTEXT_INPUT');assert.equal(called,0);
});

test('provider Error and AggregateError objects retain their exact identity and members',t=>{
 const f=fixture(t),before=fingerprint(f),cause=Error('Original backend cause');
 for(const error of [Object.assign(Error('Source read EIO'),{code:'PEER_CONTEXT_INPUT',cause}),new AggregateError([cause,Error('second')],'Original aggregate',{cause})]){
  assert.throws(()=>inspectPeerPublicContextFrom({list(){throw error;}},{company_id:f.ledger.company_id,family:'slots'}),e=>e===error);
  assert.throws(()=>readPeerPublicContextFrom({get(){throw error;}},{company_id:f.ledger.company_id,family:'slots',id:'old',revision:1,sha256:'0'.repeat(64)}),e=>e===error);
 }
 assert.equal(fingerprint(f),before);
});

function pins(f){
 const roles={z:{mission:'Last original role.'},a:{mission:'First original role.'}},state={id:f.ledger.company_id,plugin_version:'fixture-original-version',runtime_version:'fixture-original-runtime',governance:'Fictional full governance. '.repeat(2400),cos_instructions:'Fictional complete instructions. '.repeat(100),roles,owner:{host:'codex',session_id:'fixture-owner',epoch:7}};
 state.governance_sha256=sha(state.governance);state.team_sha256=sha(JSON.stringify([state.plugin_version,state.governance,state.roles,state.cos_instructions]));
 const sources=['plugin_version','governance','roles','cos_instructions'].map((key,position)=>{const bytes=JSON.stringify(state[key]),source={family:'root',key,position,encoding:'json',sha256:sha(bytes)};source.source_id=legacySourceId(source);f.ledger.db.prepare('INSERT INTO immutable_values(sha256,bytes) VALUES(?,?)').run(source.sha256,bytes);return source;});
 const cut=sha('FICTIONAL complete source cut'),bundle=captureLegacyPinnedTeam(state,sources,cut);
 f.ledger.write('fixture.cold-pins','founder',tx=>{const pinned=tx.put('control','pinned-team',{protocol:'peer-pinned-team-record-v1',bundle,bundle_sha256:peerDigest(bundle)},0),c=tx.get('control','company');tx.put('control','company',{...c.value,pinned_team:ref('control',pinned),legacy_source_cut_sha256:cut,team_sha256:state.team_sha256,governance_sha256:state.governance_sha256},c.revision);});
 return {state,sources};
}
test('cold pins load complete original instructions and role ordering through bounded exact sources',t=>{
 const f=fixture(t),p=pins(f),before=fingerprint(f),header=f.ledger.read(tx=>inspectPeerPublicPinsFrom(tx,{company_id:f.ledger.company_id}));
 assert.equal(header.sources.length,4);assert.equal(header.plugin_version,p.state.plugin_version);assert.equal(JSON.stringify(header).includes('Fictional full governance.'),false);
 for(const source of header.sources){
  let offset=0,body='';
  for(let ranges=0;ranges<100;ranges++){
   const result=f.ledger.read(tx=>readPeerPublicPinsFrom(tx,{part:source.part,reference:source.reference,sha256:source.sha256,offset,length:4096},{company_id:f.ledger.company_id}));
   assert(legacyEncodedReplyBytes(result)<=24576);body+=result.text;if(result.complete)break;assert(result.next_offset>offset);offset=result.next_offset;
  }
  assert.equal(body,JSON.stringify(p.state[source.part]));assert.equal(sha(body),source.sha256);
 }
 assert.equal(fingerprint(f),before);
 const selected=header.sources.find(x=>x.part==='governance');f.ledger.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run(JSON.stringify('Wrong original.'),selected.sha256);
 assert.throws(()=>f.ledger.read(tx=>readPeerPublicPinsFrom(tx,{part:selected.part,reference:selected.reference,sha256:selected.sha256,offset:0,length:1},{company_id:f.ledger.company_id})),/immutable evidence|PINNED_TEAM_CHANGED/i);
});
