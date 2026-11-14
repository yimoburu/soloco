import {assertPeerOrdinaryOriginReadyFrom,assertPeerOrdinaryTaskEventFrom} from './origin-ordinary-task-transition.mjs';
import {peerOrdinaryOriginCompulsoryContext} from './origin-ordinary-task-contract.mjs';
import {assertOriginalOrdinaryTaskSourceTupleFrom} from './prospective-local-worker-inventory-producer.mjs';
// Trusted internal component, not an authenticated public API.
// Actor labels are attribution supplied by a future protected transport (P8).
// createRuntimeObserver is ONLY for trusted host composition. Its construction,
// methods, and ledger connection must never be exposed as model tools. Persisted
// provenance assumes trusted exclusive ledger writers, not hostile DB access.
// P3 must separately integrate physical dispatch ordering and this observer API.
// P5/P8 native member qualification, authentication and isolation are not supplied.
// Review output contract: canonical JSON {review:{subject,verdict,reason,blockers}}.
// Synthetic observer fixtures establish mechanics, never native qualification.
import {createHash,randomUUID} from 'node:crypto';
import {prepareOriginalProjectedTaskContext} from './peer-context-interpreter.mjs';
import {canonical,peerDigest,FAMILIES,PeerLedger,originalPeerExecutionCustodyFrom} from './ledger.mjs';
import {REVIEW_SELECTION_RECIPE,extractReviewSelection,parseReviewOutput,reviewReference,reviewScope} from './review-selection.mjs';
import {assertOriginalPeerExecutorIncarnation} from './executor-incarnation.mjs';
import {sendHandoff,decideHandoff,pendingHandoffs,prepareHandoffTask} from './handoff.mjs';
import {assertPeerOwnerOperatingState} from './owner-operating-state.mjs';
import {assertPeerBootstrapOperationFrom} from './bootstrap-membership-context.mjs';
import {bootstrapActor} from './bootstrap-membership-contract.mjs';
import {assertOriginalPeerMaintenanceExecutionCapacityInTransactionFrom as assertInventoryInTransaction,prepareOriginalPeerExecutionLaunchFrom as prepareInventoryLaunch} from './prospective-local-worker-inventory-producer.mjs';

const PROTOCOL='peer-cos-v1',MAX_ROWS=10000;
const outstanding=['reserved','sent','unknown'];
const observationActions=new Set(['task/process','task/finish','task/closure']);
const copy=v=>JSON.parse(canonical(v));
const same=(a,b)=>canonical(a)===canonical(b);
export const digest=value=>typeof value==='string'?createHash('sha256').update(value).digest('hex'):peerDigest(value);
const now=()=>new Date().toISOString();
// Produced only by scheduler admission. Binding/renewal cannot accept a model
// supplied deadline, and a stale admission never silently receives a new lease.
export const TASK_EFFECT_LEASE_MS=120000;
const boundPrincipalConnections=new WeakMap();
const taskAssignmentConnections=new WeakMap();
const productionAdmissions=new WeakMap();
const productionSchedulers=new WeakMap();
const bootstrapMembershipFacades=new WeakMap();
const productionPublications=new WeakMap();
const currentAuthorizationGrants=new WeakMap();
const ordinaryProofKey=Symbol('original-ordinary-origin-plan');
const ordinaryProviderSources=new WeakMap(),ordinaryPhysicalGuards=new WeakMap();
const ordinaryGetOnlyKey=Symbol('original-ordinary-get-only');
// Only these fixed Source wrapper constructors establish aliases. Caller
// connection/source_handle properties are never an identity source.
const ordinarySource=tx=>ordinaryProviderSources.get(tx)??tx;
function ordinaryAlias(wrapper,source){ordinaryProviderSources.set(wrapper,ordinarySource(source));return wrapper;}
function prepareOrdinaryPhysicalGuard(ledger,raw,proofs,changes=[],events=[]){
 if(!proofs.length)return null;
 const loan=originalPeerExecutionCustodyFrom(ledger,ordinarySource(raw)),pending=loan.pending();
 if(loan.phase!=='raw'||!loan.write||loan.external||pending.changes.length||pending.events.length)hold('ORIGIN_ORDINARY_TASK_PHYSICAL_REQUIRED','Fresh original prewrite snapshot required');
 const heads=new Map(),versions=new Map();let deadline=Infinity;
 for(const proof of proofs){deadline=Math.min(deadline,proof.deadline_at_ms);for(const r of proof.readset){const k=canonical([r.family,r.id]),old=heads.get(k);if(old&&!same(old,r))hold('ORIGIN_ORDINARY_TASK_CURRENT_CHANGED','Conflicting original readsets');heads.set(k,r);}}
 const expected=changes.map(({family,row,previous})=>({family,id:row.id,revision:row.revision,sha256:row.sha256,previous_sha256:previous?.sha256??null}));
 for(const {family,row,previous}of changes){const k=canonical([family,row.id]),before=previous?ref(family,previous):null;if(!same(heads.get(k)??null,before))hold('ORIGIN_ORDINARY_TASK_CURRENT_CHANGED','Planned change differs from full original namespace');if(previous)versions.set(canonical(before),{family,...previous});versions.set(canonical(ref(family,row)),{family,...row});heads.set(k,ref(family,row));}
 // This is a prospective Source write-plan check, not fabricated committed
 // history or Native evidence. The final guard compares the actual journal.
 if(expected.length||events.length){
  // The cold grammar sees this exact owning write's projected postimage and
  // original immutable predecessors. All history reads finish before puts;
  // neither this view nor a copied event supplies a runtime capability.
  const projected=new Map(changes.map(({family,row})=>[canonical([family,row.id]),row]));
  const view={get:(f,id)=>projected.get(canonical([f,id]))??raw.get(f,id),getVersion:r=>versions.get(canonical(r))??raw.getVersion(r),events:options=>raw.events(options)};
  for(const proof of proofs)assertPeerOrdinaryTaskEventFrom(view,{seq:loan.sequence,type:loan.type,principal_id:loan.principal,payload:{changes:expected,events}},proof.qualification_ref);
 }
 if(!Number.isSafeInteger(deadline))hold('ORIGIN_ORDINARY_TASK_EXPIRED','Finite original qualification deadline required');
 const token=Object.freeze({});ordinaryPhysicalGuards.set(token,{ledger,sequence:loan.sequence,type:loan.type,principal:loan.principal,previous_sha256:pending.previous_sha256,changes:expected,events:copy(events),heads:[...heads.values()],proofs,deadline});return token;
}
function ordinaryPhysicalProvider(ledger,view,token){
 const guard=ordinaryPhysicalGuards.get(token);if(!guard||guard.ledger!==ledger)hold('ORIGIN_ORDINARY_TASK_PHYSICAL_REQUIRED','Original physical guard required');
 const physical=ordinarySource(view),loan=originalPeerExecutionCustodyFrom(ledger,physical),pending=loan.pending();
 if(loan.phase!=='terminal'||loan.external||loan.sequence!==guard.sequence||loan.type!==guard.type||loan.principal!==guard.principal||pending.previous_sha256!==guard.previous_sha256||!same(pending.changes,guard.changes)||!same(pending.events,guard.events))hold('ORIGIN_ORDINARY_TASK_PLAN_CHANGED','Actual original journal differs from the checked plan');
 for(const r of guard.heads){const row=view.get(r.family,r.id);if(!row||!same(ref(r.family,row),r))hold('ORIGIN_ORDINARY_TASK_CURRENT_CHANGED','Original pinned postimage changed');}
 for(const proof of guard.proofs)assertOriginalOrdinaryTaskSourceTupleFrom(proof.source_tuple);
 loan.assert();
 const cache=new Map(guard.proofs.map(proof=>[canonical(proof.qualification_ref),proof]));
 return ordinaryAlias(Object.freeze({...view,[ordinaryProofKey]:cache,[ordinaryGetOnlyKey]:true}),physical);
}
const ordinaryPhysicalDeadline=token=>ordinaryPhysicalGuards.get(token)?.deadline??Infinity;
// Source-private transaction routing only. It is thrown before command lookup
// or planning a mutation, never after an attempt, reservation or host effect.
const ownerGuardUpgrade=Object.freeze(new Error('Owning guarded source plan required'));
function nextTaskAuthority(value){
  const previous=value?.authority_epoch;
  if(previous!==undefined&&(!Number.isSafeInteger(previous)||previous<1))hold('TASK_AUTHORITY_CHANGED','Invalid task authority epoch');
  const next=(previous??0)+1;
  if(!Number.isSafeInteger(next))hold('TASK_AUTHORITY_CHANGED','Task authority epoch exhausted');
  return next;
}
function hold(code,message){throw Object.assign(Error(message),{code});}
function text(v,label,max=2000){if(typeof v!=='string'||!v.trim()||v.length>max||v.includes('\0'))hold('INVALID_INPUT',`${label} requires bounded nonempty text`);return v;}
function bounded(v,label,max=64000){const bytes=canonical(v);if(Buffer.byteLength(bytes)>max)hold('EVIDENCE_CAPACITY',`${label} exceeds capacity`);return JSON.parse(bytes);}
function publicationMetadata(value,label){const result=bounded(value,label,16000);if(!result||typeof result!=='object'||Array.isArray(result))hold('INVALID_INPUT',`${label} requires a complete object`);return result;}
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const order=(a,b)=>a<b?-1:a>b?1:0;
function all(tx,family,filter={}){
  const rows=[],prep=preparationBudget(tx);let cursor;
  for(;;){prep.before(family);const page=tx.list(family,{...filter,limit:16,...(cursor?{cursor}:{})});for(const row of page.items){rows.push(prep.retain(family,row));if(rows.length>MAX_ROWS)hold('LOOKUP_CAPACITY','10,000 matching-row lookup bound exceeded');}if(page.complete)return rows;if(!page.next_cursor||page.next_cursor===cursor)hold('LOOKUP_INCOMPLETE','Nonprogressing ledger cursor');cursor=page.next_cursor;}
}
const count=(tx,f,o={})=>tx.count?tx.count(f,o):all(tx,f,o).length;
const semanticBudgetKey=Symbol('peer-semantic-reference-budget');
const preparationBudgetKey=Symbol('peer-preparation-budget'),readFailuresKey=Symbol('peer-read-failures'),reviewGenerationKey=Symbol('peer-planned-review-generation');
export const REVIEW_PREPARATION_BYTES=16*1024*1024;
const privateClosureFamilies=new Set(['effects','slots','claims','commands']);
function newPreparationBudget(){
  const values=new Map(),closureValues=new Map();let bytes=0,closureBytes=0,failure=null,physical=false;
  const before=(family,historical=false)=>{if(failure&&(!physical||historical||!privateClosureFamilies.has(family)))throw failure;};
  return {before,failed:()=>Boolean(failure),physical:()=>{if(failure)physical=true;},retain(family,row,{historical=false}={}){
    before(family,historical);const exact=ref(family,row),key=canonical(exact),reserve=Boolean(failure),store=reserve?closureValues:values;
    if(!store.has(key)){
      const size=Buffer.byteLength(canonical({...exact,value:row.value}));
      if((reserve?closureBytes:bytes)+size>REVIEW_PREPARATION_BYTES){
        const error=Object.assign(Error(`Complete review preparation exceeds ${REVIEW_PREPARATION_BYTES} encoded UTF-8 bytes; nothing was omitted`),{code:'CONTEXT_CAPACITY'});
        if(!reserve)failure=error;throw error;
      }
      store.set(key,copy(row.value));if(reserve)closureBytes+=size;else bytes+=size;
    }
    // Intern retained bodies across overlapping selectors and isolated graphs.
    // Public results are copied; metadata wrappers do not duplicate the body.
    return {...row,value:store.get(key)};
  }};
}
const preparationBudget=tx=>tx[preparationBudgetKey]??newPreparationBudget();
const readFailure=(tx,error)=>Boolean(tx[readFailuresKey]?.has(error));
function trackedReads(tx){
  if(tx[readFailuresKey])return tx;
  const failures=new Set(),wrapped={...tx,[ordinaryProofKey]:tx[ordinaryProofKey]??new Map(),[readFailuresKey]:failures,[preparationBudgetKey]:newPreparationBudget(),[semanticBudgetKey]:newSemanticBudget()};
  for(const method of ['get','getVersion','getTaskHistory','list','count','events','queryCurrentReviews','resolveLegacy'])if(typeof tx[method]==='function')wrapped[method]=(...args)=>{try{return tx[method](...args);}catch(error){failures.add(error);throw error;}};
  return ordinaryAlias(Object.freeze(wrapped),tx);
}
function newSemanticBudget(){
  const distinct=new Set();return r=>{
    const exact=exactReference(r),key=canonical(exact);
    if(semanticFamilies.has(exact.family)&&!distinct.has(key)){if(distinct.size>=MAX_ROWS)hold('LOOKUP_CAPACITY','10,000 exact contributor-reference bound exceeded');distinct.add(key);}
    return key;
  };
}
const semanticBudget=tx=>tx[semanticBudgetKey]??newSemanticBudget();
function reviewSelectors(options={}){
  const input=copy(options);if(Object.keys(input).some(k=>!['subjects','scopes','limit','cursor'].includes(k)))hold('INVALID_INPUT','Unknown review selector option');
  const subjects=Object.hasOwn(input,'subjects')?input.subjects:[],requested=Object.hasOwn(input,'scopes')?input.scopes:[],limit=Object.hasOwn(input,'limit')?input.limit:50;
  if(!Array.isArray(subjects)||subjects.length>100||!Array.isArray(requested)||requested.length>16||!Number.isSafeInteger(limit)||limit<1||limit>100)hold('INVALID_INPUT','Invalid bounded review selectors');
  const refs=subjects.map(reviewReference),scopes=requested.map(reviewScope);
  if(new Set(refs.map(canonical)).size!==refs.length||new Set(scopes).size!==scopes.length)hold('INVALID_INPUT','Duplicate review selectors');
  refs.sort((a,b)=>order(canonical(a),canonical(b)));scopes.sort(order);
  return {subjects:refs,scopes,limit,...(Object.hasOwn(input,'cursor')?{cursor:input.cursor}:{}),effective:{subjects:refs,scopes:scopes.length?[...new Set([...scopes,'*','unknown'])].sort(order):[]}};
}
const reviewMatches=(facts,selectors)=>selectors.subjects.some(r=>same(r,facts.subject))||Boolean(facts.adverse&&selectors.scopes.includes(facts.scope));

