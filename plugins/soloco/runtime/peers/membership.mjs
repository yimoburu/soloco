// Trusted INTERNAL composition, not a broker, model tool or authentication
// provider. Only protected software may construct this factory or retain its
// operator/host handles. Tests use synthetic host observations; those establish
// SQLite/state-machine mechanics, NOT native, OS or human authentication.
// Replacement deliberately retains the SAME principal ID and all its budgets,
// grants/tasks/claims/effects. Model connections must use bindPeerPrincipal;
// managed IDs are rejected by raw execute/inspect without the protected binding.
import {canonical,peerDigest} from './ledger.mjs';
import {membershipPolicyEvidence,membershipPrincipalAliases,bindPeerPrincipal,digest,REVIEW_PREPARATION_BYTES} from './model.mjs';
import {parseReviewOutput,reviewReference,reviewScope} from './review-selection.mjs';

const READ_LIMIT=8192,MAX_ROWS=10000,ROLES=['cos','reviewer','specialist'],PHASE_STATES=['reserved','running','unknown','closed'];
const preparationBudgets=new WeakMap(),providerFailures=new WeakMap();
const copy=v=>JSON.parse(canonical(v));
const same=(a,b)=>canonical(a)===canonical(b);
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const text=(v,label,max=2000)=>{if(typeof v!=='string'||!v.trim()||v.includes('\0')||v.length>max||Buffer.from(v).toString('utf8')!==v)fail('INVALID_INPUT',`${label} requires bounded UTF-8 text`);return v;};
function closed(value,keys){const v=copy(value);if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('INVALID_INPUT','Closed membership request required');return v;}
function retain(tx,family,row){let budget=preparationBudgets.get(tx);if(!budget){budget={keys:new Set(),bytes:0};preparationBudgets.set(tx,budget);}const key=canonical(ref(family,row));if(!budget.keys.has(key)){budget.bytes+=Buffer.byteLength(canonical({family,...row}));if(budget.bytes>REVIEW_PREPARATION_BYTES)fail('CONTEXT_CAPACITY','Complete membership preparation exceeds existing encoded budget');budget.keys.add(key);}return row;}
function collect(tx,family,options={}){let cursor;const rows=[];for(;;){const p=tx.list(family,{...options,limit:16,...(cursor?{cursor}:{})});for(const row of p.items)rows.push(retain(tx,family,row));if(rows.length>MAX_ROWS)fail('LOOKUP_CAPACITY','Complete membership lookup exceeds bound');if(p.complete)return rows;if(!p.next_cursor||p.next_cursor===cursor)fail('LOOKUP_INCOMPLETE','Incomplete membership enumeration');cursor=p.next_cursor;}}
function getExact(tx,r){if(!r||Object.keys(r).sort().join(',')!=='family,id,revision,sha256')fail('SOURCE_CHANGED','Exact private reference required');const row=tx.get(r.family,r.id);if(!row||!same(ref(r.family,row),r))fail('SOURCE_CHANGED','Exact private source changed');return retain(tx,r.family,row);}
function control(tx){const row=tx.get('control','company'),p=row?.value.policy;if(row?.value.protocol!=='peer-cos-v1'||!p||!Number.isSafeInteger(p.worker_cap)||p.worker_cap<1||p.worker_cap>3||!Number.isSafeInteger(p.max_model_calls)||p.max_model_calls<1||p.principal_model_calls!==undefined&&(!Number.isSafeInteger(p.principal_model_calls)||p.principal_model_calls<1))fail('POLICY_INVALID','Existing finite P2 policy required');return row;}
function used(row){const n=row?.value.model_calls??0;if(!Number.isSafeInteger(n)||n<0)fail('POLICY_INVALID','Actual model usage is invalid');return n;}
function expiry(value){if(!Number.isFinite(Date.parse(value))||Date.parse(value)<=Date.now())fail('EXPIRED','Original membership authority expired');}
function processIdentity(p,closed=false){
  const v=copy(p),start=v?.started_at??v?.execution_started_at;
  if(!v||!Number.isSafeInteger(v.pid)||v.pid<1||typeof start!=='string'||!Number.isFinite(Date.parse(start))||v.started_at!==undefined&&v.execution_started_at!==undefined&&v.started_at!==v.execution_started_at||closed&&v.close_observed!==true)fail('PROCESS_INVALID','Unambiguous protected process/start/closure required');
  return {pid:v.pid,started_at:start,...(closed?{close_observed:true}:{})};
}
function sameProcess(before,after){return before.pid===after.pid&&before.started_at===after.started_at;}
function mergeRanges(ranges,start,end){const result=[];for(const r of [...ranges,[start,end]].sort((a,b)=>a[0]-b[0])){const last=result.at(-1);if(last&&r[0]<=last[1])last[1]=Math.max(last[1],r[1]);else result.push([...r]);}if(result.length>128)fail('READ_CAPACITY','Too many disjoint exact read ranges');return result;}
const complete=(reads,size)=>reads.length===1&&reads[0][0]===0&&reads[0][1]===size;
const boundary=(s,n)=>!(n>0&&n<s.length&&/[\uD800-\uDBFF]/.test(s[n-1])&&/[\uDC00-\uDFFF]/.test(s[n]));

