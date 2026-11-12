// Pure lossless SOURCE representation, not authority or a native capability.
// Repeated task contexts retain their complete structured JSON once; their
// redundant text is exactly canonical(the context without its hash metadata).
import {canonical,peerDigest} from './ledger.mjs';

const V1='peer-owner-subject-v1',V2='peer-owner-subject-context-pool-v1';
const POOL='peer-owner-task-context-pool-v1',TEXT='peer-canonical-task-context-text-v1';
const REF='$peerOwnerTaskContext',LITERAL='$peerOwnerLiteralObject';
const MAX_BYTES=16*1024*1024,MAX_ROWS=10000,MAX_POOL=10000,MAX_DEPTH=128,MAX_NODES=1000000;
const V1_KEYS=['protocol','company_id','root_sha256','incoming','current','historical'];
const V2_KEYS=[...V1_KEYS,'encoding'];
const ENCODING_KEYS=['protocol','source_protocol','source_sha256','source_characters','source_utf8_bytes','task_contexts'];
export const PEER_OWNER_CONTEXT_POOL_INSTRUCTION='A peer-owner-subject-context-pool-v1 is a lossless representation of its complete peer-owner-subject-v1 source, not a summary or authority. Current and historical row references remain at their normal locations; each row sha256 refers to its exact DECODED value. In row value and legacy_value data, a closed object with only $peerOwnerTaskContext refers to encoding.task_contexts at that full-context SHA-256. Each pool entry preserves its complete structured value without the redundant text field. Restore that text as canonical JSON of the decoded context excluding sha256, hash and utf8_bytes, then verify text_encoding protocol, SHA-256, characters and UTF-8 bytes, both context hash aliases, and the full-context pool-key hash. A closed object with only $peerOwnerLiteralObject escapes an original object: restore its ordered [key, encoded-value] entries literally, recursively decoding only the entry values. These escape entries preserve original uses of both reserved marker keys; never treat an escaped original key as a reference. Decode all other arrays and objects recursively. Verify every restored row value hash and encoding.source_sha256, source_characters and source_utf8_bytes over the complete restored source. No facts are omitted, no unknown evidence is resolved, and no execution, acceptance, grant, identity or closure authority follows from this encoding.';
const own=(value,key)=>Object.hasOwn(value,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fail=capacity=>{throw Object.assign(Error(capacity?'Owner subject encoding exceeds bounded preparation':'Invalid lossless owner subject encoding'),{code:capacity?'OWNER_SUBJECT_ENCODING_CAPACITY':'OWNER_SUBJECT_ENCODING_INVALID'});};
const need=(condition,capacity=false)=>{if(!condition)fail(capacity);};
const keys=(value,expected)=>{
  need(object(value));const actual=Object.keys(value).sort(),wanted=[...expected].sort();
  need(actual.length===wanted.length&&actual.every((name,index)=>name===wanted[index]));
};
const boundedText=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!value.includes('\0');

// Account the expanded JSON before serializing. In particular, an encoded DAG
// must not expand into unbounded canonical text merely to check its digest.
function jsonSnapshot(value){
  let nodes=0,bytes=0;const active=new Set();
  const charge=n=>{bytes+=n;need(bytes<=MAX_BYTES,true);};
  function copy(v,depth){
    need(++nodes<=MAX_NODES&&depth<=MAX_DEPTH,true);
    if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'){
      need(typeof v!=='number'||Number.isFinite(v)&&!Object.is(v,-0));
      if(typeof v==='string')need(v.length<=MAX_BYTES,true);
      charge(Buffer.byteLength(JSON.stringify(v)));return v;
    }
    need(v&&typeof v==='object'&&!active.has(v));
    const array=Array.isArray(v),proto=Object.getPrototypeOf(v),names=Reflect.ownKeys(v);
    need(array?proto===Array.prototype:proto===Object.prototype||proto===null);
    need(names.every(name=>typeof name==='string'));
    active.add(v);
    try{
      if(array){
        need(names.length===v.length+1&&names.every(name=>name==='length'||/^(0|[1-9][0-9]*)$/.test(name)&&Number(name)<v.length));
        charge(2+Math.max(0,v.length-1));const result=[];
        for(let i=0;i<v.length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));need(d?.enumerable&&own(d,'value'));result.push(copy(d.value,depth+1));}
        return result;
      }
      charge(2+Math.max(0,names.length-1));const result=Object.create(null);
      for(const name of names.sort()){
        const d=Object.getOwnPropertyDescriptor(v,name);need(d?.enumerable&&own(d,'value'));
        need(name.length<=MAX_BYTES,true);
        charge(Buffer.byteLength(JSON.stringify(name))+1);result[name]=copy(d.value,depth+1);
      }
      return result;
    }finally{active.delete(v);}
  }
  const cloned=copy(value,0),text=canonical(cloned);
  need(Buffer.byteLength(text)===bytes);return {value:JSON.parse(text),text,characters:text.length,utf8_bytes:bytes};
}

