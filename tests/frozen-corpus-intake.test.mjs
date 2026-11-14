// Independently authored SYNTHETIC fixtures only. No company exports or native QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import net from 'node:net';
import timers from 'node:timers';
import {syncBuiltinESMExports} from 'node:module';

async function withoutExternal(fn,{workerMonitor=false}={}){
  const undo=[],attempts=[],monitors=new Set();
  const deny=(object,key)=>{const old=object[key];object[key]=()=>{attempts.push(key);throw Error('Unexpected external execution: '+key);};undo.push(()=>{object[key]=old;});};
  for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])deny(cp,key);
  for(const key of ['connect','createConnection','createServer'])deny(net,key);
  deny(net.Socket.prototype,'connect');deny(net.Server.prototype,'listen');deny(globalThis,'fetch');deny(timers,'setInterval');
  if(workerMonitor){const interval=globalThis.setInterval,clear=globalThis.clearInterval;globalThis.setInterval=(fn,delay,...args)=>{assert.equal(delay,100);const timer=interval(fn,delay,...args);monitors.add(timer);return timer;};globalThis.clearInterval=timer=>{monitors.delete(timer);return clear(timer);};undo.push(()=>{globalThis.setInterval=interval;globalThis.clearInterval=clear;});}
  else deny(globalThis,'setInterval');
  syncBuiltinESMExports();
  try{return await fn();}finally{const leaked=monitors.size;for(const timer of monitors)clearInterval(timer);for(const restore of undo.reverse())restore();syncBuiltinESMExports();assert.equal(leaked,0,'Worker monitors must close before return');assert.deepEqual(attempts,[],'Source fixtures must never attempt external execution');}
}
const [store,snapshot,scoped,qualification,main,engine,worker,timeout,presentation]=await withoutExternal(()=>Promise.all([
  import('../plugins/soloco/runtime/store.mjs'),import('../plugins/soloco/runtime/snapshot.mjs'),import('../plugins/soloco/runtime/scoped-context.mjs'),import('../plugins/soloco/runtime/context-qualification.mjs'),
  import('../plugins/soloco/runtime/main.mjs'),import('../plugins/soloco/runtime/engine.mjs'),import('../plugins/soloco/runtime/worker.mjs'),import('../plugins/soloco/runtime/timeout.mjs'),import('../plugins/soloco/runtime/public-response.mjs')
]));
const {seedPreexistingLegacyData}=await withoutExternal(()=>import('./preexisting-legacy-data-fixture.mjs'));
const {Store,SCHEMA,VERSION,digest,teamHash}=store,sha=value=>digest(JSON.stringify(value));
const owner={host:'codex',session_id:'synthetic-frozen-intake-owner',epoch:1};
const sourceInstruction='SYNTHETIC paused read-only corpus preservation. UNKNOWN, ZERO allowance and no retry remain binding. No execution authority.';
const common={session_id:owner.session_id,epoch:1,source_instruction:sourceInstruction};
const ref=value=>({id:value.id,revision:value.revision??null,sha256:sha(value)});
function state(){
  const s={schema:SCHEMA,id:'synthetic-frozen-intake',name:'Synthetic frozen intake',idea:'Test derived immutable corpus intake',runtime_version:VERSION,plugin_version:VERSION,owner:{...owner},paused:true,mode:'preparation',phase:'Frame',governance:'SYNTHETIC UNKNOWN_ZERO_NO_RETRY. No new authority.',cos_instructions:'Retain all unknown outcomes and exhausted allowance.',roles:{qa:{name:'Synthetic independent QA'},engineer:{name:'Synthetic Engineer'}},records:{},jobs:{},sessions:{},messages:[],notices:[{id:'fixture-notice',kind:'must_know',summary:'UNKNOWN remains; allowance ZERO; no retry.',deliveries:[],seen_at:null,resolution:null}],created_at:'2026-11-12T00:00:00.000Z'};
  s.governance_sha256=digest(s.governance);s.team_sha256=teamHash(s);
  s.records.archive={id:'archive',revision:1,kind:'artifact',status:'Submitted',content:'SYNTHETIC UNKNOWN_ZERO_NO_RETRY: the failed outcome stays UNKNOWN; no renewed allowance.',author_role:'engineer',author_instance:'synthetic-source-instance',job_id:'synthetic-source-job'};
  s.records.rule={id:'rule',revision:1,kind:'decision',content:'Always retain uncertainty, negative findings and zero allowance.'};
  s.jobs['synthetic-source-job']={id:'synthetic-source-job',status:'completed',role:'engineer',host:'codex',epoch:1,instance_id:'synthetic-source-instance',native_id:'synthetic-source-native',artifact_id:'archive',task:'Produce fictional source evidence',context_format:3,context_sha256:'0'.repeat(64),inputs:[],review_of:null,coordination_release:{termination_confirmed:true,reason:'model_process_closed'}};
  return s;
}
function fixture(t,{typedHome=false}={}){
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-frozen-intake-'))),root=path.join(directory,'attached'),data=path.join(directory,'plugin-data');fs.mkdirSync(root);fs.mkdirSync(data);
  const previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=data;
  const s=state();if(typedHome)s.records.home={id:'home',revision:1,kind:'artifact',content:'Existing typed global obligation.',operating_record:{version:1,kind:'obligation',scope:'*',owner:'runner',conditions:'UNKNOWN remains',exceptions:'None',clearing:'Independent evidence',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:['archive']}};
  const db=new Store(root,true);seedPreexistingLegacyData(db,'synthetic.frozen-intake.seed',()=>s);db.migrate();
  const bindings=path.join(data,'bindings');fs.mkdirSync(bindings);fs.writeFileSync(path.join(bindings,digest(JSON.stringify([root,'codex',owner.session_id]))+'.json'),JSON.stringify({root,host:'codex',session_id:owner.session_id}));
  let closed=false;const close=()=>{if(closed)return;closed=true;db.close();if(process.env.COMPANY_PLUGIN_DATA===data){if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;}fs.rmSync(directory,{recursive:true,force:true});};t.after(close);
  return {root,db,close};
}
const call=(f,input)=>main.call('company_context',{root:f.root,...common,...input},'codex');
async function discovery(t,options={}){
  const f=fixture(t,options),p=await call(f,{action:'plan',protocol:scoped.SCOPED_PROTOCOL,partitioner:scoped.CORPUS_PARTITIONER,source_id:'archive',selected_source_ids:['archive'],batching_policy:scoped.CORPUS_INTRINSIC_BATCHING,maintenance:true});
  f.parentId=p.id;return f;
}
function frozen(f){const s=f.db.read(),parent=s.records[f.parentId],capsule=snapshot.resolveSnapshot(s,parent.scoped_context_plan.capsule),material=snapshot.resolveSnapshot(s,capsule.projection);return {s,parent,capsule,material};}
function partition(material){return {plan_sha256:material.plan_sha256,context_policy:scoped.CORPUS_PHYSICAL_CONTEXT,shared_selection_ids:['all'],selections:[{id:'all',scope:'*',occurrence_ids:material.occurrences.map(value=>value.id),incident_ids:[]}]};}
function deriveArgs(f){const {material}=frozen(f);return {action:'plan',protocol:scoped.SCOPED_PROTOCOL,partitioner:scoped.CORPUS_PARTITIONER,source_id:'archive',corpus_plan_id:f.parentId,frozen_intake:'initial-v1',home_intake_policy:scoped.INITIAL_PROPOSED_HOMES,semantic_partition:partition(material),maintenance:true,source_instruction:sourceInstruction};}
const currentCapture=(f,input=deriveArgs(f))=>scoped.captureScopedPlan(f.db.read(),input);
function mutate(f,fn){return f.db.transaction('synthetic.frozen-intake.mutation',s=>{fn(s);return s;});}

