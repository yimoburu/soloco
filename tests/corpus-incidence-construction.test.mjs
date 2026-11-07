import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {buildLegacyCoherentPlan} from '../plugins/soloco/runtime/legacy-operating.mjs';
import {retainSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';
import {corpusIncidence as before} from '../evals/corpus-real-incidence/construction-before-incidence.mjs';

// Exercise the private pure derivation without adding a runtime export/option.
// The oracle is the verbatim incoming implementation, after the STRING repair.
const runtime=fs.readFileSync(new URL('../plugins/soloco/runtime/scoped-context.mjs',import.meta.url),'utf8');
const incoming=fs.readFileSync(new URL('../evals/corpus-real-incidence/construction-before-incidence.mjs',import.meta.url),'utf8');
const body=code=>code.slice(code.indexOf('function corpusIncidence('),code.indexOf('function incidenceOwns(')<0?code.length:code.indexOf('function incidenceOwns('));
function derive(m,selected,closures,{old=false}={}){
  const documents=new Set([...m.documents,...m.snapshot_inbound.map(e=>e.document),...m.occurrences.map(o=>o.document)]);
  const stats={document_serializations:0,edge_candidates:0},json=v=>{if(documents.has(v))stats.document_serializations++;return JSON.stringify(v);};
  const same=(a,b)=>json(a)===json(b),within=(path,root)=>path===root||path.startsWith(root+'/'),inRegion=(o,r)=>same(o.document,r.document)&&within(o.path,r.path);
  let code=body(old?incoming:runtime);
  code=old?code.replace('if(!seen.has(i)&&inRegion(e,regions[n]))','if((stats.edge_candidates++,!seen.has(i)&&inRegion(e,regions[n])))'):
    code.replace('if(!seen.has(i)){','if((stats.edge_candidates++,!seen.has(i))){');
  assert.ok(code.includes('stats.edge_candidates++'),'candidate instrumentation must be installed');
  const fn=Function('json','same','within','inRegion','fail','CORPUS_INCIDENCE','stats',code+';return corpusIncidence;')(
    json,same,within,inRegion,m=>{throw Error('Scoped context hold: '+m);},'corpus-provenance-incidence-v1',stats);
  const start=performance.now(),result=fn(m,selected,closures);
  return {result,stats,ms:performance.now()-start};
}
const closuresFor=m=>Object.fromEntries(m.sources.map(r=>[r.source.id,[]]));
const ref=(m,id)=>m.sources.find(r=>r.source.id===id).source;
function compare(m,selected,closures=closuresFor(m)){
  const expected=before(m,selected,closures),actual=derive(m,selected,closures).result;
  assert.deepEqual(actual,expected);assert.equal(JSON.stringify(actual),JSON.stringify(expected),'exact ordered relation bytes');return actual;
}
function graph(){
  const s={records:{a:{id:'a',revision:1,next:{id:'b',revision:1}},ab:{id:'ab',revision:1,next:{id:'missing',revision:1}},
    b:{id:'b',revision:1,next:{id:'a',revision:1},then:{id:'c',revision:1}},c:{id:'c',revision:1,content:'OPEN'},
    'a/b~':{id:'a/b~',revision:1,next:{id:'c',revision:1}}},jobs:{},global:'All unknown interactions remain required.'};
  const deep=retainSnapshot(s,{id:'deep',next:{id:'c',revision:1},content:'Retain exhausted failure.'});
  const shared=retainSnapshot(s,{id:'shared',deep,link:{id:'a/b~',revision:1}});
  s.records.a.archive=shared;s.records.b.archive=shared;
  return {s,m:buildLegacyCoherentPlan(s)};
}
test('construction exact ordered oracle: cyclic/transitive/shared originals, producers and changed selections',()=>{
  const {s,m}=graph(),closures=closuresFor(m);
  closures.a=[ref(m,'c'),ref(m,'c')];closures.b=[ref(m,'a/b~')];
  const a=compare(m,['a','b'],closures);
  assert.equal(a.sources[0].conservative,false,'/a does not visit /ab');
  assert.equal(a.sources[0].regions.filter(r=>r.path==='/records/c').length,2,'retain duplicate initial regions');
  assert.ok(a.sources[0].regions.some(r=>r.path==='/records/a~1b~0'));
  assert.equal(a.sources[0].regions.filter(r=>r.document.kind==='snapshot-original').length,2);
  assert.ok(a.unowned_occurrence_ids.includes(m.occurrences.find(o=>o.path==='/records/ab').id));
  assert.deepEqual(compare(m,['b','a'],closures).sources.map(s=>s.source_id),['b','a']);
  assert.equal(compare(m,['ab'],closures).sources[0].conservative,true);
  const changed=structuredClone(closures);changed.a=[ref(m,'ab')];
  assert.equal(compare(m,['a'],changed).sources[0].conservative,true,'closure changes are live');
  const reordered={...s,records:Object.fromEntries(Object.entries(s.records).reverse())};
  // Preserve the private original vault while varying the canonical census order.
  const {inheritSnapshots}=snapshotHelpers;
  const reverse=buildLegacyCoherentPlan(inheritSnapshots(s,reordered));compare(reverse,['a','b']);
  s.records.a.archive=retainSnapshot(s,{id:'replacement',next:{id:'ab',revision:1}});
  assert.equal(compare(buildLegacyCoherentPlan(s),['a']).sources[0].conservative,true,'changed original is traversed');
});
import * as snapshotHelpers from '../plugins/soloco/runtime/snapshot.mjs';
test('construction exact duplicate rejection and strict identity/revision/hash matching',()=>{
  const s={records:{a:{id:'a',revision:1,links:[]}},jobs:{},upgrade_history:[{id:'dup',revision:1,content:'first'},{id:'dup',revision:1,content:'second'}]};
  const initial=buildLegacyCoherentPlan(s),targets=initial.sources.filter(r=>r.source.id==='upgrade:dup');
  for(const [reference,unknown] of [[{id:'upgrade:dup',revision:1},true],[targets[0].source,false],
    [{...targets[0].source,revision:2},true],[{...targets[0].source,sha256:'0'.repeat(64)},true],
    [{id:'upgrade:dup',revision:'1'},true],[{id:'upgrade:dup',revision:null},true],
    [{id:{example:'upgrade:dup'},revision:1},true]]){
    s.records.a.links=[reference];const result=compare(buildLegacyCoherentPlan(s),['a']);assert.equal(result.sources[0].conservative,unknown);
  }
  s.records.a.links=[targets[0].source];s.upgrade_history[1]=structuredClone(s.upgrade_history[0]);
  const duplicate=buildLegacyCoherentPlan(s);assert.equal(compare(duplicate,['a']).sources[0].conservative,true,'even hash-qualified duplicates are ambiguous');
  const closures=closuresFor(duplicate);closures.a=[targets[0].source];
  for(const fn of [before,(...args)=>derive(...args).result])assert.throws(()=>fn(duplicate,['a'],closures),/missing corpus producer incidence/);
  closures.a=[{...targets[0].source,sha256:'f'.repeat(64)}];
  for(const fn of [before,(...args)=>derive(...args).result])assert.throws(()=>fn(duplicate,['a'],closures),/missing corpus producer incidence/);
});
test('construction pointer siblings, escaped segments, typed/STRING boundary and document equality',()=>{
  for(const order of ['first','last']){
    const example={id:'c',revision:1},s={records:{a:{id:'a',revision:1,...(order==='first'?{typed:example}:{}),
      quoted:JSON.stringify({example}),nested:JSON.stringify({example:JSON.stringify({id:'missing',revision:1})}),
      ...(order==='last'?{typed:example}:{})},ab:{id:'ab',revision:1,next:{id:'missing',revision:1}},
      'a/b':{id:'a/b',revision:1,next:{id:'missing',revision:1}},'a~b':{id:'a~b',revision:1,next:{id:'missing',revision:1}},c:{id:'c',revision:1,content:'OPEN'}},jobs:{}};
    let m=buildLegacyCoherentPlan(s),result=compare(m,['a']);
    assert.equal(result.sources[0].conservative,false);assert.ok(result.sources[0].regions.some(r=>r.path==='/records/c'));
    assert.ok(result.sources[0].references.every(r=>!r.path.includes('@json-text')));
    delete s.records.a.typed;m=buildLegacyCoherentPlan(s);result=compare(m,['a']);
    assert.equal(result.sources[0].regions.length,1);assert.equal(result.sources[0].conservative,false);
    // Decoded manifests contain equal, independently allocated document objects.
    compare(JSON.parse(JSON.stringify(m)),['a']);
  }
});
function scaling(n){
  const s={records:Object.fromEntries(Array.from({length:n},(_,i)=>['s'+i,{id:'s'+i,revision:1,next:{id:'s'+i,revision:1},content:'OPEN'}])),jobs:{}};
  const m=buildLegacyCoherentPlan(s);return {m,selected:m.sources.map(r=>r.source.id),closures:closuresFor(m)};
}
test('construction bounded synthetic comparison counts edge candidates and document serializations',t=>{
  const observations=[];
  for(const n of [32,128]){
    const {m,selected,closures}=scaling(n),old=derive(m,selected,closures,{old:true}),optimized=derive(m,selected,closures);
    assert.deepEqual(optimized.result,old.result);
    assert.equal(optimized.stats.edge_candidates,n);assert.equal(old.stats.edge_candidates,n*n);
    assert.ok(old.stats.document_serializations>optimized.stats.document_serializations*n);
    assert.equal(optimized.stats.document_serializations,m.documents.length);
    observations.push({sources:n,before:{...old.stats,ms:old.ms},optimized:{...optimized.stats,ms:optimized.ms}});
  }
  const {m,selected,closures}=scaling(1024),large=derive(m,selected,closures);
  assert.equal(large.result.sources.length,1024);assert.equal(large.stats.edge_candidates,1024);
  assert.equal(large.stats.document_serializations,m.documents.length);
  observations.push({sources:1024,optimized:{...large.stats,ms:large.ms},before:'not rerun; bounded 32/128 comparison above'});
  t.diagnostic(JSON.stringify({fictional_only:true,construction_only:true,observations}));
});
