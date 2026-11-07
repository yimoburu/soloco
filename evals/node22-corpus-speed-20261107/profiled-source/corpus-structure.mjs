import {digest} from './store.mjs';

export const CORPUS_STRUCTURE='corpus-readable-structure-v1';
const json=JSON.stringify, hash=v=>digest(json(v));
const hold=m=>{throw Error('Corpus structure hold: '+m);};
const structural=new Set(['id','revision','sha256','source','review','document','document_id','group_id','body_root','path','location','ancestry','ancestor_roots','qualifier_groups','qualifiers','source_ids','selected_source_ids','occurrence_ids','selected_occurrence_ids','mapping_occurrence_ids','mapping_selection_ids','selection_ids','incident_ids','group_ids','item_keys','interface_keys','domain_review_ids','interface_review_ids','homes','typed_homes','ranges','source_set','occurrence_set','mapping_sets','unowned_occurrence_ids','references','regions','snapshot_inbound','collection_indexes','occurrences','source_census','sources','producer_closures','incidence','selections','canonical_review_ids','primary_review_ids']);
const markers=['$r','$literal','$path','$row','$ids'];
const reserved=v=>v&&typeof v==='object'&&!Array.isArray(v)&&markers.some(k=>Object.hasOwn(v,k));
const candidate=(key,v,metadata)=>v!==null&&typeof v!=='boolean'&&(structural.has(key)||metadata&&typeof v==='object')&&(typeof v!=='object'||Array.isArray(v)||!Object.keys(v).some(k=>['text','content','summary','conditions','unresolved_outcomes','value','result','body'].includes(k)));
const pointerKey=k=>k==='path'||k==='location';
export const CORPUS_STRUCTURE_INSTRUCTIONS='Readable structural encoding: logical_packet is the complete assignment. Exactly {"$r":N} means tables[N]; table references point only to earlier entries. Exactly {"$path":N} means paths[N]: paths[0] is the empty JSON pointer; each later entry [earlierParent,rawSegment] appends slash plus the EXACT raw segment, without unescaping or normalization. Exactly {"$row":[N,values]} uses ordered fields[N] as object keys and the decoded values in that order. Exactly {"$ids":[prefix,[[start,end],...]]} concatenates prefix plus each decimal integer in each half-open range, in supplied order; duplicates and backwards runs remain distinct. Exactly {"$literal":[[key,value],...]} escapes a literal object containing any reserved marker. All other JSON is literal. All dictionaries are complete in this SAME packet. Read every referenced value at every physical location, retaining order and opposite qualifiers. Semantic conclusions remain readable JSON, never code; identical bytes prove no identical applicability. Return the complete logical assignment response_envelope/response_shape. Missing meaning, conditions, support, originals or distant effects requires Blocked and an explicitly wider NEW target.';

