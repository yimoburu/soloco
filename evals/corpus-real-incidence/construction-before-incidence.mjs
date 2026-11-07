// Frozen incoming incidence derivation, including the completed literal repair. Fictional comparison oracle only.
const json=JSON.stringify,same=(a,b)=>json(a)===json(b),fail=m=>{throw Error("Scoped context hold: "+m);};
const CORPUS_INCIDENCE="corpus-provenance-incidence-v1";
const within=(path,root)=>path===root||path.startsWith(root+"/");
const inRegion=(o,r)=>same(o.document,r.document)&&within(o.path,r.path);
export function corpusIncidence(m,selected,closures){
  const groups=new Map(m.groups.map(g=>[g.id,g])),edges=[...m.snapshot_inbound.map(e=>({document:e.document,path:e.path,kind:'original',original_sha256:e.original_sha256,
    target:{document:m.documents.find(d=>d.kind==='snapshot-original'&&d.sha256===e.original_sha256),path:''}}))];
  // A reached reference source carries its complete producer closure too.
  for(const source of m.sources)for(const reference of closures[source.source.id]){
    const targets=m.sources.filter(r=>same(r.source,reference));if(targets.length!==1)fail('missing corpus producer incidence');
    edges.push({document:m.documents[0],path:source.location,kind:'producer',reference,target:{document:m.documents[0],path:targets[0].location}});
  }
  const inboundPaths=new Set(m.snapshot_inbound.map(e=>json([e.document,e.path])));
  const scalar=i=>{const d=m.definitions[i];return d?.[0]==='null'?null:['string','number'].includes(d?.[0])?d[1]:undefined;};
  function walk(i,document,path=''){
    const d=m.definitions[i];
    if(d[0]==='object'){
      const keys=d[1].map(([k])=>k),value=Object.fromEntries(d[1].map(([k,v])=>[k,scalar(v)]));
      if(keys.includes('id')&&keys.includes('revision')&&keys.every(k=>['id','revision','sha256'].includes(k))){
        const matches=m.sources.filter(r=>r.source.id===value.id&&r.source.revision===value.revision&&(!keys.includes('sha256')||r.source.sha256===value.sha256));
        edges.push({document,path,kind:'source-reference',reference:value,...(matches.length===1?{target:{document:m.documents[0],path:matches[0].location}}:{unknown:true})});
      }
      // Real snapshot edges are already indexed; their transport is opaque.
      if(inboundPaths.has(json([document,path])))return;
      for(const [k,v] of d[1])walk(v,document,path+'/'+k.replaceAll('~','~0').replaceAll('/','~1'));
    }else if(d[0]==='array')for(const [n,v] of d[1].entries())walk(v,document,path+'/'+n);
    // JSON STRING views retain extraction/physical region coverage, but their
    // parsed definitions are data, never typed provenance edges. Do not visit
    // them here, even when a genuine typed path shares the same definition.
  }
  for(const d of m.documents)walk(d.root,d);
  if(edges.some(e=>e.kind==='original'&&!e.target.document))fail('dangling corpus original relation');
  const sources=selected.map(source_id=>{
    const r=m.sources.find(r=>r.source.id===source_id),regions=[{document:m.documents[0],path:r.location}],references=[],producer_sources=closures[source_id];
    for(const ref of producer_sources){const target=m.sources.filter(r=>same(r.source,ref));if(target.length!==1)fail('missing corpus producer incidence');regions.push({document:m.documents[0],path:target[0].location});}
    const seen=new Set();let conservative=false;
    for(let n=0;n<regions.length;n++)for(const [i,e] of edges.entries())if(!seen.has(i)&&inRegion(e,regions[n])){
      seen.add(i);references.push(e);if(e.unknown){conservative=true;continue;}
      if(!regions.some(r=>same(r,e.target)))regions.push(e.target);
    }
    if(!m.occurrences.some(o=>regions.some(r=>inRegion(o,r))&&groups.get(o.group_id)?.body_root===r.body_root))fail('missing corpus source root incidence');
    return {source_id,regions,producer_sources,references,conservative};
  });
  // Root/global/unselected obligations retain explicit conservative whole-vector
  // coverage. This classification says only "no selected provenance path".
  const unowned_occurrence_ids=m.occurrences.filter(o=>!sources.some(s=>s.regions.some(r=>inRegion(o,r)))).map(o=>o.id);
  return {protocol:CORPUS_INCIDENCE,sources,unowned_occurrence_ids};
}