test('explicit frozen intake creates only a new plan over exact parent material after recognized bookkeeping',async t=>{
  await withoutExternal(async()=>{
    const f=await discovery(t),before=frozen(f),parentBytes=JSON.stringify(before.parent),capsuleBytes=JSON.stringify(before.capsule),originalBytes=JSON.stringify(snapshot.resolveSnapshot(before.s,before.capsule.original));
    const reused=await call(f,{action:'plan',protocol:scoped.SCOPED_PROTOCOL,partitioner:scoped.CORPUS_PARTITIONER,source_id:'archive',corpus_plan_id:f.parentId,maintenance:true});assert.notEqual(reused.id,f.parentId);
    const pre=f.db.read(),keys=new Set(Object.keys(pre.records)),jobs=JSON.stringify(pre.jobs),notices=JSON.stringify(pre.notices),messages=JSON.stringify(pre.messages);
    const result=await call(f,deriveArgs(f)),s=f.db.read(),child=s.records[result.id],c=snapshot.resolveSnapshot(s,child.scoped_context_plan.capsule);
    assert.deepEqual(Object.keys(s.records).filter(id=>!keys.has(id)),[result.id]);assert.equal(JSON.stringify(s.jobs),jobs);assert.equal(JSON.stringify(s.notices),notices);assert.equal(JSON.stringify(s.messages),messages);
    assert.equal(s.paused,true);assert.deepEqual(s.owner,owner);assert.equal(s.context_classifications,undefined);assert(!Object.values(s.records).some(r=>r.operating_record||r.bootstrap_home_provenance||r.scoped_context_target));
    assert.equal(child.scoped_context_plan.frozen_intake,'initial-v1');assert.equal(child.scoped_context_plan.home_intake_policy,scoped.INITIAL_PROPOSED_HOMES);assert.notEqual(result.id,f.parentId);assert.notEqual(child.scoped_context_plan.extraction_identity,before.parent.scoped_context_plan.extraction_identity);
    assert.equal(JSON.stringify(s.records[f.parentId]),parentBytes);assert.equal(JSON.stringify(snapshot.resolveSnapshot(s,before.parent.scoped_context_plan.capsule)),capsuleBytes);
    assert.deepEqual(c.original,before.capsule.original);assert.deepEqual(c.projection,before.capsule.projection);assert.deepEqual(c.selected_sources,before.capsule.selected_sources);assert.deepEqual(c.units,before.capsule.units);assert.deepEqual(c.producer_closures,before.capsule.producer_closures);
    assert.equal(JSON.stringify(snapshot.resolveSnapshot(s,c.original)),originalBytes);assert.equal(sha(snapshot.resolveSnapshot(s,c.projection)),sha(before.material));
    assert.deepEqual(c.semantic_partition,partition(before.material));assert.deepEqual(c.frozen_intake,{version:1,parent:ref(before.parent),parent_capsule:before.parent.scoped_context_plan.capsule,parent_extraction_identity:before.parent.scoped_context_plan.extraction_identity});
    assert.equal(c.home_intake.policy,scoped.INITIAL_PROPOSED_HOMES);assert.deepEqual(c.home_intake.owner,owner);assert.equal(c.home_intake.controls_sha256,qualification.qualificationControlHash(s));assert(c.home_intake.baseline);
    assert.equal(child.context_maintenance.readonly,true);assert.deepEqual(child.context_maintenance.owner,owner);
    const chain={...deriveArgs(f),corpus_plan_id:result.id};await assert.rejects(call(f,chain),/frozen|initial|parent|intake/i);
    const unmarkedChain={...chain};delete unmarkedChain.frozen_intake;delete unmarkedChain.home_intake_policy;delete unmarkedChain.semantic_partition;await assert.rejects(call(f,unmarkedChain),/frozen|child|recaptur|intake/i);
  });
});

