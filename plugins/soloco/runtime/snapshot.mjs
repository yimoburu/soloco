import {createHash} from 'node:crypto';

const sha = text => createHash('sha256').update(text).digest('hex');
const contexts = new WeakMap();
const shape = value => Array.isArray(value) ? 'array' : value !== null && typeof value === 'object' ? 'object' : 'scalar';
function exactJSON(value) {
  const active=new Set();
  function validate(item,depth=0){
    if(depth>256)throw Error('Immutable snapshot JSON nesting exceeds 256');
    if(item===null||['string','boolean'].includes(typeof item))return;
    if(typeof item==='number'&&Number.isFinite(item))return;
    if(!item||typeof item!=='object'||(!Array.isArray(item)&&![Object.prototype,null].includes(Object.getPrototypeOf(item)))||active.has(item))throw Error('Immutable snapshot requires acyclic plain JSON');
    active.add(item);const keys=Reflect.ownKeys(item);
    if(Array.isArray(item)&&keys.length!==item.length+1)throw Error('Immutable snapshot sparse/extended array');
    for(const key of keys){
      if(Array.isArray(item)&&key==='length')continue;
      const d=Object.getOwnPropertyDescriptor(item,key);
      if(typeof key!=='string'||!d.enumerable||!Object.hasOwn(d,'value'))throw Error('Immutable snapshot hidden/accessor field');
      validate(d.value,depth+1);
    }
    active.delete(item);
  }
  validate(value);return JSON.stringify(value);
}

