// Optional Source comparison budget issuer. These private loans restrict eight
// calls; they never supply the separate runtime/model or Native permission.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {types} from 'node:util';
import {Store,owner,originalStoreExecutionCustodyFrom} from '../../store.mjs';
import {normalizedLayout,readImmutable} from '../../record-storage.mjs';
import {classifyRuntimeStorageFrom} from '../../legacy-storage-proof.mjs';
import {developmentAssignment,developmentReviewSubject,validTestExecution} from '../../develop.mjs';
import {contextMatches} from '../../context.mjs';
import * as runtime from '../../runtime-execution.mjs';
import {inspectIntegratedComparisonSourceFrom} from '../../integrated-comparison-source.mjs';
import {comparisonTestPrerequisiteFrom} from '../../integrated-comparison-test.mjs';
import {assertComparisonEvidencePrepaymentFrom,closeComparisonEvidenceRunFrom,inspectComparisonRequestedHeaderFrom} from '../../integrated-comparison-evidence.mjs';
import {captureCanonicalData,copyBlobBytes,capturePrompt} from './typed-capture.mjs';
import {DATA_CONTRACT,DATA_LIMITS,SLOT_ROSTER,validateRunManifest,encodeRunManifest,validateSlotRecord,encodeSlotRecord} from './integrated-comparison-data.mjs';
import {encodeIssue18LedgerData,openIssue18LedgerStorage,initializeIssue18LedgerStorage,publishIssue18LedgerSlot,
  inspectIssue18LedgerStorage,readIssue18LedgerStorage,closeIssue18LedgerStorage} from '../issue18-ledger-storage.mjs';
import {createComparisonStorage,inspectComparisonStorage,appendComparisonJournal,closeComparisonStorage} from './integrated-comparison-bootstrap.mjs';
import {inspectComparisonEvidenceStorageFrom,closeComparisonEvidenceStorage} from './integrated-comparison-evidence-io.mjs';

