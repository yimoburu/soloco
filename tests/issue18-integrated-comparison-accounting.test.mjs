// SOURCE-only accounting graph. SQLite rows/index projections are real in-memory
// SQL. Store custody, AIO charging and the private header/event producer are
// explicitly controlled VM dependencies. These tokens cannot enter the real
// issuers; these checks prove no filesystem, model, Native or COMMIT authority.
// The separate composed worker checks cover genuine Store/AIO/producer joins.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {writeNormalized} from '../plugins/soloco/runtime/record-storage.mjs';
import {publicIndexValue} from '../plugins/soloco/runtime/state-projections.mjs';

const filename=fileURLToPath(new URL('../plugins/soloco/runtime/integrated-comparison-evidence.mjs',import.meta.url));
const source=fs.readFileSync(filename,'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex'),digest=value=>hash(JSON.stringify(value)),copy=value=>JSON.parse(JSON.stringify(value));
const held=code=>error=>error?.code==='ISSUE18_EVIDENCE_'+code;
function fixture(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec(`CREATE TABLE company(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);
    CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,type TEXT NOT NULL,value TEXT NOT NULL);
    CREATE TABLE company_layout(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
    CREATE TABLE immutable_values(sha256 TEXT PRIMARY KEY,bytes TEXT NOT NULL);
    CREATE TABLE state_entries(family TEXT NOT NULL,key TEXT NOT NULL,position INTEGER NOT NULL,sha256 TEXT NOT NULL REFERENCES immutable_values(sha256),encoding TEXT NOT NULL DEFAULT 'json',PRIMARY KEY(family,key));
    CREATE INDEX state_entries_order ON state_entries(family,position);
    INSERT INTO company_layout VALUES(1,4);
    CREATE TRIGGER fence_legacy_update BEFORE UPDATE ON company BEGIN SELECT RAISE(ABORT,'Legacy writer fenced: normalized company storage'); END;
    CREATE TRIGGER fence_legacy_delete BEFORE DELETE ON company BEGIN SELECT RAISE(ABORT,'Legacy writer fenced: normalized company storage'); END;
    CREATE TRIGGER fence_legacy_insert BEFORE INSERT ON company BEGIN SELECT RAISE(ABORT,'Legacy writer fenced: normalized company storage'); END;`);
  let state={id:'SOURCE-only-accounting-company',name:'Disposable accounting rows',owner:{host:'codex',session_id:'fictional',epoch:1},revision:0,updated_at:'2026-11-14T00:00:00.000Z',
    records:{core:{id:'core',kind:'artifact',status:'Recorded',content:'Independent Core fixture; never a model result.',created_at:'2000-01-01T00:00:00.000Z'}},jobs:{engineer:{id:'engineer',role:'engineer',status:'running'}},sessions:{},notices:[],messages:[]};
  writeNormalized(db,state);
  let scope=Object.freeze({}),mode='read',type='snapshot',charges=0,charged=0;
  const io=Object.freeze({}),root='/SOURCE-only-accounting-root',store={root,db,read:()=>state,readSnapshot:operation=>operation()};
  const deps={fs,fileURLToPath,createHash,randomUUID,Buffer,publicIndexValue,
    originalStoreExecutionCustodyFrom(subject){assert.equal(subject,store,'Declared VM Store only');return {store,db,root,scope,state,mode,type,assert(){}};},
    inspectComparisonEvidenceStorageFrom(handle){assert.equal(handle,io);return {phase:'engineer',accounting:{charged_bytes:charged,capacity_reserved_bytes:9975424}};},
    chargeComparisonEvidenceMetadata(handle,increment){assert.equal(handle,io);assert.equal(increment.pin_copy_bytes,0);charged+=increment.header_bytes+increment.event_bytes;charges++;},
    beginComparisonTestWriteFrom(){},prepareComparisonTestWriteFrom(){},
    comparisonTestEventFrom(_store,payload){return payload;},bindComparisonTestBookkeepingFrom(){},
    __scope:()=>scope,__store:store
  };
  const body=source.replace(/^import [^\n]+;\n/gm,'').replace(/^export (?=function )/gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('../plugins/soloco/runtime/integrated-comparison-evidence.mjs',import.meta.url).href));
  const api=vm.runInContext(body+`\n;({comparisonEvidenceMetadataReservation,preflightComparisonEvidenceMetadataFrom,prepayComparisonEvidenceMetadataFrom,assertComparisonEvidencePrepaymentFrom,beginComparisonEvidenceWriteFrom,validateComparisonEvidenceCommitFrom,inspectComparisonEvidenceAccountingFrom,
    activate(token,record){const paid=metadataPrepayments.get(token);need(paid&&!paid.used,'TEST_VM_TOKEN');paid.used=true;metadataRegister(paid,record,'wire');},
    register(token,record,family='wire'){metadataRegister(metadataPrepayments.get(token),record,family);},
    headerEvent(token,record,seq){const paid=metadataPrepayments.get(token);eventScopes.set(__scope(),{store:__store,seq,type:'job.model_process.requested',metadata:paid,recordSha:digest(record)});}
  });`,vm.createContext(deps),{filename:'SOURCE-only-accounting-graph.mjs',timeout:1000});
  const input={job_id:'engineer',phase:'engineer'};
  function prepay(){return api.prepayComparisonEvidenceMetadataFrom(store,io,input);}
  function record(revision=1){return {id:'issue18-wire-FICTIONAL',kind:'artifact',revision,status:'Recorded',created_at:'2026-11-14T00:00:00.000Z',content:'Whole retained body '+revision+' '+('X'.repeat(8000))};}
  function transaction(change,{header=null,token=null,eventValue={independent_core_event:true},afterWrite=null}={}){
    const before=copy(state);scope=Object.freeze({});mode='write';type=header?'job.model_process.requested':'fictional.core-metadata-control';db.exec('BEGIN IMMEDIATE');
    try{
      api.beginComparisonEvidenceWriteFrom(store,state);change(state);state.revision++;state.updated_at=new Date(1800000000000+state.revision).toISOString();
      writeNormalized(db,state);afterWrite?.(db);
      const seq=db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS n FROM events').get().n;
      if(header)api.headerEvent(token,header,seq);
      db.prepare('INSERT INTO events VALUES(?,?,?,?)').run(seq,new Date().toISOString(),type,JSON.stringify(eventValue));
      api.validateComparisonEvidenceCommitFrom(store);db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');state=before;throw error;}finally{mode='read';type='snapshot';scope=Object.freeze({});}
  }
  function first(){const token=prepay(),header=record();api.activate(token,header);transaction(s=>{s.records[header.id]=header;},{header,token,eventValue:{controlled_header_reference:header.id}});return {token,header};}
  return {db,api,store,io,input,prepay,record,transaction,first,state:()=>state,charges:()=>charges,charged:()=>charged,accounting:()=>api.inspectComparisonEvidenceAccountingFrom(store,'engineer')};
}

