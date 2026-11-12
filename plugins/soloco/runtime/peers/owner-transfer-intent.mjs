// Fixed SOURCE provenance readers for public owner transfer. These declarations
// are attributed decisions of the actual current CoS, not HOST-attested human
// approval. Public callers cannot provide a producer, validator or readiness flag.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {canonical,peerDigest} from './ledger.mjs';

export const OWNER_TRANSFER_DECISION='peer-owner-transfer-decision-v1';
export const OWNER_TRANSFER_INTENT='peer-owner-transfer-intent-v1';
export const OWNER_TRANSFER_BINDING='peer-owner-public-transfer-binding-v1';
export const OWNER_TRANSFER_AUTHORITY='owning-cos-recorded-founder-instruction';
export const OWNER_TRANSFER_HUMAN_AUTHENTICITY='not mechanically established';
const fail=code=>{throw Object.assign(Error(code),{code});};
const need=(yes,code)=>{if(!yes)fail(code);};
const copy=v=>JSON.parse(canonical(v));
const same=(a,b)=>canonical(a)===canonical(b);
const text=(v,max=200)=>typeof v==='string'&&v.trim()&&v.length<=max&&!v.includes('\0')&&!/[\ud800-\udfff]/u.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const rawDigest=v=>createHash('sha256').update(v,'utf8').digest('hex');
const reference=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
function object(v,required,optional=[],code='OWNER_TRANSFER_INPUT'){
 need(v&&typeof v==='object'&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Object.prototype,code);
 const descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(descriptors);
 need(required.every(k=>keys.includes(k))&&keys.every(k=>typeof k==='string'&&[...required,...optional].includes(k)&&descriptors[k].enumerable&&Object.hasOwn(descriptors[k],'value')),code);
 return copy(v);
}
function exactRef(r,family='work_items'){
 const value=object(r,['family','id','revision','sha256']);
 need(value.family===family&&text(value.id,2000)&&Number.isSafeInteger(value.revision)&&value.revision>0&&hash(value.sha256),'OWNER_TRANSFER_REFERENCE');return value;
}
export function ownerTransferActor(value){
 const actor=object(value,['host','session_id','native_id']);need(['codex','claude'].includes(actor.host)&&text(actor.session_id)&&text(actor.native_id,300),'OWNER_TRANSFER_TARGET');return actor;
}
export function ownerTransferPrimaryMessage(value){
 const message=object(value,['host','chat_id','turn_id','message_id','content_sha256','quote'],[],'OWNER_TRANSFER_PRIMARY_MESSAGE_REQUIRED');
 need(['codex','claude'].includes(message.host)&&['chat_id','turn_id','message_id'].every(k=>text(message[k],300)&&!/(?:^file:|^artifact:|^@public:|[\/\\])/.test(message[k]))&&text(message.quote,20000)&&Buffer.byteLength(message.quote)<=20000&&hash(message.content_sha256)&&rawDigest(message.quote)===message.content_sha256,'OWNER_TRANSFER_PRIMARY_MESSAGE_REQUIRED');
 return message;
}
export function ownerTransferDecisionRequest(value){
 const v=object(value,['operation_id','epoch','source_instruction','target','reviewer_principal_id','review_grant_id','review_grant_generation','expires_at','max_review_calls','primary_human_message','basis']);
 need(v.basis==='explicit','OWNER_TRANSFER_DECISION_EXPLICIT_REQUIRED');
 need(text(v.operation_id,160)&&text(v.source_instruction,4000)&&Number.isSafeInteger(v.epoch)&&v.epoch>0&&text(v.reviewer_principal_id)&&text(v.review_grant_id)&&Number.isSafeInteger(v.review_grant_generation)&&v.review_grant_generation>0&&Number.isSafeInteger(v.max_review_calls)&&v.max_review_calls>0,'OWNER_TRANSFER_INPUT');
 need(typeof v.expires_at==='string'&&Number.isSafeInteger(Date.parse(v.expires_at))&&new Date(Date.parse(v.expires_at)).toISOString()===v.expires_at,'OWNER_TRANSFER_EXPIRED');
 v.target=ownerTransferActor(v.target);v.primary_human_message=ownerTransferPrimaryMessage(v.primary_human_message);return v;
}
export function ownerTransferDecisionId(connection,message){
 // One primary human message can supply one recorded transfer scope, not a
 // fresh attempt merely by changing an operation ID, quote, target or allowance.
 const {host,chat_id,turn_id,message_id}=ownerTransferPrimaryMessage(message);
 return 'owner-transfer-decision:'+peerDigest([connection,{host,chat_id,turn_id,message_id}]);
}
export const ownerTransferIntentId=(connection,decisionRef)=>'owner-transfer-intent:'+peerDigest([connection,exactRef(decisionRef)]);
function exact(tx,r){
 const value=exactRef(r),row=tx.getVersion(value);
 need(row&&row.id===value.id&&row.revision===value.revision&&row.sha256===value.sha256&&peerDigest(row.value)===value.sha256,'OWNER_TRANSFER_SOURCE_CHANGED');return row;
}
function originalProduction(tx,connection,row,action,request,resultKey){
 const current=tx.get('work_items',row.id),seq=current?.created_seq;
 need(Number.isSafeInteger(seq)&&seq>0,'OWNER_TRANSFER_PRODUCER_REQUIRED');
 const page=tx.events({after:seq-1,limit:1}),event=page?.items?.[0];
 need(event?.seq===seq&&event.type==='owner/'+action&&event.principal_id===row.value.issuer.session_id&&Array.isArray(event.payload?.changes),'OWNER_TRANSFER_PRODUCER_REQUIRED');
 const changes=event.payload.changes.filter(c=>c.family==='work_items'&&c.id===row.id);
 need(changes.length===1&&changes[0].revision===1&&changes[0].sha256===row.sha256&&changes[0].previous_sha256===null,'OWNER_TRANSFER_PRODUCER_REQUIRED');
 const id=peerDigest(['peer-owner-command-v1',connection,row.value.issuer,action,request.operation_id]),commands=event.payload.changes.filter(c=>c.family==='commands'&&c.id===id);
 need(commands.length===1&&commands[0].revision===1&&commands[0].previous_sha256===null,'OWNER_TRANSFER_PRODUCER_REQUIRED');
 const command=tx.getVersion({family:'commands',id,revision:1,sha256:commands[0].sha256}),v=command?.value;
 need(v?.kind==='owner_command'&&v.action===action&&v.principal_id===row.value.issuer.session_id&&v.request_sha256===peerDigest(request)&&same(v.result?.[resultKey],reference('work_items',row)),'OWNER_TRANSFER_PRODUCER_REQUIRED');
 return {event_seq:event.seq,event_sha256:event.sha256};
}
export function loadOriginalPeerOwnerTransferDecision(tx,connection,requested){
 const r=exactRef(requested),row=exact(tx,r),v=row.value;
 need(r.revision===1&&r.id.startsWith('owner-transfer-decision:')&&v?.protocol===OWNER_TRANSFER_DECISION&&v.kind==='owner_transfer_decision','OWNER_TRANSFER_DECISION_SOURCE_UNAVAILABLE');
 object(v,['protocol','kind','status','evidence_only','connection','issuer','issuer_principal_ref','issuer_control_ref','reviewer_principal_ref','review_grant_ref','request','authority_basis_kind','human_producer_authenticity']);
 const request=ownerTransferDecisionRequest(v.request),issuer=ownerTransferActor(v.issuer);
 need(v.status==='recorded'&&v.evidence_only===true&&same(v.connection,connection)&&v.authority_basis_kind===OWNER_TRANSFER_AUTHORITY&&v.human_producer_authenticity===OWNER_TRANSFER_HUMAN_AUTHENTICITY&&r.id===ownerTransferDecisionId(connection,request.primary_human_message),'OWNER_TRANSFER_DECISION_SOURCE_UNAVAILABLE');
 for(const [name,family] of [['issuer_principal_ref','principals'],['issuer_control_ref','control'],['reviewer_principal_ref','principals'],['review_grant_ref','grants']])exactRef(v[name],family);
 need(!same(issuer,request.target)&&issuer.native_id!==request.target.native_id&&v.reviewer_principal_ref.id===request.reviewer_principal_id&&v.review_grant_ref.id===request.review_grant_id,'OWNER_TRANSFER_DECISION_SCOPE');
 const current=tx.get('work_items',r.id);need(current&&same(reference('work_items',current),r),'OWNER_TRANSFER_SOURCE_CHANGED');
 return {row,current,request,issuer,producer:originalProduction(tx,connection,row,'transfer.decision-record',request,'decision_ref')};
}
export function loadOriginalPeerOwnerTransferIntent(tx,connection,requested){
 const r=exactRef(requested),row=exact(tx,r),v=row.value;
 need(r.revision===1&&r.id.startsWith('owner-transfer-intent:')&&v?.protocol===OWNER_TRANSFER_INTENT&&v.kind==='owner_transfer_intent'&&v.status==='issued','OWNER_TRANSFER_INTENT_REQUIRED');
 object(v,['protocol','kind','status','connection','issuer','issuer_principal_ref','issuer_control_ref','decision_ref','decision_producer','reviewer_principal_ref','review_grant_ref','terms','request','authority_basis_kind','human_producer_authenticity']);
 const decision=loadOriginalPeerOwnerTransferDecision(tx,connection,v.decision_ref),request=object(v.request,['operation_id','epoch','source_instruction','decision_ref']);
 need(text(request.operation_id,160)&&text(request.source_instruction,4000)&&request.epoch===decision.request.epoch&&same(request.decision_ref,v.decision_ref)&&same(v.connection,connection)&&same(v.issuer,decision.issuer)&&same(v.issuer_principal_ref,decision.row.value.issuer_principal_ref)&&same(v.issuer_control_ref,decision.row.value.issuer_control_ref)&&same(v.reviewer_principal_ref,decision.row.value.reviewer_principal_ref)&&same(v.review_grant_ref,decision.row.value.review_grant_ref)&&same(v.decision_producer,decision.producer)&&v.authority_basis_kind===OWNER_TRANSFER_AUTHORITY&&v.human_producer_authenticity===OWNER_TRANSFER_HUMAN_AUTHENTICITY&&r.id===ownerTransferIntentId(connection,v.decision_ref),'OWNER_TRANSFER_DECISION_SCOPE');
 const {target,reviewer_principal_id,review_grant_id,review_grant_generation,expires_at,max_review_calls}=decision.request;
 need(same(v.terms,{target,reviewer_principal_id,review_grant_id,review_grant_generation,expires_at,max_review_calls}),'OWNER_TRANSFER_DECISION_SCOPE');
 return {row,current:tx.get('work_items',r.id),decision,producer:originalProduction(tx,connection,row,'transfer.intent-issue',request,'intent_ref')};
}

