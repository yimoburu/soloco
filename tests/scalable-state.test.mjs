import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store,digest} from '../plugins/soloco/runtime/store.mjs';
import {assignmentContext,contextMatches} from '../plugins/soloco/runtime/context.mjs';
import {recordReference,presentationOnly,contextPlan,contextRead} from '../plugins/soloco/runtime/current-state.mjs';
const tmp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'scalable-state-')));test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const seed=()=>({id:'fixture',name:'A',revision:1,roles:{engineer:{name:'Engineer'}},records:{},jobs:{},sessions:{},messages:[],notices:[],governance:'limits',owner:{epoch:1},extension:{'__proto__':'literal',raw:'preserve exact \\n wording'}});
function classified(s,r,disposition='resolved',scopes=[]) {
 s.records[r.id]=r;const p={id:'p-'+r.id,kind:'plan',revision:1,author_instance:'cos',context_classification_plan:contextPlan(s,{record_ids:[r.id],disposition,scopes})};
 s.records[p.id]=p;const review={id:'q-'+r.id,kind:'review',revision:1,status:'Submitted',author_role:'qa',author_instance:'qa-'+r.id,job_id:'job-'+r.id,review:{verdict:'Pass',permitted_action:'apply_context_classification',plan_sha256:digest(JSON.stringify(p.context_classification_plan)),blockers:[]},review_of:{id:p.id,revision:1}};s.records[review.id]=review;s.jobs[review.job_id]={id:review.job_id,role:'qa',instance_id:review.author_instance,native_id:'native-'+r.id,status:'completed',artifact_id:review.id};
 (s.context_classifications??={})[r.id]={source:recordReference(r),plan:recordReference(p),review:recordReference(review),disposition,roles:[],scopes};
}
test('unclassified legacy obligations stay mandatory; exact reviewed dispositions bound ordinary context',()=>{
 const s=seed(),j={id:'j',role:'engineer',context_format:3,context_scope:'parser',inputs:[],task:'repair'};
 classified(s,{id:'other',kind:'decision',revision:1,content:'Other work'},'current',['unrelated']);
 s.records.unknown={id:'unknown',kind:'decision',revision:1,status:'Resolved',content:'Unknown scope stays mandatory'};
 const c=assignmentContext(s,j);assert.deepEqual(c.inputs.map(r=>r.id),['unknown']);
 s.jobs.j=j;
 classified(s,{id:'new-other',kind:'decision',revision:1,content:'New unrelated work'},'current',['other']);
 assert.equal(contextMatches(s,j,c.hash),true);
 s.records.unknown.content='Changed binding limit';assert.equal(contextMatches(s,j,c.hash),false);
 s.records['new-other'].content='tampered';assert.ok(assignmentContext(s,j).inputs.some(r=>r.id==='new-other'));
});
test('resolved archive growth does not grow task pack; raw originals remain retrievable by exact hash',()=>{
 const lengths=[];
 for(const n of [1,10,100]){const s=seed();for(let i=0;i<n;i++)classified(s,{id:'r'+i,kind:'decision',revision:1,content:'Historical context '.repeat(100)});
  const c=assignmentContext(s,{role:'engineer',context_format:3,inputs:[],task:'same'});lengths.push(c.text.length);
  const r=s.records.r0,raw=JSON.stringify(r),ref=recordReference(r);
  assert.equal(contextRead(s,{id:r.id,sha256:ref.sha256,length:raw.length}).text,raw);
  assert.throws(()=>contextRead(s,{id:r.id,sha256:'wrong',length:1}),/changed/);
 }
 assert.equal(new Set(lengths).size,1);
});
test('presentation-only rename detection rejects unknown effects and producers',()=>{
 const r={id:'control',kind:'decision',author_role:'human_founder',recorded_by:'founder',content:'Rename A to B',status:'Recorded',action:'rename',previous_name:'A',name:'B',created_at:'now'};
 assert.equal(presentationOnly(r),true);assert.equal(presentationOnly({...r,limit:2}),false);assert.equal(presentationOnly({...r,author_role:'runner'}),false);assert.equal(presentationOnly({...r,content:'Rename A to B and prohibit spending'}),false);
});
test('explicit normalized migration backs up, round-trips unknown values and fences legacy writes',()=>{
 const root=fs.mkdtempSync(path.join(tmp,'db-'));const db=new Store(root,true),s=seed();s.records.a={id:'a',kind:'artifact',content:'large '.repeat(10000)};
 db.transaction('seed',()=>s);const before=JSON.stringify(db.read()),token=db.changeToken();
 const receipt=db.migrate();assert.ok(fs.existsSync(receipt.backup));assert.equal(JSON.stringify(db.read()),before);assert.equal(db.changeToken(),token);
 assert.throws(()=>db.db.prepare('UPDATE company SET value=? WHERE id=1').run('{}'),/Legacy writer fenced/);
 const archiveRow=db.db.prepare("SELECT sha256 FROM state_entries WHERE family='records' AND key='a'").get();
 db.selectedTransaction('small',{rootKeys:['revision','owner','updated_at'],entities:{records:['b']}},v=>{v.records.b={id:'b',content:'small'};return v;});
 assert.equal(db.read().records.a.content,s.records.a.content);assert.equal(db.db.prepare("SELECT sha256 FROM state_entries WHERE family='records' AND key='a'").get().sha256,archiveRow.sha256);
 assert.ok(db.changeToken()>token);db.close();
 const restored=fs.mkdtempSync(path.join(tmp,'restore-'));fs.mkdirSync(path.join(restored,'.company'));fs.copyFileSync(receipt.backup,path.join(restored,'.company/company.sqlite'));
 const backup=new Store(restored);assert.equal(JSON.stringify(backup.read()),before);backup.close();
});
test('immutable corruption is detected and transactions rollback without dropping archive',()=>{
 const root=fs.mkdtempSync(path.join(tmp,'integrity-')),db=new Store(root,true);db.transaction('seed',()=>seed());db.migrate();const before=JSON.stringify(db.read());
 assert.throws(()=>db.selectedTransaction('fail',{rootKeys:['revision','owner'],entities:{records:['x']}},s=>{s.records.x={id:'x'};throw Error('interrupted');}),/interrupted/);
 assert.equal(JSON.stringify(db.read()),before);
 db.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=(SELECT sha256 FROM state_entries WHERE family=?)').run('"tampered"','root');
 assert.throws(()=>db.read(),/hash mismatch/);db.close();
});