// Buffer a single owning P1 transaction. All collection/history/index reads
// finish before its first real put; multiple principal revisions retain the
// explicit revocation-before-activation history within the one atomic commit.
function plan(raw){
  const failures=new Set(),provider={...raw};
  for(const method of ['get','getVersion','list','count','queryCurrentReviews','resolveLegacy'])if(typeof raw[method]==='function')provider[method]=(...args)=>{try{return raw[method](...args);}catch(error){failures.add(error);throw error;}};
  const writes=[],latest=new Map(),reads=new Map(),events=[],finalChecks=[],snapshot=provider.get('control','company');
  if(!snapshot)fail('POLICY_INVALID','Owning company snapshot required');
  const tx={...provider,get:(f,id)=>{const k=canonical([f,id]);if(latest.has(k))return copy(latest.get(k));if(!reads.has(k))reads.set(k,provider.get(f,id));const row=reads.get(k);return row?copy(row):null;},
    put:(f,id,value,expected=0)=>{const old=tx.get(f,id);if((old?.revision??0)!==expected)fail('REVISION_CONFLICT','Membership revision conflict');const v=copy(value),row={id,revision:expected+1,sha256:peerDigest(v),created_seq:old?.created_seq??raw.sequence,value:v};writes.push({family:f,row,expected});latest.set(canonical([f,id]),row);return copy(row);},
    finalCheck:check=>finalChecks.push(check),event:(type,payload)=>events.push({type,payload:copy(payload)})};
  providerFailures.set(tx,failures);
  return {tx,flush(){
    // Actual P1 getVersion checks the owning snapshot BEFORE any modifying put,
    // including a real write made by a trusted late provider callback. Reading
    // a cached row or its historical hash alone is not this terminal fence.
    const probe=provider.getVersion(ref('control',snapshot));if(!probe||probe.sha256!==snapshot.sha256||peerDigest(probe.value)!==snapshot.sha256)fail('SOURCE_CHANGED','Owning membership snapshot changed');
    for(const check of finalChecks)check();for(const {family,row,expected} of writes){const actual=raw.put(family,row.id,row.value,expected);if(actual.revision!==row.revision||actual.sha256!==row.sha256)fail('PLAN_CHANGED','Membership commit differs from checked plan');}for(const e of events)raw.event(e.type,e.payload);
  }};
}

