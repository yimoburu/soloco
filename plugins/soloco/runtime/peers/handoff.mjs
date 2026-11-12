// Trusted internal storage helpers. The caller supplies an original bound
// principal and enforces authorization, semantic lineage and the commit fence.
// These records never authenticate an actor or authorize execution/publication.
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {canonical,peerDigest} from './ledger.mjs';

const SEMANTIC=new Set(['tasks','homes','proposals','reviews','conflicts','notices','messages','deliveries']);
const GOVERNING=new Set([...SEMANTIC,'control','principals','grants']);
const SEND_KEYS=['operation_id','to_principal_id','scope','subject_ref','governing_refs','evidence_refs','limitations','source_instruction','grant_id','grant_generation'];
const DECIDE_KEYS=['operation_id','handoff_ref','reason','source_instruction','grant_id','grant_generation'];
const HANDOFF_KEYS=['kind','status','principal_id','scope','operation_id','sender','receiver','subject_ref','governing_refs','evidence_refs','limitations','source_instruction','authority_control','created_at'];
const DECISION_KEYS=['kind','status','principal_id','scope','operation_id','handoff_ref','sender','receiver','subject_ref','governing_refs','evidence_refs','reason','source_instruction','authority_control','created_at'];
const localFailures=new WeakSet();
// Ephemeral routing data only. A source-process restart deliberately requires
// a fresh first page; no persisted cursor key or execution authority is minted.
const cursorKey=randomBytes(32),CURSOR_PROTOCOL='peer-receiver-intake-cursor-v1';
const copy=value=>JSON.parse(canonical(value));
const same=(a,b)=>canonical(a)===canonical(b);
const reference=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
function fail(code,message){const error=Object.assign(Error(message),{code});localFailures.add(error);throw error;}
function object(value,keys,label,exact=false){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key))||exact&&Object.keys(value).length!==keys.length)fail('INVALID_INPUT',`Closed ${label} object required`);
  return value;
}
function text(value,label,max=2000){
  if(typeof value!=='string'||!value.trim()||value.length>max||value.includes('\0')||/[\ud800-\udfff]/u.test(value))fail('INVALID_INPUT',`Bounded scalar ${label} required`);
  return value;
}
function exactRef(value,families,label='source reference'){
  object(value,['family','id','revision','sha256'],label,true);
  if(!families.has(value.family)||!Number.isSafeInteger(value.revision)||value.revision<1||!/^[a-f0-9]{64}$/.test(value.sha256??''))fail('SOURCE_INVALID',`Exact supported ${label} required`);
  text(value.id,`${label} identity`,2000);return copy(value);
}
const principalRef=value=>exactRef(value,new Set(['principals']),'principal reference');
const handoffRef=value=>exactRef(value,new Set(['work_items']),'handoff reference');
function refs(values,families,label){
  if(!Array.isArray(values)||values.length>100)fail('SOURCE_INVALID',`At most 100 ${label} required`);
  const result=values.map(value=>exactRef(value,families,label));
  if(new Set(result.map(canonical)).size!==result.length)fail('SOURCE_INVALID',`Duplicate ${label}`);
  return result;
}
function optionalGrant(args){
  if(Object.hasOwn(args,'grant_id'))text(args.grant_id,'grant identity',200);
  if(Object.hasOwn(args,'grant_generation')&&(!Number.isSafeInteger(args.grant_generation)||args.grant_generation<1))fail('INVALID_INPUT','Positive grant generation required');
}
function current(tx,exact){
  const row=tx.get(exact.family,exact.id);
  if(!row||!same(reference(exact.family,row),exact))fail('SOURCE_CHANGED',`Exact source changed: ${exact.family}/${exact.id}`);
  return row;
}
function history(tx,exact){
  const row=tx.getVersion(exact);
  if(!row||row.family!==exact.family||!same(reference(exact.family,row),exact)||peerDigest(row.value)!==exact.sha256)fail('HANDOFF_PROVENANCE','Exact immutable handoff support is unavailable');
  return row;
}
function actualPrincipal(tx,supplied){
  const row=tx.get('principals',text(supplied?.id,'actual principal',200));
  if(!row||row.value.status!=='active')fail('PRINCIPAL_INACTIVE','Actual active principal required');
  if(!same(reference('principals',row),reference('principals',supplied))||!same(row.value,supplied.value))fail('PRINCIPAL_CHANGED','Actual principal incarnation changed');
  return row;
}
function actualControl(tx,supplied=null){
  const row=tx.get('control','company');
  if(!row||supplied&&(!same(reference('control',row),reference('control',supplied))||!same(row.value,supplied.value)))fail('SOURCE_CHANGED','Actual company control changed');
  return row;
}
function timestamp(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))fail('HANDOFF_INVALID','Handoff timestamp is invalid');}
const handoffId=(sender,operation)=>peerDigest(['peer-handoff-v1',sender,operation]);
const decisionId=(handoff,receiver)=>peerDigest(['peer-handoff-disposition-v1',handoff,receiver]);