const initLoans=new WeakMap(),journalLoans=new WeakMap(),runs=new WeakMap(),admissions=new WeakMap(),arms=new WeakMap(),boundArms=new WeakMap();
const evidenceInitializations=new WeakMap();
const testEntitlements=new WeakMap();
// Store imports its optional evidence hooks. Do not touch its class binding
// during that cycle; the first explicit opt-in call captures these once after
// module initialization. Caller instance overrides are never consulted.
let intrinsics;
function storeMethods(){return intrinsics??=Object.freeze({snapshot:Store.prototype.readSnapshot,read:Store.prototype.read,transaction:Store.prototype.transaction});}
const now=Date.now,apply=Reflect.apply;
const ARMS=['1-files','1-patches','3-files','3-patches'],METADATA=32768,JOURNAL_ENTRY=512,JOURNAL_ENTRIES_MAX=25;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=value=>hash(JSON.stringify(value));
const need=(ok,code)=>{if(!ok)throw Object.assign(Error('Issue18 issuer Hold: '+code),{code:'ISSUE18_ISSUER_'+code});};
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
function data(value,maximum=32768){return JSON.parse(encodeIssue18LedgerData(value,maximum).toString('utf8'));}
const same=(a,b)=>encodeIssue18LedgerData({value:a}).equals(encodeIssue18LedgerData({value:b}));
function exact(value,keys){
  need(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype,'INPUT');
  const descriptors=Object.getOwnPropertyDescriptors(value),own=Reflect.ownKeys(value);
  need(own.length===keys.length&&keys.every(key=>Object.hasOwn(descriptors,key)&&Object.hasOwn(descriptors[key],'value')&&descriptors[key].enumerable),'INPUT');
}
function recordRef(state,ref){
  exact(ref,['id','revision','sha256']);const record=state.records?.[ref.id];
  need(record&&record.id===ref.id&&record.revision===ref.revision&&Number.isSafeInteger(ref.revision)&&ref.revision>=1&&digest(record)===ref.sha256,'RECORD_REFERENCE');return record;
}
function withSnapshot(store,fn){
  need(store&&typeof store==='object'&&!types.isProxy(store)&&Object.getPrototypeOf(store)===Store.prototype,'ACTUAL_STORE_REQUIRED');
  const methods=storeMethods();return apply(methods.snapshot,store,[()=>{const loan=originalStoreExecutionCustodyFrom(store),state=apply(methods.read,store,[]);loan.assert();const result=fn(state,loan);loan.assert();return result;}]);
}
function physical(store,state,loan){
  loan.assert();need(loan.store===store&&store.root===loan.root&&store.db===loan.db&&normalizedLayout(loan.db)&&loan.db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version===4,'NORMALIZED_STORE_REQUIRED');
  const root=fs.realpathSync(loan.root);need(root===loan.root,'ROOT_NAME');
  const rootStat=fs.lstatSync(root,{bigint:true}),file=path.join(root,'.company','company.sqlite'),db=fs.lstatSync(file,{bigint:true});
  need(rootStat.isDirectory()&&!rootStat.isSymbolicLink()&&db.isFile()&&!db.isSymbolicLink()&&db.nlink===1n,'STORE_PHYSICAL');
  const database=loan.db.prepare('PRAGMA database_list').all().find(row=>row.name==='main');need(database?.file===file,'DATABASE_NAME');
  const company={id:state.id,created_at:state.created_at};need(typeof company.id==='string'&&typeof company.created_at==='string','COMPANY_IDENTITY');
  const databaseIdentity={dev:String(db.dev),ino:String(db.ino)},rootIdentity={dev:String(rootStat.dev),ino:String(rootStat.ino)};
  const storage=classifyRuntimeStorageFrom(store);loan.assert();
  return {root,databaseIdentity,rootIdentity,store,db:loan.db,binding:freeze({root_sha256:hash(root),company_identity_sha256:digest(company),
    incarnation_sha256:hash(encodeIssue18LedgerData({root,database:databaseIdentity,company})),physical_layout:'normalized4',lane:storage.lane==='original'?'original':'unqualified_legacy'})};
}
/** DATA projection of a genuine live Store snapshot, never a reusable loan. */
export function comparisonStoreBindingFrom(store){return withSnapshot(store,(state,loan)=>physical(store,state,loan).binding);}
function sourceCurrent(s){need(same(inspectIntegratedComparisonSourceFrom(s.source),s.selection.source),'SOURCE_CHANGED');}
function selectionCurrent(s,state,loan){
  loan.assert();need(state.id===s.companyId&&same(state.owner,s.selection.owner),'OWNER_CHANGED');
  owner(state,s.selection.owner.session_id,s.selection.owner.host,s.selection.owner.epoch);
  need(now()<s.deadlineAtMs&&digest(state.records?.[s.decisionId])===s.decisionSha256,'SELECTION_CHANGED_OR_EXPIRED');
  need(digest(state.records?.[s.selectionRef.id])===s.selectionRef.sha256,'SELECTION_RECORD_CHANGED');
  for(const key of ['model_policy_ref','durability_profile_ref','retention_policy_ref'])recordRef(state,s.selection[key]);
  const current=physical(s.store,state,loan);need(current.db===s.physical.db&&same(current.rootIdentity,s.physical.rootIdentity)&&same(current.databaseIdentity,s.physical.databaseIdentity),'SELECTION_STORE_REPLACED');
  if(s.selectionEvent)s.currentIssuerStoredBytes=metadataRowBytes(loan.db,s.selectionRef.sha256,s.selectionRef.id,s.selectionEvent);
  sourceCurrent(s);loan.assert();
}
function parentIdentity(fd,name){
  const opened=fs.fstatSync(fd,{bigint:true}),named=fs.lstatSync(name,{bigint:true});
  need(opened.isDirectory()&&named.isDirectory()&&!named.isSymbolicLink()&&opened.dev===named.dev&&opened.ino===named.ino&&
    (opened.mode&0o777n)===0o700n&&opened.uid===BigInt(process.getuid()),'SELECTED_PARENT');
  return Object.fromEntries(['dev','ino','mode','uid','gid'].map(key=>[key,String(opened[key])]));
}
function canonicalObject(text){return JSON.parse(copyBlobBytes(captureCanonicalData(text)).toString('utf8'));}
function modelPolicy(state,ref){
  const record=recordRef(state,ref);need(record.kind==='decision'&&record.author_role==='human_founder'&&record.status==='Recorded','MODEL_POLICY_SOURCE');
  const policy=canonicalObject(record.content),expected={protocol:'issue18-comparison-model-policy-v1',profile_sha256:DATA_CONTRACT.profile_sha256,
    engineer:{model:'gpt-6.1-sol',effort:'medium',speed:'host_default'},qa:{model:'gpt-6.1-sol',effort:'high',speed:'host_default'},same_host:true,
    independent_native_id:true,independent_instance:true,independent_role:'qa',execution_authority:false};
  need(same(policy,expected),'EXACT_MODEL_POLICY_REQUIRED');return freeze(policy);
}
function approvedSelection(state,decision,source,root){
  need(decision&&decision.kind==='decision'&&decision.author_role==='human_founder'&&decision.status==='Recorded'&&
    ['pause','resume','handover','rename'].includes(decision.action)&&decision.recorded_by===state.owner.session_id&&decision.revision===undefined,'CANONICAL_CONTROL_REQUIRED');
  const selected=canonicalObject(decision.content);
  exact(selected,['purpose','company_id','owner','selection_root_sha256','profile_sha256','run_id','source','parent_path','directory_name','expires_at','model_policy_ref','durability_profile_ref','retention_policy_ref']);
  need(selected.purpose==='issue18-integrated-comparison-budget-v1'&&selected.company_id===state.id&&same(selected.owner,state.owner)&&
    selected.profile_sha256===DATA_CONTRACT.profile_sha256&&same(selected.source,inspectIntegratedComparisonSourceFrom(source)),'EXPLICIT_SELECTION_REQUIRED');
  need(typeof selected.run_id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.exec(selected.run_id)?.[0]===selected.run_id,'RUN_ID');
  need(typeof selected.directory_name==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.exec(selected.directory_name)?.[0]===selected.directory_name,'DIRECTORY_NAME');
  need(typeof selected.parent_path==='string'&&path.isAbsolute(selected.parent_path)&&selected.parent_path!=='/'&&path.resolve(selected.parent_path)===selected.parent_path&&fs.realpathSync(selected.parent_path)===selected.parent_path,'PARENT_PATH');
  need(selected.selection_root_sha256===hash(root),'SELECTION_ROOT');
  need(typeof selected.expires_at==='string'&&Number.isSafeInteger(Date.parse(selected.expires_at))&&Date.parse(selected.expires_at)>now(),'SELECTION_EXPIRED');
  for(const key of ['model_policy_ref','durability_profile_ref','retention_policy_ref'])need(recordRef(state,selected[key]).status==='Recorded','POLICY_NOT_RECORDED');
  modelPolicy(state,selected.model_policy_ref);
  owner(state,state.owner.session_id,state.owner.host,state.owner.epoch);return freeze(selected);
}
function metadataRowBytes(db,recordSha,recordId,event){
  // Count the retained immutable body and physical public projection separately,
  // including their row envelopes and index references, rather than counting a
  // single logical RecordRef while ignoring the public copy.
  // The selected ASCII identity is retained in every Source JSON postimage or
  // snapshot that copies this record. Count old versions and copies as well as
  // its current immutable row. No GC, deletion or restoration refunds bytes.
  const inventory=db.prepare('SELECT COUNT(*) AS n,COALESCE(MAX(length(CAST(bytes AS BLOB))),0) AS largest FROM immutable_values WHERE instr(bytes,?)>0').get(recordId);
  need(inventory.n>=1&&inventory.n<=4&&inventory.largest<=4096,'SELECTION_POSTIMAGE_CENSUS');
  const immutable=db.prepare('SELECT sha256,bytes FROM immutable_values WHERE instr(bytes,?)>0 ORDER BY sha256').all(recordId);
  need(immutable.some(row=>row.sha256===recordSha),'SELECTION_COPIES');
  const eventInventory=db.prepare('SELECT COUNT(*) AS n,COALESCE(MAX(length(CAST(value AS BLOB))),0) AS largest FROM events WHERE instr(value,?)>0 OR seq=?').get(recordId,event.seq);
  need(eventInventory.n>=1&&eventInventory.n<=4&&eventInventory.largest<=4096,'SELECTION_EVENT_CENSUS');
  const events=db.prepare('SELECT seq,at,type,value FROM events WHERE instr(value,?)>0 OR seq=? ORDER BY seq').all(recordId,event.seq);
  need(events.every(row=>Buffer.byteLength(JSON.stringify(row))<=4096),'SELECTION_EVENT_CAPACITY');
  const entries=db.prepare("SELECT * FROM state_entries WHERE family='records' AND sha256=?").all(recordSha);
  const projected=db.prepare("SELECT * FROM public_read_values WHERE family='records' AND value_id_sha256=?").all(digest(recordId));
  const rows=db.prepare('SELECT * FROM public_read_rows WHERE id=? OR key_sha256=?').all(JSON.stringify(recordId),digest(recordId));
  need(entries.length===1&&projected.length===1,'SELECTION_COPIES');
  return [...immutable,...entries,...projected,...rows,...events].reduce((total,row)=>total+Buffer.byteLength(JSON.stringify(row)),0);
}
/** A genuine canonical control is consumed by a new durable, closed selection.
 * Its deterministic key excludes run/path/job so a cold module cannot rekey it. */
