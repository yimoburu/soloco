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

test('complete JSON fields and file bodies cut at typed boundaries; indivisible strings still hold',()=>{
  const s=fixture(),payload={first:'a'.repeat(9000),unknown_last_field:'DENY '+('b'.repeat(9000)),nested:{condition:'OPEN'}};
  s.records.a.content=JSON.stringify(payload);s.records.a.files=[{path:'example.txt',content:'indivisible '.repeat(5000),unknown_qualifier:'No execution'}];
  const before=JSON.stringify(s),p=build(s),decoded=decode(p);
  assert.equal(JSON.stringify(decoded.state),before);assert.equal(typeof decoded.state.records.a.content,'string');
  const fields=p.groups.find(g=>g.section.cuts.some(c=>c.path==='/first'));
  assert.ok(fields);assert.ok(fields.section.cuts.some(c=>c.path==='/unknown_last_field'));
  assert.ok(p.groups.some(g=>g.section.body===payload.unknown_last_field));
  assert.ok(p.groups.some(g=>g.section.body?.unknown_qualifier==='No execution'));
  assert.ok(p.occurrences.some(o=>o.fit==='Held'));assert.equal(p.semantic_acceptance,false);
});

test('nested canonical sources maps expose bounded complete fields with every shared occurrence and exact original',t=>{
  const s=fixture(),sizes=[21650,17056,12952,11782,9904];
  const sources=Object.fromEntries(sizes.map((size,i)=>['src/file~'+i+'.mjs',('/* fictional file '+i+' */\n').padEnd(size,String(i))]));
  const version=qualifier=>json({package:{sources,diff:'d'.repeat(11334),test_output:'t'.repeat(4667),
    mixed:[null,false,17,'small primitive',{empty:{},list:[],unknown:'uncertain'}]},
    late_prohibition:'LATE_NO_EXPORT: no execution while OPEN.',unknown_qualifier:qualifier});
  const left=version('Consent exhausted.'),right=version('Consent revoked.');
  assert.ok(Buffer.byteLength(left)>48000&&Buffer.byteLength(right)>48000);
  assert.ok(Object.values(sources).every(v=>Buffer.byteLength(v)<24000));
  s.records.a.content=left;s.records.a.previous=[{id:'a',revision:1,content:right}];
  const past={id:'past',content:left,unknown:'Original evidence only.'},snap=retainSnapshot(s,past);
  s.upgrade_history=[{id:'u',checkpoint:snap,condition:'No authority transfer.'}];
  const before=json(s),p=build(s),decoded=decode(p),session=open(p);
  assert.equal(json(decoded.state),before);
  assert.equal(decoded.state.records.a.content,left);assert.equal(typeof decoded.state.records.a.content,'string');
  assert.equal(decoded.state.records.a.previous[0].content,right);
  assert.equal(decoded.originals[0].raw,json(past));
  assert.equal(digest(decoded.originals[0].raw),snap.immutable_snapshot.sha256);
  // Rebuild each local section through its explicit cuts, independently of the
  // graph decoder: no primitive, empty structure, ordered key or array slot lost.
  const byId=new Map(p.groups.map(g=>[g.id,g]));
  function expand(id){const {body,cuts}=byId.get(id).section;
    function visit(v,path=''){
      const cut=cuts.find(c=>c.path===path);if(cut){
        if(cut.group_id)return expand(cut.group_id);
        const collection=p.collection_indexes.find(c=>c.id===cut.collection_id);
        const members=collection.ordered_members.map(m=>[m.key,expand(m.group_id)]);
        return p.definitions[collection.root][0]==='array'?members.map(([,v])=>v):Object.fromEntries(members);
      }
      if(Array.isArray(v))return v.map((x,i)=>visit(x,path+'/'+i));
      if(v&&typeof v==='object'){
        if(v.legacy_coherent_string_encoding==='canonical-json-text')return json(visit(v.value,path+'/@json-text'));
        return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x,path+'/'+k.replaceAll('~','~0').replaceAll('/','~1'))]));
      }return v;
    }return visit(body);
  }
  const canonical=p.occurrences.find(o=>o.path==='/records/a/content/@json-text');
  assert.equal(json(expand(canonical.group_id)),left);
  const map=p.groups.find(g=>g.section.cuts.length===sizes.length&&g.section.cuts.every(c=>c.path.startsWith('/src~1file~0')));
  assert.ok(map);assert.deepEqual(Object.keys(map.section.body),Object.keys(sources));
  const file=p.groups.find(g=>g.section.body===sources['src/file~0.mjs']);
  const occurrences=p.occurrences.filter(o=>o.group_id===file.id);
  assert.equal(occurrences.length,3);assert.equal(new Set(occurrences.map(o=>json([o.document,o.path]))).size,3);
  const current=occurrences.find(o=>o.path.startsWith('/records/a/content/'));
  const previous=occurrences.find(o=>o.path.startsWith('/records/a/previous/0/content/'));
  assert.notDeepEqual(current.ancestor_roots,previous.ancestor_roots);
  assert.notDeepEqual(current.qualifier_groups,previous.qualifier_groups);
  for(const o of occurrences){const packet=session.materialize(o.id);
    assert.ok(json(packet).includes('LATE_NO_EXPORT'));
    assert.equal(Buffer.byteLength(json(packet)),o.packet_bytes);assert.ok(o.packet_bytes<48000);
    assert.ok(packet.sections.some(g=>g.body===sources['src/file~0.mjs']));
  }
  assert.ok(json(session.materialize(current.id)).includes('Consent exhausted.'));
  assert.ok(json(session.materialize(previous.id)).includes('Consent revoked.'));
  assert.equal(p.measurements.held_packets,0);assert.equal(p.semantic_acceptance,false);
  assert.match(p.adapter.required_phases.join(' '),/independent cross-group/);
  assert.match(p.adapter.required_phases.join(' '),/exact occurrence\/section\/item\/interface coverage/);
  for(const edit of [x=>x.occurrences.splice(x.occurrences.findIndex(o=>o.id===previous.id),1),x=>x.groups.find(g=>g.id===map.id).section.cuts.pop()]){
    const bad=clone(p);edit(bad);assert.throws(()=>decode(reseal(bad)),/Held/);
  }
  t.diagnostic(json({fictional_only:true,parent_string_bytes:[Buffer.byteLength(left),Buffer.byteLength(right)],terminal_string_bytes:sizes,measurements:p.measurements}));
});

test('canonical array roots preserve nested arrays, primitive members, empties and oversized terminal holds',()=>{
  const s=fixture(),payload=[null,2,false,'small',[{},[],{sources:{'a.js':'a'.repeat(9000),'b.js':'b'.repeat(9000)},late_unknown:'No retry.'}]];
  s.records.a.content=json(payload);const p=build(s);
  const root=p.occurrences.find(o=>o.path==='/records/a/content/@json-text');
  assert.ok(root);assert.deepEqual(p.groups.find(g=>g.id===root.group_id).section.body.slice(0,4),payload.slice(0,4));
  assert.ok(p.occurrences.some(o=>o.path.endsWith('/@json-text/4/2/sources/a.js')));
  assert.equal(decode(p).state.records.a.content,json(payload));
  payload[4][2].sources['a.js']='indivisible '.repeat(5000);s.records.a.content=json(payload);
  const held=build(s),leaf=held.groups.find(g=>g.section.body===payload[4][2].sources['a.js']);
  const occurrence=held.occurrences.find(o=>o.group_id===leaf.id);
  assert.equal(occurrence.fit,'Held');assert.throws(()=>open(held).materialize(occurrence.id),/exceeds cap/);
});
