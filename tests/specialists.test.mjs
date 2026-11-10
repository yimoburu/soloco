import test from 'node:test';
import assert from 'node:assert/strict';
import {installedTeam,teamHash,SCHEMA,VERSION,digest} from '../plugins/soloco/runtime/store.mjs';
import {specialistAction,reference,isSpecialistRecord,validateSpecialistBindingShape,prepareSpecialistAssignment,assertSpecialistEligible,specialistContext,specialistName,specialistSessionKey} from '../plugins/soloco/runtime/specialists.mjs';

// Pure in-memory contract fixtures. These labels/QA judgments are fictional;
// no company, native model, semantic certification or external action occurs.
const future=ms=>new Date(Date.now()+ms).toISOString();
function fixture(t){
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-01-01T00:00:00Z')});
 const s={schema:SCHEMA,runtime_version:VERSION,...installedTeam(),id:'fictional-specialist-company',owner:{host:'codex',session_id:'fictional-owner',epoch:1},mode:'preparation',paused:false,records:{},jobs:{}};
 s.team_sha256=teamHash(s);s.records.data={id:'data',revision:1,kind:'artifact',content:'A failed observation; uncertainty remains.'};
 let seq=0;
 const action=(name,args={})=>specialistAction(s,{session_id:s.owner.session_id,epoch:s.owner.epoch,action:name,operation_id:'operation-'+(++seq),source_instruction:'FICTIONAL founder scope: bounded preparation only.',...args},{host:'codex',reviewCurrent:()=>true});
 const policy=action('authorize',{policy:{base_roles:['engineer','qa'],input_ids:['data'],scope:'Supplied evidence only; no tools or business actions.',expires_at:future(10*86400000),max_profiles:20,max_assignments:20}});
 const definition={base_role:'engineer',charter:{name:'Fictional Storage Reviewer',mission:'Judge one supplied storage finding.',inputs:'Exact supplied data.',outputs:'Evidence-linked preparation.',block:'Missing or contradictory evidence.',success:'Useful supported conclusion.',failure:'Invented measurements.',phase:'This storage question only.'},task:'Assess the supplied failed storage observation.',acceptance:'Retain uncertainty and exact source references.',input_ids:['data'],expires_at:future(86400000),max_assignments:3};
 const profile=action('create',{policy_ref:reference(policy),definition});
 function job(id='producer'){
  const p=prepareSpecialistAssignment(s,{role:'engineer',task:definition.task,input_ids:['data'],specialist_ref:reference(profile)},{reserve:true});
  const j={id,instance_id:'fictional-instance-'+id,role:'engineer',task:definition.task,host:'codex',epoch:1,status:'queued',created_at:new Date().toISOString(),inputs:p.input_ids.map(id=>({id,revision:s.records[id].revision})),context_sha256:digest('fictional-context-'+id),review_of:null,specialist:p.binding};s.jobs[id]=j;return j;
 }
 function completed(){
  const j=job();j.status='running';j.started_at=j.created_at;j.execution_started_at=j.created_at;t.mock.timers.tick(10);j.status='completed';j.finished_at=new Date().toISOString();j.native_id='fictional-author-native';j.artifact_id='output';j.coordination_release={termination_confirmed:true,reason:'model_process_closed',at:j.finished_at};
  s.records.output={id:'output',kind:'artifact',revision:1,status:'Submitted',content:'FICTIONAL output; uncertainty remains.',author_role:j.role,author_instance:j.instance_id,job_id:j.id,inputs:structuredClone(j.inputs),review_of:null,review:null};
  t.mock.timers.tick(10);const q={id:'reviewer',instance_id:'fictional-qa-instance',role:'qa',host:'codex',epoch:1,native_id:'fictional-independent-native',status:'completed',artifact_id:'review',context_sha256:digest('fictional-review-context'),review_of:{id:'output',revision:1},inputs:[...structuredClone(j.inputs),{id:'output',revision:1}],finished_at:new Date().toISOString(),coordination_release:{termination_confirmed:true,reason:'model_process_closed',at:new Date().toISOString()}};s.jobs[q.id]=q;
  s.records.review={id:'review',kind:'review',revision:1,status:'Submitted',content:'FICTIONAL QA only.',author_role:'qa',author_instance:q.instance_id,job_id:q.id,inputs:structuredClone(q.inputs),review_of:q.review_of,review:{verdict:'Pass',reason:'Fictional exact evidence judgment.',permitted_action:'accept_specialist_output',blockers:[]}};
  return {j,q,args:{profile_ref:reference(profile),output_ref:reference(s.records.output),review_ref:reference(s.records.review)}};
 }
 return {s,action,policy,profile,definition,job,completed};
}
const held=(fn,pattern=/Specialist Held/)=>assert.throws(fn,pattern);

