// Source-owned A records. Public schema fields are audit DATA; issuance and
// writes require the same live private run, actual Store, scope and raw outcome.
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {originalStoreExecutionCustodyFrom,inspectRuntimeStoreCommitWitnessFrom} from './store.mjs';
import {inspectRuntimeModelRequestCommitFrom} from './runtime-execution.mjs';
import {inspectRuntimeModelOutcomeCaptureFrom,assertRuntimeModelOutcomeEligible} from './adapters.mjs';
import {inspectSelectedComparisonRun,assertBoundComparisonArmFrom} from './qualification/issue18/integrated-comparison-issuer.mjs';
import {captureRawText,captureBytes,unavailableCapture,keepThrownValue,readThrownValue,validateEvidenceRecordShapeData,validateEvidenceData} from './qualification/issue18/typed-capture.mjs';
import {publishComparisonEvidenceBlob,pinComparisonEvidenceFrom,assertComparisonEvidencePin,releaseComparisonEvidencePin,inspectComparisonEvidenceStorageFrom,chargeComparisonEvidenceMetadata,closeComparisonEvidenceStorage} from './qualification/issue18/integrated-comparison-evidence-io.mjs';
import {beginComparisonTestWriteFrom,prepareComparisonTestWriteFrom,comparisonTestEventFrom,bindComparisonTestBookkeepingFrom} from './integrated-comparison-test.mjs';
import {publicIndexValue} from './state-projections.mjs';
import {readComparisonProofCandidates,comparisonProofLookupIndexesFrom} from './record-storage.mjs';