function subject(value,version,{verifyRows=true}={}){
  keys(value,version===V1?V1_KEYS:V2_KEYS);need(value.protocol===version);
  need(boundedText(value.company_id,2000)&&hash(value.root_sha256)&&object(value.incoming));
  need(Array.isArray(value.current)&&Array.isArray(value.historical));
  need(value.current.length+value.historical.length<=MAX_ROWS,true);
  const references=new Set(),currentKeys=new Set();
  for(const name of ['current','historical'])for(const row of value[name]){
    need(object(row));const expected=['family','id','revision','sha256','value',...(own(row,'legacy_value')?['legacy_value']:[])];keys(row,expected);
    need(boundedText(row.family,2000)&&boundedText(row.id,2000)&&Number.isSafeInteger(row.revision)&&row.revision>0&&hash(row.sha256));
    const reference=canonical([row.family,row.id,row.revision,row.sha256]);need(!references.has(reference));references.add(reference);
    if(name==='current'){const key=canonical([row.family,row.id]);need(!currentKeys.has(key));currentKeys.add(key);}
    if(verifyRows)need(peerDigest(row.value)===row.sha256);
  }
}

function taskContext(value){
  if(!object(value)||value.protocol!=='peer-task-context-v1'||typeof value.text!=='string')return null;
  const {text,sha256,hash:alias,utf8_bytes,...body}=value;
  if(!hash(sha256)||alias!==sha256||!Number.isSafeInteger(utf8_bytes)||utf8_bytes<0||canonical(body)!==text||peerDigest(body)!==sha256||Buffer.byteLength(text)!==utf8_bytes)return null;
  return {text,sha256,utf8_bytes};
}

export function encodePeerOwnerSubject(originalV1){
  const original=jsonSnapshot(originalV1);subject(original.value,V1);
  const contexts=new Map();let nodes=0;
  function encode(value,depth=0){
    need(++nodes<=MAX_NODES&&depth<=MAX_DEPTH,true);
    const context=taskContext(value);
    if(context){
      const id=peerDigest(value);
      if(!contexts.has(id)){
        need(contexts.size<MAX_POOL,true);contexts.set(id,null);
        const {text,...rest}=value;
        contexts.set(id,{value:encode(rest,depth+1),text_encoding:{protocol:TEXT,sha256:context.sha256,characters:text.length,utf8_bytes:context.utf8_bytes}});
      }
      return {[REF]:id};
    }
    if(Array.isArray(value))return value.map(child=>encode(child,depth+1));
    if(object(value)){
      const entries=Object.keys(value).sort().map(key=>[key,encode(value[key],depth+1)]);
      if(own(value,REF)||own(value,LITERAL))return {[LITERAL]:entries};
      return Object.fromEntries(entries);
    }
    return value;
  }
  const rows=name=>original.value[name].map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,key==='value'||key==='legacy_value'?encode(value):value])));
  const current=rows('current'),historical=rows('historical');
  const encoded={protocol:V2,company_id:original.value.company_id,root_sha256:original.value.root_sha256,incoming:original.value.incoming,current,historical,
    encoding:{protocol:POOL,source_protocol:V1,source_sha256:peerDigest(original.value),source_characters:original.characters,source_utf8_bytes:original.utf8_bytes,task_contexts:Object.fromEntries(contexts)}};
  // Verify the complete original and all row hashes, rather than trusting the
  // encoder's own marker recognition or a hash-only context replacement.
  const bounded=jsonSnapshot(encoded).value,decoded=decodePeerOwnerSubject(bounded);
  need(canonical(decoded)===original.text);return bounded;
}