test('the marker is closed and never relaxes old unmarked frozen reuse',async t=>{
  await withoutExternal(async()=>{
    const f=await discovery(t),valid=deriveArgs(f);
    const absent={...valid};delete absent.frozen_intake;assert.throws(()=>currentCapture(f,absent),/fresh|frozen|partition|intake/i);
    const partitionOnly={...absent};delete partitionOnly.home_intake_policy;assert.throws(()=>currentCapture(f,partitionOnly),/partition|frozen/i,'Unmarked reuse cannot add a new partition');
    for(const input of [
      {...valid,frozen_intake:'future-v2'},{...valid,corpus_plan_id:undefined},{...valid,partitioner:scoped.COHERENT_PARTITIONER},
      {...valid,home_intake_policy:undefined},{...valid,maintenance:false},{...valid,source_instruction:''},
      {...valid,source_id:'rule'},{...valid,selected_source_ids:['rule']},{...valid,batching_policy:'unknown-batching'}
    ])assert.throws(()=>currentCapture(f,input),/hold|frozen|initial|parent|corpus|source|batch|instruction|intake/i);
    const reused=currentCapture(f,{protocol:scoped.SCOPED_PROTOCOL,partitioner:scoped.CORPUS_PARTITIONER,source_id:'archive',corpus_plan_id:f.parentId});assert.equal(reused.extraction_identity,frozen(f).parent.scoped_context_plan.extraction_identity);assert.equal(reused.frozen_intake,undefined);
  });
});