// Storage ownership is deliberately outside the logical company JSON. Copying a
// snapshot never copies this vault, nor expands its graph of previous snapshots.
export function bindSnapshots(state, read, scope) {
  if (state && typeof state === 'object') {const durable=new Set(),todo=read?[state]:[],seen=new Set();
    while(todo.length){const item=todo.pop();if(!item||typeof item!=='object'||seen.has(item))continue;seen.add(item);
      if(item.immutable_snapshot?.sha256)durable.add(item.immutable_snapshot.sha256);
      for(const child of Object.values(item))if(child&&typeof child==='object')todo.push(child);
    }
    const ctx={pending:new Map(), read,scope:scope??Symbol(),audits:[],durable};contexts.set(state,ctx);if(state.records&&typeof state.records==='object'){contexts.set(state.records,ctx);for(const record of Object.values(state.records))if(record&&typeof record==='object')contexts.set(record,ctx);}}
  return state;
}
function context(state) {
  if (!contexts.has(state)) {const inherited=state?.records&&(contexts.get(state.records)??Object.values(state.records).map(record=>record&&typeof record==='object'?contexts.get(record):null).find(Boolean));if(inherited)contexts.set(state,inherited);else bindSnapshots(state);}
  return contexts.get(state);
}
export function snapshotReference(value) {
  if (!value || typeof value !== 'object' || !Object.hasOwn(value,'immutable_snapshot')) return null;
  const ref=value.immutable_snapshot;
  if (Object.keys(value).length!==1 || !ref || Object.keys(ref).sort().join(',')!=='characters,sha256,shape,version'
      || ref.version!==1 || !/^[a-f0-9]{64}$/.test(ref.sha256) || !Number.isSafeInteger(ref.characters)
      || ref.characters<0 || !['object','array','scalar'].includes(ref.shape)) throw Error('Immutable snapshot reference malformed');
  return ref;
}
export function retainSnapshot(state, value) {
  const raw=exactJSON(value);
  if (snapshotReference(value)) return value;
  if (raw===undefined) throw Error('Immutable snapshot is not JSON');
  const ref={version:1,sha256:sha(raw),characters:raw.length,shape:shape(value)};
  context(state).pending.set(ref.sha256,raw);
  return Object.freeze({immutable_snapshot:Object.freeze(ref)});
}
export function snapshotBytes(state, value) {
  const ref=snapshotReference(value);
  if (!ref) return JSON.stringify(value);
  const ctx=context(state),staged=ctx.pending.has(ref.sha256)&&!ctx.durable.has(ref.sha256);
  const raw=staged?ctx.pending.get(ref.sha256):ctx.read?.(ref.sha256);
  if(!staged&&ctx.read)ctx.durable.add(ref.sha256);
  for(const audit of ctx.audits)if(!audit.has(ref.sha256)||!staged)audit.set(ref.sha256,{value,staged});
  if (typeof raw!=='string' || sha(raw)!==ref.sha256 || raw.length!==ref.characters) throw Error('Immutable snapshot missing or corrupt: '+ref.sha256);
  if (shape(JSON.parse(raw))!==ref.shape) throw Error('Immutable snapshot shape mismatch');
  return raw;
}
export const resolveSnapshot = (state,value) => snapshotReference(value) ? JSON.parse(snapshotBytes(state,value)) : value;
export function readSnapshot(state,value,{offset=0,length}={}) {
  const ref=snapshotReference(value);if(!ref)throw Error('Exact immutable snapshot reference required');
  length??=Math.min(16000,ref.characters-offset);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<1||length>32768||offset+length>ref.characters)throw Error('Invalid immutable snapshot range');
  const raw=snapshotBytes(state,value),split=index=>index>0&&index<raw.length&&raw.charCodeAt(index-1)>=0xd800&&raw.charCodeAt(index-1)<=0xdbff&&raw.charCodeAt(index)>=0xdc00&&raw.charCodeAt(index)<=0xdfff;
  if(split(offset)||split(offset+length))throw Error('Immutable snapshot range splits surrogate pair');
  const text=raw.slice(offset,offset+length);
  return {snapshot:value,offset,length,total:raw.length,text,range_sha256:sha(text)};
}
export function pendingSnapshots(state) { return contexts.get(state)?.pending ?? new Map(); }
export function inheritSnapshots(source,target) {
  contexts.set(target,context(source));
  return target;
}
export function hasSnapshotReferences(value) {
  const todo=[value],seen=new Set();
  while(todo.length){const item=todo.pop();if(!item||typeof item!=='object'||seen.has(item))continue;seen.add(item);
    if(['immutable_snapshot','immutable_entry','retained_handover_subject'].some(key=>Object.hasOwn(item,key)))return true;
    for(const child of Object.values(item))if(child&&typeof child==='object')todo.push(child);
  }
  return false;
}
export function legacyHandoverSource(state,value) {
  if(!value||typeof value!=='object'||!Object.hasOwn(value,'retained_handover_subject'))return null;
  const ref=value.retained_handover_subject;
  if(Object.keys(value).length!==1||!ref||Object.keys(ref).sort().join(',')!=='record_id,sha256'||typeof ref.record_id!=='string'||!/^[a-f0-9]{64}$/.test(ref.sha256))throw Error('Legacy handover locator malformed');
  const entry=state.records?.[ref.record_id],source=entry&&resolveSnapshotEntry(state,entry),subject=source?.handover?.subject;
  const raw=snapshotReference(subject)?snapshotBytes(state,subject):subject&&exactJSON(subject);
  const decoded=raw&&JSON.parse(raw);
  if(!source||source.handover.subject_sha256!==ref.sha256||!raw||sha(raw)!==ref.sha256||typeof decoded.company_id!=='string'||!decoded.records||!decoded.jobs||!Array.isArray(decoded.messages)||!Array.isArray(decoded.notices))throw Error('Legacy handover original missing or changed');
  return source;
}
export function snapshotEntryReference(value) {
  if(!value||typeof value!=='object'||!Object.hasOwn(value,'immutable_entry'))return null;
  if(Object.keys(value).some(k=>!['id','revision','immutable_entry'].includes(k))||typeof value.id!=='string'||!snapshotReference(value.immutable_entry))throw Error('Immutable entry reference malformed');
  return value.immutable_entry;
}
export function retainSnapshotEntry(state,value,id=value?.id) {
  if(snapshotEntryReference(value))return value;
  if(typeof id!=='string')throw Error('Immutable entry identity required');
  return {id,...(Object.hasOwn(value,'revision')?{revision:value.revision}:{}),immutable_entry:retainSnapshot(state,value)};
}
export function resolveSnapshotEntry(state,value) {
  const ref=snapshotEntryReference(value);if(!ref)return value;
  const original=resolveSnapshot(state,ref);
  if(!original||typeof original!=='object'||(original.id!==undefined&&original.id!==value.id)
    ||Object.hasOwn(original,'revision')!==Object.hasOwn(value,'revision')||original.revision!==value.revision)throw Error('Immutable entry identity or revision changed');
  return original;
}

