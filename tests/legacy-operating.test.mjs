import {preexistingLegacyStore} from './preexisting-legacy-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {digest,Store} from '../plugins/soloco/runtime/store.mjs';
import {bindSnapshots,retainSnapshot,pendingSnapshots,resolveSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';
import * as legacy from '../plugins/soloco/runtime/legacy-operating.mjs';
const json=JSON.stringify,clone=v=>JSON.parse(json(v));
function fixture(){return {id:'fictional-company',name:'Fixture',idea:'One founder company',revision:7,owner:{session_id:'owner',host:'codex',epoch:20},governance:'Pinned exact v0.18: no renewed grant through history.',cos_instructions:'Preserve communication r7 and uncertain remote effects.',roles:{qa:{name:'Independent QA'}},paused:true,records:{direction:{id:'direction',revision:1,kind:'intent',content:'Never export personal data.'},communication:{id:'communication',revision:7,kind:'preference',content:'Use complete communication conditions, DAG and timeline.'},history:{id:'history',revision:2,kind:'artifact',author_instance:'producer-old',content:'Permission once existed.',previous:[{id:'history',revision:1,content:'Never retry after exhausted allowance.',hidden_prohibition:'Export forbidden even after success.'}],unknown_field:{distant_exception:'Permission revoked unless fresh independent consent.',allowance:0,remote_certainty:'unknown',failure:{verdict:'Fail',reason:'Still unresolved'}}}},jobs:{},upgrade_history:[],context_classifications:{},messages:[],notices:[{id:'notice',kind:'must_know',summary:'Keep company paused; handover Blocked.'}],unknown_extension:{restriction:'No installation without checked acceptance.'}};}
const build=(s,options={})=>legacy.buildLegacyBootstrap(s,{source_ids:['history'],...options});
function reseal(m){delete m.manifest_sha256;m.manifest_sha256=digest(json(m));return m;}

test('shared bootstrap codec leaves reserved-key STRING examples opaque with exact bytes',()=>{
  for(const key of ['immutable_snapshot','immutable_entry'])for(const format of [undefined,2]){
    const s=fixture(),payload={nested:[{[key]:null}],description:'Malformed example remains STRING data é.'};
    const raw=format?' \r\n'+json(payload,null,format)+'\t':json(payload);
    s.records.history.content=raw;
    const m=build(s,{canonical_json_text:true}),decoded=legacy.decodeLegacyBootstrap(m);
    assert.ok(m.definitions.some(d=>d[0]==='string'&&d[1]===raw));
    assert.deepEqual(Buffer.from(decoded.state.records.history.content),Buffer.from(raw));
    assert.equal(m.snapshot_occurrences.length,0);
  }
});

test('pure builder preserves hidden prohibitions, exceptions, spent/revoked grants, failure, unknowns and attribution',()=>{
  const s=bindSnapshots(fixture()),before=json(s),pending=pendingSnapshots(s).size,m=build(s),d=legacy.decodeLegacyBootstrap(m),view=legacy.inspectLegacyBootstrap(m);
  assert.equal(json(s),before);assert.equal(pendingSnapshots(s).size,pending);assert.equal(json(d.state),before);
  assert.equal(json(d.selected[0].value),json(s.records.history));assert.equal(d.state.records.communication.revision,7);
  assert.equal(view.status,'Held');assert.equal(view.call_forecast,null);assert.equal(m.semantic_acceptance,false);
  assert.ok(m.frontier.some(e=>e.source.id==='direction'));assert.ok(m.frontier.every(e=>e.status==='unreviewed'));
  assert.ok(m.groups.every(g=>g.status==='unreviewed'&&g.required_context.scope==='*'));
  assert.ok(m.coherent_occurrences.some(e=>e.path.endsWith('/previous/0')));
  assert.equal(legacy.validateLegacyBootstrap(s,m).valid,true);
});

test('repeated checkpoints, previous versions and retained handover remain reconstructible without original vault',()=>{
  const s=bindSnapshots(fixture()),past=fixture();past.revision=1;const frozen=retainSnapshot(s,past),raws=new Map(pendingSnapshots(s));
  s.upgrade_history=[{id:'u1',revision:1,checkpoint:frozen,checkpoint_sha256:frozen.immutable_snapshot.sha256},{id:'u2',revision:2,checkpoint:frozen,checkpoint_sha256:frozen.immutable_snapshot.sha256}];
  const subject={company_id:s.id,records:{historical:past.records.history},jobs:{},messages:[],notices:[]};
  s.records.retained={id:'retained',kind:'artifact',author_role:'runner',author_instance:'old-owner',handover:{subject:retainSnapshot(s,subject),subject_sha256:digest(json(subject)),input_refs:[],incoming_owner:{session_id:'old-owner'}}};
  const before=json(s),m=build(s,{source_ids:['history','upgrade:u1','retained']});
  // Disconnect the source vault entirely, then decode only the self-contained manifest.
  bindSnapshots(s,()=>{throw Error('original vault must not be read');});
  const d=legacy.decodeLegacyBootstrap(m);assert.equal(json(d.state),before);
  assert.equal(json(resolveSnapshot(d.state,d.state.upgrade_history[0].checkpoint)),json(past));
  assert.equal(json(resolveSnapshot(d.state,d.state.records.retained.handover.subject)),json(subject));
  assert.ok(m.coherent_occurrences.filter(e=>e.source_identity.id==='history').length>=3);
  assert.ok(raws.size>0);assert.ok(m.originals.length>0);
  assert.ok(m.snapshot_occurrences.filter(o=>o.reference.immutable_snapshot.sha256===frozen.immutable_snapshot.sha256).length>=2);
  const packet=legacy.materializeLegacyGroup(m,m.groups[0].id);assert.equal(Buffer.byteLength(json(packet)),m.groups[0].complete_bytes);assert.ok(packet.required_supporting_rules.originals.length>0);
});

test('canonical JSON text codec preserves STRING type, Unicode, ordered keys and array positions byte exactly',()=>{
  const s=fixture(),text=json({z:'🧭\ud800\u0000é',a:[false,null,0,{b:2,a:1}],grant:'revoked'});
  s.records.history.content=text;s.records.history.same_text=text;s.records.history.not_canonical='{ "grant": "revoked" }';
  const m=build(s,{canonical_json_text:true}),d=legacy.decodeLegacyBootstrap(m);
  assert.ok(m.definitions.some(n=>n[0]==='json-text-string'));
  assert.equal(typeof d.selected[0].value.content,'string');assert.equal(d.selected[0].value.content,text);
  assert.equal(json(d.state),json(s));assert.equal(d.selected[0].value.not_canonical,'{ "grant": "revoked" }');
  assert.deepEqual(Object.keys(JSON.parse(d.selected[0].value.content)),['z','a','grant']);
});

test('producer/revision/date/scope/parent mutations and archive appends invalidate complete baseline',()=>{
  const s=fixture();s.jobs.j={id:'j',instance_id:'producer-old',artifact_id:'history',native_id:'native',status:'completed'};s.records.history.job_id='j';
  const m=build(s);
  for(const mutate of [x=>x.jobs.j.native_id='other',x=>x.records.history.revision++,x=>x.records.history.date='tomorrow',x=>x.records.history.scope='new',x=>x.records.history.previous.reverse(),x=>x.records.extra={id:'extra',content:'New global prohibition.'},x=>x.unknown_extension.restriction='Changed']){
    const c=clone(s);if(mutate.toString().includes('reverse'))c.records.history.previous.push({id:'previous2',content:'exception'});mutate(c);assert.throws(()=>legacy.validateLegacyBootstrap(c,m),/Held/);
  }
  const f=legacy.legacyOperatingFrontier(s);assert.equal(f.complete,false);assert.equal(f.interaction_complete,false);assert.ok(f.entries.every(e=>e.status==='dirty'));
  const changed=clone(s);changed.records.new={id:'new',content:'No retry.'};assert.notEqual(legacy.legacyOperatingFrontier(changed).source_root,f.source_root);
});

test('missing/corrupt references, cycles, omissions, altered typed keys and resealed frontier holes hold',()=>{
  const m=build(fixture());
  const variants=[x=>x.definitions.pop(),x=>x.definitions.push(['array',[x.definitions.length]]),x=>x.frontier.pop(),x=>x.groups[0].occurrences=[],x=>x.groups[0].complete_bytes=1,x=>x.definitions.push(['object',[['duplicate',0],['duplicate',0]]]),x=>x.definitions.push(['number',NaN])];
  for(const mutate of variants){const c=clone(m);mutate(c);assert.throws(()=>legacy.decodeLegacyBootstrap(reseal(c)),/Held/);}
  const s=bindSnapshots(fixture());s.unknown_snapshot={immutable_snapshot:{version:1,sha256:'a'.repeat(64),characters:4,shape:'object'}};assert.throws(()=>build(s),/missing or corrupt/);
  const cycle=fixture();cycle.records.history.loop=cycle;assert.throws(()=>build(cycle),/acyclic/);
  const broken=fixture();broken.records.history.job_id='missing';assert.throws(()=>build(broken),/producer/);
});

test('same body has distinct occurrences across producer/revision/scope/date and parent contexts',()=>{
  const s=fixture();s.records.history.previous.push({id:'history',revision:1,content:'Never retry after exhausted allowance.',author_instance:'other',scope:'billing',date:'yesterday'});
  const m=build(s);const repeated=m.coherent_occurrences.filter(o=>o.source_identity.id==='history');
  assert.ok(repeated.length>=3);assert.equal(new Set(repeated.map(o=>json([o.root,o.path]))).size,repeated.length);
  assert.ok(new Set(repeated.map(o=>o.source_identity.sha256)).size>=3);
});

test('overcapacity holds whole uncertain coupling and never implies global fit',()=>{
  const m=build(fixture(),{max_group_bytes:1}),v=legacy.inspectLegacyBootstrap(m);
  assert.equal(v.groups[0].fit,'Held');assert.ok(v.groups[0].required_supporting_rules_bytes>1);
  assert.ok(v.unsupported_couplings.length);assert.equal(v.frontier.length,3);
  assert.equal(v.groups[0].complete_bytes,v.groups[0].body_bytes+v.groups[0].occurrence_context_bytes+v.groups[0].required_supporting_rules_bytes+v.groups[0].framing_bytes);
});

test('capture uses existing SQLite transaction/vault; rollback does not publish capsule',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-bootstrap-contract-'));let db;
  try{
    db=preexistingLegacyStore(dir,'fixture',()=>fixture());db.migrate();
    const s=db.read(),m=build(s);assert.throws(()=>legacy.captureLegacyBootstrap(s,m),/transaction/);
    assert.throws(()=>legacy.captureLegacyBootstrap(s,m,{transaction:{inTransaction:true,transaction(){},read(){}}}),/transaction/);
    let capsule;db.transaction('fixture.capture',state=>{capsule=legacy.captureLegacyBootstrap(state,m,{transaction:db});state.bootstrap_fixture=capsule;return state;});
    const current=db.read();assert.equal(legacy.readLegacyBootstrap(current,current.bootstrap_fixture).manifest_sha256,m.manifest_sha256);
    // The capture itself never installs operating state or changes original records.
    assert.equal(json(current.records),json(s.records));assert.equal(current.paused,true);
    let rolled;assert.throws(()=>db.transaction('fixture.rollback',state=>{const n=build(state);rolled=legacy.captureLegacyBootstrap(state,n,{transaction:db});state.rollback_fixture=rolled;throw Error('rollback');}),/rollback/);
    assert.equal(db.read().rollback_fixture,undefined);
    assert.throws(()=>legacy.readLegacyBootstrap(db.read(),rolled),/missing|corrupt|hash mismatch/);
  }finally{db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});


test('forced digest collision never merges unequal exact definitions',()=>{
  // Hash-only lookup would incorrectly merge these scalar and structured values.
  const source=`import crypto from 'node:crypto';import {syncBuiltinESMExports} from 'node:module';
    crypto.createHash=()=>({update(){return this},digest(){return 'a'.repeat(64)}});syncBuiltinESMExports();
    const {buildLegacyBootstrap}=await import('./plugins/soloco/runtime/legacy-operating.mjs');
    try{buildLegacyBootstrap(${json(fixture())},{source_ids:['history']});process.exit(2);}catch(e){if(!/hash collision/.test(e.message)){console.error(e);process.exit(3);}}`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',source],{cwd:path.resolve(import.meta.dirname,'..'),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('ambiguous current/history source IDs and missing embedded raw originals hold',()=>{
  const s=bindSnapshots(fixture());s.upgrade_history=[{id:'same',revision:1,content:'Revoked'}];s.upgrade={id:'same',revision:2,content:'Historical grant'};
  assert.throws(()=>build(s,{source_ids:['upgrade:same']}),/ambiguous source occurrence/);
  const other=bindSnapshots(fixture());other.unknown_extension.snapshot=retainSnapshot(other,{hidden:'No retry.'});
  const m=build(other),damaged=clone(m);damaged.originals=[];
  assert.throws(()=>legacy.decodeLegacyBootstrap(reseal(damaged)),/missing|corrupt|coverage/);
});

test('lossless noncanonical STRING graph preserves raw bytes and rejects forged token correspondence',()=>{
  const s=fixture(),raw=String.raw` {
    "message": "escaped \u00e9 and \"quotes\" and \\ backslash",
    "nested": [true, null, {"late": "Never retry while OPEN"}]
  } `;
  s.records.history.content=raw;
  const untouched=build(s);assert.ok(untouched.definitions.some(d=>d[0]==='string'&&d[1]===raw));
  const m=build(s,{canonical_json_text:true}),decoded=legacy.decodeLegacyBootstrap(m);
  assert.deepEqual(Buffer.from(decoded.state.records.history.content),Buffer.from(raw));
  assert.equal(typeof decoded.state.records.history.content,'string');
  const node=m.definitions.find(d=>d[0]==='json-text-string'&&d[2]===raw);assert.ok(node);
  for(const alter of [(_m,d)=>d[2]=d[2].replace('true','false'),(_m,d)=>d[2]=d[2].replace('"message"','"nested"'),(_m,d)=>d[2]=d[2].slice(0,-2),
    (m,d)=>{const child=m.definitions[d[1]];d[1]=m.definitions.length;m.definitions.push(['object',[...child[1]].reverse()]);}]){
    // Each adversarial definition is independently resealed; decoder validation
    // and the exact deterministic rebuild remain compulsory.
    const bad=clone(m),target=bad.definitions.find(d=>d[0]==='json-text-string'&&d[2]===raw);
    alter(bad,target);
    assert.throws(()=>legacy.decodeLegacyBootstrap(reseal(bad)),/Held/);
  }
});