export function issueComparisonInitEntitlementFrom(store,input){
  exact(input,['decision_id','decision_sha256','parentFd','pythonSha256','source']);
  need(Number.isSafeInteger(input.parentFd)&&input.parentFd>=0&&typeof input.pythonSha256==='string'&&/^[a-f0-9]{64}$/.exec(input.pythonSha256)?.[0]===input.pythonSha256,'INITIALIZATION_POLICY');
  let issued,storedBytes=0;
  apply(storeMethods().transaction,store,['issue18.comparison.selected',state=>{
    const loan=originalStoreExecutionCustodyFrom(store);need(loan.mode==='write'&&loan.state===state,'ACTUAL_SELECTION_WRITER');
    const decision=state.records?.[input.decision_id];need(decision&&digest(decision)===input.decision_sha256,'CONTROL_HASH');
    const selected=approvedSelection(state,decision,input.source,loan.root),identity=physical(store,state,loan);
    const selectedId='issue18-selection-'+digest([state.id,decision.id]);need(!state.records[selectedId],'INITIALIZATION_SPENT');
    const createdAt=new Date(now()).toISOString(),record=data({id:selectedId,kind:'decision',revision:1,status:'Recorded',author_role:'runner',
      content:'Source-derived comparison budget selection; no Native or model allowance.',created_at:createdAt,
      comparison_selection:{protocol:'issue18-budget-selection-v1',original_control:{id:decision.id,sha256:input.decision_sha256},selection:selected}} ,4096);
    const recordText=encodeIssue18LedgerData(record,4096).toString('utf8'),selectionRef=freeze({id:selectedId,revision:1,sha256:digest(record)});
    const initial=encodeIssue18LedgerData({protocol:'issue18-budget-journal-v1',event:'initialization_spent',run_id:selected.run_id,selection_sha256:selectionRef.sha256},JOURNAL_ENTRY).toString('utf8');
    // A strict preflight reserves every possible remaining fixed journal entry
    // before any filesystem effect. Later entries cannot grow this reservation.
    need(Buffer.byteLength(recordText)*3+4096+JOURNAL_ENTRIES_MAX*JOURNAL_ENTRY<=METADATA,'ISSUER_METADATA_CAPACITY');
    state.records[selectedId]=record;
    issued={store,db:loan.db,root:loan.root,physical:identity,source:input.source,selection:selected,selectionRef,companyId:state.id,
      decisionId:decision.id,decisionSha256:input.decision_sha256,parentFd:input.parentFd,parentPath:selected.parent_path,directoryName:selected.directory_name,
      pythonSha256:input.pythonSha256,deadlineAtMs:Date.parse(selected.expires_at),selectionRecordText:recordText,runId:selected.run_id,initialJournalText:initial,createdAt,modelPolicy:modelPolicy(state,selected.model_policy_ref),consumed:false};
    issued.parentIdentity=parentIdentity(input.parentFd,selected.parent_path);
    loan.assert();return state;
  },{beforeCommit:(db,state)=>{
    const loan=originalStoreExecutionCustodyFrom(store);need(issued&&loan.mode==='write'&&loan.type==='issue18.comparison.selected'&&loan.state===state,'SELECTION_WRITER_CHANGED');
    const event=db.prepare('SELECT seq,at,type,value FROM events ORDER BY seq DESC LIMIT 1').get();need(event?.type==='issue18.comparison.selected','SELECTION_EVENT');
    issued.selectionEvent=freeze({...event});
    need(Buffer.byteLength(JSON.stringify(event))<=4096,'SELECTION_EVENT_CAPACITY');
    storedBytes=metadataRowBytes(db,issued.selectionRef.sha256,issued.selectionRef.id,event);
    need(storedBytes+Buffer.byteLength(issued.selectionRecordText)+JOURNAL_ENTRIES_MAX*JOURNAL_ENTRY<=METADATA,'ISSUER_METADATA_CAPACITY');loan.assert();
  }}]);
  need(issued&&storedBytes>0,'SELECTION_COMMIT_UNAVAILABLE');issued.issuerStoredBytes=storedBytes;
  withSnapshot(store,(state,loan)=>selectionCurrent(issued,state,loan));
  const token=Object.freeze({});initLoans.set(token,issued);return token;
}
export function consumeComparisonBootstrapEntitlement(token){
  const s=initLoans.get(token);need(s&&!s.consumed,'INITIALIZATION_SPENT_OR_FOREIGN');s.consumed=true;
  withSnapshot(s.store,(state,loan)=>selectionCurrent(s,state,loan));
  need(same(parentIdentity(s.parentFd,s.parentPath),s.parentIdentity),'SELECTED_PARENT_REPLACED');
  return freeze({parentFd:s.parentFd,parentPath:s.parentPath,directoryName:s.directoryName,pythonSha256:s.pythonSha256,deadlineAtMs:s.deadlineAtMs,
    selectionRecordText:s.selectionRecordText,selectionRef:s.selectionRef,runId:s.runId,initialJournalText:s.initialJournalText,issuerStoredBytes:s.issuerStoredBytes});
}
export function consumeComparisonJournalEntitlement(token,bootstrap){
  const s=journalLoans.get(token);need(s&&!s.spent&&s.bootstrap===bootstrap,'JOURNAL_SPENT_OR_FOREIGN');s.spent=true;return freeze({text:s.text,maximumTotalBytes:METADATA});
}
function journal(s,event){
  const text=encodeIssue18LedgerData({protocol:'issue18-budget-journal-v1',...event},JOURNAL_ENTRY).toString('utf8');
  need(s.journalEntries<JOURNAL_ENTRIES_MAX,'JOURNAL_EVENT_LIMIT');
  withSnapshot(s.store,(state,loan)=>selectionCurrent(s,state,loan));
  const physical=inspectComparisonStorage(s.bootstrap);
  need(s.currentIssuerStoredBytes+physical.externalMetadataBytes+Buffer.byteLength(text)<=METADATA,'ISSUER_METADATA_CAPACITY');s.journalEntries++;
  const token=Object.freeze({});journalLoans.set(token,{bootstrap:s.bootstrap,text,spent:false});appendComparisonJournal(s.bootstrap,token);
}
function namedDirectory(identity,name){return {dev:identity.dev,ino:identity.ino,uid:identity.uid,gid:identity.gid,permissions_octal:'0700',name_binding_sha256:hash(encodeIssue18LedgerData(name))};}
function runState(run){
  const s=runs.get(run);need(s&&!s.closed&&!s.poisoned,'RUN_FOREIGN_OR_CLOSED');
  need(now()<s.deadlineAtMs,'RUN_EXPIRED');sourceCurrent(s);
  withSnapshot(s.store,(state,loan)=>selectionCurrent(s,state,loan));
  const physical=inspectComparisonStorage(s.bootstrap);need(s.currentIssuerStoredBytes+physical.externalMetadataBytes<=METADATA,'ISSUER_METADATA_CAPACITY');
  need(same(physical.directoryIdentity,s.directoryIdentity)&&same(physical.parentIdentity,s.parentIdentity),'LEDGER_INCARNATION_CHANGED');
  const ledger=inspectIssue18LedgerStorage(s.ledger);need(ledger.rows.find(row=>row.name==='RUN.json')?.sha256===s.manifestSha,'RUN_CHANGED');return s;
}
export function initializeComparisonRun(entitlement){
  const selected=initLoans.get(entitlement);need(selected&&!selected.consumed,'INITIALIZATION_SPENT_OR_FOREIGN');
  let bootstrap,ledger;
  try{
    bootstrap=createComparisonStorage(entitlement);const p=inspectComparisonStorage(bootstrap);
    ledger=openIssue18LedgerStorage({parentFd:p.parentFd,directoryFd:p.directoryFd,directoryName:p.directoryName,pythonSha256:p.pythonSha256,deadlineAtMs:p.deadlineAtMs});
    const parent=namedDirectory(p.parentIdentity,{path:p.parentPath,identity:p.parentIdentity}),directory=namedDirectory(p.directoryIdentity,{parent_path:p.parentPath,parent_identity:p.parentIdentity,name:p.directoryName,identity:p.directoryIdentity});
    const manifest=validateRunManifest({protocol:'issue18-eight-slot-run-v2',schema_version:2,profile_id:DATA_CONTRACT.profile_id,profile_sha256:DATA_CONTRACT.profile_sha256,
      shared_schema_sha256:DATA_CONTRACT.shared_schema_sha256,run_id:selected.runId,supported_selection_ref:selected.selectionRef,selected_initialization_id:selected.selectionRef.id,
      source:selected.selection.source,original_controls_sha256:'f42e97413de5f5a0998b8064ab5068fbb59c12823081df67dc0eb5c6595e3498',
      predeclared_protocol_sha256:'9e910e30873fa4eba7aac89b650da688c30492fb64d6230c054600af725a3e38',created_at:selected.createdAt,expires_at:selected.selection.expires_at,
      parent_identity:parent,ledger_identity:directory,ledger_identity_sha256:hash(encodeIssue18LedgerData({parent,directory})),slot_roster:SLOT_ROSTER,
      original_controls:{max_native_calls_total:8,generation_per_arm:1,test_per_arm:1,qa_per_arm:1,repairs:0,scope_max_bytes:200000,native_timeout_ms:300000,test_timeout_ms:10000,test_wait_ms:20000},
      capacity:{manifest_bytes_max:32768,slot_bytes_max:16384,per_call_manifest_charge:8192,per_call_B_charge:16384,per_call_A_upper_ceiling:9975424,run_upper_evidence_bytes:80000000,issuer_metadata_bytes_max:32768,shared_metadata_bytes_max:65536},
      model_policy_ref:selected.selection.model_policy_ref,durability_profile_ref:selected.selection.durability_profile_ref,retention_policy_ref:selected.selection.retention_policy_ref,cold_read_authorizes:false,evidence_schema_sha256:DATA_CONTRACT.A_evidence_schema_sha256});
    initializeIssue18LedgerStorage(ledger,manifest);
    const run=Object.freeze({}),s={...selected,bootstrap,ledger,manifest,manifestSha:hash(encodeRunManifest(manifest)),parentIdentity:p.parentIdentity,directoryIdentity:p.directoryIdentity,
      enrolled:new Map(),slots:new Map(),evidence:new Map(),testSpends:new Map(),journalEntries:1,closed:false,poisoned:false};runs.set(run,s);runState(run);return run;
  }catch(error){if(ledger)try{closeIssue18LedgerStorage(ledger);}catch{}if(bootstrap)try{closeComparisonStorage(bootstrap);}catch{}throw error;}
}
/** Audit DATA only. The input private run, not this copied view, grants use. */
export function inspectSelectedComparisonRun(run){const s=runState(run);return freeze({run_manifest:s.manifest,run_manifest_sha256:s.manifestSha,issuer_metadata_bytes:s.currentIssuerStoredBytes+inspectComparisonStorage(s.bootstrap).externalMetadataBytes});}
export function enrollComparisonArmFrom(run,store,armId){
  const s=runState(run);need(ARMS.includes(armId)&&!s.enrolled.has(armId)&&s.slots.size===0,'ARM_ENROLLMENT');
  const physicalIdentity=withSnapshot(store,(state,loan)=>physical(store,state,loan));
  for(const other of s.enrolled.values())need(other.store!==store&&other.db!==physicalIdentity.db&&other.root!==physicalIdentity.root&&
    !same(other.databaseIdentity,physicalIdentity.databaseIdentity)&&!same(other.rootIdentity,physicalIdentity.rootIdentity)&&
    other.binding.company_identity_sha256!==physicalIdentity.binding.company_identity_sha256,'ARMS_NOT_DISTINCT');
  s.enrolled.set(armId,physicalIdentity);return physicalIdentity.binding;
}
/** The fixed evidence IO module consumes one A-directory initialization before
 * mkdir. Neither returned descriptor DATA nor a failed mkdir can be adopted. */
