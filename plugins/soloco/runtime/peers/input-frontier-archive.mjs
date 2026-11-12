// Fixed original typed-origin archive materialization. DATA only: no caller
// omission/body-kind selector, filesystem path, model call or authority writer.
import {createHash} from 'node:crypto';
import {canonical,peerDigest,PEER_LEGACY_TEXT_LIMITS} from './ledger.mjs';

const hash=text=>createHash('sha256').update(text).digest('hex'),same=(a,b)=>canonical(a)===canonical(b),ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
export const INPUT_ARCHIVE='peer-input-frontier-origin-archive-v1';
export const INPUT_ARCHIVE_LIMITS=Object.freeze({descriptors:10000,pages:10000,descriptor_bytes:8*1024*1024,body_bytes:PEER_LEGACY_TEXT_LIMITS.body_bytes,total_bytes:PEER_LEGACY_TEXT_LIMITS.total_bytes});
function version(tx,r){const row=tx.getVersion(r);need(row&&row.sha256===r.sha256&&peerDigest(row.value)===r.sha256,'FRONTIER_ARCHIVE_PROVENANCE');return row;}
function originalEvent(tx,r,type){const row=version(tx,r),head=tx.get(r.family,r.id);need(row.revision===1&&head&&Number.isSafeInteger(head.created_seq),'FRONTIER_ARCHIVE_PROVENANCE');const e=tx.events({after:head.created_seq-1,limit:1}).items[0];need(e?.seq===head.created_seq&&e.type===type&&e.principal_id==='founder'&&e.payload.changes.some(c=>same({family:c.family,id:c.id,revision:c.revision,sha256:c.sha256},r)),'FRONTIER_ARCHIVE_PROVENANCE');return {row,event:e};}
function originalOrigin(tx,connection){
 const head=tx.get('control','origin');need(head?.value.protocol==='peer-origin-quarantine-v1','FRONTIER_ARCHIVE_ORIGIN');const e=tx.events({after:head.created_seq-1,limit:1}).items[0],change=e?.payload.changes.find(c=>c.family==='control'&&c.id==='origin'&&c.revision===1);need(e?.seq===head.created_seq&&e.type==='origin.quarantined'&&e.principal_id==='founder'&&change,'FRONTIER_ARCHIVE_PROVENANCE');
 const reference={family:'control',id:'origin',revision:1,sha256:change.sha256},row=version(tx,reference);need(row.value.protocol==='peer-origin-quarantine-v1'&&row.value.id===head.value.id&&(!row.value.company_id||row.value.company_id===connection.company_id),'FRONTIER_ARCHIVE_ORIGIN');
 need(same(head.value.manifest??null,row.value.manifest??null)&&['current_cut_sha256','current_sources_sha256','baseline_cut_sha256'].every(k=>(head.value[k]??null)===(row.value[k]??null)),'FRONTIER_ARCHIVE_MANIFEST_CHANGED');return {head,row,reference};
}
function declarations(tx,original){
 const o=original.row.value,manifest=o.manifest?.archive;if(!manifest)return {typed:false,pages:[],items:[],total_bytes:0};
 need(manifest&&Object.keys(manifest).sort().join(',')==='count,pages,sha256'&&Array.isArray(manifest.pages)&&manifest.pages.length<=INPUT_ARCHIVE_LIMITS.pages&&Number.isSafeInteger(manifest.count)&&manifest.count>=0&&manifest.count<=INPUT_ARCHIVE_LIMITS.descriptors&&/^[a-f0-9]{64}$/.test(manifest.sha256??''),'FRONTIER_ARCHIVE_MANIFEST_CHANGED');
 const items=[],pages=[],seen=new Set();let total_bytes=0,descriptor_bytes=0;
 for(const [position,r]of manifest.pages.entries()){
  need(!seen.has(canonical(r)),'FRONTIER_ARCHIVE_MANIFEST_CHANGED');seen.add(canonical(r));const {row,event}=originalEvent(tx,r,'origin.quarantined'),page=row.value,head=tx.get(r.family,r.id);need(head&&same(ref(r.family,head),r)&&event.seq===original.head.created_seq&&r.family==='work_items'&&page.kind==='origin_archive_page'&&page.protocol==='peer-origin-archive-page-v1'&&page.origin_id===o.id&&page.section==='archive'&&page.index===position&&Array.isArray(page.items),'FRONTIER_ARCHIVE_MANIFEST_CHANGED');pages.push(r);
  for(const [index,descriptor]of page.items.entries()){
   need(descriptor&&Object.keys(descriptor).sort().join(',')==='characters,sha256,utf8_bytes'&&/^[a-f0-9]{64}$/.test(descriptor.sha256??'')&&Number.isSafeInteger(descriptor.characters)&&descriptor.characters>=0&&Number.isSafeInteger(descriptor.utf8_bytes)&&descriptor.utf8_bytes>=descriptor.characters&&descriptor.utf8_bytes<=INPUT_ARCHIVE_LIMITS.body_bytes,'FRONTIER_ARCHIVE_DESCRIPTOR');
   total_bytes+=descriptor.utf8_bytes;descriptor_bytes+=Buffer.byteLength(canonical(descriptor));need(items.length<INPUT_ARCHIVE_LIMITS.descriptors&&total_bytes<=INPUT_ARCHIVE_LIMITS.total_bytes&&descriptor_bytes<=INPUT_ARCHIVE_LIMITS.descriptor_bytes,'FRONTIER_ARCHIVE_CAPACITY');items.push({archive_page:r,index,descriptor});
  }
 }
 need(items.length===manifest.count&&peerDigest(items.map(v=>v.descriptor))===manifest.sha256,'FRONTIER_ARCHIVE_MANIFEST_CHANGED');return {typed:true,pages,items,total_bytes};
}
function materialize(tx,reference){
 need(reference.origin_ref?.family==='control'&&reference.origin_ref.id==='origin'&&reference.origin_ref.revision===1,'FRONTIER_ARCHIVE_PROVENANCE');const {row}=originalEvent(tx,reference.origin_ref,'origin.quarantined'),o=row.value;need(o.protocol==='peer-origin-quarantine-v1'&&reference.source_cut_sha256===(o.current_cut_sha256??null),'FRONTIER_ARCHIVE_ORIGIN');
 if(reference.state==='undeclared'){need(!o.manifest?.archive,'FRONTIER_ARCHIVE_MANIFEST_CHANGED');return {state:'undeclared',text:canonical({protocol:INPUT_ARCHIVE,status:'unknown',scope:'*',origin_ref:reference.origin_ref,original_manifest_available:false,not_complete_history:true,grants_new_acceptance:false,meaning:'No supported complete original archive declaration exists; original history and applicability remain UNKNOWN.'})};}
 const {row:page}=originalEvent(tx,reference.archive_page,'origin.quarantined'),descriptor=page.value.items?.[reference.index];need(page.value.kind==='origin_archive_page'&&page.value.origin_id===o.id&&page.value.section==='archive'&&o.manifest?.archive?.pages.some(r=>same(r,reference.archive_page))&&same(descriptor,reference.descriptor),'FRONTIER_ARCHIVE_PROVENANCE');
 let state,raw;if(typeof tx.resolveLegacyText!=='function')state='unavailable';else{raw=tx.resolveLegacyText({sha256:descriptor.sha256});state=raw===null?'missing':'raw';}
 if(state==='raw'){
  need(typeof raw==='string'&&Buffer.from(raw,'utf8').toString('utf8')===raw&&hash(raw)===descriptor.sha256&&raw.length===descriptor.characters&&Buffer.byteLength(raw)===descriptor.utf8_bytes,'FRONTIER_ARCHIVE_CHANGED');
  try{JSON.parse(raw);}catch{state='opaque';}
  if(state==='raw')return {state,text:raw};
 }
 return {state,text:canonical({protocol:INPUT_ARCHIVE,status:'unknown',scope:'*',origin_ref:reference.origin_ref,archive_page:reference.archive_page,index:reference.index,descriptor,original_body_available:state==='opaque',...(state==='opaque'?{encoding:'utf8',content:raw}:{}),availability:state,not_complete_history:true,grants_new_acceptance:false,meaning:state==='opaque'?'Complete original UTF8 text is retained, but its unsupported encoding/meaning and original completeness remain UNKNOWN.':'This declared original body is unavailable; no empty-body, absent-history or interpretation claim is made.'})};
}
function source(tx,reference){const body=materialize(tx,reference),r={...reference,state:body.state};return {id:'archive:'+peerDigest(reference),role:'archive',reference:r,text:body.text,sha256:hash(body.text),characters:body.text.length,utf8_bytes:Buffer.byteLength(body.text),required_original:true};}