test('revocation, owner, pause, control and parent contract changes deny derivation',async t=>{
  await withoutExternal(async()=>{
    for(const mode of ['revoke','owner','pause','control','readonly','instruction','capsule','batching']){
      const f=await discovery(t);try{
        const input=deriveArgs(f);mutate(f,s=>{const p=s.records[f.parentId];
          if(mode==='revoke')p.context_maintenance.revoked_at='2026-11-12T04:00:00.000Z';
          if(mode==='owner')s.owner.epoch++;
          if(mode==='pause')s.paused=false;
          if(mode==='control')s.records.control={id:'control',author_role:'human_founder',action:'pause',kind:'decision',revision:1,content:'A new scoped pause.'};
          if(mode==='readonly')p.context_maintenance.readonly=false;
          if(mode==='instruction')p.context_maintenance.source_instruction='';
          if(mode==='capsule')p.scoped_context_plan.extraction_identity='0'.repeat(64);
          if(mode==='batching')p.scoped_context_plan.batching_policy=undefined;
        });assert.throws(()=>currentCapture(f,input),undefined,mode);
      }finally{f.close();}
    }
  });
});

test('conservative currentness rejects source, producer and nonbookkeeping root drift',async t=>{
  await withoutExternal(async()=>{
    for(const mode of ['source','producer','new-record','message','extension','notice','pin','unknown-outcome']){
      const f=await discovery(t);try{
        const input=deriveArgs(f);mutate(f,s=>{
          if(mode==='source')s.records.archive.content+=' Changed UNKNOWN clearing condition.';
          if(mode==='producer')s.jobs['synthetic-source-job'].native_id='different-source-producer';
          if(mode==='new-record')s.records.newSource={id:'newSource',revision:1,kind:'artifact',content:'An unclassified source is not bookkeeping.'};
          if(mode==='message')s.messages.push({id:'new-message',to:'qa',content:'A new global no-retry qualifier.'});
          if(mode==='extension')s.unrecognized_root={constraint:'UNKNOWN must not disappear'};
          if(mode==='notice')s.notices.push({id:'new-notice',kind:'must_know',summary:'New global UNKNOWN qualifier.'});
          if(mode==='pin'){s.governance+=' New global denial.';s.governance_sha256=digest(s.governance);s.team_sha256=teamHash(s);}
          if(mode==='unknown-outcome')s.jobs.uncertain={id:'uncertain',status:'failed',error:'Closure remains UNKNOWN.',coordination_release:{termination_confirmed:false}};
        });const before=JSON.stringify(f.db.read());assert.throws(()=>currentCapture(f,input),undefined,mode);assert.equal(JSON.stringify(f.db.read()),before);
      }finally{f.close();}
    }
  });
});

test('partition completeness, zero typed homes and genuine normalized intake remain prerequisites',async t=>{
  await withoutExternal(async()=>{
    const f=await discovery(t),valid=deriveArgs(f),count=valid.semantic_partition.selections[0].occurrence_ids.length;assert(count>1);
    for(const mode of ['hash','missing','duplicate','unknown','asymmetric']){
      const input=structuredClone(valid),p=input.semantic_partition;
      if(mode==='hash')p.plan_sha256='0'.repeat(64);
      if(mode==='missing')p.selections[0].occurrence_ids.pop();
      if(mode==='duplicate')p.selections[0].occurrence_ids.push(p.selections[0].occurrence_ids[0]);
      if(mode==='unknown')p.selections[0].occurrence_ids[0]='unknown-physical-occurrence';
      if(mode==='asymmetric'){const [first,...rest]=p.selections[0].occurrence_ids;p.shared_selection_ids=[];p.selections=[{id:'a',scope:'A',occurrence_ids:[first],incident_ids:['b']},{id:'b',scope:'B',occurrence_ids:rest,incident_ids:[]}];}
      assert.throws(()=>currentCapture(f,input),undefined,mode);
    }
    const s=f.db.read(),detached=snapshot.bindSnapshots(structuredClone(s),hash=>f.db.db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(hash)?.bytes);
    assert.throws(()=>scoped.captureScopedPlan(detached,valid),/normalized.*intake|intake.*provider/i,'A snapshot reader alone is not a normalized intake capability');
    const withHome=await discovery(t,{typedHome:true});try{assert.throws(()=>currentCapture(withHome),/zero|typed|home/i);}finally{withHome.close();}
  });
});