// Planning reads only requested keys and filtered collections. All reads,
// validation and legacy resolution occur before the first real P1 mutation.
// Buffered changes supply read-your-writes without weakening P1's real
// list-after-write fence. BEGIN IMMEDIATE supplies the snapshot/write boundary.
// Requested collections retain P1's 10,000 matching-row capacity limit.
function plannedWrite(ledger,type,principal,fn,terminalGuard=null,onPlan=null){
  let inventoryRef=null,ordinaryPhysical=null;const inventoryAdmission=['task/admit','membership/admit'].includes(type),inventoryDeadline=Date.now()+TASK_EFFECT_LEASE_MS;
  const terminal=view=>{if(inventoryRef)assertInventoryInTransaction(ledger,view,{stage:'existing',admission_ref:inventoryRef});const checked=ordinaryPhysical?ordinaryPhysicalProvider(ledger,view,ordinaryPhysical):view,deadline=terminalGuard?terminalGuard(checked):inventoryDeadline;if(ordinaryPhysical)ordinaryPhysicalProvider(ledger,view,ordinaryPhysical);return Math.min(deadline,ordinaryPhysicalDeadline(ordinaryPhysical));};
  const write=terminalGuard||inventoryAdmission?callback=>ledger.guardedWrite(type,principal,callback,terminal):callback=>ledger.write(type,principal,callback);
  return write(rawBase=>{
    const base=trackedReads(rawBase),prep=preparationBudget(base),budget=semanticBudget(base);
    const known=new Set(FAMILIES),keys=new Map(),history=new Map(),collections=new Map(),changes=new Map(),generations=new Map(),events=[];
    const collectionViews=new Map();
    const reviewQueries=new Map(),reviewBodies=new Map(),reviewSnapshot=randomUUID();
    const filterKeys=['status','principal_id','task_id','scope'];
    let active=true;
    const guard=()=>{if(!active)hold('TRANSACTION_EXPIRED','Planning handle expired');};
    const checkFamily=f=>{guard();if(!known.has(f))hold('FAMILY_INVALID','Unknown peer family');return f;};
    const selectedFilters=o=>{
      const selected={};
      for(const key of filterKeys)if(o[key]!==undefined){
        const values=Array.isArray(o[key])?o[key]:[o[key]];
        if(!values.length||values.length>16||new Set(values).size!==values.length)hold('INVALID_INPUT','Invalid peer row filters');
        selected[key]=values.map(value=>{
          text(value,key,1000);
          if(/[\ud800-\udfff]/u.test(value))hold('INVALID_INPUT','Invalid peer row filter text');
          return value;
        }).sort();
      }
      let expansion=1;for(const values of Object.values(selected))expansion*=values.length;
      if(expansion>256)hold('INVALID_INPUT','Peer filter expansion is too large');
      return selected;
    };
    const dimensions=v=>({status:String(v?.status??v?.state??''),principal_id:String(v?.principal_id??v?.owner_principal_id??''),task_id:String(v?.task_id??''),scope:String(v?.scope??'')});
    const matches=(row,selected)=>Boolean(row)&&Object.entries(selected).every(([key,values])=>values.includes(dimensions(row.value)[key]));
    const get=(f,id)=>{
      checkFamily(f);text(id,'row id',2000);const key=canonical([f,id]);
      if(changes.has(key))return copy(changes.get(key).row);
      if(!keys.has(key)){prep.before(f);const row=base.get(f,id);keys.set(key,row?prep.retain(f,row):null);}
      const row=keys.get(key);return row?copy(row):null;
    };
    const materialize=(f,selected)=>{
      checkFamily(f);const key=canonical([f,selected]);
      const generation=generations.get(f)??0,cached=collectionViews.get(key);
      // Reuse only this owning transaction's derived order. Raw collection
      // reads, retained bodies and final source guards keep their existing path.
      // Preparation failure must still take the original closure-budget path.
      if(!prep.failed()&&cached?.generation===generation)return cached.rows;
      if(!collections.has(key))collections.set(key,all(base,f,selected));
      const result=new Map(collections.get(key).map(row=>[row.id,row]));
      for(const change of changes.values())if(change.family===f){
        result.delete(change.row.id);
        if(matches(change.row,selected))result.set(change.row.id,prep.retain(f,change.row));
      }
      if(result.size>MAX_ROWS)hold('LOOKUP_CAPACITY','10,000 matching-row lookup bound exceeded');
      const rows=[...result.values()].sort((a,b)=>order(a.id,b.id));
      if(!prep.failed()){
        if(!collectionViews.has(key)&&collectionViews.size>=64)collectionViews.delete(collectionViews.keys().next().value);
        collectionViews.set(key,{generation,rows});
      }
      return rows;
    };
    const getVersion=r=>{
      guard();const exact=exactReference(r),key=canonical(exact);
      if(typeof base.getVersion!=='function')hold('LINEAGE_REQUIRED','Exact committed history reader required');
      if(!history.has(key)){prep.before(exact.family,true);const row=base.getVersion(exact);history.set(key,row?prep.retain(exact.family,row,{historical:true}):null);}
      guard();return history.get(key)?copy(history.get(key)):null;
    };
    const getTaskHistory=(from,through)=>{
      guard();
      if(typeof base.getTaskHistory!=='function')hold('LINEAGE_REQUIRED','Complete immutable task history capability required');
      const rows=base.getTaskHistory(exactReference(from),exactReference(through));
      guard();
      return rows.map(row=>{
        const key=canonical(ref('tasks',row));
        if(!history.has(key))history.set(key,prep.retain('tasks',row,{historical:true}));
        return copy(history.get(key));
      });
    };
    const planningSnapshotGuard=()=>{
      guard();
      // run always reads this actor before command/replay lookup. Reuse that
      // committed binding without adding a control or review-index dependency.
      const actor=keys.get(canonical(['principals',principal]));
      if(!actor)hold('PLAN_CHANGED','Planning requires its committed actor binding');
      if(typeof base.getVersion!=='function')hold('LINEAGE_REQUIRED','Exact committed history reader required');
      const exact=ref('principals',actor),row=base.getVersion(exact);guard();
      // This uncached support read checks P1's owning-snapshot/before-write
      // fence, not historical authority or additional semantic evidence.
      if(!row||row.family!==exact.family||row.id!==exact.id||row.revision!==exact.revision||row.sha256!==exact.sha256||peerDigest(row.value)!==exact.sha256)hold('SOURCE_CHANGED','Preflush actor binding changed');
    };
    const reviewSnapshotGuard=()=>{
      guard();if(typeof base.queryCurrentReviews!=='function')hold('REVIEW_SELECTION_CAPABILITY','Indexed current review selection is required');
      // Empty selectors hydrate no bodies but retain P1's current snapshot,
      // dirty/error and before-real-write fences when serving a planner cache.
      const page=base.queryCurrentReviews({subjects:[],scopes:[],limit:1});guard();
      if(page?.recipe!==REVIEW_SELECTION_RECIPE||page.total!==0||page.complete!==true||page.next_cursor!==null||!Array.isArray(page.items)||page.items.length)hold('LOOKUP_INCOMPLETE','Indexed review snapshot eligibility is unproven');
    };
    const selectedReviews=options=>{
      guard();prep.before('reviews');const selected=reviewSelectors(options),key=canonical(selected.effective),selector=digest(key),generation=generations.get('reviews')??0;
      reviewSnapshotGuard();
      if(!reviewQueries.has(key)){
        const ids=new Set();let cursor,total;
        for(;;){
          guard();prep.before('reviews');
          const page=base.queryCurrentReviews({subjects:selected.subjects,scopes:selected.scopes,limit:16,...(cursor?{cursor}:{})});guard();
          if(page?.recipe!==REVIEW_SELECTION_RECIPE||!Array.isArray(page.items)||page.items.length>16||typeof page.complete!=='boolean'||!Number.isSafeInteger(page.total)||page.total<0||page.total>MAX_ROWS||total!==undefined&&total!==page.total)hold('LOOKUP_INCOMPLETE','Invalid indexed review page');
          total=page.total;
          for(const raw of page.items){
            const exact=ref('reviews',raw);budget(exact);const row=prep.retain('reviews',raw),old=reviewBodies.get(row.id);
            if(old&&!same(ref('reviews',old),exact))hold('SOURCE_CHANGED','Current indexed review binding changed');
            if(ids.has(row.id))hold('LOOKUP_INCOMPLETE','Repeated indexed review page item');
            ids.add(row.id);reviewBodies.set(row.id,row);
            if(reviewBodies.size>MAX_ROWS)hold('LOOKUP_CAPACITY','10,000 aggregate selected-review bound exceeded');
          }
          if(page.complete){if(ids.size!==total)hold('LOOKUP_INCOMPLETE','Indexed review membership is incomplete');break;}
          if(!page.items.length||!page.next_cursor||page.next_cursor===cursor)hold('LOOKUP_INCOMPLETE','Nonprogressing indexed review cursor');cursor=page.next_cursor;
        }
        reviewQueries.set(key,[...ids]);
      }
      const result=new Map(reviewQueries.get(key).map(id=>[id,reviewBodies.get(id)]));
      for(const change of changes.values())if(change.family==='reviews'){
        if(change.expected!==0||change.row.revision!==1)hold('REVIEW_SELECTION_INTEGRITY','Buffered existing-review mutation requires supported history admission');
        const current={family:'reviews',...change.row};
        const resolveProduction=r=>{
          const exact=exactReference(r),pending=changes.get(canonical([exact.family,exact.id]));
          if(pending&&same(ref(exact.family,pending.row),exact))return {family:exact.family,...prep.retain(exact.family,pending.row)};
          return getVersion(exact);
        };
        // Explicit planned production bindings, never a public history fallback.
        const facts=extractReviewSelection({current,history:[current],resolve:resolveProduction,canonical,hash:digest});
        if(facts.outcome==='INTEGRITY_UNKNOWN'||facts.error)hold('REVIEW_SELECTION_INTEGRITY','Buffered review production integrity is unknown');
        if(reviewMatches(facts,selected.effective)){budget(ref('reviews',change.row));result.set(change.row.id,prep.retain('reviews',change.row));}
      }
      if(result.size>MAX_ROWS)hold('LOOKUP_CAPACITY','10,000 matching review selection bound exceeded');
      let after=null;
      if(Object.hasOwn(selected,'cursor')){
        let c;try{c=JSON.parse(Buffer.from(text(selected.cursor,'review cursor',16000),'base64url').toString('utf8'));}catch{hold('LOOKUP_INCOMPLETE','Invalid planning review cursor');}
        if(c.snapshot!==reviewSnapshot||c.generation!==generation||c.selector!==selector||c.recipe!==REVIEW_SELECTION_RECIPE||typeof c.after!=='string'||!result.has(c.after))hold('LOOKUP_INCOMPLETE','Stale or mismatched planning review cursor');after=c.after;
      }
      const rows=[...result.values()].sort((a,b)=>order(a.id,b.id)),remaining=after===null?rows:rows.filter(row=>row.id>after),items=remaining.slice(0,selected.limit),complete=remaining.length<=selected.limit;
      guard();return {items:copy(items),total:rows.length,complete,next_cursor:complete?null:Buffer.from(canonical({snapshot:reviewSnapshot,generation,selector,recipe:REVIEW_SELECTION_RECIPE,after:items.at(-1).id})).toString('base64url'),recipe:REVIEW_SELECTION_RECIPE};
    };
    const tx=Object.freeze({
      [ordinaryProofKey]:new Map(),[semanticBudgetKey]:budget,[preparationBudgetKey]:prep,[readFailuresKey]:base[readFailuresKey],
      [reviewGenerationKey]:()=>generations.get('reviews')??0,
      sequence:base.sequence,
      get,
      getVersion,
      getTaskHistory,
      events:options=>{guard();if(changes.size||typeof base.events!=='function')hold('TRANSACTION_EXPIRED','Original event history must be read before planning writes');return base.events(options);},
      queryCurrentReviews:selectedReviews,
      list:(f,o={})=>{
        checkFamily(f);const limit=o.limit??100;
        if(!Number.isSafeInteger(limit)||limit<1||limit>100)hold('INVALID_INPUT','List limit must be 1..100');
        const selected=selectedFilters(o),generation=generations.get(f)??0;
        let after=null;
        if(o.cursor){
          let cursor;
          try{cursor=JSON.parse(Buffer.from(text(o.cursor,'cursor',16000),'base64url').toString('utf8'));}catch{hold('LOOKUP_INCOMPLETE','Invalid planning cursor');}
          if(!cursor||cursor.family!==f||cursor.generation!==generation||!same(cursor.filters,selected)||typeof cursor.after!=='string')hold('LOOKUP_INCOMPLETE','Stale or mismatched planning cursor');
          after=text(cursor.after,'cursor identity',2000);
        }
        const selectedRows=materialize(f,selected);
        let start=0;
        if(after!==null){const index=selectedRows.findIndex(row=>row.id===after);if(index<0)hold('LOOKUP_INCOMPLETE','Planning cursor anchor missing');start=index+1;}
        const items=selectedRows.slice(start,start+limit),complete=start+items.length>=selectedRows.length;
        return {items:copy(items),total:selectedRows.length,complete,next_cursor:complete?null:Buffer.from(canonical({family:f,generation,filters:selected,after:items.at(-1).id})).toString('base64url')};
      },
      count:(f,o={})=>{
        checkFamily(f);const selected=selectedFilters(o);
        let total=base.count?base.count(f,selected):all(base,f,selected).length;
        for(const change of changes.values())if(change.family===f)total+=Number(matches(change.row,selected))-Number(matches(change.previous,selected));
        if(!Number.isSafeInteger(total)||total<0)hold('LOOKUP_INCOMPLETE','Invalid planning membership count');
        if(total>MAX_ROWS)hold('LOOKUP_CAPACITY','10,000 matching-row lookup bound exceeded');
        return total;
      },
      put:(f,id,value,expected=0)=>{
        const old=get(f,id);
        if(!Number.isSafeInteger(expected)||expected<0||(old?.revision??0)!==expected)hold('REVISION_CONFLICT','Planning compare-and-swap conflict');
        const normalized=bounded(value,'peer row',1000000),sha256=peerDigest(normalized);
        if(old?.sha256===sha256)return copy(old);
        const key=canonical([f,id]);
        // Preserve one changed version per row and exact predicted references.
        if(changes.has(key))hold('PLAN_DUPLICATE_WRITE','Plan must coalesce each row before writing');
        const revision=expected+1;if(!Number.isSafeInteger(revision))hold('REVISION_CONFLICT','Planning revision overflow');
        const row={id,revision,sha256,created_seq:old?.created_seq??base.sequence,value:normalized};
        changes.set(key,{family:f,row,previous:old,expected});
        generations.set(f,(generations.get(f)??0)+1);
        return copy(row);
      },
      event:(type,payload)=>{guard();events.push({type:text(type,'event type'),payload:copy(payload)});},
      resolveLegacy:r=>{guard();return base.resolveLegacy(r);}
    });
    ordinaryAlias(tx,rawBase);
    if(onPlan)currentAuthorizationGrants.set(tx,new Map());
    try{
      const result=fn(tx);
      if(result&&typeof result.then==='function'){
        if(result instanceof Promise)Promise.prototype.then.call(result,undefined,()=>{});
        hold('ASYNC_FORBIDDEN','Planning must be synchronous');
      }
      const output=copy(result);if(reviewQueries.size)reviewSnapshotGuard();planningSnapshotGuard();
      if(onPlan){
        const bindings=new Map(),add=(family,id,row)=>bindings.set(canonical([family,id]),{family,id,reference:row?ref(family,row):null});
        for(const [key,row] of keys){const [family,id]=JSON.parse(key);add(family,id,row);}
        for(const [key,rows] of collections){const [family]=JSON.parse(key);for(const row of rows)add(family,row.id,row);}
        for(const row of reviewBodies.values())add('reviews',row.id,row);
        for(const {family,row} of changes.values())add(family,row.id,row);
        onPlan({bindings:[...bindings.values()],authorizing_grants:[...currentAuthorizationGrants.get(tx).values()],ordinary_origins:[...tx[ordinaryProofKey].values()]});
      }
      if(inventoryAdmission&&[...changes.values()].some(c=>c.family==='slots'&&!c.previous&&c.row.value.status==='active')){
        const admissions=[...changes.values()].filter(c=>c.family==='commands'&&(type==='task/admit'?c.row.value.action==='task/admit'&&c.row.value.result?.admitted===true:c.row.value.kind==='membership_command'&&c.row.value.channel==='operator'&&c.row.value.result?.phase));
        if(admissions.length!==1)hold('ORIGINAL_EXECUTION_ADMISSION_REQUIRED','Exact original task admission required');
        const phase=admissions[0].row.value.result?.phase;inventoryRef=type==='task/admit'?ref('commands',admissions[0].row):phase.value.admission_ref??ref('work_items',phase);assertInventoryInTransaction(ledger,rawBase,{stage:'reserve'});
      }
      ordinaryPhysical=prepareOrdinaryPhysicalGuard(ledger,rawBase,[...tx[ordinaryProofKey].values()],[...changes.values()],events);
      active=false;
      for(const {family,row,expected} of changes.values()){
        const actual=base.put(family,row.id,row.value,expected);
        if(actual.revision!==row.revision||actual.sha256!==row.sha256)hold('PLAN_CHANGED','Committed reference differs from plan');
      }
      for(const e of events)base.event(e.type,e.payload);
      if(inventoryRef)prepareInventoryLaunch(ledger,rawBase,{admission_ref:inventoryRef});
      if(inventoryRef||ordinaryPhysical||(type==='task/assign'||type==='home/publish'||type.startsWith('handoff/')||type.startsWith('membership/')||onPlan)&&terminalGuard){
        if(typeof base.sealWrites!=='function')hold('AUTHORITY_CHANGED','Owning planned write closure required');
        base.sealWrites();
      }
      return output;
    }finally{active=false;}
  });
}
function control(tx){const c=tx.get('control','company');if(c?.value.protocol!==PROTOCOL)hold('PROTOCOL_REQUIRED','Checked peer adoption required');return c;}
// P5's existing provenance is an unresolved origin, never a readiness flag.
// Partial/malformed markers cannot grant fresh authority. A future typed
// obligation transition is separate; no caller-supplied "ready" clears this.
function legacyOriginHold(c){
  if(Object.hasOwn(c.value,'legacy_source_cut_sha256')||Object.hasOwn(c.value,'legacy_backup')||Object.hasOwn(c.value,'legacy_ready'))hold('AUTHORITY_CHANGED','Legacy adoption origin remains unqualified; original scoped attempts, expiry and uncertain obligations require a qualified transition');
}
// Pure currentness assertion for trusted owner composition. The supplied
// provider must be the caller's original owning snapshot; success mints nothing.
export function assertPeerLegacyOriginReady(provider){legacyOriginHold(control(trackedReads(provider)));}
function ordinaryOriginFrom(tx,action,task=null){
 const c=control(tx);if(!['legacy_source_cut_sha256','legacy_backup','legacy_ready'].some(k=>Object.hasOwn(c.value,k)))return null;
 const q=task?.value?.definition?.origin_qualification_ref??(!task?c.value.ordinary_origin_qualification_ref:null);if(!q)legacyOriginHold(c);const cache=tx[ordinaryProofKey],k=canonical(q);let proof=cache?.get(k);if(!proof){if(tx[ordinaryGetOnlyKey]||!['getVersion','events','list'].every(method=>typeof tx[method]==='function'))hold('ORIGIN_ORDINARY_TASK_PREWRITE_PROOF_REQUIRED','Full original readiness must precede a get-only guard');proof=assertPeerOrdinaryOriginReadyFrom(tx,{source_handle:ordinarySource(tx),action,qualification_ref:q,...(task?{subject_ref:ref('tasks',task)}:{})});cache?.set(k,proof);}
 assertOriginalOrdinaryTaskSourceTupleFrom(proof.source_tuple);if(task){const t=task.value;if(!same(t.origin_qualification_ref,q)||!same(t.definition?.origin_qualification_ref,q)||digest(t.definition)!==t.definition_sha256||proof.scope!=='*'&&proof.scope!==t.scope||!t.resources.every(r=>proof.resources.some(p=>same(p,r))))hold('ORIGIN_ORDINARY_TASK_SCOPE_CHANGED','Exact immutable task qualification and scope required');}return proof;
}
function member(tx,actor){
  if(!actor||typeof actor!=='object'||Object.keys(actor).length!==1||!Object.hasOwn(actor,'principal_id'))hold('AUTHENTICATION_REQUIRED','Use only a trusted-internal principal reference');
  const row=tx.get('principals',text(actor.principal_id,'principal_id',200));if(row?.value.status!=='active')hold('PRINCIPAL_INACTIVE','Principal is inactive');return row;
}
const trusted=p=>p.value.kind==='scheduler';
const founder=(c,p)=>p.id===c.value.founder_principal_id&&p.value.kind==='founder';
// Read-only software currentness assertion, not an authentication/minting API.
// Authorizing paths additionally bind the real ledger and original producer.
export function assertPeerProductionAuthority(tx,expected,ledger=null){
  if(!expected||Object.keys(expected).sort().join(',')!=='company_id,founder,legacy_owner,protocol,root_sha256'||expected.protocol!=='peer-production-authority-v1'||typeof expected.company_id!=='string'||!/^[a-f0-9]{64}$/.test(expected.root_sha256??''))hold('PRODUCTION_OWNER_CHANGED','Original production owner seal required');
  const reference=exactReference(expected.founder),legacy=expected.legacy_owner;
  if(reference.family!=='principals'||!legacy||Object.keys(legacy).sort().join(',')!=='epoch,host,session_id'||!['codex','claude'].includes(legacy.host)||typeof legacy.session_id!=='string'||!legacy.session_id.trim()||!Number.isSafeInteger(legacy.epoch)||legacy.epoch<1)hold('PRODUCTION_OWNER_CHANGED','Original adopted owner identity required');
  const c=control(tx),principal=tx.get('principals',reference.id);
  if(ledger&&(ledger.company_id!==expected.company_id||digest(ledger.root)!==expected.root_sha256)||c.value.founder_principal_id!==reference.id||principal?.value.kind!=='founder'||principal.value.status!=='active'||!same(ref('principals',principal),reference)||!principal.value.legacy_owner||!same(principal.value.legacy_owner,legacy)||principal.value.host!==legacy.host)hold('PRODUCTION_OWNER_CHANGED','Production runtime owning founder changed');
}
const scopeOf=v=>{
  const scope=v===undefined||v===null?'*':text(v,'scope',160);
  // SQLite TEXT and indexed selectors require Unicode scalar text. Under /u,
  // this matches isolated UTF-16 surrogates, not valid non-BMP code points.
  if(/[\ud800-\udfff]/u.test(scope))hold('INVALID_INPUT','scope requires well-formed Unicode scalar text');
  return scope;
};
const scopeInputActions=new Set(['grant/create','task/submit','task/assign','home/propose','conflict/create','notice/create','message/send']);
function policy(c){
  const p=c.value.policy;
  if(!p||!Number.isSafeInteger(p.worker_cap)||p.worker_cap<1||p.worker_cap>3||!Number.isSafeInteger(p.queue_limit)||p.queue_limit<1||p.queue_limit>MAX_ROWS||!Number.isSafeInteger(p.principal_queue_limit)||p.principal_queue_limit<1||p.principal_queue_limit>p.queue_limit||!Number.isSafeInteger(p.max_context_bytes)||p.max_context_bytes<512||p.max_context_bytes>200000||!Number.isSafeInteger(p.max_model_calls)||p.max_model_calls<1||p.principal_model_calls!==undefined&&(!Number.isSafeInteger(p.principal_model_calls)||p.principal_model_calls<1))hold('POLICY_INVALID','Finite bounded execution policy required');return p;
}
function resolve(tx,r){
  if(!r||typeof r.family!=='string'||typeof r.id!=='string'||!Number.isSafeInteger(r.revision)||r.revision<1||!/^[a-f0-9]{64}$/.test(r.sha256??''))hold('SOURCE_INVALID','Exact family/id/revision/hash required');
  const row=tx.get(r.family,r.id);if(!row||row.revision!==r.revision||row.sha256!==r.sha256)hold('SOURCE_CHANGED',`Exact source changed: ${r.family}/${r.id}`);return preparationBudget(tx).retain(r.family,row);
}
const semanticFamilies=new Set(['tasks','homes','proposals','reviews','conflicts','notices','messages','deliveries']);
function exactReference(r){
  if(!r||typeof r.family!=='string'||typeof r.id!=='string'||!r.id||!Number.isSafeInteger(r.revision)||r.revision<1||!/^[a-f0-9]{64}$/.test(r.sha256??''))hold('SOURCE_INVALID','Exact family/id/revision/hash required');
  return {family:r.family,id:r.id,revision:r.revision,sha256:r.sha256};
}
function semanticReference(r){const value=exactReference(r);if(!semanticFamilies.has(value.family))hold('SOURCE_INVALID','Unsupported semantic evidence family: '+value.family);return value;}
function semanticInputs(tx,values=[]){
  if(!Array.isArray(values)||values.length>100)hold('SOURCE_INVALID','At most 100 semantic input refs');
  for(const r of values)resolve(tx,semanticReference(r));return values;
}
function repository(input){let v=text(input,'repository',500).replace(/\/$/,'').replace(/\.git$/i,'');if(v.startsWith('https://github.com/'))v=v.slice(19);else if(v.startsWith('git@github.com:'))v=v.slice(15);if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v)||v.split('/').some(p=>['.','..'].includes(p)))hold('RESOURCE_INVALID','Invalid repository');return v.toLowerCase();}
function relative(input){const v=text(input,'path',1000);if(v.startsWith('/')||/[\\%\u0000]/.test(v)||v.split('/').includes('..'))hold('RESOURCE_INVALID','Invalid relative resource path');const result=v.split('/').filter(p=>p&&p!=='.').join('/');if(!result)hold('RESOURCE_INVALID','Use worktree resource for root');return result;}
function parseResource(tx,input){
  let v=input;if(typeof v==='string'){let m;if((m=/^repo:(.+)$/.exec(v)))v={kind:'repo',repository:m[1]};else if((m=/^ref:([^:]+):(.+)$/.exec(v)))v={kind:'ref',repository:m[1],ref:m[2]};else if((m=/^worktree:([^:]+)$/.exec(v)))v={kind:'worktree',worktree_id:m[1]};else if((m=/^path:([^:]+):(.+)$/.exec(v)))v={kind:'path',worktree_id:m[1],path:m[2]};else if((m=/^home:([^:]+)$/.exec(v)))v={kind:'home',id:m[1]};else hold('RESOURCE_INVALID','Unknown resource');}
  if(!v||typeof v!=='object'||Array.isArray(v))hold('RESOURCE_INVALID','Typed resource required');
  if(v.kind==='home'){const id=text(v.id,'home id',200);if(id.includes(':'))hold('RESOURCE_INVALID','Invalid home id');return {kind:'home',id,key:`home:${id}`};}
  if(v.kind==='repo'){const repo=repository(v.repository);return {kind:'repo',repository:repo,key:`repo:${repo}`};}
  if(v.kind==='ref'){const repo=repository(v.repository),branch=text(v.ref,'ref',300);if(!branch.startsWith('refs/heads/')||/[\s\\%~^:?*\[\u0000]/.test(branch)||branch.includes('..')||branch.includes('@{')||branch.endsWith('/')||branch.endsWith('.lock')||branch.split('/').some(p=>!p||p==='.'||p.endsWith('.')))hold('RESOURCE_INVALID','Exact branch ref required');return {kind:'ref',repository:repo,ref:branch,key:`ref:${repo}:${branch}`};}
  if(['path','worktree'].includes(v.kind)){const id=text(v.worktree_id,'worktree',200),matches=(tx.get('control','resources')?.value.worktrees??[]).filter(w=>w.id===id||w.aliases?.includes(id));if(matches.length!==1)hold('RESOURCE_INVALID','Unregistered or ambiguous worktree');const tree=matches[0],repo=repository(tree.repository);if(v.repository&&repository(v.repository)!==repo)hold('RESOURCE_INVALID','Worktree repository changed');if(v.kind==='worktree')return {kind:'worktree',worktree_id:tree.id,repository:repo,key:`worktree:${tree.id}`};const p=relative(v.path);return {kind:'path',worktree_id:tree.id,repository:repo,path:p,key:`path:${tree.id}:${p}`};}
  hold('RESOURCE_INVALID','Unknown resource kind');
}
export function canonicalResources(tx,input=[]){if(!Array.isArray(input)||input.length>32)hold('RESOURCE_INVALID','At most 32 resources');return [...new Map(input.map(v=>{const r=parseResource(tx,v);return [r.key,r];})).values()].sort((a,b)=>order(a.key,b.key));}
export function resourceOverlap(a,b){if(a.key===b.key)return true;if(a.kind==='repo'||b.kind==='repo')return Boolean(a.repository&&a.repository===b.repository);if(a.worktree_id&&a.worktree_id===b.worktree_id)return a.kind==='worktree'||b.kind==='worktree'||a.kind==='path'&&b.kind==='path'&&(a.path.startsWith(b.path+'/')||b.path.startsWith(a.path+'/'));return false;}
function contains(a,b){return a.key===b.key||a.kind==='repo'&&a.repository===b.repository||a.worktree_id&&a.worktree_id===b.worktree_id&&(a.kind==='worktree'||a.kind==='path'&&b.kind==='path'&&b.path.startsWith(a.path+'/'));}
export function authorize(tx,actor,action,args={},originalTask=null){
  const c=control(tx),p=member(tx,actor);policy(c);
  if(['task/submit','task/claim'].includes(action))ordinaryOriginFrom(tx,action,originalTask);else if(action==='home/publish'||action.startsWith('github/'))legacyOriginHold(c);
  if(c.value.paused&&(['task/submit','task/claim','home/publish'].includes(action)||action.startsWith('github/')))hold('PAUSED','Pause fences admission and publication');
  // Required notices are a role right, not discretionary grant authority.
  if(action==='notice/create')return {control:c,principal:p,grant:null};
  if(founder(c,p)||trusted(p)&&action.startsWith('task/'))return {control:c,principal:p,grant:null};
  const g=tx.get('grants',text(args.grant_id,'grant_id',200)),scope=scopeOf(args.scope),v=g?.value;
  if(!v||v.status!=='active'||v.principal_id!==p.id||!Number.isSafeInteger(v.generation)||v.generation<1||v.policy_generation!==c.value.policy_generation||!Number.isFinite(Date.parse(v.expires_at))||Date.parse(v.expires_at)<=Date.now()||!['*',scope].includes(v.scope)||!v.actions?.some(a=>a==='*'||a===action||a.endsWith('/*')&&action.startsWith(a.slice(0,-1))))hold('GRANT_INVALID','Current scoped grant required');
  if(args.grant_generation!==undefined&&args.grant_generation!==v.generation)hold('GRANT_CHANGED','Grant generation changed');
  const resources=canonicalResources(tx,args.resources??(args.resource?[args.resource]:[]));if(resources.some(r=>!v.resources?.some(b=>contains(b,r))))hold('RESOURCE_AUTHORITY','Resource is outside grant');
  currentAuthorizationGrants.get(tx)?.set(g.id,{reference:ref('grants',g),expires_at_ms:Date.parse(v.expires_at)});
  return {control:c,principal:p,grant:g};
}
function taskAuthority(tx,actor,t,action){const c=control(tx),p=member(tx,actor);if(trusted(p))return {control:c,principal:p,grant:null};if(t.value.owner_principal_id!==p.id&&!founder(c,p))hold('TASK_OWNER','Different accountable owner');return authorize(tx,actor,action,{grant_id:t.value.grant_id,grant_generation:t.value.grant_generation,scope:t.value.scope,resources:t.value.resources},t);}
function qualifiedTaskRecipient(tx,principal){
  const p=principal.value,connection=taskAssignmentConnections.get(tx);
  if(!connection)hold('AUTHENTICATION_REQUIRED','Owning task assignment connection required');
  if(!['cos','reviewer','specialist'].includes(p.kind)||!p.enrollment_id||!p.membership_qualification)hold('QUALIFICATION_REQUIRED','An activated qualified peer recipient is required');
  const qualification=exactReference(p.membership_qualification);
  if(qualification.family!=='work_items')hold('QUALIFICATION_REQUIRED','Exact membership qualification required');
  const q=resolve(tx,qualification),e=tx.get('work_items',`membership:${text(p.enrollment_id,'enrollment id',200)}`),index=tx.get('work_items',`membership-index:${principal.id}`),v=e?.value;
  if(v?.kind!=='membership_enrollment'||v.status!=='activated'||v.connection_sha256!==peerDigest(connection)||v.enrollment_id!==p.enrollment_id||v.principal_id!==principal.id||v.generation!==p.generation||v.role!==p.kind||v.host!==p.host||!same(v.activation?.principal,ref('principals',principal))||!same(v.activation?.qualification,qualification)||index?.value.kind!=='membership_index'||index.value.status!=='activated'||index.value.principal_id!==principal.id||index.value.enrollment_id!==p.enrollment_id)hold('QUALIFICATION_REQUIRED','Exact activated peer membership required');
  const reconstruction=exactReference(v.activation.reconstruction);
  if(reconstruction.family!=='work_items')hold('QUALIFICATION_REQUIRED','Exact membership reconstruction required');
  const r=resolve(tx,reconstruction),review=q.value;
  if(r.value.kind!=='membership_reconstruction'||r.value.status!=='returned'||r.value.termination_confirmed!==true||r.value.membership_id!==p.enrollment_id||r.value.principal_id!==principal.id||r.value.generation!==p.generation||r.value.native_id!==p.native_id||review.kind!=='membership_qualification'||review.status!=='returned'||review.termination_confirmed!==true||review.membership_id!==p.enrollment_id||review.review?.verdict!=='Pass'||!same(review.review.subject,reconstruction)||review.principal_id===principal.id||review.native_id===p.native_id)hold('QUALIFICATION_REQUIRED','Exact completed independent membership Pass required');
  return principal;
}
function grantBinding(g){const {used_model_calls,...value}=g.value;return {id:g.id,value};}
function claimResources(tx,t){const held=all(tx,'claims',{status:'held'});for(const resource of t.value.resources){if(held.some(r=>r.value.task_id!==t.id&&resourceOverlap(r.value.resource,resource)))hold('RESOURCE_BUSY','Overlapping resource claim');}for(const resource of t.value.resources){const id=digest(['claim',t.id,resource.key]),old=tx.get('claims',id);if(old?.value.status!=='held')tx.put('claims',id,{task_id:t.id,principal_id:t.value.owner_principal_id,scope:t.value.scope,resource,status:'held',definition_revision:t.value.definition_revision},old?.revision??0);}}
function releaseClaims(tx,t,closed){if(!closed)hold('CLOSURE_REQUIRED','Protected process closure required');if(all(tx,'effects',{task_id:t.id,status:outstanding}).length)return;for(const row of all(tx,'claims',{task_id:t.id,status:'held'}))tx.put('claims',row.id,{...row.value,status:'released',closure:{termination_confirmed:true,at:now()}},row.revision);}
function scoped(tx,f,scope,status){const values=new Map();for(const s of new Set(['*','unknown',scope]))for(const row of all(tx,f,{scope:s,status}))values.set(row.id,row);return [...values.values()].sort((a,b)=>order(a.id,b.id));}

// A protocol string alone is insufficient. The persisted record must bind the
// protected observation, exact returned task, output, native identity and review.
function observedReview(tx,row,{pending=false}={}){
  try{
    const graph=evidenceAnalysis(tx);graph.historical([ref('reviews',row)]);
    if(pending)member(tx,{principal_id:row.value.reviewer_principal_id});
    return true;
  }catch(error){if(readFailure(tx,error)||['SOURCE_CHANGED','SOURCE_INVALID','LOOKUP_CAPACITY','CONTEXT_CAPACITY'].includes(error.code))throw error;return false;}
}
function homeBinding(id,value){return digest({id,scope:scopeOf(value.scope),content:value.content,dependencies:value.dependencies??[]});}
// Scope discovery runs once before omission. Exact subject queries add only
// newly discovered current relationships; no full-family fallback is permitted.
function currentReviewRows(tx,budget=semanticBudget(tx)){
  const rows=new Map(),candidates=new Map(),scopes=new Set(),subjects=new Map(),loadedScopes=new Set(),loadedSubjects=new Set(),prep=preparationBudget(tx);
  let generation=tx[reviewGenerationKey]?.()??0;
  const load=selectors=>{
    if(typeof tx.queryCurrentReviews!=='function')hold('REVIEW_SELECTION_CAPABILITY','Indexed current review selection is required');
    let cursor,total;const seen=new Set();
    for(;;){
      prep.before('reviews');const page=tx.queryCurrentReviews({...selectors,limit:16,...(cursor?{cursor}:{})});
      if(page?.recipe!==REVIEW_SELECTION_RECIPE||!Array.isArray(page.items)||page.items.length>16||typeof page.complete!=='boolean'||!Number.isSafeInteger(page.total)||page.total<0||page.total>MAX_ROWS||total!==undefined&&total!==page.total)hold('LOOKUP_INCOMPLETE','Invalid indexed review page');total=page.total;
      for(const raw of page.items){const exact=ref('reviews',raw);budget(exact);const row=prep.retain('reviews',raw),old=rows.get(row.id);if(seen.has(row.id)||old&&!same(ref('reviews',old),exact))hold('LOOKUP_INCOMPLETE','Indexed review identity changed or repeated');seen.add(row.id);rows.set(row.id,row);if(rows.size>MAX_ROWS)hold('LOOKUP_CAPACITY','10,000 aggregate selected-review bound exceeded');}
      if(page.complete){if(seen.size!==total)hold('LOOKUP_INCOMPLETE','Indexed review membership is incomplete');break;}
      if(!page.items.length||!page.next_cursor||page.next_cursor===cursor)hold('LOOKUP_INCOMPLETE','Nonprogressing indexed review cursor');cursor=page.next_cursor;
    }
  };
  const acquire=()=>{
    if(typeof tx.queryCurrentReviews!=='function')hold('REVIEW_SELECTION_CAPABILITY','Indexed current review selection is required');
    prep.before('reviews');const eligibility=tx.queryCurrentReviews({subjects:[],scopes:[],limit:1});
    if(eligibility?.recipe!==REVIEW_SELECTION_RECIPE||eligibility.total!==0||eligibility.complete!==true||eligibility.next_cursor!==null||!Array.isArray(eligibility.items)||eligibility.items.length)hold('LOOKUP_INCOMPLETE','Indexed review snapshot eligibility is unproven');
    const current=tx[reviewGenerationKey]?.()??0;
    if(current!==generation){generation=current;rows.clear();candidates.clear();loadedScopes.clear();loadedSubjects.clear();}
    for(const scope of scopes)if(!loadedScopes.has(scope)){load({subjects:[],scopes:[scope]});loadedScopes.add(scope);}
    const pending=[...subjects].filter(([key])=>!loadedSubjects.has(key));
    for(let i=0;i<pending.length;i+=100){const batch=pending.slice(i,i+100);load({subjects:batch.map(([,r])=>r),scopes:[]});for(const [key] of batch)loadedSubjects.add(key);}
  };
  const get=()=>{acquire();return [...rows.values()];};get.budget=budget;
  get.scope=scope=>{scopes.add(reviewScope(scope));acquire();return get;};
  get.subjects=refs=>{for(const r of refs){const exact=semanticReference(r);budget(exact);subjects.set(canonical(exact),exact);}acquire();return get;};
  get.adverse=()=>{acquire();for(const row of rows.values()){const key=canonical(ref('reviews',row));if(!candidates.has(key))candidates.set(key,reviewCandidate(tx,row,budget));}return [...candidates.values()].filter(Boolean);};return get;
}
function currentInputSubjects(tx,inputs,budget){
  const selected=new Map(),scheduled=new Set(),pending=[],prep=preparationBudget(tx);
  const enqueue=(r,row)=>{const key=canonical(r);if(scheduled.has(key))return;budget(r);scheduled.add(key);selected.set(key,r);pending.push({reference:r,row});};
  for(const input of inputs)enqueue(input.reference,input.row);
  while(pending.length){
    const {reference:r,row:known}=pending.pop();prep.before(r.family);
    const head=known??tx.get(r.family,r.id);
    // Discovery supplies no seal or absence proof. Missing, stale or malformed
    // branches remain for the original final CURRENT gate to reject.
    if(!head||!same(ref(r.family,head),r))continue;
    const row=prep.retain(r.family,head),v=row.value;if(!v||typeof v!=='object'||Array.isArray(v))continue;
    let groups=[],singles=[];
    if(r.family==='tasks'){
      const d=v.definition;if(!d||typeof d!=='object'||Array.isArray(d)||['input_refs','review_of','parent_task_id','parent_ref'].some(k=>!Object.hasOwn(d,k)||!Object.hasOwn(v,k)||!same(d[k],v[k])))continue;
      if(d.parent_task_id===null?d.parent_ref!==null:!d.parent_ref||d.parent_ref.id!==d.parent_task_id)continue;
      groups=[d.input_refs];singles=[d.review_of,d.parent_ref];
    }else if(r.family==='proposals'){groups=[v.readset??[],v.dependencies??[]];singles=[v.base];}
    else if(r.family==='homes'){groups=[v.dependencies??[]];}
    else if(r.family==='conflicts'){groups=[v.input_refs??[],v.resolution?.evidence??[]];}
    // Review and delivery proof links, home.previous and publication history
    // are HISTORICAL edges, never intake LIVE dependency expansion.
    if(groups.some(g=>!Array.isArray(g)||g.length>MAX_ROWS))continue;
    const raw=[...groups.flat(),...singles.filter(Boolean)],children=[];let valid=true;
    for(const value of raw){try{const child=semanticReference(value);if(r.family==='homes'&&child.family!=='homes'){valid=false;break;}children.push(child);}catch(error){if(error.code!=='SOURCE_INVALID')throw error;valid=false;break;}}
    if(valid)for(const child of children)enqueue(child);
  }
  return [...selected.values()];
}
const adverseReview=row=>['Fail','Blocked'].includes(row.value.verdict);
function reviewCandidate(tx,row,budget){
  const r=row.value;let subject=r.subject,scope=r.scope,negative=adverseReview(row),error=null;
  try{
    budget(ref('reviews',row));
    const reference=exactReference(r.proof?.task);
    if(reference.family!=='tasks'||typeof tx.getVersion!=='function')hold('LINEAGE_REQUIRED','Exact protected review task required');
    budget(reference);
    const stored=tx.getVersion(reference);
    if(!stored||stored.family!=='tasks'||stored.id!==reference.id||stored.revision!==reference.revision||stored.sha256!==reference.sha256||peerDigest(stored.value)!==reference.sha256)hold('LINEAGE_REQUIRED','Exact protected review task changed');
    const task=preparationBudget(tx).retain('tasks',stored,{historical:true});
    const raw=task.value.result?.output;let parsed;
    try{parsed=JSON.parse(raw);}catch{hold('LINEAGE_REQUIRED','Protected review raw output missing');}
    // Derive relevance from the protected production, before trusting mutable
    // aliases on the review row. A claimed Pass cannot conceal an observed Fail.
    if(['Fail','Blocked'].includes(parsed?.review?.verdict))negative=true;
    scope=task.value.definition?.scope??task.value.scope;
    const actual=parseReview(raw,parsed?.review?.subject);subject=actual.subject;budget(semanticReference(subject));
    if(negative)evidenceAnalysis(tx,budget).reviewSeal(row);
  }catch(cause){if(readFailure(tx,cause)||['LOOKUP_CAPACITY','CONTEXT_CAPACITY'].includes(cause.code))throw cause;error=cause.code?cause:Object.assign(Error('Protected adverse review binding is invalid'),{code:'LINEAGE_REQUIRED'});}
  return negative?{row,subject,scope,error}:null;
}
function qualifiedHome(tx,row,budget){
  try{
    if(!row.value.scope_qualification)return false;
    const graph=evidenceAnalysis(tx,budget);graph.current([ref('homes',row)]);graph.historical([ref('homes',row)]);
    const seal=graph.homeSeal(row);if(!seal)return false;
  }catch(error){if(readFailure(tx,error)||['LOOKUP_CAPACITY','CONTEXT_CAPACITY'].includes(error.code))throw error;return false;}
  return true;
}
function sources(tx,scope,input=[],reviewRows=currentReviewRows(tx)){
  const budget=reviewRows.budget;
  const currentHomes=all(tx,'homes',{status:'current'}),inputs=input.map(r=>{const exact=semanticReference(r);return {reference:exact,row:resolve(tx,exact)};});
  const liveInputs=currentInputSubjects(tx,inputs,budget);
  // Build the exact CURRENT dependency DAG once. Completed nodes are shared
  // across roots; a second revision of the same id still resolves separately.
  const nodes=new Map(),done=new Set(),active=new Set(),ordered=[];
  const roots=[...currentHomes,...inputs.filter(v=>v.reference.family==='homes').map(v=>v.row)];
  const stack=roots.slice().reverse().map(row=>({reference:ref('homes',row),row,exit:false}));
  while(stack.length){
    const frame=stack.pop(),r=frame.reference,key=budget(r);
    if(frame.exit){active.delete(key);done.add(key);ordered.push(nodes.get(key));continue;}
    if(active.has(key))hold('DEPENDENCY_CYCLE','Home dependency cycle');
    if(done.has(key))continue;
    const row=frame.row??resolve(tx,r);
    if(nodes.size>=MAX_ROWS)hold('LOOKUP_CAPACITY','10,000 exact home dependency-reference bound exceeded');
    const dependencies=row.value.dependencies??[];
    if(!Array.isArray(dependencies)||dependencies.length>MAX_ROWS)hold('DEPENDENCY_INVALID','Bounded home dependencies required');
    const children=dependencies.map(d=>{if(d?.family!=='homes')hold('DEPENDENCY_INVALID','Home dependencies must name homes');return exactReference(d);});
    let proposal=null;try{if(row.value.proposal?.family==='proposals')proposal=exactReference(row.value.proposal);}catch{}
    nodes.set(key,{row,reference:r,children,proposal,adverse:false});active.add(key);stack.push({...frame,exit:true});
    for(let i=children.length-1;i>=0;i--)stack.push({reference:children[i],exit:false});
  }
  // Current adverse records are indexed by exact subjects before any home can
  // be omitted. Historical previous/base edges never propagate a live veto.
  reviewRows.scope(scope).subjects([...nodes.values()].flatMap(node=>[node.reference,...(node.proposal?[node.proposal]:[])]).concat(liveInputs));
  const reviews=[],bySubject=new Map(),applicable=new Set();
  const knownReviews=new Set(),refreshReviews=()=>{
    for(const candidate of reviewRows.adverse()){
      const {row}=candidate;if(knownReviews.has(row.id))continue;
      const applies=['*','unknown',scope].includes(scopeOf(candidate.scope));let subject;
      try{subject=semanticReference(candidate.subject);}catch(error){if(applies)throw error;continue;}
      const key=canonical(subject),entry={...candidate,subject};knownReviews.add(row.id);reviews.push(entry);
      if(!bySubject.has(key))bySubject.set(key,[]);bySubject.get(key).push(entry);
      if(applies)applicable.add(row.id);
    }
  };refreshReviews();
  for(const node of ordered)node.adverse=bySubject.has(canonical(node.reference))||Boolean(node.proposal&&bySubject.has(canonical(node.proposal)))||node.children.some(r=>nodes.get(canonical(r)).adverse);
  const homes=new Map(),bodyHomes=new Map(),selectionDone=new Map();
  const select=(selected,rows)=>{
    if(!selectionDone.has(selected))selectionDone.set(selected,new Set());
    const seen=selectionDone.get(selected),pending=rows.map(row=>ref('homes',row));
    while(pending.length){const r=pending.pop(),key=canonical(r);if(seen.has(key))continue;seen.add(key);const node=nodes.get(key);selected.set(node.row.id,node.row);for(const d of node.children)pending.push(d);}
  };
  select(homes,currentHomes.filter(h=>['*','unknown',scope].includes(scopeOf(h.value.scope))||nodes.get(canonical(ref('homes',h))).adverse||!qualifiedHome(tx,h,budget)));
  for(const [id,row] of homes)bodyHomes.set(id,row);
  // Explicit home inputs also supply their current dependency bodies. These
  // extra bodies retain the existing homes/notices/conflicts membership shape.
  select(bodyHomes,inputs.filter(v=>v.reference.family==='homes').map(v=>v.row));
  const relevant=new Set(liveInputs.map(canonical));
  const refresh=()=>{const refs=[];for(const row of bodyHomes.values()){const node=nodes.get(canonical(ref('homes',row)));relevant.add(canonical(node.reference));refs.push(node.reference);if(node.proposal){relevant.add(canonical(node.proposal));refs.push(node.proposal);}}reviewRows.subjects(refs);refreshReviews();};
  refresh();
  const selectedReviews=new Map(),discovery=evidenceAnalysis(tx,budget);
  for(;;){
    let changed=false;
    for(const entry of reviews)if(!selectedReviews.has(entry.row.id)&&(applicable.has(entry.row.id)||relevant.has(canonical(entry.subject)))){
      if(entry.error)throw entry.error;
      selectedReviews.set(entry.row.id,entry);changed=true;
      // Discover CURRENT home relationships through the exact typed subject.
      // Historical-only home versions stop here; they never select successors.
      const implicated=discovery.implicatedHomes([entry.subject]);
      select(homes,implicated);select(bodyHomes,implicated);refresh();
    }
    if(!changed)break;
  }
  const groups={homes:[...homes.values()].sort((a,b)=>order(a.id,b.id)),notices:scoped(tx,'notices',scope,['pending','resolved']),conflicts:scoped(tx,'conflicts',scope,'open')},values=new Map();
  for(const [family,items] of Object.entries(groups))for(const row of items)values.set(canonical([family,row.id]),{...ref(family,row),value:copy(row.value)});
  for(const row of bodyHomes.values())values.set(canonical(['homes',row.id]),{...ref('homes',row),value:copy(row.value)});
  for(const {row,subject} of selectedReviews.values()){
    // A scoped review of an older subject remains retrievable history. Do not
    // place that old home version in a strict-current proposal readset or map
    // it to a successor merely because the bare home id matches.
    const current=tx.get(subject.family,subject.id);let target=current;
    if(!current||!same(ref(subject.family,current),subject)){
      if(typeof tx.getVersion!=='function')hold('LINEAGE_REQUIRED','Exact adverse subject history reader required');
      target=tx.getVersion(subject);
    }
    if(!target||target.id!==subject.id||target.revision!==subject.revision||target.sha256!==subject.sha256||peerDigest(target.value)!==subject.sha256)hold('LINEAGE_REQUIRED','Exact adverse subject history missing or changed');
    values.set(canonical(['reviews',row.id]),{...ref('reviews',row),value:copy(row.value)});
  }
  for(const {reference:r,row} of inputs)values.set(canonical([r.family,r.id]),{...ref(r.family,row),value:copy(row.value)});
  for(const entry of values.values())budget(entry);
  for(const entry of values.values())if(entry.value.source?.kind==='legacy'){if(!tx.resolveLegacy)hold('LEGACY_SOURCE_MISSING','Legacy resolver required');entry.legacy_value=tx.resolveLegacy({sha256:entry.value.source.sha256});if(entry.legacy_value===undefined)hold('LEGACY_SOURCE_MISSING','Missing legacy source');}
  return {sources:[...values.values()].sort((a,b)=>order(canonical([a.family,a.id]),canonical([b.family,b.id]))),membership:Object.fromEntries(Object.entries(groups).map(([f,items])=>[f,items.map(r=>ref(f,r))]))};
}
function taskHandoffAliases(task){
  const t=task.value,d=t.definition;
  for(const field of ['handoff_ref','handoff_envelope'])if(Object.hasOwn(t,field)!==Object.hasOwn(d??{},field)||Object.hasOwn(t,field)&&!same(t[field],d[field]))hold('DEFINITION_CHANGED','Original task handoff aliases changed');
  if(Object.hasOwn(t,'handoff_ref')!==Object.hasOwn(t,'handoff_envelope'))hold('DEFINITION_CHANGED','Complete original task handoff required');
  return Object.hasOwn(t,'handoff_ref');
}
function taskHandoff(tx,receiver,task){
  if(!taskHandoffAliases(task))return null;
  const bindings=new Map(),view={...tx,get(family,id){
    const row=tx.get(family,id);bindings.set(canonical([family,id]),{family,id,reference:row?ref(family,row):null});return row;
  }};
  const prepared=prepareHandoffTask(Object.freeze(view),receiver,task.value.handoff_ref),t=task.value;
  if(scopeOf(prepared.handoff_envelope.value.scope)!==t.scope||!same(prepared.handoff_ref,t.handoff_ref)||!same(prepared.handoff_envelope,t.handoff_envelope))hold('HANDOFF_SCOPE','Task must retain its exact intended handoff and scope');
  if(!Array.isArray(t.input_refs))hold('DEFINITION_CHANGED','Complete task input references required');
  const supplied=new Set(t.input_refs.map(r=>canonical(semanticReference(r))));
  if(prepared.input_refs.some(r=>!supplied.has(canonical(semanticReference(r)))))hold('DEFINITION_CHANGED','Task lost required handoff evidence');
  if(prepared.decision_ref){
    const decision=view.get(prepared.decision_ref.family,prepared.decision_ref.id)?.value,binding=decision?.task_effect;
    if(!t.attempt||decision?.task_id!==task.id||decision.attempt_id!==t.attempt.id||binding?.protocol!=='peer-task-effect-binding-v1'||binding.task_id!==task.id||binding.attempt_id!==t.attempt.id||binding.context_sha256!==t.attempt.context?.sha256)hold('HANDOFF_DECIDED','Handoff already has another receiver decision');
  }
  return {...prepared,bindings:[...bindings.values()]};
}
function checkCurrentBindings(tx,bindings){
  for(const expected of bindings??[]){
    const row=tx.get(expected.family,expected.id);
    if(expected.reference?(!row||!same(ref(expected.family,row),expected.reference)):row!==null&&row!==undefined)hold('AUTHORITY_CHANGED','Original checked task handoff source changed before commit');
  }
}
function ownerOperatingBinding(tx,action){
  const bindings=new Map(),view={...tx,get:(family,id)=>{
    const row=tx.get(family,id);
    bindings.set(canonical([family,id]),{family,id,reference:row?ref(family,row):null});
    return row;
  }};
  // Immutable history is verified only before real writes. The physical guard
  // subsequently rechecks these current heads with its get-only provider.
  const state=assertPeerOwnerOperatingState(view,action);
  return {state,bindings:state.controlled?[...bindings.values()]:null};
}
export function buildContext(tx,actor,task){
  tx=trackedReads(tx);
  const p=member(tx,actor),c=control(tx),t=task?.value;if(!t)hold('TASK_MISSING','Exact task required');if(p.id!==t.owner_principal_id&&!trusted(p)&&!founder(c,p))hold('TASK_OWNER','Task owner required');
  if(!t.definition||digest(t.definition)!==t.definition_sha256)hold('DEFINITION_CHANGED','Exact original task definition required');
  const owner=member(tx,{principal_id:t.owner_principal_id}),auth=authorize(tx,{principal_id:owner.id},'task/submit',{grant_id:t.grant_id,grant_generation:t.grant_generation,scope:t.scope,resources:t.resources},task);
  taskHandoff(tx,owner,task);
  const ordinary=ordinaryOriginFrom(tx,'task/context',task);
  const selected=sources(tx,t.scope,[...(t.input_refs??[]),...(t.review_of?[t.review_of]:[]),...(t.parent_ref?[t.parent_ref]:[])]);
  const body={protocol:'peer-task-context-v1',control:{policy_generation:c.value.policy_generation,pause_generation:c.value.pause_generation,paused:c.value.paused,governance_sha256:c.value.governance_sha256??null,policy:policy(c)},principal:ref('principals',owner),grant:auth.grant?grantBinding(auth.grant):{founder_principal_id:owner.id},...(ordinary?{ordinary_origin:peerOrdinaryOriginCompulsoryContext(ordinary)}:{}),task:{id:task.id,definition_revision:t.definition_revision,definition_sha256:t.definition_sha256,definition:t.definition,owner_principal_id:t.owner_principal_id,grant_id:t.grant_id,grant_generation:t.grant_generation},...selected};
  const encoded=canonical(body),size=Buffer.byteLength(encoded);if(size>policy(c).max_context_bytes)hold('CONTEXT_CAPACITY','Complete required context exceeds policy; no attempt consumed');return {...body,text:encoded,sha256:digest(encoded),hash:digest(encoded),utf8_bytes:size};
}
function originalTaskDefinition(tx,task){
  if(!Number.isSafeInteger(task.created_seq)||task.created_seq<1)hold('DEFINITION_CHANGED','Original task creation metadata required');
  const event=tx.events({after:task.created_seq-1,limit:1}).items[0];
  const changes=event?.payload?.changes?.filter(change=>change.family==='tasks'&&change.id===task.id&&change.revision===1);
  if(event?.seq!==task.created_seq||!['task/submit','task/assign'].includes(event.type)||changes?.length!==1)hold('DEFINITION_CHANGED','Original task creation event required');
  const original=tx.getVersion(ref('tasks',changes[0]))?.value,current=task.value;
  if(!original||original.definition_revision!==current.definition_revision||original.definition_sha256!==current.definition_sha256||!same(original.definition,current.definition)||digest(original.definition)!==original.definition_sha256)hold('DEFINITION_CHANGED','Immutable original task definition changed');
  return original.definition_revision;
}
function originalTaskAdmission(tx,task){
  const t=task.value,a=t.attempt,effectId=digest(['native-effect',task.id,t.definition_revision]),effect=tx.get('effects',effectId);
  if(!a||effect?.value.kind!=='native'||effect.value.task_id!==task.id||!Number.isSafeInteger(effect.created_seq))hold('TASK_ADMISSION_REQUIRED','Original native admission required');
  const event=tx.events({after:effect.created_seq-1,limit:1}).items[0],changes=event?.payload?.changes?.filter(c=>c.family==='commands');
  if(event?.seq!==effect.created_seq||event.type!=='task/admit'||changes?.length!==1)hold('TASK_ADMISSION_REQUIRED','Original scheduler admission event required');
  const command=tx.getVersion(ref('commands',changes[0])),v=command?.value,receipt=v?.result,original=receipt?.task?.value,admitted=original?.attempt;
  if(v?.action!=='task/admit'||v.principal_id!==event.principal_id||receipt?.admitted!==true||receipt.task.id!==task.id||original.status!=='running'||original.definition_revision!==t.definition_revision||!same(original.definition,t.definition)||!admitted||admitted.effect_id!==effectId||a.id!==admitted.id||a.effect_id!==admitted.effect_id||a.request_sha256!==admitted.request_sha256||a.definition_revision!==admitted.definition_revision||a.admitted_at!==admitted.admitted_at||a.policy_generation!==admitted.policy_generation||a.pause_generation!==admitted.pause_generation||a.model_calls!==admitted.model_calls||!same(a.context,admitted.context)||!same(receipt.context,admitted.context))hold('TASK_ADMISSION_REQUIRED','Current attempt differs from original immutable admission');
  if(Object.hasOwn(a,'effect_authority')!==Object.hasOwn(admitted,'effect_authority')||Object.hasOwn(admitted,'effect_authority')&&!same(a.effect_authority,admitted.effect_authority))hold('TASK_AUTHORITY_CHANGED','Original admission authority was removed or rewritten');
  if(t.status==='running'&&admitted.effect_authority&&t.authority_epoch!==admitted.effect_authority.epoch)hold('TASK_AUTHORITY_CHANGED','Original running attempt authority was revoked');
  return {task:original,context:receipt.context,authority:admitted.effect_authority??null};
}
export function validateContext(tx,context){
  tx=trackedReads(tx);
  try{
    if(control(tx).value.paused)return false;
    const task=tx.get('tasks',context.task.id);
    if(!task||['cancelled','unknown','quarantined'].includes(task.value.status))return false;
    const definitionRevision=originalTaskDefinition(tx,task);
    if(!task.value.attempt&&!['planned','pending'].includes(task.value.status))return false;
    const nativeEffect=tx.get('effects',digest(['native-effect',task.id,definitionRevision]));
    const admission=task.value.attempt||nativeEffect?originalTaskAdmission(tx,task):null;
    const current=buildContext(tx,{principal_id:task.value.owner_principal_id},task);
    if(admission?.authority&&Object.hasOwn(admission.authority,'production_authority'))assertPeerProductionAuthority(tx,admission.authority.production_authority);
    return current.sha256===context.sha256&&current.text===context.text&&(!admission||same(admission.context,context));
  }catch(error){if(readFailure(tx,error))throw error;return false;}
}

// Conservatively resolve all explicit contributor references. Missing author or
// principal lineage is a hold, not permission to treat evidence as independent.
// Current use and historical attribution are different graph purposes. Only
// typed material edges enter this graph; identity/grant/observer support stays
// in the local seal validators and never makes software a business contributor.
function evidenceAnalysis(tx,budget=semanticBudget(tx)){
  const history=new Map(),locals=new Map(),taskSeals=new Map(),reviewSeals=new Map(),aliases=new Map();
  const nodes=new Map(),finished=new Set(),currentDone=new Set(),implicationDone=new Set(),implicated=new Map();
  const need=(value,message)=>{if(!value)hold('LINEAGE_REQUIRED',message);};
  const only=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
  const touch=r=>budget(r);
  const reference=r=>exactReference(r);
  const historical=r=>{
    const exact=reference(r),k=touch(exact);
    if(!history.has(k)){
      if(typeof tx.getVersion!=='function')hold('LINEAGE_REQUIRED','Exact committed history reader required');
      let row;try{row=tx.getVersion(exact);}catch(error){if(readFailure(tx,error)||error.code)throw error;hold('LINEAGE_REQUIRED','Exact contributor history unavailable: '+exact.family+'/'+exact.id);}
      need(row&&row.family===exact.family&&row.id===exact.id&&row.revision===exact.revision&&row.sha256===exact.sha256&&peerDigest(row.value)===exact.sha256,'Exact contributor history binding changed');
      history.set(k,preparationBudget(tx).retain(exact.family,row,{historical:true}));
    }
    return history.get(k);
  };
  const refs=(value,label)=>{need(Array.isArray(value)&&value.length<=MAX_ROWS,'Invalid '+label);return value.map(semanticReference);};
  const one=(r,family,label)=>{const exact=reference(r);need(exact.family===family,'Invalid '+label);return exact;};
  const principalAliases=id=>{
    need(typeof id==='string'&&id.trim()&&id.length<=200,'Contributor principal missing');
    if(aliases.has(id))return aliases.get(id);
    const p=tx.get('principals',id);need(p,'Contributor principal missing');
    const result={principals:new Set([id]),natives:new Set()};aliases.set(id,result);
    for(const incarnation of membershipAncestors(tx,p))if(incarnation.value.native_id)result.natives.add(incarnation.value.native_id);
    // Preserve the established graph alias predicate; the separate private
    // lifecycle consumer below verifies a whole production seal as well.
    for(const task of all(tx,'tasks',{principal_id:id})){
      const r=task.value.result;if(!r?.observation)continue;const o=resolve(tx,r.observation);
      need(o.value.kind==='runtime_observation'&&o.value.task_id===task.id&&o.value.native_id===r.native_id,'Contributor observation mismatch');
      if(r.native_id)result.natives.add(r.native_id);
    }
    return result;
  };
  const processIdentity=p=>{
    need(p&&Number.isSafeInteger(p.pid)&&p.pid>0,'Protected process identity missing');
    const started=p.started_at??p.execution_started_at;
    need(typeof started==='string'&&Number.isFinite(Date.parse(started))&&!(p.started_at!==undefined&&p.execution_started_at!==undefined&&p.started_at!==p.execution_started_at),'Protected process start changed');
    return {pid:p.pid,started};
  };
  const protectedObservation=(r,task,action)=>{
    const exact=one(r,'effects','protected observation reference');
    need(exact.id===digest(['runtime-observation',task.id,task.value.attempt.id,action]),'Protected observation identity changed');
    // An immutable observation's current alias must not be replaced while its
    // old historical bytes remain available. This is deliberately CURRENT.
    const current=resolve(tx,exact),stored=historical(exact);
    need(same(current.value,stored.value),'Protected observation history changed');
    const v=stored.value,observer=tx.get('principals',v.principal_id);
    need(v.kind==='runtime_observation'&&v.status==='recorded'&&v.action===action&&v.task_id===task.id&&v.attempt_id===task.value.attempt.id&&v.scope===task.value.scope&&observer?.value.kind==='scheduler','Protected observation aliases changed');
    return stored;
  };
  const taskSeal=row=>{
    const k=canonical(ref('tasks',row));if(taskSeals.has(k))return taskSeals.get(k);
    const t=row.value,d=t.definition;
    need(d&&digest(d)===t.definition_sha256,'Original task definition missing or changed');
    for(const field of ['input_refs','review_of','parent_task_id','parent_ref'])need(Object.hasOwn(d,field)&&Object.hasOwn(t,field)&&same(t[field],d[field]),'Declared task contribution references changed');
    for(const field of ['scope','host','role','stage','instructions','acceptance','resources','outcome'])need(same(t[field],d[field]),'Original task purpose changed');
    const hasHandoff=taskHandoffAliases(row);
    const declared=refs(d.input_refs,'declared task inputs');
    if(d.review_of)declared.push(semanticReference(d.review_of));
    if(d.parent_task_id===null)need(d.parent_ref===null,'Exact declared parent provenance required');
    else{need(typeof d.parent_task_id==='string'&&d.parent_task_id,'Exact declared parent provenance required');const parent=one(d.parent_ref,'tasks','declared parent');need(parent.id===d.parent_task_id,'Exact declared parent provenance required');declared.push(parent);}
    let owner=text(d.owner_principal_id,'original task contributor',200);
    const actors=[owner],handoffNatives=[],transfers=t.transfers??[];
    if(hasHandoff){
      const envelope=d.handoff_envelope,handoffRef=one(d.handoff_ref,'work_items','task handoff'),handoff=historical(handoffRef);
      need(envelope?.protocol==='peer-task-handoff-envelope-v1'&&same(envelope.handoff_ref,handoffRef)&&same(envelope.value,handoff.value)&&handoff.value.kind==='peer_handoff_v1'&&handoff.value.receiver?.id===d.owner_principal_id,'Original typed task handoff changed');
      const senderRef=one(handoff.value.sender,'principals','handoff sender'),sender=historical(senderRef);
      need(sender.value.principal_id===senderRef.id&&sender.value.status==='active','Original handoff sender attribution changed');
      actors.push(senderRef.id);
      if(typeof sender.value.native_id==='string'&&sender.value.native_id.trim())handoffNatives.push(text(sender.value.native_id,'original handoff sender native identity',300));
      need(Array.isArray(envelope.governing_support)&&envelope.governing_support.length<=100,'Original handoff governing support missing');
      for(const support of envelope.governing_support){const exact=reference(support);need(['control','principals','grants'].includes(exact.family)&&same(historical(exact).value,support.value),'Original handoff governing support changed');}
    }
    need(Array.isArray(transfers),'Task transfer provenance missing');
    for(const transfer of transfers){
      need(only(transfer,['from','to','at','attempt_id'])&&transfer.from===owner&&typeof transfer.to==='string'&&Number.isFinite(Date.parse(transfer.at))&&(transfer.attempt_id===null||transfer.attempt_id===t.attempt?.id),'Task transfer chain changed');
      actors.push(transfer.from,transfer.to);owner=transfer.to;
    }
    need(owner===t.owner_principal_id&&t.principal_id===owner,'Task ownership differs from transfer provenance');
    const seal={row,actors,natives:handoffNatives,declared,historical:[],context:null,producer:null};
    taskSeals.set(k,seal);
    const a=t.attempt;
    if(!a){need(!t.result,'Result has no admitted production attempt');return seal;}
    need(a.model_calls===1&&typeof a.admitted_at==='string'&&Number.isFinite(Date.parse(a.admitted_at))&&typeof a.termination_confirmed==='boolean','Admitted attempt accounting or time changed');
    const c=a.context;
    need(c&&typeof c.text==='string'&&c.task&&c.principal,'Admitted producer context missing');
    const {text:encoded,sha256,hash,utf8_bytes,...body}=c;
    need(canonical(body)===encoded&&digest(encoded)===sha256&&hash===sha256&&Buffer.byteLength(encoded)===utf8_bytes&&c.protocol==='peer-task-context-v1'&&c.task.id===row.id&&c.task.definition_sha256===t.definition_sha256&&same(c.task.definition,d)&&c.task.definition_revision===a.definition_revision&&a.definition_revision===t.definition_revision&&a.id===digest(['attempt',row.id,t.definition_revision]),'Admitted producer context changed');
    const producer=text(c.task.owner_principal_id,'admitted producer',200);
    need(c.principal.id===producer&&c.principal.family==='principals'&&(producer===d.owner_principal_id||transfers.some(v=>v.to===producer)),'Admitted principal binding changed');
    const admittedPrincipal=historical(c.principal);
    need(admittedPrincipal.value.principal_id===producer&&admittedPrincipal.value.status==='active','Admitted principal identity changed');
    actors.push(producer);if(admittedPrincipal.value.native_id)seal.natives.push(admittedPrincipal.value.native_id);
    need(c.control&&c.control.policy_generation===a.policy_generation&&c.control.pause_generation===a.pause_generation&&c.control.paused===false,'Admitted control binding changed');
    need(c.task.grant_id===null?c.grant?.founder_principal_id===producer:c.grant?.id===c.task.grant_id&&c.grant.value?.principal_id===producer&&c.grant.value.generation===c.task.grant_generation,'Admitted grant binding changed');
    const sourceRefs=refs(c.sources,'admitted context sources');
    for(let i=0;i<sourceRefs.length;i++){
      const entry=c.sources[i],stored=historical(sourceRefs[i]);
      need(only(entry,['family','id','revision','sha256','value','legacy_value'])&&same(entry.value,stored.value),'Admitted context source bytes changed');
      if(entry.value.source?.kind==='legacy')need(typeof tx.resolveLegacy==='function'&&same(entry.legacy_value,tx.resolveLegacy({sha256:entry.value.source.sha256})),'Admitted legacy source bytes changed');
    }
    for(const r of declared)need(sourceRefs.filter(x=>same(x,r)).length===1,'Admitted context lost its exact declared evidence');
    need(only(c.membership,['homes','notices','conflicts']),'Admitted context membership missing');
    for(const family of ['homes','notices','conflicts'])for(const r of refs(c.membership[family],'admitted membership'))need(r.family===family&&sourceRefs.some(x=>same(x,r)),'Admitted membership differs from supplied evidence');
    const request={kind:'native',task_id:row.id,definition_sha256:t.definition_sha256,context_sha256:sha256};
    need(a.effect_id===digest(['native-effect',row.id,t.definition_revision])&&a.request_sha256===digest(request),'Admitted native request changed');
    const originalEffect={kind:'native',task_id:row.id,principal_id:producer,scope:t.scope,status:'reserved',request,request_sha256:a.request_sha256,grant_id:c.task.grant_id,grant_generation:c.task.grant_generation,policy_generation:a.policy_generation,pause_generation:a.pause_generation,termination_confirmed:false};
    historical({family:'effects',id:a.effect_id,revision:1,sha256:peerDigest(originalEffect)});
    const effect=tx.get('effects',a.effect_id),e=effect?.value;
    need(e&&Object.entries(originalEffect).every(([field,value])=>['status','termination_confirmed'].includes(field)||same(e[field],value)),'Admitted production reservation missing or changed');
    seal.context=c;seal.producer=producer;seal.historical=sourceRefs;
    if(a.process){
      const process=protectedObservation(a.process_observation,row,'task/process').value;
      need(same(process.process,a.process),'Protected process observation changed');processIdentity(a.process);
    }else need(!a.process_observation,'Process observation has no process identity');
    const r=t.result;if(!r){need(a.termination_confirmed===false,'Attempt closure has no retained result');return seal;}
    need(a.termination_confirmed===r.termination_confirmed,'Attempt and original result closure differ');
    need(r.observation&&r.observed_process,'Protected production observation missing');
    const v=protectedObservation(r.observation,row,'task/finish').value;
    need(v.context_sha256===sha256&&v.native_id===r.native_id&&a.native_id===r.native_id&&v.output_sha256===r.output_sha256&&v.termination_confirmed===r.termination_confirmed&&same(v.process,r.observed_process)&&(r.output===null?r.output_sha256===null:typeof r.output==='string'&&digest(r.output)===r.output_sha256),'Protected production binding changed');
    processIdentity(r.observed_process);
    if(a.process)need(same(processIdentity(a.process),processIdentity(r.observed_process)),'Protected production process changed');
    if(r.termination_confirmed)need(r.observed_process.close_observed===true,'Protected production closure missing');
    need(e.result_sha256===digest(r),'Native reservation result binding changed');
    if(t.status==='returned')need(r.error===null&&r.termination_confirmed===true&&e.status==='succeeded'&&e.termination_confirmed===true&&e.result_sha256===digest(r),'Returned production result is unproven');
    if(r.native_id!==null)seal.natives.push(text(r.native_id,'observed production native identity',300));
    else need(r.output===null,'Output has unknown native provenance');
    if(t.closure){
      const closure=protectedObservation(t.closure.observation,row,'task/closure').value;
      need(t.closure.termination_confirmed===true&&closure.termination_confirmed===true&&same(closure.process,t.closure.observed_process)&&t.closure.observed_process.close_observed===true&&same(processIdentity(r.observed_process),processIdentity(t.closure.observed_process))&&e.termination_confirmed===true&&e.closure&&same(e.closure,t.closure),'Protected later closure changed');
    }
    if(t.review_id){
      need((t.stage==='review'||t.review_of)&&r.error===null&&r.termination_confirmed===true,'Retained review result is unproven');
      let parsed;try{parsed=parseReview(r.output,t.review_of);}catch{hold('LINEAGE_REQUIRED','Sealed review output is invalid');}
      need(same(v.review,parsed)&&t.review_id===digest(['review',row.id,a.id]),'Protected parsed review aliases changed');
    }else need(v.review===null&&!(t.status==='returned'&&(t.stage==='review'||t.review_of)),'Unexpected protected review subject');
    return seal;
  };
  const restoreTaskAuthority=(value,previous)=>{
    const {authority_epoch,authority_previous,authority_event_seq,...body}=value;
    return {...body,...(Object.hasOwn(previous,'authority_epoch')?{authority_epoch:previous.authority_epoch}:{}),...(Object.hasOwn(previous,'authority_previous')?{authority_previous:previous.authority_previous}:{}),...(Object.hasOwn(previous,'authority_event_seq')?{authority_event_seq:previous.authority_event_seq}:{})};
  };
  const legacyReviewAuthorityHistory=(old,current)=>{
    if(typeof tx.getTaskHistory!=='function')hold('LINEAGE_REQUIRED','Complete bounded legacy task history required');
    const rows=tx.getTaskHistory(ref('tasks',old),ref('tasks',current));
    need(Array.isArray(rows)&&rows.length===current.revision-old.revision+1&&rows[0]?.sha256===old.sha256&&rows.at(-1)?.sha256===current.sha256,'Complete legacy task history endpoints changed');
    for(let i=0;i<rows.length;i++){
      const row=rows[i],after=row.value;
      need(row.family==='tasks'&&row.id===old.id&&row.revision===old.revision+i&&peerDigest(after)===row.sha256,'Legacy task history is incomplete or changed');
      for(const field of ['authority_epoch','authority_previous','authority_event_seq'])need(!Object.hasOwn(after,field),'Legacy continuation hides an intervening authority producer');
      const reference=ref('tasks',row),key=touch(reference);
      if(!history.has(key))history.set(key,preparationBudget(tx).retain('tasks',row,{historical:true}));
      if(!i)continue;
      const before=rows[i-1].value,prior=before.transfers??[],next=after.transfers??[];
      need(Array.isArray(prior)&&Array.isArray(next)&&['returned','cancelled'].includes(before.status),'Unsupported legacy review transition');
      let normalized;
      if(next.length===prior.length+1&&prior.every((v,j)=>same(v,next[j]))){
        const transfer=next.at(-1);
        need(only(transfer,['from','to','at','attempt_id'])&&transfer.from===before.owner_principal_id&&transfer.to===after.owner_principal_id&&after.principal_id===after.owner_principal_id&&Number.isFinite(Date.parse(transfer.at))&&transfer.attempt_id===(before.attempt?.id??null),'Legacy review transfer changed');
        const {owner_principal_id,principal_id,grant_id,grant_generation,transfers,...body}=after;
        normalized={...body,owner_principal_id:before.owner_principal_id,principal_id:before.principal_id,grant_id:before.grant_id,grant_generation:before.grant_generation,...(Object.hasOwn(before,'transfers')?{transfers:before.transfers}:{})};
      }else{
        need(same(next,prior)&&after.status==='cancelled'&&typeof after.cancelled_at==='string'&&Number.isFinite(Date.parse(after.cancelled_at))&&typeof after.cancellation==='string'&&after.cancellation.trim()&&after.cancellation.length<=2000&&!after.cancellation.includes('\0'),'Legacy review cancellation changed');
        const {cancelled_at,cancellation,...body}=after;
        normalized={...body,status:before.status,...(Object.hasOwn(before,'cancelled_at')?{cancelled_at:before.cancelled_at}:{}),...(Object.hasOwn(before,'cancellation')?{cancellation:before.cancellation}:{})};
      }
      need(same(normalized,before),'Unsupported legacy review history mutation');
    }
  };
  const reviewAuthorityHistory=(old,head)=>{
    let current=head,steps=0;
    while(current.revision!==old.revision||current.sha256!==old.sha256){
      if(++steps>MAX_ROWS)hold('LOOKUP_CAPACITY','Completed review authority history exceeds its complete bounded lookup');
      need(current.id===old.id&&current.revision>old.revision,'Completed review authority history changed');
      if(current.value.authority_epoch===undefined){
        // Exact older proofs predate this producer. Preserve their existing
        // transfer/cancellation checks; they cannot supply a new task handle.
        need(old.value.authority_epoch===undefined&&!Object.hasOwn(current.value,'authority_previous')&&!Object.hasOwn(current.value,'authority_event_seq'),'Completed review authority history lost its producer');
        legacyReviewAuthorityHistory(old,current);
        return;
      }
      const previousRef=one(current.value.authority_previous,'tasks','task authority predecessor');
      need(previousRef.id===old.id&&previousRef.revision===current.revision-1,'Task authority predecessor is not the immediate immutable version');
      const previous=historical(previousRef),before=previous.value,after=current.value,epoch=before.authority_epoch??0;
      need(Number.isSafeInteger(epoch)&&epoch>=0&&Number.isSafeInteger(after.authority_epoch)&&after.authority_epoch===epoch+1,'Completed review task authority counter changed');
      need(Number.isSafeInteger(after.authority_event_seq)&&after.authority_event_seq>0,'Completed review authority event producer missing');
      const event=tx.events({after:after.authority_event_seq-1,limit:1}).items[0],commands=event?.payload?.changes?.filter(change=>change.family==='commands');
      need(event?.seq===after.authority_event_seq&&['task/transfer','task/cancel'].includes(event.type)&&commands?.length===1&&event.payload.changes.some(change=>change.family==='tasks'&&change.id===current.id&&change.revision===current.revision&&change.sha256===current.sha256),'Completed review authority event does not produce this version');
      const command=historical(ref('commands',commands[0])),produced=command.value.result;
      need(command.value.principal_id===event.principal_id&&command.value.action===event.type&&produced?.id===current.id&&produced.revision===current.revision&&produced.sha256===current.sha256&&same(produced.value,current.value),'Exact source command for the authority transition required');
      const transfersBefore=before.transfers??[],transfersAfter=after.transfers??[];
      need(Array.isArray(transfersBefore)&&Array.isArray(transfersAfter)&&['returned','cancelled'].includes(before.status),'Unsupported completed review authority transition');
      let normalized;
      if(event.type==='task/transfer'&&transfersAfter.length===transfersBefore.length+1&&transfersBefore.every((v,i)=>same(v,transfersAfter[i]))){
        const transfer=transfersAfter.at(-1);
        need(only(transfer,['from','to','at','attempt_id'])&&transfer.from===before.owner_principal_id&&transfer.to===after.owner_principal_id&&after.principal_id===after.owner_principal_id&&Number.isFinite(Date.parse(transfer.at))&&transfer.attempt_id===(before.attempt?.id??null),'Completed review transfer producer changed');
        const {owner_principal_id,principal_id,grant_id,grant_generation,transfers,...body}=after;
        normalized={...body,owner_principal_id:before.owner_principal_id,principal_id:before.principal_id,grant_id:before.grant_id,grant_generation:before.grant_generation,...(Object.hasOwn(before,'transfers')?{transfers:before.transfers}:{})};
      }else{
        need(event.type==='task/cancel'&&same(transfersAfter,transfersBefore)&&after.status==='cancelled'&&typeof after.cancelled_at==='string'&&Number.isFinite(Date.parse(after.cancelled_at))&&typeof after.cancellation==='string'&&after.cancellation.trim()&&after.cancellation.length<=2000&&!after.cancellation.includes('\0'),'Completed review cancellation producer changed');
        const {cancelled_at,cancellation,...body}=after;
        normalized={...body,status:before.status,...(Object.hasOwn(before,'cancelled_at')?{cancelled_at:before.cancelled_at}:{}),...(Object.hasOwn(before,'cancellation')?{cancellation:before.cancellation}:{})};
      }
      need(same(restoreTaskAuthority(normalized,before),before),'Unsupported completed review authority mutation');
      current=previous;
    }
  };
  const reviewHead=(old,{pending=false}={})=>{
    const t=old.value,head=tx.get('tasks',old.id);need(head,'Current review task head missing');
    touch(ref('tasks',head));
    if(pending&&head.value.status!=='returned')hold('SOURCE_CHANGED','Exact source changed: tasks/'+old.id);
    const mutable=new Set(['owner_principal_id','principal_id','grant_id','grant_generation','transfers','authority_epoch','authority_previous','authority_event_seq']);
    const stable=value=>Object.fromEntries(Object.entries(value).filter(([name])=>!mutable.has(name)));
    let continuation=head.value;
    if(!pending&&continuation.status==='cancelled'){
      // The supported cancellation changes only these lifecycle fields. Its
      // reason is retained data, not a typed revocation of an accepted proof.
      need(typeof continuation.cancelled_at==='string'&&Number.isFinite(Date.parse(continuation.cancelled_at))&&typeof continuation.cancellation==='string'&&continuation.cancellation.trim()&&continuation.cancellation.length<=2000&&!continuation.cancellation.includes('\0'),'Completed review cancellation provenance missing');
      const {cancelled_at,cancellation,...value}=continuation;
      continuation={...value,status:'returned'};
    }
    const before=t.transfers??[],after=head.value.transfers??[];
    need(after.length>=before.length&&before.every((x,i)=>same(x,after[i])),'Completed review transfer history changed');
    reviewAuthorityHistory(old,head);
    continuation=restoreTaskAuthority(continuation,t);
    if(!same(stable(continuation),stable(t)))hold('SOURCE_CHANGED','Exact source changed: tasks/'+old.id);
    taskSeal(head);
    if(after.length===before.length)need(same(continuation,t),'Completed review ownership changed without a transfer');
    return head;
  };
  const reviewSeal=row=>{
    const k=canonical(ref('reviews',row));if(reviewSeals.has(k))return reviewSeals.get(k);
    const r=row.value,p=r.proof;
    need(r.status==='accepted'&&r.termination_confirmed===true&&p?.protocol==='peer-runtime-observation-v1','Canonical accepted review seal required');
    const subject=semanticReference(r.subject),taskRef=one(p.task,'tasks','review producing task'),task=historical(taskRef),t=task.value,seal=taskSeal(task);
    need(task.id===r.task_id&&r.scope===t.scope&&t.status==='returned'&&t.review_id===row.id&&t.result&&same(t.result.observation,p.observation)&&same(t.review_of,subject)&&r.reviewer_principal_id===seal.producer&&t.owner_principal_id===seal.producer&&r.native_id===t.result.native_id&&r.context_sha256===seal.context?.sha256&&r.output_sha256===t.result.output_sha256,'Accepted review/task aliases changed');
    const observation=protectedObservation(p.observation,task,'task/finish').value;
    let parsed;try{parsed=parseReview(t.result.output,subject);}catch{hold('LINEAGE_REQUIRED','Sealed review raw output is invalid');}
    need(same(parsed,{subject,verdict:r.verdict,reason:r.reason,blockers:r.blockers})&&same(observation.review,parsed)&&r.recorded_by===observation.principal_id,'Accepted review raw output aliases changed');
    const target=historical(subject).value;
    need(r.author_principal_id===(target.principal_id??target.owner_principal_id??target.author_principal_id),'Accepted review author alias changed');
    reviewHead(task);const value={row,task,taskSeal:seal,subject,taskRef,reviewer:r.reviewer_principal_id,native:r.native_id};reviewSeals.set(k,value);return value;
  };
  const homeSeal=row=>{
    const h=row.value,q=h.scope_qualification;
    if(!q){need(!h.proposal&&!h.review,'Published home qualification missing');return null;}
    need(q.protocol==='peer-home-scope-v1'&&q.home_binding_sha256===homeBinding(row.id,h)&&same(q.proposal,h.proposal)&&same(q.review,h.review),'Home qualification aliases changed');
    const proposalRef=one(h.proposal,'proposals','home proposal'),reviewRef=one(h.review,'reviews','home review');
    const proposal=historical(proposalRef),review=historical(reviewRef),r=reviewSeal(review),p=proposal.value;
    need(review.value.verdict==='Pass'&&same(r.subject,proposalRef)&&p.home_id===row.id&&p.scope===h.scope&&same(p.content,h.content)&&same(p.dependencies,h.dependencies??[])&&same(p.base,h.previous??null),'Home accepted subject binding changed');
    return {proposal,review};
  };
  const proposalTask=row=>{
    const v=row.value,fields=['task_id','attempt_id','task_effect'],present=fields.filter(field=>Object.hasOwn(v,field));
    if(!present.length){
      if(row.revision>1){
        const head=tx.get('proposals',row.id);
        need(head&&Number.isSafeInteger(head.created_seq)&&head.created_seq>0,'Original proposal creation anchor required');
        const event=tx.events({after:head.created_seq-1,limit:1}).items[0];
        if(event?.type==='home/propose'){
          const originals=event.payload.changes.filter(change=>change.family==='proposals'&&change.id===row.id&&change.revision===1);
          need(originals.length===1,'Original proposal version required');
          const original=historical(ref('proposals',originals[0]));
          need(fields.every(field=>!Object.hasOwn(original.value,field)),'Original proposal task attribution was removed');
        }
      }
      return null;
    }
    need(present.length===fields.length,'Complete proposal task attribution required');
    const namespace=v.task_effect;
    need(namespace&&Object.keys(namespace).sort().join(',')==='admission_producer,attempt_id,authority_epoch,context_sha256,executor_incarnation_id,protocol,runtime_generation,task_id'&&namespace.protocol==='peer-task-effect-binding-v1'&&typeof namespace.task_id==='string'&&namespace.task_id.trim()&&typeof namespace.attempt_id==='string'&&namespace.attempt_id.trim()&&namespace.task_id===v.task_id&&namespace.attempt_id===v.attempt_id&&Number.isSafeInteger(namespace.authority_epoch)&&namespace.authority_epoch>0&&Number.isSafeInteger(namespace.runtime_generation)&&namespace.runtime_generation>0&&typeof namespace.executor_incarnation_id==='string'&&namespace.executor_incarnation_id.trim()&&/^[a-f0-9]{64}$/.test(namespace.context_sha256??''),'Original proposal task namespace required');
    const anchor=tx.get('proposals',row.id);
    need(row.revision===1&&anchor&&Number.isSafeInteger(anchor.created_seq)&&anchor.created_seq>0,'Original proposal creation anchor required');
    const event=tx.events({after:anchor.created_seq-1,limit:1}).items[0],changes=event?.payload?.changes;
    const produced=changes?.filter(change=>change.family==='proposals'&&change.id===row.id&&change.revision===1&&change.sha256===row.sha256),commands=changes?.filter(change=>change.family==='commands');
    need(event?.seq===anchor.created_seq&&event.type==='home/propose'&&event.principal_id===v.principal_id&&produced?.length===1&&commands?.length===1&&commands[0].revision===1,'Original task-produced proposal event required');
    const commandRef=ref('commands',commands[0]),command=historical(commandRef),c=command.value;
    need(typeof c.operation_id==='string'&&c.operation_id.trim()&&c.operation_id.length<=160&&c.action==='home/propose'&&c.principal_id===v.principal_id&&c.task_id===v.task_id&&c.attempt_id===v.attempt_id&&same(c.task_effect,namespace)&&/^[a-f0-9]{64}$/.test(c.request_sha256??''),'Original task-scoped proposal command required');
    const operation=digest(['peer-task-operation-v1',namespace,c.operation_id]);
    need(command.id===digest(['peer-task-command-v1',v.principal_id,namespace,c.operation_id])&&row.id===digest(['proposal',v.principal_id,operation])&&same(c.result,{id:row.id,revision:row.revision,sha256:row.sha256,created_seq:anchor.created_seq,value:v}),'Original proposal command result changed');
    const commandHead=tx.get('commands',command.id);
    need(commandHead&&same(ref('commands',commandHead),commandRef),'Original proposal command head changed');
    const producer=namespace.admission_producer;
    need(producer&&Object.keys(producer).sort().join(',')==='command,event_seq,event_sha256'&&Number.isSafeInteger(producer.event_seq)&&producer.event_seq>0&&producer.event_seq<anchor.created_seq&&/^[a-f0-9]{64}$/.test(producer.event_sha256??''),'Original proposal admission producer required');
    const admissionRef=one(producer.command,'commands','proposal task admission command'),admission=historical(admissionRef),a=admission.value;
    const admissionEvent=tx.events({after:producer.event_seq-1,limit:1}).items[0],admissionChanges=admissionEvent?.payload?.changes,admissionCommands=admissionChanges?.filter(change=>change.family==='commands');
    need(admissionEvent?.seq===producer.event_seq&&admissionEvent.sha256===producer.event_sha256&&admissionEvent.type==='task/admit'&&a.action==='task/admit'&&a.principal_id===admissionEvent.principal_id&&admissionCommands?.length===1&&same(ref('commands',admissionCommands[0]),admissionRef),'Original proposal task admission event changed');
    need(admissionRef.revision===1&&typeof a.operation_id==='string'&&a.operation_id.trim()&&a.operation_id.length<=160&&admission.id===digest(['peer-command-v1',a.principal_id,a.operation_id])&&/^[a-f0-9]{64}$/.test(a.request_sha256??''),'Original source admission command required');
    const receipt=a.result,admitted=receipt?.task,taskRef=admitted?ref('tasks',admitted):null;
    need(receipt?.admitted===true&&admitted?.id===v.task_id&&admitted.value?.status==='running'&&admitted.value.owner_principal_id===v.principal_id&&admitted.value.principal_id===v.principal_id&&admitted.value.scope===v.scope&&admitted.value.authority_epoch===namespace.authority_epoch&&admitted.value.attempt?.id===v.attempt_id&&admitted.value.attempt.effect_authority?.epoch===namespace.authority_epoch&&admitted.value.attempt.context?.sha256===namespace.context_sha256&&same(receipt.context,admitted.value.attempt.context),'Original proposal task/attempt/context binding changed');
    need(admissionChanges.some(change=>change.family==='tasks'&&same(ref('tasks',change),taskRef)),'Admission event did not produce the original proposal task');
    const original=historical(taskRef),admissionHead=tx.get('commands',admission.id);
    need(same(original.value,admitted.value)&&admissionHead&&same(ref('commands',admissionHead),admissionRef),'Original proposal admission command or task changed');
    need(Array.isArray(original.value.resources)&&original.value.resources.some(resource=>contains(resource,{kind:'home',id:v.home_id,key:`home:${v.home_id}`})),'Proposal is outside its original admitted task resource');
    taskSeal(original);
    return taskRef;
  };
  // One finite typed edge table, consumed by both traversal purposes. Sealed
  // publication and review proofs are attribution edges, not live dependencies.
  const local=(r,row)=>{
    const k=canonical(r);if(locals.has(k))return locals.get(k);
    const v=row.value,n={reference:r,row,actors:[],natives:[],live:[],past:[],review:null,recordingOnly:false};
    switch(r.family){
      case 'tasks':{const t=taskSeal(row);n.actors=t.actors;n.natives=t.natives;n.live=t.declared;n.past=[...t.declared,...t.historical];break;}
      case 'proposals':{
        const dependencies=refs(v.dependencies??[],'proposal dependencies');need(dependencies.every(d=>d.family==='homes'),'Proposal dependencies must name homes');
        const base=v.base?one(v.base,'homes','proposal base'):null;if(base)need(base.id===v.home_id,'Proposal base home identity changed');
        const producer=proposalTask(row);
        n.actors=[v.principal_id];n.live=[...refs(v.readset??[],'proposal readset'),...dependencies,...(base?[base]:[])];n.past=[...n.live,...(producer?[producer]:[])];break;
      }
      case 'reviews':{const s=reviewSeal(row);n.actors=[s.reviewer];n.natives=[s.native];n.past=[s.subject,s.taskRef];n.review=s;break;}
      case 'homes':{
        n.actors=[v.principal_id];n.live=refs(v.dependencies??[],'home dependencies');need(n.live.every(d=>d.family==='homes'),'Home dependency must name a home');
        const s=homeSeal(row);n.past=[...n.live,...(s?[reference(v.proposal),reference(v.review)]:[])];
        if(s&&tx.get('principals',v.principal_id)?.value.kind==='publisher'){n.actors=[];n.recordingOnly=true;}
        if(v.previous){const previous=one(v.previous,'homes','previous home');need(previous.id===row.id,'Previous home identity changed');n.past.push(previous);}break;
      }
      case 'conflicts':n.actors=[v.principal_id,...(v.resolution?[v.resolution.principal_id]:[])];n.live=[...refs(v.input_refs??[],'conflict inputs'),...refs(v.resolution?.evidence??[],'conflict resolution evidence')];n.past=n.live;break;
      case 'notices':n.actors=[v.principal_id,...(v.resolution?[v.resolution.principal_id]:[])];break;
      case 'messages':n.actors=[v.principal_id];break;
      case 'deliveries':n.past=[one(v.notice,'notices','delivery notice')];n.recordingOnly=true;break;
      default:hold('SOURCE_INVALID','Unsupported semantic evidence family: '+r.family);
    }
    locals.set(k,n);return n;
  };
  const current=roots=>{
    const active=new Set(),stack=[...roots].reverse().map(r=>({r:semanticReference(r),exit:false}));
    while(stack.length){
      const {r,exit}=stack.pop(),k=touch(r);
      if(exit){active.delete(k);currentDone.add(k);continue;}
      if(active.has(k))hold('LINEAGE_REQUIRED','Contributor reference cycle');
      if(currentDone.has(k))continue;
      const row=resolve(tx,r),n=local(r,row);active.add(k);stack.push({r,exit:true});
      for(let i=n.live.length-1;i>=0;i--)stack.push({r:n.live[i],exit:false});
    }
    return [...currentDone].map(key=>JSON.parse(key));
  };
  const historicalWalk=roots=>{
    const active=new Set(),stack=[...roots].reverse().map(r=>({r:semanticReference(r),exit:false}));
    while(stack.length){
      const {r,exit}=stack.pop(),k=touch(r);
      if(exit){
        const n=nodes.get(k),people=new Set(),natives=new Set(n.natives);
        need(n.actors.length||n.recordingOnly,'Exact evidence has unknown contributor lineage');
        for(const id of n.actors){const a=principalAliases(id);for(const p of a.principals)people.add(p);for(const native of a.natives)natives.add(native);}
        for(const child of n.past){const x=nodes.get(canonical(child));need(x?.contributors,'Incomplete contributor graph');for(const p of x.contributors.principals)people.add(p);for(const native of x.contributors.natives)natives.add(native);}
        if(n.review){const s=n.review,subject=nodes.get(canonical(s.subject)).contributors,reviewer=principalAliases(s.reviewer);need(!subject.principals.has(s.reviewer)&&!subject.natives.has(s.native)&&![...reviewer.natives].some(native=>subject.natives.has(native)),'Accepted review is not independent of its subject');}
        n.contributors={principals:people,natives};active.delete(k);finished.add(k);continue;
      }
      if(active.has(k))hold('LINEAGE_REQUIRED','Contributor reference cycle');
      if(finished.has(k))continue;
      const row=historical(r),n=local(r,row);nodes.set(k,n);active.add(k);stack.push({r,exit:true});
      for(let i=n.past.length-1;i>=0;i--)stack.push({r:n.past[i],exit:false});
    }
    const principals=new Set(),natives=new Set();
    for(const root of roots){const c=nodes.get(canonical(semanticReference(root))).contributors;for(const id of c.principals)principals.add(id);for(const native of c.natives)natives.add(native);}
    return {principals:[...principals].sort(),natives:[...natives].sort()};
  };
  const implicatedHomes=roots=>{
    const active=new Set(),stack=[...roots].reverse().map(r=>({r:semanticReference(r),exit:false}));
    while(stack.length){
      const {r,exit}=stack.pop(),key=touch(r);
      if(exit){active.delete(key);implicationDone.add(key);continue;}
      if(active.has(key))hold('LINEAGE_REQUIRED','Contributor reference cycle');
      if(implicationDone.has(key))continue;
      const row=historical(r),n=local(r,row);active.add(key);stack.push({r,exit:true});
      if(r.family==='homes'){
        const head=tx.get('homes',row.id);
        if(head?.value.status==='current'&&same(ref('homes',head),r))implicated.set(row.id,head);
        continue;
      }
      // This is relationship discovery, not permission to make past proof
      // edges current. Homes are terminal; their CURRENT deps come from the
      // separate home DAG. Protected reviews/deliveries expose typed carriers.
      const edges=['reviews','deliveries'].includes(r.family)?n.past:n.live;
      for(let i=edges.length-1;i>=0;i--)stack.push({r:edges[i],exit:false});
    }
    return [...implicated.values()];
  };
  const pendingReviewEligible=row=>{
    const seal=reviewSeal(row),old=seal.task,head=reviewHead(old,{pending:true});
    // The original admitted reviewer and original grant remain accountable.
    // Rebuilding with the transferred head's owner would silently substitute
    // authority; rebuild only the historical sealed task against current inputs.
    const reviewer=member(tx,{principal_id:seal.reviewer});
    if(!same(ref('principals',reviewer),seal.taskSeal.context.principal))return false;
    if(head.value.owner_principal_id!==seal.reviewer)authorize(tx,{principal_id:head.value.owner_principal_id},'task/submit',{grant_id:head.value.grant_id,grant_generation:head.value.grant_generation,scope:head.value.scope,resources:head.value.resources});
    const rebuilt=buildContext(tx,{principal_id:seal.reviewer},old);
    return rebuilt.sha256===seal.taskSeal.context.sha256&&rebuilt.text===seal.taskSeal.context.text;
  };
  let identityInventory=null;const identityFacts=new Map();
  const principalIdentity=id=>{
    if(identityFacts.has(id))return identityFacts.get(id);
    const principal=tx.get('principals',text(id,'identity principal',200));need(principal,'Identity principal missing');
    preparationBudget(tx).retain('principals',principal);
    const natives=new Set(),proofs=[];
    for(const incarnation of membershipAncestors(tx,principal))if(incarnation.value.native_id!==undefined&&incarnation.value.native_id!==null)natives.add(text(incarnation.value.native_id,'current/historical membership native identity',300));
    // Current-owner indexing alone loses transferred-away production. Inspect
    // the complete bounded task-head set, then seal only matching P2 tasks.
    // Private software trackers have no P2 definition/attempt/result and supply
    // no native facts. No unrelated archive is promoted to an ancestry edge.
    if(!identityInventory){
      const heads=new Map(),people=new Map();
      for(const task of all(tx,'tasks')){
        heads.set(task.id,task);const value=task.value,transfers=Array.isArray(value.transfers)?value.transfers:[];
        if(!value.definition&&!value.attempt&&!Object.hasOwn(value,'result'))continue;
        const ids=new Set([value.principal_id,value.owner_principal_id,value.definition?.owner_principal_id,value.attempt?.context?.task?.owner_principal_id,...transfers.flatMap(t=>[t?.from,t?.to])]);
        for(const person of ids)if(typeof person==='string'){if(!people.has(person))people.set(person,new Set());people.get(person).add(task.id);}
      }
      identityInventory={heads,people};
    }
    const produced=new Set();
    for(const effect of all(tx,'effects',{principal_id:id}))if(effect.value.kind==='native')produced.add(text(effect.value.task_id,'identity production task',200));
    const selected=new Set([...(identityInventory.people.get(id)??[]),...produced]);
    for(const taskId of selected){
      const task=identityInventory.heads.get(taskId);need(task,'Identity production task head missing');const value=task.value;
      touch(ref('tasks',task));const seal=taskSeal(task);need(seal.actors.includes(id),'Identity task ownership unproven');
      if(seal.context){const admitted=historical(seal.context.principal);if(admitted.value.native_id!==undefined&&admitted.value.native_id!==null)text(admitted.value.native_id,'historical native identity',300);}
      const aliases=[...new Set(seal.natives.map(native=>text(native,'protected native identity',300)))].sort();
      for(const native of aliases)natives.add(native);
      if(aliases.length)proofs.push({task_ref:ref('tasks',task),owner_principal_ids:[...new Set(seal.actors)].sort(),producer_principal_id:seal.producer,admitted_principal_ref:copy(seal.context.principal),observation_ref:value.result?.observation?copy(value.result.observation):null,native_ids:aliases});
    }
    proofs.sort((a,b)=>order(canonical(a.task_ref),canonical(b.task_ref)));
    const result={protocol:'peer-principal-native-aliases-v1',principal_ref:ref('principals',principal),native_ids:[...natives].sort(),proofs};identityFacts.set(id,result);return result;
  };
  return {current,currentTask:row=>current(taskSeal(row).declared),historical:historicalWalk,implicatedHomes,reviewSeal,homeSeal,pendingReviewEligible,taskSeal,principalIdentity};
}
function lineage(tx,subject){const graph=evidenceAnalysis(tx);graph.current([subject]);return graph.historical([subject]);}

// Private membership composition only. Historical incarnation bindings remain
// evidence after replacement; a new native cannot erase the old aliases.
function membershipAncestors(tx,principal){
  const prep=preparationBudget(tx),rows=[prep.retain('principals',principal)],seen=new Set([canonical(ref('principals',principal))]);let current=principal;
  while(current.value.membership_previous){
    const previous=exactReference(current.value.membership_previous),key=canonical(previous);
    if(previous.family!=='principals'||previous.id!==principal.id||previous.revision>=current.revision||seen.has(key)||rows.length>=MAX_ROWS)hold('LINEAGE_REQUIRED','Invalid membership incarnation history');
    if(typeof tx.getVersion!=='function')hold('LINEAGE_REQUIRED','Exact membership history reader required');
    const row=tx.getVersion(previous);
    if(!row||row.sha256!==previous.sha256||row.revision!==previous.revision||peerDigest(row.value)!==previous.sha256||!Number.isSafeInteger(row.value.generation)||row.value.generation>current.value.generation)hold('LINEAGE_REQUIRED','Membership incarnation history changed');
    rows.push(prep.retain('principals',row,{historical:true}));seen.add(key);current=row;
  }
  return rows;
}

export function membershipPrincipalAliases(provider,principal_id){
  const tx=trackedReads(provider),id=text(principal_id,'contributor principal',200),p=tx.get('principals',id);
  if(!p)hold('LINEAGE_REQUIRED','Contributor principal missing');
  const natives=new Set();
  // The shared P2 identity predicate includes transferred-away production and
  // its complete admission/context/task/effect/raw-output seals. A protocol or
  // current-owner label alone cannot manufacture or omit a native alias.
  const facts=evidenceAnalysis(tx).principalIdentity(id);for(const native of facts.native_ids)natives.add(native);
  const probe=tx.getVersion(ref('principals',p));if(!probe||probe.sha256!==p.sha256||peerDigest(probe.value)!==p.sha256)hold('SOURCE_CHANGED','Owning membership identity snapshot changed');
  return {principals:[id],natives:[...natives].sort()};
}

// A read-only projection for the separate pending-membership leaf. It does not
// activate an actor, invent a task, open a transaction or grant authority. The
// owning P1 provider must be used before any put. Actual host authentication is
// a later protected-composition prerequisite, never a request field.
export function membershipPolicyEvidence(provider,args={}){
  const input=bounded(args,'membership context request',100000),keys=['principal_id','scope','input_refs','enrollment_id'];
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))hold('INVALID_INPUT','Closed membership context request required');
  const principalId=text(input.principal_id,'membership principal',200),enrollmentId=text(input.enrollment_id,'enrollment id',200),scope=scopeOf(input.scope),methods=['get','getVersion','list','count','queryCurrentReviews','resolveLegacy'],view={};
  for(const method of methods){if(typeof provider?.[method]!=='function')hold('LINEAGE_REQUIRED','Complete owning membership provider required');view[method]=(...values)=>provider[method](...values);}
  for(const method of ['getTaskHistory','events'])if(typeof provider[method]==='function')view[method]=(...values)=>provider[method](...values);
  const tx=trackedReads(Object.freeze(view)),c=control(tx),limits=policy(c);legacyOriginHold(c);semanticInputs(tx,input.input_refs??[]);
  const selected=sources(tx,scope,input.input_refs??[],currentReviewRows(tx));
  if(selected.membership.conflicts.length)hold('CONTEXT_CONFLICT','Applicable reconstruction conflict');
  const graph=evidenceAnalysis(tx),references=selected.sources.map(({family,id,revision,sha256})=>({family,id,revision,sha256}));
  const contributors=references.length?graph.historical(references):{principals:[],natives:[]};
  const normalizedGrant=row=>{const {used_model_calls,...value}=row.value;return {id:row.id,value};};
  const usage=id=>{const row=tx.get('control',id),{model_calls,...value}=row?.value??{};return {id,value};};
  const owned=(family,status)=>all(tx,family,{principal_id:principalId,status}).filter(row=>!(row.value.kind==='membership_execution'&&row.value.membership_id===enrollmentId));
  const body={protocol:'peer-membership-context-v1',control:{id:c.id,value:copy(c.value)},resources:tx.get('control','resources'),scope,
    active_principals:all(tx,'principals',{status:'active'}),
    grants:all(tx,'grants',{status:'active'}).filter(row=>['*','unknown',scope].includes(row.value.scope)).map(normalizedGrant),
    usage_metadata:{global:usage('usage'),principal:usage(`usage:${principalId}`)},
    ...selected,owned_work:owned('tasks',['planned','pending','running','unknown','quarantined','failed','cancelled']),
    owned_reservations:{slots:owned('slots',['active','unknown']),effects:owned('effects',['reserved','sent','unknown']),claims:owned('claims','held')},contributors};
  const encoded=canonical(body),utf8_bytes=Buffer.byteLength(encoded);if(utf8_bytes>limits.max_context_bytes)hold('CONTEXT_CAPACITY','Complete reconstruction context exceeds existing policy');
  const probe=tx.getVersion(ref('control',c));if(!probe||probe.sha256!==c.sha256||peerDigest(probe.value)!==c.sha256)hold('SOURCE_CHANGED','Owning reconstruction snapshot changed');
  return {body,text:encoded,sha256:digest(encoded),utf8_bytes,contributors};
}