const captures=new WeakMap(),writes=new WeakMap(),bookkeeping=new WeakMap(),runCaptures=new WeakMap(),producedCalls=new Map(),commitPreparations=new WeakMap(),preimages=new WeakMap(),eventScopes=new WeakMap();
const metadataPrepayments=new WeakMap(),metadataIOs=new WeakMap(),metadataJobs=new Map(),metadataRoots=new Map(),metadataScopes=new WeakMap();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),digest=value=>hash(JSON.stringify(value));
const need=(ok,code)=>{if(!ok)throw Object.assign(Error('Issue18 evidence Hold: '+code),{code:'ISSUE18_EVIDENCE_'+code});};
const copy=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const sourceHash=()=>hash(fs.readFileSync(fileURLToPath(import.meta.url)));
const wire=r=>r?.runtime_wire_evidence;
const eventTypes={requested:'job.model_process.requested',response_retained:'job.model_wire.response_retained',error_retained:'job.model_wire.error_retained',derived:'job.model_wire.derived_recorded'};
const transition={requested:'request',response_retained:'response',error_retained:'error',derived:'derived'};
const SQL_PROFILE='issue18-prepaid-sql-metadata-v1',BODY_MAX=32768,CONTROL_MAX=32;
const SQL_CAPS=Object.freeze({immutable:65728,entry:960,projection:2048,references:16384,catalogue:4096,roots:4096,event:65536});
const CONTROL_CAPS=Object.freeze({references:2048,catalogue:4096,roots:2048});
const COPY_LIMITS=Object.freeze({immutable_rows:4096,new_rows:128,total_bytes:8000000,depth:32,nodes:100000,unicode_layers:8});
const COPY_PROTOCOLS=new Set(['issue18-runtime-wire-evidence-v1','issue18-call-binding-v1','issue18-eight-slot-run-v2','issue18-eight-slot-consumption-v2','issue18-one-test-arm-guard-v1','issue18-wire-producer-transition-v1','issue18-one-test-producer-transition-v1','issue18-budget-selection-v1','issue18-budget-journal-v1','issue18-comparison-bootstrap-io-v1','issue18-comparison-evidence-io-v1','issue18-ledger-storage-io-v1','issue18-A-storage-init-v1']);
const COPY_KEYS=new Set(['runtime_wire_evidence','runtime_candidate_test_guard','A_charged_evidence_bytes','A_capacity_reserved_bytes','B_slot_reserved_bytes','run_manifest_sha256','slot_commit_id','binding_serialization','private_outcome_custody_id','raw_lossless_sha256','tracking_entry_sha256','cancellation_binding_id','contract_A_manifest_sha256','contract_B_manifest_sha256']);
const COPY_KEY_TEXT=new RegExp('"(?:'+[...COPY_KEYS].join('|')+')"\\s*:');
const SQL_COLUMNS=Object.freeze({company:['id','value'],events:['seq','at','type','value'],company_layout:['id','version'],immutable_values:['sha256','bytes'],state_entries:['family','key','position','sha256','encoding'],public_read_values:['family','key','position','bytes','value_id_sha256','sha256'],public_read_rows:['collection','ordinal','key','id','sha256','key_sha256'],public_read_catalog:['id','version','sha256','bytes']});
const SQL_TRIGGERS=Object.freeze(Object.fromEntries(['insert','update','delete'].flatMap(action=>[
  ['fence_legacy_'+action,"CREATE TRIGGER fence_legacy_"+action+" BEFORE "+action.toUpperCase()+" ON company BEGIN SELECT RAISE(ABORT,'Legacy writer fenced: normalized company storage'); END"],
  ['public_read_'+action,'CREATE TRIGGER public_read_'+action+' AFTER '+action.toUpperCase()+' ON state_entries BEGIN DELETE FROM public_read_catalog; END']
])));
const rowBytes=row=>Buffer.byteLength(JSON.stringify(row));
const rowsBytes=rows=>rows.reduce((n,row)=>n+rowBytes(row),0);
function sqlRowBytes(table,row){
  // Explicit logical index postimages, plus a conservative 16-byte row locator
  // for each secondary/automatic key. This does not claim SQLite page, WAL or
  // allocator accounting. A new index is outside the closed schema below.
  const keys=table==='immutable_values'?[[row.sha256]]:table==='state_entries'?[[row.family,row.key],[row.family,row.position]]:table==='public_read_values'?[[row.family,row.key],[row.family,row.value_id_sha256,row.position]]:table==='public_read_rows'?[[row.collection,row.ordinal],[row.collection,row.key_sha256]]:[];
  if(table==='immutable_values'){
    // These are already bounded, known row postimages. The sparse index also
    // retains malformed fragments; valid unrelated Core JSON has no such key.
    let value,valid=true;try{value=JSON.parse(row.bytes);}catch{valid=false;}
    if(!valid||value&&typeof value==='object'&&(Object.hasOwn(value,'runtime_wire_evidence')||Object.hasOwn(value,'runtime_candidate_test_guard')))keys.push([row.sha256]);
  }
  if(table==='state_entries'&&row.family==='records')keys.push([row.sha256,row.key]);
  return rowBytes(row)+keys.reduce((n,key)=>n+rowBytes(key)+16,0);
}
const sqlRowsBytes=(table,rows)=>rows.reduce((n,row)=>n+sqlRowBytes(table,row),0);
const rootRowsBytes=rows=>rows.reduce((n,item)=>n+sqlRowBytes(item.table,item.row),0);
const metadataKey=(root,job)=>root+'\0'+job;
const sqlIdentity=(table,row)=>table==='immutable_values'?row.sha256:table==='public_read_rows'?JSON.stringify([row.collection,row.ordinal]):JSON.stringify([row.family,row.key]);
const changedRows=(table,before,after)=>{const old=new Map(before.map(row=>[sqlIdentity(table,row),JSON.stringify(row)]));return after.filter(row=>old.get(sqlIdentity(table,row))!==JSON.stringify(row));};
function boundSQLRows(db,table,columns,where,parameters,maximumRows,maximumRowBytes){
  const census=db.prepare('SELECT COUNT(*) AS n,COALESCE(MAX(length(CAST(json_array('+columns.join(',')+') AS BLOB))),0) AS largest FROM '+table+(where?' WHERE '+where:'')).get(...parameters);
  need(Number.isSafeInteger(census.n)&&census.n<=maximumRows&&census.largest<=maximumRowBytes,'METADATA_SQL_ROW_CAPACITY');
}
function canonicalProofRows(loan){
  // The caller's selected projection is deliberately irrelevant. SQLite only
  // returns metadata for the actual canonical proof rows, not unrelated bodies.
  const layout=loan.db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='company_layout'").get();
  if(!layout){const count=loan.db.prepare("SELECT COUNT(*) AS n FROM company c,json_tree(c.value,'$.records') j WHERE j.key IN ('runtime_wire_evidence','runtime_candidate_test_guard')").get();need(count.n===0,'METADATA_UNSUPPORTED_LEGACY_PROOF_STORAGE');return [];}
  const version=loan.db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version;
  const candidates=readComparisonProofCandidates(loan.db);need(candidates.length<=16,'METADATA_CANONICAL_PROOF_CAPACITY');
  need(version===4||candidates.length===0,'METADATA_UNSUPPORTED_LEGACY_PROOF_STORAGE');
  const rows=candidates.map(candidate=>{
    // Bound count and original body size before JSON validation/extraction. The
    // sparse lookup touches no unrelated canonical/archive body on this path.
    const size=loan.db.prepare('SELECT length(CAST(bytes AS BLOB)) AS bytes FROM immutable_values WHERE sha256=?').get(candidate.sha256);
    need(size&&Number.isSafeInteger(size.bytes)&&size.bytes<=BODY_MAX,'METADATA_CANONICAL_PROOF_CAPACITY');
    need(loan.db.prepare('SELECT json_valid(bytes) AS valid FROM immutable_values WHERE sha256=?').get(candidate.sha256)?.valid===1,'METADATA_CANONICAL_JSON');
    const detail=loan.db.prepare("SELECT json_extract(bytes,'$.id') AS id,json_type(bytes,'$.runtime_wire_evidence') AS wire_type,json_type(bytes,'$.runtime_candidate_test_guard') AS test_type FROM immutable_values WHERE sha256=?").get(candidate.sha256);
    const entry=loan.db.prepare("SELECT encoding FROM state_entries WHERE family='records' AND key=? AND sha256=?").get(candidate.key,candidate.sha256);need(entry,'METADATA_CANONICAL_PROOF_CAPACITY');
    return {...candidate,...detail,encoding:entry.encoding,bytes:size.bytes};
  }).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
  loan.assert();return rows;
}
function requireProofCustody(rows,members,code,eventScope=null){
  for(const row of rows)need(row.encoding==='json'&&row.key===row.id&&row.bytes<=BODY_MAX&&Boolean(row.wire_type)!==Boolean(row.test_type)&&members.some(paid=>{const body=paid.bodies.get(row.sha256),entry=paid.records.get(row.id),staged=eventScope?.metadata===paid&&eventScope.recordSha===row.sha256;return body?.id===row.id&&body.family===(row.wire_type?'wire':'test')&&(entry?.committedSha===row.sha256||staged);}),code);
}
function copyBaseline(db){
  const count=db.prepare('SELECT COUNT(*) AS n FROM immutable_values').get();need(count.n<=COPY_LIMITS.immutable_rows,'METADATA_COPY_CENSUS_CAPACITY');
  need(db.prepare('SELECT COUNT(*) AS n FROM state_entries').get().n<=1024&&db.prepare('SELECT COUNT(*) AS n FROM public_read_values').get().n<=256,'METADATA_COPY_CENSUS_CAPACITY');
  return {immutable:new Set(db.prepare('SELECT sha256 FROM immutable_values').all().map(row=>row.sha256)),entries:db.prepare('SELECT family,key,sha256 FROM state_entries ORDER BY family,key').all(),public:db.prepare('SELECT family,key,sha256 FROM public_read_values ORDER BY family,key').all()};
}
function proofRepresentation(serialized){
  need(typeof serialized==='string'&&Buffer.byteLength(serialized)<=COPY_LIMITS.total_bytes,'METADATA_COPY_CLASSIFICATION_CAPACITY');
  let nodes=0,work=0;const seenStrings=new Set();
  function textView(text){
    let view=text;
    for(let layer=0;layer<COPY_LIMITS.unicode_layers;layer++){
      work+=view.length;need(work<=COPY_LIMITS.total_bytes,'METADATA_COPY_CLASSIFICATION_CAPACITY');
      // Recognize embedded/encoded JSON even when a content wrapper removed the
      // outer header identity. A plain mention without JSON field syntax is not
      // itself a proof payload. Unsupported deeper encodings Hold explicitly.
      if(COPY_KEY_TEXT.test(view))return true;
      if(/"(?:protocol|purpose)"\s*:\s*"issue18-[^"]+"/.test(view))return true;
      if(/"receipt_id"\s*:\s*"issue18-error-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}"/.test(view)||/"live_identity"\s*:\s*"original_value_and_cause_preserved_privately_not_reconstructable"/.test(view))return true;
      const next=view.replace(/\\+u([a-fA-F0-9]{4})/g,(_match,hex)=>String.fromCharCode(Number.parseInt(hex,16))).replace(/\\(["\\/])/g,(_match,escaped)=>escaped);
      if(next===view)return false;view=next;
    }
    need(false,'METADATA_COPY_CLASSIFICATION_ENCODING');return false;
  }
  function visit(value,depth){
    need(++nodes<=COPY_LIMITS.nodes&&depth<=COPY_LIMITS.depth,'METADATA_COPY_CLASSIFICATION_CAPACITY');
    if(typeof value==='string'){
      if(seenStrings.has(value))return false;seenStrings.add(value);if(textView(value))return true;
      const trimmed=value.trim();if(trimmed[0]==='{'||trimmed[0]==='['||trimmed[0]==='"'){let nested;try{nested=JSON.parse(trimmed);}catch{return false;}return visit(nested,depth+1);}return false;
    }
    if(!value||typeof value!=='object')return false;
    if(COPY_PROTOCOLS.has(value.protocol)||typeof value.purpose==='string'&&value.purpose==='issue18-integrated-comparison-budget-v1')return true;
    if(Object.keys(value).some(key=>COPY_KEYS.has(key)))return true;
    if(typeof value.receipt_id==='string'&&/^issue18-error-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.receipt_id)||value.live_identity==='original_value_and_cause_preserved_privately_not_reconstructable')return true;
    if(typeof value.object_name==='string'&&/^objects\/[a-f0-9]{64}\.blob$/.test(value.object_name)&&Object.hasOwn(value,'encoding')&&Object.hasOwn(value,'sha256')&&Object.hasOwn(value,'bytes'))return true;
    if(Object.hasOwn(value,'lower_cli_transport')&&Object.hasOwn(value,'lossless_blob'))return true;
    return Object.values(value).some(child=>visit(child,depth+1));
  }
  let value;try{value=JSON.parse(serialized);}catch{need(false,'METADATA_COPY_CLASSIFICATION_JSON');}return visit(value,0);
}
function knownBody(members,sha,text){return members.some(paid=>paid.bodies.get(sha)?.text===text);}
const COPY_FAMILIES=new Set(['records','jobs','sessions','notices','messages','upgrade_history','retired_sessions','context_classifications','upgrade']);
function preparedValues(state){
  const rows=[];for(const [key,value]of Object.entries(state??{})){
    if(COPY_FAMILIES.has(key)&&value&&typeof value==='object'){for(const [id,entry]of Object.entries(value))if(entry!==undefined)rows.push({identity:JSON.stringify([key,id]),value:entry});}
    else if(value!==undefined)rows.push({identity:JSON.stringify(['root',key]),value});
  }return rows;
}
function classifyPreparedCopies(loan,next){
  const scope=metadataScopes.get(loan.scope);if(!scope)return;const members=scope.members;
  // The fixed TestGuard guard has already authenticated its exact private
  // pending write. Registering here makes the pre-SQL census independent of the
  // later event callback; a public marker alone cannot reach this point.
  for(const record of Object.values(next?.records??{}))if(record&&Object.hasOwn(record,'runtime_candidate_test_guard')){
    const text=JSON.stringify(record);if(knownBody(members,hash(text),text))continue;
    const producer=record.runtime_candidate_test_guard?.producer_evidence_record,paid=members.find(item=>item.phase==='engineer'&&item.records.has(producer?.id));need(paid,'METADATA_TEST_PREPAYMENT_REQUIRED');metadataRegister(paid,record,'test');
  }
  for(const row of preparedValues(next)){
    const text=JSON.stringify(row.value);need(typeof text==='string','METADATA_COPY_CLASSIFICATION_JSON');const sha=hash(text);
    if(scope.preparedBefore.get(row.identity)===sha)continue;
    const registered=members.map(paid=>paid.bodies.get(sha)).find(body=>body?.text===text);
    if(registered){need(row.identity===JSON.stringify(['records',registered.id]),'METADATA_UNSELECTED_COPY_REPRESENTATION');continue;}
    need(!proofRepresentation(text),'METADATA_UNSELECTED_COPY_REPRESENTATION');
  }
}
function classifyNewCopies(loan,scope,members,owner){
  const current=copyBaseline(loan.db),fresh=[...current.immutable].filter(sha=>!scope.copies.immutable.has(sha));
  need(fresh.length<=COPY_LIMITS.new_rows,'METADATA_COPY_CENSUS_CAPACITY');
  const changed=changedRows('state_entries',scope.copies.entries,current.entries),changedPublic=changedRows('public_read_values',scope.copies.public,current.public),wanted=new Set([...fresh,...changed.map(row=>row.sha256)]);
  let total=0;
  for(const sha of wanted){
    const size=loan.db.prepare('SELECT length(CAST(bytes AS BLOB)) AS bytes FROM immutable_values WHERE sha256=?').get(sha);need(size&&Number.isSafeInteger(size.bytes)&&size.bytes>=0&&(total+=size.bytes)<=COPY_LIMITS.total_bytes,'METADATA_COPY_CLASSIFICATION_CAPACITY');
    const row=loan.db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(sha);need(typeof row?.bytes==='string'&&hash(row.bytes)===sha,'METADATA_COPY_CLASSIFICATION_HASH');
    if(knownBody(members,sha,row.bytes))continue;
    need(!proofRepresentation(row.bytes),'METADATA_UNSELECTED_COPY_REPRESENTATION');
  }
  for(const entry of changedPublic){
    const size=loan.db.prepare('SELECT length(CAST(bytes AS BLOB)) AS bytes FROM public_read_values WHERE family=? AND key=?').get(entry.family,entry.key);need(size&&(total+=size.bytes)<=COPY_LIMITS.total_bytes,'METADATA_COPY_CLASSIFICATION_CAPACITY');
    const row=loan.db.prepare('SELECT bytes FROM public_read_values WHERE family=? AND key=?').get(entry.family,entry.key);need(row&&!proofRepresentation(row.bytes),'METADATA_UNSELECTED_PUBLIC_COPY_REPRESENTATION');
  }
  if(!owner){const size=loan.db.prepare('SELECT COALESCE(SUM(length(CAST(value AS BLOB))),0) AS bytes FROM events WHERE seq>?').get(scope.beforeEvent);need((total+=size.bytes)<=COPY_LIMITS.total_bytes,'METADATA_COPY_CLASSIFICATION_CAPACITY');
    for(const row of loan.db.prepare('SELECT value FROM events WHERE seq>? ORDER BY seq').all(scope.beforeEvent))need(!proofRepresentation(row.value),'METADATA_UNSELECTED_EVENT_COPY_REPRESENTATION');}
  // Whole catalogue rows are already prepaid; a hidden payload in one still
  // lies outside the closed projection and cannot borrow that allowance.
  for(const row of loan.db.prepare('SELECT bytes FROM public_read_catalog').all())need(!proofRepresentation(row.bytes),'METADATA_UNSELECTED_PUBLIC_COPY_REPRESENTATION');
  loan.assert();
}

/** A finite DATA quote, never a Store, SQL-write or model capability. Whole
 * retained row envelopes count separately from their referred-to Core bodies.
 * public_read_values is a small projection in this Source, NOT another full
 * header body; a future projection outside this profile Holds before spending. */
export function comparisonEvidenceMetadataReservation(phase){
  need(phase==='engineer'||phase==='qa','METADATA_PHASE');
  const records=phase==='engineer'?5:3;
  const inventory=[
    {purpose:'whole immutable header SQL row/body envelope, automatic hash and sparse proof index keys',kind:'header',maximum_bytes:SQL_CAPS.immutable,multiplicity:records},
    {purpose:'whole canonical state_entries reference row, primary, order and covering proof-reference index keys',kind:'header',maximum_bytes:SQL_CAPS.entry,multiplicity:records},
    {purpose:'whole public_read_values projection row, primary and value-id index keys',kind:'header',maximum_bytes:SQL_CAPS.projection,multiplicity:records},
    {purpose:'whole A-caused public_read_rows postimages, including ordinal rewrites and handles',kind:'header',maximum_bytes:SQL_CAPS.references,multiplicity:records},
    {purpose:'whole rewritten public_read_catalog row',kind:'header',maximum_bytes:SQL_CAPS.catalogue,multiplicity:records},
    {purpose:'whole revision/updated_at immutable, reference and public rows',kind:'header',maximum_bytes:SQL_CAPS.roots,multiplicity:records},
    {purpose:'whole canonical event tuple after all producer wrappers and storage_delta',kind:'event',maximum_bytes:SQL_CAPS.event,multiplicity:records},
    {purpose:'later whole public catalogue, changed A/TestGuard reference rows and root-control postimages; no extra proof bodies',kind:'header',maximum_bytes:8192,multiplicity:CONTROL_MAX}
  ];
  const header_bytes=inventory.filter(row=>row.kind==='header').reduce((n,row)=>n+row.maximum_bytes*row.multiplicity,0),event_bytes=records*SQL_CAPS.event;
  return freeze({protocol:SQL_PROFILE,phase,total_bytes:header_bytes+event_bytes,header_bytes,event_bytes,pin_copy_bytes:0,header_revisions:3,test_guard_revisions:phase==='engineer'?2:0,future_control_writes:CONTROL_MAX,inventory});
}
function sqlSchema(db){
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all();
  need(JSON.stringify(tables.map(row=>row.name))===JSON.stringify(Object.keys(SQL_COLUMNS).sort()),'METADATA_SCHEMA');
  for(const [table,columns]of Object.entries(SQL_COLUMNS))need(JSON.stringify(db.prepare('PRAGMA table_xinfo('+table+')').all().map(row=>row.name))===JSON.stringify(columns),'METADATA_SCHEMA');
  const indexes=db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT GLOB 'sqlite_*' ORDER BY name").all();
  const secondaryColumns={public_read_handles:['collection','key_sha256'],public_read_issue18_proof_values:['sha256'],public_read_issue18_record_refs:['sha256','key'],public_read_value_ids:['family','value_id_sha256','position'],state_entries_order:['family','position']},indexColumns={...secondaryColumns};
  need(JSON.stringify(indexes.map(row=>row.name))===JSON.stringify(Object.keys(secondaryColumns).sort()),'METADATA_INDEX_SCHEMA');
  const secondaryTables={public_read_handles:'public_read_rows',public_read_issue18_proof_values:'immutable_values',public_read_issue18_record_refs:'state_entries',public_read_value_ids:'public_read_values',state_entries_order:'state_entries'};
  const lookup=comparisonProofLookupIndexesFrom(db);need(lookup.proof_values&&lookup.record_refs,'METADATA_INDEX_SCHEMA');
  const primaryColumns={immutable_values:['sha256'],state_entries:['family','key'],public_read_values:['family','key'],public_read_rows:['collection','ordinal']};
  for(const table of Object.keys(SQL_COLUMNS)){
    const expected=[...(primaryColumns[table]?['sqlite_autoindex_'+table+'_1']:[]),...Object.keys(secondaryColumns).filter(name=>secondaryTables[name]===table)].sort();
    need(JSON.stringify(db.prepare('PRAGMA index_list('+table+')').all().map(row=>row.name).sort())===JSON.stringify(expected),'METADATA_INDEX_SCHEMA');
    if(primaryColumns[table])indexColumns['sqlite_autoindex_'+table+'_1']=primaryColumns[table];
  }
  for(const [name,columns]of Object.entries(indexColumns))need(JSON.stringify(db.prepare('PRAGMA index_info('+name+')').all().map(row=>row.name))===JSON.stringify(columns),'METADATA_INDEX_SCHEMA');
  const triggers=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();need(JSON.stringify(triggers.map(row=>row.name))===JSON.stringify(Object.keys(SQL_TRIGGERS).sort()),'METADATA_TRIGGER_SCHEMA');
  const triggerText=text=>text.replace('CREATE TRIGGER IF NOT EXISTS ','CREATE TRIGGER ').replace(/\s+/g,' ').trim();for(const row of triggers)need(triggerText(row.sql)===triggerText(SQL_TRIGGERS[row.name]),'METADATA_TRIGGER_SCHEMA');
  need(db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version===4,'METADATA_LAYOUT');
  const schema=db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();need(rowsBytes(schema)<=32768,'METADATA_SCHEMA_CAPACITY');return digest(schema);
}
function sqlPublic(db){
  boundSQLRows(db,'public_read_rows',SQL_COLUMNS.public_read_rows,'',[],128,1024);
  const count=db.prepare('SELECT COUNT(*) AS n FROM public_read_rows').get().n;need(Number.isSafeInteger(count)&&count<=128,'METADATA_REFERENCE_CAPACITY');
  const references=db.prepare('SELECT * FROM public_read_rows ORDER BY collection,ordinal').all();need(sqlRowsBytes('public_read_rows',references)<=16384,'METADATA_REFERENCE_CAPACITY');
  const size=db.prepare('SELECT COUNT(*) AS n,COALESCE(MAX(length(CAST(bytes AS BLOB))),0) AS largest FROM public_read_catalog').get();need(size.n===1&&size.largest<=SQL_CAPS.catalogue,'METADATA_CATALOGUE_CAPACITY');
  const catalogue=db.prepare('SELECT * FROM public_read_catalog').all();need(catalogue.length===1&&catalogue[0].id===1&&catalogue[0].version===1&&catalogue[0].sha256===hash(catalogue[0].bytes)&&rowBytes(catalogue[0])<=SQL_CAPS.catalogue,'METADATA_CATALOGUE_CAPACITY');
  const parsed=JSON.parse(catalogue[0].bytes);need(JSON.stringify(Object.keys(parsed).sort())===JSON.stringify(['claims','collections','exports','usage','version']),'METADATA_CATALOGUE_SHAPE');
  return {references,catalogue};
}
function metadataSubject(store,input){
  need(input&&Object.keys(input).sort().join(',')==='job_id,phase','METADATA_INPUT');
  return snapshot(store,(state,loan)=>{const job=state.jobs?.[input.job_id];need(job?.status==='running'&&job.role===input.phase,'METADATA_JOB');
    const quote=comparisonEvidenceMetadataReservation(input.phase),schema=sqlSchema(loan.db),publicRows=sqlPublic(loan.db);
    const prior=[...(metadataRoots.get(loan.root)??[])].filter(paid=>paid.ready&&paid.used);
    requireProofCustody(canonicalProofRows(loan),prior,'METADATA_EXISTING_PROOF_CUSTODY');copyBaseline(loan.db);
    if(prior.length)metadataCopyCensus(loan,prior);
    // Leave room for the closed A/TestGuard family and the original Core
    // candidate/receipt/QA reference additions. Larger companies are unsupported
    // by this bounded optional profile; no company body is silently hydrated.
    need(sqlRowsBytes('public_read_rows',publicRows.references)<=12288,'METADATA_REFERENCE_PREFLIGHT');return {quote,schema,root:loan.root,db:loan.db};});
}
export function preflightComparisonEvidenceMetadataFrom(store,input){return metadataSubject(store,input).quote;}
/** The direct late-native journal route has no selected A copy/archive grant.
 * It must report an explicit Hold before retaining any new journal/root/index
 * representation. Metadata-free late returns keep their existing route. */
export function assertComparisonUpgradeAppendSupportedFrom(store){
  const loan=originalStoreExecutionCustodyFrom(store);need(loan.mode==='write'&&loan.type==='upgrade.native_returned','METADATA_UPGRADE_APPEND_SCOPE');
  const rows=canonicalProofRows(loan),active=[...(metadataRoots.get(loan.root)??[])].some(paid=>paid.ready&&paid.used);
  need(rows.length===0&&!active,'METADATA_UPGRADE_APPEND_CUSTODY_REQUIRED');loan.assert();
}
export function prepayComparisonEvidenceMetadataFrom(store,io,input){
  const facts=metadataSubject(store,input),storage=inspectComparisonEvidenceStorageFrom(io),key=metadataKey(facts.root,input.job_id);
  need(storage.phase===input.phase&&!metadataJobs.has(key),'METADATA_PREPAYMENT_SPENT');
  const paid={...facts,store,io,jobId:input.job_id,phase:input.phase,used:false,ready:false,records:new Map(),bodies:new Map(),recordEvents:new Set(),controls:0,actual:{immutable:0,entry:0,projection:0,references:0,catalogue:0,roots:0,event:0,controls:0,control_references:0,control_catalogue:0,control_roots:0}};
  need(!metadataIOs.has(io),'METADATA_PREPAYMENT_SPENT');metadataJobs.set(key,paid);metadataIOs.set(io,paid);let members=metadataRoots.get(facts.root);if(!members){members=new Set();metadataRoots.set(facts.root,members);}members.add(paid);
  chargeComparisonEvidenceMetadata(io,{header_bytes:facts.quote.header_bytes,event_bytes:facts.quote.event_bytes,pin_copy_bytes:0});paid.ready=true;
  const token=Object.freeze({});metadataPrepayments.set(token,paid);return token;
}
/** Fixed B issuer checks this immediately before its irreversible publication.
 * Returning true cannot create a slot, Store witness, AIO handle or model cap. */
export function assertComparisonEvidencePrepaymentFrom(io,input){
  const paid=metadataIOs.get(io);need(paid&&paid.ready&&!paid.used&&paid.store===input?.actualStore&&paid.jobId===input.job_id&&paid.phase===input.phase,'METADATA_BEFORE_B_PREPAYMENT_REQUIRED');
  need(inspectComparisonEvidenceStorageFrom(io).accounting.charged_bytes>=paid.quote.total_bytes,'METADATA_PREPAYMENT_JOIN');return true;
}
function metadataRegister(paid,record,family){
  const text=JSON.stringify(record),sha=hash(text);need(Buffer.byteLength(text)<=BODY_MAX,'METADATA_HEADER_CAPACITY');
  const prior=paid.records.get(record.id);need(!prior||prior.family===family,'METADATA_FAMILY');
  if(prior)prior.sha=sha;else paid.records.set(record.id,{family,sha,committedSha:null});paid.bodies.set(sha,{id:record.id,text,family});
  need([...paid.bodies.values()].filter(body=>body.family==='wire').length<=paid.quote.header_revisions&&[...paid.bodies.values()].filter(body=>body.family==='test').length<=paid.quote.test_guard_revisions,'METADATA_HISTORY_ALLOWANCE');
}
function metadataSQL(db,ids){
  const publicRows=sqlPublic(db),marks=ids.length?ids.map(()=>'?').join(','):null;
  if(marks){boundSQLRows(db,'state_entries',SQL_COLUMNS.state_entries,"family='records' AND key IN ("+marks+')',ids,ids.length,SQL_CAPS.entry);boundSQLRows(db,'public_read_values',SQL_COLUMNS.public_read_values,"family='records' AND key IN ("+marks+')',ids,ids.length,SQL_CAPS.projection);}
  const entries=marks?db.prepare("SELECT * FROM state_entries WHERE family='records' AND key IN ("+marks+') ORDER BY key').all(...ids):[];
  const projections=marks?db.prepare("SELECT * FROM public_read_values WHERE family='records' AND key IN ("+marks+') ORDER BY key').all(...ids):[];
  boundSQLRows(db,'immutable_values',['sha256','bytes'],"sha256 IN (SELECT sha256 FROM state_entries WHERE family='root' AND key IN ('revision','updated_at'))",[],2,1024);
  boundSQLRows(db,'state_entries',SQL_COLUMNS.state_entries,"family='root' AND key IN ('revision','updated_at')",[],2,1024);boundSQLRows(db,'public_read_values',SQL_COLUMNS.public_read_values,"family='root' AND key IN ('revision','updated_at')",[],2,1024);
  const roots=[...db.prepare("SELECT v.sha256,v.bytes FROM state_entries e JOIN immutable_values v USING(sha256) WHERE e.family='root' AND e.key IN ('revision','updated_at') ORDER BY e.key").all().map(row=>({table:'immutable_values',row})),...db.prepare("SELECT * FROM state_entries WHERE family='root' AND key IN ('revision','updated_at') ORDER BY key").all().map(row=>({table:'state_entries',row})),...db.prepare("SELECT * FROM public_read_values WHERE family='root' AND key IN ('revision','updated_at') ORDER BY key").all().map(row=>({table:'public_read_values',row}))];
  return {...publicRows,entries,projections,roots};
}
function metadataBegin(store,loan,state){
  const members=[...(metadataRoots.get(loan.root)??[])].filter(paid=>paid.ready&&paid.used),records=canonicalProofRows(loan);
  // A cold passive census is historical DATA, never reconstructed accounting
  // custody. Cold resume/archive writes are unsupported until a separately
  // selected custody protocol can account for their new representations.
  requireProofCustody(records,members,'METADATA_COLD_REWRITE_CUSTODY_REQUIRED');
  if(!members.length)return;
  need(members.every(paid=>paid.schema===sqlSchema(loan.db)),'METADATA_SCHEMA_CHANGED');
  const ids=[...new Set(members.flatMap(paid=>[...paid.records.keys()]))];
  metadataScopes.set(loan.scope,{store,db:loan.db,root:loan.root,members,proofs:records.map(row=>({id:row.id,key:row.key})),before:metadataSQL(loan.db,ids),beforeEvent:tail(loan),copies:copyBaseline(loan.db),preparedBefore:new Map(preparedValues(state).map(row=>[row.identity,digest(row.value)]))});
}
function metadataCopyCensus(loan,members){
  const known=new Map(),ids=[];for(const paid of members){for(const id of paid.records.keys())ids.push(id);for(const [sha,body]of paid.bodies)known.set(sha,{...body,paid});}
  const needles=[...new Set([...ids,...known.keys()])];if(!needles.length)return [];
  const where=needles.map(()=> 'instr(bytes,?)>0').join(' OR ');
  const census=loan.db.prepare('SELECT COUNT(*) AS n,COALESCE(MAX(length(CAST(bytes AS BLOB))),0) AS largest FROM immutable_values WHERE '+where).get(...needles);
  need(census.n<=known.size&&census.largest<=BODY_MAX,'METADATA_UNKNOWN_BODY_COPY');
  boundSQLRows(loan.db,'immutable_values',['sha256','bytes'],where,needles,known.size,SQL_CAPS.immutable);
  const rows=loan.db.prepare('SELECT sha256,bytes FROM immutable_values WHERE '+where+' ORDER BY sha256').all(...needles);
  for(const row of rows){const body=known.get(row.sha256);need(body&&row.bytes===body.text&&hash(row.bytes)===row.sha256&&sqlRowBytes('immutable_values',row)<=SQL_CAPS.immutable,'METADATA_UNKNOWN_BODY_COPY');}
  // A new alias/reference to an old proof body is a new A copy too. Only the
  // fixed current header key may refer to it in canonical/public tables.
  if(known.size){const marks=[...known].map(()=>'?').join(',');boundSQLRows(loan.db,'state_entries',SQL_COLUMNS.state_entries,'sha256 IN ('+marks+')',[...known.keys()],64,SQL_CAPS.entry);const aliases=loan.db.prepare('SELECT * FROM state_entries WHERE sha256 IN ('+marks+')').all(...known.keys());
    for(const row of aliases){const body=known.get(row.sha256);need(row.family==='records'&&row.key===body.id,'METADATA_UNKNOWN_BODY_REFERENCE');}}
  boundSQLRows(loan.db,'public_read_values',SQL_COLUMNS.public_read_values,where,needles,ids.length,SQL_CAPS.projection);
  const publicCopies=loan.db.prepare('SELECT family,key,bytes FROM public_read_values WHERE '+where).all(...needles);
  need(publicCopies.length<=ids.length,'METADATA_UNKNOWN_PUBLIC_COPY');for(const row of publicCopies)need(row.family==='records'&&ids.includes(row.key),'METADATA_UNKNOWN_PUBLIC_COPY');
  return rows;
}
function validateMetadataCommit(store,loan,eventScope){
  const scope=metadataScopes.get(loan.scope);if(!scope)return;
  need(scope.store===store&&scope.db===loan.db&&scope.members.every(paid=>paid.schema===sqlSchema(loan.db)),'METADATA_COMMIT_SCOPE');
  const members=[...(metadataRoots.get(loan.root)??[])].filter(paid=>paid.ready&&paid.used),allIds=[...new Set(members.flatMap(paid=>[...paid.records.keys()]))],canonical=canonicalProofRows(loan),ids=canonical.map(row=>row.id);
  // A previously committed proof cannot disappear by becoming an ordinary
  // Core body (or losing its canonical row) in an omitted selected projection.
  for(const prior of scope.proofs)need(canonical.some(row=>row.key===prior.key&&row.id===prior.id),'METADATA_CANONICAL_REFERENCE');
  if(eventScope?.metadata){const produced=eventScope.metadata.bodies.get(eventScope.recordSha);need(produced&&canonical.some(row=>row.id===produced.id&&row.sha256===eventScope.recordSha),'METADATA_CANONICAL_REFERENCE');}
  for(const row of canonical)need(row.key===row.id,'METADATA_UNKNOWN_BODY_REFERENCE');
  requireProofCustody(canonical,members,'METADATA_CANONICAL_REFERENCE',eventScope);
  const actual=metadataSQL(loan.db,ids),copies=metadataCopyCensus(loan,members),owner=eventScope?.metadata??null;
  const newEvents=loan.db.prepare('SELECT COUNT(*) AS n FROM events WHERE seq>?').get(scope.beforeEvent);need(newEvents.n===1,'METADATA_EVENT_CARDINALITY');
  const needles=[...new Set([...allIds,...members.flatMap(paid=>[...paid.bodies.keys()])])];
  if(!owner&&needles.length){const count=loan.db.prepare('SELECT COUNT(*) AS n FROM events WHERE seq>? AND ('+needles.map(()=> 'instr(value,?)>0').join(' OR ')+')').get(scope.beforeEvent,...needles);need(count.n===0,'METADATA_UNKNOWN_EVENT_COPY');}
  const bodies=new Map();
  for(const row of actual.entries){const paid=members.find(item=>item.records.has(row.key)),body=paid?.bodies.get(row.sha256),projected=loan.state?.records?.[row.key];need(body?.id===row.key&&(!Object.hasOwn(loan.state?.records??{},row.key)||digest(projected)===row.sha256)&&row.encoding==='json'&&sqlRowBytes('state_entries',row)<=SQL_CAPS.entry,'METADATA_CANONICAL_REFERENCE');bodies.set(row.key,JSON.parse(body.text));}
  for(const row of actual.projections){const record=bodies.get(row.key);need(record&&row.bytes===JSON.stringify(publicIndexValue('records',record))&&row.value_id_sha256===digest(record.id)&&row.sha256===digest([row.family,row.key,row.position,row.bytes,row.value_id_sha256])&&sqlRowBytes('public_read_values',row)<=SQL_CAPS.projection,'METADATA_PUBLIC_PROJECTION');}
  need(actual.entries.length===ids.length&&actual.projections.length===ids.length,'METADATA_MISSING_COPY');
  classifyNewCopies(loan,scope,members,owner);
  const changedReferences=changedRows('public_read_rows',scope.before.references,actual.references),catalogueChanged=JSON.stringify(scope.before.catalogue)!==JSON.stringify(actual.catalogue),rootsChanged=JSON.stringify(scope.before.roots)!==JSON.stringify(actual.roots);
  if(owner){
    const body=owner.bodies.get(eventScope.recordSha);need(body&&!owner.recordEvents.has(eventScope.recordSha),'METADATA_RECORD_EVENT_SPENT');
    const event=loan.db.prepare('SELECT seq,at,type,value FROM events WHERE seq=?').get(eventScope.seq),tuple=event&&[event.seq,event.at,event.type,event.value];
    const costs={immutable:sqlRowBytes('immutable_values',{sha256:eventScope.recordSha,bytes:body.text}),entry:sqlRowsBytes('state_entries',actual.entries.filter(row=>row.key===body.id)),projection:sqlRowsBytes('public_read_values',actual.projections.filter(row=>row.key===body.id)),references:sqlRowsBytes('public_read_rows',changedReferences),catalogue:rowsBytes(actual.catalogue),roots:rootsChanged?rootRowsBytes(actual.roots):0,event:rowBytes(tuple)};
    for(const [kind,n]of Object.entries(costs))need(n<=SQL_CAPS[kind],'METADATA_'+kind.toUpperCase()+'_ALLOWANCE');
    owner.recordEvents.add(eventScope.recordSha);for(const [kind,n]of Object.entries(costs))owner.actual[kind]+=n;
  }else{
    const proofReferences=changedReferences.filter(row=>ids.includes(row.key)||ids.some(id=>row.id===JSON.stringify(id)||row.key_sha256===digest(id)));
    if(!catalogueChanged&&!proofReferences.length)return;
    const paid=members.find(item=>item.controls<CONTROL_MAX);need(paid,'METADATA_CONTROL_ALLOWANCE');
    const costs={references:sqlRowsBytes('public_read_rows',proofReferences),catalogue:catalogueChanged?rowsBytes(actual.catalogue):0,roots:rootsChanged?rootRowsBytes(actual.roots):0};
    for(const [kind,n]of Object.entries(costs))need(n<=CONTROL_CAPS[kind],'METADATA_CONTROL_'+kind.toUpperCase()+'_ALLOWANCE');
    paid.controls++;paid.actual.controls+=Object.values(costs).reduce((a,b)=>a+b,0);for(const [kind,bytes]of Object.entries(costs))paid.actual['control_'+kind]+=bytes;
  }
  // Historical whole header rows remain charged; no GC, rollback, deduplication
  // or later smaller projection returns any prepaid capacity.
  need(copies.length<=members.reduce((n,paid)=>n+paid.quote.header_revisions+paid.quote.test_guard_revisions,0),'METADATA_HISTORY_ALLOWANCE');loan.assert();
}
export function inspectComparisonEvidenceAccountingFrom(store,jobId){
  return snapshot(store,(_state,loan)=>{const paid=metadataJobs.get(metadataKey(loan.root,jobId));need(paid?.store===store&&paid.ready,'METADATA_PREPAYMENT_REQUIRED');return freeze({quote:copy(paid.quote),used:paid.used,header_postimages_attempted:paid.recordEvents.size,future_control_writes_used:paid.controls,actual:copy(paid.actual),consumption_includes_uncertain_or_rolled_back_attempts:true,charged_before_B:true,no_refund:true,physical_allocation_or_write_amplification_claim:false});});
}
function active(handle){const c=captures.get(handle);need(c&&!c.closed,'CAPTURE_CUSTODY');return c;}
function snapshot(store,fn){return store.readSnapshot(()=>{const loan=originalStoreExecutionCustodyFrom(store);loan.assert();const value=fn(store.read(),loan);loan.assert();return value;});}
const tail=loan=>{const row=loan.db.prepare('SELECT COALESCE(MAX(seq),0) AS seq FROM events').get();loan.assert();need(Number.isSafeInteger(row.seq)&&row.seq>=0,'EVENT_SEQUENCE');return row.seq;};
function eventFrom(store,seq,type){return snapshot(store,(_state,loan)=>{const event=loan.db.prepare('SELECT seq,at,type,value FROM events WHERE seq=?').get(seq);loan.assert();need(event&&event.type===type,'EVENT_COMMIT');return event;});}
function current(c){
  inspectSelectedComparisonRun(c.run);need(Date.now()<c.binding.call_policy.absolute_deadline_ms&&Date.now()<c.retentionExpiresAt,'EXPIRED');
  need(c.bound,'UNARMED');assertBoundComparisonArmFrom(c.bound,c.launch);
  if(c.pin)assertComparisonEvidencePin(c.pin);
  snapshot(c.store,state=>need(digest(state.records?.[c.record.id])===digest(c.record),'HEADER_CHANGED'));
}

export function prepareComparisonEvidenceFrom(store,run,binding,prompts,io,configuration){
  const selected=inspectSelectedComparisonRun(run),storage=inspectComparisonEvidenceStorageFrom(io);
  const metadata=metadataPrepayments.get(configuration.metadata_prepayment);need(metadata&&!metadata.used&&metadata.ready,'METADATA_PREPAYMENT_REQUIRED');metadata.used=true;
  need(metadata.store===store&&metadata.io===io&&metadata.jobId===binding.job.id&&metadata.phase===binding.phase,'METADATA_PREPAYMENT_JOIN');
  const related=configuration.related_records??[];
  const blobs=[...new Map([configuration.binding_blob,...related.map(item=>item.blob),...[prompts.canonical,prompts.encoding_instruction,prompts.actual].filter(Boolean).map(p=>p.blob)].map(blob=>[blob.ref.encoding+':'+blob.ref.sha256,blob])).values()];
  const id='issue18-wire-'+randomUUID(),created=new Date().toISOString();
  const c={store,run,binding:freeze(copy(binding)),bindingBlob:configuration.binding_blob,io,metadata,blobs,history:[],record:null,requested:null,launch:null,bound:null,requestScope:null,requestSeq:null,source:sourceHash(),pin:null,closed:false,outcome:null,eligible:false,eligibilityFailure:null,primary:null,observations:{},retentionExpiresAt:storage.expires_at_ms,testEscrow:binding.phase==='engineer'?{header_bytes:4*32768,event_bytes:2*65536,pin_copy_bytes:0}:null,testEscrowSpent:false};
  need(c.retentionExpiresAt<=Date.parse(selected.run_manifest.expires_at),'RETENTION');
  c.record={id,kind:'artifact',author_role:'runner',author_instance:binding.job.instance_id,revision:1,status:'Recorded',created_at:created,content:'Host-retained issue18 invocation evidence; no acceptance or authority.',job_id:binding.job.id,inputs:[],runtime_wire_evidence:{protocol:'issue18-runtime-wire-evidence-v1',binding:c.binding,binding_sha256:c.bindingBlob.ref.sha256,request:{canonical:prompts.canonical.prompt_ref,encoding_instruction:prompts.encoding_instruction?.prompt_ref??null,actual:prompts.actual.prompt_ref,requested_at:configuration.requested_at,effective_policy_sha256:binding.call_policy.policy_sha256,B_slot:null,retention_expires_at:new Date(c.retentionExpiresAt).toISOString(),A_capacity_reserved_bytes:storage.accounting.capacity_reserved_bytes,capture_protocol:'adapter-decoded-js-text-v1',genuine_catalog_sha256:null},state:'requested',outcome:null,derived:null,prior_record_sha256:null,revision:1,counters:{A_charged_evidence_bytes:0,B_slot_reserved_bytes:16384,manifest_share_reserved_bytes:8192,per_call_ceiling_bytes:10000000}}};
  snapshot(store,state=>{
    const job=state.jobs[binding.job.id];need(job&&job.instance_id===binding.job.instance_id,'JOB');
    // Catalog identity comes from the actual canonical job, never public output.
    need(job.model_catalog&&typeof job.model_catalog==='object','MODEL_CATALOG');
    c.record.runtime_wire_evidence.request.genuine_catalog_sha256=digest(job.model_catalog);
    for(const item of related)need(item.ref.id===state.records?.[item.ref.id]?.id&&item.ref.revision===state.records[item.ref.id].revision&&digest(state.records[item.ref.id])===item.ref.sha256&&hash(item.text)===item.ref.sha256&&item.blob.ref.sha256===item.ref.sha256,'RELATED_RECORD_CUSTODY');
  });
  c.relatedRecords=new Map(related.map(item=>[item.ref.sha256,item.text]));
  metadata.records.set(c.record.id,{family:'wire',sha:null,committedSha:null});metadata.capture=c;
  const handle=Object.freeze({});captures.set(handle,c);
  let members=runCaptures.get(run);if(!members){members=new Set();runCaptures.set(run,members);}need(members.size<8,'RUN_CAPTURE_LIMIT');members.add(handle);
  const key=store.root+'\0'+binding.job.id;need(!producedCalls.has(key),'JOB_CAPTURE_SPENT');producedCalls.set(key,handle);return handle;
}

function stage(c,store,state,record){
  const loan=originalStoreExecutionCustodyFrom(store);loan.assert();
  need(store===c.store&&loan.mode==='write'&&loan.state===state&&loan.type===eventTypes[wire(record).state],'ACTUAL_WRITE');
  const previous=state.records[record.id];
  need(c.record.id===record.id&&(record.revision===1?!previous:digest(previous)===digest(c.record)),'HEADER_PREIMAGE');
  const expected=digest(record),pending={c,scope:loan.scope,store,db:loan.db,root:loan.root,state,record,previous:previous?digest(previous):null,after:expected,seq:tail(loan)+1,type:loan.type,transactionId:'issue18-write-'+randomUUID(),eventProduced:false,committed:false};
  need(!writes.has(loan.scope),'WRITE_SPENT');writes.set(loan.scope,pending);state.records[record.id]=record;
  metadataRegister(c.metadata,record,'wire');
  if(record.revision===1){c.requestScope=loan.scope;c.requestSeq=pending.seq;}
  loan.assert();return pending;
}

/** Before E3 preparation, in the original new-request transaction. */
export function stageComparisonRequestFrom(handle,state,slotCommit){
  const c=active(handle);need(!c.requestScope&&!c.requested,'REQUEST_SPENT');
  const record=copy(c.record);record.runtime_wire_evidence.request.B_slot=copy(slotCommit);
  const catalog=record.runtime_wire_evidence.request.genuine_catalog_sha256;need(/^[a-f0-9]{64}$/.test(catalog),'CATALOG');
  prepareHeader(c,record);
  const entry=state.jobs?.[c.binding.job.id]?.model_process_tracking?.invocations?.at(-1);
  need(entry?.invocation_id===c.binding.invocation_id&&entry.requested_at===record.runtime_wire_evidence.request.requested_at&&!entry.birth&&!entry.closure,'REQUEST_JOIN');
  c.requested=record;stage(c,c.store,state,record);
}
export function inspectComparisonRequestedHeaderFrom(store,state,binding){
  const c=active(producedCalls.get(store.root+'\0'+binding.job.id)),loan=originalStoreExecutionCustodyFrom(store);
  loan.assert();need(c.store===store&&loan.state===state&&isDeepStrictEqual(c.binding,binding)&&c.requested&&digest(state.records?.[c.record.id])===digest(c.requested),'REQUEST_HEADER_CUSTODY');
  const pending=writes.get(c.requestScope);need(pending&&pending.store===store&&pending.record===c.requested,'REQUEST_HEADER_SCOPE');
  need(loan.scope===c.requestScope||pending.committed,'REQUEST_HEADER_COMMIT');
  return Object.freeze({record_id:c.requested.id,record_sha256:digest(c.requested),request_scope:c.requestScope,request_event_seq:c.requestSeq,request_event_type:'job.model_process.requested'});
}

/** Store pre-write guard. No deletion, overwrite, branch or marker-only grant. */
export function beginComparisonEvidenceWriteFrom(store,state){
  const loan=originalStoreExecutionCustodyFrom(store);loan.assert();need(loan.mode==='write'&&!preimages.has(loan.scope),'WRITE_BEGIN');
  const records=new Map();for(const record of Object.values(state?.records??{}))if(wire(record))records.set(record.id,digest(record));
  preimages.set(loan.scope,records);
  metadataBegin(store,loan,state);
  beginComparisonTestWriteFrom(store,state);
}
export function prepareComparisonEvidenceWriteFrom(store,next){
  const loan=originalStoreExecutionCustodyFrom(store);loan.assert();need(loan.mode==='write','ACTUAL_WRITE');
  const before=preimages.get(loan.scope),pending=writes.get(loan.scope);need(before,'WRITE_BEGIN');
  const ids=new Set([...before.keys(),...Object.values(next?.records??{}).filter(wire).map(record=>record.id)]);
  for(const id of ids){
    const old=before.get(id)??null,record=next?.records?.[id],after=record?digest(record):null;
    if(old===after)continue;
    need(record&&pending&&pending.store===store&&pending.after===after&&pending.record.id===id&&pending.previous===old,'UNISSUED_HEADER_WRITE');
  }
  prepareComparisonTestWriteFrom(store,next);
  classifyPreparedCopies(loan,next);
  loan.assert();
}

/** Called by the fixed Original event producer after its normal payload. */
export function comparisonEvidenceEventFrom(store,payload){
  const beforeTest=payload;
  payload=comparisonTestEventFrom(store,payload);
  const loan=originalStoreExecutionCustodyFrom(store),pending=writes.get(loan.scope);
  if(payload!==beforeTest||pending){
    let metadata=pending?.c.metadata??null,record=pending?.record??null;
    if(!pending){record=loan.state?.records?.[payload.runtime_candidate_test_guard?.record_id];const producer=record?.runtime_candidate_test_guard?.producer_evidence_record;
      metadata=[...(metadataRoots.get(loan.root)??[])].find(paid=>paid.ready&&paid.used&&paid.phase==='engineer'&&paid.records.has(producer?.id));
      need(metadata&&record,'METADATA_TEST_PREPAYMENT_REQUIRED');metadataRegister(metadata,record,'test');
    }
    eventScopes.set(loan.scope,{store,seq:tail(loan)+1,type:loan.type,metadata,recordSha:digest(record)});
  }
  if(!pending)return payload;
  need(pending.store===store&&pending.db===loan.db&&pending.root===loan.root&&pending.type===loan.type&&!pending.eventProduced,'EVENT_SCOPE');
  need(digest(loan.state.records?.[pending.record.id])===pending.after,'EVENT_HEADER');
  pending.eventProduced=true;
  const c=pending.c,e=wire(pending.record),proof={protocol:'issue18-wire-producer-transition-v1',profile_sha256:e.binding.profile_sha256,run_id:e.binding.run_id,arm_id:e.binding.arm_id,phase:e.binding.phase,binding_sha256:e.binding_sha256,invocation_id:e.binding.invocation_id,record_id:pending.record.id,before_record_sha256:pending.previous,after_record_sha256:pending.after,transition:transition[e.state],producer_source_sha256:c.source,B_slot_commit_sha256:digest(e.request.B_slot),request_event_seq:c.requestSeq,actual_store_commit_id:pending.transactionId};
  const contribution={existing_payload_without_wire_and_delta_seal_sha256:digest(payload),runtime_wire_evidence:proof};
  need(Buffer.byteLength(JSON.stringify({...payload,...contribution}))<=65536,'EVENT_LIMIT');loan.assert();return {...payload,...contribution};
}
export function validateComparisonEvidenceCommitFrom(store){
  const loan=originalStoreExecutionCustodyFrom(store),eventScope=eventScopes.get(loan.scope);
  need(loan.mode==='write','EVENT_COMMIT_SCOPE');
  if(eventScope){
    need(eventScope.store===store&&eventScope.type===loan.type,'EVENT_COMMIT_SCOPE');
    const size=loan.db.prepare('SELECT length(CAST(value AS BLOB)) AS bytes FROM events WHERE seq=?').get(eventScope.seq);need(size&&size.bytes<=65536,'COMPLETE_EVENT_ENVELOPE_CAPACITY');
    const event=loan.db.prepare('SELECT seq,at,type,value FROM events WHERE seq=?').get(eventScope.seq);
    need(event?.type===eventScope.type&&Buffer.byteLength(JSON.stringify([event.seq,event.at,event.type,event.value]))<=65536,'COMPLETE_EVENT_ENVELOPE_CAPACITY');
  }
  validateMetadataCommit(store,loan,eventScope);
  loan.assert();
}

/** Fixed E3 hook while the class-created post-COMMIT witness is live. This is
 * confirmation of the already committed write, never a COMMIT implementation. */
export function prepareComparisonEvidenceCommitFrom(store,witness){
  const facts=inspectRuntimeStoreCommitWitnessFrom(witness,store),pending=writes.get(facts.scope),eventScope=eventScopes.get(facts.scope);
  if(!pending){
    if(!eventScope?.metadata)return null;
    const body=eventScope.metadata.bodies.get(eventScope.recordSha),entry=body&&eventScope.metadata.records.get(body.id),row=body&&store.db.prepare("SELECT sha256 FROM state_entries WHERE family='records' AND key=?").get(body.id);
    need(eventScope.store===store&&body?.family==='test'&&entry?.sha===eventScope.recordSha&&row?.sha256===eventScope.recordSha,'METADATA_COMMIT_CUSTODY');
    const prepared=Object.freeze({});commitPreparations.set(prepared,{committed:false,metadataRecord:entry,after:eventScope.recordSha});return prepared;
  }
  need(pending.store===store&&pending.root===facts.root&&pending.db===store.db&&pending.eventProduced&&!pending.committed&&digest(pending.state.records[pending.record.id])===pending.after,'COMMIT_SCOPE');
  const event=store.db.prepare('SELECT seq,at,type,value FROM events WHERE seq=?').get(pending.seq),proof=event&&JSON.parse(event.value).runtime_wire_evidence;
  need(event?.type===pending.type&&proof?.after_record_sha256===pending.after&&proof.actual_store_commit_id===pending.transactionId,'COMMIT_EVENT');
  const previous=bookkeeping.get(pending.state)??bookkeeping.get(pending.state.records),proofs=new Map(previous?.proofs??[]);
  proofs.set(pending.record.id,{recordSha:pending.after,job_id:pending.record.job_id,invocation_id:wire(pending.record).binding.invocation_id,registration:pending});
  const bound={proofs,store,scope:facts.scope};bookkeeping.set(pending.state,bound);bookkeeping.set(pending.state.records,bound);
  pending.metadataRecord=pending.c.metadata.records.get(pending.record.id);need(pending.metadataRecord?.sha===pending.after,'METADATA_COMMIT_CUSTODY');
  const prepared=Object.freeze({});commitPreparations.set(prepared,pending);return prepared;
}
export function finalizeComparisonEvidenceCommitFrom(prepared){if(prepared===null)return;const pending=commitPreparations.get(prepared);if(!pending||pending.committed)return;pending.metadataRecord.committedSha=pending.after;pending.committed=true;}

export function stageComparisonObservationFrom(handle,store,state,kind){
  const c=active(handle),loan=originalStoreExecutionCustodyFrom(store);loan.assert();
  need(['birth','closure'].includes(kind)&&loan.mode==='write'&&loan.state===state&&loan.root===c.store.root&&loan.type===(kind==='birth'?'job.model_process.born':'job.model_process.closed')&&!c.observations[kind],'OBSERVATION_SCOPE');
  const entry=state.jobs?.[c.binding.job.id]?.model_process_tracking?.invocations?.at(-1);
  need(entry?.invocation_id===c.binding.invocation_id&&entry.birth&&(kind==='birth'?!entry.closure:Boolean(entry.closure)),'OBSERVATION_JOIN');
  c.observations[kind]={seq:tail(loan)+1,type:loan.type,entry_sha256:digest(entry)};loan.assert();
}

export function sealComparisonEvidenceFrom(handle,launch,bound,armCommit){
  const c=active(handle);need(!c.bound&&c.requested&&c.requestScope,'ARM_SPENT');
  const facts=inspectRuntimeModelRequestCommitFrom(launch,c.store);
  // The requested-header transaction and Original's later launch-request scope
  // are separate facts. E3 alone proves the actual cap-issuance COMMIT.
  need(facts.store===c.store&&facts.invocation_id===c.binding.invocation_id&&facts.job_id===c.binding.job.id&&armCommit.invocation_id===c.binding.invocation_id,'ARM_JOIN');
  assertBoundComparisonArmFrom(bound,launch);
  need(writes.get(c.requestScope)?.committed,'REQUEST_HEADER_COMMIT');
  const event=eventFrom(c.store,c.requestSeq,'job.model_process.requested'),value=JSON.parse(event.value),proof=value.runtime_wire_evidence;
  need(proof&&proof.after_record_sha256===digest(c.requested)&&proof.record_id===c.record.id&&proof.invocation_id===c.binding.invocation_id,'REQUEST_EVENT');
  c.record=c.requested;c.launch=launch;c.bound=bound;c.history=[JSON.stringify(c.record)];
  snapshot(c.store,state=>need(digest(state.records[c.record.id])===digest(c.record),'COMMITTED_HEADER'));
}

function prepareHeader(c,record){
  const io=inspectComparisonEvidenceStorageFrom(c.io),recorded=c.history.reduce((n,text)=>n+Buffer.byteLength(text),0);
  let size=0,text='';
  for(let i=0;i<8;i++){
    // SQL, full event envelopes and the finite future controls were prepaid
    // before B. Only the genuinely new temporary+published header blob remains.
    record.runtime_wire_evidence.counters.A_charged_evidence_bytes=io.accounting.charged_bytes+2*size;
    text=JSON.stringify(record);const next=Buffer.byteLength(text);if(next===size)break;size=next;
  }
  need(size<=32768&&record.runtime_wire_evidence.counters.A_charged_evidence_bytes<=record.runtime_wire_evidence.request.A_capacity_reserved_bytes,'HEADER_CAPACITY');
  need(sqlRowBytes('immutable_values',{sha256:hash(text),bytes:text})<=SQL_CAPS.immutable,'METADATA_IMMUTABLE_ALLOWANCE');
  const blob=captureBytes(Buffer.from(text,'utf8'),'closed-json-utf8-v1');publishComparisonEvidenceBlob(c.io,blob);
  c.blobs.push(blob);
  const charged=inspectComparisonEvidenceStorageFrom(c.io).accounting.charged_bytes;
  need(charged===record.runtime_wire_evidence.counters.A_charged_evidence_bytes,'ACCOUNTING_JOIN');
  // Keep all actual immutable header histories and exact typed captures, never
  // infer durable bytes from a string or a public persistence receipt.
  need(recorded<=65536,'HISTORY_LIMIT');
  const accounting=inspectComparisonEvidenceStorageFrom(c.io).accounting;
  const headerRows=[];for(let remaining=accounting.header_bytes;remaining>0;remaining-=32768)headerRows.push({kind:'header',bytes:Math.min(32768,remaining),copies:1});
  const inventory=[{kind:'blob',bytes:accounting.blob_staging_and_publication_bytes,copies:1},
    ...headerRows,
    ...Array.from({length:accounting.event_bytes/65536},()=>({kind:'event',bytes:65536,copies:1})),
    {kind:'other',bytes:accounting.init_bytes+accounting.pin_copy_bytes,copies:1}];
  validateEvidenceData(text,{binding_blob:c.bindingBlob,blobs:c.blobs,history:JSON.stringify(c.history),inventory:JSON.stringify(inventory)});
}
function writeTransition(c,next){
  prepareHeader(c,next);let pending;
  c.store.transaction(eventTypes[wire(next).state],state=>{pending=stage(c,c.store,state,next);return state;});
  const event=eventFrom(c.store,pending.seq,pending.type),proof=JSON.parse(event.value).runtime_wire_evidence;
  need(proof?.after_record_sha256===pending.after&&proof.actual_store_commit_id===pending.transactionId,'TRANSITION_COMMIT');
  c.record=next;c.history.push(JSON.stringify(next));
}
function observationRef(c,kind){
  const observation=c.observations[kind];if(!observation)return null;
  const event=eventFrom(c.store,observation.seq,observation.type);
  return {job_id:c.binding.job.id,invocation_id:c.binding.invocation_id,event_seq:event.seq,event_sha256:hash(JSON.stringify([event.seq,event.at,event.type,event.value])),tracking_entry_sha256:observation.entry_sha256};
}
function errorReceipt(value,origin){
  const live=keepThrownValue(value);
  return {live,data:{receipt_id:'issue18-error-'+randomUUID(),origin,thrown_kind:'unknown',live_identity:'original_value_and_cause_preserved_privately_not_reconstructable',diagnostic:{status:'not_inspected',text:null,original_utf16_units:null,truncated:false},cold_identity_claim:false}};
}

export function retainComparisonOutcomeFrom(handle,outcome){
  const c=active(handle);need(c.bound&&!c.outcome,'OUTCOME_SPENT');
  outcome=inspectRuntimeModelOutcomeCaptureFrom(outcome,c.store,c.launch);
  const provenance=outcome.provenance,input=provenance.input_binding;
  need(provenance.job_id===c.binding.job.id&&provenance.instance_id===c.binding.job.instance_id&&provenance.invocation_id===c.binding.invocation_id&&provenance.root_sha256===c.binding.store.root_sha256&&input.host===c.binding.model.host&&input.native_id===c.binding.model.native_id_requested&&input.prompt_sha256===c.binding.actual_prompt_sha256&&input.selection_sha256===c.binding.model.selection_sha256&&hash(input.cwd)===c.binding.model.cwd_sha256,'OUTCOME_REQUEST_JOIN');
  c.outcome=outcome;
  let raw=unavailableCapture(),captureError=null;
  if(outcome.kind==='threw')c.primary=errorReceipt(outcome.thrown,'provider_or_adapter');
  try{
    if(typeof outcome.text==='string'){
      const captured=captureRawText(outcome.text,{max_utf16_units:c.binding.call_policy.max_output_utf16_units});
      publishComparisonEvidenceBlob(c.io,captured.blob);c.blobs.push(captured.blob);raw=captured.raw_capture;
      c.pin=pinComparisonEvidenceFrom(c.io,[...new Map(c.blobs.map(blob=>[blob.ref.sha256,blob.ref])).values()]);
    }
  }catch(error){captureError=errorReceipt(error,'evidence_io');}
  // Currentness must be checked while the requested record is still immutable;
  // publishing its response revision intentionally changes the records binding.
  if(outcome.kind==='returned'&&!captureError){try{assertRuntimeModelOutcomeEligible(outcome);current(c);c.eligible=true;}catch(error){c.eligibilityFailure=error;}}
  const birth=observationRef(c,'birth'),close=observationRef(c,'closure');
  if(!c.primary&&!captureError&&!c.eligible)captureError=errorReceipt(c.eligibilityFailure??Error('Unavailable eligible outcome'),'binding_or_schema');
  const complete=raw.state==='complete'&&!captureError&&!c.primary&&birth&&close;
  const next=copy(c.record),e=wire(next);next.revision=2;e.revision=2;e.prior_record_sha256=digest(c.record);e.state=complete?'response_retained':'error_retained';
  const retainedBytes=raw.lossless_blob?.bytes??0;
  e.outcome={adapter_state:outcome.kind,raw,primary_error:c.primary?.data??null,capture_error:captureError?.data??null,io:{stage:'response_publish',status:raw.state==='complete'?'durable_complete':'unknown',expected_bytes:typeof outcome.text==='string'?outcome.text.length*2:null,durable_prefix_bytes:retainedBytes,error_ref:captureError?.data??null},native_id_observed:outcome.native_id??null,native_id_relation:outcome.native_id?'fresh_observed':'unavailable',physical_birth:birth,physical_close:close,private_outcome_custody_id:'issue18-outcome-'+randomUUID(),outcome_observed_at:new Date().toISOString()};
  writeTransition(c,next);
  if(captureError)throw readThrownValue(captureError.live);
  if(c.eligibilityFailure!==null)throw c.eligibilityFailure;
}
export function assertComparisonEvidenceOutcomeEligibleFrom(handle){const c=active(handle);need(c.eligible&&wire(c.record).state==='response_retained'&&c.pin,'OUTCOME_INELIGIBLE');current(c);}
export function assertComparisonEvidenceCurrentFrom(handle){const c=active(handle);need(c.eligible,'OUTCOME_INELIGIBLE');current(c);}
export function comparisonEvidenceProcessClosedFrom(handle,birth,receipt){
  const c=active(handle);if(!c.outcome)return false;
  const outcome=inspectRuntimeModelOutcomeCaptureFrom(c.outcome,c.store,c.launch),physical=outcome.process;
  if(!physical.closed||!physical.birth||!physical.receipt||digest(birth)!==digest(physical.birth)||digest(receipt)!==digest(physical.receipt))return false;
  return snapshot(c.store,state=>{
    const job=state.jobs?.[c.binding.job.id],entry=job?.model_process_tracking?.invocations?.find(item=>item.invocation_id===c.binding.invocation_id);
    return Boolean(job?.instance_id===c.binding.job.instance_id&&entry&&digest(entry.birth)===digest(physical.birth)&&digest(entry.closure)===digest(physical.receipt)&&job.model_process_tracking.invocations.every(item=>item.birth&&item.closure));
  });
}

export function retainComparisonDerivedFrom(handle,result){
  const c=active(handle);assertComparisonEvidenceOutcomeEligibleFrom(handle);need(wire(c.record).revision===2&&typeof result.original_text==='string','DERIVED_SPENT');
  need(c.outcome.text===result.original_text,'RAW_IDENTITY');
  const identity=c.binding.codec_mode==='identity';let normalized=wire(c.record).outcome.raw.lossless_blob;
  if(!identity){const blob=captureBytes(Buffer.from(result.normalized_text,'utf8'),'closed-json-utf8-v1');publishComparisonEvidenceBlob(c.io,blob);c.blobs.push(blob);normalized=blob.ref;}
  const artifact=identity?JSON.parse(result.original_text):result.normalization?.artifact;
  const blocked=Boolean(artifact?.blocked)||result.normalization?.status==='PRODUCER_BLOCKED';
  const format=c.binding.phase==='engineer'&&!blocked?c.binding.plan.output_format:'none',files=format==='none'?null:artifact?.[format]??null;
  const next=copy(c.record),e=wire(next);next.revision=3;e.revision=3;e.state='derived';e.prior_record_sha256=digest(c.record);
  e.derived={codec_outcome:blocked?'blocked':'normalized',raw_lossless_sha256:e.outcome.raw.lossless_blob.sha256,normalization_source_sha256:c.binding.source.codec_module_sha256,normalized_artifact:blocked?null:normalized,generated_format:format,generated_files_or_patches_utf8_bytes:files?Buffer.byteLength(JSON.stringify(files)):null,generated_files_or_patches_sha256:files?digest(files):null,emitted_body_utf8_bytes:format==='files'&&files?files.reduce((n,file)=>n+Buffer.byteLength(file.content),0):null,complete_candidate_utf8_bytes:null,complete_candidate_sha256:null,reason_code:blocked?'PRODUCER_BLOCKED':'NORMALIZED_PENDING_EXISTING_CONSUMER',native_fidelity_or_acceptance_claim:false,normalization_kind:identity?'identity_exact_text':'codec_json'};
  current(c);writeTransition(c,next);
}

/** Passive census of actual stored bytes/events. A cold reference inventory is
 * not a restored run, live outcome, retention pin or acceptance capability. */
export function validateStoredComparisonEvidenceFrom(actualStore,state,record){
  const loan=originalStoreExecutionCustodyFrom(actualStore);loan.assert();
  validateEvidenceRecordShapeData(JSON.stringify(record));
  const e=wire(record),handle=producedCalls.get(loan.root+'\0'+record.job_id),c=handle?captures.get(handle):null;
  const pending=writes.get(loan.scope),isPending=pending?.record.id===record.id&&pending.after===digest(record)&&loan.state===pending.state;
  const rows=loan.db.prepare("SELECT seq,at,type,value FROM events WHERE json_extract(value,'$.runtime_wire_evidence.record_id')=? ORDER BY seq").all(record.id);
  const expected=record.revision-(isPending?1:0);need(rows.length>=expected&&expected>=0,'COLD_EVENT_HISTORY');
  let previous=null;
  for(let i=0;i<expected;i++){
    const row=rows[i],p=JSON.parse(row.value).runtime_wire_evidence;
    need(p?.protocol==='issue18-wire-producer-transition-v1'&&p.record_id===record.id&&p.before_record_sha256===previous&&p.binding_sha256===e.binding_sha256&&p.invocation_id===e.binding.invocation_id&&p.profile_sha256===e.binding.profile_sha256&&p.run_id===e.binding.run_id&&p.arm_id===e.binding.arm_id&&p.phase===e.binding.phase&&p.B_slot_commit_sha256===digest(e.request.B_slot)&&/^[a-f0-9]{64}$/.test(p.producer_source_sha256),'COLD_EVENT_JOIN');
    need(row.type===(i===0?eventTypes.requested:i===1?[eventTypes.response_retained,eventTypes.error_retained].find(type=>type===row.type):eventTypes.derived),'COLD_EVENT_ORDER');
    previous=p.after_record_sha256;
  }
  need(isPending?pending.previous===previous:previous===digest(record),'COLD_RECORD_HASH');
  const history=[],historyBodies=[],seen=new Set();let cursor=record;
  for(let i=record.revision-1;i>=0;i--){
    const text=JSON.stringify(cursor),sha=digest(cursor);need(!seen.has(sha),'COLD_HISTORY_CYCLE');seen.add(sha);
    history.unshift({id:cursor.id,revision:cursor.revision,sha256:sha,bytes:Buffer.byteLength(text),object_name:'objects/'+sha+'.blob'});
    historyBodies.unshift(cursor);
    if(i===0){need(wire(cursor).prior_record_sha256===null,'COLD_HISTORY_START');break;}
    const prior=wire(cursor).prior_record_sha256;
    let raw=c?.history.find(value=>hash(value)===prior);
    if(raw===undefined&&loan.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='immutable_values'").get())raw=loan.db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(prior)?.bytes;
    need(typeof raw==='string'&&hash(raw)===prior,'COLD_HISTORY_UNAVAILABLE');cursor=JSON.parse(raw);validateEvidenceRecordShapeData(raw);
    need(cursor.id===record.id&&cursor.revision===i&&wire(cursor).binding_sha256===e.binding_sha256,'COLD_HISTORY_JOIN');
  }
  for(let i=0;i<history.length;i++){
    const body=historyBodies[i],entry=wire(body),prior=i?historyBodies[i-1]:null;
    need(body.revision===i+1&&entry.revision===i+1&&entry.binding_sha256===entry.request.B_slot.binding_sha256,'COLD_HISTORY_REVISION');
    const eventHash=i<expected?JSON.parse(rows[i].value).runtime_wire_evidence.after_record_sha256:pending.after;
    need(eventHash===history[i].sha256,'COLD_EVENT_HEADER_JOIN');
    if(!prior){need(entry.state==='requested'&&entry.prior_record_sha256===null,'COLD_HISTORY_START');continue;}
    for(const key of ['id','kind','author_role','author_instance','status','created_at','content','job_id','inputs'])need(digest(body[key])===digest(prior[key]),'COLD_IMMUTABLE_HEADER');
    for(const key of ['protocol','binding','binding_sha256','request'])need(digest(entry[key])===digest(wire(prior)[key]),'COLD_IMMUTABLE_REQUEST');
    need(entry.prior_record_sha256===history[i-1].sha256&&entry.counters.A_charged_evidence_bytes>=wire(prior).counters.A_charged_evidence_bytes&&entry.counters.per_call_ceiling_bytes===wire(prior).counters.per_call_ceiling_bytes,'COLD_HISTORY_ACCOUNT');
    if(i===1)need(['response_retained','error_retained'].includes(entry.state),'COLD_HISTORY_TRANSITION');
    else need(wire(prior).state==='response_retained'&&entry.state==='derived'&&digest(entry.outcome)===digest(wire(prior).outcome),'COLD_IMMUTABLE_OUTCOME');
  }
  const refs=[e.request.canonical.blob,e.request.encoding_instruction?.blob,e.request.actual.blob,e.outcome?.raw.lossless_blob,e.derived?.normalized_artifact].filter(Boolean);
  const recordReferences=[{id:e.binding.plan.id,revision:e.binding.plan.revision,sha256:e.binding.plan.record_sha256},e.binding.job.review_of].filter(Boolean);
  for(const reference of recordReferences){
    let text=c?.relatedRecords?.get(reference.sha256);
    if(text===undefined&&loan.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='immutable_values'").get())text=loan.db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(reference.sha256)?.bytes;
    if(text===undefined&&digest(state?.records?.[reference.id]??null)===reference.sha256)text=JSON.stringify(state.records[reference.id]);
    need(typeof text==='string'&&hash(text)===reference.sha256,'COLD_RELATED_RECORD_UNAVAILABLE');const original=JSON.parse(text);need(original.id===reference.id&&original.revision===reference.revision,'COLD_RELATED_RECORD_JOIN');
  }
  // Routine snapshots census metadata without re-reading every external body.
  // Only the live pin/effect boundaries below make a physical-custody claim.
  const physical=false,physicalStatus='NOT_INSPECTED_PASSIVE_CENSUS';
  loan.assert();return freeze({recordSha:digest(record),job_id:record.job_id,invocation_id:e.binding.invocation_id,references:[...new Map(refs.map(ref=>[ref.encoding+':'+ref.sha256,copy(ref)])).values()],record_references:recordReferences,history,physical_objects_verified:physical,physical_status:physicalStatus,scope:isPending?'ACTUAL_PENDING_SOURCE_WRITE_DATA':'PASSIVE_STORED_HISTORY_NOT_AUTHORITY'});
}

/** Only actual Store snapshot binding installs proof bookkeeping. Complete
 * physical objects remain mandatory when a live acceptance pin is requested. */
function bindWireBookkeepingFrom(store,state){
  if(!state?.records||!Object.values(state.records).some(wire))return;
  let loan;try{loan=originalStoreExecutionCustodyFrom(store);}catch{return;}
  const proofs=new Map();
  for(const record of Object.values(state.records).filter(wire)){
    validateStoredComparisonEvidenceFrom(store,state,record);
    const e=wire(record);need(record.job_id===e.binding?.job.id&&record.author_instance===e.binding.job.instance_id&&record.revision===e.revision,'CENSUS_HEADER');
    const rows=loan.db.prepare("SELECT seq,at,type,value FROM events WHERE json_extract(value,'$.runtime_wire_evidence.record_id')=? ORDER BY seq").all(record.id);
    need(rows.length===record.revision&&rows.length<=3,'CENSUS_HISTORY');let previous=null;
    for(let i=0;i<rows.length;i++){
      const row=rows[i],proof=JSON.parse(row.value).runtime_wire_evidence;
      need(proof?.protocol==='issue18-wire-producer-transition-v1'&&proof.before_record_sha256===previous&&proof.invocation_id===e.binding.invocation_id&&proof.binding_sha256===e.binding_sha256&&proof.record_id===record.id&&row.type===Object.values(eventTypes).find(type=>type===row.type),'CENSUS_TRANSITION');
      previous=proof.after_record_sha256;
    }
    need(previous===digest(record),'CENSUS_CURRENT');proofs.set(record.id,{recordSha:previous,job_id:record.job_id,invocation_id:e.binding.invocation_id});
  }
  loan.assert();bookkeeping.set(state,{proofs,store,scope:loan.scope,assert:loan.assert});bookkeeping.set(state.records,{proofs,store,scope:loan.scope,assert:loan.assert});
}
export function bindComparisonEvidenceBookkeepingFrom(store,state){bindWireBookkeepingFrom(store,state);bindComparisonTestBookkeepingFrom(store,state);}
export function inspectComparisonEvidenceRecordFrom(state,record){
  if(!wire(record))return null;
  const bound=bookkeeping.get(state)??bookkeeping.get(state?.records),proof=bound?.proofs.get(record.id);
  // This is retained historical snapshot provenance, not a live Store loan or
  // acceptance permission. Copying JSON cannot copy its private bookkeeping.
  need(proof&&proof.recordSha===digest(record)&&(!proof.registration||proof.registration.committed),'CENSUS_CUSTODY');
  return freeze({recordSha:proof.recordSha,job_id:proof.job_id,invocation_id:proof.invocation_id});
}
function produced(run,store,jobId){
  const handle=producedCalls.get(store.root+'\0'+jobId),c=active(handle);need(c.run===run&&c.store===store&&c.eligible&&wire(c.record).state==='derived','PRODUCED_CUSTODY');
  inspectSelectedComparisonRun(run);assertComparisonEvidencePin(c.pin);
  snapshot(store,state=>{const job=state.jobs?.[jobId];need(job?.status==='completed'&&job.native_id===c.outcome.native_id&&job.instance_id===c.binding.job.instance_id&&state.records?.[job.artifact_id]?.job_id===jobId&&digest(state.records[c.record.id])===digest(c.record),'PRODUCED_JOB');});
  return c;
}
export function comparisonProducedEvidenceFrom(run,store,jobId){const c=produced(run,store,jobId);return freeze({id:c.record.id,revision:c.record.revision,sha256:digest(c.record)});}
export function comparisonProducedArmFrom(run,store,jobId){return produced(run,store,jobId).bound;}
export function chargeComparisonTestEvidenceFrom(run,store,jobId,charges){
  const c=produced(run,store,jobId);need(c.testEscrow&&!c.testEscrowSpent,'TEST_ESCROW_SPENT');
  for(const key of ['header_bytes','event_bytes','pin_copy_bytes'])need(Number.isSafeInteger(charges?.[key])&&charges[key]>=0&&charges[key]<=c.testEscrow[key],'TEST_ESCROW');
  c.testEscrowSpent=true;return inspectComparisonEvidenceStorageFrom(c.io).accounting;
}
export function assertComparisonAcceptanceFrom(store,state,candidateId,qaRecordId){
  const candidate=state.records?.[candidateId],qa=state.records?.[qaRecordId];
  for(const jobId of [candidate?.job_id,qa?.job_id].filter(Boolean)){
    const handle=producedCalls.get(store.root+'\0'+jobId);if(!handle)continue;
    const c=active(handle),loan=originalStoreExecutionCustodyFrom(store);loan.assert();
    need(loan.state===state&&c.eligible&&wire(c.record).state==='derived'&&digest(state.records[c.record.id])===digest(c.record),'ACCEPTANCE_JOIN');
    inspectSelectedComparisonRun(c.run);assertComparisonEvidencePin(c.pin);
    need(Date.now()<c.retentionExpiresAt&&Date.now()<c.binding.call_policy.authority_expiry_ms,'ACCEPTANCE_EXPIRED');loan.assert();
  }
}
export function closeComparisonEvidenceFrom(handle){const c=active(handle);c.closed=true;if(c.pin)releaseComparisonEvidencePin(c.pin);closeComparisonEvidenceStorage(c.io);}
export function closeComparisonEvidenceRunFrom(run){const members=runCaptures.get(run);if(!members)return;const failures=[];for(const handle of members){const c=captures.get(handle);if(c&&!c.closed)try{closeComparisonEvidenceFrom(handle);}catch(error){failures.push(error);}}if(failures.length)throw new AggregateError(failures,'Comparison evidence close incomplete');}
