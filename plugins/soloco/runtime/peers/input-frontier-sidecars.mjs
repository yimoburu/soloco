// Exact original-current sidecar capture for SOURCE preparation. The owning
// controller persists these bytes in immutable P1 pages BEFORE a model call;
// cold reads then use those pages, never a changed filename or arbitrary path.
import path from 'node:path';
import {createHash} from 'node:crypto';
import {canonical,peerDigest} from './ledger.mjs';
import {originSidecars,captureOriginSidecarContents} from './origin-plan.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const ref=(family,r)=>({family,id:r.id,revision:r.revision,sha256:r.sha256});
export function capturePeerInputSidecarsFrom(tx,{connection}){
 const origin=tx.get('control','origin'),company=tx.get('control','company');need(origin?.value.protocol==='peer-origin-quarantine-v1'&&canonical(company?.value.origin)===canonical(ref('control',origin)),'FRONTIER_SIDECAR_ORIGIN_REQUIRED');
 const captured=captureOriginSidecarContents(path.join(connection.root,'.company')),inventory=captured.map(({path,bytes,sha256})=>({path,bytes,sha256}));need(canonical(inventory)===canonical(origin.value.sidecar_frontier),'FRONTIER_LATE_SIDECAR_UNRECORDED');if(!inventory.length)return [];
 const event=tx.events({after:origin.created_seq-1,limit:1}).items[0],birth=event?.payload?.changes?.find(r=>r.family==='control'&&r.id===origin.id&&r.revision===1);need(event?.type==='origin.quarantined'&&event.principal_id==='founder'&&birth,'FRONTIER_SIDECAR_ORIGIN_REQUIRED');
 const origin_ref={family:'control',id:birth.id,revision:1,sha256:birth.sha256},original=tx.getVersion(origin_ref);need(original.value.protocol==='peer-origin-quarantine-v1'&&original.value.id===origin.value.id,'FRONTIER_SIDECAR_ORIGIN_REQUIRED');
 const sources=[];for(const item of captured){
  need(typeof item.path==='string'&&!path.isAbsolute(item.path)&&item.path.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!p.includes('\0')),'FRONTIER_SIDECAR_PATH');
  const raw=item.content;need(Object.keys(item).sort().join(',')==='bytes,content,path,sha256'&&Buffer.isBuffer(raw)&&raw.length===item.bytes&&raw.length<=64*1024*1024&&hash(raw)===item.sha256,'FRONTIER_SIDECAR_CHANGED');
  const utf8=raw.toString('utf8'),encoding=Buffer.from(utf8).equals(raw)?'utf8':'base64',body={protocol:'peer-input-frontier-sidecar-input-v1',status:'unknown',scope:'*',path:item.path,source_encoding:encoding,source_bytes:item.bytes,source_bytes_sha256:item.sha256,content:encoding==='utf8'?utf8:raw.toString('base64'),original_meaning:encoding==='utf8'?'Unaccepted source material; independent review must preserve every condition/counterevidence.':'Opaque original material: meaning is UNKNOWN; do not infer safe absence or complete original history.',acceptance:false,closure:'UNKNOWN'},text=canonical(body);
  const inventory_item={path:item.path,bytes:item.bytes,sha256:item.sha256},reference={origin:ref('control',origin),original_origin:origin_ref,original_event:{seq:event.seq,sha256:event.sha256},sidecar:inventory_item};sources.push({id:'sidecar:'+peerDigest([origin.value.id,inventory_item]),role:'sidecar',reference,sha256:hash(text),characters:text.length,utf8_bytes:Buffer.byteLength(text),required_original:true,text});
 }
 need(canonical(originSidecars(path.join(connection.root,'.company')))===canonical(inventory),'FRONTIER_SIDECAR_CHANGED');return sources;
}