test('public discovery exposes only the closed new marker and keeps complete catalog transport bounded',()=>withoutExternal(()=>{
  const tool=main.toolList.find(t=>t.name==='company_context');assert.deepEqual(tool.inputSchema.properties.frozen_intake.enum,['initial-v1']);assert.equal(scoped.FROZEN_INITIAL_INTAKE,'initial-v1');assert.equal(presentation.REPLY_MAX_BYTES,65536);assert.equal(presentation.CATALOG_MAX_BYTES,131072);
  for(const id of ['x'.repeat(256),'\\'.repeat(128),'é'.repeat(128),'😀'.repeat(64)])for(const maximum of [100000,1000000]){
    const tools=structuredClone(main.toolList);tools.find(t=>t.name==='company_develop').inputSchema.properties.max_bytes.maximum=maximum;
    const body=presentation.toolCatalogReply(id,tools),wire=body+'\n',decoded=JSON.parse(wire);assert(Buffer.byteLength(body)<=presentation.CATALOG_MAX_BYTES);assert(Buffer.byteLength(wire)<=presentation.CATALOG_MAX_BYTES+1);assert.equal(decoded.id,id);assert.deepEqual(decoded.result,{tools});
  }
}));

async function scriptedExtraction(f,target,respond){
  const queued=engine.dispatch({root:f.root,...common,role:'qa',review_of:target.id,task:'SYNTHETIC immutable corpus extraction mechanics.'},'codex',{check:()=>({available:true,authenticated:true,version:'synthetic-source-adapter'}),launch:()=>({on(){},unref(){}})});
  let delivered;
  await worker.work(f.root,queued.id,async(_host,_native,prompt,_directory,ceiling,_selection,options)=>{
    options.onSpawn(timeout.executionTiming(Date.now(),{timeout_ms:ceiling}));let p=JSON.parse(prompt);if(p.protocol==='corpus-readable-structure-v1')p=scoped.expandCorpusStructure(p);delivered=p;
    return {native_id:'synthetic-frozen-qa-'+queued.id,text:JSON.stringify(respond(p))};
  });
  const s=f.db.read(),job=s.jobs[queued.id];assert.equal(job.coordination_release.termination_confirmed,true);return {job,record:s.records[job.artifact_id],delivered};
}
function extractionEnvelope(p){
  const bundle=p.reviewed_unit_bundle,reason='SYNTHETIC source-only complete boundary; UNKNOWN, ZERO allowance, no retry and no authority.';
  const r={...p.response_shape,verdict:'Pass',reason,permitted_action:'continue',preservation_complete:true,interfaces_complete:true,authority_checked:true,scope_complete:true,blockers:[],unit_id:bundle.primary.id,unit_sha256:sha(bundle.primary),reviewed_unit_bundle_sha256:sha(bundle),items:[{id:'coherent-occurrence',kind:'boundary',text:'SYNTHETIC UNKNOWN_ZERO_NO_RETRY: complete fictional boundary retained; no authority.',scope:'*',provenance:bundle.provenance_sha256,interfaces:[bundle.primary.required_interface]}]};
  return {content:reason,messages:[],notices:[],review:{verdict:'Pass',reason,permitted_action:'continue'},qualification_result:r};
}
test('a canonical synthetic parent receipt stays reusable only for the parent, never the new child bundle',async t=>{
  await withoutExternal(async()=>{
    const f=await discovery(t),unit=frozen(f).parent.scoped_context_plan.units[0].id;
    const target=await call(f,{action:'target',plan_id:f.parentId,phase:'extract',unit_id:unit}),old=await scriptedExtraction(f,target,extractionEnvelope);assert.equal(old.job.status,'completed',old.job.error);
    const oldBytes=JSON.stringify(old.record),before=f.db.read(),targetCount=Object.values(before.records).filter(r=>r.scoped_context_target).length;
    const childResult=await call(f,deriveArgs(f)),s=f.db.read(),child=s.records[childResult.id];assert.equal(Object.values(s.records).filter(r=>r.scoped_context_target).length,targetCount,'Derivation alone creates no extraction target');
    const parentReuse=scoped.createScopedTarget(s,{plan_id:f.parentId,phase:'extract',unit_id:unit});assert.equal(parentReuse.reused,true);assert.equal(parentReuse.review_id,old.record.id);
    const childTarget=scoped.createScopedTarget(s,{plan_id:childResult.id,phase:'extract',unit_id:unit});assert.notEqual(childTarget.reused,true);assert.equal(childTarget.plan.id,childResult.id);assert.deepEqual(childTarget.reviews,[]);
    assert.notEqual(child.scoped_context_plan.extraction_identity,frozen(f).parent.scoped_context_plan.extraction_identity);
    const persisted=await call(f,{action:'target',plan_id:childResult.id,phase:'extract',unit_id:unit});assert.notEqual(persisted.reused,true);
    const replay=await scriptedExtraction(f,persisted,()=>({content:old.record.qualification_result.reason,messages:[],notices:[],review:{verdict:old.record.review.verdict,reason:old.record.review.reason,permitted_action:old.record.review.permitted_action},qualification_result:old.record.qualification_result}));
    assert.equal(replay.job.status,'failed','The old bound result cannot pass as a child result');assert.match(replay.job.error,/bound|identity|target|changed|extraction/i);assert.equal(JSON.stringify(f.db.read().records[old.record.id]),oldBytes);
  },{workerMonitor:true});
});