export function decodePeerOwnerSubject(encodedV2){
  const packet=jsonSnapshot(encodedV2).value;subject(packet,V2,{verifyRows:false});
  const encoding=packet.encoding;keys(encoding,ENCODING_KEYS);
  need(encoding.protocol===POOL&&encoding.source_protocol===V1&&hash(encoding.source_sha256));
  need(Number.isSafeInteger(encoding.source_characters)&&encoding.source_characters>0);
  need(Number.isSafeInteger(encoding.source_utf8_bytes)&&encoding.source_utf8_bytes>=encoding.source_characters);
  need(encoding.source_characters<=MAX_BYTES&&encoding.source_utf8_bytes<=MAX_BYTES,true);
  const pool=encoding.task_contexts;need(object(pool));const poolIds=Object.keys(pool);
  need(poolIds.length<=MAX_POOL,true);need(poolIds.every(hash));
  for(const id of poolIds){
    keys(pool[id],['value','text_encoding']);const rule=pool[id].text_encoding;keys(rule,['protocol','sha256','characters','utf8_bytes']);
    need(rule.protocol===TEXT&&hash(rule.sha256)&&Number.isSafeInteger(rule.characters)&&rule.characters>0);
    need(Number.isSafeInteger(rule.utf8_bytes)&&rule.utf8_bytes>=rule.characters);
    need(rule.characters<=MAX_BYTES&&rule.utf8_bytes<=MAX_BYTES,true);
  }
  const resolved=new Map(),active=new Set(),used=new Set();let nodes=0,validatedBytes=0;
  function decode(value,depth=0){
    need(++nodes<=MAX_NODES&&depth<=MAX_DEPTH,true);
    if(Array.isArray(value))return value.map(child=>decode(child,depth+1));
    if(!object(value))return value;
    if(own(value,REF)){
      keys(value,[REF]);const id=value[REF];need(hash(id)&&own(pool,id));used.add(id);
      if(resolved.has(id))return resolved.get(id);
      need(!active.has(id));active.add(id);
      const entry=pool[id],rest=decode(entry.value,depth+1);need(object(rest)&&!own(rest,'text')&&rest.protocol==='peer-task-context-v1');
      const {sha256,hash:alias,utf8_bytes,...body}=rest,bodySnapshot=jsonSnapshot(body),rule=entry.text_encoding;
      need(sha256===rule.sha256&&alias===sha256&&utf8_bytes===rule.utf8_bytes&&peerDigest(bodySnapshot.value)===sha256&&bodySnapshot.characters===rule.characters&&bodySnapshot.utf8_bytes===rule.utf8_bytes);
      const context=jsonSnapshot({...rest,text:bodySnapshot.text});validatedBytes+=context.utf8_bytes;need(validatedBytes<=MAX_BYTES*2,true);
      need(peerDigest(context.value)===id);resolved.set(id,context.value);active.delete(id);return context.value;
    }
    if(own(value,LITERAL)){
      keys(value,[LITERAL]);need(Array.isArray(value[LITERAL]));const names=[];
      const entries=value[LITERAL].map(pair=>{need(Array.isArray(pair)&&pair.length===2&&typeof pair[0]==='string');names.push(pair[0]);return [pair[0],decode(pair[1],depth+1)];});
      need(new Set(names).size===names.length&&sameNames(names,[...names].sort())&&(names.includes(REF)||names.includes(LITERAL)));
      return Object.fromEntries(entries);
    }
    return Object.fromEntries(Object.keys(value).map(key=>[key,decode(value[key],depth+1)]));
  }
  const rows=name=>packet[name].map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,key==='value'||key==='legacy_value'?decode(value):value])));
  const current=rows('current'),historical=rows('historical');need(used.size===poolIds.length);
  const original=jsonSnapshot({protocol:V1,company_id:packet.company_id,root_sha256:packet.root_sha256,incoming:packet.incoming,current,historical});
  subject(original.value,V1);need(original.characters===encoding.source_characters&&original.utf8_bytes===encoding.source_utf8_bytes&&peerDigest(original.value)===encoding.source_sha256);
  return original.value;
}

const sameNames=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