// Ordinal strings must roundtrip literally: no leading zeroes, unsafe integers,
// sorting, deduplication or inferred physical identity. Used only for ID vectors.
function ordinal(v,key){
  if(!/(?:_ids|_roots|_groups|^group_ids)$/.test(key)||!Array.isArray(v)||v.length<3)return null;
  let prefix;const ranges=[];
  for(const value of v){if(typeof value!=='string')return null;const m=/^(.*\D)(0|[1-9][0-9]*)$/.exec(value);if(!m)return null;const n=Number(m[2]);if(!Number.isSafeInteger(n)||n===Number.MAX_SAFE_INTEGER||m[1]+String(n)!==value||prefix!==undefined&&prefix!==m[1])return null;prefix=m[1];const last=ranges.at(-1);if(last&&last[1]===n)last[1]++;else ranges.push([n,n+1]);}
  const encoded={$ids:[prefix,ranges]};return json(encoded).length<json(v).length?encoded:null;
}
export function factorCorpusStructure(logical){
  const counts=new Map(),fieldCounts=new Map();
  function census(v,key='',metadata=false){
    const meta=metadata||structural.has(key);
    if(candidate(key,v,metadata)){const k=json(v);counts.set(k,(counts.get(k)??0)+1);}
    if(v&&typeof v==='object'){
      if(!Array.isArray(v)&&meta&&!reserved(v)){const k=json(Object.keys(v));fieldCounts.set(k,(fieldCounts.get(k)??0)+1);}
      for(const [k,w] of Object.entries(v))census(w,Array.isArray(v)?'':k,meta&&k!=='body'&&k!=='result'&&k!=='value');
    }
  }
  census(logical);const tables=[],index=new Map(),paths=[null],pathIndex=new Map([['',0]]),fields=[],fieldIndex=new Map();
  function path(value){let parent=0,prefix='';for(const segment of value.slice(1).split('/')){prefix+='/'+segment;if(!pathIndex.has(prefix)){pathIndex.set(prefix,paths.length);paths.push([parent,segment]);}parent=pathIndex.get(prefix);}return {$path:parent};}
  function encode(v,key='',metadata=false,root=false){
    const meta=metadata||structural.has(key),eligible=!root&&candidate(key,v,metadata),k=eligible?json(v):undefined,intern=eligible&&(counts.get(k)??0)>1&&k.length>18;
    if(intern&&index.has(k))return {$r:index.get(k)};
    let value=v;
    if(pointerKey(key)&&typeof v==='string'&&(v===''||v.startsWith('/')))value=v===''?{$path:0}:path(v);
    else if(Array.isArray(v))value=ordinal(v,key)??v.map(w=>encode(w,'',meta));
    else if(v&&typeof v==='object'){
      const entries=Object.entries(v).map(([a,b])=>[a,encode(b,a,meta&&a!=='body'&&a!=='result'&&a!=='value')]);
      const keys=json(Object.keys(v));
      if(reserved(v))value={$literal:entries};
      else if(meta&&(fieldCounts.get(keys)??0)>1&&keys.length>20){if(!fieldIndex.has(keys)){fieldIndex.set(keys,fields.length);fields.push(Object.keys(v));}value={$row:[fieldIndex.get(keys),entries.map(e=>e[1])]};}
      else value=Object.fromEntries(entries);
    }
    if(intern){const n=tables.length;tables.push(value);index.set(k,n);return {$r:n};}
    return value;
  }
  const logical_packet=encode(logical,'',false,true);
  return {protocol:CORPUS_STRUCTURE,instructions:CORPUS_STRUCTURE_INSTRUCTIONS,logical_sha256:hash(logical),paths,fields,tables,logical_packet};
}
export function expandCorpusStructure(packet){
  if(!packet||json(Object.keys(packet))!==json(['protocol','instructions','logical_sha256','paths','fields','tables','logical_packet'])||packet.protocol!==CORPUS_STRUCTURE||packet.instructions!==CORPUS_STRUCTURE_INSTRUCTIONS||!Array.isArray(packet.paths)||packet.paths[0]!==null||!Array.isArray(packet.fields)||!Array.isArray(packet.tables))hold('invalid grammar');
  const paths=[''],decoded=[];
  for(let i=1;i<packet.paths.length;i++){const row=packet.paths[i];if(!Array.isArray(row)||row.length!==2||!Number.isSafeInteger(row[0])||row[0]<0||row[0]>=i||typeof row[1]!=='string'||row[1].includes('/'))hold('missing, forward or cyclic path');paths.push(paths[row[0]]+'/'+row[1]);}
  for(const keys of packet.fields)if(!Array.isArray(keys)||keys.some(k=>typeof k!=='string')||new Set(keys).size!==keys.length)hold('invalid ordered fields');
  function decode(v,limit){
    if(Array.isArray(v))return v.map(w=>decode(w,limit));
    if(v&&typeof v==='object'){
      const marked=markers.filter(k=>Object.hasOwn(v,k));if(marked.length&&(marked.length!==1||Object.keys(v).length!==1))hold('ambiguous marker');
      if(marked[0]==='$r'){if(!Number.isSafeInteger(v.$r)||v.$r<0||v.$r>=limit)hold('missing, forward or cyclic reference');return structuredClone(decoded[v.$r]);}
      if(marked[0]==='$path'){if(!Number.isSafeInteger(v.$path)||v.$path<0||v.$path>=paths.length)hold('missing path');return paths[v.$path];}
      if(marked[0]==='$ids'){
        const spec=v.$ids;if(!Array.isArray(spec)||spec.length!==2||typeof spec[0]!=='string'||!Array.isArray(spec[1]))hold('invalid ordinal sequence');
        const out=[];for(const range of spec[1]){if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger)||range[0]<0||range[1]<=range[0]||range[1]-range[0]>10000000)hold('invalid ordinal range');for(let n=range[0];n<range[1];n++)out.push(spec[0]+n);}return out;
      }
      let entries;
      if(marked[0]==='$row'){const row=v.$row;if(!Array.isArray(row)||row.length!==2||!Number.isSafeInteger(row[0])||row[0]<0||row[0]>=packet.fields.length||!Array.isArray(row[1])||row[1].length!==packet.fields[row[0]].length)hold('missing or substituted row fields');entries=packet.fields[row[0]].map((k,i)=>[k,row[1][i]]);}
      else if(marked[0]==='$literal'){if(!Array.isArray(v.$literal)||v.$literal.some(e=>!Array.isArray(e)||e.length!==2||typeof e[0]!=='string')||new Set(v.$literal.map(e=>e[0])).size!==v.$literal.length)hold('invalid literal');entries=v.$literal;}
      else entries=Object.entries(v);
      const value=Object.fromEntries(entries.map(([k,w])=>[k,decode(w,limit)]));
      if(json(Object.keys(value))!==json(entries.map(e=>e[0])))hold('changed object order');return value;
    }
    return v;
  }
  for(let i=0;i<packet.tables.length;i++)decoded.push(decode(packet.tables[i],i));
  const logical=decode(packet.logical_packet,decoded.length);
  if(hash(logical)!==packet.logical_sha256)hold('substituted structure');
  if(json(factorCorpusStructure(logical))!==json(packet))hold('noncanonical or omitted dictionary');
  return logical;
}
// A resealed omission is detectable only against an external expected packet.
export function validateCorpusStructure(packet,expected){
  if(expected===undefined)hold('expected logical packet required');
  if(json(expandCorpusStructure(packet))!==json(expected))hold('logical omission or substitution');return true;
}
