import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,id,digest} from '../plugins/soloco/runtime/store.mjs';
import {handoverHash,handoverReviewEligible} from '../plugins/soloco/runtime/handover.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-handover-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'cache');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const content='Objectives: preserve the project. Rules: preparation only. Authority: no external execution. Pending work: inspect evidence and notices. Uncertainty: no business outcomes proven. Next action: independent review before resuming.';
function setup(host='codex') {const root=fs.mkdtempSync(path.join(base,'fixture-')),a={root,session_id:id('old'),epoch:1,idea:'Fictional handover fixture'};engine.bind(root,a.session_id,host);engine.open(a,host);return a;}
function replace(a,host='codex') {const b={...a,session_id:id('new'),epoch:2};engine.bind(a.root,b.session_id,host);engine.control({...b,action:'handover',expected_epoch:1,source_instruction:'Continue here'},host);return b;}
function submit(b,host='codex'){return engine.handover({...b,action:'submit',content},host);}
function queue(b,r,role='qa') {let key=id('job');withStore(b.root,db=>db.transaction('fixture.queue',s=>{
 const instance=id(role);s.sessions[instance]={instance_id:instance,role,native_id:null,host:s.owner.host};
 const j={id:key,role,instance_id:instance,session_key:instance,host:s.owner.host,epoch:s.owner.epoch,status:'queued',task:'Independently check all handover understanding and unresolved outcomes.',inputs:[{id:r.id,revision:r.revision},...r.handover.input_refs.map(i=>({id:i.id,revision:i.revision}))],review_of:{id:r.id,revision:r.revision},created_at:new Date().toISOString()};
 j.context_sha256=assignmentContext(s,j).hash;s.jobs[key]=j;return s;}));return key;}
async function review(b,r,{verdict='Pass',blockers=[],native=id('native'),role='qa',wrongHash=false}={}) {
 const j=queue(b,r,role);await work(b.root,j,async()=>({native_id:native,text:JSON.stringify({content:'Independently checked current objectives, authority, pending notices, failed work, uncertainty and next steps.',messages:[],notices:[],review:{verdict,reason:'Fictional exact evidence review',permitted_action:verdict==='Pass'?'resume_handover':'hold',subject_sha256:wrongHash?'wrong':r.handover.subject_sha256,blockers}})}));return j;
}
test('same-owner pause/resume stays proportionate; fresh and cross-host replacements require reconstruction',()=>{
 for(const host of ['codex','claude']) {
 const a=setup();engine.control({...a,action:'pause',expected_epoch:1,source_instruction:'pause'},'codex');engine.control({...a,action:'resume',expected_epoch:1,source_instruction:'resume'},'codex');
 const b=replace(a,host);assert.equal(engine.status(b,host).paused,true);
 assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},host),/reconstruction/);
 assert.throws(()=>engine.save({...a,kind:'plan',content:'stale write'},'codex'),/does not own/);
 }
});
test('exact independent QA allows preparation resume, preserves records/notices and durable acceptance',async()=>{
 for(const host of ['codex','claude']) {
 const a=setup();engine.notify({...a,kind:'must_know',summary:'Fictional unknown outcome'},'codex');
 const b=replace(a,host),r=submit(b,host);await review(b,r);
 const s=engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'Resume after checked reconstruction'},host);
 assert.equal(s.paused,false);assert.equal(s.handover.status,'completed');assert.equal(s.handover.acceptance.subject_sha256,r.handover.subject_sha256);assert.equal(s.notices.length,1);assert.equal(s.capabilities.external_execution,false);
 engine.control({...b,action:'pause',expected_epoch:2,source_instruction:'pause'},host);engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'same owner resume'},host);
 }
});
test('incomplete, non-independent, wrong-hash and blocked review cannot resume',async()=>{
 for(const options of [{role:'pm'},{native:'incoming'},{wrongHash:true},{verdict:'Blocked',blockers:['Unknown outcome']},{blockers:['Unresolved condition']}]) {
 const a=setup(),b=replace(a);const r=submit(b);if(options.native)options.native=b.session_id;
 if(options.role==='pm')await assert.rejects(()=>review(b,r,options),/subject changed/);else await review(b,r,options);assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'),/review|QA|reconstruction/);
 }
});
test('state changes invalidate acceptance; hook delivery does not; failed review remains and revised reconstruction needs new review',async()=>{
 const a=setup(),b=replace(a),r=submit(b);await review(b,r,{verdict:'Fail',blockers:['Missing constraint']});
 assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'),/negative review/);
 const revised=submit(b);assert.notEqual(revised.id,r.id);await review(b,revised);
 const before=engine.handover({...b,action:'inspect'},'codex');
 withStore(b.root,db=>db.transaction('fixture.delivery',s=>{s.notices.push({id:'n',kind:'must_know',summary:'new unknown',resolution:null,deliveries:[]});return s;}));
 assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'),/stale/);
 const fresh=submit(b),hash=fresh.handover.subject_sha256;withStore(b.root,db=>db.transaction('fixture.delivery',s=>{s.notices[0].deliveries.push({at:'now'});s.notices[0].seen_at='now';assert.equal(handoverHash(s),hash);return s;}));await review(b,fresh);
 engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex');assert.ok(before.subject.records);
});
test('ordinary work cannot run during pending handover; pause cancels a check and late output quarantines',async()=>{
 const a=setup(),b=replace(a),r=submit(b);assert.equal(handoverReviewEligible(withStore(b.root,db=>db.read()),{role:'engineer',review_of:r.id}),false);
 const j=queue(b,r);await work(b.root,j,async()=>{engine.control({...b,action:'pause',expected_epoch:2,source_instruction:'pause'},'codex');return {native_id:id('native'),text:JSON.stringify({content:'Late check',messages:[],notices:[],review:{verdict:'Pass',reason:'late'}})};});
 assert.equal(engine.status(b,'codex').jobs.find(v=>v.id===j).status,'quarantined');assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'),/reconstruction|QA/);
});