export function consumeComparisonEvidenceStorageEntitlementFrom(run,store,input){
  exact(input,['arm_id','phase','deadline_at_ms','capacity_reserved_bytes']);const s=runState(run),key=input.arm_id+'/'+input.phase;
  need(ARMS.includes(input.arm_id)&&['engineer','qa'].includes(input.phase)&&s.enrolled.size===4&&!s.evidence.has(key)&&!s.slots.has(key),'EVIDENCE_INITIALIZATION_SPENT_OR_UNSELECTED');
  need(input.capacity_reserved_bytes===DATA_LIMITS.A_per_call_bytes&&Number.isSafeInteger(input.deadline_at_ms)&&input.deadline_at_ms>now()&&input.deadline_at_ms===s.deadlineAtMs,'EVIDENCE_POLICY');
  const enrolled=s.enrolled.get(input.arm_id);need(enrolled?.store===store,'EVIDENCE_ARM_STORE');
  withSnapshot(store,(state,loan)=>actualArm(s,{arm_id:input.arm_id,store:enrolled.binding},store,state,loan));
  const parent=inspectComparisonStorage(s.bootstrap),initialization=Object.freeze({}),entry={s,run,store,armId:input.arm_id,phase:input.phase,key,
    parentFd:parent.parentFd,parentPath:parent.parentPath,directoryName:'a-'+digest([s.runId,input.arm_id,input.phase]),pythonSha256:parent.pythonSha256,
    deadlineAtMs:input.deadline_at_ms,capacityReservedBytes:input.capacity_reserved_bytes,retentionRef:s.selection.retention_policy_ref,runId:s.runId,
    parentIdentity:parent.parentIdentity,ready:false,completionSpent:false};
  // Irreversible before returning physical policy to the fixed IO producer.
  s.evidence.set(key,entry);evidenceInitializations.set(initialization,entry);
  return freeze({parentFd:entry.parentFd,parentPath:entry.parentPath,directoryName:entry.directoryName,pythonSha256:entry.pythonSha256,
    deadlineAtMs:entry.deadlineAtMs,capacityReservedBytes:entry.capacityReservedBytes,retentionRef:entry.retentionRef,initialization,runId:s.runId,armId:entry.armId,phase:entry.phase});
}
function evidenceFacts(entry,handle){
  const facts=inspectComparisonEvidenceStorageFrom(handle);
  for(const key of ['parentFd','parentPath','directoryName','pythonSha256','deadlineAtMs','capacityReservedBytes','runId','armId','phase'])need(facts[key]===entry[key],'EVIDENCE_STORAGE_JOIN');
  need(same(facts.retentionRef,entry.retentionRef)&&same(facts.parentIdentity,entry.parentIdentity),'EVIDENCE_RETENTION_OR_PARENT_CHANGED');return facts;
}
export function completeComparisonEvidenceStorageFrom(initialization,handle){
  const entry=evidenceInitializations.get(initialization);need(entry&&!entry.completionSpent,'EVIDENCE_COMPLETION_SPENT_OR_FOREIGN');entry.completionSpent=true;
  runState(entry.run);evidenceFacts(entry,handle);entry.handle=handle;entry.ready=true;return undefined;
}
function evidenceCurrent(s,binding){
  const entry=s.evidence.get(binding.arm_id+'/'+binding.phase);need(entry?.ready&&entry.deadlineAtMs===s.deadlineAtMs&&entry.capacityReservedBytes===DATA_LIMITS.A_per_call_bytes,'EVIDENCE_STORAGE_REQUIRED');
  evidenceFacts(entry,entry.handle);return entry;
}
/** Fixed actual-test producer calls this itself, before opening the arm SQL
 * writer. Its real development permission and test lifecycle remain separate. */