// Trusted host composition only, not a model tool or authentication interface.
// Use the existing owning P1 snapshot BEFORE any put. This function opens no
// transaction, writes no rows and returns plain evidence, never a grant/Boolean.
export function publicationPolicyEvidence(provider,actor,args={}){
  const input=bounded(args,'publication policy request',100000),who=copy(actor);
  const keys=['subject_ref','review_refs','grant_id','grant_generation','action','expected_authority_sha256'];
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))hold('INVALID_INPUT','Unsupported publication policy request');
  const action=text(input.action,'publication action',100);if(!action.startsWith('github/'))hold('INVALID_INPUT','Exact github publication action required');
  const methods=['get','getVersion','list','count','queryCurrentReviews','resolveLegacy'],view={};
  for(const method of methods){if(typeof provider?.[method]!=='function')hold('LINEAGE_REQUIRED','Complete owning read provider required');view[method]=(...values)=>provider[method](...values);}
  for(const method of ['getTaskHistory','events'])if(typeof provider[method]==='function')view[method]=(...values)=>provider[method](...values);
  const tx=trackedReads(Object.freeze(view)),prep=preparationBudget(tx);
  const subject=reviewReference(input.subject_ref);if(subject.family!=='proposals')hold('PROPOSAL_INVALID','Exact publication proposal required');
  const proposal=resolve(tx,subject),p=proposal.value;if(p.status!=='proposed')hold('PROPOSAL_INVALID','Proposed publication subject required');
  const metadata={github_publication:publicationMetadata(p.github_publication,'GitHub subject')};
  if(Object.hasOwn(p,'github_atomic_publication'))metadata.github_atomic_publication=publicationMetadata(p.github_atomic_publication,'GitHub atomic subject');
  const repo=repository(`${text(metadata.github_publication.owner,'repository owner',200)}/${text(metadata.github_publication.repo,'repository name',200)}`);
  const scope=scopeOf(p.scope),resources=canonicalResources(tx,[{kind:'repo',repository:repo}]);
  const auth=authorize(tx,who,action,{grant_id:input.grant_id,grant_generation:input.grant_generation,scope,resources});
  const retain=(family,row)=>row?prep.retain(family,row):null;
  const authBinding=value=>({control:{id:value.control.id,value:copy(retain('control',value.control).value)},principal:{id:value.principal.id,value:copy(retain('principals',value.principal).value)},grant:value.grant?grantBinding(retain('grants',value.grant)):null});
  const publisher=authBinding(auth);
  const used=(value,key)=>{const n=value?.[key]??0;if(!Number.isSafeInteger(n)||n<0)hold('POLICY_INVALID','Actual usage counter is invalid');return n;};
  const capacityPart=(n,limit)=>{if(!Number.isSafeInteger(limit)||limit<1)hold('POLICY_INVALID','Finite remaining capacity required');return {used:n,limit,remaining:Math.max(0,limit-n)};};
  // Counter-only rows may be absent before first use. Only their known counter
  // values are excluded; any other field remains authority-binding material.
  const usageMetadata=(id,row)=>{const {model_calls,...value}=row?.value??{};return {id,value};};
  const capacityEvidence=current=>{
    const limits=policy(current.control),usage=retain('control',tx.get('control','usage')),principalUsage=retain('control',tx.get('control',`usage:${current.principal.id}`));
    const capacity={global:capacityPart(used(usage?.value,'model_calls'),limits.max_model_calls),principal:{principal_id:current.principal.id,...capacityPart(used(principalUsage?.value,'model_calls'),limits.principal_model_calls??limits.max_model_calls)},grant:current.grant?{grant_id:current.grant.id,...capacityPart(used(current.grant.value,'used_model_calls'),current.grant.value.max_model_calls)}:null};
    capacity.remaining_model_calls=Math.min(capacity.global.remaining,capacity.principal.remaining,...(capacity.grant?[capacity.grant.remaining]:[]));
    if(!capacity.remaining_model_calls)hold('MODEL_BUDGET','Current publication authority has exhausted capacity');
    return {capacity,usage,principalUsage,usage_metadata:{global:usageMetadata('usage',usage),principal:usageMetadata(`usage:${current.principal.id}`,principalUsage)}};
  };
  const initialCapacity=capacityEvidence(auth);
  const home=tx.get('homes',text(p.home_id,'proposal home',200));if(p.base)resolve(tx,p.base);else if(home)hold('HOME_CHANGED','Concurrent home');
  const reviewRows=currentReviewRows(tx),selected=sources(tx,scope,[],reviewRows);
  if(selected.membership.conflicts.length)hold('CONTEXT_CONFLICT','Unresolved applicable conflict');
  if(!same(selected.membership,p.membership))hold('CONTEXT_CHANGED','Applicable membership changed');
  if(!Array.isArray(p.readset)||p.readset.length>MAX_ROWS)hold('SOURCE_INVALID','Complete proposal readset required');
  for(const r of p.readset)resolve(tx,r);
  reviewRows.subjects([subject]);
  const graph=evidenceAnalysis(tx);graph.current([subject]);const contributors=graph.historical([subject]);
  if(!Array.isArray(input.review_refs)||!input.review_refs.length||input.review_refs.length>100)hold('REVIEW_REQUIRED','Exact independent publication review required');
  const review_refs=input.review_refs.map(reviewReference),seen=new Set(),reviews=[],review_authorities=[],review_authority_inputs=[];
  const reviewAuthority=({reference,seal,head})=>{
    const original=seal.task.value;
    const reviewerAuth=authorize(tx,{principal_id:seal.reviewer},'task/submit',{grant_id:original.grant_id,grant_generation:original.grant_generation,scope:original.scope,resources:original.resources});
    const currentOwner=head.value.owner_principal_id===seal.reviewer?null:authorize(tx,{principal_id:head.value.owner_principal_id},'task/submit',{grant_id:head.value.grant_id,grant_generation:head.value.grant_generation,scope:head.value.scope,resources:head.value.resources});
    return {review_ref:reference,original_reviewer:authBinding(reviewerAuth),current_task_owner:currentOwner?authBinding(currentOwner):null};
  };
  for(const reference of review_refs){
    if(reference.family!=='reviews'||seen.has(reference.id))hold('REVIEW_REQUIRED','Distinct exact review references required');seen.add(reference.id);
    const review=resolve(tx,reference);
    if(!observedReview(tx,review,{pending:true})||review.value.verdict!=='Pass'||!same(review.value.subject,subject))hold('REVIEW_REQUIRED','Protected exact independent Pass required');
    if(!graph.pendingReviewEligible(review))hold('CONTEXT_CHANGED','Review context no longer current');
    const seal=graph.reviewSeal(review),head=retain('tasks',tx.get('tasks',seal.task.id));
    reviews.push({review_ref:reference,task_ref:seal.taskRef,current_task_ref:ref('tasks',head),observation_ref:copy(review.value.proof.observation),reviewer_principal_id:seal.reviewer,native_id:seal.native,context_sha256:review.value.context_sha256,output_sha256:review.value.output_sha256});
    const authorityInput={reference,seal,head};review_authority_inputs.push(authorityInput);review_authorities.push(reviewAuthority(authorityInput));
  }
  for(const adverse of reviewRows.adverse())if(same(adverse.subject,subject)){if(adverse.error)throw adverse.error;hold('REVIEW_HELD','Retained negative review requires a changed proposal');}
  const interested=new Set([...contributors.principals,...review_authorities.flatMap(a=>[a.original_reviewer.principal.id,...(a.current_task_owner?[a.current_task_owner.principal.id]:[])])]);
  const identity_facts={protocol:'peer-publication-native-identities-v1',publisher:graph.principalIdentity(auth.principal.id),interested:[...interested].sort().map(id=>graph.principalIdentity(id))};
  if(!same(review_authority_inputs.map(reviewAuthority),review_authorities))hold('AUTHORITY_CHANGED','Review authority changed during policy verification');
  const finalAuth=authorize(tx,who,action,{grant_id:input.grant_id,grant_generation:input.grant_generation,scope,resources}),fresh=capacityEvidence(finalAuth);
  if(!same(authBinding(finalAuth),publisher)||!same(fresh.usage_metadata,initialCapacity.usage_metadata))hold('AUTHORITY_CHANGED','Publication authority changed during policy verification');
  // Uncached owning P1 guard AFTER every provider read. A modifying read hook
  // must not leave cached identity evidence usable; exact no-op puts stay valid.
  const snapshot=tx.getVersion(subject);
  if(!snapshot||snapshot.family!==subject.family||!same(ref(subject.family,snapshot),subject)||!same(snapshot.value,proposal.value))hold('LINEAGE_REQUIRED','Final owning snapshot subject binding changed');
  // One final cutoff covers every grant after the last provider read, so later
  // proof/capacity work cannot leave an earlier review authority expired.
  const cutoff=Date.now(),grants=[publisher.grant,...review_authorities.flatMap(a=>[a.original_reviewer.grant,a.current_task_owner?.grant])].filter(Boolean);
  if(grants.some(g=>!Number.isFinite(Date.parse(g.value.expires_at))||Date.parse(g.value.expires_at)<=cutoff))hold('GRANT_INVALID','Current publication and review grants required at final cutoff');
  const {capacity,usage,principalUsage,usage_metadata}=fresh;
  const authority_binding={protocol:'peer-publication-authority-v1',action,scope,resources,subject_ref:subject,review_refs,metadata,reviews,review_authorities,publisher,usage_metadata,readset:copy(p.readset),membership:copy(selected.membership)};
  const authority_sha256=digest(authority_binding);
  if(input.expected_authority_sha256!==undefined&&(typeof input.expected_authority_sha256!=='string'||!/^[a-f0-9]{64}$/.test(input.expected_authority_sha256)||input.expected_authority_sha256!==authority_sha256))hold('AUTHORITY_CHANGED','Publication authority binding changed');
  // Capacity and current raw row identities are fresh observations, not part of
  // the stable authority digest. No allowance is reserved, spent or refunded.
  // Known aliases are fresh proof facts, not a counter-sensitive request lease.
  // Consumers must check them each time; new nonoverlapping production can be
  // safe while the unchanged semantic authority SHA remains stable.
  return bounded({protocol:'peer-publication-policy-v1',subject_ref:subject,review_refs,metadata,reviews,contributors,identity_facts,authority_binding,authority_sha256,capacity,current_sources:{control:ref('control',finalAuth.control),principal:ref('principals',finalAuth.principal),grant:finalAuth.grant?ref('grants',finalAuth.grant):null,global_usage:usage?ref('control',usage):null,principal_usage:principalUsage?ref('control',principalUsage):null},boundary:'Trusted P2 policy evidence only; no P4/App/GitHub qualification, transport, claim, native authentication or new authority.'},'publication policy evidence',REVIEW_PREPARATION_BYTES);
}
function exclusions(args){const ids=args.exclude_task_ids??[];if(!Array.isArray(ids)||ids.length>MAX_ROWS||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id||id.length>200))hold('INVALID_INPUT','At most 10,000 distinct excluded task IDs');return new Set(ids);}
// Compatible task/host result shape. P3 may accumulate excluded held IDs up to
// the full 10,000-row queue bound; fairness advances only on admitted execution.
// Exclusion is caller-local traversal, not cancellation or persistent omission.
function peek(tx,args={}){const excluded=exclusions(args),rows=all(tx,'tasks',{status:'pending'}).filter(t=>!excluded.has(t.id)),cursor=tx.get('control','fairness')?.value.last_principal_id??'',owners=[...new Set(rows.map(t=>t.value.owner_principal_id))].sort();if(!owners.length)return null;const owner=owners.find(id=>id>cursor)??owners[0],items=rows.filter(t=>t.value.owner_principal_id===owner).sort((a,b)=>order(a.value.created_at,b.value.created_at)||order(a.id,b.id)),aging=control(tx).value.policy.review_aging_ms??1000;return items.find(t=>t.value.stage==='review'&&Date.now()-Date.parse(t.value.created_at)>=aging)??items[0];}
function runtimeStatus(tx){const c=control(tx),p=policy(c),active=count(tx,'slots',{status:['active','unknown']});return {paused:c.value.paused,active_slots:active,pending_count:count(tx,'tasks',{status:'pending'}),available_slots:Math.max(0,p.worker_cap-active),queue_matching_row_limit:MAX_ROWS,exclusion_limit:MAX_ROWS};}
function parseReview(output,subject,claimed){
  let review;try{review=parseReviewOutput(output,subject,{canonical});}catch(error){
    // The pinned shared parser has one bounds phase. Keep the established model
    // error codes for that phase without duplicating its structural parser.
    if(error.message==='Invalid bounded review reason/blockers'){const r=JSON.parse(output).review;text(r.reason,'review reason',12000);bounded(r.blockers,'blockers',16000);}
    hold('REVIEW_INVALID',error.message);
  }
  if(claimed){for(const key of ['subject','verdict','reason','blockers'])if(Object.hasOwn(claimed,key)&&!same(claimed[key],review[key]))hold('REVIEW_MISMATCH','Claimed review differs from observed output');if(claimed.output_sha256!==undefined&&claimed.output_sha256!==digest(output))hold('REVIEW_MISMATCH','Claimed raw output hash differs');}
  return review;
}
function processEvidence(args,t,closed){
  const p=bounded(args.observed_process,'observed process',4000);
  const identity=value=>{
    if(!value||!Number.isSafeInteger(value.pid)||value.pid<1)hold('PROCESS_INVALID','Protected process identity required');
    const started=value.started_at??value.execution_started_at;
    if(typeof started!=='string'||!Number.isFinite(Date.parse(started))||value.started_at!==undefined&&value.execution_started_at!==undefined&&value.started_at!==value.execution_started_at)hold('PROCESS_INVALID','Unambiguous protected process start required');
    return {pid:value.pid,started};
  };
  const observed=identity(p);
  if(closed&&p.close_observed!==true)hold('PROCESS_INVALID','Protected process closure required');
  // A first finish is a process observation even without task/process. Retain
  // and check every existing identity; never replace one with a later PID.
  if(t.result&&!t.result.observed_process)hold('PROCESS_INVALID','Retained finish process evidence missing');
  if(t.closure&&!t.closure.observed_process)hold('PROCESS_INVALID','Retained closure process evidence missing');
  for(const prior of [t.attempt.process,t.result?.observed_process,t.closure?.observed_process]){
    if(prior===undefined||prior===null)continue;
    const bound=identity(prior);
    if(bound.pid!==observed.pid||bound.started!==observed.started)hold('PROCESS_CHANGED','Observed process identity changed');
  }
  return p;
}
function observation(tx,actor,t,action,args,extra={}){const id=digest(['runtime-observation',t.id,t.value.attempt.id,action]);if(tx.get('effects',id))hold('OBSERVATION_EXISTS','Observation is immutable');return tx.put('effects',id,{kind:'runtime_observation',status:'recorded',principal_id:actor.principal_id,scope:t.value.scope,task_id:t.id,attempt_id:t.value.attempt.id,action,...extra,at:now()},0);}
function command(tx,actor,action,args,protectedCall,taskBinding=null,onReplay=null){
  for(const key of ['actor','session_id','principal_id','runtime_observer','observer_capability'])if(Object.hasOwn(args,key))hold('ACTOR_ARGUMENT','Identity/capability cannot come from request fields');
  const operation=text(args.operation_id,'operation_id',160),payload=copy(args);delete payload.operation_id;
  const id=taskBinding?digest(['peer-task-command-v1',actor.principal_id,taskBinding,operation]):digest(['peer-command-v1',actor.principal_id,operation]);
  const hash=taskBinding?digest({channel:'task-effect',authority:taskBinding,action,args:payload}):digest({channel:protectedCall?'runtime-observer':'model',action,args:payload}),prior=tx.get('commands',id);
  if(prior){if(prior.value.request_sha256!==hash||taskBinding&&!same(prior.value.task_effect,taskBinding))hold('REPLAY_MISMATCH','Operation already names a different request');if(onReplay)onReplay();return copy(prior.value.result);}
  const principal=member(tx,actor),c=control(tx);policy(c);
  const mutationArgs=taskBinding?{...args,operation_id:digest(['peer-task-operation-v1',taskBinding,operation])}:args;
  const result=mutate(tx,actor,principal,c,action,mutationArgs,protectedCall,taskBinding);tx.put('commands',id,{principal_id:actor.principal_id,operation_id:operation,action,request_sha256:hash,...(taskBinding?{task_id:taskBinding.task_id,attempt_id:taskBinding.attempt_id,task_effect:copy(taskBinding)}:{}),result:bounded(result,'receipt',800000),created_at:now()},0);return result;
}
function assignmentCommitBinding(tx,ledger,actor,args,result){
  const bindings=new Map(),view=ordinaryAlias(Object.freeze({[ordinaryProofKey]:tx[ordinaryProofKey],[ordinaryGetOnlyKey]:true,get(family,id){
    const row=tx.get(family,id);bindings.set(canonical([family,id]),{family,id,row:row?copy(row):null});return row;
  }}),tx);
  taskAssignmentConnections.set(view,{company_id:ledger.company_id,root_sha256:digest(ledger.root)});
  const c=control(view),operator=member(view,actor);
  if(!founder(c,operator))hold('FOUNDER_REQUIRED','Actual founder operator required');
  const recipient=qualifiedTaskRecipient(view,member(view,{principal_id:args.to_principal_id})),owner={principal_id:recipient.id};
  // Capture the registry even for home-only resources; a late registry change
  // cannot substitute a different interpretation after assignment planning.
  view.get('control','resources');
  const scope=scopeOf(args.scope),resources=canonicalResources(view,args.resources),auth=authorize(view,owner,'task/submit',{...args,scope,resources});
  authorize(view,owner,'task/claim',{...args,scope,resources});
  const used=id=>{const n=view.get('control',id)?.value.model_calls??0;if(!Number.isSafeInteger(n)||n<0)hold('MODEL_BUDGET','Current model usage is invalid');return n;};
  const grantUsed=auth.grant?.value.used_model_calls??0,grantCap=auth.grant?.value.max_model_calls;
  if(!auth.grant||!Number.isSafeInteger(grantUsed)||grantUsed<0||!Number.isSafeInteger(grantCap)||grantCap<1||used('usage')>=policy(c).max_model_calls||used(`usage:${recipient.id}`)>=(policy(c).principal_model_calls??policy(c).max_model_calls)||grantUsed>=grantCap)hold('MODEL_BUDGET','Recipient task authority or model budget unavailable');
  const task=view.get('tasks',result?.id),value=task?.value;
  if(!task||value.owner_principal_id!==recipient.id||value.grant_id!==auth.grant.id||value.grant_generation!==auth.grant.value.generation||value.scope!==scope||!same(value.resources,resources)||!same(value.definition,result.value.definition)||value.assignment?.operation_id!==args.operation_id)hold('AUTHORITY_CHANGED','Original assigned task binding changed');
  semanticInputs(view,value.input_refs??[]);if(value.review_of)resolve(view,value.review_of);if(value.parent_ref)resolve(view,value.parent_ref);
  for(const resource of resources){
    const claim=view.get('claims',digest(['claim',task.id,resource.key]));
    if(!claim||claim.value.task_id!==task.id||claim.value.principal_id!==recipient.id||!same(claim.value.resource,resource))hold('AUTHORITY_CHANGED','Original assigned resource binding changed');
  }
  return {bindings:[...bindings.values()],expires_at_ms:Date.parse(auth.grant.value.expires_at)};
}
function run(ledger,actor,action,args,protectedCall,binding=null,production=null,ownerGuarded=false){
  // Validate before reading fields; accessors, custom prototypes, undefined,
  // symbols, sparse arrays, nonfinite numbers and lossy values fail as in P1.
  const a=copy(actor),input=bounded(args,'request',1000000);text(action,'action',100);
  if(scopeInputActions.has(action))scopeOf(input.scope);
  if(observationActions.has(action)&&!protectedCall)hold('OBSERVER_REQUIRED','Observation actions require the separate trusted host interface');
  // Route classification only. The owning write reselects and validates every
  // authority; a legacy-to-typed selection race holds before any attempt put.
  let typedAdmission=false;
  if(action==='task/admit'&&typeof ledger.read==='function')typedAdmission=ledger.read(tx=>{
    if(production)assertPeerProductionAuthority(tx,production,ledger);
    if(!trusted(member(tx,a)))hold('SCHEDULER_REQUIRED','Runtime admission required');
    const selected=peek(tx,input)?.value;
    return Boolean(selected&&(Object.hasOwn(selected,'handoff_ref')||Object.hasOwn(selected.definition??{},'handoff_ref')));
  });
  const guardedPlan=Boolean(action.startsWith('task/')||ownerGuarded||production&&['home/publish','task/admit'].includes(action)||typedAdmission||action.startsWith('handoff/')||['task/submit','task/assign'].includes(action)&&Object.hasOwn(input,'handoff_ref'));
  if(guardedPlan&&typeof ledger.guardedWrite!=='function')hold('TASK_EFFECT_UNAVAILABLE','Owning guarded task or handoff plan required');
  let deadline=production||action==='task/assign'||guardedPlan?Date.now()+TASK_EFFECT_LEASE_MS:null,assignment=null,replay=false,operatorBindings=null,semanticPlan=null;
  const terminal=production||action==='task/assign'||guardedPlan?tx=>{
    if(production)assertPeerProductionAuthority(tx,production,ledger);
    if(action==='task/assign'){
      const bindings=replay?operatorBindings:assignment?.bindings;
      if(!bindings)hold('AUTHORITY_CHANGED','Original assignment authority binding required');
      for(const expected of bindings)if(!same(tx.get(expected.family,expected.id),expected.row))hold('AUTHORITY_CHANGED','Assignment authority changed before commit');
    }
    if(guardedPlan){
      if(!semanticPlan)hold('AUTHORITY_CHANGED','Original checked source plan required');
      for(const origin of semanticPlan.ordinary_origins??[]){assertOriginalOrdinaryTaskSourceTupleFrom(origin.source_tuple);deadline=Math.min(deadline,origin.deadline_at_ms);}
      for(const expected of semanticPlan.bindings){
        const current=tx.get(expected.family,expected.id);
        if(expected.reference?(!current||!same(ref(expected.family,current),expected.reference)):current!==null&&current!==undefined)hold('AUTHORITY_CHANGED','Checked publication or handoff source changed before commit');
      }
    }
    return deadline;
  }:null;
  try{return plannedWrite(ledger,action,a.principal_id,tx=>{
    if(production){assertPeerProductionAuthority(tx,production,ledger);if(action==='task/admit')productionAdmissions.set(tx,production);}
    const p=member(tx,a);if(binding)checkBoundPrincipal(p,binding);else if(p.value.membership_qualification)hold('BOUND_CONNECTION_REQUIRED','Managed principal requires a protected bound connection');
    if(!(protectedCall&&observationActions.has(action))&&action!=='notice/create'){
      const owner=assertPeerOwnerOperatingState(tx,action);
      if(owner.controlled&&!guardedPlan)throw ownerGuardUpgrade;
    }
    if(action.startsWith('handoff/')){
      if(!production&&!binding)hold('BOUND_CONNECTION_REQUIRED','Original protected receiver or sender connection required');
      if(production&&!founder(control(tx),p))hold('FOUNDER_REQUIRED','Public handoff operator is the actual founder only');
    }
    if(production&&action==='home/publish'){
      if(!founder(control(tx),p))hold('FOUNDER_REQUIRED','Actual founder publication required');
      if(Object.keys(input).some(key=>!['operation_id','proposal_ref','review_ref','source_instruction'].includes(key)))hold('INVALID_INPUT','Unsupported founder publication field');
      for(const [key,family] of [['proposal_ref','proposals'],['review_ref','reviews']]){
        const value=input[key];if(!value||Object.keys(value).sort().join(',')!=='family,id,revision,sha256'||exactReference(value).family!==family)hold('SOURCE_INVALID','Exact publication source reference required');
      }
      productionPublications.set(tx,{operator:ref('principals',p),production_authority:production,source_instruction:text(input.source_instruction,'source instruction',4000)});
    }
    if(action==='task/assign'){
      const c=control(tx);if(!founder(c,p))hold('FOUNDER_REQUIRED','Actual founder operator required');
      operatorBindings=[{family:'control',id:c.id,row:copy(c)},{family:'principals',id:p.id,row:copy(p)}];
      taskAssignmentConnections.set(tx,{company_id:ledger.company_id,root_sha256:digest(ledger.root)});
    }
    if(action==='task/transfer')legacyOriginHold(control(tx));
    if(action.startsWith('task/')&&action!=='task/cancel'&&!observationActions.has(action)){const target=input.task_id?tx.get('tasks',input.task_id):null;ordinaryOriginFrom(tx,['task/submit','task/assign','task/admit'].includes(action)?action:'task/context',target);}
    const result=command(tx,a,action,input,protectedCall,null,()=>{replay=true;});
    if(['task/submit','task/assign'].includes(action)&&result?.value?.definition)ordinaryOriginFrom(tx,action,result);
    if(production&&action==='home/publish'){
      const publication=result?.publication;
      if(!result?.home||!publication||Object.keys(result).sort().join(',')!=='home,publication'||publication.id!==digest(['founder-home-publication-v1',p.id,input.operation_id])||publication.value?.kind!=='founder_home_publication_v1'||!same(publication.value.home,ref('homes',result.home))||!same(publication.value.proposal,input.proposal_ref)||!same(publication.value.review,input.review_ref)||publication.value.operator?.id!==p.id||publication.value.source_instruction!==input.source_instruction)hold('PUBLICATION_PRODUCER_REQUIRED','Original founder publication receipt required');
    }
    if(action==='task/assign'&&!replay){
      assignment=assignmentCommitBinding(tx,ledger,a,input,result);
      deadline=Math.min(deadline,assignment.expires_at_ms);
    }
    if(guardedPlan&&action==='task/admit'&&result?.admitted){
      const authority=result.task?.value.attempt?.effect_authority;
      if(production&&(!authority?.production_authority||!same(authority.production_authority,production)))hold('PRODUCTION_OWNER_CHANGED','Admission was not produced by this runtime owner');
      deadline=Math.min(deadline,Date.parse(authority.expires_at));
    }
    return result;
  },terminal,guardedPlan?plan=>{
    semanticPlan=plan;
    for(const grant of plan.authorizing_grants)deadline=Math.min(deadline,grant.expires_at_ms);for(const origin of plan.ordinary_origins)deadline=Math.min(deadline,origin.deadline_at_ms);
  }:null);}catch(error){
    if(error!==ownerGuardUpgrade||ownerGuarded)throw error;
    // The first owning transaction has rolled back its reads. Reselect and
    // validate everything in a fresh guarded transaction; no authority cache,
    // model call, native attempt or renewed allowance crosses this boundary.
    return run(ledger,a,action,input,protectedCall,binding,production,true);
  }
}
export function execute(ledger,actor,action,args={}){return run(ledger,actor,action,args,false);}