import {buildEvidence,evidencePage,readEvidence} from '../plugins/soloco/runtime/upgrade-evidence.mjs';
function classifyEntity(s,source,id) {
 const planValue=contextPlan(s,{record_ids:[id],disposition:'resolved'});
 const p={id:'plan-'+id,kind:'plan',revision:1,author_instance:'cos',context_classification_plan:planValue};s.records[p.id]=p;
 const q={id:'qa-'+id,kind:'review',revision:1,status:'Submitted',author_role:'qa',author_instance:'qa-native-'+id,job_id:'review-job-'+id,review_of:{id:p.id,revision:1},review:{verdict:'Pass',permitted_action:'apply_context_classification',plan_sha256:digest(JSON.stringify(planValue)),blockers:[]}};
 s.records[q.id]=q;s.jobs[q.job_id]={id:q.job_id,role:'qa',instance_id:q.author_instance,native_id:q.author_instance,status:'completed',artifact_id:q.id};
 (s.context_classifications??={})[id]={source:recordReference(source,id),plan:recordReference(p),review:recordReference(q),disposition:'resolved',roles:[],scopes:[]};
}
test('current-state upgrade projection bounds reviewed record/history growth and preserves exact retrieval',()=>{
 const counts=[];
 for(const n of [1,10,100]){
  const s=seed();s.upgrade_history=[];
  for(let i=0;i<n;i++){
   const r={id:'r'+i,kind:'decision',revision:1,content:'Resolved original wording '.repeat(300)};s.records[r.id]=r;classifyEntity(s,r,r.id);
   const u={id:'u'+i,status:'recovered',calls:[{text:'Preserved historical unique result '+i+' x'.repeat(3000)}]};s.upgrade_history.push(u);classifyEntity(s,u,'upgrade:'+u.id);
  }
  s.records.open={id:'open',kind:'decision',content:'Unresolved old restriction remains binding'};
  const checkpoint={...s};delete checkpoint.upgrade_history;
  const subject=buildEvidence(checkpoint,s.upgrade_history,{currentState:true});
  counts.push(subject.pages.length);
  const page=evidencePage(subject,subject.pages[0]);assert.match(page.text,/Unresolved old restriction/);
  assert.equal(subject.handover.history.length,0);assert.equal(subject.handover.archive.count,n*8);
  const index=subject.sources[subject.handover.archive.source.source_id];const entries=JSON.parse(index.raw);
  const source=entries.find(e=>e.entity==='upgrade').source;
  const raw=readEvidence(subject,{source_id:source.source_id,sha256:source.sha256,offset:0,length:subject.sources[source.source_id].length});
  assert.match(raw.text,/Preserved historical unique result/);
 }
 assert.equal(new Set(counts).size,1);
});
test('current-state projection never conceals unknown or orphan classification metadata',()=>{
 const s=seed();classified(s,{id:'old',kind:'decision',revision:1,content:'Original obligation'});
 s.context_classifications.orphan={source:{id:'missing'},unknown_obligation:'retain this'};
 assert.throws(()=>buildEvidence(s,[],{currentState:true}),/source is missing/);
 assert.doesNotThrow(()=>buildEvidence(s,[],{currentState:false}));
 delete s.context_classifications.orphan;s.context_classifications.old.unknown_obligation='hold';
 assert.throws(()=>buildEvidence(s,[],{currentState:true}),/Unknown context classification fields/);
});
test('archived job entries retain their exact typed classification provenance',()=>{
 const s=seed(),job={id:'old',status:'failed',native_id:'old-native'};s.jobs[job.id]=job;classifyEntity(s,job,'job:'+job.id);
 const subject=buildEvidence(s,[],{currentState:true}),entries=JSON.parse(subject.sources[subject.handover.archive.source.source_id].raw);
 const archived=entries.find(e=>e.key==='old');assert.equal(archived.classification.source.id,'job:old');assert.equal(archived.classification.source.sha256,recordReference(job,'job:old').sha256);
});
import {backupCompany,restoreCompany} from '../plugins/soloco/runtime/storage-transfer.mjs';
test('portable backup inventories project configuration/candidates and explicit artifacts; tampering holds restore',()=>{
 const root=fs.mkdtempSync(path.join(tmp,'portable-')),db=new Store(root,true);db.transaction('seed',()=>seed());db.migrate();
 fs.writeFileSync(path.join(root,'.company','development.json'),'{"max_bytes_ceiling":200000}');fs.mkdirSync(path.join(root,'.company','development'));fs.writeFileSync(path.join(root,'.company','development','candidate.mjs'),'fixture source');
 const external=path.join(tmp,'explicit-evidence.txt');fs.writeFileSync(external,'Required external fixture evidence');
 const backup=path.join(tmp,'portable-backup'),m=backupCompany(db,backup,{artifacts:[{source:external,path:'evidence.txt'}]});assert.equal(m.files.length,4);
 const destination=path.join(tmp,'portable-restored'),result=restoreCompany(backup,destination);assert.equal(result.ownership_transferred,false);
 const restored=new Store(destination);assert.equal(digest(JSON.stringify(restored.read())),m.state_sha256);restored.close();
 assert.equal(fs.readFileSync(path.join(destination,'.company','development.json'),'utf8'),'{"max_bytes_ceiling":200000}');
 fs.writeFileSync(path.join(backup,'artifacts','evidence.txt'),'tampered');assert.throws(()=>restoreCompany(backup,path.join(tmp,'bad-restore')),/changed/);db.close();
});
test('durable supplemental dependencies invalidate returned work after source mutation',()=>{
 const s=seed(),j={id:'j',role:'engineer',context_format:3,inputs:[],task:'repair'};s.records.supplement={id:'supplement',kind:'artifact',revision:1,content:'Exact dependency'};
 const c=assignmentContext(s,j);s.jobs.j={...j,status:'completed',retrieved_inputs:[recordReference(s.records.supplement)]};
 assert.equal(contextMatches(s,j,c.hash),true);s.records.supplement.content='changed after worker returned';assert.equal(contextMatches(s,j,c.hash),false);
});
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {id,withStore} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
async function contextFixture({negative=false,sameNative=false}={}) {
 const root=fs.mkdtempSync(path.join(tmp,'public-context-')),a={root,session_id:'founder-'+id('f'),epoch:1};
 process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'cache');engine.bind(root,a.session_id,'codex');engine.open({...a,idea:'Fictional current-state protocol'},'codex');
 const source=engine.save({...a,id:'old-decision',kind:'decision',content:'Resolved historical fixture; original remains retained'},'codex');
 const plan=engine.contextControl({...a,action:'plan',record_ids:[source.id],disposition:'resolved',source_instruction:'Propose this exact historical disposition'},'codex');
 const key=id('review-job'),instance=id('qa');
 withStore(root,db=>db.transaction('test.queue',s=>{const j={id:key,role:'qa',instance_id:instance,session_key:instance,host:'codex',native_id:null,epoch:1,status:'queued',task:'Review exact context classification',context_format:3,inputs:[],review_of:{id:plan.id,revision:plan.revision},created_at:new Date().toISOString()};const c=assignmentContext(s,j);s.jobs[key]={...j,inputs:c.inputs,context_sha256:c.hash};s.sessions[instance]={instance_id:instance,role:'qa',host:'codex',native_id:null};return s;}));
 await work(root,key,async()=>({native_id:sameNative?a.session_id:id('native'),text:JSON.stringify({content:'Independently reviewed original source and exact proposed disposition',messages:[],notices:[],review:{verdict:'Pass',reason:'Exact historical source is reviewed and traceable',permitted_action:'apply_context_classification',plan_sha256:digest(JSON.stringify(plan.context_classification_plan)),blockers:[]}})}));
 const state=withStore(root,db=>db.read()),review=state.jobs[key].artifact_id;
 if(negative)withStore(root,db=>db.transaction('test.negative',s=>{s.records.failed={id:'failed',kind:'review',status:'Submitted',review_of:{id:plan.id,revision:plan.revision},review:{verdict:'Fail',reason:'Outstanding contradiction'}};return s;}));
 return {a,source,plan,review};
}
test('public exact-plan classification applies only after independent review and retains originals',async()=>{
 const {a,source,plan,review}=await contextFixture();
 engine.contextControl({...a,action:'apply',plan_id:plan.id,review_id:review,source_instruction:'Apply independently reviewed historical disposition'},'codex');
 const state=withStore(a.root,db=>db.read());assert.deepEqual(state.records[source.id],source);
 assert.ok(!assignmentContext(state,{role:'engineer',context_format:3,inputs:[],task:'Current task'}).inputs.some(r=>r.id===source.id));
});
test('classification rejects coordinator-native review and retained same-plan negative verdict',async()=>{
 for(const options of [{sameNative:true},{negative:true}]){const {a,plan,review}=await contextFixture(options);assert.throws(()=>engine.contextControl({...a,action:'apply',plan_id:plan.id,review_id:review,source_instruction:'Attempt disposition'},'codex'),/independent|separate|negative|Fresh/);}
});
test('public migration holds unfinished cancelled workers and requires explicit paused authority',()=>{
 const root=fs.mkdtempSync(path.join(tmp,'migration-guard-')),a={root,session_id:id('founder'),epoch:1};process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'cache');engine.bind(root,a.session_id,'codex');engine.open({...a,idea:'Fixture'},'codex');
 assert.throws(()=>engine.storageControl({...a,action:'migrate',source_instruction:'Migrate'},'codex'),/Pause/);
 withStore(root,db=>db.transaction('test.cancelled',s=>{s.paused=true;s.jobs.uncertain={id:'uncertain',status:'cancelled'};return s;}));
 assert.throws(()=>engine.storageControl({...a,action:'migrate',source_instruction:'Migrate'},'codex'),/Uncertain worker/);
});
test('targeted root deletion persists and absent immutable values never silently disappear',()=>{
 const root=fs.mkdtempSync(path.join(tmp,'delete-')),db=new Store(root,true);db.transaction('seed',()=>seed());db.migrate();
 db.selectedTransaction('delete',{rootKeys:['revision','owner','extension'],entities:{}},s=>{delete s.extension;return s;});assert.equal(Object.hasOwn(db.read(),'extension'),false);
 const sha=db.db.prepare("SELECT sha256 FROM state_entries WHERE family='root' AND key='name'").get().sha256;
 db.db.exec('PRAGMA foreign_keys=OFF');db.db.prepare('DELETE FROM immutable_values WHERE sha256=?').run(sha);assert.throws(()=>db.read(),/hash mismatch/);db.close();
});
test('transfers reject self-copy through company or selected artifact ancestors before creating output',()=>{
 const root=fs.mkdtempSync(path.join(tmp,'recursive-')),db=new Store(root,true);db.transaction('seed',()=>seed());
 const nested=path.join(db.dir,'backup');assert.throws(()=>backupCompany(db,nested),/inside company/);assert.equal(fs.existsSync(nested),false);
 const external=fs.mkdtempSync(path.join(tmp,'artifact-tree-')),destination=path.join(external,'copy');
 assert.throws(()=>backupCompany(db,destination,{artifacts:[{source:external,path:'tree'}]}),/inside selected artifact/);assert.equal(fs.existsSync(destination),false);db.close();
});