// A kind-shaped DATA row is insufficient. Require its exact immutable version,
// real creation event and the matching source command's complete original result.
// Do not catch provider failures here: Error and AggregateError identity matters.
function origin(tx,row,action,producer){
  if(!row||row.revision!==1||!Number.isSafeInteger(row.created_seq)||row.created_seq<1||typeof row.value?.operation_id!=='string')fail('HANDOFF_PROVENANCE','Original immutable handoff producer required');
  const exact=reference('work_items',row),original=history(tx,exact);
  if(!same(original.value,row.value))fail('HANDOFF_PROVENANCE','Original handoff value changed');
  const event=tx.events({after:row.created_seq-1,limit:1}).items[0],changes=event?.payload?.changes;
  const produced=changes?.filter(change=>change.family==='work_items'&&change.id===row.id&&change.revision===1&&change.sha256===row.sha256),commands=changes?.filter(change=>change.family==='commands');
  if(event?.seq!==row.created_seq||event.type!==action||event.principal_id!==producer||produced?.length!==1||commands?.length!==1||commands[0].revision!==1)fail('HANDOFF_PROVENANCE','Matching source handoff event required');
  const commandRef=exactRef(commands[0]&&{family:'commands',id:commands[0].id,revision:commands[0].revision,sha256:commands[0].sha256},new Set(['commands']),'source command');
  const command=history(tx,commandRef),value=command.value;
  if(command.id!==peerDigest(['peer-command-v1',producer,row.value.operation_id])||value.principal_id!==producer||value.operation_id!==row.value.operation_id||value.action!==action||!/^[a-f0-9]{64}$/.test(value.request_sha256??'')||!same(value.result,row))fail('HANDOFF_PROVENANCE','Exact source command result required');
  const head=tx.get('commands',command.id);
  if(!head||!same(reference('commands',head),commandRef)||!same(head.value,value))fail('HANDOFF_PROVENANCE','Immutable source command head changed');
}
function handoffRecord(tx,row){
  origin(tx,row,'handoff/send',row?.value?.sender?.id);
  const value=row.value;
  try{
    object(value,HANDOFF_KEYS,'handoff record',true);
    if(value.kind!=='peer_handoff_v1'||value.status!=='pending')fail('HANDOFF_INVALID','Typed pending handoff required');
    text(value.operation_id,'operation identity',160);text(value.scope,'scope',160);
    const sender=principalRef(value.sender),receiver=principalRef(value.receiver);
    if(value.principal_id!==receiver.id||sender.id===receiver.id||row.id!==handoffId(sender.id,value.operation_id))fail('HANDOFF_INVALID','Handoff recipient or identity changed');
    exactRef(value.subject_ref,SEMANTIC);refs(value.governing_refs,GOVERNING,'governing references');refs(value.evidence_refs,SEMANTIC,'evidence references');
    text(value.limitations,'limitations',12000);text(value.source_instruction,'source instruction',4000);timestamp(value.created_at);
    history(tx,sender);history(tx,receiver);history(tx,exactRef(value.authority_control,new Set(['control']),'source control'));
  }catch(error){
    if(localFailures.has(error)&&['INVALID_INPUT','SOURCE_INVALID'].includes(error.code))fail('HANDOFF_INVALID','Typed handoff record is malformed');
    throw error;
  }
  return value;
}
function decisionRecord(tx,row,handoff){
  const value=row?.value,action=value?.status==='accepted'?'handoff/accept':value?.status==='rejected'?'handoff/reject':null;
  origin(tx,row,action,value?.receiver?.id);
  try{
    object(value,DECISION_KEYS,'handoff disposition',true);
    const expected=handoff.value;
    if(value.kind!=='peer_handoff_disposition_v1'||!action||row.id!==decisionId(reference('work_items',handoff),expected.receiver)||value.principal_id!==expected.receiver.id||value.scope!==expected.scope||!same(value.handoff_ref,reference('work_items',handoff))||!same(value.sender,expected.sender)||!same(value.receiver,expected.receiver)||!same(value.subject_ref,expected.subject_ref)||!same(value.governing_refs,expected.governing_refs)||!same(value.evidence_refs,expected.evidence_refs))fail('HANDOFF_INVALID','Handoff disposition bindings changed');
    text(value.operation_id,'operation identity',160);text(value.reason,'receiver reason',4000);text(value.source_instruction,'source instruction',4000);timestamp(value.created_at);
    history(tx,exactRef(value.authority_control,new Set(['control']),'source control'));
  }catch(error){
    if(localFailures.has(error)&&['INVALID_INPUT','SOURCE_INVALID'].includes(error.code))fail('HANDOFF_INVALID','Typed handoff disposition is malformed');
    throw error;
  }
  return value;
}
function applicable(tx,value){
  for(const exact of [value.subject_ref,...value.governing_refs,...value.evidence_refs])current(tx,exact);
}