// Only runtime-owned snapshot slots are replaced. Unknown fields and every
// historical diagnostic container remain exact evidence, never inferred away.
export function shallowSnapshotAttempt(state,value) {
  if(!value)return value;
  if(snapshotEntryReference(value))return value;
  if(value.checkpoint_sha256){const ref=snapshotReference(value.checkpoint);if((ref?.sha256??sha(JSON.stringify(value.checkpoint)))!==value.checkpoint_sha256)throw Error('Upgrade original snapshot hash changed');}
  return retainSnapshotEntry(state,value);
}
export function shallowSnapshotHistory(state,{current=true}={}) {
  return {...(current?{upgrade:shallowSnapshotAttempt(state,state.upgrade)}:{}),upgrade_history:(state.upgrade_history??[]).map(value=>shallowSnapshotAttempt(state,value))};
}
export function shallowSnapshotRecord(state,record) {
  const h=record?.handover;
  if(record?.kind==='artifact'&&record.author_role==='runner'&&typeof h?.subject_sha256==='string'&&Array.isArray(h.input_refs)&&h.incoming_owner?.session_id===record.author_instance&&!h.subject?.retained_handover_subject){
    const ref=snapshotReference(h.subject);
    if((ref?.sha256??sha(JSON.stringify(h.subject)))!==h.subject_sha256)throw Error('Handover original snapshot hash changed');
  }
  return retainSnapshotEntry(state,record);
}
export function shallowSnapshotState(state,{history=true}={}) {
  const records=Object.fromEntries(Object.entries(state.records??{}).map(([key,record])=>[key,record?.id?shallowSnapshotRecord(state,record):retainSnapshotEntry(state,record,key)]));
  const jobs=Object.fromEntries(Object.entries(state.jobs??{}).map(([key,job])=>[key,retainSnapshotEntry(state,job,job.id??key)]));
  return inheritSnapshots(state,history ? {...state,records,jobs,...shallowSnapshotHistory(state)} : {...state,records,jobs});
}

// Projection caches are scoped to a bound vault (or one in-memory lineage).
// A copied JSON object cannot borrow the authority to resolve another vault.
export const snapshotScope = state => context(state).scope;
export function captureSnapshotDependencies(state,build,{root=state}={}) {
  const ctx=context(state),dependencies=new Map();ctx.audits.push(dependencies);
  try{
    // Validate all referenced originals, including unknown extension slots and
    // nested references, before a projection can become a frozen read sequence.
    const todo=[root],seen=new Set(),originals=new Map();
    while(todo.length){const item=todo.pop();if(!item||typeof item!=='object'||seen.has(item))continue;seen.add(item);
      const entry=snapshotEntryReference(item);
      // Every wrapper must validate, even when its original was already walked.
      // Queue the reference so entry and raw forms share hash/metadata dedup.
      if(entry){resolveSnapshotEntry(state,item);todo.push(entry);continue;}
      const ref=snapshotReference(item);
      if(ref){const prior=originals.get(ref.sha256);if(prior&&(prior.characters!==ref.characters||prior.shape!==ref.shape))throw Error('Immutable snapshot duplicate metadata mismatch');if(!prior){originals.set(ref.sha256,ref);todo.push(JSON.parse(snapshotBytes(state,item)));}continue;}
      if(Object.hasOwn(item,'retained_handover_subject')){legacyHandoverSource(state,item);todo.push(state.records[item.retained_handover_subject.record_id]);continue;}
      for(const child of Object.values(item))if(child&&typeof child==='object')todo.push(child);
    }
    return {value:build(),dependencies:[...dependencies.values()]};
  }
  finally{ctx.audits.pop();}
}
export function validateSnapshotDependencies(state,dependencies) {
  for(const dependency of dependencies) {
    // Staged originals were derived from the exact logical state at build time.
    // They have no durable counterpart yet; cache reuse also checks that entire
    // state and the vault lineage. Durable originals are re-read and hash/shape
    // checked on every hit, including references nested inside originals.
    if(!dependency.staged)snapshotBytes(state,dependency.value);
  }
}

