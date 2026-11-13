import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {packagedSourceFixture,sourceInputs,coldSource} from './packaged-component-source-fixture.mjs';

// Real temporary SQLite and actual private journal functions exposed only in a
// copied SOURCE namespace. Inputs are synthetic pins, never admitted Native work.
function prepared(f,label='one'){f.layout.prepareOriginalPackagedComponentWorkspace();const j=f.journal(),owner=j.fixedIssuer(),inputs=sourceInputs(owner,label),state=j.withJournal(db=>j.prepareIntent(db,inputs),'create');return {j,owner,inputs,state};}
test('same P/B cold restart preserves nonrecursive owner and original journal state',async t=>{
 const f=await packagedSourceFixture(t),a=prepared(f);assert.deepEqual(Object.keys(a.owner).sort(),['generation','owner_sha256']);
 const r=coldSource(f,"const owner=journal.fixedIssuer();const state=journal.withJournal(db=>journal.readState(db,"+JSON.stringify(a.state.intent_key)+"),'read');console.log(JSON.stringify({owner,state}));");assert.deepEqual(r.owner,a.owner);assert.deepEqual(r.state,a.state);
});
test('same-input original reserve CAS wins once and cold restart cannot consume it again',async t=>{
 const f=await packagedSourceFixture(t),a=prepared(f),reservation='a'.repeat(64);const reserved=a.j.withJournal(db=>a.j.advance(db,a.state,'reserve-spawn',{reservation_sha256:reservation}));assert.equal(reserved.phase,'SPAWN_RESERVED');
 assert.throws(()=>a.j.withJournal(db=>a.j.advance(db,a.state,'reserve-spawn',{reservation_sha256:'b'.repeat(64)})),e=>f.builder.contextComponentErrorCode(e)==='COMPONENT_OUTCOME_UNKNOWN');
 const r=coldSource(f,"let code;try{const old=journal.withJournal(db=>journal.readState(db,"+JSON.stringify(a.state.intent_key)+"),'read');journal.withJournal(db=>journal.advance(db,old,'reserve-spawn',{reservation_sha256:'b'.repeat(64)}));}catch(e){code=module.contextComponentErrorCode(e);}console.log(JSON.stringify({code}));");assert.equal(r.code,'COMPONENT_OUTCOME_UNKNOWN');
});
test('new owner/input generation cannot bypass retained UNKNOWN in the shared reserve transaction',async t=>{
 const f=await packagedSourceFixture(t),a=prepared(f);let s=a.j.withJournal(db=>a.j.advance(db,a.state,'reserve-spawn',{reservation_sha256:'a'.repeat(64)}));s=a.j.withJournal(db=>a.j.advance(db,s,'record-unknown',{reason:'BIRTH_UNOBSERVED'}));assert.equal(s.phase,'UNKNOWN');
 const changed=sourceInputs({...a.owner,owner_sha256:'c'.repeat(64)},'changed');const next=a.j.withJournal(db=>a.j.prepareIntent(db,changed),'create');
 assert.throws(()=>a.j.withJournal(db=>a.j.advance(db,next,'reserve-spawn',{reservation_sha256:'b'.repeat(64)})),e=>f.builder.contextComponentErrorCode(e)==='COMPONENT_OUTCOME_UNKNOWN');assert.equal(a.j.withJournal(db=>a.j.readState(db,next.intent_key),'read').phase,'PREPARED');assert.deepEqual(a.j.withJournal(db=>a.j.readState(db,s.intent_key),'read'),s);
});
test('retained pair missing claim and attempted initialization with lost both never repair',async t=>{
 const f=await packagedSourceFixture(t),a=prepared(f),journal=path.join(f.workspace,'journal.sqlite'),anchor=path.join(f.workspace,'journal-anchor.json'),claim=path.join(f.workspace,'journal-init.claim');
 fs.unlinkSync(journal);fs.unlinkSync(anchor);assert.throws(()=>a.j.withJournal(()=>null,'create'),e=>e.code==='COMPONENT_JOURNAL_CHANGED');assert.equal(fs.existsSync(journal),false);assert.equal(fs.existsSync(anchor),false);
 const other=await packagedSourceFixture(t),b=prepared(other);fs.unlinkSync(path.join(other.workspace,'journal-init.claim'));assert.throws(()=>b.j.withJournal(()=>null,'read'),e=>e.code==='ENOENT');assert.equal(fs.existsSync(path.join(other.workspace,'journal-init.claim')),false);
});
test('original journal inode replacement holds despite byte-equal contents',async t=>{
 const f=await packagedSourceFixture(t),a=prepared(f),journal=path.join(f.workspace,'journal.sqlite');const bytes=fs.readFileSync(journal);fs.renameSync(journal,journal+'.original');fs.writeFileSync(journal,bytes,{mode:0o600});assert.throws(()=>a.j.withJournal(()=>null,'read'),e=>f.builder.contextComponentErrorCode(e)==='COMPONENT_JOURNAL_CHANGED');
});

test('a copied byte-equal P has a fresh actual owner and cannot bypass old UNKNOWN',async t=>{
 const f=await packagedSourceFixture(t),a=prepared(f);let old=a.j.withJournal(db=>a.j.advance(db,a.state,'reserve-spawn',{reservation_sha256:'a'.repeat(64)}));old=a.j.withJournal(db=>a.j.advance(db,old,'record-unknown',{reason:'BIRTH_UNOBSERVED'}));
 const copy=path.join(f.root,'copied-package');fs.cpSync(f.packageRoot,copy,{recursive:true});const other={...f,builderFile:path.join(copy,'runtime/peers/context-build-component.mjs'),layoutFile:path.join(copy,'runtime/peers/context-component-layout.mjs')};
 const result=coldSource(other,"const owner=journal.fixedIssuer();const inputs="+JSON.stringify(a.inputs)+";inputs.owner_epoch=owner;const next=journal.withJournal(db=>journal.prepareIntent(db,inputs),'create');let code;try{journal.withJournal(db=>journal.advance(db,next,'reserve-spawn',{reservation_sha256:'b'.repeat(64)}));}catch(e){code=module.contextComponentErrorCode(e);}console.log(JSON.stringify({owner,code}));");
 assert.notEqual(result.owner.owner_sha256,a.owner.owner_sha256);assert.equal(result.code,'COMPONENT_OUTCOME_UNKNOWN');assert.deepEqual(a.j.withJournal(db=>a.j.readState(db,old.intent_key),'read'),old);
});