export function sendHandoff(tx,principal,control,args){
  object(args,SEND_KEYS,'handoff request');optionalGrant(args);
  const operation=text(args.operation_id,'operation_id',160),sender=actualPrincipal(tx,principal),company=actualControl(tx,control);
  const receiver=tx.get('principals',text(args.to_principal_id,'receiver principal',200));
  if(!receiver||receiver.value.status!=='active')fail('PRINCIPAL_INACTIVE','Intended receiver must be active');
  if(sender.id===receiver.id||sender.value.native_id&&sender.value.native_id===receiver.value.native_id)fail('HANDOFF_SELF','A handoff requires a distinct receiver');
  const value={kind:'peer_handoff_v1',status:'pending',principal_id:receiver.id,scope:text(args.scope,'scope',160),operation_id:operation,
    sender:reference('principals',sender),receiver:reference('principals',receiver),subject_ref:exactRef(args.subject_ref,SEMANTIC),
    governing_refs:refs(args.governing_refs,GOVERNING,'governing references'),evidence_refs:refs(args.evidence_refs,SEMANTIC,'evidence references'),
    limitations:text(args.limitations,'limitations',12000),source_instruction:text(args.source_instruction,'source instruction',4000),
    authority_control:reference('control',company),created_at:new Date().toISOString()};
  applicable(tx,value);
  const id=handoffId(sender.id,operation);if(tx.get('work_items',id))fail('HANDOFF_EXISTS','Handoff identity already exists');
  return tx.put('work_items',id,value,0);
}