export function consumeComparisonTestEntitlementFrom(run,store,input){
  exact(input,['arm_id','engineerBoundArm','candidateRef','planRef']);const s=runState(run),engineer=boundArms.get(input.engineerBoundArm);
  need(ARMS.includes(input.arm_id)&&engineer&&engineer.arm.pending.s===s&&engineer.arm.pending.binding.arm_id===input.arm_id&&engineer.arm.pending.binding.phase==='engineer'&&engineer.arm.store===store,'TEST_ENGINEER_ARM');
  need(!s.testSpends.has(input.arm_id),'TEST_ALREADY_SPENT');
  need(store&&typeof store==='object'&&!types.isProxy(store)&&!store.inTransaction&&!store.db?.isTransaction,'TEST_SPEND_OUTSIDE_TRANSACTION_REQUIRED');
  const entry={s,run,store,engineer,armId:input.arm_id,spent:true,token:null};s.testSpends.set(input.arm_id,entry);
  try{
    committedFacts(engineer.arm,engineer.launch);
    withSnapshot(store,(state,loan)=>{
      actualArm(s,engineer.arm.pending.binding,store,state,loan);
      const candidate=recordRef(state,input.candidateRef),plan=recordRef(state,input.planRef),job=state.jobs?.[engineer.arm.pending.binding.job.id],binding=engineer.arm.pending.binding;
      need(job&&job.status==='completed'&&job.artifact_id===candidate.id&&job.instance_id===candidate.author_instance&&job.native_id&&job.coordination_release?.termination_confirmed===true&&
        candidate.kind==='artifact'&&candidate.status==='Submitted'&&candidate.author_role==='engineer'&&candidate.job_id===job.id&&candidate.development?.type==='candidate'&&candidate.development.plan_id===plan.id&&
        plan.id===binding.plan.id&&plan.revision===binding.plan.revision&&digest(plan)===binding.plan.record_sha256,'ACTUAL_TEST_CANDIDATE');
      const invocation=job.model_process_tracking?.invocations?.find(item=>item.invocation_id===binding.invocation_id);
      need(invocation?.birth&&invocation.closure&&invocation.closure.exit_code===0&&invocation.closure.signal===null,'TEST_PRODUCER_CLOSURE');
      entry.candidateRef=freeze(data(input.candidateRef));entry.planRef=freeze(data(input.planRef));entry.deadlineAtMs=Math.min(s.deadlineAtMs,Date.parse(plan.development.scope.expires_at));
      need(entry.deadlineAtMs>now(),'TEST_SCOPE_EXPIRED');
      entry.facts=Object.freeze({run_id:s.runId,arm_id:input.arm_id,store,db:loan.db,root:loan.root,engineerInvocationId:binding.invocation_id,
        engineerBindingSha256:engineer.arm.pending.slot.binding_sha256,candidateRef:entry.candidateRef,planRef:entry.planRef,selectionRef:s.selectionRef,
        retentionRef:s.selection.retention_policy_ref,source:s.selection.source,deadlineAtMs:entry.deadlineAtMs});
    });
    journal(s,{event:'test_spent',arm_id:input.arm_id,candidate_sha256:entry.candidateRef.sha256,plan_sha256:entry.planRef.sha256});
    const token=Object.freeze({});entry.token=token;testEntitlements.set(token,entry);return token;
  }catch(error){s.poisoned=true;throw error;}
}
/** Only a fixed test producer retaining the original token may inspect it.
 * Repeated facts do not mint a second producer or reset its own private guard. */