test('single-copy frozen handover evidence fits moderate history and oversized state holds without truncation',()=>{
 for(const size of [110000,210000]){
 const a=setup();for(let i=0;i<size;i+=90000)engine.save({...a,kind:'artifact',content:'x'.repeat(Math.min(90000,size-i)),source_reference:'Fictional archive'},'codex');
 const b=replace(a),r=submit(b),s=withStore(a.root,db=>db.read()),job={role:'qa',task:'Review exact frozen evidence',inputs:[],review_of:{id:r.id,revision:r.revision}};
 if(size>200000)assert.throws(()=>assignmentContext(s,job),/Nothing was truncated/);
 else {const ctx=assignmentContext(s,job);assert.ok(ctx.text.length<200000);assert.equal(ctx.text.split('x'.repeat(90000)).length-1,1);}
 }
});


test('integration binds coordination metadata without duplicating frozen handover evidence',()=>{
 const a=setup(),b=replace(a),r=submit(b),s=withStore(a.root,db=>db.read());
 const job={role:'qa',task:'Review frozen handover',inputs:[],review_of:{id:r.id,revision:r.revision},coordination:{version:1,dependencies:[],resources:['handover-review']}};
 const before=assignmentContext(s,job),pack=JSON.parse(before.text);
 assert.deepEqual(pack.assignment.coordination,job.coordination);
 job.coordination.resources=['changed-resource'];assert.notEqual(assignmentContext(s,job).hash,before.hash);
 assert.equal(Object.keys(pack).filter(k=>k==='frozen_subject').length,1);
});


test('classification-only changes invalidate handover and classification provenance is frozen for both roles',async()=>{
 const a=setup();
 withStore(a.root,db=>db.transaction('fixture.classification',s=>{s.context_classifications={historical:{source:{id:'historical',revision:1,sha256:'source-hash'},plan:{id:'plan',sha256:'plan-hash'},review:{id:'review',sha256:'review-hash'},disposition:'resolved',roles:['research'],scopes:[]}};return s;}));
 const b=replace(a),r=submit(b);await review(b,r);
 const current=withStore(b.root,db=>db.read());
 assert.deepEqual(r.handover.subject.context_classifications,current.context_classifications);
 withStore(b.root,db=>db.transaction('fixture.classification-only-change',s=>{s.context_classifications.historical.roles=['engineer'];return s;}));
 assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'),/stale/);
 const fresh=submit(b);assert.deepEqual(fresh.handover.subject.context_classifications.historical.roles,['engineer']);assert.notEqual(fresh.handover.subject_sha256,r.handover.subject_sha256);
});