/** Private production composition. The owner seal is captured from canonical
 * state; no caller-supplied owner reference/callback can mint it. Diagnostics
 * and original closure observations are separate from new-work authority. */
export function bindPeerProductionScheduler(ledger){
  if(typeof ledger?.guardedWrite!=='function')hold('PRODUCTION_OWNER_CHANGED','Owning guarded ledger required');
  const production=ledger.read(tx=>{
    const c=control(tx),principal=tx.get('principals',c.value.founder_principal_id);
    if(principal?.value.kind!=='founder'||principal.value.status!=='active'||!principal.value.legacy_owner)hold('PRODUCTION_OWNER_CHANGED','Canonical adopted founder required');
    const value=bounded({protocol:'peer-production-authority-v1',company_id:ledger.company_id,root_sha256:digest(ledger.root),founder:ref('principals',principal),legacy_owner:principal.value.legacy_owner},'production owner seal',4000);
    assertPeerProductionAuthority(tx,value,ledger);return value;
  });
  const current=()=>ledger.read(tx=>assertPeerProductionAuthority(tx,production,ledger));
  const facade=Object.freeze({
    execute(connection,actor,action,args={}){
      if(connection!==ledger)hold('PRODUCTION_OWNER_CHANGED','Original production ledger required');
      if(!['task/admit','task/assign','grant/create','grant/revoke','home/publish','handoff/send','handoff/accept','handoff/reject'].includes(action))hold('PRODUCTION_ACTION_HELD','Unsupported production scheduler action');
      return run(ledger,actor,action,args,false,null,production);
    },
    inspect(connection,actor,action,args={}){
      if(connection!==ledger)hold('PRODUCTION_OWNER_CHANGED','Original production ledger required');
      if(!['runtime/status','task/peek','handoff/pending'].includes(action))hold('PRODUCTION_ACTION_HELD','Unsupported production scheduler inspection');
      return inspectBound(ledger,actor,action,args,null,action==='runtime/status'?null:production);
    },
    validateContext(provider,context){
      const tx=trackedReads(provider);
      try{
        const task=tx.get('tasks',context.task.id),authority=task?.value.attempt?.effect_authority?.production_authority;
        if(!authority||!same(authority,production))return false;
        assertPeerProductionAuthority(tx,production,ledger);
        if(!validateContext(tx,context))return false;
        assertPeerProductionAuthority(tx,production,ledger);return true;
      }catch(error){if(readFailure(tx,error))throw error;return false;}
    },
    membershipWrite(type,channel,fn){
      if(!['membership/enroll','membership/admit','membership/activate','membership/revoke'].includes(type)||channel!=='operator'||typeof fn!=='function')hold('PRODUCTION_ACTION_HELD','Trusted membership operator write required');
      const deadline=Date.now()+TASK_EFFECT_LEASE_MS;
      let ownerBindings=null;
      // Membership supplies a role channel. Planning and the event actor bind
      // the canonical founder captured by this original production scheduler.
      return plannedWrite(ledger,type,production.founder.id,tx=>{
        assertPeerProductionAuthority(tx,production,ledger);
        ownerBindings=ownerOperatingBinding(tx,type).bindings;
        const result=fn(tx);
        return result;
      },tx=>{assertPeerProductionAuthority(tx,production,ledger);checkCurrentBindings(tx,ownerBindings);return deadline;});
    },
    assertCurrent:current
  });
  productionSchedulers.set(facade,{ledger,production});
  return facade;
}