test('cold derived-child reads admit only genuine child-owned proposed-home intake',async t=>{
  await withoutExternal(async()=>{
    const f=await discovery(t),before=frozen(f),parentBytes=JSON.stringify(before.parent),capsuleBytes=JSON.stringify(before.capsule),derived=await call(f,deriveArgs(f)),childBefore=f.db.read().records[derived.id];
    const operating={version:1,kind:'obligation',scope:'*',owner:'runner',conditions:'SYNTHETIC UNKNOWN_ZERO_NO_RETRY remains; allowance ZERO.',exceptions:'No execution or renewed allowance.',clearing:'Independent semantic review and existing authority remain required.',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:['archive']};
    const save={root:f.root,session_id:owner.session_id,epoch:1,id:'child-home',kind:'artifact',content:'SYNTHETIC proposed representation only: UNKNOWN, ZERO allowance, no retry; not accepted operating authority.',operating_record:operating,context_obligations:{version:1,scope:'*'},source_reference:sourceInstruction,bootstrap_plan_id:derived.id};
    await main.call('company_save',save,'codex');
    const cold=new Store(f.root);try{
      const s=cold.read(),child=s.records[derived.id],c=snapshot.resolveSnapshot(s,child.scoped_context_plan.capsule),material=snapshot.resolveSnapshot(s,c.projection),home=s.records['child-home'];
      assert.deepEqual(home.bootstrap_home_provenance,{policy:scoped.INITIAL_PROPOSED_HOMES,plan:ref(childBefore),owner});assert.deepEqual(home.operating_record,operating);assert.equal(home.status,'Draft');
      assert.deepEqual(scoped.proposedBootstrapHomes(s,c,material).map(r=>r.id),['child-home']);
      const view=scoped.scopedPlanView(s,{plan_id:derived.id});assert.equal(view.extraction_identity,child.scoped_context_plan.extraction_identity);
      const target=scoped.createScopedTarget(s,{plan_id:derived.id,phase:'extract',unit_id:child.scoped_context_plan.units[0].id});assert.equal(target.plan.id,derived.id);assert.notEqual(target.reused,true);
      assert.throws(()=>scoped.scopedPlanView(s,{plan_id:f.parentId}),/membership|home|added|intake/i,'An ordinary parent read cannot borrow the child-specific intake override');
      for(const mode of ['wrong-plan','malformed','unrelated-copy']){
        const bad=snapshot.inheritSnapshots(s,structuredClone(s));
        if(mode==='wrong-plan')bad.records['child-home'].bootstrap_home_provenance.plan.id=f.parentId;
        if(mode==='malformed')bad.records['child-home'].unexpected_condition='A condition outside the canonical saved envelope.';
        if(mode==='unrelated-copy')bad.records.unrelated={...structuredClone(home),id:'unrelated'};
        assert.throws(()=>scoped.scopedPlanView(bad,{plan_id:derived.id}),/home|intake|provenance|envelope|changed|added/i,mode);
      }
      assert.equal(JSON.stringify(s.records[f.parentId]),parentBytes);assert.equal(JSON.stringify(snapshot.resolveSnapshot(s,before.parent.scoped_context_plan.capsule)),capsuleBytes);
      assert.equal(s.operating_state,undefined);assert.equal(s.context_classifications,undefined);assert.deepEqual(s.jobs,before.s.jobs);assert.equal(s.paused,true);
    }finally{cold.close();}
    const unrelated={...save,id:'unrelated-home'};delete unrelated.bootstrap_plan_id;await main.call('company_save',unrelated,'codex');
    assert.throws(()=>scoped.scopedPlanView(f.db.read(),{plan_id:derived.id}),/home|intake|provenance|added/i,'An ordinary typed save cannot borrow the derived child grant');
    assert.equal(JSON.stringify(f.db.read().records[f.parentId]),parentBytes);assert.equal(JSON.stringify(snapshot.resolveSnapshot(f.db.read(),before.parent.scoped_context_plan.capsule)),capsuleBytes);
  });
});
