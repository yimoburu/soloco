// Private runtime observations. Retrieval is not delivery; successful delivery
// is not a claim of semantic understanding or retention across compaction.
import {digest} from './store.mjs';
const protocol='record-reads-v1-runtime-delivery';
const fail=()=>{throw Error('Invalid runtime record READ delivery evidence');};
const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(v,keys)=>plain(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const text=v=>typeof v==='string'&&v.length>0&&v.length<=500&&!v.includes('\0');
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=['id','revision','sha256','offset','length','total_characters','range_sha256','request_sha256','round','delivered_at'];
export function validateRecordReadDelivery(value){
  if(!exact(value,['version','protocol','native_id','initial_delivery','ranges'])||value.version!==1||value.protocol!==protocol||!text(value.native_id)||!exact(value.initial_delivery,['assignment_context_sha256','request_sha256','delivered_at'])||!sha(value.initial_delivery.assignment_context_sha256)||!sha(value.initial_delivery.request_sha256)||typeof value.initial_delivery.delivered_at!=='string'||!Number.isFinite(Date.parse(value.initial_delivery.delivered_at))||!Array.isArray(value.ranges)||value.ranges.length>64)fail();
  let previousRound=0,count=0,request=null,at=null;
  for(const r of value.ranges){
    if(!exact(r,keys)||!text(r.id)||!(r.revision===null||integer(r.revision)&&r.revision>0)||!sha(r.sha256)||!integer(r.offset)||!integer(r.length)||r.length<1||r.length>32768||!integer(r.total_characters)||r.offset+r.length>r.total_characters||!sha(r.range_sha256)||!sha(r.request_sha256)||!integer(r.round)||r.round<1||r.round>16||typeof r.delivered_at!=='string'||!Number.isFinite(Date.parse(r.delivered_at))||r.round<previousRound)fail();
    if(r.round!==previousRound){count=0;request=r.request_sha256;at=r.delivered_at;}
    if(++count>4||request!==r.request_sha256||at!==r.delivered_at)fail();previousRound=r.round;
  }
  return true;
}
export function recordReadDeliveryPhase(before,current){
  try{validateRecordReadDelivery(current);if(before===undefined)return true;validateRecordReadDelivery(before);return before.version===current.version&&before.protocol===current.protocol&&before.native_id===current.native_id&&equal(before.initial_delivery,current.initial_delivery)&&before.ranges.length<=current.ranges.length&&before.ranges.every((r,i)=>equal(r,current.ranges[i]));}catch{return false;}
}
export function recordReadDeliveryAdvance(before,current){
  if(!recordReadDeliveryPhase(before,current))return false;
  if(before===undefined)return current.ranges.length===0;
  const old=before?.ranges??[],added=current.ranges.slice(old.length);
  return added.length>=1&&added.length<=4&&added.every(r=>r.round===added[0].round)&&(!old.length||added[0].round>old.at(-1).round);
}
export function beginRecordReadDelivery({native_id,assignment_context_sha256,request,delivered_at}){
  if(typeof request!=='string')fail();
  const value={version:1,protocol,native_id,initial_delivery:{assignment_context_sha256,request_sha256:digest(request),delivered_at},ranges:[]};
  validateRecordReadDelivery(value);return value;
}
export function appendRecordReadDelivery(previous,reads,{native_id,request,round,delivered_at}){
  if(!Array.isArray(reads)||reads.length<1||reads.length>4||typeof request!=='string')fail();
  const ranges=reads.map(r=>{if(typeof r.text!=='string'||r.text.length!==r.length)fail();return {id:r.id,revision:r.revision??null,sha256:r.sha256,offset:r.offset,length:r.length,total_characters:r.total_characters,range_sha256:digest(r.text),request_sha256:digest(request),round,delivered_at};});
  const next={...previous,native_id,ranges:[...(previous?.ranges??[]),...ranges]};
  if(!recordReadDeliveryAdvance(previous,next))fail();return next;
}