// Identity-only validation for the optional fixed production membership join.
// It does not renew the captured owner or make matching DATA a capability.
export function assertOriginalPeerProductionScheduler(facade,ledger){
  const original=productionSchedulers.get(facade);
  if(!original||original.ledger!==ledger)hold('PRODUCTION_OWNER_CHANGED','Original production scheduler capability required');
}

// Source-private membership-only paused composition. This service handle is
// non-authorizing: every actual operation must load the genuine original
// seal/checkpoint/selected finite purpose before any put or shared charge.
export function createOriginalPeerBootstrapMembershipFacade({ledger,actor}){
  if(Object.getPrototypeOf(ledger)!==PeerLedger.prototype)hold('BOOTSTRAP_LEDGER_REQUIRED','Original ledger required');
  const a=bootstrapActor(actor),connection={root:ledger.root,company_id:ledger.company_id,directory:ledger.directory};
  const operatorId=ledger.read(tx=>control(tx).value.founder_principal_id);
  const actions=new Set(['membership/enroll','membership/admit','membership/activate','membership/revoke','bootstrap-membership.native_created','bootstrap-membership.read','bootstrap-membership.submitted','bootstrap-membership.completed','bootstrap-membership.unknown','bootstrap-membership.late_evidence']);
  function write(type,channel,fn,input){
    if(!actions.has(type)||typeof fn!=='function')hold('BOOTSTRAP_ACTION_HELD','Closed bootstrap action required');
    for(const k of ['root','company_id','directory'])if(Object.getOwnPropertyDescriptor(ledger,k)?.value!==connection[k])hold('BOOTSTRAP_CONNECTION_CHANGED','Original bootstrap connection changed');
    let deadline,expected,inventoryRef;
    const admitting=type==='membership/admit',inventoryChecked=admitting||['bootstrap-membership.native_created','bootstrap-membership.read','bootstrap-membership.submitted','bootstrap-membership.completed'].includes(type);
    return ledger.guardedWrite(type,type.startsWith('membership/')?a.session_id:'source-observer:bootstrap-membership',raw=>{
      if(admitting){const phase=raw.get('work_items','membership-phase:'+input.enrollment_id+':'+input.phase);if(phase?.value.admission_ref){inventoryRef=copy(phase.value.admission_ref);assertInventoryInTransaction(ledger,raw,{stage:'existing',admission_ref:inventoryRef});}else assertInventoryInTransaction(ledger,raw,{stage:'reserve'});}
      else if(inventoryChecked){const phase=raw.get('work_items','membership-phase:'+input.enrollment_id+':'+input.phase);if(!phase?.value.admission_ref)hold('ORIGINAL_EXECUTION_ADMISSION_REQUIRED','Exact bootstrap admission required');inventoryRef=copy(phase.value.admission_ref);assertInventoryInTransaction(ledger,raw,{stage:'existing',admission_ref:inventoryRef});}
      const proof=assertPeerBootstrapOperationFrom(raw,{ledger,actor:a,input,action:type}),enrollment=input.enrollment_id&&raw.get('work_items','membership:'+input.enrollment_id);deadline=Math.min(proof.deadline_at_ms,Date.parse(enrollment?.value.expires_at??input.expires_at));
      if(enrollment)for(const phase of ['reconstruction','review']){const p=raw.get('work_items','membership-phase:'+input.enrollment_id+':'+phase);if(p?.value.bootstrap_protocol==='peer-bootstrap-membership-phase-v1'){const a=raw.getVersion(p.value.admission_ref);if(a?.value.protocol!=='peer-bootstrap-membership-admission-v1'||a.sha256!==p.value.admission_ref.sha256||!Number.isSafeInteger(a.value.binding?.deadline_at_ms))hold('BOOTSTRAP_ORIGINAL_ADMISSION_REQUIRED','Original phase deadline required');deadline=Math.min(deadline,a.value.binding.deadline_at_ms);}}
      if(!Number.isSafeInteger(deadline)||deadline<=Date.now())hold('BOOTSTRAP_EXPIRED','Original finite bootstrap purpose required');
      const current=new Map();let n=0;
      for(const family of FAMILIES)for(const row of all(raw,family)){if(++n>MAX_ROWS)hold('BOOTSTRAP_CAPACITY','Complete original bootstrap namespace required');current.set(canonical([family,row.id]),{family,id:row.id,row});}
      const snapshot=raw.get('control','company');let started=false;
      const provider={...raw,get(f,id){const row=raw.get(f,id),k=canonical([f,id]);if(!current.has(k))current.set(k,{family:f,id,row});return row;},put(f,id,value,revision){if(!started){const probe=raw.getVersion(ref('control',snapshot));if(!probe||probe.sha256!==snapshot.sha256||peerDigest(probe.value)!==snapshot.sha256)hold('BOOTSTRAP_SOURCE_CHANGED','Original prewrite snapshot required');started=true;}const row=raw.put(f,id,value,revision);current.set(canonical([f,id]),{family:f,id,row});return row;}};
      const result=fn(provider);if(admitting){const phase=raw.get('work_items','membership-phase:'+input.enrollment_id+':'+input.phase);if(!phase?.value.admission_ref)hold('ORIGINAL_EXECUTION_ADMISSION_REQUIRED','Exact bootstrap admission required');inventoryRef=copy(phase.value.admission_ref);if(phase.created_seq===raw.sequence)prepareInventoryLaunch(ledger,raw,{admission_ref:inventoryRef});}if(typeof raw.sealWrites!=='function')hold('BOOTSTRAP_COMMIT_REQUIRED','Original write seal required');raw.sealWrites();expected=[...current.values()];
      for(const x of expected)if(!same(raw.get(x.family,x.id),x.row))hold('BOOTSTRAP_SOURCE_CHANGED','Bootstrap source/postimage changed');return result;
    },tx=>{for(const k of ['root','company_id','directory'])if(Object.getOwnPropertyDescriptor(ledger,k)?.value!==connection[k])hold('BOOTSTRAP_CONNECTION_CHANGED','Original bootstrap connection changed');for(const x of expected)if(!same(tx.get(x.family,x.id),x.row))hold('BOOTSTRAP_SOURCE_CHANGED','Original bootstrap physical postimage changed');if(inventoryRef)assertInventoryInTransaction(ledger,tx,{stage:'existing',admission_ref:inventoryRef});return deadline;});
  }
  const facade=Object.freeze({membershipWrite:write});bootstrapMembershipFacades.set(facade,{ledger,actor:a,operatorId,connection});return facade;
}
export function assertOriginalPeerBootstrapMembershipFacade(facade,ledger){
  const r=bootstrapMembershipFacades.get(facade);if(!r||r.ledger!==ledger)hold('BOOTSTRAP_ORIGINAL_FACADE_REQUIRED','Original same-ledger bootstrap facade required');return {operator_principal_id:r.operatorId,actor:copy(r.actor)};
}