test('the finite quote names each whole row/key purpose and preserves engineer/QA ceilings',t=>{
  const f=fixture(t),engineer=f.api.comparisonEvidenceMetadataReservation('engineer'),qa=f.api.comparisonEvidenceMetadataReservation('qa');
  assert.equal(engineer.total_bytes,1056384);assert.equal(engineer.header_bytes,728704);assert.equal(engineer.event_bytes,327680);
  assert.equal(qa.total_bytes,738688);assert.equal(qa.header_bytes,542080);assert.equal(qa.event_bytes,196608);
  assert.equal(engineer.header_revisions,3);assert.equal(engineer.test_guard_revisions,2);assert.equal(qa.test_guard_revisions,0);assert.equal(engineer.future_control_writes,32);
  assert.equal(engineer.inventory.reduce((n,row)=>n+row.maximum_bytes*row.multiplicity,0),engineer.total_bytes);
  assert(engineer.inventory.some(row=>row.purpose.includes('index')));assert(engineer.inventory.some(row=>row.purpose.includes('whole rewritten public_read_catalog')));assert(Object.isFrozen(engineer.inventory));
  assert.throws(()=>f.api.comparisonEvidenceMetadataReservation('research'),held('METADATA_PHASE'));assert.equal(f.charges(),0);
});
test('an unselected future SQL index Holds in preflight before any IO prepayment',t=>{
  const f=fixture(t);f.db.exec('CREATE INDEX unselected_body_copy ON immutable_values(bytes)');
  assert.throws(()=>f.api.preflightComparisonEvidenceMetadataFrom(f.store,f.input),held('METADATA_INDEX_SCHEMA'));assert.equal(f.charges(),0);
});
test('an oversized whole public catalogue Holds before IO prepayment',t=>{
  const f=fixture(t),bytes=JSON.stringify({version:1,collections:{},usage:{padding:'X'.repeat(4096)},claims:0,exports:0});
  f.db.prepare('UPDATE public_read_catalog SET bytes=?,sha256=?').run(bytes,hash(bytes));
  assert.throws(()=>f.api.preflightComparisonEvidenceMetadataFrom(f.store,f.input),held('METADATA_CATALOGUE_CAPACITY'));assert.equal(f.charges(),0);
});
test('cold proof-shaped JSON cannot borrow a new private accounting allowance',t=>{
  const f=fixture(t);f.state().records.cold={id:'cold',kind:'artifact',runtime_wire_evidence:{copied_DATA_only:true}};writeNormalized(f.db,f.state());
  assert.throws(()=>f.api.preflightComparisonEvidenceMetadataFrom(f.store,f.input),held('METADATA_EXISTING_PROOF_CUSTODY'));assert.equal(f.charges(),0);
});
test('cold A-bearing writes Hold before the mutation while passive historical SQL remains readable',t=>{
  const f=fixture(t);f.state().records.cold={id:'cold',kind:'artifact',runtime_wire_evidence:{copied_DATA_only:true}};writeNormalized(f.db,f.state());let entered=false;
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM state_entries WHERE family='records' AND key='cold'").get().n,1);
  assert.throws(()=>f.transaction(()=>{entered=true;}),held('METADATA_COLD_REWRITE_CUSTODY_REQUIRED'));assert.equal(entered,false);assert.equal(f.charges(),0);
});
test('metadata-free ordinary Core writes acquire no comparison prepayment or additional Hold',t=>{
  const f=fixture(t);f.transaction(s=>{s.name='Still independent Core metadata';});
  assert.equal(f.state().name,'Still independent Core metadata');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM events').get().n,1);assert.equal(f.charges(),0);
});
test('prepayment is irreversible, finite and not repeated by a second call',t=>{
  const f=fixture(t),quote=f.api.preflightComparisonEvidenceMetadataFrom(f.store,f.input),token=f.prepay();
  assert.equal(Object.keys(token).length,0);assert.equal(f.charged(),quote.total_bytes);assert.equal(f.charges(),1);
  assert.throws(()=>f.prepay(),held('METADATA_PREPAYMENT_SPENT'));assert.equal(f.charges(),1);assert.equal(f.accounting().no_refund,true);
});
test('the fixed before-B check requires the exact IO/Store/job prepayment and rejects its reused state',t=>{
  const f=fixture(t),input={actualStore:f.store,job_id:'engineer',phase:'engineer'};
  assert.throws(()=>f.api.assertComparisonEvidencePrepaymentFrom(f.io,input),held('METADATA_BEFORE_B_PREPAYMENT_REQUIRED'));
  const token=f.prepay();assert.equal(f.api.assertComparisonEvidencePrepaymentFrom(f.io,input),true);
  assert.throws(()=>f.api.assertComparisonEvidencePrepaymentFrom({...f.io},input),held('METADATA_BEFORE_B_PREPAYMENT_REQUIRED'));
  assert.throws(()=>f.api.assertComparisonEvidencePrepaymentFrom(f.io,{...input,actualStore:{...f.store}}),held('METADATA_BEFORE_B_PREPAYMENT_REQUIRED'));
  f.api.activate(token,f.record());assert.throws(()=>f.api.assertComparisonEvidencePrepaymentFrom(f.io,input),held('METADATA_BEFORE_B_PREPAYMENT_REQUIRED'));
});
test('real SQL whole bodies, small public projections, index keys, catalogue and event are separately censused',t=>{
  const f=fixture(t),{header}=f.first(),inventory=f.accounting();
  assert.equal(inventory.header_postimages_attempted,1);assert(inventory.actual.immutable>Buffer.byteLength(JSON.stringify(header)));
  assert(inventory.actual.projection>0&&inventory.actual.projection<inventory.actual.immutable);assert(inventory.actual.entry>0);assert(inventory.actual.references>0);assert(inventory.actual.catalogue>0);assert(inventory.actual.roots>0);assert(inventory.actual.event>0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM immutable_values WHERE sha256=?').get(digest(header)).n,1);
  const projected=f.db.prepare("SELECT bytes FROM public_read_values WHERE family='records' AND key=?").get(header.id).bytes;assert(!projected.includes(header.content));
  assert.equal(f.charges(),1);assert.equal(f.charged(),inventory.quote.total_bytes);assert.equal(inventory.physical_allocation_or_write_amplification_claim,false);
});
test('an extra wrapped immutable header copy cannot borrow a Core namespace exemption',t=>{
  const f=fixture(t),token=f.prepay(),header=f.record();f.api.activate(token,header);
  assert.throws(()=>f.transaction(s=>{s.records[header.id]=header;},{header,token,afterWrite:db=>{const bytes=JSON.stringify({otherwise_core:{copied_header:header}});db.prepare('INSERT INTO immutable_values VALUES(?,?)').run(hash(bytes),bytes);}}),held('METADATA_UNKNOWN_BODY_COPY'));
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM events').get().n,0);assert.equal(f.charges(),1);
});
test('an extra canonical alias to a retained proof body Holds before COMMIT',t=>{
  const f=fixture(t),token=f.prepay(),header=f.record();f.api.activate(token,header);
  assert.throws(()=>f.transaction(s=>{s.records[header.id]=header;},{header,token,afterWrite:db=>{
    const catalog=db.prepare('SELECT * FROM public_read_catalog').get();db.prepare('INSERT INTO state_entries VALUES(?,?,?,?,?)').run('records','unselected-alias',999,digest(header),'json');db.prepare('INSERT INTO public_read_catalog VALUES(?,?,?,?)').run(catalog.id,catalog.version,catalog.sha256,catalog.bytes);
  }}),held('METADATA_UNKNOWN_BODY_REFERENCE'));assert.equal(f.charges(),1);
});
test('a whole event envelope exceeding its allowance Holds after wrappers, even with a small header',t=>{
  const f=fixture(t),token=f.prepay(),header=f.record();f.api.activate(token,header);
  assert.throws(()=>f.transaction(s=>{s.records[header.id]=header;},{header,token,eventValue:{wrapper:'"'.repeat(40000)}}),held('COMPLETE_EVENT_ENVELOPE_CAPACITY'));assert.equal(f.charges(),1);
});
test('three SQL header histories and later reference controls never grow the prepaid counter',t=>{
  const f=fixture(t),{token,header}=f.first(),reserved=f.charged();
  for(const revision of [2,3]){const next={...header,revision,content:'Whole immutable history '+revision};f.api.register(token,next);f.transaction(s=>{s.records[next.id]=next;},{header:next,token});}
  for(let n=0;n<3;n++)f.transaction(s=>{s.records.core.created_at=n%2?'2000-01-01T00:00:00.000Z':'2099-01-01T00:00:00.000Z';});
  assert.equal(f.accounting().header_postimages_attempted,3);assert.equal(f.accounting().future_control_writes_used,3);assert.equal(f.charged(),reserved);assert.equal(f.charges(),1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM immutable_values WHERE instr(bytes,?)>0').get(header.id).n,3);
  assert.throws(()=>f.api.register(token,{...header,revision:4}),held('METADATA_HISTORY_ALLOWANCE'));
});
test('the thirty-third future catalogue/reference rewrite Holds with no refundable capacity',t=>{
  const f=fixture(t);f.first();const reserved=f.charged();
  for(let n=0;n<32;n++)f.transaction(s=>{s.records.core.created_at=n%2?'2000-01-01T00:00:00.000Z':'2099-01-01T00:00:00.000Z';});
  assert.equal(f.accounting().future_control_writes_used,32);
  assert.throws(()=>f.transaction(s=>{s.records.core.created_at='2099-01-01T00:00:00.000Z';}),held('METADATA_CONTROL_ALLOWANCE'));
  assert.equal(f.accounting().future_control_writes_used,32);assert.equal(f.charged(),reserved);assert.equal(f.charges(),1);
});
test('an extra proof-bearing event cannot hide behind an independent Core event label',t=>{
  const f=fixture(t),{header}=f.first();
  assert.throws(()=>f.transaction(s=>{s.name+=' x';},{eventValue:{extra_proof_reference:header.id}}),held('METADATA_UNKNOWN_EVENT_COPY'));assert.equal(f.charges(),1);
});
