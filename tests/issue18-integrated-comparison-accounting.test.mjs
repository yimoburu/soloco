// SOURCE-only accounting graph. SQLite rows/index projections are real in-memory
// SQL. Store custody, AIO charging and the private header/event producer are
// explicitly controlled VM dependencies. These tokens cannot enter the real
// issuers; these checks prove no filesystem, model, Native or COMMIT authority.
// The separate composed worker checks cover genuine Store/AIO/producer joins.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readNormalized,writeNormalized,writeNormalizedSelection} from '../plugins/soloco/runtime/record-storage.mjs';
import {publicIndexValue} from '../plugins/soloco/runtime/state-projections.mjs';
import {inspectComparisonEvidenceAccountingFrom} from '../plugins/soloco/runtime/integrated-comparison-evidence.mjs';
import {preexistingLegacyStore} from './preexisting-legacy-data-fixture.mjs';
import {fixture as comparisonFixture,runningArm,admitted,commitRequest,optionalDarwin} from './issue18-comparison-fixture.mjs';

const filename=fileURLToPath(new URL('../plugins/soloco/runtime/integrated-comparison-evidence.mjs',import.meta.url));
const source=fs.readFileSync(filename,'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex'),digest=value=>hash(JSON.stringify(value)),copy=value=>JSON.parse(JSON.stringify(value));
const held=code=>error=>error?.code==='ISSUE18_EVIDENCE_'+code;
const sourceNodeExec=childProcess.execFileSync;
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
  let scope=Object.freeze({}),mode='read',type='snapshot',charges=0,charged=0,scopeState=null;
  const io=Object.freeze({}),root='/SOURCE-only-accounting-root',store={root,db,read:()=>state,readSnapshot:operation=>operation()};
  const deps={fs,fileURLToPath,createHash,randomUUID,Buffer,publicIndexValue,
    originalStoreExecutionCustodyFrom(subject){assert.equal(subject,store,'Declared VM Store only');return {store,db,root,scope,state:scopeState??state,mode,type,assert(){}};},
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
    committed(token,record){const entry=metadataPrepayments.get(token).records.get(record.id);entry.committedSha=digest(record);},
    prepared(next){classifyPreparedCopies(originalStoreExecutionCustodyFrom(__store),next);},
    headerEvent(token,record,seq){const paid=metadataPrepayments.get(token);eventScopes.set(__scope(),{store:__store,seq,type:'job.model_process.requested',metadata:paid,recordSha:digest(record)});}
  });`,vm.createContext(deps),{filename:'SOURCE-only-accounting-graph.mjs',timeout:1000});
  const input={job_id:'engineer',phase:'engineer'};
  function prepay(){return api.prepayComparisonEvidenceMetadataFrom(store,io,input);}
  function record(revision=1){return {id:'issue18-wire-FICTIONAL',kind:'artifact',revision,status:'Recorded',created_at:'2026-11-14T00:00:00.000Z',content:'Whole retained body '+revision+' '+('X'.repeat(8000)),runtime_wire_evidence:{protocol:'issue18-runtime-wire-evidence-v1',state:'requested',revision,prior_record_sha256:null,request:{capture_protocol:'adapter-decoded-js-text-v1',B_slot:{slot_commit_id:'FICTIONAL-slot',run_manifest_sha256:hash('FICTIONAL-manifest')}}}};}
  function transaction(change,{header=null,token=null,eventValue={independent_core_event:true},afterWrite=null,selected=null}={}){
    const before=copy(state);scope=Object.freeze({});mode='write';type=header?'job.model_process.requested':'fictional.core-metadata-control';db.exec('BEGIN IMMEDIATE');
    try{
      const view=selected?readNormalized(db,{rootKeys:['id','owner','revision','updated_at'],entities:{records:selected}}):state,oldView=copy(view);scopeState=view;
      api.beginComparisonEvidenceWriteFrom(store,view);change(view);view.revision++;view.updated_at=new Date(1800000000000+view.revision).toISOString();api.prepared(view);
      if(selected){const changes=[];for(const key of ['revision','updated_at'])changes.push({family:'root',key,value:view[key]});for(const key of new Set([...Object.keys(oldView.records??{}),...Object.keys(view.records??{})]))if(JSON.stringify(oldView.records?.[key])!==JSON.stringify(view.records?.[key]))changes.push({family:'records',key,value:view.records?.[key]});writeNormalizedSelection(db,changes);}else writeNormalized(db,view);afterWrite?.(db);
      const seq=db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS n FROM events').get().n;
      if(header)api.headerEvent(token,header,seq);
      db.prepare('INSERT INTO events VALUES(?,?,?,?)').run(seq,new Date().toISOString(),type,JSON.stringify(eventValue));
      api.validateComparisonEvidenceCommitFrom(store);db.exec('COMMIT');if(header)api.committed(token,header);state=readNormalized(db);
    }catch(error){db.exec('ROLLBACK');state=before;throw error;}finally{mode='read';type='snapshot';scope=Object.freeze({});scopeState=null;}
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
test('cold selected SQL projections cannot hide an existing canonical proof before the callback',t=>{
  const f=fixture(t);f.state().records.cold={id:'cold',kind:'artifact',runtime_wire_evidence:{copied_DATA_only:true}};writeNormalized(f.db,f.state());let entered=false;
  assert.throws(()=>f.transaction(view=>{entered=true;view.records.fresh={id:'fresh',content:'Unrelated selected record'};},{selected:['fresh']}),held('METADATA_COLD_REWRITE_CUSTODY_REQUIRED'));
  assert.equal(entered,false);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM state_entries WHERE family='records' AND key='fresh'").get().n,0);assert.equal(f.charges(),0);
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
test('active selected writes census and charge canonical proof references omitted from the projection',t=>{
  const f=fixture(t);f.first();const before=f.accounting();
  f.transaction(view=>{assert.equal(Object.hasOwn(view.records,'issue18-wire-FICTIONAL'),false);view.records.fresh={id:'fresh',kind:'artifact',content:'Independent selected Core data',created_at:'2099-01-01T00:00:00.000Z'};},{selected:['fresh']});
  const after=f.accounting();assert.equal(after.future_control_writes_used,before.future_control_writes_used+1);assert(after.actual.control_references>before.actual.control_references);assert.equal(f.charges(),1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM state_entries WHERE family='records' AND key='issue18-wire-FICTIONAL'").get().n,1);
});
for(const [label,encode]of [
  ['inner requested payload',payload=>JSON.stringify(payload)],
  ['prefixed double-JSON payload',payload=>'report: '+JSON.stringify(JSON.stringify(payload))],
  ['Unicode-escaped nested payload',payload=>JSON.stringify(JSON.stringify(payload).replace('issue18-runtime-wire-evidence-v1',[...'issue18-runtime-wire-evidence-v1'].map(char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0')).join('')))],
  ['inner request control without its outer protocol',payload=>JSON.stringify(payload.request)]
])test('a new ordinary Core record cannot hide an unselected '+label,t=>{
  const f=fixture(t),{header}=f.first(),content=encode(header.runtime_wire_evidence),before=f.db.prepare('SELECT COUNT(*) AS n FROM immutable_values').get().n;
  assert(!content.includes(header.id));assert(!content.includes(digest(header)));
  assert.throws(()=>f.transaction(view=>{view.records.copy={id:'copy',kind:'artifact',content};}),held('METADATA_UNSELECTED_COPY_REPRESENTATION'));
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM immutable_values').get().n,before);assert.equal(f.charges(),1);
});
test('copy encodings beyond the finite normalization budget Hold instead of falling through',t=>{
  const f=fixture(t),{header}=f.first();let content=JSON.stringify(header.runtime_wire_evidence).replaceAll('"','\\u0022');
  for(let n=0;n<10;n++)content=content.replaceAll('\\','\\u005c');content='report: '+content;
  assert.throws(()=>f.transaction(view=>{view.records.copy={id:'copy',kind:'artifact',content};}),held('METADATA_COPY_CLASSIFICATION_ENCODING'));assert.equal(f.charges(),1);
});
test('untouched independent Core text is not rebilled merely for mentioning an old proof protocol',t=>{
  const f=fixture(t);f.state().records.core.content=JSON.stringify({protocol:'issue18-runtime-wire-evidence-v1',historical_unselected_DATA:true});writeNormalized(f.db,f.state());
  f.first();const charged=f.charged();f.transaction(view=>{view.name='Independent metadata changed';});assert.equal(f.charged(),charged);assert.equal(f.charges(),1);
});
test('a new unreferenced SQL body copy of an inner payload also Holds before COMMIT',t=>{
  const f=fixture(t),{header}=f.first();
  assert.throws(()=>f.transaction(view=>{view.name='Core change with an injected copy';},{afterWrite:db=>{const bytes=JSON.stringify({content:'report: '+JSON.stringify(JSON.stringify(header.runtime_wire_evidence))});db.prepare('INSERT INTO immutable_values VALUES(?,?)').run(hash(bytes),bytes);}}),held('METADATA_UNSELECTED_COPY_REPRESENTATION'));
  assert.equal(f.charges(),1);
});
test('an exact private header body cannot borrow its registration at a different destination',t=>{
  const f=fixture(t),{header}=f.first(),before=f.db.prepare('SELECT COUNT(*) AS n FROM immutable_values').get().n;
  assert.throws(()=>f.transaction(view=>{view.extra_header_copy=copy(header);}),held('METADATA_UNSELECTED_COPY_REPRESENTATION'));
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM immutable_values').get().n,before);assert.equal(f.charges(),1);
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
test('a selected SQL write cannot repoint an omitted current header to an old privately retained revision',t=>{
  const f=fixture(t),{token,header}=f.first(),current={...header,revision:2,content:'Later committed accounting postimage'};f.api.register(token,current);f.transaction(view=>{view.records[current.id]=current;},{header:current,token});
  assert.throws(()=>f.transaction(view=>{view.name='Unrelated projected change';},{selected:[],afterWrite:db=>{
    const catalogue=db.prepare('SELECT * FROM public_read_catalog').get();db.prepare("UPDATE state_entries SET sha256=? WHERE family='records' AND key=?").run(digest(header),header.id);db.prepare('INSERT INTO public_read_catalog VALUES(?,?,?,?)').run(catalogue.id,catalogue.version,catalogue.sha256,catalogue.bytes);
  }}),held('METADATA_CANONICAL_REFERENCE'));
  assert.equal(f.db.prepare("SELECT sha256 FROM state_entries WHERE family='records' AND key=?").get(header.id).sha256,digest(current));assert.equal(f.charges(),1);
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

// These prospective cases use the actual Store and genuine requested-header
// producer. The shared fixture controls only worker/capability CP forms; its
// selected fixed Python storage helpers remain real. No model is invoked.
async function requestedHeader(t,{upgrade=false}={}){
  const f=comparisonFixture(t),run=f.initialize(),arms=f.enroll(run),store=arms['1-files'];
  if(upgrade)store.transaction('fictional.completed-upgrade-data',state=>{state.upgrade={id:'fictional-late-upgrade',status:'completed',calls:[]};return state;});
  const a=await runningArm(t,f,run,store,'1-files'),admission=admitted(run,a);assert.equal(commitRequest(a,admission.armAdmission).entered,true);
  const headers=Object.values(store.read().records).filter(record=>record.runtime_wire_evidence);assert.equal(headers.length,1);return {f,run,a,store,header:headers[0]};
}
test('actual Store.selectedTransaction charges omitted warm proof references',optionalDarwin,async t=>{
  const s=await requestedHeader(t),before=inspectComparisonEvidenceAccountingFrom(s.store,s.a.job.id);let omitted=false;
  s.store.selectedTransaction('fictional.selected-core-record',{rootKeys:['revision','owner'],entities:{records:['fictional-new-core']}},state=>{
    omitted=!Object.hasOwn(state.records,s.header.id);state.records['fictional-new-core']={id:'fictional-new-core',kind:'artifact',author_role:'runner',status:'Recorded',revision:1,created_at:'2099-01-01T00:00:00.000Z',content:'Disposable independent Core metadata; no qualification.'};return state;
  });
  const after=inspectComparisonEvidenceAccountingFrom(s.store,s.a.job.id);assert.equal(omitted,true);assert.equal(after.future_control_writes_used,before.future_control_writes_used+1);assert(after.actual.control_references>before.actual.control_references);assert.equal(after.quote.total_bytes,before.quote.total_bytes);s.f.done();
});
test('actual cold selected/append routes explicitly Hold without retaining new representations',optionalDarwin,async t=>{
  const s=await requestedHeader(t,{upgrade:true}),storeURL=new URL('../plugins/soloco/runtime/store.mjs',import.meta.url).href;
  const script=`import assert from 'node:assert/strict';import {Store} from ${JSON.stringify(storeURL)};