export function createMembershipLifecycle(ledger,options={}){
  const o=closed(options,['operator_principal_id','observer_principal_id']),operatorId=text(o.operator_principal_id??'founder','operator principal',200),observerId=text(o.observer_principal_id??'scheduler','observer principal',200);
  const connection={company_id:ledger.company_id,root_sha256:digest(ledger.root)},connectionHash=peerDigest(connection);
  const auth=(tx,role)=>{const c=control(tx),id=role==='operator'?operatorId:observerId,p=tx.get('principals',id);if(!p||p.value.status!=='active'||role==='operator'&&(p.value.kind!=='founder'||c.value.founder_principal_id!==id)||role==='host'&&p.value.kind!=='scheduler')fail('AUTHENTICATION_REQUIRED','Protected operator/host composition required');return p;};
  const original=ledger.read(tx=>({operator:ref('principals',auth(tx,'operator')),host:ref('principals',auth(tx,'host'))}));
  function connectionGuard(){if(ledger.company_id!==connection.company_id||digest(ledger.root)!==connection.root_sha256)fail('AUTHENTICATION_REQUIRED','Protected company connection changed');}
  function roleAuth(tx,role){const p=auth(tx,role);if(p.value.generation!==ledgerGeneration(original[role],tx))fail('AUTHENTICATION_REQUIRED','Protected operator/host incarnation changed');return p;}
  function ledgerGeneration(r,tx){const row=tx.getVersion(r);if(!row||row.sha256!==r.sha256)fail('AUTHENTICATION_REQUIRED','Protected authority history unavailable');return row.value.generation;}
  function command(channel,action,a,authorize,fn){
    connectionGuard();const input=copy(a),operation=text(input.operation_id,'operation_id',160);
    return ledger.write(`membership/${action}`,channel,raw=>{const p=plan(raw),tx=p.tx,actor=authorize(tx),id=peerDigest(['peer-membership-command-v1',connectionHash,channel,actor.id,actor.value.generation,operation]),request_sha256=peerDigest({action,input}),prior=tx.get('commands',id);
      if(prior){if(prior.value.request_sha256!==request_sha256)fail('REPLAY_MISMATCH','Membership operation already names a different request');p.flush();return copy(prior.value.result);}
      const result=copy(fn(tx,input,actor));tx.put('commands',id,{kind:'membership_command',principal_id:actor.id,operation_id:operation,channel,request_sha256,result},0);p.flush();return result;
    });
  }
  const enrollmentKey=id=>`membership:${text(id,'enrollment id',200)}`;
  const phaseKey=(id,phase)=>{if(!['reconstruction','review'].includes(phase))fail('PHASE_INVALID','Closed membership phase required');return `membership-phase:${text(id,'enrollment id',200)}:${phase}`;};
  function enrollment(tx,id){const e=tx.get('work_items',enrollmentKey(id));if(e?.value.kind!=='membership_enrollment'||e.value.connection_sha256!==connectionHash)fail('ENROLLMENT_MISSING','This protected enrollment is missing');return e;}
  function phase(tx,id,name){const p=tx.get('work_items',phaseKey(id,name));if(p?.value.kind!=='membership_phase'||p.value.membership_id!==id)fail('PHASE_MISSING','Exact admitted membership phase required');return p;}
  function checkedPhase(tx,a){const e=enrollment(tx,a.enrollment_id),p=phase(tx,a.enrollment_id,a.phase);if(p.value.attempt_id!==a.attempt_id)fail('ATTEMPT_CHANGED','Exact membership attempt required');return {e,p};}
  function phaseCurrent(tx,e,p){checkEnrollment(tx,e);if(p.value.phase==='review'){const reviewer=tx.get('principals',p.value.principal_id);if(!reviewer||!same(ref('principals',reviewer),p.value.principal_ref)||!['active','pending'].includes(reviewer.value.status))fail('PRINCIPAL_CHANGED','Private reviewer incarnation changed');}}
  function checkEnrollment(tx,e){
    const v=e.value;if(v.status!=='pending')fail('ENROLLMENT_CLOSED','Enrollment is not pending');expiry(v.expires_at);
    const c=control(tx),operator=auth(tx,'operator'),index=tx.get('work_items',`membership-index:${v.principal_id}`),member=tx.get('principals',v.principal_id);
    if(!same(ref('principals',operator),v.operator_ref)||c.value.paused||peerDigest(c.value)!==v.policy_sha256||c.value.policy_generation!==v.policy_generation||c.value.pause_generation!==v.pause_generation||index?.value.enrollment_id!==v.enrollment_id)fail('AUTHORITY_CHANGED','Membership control/authority changed');
    if(v.base_principal){if(!member||!same(ref('principals',member),v.base_principal)||member.value.status!=='active')fail('PRINCIPAL_CHANGED','Outgoing membership changed');}
    else if(member?.value.status!=='pending'||member.value.generation!==v.generation||member.value.enrollment_id!==v.enrollment_id)fail('PRINCIPAL_CHANGED','Pending membership changed');
    return c;
  }
  function evidence(tx,e){return membershipPolicyEvidence(tx,{principal_id:e.value.principal_id,scope:e.value.scope,input_refs:e.value.input_refs,enrollment_id:e.value.enrollment_id});}
  function context(tx,p){const row=getExact(tx,p.value.context_ref);if(row.value.kind!=='membership_context'||row.value.sha256!==digest(row.value.text))fail('SOURCE_CHANGED','Private reconstruction context changed');return row;}
  const stableEnrollment=e=>{const {used_model_calls,...value}=e.value;return value;};
  function recoveryHistory(tx,e){const result=[],seen=new Set();let next=e.value.recovered_from;while(next){const key=canonical(next);if(seen.has(key)||result.length>=MAX_ROWS)fail('LINEAGE_REQUIRED','Invalid pending recovery history');seen.add(key);const old=getExact(tx,next);if(old.value.kind!=='membership_enrollment'||old.value.status!=='revoked'||old.value.principal_id!==e.value.principal_id||old.value.connection_sha256!==connectionHash)fail('LINEAGE_REQUIRED','Pending recovery authority history changed');const phases=[];for(const name of ['reconstruction','review']){const p=tx.get('work_items',phaseKey(old.value.enrollment_id,name));if(!p)continue;retain(tx,'work_items',p);const c=context(tx,p),r=p.value.result_ref?getExact(tx,p.value.result_ref):null;phases.push({reference:ref('work_items',p),value:p.value,assignment:{context_ref:p.value.context_ref,sha256:c.value.sha256,text:c.value.text},result:r?{reference:ref('work_items',r),value:r.value}:null});}result.push({reference:next,enrollment:old.value,phases});next=old.value.recovered_from;}return result;}
  function fresh(tx,e,c){checkEnrollment(tx,e);if(peerDigest(stableEnrollment(e))!==c.value.enrollment_sha256)fail('AUTHORITY_CHANGED','Original enrollment authority changed');if(peerDigest(recoveryHistory(tx,e))!==c.value.recovery_sha256)fail('CONTEXT_CHANGED','Retained pending recovery evidence changed');if(evidence(tx,e).sha256!==c.value.source_cut_sha256)fail('CONTEXT_CHANGED','Applicable reconstruction meaning changed');expiry(e.value.expires_at);}
  function header(c,p){return {sha256:c.value.sha256,total_characters:c.value.text.length,utf8_bytes:Buffer.byteLength(c.value.text),source_cut_sha256:c.value.source_cut_sha256,subject:c.value.subject??null,context_ref:ref('work_items',c),coverage:copy(p.value.reads)};}
  function aliases(tx,id){const a=membershipPrincipalAliases(tx,id),natives=new Set(a.natives);for(const p of collect(tx,'work_items',{principal_id:id,status:PHASE_STATES}))if(p.value.kind==='membership_phase'&&p.value.native_id)natives.add(p.value.native_id);return {principals:a.principals,natives:[...natives]};}
  function independent(tx,e,reviewer,native,contributors){const a=aliases(tx,e.value.principal_id),r=aliases(tx,reviewer),excluded=new Set([...a.natives,...contributors.natives]);if(reviewer===e.value.principal_id||contributors.principals.includes(reviewer)||excluded.has(native)||r.natives.some(id=>excluded.has(id)))fail('REVIEW_INDEPENDENCE','Interested principal/native cannot qualify reconstruction');}

  const operator=Object.freeze({
    enroll(args){const a=closed(args,['operation_id','enrollment_id','principal_id','role','host','scope','input_refs','expires_at','max_model_calls','expected_generation','source_instruction']);return command('operator','enroll',a,tx=>roleAuth(tx,'operator'),(tx,input,actor)=>{
      const id=text(input.enrollment_id,'enrollment id',200),principalId=text(input.principal_id,'member principal',200),role=input.role??'cos',host=input.host??'codex',c=control(tx),old=tx.get('principals',principalId),index=tx.get('work_items',`membership-index:${principalId}`);
      if(!ROLES.includes(role)||!['codex','claude'].includes(host))fail('ROLE_INVALID','Nonprivileged managed role/host required');
      if(tx.get('work_items',enrollmentKey(id)))fail('ENROLLMENT_EXISTS','Enrollment identity is already spent');
      if(index?.value.status==='pending')fail('ENROLLMENT_EXISTS','Principal already has pending enrollment');
      const recovery=old?.value.status==='pending'&&index?.value.status==='revoked'?enrollment(tx,index.value.enrollment_id):null;
      if(old&&(!ROLES.includes(old.value.kind)||old.value.status!=='active'&&!recovery))fail('PRINCIPAL_CHANGED','Replacement requires the same active or explicitly revoked pending principal');
      if(input.expected_generation!==(old?.value.generation??0))fail('PRINCIPAL_CHANGED','Expected current principal generation required');
      const generation=(old?.value.generation??0)+1;if(!Number.isSafeInteger(generation))fail('PRINCIPAL_CHANGED','Generation overflow');
      expiry(input.expires_at);if(Date.parse(input.expires_at)>Date.now()+7*86400000)fail('EXPIRED','Bounded membership expiry required');
      const scope=reviewScope(input.scope??'*'),refs=input.input_refs??[];if(!Array.isArray(refs)||refs.length>100)fail('SOURCE_INVALID','Bounded exact semantic input references required');for(const r of refs)reviewReference(r);
      const remaining=recovery?recovery.value.max_model_calls-recovery.value.used_model_calls:null,max=input.max_model_calls??(recovery?remaining:2);if(!Number.isSafeInteger(max)||max<1||max>c.value.policy.max_model_calls||recovery&&max>remaining)fail('MODEL_BUDGET','Only finite unspent existing membership allowance is available');
      if(recovery&&(recovery.value.status!=='revoked'||old.value.enrollment_id!==recovery.value.enrollment_id||input.expires_at!==recovery.value.expires_at||role!==recovery.value.role||host!==recovery.value.host||scope!==recovery.value.scope||!same(refs,recovery.value.input_refs)||!same(ref('principals',actor),recovery.value.operator_ref)||peerDigest(c.value)!==recovery.value.policy_sha256||c.value.policy_generation!==recovery.value.policy_generation||c.value.pause_generation!==recovery.value.pause_generation))fail('AUTHORITY_CHANGED','Pending recovery must carry the exact original authority and expiry');
      const value={kind:'membership_enrollment',status:'pending',enrollment_id:id,principal_id:principalId,generation,role,host,scope,input_refs:copy(refs),base_principal:old&&!recovery?ref('principals',old):null,operator_ref:ref('principals',actor),policy_sha256:peerDigest(c.value),policy_generation:c.value.policy_generation,pause_generation:c.value.pause_generation,expires_at:input.expires_at,max_model_calls:max,used_model_calls:0,source_instruction:text(input.source_instruction,'operator source instruction',4000),connection_sha256:connectionHash,...(recovery?{recovered_from:ref('work_items',recovery)}:{})};
      const result=tx.put('work_items',enrollmentKey(id),value,0);tx.put('work_items',`membership-index:${principalId}`,{kind:'membership_index',status:'pending',principal_id:principalId,enrollment_id:id},index?.revision??0);
      if(!old||recovery)tx.put('principals',principalId,{...(old?.value??{}),principal_id:principalId,kind:role,host,status:'pending',generation,native_id:null,enrollment_id:id,...(recovery?{membership_previous:ref('principals',old)}:{})},old?.revision??0);
      tx.finalCheck(()=>expiry(input.expires_at));
      return result;
    });},
    admit(args){const a=closed(args,['operation_id','enrollment_id','phase','reviewer_principal_id']);return command('operator','admit',a,tx=>roleAuth(tx,'operator'),(tx,input)=>{
      const e=enrollment(tx,input.enrollment_id),c=checkEnrollment(tx,e),v=e.value,key=phaseKey(v.enrollment_id,input.phase);if(tx.get('work_items',key))fail('ATTEMPT_CONSUMED','Membership phase already has an attempt');
      let principal=tx.get('principals',v.principal_id),reconstruction=null,reconstructionAssignment=null,reconstructionDelivery=null;
      if(input.phase==='review'){
        const recon=phase(tx,v.enrollment_id,'reconstruction');reconstruction=getExact(tx,recon.value.result_ref);if(reconstruction.value.status!=='returned'||!reconstruction.value.termination_confirmed)fail('RECONSTRUCTION_REQUIRED','Completed observed reconstruction required');
        const producerContext=context(tx,recon);reconstructionAssignment={context_ref:recon.value.context_ref,sha256:producerContext.value.sha256,text:producerContext.value.text};reconstructionDelivery={read_ranges:copy(recon.value.reads),submission_sha256:recon.value.submission?.sha256??null};
        const reviewerId=text(input.reviewer_principal_id,'private reviewer',200);if(reviewerId===v.principal_id)fail('REVIEW_INDEPENDENCE','Reconstruction author cannot review');
        principal=tx.get('principals',reviewerId);if(principal&&!ROLES.includes(principal.value.kind))fail('ROLE_INVALID','Private nonprivileged reviewer required');
        if(principal&&!['active','pending'].includes(principal.value.status))fail('PRINCIPAL_INACTIVE','Private reviewer is inactive');
        if(!principal)principal=tx.put('principals',reviewerId,{principal_id:reviewerId,kind:'reviewer',host:v.host,status:'pending',generation:1,native_id:null,private_reviewer:true},0);
      }else if(input.reviewer_principal_id!==undefined)fail('INVALID_INPUT','Reviewer belongs only to review admission');
      const snapshot=evidence(tx,e);if(reconstruction&&reconstruction.value.source_cut_sha256!==snapshot.sha256)fail('CONTEXT_CHANGED','Reconstruction is no longer current');
      const global=tx.get('control','usage'),personal=tx.get('control',`usage:${principal.id}`),limits=c.value.policy;
      if(used(global)>=limits.max_model_calls||used(personal)>=(limits.principal_model_calls??limits.max_model_calls)||v.used_model_calls>=v.max_model_calls)fail('MODEL_BUDGET','Existing shared model allowance exhausted');
      if(tx.count('slots',{status:['active','unknown']})>=limits.worker_cap)fail('CAPACITY_BUSY','Existing active/unknown execution holds capacity');
      const enrollmentAuthority=stableEnrollment(e),enrollmentSha=peerDigest(enrollmentAuthority),history=recoveryHistory(tx,e),recoverySha=peerDigest(history);
      const contextValue={protocol:'peer-membership-assignment-v1',connection,principal_id:principal.id,generation:input.phase==='reconstruction'?v.generation:principal.value.generation,enrollment_id:v.enrollment_id,enrollment:enrollmentAuthority,recovery_history:history,phase:input.phase,role:input.phase==='reconstruction'?v.role:'reviewer',source_cut:snapshot.body,source_cut_sha256:snapshot.sha256,allowance_observation:{global_used_after:used(global)+1,principal_used_after:used(personal)+1,enrollment_used_after:v.used_model_calls+1},...(reconstruction?{reconstruction:{reference:ref('work_items',reconstruction),value:reconstruction.value,assignment:reconstructionAssignment,delivery:reconstructionDelivery}}:{})};
      const encoded=canonical(contextValue);if(Buffer.byteLength(encoded)>limits.max_context_bytes)fail('CONTEXT_CAPACITY','Complete private assignment exceeds existing context policy');
      const contextId=`membership-context:${v.enrollment_id}:${input.phase}`,contextRow=tx.put('work_items',contextId,{kind:'membership_context',status:'frozen',membership_id:v.enrollment_id,principal_id:principal.id,text:encoded,sha256:digest(encoded),enrollment_sha256:enrollmentSha,recovery_sha256:recoverySha,source_cut_sha256:snapshot.sha256,subject:reconstruction?ref('work_items',reconstruction):null,contributors:snapshot.contributors},0),attemptId=peerDigest(['peer-membership-attempt-v1',connectionHash,v.enrollment_id,input.phase]),executionId=`membership-execution:${attemptId}`;
      const p=tx.put('work_items',key,{kind:'membership_phase',status:'reserved',membership_id:v.enrollment_id,phase:input.phase,principal_id:principal.id,principal_ref:ref('principals',principal),generation:contextValue.generation,attempt_id:attemptId,context_ref:ref('work_items',contextRow),execution_id:executionId,reads:[],submission:null,native_id:null,process:null,result_ref:null},0);
      tx.put('slots',executionId,{kind:'membership_execution',status:'active',membership_id:v.enrollment_id,principal_id:principal.id,attempt_id:attemptId},0);tx.put('effects',executionId,{kind:'membership_execution',status:'reserved',membership_id:v.enrollment_id,principal_id:principal.id,attempt_id:attemptId,termination_confirmed:false},0);
      tx.put('control','usage',{...(global?.value??{}),model_calls:used(global)+1},global?.revision??0);tx.put('control',`usage:${principal.id}`,{...(personal?.value??{}),model_calls:used(personal)+1},personal?.revision??0);tx.put('work_items',e.id,{...v,used_model_calls:v.used_model_calls+1},e.revision);
      tx.finalCheck(()=>expiry(v.expires_at));return {phase:p,context:header(contextRow,p)};
    });},
    activate(args){const a=closed(args,['operation_id','enrollment_id','source_instruction']);return command('operator','activate',a,tx=>roleAuth(tx,'operator'),(tx,input)=>{
      const e=enrollment(tx,input.enrollment_id);checkEnrollment(tx,e);text(input.source_instruction,'activation instruction',4000);
      const recon=phase(tx,e.value.enrollment_id,'reconstruction'),review=phase(tx,e.value.enrollment_id,'review'),r=getExact(tx,recon.value.result_ref),q=getExact(tx,review.value.result_ref),rc=context(tx,recon),qc=context(tx,review);
      if(r.value.status!=='returned'||q.value.status!=='returned'||!r.value.termination_confirmed||!q.value.termination_confirmed||q.value.review?.verdict!=='Pass'||!same(q.value.review.subject,ref('work_items',r)))fail('QUALIFICATION_REQUIRED','Exact completed independent private Pass required');
      fresh(tx,e,rc);fresh(tx,e,qc);independent(tx,e,review.value.principal_id,q.value.native_id,qc.value.contributors);
      const reviewer=tx.get('principals',review.value.principal_id);if(!reviewer||!same(ref('principals',reviewer),review.value.principal_ref)||reviewer.value.generation!==review.value.generation||!['active','pending'].includes(reviewer.value.status))fail('PRINCIPAL_CHANGED','Qualification reviewer changed');
      const old=tx.get('principals',e.value.principal_id),index=tx.get('work_items',`membership-index:${e.value.principal_id}`);expiry(e.value.expires_at);
      let previous=ref('principals',old);
      if(e.value.base_principal){const revoked=tx.put('principals',old.id,{...old.value,status:'revoked',generation:e.value.generation,membership_previous:ref('principals',old),revoked_for:e.value.enrollment_id},old.revision);previous=ref('principals',revoked);tx.event('membership.outgoing_revoked',{principal_id:old.id,generation:old.value.generation,enrollment_id:e.value.enrollment_id});}
      const principal=tx.put('principals',old.id,{...old.value,kind:e.value.role,host:e.value.host,status:'active',generation:e.value.generation,native_id:r.value.native_id,enrollment_id:e.value.enrollment_id,membership_previous:previous,membership_qualification:ref('work_items',q)},e.value.base_principal?old.revision+1:old.revision);
      const accepted=tx.put('work_items',e.id,{...e.value,status:'activated',activation:{principal:ref('principals',principal),reconstruction:ref('work_items',r),qualification:ref('work_items',q),source_instruction:input.source_instruction}},e.revision);tx.put('work_items',index.id,{...index.value,status:'activated'},index.revision);tx.event('membership.incoming_activated',{principal_id:principal.id,generation:principal.value.generation,enrollment_id:e.value.enrollment_id});tx.finalCheck(()=>expiry(e.value.expires_at));return {principal,enrollment:accepted,qualification:ref('work_items',q)};
    });},
    revoke(args){const a=closed(args,['operation_id','enrollment_id','source_instruction']);return command('operator','revoke',a,tx=>roleAuth(tx,'operator'),(tx,input)=>{
      const e=enrollment(tx,input.enrollment_id);if(e.value.status!=='pending')fail('ENROLLMENT_CLOSED','Only pending enrollment can be revoked');text(input.source_instruction,'revocation instruction',4000);const index=tx.get('work_items',`membership-index:${e.value.principal_id}`),pending=[];
      for(const name of ['reconstruction','review']){const p=tx.get('work_items',phaseKey(e.value.enrollment_id,name));if(p&&!p.value.result_ref){const slot=tx.get('slots',p.value.execution_id),effect=tx.get('effects',p.value.execution_id);pending.push({p,slot,effect});}}
      const result=tx.put('work_items',e.id,{...e.value,status:'revoked',revocation:{source_instruction:input.source_instruction}},e.revision);tx.put('work_items',index.id,{...index.value,status:'revoked'},index.revision);
      for(const {p,slot,effect} of pending){tx.put('work_items',p.id,{...p.value,status:'unknown',cancellation_requested:true},p.revision);if(slot)tx.put('slots',slot.id,{...slot.value,status:'unknown'},slot.revision);if(effect)tx.put('effects',effect.id,{...effect.value,status:'unknown'},effect.revision);}return result;
    });}
  });

  const host=Object.freeze({
    bind(args){const a=closed(args,['operation_id','enrollment_id','phase','attempt_id','native_id','observed_process']);return command('host','bind',a,tx=>roleAuth(tx,'host'),(tx,input)=>{
      const {e,p}=checkedPhase(tx,input);if(p.value.native_id||p.value.result_ref||!['reserved','unknown'].includes(p.value.status))fail('BINDING_IMMUTABLE','Original native binding is immutable');
      const native=text(input.native_id,'host-observed native identity',300),process=processIdentity(input.observed_process);
      for(const principal of collect(tx,'principals'))if(aliases(tx,principal.id).natives.includes(native))fail('NATIVE_IN_USE','Native identity already belongs to a principal/history');
      for(const other of collect(tx,'work_items',{status:PHASE_STATES}))if(other.value.kind==='membership_phase'&&other.value.native_id===native)fail('NATIVE_IN_USE','Native identity already belongs to an admitted lifecycle');
      const c=context(tx,p);if(input.phase==='review')independent(tx,e,p.value.principal_id,native,c.value.contributors);
      return tx.put('work_items',p.id,{...p.value,native_id:native,process,status:e.value.status==='pending'&&p.value.status==='reserved'?'running':'unknown'},p.revision);
    });},
    channel(args){const a=closed(args,['enrollment_id','phase','attempt_id']);connectionGuard();const bound=ledger.read(tx=>{roleAuth(tx,'host');const {e,p}=checkedPhase(tx,a);phaseCurrent(tx,e,p);if(p.value.status!=='running'||!p.value.native_id||p.value.result_ref)fail('PHASE_CLOSED','Observed live private phase required');return {native_id:p.value.native_id,process:copy(p.value.process),principal_id:p.value.principal_id,generation:p.value.generation};});
      const guard=tx=>{roleAuth(tx,'host');const {e,p}=checkedPhase(tx,a);phaseCurrent(tx,e,p);if(p.value.status!=='running'||p.value.result_ref||p.value.native_id!==bound.native_id||!same(p.value.process,bound.process)||p.value.principal_id!==bound.principal_id||p.value.generation!==bound.generation)fail('PHASE_CLOSED','Private connection binding changed');const c=context(tx,p);fresh(tx,e,c);return {e,p,c};};
      return Object.freeze({
        header(){connectionGuard();return ledger.read(tx=>{const {p,c}=guard(tx);return header(c,p);});},
        read(args){const input=closed(args,['sha256','offset','length']);connectionGuard();return ledger.write('membership/read',bound.principal_id,raw=>{const ptx=plan(raw),tx=ptx.tx,{e,p,c}=guard(tx),s=c.value.text,start=input.offset,length=input.length;
          if(input.sha256!==c.value.sha256||!Number.isSafeInteger(start)||start<0||start>=s.length||!Number.isSafeInteger(length)||length<1||length>READ_LIMIT||!boundary(s,start))fail('RANGE_INVALID','Exact bounded context range required');let end=Math.min(s.length,start+length);if(!boundary(s,end))end--;if(end<=start)fail('RANGE_INVALID','Range must finish a Unicode boundary');
          const reads=mergeRanges(p.value.reads,start,end);if(!same(reads,p.value.reads))tx.put('work_items',p.id,{...p.value,reads},p.revision);const result={sha256:c.value.sha256,offset:start,text:s.slice(start,end),next_offset:end,complete:complete(reads,s.length),total_characters:s.length};tx.finalCheck(()=>expiry(e.value.expires_at));ptx.flush();return result;
        });},
        submit(args){const input=closed(args,['operation_id','sha256','content']);return command(`private:${a.enrollment_id}:${a.phase}:${a.attempt_id}`,'submit',input,tx=>{const {p}=guard(tx);return {id:p.value.principal_id,value:{generation:p.value.generation}};},(tx,request)=>{const {e,p,c}=guard(tx);if(request.sha256!==c.value.sha256||!complete(p.value.reads,c.value.text.length))fail('DELIVERY_INCOMPLETE','Whole exact private context must be read before submission');if(p.value.submission)fail('SUBMISSION_IMMUTABLE','Original reconstruction/review submission is immutable');const content=text(request.content,'private submission',64000);if(Buffer.byteLength(content)>64000)fail('OUTPUT_CAPACITY','Private output exceeds existing bound');const result=tx.put('work_items',p.id,{...p.value,submission:{content,sha256:digest(content)}},p.revision);tx.finalCheck(()=>expiry(e.value.expires_at));return result;});}
      });
    },
    finish(args){const a=closed(args,['operation_id','enrollment_id','phase','attempt_id','output','termination_confirmed','observed_process','error']);return command('host','finish',a,tx=>roleAuth(tx,'host'),(tx,input)=>{
      const {e,p}=checkedPhase(tx,input);if(p.value.result_ref||!p.value.native_id||!['running','unknown'].includes(p.value.status))fail('RESULT_RECORDED','Original result or execution boundary is immutable');
      const isClosed=input.termination_confirmed===true,process=processIdentity(input.observed_process,isClosed);if(!sameProcess(p.value.process,process))fail('PROCESS_CHANGED','Observed process identity changed');
      const error=input.error===undefined?null:copy(input.error),output=input.output??null;if(output!==null&&(!p.value.submission||output!==p.value.submission.content))fail('OUTPUT_MISMATCH','Raw observed output differs from attributed submission');
      if(!error&&(!isClosed||!p.value.submission||typeof output!=='string')){if(isClosed||input.termination_confirmed!==false)fail('RESULT_INVALID','Success requires complete attributed raw output and closure');}
      const c=context(tx,p);let current=true,held=null;try{phaseCurrent(tx,e,p);fresh(tx,e,c);}catch(error){if(providerFailures.get(tx)?.has(error))throw error;if(!['ENROLLMENT_CLOSED','EXPIRED','AUTHORITY_CHANGED','PRINCIPAL_CHANGED','CONTEXT_CHANGED','CONTEXT_CONFLICT','CONTEXT_CAPACITY'].includes(error.code))throw error;current=false;held=error.code;}
      let review=null;const status=!isClosed?'unknown':!current?'quarantined':error?'failed':'returned';if(status==='returned'&&input.phase==='review'){review=parseReviewOutput(output,c.value.subject,{canonical});independent(tx,e,p.value.principal_id,p.value.native_id,c.value.contributors);}
      const result=tx.put('work_items',`membership-result:${p.value.attempt_id}`,{kind:input.phase==='review'?'membership_qualification':'membership_reconstruction',status,membership_id:e.value.enrollment_id,principal_id:p.value.principal_id,generation:p.value.generation,attempt_id:p.value.attempt_id,context_ref:p.value.context_ref,source_cut_sha256:c.value.source_cut_sha256,native_id:p.value.native_id,process,termination_confirmed:isClosed,output,output_sha256:output===null?null:digest(output),review,error,held},0),slot=tx.get('slots',p.value.execution_id),effect=tx.get('effects',p.value.execution_id);
      if(!slot||!effect)fail('ATTEMPT_CHANGED','Original shared execution reservation missing');const updated=tx.put('work_items',p.id,{...p.value,status:isClosed?'closed':'unknown',result_ref:ref('work_items',result)},p.revision);tx.put('slots',slot.id,{...slot.value,status:isClosed?'released':'unknown',termination_confirmed:isClosed},slot.revision);tx.put('effects',effect.id,{...effect.value,status:!isClosed?'unknown':status==='returned'?'succeeded':'failed',termination_confirmed:isClosed,result_ref:ref('work_items',result)},effect.revision);
      // Pure cutoff runs after every provider read and the owning snapshot
      // probe. Expired output remains submitted; exact close can record closure.
      if(status==='returned')tx.finalCheck(()=>expiry(e.value.expires_at));return {result,phase:updated,accepted:status==='returned'};
    });},
    close(args){const a=closed(args,['operation_id','enrollment_id','phase','attempt_id','termination_confirmed','observed_process']);return command('host','close',a,tx=>roleAuth(tx,'host'),(tx,input)=>{
      const {p}=checkedPhase(tx,input);if(input.termination_confirmed!==true||!p.value.process)fail('CLOSURE_REQUIRED','Exact observed process closure required');const process=processIdentity(input.observed_process,true);if(!sameProcess(p.value.process,process))fail('PROCESS_CHANGED','Observed process identity changed');if(p.value.closure||p.value.status==='closed')return p;
      const slot=tx.get('slots',p.value.execution_id),effect=tx.get('effects',p.value.execution_id);if(!slot||!effect)fail('ATTEMPT_CHANGED','Original execution reservation missing');const updated=tx.put('work_items',p.id,{...p.value,status:'closed',closed_without_result:!p.value.result_ref,closure:{termination_confirmed:true,process}},p.revision);tx.put('slots',slot.id,{...slot.value,status:'released',termination_confirmed:true},slot.revision);tx.put('effects',effect.id,{...effect.value,status:'failed',termination_confirmed:true,closure:{process}},effect.revision);return updated;
    });},
    activeClient(args){const a=closed(args,['enrollment_id']);connectionGuard();const binding=ledger.read(tx=>{roleAuth(tx,'host');const e=enrollment(tx,a.enrollment_id);if(e.value.status!=='activated')fail('QUALIFICATION_REQUIRED','Exact activated membership required');const p=tx.get('principals',e.value.principal_id);if(!p||!same(ref('principals',p),e.value.activation.principal))fail('PRINCIPAL_CHANGED','Activated incarnation changed');return {principal_id:p.id,generation:p.value.generation,native_id:p.value.native_id};});return bindPeerPrincipal(ledger,binding);}
  });
  return Object.freeze({operator,host});
}
