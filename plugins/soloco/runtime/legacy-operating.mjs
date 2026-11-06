import {digest,Store} from './store.mjs';
import {handoverSubject} from './handover.mjs';
import {contextSource,classificationFor} from './current-state.mjs';
import {bindSnapshots,snapshotReference,snapshotBytes,snapshotEntryReference,resolveSnapshotEntry,retainSnapshot,legacyHandoverSource} from './snapshot.mjs';

// Prospective byte-preservation contract only. Never an extraction or acceptance receipt.
export const LEGACY_BOOTSTRAP_PROTOCOL='legacy-bootstrap-manifest-v1';
const json=JSON.stringify,hash=v=>digest(json(v)),bytes=v=>Buffer.byteLength(json(v));
const hold=m=>{throw Error('Legacy bootstrap Held: '+m);};
const equal=(a,b)=>json(a)===json(b);
const pointer=k=>String(k).replaceAll('~','~0').replaceAll('/','~1');
function exact(value,active=new Set(),depth=0){
  if(depth>256)hold('JSON depth exceeds 256');
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'&&Number.isFinite(value)&&!Object.is(value,-0))return;
  if(!value||typeof value!=='object'||active.has(value)||!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))hold('requires acyclic plain lossless JSON');
  active.add(value);
  const keys=Reflect.ownKeys(value);
  if(Array.isArray(value)&&(keys.length!==value.length+1||Object.keys(value).some((k,i)=>k!==String(i))))hold('sparse or extended array');
  for(const k of keys){if(Array.isArray(value)&&k==='length')continue;const d=Object.getOwnPropertyDescriptor(value,k);if(typeof k!=='string'||!d.enumerable||!Object.hasOwn(d,'value'))hold('hidden/accessor/symbol field');exact(d.value,active,depth+1);}
  active.delete(value);
}
function isolated(state){
  exact(state);const copy=JSON.parse(json(state)),raws=new Map(),active=new Set();
  function scan(v){
    if(!v||typeof v!=='object')return;
    if(snapshotEntryReference(v))resolveSnapshotEntry(state,v);
    if(Object.hasOwn(v,'retained_handover_subject')){
      const source=legacyHandoverSource(state,v);scan(source.handover.subject);return;
    }
    const ref=snapshotReference(v);
    if(ref){
      if(active.has(ref.sha256))hold('cyclic snapshot reference');
      const raw=snapshotBytes(state,v),prior=raws.get(ref.sha256);
      if(prior&&!equal(prior.reference,v)||prior&&prior.raw!==raw)hold('snapshot hash collision');
      if(prior)return;
      raws.set(ref.sha256,{reference:v,raw});active.add(ref.sha256);scan(JSON.parse(raw));active.delete(ref.sha256);return;
    }
    for(const child of Object.values(v))scan(child);
  }
  scan(copy);
  bindSnapshots(copy,sha=>raws.get(sha)?.raw);
  return {copy,raws};
}
function codec(canonical){
  const definitions=[],buckets=new Map();
  function intern(v){
    let node;
    if(v===null)node=['null'];
    else if(Array.isArray(v))node=['array',v.map(intern)];
    else if(typeof v==='object')node=['object',Object.entries(v).map(([k,x])=>[k,intern(x)])];
    else if(typeof v==='string'&&canonical&&v.length>32){
      let parsed,canonicalText=false;try{parsed=JSON.parse(v);exact(parsed);canonicalText=json(parsed)===v;}catch{}
      // The tag decodes to STRING, never an operating object or instructions.
      node=canonicalText?['json-text-string',intern(parsed)]:['string',v];
    }else node=[typeof v,v];
    const signature=json(node),sha=digest(signature),bucket=buckets.get(sha)??[];
    for(const i of bucket){if(json(definitions[i])!==signature)hold('definition hash collision');return i;}
    const id=definitions.length;definitions.push(node);bucket.push(id);buckets.set(sha,bucket);return id;
  }
  return {definitions,intern};
}
function decodeGraph(definitions){
  if(!Array.isArray(definitions))hold('missing definitions');
  const values=new Map(),active=new Set();
  function get(i){
    if(!Number.isSafeInteger(i)||i<0||i>=definitions.length)hold('missing definition '+i);
    if(active.has(i))hold('cyclic definition');if(values.has(i))return values.get(i);
    active.add(i);const d=definitions[i];if(!Array.isArray(d))hold('malformed definition');let value;
    if(d[0]==='null'&&d.length===1)value=null;
    else if(d[0]==='array'&&d.length===2&&Array.isArray(d[1]))value=d[1].map(get);
    else if(d[0]==='object'&&d.length===2&&Array.isArray(d[1])){
      value=Object.create(null);const seen=new Set();for(const edge of d[1]){if(!Array.isArray(edge)||edge.length!==2||typeof edge[0]!=='string'||seen.has(edge[0]))hold('duplicate/malformed ordered key');seen.add(edge[0]);Object.defineProperty(value,edge[0],{value:get(edge[1]),enumerable:true,writable:true,configurable:true});}
      if(!equal(Object.keys(value),d[1].map(e=>e[0])))hold('ordered key shape changed');
    }else if(d[0]==='json-text-string'&&d.length===2)value=json(get(d[1]));
    else if(['string','boolean','number'].includes(d[0])&&d.length===2&&typeof d[1]===d[0]){exact(d[1]);value=d[1];}
    else hold('unknown typed definition');
    active.delete(i);values.set(i,value);return value;
  }
  // Unreachable corruption is still corruption, never silently ignored.
  for(let i=0;i<definitions.length;i++)get(i);
  return get;
}
function sourceList(s){
  const list=[];
  for(const [key,r] of Object.entries(s.records??{})){if(key!==r.id)hold('ambiguous record identity '+key);list.push([key,r,'/records/'+pointer(key)]);}
  for(const [key,j] of Object.entries(s.jobs??{})){if(j.id!==key)hold('ambiguous job identity '+key);list.push(['job:'+key,j,'/jobs/'+pointer(key)]);}
  for(const [index,u] of (s.upgrade_history??[]).entries())list.push(['upgrade:'+u.id,resolveSnapshotEntry(s,u),'/upgrade_history/'+index]);
  if(s.upgrade)list.push(['upgrade:'+s.upgrade.id,resolveSnapshotEntry(s,s.upgrade),'/upgrade']);
  return list;
}
const ref=(v,id)=>({id,revision:v?.revision??null,sha256:hash(v)});
function producer(s,v){
  const jobId=v.development?.type==='test'?v.author_instance:v.job_id;
  if(!jobId)return [];
  const j=resolveSnapshotEntry(s,s.jobs?.[jobId]);if(!j||j.artifact_id!==v.id)hold('broken producer edge '+v.id);
  if(v.development?.type==='test'?(v.author_role!=='runtime'||j.kind!=='development_test'):(v.author_instance!==j.instance_id))hold('producer attribution mismatch '+v.id);
  // The entire state binds additional candidate/reuse edges, whose semantics remain unreviewed.
  return [ref(j,'job:'+jobId)];
}
function entries(s){
  return sourceList(s).map(([id,entry,location],index)=>{const value=resolveSnapshotEntry(s,entry);return {id:'occurrence-'+index,source:ref(value,id),location,status:'unreviewed',scope:'*',producer:producer(s,value),receipt_refs:[]};});
}
function rootsFor(s,source_ids){
  return source_ids.map(id=>{const entry=contextSource(s,id);if(!entry)hold('missing exact source '+id);const value=resolveSnapshotEntry(s,entry),expected=Object.hasOwn(s.records??{},id)?id:id.replace(/^(job|upgrade):/,'');if(value.id!==expected)hold('source identity mismatch '+id);if(sourceList(s).some(([other,v])=>other===id&&!equal(resolveSnapshotEntry(s,v),value)))hold('ambiguous source occurrence '+id);return {id,value};});
}
function plan(s,source_ids,max_group_bytes,canonical_json_text){
  const {copy,raws}=isolated(s);
  // handoverSubject stages shallow originals only in this isolated, disposable vault lineage.
  const subject=JSON.parse(json(handoverSubject(copy))),frontier=entries(copy),selected=rootsFor(copy,source_ids);
  const {definitions,intern}=codec(canonical_json_text);
  const stateRoot=intern(copy),subjectRoot=intern(subject);
  const originals=[...raws.values()].map(({reference,raw})=>({reference,root:intern(raw),typed_root:intern(JSON.parse(raw)),sha256:digest(raw),characters:raw.length}));
  const selectedRoots=selected.map(({id,value})=>({source:ref(value,id),root:intern(value),producer:producer(copy,value)}));
  // Capture generated canonical shallow references as well as original durable vault entries.
  function collect(v){if(!v||typeof v!=='object')return;const r=snapshotReference(v);if(r){if(!originals.some(o=>o.sha256===r.sha256)){const raw=snapshotBytes(copy,v);originals.push({reference:v,root:intern(raw),typed_root:intern(JSON.parse(raw)),sha256:digest(raw),characters:raw.length});collect(JSON.parse(raw));}return;}for(const x of Object.values(v))collect(x);}
  collect(subject);
  const baseline={state_root:stateRoot,state_sha256:hash(copy),subject_root:subjectRoot,subject_sha256:hash(subject),membership_sha256:hash(frontier.map(e=>({id:e.id,source:e.source,location:e.location,producer:e.producer}))),owner:copy.owner??null};
  // Every coherent record occurrence is explicit, including previous versions,
  // repeated checkpoint records and retained handover subjects. Parent roots
  // bind the complete context, never just a producer label or matching hash.
  const coherent_occurrences=[],snapshot_occurrences=[];
  function occurrences(v,root,path='',parents=[]){
    if(!v||typeof v!=='object')return;
    const node=intern(v);
    if(typeof v.id==='string')coherent_occurrences.push({id:'body-occurrence-'+coherent_occurrences.length,root,path,body_root:node,parent_roots:parents,source_identity:ref(v,v.id),status:'unreviewed',required_context_root:stateRoot});
    if(snapshotReference(v)){
      const original=originals.find(o=>o.sha256===v.immutable_snapshot.sha256);if(!original)hold('missing occurrence original');
      snapshot_occurrences.push({id:'snapshot-occurrence-'+snapshot_occurrences.length,root,path,reference:v,original_typed_root:original.typed_root,parent_roots:parents,required_context_root:stateRoot,status:'unreviewed'});
      return; // Explicit inbound edge preserves each context without exponential expansion.
    }
    for(const [key,child] of Object.entries(v))occurrences(child,root,path+'/'+pointer(key),[...parents,node]);
  }
  occurrences(copy,{kind:'state',sha256:baseline.state_sha256});
  const getOriginal=decodeGraph(definitions);
  for(const o of originals)occurrences(JSON.parse(getOriginal(o.root)),{kind:'snapshot-original',sha256:o.sha256});
  const required_supporting_rules={state:copy,subject,originals:originals.map(o=>({reference:o.reference,raw:getOriginal(o.root)}))};
  const groups=selectedRoots.map((r,i)=>{
    const matching=coherent_occurrences.filter(e=>e.body_root===r.root);
    const occurrence_context={baseline,source:r.source,occurrences:matching,snapshot_occurrences,producer:r.producer};
    const body_bytes=bytes(selected[i].value),context_bytes=bytes(occurrence_context);
    // Unknown/distant interactions require the full baseline, including unknown fields.
    const supporting_rules_bytes=bytes(required_supporting_rules),complete_bytes=bytes({body:selected[i].value,occurrence_context,required_supporting_rules});
    return {id:'record-group-'+i,kind:'complete-record',source:r.source,body_root:r.root,producer:r.producer,occurrences:matching,required_context:{state_root:stateRoot,subject_root:subjectRoot,scope:'*',reason:'Logical and distant coupling not independently reviewed; full baseline compulsory.'},status:'unreviewed',fit:complete_bytes>max_group_bytes?'Held':'unreviewed',body_bytes,occurrence_context_bytes:context_bytes,required_supporting_rules_bytes:supporting_rules_bytes,framing_bytes:complete_bytes-body_bytes-context_bytes-supporting_rules_bytes,complete_bytes};
  });
  const native_proof_references=[];
  for(const [id,v] of sourceList(copy)){try{const c=classificationFor(copy,resolveSnapshotEntry(copy,v),id);if(c)native_proof_references.push({source:ref(resolveSnapshotEntry(copy,v),id),classification:c,reuse_for_bootstrap:false});}catch{ /* Invalid old proof never authorizes exclusion; exact original remains in baseline. */ }}
  return {protocol:LEGACY_BOOTSTRAP_PROTOCOL,version:1,authority:'encoding and unreviewed planning only',options:{source_ids,max_group_bytes,canonical_json_text},baseline,definitions,originals,selected:selectedRoots,frontier,coherent_occurrences,snapshot_occurrences,groups,native_proof_references,unsupported_couplings:[{scope:'*',status:'Held',reason:'No independent canonical preservation/interaction acceptance of logical boundaries. Whole baseline frontier remains compulsory.'}],semantic_acceptance:false};
}
export function buildLegacyBootstrap(state,{source_ids,max_group_bytes=48000,canonical_json_text=false}={}){
  if(!Array.isArray(source_ids)||!source_ids.length||source_ids.some(id=>typeof id!=='string'||!id)||new Set(source_ids).size!==source_ids.length)hold('unique exact source_ids required');
  if(!Number.isSafeInteger(max_group_bytes)||max_group_bytes<1||typeof canonical_json_text!=='boolean')hold('invalid builder options');
  const manifest=plan(state,[...source_ids],max_group_bytes,canonical_json_text);manifest.manifest_sha256=hash(manifest);return manifest;
}
export function decodeLegacyBootstrap(manifest){
  exact(manifest);const {manifest_sha256,...body}=manifest;
  if(manifest.protocol!==LEGACY_BOOTSTRAP_PROTOCOL||manifest.version!==1||hash(body)!==manifest_sha256)hold('manifest identity/corruption');
  const get=decodeGraph(manifest.definitions),state=get(manifest.baseline.state_root),subject=get(manifest.baseline.subject_root);
  if(hash(state)!==manifest.baseline.state_sha256||hash(subject)!==manifest.baseline.subject_sha256)hold('baseline reconstruction changed');
  const originals=manifest.originals.map(o=>{const raw=get(o.root),r=snapshotReference(o.reference);if(typeof raw!=='string'||!r||digest(raw)!==o.sha256||o.sha256!==r.sha256||raw.length!==o.characters||raw.length!==r.characters)hold('raw original coverage mismatch');const parsed=JSON.parse(raw),shape=Array.isArray(parsed)?'array':parsed!==null&&typeof parsed==='object'?'object':'scalar';if(shape!==r.shape||!equal(parsed,get(o.typed_root)))hold('original typed shape changed');return {reference:o.reference,raw};});
  const lookup=new Map();for(const o of originals){const key=o.reference.immutable_snapshot.sha256;if(lookup.has(key)&&lookup.get(key)!==o.raw)hold('original hash collision');lookup.set(key,o.raw);}
  // No fallback to the original store: missing embedded originals must hold.
  bindSnapshots(state,sha=>lookup.get(sha));
  isolated(state);
  for(const r of manifest.selected)if(!equal(ref(get(r.root),r.source.id),r.source))hold('selected original mismatch');
  // Recompute coverage from the embedded originals, not from omitted source IO.
  // A caller cannot reseal a truncated frontier or falsified group measurement.
  const rebuilt=buildLegacyBootstrap(state,manifest.options);
  if(!equal(rebuilt,manifest))hold('incomplete frontier, original, occurrence or context coverage');
  return {state,subject,originals,selected:manifest.selected.map(r=>({source:r.source,value:get(r.root)}))};
}
export function validateLegacyBootstrap(state,manifest){
  decodeLegacyBootstrap(manifest);
  const current=buildLegacyBootstrap(state,manifest.options);
  if(!equal(current,manifest))hold('baseline, archive membership, producer, context or reconstruction changed');
  return {valid:true,semantic_acceptance:false,manifest_sha256:manifest.manifest_sha256};
}
export function materializeLegacyGroup(manifest,group_id){
  const decoded=decodeLegacyBootstrap(manifest),group=manifest.groups.find(g=>g.id===group_id);
  if(!group)hold('unknown coherent group');
  const selected=decoded.selected.find(s=>equal(s.source,group.source));if(!selected)hold('missing group source');
  const result={body:selected.value,occurrence_context:{baseline:manifest.baseline,source:group.source,occurrences:group.occurrences,snapshot_occurrences:manifest.snapshot_occurrences,producer:group.producer},required_supporting_rules:{state:decoded.state,subject:decoded.subject,originals:decoded.originals}};
  if(bytes(result)!==group.complete_bytes)hold('complete group delivery size changed');
  return result;
}
export function inspectLegacyBootstrap(manifest){
  decodeLegacyBootstrap(manifest);
  return {protocol:manifest.protocol,manifest_sha256:manifest.manifest_sha256,status:'Held',semantic_acceptance:false,frontier:manifest.frontier,groups:manifest.groups,unsupported_couplings:manifest.unsupported_couplings,counts:{sources:manifest.selected.length,frontier_occurrences:manifest.frontier.length,definitions:manifest.definitions.length,originals:manifest.originals.length,groups:manifest.groups.length},sizes:{manifest_bytes:bytes(manifest),definitions_bytes:bytes(manifest.definitions),baseline_bytes:bytes(decodeGraph(manifest.definitions)(manifest.baseline.state_root))},call_forecast:null,native_proof_references:manifest.native_proof_references.map(p=>({source:p.source,reuse_for_bootstrap:false}))};
}
export function captureLegacyBootstrap(state,manifest,{transaction}={}){
  // A boolean is insufficient. Require the existing Store currently executing its transaction.
  if(!(transaction instanceof Store)||transaction.inTransaction!==true)hold('existing Store transaction required');
  validateLegacyBootstrap(state,manifest);
  return {protocol:LEGACY_BOOTSTRAP_PROTOCOL,version:1,manifest_sha256:manifest.manifest_sha256,capsule:retainSnapshot(state,manifest)};
}
export function readLegacyBootstrap(state,descriptor){
  if(descriptor?.protocol!==LEGACY_BOOTSTRAP_PROTOCOL||descriptor.version!==1)hold('capsule protocol mismatch');
  const manifest=JSON.parse(snapshotBytes(state,descriptor.capsule));
  if(manifest.manifest_sha256!==descriptor.manifest_sha256)hold('capsule identity mismatch');
  decodeLegacyBootstrap(manifest);return manifest;
}
export function legacyOperatingFrontier(state){
  const {copy}=isolated(state),frontier=entries(copy),source_root=hash(copy);
  return {protocol:'soloco-operating-legacy-provider-v1',source_root,complete:false,entries:frontier.map(e=>({id:e.id,sha256:hash(e),source:e.source,source_ref:e.source,producer_refs:e.producer,context_identity:source_root,location:e.location,scope:'global',status:'dirty',receipt_refs:[]})),interaction_complete:false,receipt_refs:[],measurements:{frontier_occurrences:frontier.length,complete_baseline_bytes:bytes(copy),semantic_acceptance:false}};
}