export function decideHandoff(tx,principal,action,args){
  object(args,DECIDE_KEYS,'receiver disposition');optionalGrant(args);
  if(!['handoff/accept','handoff/reject'].includes(action))fail('INVALID_INPUT','Explicit accept or reject action required');
  const operation=text(args.operation_id,'operation_id',160),receiver=actualPrincipal(tx,principal),exact=handoffRef(args.handoff_ref),handoff=current(tx,exact),value=handoffRecord(tx,handoff);
  if(receiver.id!==value.receiver.id)fail('HANDOFF_RECEIVER','Only the intended actual receiver may decide');
  if(!same(reference('principals',receiver),value.receiver))fail('RECEIVER_CHANGED','Original intended receiver incarnation changed');
  applicable(tx,value);
  const id=decisionId(exact,value.receiver),prior=tx.get('work_items',id);
  if(prior){decisionRecord(tx,prior,handoff);fail('HANDOFF_DECIDED','Handoff already has an immutable receiver decision');}
  const company=actualControl(tx),decision={kind:'peer_handoff_disposition_v1',status:action==='handoff/accept'?'accepted':'rejected',principal_id:receiver.id,scope:value.scope,operation_id:operation,
    handoff_ref:exact,sender:copy(value.sender),receiver:reference('principals',receiver),subject_ref:copy(value.subject_ref),governing_refs:copy(value.governing_refs),evidence_refs:copy(value.evidence_refs),
    reason:text(args.reason,'receiver reason',4000),source_instruction:text(args.source_instruction,'source instruction',4000),authority_control:reference('control',company),created_at:new Date().toISOString()};
  return tx.put('work_items',id,decision,0);
}

function descriptor(family,row,intake_kind,state,reason=null){
  const body=canonical(row.value);
  return {...reference(family,row),part:'value',available:true,content_sha256:peerDigest(row.value),total_characters:body.length,utf8_bytes:Buffer.byteLength(body),read:{tool:'company_peers',action:'read'},intake_kind,state,reason};
}
const information=(code,message)=>({code,message});
function cursorFailure(){fail('INTAKE_CURSOR_INVALID','Stale or mismatched peer cursor; receiver intake must restart from a fresh first page');}
function cursorSource(value){
  if(!value)cursorFailure();
  object(value,['company_id','root_sha256'],'source cursor namespace',true);
  text(value.company_id,'cursor company',2000);
  if(!/^[a-f0-9]{64}$/.test(value.root_sha256??''))cursorFailure();
  return copy(value);
}
function continuation(cursor,binding){
  if(typeof cursor!=='string'||cursor.length>16000)cursorFailure();
  const parts=cursor.split('.');
  if(parts.length!==2||parts.some(part=>!part||!/^[A-Za-z0-9_-]+$/.test(part)))cursorFailure();
  const bytes=Buffer.from(parts[0],'base64url'),signature=Buffer.from(parts[1],'base64url');
  if(bytes.toString('base64url')!==parts[0]||signature.toString('base64url')!==parts[1]||signature.length!==32)cursorFailure();
  const expected=createHmac('sha256',cursorKey).update(bytes).digest();
  if(!timingSafeEqual(signature,expected))cursorFailure();
  let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{cursorFailure();}
  if(!value||Object.keys(value).sort().join(',')!=='binding,inner,protocol'||value.protocol!==CURSOR_PROTOCOL||canonical(value)!==bytes.toString('utf8')||!same(value.binding,binding)||typeof value.inner!=='string'||!value.inner||value.inner.length>16000)cursorFailure();
  return value.inner;
}
function nextContinuation(inner,binding){
  const bytes=Buffer.from(canonical({protocol:CURSOR_PROTOCOL,binding,inner}));
  const cursor=bytes.toString('base64url')+'.'+createHmac('sha256',cursorKey).update(bytes).digest('base64url');
  if(cursor.length>16000)cursorFailure();
  return cursor;
}
function pendingHandoff(tx,row,viewer,isFounder){
  const raw=row.value;
  if(raw.kind!=='peer_handoff_v1')return null;
  const own=raw.principal_id===viewer.id||raw.receiver?.id===viewer.id;
  if(!own){
    if(!isFounder)return null;
    const receiver=history(tx,principalRef(raw.receiver));
    if(receiver.value.kind!=='founder')return null;
  }
  try{
    const value=handoffRecord(tx,row),decision=tx.get('work_items',decisionId(reference('work_items',row),value.receiver));
    // Receipt provenance is checked before excluding a candidate, even when its
    // subject or receiver has since changed. Historical decisions stay facts.
    if(decision){decisionRecord(tx,decision,row);return null;}
    if(viewer.id!==value.receiver.id||!same(reference('principals',viewer),value.receiver))fail('RECEIVER_CHANGED','Original receiver obligation remains held; no implicit succession');
    applicable(tx,value);
    return descriptor('work_items',row,'handoff','pending');
  }catch(error){
    // Only failures produced by this module become visible semantic holds.
    // A provider Error with the same code, or an AggregateError, is untouched.
    if(!localFailures.has(error))throw error;
    return descriptor('work_items',row,'handoff','held',information(error.code,error.message));
  }
}

