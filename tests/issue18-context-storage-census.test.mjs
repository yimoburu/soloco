// Prospective Source regressions. Denial doubles never establish comparison
// custody; real SQLite below is explicitly preexisting unqualified test DATA.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../plugins/soloco/runtime/store.mjs';
import {currentRecords} from '../plugins/soloco/runtime/current-state.mjs';
import {producerClosure} from '../plugins/soloco/runtime/scoped-context.mjs';
import {backupCompany} from '../plugins/soloco/runtime/storage-transfer.mjs';
import {classifyRuntimeStorageFrom,inspectRuntimeStorageComparisonReferencesFrom} from '../plugins/soloco/runtime/legacy-storage-proof.mjs';

const projection=({mandatory=[],classification=null}={})=>({mandatory:new Set(mandatory),globalMandatory:new Set(),scopedHomes:new Map(),excluded:()=>false,classifications:new Map(classification?[[classification.id,classification.value]]:[])});
const ordinary=(extra={})=>({id:'own-output',kind:'artifact',status:'Submitted',content:'Own result',job_id:'job',...extra});
test('mandatory own-job records remain exact current inputs',()=>{
 const value=ordinary(),state={records:{[value.id]:value}};assert.deepEqual(currentRecords(state,{id:'job'},projection({mandatory:[value.id]})),[value]);
});
test('an explicitly current own-job record precedes ordinary output filtering',()=>{
 const value=ordinary(),state={records:{[value.id]:value}},p=projection({classification:{id:value.id,value:{disposition:'current',roles:[],scopes:[]}}});assert.deepEqual(currentRecords(state,{id:'job'},p),[value]);
});
test('own-job governing meaning and adverse reviews stay visible; ordinary own output remains omitted',()=>{
 for(const extra of [{kind:'decision',status:'Recorded'},{kind:'preference',status:'Recorded'},{review:{verdict:'Fail'}},{review:{verdict:'Blocked'}}]){const value=ordinary(extra);assert.deepEqual(currentRecords({records:{[value.id]:value}},{id:'job'},projection()),[value]);}
 const value=ordinary();assert.deepEqual(currentRecords({records:{[value.id]:value}},{id:'job'},projection()),[]);
});
for(const [field,reason]of [['runtime_wire_evidence','CENSUS_CUSTODY'],['runtime_candidate_test_guard','GUARD_CUSTODY']])test(field+' JSON cannot borrow a private own-job omission or a non-artifact producer edge',()=>{
 const value=ordinary({[field]:{}}),job={id:'job',instance_id:'instance',artifact_id:'different-artifact'},state={records:{[value.id]:value},jobs:{job}};
 assert.throws(()=>currentRecords(state,{id:'job'},projection()),new RegExp(reason));
 assert.throws(()=>producerClosure(state,value),new RegExp(reason));
});
test('falsy comparison markers cannot masquerade as absence and borrow own-job filtering',()=>{
 for(const field of ['runtime_wire_evidence','runtime_candidate_test_guard'])for(const marker of [null,false,0,'']){
  const value=ordinary({[field]:marker}),state={records:{[value.id]:value},jobs:{job:{id:'job'}}};
  assert.throws(()=>currentRecords(state,{id:'job'},projection()),/requires actual snapshot custody/);assert.throws(()=>producerClosure(state,value),/changed comparison .* producer/);
 }
});
test('ordinary malformed final-artifact producer edges still Hold',()=>{
 const value=ordinary({author_instance:'instance'}),state={records:{[value.id]:value},jobs:{job:{id:'job',instance_id:'instance',artifact_id:'different-artifact'}}};assert.throws(()=>producerClosure(state,value),/broken canonical producer edge/);
});

for(const field of ['runtime_wire_evidence','runtime_candidate_test_guard'])test('backup of '+field+' Holds before destination creation or any copy despite caller artifact claims',t=>{
 const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'issue18-archive-hold-')));t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
 const source=path.join(temporary,'original-run-object');fs.writeFileSync(source,'EXACT ORIGINAL RAW');const original=fs.readFileSync(source),directory=path.join(temporary,'company');fs.mkdirSync(directory);
 let effects=0;const denied={dir:directory,changeToken:()=> 'unchanged',read:()=>({records:{wire:{id:'wire',[field]:{}}}}),db:{exec(){effects++;throw Error('No backup write selected');}}};
 const destination=path.join(temporary,'not-created','backup');assert.throws(()=>backupCompany(denied,destination,{artifacts:[{source,path:'caller-claims-complete.raw'}]}),error=>error.code==='ISSUE18_ARCHIVE_CUSTODY_REQUIRED'&&error.details.backup_complete===false&&error.details.external_objects_copied===false);
 assert.equal(effects,0);assert.equal(fs.existsSync(path.dirname(destination)),false);assert(fs.readFileSync(source).equals(original));
});

function legacyFixture(t,records={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'issue18-cold-census-'));let store;t.after(()=>{try{store?.close();}finally{fs.rmSync(root,{recursive:true,force:true});}});fs.mkdirSync(path.join(root,'.company'),{mode:0o700});
 const db=new DatabaseSync(path.join(root,'.company','company.sqlite')),owner={host:'codex',session_id:'fictional-owner',epoch:1};
 try{db.exec('CREATE TABLE company(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,type TEXT NOT NULL,value TEXT NOT NULL);');db.prepare('INSERT INTO company VALUES(1,?)').run(JSON.stringify({id:'fictional-history',revision:0,owner,records,jobs:{},notices:[],messages:[]}));db.prepare('INSERT INTO events VALUES(1,?,?,?)').run('2026-11-14T00:00:00.000Z','fictional.historical_unqualified',JSON.stringify({revision:0,owner}));}finally{db.close();}
 store=new Store(root);return store;
}
test('comparison reference census requires an actual scoped proof and empty historical DATA grants no pin',t=>{
 const store=legacyFixture(t);let proof;
 store.readSnapshot(()=>{proof=classifyRuntimeStorageFrom(store);assert.equal(proof.lane,'legacy');assert.deepEqual(inspectRuntimeStorageComparisonReferencesFrom(proof,store),[]);assert.throws(()=>inspectRuntimeStorageComparisonReferencesFrom({...proof},store));});
 assert.throws(()=>inspectRuntimeStorageComparisonReferencesFrom(proof,store));
});
for(const field of ['runtime_wire_evidence','runtime_candidate_test_guard'])test('cold legacy reader rejects malformed '+field+' instead of accepting a generic extension',t=>{
 const store=legacyFixture(t,{forged:ordinary({id:'forged',[field]:{protocol:'caller-json-is-not-custody'}})});
 assert.throws(()=>store.readSnapshot(()=>classifyRuntimeStorageFrom(store)),error=>typeof error.code==='string'&&error.code.startsWith(field==='runtime_wire_evidence'?'ISSUE18_CAPTURE_':'ISSUE18_TEST_'));
});