function checkBoundPrincipal(principal,binding){
  if(principal.id!==binding.principal_id||principal.value.generation!==binding.generation||principal.value.native_id!==binding.native_id||!['cos','reviewer','specialist'].includes(principal.value.kind))hold('PRINCIPAL_CHANGED','Protected principal incarnation changed');
}
// Trusted factory, never a model tool. Authentication must already have bound
// this connection outside model arguments. Generation checks occur in the SAME
// P1 transaction/snapshot as command/replay/inspection, not a broker pre-read.
export function bindPeerPrincipal(ledger,binding){
  const b=copy(binding);
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).sort().join(',')!=='generation,native_id,principal_id'||!Number.isSafeInteger(b.generation)||b.generation<1)hold('AUTHENTICATION_REQUIRED','Closed protected principal binding required');
  text(b.principal_id,'bound principal',200);text(b.native_id,'bound native identity',300);
  const company=ledger.company_id,root=ledger.root,actor={principal_id:b.principal_id};
  ledger.read(tx=>checkBoundPrincipal(member(tx,actor),b));
  const input=args=>{
    if(ledger.company_id!==company||ledger.root!==root)hold('AUTHENTICATION_REQUIRED','Protected company connection changed');
    const value=bounded(args,'bound request',1000000);
    if(!value||typeof value!=='object'||Array.isArray(value))hold('INVALID_INPUT','Bound request object required');
    for(const key of ['root','company_id','actor','principal_id','session_id','generation','native_id','thread_id','turn_id','attempt_id','incarnation','runtime_observer','observer_capability'])if(Object.hasOwn(value,key))hold('ACTOR_ARGUMENT','Identity cannot come from model arguments');
    return value;
  };
  const connection=Object.freeze({execute:(action,args={})=>run(ledger,actor,action,input(args),false,b),inspect:(action,args={})=>inspectBound(ledger,actor,action,input(args),b)});
  boundPrincipalConnections.set(connection,{ledger,binding:b,actor,company,root,input});
  return connection;
}

