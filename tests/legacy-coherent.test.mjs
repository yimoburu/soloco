import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store,digest} from '../plugins/soloco/runtime/store.mjs';
import {bindSnapshots,retainSnapshot,pendingSnapshots,resolveSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';
import {buildLegacyCoherentPlan as build,decodeLegacyCoherentPlan as decode,openLegacyCoherentPlan as open,validateLegacyCoherentPlan as validate,captureLegacyCanonicalSource,legacyCanonicalCoverage} from '../plugins/soloco/runtime/legacy-operating.mjs';
const json=JSON.stringify,clone=v=>JSON.parse(json(v));
function fixture(){return bindSnapshots({id:'fictional',revision:7,owner:{session_id:'fixture-owner',host:'codex',epoch:1},paused:true,governance:'Current permission requires independent review.',cos_instructions:'Retain every OPEN failure.',roles:{qa:{name:'QA'}},records:{a:{id:'a',revision:2,content:'Export permitted under local conditions.',previous:[{id:'a',revision:1,content:'Export forbidden.',review:{verdict:'Fail',reason:'Consent absent.'}}],late_qualifier:'Except personal data; spent allowance is never renewed.'}},jobs:{},messages:[],notices:[],upgrade_history:[],context_classifications:{},unknown_extension:{code:'export default "No permission granted"',logs:'Blocked: unresolved effects'}});}
function reseal(p){delete p.plan_sha256;p.plan_sha256=digest(json(p));return p;}
function packets(p){const session=open(p);return p.occurrences.filter(o=>o.fit!=='Held').map(o=>session.materialize(o.id));}

test('complete local sections retain late qualifiers, old versions, negatives and unknown code/logs; no raw baseline per packet',()=>{
  const s=fixture(),before=json(s),pending=pendingSnapshots(s).size,p=build(s),all=packets(p);
  assert.equal(json(s),before);assert.equal(pendingSnapshots(s).size,pending);
  assert.equal(json(decode(p).state),before);
  const current=p.groups.find(g=>g.section.body?.late_qualifier);
  assert.match(current.section.body.late_qualifier,/Except personal data/);
  assert.ok(current.section.cuts.some(c=>c.path==='/previous/0'));
  const old=all.find(x=>x.sections.some(g=>g.body?.review?.verdict==='Fail'));
  assert.ok(old.sections.some(g=>g.body?.late_qualifier));
  assert.ok(all.some(x=>json(x).includes('unresolved effects')));
  assert.ok(all.every(x=>!Object.hasOwn(x,'required_supporting_rules')&&x.semantic_acceptance===false));
  for(const o of p.occurrences)if(o.fit!=='Held')assert.equal(Buffer.byteLength(json(open(p).materialize(o.id))),o.packet_bytes);
  assert.equal(p.measurements.total_packet_bytes,all.reduce((n,x)=>n+Buffer.byteLength(json(x)),0));
});

test('repeated snapshots use exact raw originals and inbound ancestry, contradictory occurrence contexts never transfer acceptance',()=>{
  const s=fixture(),past=fixture();past.governance='Old grant, now revoked.';
  const snap=retainSnapshot(s,past);
  s.upgrade_history=[{id:'u1',checkpoint:snap,scope:'billing',condition:'No export.'},{id:'u2',checkpoint:snap,scope:'sales',condition:'Export claimed permitted.'}];
  const p=build(s),edges=p.snapshot_inbound.filter(e=>e.original_sha256===snap.immutable_snapshot.sha256);
  assert.equal(edges.length,2);assert.notDeepEqual(edges[0].ancestor_roots,edges[1].ancestor_roots);
  assert.equal(edges[0].target_group,edges[1].target_group);
  assert.equal(p.originals.length,1);
  bindSnapshots(s,()=>{throw Error('source vault unavailable');});
  const decoded=decode(p);assert.equal(json(resolveSnapshot(decoded.state,decoded.state.upgrade_history[0].checkpoint)),json(past));
  assert.equal(decoded.originals[0].raw,json(past));
  assert.match(p.adapter.missing_interface,/partitioner/);assert.equal(p.adapter.status,'Held');
  const closure=legacyCanonicalCoverage(decoded.state,p);assert.equal(closure.complete,false);assert.ok(closure.unresolved.includes('all snapshot inbound contexts'));
});

test('canonical JSON text is typed STRING evidence, coherent logical bodies replace escaped-range chunks',()=>{
  const s=fixture(),old=clone(s);s.records.a.content=json(old);
  const p=build(s),d=decode(p);
  assert.equal(typeof d.state.records.a.content,'string');assert.equal(d.state.records.a.content,json(old));
  assert.ok(p.groups.some(g=>g.section.body?.content?.legacy_coherent_string_encoding==='canonical-json-text'));
  assert.ok(p.occurrences.some(o=>o.path.includes('/@json-text')));
  assert.ok(!p.groups.some(g=>Object.hasOwn(g,'range')));
});

test('resealed gaps, altered ancestry, omitted originals, forged sizes and changed qualifiers/membership hold',()=>{
  const s=fixture();s.upgrade_history=[{id:'u',checkpoint:retainSnapshot(s,fixture())}];const p=build(s);
  for(const change of [x=>x.occurrences.pop(),x=>x.groups.pop(),x=>x.snapshot_inbound.pop(),x=>x.originals=[],x=>x.occurrences[0].ancestor_roots=[0],x=>x.occurrences[0].packet_bytes=1,x=>x.collection_indexes.pop()]){
    const c=clone(p);change(c);assert.throws(()=>decode(reseal(c)),/Held|missing|corrupt/);
  }
  for(const change of [x=>x.records.a.late_qualifier='Revoked globally.',x=>x.records.b={id:'b',content:'New prohibition.'}]){const c=clone(s);bindSnapshots(c,sha=>pendingSnapshots(s).get(sha));change(c);assert.throws(()=>validate(c,p),/Held/);}
});

test('bounded whole sections hold without truncation or cap widening; owned session resists caller mutation',()=>{
  const s=fixture();s.records.a.content='Complete indivisible condition '.repeat(4000);const p=build(s),o=p.occurrences.find(x=>x.fit==='Held');
  assert.ok(o);assert.throws(()=>open(p).materialize(o.id),/exceeds cap/);assert.throws(()=>build(s,{max_packet_bytes:48001}),/cap/);
  const small=build(fixture()),session=open(small),id=small.occurrences[0].id,expected=json(session.materialize(id));
  small.groups[0].section.body='tampered';assert.equal(json(session.materialize(id)),expected);
  const packet=session.materialize(id);packet.sections=[];assert.equal(json(session.materialize(id)),expected);
});

test('linear unique section work for repeated snapshots; byte forecast without constructing corpus combinations',t=>{
  function repeated(n){const s=fixture(),snap=retainSnapshot(s,fixture());s.upgrade_history=Array.from({length:n},(_,i)=>({id:'u'+i,checkpoint:snap,condition:'Remain paused.'}));return build(s);}
  const a=repeated(10),b=repeated(100);
  assert.equal(a.originals.length,b.originals.length);assert.equal(b.snapshot_inbound.length,100);
  assert.ok(b.measurements.unique_section_bytes<a.measurements.unique_section_bytes*12);
  assert.ok(b.measurements.largest_packet_bytes<a.measurements.largest_packet_bytes*2);
  assert.equal(b.measurements.complete_native_request_bytes,null);assert.equal(b.measurements.native_same_session_fit,'unproven');
  t.diagnostic(json({fictional_only:true,ten:a.measurements,hundred:b.measurements}));
});

test('existing canonical source adapter uses runtime test author_instance and rejects invalid producer/candidate closure',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-coherent-canonical-'));let db;
  try{
    db=new Store(dir,true);db.transaction('fixture',()=>fixture());db.migrate();
    // A canonical runtime test has NO new job_id field. Candidate/plan/run edges
    // are exactly the existing scoped-context producer contract.
    db.transaction('fixture.runtime',s=>{
      s.records.plan={id:'plan',revision:1,development:{type:'plan'},content:'Fictional test plan.'};
      s.records.candidate={id:'candidate',revision:1,development:{type:'candidate',candidate_sha256:'candidate-hash',run:{job_id:'controller',receipt_id:'receipt',status:'completed'}},content:'Fictional code.'};
      const result={status:'passed'};
      s.records.receipt={id:'receipt',revision:1,author_role:'runtime',author_instance:'controller',content:json(result),development:{type:'test',candidate_id:'candidate',plan_id:'plan',candidate_sha256:'candidate-hash',receipt_sha256:digest(json(result)),result}};
      s.jobs.controller={id:'controller',kind:'development_test',artifact_id:'receipt',candidate_id:'candidate',development_id:'plan',status:'completed'};return s;
    });
    db.transaction('fixture.adapter',s=>{const p=build(s),descriptor=captureLegacyCanonicalSource(s,p,{source_id:'receipt',transaction:db});assert.equal(descriptor.protocol,'scoped-context-v1');assert.ok(descriptor.units.length);assert.equal(s.records.receipt.job_id,undefined);const coherent=captureLegacyCanonicalSource(s,p,{source_id:'receipt',transaction:db,partitioner:'coherent-source-v1'});assert.equal(coherent.partitioner,'coherent-source-v1');assert.notEqual(coherent.extraction_identity,descriptor.extraction_identity);return s;});
    for(const mutate of [s=>s.jobs.controller.kind='ordinary',s=>s.records.receipt.author_instance='missing',s=>s.records.candidate.development.run.receipt_id='wrong',s=>s.records.receipt.development.receipt_sha256='bad',s=>s.records.receipt.job_id='different']){
      assert.throws(()=>db.transaction('fixture.invalid',s=>{mutate(s);captureLegacyCanonicalSource(s,build(s),{source_id:'receipt',transaction:db});return s;}),/producer|runtime test closure|source missing/);
    }
    assert.throws(()=>captureLegacyCanonicalSource(db.read(),build(db.read()),{source_id:'a'}),/transaction/);
    assert.throws(()=>legacyCanonicalCoverage(db.read(),build(db.read()),{integration_review_ids:['fake-pass']}),/missing|hold/i);
  }finally{db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('anonymous enclosing qualifiers and scalar collection members cannot hide complete local conditions',()=>{
  const s=fixture();s.records.a.wrapper={scope:'billing-only',late_exception:'Never retry while OPEN.',version:{id:'inner',content:'A conditional claim.'}};s.notices=['Never retry while OPEN.'];
  const p=build(s),packet=packets(p).find(x=>x.sections.some(g=>g.body?.id==='inner'));
  assert.ok(packet.sections.some(g=>g.body?.wrapper?.late_exception==='Never retry while OPEN.'));
  assert.ok(packet.sections.some(g=>g.body?.wrapper?.scope==='billing-only'));
  assert.ok(p.sources.every(x=>x.producer_validation==='required-canonical-scoped-plan'&&x.receipt_reuse===false));
});

test('strict reference metadata remains in its parent section without independent extraction subjects',()=>{
 const s=fixture();s.records.a.inputs=Array.from({length:40},(_,i)=>({id:'source-'+i,revision:i,sha256:'a'.repeat(64)}));
 s.records.a.conditional_reference={id:'source-special',revision:1,sha256:'b'.repeat(64),condition:'Never retry while OPEN.'};
 const p=build(s),current=p.groups.find(g=>g.section.body?.late_qualifier);
 assert.deepEqual(current.section.body.inputs,s.records.a.inputs);
 assert.ok(!p.occurrences.some(o=>o.path.includes('/inputs/')));
 assert.ok(p.groups.some(g=>g.section.body?.condition==='Never retry while OPEN.'));
 assert.equal(json(decode(p).state),json(s));
 // Top-level collection intake cannot become inert merely by using ref shape.
 s.records.untrusted={id:'untrusted',revision:1,sha256:'c'.repeat(64)};
 const q=build(s);assert.ok(q.sources.some(r=>r.source.id==='untrusted'&&r.group_id));
 assert.ok(q.occurrences.some(o=>o.path==='/records/untrusted'));
});