/** Original consumed intent provenance in the caller's ALREADY OWNING snapshot.
 * No actor override, transaction, write, expiry renewal or capability is issued.
 * A resumed transfer remains historical authority after its original deadline;
 * individual pending operations still enforce that deadline in the owner core. */
export function assertPeerPublicOwnerCustody(tx){
 const control=tx.get('control','company');need(control?.value.protocol==='peer-cos-v1','OWNER_COMPANY_REQUIRED');
 if(!Object.hasOwn(control.value,'owner_handover'))return {controlled:false};
 const h=tx.get('work_items',control.value.owner_handover?.id),v=h?.value,b=v?.public_transfer_binding;
 need(v?.protocol==='peer-owner-handover-v1'&&b?.protocol===OWNER_TRANSFER_BINDING,'OWNER_PUBLIC_TRANSFER_REQUIRED');
 object(b,['protocol','connection','decision_ref','issued_intent_ref','consumed_intent_ref']);
 need(tx.connection&&same(tx.connection,b.connection),'OWNER_TRANSFER_CONNECTION_CHANGED');
 const intent=loadOriginalPeerOwnerTransferIntent(tx,b.connection,b.issued_intent_ref),issued=intent.row.value,consumed=exact(tx,b.consumed_intent_ref),value=consumed.value;
 need(same(b.decision_ref,issued.decision_ref)&&intent.current&&same(reference('work_items',intent.current),b.consumed_intent_ref)&&consumed.id===intent.row.id&&consumed.revision===2&&value.status==='consumed','OWNER_TRANSFER_INTENT_CHANGED');
 const {status,consumption,consumed_event_seq,...rest}=value;
 const {status:originalStatus,...originalRest}=issued;
 need(same(rest,originalRest)&&originalStatus==='issued'&&Number.isSafeInteger(consumed_event_seq)&&consumed_event_seq>intent.producer.event_seq,'OWNER_TRANSFER_INTENT_CHANGED');
 object(consumption,['handover_id','incoming','owner_epoch','begin_request']);
 const request=object(consumption.begin_request,['operation_id','epoch','source_instruction','intent_ref']);
 need(consumption.handover_id===h.id&&same(consumption.incoming,v.incoming)&&same(v.incoming,issued.terms.target)&&consumption.owner_epoch===v.epoch&&v.epoch===request.epoch+1&&request.epoch===issued.request.epoch&&request.operation_id===v.begin_operation_id&&same(request.intent_ref,b.issued_intent_ref)&&same(v.previous_owner,{host:issued.issuer.host,session_id:issued.issuer.session_id,epoch:issued.request.epoch})&&v.expires_at_ms===Date.parse(issued.terms.expires_at)&&v.max_review_calls===issued.terms.max_review_calls&&same(v.reviewer,issued.reviewer_principal_ref)&&same(v.review_grant,issued.review_grant_ref),'OWNER_TRANSFER_INTENT_CHANGED');
 const p=tx.get('principals',control.value.founder_principal_id),owner=p?.value.legacy_owner;
 need(v.company_id===b.connection.company_id&&v.founder_id===issued.issuer_principal_ref.id&&p?.id===v.founder_id&&same(owner,{host:v.incoming.host,session_id:v.incoming.session_id,epoch:v.epoch})&&p.value.native_id===v.incoming.native_id&&p.value.host===v.incoming.host,'OWNER_TRANSFER_INTENT_CHANGED');
 const page=tx.events({after:consumed_event_seq-1,limit:1}),event=page?.items?.[0],changes=event?.payload?.changes;
 need(event?.seq===consumed_event_seq&&event.type==='owner/handover.begin'&&event.principal_id===v.incoming.session_id&&Array.isArray(changes),'OWNER_TRANSFER_PRODUCER_REQUIRED');
 const changed=changes.filter(c=>c.family==='work_items'&&c.id===consumed.id),created=changes.filter(c=>c.family==='work_items'&&c.id===h.id);
 need(changed.length===1&&changed[0].revision===2&&changed[0].sha256===consumed.sha256&&changed[0].previous_sha256===intent.row.sha256&&created.length===1&&created[0].revision===1&&created[0].previous_sha256===null,'OWNER_TRANSFER_PRODUCER_REQUIRED');
 const originalHandover=tx.getVersion({family:'work_items',id:h.id,revision:1,sha256:created[0].sha256});
 need(same(originalHandover?.value.public_transfer_binding,b)&&same(originalHandover.value.incoming,v.incoming),'OWNER_TRANSFER_PRODUCER_REQUIRED');
 const command=tx.getVersion(v.begin_command_ref),commandId=peerDigest(['peer-owner-command-v1',b.connection,v.incoming,'handover.begin',request.operation_id]);
 need(command?.id===commandId&&command.revision===1&&command.value.kind==='owner_command'&&command.value.action==='handover.begin'&&command.value.principal_id===v.incoming.session_id&&command.value.request_sha256===peerDigest(request)&&command.value.result?.handover_id===h.id,'OWNER_TRANSFER_PRODUCER_REQUIRED');
 return {controlled:true,handover_id:h.id,epoch:v.epoch,issued_intent_ref:copy(b.issued_intent_ref),consumed_intent_ref:copy(b.consumed_intent_ref),authority_basis_kind:OWNER_TRANSFER_AUTHORITY,human_producer_authenticity:OWNER_TRANSFER_HUMAN_AUTHENTICITY};
}