test('legacy helpers are true no-ops, including arbitrary old specialist-report record names',t=>{
 const f=fixture(t);f.s.records['specialist-report']={id:'specialist-report',kind:'artifact',content:'Legacy prose.'};
 assert.equal(assertSpecialistEligible(f.s,{role:'engineer'}),true);assert.equal(specialistContext(f.s,{}),null);assert.deepEqual(prepareSpecialistAssignment(f.s,{input_ids:['data']}),{binding:null,input_ids:['data']});assert.equal(specialistSessionKey('engineer',null),'engineer');assert.equal(specialistName(f.s,{role:'engineer'}),f.s.roles.engineer.name);
 assert.doesNotThrow(()=>f.action('inspect'));held(()=>assertSpecialistEligible(f.s,{specialist:null}));
});
test('policy/profile records bind exact inputs, frozen base charter and distinct sessions without changing team',t=>{
 const f=fixture(t),before=teamHash(f.s),j=f.job(),context=specialistContext(f.s,j);
 assert(isSpecialistRecord(f.profile));assert(validateSpecialistBindingShape(j.specialist));assert.equal(j.role,'engineer');assert.equal(context.profile.definition.task,f.definition.task);assert.equal(context.policy.policy.scope,f.policy.specialist.policy.scope);assert.deepEqual(context.base_charter,f.s.roles.engineer);assert.equal(specialistName(f.s,j),f.definition.charter.name);assert.match(specialistSessionKey(j.role,j.specialist),new RegExp(f.profile.id));assert.equal(teamHash(f.s),before);
 context.profile.definition.task='Tampered caller copy';assert.equal(f.s.records[f.profile.id].specialist.definition.task,f.definition.task);
});
test('closed schemas reject role/permission/model overrides and caps without partial writes',t=>{
 const f=fixture(t);
 for(const change of [d=>{d.base_role='runner';},d=>{d.tools=['shell'];},d=>{d.charter.permissions='spend';},d=>{d.max_assignments=4;},d=>{d.expires_at=future(8*86400000);},d=>{d.input_ids=['outside'];}]){
  const def=structuredClone(f.definition);change(def);const before=JSON.stringify(f.s);held(()=>f.action('create',{policy_ref:reference(f.policy),definition:def}));assert.equal(JSON.stringify(f.s),before);
 }
 for(const change of [p=>{p.max_profiles=21;},p=>{p.max_assignments=21;},p=>{p.expires_at=future(31*86400000);},p=>{p.base_roles=['missing'];},p=>{p.execution=true;}]){const p=structuredClone(f.policy.specialist.policy);change(p);held(()=>f.action('authorize',{policy:p}));}
});
test('profile criteria and supplemental data cannot be weakened by an assignment',t=>{
 const f=fixture(t),args={role:'engineer',task:f.definition.task,specialist_ref:reference(f.profile)};
 held(()=>prepareSpecialistAssignment(f.s,{...args,acceptance:'Always pass'}),/acceptance/);
 held(()=>prepareSpecialistAssignment(f.s,{...args,evidence_ids:[f.profile.id]}),/supplemental/);
 assert(prepareSpecialistAssignment(f.s,{...args,acceptance:f.definition.acceptance,input_ids:[]}).input_ids.includes('data'));
});
test('policy data allowlists require own canonical records, never inherited object names',t=>{
 const f=fixture(t),before=JSON.stringify(f.s);
 for(const id of ['constructor','__proto__','toString'])held(()=>f.action('authorize',{policy:{...f.policy.specialist.policy,input_ids:[id]}}),/input missing/);
 assert.equal(JSON.stringify(f.s),before);
});
test('exact operation replay returns immutable result after expiry/revocation but changed args fail',t=>{
 const f=fixture(t),args={action:'create',session_id:f.s.owner.session_id,epoch:1,source_instruction:'Exact original scope.',operation_id:'replay',policy_ref:reference(f.policy),definition:structuredClone(f.definition)};
 const first=specialistAction(f.s,args,{host:'codex'});f.action('revoke',{target_ref:reference(f.policy)});t.mock.timers.tick(20*86400000);const count=Object.keys(f.s.records).length;assert.deepEqual(specialistAction(f.s,args,{host:'codex'}),first);assert.equal(Object.keys(f.s.records).length,count);held(()=>specialistAction(f.s,{...args,source_instruction:'Changed qualifier.'},{host:'codex'}),/replay/);
});
test('expired/revoked profiles remain counted against creation and assignment allowances',t=>{
 const f=fixture(t),p=f.action('authorize',{policy:{...f.policy.specialist.policy,max_profiles:1,max_assignments:2}}),a=f.action('create',{policy_ref:reference(p),definition:f.definition});f.action('revoke',{target_ref:reference(a)});held(()=>f.action('create',{policy_ref:reference(p),definition:f.definition}),/profile allowance/);
 const j=f.job();j.status='failed';f.job('second').status='quarantined';f.job('third').status='cancelled';held(()=>f.job('fourth'),/assignment allowance/);assert.doesNotThrow(()=>prepareSpecialistAssignment(f.s,{role:'engineer',task:f.definition.task,specialist_ref:reference(f.profile)},{reserve:false}));
});
test('policy assignment budget aggregates profiles, including failed and queued attempts',t=>{
 const f=fixture(t),p=f.action('authorize',{policy:{...f.policy.specialist.policy,max_assignments:1}}),a=f.action('create',{policy_ref:reference(p),definition:f.definition}),b=f.action('create',{policy_ref:reference(p),definition:{...f.definition,charter:{...f.definition.charter,name:'Other bounded expertise'}}});
 const prepared=prepareSpecialistAssignment(f.s,{role:'engineer',task:f.definition.task,specialist_ref:reference(a)},{reserve:true});f.s.jobs.spent={id:'spent',status:'failed',specialist:prepared.binding};held(()=>prepareSpecialistAssignment(f.s,{role:'engineer',task:f.definition.task,specialist_ref:reference(b)},{reserve:true}),/allowance/);
});
test('explicit dependencies cannot smuggle inputs while inherited baseline provenance remains allowed',t=>{
 const f=fixture(t);f.s.records.global={id:'global',revision:1,kind:'decision',content:'Compulsory continuing condition.'};held(()=>prepareSpecialistAssignment(f.s,{role:'engineer',task:f.definition.task,specialist_ref:reference(f.profile),input_ids:['data','global']}),/inputs exceed/);
 const j=f.job();j.inputs.push({id:'global',revision:1});assert.equal(assertSpecialistEligible(f.s,j),true);j.inputs.find(x=>x.id==='data').revision=2;held(()=>assertSpecialistEligible(f.s,j,{historical:true}),/data revision/);
});
test('changed exact data, profile, policy, owner, team and role/task all fence live work',t=>{
 const f=fixture(t),j=f.job(),base=structuredClone(f.s);
 for(const change of [s=>{s.records.data.content+=' New restriction.';},s=>{s.records[f.profile.id].specialist.definition.task+=' altered';},s=>{s.records[f.policy.id].specialist.policy.scope+=' altered';},s=>{s.owner.epoch++;},s=>{s.roles.engineer.mission+=' altered';},s=>{s.paused=true;},s=>{s.jobs[j.id].role='qa';},s=>{s.jobs[j.id].task='Another task';}]){const s=structuredClone(base);change(s);held(()=>assertSpecialistEligible(s,s.jobs[j.id]));}
 for(const extra of [{review_of:'any'},{prototype_id:'any'},{development_id:'any'}])held(()=>prepareSpecialistAssignment(f.s,{role:'engineer',task:f.definition.task,specialist_ref:reference(f.profile),...extra}),/unsupported/);
});
test('expiry is sampled after slow canonical reads; active work holds without erasing output',t=>{
 const f=fixture(t),j=f.job(),expiry=Date.parse(f.definition.expires_at),value=f.s.records.data.content;
 Object.defineProperty(f.s.records.data,'content',{enumerable:true,get(){t.mock.timers.tick(expiry-Date.now()+1);return value;}});
 held(()=>assertSpecialistEligible(f.s,j),/expired/);assert.equal(j.status,'queued');assert.equal(j.coordination_release,undefined);
});
test('profile creation also rechecks time after capturing potentially slow input hashes',t=>{
 const f=fixture(t),def={...f.definition,expires_at:future(100)},value=f.s.records.data.content,count=Object.keys(f.s.records).length;
 Object.defineProperty(f.s.records.data,'content',{enumerable:true,get(){t.mock.timers.tick(101);return value;}});
 held(()=>f.action('create',{policy_ref:reference(f.policy),definition:def}),/expired/);assert.equal(Object.keys(f.s.records).length,count);
});
test('historical completed context uses recorded cut, never Date.now; retired output can be assessed',t=>{
 const f=fixture(t),{j,args}=f.completed();t.mock.timers.tick(11*86400000);t.mock.method(Date,'now',()=>{throw Error('live clock sampled by historical path');});assert.equal(assertSpecialistEligible(f.s,j,{historical:true}),true);assert(specialistContext(f.s,j));
 const result=f.action('assess',args);assert.equal(result.specialist.disposition,'accepted_preparation');assert.equal(result.specialist.profile.id,f.profile.id);assert.equal(result.specialist.producer.native_id,j.native_id);assert.equal(result.specialist.competence_certificate,undefined);
});
test('revocation fences active work while already completed prior evidence remains reviewable',t=>{
 const f=fixture(t),{j,args}=f.completed();t.mock.timers.tick(10);f.action('revoke',{target_ref:reference(f.profile)});assert.equal(assertSpecialistEligible(f.s,j,{historical:true}),true);assert.equal(f.action('assess',args).specialist.disposition,'accepted_preparation');held(()=>prepareSpecialistAssignment(f.s,{role:'engineer',task:f.definition.task,specialist_ref:reference(f.profile)}),/revoked/);
});
test('a later revocation in the same millisecond preserves its already completed output',t=>{
 const f=fixture(t),{j,args}=f.completed();j.finished_at=new Date().toISOString();j.coordination_release.at=j.finished_at;
 const revocation=f.action('revoke',{target_ref:reference(f.profile)});
 assert.equal(revocation.created_at,j.finished_at);
 assert.equal(assertSpecialistEligible(f.s,j,{historical:true}),true);
 assert.equal(f.action('assess',args).specialist.disposition,'accepted_preparation');
 held(()=>prepareSpecialistAssignment(f.s,{role:'engineer',task:f.definition.task,specialist_ref:reference(f.profile)}),/revoked/);
});
test('assessment requires exact native output, independent QA, current context and all producer input evidence',t=>{
 const f=fixture(t),{args}=f.completed(),original=structuredClone(f.s);
 const cases=[s=>{s.jobs.reviewer.native_id=s.jobs.producer.native_id;},s=>{s.jobs.reviewer.native_id=s.owner.session_id;},s=>{s.jobs.reviewer.coordination_release.termination_confirmed=false;},s=>{s.jobs.producer.coordination_release.reason='lease_expired';},s=>{s.jobs.reviewer.inputs=s.jobs.reviewer.inputs.filter(x=>x.id!==f.policy.id);},s=>{s.records.review.review.permitted_action='publish_operating_state';},s=>{s.records.review.review.blockers=['Unresolved'];},s=>{s.records.output.content='Changed';}];
 for(const change of cases){const s=structuredClone(original);change(s);const a={...args,review_ref:reference(s.records.review)};const before=Object.keys(s.records).length;held(()=>specialistAction(s,{session_id:s.owner.session_id,epoch:1,action:'assess',operation_id:'assess',source_instruction:'Fictional disposition.',...a},{host:'codex',reviewCurrent:()=>true}));assert.equal(Object.keys(s.records).length,before);}
 held(()=>specialistAction(f.s,{session_id:f.s.owner.session_id,epoch:1,action:'assess',operation_id:'stale',source_instruction:'Fictional disposition.',...args},{host:'codex',reviewCurrent:()=>false}),/context/);
});
test('Fail/Blocked produce retained rejected/held dispositions, never acceptance or a blanket certificate',t=>{
 const f=fixture(t),{args}=f.completed();f.s.records.review.review={verdict:'Fail',reason:'Fictional material defect.',permitted_action:'hold',blockers:['Defect']};const rejected=f.action('assess',{...args,review_ref:reference(f.s.records.review)});assert.equal(rejected.specialist.disposition,'rejected');
 f.s.records.review.review={verdict:'Blocked',reason:'Fictional missing input.',permitted_action:'hold',blockers:['Input']};const heldRecord=f.action('assess',{...args,review_ref:reference(f.s.records.review)});assert.equal(heldRecord.specialist.disposition,'held');assert(f.s.records[rejected.id]);assert(f.s.records[heldRecord.id]);
});
test('retained rejected, quarantined and adapter-observed negative reviews cannot be replaced by a later Pass',t=>{
 const f=fixture(t),{args}=f.completed(),original=structuredClone(f.s);
 for(const mode of ['rejected','quarantined','truncated','adapter']){
  const s=structuredClone(original);
  if(mode==='quarantined')s.records.prior={id:'prior',status:'Quarantined',kind:'review',review_of:{id:'output',revision:1},review:{verdict:'Blocked',reason:'Observed missing condition.'}};
  else if(mode==='adapter')s.jobs.prior={id:'prior',review_of:{id:'output',revision:1},model_evidence:{cli_observed_negative_outputs:[JSON.stringify({review:{verdict:'Fail',reason:'Observed earlier failure.'}})]}};
  else s.jobs.prior={id:'prior',status:'failed',review_of:{id:'output',revision:1},rejected_output:mode==='truncated'?{text:'{"review":',truncated:true}:{text:JSON.stringify({review:{verdict:'Fail',reason:'Observed failure despite rejected envelope.'}}),truncated:false}};
  const before=Object.keys(s.records).length;
  held(()=>specialistAction(s,{session_id:s.owner.session_id,epoch:1,action:'assess',operation_id:'held-'+mode,source_instruction:'Fictional disposition.',...args},{host:'codex',reviewCurrent:()=>true}),/negative|uninspectable/);
  assert.equal(Object.keys(s.records).length,before);
 }
});
test('bounded inspection is read-only, cursor membership is exact and outcomes stay unmeasured',t=>{
 const f=fixture(t),before=JSON.stringify(f.s),page=f.action('inspect',{limit:1});assert.equal(page.returned,1);assert.equal(page.complete,false);assert.equal(page.outcomes.cost,'unmeasured');assert.equal(page.outcomes.competence_certificate,false);assert.equal(JSON.stringify(f.s),before);
 f.action('revoke',{target_ref:reference(f.profile)});held(()=>f.action('inspect',{limit:1,cursor:page.next_cursor}),/stale/);held(()=>f.action('inspect',{limit:1000}));
});