// Every declaration is validated and budgeted BEFORE any original body fetch.
// Each page/index is a distinct physical source occurrence, even for equal SHA.
export function capturePeerInputOriginArchiveFrom(tx,{connection}){
 const original=originalOrigin(tx,connection);if(original.row.value.manifest?.archive)need(original.row.value.company_id===connection.company_id&&/^[a-f0-9]{64}$/.test(original.row.value.current_cut_sha256??''),'FRONTIER_ARCHIVE_ORIGIN');const vector=declarations(tx,original),base={protocol:INPUT_ARCHIVE,origin_ref:original.reference,source_cut_sha256:original.row.value.current_cut_sha256??null};
 const sources=vector.typed?vector.items.map(item=>source(tx,{...base,...item})): [source(tx,{...base,state:'undeclared'})];
 return {sources,pages:vector.pages,vector:{protocol:INPUT_ARCHIVE,origin_ref:original.reference,typed:vector.typed,descriptor_count:vector.items.length,declared_utf8_bytes:vector.total_bytes,descriptor_sha256:peerDigest(vector.items),materialized_occurrences:sources.filter(s=>['raw','opaque'].includes(s.reference.state)).length,missing_occurrences:sources.filter(s=>!['raw','opaque'].includes(s.reference.state)).length,grants_new_acceptance:false,complete_original_history:false}};
}
export function readPeerInputOriginArchiveBodyFrom(tx,reference){
 need(reference?.protocol===INPUT_ARCHIVE&&Object.keys(reference).sort().join(',')===(reference.state==='undeclared'?'origin_ref,protocol,source_cut_sha256,state':'archive_page,descriptor,index,origin_ref,protocol,source_cut_sha256,state'),'FRONTIER_ARCHIVE_PROVENANCE');const result=materialize(tx,reference);need(result.state===reference.state,'FRONTIER_ARCHIVE_AVAILABILITY_CHANGED');return result.text;
}