const taskEffectActions=new Set(['message/send','notice/create','home/propose','handoff/accept','handoff/reject']);
const taskEffectActionKeys={
  'message/send':new Set(['operation_id','task_id','scope','grant_id','grant_generation','to_principal_id','content','summary','kind']),
  'notice/create':new Set(['operation_id','task_id','scope','grant_id','grant_generation','content','summary','kind']),
  'home/propose':new Set(['operation_id','task_id','scope','grant_id','grant_generation','home_id','expected_revision','content','dependencies','input_refs']),
  'handoff/accept':new Set(['operation_id','task_id','handoff_ref','reason','source_instruction']),
  'handoff/reject':new Set(['operation_id','task_id','handoff_ref','reason','source_instruction'])
};
const taskEffectAuthorityArguments=['authority_epoch','authority_previous','authority_event_seq','effect_authority','effect_lease','lease','expires_at','deadline_at_ms','executor','executor_incarnation','admission_producer','task_effect'];
function taskEffectRequest(source,args){
  const input=source.input(args);
  for(const key of taskEffectAuthorityArguments)if(Object.hasOwn(input,key))hold('ACTOR_ARGUMENT','Task authority cannot come from model arguments');
  return input;
}
function taskEffectArguments(task,action,input){
  const t=task.value;
  if(Object.keys(input).some(key=>!taskEffectActionKeys[action].has(key)))hold('INVALID_INPUT','Unsupported task action argument');
  if(input.task_id!==undefined&&input.task_id!==task.id)hold('TASK_OWNER','Only the admitted task is available');
  if(action==='handoff/accept'||action==='handoff/reject'){
    if(!taskHandoffAliases(task))hold('HANDOFF_REQUIRED','Only this task\'s admitted typed handoff may be decided');
    if(Object.hasOwn(input,'handoff_ref')){
      if(!input.handoff_ref||Object.keys(input.handoff_ref).sort().join(',')!=='family,id,revision,sha256')hold('SOURCE_INVALID','Exact closed admitted handoff reference required');
      if(!same(exactReference(input.handoff_ref),t.handoff_ref))hold('HANDOFF_RECEIVER','Only the exact admitted handoff is available');
    }
    return {...input,handoff_ref:copy(t.handoff_ref),scope:t.scope,grant_id:t.grant_id,grant_generation:t.grant_generation,resources:copy(t.resources)};
  }
  if(input.scope!==undefined&&scopeOf(input.scope)!==t.scope||input.grant_id!==undefined&&input.grant_id!==t.grant_id||input.grant_generation!==undefined&&input.grant_generation!==t.grant_generation)hold('TASK_EFFECT_SCOPE','The action must use the admitted task scope and grant');
  const resources=action==='home/propose'?[{kind:'home',id:text(input.home_id,'home_id',200)}]:[];
  if(resources.some(resource=>!t.resources.some(bound=>contains(bound,{...resource,key:`home:${resource.id}`}))))hold('RESOURCE_AUTHORITY','The action is outside the admitted task resources');
  let inputs={};
  if(action==='home/propose'){
    const requested=input.input_refs??[],dependencies=input.dependencies??[];
    if(!Array.isArray(requested)||!Array.isArray(dependencies)||requested.length>100||dependencies.length>100)hold('SOURCE_INVALID','Bounded admitted proposal references required');
    const supplied=new Set(t.attempt.context.sources.map(r=>canonical(exactReference(r))));
    for(const r of [...requested,...dependencies])if(!supplied.has(canonical(exactReference(r))))hold('SOURCE_INVALID','Proposal evidence must be in the admitted context');
    // A model cannot omit an admitted out-of-scope contributor and thereby
    // erase it from downstream independence/currentness checks.
    const required=[...t.input_refs,...(t.review_of?[t.review_of]:[]),...(t.parent_ref?[t.parent_ref]:[])];
    const input_refs=[...new Map([...required,...requested].map(r=>[canonical(exactReference(r)),copy(r)])).values()];
    if(input_refs.length>100)hold('SOURCE_INVALID','Complete admitted proposal references exceed capacity');
    inputs={input_refs};
  }
  return {...input,...inputs,scope:t.scope,grant_id:t.grant_id,grant_generation:t.grant_generation,resources};
}
function taskEffectProducer(tx,task,effect){
  const event=tx.events({after:effect.created_seq-1,limit:1}).items[0],changes=event?.payload?.changes?.filter(change=>change.family==='commands');
  if(event?.seq!==effect.created_seq||event.type!=='task/admit'||changes?.length!==1)hold('TASK_ADMISSION_REQUIRED','Original scheduler admission event required');
  const scheduler=member(tx,{principal_id:event.principal_id});
  if(!trusted(scheduler))hold('TASK_ADMISSION_REQUIRED','Original scheduler admission producer required');
  const reference=ref('commands',changes[0]),command=tx.getVersion(reference),v=command?.value,receipt=v?.result,a=task.value.attempt;
  if(v?.action!=='task/admit'||v.principal_id!==event.principal_id||receipt?.admitted!==true||receipt.task?.id!==task.id||receipt.task.value?.status!=='running'||receipt.task.value.authority_epoch!==task.value.authority_epoch||receipt.task.value.authority_event_seq!==task.value.authority_event_seq||!same(receipt.task.value.authority_previous,task.value.authority_previous)||receipt.task.value.attempt?.id!==a.id||receipt.task.value.attempt.effect_id!==a.effect_id||receipt.task.value.attempt.request_sha256!==a.request_sha256||receipt.task.value.attempt.definition_revision!==a.definition_revision||!same(receipt.task.value.attempt.effect_authority,a.effect_authority)||!same(receipt.context,a.context)||!same(receipt.task.value.attempt.context,a.context))hold('TASK_ADMISSION_REQUIRED','Exact immutable admitted task and context required');
  return {event_seq:event.seq,event_sha256:event.sha256,command:reference};
}
function taskEffectState(raw,source,taskId,executor,seal=null,{context=true,action=null,input=null}={}){
  const tx=trackedReads(raw),{ledger,actor,binding}=source;
  if(ledger.company_id!==source.company||ledger.root!==source.root)hold('AUTHENTICATION_REQUIRED','Protected company connection changed');
  const principal=member(tx,actor);checkBoundPrincipal(principal,binding);
  const owner=context&&action!=='notice/create'?ownerOperatingBinding(tx,action??'task/effect-bind'):null;
  const c=control(tx);policy(c);
  if(c.value.paused)hold('PAUSED','Pause fences task effects');
  const task=tx.get('tasks',taskId),t=task?.value,a=t?.attempt,ordinary=ordinaryOriginFrom(tx,'task/effect',task);
  if(!task||t.owner_principal_id!==principal.id)hold('TASK_OWNER','Current admitted task owner required');
  if(t.status!=='running'||Object.hasOwn(t,'result')||Object.hasOwn(t,'closure')||!a||a.termination_confirmed!==false)hold('TASK_INACTIVE','Only an intact running attempt can act');
  const authority=a.effect_authority;
  if(!authority||!['epoch,expires_at,issued_at,protocol','epoch,expires_at,issued_at,production_authority,protocol'].includes(Object.keys(authority).sort().join(','))||authority.protocol!=='peer-task-effect-authority-v1'||!Number.isSafeInteger(t.authority_epoch)||t.authority_epoch<1||authority.epoch!==t.authority_epoch||!Object.hasOwn(t,'authority_previous')||!Number.isSafeInteger(t.authority_event_seq))hold('TASK_AUTHORITY_CHANGED','Source-produced current task authority required');
  if(Object.hasOwn(authority,'production_authority'))assertPeerProductionAuthority(tx,authority.production_authority,ledger);
  const issued=Date.parse(authority.issued_at),expires=Date.parse(authority.expires_at);
  if(typeof authority.issued_at!=='string'||typeof authority.expires_at!=='string'||!Number.isSafeInteger(issued)||!Number.isSafeInteger(expires)||new Date(issued).toISOString()!==authority.issued_at||new Date(expires).toISOString()!==authority.expires_at||expires<=issued||expires-issued>TASK_EFFECT_LEASE_MS||a.admitted_at!==authority.issued_at)hold('TASK_AUTHORITY_CHANGED','Source-produced finite task effect lease required');
  if(seal&&(t.authority_epoch!==seal.namespace.authority_epoch||t.authority_event_seq!==seal.producer.event_seq||!same(t.authority_previous,seal.previous)||a.id!==seal.namespace.attempt_id||a.context?.sha256!==seal.namespace.context_sha256||!same(authority,seal.authority)))hold('TASK_AUTHORITY_CHANGED','Task admission authority changed');
  const ctx=a.context;
  if(!ctx||typeof ctx.text!=='string')hold('TASK_AUTHORITY_CHANGED','Original admitted context framing required');
  const {text:encoded,sha256,hash,utf8_bytes,...contextBody}=ctx;
  if(ctx.protocol!=='peer-task-context-v1'||canonical(contextBody)!==encoded||digest(encoded)!==sha256||hash!==sha256||Buffer.byteLength(encoded)!==utf8_bytes)hold('TASK_AUTHORITY_CHANGED','Admitted context body differs from its sealed bytes');
  if(!t.definition||digest(t.definition)!==t.definition_sha256)hold('TASK_AUTHORITY_CHANGED','Original task definition changed');
  if(ordinary?!Object.hasOwn(ctx,'ordinary_origin')||!same(ctx.ordinary_origin,peerOrdinaryOriginCompulsoryContext(ordinary)):Object.hasOwn(ctx,'ordinary_origin'))hold('ORIGIN_ORDINARY_TASK_RAW_INCOMPLETE','Admitted compulsory original RAW/incidence changed');
  for(const field of ['scope','host','role','stage','instructions','acceptance','resources','outcome','input_refs','review_of','parent_task_id','parent_ref'])if(!Object.hasOwn(t,field)||!Object.hasOwn(t.definition,field)||!same(t[field],t.definition[field]))hold('TASK_AUTHORITY_CHANGED','Original task purpose or resource aliases changed');
  taskHandoffAliases(task);
  if(Object.hasOwn(t,'assignment')!==Object.hasOwn(t.definition,'assignment')||Object.hasOwn(t,'assignment')&&!same(t.assignment,t.definition.assignment))hold('TASK_AUTHORITY_CHANGED','Original assignment provenance changed');
  if(!ctx||ctx.task?.id!==task.id||ctx.task.owner_principal_id!==principal.id||ctx.task.definition_revision!==t.definition_revision||ctx.task.definition_sha256!==t.definition_sha256||!same(ctx.task.definition,t.definition)||a.definition_revision!==t.definition_revision||a.model_calls!==1||a.id!==digest(['attempt',task.id,t.definition_revision])||ctx.principal?.id!==principal.id||ctx.principal.revision!==principal.revision||ctx.principal.sha256!==principal.sha256)hold('TASK_AUTHORITY_CHANGED','Admitted task/principal/context tuple changed');
  if(c.value.policy_generation!==a.policy_generation||c.value.pause_generation!==a.pause_generation||ctx.control?.policy_generation!==c.value.policy_generation||ctx.control?.pause_generation!==c.value.pause_generation||ctx.control?.governance_sha256!==(c.value.governance_sha256??null)||!same(ctx.control.policy,policy(c)))hold('AUTHORITY_CHANGED','Admitted control policy or pause generation changed');
  const auth=taskAuthority(tx,actor,task,'task/claim');
  if(ctx.task.grant_id!==t.grant_id||ctx.task.grant_generation!==t.grant_generation||!same(ctx.grant,auth.grant?grantBinding(auth.grant):{founder_principal_id:principal.id}))hold('GRANT_CHANGED','Admitted grant changed');
  const effect=tx.get('effects',a.effect_id),slot=tx.get('slots',task.id);
  const request={kind:'native',task_id:task.id,definition_sha256:t.definition_sha256,context_sha256:ctx.sha256};
  const originalEffect={kind:'native',task_id:task.id,principal_id:principal.id,scope:t.scope,status:'reserved',request,request_sha256:digest(request),grant_id:t.grant_id,grant_generation:t.grant_generation,policy_generation:a.policy_generation,pause_generation:a.pause_generation,termination_confirmed:false};
  if(a.effect_id!==digest(['native-effect',task.id,t.definition_revision])||a.request_sha256!==digest(request)||effect?.revision!==1||effect.created_seq!==t.authority_event_seq||effect.sha256!==peerDigest(originalEffect)||slot?.value.status!=='active'||slot.value.task_id!==task.id||slot.value.principal_id!==principal.id||slot.value.attempt_id!==a.id||slot.value.effect_id!==effect.id)hold('TASK_RESERVATION_CHANGED','Original active task reservations required');
  if(context&&!validateContext(tx,ctx))hold('CONTEXT_CHANGED','Complete admitted context is no longer current');
  const handoff=context?taskHandoff(tx,principal,task):null;
  if(handoff){
    const bindings=new Map(handoff.bindings.map(value=>[canonical([value.family,value.id]),value]));
    for(const source of ctx.sources){const exact=semanticReference(source);bindings.set(canonical([exact.family,exact.id]),{family:exact.family,id:exact.id,reference:exact});}
    handoff.bindings=[...bindings.values()];
  }
  let producer;
  if(seal){
    producer=seal.producer;
    const command=tx.get('commands',producer.command.id);
    if(command?.revision!==producer.command.revision||command.sha256!==producer.command.sha256||effect.created_seq!==producer.event_seq)hold('TASK_ADMISSION_REQUIRED','Sealed admission producer changed');
  }else producer=taskEffectProducer(tx,task,effect);
  let args=null;
  if(action){args=taskEffectArguments(task,action,input);authorize(tx,actor,action,args);}
  if(Object.hasOwn(authority,'production_authority'))assertPeerProductionAuthority(tx,authority.production_authority,ledger);
  // This source assertion is deliberately AFTER every SQL/context/provider
  // operation. It reads private original executor state, never model flags.
  const incarnation=assertOriginalPeerExecutorIncarnation(executor,{ledger,task_id:task.id,attempt_id:a.id,context_sha256:ctx.sha256});
  if(incarnation.company_id!==source.company||incarnation.principal_id!==principal.id||incarnation.generation!==binding.generation||incarnation.native_id!==binding.native_id||!Number.isSafeInteger(incarnation.deadline_at_ms))hold('EXECUTOR_CHANGED','Original executor/principal association required');
  if(seal&&!same(incarnation,seal.incarnation))hold('EXECUTOR_CHANGED','Original executor incarnation changed');
  const deadline=Math.min(expires,auth.grant?Date.parse(auth.grant.value.expires_at):Infinity,incarnation.deadline_at_ms,ordinary?.deadline_at_ms??Infinity);
  if(!Number.isSafeInteger(deadline)||deadline<=issued)hold('TASK_AUTHORITY_CHANGED','Finite source deadline required');
  if(context){const cutoff=Date.now();if(!Number.isFinite(cutoff)||cutoff>=deadline)hold('TASK_EFFECT_EXPIRED','Task effect lease expired before replay or effects');}
  return {task,context:ctx,authority,producer,incarnation,deadline,args,handoff,owner,ordinary};
}

/** Trusted host composition only. Models receive only the returned execute /
 * inspect closures. The connection and executor are original opaque objects;
 * task identity is selected by the host, while all authority is derived from
 * the current owning ledger and original admission producer. No native/profile
 * qualification or external/publication capability is conferred by this API. */
