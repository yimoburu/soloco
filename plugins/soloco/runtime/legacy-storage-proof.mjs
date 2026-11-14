import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {originalStoreExecutionCustodyFrom} from './store.mjs';
import {inspectLegacyV4HistoryFrom,inspectFrozenLegacyIntakeFrom,COMPARISON_PROOF_INDEX_SQL} from './record-storage.mjs';
import {validModelProcessTracking} from './model-process-closure.mjs';
import {validateLegacyRuntimeJobShape} from './runtime-execution.mjs';
import {pendingSnapshots} from './snapshot.mjs';
import {validateStoredComparisonEvidenceFrom} from './integrated-comparison-evidence.mjs';
import {validateStoredComparisonTestFrom} from './integrated-comparison-test.mjs';

// This reader establishes only a bounded, positively unqualified storage lane.
// A present Origin goes to its existing strict reader, even when its value is
// invalid. No error, null projection or injected callback selects legacy.
const MAX_ROWS=100000,MAX_BYTES=64*1024*1024,MAX_JOB_BYTES=16*1024*1024,MAX_WORK=1000000,MAX_DEPTH=256;
// Preserve the existing producer's raw Original read bound. This short presence
// read intentionally does not apply the new positive-legacy grammar.
const ORIGINAL_RAW_MAX_BYTES=64*1024*1024;
const own=(value,key)=>Object.hasOwn(value,key);
const hash=value=>createHash('sha256').update(value).digest('hex');
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const nat=value=>Number.isSafeInteger(value)&&value>=0;
const text=value=>typeof value==='string'&&value.length>0&&value.length<=2000;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&!types.isProxy(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const closed=(value,keys)=>plain(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=value=>JSON.parse(JSON.stringify(value));
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function need(ok,reason){if(!ok)throw Object.assign(Error('Unqualified runtime storage Hold: '+reason),{code:'LEGACY_RUNTIME_'+reason});}
const proofs=new WeakMap();
const sqlNormal=value=>value.replace(/\s+/g,'').replace(/ifnotexists/gi,'').replace(/;$/,'').toLowerCase();
const schemas=new Map(Object.entries({
  // Each discardable lookup is independently optional for passive old readers.
  // Presence checks/install policy remain in the fixed record-storage module.
  ...COMPARISON_PROOF_INDEX_SQL,
  company:"CREATE TABLE company(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL)",
  events:'CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,type TEXT NOT NULL,value TEXT NOT NULL)',
  company_layout:'CREATE TABLE company_layout(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL)',
  immutable_values:'CREATE TABLE immutable_values(sha256 TEXT PRIMARY KEY,bytes TEXT NOT NULL)',
  state_entries:"CREATE TABLE state_entries(family TEXT NOT NULL,key TEXT NOT NULL,position INTEGER NOT NULL,sha256 TEXT NOT NULL REFERENCES immutable_values(sha256),encoding TEXT NOT NULL DEFAULT 'json',PRIMARY KEY(family,key))",
  state_entries_order:'CREATE INDEX state_entries_order ON state_entries(family,position)',
  fence_legacy_update:"CREATE TRIGGER fence_legacy_update BEFORE UPDATE ON company BEGIN SELECT RAISE(ABORT,'Legacy writer fenced: normalized company storage'); END",
  fence_legacy_delete:"CREATE TRIGGER fence_legacy_delete BEFORE DELETE ON company BEGIN SELECT RAISE(ABORT,'Legacy writer fenced: normalized company storage'); END",
  fence_legacy_insert:"CREATE TRIGGER fence_legacy_insert BEFORE INSERT ON company BEGIN SELECT RAISE(ABORT,'Legacy writer fenced: normalized company storage'); END",
  public_read_values:'CREATE TABLE public_read_values(family TEXT NOT NULL,key TEXT NOT NULL,position INTEGER NOT NULL,bytes TEXT NOT NULL,value_id_sha256 TEXT,sha256 TEXT NOT NULL,PRIMARY KEY(family,key))',
  public_read_value_ids:'CREATE INDEX public_read_value_ids ON public_read_values(family,value_id_sha256,position)',
  public_read_rows:'CREATE TABLE public_read_rows(collection TEXT NOT NULL,ordinal INTEGER NOT NULL,key TEXT NOT NULL,id TEXT NOT NULL,sha256 TEXT NOT NULL,key_sha256 TEXT NOT NULL,PRIMARY KEY(collection,ordinal))',
  public_read_handles:'CREATE INDEX public_read_handles ON public_read_rows(collection,key_sha256)',
  public_read_catalog:'CREATE TABLE public_read_catalog(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,sha256 TEXT NOT NULL,bytes TEXT NOT NULL)',
  public_read_insert:'CREATE TRIGGER public_read_insert AFTER INSERT ON state_entries BEGIN DELETE FROM public_read_catalog; END',
  public_read_update:'CREATE TRIGGER public_read_update AFTER UPDATE ON state_entries BEGIN DELETE FROM public_read_catalog; END',
  public_read_delete:'CREATE TRIGGER public_read_delete AFTER DELETE ON state_entries BEGIN DELETE FROM public_read_catalog; END',
  async_task_index:'CREATE TABLE async_task_index(id TEXT PRIMARY KEY,state TEXT NOT NULL,sha256 TEXT NOT NULL)',
  async_task_states:'CREATE INDEX async_task_states ON async_task_index(state,id)',
  async_message_index:'CREATE TABLE async_message_index(id TEXT PRIMARY KEY,to_task_id TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,sha256 TEXT NOT NULL)',
  async_message_recipient:'CREATE INDEX async_message_recipient ON async_message_index(to_task_id,created_at,id)',
  async_index_meta:'CREATE TABLE async_index_meta(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,generation INTEGER NOT NULL)',
  async_runtime_lease:'CREATE TABLE async_runtime_lease(instance_id TEXT PRIMARY KEY,pid INTEGER NOT NULL,heartbeat_at TEXT NOT NULL)'
}));

function reader(loan,{pending=null,next=null}={}){
  let rows=0,bytes=0,jobBytes=0,work=0;
  const immutable=new Map(),staged=new Map(),jobValues=new Set(),tables=new Set();
  const assertCurrent=()=>{
    loan.assert();
    if(pending!==null){const current=originalStoreExecutionCustodyFrom(loan.store);need(current.scope===loan.scope&&current.state===next&&current.mode==='write','WRITE_REQUIRED');}
  };
  const check=operation=>{assertCurrent();const value=operation();assertCurrent();return value;};
  const query=(sql,method,...args)=>check(()=>loan.db.prepare(sql)[method](...args));
  const charge=(n,size)=>{need(nat(n)&&nat(size)&&rows+n<=MAX_ROWS&&bytes+size<=MAX_BYTES,'INVENTORY_CAPACITY');rows+=n;bytes+=size;};
  const chargeJobs=(key,size)=>{if(jobValues.has(key))return;need(nat(size)&&jobBytes+size<=MAX_JOB_BYTES,'JOB_INVENTORY_CAPACITY');jobValues.add(key);jobBytes+=size;};
  const chargeWork=n=>{need(nat(n)&&work+n<=MAX_WORK,'WORK_CAPACITY');work+=n;};
  const parse=raw=>{
    need(typeof raw==='string','STORAGE_BODY');let value;
    try{value=JSON.parse(raw);}catch{need(false,'STORAGE_BODY');}
    const todo=[[value,0]];
    while(todo.length){const [item,depth]=todo.pop();need(depth<=MAX_DEPTH,'SNAPSHOT_DEPTH');chargeWork(1);if(!item||typeof item!=='object')continue;
      const values=Object.values(item);chargeWork(values.length);for(const child of values)todo.push([child,depth+1]);}
    need(JSON.stringify(value)===raw,'NONCANONICAL_BODY');
    return value;
  };
  const table=(name,column)=>{
    if(tables.has(name))return;
    const row=query(`SELECT COUNT(*) AS n,COALESCE(SUM(length(CAST(${column} AS BLOB))),0) AS bytes,COALESCE(SUM(CASE WHEN typeof(${column})<>'text' THEN 1 ELSE 0 END),0) AS invalid FROM ${name}`,'get');
    need(row.invalid===0,'STORAGE_BODY');charge(row.n,row.bytes);tables.add(name);
  };
  const events=()=>{
    const row=query("SELECT COUNT(*) AS n,COALESCE(SUM(length(CAST(at AS BLOB))+length(CAST(type AS BLOB))+length(CAST(value AS BLOB))+16),0) AS bytes,COALESCE(SUM(CASE WHEN typeof(seq)<>'integer' OR seq<1 OR seq>9007199254740991 OR typeof(at)<>'text' OR length(CAST(at AS BLOB))<1 OR length(CAST(at AS BLOB))>128 OR length(at)>64 OR typeof(type)<>'text' OR length(CAST(type AS BLOB))<1 OR length(CAST(type AS BLOB))>8000 OR length(type)>2000 OR typeof(value)<>'text' THEN 1 ELSE 0 END),0) AS invalid FROM events",'get');
    need(row.invalid===0,'JOURNAL_REQUIRED');charge(row.n,row.bytes);
  };
  const read=(sha,{job=false,company=false,max_bytes=MAX_BYTES}={})=>{
    need(hex(sha)&&nat(max_bytes)&&max_bytes<=MAX_BYTES,'SNAPSHOT_REFERENCE');
    if(immutable.has(sha)){
      const found=immutable.get(sha);need(found.size<=max_bytes,'CONTEXT_UNIT_CAPACITY');if(job)chargeJobs('job:'+sha,found.size);
      if(company){const size=query("SELECT COALESCE(length(CAST(json_extract(bytes,'$.jobs') AS BLOB)),0) AS bytes FROM immutable_values WHERE sha256=?",'get',sha);need(size&&nat(size.bytes)&&size.bytes<=MAX_JOB_BYTES,'JOB_INVENTORY_CAPACITY');}
      return found.raw;
    }
    if(staged.has(sha)){const found=staged.get(sha);need(found.size<=max_bytes,'CONTEXT_UNIT_CAPACITY');if(job)chargeJobs('job:'+sha,found.size);if(company)need(plain(found.value)&&plain(found.value.jobs)&&Buffer.byteLength(JSON.stringify(found.value.jobs),'utf8')<=MAX_JOB_BYTES,'JOB_INVENTORY_CAPACITY');assertCurrent();return found.raw;}
    const row=query('SELECT length(CAST(bytes AS BLOB)) AS bytes,typeof(bytes) AS type FROM immutable_values WHERE sha256=?','get',sha);
    if(!row&&pending!==null&&check(()=>pending.has(sha))){
      const raw=check(()=>pending.get(sha));need(typeof raw==='string','SNAPSHOT_CHANGED');const size=Buffer.byteLength(raw,'utf8');need(size<=max_bytes,'CONTEXT_UNIT_CAPACITY');charge(0,size);if(job)chargeJobs('job:'+sha,size);
      need(hash(raw)===sha,'SNAPSHOT_CHANGED');const value=parse(raw);
      if(company){need(plain(value)&&plain(value.jobs)&&Buffer.byteLength(JSON.stringify(value.jobs),'utf8')<=MAX_JOB_BYTES,'JOB_INVENTORY_CAPACITY');}
      staged.set(sha,{raw,value,size});assertCurrent();return raw;
    }
    need(row&&row.type==='text'&&nat(row.bytes),'SNAPSHOT_MISSING');need(row.bytes<=max_bytes,'CONTEXT_UNIT_CAPACITY');charge(1,row.bytes);if(job)chargeJobs('job:'+sha,row.bytes);
    if(company){const size=query("SELECT COALESCE(length(CAST(json_extract(bytes,'$.jobs') AS BLOB)),0) AS bytes FROM immutable_values WHERE sha256=?",'get',sha);need(size&&nat(size.bytes)&&size.bytes<=MAX_JOB_BYTES,'JOB_INVENTORY_CAPACITY');}
    const body=query('SELECT bytes FROM immutable_values WHERE sha256=?','get',sha)?.bytes;
    need(typeof body==='string'&&Buffer.byteLength(body,'utf8')===row.bytes&&hash(body)===sha,'SNAPSHOT_CHANGED');
    const value=parse(body);immutable.set(sha,{raw:body,value,size:row.bytes});return body;
  };
  return {db:loan.db,query,check,parse,table,events,read,charge,chargeJobs,chargeWork,immutable,decoded:sha=>(immutable.get(sha)??staged.get(sha))?.value,summary:()=>({physical_rows:rows,utf8_bytes:bytes,job_utf8_bytes:jobBytes,work})};
}

function schema(r){
  const count=r.query("SELECT COUNT(*) AS n,COALESCE(SUM(length(CAST(COALESCE(sql,'') AS BLOB))+length(CAST(type AS BLOB))+length(CAST(name AS BLOB))+length(CAST(tbl_name AS BLOB))),0) AS bytes FROM sqlite_master",'get');r.charge(count.n,count.bytes);
  const rows=r.query('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name','all'),names=new Set(rows.map(row=>row.name));
  for(const row of rows){
    if(row.name.startsWith('sqlite_')){need(row.sql===null||row.name==='sqlite_stat1'||row.name==='sqlite_stat4','SCHEMA_REQUIRED');continue;}
    need(schemas.has(row.name)&&typeof row.sql==='string'&&(Object.hasOwn(COMPARISON_PROOF_INDEX_SQL,row.name)?row.sql.trim().replace(/;$/,'')===schemas.get(row.name):sqlNormal(row.sql)===sqlNormal(schemas.get(row.name))),'SCHEMA_REQUIRED');
  }
  need(names.has('company')&&names.has('events'),'SCHEMA_REQUIRED');
  const normalized=['company_layout','immutable_values','state_entries','state_entries_order','fence_legacy_update','fence_legacy_delete','fence_legacy_insert'];
  const publicDerived=['public_read_values','public_read_value_ids','public_read_rows','public_read_handles','public_read_catalog','public_read_insert','public_read_update','public_read_delete'];
  for(const group of [
    normalized,
    ['async_task_index','async_task_states','async_message_index','async_message_recipient','async_index_meta','async_runtime_lease']
  ])if(group.some(name=>names.has(name)))need(group.every(name=>names.has(name)),'SCHEMA_REQUIRED');
  // Only this closed discardable group may be incomplete. Every present
  // definition was checked above, and ANY surviving member requires the whole
  // canonical normalized layout. Actual repair stays in the authorized writer,
  // after its unchanged comparison accounting/custody guards.
  if(publicDerived.some(name=>names.has(name)))need(normalized.every(name=>names.has(name)),'SCHEMA_REQUIRED');
  if(!names.has('company_layout')){need(!publicDerived.some(name=>names.has(name))&&!names.has('async_task_index'),'LAYOUT_REQUIRED');return 0;}
  const layout=r.query('SELECT id,version FROM company_layout ORDER BY id','all');need(layout.length===1&&layout[0].id===1&&layout[0].version===4,'LAYOUT_REQUIRED');return 4;
}

function typedReader(r){
  const active=new WeakMap(),referenceMetadata=new Map(),jobImages=new Map(),historicalCompanies=new Map(),historicalProducers=new Map();let depth=0,collectPhysical=true,companyId=null;
  const comparisonSeen=new Set(),comparisonBlobs=new Map();
  const marker=(value,key)=>need(!own(value,key),'RETAINED_ORIGINAL_EVIDENCE');
  const object=value=>{
    need(plain(value),'TYPED_BODY_REQUIRED');const descriptors=Object.getOwnPropertyDescriptors(value);
    need(Reflect.ownKeys(descriptors).every(key=>typeof key==='string'&&descriptors[key].enumerable&&own(descriptors[key],'value')),'TYPED_BODY_REQUIRED');return value;
  };
  const array=value=>{
    need(Array.isArray(value)&&!types.isProxy(value),'TYPED_BODY_REQUIRED');const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
    need(keys.length===value.length+1&&keys.every(key=>key==='length'||typeof key==='string'&&descriptors[key].enumerable&&own(descriptors[key],'value')),'TYPED_BODY_REQUIRED');return value;
  };
  const unknownReferences=(value,handled=[])=>{
    const todo=Object.entries(value).filter(([key])=>!handled.includes(key)).map(([,body])=>body);
    while(todo.length){const item=todo.pop();r.chargeWork(1);if(!item||typeof item!=='object')continue;
      need(!types.isProxy(item),'TYPED_BODY_REQUIRED');
      if(Array.isArray(item))array(item);else object(item);
      need(!['immutable_snapshot','immutable_entry','retained_handover_subject'].some(key=>own(item,key)),'UNKNOWN_SNAPSHOT_SLOT');
      for(const body of Object.values(item))todo.push(body);
    }
  };
  const enter=(kind,value,operation)=>{
    object(value);r.chargeWork(1);need(depth<MAX_DEPTH,'SNAPSHOT_DEPTH');let kinds=active.get(value);if(!kinds){kinds=new Set();active.set(value,kinds);}need(!kinds.has(kind),'CYCLIC_HISTORY');kinds.add(kind);depth++;
    try{return operation();}finally{depth--;kinds.delete(kind);}
  };
  const snapshot=(value,options)=>{
    object(value);if(!own(value,'immutable_snapshot'))return value;
    const ref=value.immutable_snapshot;need(closed(value,['immutable_snapshot'])&&closed(ref,['version','sha256','characters','shape'])&&ref.version===1&&hex(ref.sha256)&&nat(ref.characters)&&['object','array','scalar'].includes(ref.shape),'SNAPSHOT_REFERENCE');
    if(referenceMetadata.has(ref.sha256))need(same(referenceMetadata.get(ref.sha256),ref),'SNAPSHOT_REFERENCE');else referenceMetadata.set(ref.sha256,ref);
    const raw=r.read(ref.sha256,options),decoded=r.decoded(ref.sha256);
    const shape=Array.isArray(decoded)?'array':decoded!==null&&typeof decoded==='object'?'object':'scalar';
    need(raw.length===ref.characters&&shape===ref.shape,'SNAPSHOT_CHANGED');contextRememberSnapshot(value);return decoded;
  };
  const entry=(value,id,options)=>{
    object(value);let decoded=value;
    if(own(value,'immutable_entry')){
      need(Object.keys(value).every(key=>['id','revision','immutable_entry'].includes(key))&&text(value.id),'SNAPSHOT_REFERENCE');
      decoded=object(snapshot(value.immutable_entry,options));
      need((decoded.id===undefined||decoded.id===value.id)&&own(decoded,'revision')===own(value,'revision')&&decoded.revision===value.revision,'SNAPSHOT_CHANGED');
    }
    if(id!==undefined)need(decoded.id===id,'TYPED_IDENTITY_CHANGED');return decoded;
  };
  const ref=(value,source)=>{
    need(closed(source,['id','revision','sha256'])&&text(source.id)&&(source.revision===null||nat(source.revision))&&hex(source.sha256),'SOURCE_REFERENCE');
    need(source.revision===(value.revision??null)&&source.sha256===hash(JSON.stringify(value)),'SOURCE_REFERENCE');
  };
  const records=(value,env)=>{
    object(value);for(const [id,body]of Object.entries(value)){record(entry(body,id),env);}
  };
  const jobs=(value,env)=>{
    object(value);for(const [id,body]of Object.entries(value)){const decoded=entry(body,id,{job:true});r.chargeJobs('job:'+hash(JSON.stringify(decoded)),Buffer.byteLength(JSON.stringify(decoded),'utf8'));job(decoded,env);}
  };
  const sourceValue=(id,value,env)=>{
    need(text(id),'SOURCE_REFERENCE');
    if(env?.records&&own(env.records,id)){need(value.id===id,'SOURCE_REFERENCE');record(value,env);}
    else if(id.startsWith('job:')){need(value.id===id.slice(4),'SOURCE_REFERENCE');job(value,env);}
    else if(id.startsWith('upgrade:')){need(value.id===id.slice(8),'SOURCE_REFERENCE');upgrade(value,env);}
    else {need(value.id===id,'SOURCE_REFERENCE');record(value,env);}
  };
  const admission=(value,env)=>{
    const a=object(snapshot(value));
    need(['runtime-bounded-proposal-v1','runtime-bounded-read-only-v1'].includes(a.producer)&&Array.isArray(a.inputs)&&plain(a.assignment)&&plain(a.owner),'UNKNOWN_ADMISSION');
    need(Object.keys(a).every(key=>['producer','checkpoint','owner','assignment','inputs','input_bodies','authority'].includes(key)),'UNKNOWN_ADMISSION');
    job(a.assignment,env);
    for(const source of a.inputs){need(plain(source)&&text(source.id)&&hex(source.sha256),'SOURCE_REFERENCE');}
    if(own(a,'input_bodies')){array(a.input_bodies);need(a.input_bodies.length===a.inputs.length,'SOURCE_REFERENCE');for(let n=0;n<a.input_bodies.length;n++){const body=object(a.input_bodies[n]);ref(body,a.inputs[n]);sourceValue(a.inputs[n].id,body,env);}}
    unknownReferences(a,['assignment','input_bodies']);
  };
  const rejected=(value,ownerJob)=>{
    object(value);need(Object.keys(value).every(key=>['qualification_plan','qualification_target','qualification_negative','operating_negative','negative_reason','text','truncated','original','author_instance','context_sha256','reason'].includes(key))&&typeof value.text==='string'&&typeof value.truncated==='boolean','UNKNOWN_REJECTED_OUTPUT');
    if(own(value,'original')){
      need(value.truncated===true&&plain(value.original)&&own(value.original,'immutable_snapshot'),'UNKNOWN_REJECTED_OUTPUT');
      const wire=snapshot(value.original);need(typeof wire==='string'&&wire.length>value.text.length&&wire.startsWith(value.text),'REJECTED_OUTPUT_CHANGED');
      need(value.author_instance===ownerJob.instance_id&&text(value.author_instance)&&value.context_sha256===ownerJob.context_sha256&&hex(value.context_sha256),'REJECTED_OUTPUT_CHANGED');
    }
    unknownReferences(value,['original']);
  };
  const captured=(input,kind,env)=>{
    object(input);const identified=own(input,'id');
    need(closed(input,identified?['id','revision','revision_present','sha256','snapshot']:['sha256','snapshot'])&&hex(input.sha256),'UNKNOWN_DELIVERY_CAPTURE');
    let value;
    if(plain(input.snapshot)&&own(input.snapshot,'immutable_snapshot'))value=snapshot(input.snapshot,{job:kind==='job'});
    else {need(closed(input.snapshot,['protocol','value'])&&input.snapshot.protocol==='development-delivery-inline-snapshot-v1','UNKNOWN_DELIVERY_CAPTURE');value=input.snapshot.value;}
    need(hash(JSON.stringify(value))===input.sha256,'DELIVERY_CAPTURE_CHANGED');
    if(identified){need(plain(value)&&text(input.id)&&value.id===input.id&&(value.revision??null)===input.revision&&typeof input.revision_present==='boolean'&&own(value,'revision')===input.revision_present,'DELIVERY_CAPTURE_CHANGED');}
    if(kind==='job'){need(identified,'DELIVERY_CAPTURE_CHANGED');job(object(value),env);}
    else if(kind==='record'){need(identified,'DELIVERY_CAPTURE_CHANGED');record(object(value),env);}
    else if(kind==='contract')deliveryContract(object(value),env);
    else unknownReferences({value});
    return value;
  };
  const deliveryContract=(value,env)=>{
    need(closed(value,['protocol','interfaces','dependency_refs','required_test_roots','integrator','observer','installer','dependency_snapshots','source_snapshot_sha256','candidate_snapshot','independent_qa','source_integration','additional_action_authority'])&&value.protocol==='development-delivery-contract-v1'&&hex(value.source_snapshot_sha256)&&value.source_integration===false&&value.additional_action_authority===false,'UNKNOWN_DELIVERY_CONTRACT');
    const refs=array(value.dependency_refs),dependencies=array(value.dependency_snapshots);need(refs.length===dependencies.length,'DELIVERY_CAPTURE_CHANGED');
    for(let n=0;n<dependencies.length;n++){
      const dependency=dependencies[n];need(closed(dependency,['reference','record'])&&closed(dependency.reference,['id','revision','revision_present','sha256']),'UNKNOWN_DELIVERY_CONTRACT');
      const body=object(dependency.record),reference=dependency.reference;need(body.id===reference.id&&(body.revision??null)===reference.revision&&own(body,'revision')===reference.revision_present&&hash(JSON.stringify(body))===reference.sha256,'DELIVERY_CAPTURE_CHANGED');
      need(closed(refs[n],['id','revision','sha256'])&&same(refs[n],{id:reference.id,revision:reference.revision,sha256:reference.sha256}),'DELIVERY_CAPTURE_CHANGED');record(body,env);
    }
    unknownReferences(value,['dependency_snapshots']);
  };
  const acceptanceFacts=(home,kind)=>{
    const d=home.development;
    if(kind==='ordinary'){const result={...d.acceptance};delete result.report;delete result.report_sha256;return result;}
    return {at:home.created_at,review_id:d.review.id,candidate_sha256:d.candidate_sha256,receipt_sha256:d.receipt_sha256,source_integrated:false,continuation:{acceptance_id:home.id,target_id:d.target_id,target_sha256:d.target_sha256,current_authority_sha256:d.current_authority_sha256,old_unknown_reservation_preserved:d.old_unknown_reservation_preserved}};
  };
  const acceptanceReport=(value,home,reportSha,env)=>enter('acceptance-report',value,()=>{
    need(closed(value,['protocol','acceptance_kind','recorded_at','recorded_by','basis','acceptance','scope_sha256','contract','plan_preimage','candidate_preimage','receipt_before_acceptance','qa_record','qa_job','candidate_producer','test_controller','native_identities','source_snapshot_sha256','candidate_snapshot_sha256','test_evidence','qa_evidence','retained_history','exact_clearing','acceptance_home_before_report','continuation_target','initial_handoff','repository_head','source_integration','external_producer_authentication','external_actions_authorized','installation','company_adoption'])&&value.protocol==='development-acceptance-report-v1'&&hex(reportSha)&&hash(JSON.stringify(value))===reportSha&&['ordinary','review-continuation'].includes(value.acceptance_kind),'UNKNOWN_ACCEPTANCE_REPORT');
    const kind=value.acceptance_kind,d=home.development;
    need(kind==='ordinary'?d.type==='test'&&d.acceptance?.report===value:d.type==='review_continuation_acceptance'&&d.acceptance_report===value,'ACCEPTANCE_REPORT_CHANGED');
    need(same(value.acceptance,acceptanceFacts(home,kind))&&value.recorded_at===value.acceptance.at&&value.source_integration===false&&value.external_actions_authorized===false&&same(value.repository_head,{status:'unobserved',sha:null,authenticated_producer:false}),'ACCEPTANCE_REPORT_CHANGED');
    const plan=captured(value.plan_preimage,'record',env),candidate=captured(value.candidate_preimage,'record',env),receipt=captured(value.receipt_before_acceptance,'record',env),review=captured(value.qa_record,'record',env),qa=captured(value.qa_job,'job',env),producer=captured(value.candidate_producer,'job',env),controller=captured(value.test_controller,'job',env),t=object(receipt.development);
    need(plan.development?.type==='plan'&&plan.development.scope_sha256===hash(JSON.stringify(plan.development.scope))&&plan.development.scope_sha256===value.scope_sha256&&value.source_snapshot_sha256===hash(JSON.stringify(plan.development.scope.sources)),'ACCEPTANCE_REPORT_CHANGED');
    need(candidate.development?.type==='candidate'&&candidate.development.plan_id===plan.id&&candidate.development.scope_sha256===value.scope_sha256&&hash(JSON.stringify(candidate.development.files))===candidate.development.candidate_sha256&&candidate.development.candidate_sha256===value.candidate_snapshot_sha256,'ACCEPTANCE_REPORT_CHANGED');
    need(t.type==='test'&&t.plan_id===plan.id&&t.candidate_id===candidate.id&&t.candidate_sha256===candidate.development.candidate_sha256&&t.receipt_sha256===hash(JSON.stringify(t.result))&&receipt.content===JSON.stringify(t.result)&&value.acceptance.candidate_sha256===t.candidate_sha256&&value.acceptance.receipt_sha256===t.receipt_sha256,'ACCEPTANCE_REPORT_CHANGED');
    need(controller.id===receipt.author_instance&&controller.kind==='development_test'&&controller.status==='completed'&&controller.artifact_id===receipt.id&&controller.candidate_id===candidate.id&&controller.development_id===plan.id&&candidate.development.run?.job_id===controller.id&&candidate.development.run?.receipt_id===receipt.id&&producer.id===candidate.job_id&&producer.status==='completed'&&producer.artifact_id===candidate.id&&producer.instance_id===candidate.author_instance&&producer.development_id===plan.id,'ACCEPTANCE_REPORT_CHANGED');
    let target=receipt;
    if(kind==='review-continuation'){
      const before=captured(value.acceptance_home_before_report,'record',env);target=captured(value.continuation_target,'record',env);const current=copy(home);delete current.development.acceptance_report;delete current.development.acceptance_report_sha256;delete current.development.delivery;
      need(same(before,current)&&target.development?.type==='review_continuation'&&d.target_id===target.id&&d.target_sha256===hash(JSON.stringify(target))&&target.development.plan_id===plan.id&&target.development.candidate_id===candidate.id&&target.development.receipt_id===receipt.id&&same(d.review,{id:review.id,revision:review.revision??null,sha256:hash(JSON.stringify(review))}),'ACCEPTANCE_REPORT_CHANGED');
    }else {need(value.acceptance_home_before_report===null&&value.continuation_target===null,'ACCEPTANCE_REPORT_CHANGED');const current=copy(home);delete current.development.acceptance;delete current.development.delivery;need(same(current,receipt),'ACCEPTANCE_REPORT_CHANGED');}
    need(review.id===value.acceptance.review_id&&review.kind==='review'&&review.status==='Submitted'&&review.author_role==='qa'&&review.job_id===qa.id&&review.author_instance===qa.instance_id&&qa.role==='qa'&&qa.status==='completed'&&qa.artifact_id===review.id&&same(review.review_of,qa.review_of)&&review.review_of?.id===target.id&&review.review_of.revision===target.revision,'ACCEPTANCE_REPORT_CHANGED');
    need(same(value.native_identities,{candidate:{instance_id:producer.instance_id??null,native_id:producer.native_id??null},qa:{instance_id:qa.instance_id??null,native_id:qa.native_id??null}}),'ACCEPTANCE_REPORT_CHANGED');
    const test=object(value.test_evidence),evidence=object(value.qa_evidence);need(closed(test,['result','validation_manifest','validation_fingerprint','reused_from'])&&closed(evidence,['bounded_delivery_required','read_delivery','original_process_journal','coordination_release_recorded','delivery_receipts','final_primary_delivery']),'UNKNOWN_ACCEPTANCE_REPORT');
    need(same(captured(test.result,'data',env),t.result)&&same(test.validation_manifest?captured(test.validation_manifest,'data',env):null,t.validation_manifest??null)&&test.validation_fingerprint===(t.validation_fingerprint??null)&&test.reused_from===(t.reused_from??null),'ACCEPTANCE_REPORT_CHANGED');
    need(same(evidence.delivery_receipts?captured(evidence.delivery_receipts,'data',env):null,qa.delivered_record_reads??null)&&same(evidence.final_primary_delivery?captured(evidence.final_primary_delivery,'data',env):null,qa.retention_primary_delivery??null)&&evidence.bounded_delivery_required===(qa.code_review_window_minutes!==undefined)&&evidence.coordination_release_recorded===(qa.coordination_release?.termination_confirmed===true),'ACCEPTANCE_REPORT_CHANGED');
    need(['observed','unobserved','held'].includes(evidence.read_delivery)&&['observed','unobserved','held'].includes(evidence.original_process_journal),'ACCEPTANCE_REPORT_CHANGED');
    unknownReferences(test,['result','validation_manifest']);unknownReferences(evidence,['delivery_receipts','final_primary_delivery']);
    const contract=value.contract?captured(value.contract,'contract',env):null;need(same(contract,plan.development.scope.delivery_contract??null)&&same(value.exact_clearing,value.acceptance.retention_repair??null),'ACCEPTANCE_REPORT_CHANGED');
    need(closed(value.retained_history,['records','jobs','adverse_record_ids','uncertain_or_rejected_job_ids']),'UNKNOWN_ACCEPTANCE_REPORT');
    for(const item of array(value.retained_history.records))captured(item,'record',env);for(const item of array(value.retained_history.jobs))captured(item,'job',env);
    for(const key of ['adverse_record_ids','uncertain_or_rejected_job_ids'])need(array(value.retained_history[key]).every(text),'UNKNOWN_ACCEPTANCE_REPORT');
    unknownReferences(value.retained_history,['records','jobs']);
    const handoff=value.initial_handoff;
    need(closed(handoff,['protocol','from','receiver','observer','recorded_at','recorded_by','basis','notification_delivery'])&&handoff.protocol==='development-delivery-initial-handoff-v1'&&handoff.recorded_at===value.recorded_at&&same(handoff.recorded_by,value.recorded_by)&&same(handoff.from,{stage:'qa',principal:{kind:'recorded-native-specialist',host:qa.host??null,instance_id:qa.instance_id??null,native_id:qa.native_id??null}})&&same(handoff.receiver,{stage:'owner',principal:{kind:'registered-owner',...value.recorded_by}})&&same(handoff.observer,contract?{kind:'declared-session-contact',...contract.observer}:null)&&handoff.basis==='local-acceptance-recorded'&&handoff.notification_delivery==='unobserved','ACCEPTANCE_REPORT_CHANGED');
    unknownReferences(value,['contract','plan_preimage','candidate_preimage','receipt_before_acceptance','qa_record','qa_job','candidate_producer','test_controller','test_evidence','qa_evidence','retained_history','acceptance_home_before_report','continuation_target']);
    return {report:value,sha256:reportSha,contract};
  });
  const deliveryProgress=(value,home,accepted,env)=>{
    need(closed(value,['protocol','report_sha256','revision','current_receiver','observer','transitions'])&&value.protocol==='development-delivery-progress-v1'&&value.report_sha256===accepted.sha256&&nat(value.revision),'UNKNOWN_DELIVERY_PROGRESS');
    const transitions=array(value.transitions),raw=JSON.stringify(value),size=Buffer.byteLength(raw,'utf8'),derived=size*(transitions.length+2);
    // Every compare-and-swap hashes a complete prefix and copies that prefix.
    // Reserve the conservative full-size bound for every such operation before
    // allocating any derived prefix; UTF8 JSON also bounds UTF16 characters.
    r.charge(0,derived);r.chargeWork(derived);
    const report=accepted.report;let prior={protocol:value.protocol,report_sha256:accepted.sha256,revision:0,current_receiver:report.initial_handoff.receiver,observer:report.initial_handoff.observer,transitions:[]};const ids=new Set();
    for(const transition of transitions){
      need(closed(transition,['sequence','recorded_at','request','request_sha256','previous_handoff_sha256','from','to','status','evidence','attribution','authenticated_external_producer','source_integration','external_actions_authorized']),'UNKNOWN_DELIVERY_PROGRESS');const q=object(transition.request);
      need(closed(q,['transition_id','acceptance_id','report_sha256','expected_handoff_sha256','to_stage','reported_outcome','evidence_refs','source_instruction','recorded_by'])&&text(q.transition_id)&&!ids.has(q.transition_id)&&transition.request_sha256===hash(JSON.stringify(q))&&q.report_sha256===accepted.sha256&&q.acceptance_id===(report.acceptance_kind==='review-continuation'?home.id:null),'DELIVERY_PROGRESS_CHANGED');ids.add(q.transition_id);
      need(transition.sequence===prior.revision+1&&transition.previous_handoff_sha256===hash(JSON.stringify(prior))&&q.expected_handoff_sha256===transition.previous_handoff_sha256&&same(transition.from,prior.current_receiver)&&accepted.contract,'DELIVERY_PROGRESS_CHANGED');
      const to=prior.current_receiver.stage==='owner'?'integrator':'installer';need(q.to_stage===to&&same(transition.to,{stage:to,principal:{kind:'declared-session-contact',...accepted.contract[to]}})&&['completed','unknown','failed'].includes(q.reported_outcome)&&transition.status===(q.reported_outcome==='completed'?'observed':q.reported_outcome==='failed'?'held':'unobserved')&&transition.attribution==='operator-reported'&&transition.authenticated_external_producer===false&&transition.source_integration===false&&transition.external_actions_authorized===false,'DELIVERY_PROGRESS_CHANGED');
      const refs=array(q.evidence_refs),evidence=array(transition.evidence);need(refs.length===evidence.length&&(q.reported_outcome!=='completed'||evidence.length>0),'DELIVERY_PROGRESS_CHANGED');for(let n=0;n<evidence.length;n++){const body=captured(evidence[n],'record',env);ref(body,refs[n]);need(body.id===refs[n].id,'DELIVERY_PROGRESS_CHANGED');}
      unknownReferences(transition,['evidence']);prior={...prior,revision:transition.sequence,current_receiver:q.reported_outcome==='completed'?transition.to:prior.current_receiver,transitions:[...prior.transitions,transition]};
    }
    need(same(prior,value),'DELIVERY_PROGRESS_CHANGED');
  };
  const developmentSlots=(home,env)=>{
    const d=object(home.development),rest={...d};let accepted=null;
    if(plain(d.acceptance)&&own(d.acceptance,'report')){accepted=acceptanceReport(object(d.acceptance.report),home,d.acceptance.report_sha256,env);rest.acceptance={...d.acceptance};delete rest.acceptance.report;}
    if(own(d,'acceptance_report')){need(!accepted,'UNKNOWN_ACCEPTANCE_REPORT');accepted=acceptanceReport(object(d.acceptance_report),home,d.acceptance_report_sha256,env);delete rest.acceptance_report;}
    if(own(d,'delivery')){need(accepted,'UNKNOWN_DELIVERY_PROGRESS');deliveryProgress(d.delivery,home,accepted,env);delete rest.delivery;}
    if(d.type==='plan'&&plain(d.scope)&&own(d.scope,'delivery_contract')){deliveryContract(object(d.scope.delivery_contract),env);rest.scope={...d.scope};delete rest.scope.delivery_contract;}
    unknownReferences(rest);return rest;
  };
  const job=(value,env)=>enter('job',value,()=>{
    need(text(value.id),'TYPED_IDENTITY_CHANGED');const raw=JSON.stringify(value);r.chargeJobs('job:'+hash(raw),Buffer.byteLength(raw,'utf8'));marker(value,'original_execution_assignment');
    if(own(value,'legacy_runtime')){unknownReferences({guard:value.legacy_runtime});need(validateLegacyRuntimeJobShape(value),'PROCESS_TRACKING_REQUIRED');}
    if(own(value,'legacy_runtime')&&collectPhysical){
      const identity={id:value.id,instance_id:value.instance_id??null,host:value.host??null,role:value.role??null,epoch:value.epoch??null};
      const image={id:value.id,identity_sha256:hash(JSON.stringify(identity)),legacy_runtime:copy(value.legacy_runtime)};
      jobImages.set(hash(JSON.stringify(image)),freeze(image));
    }
    if(own(value,'model_process_tracking'))need(validModelProcessTracking(value.model_process_tracking),'MODEL_TRACKING_REQUIRED');
    if(own(value,'operating_admission'))admission(value.operating_admission,env);
    if(own(value,'rejected_output')&&value.rejected_output!==null)rejected(value.rejected_output,value);
    if(own(value,'proposal_reads'))for(const item of array(value.proposal_reads)){
      object(item);need(text(item.id)&&hex(item.sha256)&&own(item,'body'),'SOURCE_REFERENCE');const body=object(snapshot(item.body));need(hash(JSON.stringify(body))===item.sha256,'SOURCE_REFERENCE');sourceValue(item.id,body,env);
    }
    unknownReferences(value,['operating_admission','proposal_reads','rejected_output']);
  });
  const worker=value=>{if(value===null)return;object(value);marker(value,'original_execution');};
  const upgrade=(input,env,{partial=false}={})=>{
    const value=entry(input);return enter('upgrade',value,()=>{
      if(!partial||own(value,'id'))need(text(value.id),'TYPED_IDENTITY_CHANGED');
      marker(value,'original_execution_origin');marker(value,'original_execution_assignment');
      need(!own(value,'workers'),'UNKNOWN_UPGRADE_SHAPE');
      if(own(value,'worker'))worker(value.worker);
      if(own(value,'continuations'))for(const continuation of array(value.continuations)){object(continuation);need(own(continuation,'previous_worker'),'TYPED_BODY_REQUIRED');worker(continuation.previous_worker);}
      if(own(value,'steps'))for(const step of array(value.steps)){object(step);marker(step,'original_execution');}
      if(own(value,'checkpoint')){
        const checkpoint=object(snapshot(value.checkpoint,{company:true}));need(hex(value.checkpoint_sha256)&&hash(JSON.stringify(checkpoint))===value.checkpoint_sha256,'SNAPSHOT_CHANGED');company(checkpoint,'checkpoint',env);
      }
      if(own(value,'operating_input'))contextOperatingUpgradeInput(value,env);
      unknownReferences(value,['checkpoint','operating_input']);
    });
  };
  const history=(value,env)=>{const ids=new Set();for(const item of array(value)){const u=entry(item);need(text(u.id)&&!ids.has(u.id),'TYPED_IDENTITY_CHANGED');ids.add(u.id);upgrade(u,env);}};
  const census=(input,outer)=>{
    const list=array(Array.isArray(input)?input:snapshot(input)),env={records:{}};const all=[],ids=new Set();
    for(const item of list){need(closed(item,['source','envelope'])&&plain(item.source)&&text(item.source.id),'SOURCE_REFERENCE');const body=object(snapshot(item.envelope,{job:item.source.id.startsWith('job:')}));ref(body,item.source);need(!ids.has(item.source.id),'SOURCE_REFERENCE');ids.add(item.source.id);all.push([item.source.id,body]);
      if(!item.source.id.startsWith('job:')&&!item.source.id.startsWith('upgrade:'))Object.defineProperty(env.records,item.source.id,{value:body,enumerable:true});}
    for(const [id,body]of all)sourceValue(id,body,env);return env;
  };
  const intake=(input,baseline,current,expectedCut)=>{
    const value=object(snapshot(input));
    return inspectFrozenLegacyIntakeFrom(r.db,{intake:value,baseline,current,expectedCut},{readValue:r.read,visitState:value=>company(value),chargeWork:r.chargeWork,assertCurrent:()=>r.check(()=>undefined)});
  };
  const controls=(value,env)=>{
    object(value);need(text(value.company_id),'UNKNOWN_OPERATING_SNAPSHOT');
    if(own(value,'extensions'))marker(object(value.extensions),'original_execution_origin');
    if(own(value,'upgrade')&&value.upgrade!==null)upgrade(value.upgrade,env);
    unknownReferences(value,['upgrade']);
  };
  const operatingEvidence=(value,env)=>{
    need(closed(value,['accepted_semantics','home_sources','sources','classifications']),'UNKNOWN_OPERATING_EVIDENCE');
    for(const source of array(value.sources)){
      if(own(object(source),'value')){need(closed(source,['source','value']),'UNKNOWN_OPERATING_EVIDENCE');const body=object(source.value);ref(body,source.source);sourceValue(source.source.id,body,env);}
      else need(closed(source,['source','accepted_original'])&&source.accepted_original===true,'UNKNOWN_OPERATING_EVIDENCE');
      unknownReferences(source,['value']);
    }
    for(const item of array(value.accepted_semantics)){
      object(item);need(Object.keys(item).every(key=>['source','classification','corpus_integration','source_mappings','source_set','judgments','resolved_originals','coverage','review','job','counterparts','producer_refs','historical_producers','author_identities','exact_originals','retrieval'].includes(key))&&plain(item.source)&&plain(item.classification)&&Array.isArray(item.historical_producers),'UNKNOWN_OPERATING_EVIDENCE');
      if(own(item,'review')||own(item,'job')){
        const review=object(item.review),reviewJob=object(item.job);ref(review,item.classification.review);need(review.id===item.classification.review.id&&review.job_id===reviewJob.id&&reviewJob.artifact_id===review.id,'OPERATING_EVIDENCE_CHANGED');record(review,env);job(reviewJob,env);
      }
      if(own(item,'judgments'))for(const judgment of array(item.judgments)){
        need(closed(judgment,['review','job','target','phase','result'])&&plain(judgment.review)&&plain(judgment.target),'UNKNOWN_OPERATING_EVIDENCE');
        const reviewJob=object(judgment.job);need(reviewJob.artifact_id===judgment.review.id&&reviewJob.review_of?.id===judgment.target.id,'OPERATING_EVIDENCE_CHANGED');job(reviewJob,env);unknownReferences(judgment,['job']);
      }
      for(const producer of item.historical_producers){
        need(closed(producer,['source','envelope','company_sha256'])&&hex(producer.company_sha256),'UNKNOWN_OPERATING_EVIDENCE');const body=object(snapshot(producer.envelope));ref(body,producer.source);
        const key=hash(JSON.stringify([producer.company_sha256,producer.source])),prior=historicalProducers.get(key);r.chargeWork((prior?.captures?.size??0)+(contextCapture?.size??0)+1);
        const captures=new Set([...(prior?.captures??[]),...(contextCapture??[])]),canonicalCapture=prior?.canonicalCapture??new Map();
        need(!prior||same(prior.body,body),'OPERATING_EVIDENCE_CHANGED');
        // A collector may first discover this producer after finish() already
        // traversed it. Forward its immutable typed closure immediately, and
        // retain the edge for transitive producers resolved later in the pass.
        for(const captured of captures)contextMerge(captured,canonicalCapture);
        historicalProducers.set(key,{...producer,body,captures:captures.size?captures:null,canonicalCapture});
      }
      unknownReferences(item,['review','job','judgments','historical_producers']);
    }
    unknownReferences(value,['accepted_semantics','sources']);
  };
  const operating=(input,env)=>{
    const value=object(snapshot(input));return enter('operating',value,()=>{
      need(value.protocol==='operating-state-v1'&&own(value,'census')&&own(value,'preservation')&&own(value,'delta'),'UNKNOWN_OPERATING_SNAPSHOT');
      const ownEnv=census(value.census,env);census(value.home_envelopes,ownEnv);
      const preservation=object(snapshot(value.preservation));need(own(preservation,'census'),'UNKNOWN_OPERATING_SNAPSHOT');const preservationEnv=census(preservation.census,ownEnv);
      if(own(preservation,'evidence'))operatingEvidence(object(preservation.evidence),preservationEnv);
      controls(value.controls,ownEnv);controls(preservation.controls,ownEnv);
      let previous=null;
      if(value.previous_index!==null){previous=object(snapshot(value.previous_index));need(closed(previous,['protocol','version','plan','review','receipts','accepted_snapshot','valid_until','at'])&&previous.protocol==='operating-state-v1'&&previous.version===1&&plain(previous.accepted_snapshot)&&own(previous.accepted_snapshot,'intake_baseline'),'UNKNOWN_OPERATING_SNAPSHOT');}
      need(value.base===(previous?hash(JSON.stringify(previous)):null),'UNKNOWN_OPERATING_SNAPSHOT');
      intake(value.delta,previous?previous.accepted_snapshot.intake_baseline:value.intake_baseline,value.intake_baseline,value.input_cut);
      if(value.previous!==null){const previous=object(snapshot(value.previous));need(own(previous,'homes'),'UNKNOWN_OPERATING_SNAPSHOT');census(previous.homes,ownEnv);controls(previous.controls,ownEnv);unknownReferences(previous,['homes','controls']);}
      if(previous!==null)operatingIndex(previous,ownEnv);
      unknownReferences(value,['census','preservation','delta','previous_index','home_envelopes','previous','controls']);unknownReferences(preservation,['census','controls','evidence']);
    });
  };
  const operatingIndex=(value,env)=>{
    need(closed(value,['protocol','version','plan','review','receipts','accepted_snapshot','valid_until','at'])&&value.protocol==='operating-state-v1'&&value.version===1&&Array.isArray(value.receipts),'UNKNOWN_OPERATING_SNAPSHOT');
    operating(value.accepted_snapshot,env);unknownReferences(value,['accepted_snapshot']);
  };
  const subject=(input,env)=>{
    let value=object(snapshot(input));
    if(own(value,'retained_handover_subject')){
      need(closed(value,['retained_handover_subject'])&&closed(value.retained_handover_subject,['record_id','sha256']),'SNAPSHOT_REFERENCE');
      const locator=value.retained_handover_subject;need(text(locator.record_id)&&hex(locator.sha256),'SNAPSHOT_REFERENCE');
      const source=env.records&&env.records[locator.record_id];need(source,'SNAPSHOT_MISSING');const original=entry(source,locator.record_id);
      need(plain(original.handover)&&original.handover.subject_sha256===locator.sha256,'SNAPSHOT_CHANGED');value=object(snapshot(original.handover.subject));need(hash(JSON.stringify(value))===locator.sha256,'SNAPSHOT_CHANGED');contextRememberLocator({retained_handover_subject:locator});
    }
    return enter('subject',value,()=>{
      need(text(value.company_id)&&plain(value.owner)&&plain(value.records)&&plain(value.jobs)&&Array.isArray(value.notices)&&Array.isArray(value.messages),'UNKNOWN_HANDOVER_SUBJECT');
      need(companyId===null||value.company_id===companyId,'TYPED_IDENTITY_CHANGED');historicalCompanies.set(hash(JSON.stringify(value)),value);
      marker(value,'original_execution_origin');if(own(value,'state_extensions'))marker(object(value.state_extensions),'original_execution_origin');
      const inner={records:value.records};records(value.records,inner);jobs(value.jobs,inner);
      if(value.upgrade!==null&&value.upgrade!==undefined)upgrade(value.upgrade,inner);if(own(value,'upgrade_history'))history(value.upgrade_history,inner);
      if(own(value,'operating_checkpoint')){
        const checkpoint=object(value.operating_checkpoint);need(checkpoint.protocol==='operating-state-v1'&&Array.isArray(checkpoint.homes),'UNKNOWN_HANDOVER_SUBJECT');
        controls(checkpoint.controls,inner);
        for(const home of checkpoint.homes){need(plain(home)&&plain(home.source)&&plain(home.value),'SOURCE_REFERENCE');ref(home.value,home.source);sourceValue(home.source.id,home.value,inner);}
        unknownReferences(checkpoint,['homes','controls']);
        for(const a of Object.values(object(value.proposal_admissions)))admission(a,inner);
        for(const list of Object.values(object(value.proposal_delivered_sources)))for(const item of array(list)){need(closed(item,['id','sha256','value'])&&text(item.id)&&hex(item.sha256)&&plain(item.value)&&hash(JSON.stringify(item.value))===item.sha256,'SOURCE_REFERENCE');sourceValue(item.id,item.value,inner);}
      }
      unknownReferences(value,['records','jobs','upgrade','upgrade_history','operating_checkpoint','proposal_admissions','proposal_delivered_sources']);
    });
  };
  function comparisonRecord(value,env,test){
    const key=(test?'test:':'wire:')+hash(JSON.stringify(value));if(comparisonSeen.has(key))return;
    const validate=test?validateStoredComparisonTestFrom:validateStoredComparisonEvidenceFrom;
    // Fixed Source validators use this classifier's genuine original DB/loan.
    // DATA markers, caller predicates and inferred object paths grant nothing.
    const proof=r.check(()=>validate(r.db,{records:env?.records??{}},value));
    need(proof.recordSha===hash(JSON.stringify(value))&&proof.job_id===value.job_id,'COMPARISON_RECORD_CHANGED');
    comparisonSeen.add(key);
    if(!test){
      need(proof.invocation_id===value.runtime_wire_evidence.binding.invocation_id,'COMPARISON_INVOCATION_CHANGED');
      for(const reference of array(proof.references)){
        need(closed(reference,['sha256','bytes','encoding','object_name'])&&hex(reference.sha256)&&nat(reference.bytes)&&reference.bytes<=9975424&&['utf8-scalar-text-v1','js-utf16le-code-units-v1','closed-json-utf8-v1'].includes(reference.encoding)&&reference.object_name==='objects/'+reference.sha256+'.blob','COMPARISON_BLOB_REFERENCE');
        r.chargeWork(1);const name=reference.encoding+':'+reference.sha256,previous=comparisonBlobs.get(name);
        need(!previous||same(previous.reference,reference),'COMPARISON_BLOB_COLLISION');
        comparisonBlobs.set(name,{reference:copy(reference),record_sha256s:[...new Set([...(previous?.record_sha256s??[]),proof.recordSha])],physical_objects_verified:proof.physical_objects_verified===true&&(!previous||previous.physical_objects_verified)});
      }
    }
    const references=array(test?proof.references:proof.record_references);
    const required=test?[value.runtime_candidate_test_guard.candidate,value.runtime_candidate_test_guard.producer_evidence_record,...(value.runtime_candidate_test_guard.actual_receipt?[value.runtime_candidate_test_guard.actual_receipt]:[])]:[
      {id:value.runtime_wire_evidence.binding.plan.id,revision:value.runtime_wire_evidence.binding.plan.revision,sha256:value.runtime_wire_evidence.binding.plan.record_sha256},...(value.runtime_wire_evidence.binding.job.review_of?[value.runtime_wire_evidence.binding.job.review_of]:[])];
    need(required.every(reference=>references.some(actual=>same(actual,reference))),'COMPARISON_ORIGINAL_REFERENCE_MISSING');
    for(const reference of references){
      need(closed(reference,['id','revision','sha256'])&&text(reference.id)&&Number.isSafeInteger(reference.revision)&&reference.revision>=1&&hex(reference.sha256),'COMPARISON_RECORD_REFERENCE');r.chargeWork(1);
      const current=env?.records?.[reference.id];let body;
      // A pending original may not yet be in immutable_values. Only the fixed
      // owning validator can establish that exact next-state exception.
      if(current&&current.revision===reference.revision&&hash(JSON.stringify(current))===reference.sha256)body=current;
      else{r.read(reference.sha256);body=r.decoded(reference.sha256);}
      need(body&&body.id===reference.id&&body.revision===reference.revision&&hash(JSON.stringify(body))===reference.sha256,'COMPARISON_ORIGINAL_CHANGED');record(body,env);
    }
    for(const item of array(proof.history)){
      need(text(item.id)&&item.id===value.id&&Number.isSafeInteger(item.revision)&&item.revision>=1&&item.revision<=value.revision&&hex(item.sha256)&&nat(item.bytes)&&item.bytes<=32768,'COMPARISON_HEADER_HISTORY');r.chargeWork(1);
      if(item.sha256===proof.recordSha){need(item.bytes===Buffer.byteLength(JSON.stringify(value)),'COMPARISON_HEADER_HISTORY');continue;}
      const raw=r.read(item.sha256,{max_bytes:32768}),body=r.decoded(item.sha256);need(Buffer.byteLength(raw)===item.bytes&&body.id===item.id&&body.revision===item.revision,'COMPARISON_HEADER_HISTORY');record(body,env);
    }
  }
  const record=(value,env)=>enter('record',value,()=>{
    need(text(value.id),'TYPED_IDENTITY_CHANGED');
    if(own(value,'runtime_wire_evidence'))comparisonRecord(value,env,false);
    if(own(value,'runtime_candidate_test_guard'))comparisonRecord(value,env,true);
    if(own(value,'operating_plan')){const plan=object(value.operating_plan);need(closed(plan,['protocol','version','snapshot','maintenance','source_instruction','valid_until'])&&plan.protocol==='operating-state-v1'&&plan.version===1,'UNKNOWN_OPERATING_SNAPSHOT');operating(plan.snapshot,env);}
    if(own(value,'handover')){const h=object(value.handover);
      if(own(h,'subject')){need(value.kind==='artifact'&&value.author_role==='runner'&&hex(h.subject_sha256)&&Array.isArray(h.input_refs)&&plain(h.incoming_owner)&&h.incoming_owner.session_id===value.author_instance,'UNKNOWN_HANDOVER_SUBJECT');
        const s=object(snapshot(h.subject));if(!own(s,'retained_handover_subject'))need(hash(JSON.stringify(s))===h.subject_sha256,'SNAPSHOT_CHANGED');subject(s,env);}
      unknownReferences(h,['subject']);
    }
    if(own(value,'development'))developmentSlots(value,env);
    if(['context_partition_plan','context_originals','context_units'].some(key=>own(value,key))){need(['context_partition_plan','context_originals','context_units'].every(key=>own(value,key)),'UNKNOWN_CONTEXT_TREE');contextTreeRecord(value,env);}
    if(own(value,'scoped_context_plan'))contextScopedPlan(value,env);
    if(own(value,'scoped_context_target'))contextScopedTarget(value.scoped_context_target,env);
    unknownReferences(value,['operating_plan','handover','development','context_partition_plan','context_originals','context_units','scoped_context_plan','scoped_context_target','runtime_wire_evidence','runtime_candidate_test_guard']);
  });
  const company=(value,kind='company',outer=null)=>enter(kind,value,()=>{
    need(text(value.id)&&(companyId===null||value.id===companyId),'TYPED_IDENTITY_CHANGED');if(kind==='company'){need(nat(value.revision),'REVISION_REQUIRED');companyId=value.id;}marker(value,'original_execution_origin');
    if(kind==='checkpoint')historicalCompanies.set(hash(JSON.stringify(value)),value);
    need(plain(value.records)&&plain(value.jobs),'TYPED_BODY_REQUIRED');const env={records:value.records};records(value.records,env);jobs(value.jobs,env);
    if(own(value,'upgrade')&&value.upgrade!==null)upgrade(value.upgrade,env);if(own(value,'upgrade_history'))history(value.upgrade_history,env);
    if(own(value,'operating_state'))operatingIndex(object(value.operating_state),env);
    unknownReferences(value,['records','jobs','upgrade','upgrade_history','operating_state']);
  });
  // Closed Source-owned context capsules. Presentation handles can only refer
  // to a separately traversed typed closure, never enroll their own roots.
  let contextCapture=null;
  const contextChecks=[];
  const contextForwards=new WeakMap();
  function contextRecord(closure,key,value){
    const pending=[closure],seen=new Set();
    while(pending.length){const target=pending.pop();if(seen.has(target))continue;seen.add(target);r.chargeWork(1);target.set(key,copy(value));for(const next of contextForwards.get(target)??[])pending.push(next);}
  }
  function contextUsing(captures,operation){
    const previous=contextCapture;
    contextCapture=captures?new Set([...(previous??[]),...captures]):previous;
    try{return operation();}finally{contextCapture=previous;}
  }
  function contextRememberSnapshot(value){
    if(contextCapture)for(const captured of contextCapture)contextRecord(captured,'snapshot:'+value.immutable_snapshot.sha256,value);
  }
  function contextRememberLocator(value){
    if(contextCapture)for(const captured of contextCapture)contextRecord(captured,'locator:'+JSON.stringify(value.retained_handover_subject),value);
  }
  function contextRead(value,options){
    need(closed(value,['immutable_snapshot']),'SNAPSHOT_REFERENCE');
    const previous=contextCapture;contextCapture=null;
    try{return snapshot(value,options);}finally{contextCapture=previous;}
  }
  function contextSemantic(operation){
    const closure=new Map();contextUsing(new Set([closure]),operation);return closure;
  }
  function contextMerge(target,source){
    if(target===source)return;let targets=contextForwards.get(source);if(!targets){targets=new Set();contextForwards.set(source,targets);}targets.add(target);
    for(const [key,value]of source)contextRecord(target,key,value);
  }
  function contextAllow(closure,wrapper){
    need(closed(wrapper,['immutable_snapshot'])&&plain(wrapper.immutable_snapshot),'SNAPSHOT_REFERENCE');
    contextRecord(closure,'snapshot:'+wrapper.immutable_snapshot.sha256,wrapper);contextRememberSnapshot(wrapper);
  }
  function contextFinish(){for(let i=0;i<contextChecks.length;i++){r.chargeWork(1);contextChecks[i]();}contextChecks.length=0;}
  // Only these producer-owned presentation frames may contain already validated
  // references. This checks metadata/bytes without conferring a new semantic role.
  // It never parses STRING contents or enrolls a presentation reference itself.
  function contextPresentation(value,closure){
    const pending=[[value,0]];
    while(pending.length){
      const [item,level]=pending.pop();r.chargeWork(1);need(level<=MAX_DEPTH,'SNAPSHOT_DEPTH');
      if(!item||typeof item!=='object')continue;
      if(Array.isArray(item))array(item);else object(item);
      if(own(item,'immutable_snapshot')){
        const known=closure.get('snapshot:'+item.immutable_snapshot?.sha256);
        need(known&&same(known,item),'CONTEXT_REFERENCE_ROLE_REQUIRED');contextRead(item);continue;
      }
      if(own(item,'immutable_entry')){
        need(text(item.id)&&Object.keys(item).every(key=>['id','revision','immutable_entry'].includes(key)),'SNAPSHOT_REFERENCE');
        const original=object(contextRead(item.immutable_entry));
        need((original.id===undefined||original.id===item.id)&&own(original,'revision')===own(item,'revision')&&original.revision===item.revision,'SNAPSHOT_CHANGED');
        pending.push([item.immutable_entry,level+1]);continue;
      }
      if(own(item,'retained_handover_subject')){
        need(same(closure.get('locator:'+JSON.stringify(item.retained_handover_subject)),item),'CONTEXT_REFERENCE_ROLE_REQUIRED');continue;
      }
      for(const child of Object.values(item))pending.push([child,level+1]);
    }
  }
  function contextSource(reference,value,env,{noticeOriginal=false}={}){
    object(value);
    const notice=reference.id.startsWith('notice:')&&value.id===reference.id.slice(7);
    const projected=notice&&noticeOriginal?Object.fromEntries(Object.entries(value).filter(([key])=>!['deliveries','seen_at'].includes(key))):value;
    ref(projected,reference);
    if(notice){need(!env?.records||!own(env.records,reference.id),'CONTEXT_NOTICE_COLLISION');unknownReferences(value);}
    else sourceValue(reference.id,value,env);
  }
  function contextReferencedRecord(reference,env){
    need(plain(reference)&&env?.records&&own(env.records,reference.id),'CONTEXT_RECORD_REQUIRED');
    const value=entry(env.records[reference.id],reference.id);ref(value,reference);return value;
  }
  function contextDependencies(values,closure,{audit=false}={}){
    for(const item of array(values)){
      if(audit)need(closed(item,['value','staged'])&&typeof item.staged==='boolean','CONTEXT_DEPENDENCY_REQUIRED');
      const wrapper=audit?item.value:item;
      need(plain(wrapper)&&plain(wrapper.immutable_snapshot),'SNAPSHOT_REFERENCE');
      need(same(closure.get('snapshot:'+wrapper.immutable_snapshot.sha256),wrapper),'CONTEXT_REFERENCE_ROLE_REQUIRED');
      contextRead(wrapper);
    }
  }
  function contextTreeRecord(value,env){
    const plan=object(value.context_partition_plan);
    need(plan.protocol==='soloco-context-tree-v1'&&[1,2].includes(plan.version)&&plan.partitioner===(plan.version===1?'framed-byte-tree-v1':'framed-byte-tree-v2'),'UNKNOWN_CONTEXT_TREE');
    if(plan.version===2)need(plan.profile==='large-v2'&&same(plan.limits,{unit_bytes:32000,input_bytes:224000,output_bytes:48000,output_wire_bytes:128000,overlap:128,fanout:4}),'UNKNOWN_CONTEXT_TREE');
    const originals=object(value.context_originals),capsule=object(contextRead(value.context_units));
    need(closed(originals,['source','subject','inputs'])&&closed(capsule,['plan','units','dependencies','identities','legacy']),'UNKNOWN_CONTEXT_TREE');
    need(same(contextRead(capsule.plan),plan)&&same(contextRead(originals.subject),plan.reviewed_subject),'CONTEXT_TREE_CHANGED');
    const descriptor=object(plan.reviewed_subject);need(closed(descriptor,['state_extensions','authority_scope','company','records','notices','messages'])&&closed(descriptor.company,['id','name','owner','governance','cos_instructions','team_sha256','roles','idea','mode','phase','paused'])&&(companyId===null||descriptor.company.id===companyId),'UNKNOWN_CONTEXT_TREE');marker(object(descriptor.state_extensions),'original_execution_origin');
    const sourceIsJob=plan.source.id.startsWith('job:')&&!(env?.records&&own(env.records,plan.source.id));
    const closure=new Map(),source=object(contextRead(originals.source,{job:sourceIsJob}));
    contextMerge(closure,contextSemantic(()=>contextSource(plan.source,source,env)));contextAllow(closure,originals.source);
    const inputs=array(originals.inputs),seen=new Set();
    for(const input of inputs){
      need(closed(input,['source','snapshot'])&&!seen.has(input.source?.id),'CONTEXT_TREE_CHANGED');seen.add(input.source.id);
      const jobRole=input.source.id.startsWith('job:')&&!(env?.records&&own(env.records,input.source.id));
      const body=object(contextRead(input.snapshot,{job:jobRole}));contextMerge(closure,contextSemantic(()=>contextSource(input.source,body,env)));contextAllow(closure,input.snapshot);
    }
    need(seen.has(plan.source.id),'CONTEXT_TREE_CHANGED');
    for(const item of array(plan.reviewed_subject.records))for(const reference of [item.ref,item.producer].filter(Boolean))need(inputs.some(input=>same(input.source,reference)),'CONTEXT_TREE_CHANGED');
    if(plan.producer)need(inputs.some(input=>same(input.source,plan.producer)),'CONTEXT_TREE_CHANGED');
    const units=array(capsule.units),headers=array(plan.units);need(units.length===headers.length&&hash(JSON.stringify(headers))===plan.coverage_sha256,'CONTEXT_TREE_CHANGED');
    for(let i=0;i<units.length;i++){
      const unit=units[i],header=headers[i];need(closed(unit,['id','snapshot'])&&closed(header,['id','domain','sha256','bytes'])&&unit.id===header.id,'CONTEXT_TREE_CHANGED');
      need(nat(header.bytes)&&header.bytes<=(plan.version===2?32000:10000)&&plain(unit.snapshot?.immutable_snapshot)&&unit.snapshot.immutable_snapshot.characters<=header.bytes,'CONTEXT_TREE_CHANGED');
      const body=object(contextRead(unit.snapshot,{max_bytes:header.bytes})),raw=JSON.stringify(body);
      need(body.id===header.id&&body.domain===header.domain&&hash(raw)===header.sha256&&Buffer.byteLength(raw,'utf8')===header.bytes,'CONTEXT_TREE_CHANGED');
      contextAllow(closure,unit.snapshot);contextChecks.push(()=>contextPresentation(body,closure));
    }
    for(const reference of array(capsule.legacy)){const body=contextReferencedRecord(reference,env);contextMerge(closure,contextSemantic(()=>record(body,env)));}
    contextAllow(closure,capsule.plan);contextAllow(closure,originals.subject);contextAllow(closure,value.context_units);
    need(array(capsule.identities).every(item=>typeof item==='string'),'UNKNOWN_CONTEXT_TREE');
    contextChecks.push(()=>{contextDependencies(capsule.dependencies,closure);contextPresentation(plan.reviewed_subject,closure);});
    unknownReferences(value,['context_partition_plan','context_originals','context_units']);unknownReferences(plan);unknownReferences(capsule,['plan','units','dependencies']);
  }
  // Bounds are computed for the EXPANDED JSON representation of every definition
  // before allocating decoded arrays/objects or stringify(json-text-string).
  // Dynamic programming saturates at shared caps; memoization does not erase the
  // cost of repeated physical occurrences. STRING values never become typed roots.
  function contextDecodeGraph(definitions,{companyRoot=null,jobRoot=null}={}){
    array(definitions);need(definitions.length<=MAX_ROWS,'INVENTORY_CAPACITY');
    const metrics=new Map(),active=new Set(),decoded=new Map();let totalBytes=0,totalWork=0;
    const metric=raw=>{let quotes=0,slashes=0;for(let i=0;i<raw.length;i++){if(raw[i]==='"')quotes++;else if(raw[i]==='\\')slashes++;}return {characters:raw.length,bytes:Buffer.byteLength(raw,'utf8'),quotes,slashes,work:1,depth:1};};
    const plus=(a,b)=>{for(const key of ['characters','bytes','quotes','slashes','work']){a[key]+=b[key];need(nat(a[key])&&a[key]<=(key==='work'?MAX_WORK:MAX_BYTES),'CONTEXT_EXPANSION_CAPACITY');}a.depth=Math.max(a.depth,b.depth+1);need(a.depth<=MAX_DEPTH,'SNAPSHOT_DEPTH');};
    const visit=index=>{
      need(nat(index)&&index<definitions.length,'CONTEXT_GRAPH_REQUIRED');if(metrics.has(index))return metrics.get(index);
      need(!active.has(index)&&active.size<MAX_DEPTH,'CONTEXT_GRAPH_REQUIRED');active.add(index);r.chargeWork(1);
      const d=array(definitions[index]);let m;
      if(d[0]==='null'&&d.length===1)m=metric('null');
      else if(['string','number','boolean'].includes(d[0])&&d.length===2&&typeof d[1]===d[0]){need(d[0]!=='number'||Number.isFinite(d[1])&&!Object.is(d[1],-0),'CONTEXT_GRAPH_REQUIRED');m=metric(JSON.stringify(d[1]));}
      else if(d[0]==='array'&&d.length===2){
        const children=array(d[1]);m=metric('[]');m.characters+=Math.max(0,children.length-1);m.bytes+=Math.max(0,children.length-1);
        for(const child of children){r.chargeWork(1);plus(m,visit(child));}
      }else if(d[0]==='object'&&d.length===2){
        const children=array(d[1]),keys=new Set();m=metric('{}');m.characters+=Math.max(0,children.length-1);m.bytes+=Math.max(0,children.length-1);
        for(const edge of children){r.chargeWork(1);array(edge);need(edge.length===2&&typeof edge[0]==='string'&&!keys.has(edge[0]),'CONTEXT_GRAPH_REQUIRED');keys.add(edge[0]);const key=metric(JSON.stringify(edge[0])+':');key.work=0;key.depth=0;plus(m,key);plus(m,visit(edge[1]));}
      }else if(d[0]==='json-text-string'&&(d.length===2||d.length===3)){
        const child=visit(d[1]);
        if(d.length===3){need(typeof d[2]==='string','CONTEXT_GRAPH_REQUIRED');m=metric(JSON.stringify(d[2]));m.work+=child.work;m.depth=child.depth+1;}
        else m={characters:child.characters+child.quotes+child.slashes+2,bytes:child.bytes+child.quotes+child.slashes+2,quotes:child.quotes+2,slashes:child.slashes*2+child.quotes,work:child.work+1,depth:child.depth+1};
      }else need(false,'CONTEXT_GRAPH_REQUIRED');
      need(m.characters<=MAX_BYTES&&m.bytes<=MAX_BYTES&&m.work<=MAX_WORK&&m.depth<=MAX_DEPTH,'CONTEXT_EXPANSION_CAPACITY');
      metrics.set(index,m);active.delete(index);return m;
    };
    for(let i=0;i<definitions.length;i++){const m=visit(i);totalBytes+=m.bytes;totalWork+=m.work;need(totalBytes<=MAX_BYTES&&totalWork<=MAX_WORK,'CONTEXT_EXPANSION_CAPACITY');}
    // These roles come from the fixed outer capsule slot, never decoded DATA.
    const field=(index,key)=>{const d=definitions[index];need(d?.[0]==='object','CONTEXT_GRAPH_REQUIRED');const edge=d[1].find(edge=>edge[0]===key);need(edge,'CONTEXT_GRAPH_REQUIRED');return edge[1];};
    if(companyRoot!==null){const jobs=field(companyRoot,'jobs');need(metrics.get(jobs).bytes<=MAX_JOB_BYTES,'JOB_INVENTORY_CAPACITY');}
    if(jobRoot!==null){const root=field(field(jobRoot.state_root,'records'),jobRoot.id);need(metrics.get(root).bytes<=MAX_JOB_BYTES,'JOB_INVENTORY_CAPACITY');}
    r.charge(0,totalBytes);r.chargeWork(totalWork);
    const tokens=raw=>{
      // Equality with the canonical ordered token stream proves whole grammar;
      // never JSON.parse untrusted d[2] into a second uncharged object graph.
      const result=[],token=/[ \t\r\n]+|"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null|[{}\[\],:]/y;let offset=0;
      while(offset<raw.length){r.chargeWork(1);token.lastIndex=offset;const match=token.exec(raw);need(match,'CONTEXT_GRAPH_REQUIRED');const value=match[0];offset=token.lastIndex;if(!/^[ \t\r\n]/.test(value))result.push(value[0]==='"'?['string',JSON.parse(value)]:['token',value]);}return result;
    };
    const get=index=>{
      if(decoded.has(index))return decoded.get(index);const d=definitions[index];let value;
      if(d[0]==='null')value=null;
      else if(d[0]==='array')value=d[1].map(get);
      else if(d[0]==='object'){value=Object.create(null);for(const [key,child]of d[1])Object.defineProperty(value,key,{value:get(child),enumerable:true,writable:true,configurable:true});need(same(Object.keys(value),d[1].map(edge=>edge[0])),'CONTEXT_GRAPH_REQUIRED');}
      else if(d[0]==='json-text-string'){const canonical=JSON.stringify(get(d[1]));value=d.length===2?canonical:d[2];need(same(tokens(value),tokens(canonical)),'CONTEXT_GRAPH_REQUIRED');}
      else value=d[1];decoded.set(index,value);return value;
    };
    for(let i=0;i<definitions.length;i++)get(i);
    return index=>{need(metrics.has(index),'CONTEXT_GRAPH_REQUIRED');return get(index);};
  }
  function contextCoherentMaterial(material,env,{source=null,original=null,corpus=false}={}){
    object(material);
    const keys=['protocol','version','max_packet_bytes','baseline','definitions','originals','documents','collection_indexes','groups','occurrences','snapshot_inbound','sources','semantic_acceptance','measurements','adapter','plan_sha256',...(own(material,'notice_sources')?['notice_sources']:[])];
    need(closed(material,keys)&&material.protocol==='legacy-coherent-extraction-v1'&&material.version===1&&material.semantic_acceptance===false&&(!own(material,'notice_sources')||material.notice_sources==='canonical-notice-v1'),'UNKNOWN_COHERENT_CONTEXT');
    const {plan_sha256,...body}=material;need(hex(plan_sha256)&&hash(JSON.stringify(body))===plan_sha256,'CONTEXT_GRAPH_CHANGED');
    need(closed(material.baseline,['state_root','state_sha256','membership_sha256','owner']),'CONTEXT_GRAPH_CHANGED');
    const roots=[material.baseline.state_root],documents=[{kind:'state',root:material.baseline.state_root}];
    for(const item of array(material.originals)){
      need(closed(item,['reference','raw_root','typed_root'])&&plain(item.reference)&&plain(item.reference.immutable_snapshot)&&hex(item.reference.immutable_snapshot.sha256),'CONTEXT_GRAPH_CHANGED');
      roots.push(item.raw_root,item.typed_root);documents.push({kind:'snapshot-original',sha256:item.reference.immutable_snapshot.sha256,root:item.typed_root});
    }
    need(same(material.documents,documents),'CONTEXT_GRAPH_CHANGED');
    const jobRole=!corpus&&source.id.startsWith('job:')&&original.id===source.id.slice(4);
    const get=contextDecodeGraph(material.definitions,{companyRoot:corpus?material.baseline.state_root:null,jobRoot:jobRole?{state_root:material.baseline.state_root,id:original.id}:null}),reachable=new Set(),pending=[...roots];
    while(pending.length){const index=pending.pop();if(reachable.has(index))continue;r.chargeWork(1);get(index);reachable.add(index);const d=material.definitions[index];if(d[0]==='object')for(const edge of d[1])pending.push(edge[1]);else if(d[0]==='array')for(const child of d[1])pending.push(child);else if(d[0]==='json-text-string')pending.push(d[1]);}
    need(reachable.size===material.definitions.length,'CONTEXT_ORPHAN_GRAPH_REQUIRED');
    const state=object(get(material.baseline.state_root)),closure=new Map();
    need(hash(JSON.stringify(state))===material.baseline.state_sha256,'CONTEXT_GRAPH_CHANGED');
    if(corpus)contextMerge(closure,contextSemantic(()=>company(state)));
    else {
      need(source&&original&&plain(state.records)&&plain(state.jobs)&&Object.keys(state.jobs).length===0,'CONTEXT_GRAPH_CHANGED');
      if(source.id.startsWith('notice:')&&original.id===source.id.slice(7))need(closed(state,['records','jobs','notices'])&&Object.keys(state.records).length===0&&same(state.notices,[original]),'CONTEXT_GRAPH_CHANGED');
      else need(closed(state,['records','jobs'])&&Object.keys(state.records).length===1&&same(state.records[original.id],original),'CONTEXT_GRAPH_CHANGED');
      contextMerge(closure,contextSemantic(()=>contextSource(source,original,env,{noticeOriginal:true})));
    }
    const originals=array(material.originals);
    for(const item of originals){
      need(closed(item,['reference','raw_root','typed_root']),'CONTEXT_GRAPH_CHANGED');const actual=contextRead(item.reference),raw=get(item.raw_root);
      need(typeof raw==='string'&&hash(raw)===item.reference.immutable_snapshot.sha256&&same(actual,get(item.typed_root))&&raw===r.read(item.reference.immutable_snapshot.sha256),'CONTEXT_GRAPH_CHANGED');
      // This reference must already belong to the typed baseline/source closure.
      contextChecks.push(()=>need(same(closure.get('snapshot:'+item.reference.immutable_snapshot.sha256),item.reference),'CONTEXT_REFERENCE_ROLE_REQUIRED'));
    }
    const inner={records:state.records},expected=[];const ptr=key=>String(key).replaceAll('~','~0').replaceAll('/','~1');
    for(const [id,value]of Object.entries(state.records))expected.push({id,location:'/records/'+ptr(id),value:entry(value,id)});
    for(const [id,value]of Object.entries(state.jobs))expected.push({id:'job:'+id,location:'/jobs/'+ptr(id),value:entry(value,id,{job:true})});
    for(const [index,value]of (state.upgrade_history??[]).entries()){const u=entry(value);expected.push({id:'upgrade:'+u.id,location:'/upgrade_history/'+index,value:u});}
    if(state.upgrade){const u=entry(state.upgrade);expected.push({id:'upgrade:'+u.id,location:'/upgrade',value:u});}
    if(material.notice_sources)for(const [index,value]of (state.notices??[]).entries()){need(!own(state.records,'notice:'+value.id),'CONTEXT_NOTICE_COLLISION');expected.push({id:'notice:'+value.id,location:'/notices/'+index,value});}
    need(expected.length===material.sources.length,'CONTEXT_GRAPH_CHANGED');
    for(let i=0;i<expected.length;i++){
      const wanted=expected[i],item=material.sources[i],value=object(get(item.body_root));
      need(closed(item,['source','location','body_root','group_id','producer_validation','receipt_reuse'])&&item.source.id===wanted.id&&item.location===wanted.location&&same(value,wanted.value),'CONTEXT_GRAPH_CHANGED');
      const projected=material.notice_sources&&wanted.location.startsWith('/notices/')?Object.fromEntries(Object.entries(value).filter(([key])=>!['deliveries','seen_at'].includes(key))):value;ref(projected,item.source);
      // sourceRoot deliberately stores a job/upgrade in records under its plain
      // id. Its role was already validated from the outer v.source above.
      if(corpus)contextMerge(closure,contextSemantic(()=>contextSource(item.source,value,inner,{noticeOriginal:true})));
    }
    need(hash(JSON.stringify(material.sources))===material.baseline.membership_sha256,'CONTEXT_GRAPH_CHANGED');
    contextChecks.push(()=>contextPresentation(material,closure));
    return {state,closure,material};
  }
  function contextScopedPlan(value,env){
    const v=object(value.scoped_context_plan);need(v.protocol==='scoped-context-v1'&&v.version===1,'UNKNOWN_SCOPED_CONTEXT');
    const vkeys=['protocol','version','source','extraction_identity','projection_sha256','capsule','units',...(own(v,'partitioner')?['partitioner']:[]),...(v.partitioner==='coherent-corpus-body-v1'?['selected_source_ids',...['home_intake_policy','frozen_intake','batching_policy','incidence_protocol'].filter(key=>own(v,key))]:[])];need(closed(v,vkeys),'UNKNOWN_SCOPED_CONTEXT');
    const c=object(contextRead(v.capsule)),closure=new Map();
    if(v.partitioner==='coherent-corpus-body-v1'){
      need(closed(c,['projection','original','selected_sources','units','producer_closures',...['batching_policy','semantic_partition','incidence','home_intake','frozen_intake'].filter(key=>own(c,key))]),'UNKNOWN_SCOPED_CONTEXT');
      const original=object(contextRead(c.original,{company:true})),material=object(contextRead(c.projection));
      const decoded=contextCoherentMaterial(material,env,{corpus:true});
      need(same(original,decoded.state)&&same(v.selected_source_ids,c.selected_sources)&&v.source.id===c.selected_sources[0]&&same(v.units,c.units)&&hash(JSON.stringify(material))===v.projection_sha256,'SCOPED_CONTEXT_CHANGED');
      contextMerge(closure,decoded.closure);contextAllow(closure,c.original);contextAllow(closure,c.projection);
      for(const id of array(c.selected_sources))need(material.sources.some(item=>item.source.id===id),'SCOPED_CONTEXT_CHANGED');
      const identity={partitioner:'coherent-corpus-body-v1',projection:c.projection,selected_sources:c.selected_sources,units:c.units,producer_closures:c.producer_closures,...Object.fromEntries(['batching_policy','incidence','semantic_partition','home_intake','frozen_intake'].filter(key=>own(c,key)).map(key=>[key,c[key]]))};
      need(hash(JSON.stringify(identity))===v.extraction_identity,'SCOPED_CONTEXT_CHANGED');
      if(c.frozen_intake){
        const d=c.frozen_intake;need(closed(d,['version','parent','parent_capsule','parent_extraction_identity'])&&d.version===1&&v.frozen_intake==='initial-v1'&&c.home_intake,'UNKNOWN_SCOPED_CONTEXT');
        const parent=contextReferencedRecord(d.parent,env),p=parent.scoped_context_plan,prior=object(contextRead(d.parent_capsule));
        need(p?.partitioner==='coherent-corpus-body-v1'&&same(p.capsule,d.parent_capsule)&&p.extraction_identity===d.parent_extraction_identity,'SCOPED_CONTEXT_CHANGED');
        for(const key of ['projection','original','selected_sources','units','producer_closures','batching_policy'])need(same(c[key],prior[key]),'SCOPED_CONTEXT_CHANGED');
        contextMerge(closure,contextSemantic(()=>record(parent,env)));contextAllow(closure,d.parent_capsule);
      }
      if(c.home_intake){need(closed(c.home_intake,['policy','owner','controls_sha256','boundary','baseline'])&&c.home_intake.policy==='initial-proposed-homes-v1','UNKNOWN_SCOPED_CONTEXT');contextMerge(closure,contextSemantic(()=>contextGlobal(c.home_intake.boundary,env,{boundary:true})));}
      contextChecks.push(()=>contextPresentation(c,closure));
    }else{
      const coherent=v.partitioner==='coherent-source-v1';need(v.partitioner===undefined||coherent,'UNKNOWN_SCOPED_CONTEXT');
      need(closed(c,coherent?['original','projection','producer','producer_closure','units']:['original','projection','dependencies','retained','producer','units',...(own(c,'producer_closure')?['producer_closure']:[])]),'UNKNOWN_SCOPED_CONTEXT');
      const jobRole=v.source.id.startsWith('job:')&&!(env?.records&&own(env.records,v.source.id));
      const original=object(contextRead(c.original,{job:jobRole})),projection=contextRead(c.projection);
      contextMerge(closure,contextSemantic(()=>contextSource(v.source,original,env,{noticeOriginal:true})));contextAllow(closure,c.original);
      need(hash(JSON.stringify(projection))===v.projection_sha256&&same(c.units,v.units),'SCOPED_CONTEXT_CHANGED');contextAllow(closure,c.projection);
      if(coherent){
        const decoded=contextCoherentMaterial(object(projection),env,{source:v.source,original});contextMerge(closure,decoded.closure);
        const units=projection.occurrences.map(o=>({id:o.id,group_id:o.group_id,body_root:projection.groups.find(g=>g.id===o.group_id)?.body_root}));
        need(same(units,v.units)&&hash(JSON.stringify({protocol:'scoped-context-v1',partitioner:'coherent-source-v1',source:v.source,producer_closure:c.producer_closure,plan_sha256:projection.plan_sha256,units}))===v.extraction_identity,'SCOPED_CONTEXT_CHANGED');
      }else{
        need(hash(JSON.stringify({protocol:'scoped-context-v1',source:v.source,producer:c.producer,...(c.producer_closure?.length?{producer_closure:c.producer_closure}:{}),projection_sha256:v.projection_sha256,partitioner:'lossless-ranges-v1',units:c.units}))===v.extraction_identity,'SCOPED_CONTEXT_CHANGED');
        for(const reference of array(c.retained)){const body=contextReferencedRecord(reference,env);contextMerge(closure,contextSemantic(()=>record(body,env)));}
        contextChecks.push(()=>contextDependencies(c.dependencies,closure,{audit:true}));
      }
      contextChecks.push(()=>contextPresentation(projection,closure));
    }
    contextAllow(closure,v.capsule);contextChecks.push(()=>{contextPresentation(c,closure);contextPresentation(v,closure);});
  }
  function contextGlobal(value,env,{boundary=false}={}){
    object(value);need(text(value.company_id)&&(companyId===null||value.company_id===companyId),'TYPED_IDENTITY_CHANGED');
    const keys=['company_id','name','idea','mode','phase','governance','cos_instructions','roles','team_sha256','owner_authority','extensions','unknown_outcomes','notices','messages',...(boundary?[]:['governing'])];
    need(closed(value,keys),'UNKNOWN_SCOPED_GLOBAL');marker(value,'original_execution_origin');marker(object(value.extensions),'original_execution_origin');
    for(const outcome of array(value.unknown_outcomes))job(object(outcome),env);
    if(!boundary)for(const item of array(value.governing)){need(closed(item,['source','value']),'UNKNOWN_SCOPED_GLOBAL');contextSource(item.source,object(item.value),env);}
    unknownReferences(value,['unknown_outcomes','governing']);
  }
  function contextRepairPacket(packet,env,closure){
    object(packet);need(packet.protocol==='scoped-context-v1','UNKNOWN_SCOPED_PACKET');
    if(packet.global_rules)contextMerge(closure,contextSemantic(()=>contextGlobal(packet.global_rules,env)));
    for(const key of ['homes','dependencies'])if(packet[key])for(const item of array(packet[key])){need(closed(item,['source','value']),'UNKNOWN_SCOPED_PACKET');contextMerge(closure,contextSemantic(()=>contextSource(item.source,object(item.value),env)));}
    if(packet.reference_evidence)for(const item of array(packet.reference_evidence)){need(closed(item,['review','value']),'UNKNOWN_SCOPED_PACKET');contextMerge(closure,contextSemantic(()=>contextSource(item.review,object(item.value),env)));}
    if(packet.repair_counterevidence)contextRepairEvidence(array(packet.repair_counterevidence),env,closure);
    // Other packet fields remain presentation DATA. They can mention an already
    // typed handle, but cannot introduce a new source role or hidden original.
    contextChecks.push(()=>contextPresentation(packet,closure));
  }
  function contextRepairEvidence(evidence,env,closure){
    for(const e of evidence){
      need(closed(e,['review','value','job','target','prior_packet'])&&closed(e.target,['source','value']),'SCOPED_REPAIR_CHANGED');
      contextMerge(closure,contextSemantic(()=>job(object(e.job),env)));
      if(e.review.id.startsWith('job:')){ref(e.job,e.review);need(e.job.id===e.review.id.slice(4),'SCOPED_REPAIR_CHANGED');unknownReferences(object(e.value));}
      else contextMerge(closure,contextSemantic(()=>contextSource(e.review,object(e.value),env)));
      const outer=contextReferencedRecord(e.target.source,env);need(same(outer.scoped_context_target,e.target.value),'SCOPED_REPAIR_CHANGED');
      contextMerge(closure,contextSemantic(()=>contextScopedTarget(e.target.value,env)));contextRepairPacket(e.prior_packet,env,closure);
    }
  }
  function contextScopedTarget(target,env){
    const t=object(target);need(t.protocol==='scoped-context-v1'&&['extract','applicability','integration'].includes(t.phase),'UNKNOWN_SCOPED_TARGET');
    const closure=new Map(),parent=contextReferencedRecord(t.plan,env);need(parent.scoped_context_plan?.protocol==='scoped-context-v1','UNKNOWN_SCOPED_TARGET');contextMerge(closure,contextSemantic(()=>record(parent,env)));
    if(own(t,'global_snapshot')){const global=object(contextRead(t.global_snapshot));need(t.phase!=='extract'&&hash(JSON.stringify(global))===t.global_sha256,'SCOPED_CONTEXT_CHANGED');contextMerge(closure,contextSemantic(()=>contextGlobal(global,env)));contextAllow(closure,t.global_snapshot);}
    else need(t.phase==='extract','UNKNOWN_SCOPED_TARGET');
    if(own(t,'repair_evidence')){
      const evidence=array(contextRead(t.repair_evidence)),references=array(t.repair_of);need(evidence.length===references.length,'SCOPED_REPAIR_CHANGED');
      for(let i=0;i<evidence.length;i++)need(same(evidence[i].review,references[i]),'SCOPED_REPAIR_CHANGED');
      contextRepairEvidence(evidence,env,closure);
    }else need(!own(t,'repair_of'),'UNKNOWN_SCOPED_TARGET');
    if(own(t,'repair_evidence'))contextAllow(closure,t.repair_evidence);
    const handled=['global_snapshot','repair_evidence'];unknownReferences(t,handled);
  }
  function contextOperatingUpgradeInput(upgradeValue,env){
    need(upgradeValue.snapshot_protocol===1&&upgradeValue.context_mode==='current','OPERATING_INPUT_CHANGED');
    const value=object(contextRead(upgradeValue.operating_input));
    need(closed(value,['protocol','attempt_id','context','candidate','candidate_hash','pinned','preparation_owner','source_instruction'])&&value.protocol==='accepted-operating-upgrade-v1'&&value.attempt_id===upgradeValue.id&&same(value.candidate,upgradeValue.candidate)&&value.candidate_hash===upgradeValue.candidate_hash&&same(value.pinned,upgradeValue.previous)&&value.source_instruction===upgradeValue.source_instruction&&same(value.preparation_owner,{host:upgradeValue.host,session_id:upgradeValue.owner_session_id,epoch:upgradeValue.epoch}),'OPERATING_INPUT_CHANGED');
    const candidate=object(value.candidate);need(hash(JSON.stringify([candidate.plugin_version,candidate.governance,candidate.roles,candidate.cos_instructions]))===value.candidate_hash,'OPERATING_INPUT_CHANGED');
    const c=object(value.context);need(closed(c,['protocol','company_id','owner','paused','scope','controls','homes','communication','acceptance','valid_until','applicable_set_root'])&&c.protocol==='operating-state-v1'&&(companyId===null||c.company_id===companyId),'OPERATING_INPUT_CHANGED');
    controls(c.controls,env);for(const home of array(c.homes)){need(closed(home,['source','value']),'OPERATING_INPUT_CHANGED');contextSource(home.source,object(home.value),env);}
    need(hash(JSON.stringify({scope:c.scope,homes:c.homes.map(home=>home.source),communication:c.communication,controls:c.controls}))===c.applicable_set_root,'OPERATING_INPUT_CHANGED');
    unknownReferences(c,['controls','homes']);unknownReferences(value,['context']);
  }
  const finish=()=>{
    const completed=new Set();
    for(;;){let progress=false;
      for(const [key,item]of historicalProducers){r.chargeWork(1);if(completed.has(key))continue;const containing=historicalCompanies.get(item.company_sha256);if(!containing)continue;
        const id=item.source.id,env={records:object(containing.records)};let original;
        if(own(containing.records,id))original=entry(containing.records[id],id);
        else if(id.startsWith('job:'))original=entry(object(containing.jobs)[id.slice(4)],id.slice(4));
        else if(id.startsWith('upgrade:')){const history=[...(containing.upgrade_history??[]),...(containing.upgrade?[containing.upgrade]:[])];original=history.map(value=>entry(value)).find(value=>value.id===id.slice(8));}
        need(plain(original)&&same(original,item.body),'OPERATING_EVIDENCE_CHANGED');ref(original,item.source);contextUsing(new Set([item.canonicalCapture]),()=>sourceValue(id,original,env));completed.add(key);progress=true;
      }
      if(completed.size===historicalProducers.size){contextFinish();return;}
      need(progress,'OPERATING_COMPANY_BINDING_REQUIRED');
    }
  };
  const next=(value,{selected=false}={})=>{
    const previous=collectPhysical;collectPhysical=false;
    try{
      object(value);marker(value,'original_execution_origin');
      if(!selected){company(value);finish();return;}
      const env={records:own(value,'records')?object(value.records):{}};
      if(own(value,'jobs'))jobs(value.jobs,env);if(own(value,'records'))records(value.records,env);
      if(own(value,'upgrade')&&value.upgrade!==null)upgrade(value.upgrade,env,{partial:true});if(own(value,'upgrade_history'))history(value.upgrade_history,env);
      if(own(value,'operating_state'))operatingIndex(object(value.operating_state),env);
      finish();
    }finally{collectPhysical=previous;}
  };
  return {company,next,finish,jobImages:()=>Object.freeze([...jobImages.values()]),comparisonReferences:()=>freeze([...comparisonBlobs.values()].map(copy))};
}

export function classifyRuntimeStorageFrom(store){
  const loan=originalStoreExecutionCustodyFrom(store),r=reader(loan);
  // Presence is checked before origin value projection. A malformed Original
  // remains the strict route's error; it never becomes positive legacy proof.
  const layoutExists=r.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='state_entries'",'get');
  if(layoutExists&&r.query("SELECT 1 FROM state_entries WHERE family='root' AND key='original_execution_origin'",'get'))return proof('original',loan,null,null);
  if(!layoutExists){
    const size=r.query('SELECT length(CAST(value AS BLOB)) AS bytes FROM company WHERE id=1','get');
    if(size){
      need(nat(size.bytes)&&size.bytes<=ORIGINAL_RAW_MAX_BYTES,'INVENTORY_CAPACITY');const raw=r.query('SELECT value FROM company WHERE id=1','get').value;let present;
      try{present=JSON.parse(raw);}catch{need(false,'STORAGE_BODY');}
      if(plain(present)&&own(present,'original_execution_origin'))return proof('original',loan,null,null);
    }
  }
  r.table('company','value');const jobSize=r.query("SELECT COALESCE(SUM(length(CAST(json_extract(value,'$.jobs') AS BLOB))),0) AS bytes FROM company",'get');need(nat(jobSize.bytes)&&jobSize.bytes<=MAX_JOB_BYTES,'JOB_INVENTORY_CAPACITY');const companyRows=r.query('SELECT id,value FROM company ORDER BY id','all');
  need(companyRows.length===1&&companyRows[0].id===1,'COMPANY_REQUIRED');const stored=r.parse(companyRows[0].value);
  need(loan.fresh===false,'PREEXISTING_STORE_REQUIRED');
  const layout=schema(r);need((layout===4)===Boolean(layoutExists),'LAYOUT_REQUIRED');
  r.events();const events=r.query('SELECT seq,at,type,value FROM events ORDER BY seq','all');need(events.length>0,'JOURNAL_REQUIRED');
  for(let n=0;n<events.length;n++){
    const event=events[n];need(event.seq===n+1&&typeof event.at==='string'&&Number.isFinite(Date.parse(event.at))&&text(event.type),'JOURNAL_REQUIRED');event.payload=r.parse(event.value);need(plain(event.payload)&&nat(event.payload.revision),'JOURNAL_REQUIRED');
    need(!own(event.payload,'original_execution')&&!/^(?:job|upgrade)\.original_execution\./.test(event.type),'RETAINED_ORIGINAL_EVIDENCE');
  }
  const typed=typedReader(r);let current;
  if(layout===0){
    need(plain(stored),'STORAGE_BODY');typed.company(stored);need(events.every((event,n)=>event.payload.revision===n&&!own(event.payload,'storage_delta'))&&stored.revision===events.at(-1).payload.revision,'RAW_ANCHOR_REQUIRED');current=stored;
  }else{
    need(closed(stored,['schema','storage_format','source_state_sha256','source_state_characters','message'])&&stored.schema===0&&stored.storage_format==='normalized-v4'&&hex(stored.source_state_sha256)&&nat(stored.source_state_characters),'MIGRATION_ANCHOR_REQUIRED');
    const raw=r.read(stored.source_state_sha256,{company:true});need(raw.length===stored.source_state_characters,'MIGRATION_ANCHOR_REQUIRED');const source=r.immutable.get(stored.source_state_sha256).value;typed.company(source);
    const entries=r.query('SELECT COUNT(*) AS n,COALESCE(SUM(length(CAST(family AS BLOB))+length(CAST(key AS BLOB))+length(CAST(sha256 AS BLOB))+length(CAST(encoding AS BLOB))+16),0) AS bytes FROM state_entries','get');r.charge(entries.n,entries.bytes);
    const jobSize=r.query("SELECT COALESCE(SUM(length(CAST(v.bytes AS BLOB))),0) AS bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE e.family='jobs'",'get');need(nat(jobSize.bytes)&&jobSize.bytes<=MAX_JOB_BYTES,'JOB_INVENTORY_CAPACITY');
    const history=inspectLegacyV4HistoryFrom(loan.db,source,events,{readValue:r.read,visitState:value=>typed.company(value),chargeWork:r.chargeWork,assertCurrent:loan.assert});current=history.current;
  }
  typed.finish();loan.assert();return proof('legacy',loan,current.id,{layout,event_sequence:events.at(-1).seq,event_sha256:hash(JSON.stringify([events.at(-1).seq,events.at(-1).at,events.at(-1).type,events.at(-1).value])),state:current,reader:r,typed});
}

function proof(lane,loan,companyId,details){
  const value=Object.freeze({lane,company_id:companyId,layout:details?.layout??null,event_sequence:details?.event_sequence??null,event_sha256:details?.event_sha256??null});
  proofs.set(value,{loan,details});return value;
}

export function inspectRuntimeStorageProofFrom(value,store){
  const record=proofs.get(value),loan=originalStoreExecutionCustodyFrom(store);
  need(record&&record.loan.store===loan.store&&record.loan.db===loan.db&&record.loan.root===loan.root&&record.loan.scope===loan.scope,'STORAGE_PROOF_REQUIRED');record.loan.assert();
  return Object.freeze({lane:value.lane,company_id:value.company_id,layout:value.layout,event_sequence:value.event_sequence,event_sha256:value.event_sha256});
}

// Mechanical context projection only, never launch/admission/closure evidence.
// Images come solely from typed physical bodies and hash/reference-validated
// retained originals visited by this exact snapshot. Pending callback DATA does
// not enter the set, and callers cannot select or add a historical variant.
export function inspectRuntimeStorageJobBookkeepingFrom(value,store){
  const facts=inspectRuntimeStorageProofFrom(value,store),record=proofs.get(value);
  return facts.lane==='legacy'?record.details.typed.jobImages():Object.freeze([]);
}

/** Passive reference census only. A cold entry explicitly lacks physical
 * custody; neither these DATA nor a copied backup can recreate a live pin. */
export function inspectRuntimeStorageComparisonReferencesFrom(value,store){
  const facts=inspectRuntimeStorageProofFrom(value,store),record=proofs.get(value);
  need(facts.lane==='legacy','COMPARISON_CENSUS_REQUIRES_LEGACY_READER');
  return record.details.typed.comparisonReferences();
}

export function assertRuntimeStorageNextFrom(value,store,next,{selected=false}={}){
  const facts=inspectRuntimeStorageProofFrom(value,store),loan=originalStoreExecutionCustodyFrom(store);
  need(loan.mode==='write'&&loan.state===next,'WRITE_REQUIRED');
  if(facts.lane==='original')return facts;
  need(plain(next)&&(!own(next,'id')||next.id===facts.company_id),'TYPED_IDENTITY_CHANGED');
  // Pending Source originals are checked only for this exact live next object.
  // Their cache and typed traversal are separate from the physical proof and
  // cannot add historical bookkeeping images. Final classification after the
  // writer flushes snapshots always creates a fresh actual-vault-only reader.
  const nextReader=reader(loan,{pending:pendingSnapshots(next),next});typedReader(nextReader).next(next,{selected});
  loan.assert();need(originalStoreExecutionCustodyFrom(store).state===next,'WRITE_REQUIRED');return facts;
}
