// Trusted read-only selectors inside an already authenticated owning snapshot.
// These helpers issue no caller, custody, adoption, review or execution authority.
import {types} from 'node:util';
import {FAMILIES,canonical,peerDigest} from './peers/ledger.mjs';
import {inspectPeerPinnedTeamFrom,readPeerPinnedTeamFrom,legacyEncodedReplyBytes} from './peers/legacy-origin.mjs';

export const PEER_PUBLIC_CONTEXT_LIMITS=Object.freeze({page_rows:50,range_characters:4096,encoded_reply_bytes:24576});
const families=new Set(FAMILIES),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=(code,message=code)=>{throw Object.assign(Error(message),{code});};
const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&!v.includes('\0')&&Buffer.from(v,'utf8').toString('utf8')===v;
const boundary=(s,i)=>!(i>0&&i<s.length&&/[\uD800-\uDBFF]/.test(s[i-1])&&/[\uDC00-\uDFFF]/.test(s[i]));
const fits=value=>legacyEncodedReplyBytes(value)<=PEER_PUBLIC_CONTEXT_LIMITS.encoded_reply_bytes;
function closed(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)fail('PEER_CONTEXT_INPUT');
 const descriptors=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(descriptors).some(k=>typeof k!=='string'||!keys.includes(k)||!Object.hasOwn(descriptors[k],'value')||!descriptors[k].enumerable))fail('PEER_CONTEXT_INPUT');
}
function base(input,keys){
 closed(input,['company_id','family',...keys]);
 if(!text(input.company_id,2000)||!families.has(input.family))fail('PEER_CONTEXT_INPUT');
}
function source(family,row){
 const body=canonical(row.value);
 return {family,id:row.id,revision:row.revision,sha256:row.sha256,representation:'canonical-peer-row-value-v1',content_sha256:peerDigest(row.value),total_characters:body.length,utf8_bytes:Buffer.byteLength(body),read:{tool:'company_owner',action:'context_read'}};
}
function metadata(family,row){
 const item={source:source(family,row)},deferred=[];
 for(const key of ['kind','status','scope','principal_id','owner_principal_id','task_id','role','stage','summary','content']){
  if(!Object.hasOwn(row.value??{},key))continue;
  const max=['summary','content'].includes(key)?400:200;
  if(text(row.value[key],max))item[key]=row.value[key];else deferred.push(key);
 }
 if(deferred.length)item.fields_not_inlined=deferred;
 return item;
}

export function inspectPeerPublicContextFrom(tx,input){
 base(input,['status','principal_id','task_id','scope','limit','cursor']);
 const filters={};
 for(const key of ['status','principal_id','task_id','scope'])if(input[key]!==undefined){if(!text(input[key],1000))fail('PEER_CONTEXT_INPUT');filters[key]=input[key];}
 if(input.cursor!==undefined&&!text(input.cursor,16000))fail('PEER_CONTEXT_INPUT');
 let limit=input.limit??20;
 if(!Number.isSafeInteger(limit)||limit<1||limit>PEER_PUBLIC_CONTEXT_LIMITS.page_rows)fail('PEER_CONTEXT_INPUT');
 for(;;){
  const page=tx.list(input.family,{...filters,limit,...(input.cursor?{cursor:input.cursor}:{})});
  const result={protocol:'peer-public-context-page-v1',company_id:input.company_id,family:input.family,metadata_only:true,items:page.items.map(row=>metadata(input.family,row)),total:page.total,returned:page.items.length,complete:page.complete,next_cursor:page.next_cursor,effective_limit:limit};
  if(fits(result))return result;
  if(limit===1)fail('PEER_CONTEXT_CAPACITY','Exact row identity and metadata cannot fit the bounded reply; source decomposition is required');
  limit=Math.max(1,Math.floor(limit/2));
 }
}

export function readPeerPublicContextFrom(tx,input){
 base(input,['id','revision','sha256','offset','length']);
 if(!text(input.id,2000)||!Number.isSafeInteger(input.revision)||input.revision<1||!hash(input.sha256))fail('PEER_CONTEXT_INPUT');
 const offset=input.offset??0,length=input.length??PEER_PUBLIC_CONTEXT_LIMITS.range_characters;
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<1||length>PEER_PUBLIC_CONTEXT_LIMITS.range_characters)fail('PEER_CONTEXT_INPUT');
 const row=tx.get(input.family,input.id);
 if(!row||row.revision!==input.revision||row.sha256!==input.sha256)fail('PEER_CONTEXT_CHANGED','Current exact row changed; inspect again without a historical current alias');
 const body=canonical(row.value),selected=source(input.family,row);
 if(offset>body.length||!boundary(body,offset))fail('PEER_CONTEXT_RANGE');
 let end=Math.min(body.length,offset+length);if(!boundary(body,end))end--;
 for(;;){
  if(end===offset&&offset<body.length)fail('PEER_CONTEXT_RANGE','Range must contain a complete Unicode character');
  const result={protocol:'peer-public-context-read-v1',company_id:input.company_id,source:selected,offset,length:end-offset,text:body.slice(offset,end),next_offset:end<body.length?end:null,complete:end===body.length};
  if(fits(result))return result;
  if(end===offset)fail('PEER_CONTEXT_CAPACITY','Exact source identity cannot fit the bounded reply');
  end=offset+Math.floor((end-offset)/2);if(!boundary(body,end))end--;
 }
}

export function inspectPeerPublicPinsFrom(tx,{company_id}){
 const {reference,bundle,sources}=inspectPeerPinnedTeamFrom(tx,{company_id});
 const result={protocol:'peer-public-pinned-sources-v1',company_id,reference,plugin_version:bundle.plugin_version,team_sha256:bundle.team_sha256,governance_sha256:bundle.governance_sha256,lineage:bundle.lineage,sources:sources.map(s=>({...s,read:{tool:'company_owner',action:'pinned_read'}}))};
 if(!fits(result))fail('PEER_CONTEXT_CAPACITY','Complete pinned source headers cannot fit; no installed-team fallback is permitted');
 return result;
}
export function readPeerPublicPinsFrom(tx,input,{company_id}){
 // Original helper retains complete roles ordering and original byte hashes.
 return readPeerPinnedTeamFrom(tx,input,{company_id});
}