export function bindPeerTaskEffects(originalConnection,selector,executor){
  const source=boundPrincipalConnections.get(originalConnection),selected=bounded(selector,'task selector',1000);
  if(!source)hold('AUTHENTICATION_REQUIRED','Original protected principal connection required');
  if(!selected||Array.isArray(selected)||Object.keys(selected).join(',')!=='task_id')hold('INVALID_INPUT','Only an exact task selector is accepted');
  const taskId=text(selected.task_id,'task id',200),{ledger,actor}=source;
  if(typeof ledger.guardedWrite!=='function')hold('TASK_EFFECT_UNAVAILABLE','Owning physical precommit guard required');
  let seal;
  const terminal=(action=null,input=null,bindings=()=>null,ordinaryGuard=()=>null)=>view=>{
    const pinned=ordinaryGuard(),tx=pinned?ordinaryPhysicalProvider(ledger,view,pinned):view;
    const state=taskEffectState(tx,source,taskId,executor,seal,{context:false,action,input});
    checkCurrentBindings(tx,bindings());if(pinned)ordinaryPhysicalProvider(ledger,view,pinned);return Math.min(state.deadline,ordinaryPhysicalDeadline(pinned));
  };
  let initialHandoffBindings=null,initialOrdinaryGuard=null;
  ledger.guardedWrite('task/effect-bind',actor.principal_id,tx=>{
    const state=taskEffectState(tx,source,taskId,executor);
    const namespace={protocol:'peer-task-effect-binding-v1',task_id:taskId,attempt_id:state.task.value.attempt.id,authority_epoch:state.authority.epoch,context_sha256:state.context.sha256,admission_producer:state.producer,executor_incarnation_id:state.incarnation.incarnation_id,runtime_generation:state.incarnation.runtime_generation};
    seal={namespace:copy(namespace),authority:copy(state.authority),previous:copy(state.task.value.authority_previous),producer:copy(state.producer),incarnation:copy(state.incarnation),handoff_bindings:state.handoff?copy(state.handoff.bindings):null,owner_bindings:state.owner?.bindings??null};
    initialHandoffBindings=[...(seal.handoff_bindings??[]),...(seal.owner_bindings??[])];
    initialOrdinaryGuard=prepareOrdinaryPhysicalGuard(ledger,tx,state.ordinary?[state.ordinary]:[]);
    if(initialOrdinaryGuard||state.handoff||seal.owner_bindings){if(typeof tx.sealWrites!=='function')hold('TASK_EFFECT_UNAVAILABLE','Owning task write closure required');tx.sealWrites();}
  },terminal(null,null,()=>initialHandoffBindings,()=>initialOrdinaryGuard));
  return Object.freeze({
    execute(action,args={}){
      text(action,'task action',100);
      if(!taskEffectActions.has(action))hold('TASK_EFFECT_ACTION_HELD','This task action has no implemented guarded path');
      const input=taskEffectRequest(source,args);
      let semanticPlan=null;
      return plannedWrite(ledger,action,actor.principal_id,tx=>{
        const state=taskEffectState(tx,source,taskId,executor,seal,{action,input});
        // Task authority precedes even a matching command receipt lookup.
        return command(tx,actor,action,state.args,false,seal.namespace);
      },terminal(action,input,()=>semanticPlan?.bindings),seal.handoff_bindings||seal.owner_bindings?plan=>{semanticPlan=plan;}:null);
    },
    inspect(action,args={}){
      const input=taskEffectRequest(source,args);
      if(!['task/get','task/context'].includes(action)||Object.keys(input).some(key=>key!=='task_id')||input.task_id!==undefined&&input.task_id!==taskId)hold('TASK_EFFECT_ACTION_HELD','Only this admitted task can be inspected');
      let handoffBindings=null,ordinaryGuard=null;
      return ledger.guardedWrite(action,actor.principal_id,tx=>{
        const state=taskEffectState(tx,source,taskId,executor,seal);
        handoffBindings=[...(state.handoff?.bindings??[]),...(state.owner?.bindings??[])];
        ordinaryGuard=prepareOrdinaryPhysicalGuard(ledger,tx,state.ordinary?[state.ordinary]:[]);
        if(ordinaryGuard||state.handoff||state.owner?.bindings){if(typeof tx.sealWrites!=='function')hold('TASK_EFFECT_UNAVAILABLE','Owning task write closure required');tx.sealWrites();}
        return copy(action==='task/get'?state.task:state.context);
      },terminal(null,null,()=>handoffBindings,()=>ordinaryGuard));
    }
  });
}
export function createRuntimeObserver(ledger,{principal_id='scheduler'}={}){
  // Host-owned capability by reachability. Do not export this factory through
  // tool dispatch. Calling it is not native qualification or authentication.
  const actor=copy({principal_id});ledger.read(tx=>{if(!trusted(member(tx,actor)))hold('SCHEDULER_REQUIRED','Trusted runtime principal required');});
  return Object.freeze({record:(action,args)=>{if(!observationActions.has(action))hold('OBSERVER_ACTION','Unsupported observation action');return run(ledger,actor,action,args,true);}});
}
function mutate(tx,actor,principal,c,action,args,protectedCall,taskBinding=null,assignment=null){
  if(['task/submit','task/assign'].includes(action)&&Object.hasOwn(args,'origin_qualification_ref'))hold('ACTOR_ARGUMENT','Origin qualification is source-captured only');
  if(['task/submit','task/assign'].includes(action)&&Object.hasOwn(args,'handoff_envelope'))hold('ACTOR_ARGUMENT','Task handoff envelopes are source-produced only');
  if(action==='grant/create'||action==='grant/revoke'){
    if(!founder(c,principal))hold('FOUNDER_REQUIRED','Founder grant control required');const id=text(args.grant_id,'grant_id',200),old=tx.get('grants',id);
    if(action==='grant/revoke'){if(!old)hold('GRANT_MISSING','Missing grant');return tx.put('grants',id,{...old.value,status:'revoked',generation:old.value.generation+1,revoked_at:now()},old.revision);}
    if(old)hold('GRANT_EXISTS','Create a new grant');member(tx,{principal_id:args.to_principal_id});if(!Array.isArray(args.actions)||!args.actions.length||args.actions.length>100||args.actions.some(a=>typeof a!=='string'||!a||a.length>100)||!Number.isFinite(Date.parse(args.expires_at))||Date.parse(args.expires_at)<=Date.now()||args.max_model_calls!==undefined&&(!Number.isSafeInteger(args.max_model_calls)||args.max_model_calls<1))hold('GRANT_INVALID','Bounded grant policy required');
    return tx.put('grants',id,{principal_id:args.to_principal_id,status:'active',generation:1,policy_generation:c.value.policy_generation,scope:scopeOf(args.scope),actions:[...new Set(args.actions)].sort(),resources:canonicalResources(tx,args.resources),expires_at:args.expires_at,source_instruction:text(args.source_instruction,'source instruction',4000),max_model_calls:Math.min(args.max_model_calls??policy(c).max_model_calls,policy(c).max_model_calls),used_model_calls:0},0);
  }
  if(['company/pause','company/resume'].includes(action)){if(!founder(c,principal))hold('FOUNDER_REQUIRED','Founder control required');text(args.source_instruction,'source instruction',4000);if(action==='company/resume')legacyOriginHold(c);return tx.put('control','company',{...c.value,paused:action==='company/pause',pause_generation:c.value.pause_generation+1},c.revision);}
  if(action==='task/assign'){
    if(!founder(c,principal))hold('FOUNDER_REQUIRED','Actual founder operator required');
    const recipient=qualifiedTaskRecipient(tx,member(tx,{principal_id:text(args.to_principal_id,'recipient principal',200)})),owner={principal_id:recipient.id};
    const scope=scopeOf(args.scope),resources=canonicalResources(tx,args.resources),auth=authorize(tx,owner,'task/submit',{...args,scope,resources});
    authorize(tx,owner,'task/claim',{...args,scope,resources});
    const used=id=>{const n=tx.get('control',id)?.value.model_calls??0;if(!Number.isSafeInteger(n)||n<0)hold('MODEL_BUDGET','Current model usage is invalid');return n;};
    const grantUsed=auth.grant?.value.used_model_calls??0,grantCap=auth.grant?.value.max_model_calls;
    if(!auth.grant||!Number.isSafeInteger(grantUsed)||grantUsed<0||!Number.isSafeInteger(grantCap)||grantCap<1||used('usage')>=policy(c).max_model_calls||used(`usage:${recipient.id}`)>=(policy(c).principal_model_calls??policy(c).max_model_calls)||grantUsed>=grantCap)hold('MODEL_BUDGET','Recipient task authority or model budget unavailable');
    const origin={operator:ref('principals',principal),operation_id:text(args.operation_id,'operation_id',160),source_instruction:text(args.source_instruction,'source instruction',4000)};
    return mutate(tx,owner,recipient,c,'task/submit',{...args,task_id:args.task_id??digest(['assigned-task-v1',principal.id,recipient.id,args.operation_id])},false,null,origin);
  }
  if(action==='task/submit'){
    const scope=scopeOf(args.scope),resources=canonicalResources(tx,args.resources),auth=authorize(tx,actor,action,{...args,scope,resources}),p=policy(c);
    if(count(tx,'tasks',{status:['planned','pending']})>=p.queue_limit||count(tx,'tasks',{status:['planned','pending'],principal_id:principal.id})>=p.principal_queue_limit)hold('QUEUE_CAPACITY','Queue full');
    const id=args.task_id?text(args.task_id,'task_id',200):digest(['task',principal.id,args.operation_id]);if(tx.get('tasks',id))hold('TASK_EXISTS','Task exists');let inputs=args.input_refs??[];if(!Array.isArray(inputs)||inputs.length>100)hold('SOURCE_INVALID','At most 100 input refs');
    let handoff=null;
    if(Object.hasOwn(args,'handoff_ref')){
      handoff=prepareHandoffTask(tx,principal,args.handoff_ref);
      if(handoff.decision_ref)hold('HANDOFF_DECIDED','Handoff already has an immutable receiver decision');
      if(scopeOf(handoff.handoff_envelope.value.scope)!==scope)hold('HANDOFF_SCOPE','Task scope must match its intended handoff');
      inputs=[...new Map([...inputs,...handoff.input_refs].map(r=>{const exact=semanticReference(r);return [canonical(exact),exact];})).values()];
      if(inputs.length>100)hold('SOURCE_INVALID','Complete handoff task inputs exceed capacity');
    }
    semanticInputs(tx,inputs);if(args.review_of)resolve(tx,semanticReference(args.review_of));
    let parent=null;if(args.parent_task_id){parent=tx.get('tasks',text(args.parent_task_id,'parent task',200));if(!parent||parent.value.owner_principal_id!==principal.id||!['*',scope].includes(parent.value.scope))hold('PARENT_AUTHORITY','Parent owner/scope mismatch');}
    const originProof=ordinaryOriginFrom(tx,'task/submit');if(originProof&&(originProof.scope!=='*'&&originProof.scope!==scope||!resources.every(r=>originProof.resources.some(p=>same(p,r)))))hold('ORIGIN_ORDINARY_TASK_SCOPE_CHANGED','Task exceeds the selected ordinary purpose');
    const definition={...(originProof?{origin_qualification_ref:copy(originProof.qualification_ref)}:{}),owner_principal_id:principal.id,grant_id:auth.grant?.id??null,grant_generation:auth.grant?.value.generation??null,scope,host:principal.value.host??'codex',role:text(args.role,'role',100),stage:text(args.stage??'produce','stage',40),instructions:text(args.instructions??args.task,'instructions',20000),acceptance:text(args.acceptance,'acceptance',4000),resources,input_refs:copy(inputs),review_of:args.review_of?copy(args.review_of):null,parent_task_id:parent?.id??null,parent_ref:parent?ref('tasks',parent):null,outcome:args.outcome===undefined?null:bounded(args.outcome,'outcome',8000),...(assignment?{assignment:copy(assignment)}:{}),...(handoff?{handoff_ref:copy(handoff.handoff_ref),handoff_envelope:copy(handoff.handoff_envelope)}:{})};
    const value={...definition,definition,status:assignment?'pending':'planned',authority_epoch:1,authority_previous:null,authority_event_seq:tx.sequence,definition_revision:1,definition_sha256:digest(definition),attempt:null,principal_id:principal.id,created_at:now()};
    if(assignment)claimResources(tx,{id,value});
    return tx.put('tasks',id,value,0);
  }
  if(action==='task/admit'){
    if(!trusted(principal))hold('SCHEDULER_REQUIRED','Runtime admission required');ordinaryOriginFrom(tx,'task/admit');const status=runtimeStatus(tx);if(status.paused)return {admitted:false,code:'PAUSED',reason:'Company paused'};if(!status.available_slots)return {admitted:false,code:'CAPACITY_BUSY',reason:'Active or uncertain execution holds capacity'};
    const task=peek(tx,args);if(!task)return {admitted:false,code:'NO_WORK',reason:'No unexcluded pending work'};if(args.task_id&&args.task_id!==task.id)return {admitted:false,code:'FAIRNESS_CHANGED',reason:'Selection changed'};const t=task.value,ordinary=ordinaryOriginFrom(tx,'task/admit',task);
    if((Object.hasOwn(t,'handoff_ref')||Object.hasOwn(t.definition??{},'handoff_ref'))&&!currentAuthorizationGrants.has(tx))hold('SOURCE_CHANGED','Task selection changed to a typed handoff; fresh guarded admission required');
    // Expected admission holds must occur before planning resource mutations.
    let auth,context,usage,principalUsage,used,usedPrincipal,effectAuthority;
    try{
      auth=taskAuthority(tx,{principal_id:t.owner_principal_id},task,'task/claim');if(t.attempt)hold('ATTEMPT_CONSUMED','Attempt already consumed');
      const held=all(tx,'claims',{status:'held'});if(t.resources.some(r=>held.some(cl=>cl.value.task_id!==task.id&&resourceOverlap(cl.value.resource,r))))hold('RESOURCE_BUSY','Resource held');
      usage=tx.get('control','usage');principalUsage=tx.get('control',`usage:${t.owner_principal_id}`);used=usage?.value.model_calls??0;usedPrincipal=principalUsage?.value.model_calls??0;
      if(used>=policy(c).max_model_calls||usedPrincipal>=(policy(c).principal_model_calls??policy(c).max_model_calls)||auth.grant&&(auth.grant.value.used_model_calls??0)>=auth.grant.value.max_model_calls)hold('MODEL_BUDGET','Model budget exhausted');
      context=buildContext(tx,actor,task);if(context.membership.conflicts.length)hold('CONTEXT_CONFLICT','Unresolved applicable conflict');
      if(t.handoff_ref){
        const unstable=t.handoff_envelope.value.governing_refs.some(r=>r.family==='grants'&&r.id===auth.grant?.id||r.family==='control'&&['usage',`usage:${t.owner_principal_id}`].includes(r.id));
        const fairness=tx.get('control','fairness');
        if(unstable||t.handoff_envelope.value.governing_refs.some(r=>r.family==='control'&&r.id==='fairness')&&!same(fairness?.value,{last_principal_id:t.owner_principal_id}))hold('SOURCE_CHANGED','Admission would change exact governing handoff evidence');
      }
      // Source-owned SOFTWARE support is checked after the original context
      // reads and before any resource, attempt, effect or allowance put.
      prepareOriginalProjectedTaskContext(context,tx);
      // The actual task's original qualification is captured above. Persist its
      // cutoff in the existing lease so every private launch/permit/broker
      // inherits it, even if later provider reads cross that deadline.
      const issued=Date.now(),expires=Math.min(issued+TASK_EFFECT_LEASE_MS,auth.grant?Date.parse(auth.grant.value.expires_at):Infinity,ordinary?.deadline_at_ms??Infinity);
      if(!Number.isSafeInteger(issued)||!Number.isSafeInteger(expires)||expires<=issued)hold('GRANT_INVALID','Admission authority expired during preparation');
      effectAuthority={protocol:'peer-task-effect-authority-v1',epoch:nextTaskAuthority(t),issued_at:new Date(issued).toISOString(),expires_at:new Date(expires).toISOString(),...(productionAdmissions.has(tx)?{production_authority:copy(productionAdmissions.get(tx))}:{})};
    }catch(error){if(readFailure(tx,error))throw error;if(['RESOURCE_BUSY','RESOURCE_AUTHORITY','CONTEXT_CAPACITY','CONTEXT_CONFLICT','GRANT_INVALID','GRANT_CHANGED','MODEL_BUDGET','PRINCIPAL_INACTIVE','SOURCE_CHANGED','DEPENDENCY_CYCLE','LEGACY_SOURCE_MISSING','DEFINITION_CHANGED','HANDOFF_DECIDED'].includes(error.code))return {admitted:false,code:error.code,reason:error.message};throw error;}
    const effectId=digest(['native-effect',task.id,t.definition_revision]);if(tx.get('effects',effectId))hold('ATTEMPT_CONSUMED','Effect already reserved');
    const request={kind:'native',task_id:task.id,definition_sha256:t.definition_sha256,context_sha256:context.sha256},attempt={id:digest(['attempt',task.id,t.definition_revision]),effect_id:effectId,request_sha256:digest(request),definition_revision:t.definition_revision,context,policy_generation:c.value.policy_generation,pause_generation:c.value.pause_generation,admitted_at:effectAuthority.issued_at,effect_authority:effectAuthority,termination_confirmed:false,model_calls:1};
    claimResources(tx,task);
    tx.put('effects',effectId,{kind:'native',task_id:task.id,principal_id:t.owner_principal_id,scope:t.scope,status:'reserved',request,request_sha256:attempt.request_sha256,grant_id:t.grant_id,grant_generation:t.grant_generation,policy_generation:c.value.policy_generation,pause_generation:c.value.pause_generation,termination_confirmed:false},0);
    tx.put('slots',task.id,{status:'active',task_id:task.id,principal_id:t.owner_principal_id,attempt_id:attempt.id,effect_id:effectId},0);tx.put('control','usage',{model_calls:used+1},usage?.revision??0);tx.put('control',`usage:${t.owner_principal_id}`,{model_calls:usedPrincipal+1},principalUsage?.revision??0);
    if(auth.grant)tx.put('grants',auth.grant.id,{...auth.grant.value,used_model_calls:(auth.grant.value.used_model_calls??0)+1},auth.grant.revision);
    const fair=tx.get('control','fairness');tx.put('control','fairness',{last_principal_id:t.owner_principal_id},fair?.revision??0);const result=tx.put('tasks',task.id,{...t,status:'running',authority_epoch:effectAuthority.epoch,authority_previous:ref('tasks',task),authority_event_seq:tx.sequence,attempt},task.revision);tx.event('dispatch_admitted',{task_id:task.id,attempt_id:attempt.id,effect_id:effectId,pause_generation:c.value.pause_generation,policy_generation:c.value.policy_generation});return {admitted:true,task:result,context,host:t.host};
  }
  if(action.startsWith('task/')){
    const task=tx.get('tasks',text(args.task_id,'task_id',200));if(!task)hold('TASK_MISSING','Missing task');const t=task.value;
    if(action==='task/claim'){taskAuthority(tx,actor,task,action);ordinaryOriginFrom(tx,'task/claim',task);if(c.value.paused)hold('PAUSED','Company paused');if(t.attempt||!['planned','pending'].includes(t.status))hold('ATTEMPT_CONSUMED','Task is not unattempted');claimResources(tx,task);return tx.put('tasks',task.id,{...t,status:'pending'},task.revision);}
    if(action==='task/transfer'){
      taskAuthority(tx,actor,task,action);const to=member(tx,{principal_id:args.to_principal_id}),auth=authorize(tx,{principal_id:to.id},'task/submit',{grant_id:args.to_grant_id,scope:t.scope,resources:t.resources}),claims=all(tx,'claims',{task_id:task.id,status:'held'});
      const result=tx.put('tasks',task.id,{...t,authority_epoch:nextTaskAuthority(t),authority_previous:ref('tasks',task),authority_event_seq:tx.sequence,owner_principal_id:to.id,principal_id:to.id,grant_id:auth.grant?.id??null,grant_generation:auth.grant?.value.generation??null,transfers:[...(t.transfers??[]),{from:t.owner_principal_id,to:to.id,at:now(),attempt_id:t.attempt?.id??null}]},task.revision);for(const claim of claims)tx.put('claims',claim.id,{...claim.value,principal_id:to.id},claim.revision);return result;
    }
    if(action==='task/cancel'){taskAuthority(tx,actor,task,action);const result=tx.put('tasks',task.id,{...t,authority_epoch:nextTaskAuthority(t),authority_previous:ref('tasks',task),authority_event_seq:tx.sequence,status:'cancelled',cancelled_at:now(),cancellation:text(args.reason??'Cancellation requested','reason')},task.revision);if(!t.attempt)releaseClaims(tx,result,true);return result;}
    if(!protectedCall||!trusted(principal))hold('OBSERVER_REQUIRED','Protected runtime observation required');if(!t.attempt||t.attempt.id!==args.attempt_id)hold('ATTEMPT_CHANGED','Exact attempt required');
    if(action==='task/process'){
      if(t.attempt.process)hold('PROCESS_RECORDED','Process identity immutable');const process=processEvidence(args,t,false),o=observation(tx,actor,task,action,args,{process});return tx.put('tasks',task.id,{...t,attempt:{...t.attempt,process,process_observation:ref('effects',o)}},task.revision);
    }
    if(action==='task/finish'){
      if(t.result)hold('RESULT_RECORDED','Original result immutable');const closed=args.termination_confirmed===true,error=args.error?bounded(args.error,'error',4000):null,process=processEvidence(args,t,closed);
      if(!error&&(typeof args.output!=='string'||!args.output.trim()||!closed))hold('RESULT_INVALID','Successful output requires closure');if(args.output!==undefined&&(typeof args.output!=='string'||Buffer.byteLength(args.output)>64000))hold('OUTPUT_CAPACITY','Output must be bounded raw text');
      const native=args.native_id===undefined?null:text(args.native_id,'observed native id',300);if(!error&&!native)hold('RESULT_INVALID','Observed native identity required');
      const fresh=validateContext(tx,t.attempt.context);if(!fresh&&preparationBudget(tx).failed())preparationBudget(tx).physical();
      const state=!closed?'unknown':!fresh?'quarantined':error?'failed':'returned';let reviewData=null;
      if(state==='returned'&&(t.stage==='review'||t.review_of)){
        if(!t.review_of)hold('REVIEW_INVALID','Review subject missing');const graph=evidenceAnalysis(tx);graph.currentTask(task);reviewData=parseReview(args.output,t.review_of,args.review_evidence);const contributors=graph.historical([t.review_of]),reviewer=member(tx,{principal_id:t.owner_principal_id});
        if(contributors.principals.includes(reviewer.id)||contributors.natives.includes(native)||reviewer.value.native_id&&contributors.natives.includes(reviewer.value.native_id))hold('REVIEW_INDEPENDENCE','Contributing principal or native session cannot review');
        if(args.review_evidence?.context_sha256!==undefined&&args.review_evidence.context_sha256!==t.attempt.context.sha256||args.review_evidence?.native_id!==undefined&&args.review_evidence.native_id!==native)hold('REVIEW_MISMATCH','Claimed observation identity/context differs');
      }
      const reviewId=reviewData?digest(['review',task.id,t.attempt.id]):null;if(reviewId&&tx.get('reviews',reviewId))hold('REVIEW_EXISTS','Immutable review exists');
      const o=observation(tx,actor,task,action,args,{native_id:native,termination_confirmed:closed,process,output_sha256:args.output===undefined?null:digest(args.output),context_sha256:t.attempt.context.sha256,review:reviewData});
      const result={output:args.output??null,output_sha256:args.output===undefined?null:digest(args.output),native_id:native,error,termination_confirmed:closed,observed_process:process,observation:ref('effects',o),at:now()};
      const updated=tx.put('tasks',task.id,{...t,authority_epoch:nextTaskAuthority(t),authority_previous:ref('tasks',task),authority_event_seq:tx.sequence,status:state,result,review_id:reviewId,attempt:{...t.attempt,native_id:native,termination_confirmed:closed}},task.revision);
      let review=null;if(reviewData){const target=resolve(tx,t.review_of),author=target.value.principal_id??target.value.owner_principal_id??target.value.author_principal_id;review=tx.put('reviews',reviewId,{status:'accepted',scope:t.scope,task_id:task.id,subject:t.review_of,author_principal_id:author,reviewer_principal_id:t.owner_principal_id,native_id:native,...reviewData,context_sha256:t.attempt.context.sha256,output_sha256:digest(args.output),termination_confirmed:true,proof:{protocol:'peer-runtime-observation-v1',observation:ref('effects',o),task:ref('tasks',updated)},recorded_by:principal.id},0);}
      const effect=tx.get('effects',t.attempt.effect_id),slot=tx.get('slots',task.id);if(!effect||!slot)hold('ATTEMPT_CHANGED','Attempt reservation missing');tx.put('effects',effect.id,{...effect.value,status:!closed?'unknown':error?'failed':'succeeded',termination_confirmed:closed,result_sha256:digest(result)},effect.revision);tx.put('slots',slot.id,{...slot.value,status:closed?'released':'unknown',termination_confirmed:closed},slot.revision);if(closed)releaseClaims(tx,updated,true);return {task:updated,accepted:state==='returned',review};
    }
    if(action==='task/closure'){
      if(args.termination_confirmed!==true||!t.result)hold('CLOSURE_REQUIRED','Retained result and protected closure required');if(t.closure||t.result.termination_confirmed)return task;const process=processEvidence(args,t,true),o=observation(tx,actor,task,action,args,{termination_confirmed:true,process});
      const updated=tx.put('tasks',task.id,{...t,authority_epoch:nextTaskAuthority(t),authority_previous:ref('tasks',task),authority_event_seq:tx.sequence,status:t.status==='unknown'?'quarantined':t.status,closure:{termination_confirmed:true,observed_process:process,observation:ref('effects',o),at:now()}},task.revision),effect=tx.get('effects',t.attempt.effect_id),slot=tx.get('slots',task.id);if(!effect||!slot)hold('ATTEMPT_CHANGED','Reservation missing');tx.put('effects',effect.id,{...effect.value,status:'failed',termination_confirmed:true,closure:updated.value.closure},effect.revision);tx.put('slots',slot.id,{...slot.value,status:'released',termination_confirmed:true},slot.revision);releaseClaims(tx,updated,true);return updated;
    }
    hold('ACTION_UNKNOWN','Unsupported task action');
  }
  if(action==='handoff/send'){
    const subject=semanticReference(args.subject_ref),row=resolve(tx,subject),scope=scopeOf(args.scope);
    if(scopeOf(row.value.scope)!==scope)hold('HANDOFF_SCOPE','Handoff subject scope cannot be relabeled');
    authorize(tx,actor,action,{...args,scope,resources:[]});
    const governed=(args.governing_refs??[]).map(exactReference);
    for(const source of governed)resolve(tx,source);
    evidenceAnalysis(tx).current([subject,...(args.evidence_refs??[]).map(semanticReference),...governed.filter(source=>semanticFamilies.has(source.family))]);
    return sendHandoff(tx,principal,c,args);
  }
  if(action==='handoff/accept'||action==='handoff/reject'){
    const exact=exactReference(args.handoff_ref);if(exact.family!=='work_items')hold('SOURCE_INVALID','Exact typed handoff required');
    const handoff=resolve(tx,exact),value=handoff.value;
    if(value.receiver?.id!==principal.id)hold('HANDOFF_RECEIVER','Only the actual intended receiver may decide');
    authorize(tx,actor,action,{...args,scope:value.scope,resources:taskBinding?args.resources:[]});
    const governed=(value.governing_refs??[]).map(exactReference);
    for(const source of governed)resolve(tx,source);
    evidenceAnalysis(tx).current([semanticReference(value.subject_ref),...(value.evidence_refs??[]).map(semanticReference),...governed.filter(source=>semanticFamilies.has(source.family))]);
    let decisionArgs=args;
    if(taskBinding){const {task_id,scope,resources,...closed}=args;decisionArgs=closed;}
    return decideHandoff(tx,principal,action,decisionArgs,taskBinding);
  }
  if(action==='home/propose'){
    const scope=scopeOf(args.scope),id=text(args.home_id,'home_id',200);authorize(tx,actor,action,{...args,scope,resources:[{kind:'home',id}]});const home=tx.get('homes',id);if((home?.revision??0)!==(args.expected_revision??0))hold('HOME_CHANGED','Base revision changed');if(home&&scopeOf(home.value.scope)!==scope)hold('HOME_SCOPE','Home scope cannot be relabeled');
    const dependencies=args.dependencies??[];if(!Array.isArray(dependencies)||dependencies.length>100)hold('DEPENDENCY_INVALID','At most 100 home dependencies');for(const d of dependencies){if(d.family!=='homes')hold('DEPENDENCY_INVALID','Home dependencies required');resolve(tx,d);}
    const atomic=Object.hasOwn(args,'github_atomic_publication')?publicationMetadata(args.github_atomic_publication,'GitHub atomic subject'):undefined;
    if(atomic!==undefined)publicationMetadata(args.github_publication,'GitHub subject');
    semanticInputs(tx,args.input_refs??[]);const selected=sources(tx,scope,[...(args.input_refs??[]),...dependencies]),content=bounded(args.content,'home content');return tx.put('proposals',digest(['proposal',principal.id,args.operation_id]),{status:'proposed',principal_id:principal.id,scope,home_id:id,base:home?ref('homes',home):null,content,dependencies:copy(dependencies),readset:selected.sources.map(({value,legacy_value,...r})=>r),membership:selected.membership,...(taskBinding?{task_id:taskBinding.task_id,attempt_id:taskBinding.attempt_id,task_effect:copy(taskBinding)}:{}),...(args.github_publication?{github_publication:bounded(args.github_publication,'GitHub subject',16000)}:{}),...(atomic===undefined?{}:{github_atomic_publication:atomic}),created_at:now()},0);
  }
  if(action==='home/publish'){
    if(!productionPublications.has(tx)&&(Object.hasOwn(args,'proposal_ref')||Object.hasOwn(args,'review_ref')))hold('PRODUCTION_ACTION_HELD','Exact-reference founder publication requires its original production channel');
    const proposal=args.proposal_ref?resolve(tx,exactReference(args.proposal_ref)):tx.get('proposals',text(args.proposal_id,'proposal_id',200));if(proposal?.value.status!=='proposed')hold('PROPOSAL_INVALID','Proposed home required');const p=proposal.value;authorize(tx,actor,action,{...args,scope:p.scope,resources:[{kind:'home',id:p.home_id}]});const home=tx.get('homes',p.home_id);if(p.base)resolve(tx,p.base);else if(home)hold('HOME_CHANGED','Concurrent home');
    const reviewRows=currentReviewRows(tx),selected=sources(tx,p.scope,[],reviewRows);if(selected.membership.conflicts.length)hold('CONTEXT_CONFLICT','Unresolved applicable conflict');if(!same(selected.membership,p.membership))hold('CONTEXT_CHANGED','Applicable membership changed');for(const r of p.readset)resolve(tx,r);
    const subject=ref('proposals',proposal);reviewRows.subjects([subject]);evidenceAnalysis(tx).current([subject]);const review=args.review_ref?resolve(tx,exactReference(args.review_ref)):tx.get('reviews',text(args.review_id,'review_id',200));if(!review||!observedReview(tx,review,{pending:true})||review.value.verdict!=='Pass'||!same(review.value.subject,subject))hold('REVIEW_REQUIRED','Protected exact independent Pass required');
    if(!evidenceAnalysis(tx).pendingReviewEligible(review))hold('CONTEXT_CHANGED','Review context no longer current');
    for(const adverse of reviewRows.adverse())if(same(adverse.subject,subject)){if(adverse.error)throw adverse.error;hold('REVIEW_HELD','Retained negative review requires a changed proposal');}
    const value={status:'current',scope:p.scope,content:p.content,dependencies:p.dependencies,principal_id:principal.id,proposal:subject,review:ref('reviews',review),previous:home?ref('homes',home):null,updated_at:now()};value.scope_qualification={protocol:'peer-home-scope-v1',home_binding_sha256:homeBinding(p.home_id,value),proposal:subject,review:ref('reviews',review)};
    const published=tx.put('homes',p.home_id,value,home?.revision??0),publication=productionPublications.get(tx);
    if(!publication)return published;
    const receipt=tx.put('work_items',digest(['founder-home-publication-v1',principal.id,args.operation_id]),{kind:'founder_home_publication_v1',status:'recorded',scope:p.scope,principal_id:principal.id,home:ref('homes',published),proposal:subject,review:ref('reviews',review),...copy(publication),at:now()},0);
    return {home:published,publication:receipt};
  }
  if(action==='conflict/create'){
    const scope=scopeOf(args.scope);authorize(tx,actor,action,{...args,scope});const inputs=args.input_refs??[];if(!Array.isArray(inputs)||inputs.length<2||inputs.length>100)hold('CONFLICT_EVIDENCE','Two to 100 exact conflicting inputs required');semanticInputs(tx,inputs);
    return tx.put('conflicts',digest(['conflict',principal.id,args.operation_id]),{status:'open',scope,principal_id:principal.id,summary:text(args.summary,'summary',4000),input_refs:copy(inputs),clearing_condition:text(args.clearing_condition,'clearing condition',4000),created_at:now()},0);
  }
  if(action==='conflict/resolve'){
    const row=tx.get('conflicts',text(args.conflict_id,'conflict_id',200));if(row?.value.status!=='open')hold('CONFLICT_MISSING','Open conflict required');authorize(tx,actor,action,{...args,scope:row.value.scope});const evidence=(args.evidence_refs??[]).map(r=>{resolve(tx,semanticReference(r));return copy(r);});
    const graph=evidenceAnalysis(tx),current=graph.current([...row.value.input_refs,...evidence]),present=new Set(current.map(r=>canonical(r)));
    const selected=sources(tx,row.value.scope,[...row.value.input_refs,...evidence]),adverse=selected.sources.filter(r=>r.family==='reviews'&&adverseReview(r)).map(exactReference);
    // Direct resolution has no admitted-context snapshot. Recompute current
    // adverse evidence in this final transaction and demand exact explicit
    // coverage; retain only the caller's actual supplied evidence in the record.
    if(adverse.some(r=>!present.has(canonical(r))))hold('EVIDENCE_CHANGED','Current adverse evidence requires exact resolution evidence');
    const line=graph.historical([...row.value.input_refs,...adverse]);if(evidence.length)graph.historical(evidence);
    if(!founder(c,principal)){const people=new Set([row.value.principal_id,...line.principals]),natives=new Set(line.natives);const reporter=member(tx,{principal_id:row.value.principal_id});if(reporter.value.native_id)natives.add(reporter.value.native_id);if(!principal.value.qualifications?.includes('conflict/resolve'))hold('RESOLVER_UNQUALIFIED','Operator-qualified independent resolver required');if(people.has(principal.id)||principal.value.native_id&&natives.has(principal.value.native_id))hold('INDEPENDENT_RESOLUTION','Reporter, contributor or shared native session cannot resolve');}
    return tx.put('conflicts',row.id,{...row.value,status:'resolved',resolution:{principal_id:principal.id,source_instruction:text(args.source_instruction,'source instruction',4000),evidence,at:now()}},row.revision);
  }
  if(action==='notice/create'||action==='message/send'){
    const scope=scopeOf(args.scope);authorize(tx,actor,action,{...args,scope});const family=action==='notice/create'?'notices':'messages';if(family==='messages')member(tx,{principal_id:args.to_principal_id});const kind=args.kind??'must_know';if(family==='notices'&&!['must_know','decision_required'].includes(kind))hold('NOTICE_INVALID','Required notice kind invalid');return tx.put(family,digest([family,principal.id,args.operation_id]),{status:'pending',scope,principal_id:principal.id,...(family==='messages'?{to_principal_id:args.to_principal_id}:{}),...(taskBinding?{task_id:taskBinding.task_id,attempt_id:taskBinding.attempt_id,task_effect:copy(taskBinding)}:{}),content:text(args.content??args.summary,'content',12000),kind,created_at:now()},0);
  }
  if(['notice/deliver','notice/acknowledge','notice/resolve'].includes(action)){
    const notice=tx.get('notices',text(args.notice_id,'notice_id',200));if(!notice)hold('NOTICE_MISSING','Notice required');if(action==='notice/deliver'){if(!trusted(principal))hold('SCHEDULER_REQUIRED','Trusted delivery software required');member(tx,{principal_id:args.to_principal_id});return tx.put('deliveries',digest(['notice-delivery',principal.id,args.operation_id]),{status:'delivered',scope:notice.value.scope,principal_id:args.to_principal_id,notice:ref('notices',notice),channel:text(args.channel,'channel',100),delivery_only:true,at:now()},0);}
    if(!founder(c,principal))hold('FOUNDER_REQUIRED','Actual founder disposition required');const instruction=text(args.source_instruction,'source instruction',4000);if(action==='notice/acknowledge')return tx.put('deliveries',digest(['human-ack',principal.id,args.operation_id]),{status:'acknowledged',scope:notice.value.scope,principal_id:principal.id,notice:ref('notices',notice),human_acknowledgement:true,source_instruction:instruction,at:now()},0);if(notice.value.resolution)hold('DISPOSITION_IMMUTABLE','Create a correction notice');return tx.put('notices',notice.id,{...notice.value,status:'resolved',resolution:{principal_id:principal.id,source_instruction:instruction,at:now()},continuing_conditions_preserved:true},notice.revision);
  }
  hold('ACTION_UNKNOWN','Unsupported peer action');
}
export function inspect(ledger,actor,action,args={}){
  return inspectBound(ledger,actor,action,args);
}
function inspectBound(ledger,actor,action,args={},binding=null,production=null){
  const a=copy(actor),input=bounded(args,'inspection',1000000),deadline=production?Date.now()+TASK_EFFECT_LEASE_MS:null;
  const inspect=raw=>{const tx=trackedReads(raw);if(production)assertPeerProductionAuthority(tx,production,ledger);const p=member(tx,a),c=control(tx);if(binding)checkBoundPrincipal(p,binding);else if(p.value.membership_qualification)hold('BOUND_CONNECTION_REQUIRED','Managed principal requires a protected bound connection');policy(c);if(action==='handoff/pending'){if(!production&&!binding)hold('BOUND_CONNECTION_REQUIRED','Original protected receiver connection required');if(production&&!founder(c,p))hold('FOUNDER_REQUIRED','Public intake operator is the actual founder only');return pendingHandoffs(tx,p,c,input,{company_id:ledger.company_id,root_sha256:digest(ledger.root)});}if(action==='runtime/status')return runtimeStatus(tx);if(action==='task/peek'){if(!trusted(p))hold('SCHEDULER_REQUIRED','Runtime selection required');ordinaryOriginFrom(tx,'task/peek');const task=peek(tx,input);if(task)ordinaryOriginFrom(tx,'task/peek',task);return {task,host:task?tx.get('principals',task.value.owner_principal_id)?.value.host??'codex':null,traversal:{matching_row_limit:MAX_ROWS,exclusion_limit:MAX_ROWS,fairness_advances_on_admission:true}};}if(action==='task/context')return buildContext(tx,a,tx.get('tasks',text(input.task_id,'task id',200)));if(action==='task/get'){const task=tx.get('tasks',text(input.task_id,'task id',200));if(task&&task.value.owner_principal_id!==p.id&&!trusted(p)&&!founder(c,p))hold('TASK_OWNER','Task owner required');if(task)ordinaryOriginFrom(tx,'task/get',task);return task;}if(action==='list'){if(!['tasks','homes','proposals','conflicts','notices','messages','grants','claims','effects'].includes(input.family))hold('FAMILY_INVALID','Inspectable family required');return tx.list(input.family,{limit:Math.min(input.limit??20,100),cursor:input.cursor,status:input.status,...(founder(c,p)||trusted(p)?{}:{principal_id:p.id}),...(input.scope?{scope:input.scope}:{})});}hold('ACTION_UNKNOWN','Unsupported inspection');};
  return production?ledger.guardedWrite(action,a.principal_id,inspect,tx=>{assertPeerProductionAuthority(tx,production,ledger);return deadline;}):ledger.read(inspect);
}