const store=new Store(process.argv[1]);
const mark=()=>JSON.stringify({immutable:store.db.prepare('SELECT COUNT(*) AS n FROM immutable_values').get().n,event:store.db.prepare('SELECT COALESCE(MAX(seq),0) AS n FROM events').get().n,entries:store.db.prepare('SELECT family,key,sha256 FROM state_entries ORDER BY family,key').all(),catalogue:store.db.prepare('SELECT * FROM public_read_catalog').all()});
try{const before=mark();let entered=false;
assert.throws(()=>store.selectedTransaction('fictional.cold-selected',{rootKeys:['revision','owner'],entities:{records:['cold-new']}},state=>{entered=true;state.records['cold-new']={id:'cold-new',content:'must remain unretained'};return state;}),error=>error.code==='ISSUE18_EVIDENCE_METADATA_COLD_REWRITE_CUSTODY_REQUIRED');
assert.equal(entered,false);assert.equal(mark(),before);
assert.throws(()=>store.appendUpgradeCall('fictional-late-upgrade',{role:'qa',text:'Fictional late fact remains explicitly unretained under this unsupported custody profile.'}),error=>error.code==='ISSUE18_EVIDENCE_METADATA_UPGRADE_APPEND_CUSTODY_REQUIRED');
assert.equal(mark(),before);assert.equal(store.readSelected({rootKeys:['id'],entities:{records:[]}}).id,${JSON.stringify(s.store.read().id)});
process.stdout.write(JSON.stringify({selected_held:true,append_held:true,callback_entered:entered,retention_changed:false}));}finally{store.close();}`;
  // Explicitly allow exactly this new Source SQL-only Node child. All other
  // forms still use the fixture census, and the original methods are restored
  // before its final all-effects assertion. This is not a capability probe.
  const original=childProcess.execFileSync,effects=[],env={PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',NODE_DISABLE_COLORS:'1'},args=['--input-type=module','--eval',script,s.store.root];
  childProcess.execFileSync=function(...invocation){
    if(new.target){effects.push({kind:'unexpected execFileSync constructor'});throw Error('No constructor form is selected for the cold SQL child');}
    if(invocation[0]!==process.execPath)return Reflect.apply(original,this,invocation);
    effects.push({kind:'actual fixed Source cold SQL child'});assert.deepEqual(invocation[1],args);assert.deepEqual(invocation[2],{env,encoding:'utf8',timeout:30000,maxBuffer:65536,killSignal:'SIGKILL',stdio:['ignore','pipe','pipe']});return Reflect.apply(sourceNodeExec,childProcess,invocation);
  };
  syncBuiltinESMExports();
  try{const result=JSON.parse(childProcess.execFileSync(process.execPath,args,{env,encoding:'utf8',timeout:30000,maxBuffer:65536,killSignal:'SIGKILL',stdio:['ignore','pipe','pipe']}));assert.deepEqual(result,{selected_held:true,append_held:true,callback_entered:false,retention_changed:false});assert.equal(effects.length,1);s.f.done();}
  finally{childProcess.execFileSync=original;syncBuiltinESMExports();}
});
test('actual metadata-free late append retains facts and preserves the original provider error identity',t=>{
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'issue18-core-append-')),store=preexistingLegacyStore(root,'fictional.legacy-core',()=>({id:'fictional-core-append',owner:{session_id:'fictional',epoch:1},records:{core:{id:'core',content:'Independent Core'}},messages:[],upgrade:{id:'late',status:'completed',calls:[]}}));
  try{store.transaction('fictional.metadata-free-legacy',state=>{state.records.core.content='Independent legacy Core write remains supported';return state;});assert.equal(store.read().records.core.content,'Independent legacy Core write remains supported');store.migrate();assert.equal(store.appendUpgradeCall('late',{role:'qa',text:'Fictional late Core fact'}),true);assert.equal(store.read().upgrade.calls.length,1);
    const original=store.db.prepare,problem=Object.freeze({source_only_original_provider_problem:true});store.db.prepare=function(sql,...rest){if(sql.startsWith('INSERT INTO events'))throw problem;return Reflect.apply(original,this,[sql,...rest]);};
    try{assert.throws(()=>store.appendUpgradeCall('late',{role:'qa',text:'This failed transaction must not claim retention'}),error=>error===problem);}finally{store.db.prepare=original;}
    assert.equal(store.read().upgrade.calls.length,1);
  }finally{store.close();fs.rmSync(root,{recursive:true,force:true});}
});
