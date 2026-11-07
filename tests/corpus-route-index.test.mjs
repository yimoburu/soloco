import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {buildLegacyCoherentPlan} from '../plugins/soloco/runtime/legacy-operating.mjs';
import {retainSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';

// Verbatim incoming helper: ordered output oracle, never authority or a live cache.
const incoming="function corpusDirectReferences(m,contexts){\n  const byId=new Map(),inbound=new Set(m.snapshot_inbound.map(e=>json([e.document,e.path]))),edges=new Map();\n  for(const r of m.sources){if(!byId.has(r.source.id))byId.set(r.source.id,[]);byId.get(r.source.id).push(r);}\n  const scalar=i=>{const d=m.definitions[i];return d?.[0]==='null'?null:['string','number'].includes(d?.[0])?d[1]:undefined;};\n  function walk(i,document,path=''){\n    const d=m.definitions[i];\n    if(d[0]==='object'){\n      const keys=d[1].map(([k])=>k),reference=Object.fromEntries(d[1].map(([k,v])=>[k,scalar(v)]));\n      if(keys.includes('id')&&keys.includes('revision')&&keys.every(k=>['id','revision','sha256'].includes(k))){\n        const matches=(byId.get(reference.id)??[]).filter(r=>r.source.revision===reference.revision&&(!keys.includes('sha256')||r.source.sha256===reference.sha256));\n        const edge={document,path,kind:'source-reference',reference,...(matches.length===1?{target:{document:m.documents[0],path:matches[0].location},target_source:matches[0].source}:{unknown:true})};\n        edges.set(json(edge),edge);\n      }\n      if(inbound.has(json([document,path])))return;\n      for(const [k,v] of d[1])walk(v,document,path+'/'+k.replaceAll('~','~0').replaceAll('/','~1'));\n    }else if(d[0]==='array')for(const [n,v] of d[1].entries())walk(v,document,path+'/'+n);\n  }\n  for(const d of m.documents)walk(d.root,d);\n  const all=[...edges.values()];if(!contexts)return all;\n  const groups=new Map(m.groups.map(g=>[g.id,g]));\n  // Bind concrete physical sections and their ancestors. Equal group bodies do\n  // not import unrelated physical routes; every genuine inbound alias does.\n  const locations=new Set();\n  for(const context of contexts){\n    for(const o of context.occurrences)for(const q of m.occurrences)if(same(q.document,o.document)&&within(o.path,q.path)&&(q.id===o.id||o.qualifier_groups.includes(q.group_id)))locations.add(q.id);\n    for(const e of context.snapshot_inbound)for(const q of m.occurrences)if(same(q.document,e.document)&&within(e.path,q.path)&&e.qualifier_groups.includes(q.group_id)||q.document.kind==='snapshot-original'&&q.document.sha256===e.original_sha256&&q.group_id===e.target_group)locations.add(q.id);\n  }\n  const sections=m.occurrences.filter(o=>locations.has(o.id));\n  return all.filter(e=>sections.some(o=>same(e.document,o.document)&&within(e.path,o.path)&&!groups.get(o.group_id).section.cuts.some(c=>within(e.path,o.path+c.path))));\n}\n";
const runtime=fs.readFileSync(new URL('../plugins/soloco/runtime/scoped-context.mjs',import.meta.url),'utf8');
const current=runtime.slice(runtime.indexOf('function corpusDirectReferences('),runtime.indexOf('function physicalSharedContext('));

function derive(m,contexts,{old=false,instrument=false}={}){
  const documents=new Set([...m.documents,...m.occurrences.map(o=>o.document),...m.snapshot_inbound.map(e=>e.document),...(contexts??[]).flatMap(c=>[...c.occurrences.map(o=>o.document),...c.snapshot_inbound.map(e=>e.document)])]);
  const stats={document_serializations:0,document_comparisons:0,occurrence_candidates:0,section_candidates:0,indexed_occurrences:0,location_membership_checks:0,cut_candidates:0};
  // Count descriptors even when nested in the incoming helper's edge/tuple JSON.
  const json=v=>JSON.stringify(v,(_k,value)=>{if(documents.has(value))stats.document_serializations++;return value;});
  const same=(a,b)=>{stats.document_comparisons++;return json(a)===json(b);};
  const within=(path,root)=>path===root||path.startsWith(root+'/');
  let code=old?incoming:current;
  if(instrument){
    const scan='m.occurrences.filter(o=>locations.has(o.id))';assert.ok(code.includes(scan));code=code.replace(scan,'m.occurrences.filter(o=>(stats.location_membership_checks++,locations.has(o.id)))');
    if(old){
      const cut='within(e.path,o.path+c.path)';assert.ok(code.includes(cut));code=code.replace(cut,`(stats.cut_candidates++,${cut})`);
      for(const value of ['o','e']){const anchor=`same(q.document,${value}.document)`;assert.ok(code.includes(anchor));code=code.replace(anchor,`(stats.occurrence_candidates++,${anchor})`);}
      const anchor='same(e.document,o.document)';assert.ok(code.includes(anchor));code=code.replace(anchor,`(stats.section_candidates++,${anchor})`);
    }else{
      const cut='excluded.has(relative)';assert.ok(code.includes(cut));code=code.replace(cut,`(stats.cut_candidates++,${cut})`);
      for(const value of ['q.id===o.id||qualifiers.has(q.group_id)','qualifiers.has(q.group_id)']){const anchor=`if(${value})`;assert.ok(code.includes(anchor));code=code.replace(anchor,`if((stats.occurrence_candidates++,${value}))`);}
      const original='for(const q of originals.get(e.original_sha256)?.get(e.target_group)??[])locations.add(q.id);';assert.ok(code.includes(original));code=code.replace(original,original.replace('locations.add(q.id);','{stats.occurrence_candidates++;locations.add(q.id);}'));
      const section='for(const path of ancestors(e.path))for(const o of paths?.get(path)??[]){';assert.ok(code.includes(section));code=code.replace(section,section+'stats.section_candidates++;');
      const scan='for(const q of m.occurrences){';assert.ok(code.includes(scan));code=code.replace(scan,scan+'stats.indexed_occurrences++;');
    }
  }
  const fn=Function('json','same','within','stats',code+';return corpusDirectReferences;')(json,same,within,stats);
  const start=performance.now(),result=fn(m,contexts);return {result,stats,ms:performance.now()-start,document_objects:documents.size};
}
function compare(m,contexts){
  const bytes=JSON.stringify(m),contextBytes=JSON.stringify(contexts),expected=derive(m,contexts,{old:true}),actual=derive(m,contexts);
  assert.equal(JSON.stringify(actual.result),JSON.stringify(expected.result),'exact ordered route JSON');assert.deepEqual(actual.result,expected.result);
  assert.equal(JSON.stringify(m),bytes,'material unchanged');assert.equal(JSON.stringify(contexts),contextBytes,'contexts unchanged');
  return actual.result;
}
function graph(){
  const s={id:'FICTIONAL',records:{},jobs:{}};
  const body={id:'shared',text:'OPEN; no permission',next:{id:'b',revision:1}};
  s.records.a={id:'a',revision:1,qualifier:'ALLOW only after consent',body,next:{id:'b',revision:1},stale:{id:'b',revision:99},unknown:{id:'missing',revision:1},quoted:JSON.stringify({id:'missing-string',revision:1})};
  s.records.b={id:'b',revision:1,qualifier:'DENY even with consent; EXHAUSTED; UNKNOWN',body,next:{id:'a',revision:1}};
  s.records.ab={id:'ab',revision:1,next:{id:'missing-sibling',revision:1}};
  s.records['a/b~']={id:'a/b~',revision:1,'':{next:{id:'a',revision:1}},'~raw/key':{next:{id:'b',revision:1}}};
  s.records['']={id:'',revision:1,next:{id:'a',revision:1}};
  const deep=retainSnapshot(s,{id:'deep',condition:'Unknown original condition',nested:{id:'nested',next:{id:'a',revision:1}},next:{id:'b',revision:1}});
  const original=retainSnapshot(s,{id:'original',deep,next:{id:'a/b~',revision:1}});
  s.records.a.original=original;s.records.b.original=original;
  return buildLegacyCoherentPlan(s);
}
const context=(occurrences,snapshot_inbound=[])=>[{occurrences,snapshot_inbound}];
test('verbatim incoming oracle: cycles, shared bodies, opposite qualifiers, typed unknowns, STRING opacity and cuts',()=>{
  const m=graph();
  for(const contexts of [undefined,[],context([]),context(m.occurrences),context(m.occurrences.filter(o=>o.path.startsWith('/records/a/')),m.snapshot_inbound),context(m.occurrences.filter(o=>o.path.startsWith('/records/a~1b~0'))),context(m.occurrences.filter(o=>o.path.startsWith('/records/ab')))])compare(m,contexts);
  const all=compare(m,context(m.occurrences,m.snapshot_inbound));
  assert.ok(all.some(e=>e.reference.id==='b'&&e.unknown&&e.reference.revision===99));assert.ok(all.some(e=>e.reference.id==='missing'&&e.unknown));
  assert.ok(all.some(e=>e.path==='/records/a~1b~0//next'));assert.ok(all.some(e=>e.path==='/records//next'));
  assert.ok(all.every(e=>!e.path.includes('/quoted')&&!e.path.includes('@json-text')&&e.reference.id!=='missing-string'));
  const root=m.occurrences.find(o=>o.document.kind==='state'&&o.path==='');assert.ok(root);
  assert.deepEqual(compare(m,context([root])),[],'root collection cuts do not import descendants');
  const local=m.occurrences.find(o=>o.path==='/records/a');assert.ok(compare(m,context(m.occurrences.filter(o=>o.path==='/records/a'||o.path.startsWith('/records/a/')),m.snapshot_inbound)).some(e=>e.path==='/records/a/next'));
  assert.ok(m.groups.find(g=>g.id===local.group_id).section.cuts.length);
  const shared=m.occurrences.filter(o=>o.path.endsWith('/body'));assert.ok(shared.length>=2);assert.equal(shared[0].group_id,shared[1].group_id);assert.notDeepEqual(shared[0].qualifier_groups,shared[1].qualifier_groups);
  compare(m,context(shared,m.snapshot_inbound));
  const rootCut=structuredClone(m);rootCut.groups.find(g=>g.id===root.group_id).section.cuts=[{path:''}];assert.deepEqual(compare(rootCut,context([root])),[]);
});

test('all original OR matches include non-root groups, multiple documents, duplicate occurrences and exact ordering',()=>{
  const m=graph(),nested=m.occurrences.find(o=>o.document.kind==='snapshot-original'&&o.path==='/nested/next');assert.ok(nested);
  const e={...m.snapshot_inbound[0],original_sha256:nested.document.sha256,target_group:nested.group_id};
  // The matching original may be non-root and need not share the inbound document.
  const result=compare(m,context([], [e]));assert.ok(result.some(r=>r.document.kind==='snapshot-original'&&r.path==='/nested/next'));
  const duplicate=structuredClone(nested);duplicate.id='duplicate-physical';m.occurrences.unshift(duplicate);
  m.occurrences.push({...structuredClone(nested),id:'same-path-other-group',group_id:m.occurrences.find(o=>o.path==='/records/a').group_id});
  m.documents.push(structuredClone(nested.document));
  const before=compare(m,context([], [e,e]));assert.equal(new Set(before.map(JSON.stringify)).size,before.length,'route dedup/order retained');
  compare(m,context([nested,nested,duplicate],[e,e]));
  const reordered=structuredClone(nested.document);reordered.document_order_extra='distinguish';delete reordered.document_order_extra;
  const reverse=Object.fromEntries(Object.entries(reordered).reverse());
  m.documents.push(reverse);m.occurrences.push({...nested,id:'reverse-document',document:reverse});
  const out=compare(m,context([], [e]));assert.ok(out.some(r=>JSON.stringify(r.document)===JSON.stringify(reverse)),'OR retains differently ordered original descriptor too');
  assert.ok(out.some(r=>JSON.stringify(r.document)===JSON.stringify(nested.document)));
  compare(JSON.parse(JSON.stringify(m)),JSON.parse(JSON.stringify(context([nested], [e]))));
});

test('strict document JSON equality, empty matching results and changed source endpoint versions remain live per call',()=>{
  const m=graph(),a=m.occurrences.find(o=>o.path==='/records/a/next'),contexts=context([a]);
  const before=compare(m,contexts);assert.ok(before.some(e=>e.target_source?.id==='b'));
  const copied=structuredClone(contexts);assert.equal(JSON.stringify(compare(m,copied)),JSON.stringify(before),'equivalent separately allocated descriptors match');
  copied[0].occurrences[0].document=Object.fromEntries(Object.entries(a.document).reverse());assert.deepEqual(compare(m,copied),[],'field ordering remains part of document identity');
  m.sources.find(r=>r.source.id==='b').source.revision=7;
  assert.ok(compare(m,contexts).some(e=>e.reference.id==='b'&&e.reference.revision===1&&e.unknown),'no stale endpoint index');
  m.sources.push(structuredClone(m.sources.find(r=>r.source.id==='a')));compare(m,contexts);
  const empty={...m,documents:[]};assert.deepEqual(compare(empty,contexts),[]);
});

function scaling(n){
  const s={records:{},jobs:{}};
  for(let i=0;i<n;i++)s.records['s'+i]={id:'s'+i,revision:1,next:{id:'s'+((i+1)%n),revision:1},parts:Array.from({length:8},(_,k)=>({id:'part-'+i+'-'+k,condition:k%2?'EXHAUSTED; UNKNOWN':'ALLOW only after consent',next:{id:'s'+i,revision:1}}))};
  const original=retainSnapshot(s,{id:'original',next:{id:'s0',revision:1},parts:[{id:'nested-original',next:{id:'s1',revision:1}}]});
  for(let i=0;i<n;i+=8)s.records['s'+i].original=original;
  const m=buildLegacyCoherentPlan(s);return {m,contexts:context(m.occurrences,m.snapshot_inbound)};
}
test('indexed candidate and serialization counts replace Cartesian scans; old large case is bounded',t=>{
  const observations=[];
  for(const n of [32,128]){
    const {m,contexts}=scaling(n),old=derive(m,contexts,{old:true,instrument:true}),indexed=derive(m,contexts,{instrument:true});
    assert.equal(JSON.stringify(indexed.result),JSON.stringify(old.result));
    assert.equal(old.stats.occurrence_candidates,(contexts[0].occurrences.length+contexts[0].snapshot_inbound.length)*m.occurrences.length);
    assert.ok(old.stats.section_candidates>indexed.stats.section_candidates*n);
    assert.ok(old.stats.occurrence_candidates>indexed.stats.occurrence_candidates*n);
    assert.equal(indexed.stats.indexed_occurrences,m.occurrences.length);
    assert.equal(indexed.stats.document_comparisons,0);
    assert.equal(indexed.stats.document_serializations,indexed.document_objects);assert.equal(indexed.stats.location_membership_checks,m.occurrences.length);
    assert.ok(old.stats.document_serializations>indexed.stats.document_serializations*n);
    observations.push({sources:n,physical_occurrences:m.occurrences.length,typed_routes:indexed.result.length,before:{...old.stats,ms:old.ms},indexed:{...indexed.stats,ms:indexed.ms}});
  }
  const {m,contexts}=scaling(1024),indexed=derive(m,contexts,{instrument:true}),full=derive(m,undefined,{old:true});
  assert.equal(JSON.stringify(indexed.result),JSON.stringify(full.result),'all physical sections preserve exact incoming full route order');
  assert.equal(indexed.stats.indexed_occurrences,m.occurrences.length);assert.equal(indexed.stats.document_comparisons,0);
  assert.equal(indexed.stats.document_serializations,indexed.document_objects);assert.equal(indexed.stats.location_membership_checks,m.occurrences.length);
  assert.ok(indexed.stats.occurrence_candidates<16*m.occurrences.length);assert.ok(indexed.stats.section_candidates<4*indexed.result.length);
  observations.push({sources:1024,physical_occurrences:m.occurrences.length,typed_routes:indexed.result.length,indexed:{...indexed.stats,ms:indexed.ms},before:'context Cartesian scan not rerun; only incoming no-context discovery oracle executed'});
  t.diagnostic(JSON.stringify({fictional_only:true,performance_only:true,actual_native_fit:null,observations}));
});

test('bounded deterministic partial contexts preserve pointer boundaries, duplicate ordering and arbitrary qualifier subsets',()=>{
  const base=graph();let seed=0x19f5146;
  const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let n=0;n<96;n++){
    const m=structuredClone(base),occurrences=m.occurrences.filter(()=>next()%5===0),inbound=m.snapshot_inbound.filter(()=>next()%3===0);
    if(n%3===0&&occurrences.length)occurrences.push(structuredClone(occurrences[0]));
    for(const o of occurrences){o.qualifier_groups=o.qualifier_groups.filter(()=>next()%2);if(n%7===0)o.document=Object.fromEntries(Object.entries(o.document).reverse());}
    if(n%4===0)for(const g of m.groups)if(next()%7===0)g.section.cuts.push({path:['','/','/~0','/~1','//next'][next()%5]});
    compare(m,context(occurrences,inbound));
  }
});