export function pendingHandoffs(tx,principal,control,args={},source=null){
  object(args,['family','scope','limit','cursor'],'pending intake request');
  const family=args.family??'work_items',limit=args.limit??20;
  if(!['work_items','tasks','proposals','messages'].includes(family)||!Number.isSafeInteger(limit)||limit<1||limit>50)fail('INVALID_INPUT','Supported intake family and limit 1..50 required');
  const viewer=actualPrincipal(tx,principal),company=actualControl(tx,control),isFounder=viewer.id===company.value.founder_principal_id&&viewer.value.kind==='founder';
  const selected={limit,status:family==='tasks'?'returned':family==='proposals'?'proposed':'pending',...(args.scope===undefined?{}:{scope:text(args.scope,'scope',160)})};
  if(!isFounder&&['work_items','proposals'].includes(family))selected.principal_id=viewer.id;
  const namespace=source===null?null:cursorSource(source),binding={source:namespace,receiver:reference('principals',viewer),control:reference('control',company),selector:{family,scope:args.scope??null,view_mode:isFounder?'founder':'receiver'}};
  if(args.cursor!==undefined){if(!namespace)cursorFailure();selected.cursor=continuation(args.cursor,binding);}
  const page=tx.list(family,selected);
  if(!page||!Array.isArray(page.items)||page.items.length>limit||!Number.isSafeInteger(page.total)||page.total<page.items.length||page.total>10000||typeof page.complete!=='boolean'||page.complete&&page.next_cursor!==null||!page.complete&&(!page.items.length||typeof page.next_cursor!=='string'||page.next_cursor===selected.cursor))fail('LOOKUP_INCOMPLETE','Complete bounded candidate page required');
  const items=[];
  for(const row of page.items){
    let item=null;const value=row.value;
    if(family==='work_items')item=pendingHandoff(tx,row,viewer,isFounder);
    if(family==='tasks'&&(value.owner_principal_id===viewer.id||value.definition?.assignment?.operator?.id===viewer.id))item=descriptor(family,row,'returned_work','returned',information('INFORMATIONAL_RETURN','Returned work is a candidate; explicit receiver acceptance is separate'));
    if(family==='messages'&&value.to_principal_id===viewer.id)item=descriptor(family,row,'message','informational',information('INFORMATIONAL_MESSAGE','An incoming message transfers no authority and is not receiver acceptance'));
    if(family==='proposals'){
      const home=tx.get('homes',text(value.home_id,'proposal home',200)),published=home?.value.proposal&&same(home.value.proposal,reference('proposals',row));
      if(!published){
        const currentBase=value.base?Boolean(home&&same(value.base,reference('homes',home))):!home;
        item=descriptor(family,row,'proposal_candidate',currentBase?'proposed':'held',information(currentBase?'PROPOSAL_CANDIDATE':'HOME_CHANGED',currentBase?'Proposal candidate; publication and receiver acceptance remain separate':'Proposal base differs from the current logical home; this may be superseded historical work'));
      }
    }
    if(item)items.push(item);
  }
  if(!page.complete&&!namespace)cursorFailure();
  return {items,scanned_count:page.items.length,total_candidates:page.total,complete:page.complete,next_cursor:page.complete?null:nextContinuation(page.next_cursor,binding)};
}