// Bounded caches may pin exact text without retaining a whole evidence graph.
// These handles prove bytes only: they are never native-delivery/QA receipts.
const frozenTexts=new WeakMap();
const exactTextHash=text=>{
  let encoding='utf8';
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const next=text.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff)i++;else{encoding='utf16le';break;}}else if(c>=0xdc00&&c<=0xdfff){encoding='utf16le';break;}}
  return {sha256:createHash('sha256').update(text,encoding).digest('hex'),hash_encoding:encoding};
};
export function pinFrozenText(source) {
  if(!source||typeof source.raw!=='string'||source.raw.length!==source.length)throw Error('Invalid frozen text source');
  const verified=exactTextHash(source.raw);
  if(verified.sha256!==source.sha256||verified.hash_encoding!==source.hash_encoding)throw Error('Frozen text source hash mismatch');
  const {raw,...metadata}=source,handle=Object.freeze({...metadata});frozenTexts.set(handle,raw);return handle;
}
export function readFrozenText(handle,{sha256,offset=0,length=16000}={}) {
  const raw=frozenTexts.get(handle);if(raw===undefined)throw Error('Unknown frozen text handle');
  if(sha256!==handle.sha256)throw Error('Frozen text source hash mismatch');
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<0||length>32768||offset+length>raw.length||(length===0&&raw.length!==0))throw Error('Invalid frozen text range');
  const split=index=>index>0&&index<raw.length&&raw.charCodeAt(index-1)>=0xd800&&raw.charCodeAt(index-1)<=0xdbff&&raw.charCodeAt(index)>=0xdc00&&raw.charCodeAt(index)<=0xdfff;
  if(split(offset)||split(offset+length))throw Error('Frozen text range splits surrogate pair');
  const text=raw.slice(offset,offset+length),range=exactTextHash(text);
  return Object.freeze({source_id:handle.source_id,sha256:handle.sha256,...(Object.hasOwn(handle,'revision')?{revision:handle.revision}:{}),scope:handle.scope,path:handle.path,encoding:handle.encoding,hash_encoding:handle.hash_encoding,offset,end:offset+length,length,total:raw.length,text,range_sha256:range.sha256,range_hash_encoding:range.hash_encoding});
}

// Logical consumers never accept a caller-supplied cut. The storage owner must
// bind the actual normalized Store while its read/write snapshot is active.
const intakeProviders=new WeakMap();
export function bindOperatingIntake(state,store,reopen) {
  if(store?.storageInfo?.().format!=='normalized-v4'||typeof store.captureIntakeBaseline!=='function'||typeof store.readIntake!=='function'||typeof store.readSnapshot!=='function'||typeof store.db?.prepare!=='function'||store.db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version!==4)throw Error('Operating state Held: normalized storage intake provider unavailable');
  const key=context(state),old=intakeProviders.get(key);
  intakeProviders.set(key,{store,reopen:reopen??old?.reopen});return state;
}
export function operatingIntake(state,baseline) {
  const provider=intakeProviders.get(context(state));
  if(!provider)throw Error('Operating state Held: normalized storage intake provider unavailable');
  const owned=provider.store.closed===true,store=owned?provider.reopen?.():provider.store;
  if(!store)throw Error('Operating state Held: normalized storage intake provider closed');
  try{return store.readSnapshot(()=>{
    const next=store.captureIntakeBaseline();
    const intake=store.readIntake(baseline??next,{values:true});
    const current=store.readIntake(next,{values:true});
    if(JSON.stringify(intake.cut)!==JSON.stringify(current.cut))throw Error('Operating state Held: storage intake capture/read cut changed');
    return {baseline:next,intake};
  });}finally{if(owned)store.close();}
}