export function inspectComparisonTestEntitlementFrom(token,store){
  const entry=testEntitlements.get(token);need(entry&&entry.store===store,'TEST_ENTITLEMENT_FOREIGN');runState(entry.run);
  withSnapshot(store,(state,loan)=>{
    actualArm(entry.s,entry.engineer.arm.pending.binding,store,state,loan);recordRef(state,entry.planRef);
    const old=JSON.parse(readImmutable(loan.db,entry.candidateRef.sha256)),current=state.records?.[entry.candidateRef.id];
    need(old.id===entry.candidateRef.id&&old.revision===entry.candidateRef.revision&&digest(old)===entry.candidateRef.sha256&&current,'TEST_CANDIDATE_PREIMAGE');
    const stable=value=>{const development={...value.development};delete development.run;return {...value,development};};
    need(digest(stable(old))===digest(stable(current)),'TEST_CANDIDATE_CHANGED');
    if(current.development.run!==undefined){
      const run=current.development.run,job=state.jobs?.[run.job_id];
      need(job?.kind==='development_test'&&job.candidate_id===current.id&&job.development_id===entry.planRef.id&&job.reuse_receipt_id===undefined&&
        ['queued','running','completed','quarantined'].includes(run.status),'TEST_CANDIDATE_BOOKKEEPING');
      exact(run,run.status==='completed'||run.status==='quarantined'?['job_id','status','receipt_id']:['job_id','status']);
      if(run.receipt_id!==undefined)need(state.records?.[run.receipt_id]?.author_instance===job.id&&job.artifact_id===run.receipt_id,'TEST_CANDIDATE_RECEIPT');
    }
    need(now()<entry.deadlineAtMs,'TEST_SCOPE_EXPIRED');
  });return entry.facts;
}
function actualArm(s,binding,store,state,loan){
  const enrolled=s.enrolled.get(binding.arm_id);need(enrolled&&enrolled.store===store&&enrolled.db===loan.db&&enrolled.root===loan.root,'ARM_STORE_REQUIRED');
  const current=physical(store,state,loan);need(same(current.binding,binding.store)&&same(current.binding,enrolled.binding)&&same(current.rootIdentity,enrolled.rootIdentity)&&same(current.databaseIdentity,enrolled.databaseIdentity),'ARM_INCARNATION_CHANGED');return current;
}
function actualJob(s,binding,store,state,loan,{preimage=false,qa=null}={}){
  actualArm(s,binding,store,state,loan);sourceCurrent(s);
  withSnapshot(s.store,(selectionState,selectionLoan)=>selectionCurrent(s,selectionState,selectionLoan));
  need(!state.paused&&state.owner.epoch===binding.job.owner_epoch,'ARM_AUTHORITY_CHANGED');
  const job=state.jobs?.[binding.job.id],b=binding.job;need(job&&job.id===b.id&&job.instance_id===b.instance_id&&job.worker_pid===b.worker_pid&&job.epoch===b.owner_epoch&&job.role===b.role&&job.status==='running'&&job.context_sha256===b.context_sha256&&
    (job.development_id??null)===b.development_id&&(job.prototype_id??null)===null&&(job.retention_repair_id??null)===null&&!job.stream_mode&&!job.continuation_mode,'ACTUAL_RUNNING_JOB');
  need(job.host===binding.model.host&&(job.native_id??null)===binding.model.native_id_requested&&same(job.model_selection??null,binding.model.selection)&&digest(job.model_selection??null)===binding.model.selection_sha256,'ACTUAL_MODEL_SELECTION');
  const selectedTuple=s.modelPolicy[binding.phase],selection=binding.model.selection;
  need(selection.mode==='explicit'&&selection.model===selectedTuple.model&&selection.effort===selectedTuple.effort&&selection.speed===selectedTuple.speed,'SELECTED_MODEL_POLICY');
  need(contextMatches(state,job,b.context_sha256),'ACTUAL_CONTEXT_CHANGED');
  if(preimage)need(digest(job)===b.preimage_sha256,'JOB_PREIMAGE');
  const plan=recordRef(state,{id:binding.plan.id,revision:binding.plan.revision,sha256:binding.plan.record_sha256}),scope=plan.development?.scope;
  need(scope&&scope.max_attempts===1&&scope.timeout_ms===10000&&plan.development.scope_sha256===binding.plan.scope_sha256&&digest(scope)===binding.plan.scope_sha256&&digest(plan.development.authorization)===binding.plan.authorization_sha256&&
    digest(scope.sources)===binding.plan.source_corpus_sha256&&same(scope.write_paths,binding.plan.write_paths)&&scope.output_format===binding.plan.output_format&&scope.max_bytes===200000&&scope.expires_at===binding.plan.expires_at&&now()<Date.parse(scope.expires_at),'ACTUAL_PLAN');
  const expectedPaths=binding.arm_id.startsWith('3')?['module-0.mjs','module-1.mjs','module-2.mjs']:['module-0.mjs'];
  need(same(scope.write_paths,expectedPaths)&&scope.output_format===(binding.arm_id.endsWith('files')?'files':'patches'),'ARM_SCOPE');
  need(binding.codec_mode===(binding.phase==='engineer'&&binding.arm_id.endsWith('files')?'full_file_chunks_v1':'identity'),'PROFILE_ENCODING_SELECTOR');
  if(binding.phase==='engineer')need(developmentAssignment(state,job,false,loan.root)===plan,'ENGINEER_AUTHORITY');
  else{
    need(qa&&job.review_of?.id===qa.test_receipt_ref.id&&(job.review_of?.revision??null)===qa.test_receipt_ref.revision,'QA_REVIEW_TARGET');
    for(const key of ['candidate_ref','test_attempt_reservation_ref','test_receipt_ref','actual_test_proof_ref'])recordRef(state,qa[key]);
    need(same(qa.qa_independence_policy_ref,s.selection.model_policy_ref),'QA_SELECTED_INDEPENDENCE_POLICY');
    need(same(qa.actual_test_proof_ref,qa.test_receipt_ref),'QA_ACTUAL_TEST_PROOF_JOIN');
    const testProof=comparisonTestPrerequisiteFrom(store,state,qa.test_attempt_reservation_ref,qa.actual_test_proof_ref);
    need(testProof.run_id===s.runId&&testProof.arm_id===binding.arm_id&&testProof.profile_sha256===DATA_CONTRACT.profile_sha256&&same(testProof.actual_receipt_ref,qa.test_receipt_ref)&&
      same(testProof.candidate_ref,qa.candidate_ref)&&testProof.candidate_sha256===qa.candidate_sha256&&testProof.test_job_id===qa.test_job_id&&testProof.plan_id===binding.plan.id&&testProof.scope_sha256===binding.plan.scope_sha256&&
      testProof.producer_invocation_id===qa.producer_invocation_id&&testProof.producer_native_id===qa.producer_native_id,'QA_FIXED_TEST_GUARD');
    const receipt=recordRef(state,qa.test_receipt_ref),candidate=recordRef(state,qa.candidate_ref),controller=state.jobs?.[qa.test_job_id],producer=state.jobs?.[candidate.job_id];
    need(validTestExecution(state,receipt)&&receipt.development?.receipt_sha256===qa.test_receipt_sha256&&candidate.development?.candidate_sha256===qa.candidate_sha256&&controller?.kind==='development_test'&&controller.status==='completed'&&controller.artifact_id===receipt.id&&controller.reuse_receipt_id===undefined,'QA_ACTUAL_TEST');
    const subject=developmentReviewSubject(state,{plan_id:plan.id,candidate_id:candidate.id,receipt_id:receipt.id,receipt_sha256:qa.test_receipt_sha256},loan.root);
    need(subject.controller===controller&&subject.producer===producer&&producer.native_id===qa.producer_native_id&&producer.model_process_tracking?.invocations?.some(item=>item.invocation_id===qa.producer_invocation_id&&item.birth&&item.closure)&&
      job.instance_id!==producer.instance_id&&job.native_id!==producer.native_id,'QA_INDEPENDENCE');
    const engineer=s.slots.get(binding.arm_id+'/engineer');need(engineer?.bound&&engineer.slotSha===qa.engineer_slot_record_sha256&&engineer.binding.invocation_id===qa.producer_invocation_id,'QA_ENGINEER_SLOT');
    need(engineer.binding.model.host===binding.model.host,'QA_SAME_SELECTED_HOST');
    // Record references remain corroborating DATA. The actual canonical runtime
    // receipt, test job, candidate, scope/source verification and producer closure
    // above are required independently; a caller's passing Boolean is not read.
  }
  const policy=binding.call_policy;need(now()<policy.absolute_deadline_ms&&now()<policy.authority_expiry_ms&&(policy.overall_deadline_ms===null||now()<policy.overall_deadline_ms),'CALL_EXPIRED');
  need(job.timeout_ms===300000&&policy.configured_timeout_ms===300000&&policy.evidence_ceiling_bytes===10000000&&
    (binding.codec_mode!=='full_file_chunks_v1'||policy.max_output_utf16_units<=200000),'PROFILE_ORIGINAL_LIMITS');
  loan.assert();return job;
}
export function reserveSelectedCallSlot(run,slotData){
  const s=runState(run);need(s.enrolled.size===4,'ALL_FOUR_ARMS_REQUIRED');
  const copied=data(slotData,16384),arm=copied.binding?.arm_id,phase=copied.binding?.phase,key=arm+'/'+phase;
  const slot=validateSlotRecord(copied,{run_manifest:s.manifest,run_manifest_sha256:s.manifestSha,arm_id:arm,phase}),binding=slot.binding;
  need(!s.slots.has(key),'SLOT_SPENT');
  const evidence=evidenceCurrent(s,binding);
  const enrolled=s.enrolled.get(arm);need(enrolled,'ARM_REQUIRED');
  withSnapshot(enrolled.store,(state,loan)=>actualJob(s,binding,enrolled.store,state,loan,{preimage:true,qa:slot.phase_prerequisite}));
  // Enforce the private A prepayment at the irreversible issuer boundary too.
  // The exported reserve operation cannot rely on the worker's call order.
  assertComparisonEvidencePrepaymentFrom(evidence.handle,{actualStore:enrolled.store,job_id:binding.job.id,phase});
  const slotSha=hash(encodeSlotRecord(slot,{run_manifest:s.manifest,run_manifest_sha256:s.manifestSha,arm_id:arm,phase}));
  const pending={s,run,slot,binding,key,slotSha,spent:false,bound:false};s.slots.set(key,pending);
  try{
    journal(s,{event:'slot_spent',arm_id:arm,phase,slot_sha256:slotSha});
    const receipt=publishIssue18LedgerSlot(s.ledger,arm,phase,slot),row=receipt.rows.find(item=>item.name===`slot-${arm}-${phase}.json`);
    need(row?.sha256===slotSha,'SLOT_READBACK');
    const commit=freeze({profile_sha256:DATA_CONTRACT.profile_sha256,run_id:s.runId,arm_id:arm,phase,binding_sha256:slot.binding_sha256,slot_record_sha256:slotSha,
      slot_commit_id:slot.slot_commit_id,committed_at:new Date(now()).toISOString(),ledger_identity_sha256:s.manifest.ledger_identity_sha256});
    const admission=Object.freeze({});pending.slotCommit=commit;admissions.set(admission,pending);return Object.freeze({admission,slot_commit:commit});
  }catch(error){s.poisoned=true;throw error;}
}
export function consumeCommittedSelectedCallSlotAdmission(admission,input){
  const pending=admissions.get(admission);need(pending&&!pending.spent,'ADMISSION_SPENT_OR_FOREIGN');pending.spent=true;
  exact(input,['actualStore','callBinding','actualPrompt']);const s=pending.s;
  runState(pending.run);need(same(input.callBinding,pending.binding),'ADMISSION_BINDING');
  evidenceCurrent(s,pending.binding);
  need(typeof input.actualPrompt==='string','ACTUAL_PROMPT_REQUIRED');
  const prompt=capturePrompt(input.actualPrompt);need(same(prompt.prompt_ref,pending.slot.request_prompts.actual),'ACTUAL_PROMPT_MISMATCH');
  const promptUtf16Sha256=hash(Buffer.from(input.actualPrompt,'utf16le')),promptUtf16Units=input.actualPrompt.length;
  // Consume OUTSIDE an arm writer. A later rollback never refunds this slot.
  need(!input.actualStore.inTransaction&&!input.actualStore.db?.isTransaction,'ADMISSION_OUTSIDE_TRANSACTION_REQUIRED');
  withSnapshot(input.actualStore,(state,loan)=>actualJob(s,pending.binding,input.actualStore,state,loan,{preimage:true,qa:pending.slot.phase_prerequisite}));
  const loan=Object.freeze({});arms.set(loan,{pending,store:input.actualStore,scope:null,transactionId:'issue18-'+randomUUID(),sealed:false,promptUtf16Sha256,promptUtf16Units});
  return Object.freeze({armAdmission:loan,slot_commit:pending.slotCommit});
}
/** Call as the final guard AFTER the genuine producer prepared its capability. */
export function assertInFlightArmAdmission(armAdmission,input){
  const arm=arms.get(armAdmission);need(arm&&!arm.sealed&&!arm.invalid,'ARM_ADMISSION_FOREIGN_OR_SEALED');
  try{
    exact(input,['actualStore','currentState','callBinding']);const p=arm.pending,s=p.s,loan=originalStoreExecutionCustodyFrom(input.actualStore);
    need(input.actualStore===arm.store&&loan.mode==='write'&&loan.state===input.currentState&&same(input.callBinding,p.binding),'INFLIGHT_STORE_SCOPE');
    need(arm.scope===null||arm.scope===loan.scope,'INFLIGHT_SCOPE_CHANGED');arm.scope=loan.scope;
    evidenceCurrent(s,p.binding);
    const expected=p.binding.store.lane==='original'?'job.model_process.launch_requested':'job.model_process.requested';need(loan.type===expected,'ACTUAL_CAPABILITY_WRITER');
    const job=actualJob(s,p.binding,arm.store,input.currentState,loan,{qa:p.slot.phase_prerequisite}),entry=job.model_process_tracking?.invocations?.at(-1);
    need(entry?.invocation_id===p.binding.invocation_id&&entry.job_id===job.id&&entry.instance_id===job.instance_id&&entry.worker_pid===p.binding.job.worker_pid&&entry.host===p.binding.model.host&&entry.birth===null&&entry.closure===null,'ACTUAL_REQUEST_ENTRY');
    const header=inspectComparisonRequestedHeaderFrom(arm.store,input.currentState,p.binding);
    // Original's header requested writer and later capability issuance writer
    // are separate facts. E3 proves the latter COMMIT; this fixed producer
    // authenticates the A header and (when different) its earlier COMMIT.
    need(header.request_event_type==='job.model_process.requested'&&Number.isSafeInteger(header.request_event_seq)&&header.request_event_seq>=1,'A_REQUEST_HEADER');
    arm.db=loan.db;arm.root=loan.root;arm.type=loan.type;arm.requestRecordSha=header.record_sha256;arm.requestRecordId=header.record_id;
    arm.headerRequestScope=header.request_scope;arm.headerRequestSeq=header.request_event_seq;
    arm.eventBefore=loan.db.prepare('SELECT COALESCE(MAX(seq),0) AS seq FROM events').get().seq;
    need(p.binding.store.lane==='original'?header.request_scope!==loan.scope&&header.request_event_seq<=arm.eventBefore:
      header.request_scope===loan.scope&&header.request_event_seq===arm.eventBefore+1,'A_REQUEST_AND_CAPABILITY_SCOPE_JOIN');loan.assert();return undefined;
  }catch(error){arm.invalid=true;throw error;}
}
function committedFacts(arm,launch){
  need(typeof runtime.inspectRuntimeModelRequestCommitFrom==='function','GENUINE_COMMIT_INSPECTOR_UNAVAILABLE');
  const facts=runtime.inspectRuntimeModelRequestCommitFrom(launch,arm.store),p=arm.pending,b=p.binding;
  need(facts.store===arm.store&&facts.db===arm.db&&facts.root===arm.root&&facts.scope===arm.scope&&facts.type===arm.type&&facts.job_id===b.job.id&&facts.instance_id===b.job.instance_id&&facts.invocation_id===b.invocation_id,'GENUINE_COMMIT_MISMATCH');
  need(facts.lane===(b.store.lane==='original'?'original':'legacy'),'COMMIT_LANE');
  const input=facts.input_binding;
  need(input&&input.host===b.model.host&&input.native_id===b.model.native_id_requested&&input.prompt_sha256===b.actual_prompt_sha256&&
    input.prompt_utf16_sha256===arm.promptUtf16Sha256&&input.prompt_utf16_units===arm.promptUtf16Units&&
    input.selection_sha256===b.model.selection_sha256&&typeof input.cwd==='string'&&hash(input.cwd)===b.model.cwd_sha256,'COMMITTED_INPUT_MISMATCH');
  const expectedPolicy=b.call_policy,timing=facts.timeout_policy;
  need(timing&&timing.timeout_ms===expectedPolicy.configured_timeout_ms&&typeof timing.timeout_reason==='string','COMMITTED_TIMEOUT_MISMATCH');return facts;
}
export function bindCommittedArmFrom(armAdmission,launch){
  const arm=arms.get(armAdmission);need(arm&&!arm.sealed&&!arm.invalid&&arm.scope,'ARM_COMMIT_REQUIRED');arm.sealed=true;
  const p=arm.pending,s=p.s;
  try{
    runState(p.run);evidenceCurrent(s,p.binding);committedFacts(arm,launch);
    let event;
    withSnapshot(arm.store,(state,loan)=>{
      actualJob(s,p.binding,arm.store,state,loan,{qa:p.slot.phase_prerequisite});
      event=loan.db.prepare('SELECT seq,at,type,value FROM events WHERE seq=?').get(arm.eventBefore+1);
      need(event?.type===arm.type&&Number.isSafeInteger(event.seq),'REQUEST_EVENT');
      const raw=readImmutable(loan.db,arm.requestRecordSha),record=JSON.parse(raw);
      need(digest(record)===arm.requestRecordSha&&record.id===arm.requestRecordId&&digest(state.records?.[record.id])===arm.requestRecordSha&&record.job_id===p.binding.job.id&&
        record.runtime_wire_evidence?.binding?.invocation_id===p.binding.invocation_id&&record.runtime_wire_evidence.state==='requested','REQUEST_IMMUTABLE_POSTIMAGE');
      const headerEvent=loan.db.prepare('SELECT seq,at,type,value FROM events WHERE seq=?').get(arm.headerRequestSeq),proof=headerEvent&&JSON.parse(headerEvent.value).runtime_wire_evidence;
      need(headerEvent?.type==='job.model_process.requested'&&proof?.record_id===arm.requestRecordId&&proof.after_record_sha256===arm.requestRecordSha&&proof.invocation_id===p.binding.invocation_id,'A_REQUEST_EVENT');
    });
    const commit=freeze({profile_sha256:DATA_CONTRACT.profile_sha256,run_id:s.runId,arm_id:p.binding.arm_id,phase:p.binding.phase,binding_sha256:p.slot.binding_sha256,
      slot_commit_id:p.slot.slot_commit_id,store_incarnation_sha256:p.binding.store.incarnation_sha256,invocation_id:p.binding.invocation_id,
      request_event_seq:event.seq,request_event_sha256:digest([event.seq,event.at,event.type,event.value]),request_record_sha256:arm.requestRecordSha,
      store_transaction_id:arm.transactionId,committed_at:event.at});
    journal(s,{event:'arm_committed',arm_id:p.binding.arm_id,phase:p.binding.phase,event_sha256:commit.request_event_sha256,record_sha256:commit.request_record_sha256});
    const bound=Object.freeze({});p.bound=true;boundArms.set(bound,{arm,launch,commit});return Object.freeze({boundArm:bound,arm_commit:commit});
  }catch(error){s.poisoned=true;throw error;}
}
export function assertBoundComparisonArmFrom(bound,launch){
  const b=boundArms.get(bound);need(b&&b.launch===launch,'BOUND_ARM_FOREIGN');
  const {arm}=b,p=arm.pending,s=p.s;runState(p.run);
  evidenceCurrent(s,p.binding);
  const stored=readIssue18LedgerStorage(s.ledger,`slot-${p.binding.arm_id}-${p.binding.phase}.json`);need(stored.sha256===p.slotSha,'SLOT_CHANGED');
  committedFacts(arm,launch);
  withSnapshot(arm.store,(state,loan)=>actualJob(s,p.binding,arm.store,state,loan,{qa:p.slot.phase_prerequisite}));return undefined;
}
export function closeComparisonRun(run){
  const s=runs.get(run);need(s,'RUN_FOREIGN_OR_CLOSED');if(s.closed)return;s.closed=true;const errors=[];
  try{closeComparisonEvidenceRunFrom(run);}catch(error){errors.push(error);}
  for(const entry of s.evidence.values())if(entry.handle)try{closeComparisonEvidenceStorage(entry.handle);}catch(error){errors.push(error);}
  try{closeIssue18LedgerStorage(s.ledger);}catch(error){errors.push(error);}try{closeComparisonStorage(s.bootstrap);}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Issue18 run close held; immutable files retained');
}
