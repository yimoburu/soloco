import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call as publicCall} from '../plugins/soloco/runtime/main.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {withStore,digest,id,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {resolveSnapshot,inheritSnapshots} from '../plugins/soloco/runtime/snapshot.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {reviewedContext,currentRecords} from '../plugins/soloco/runtime/current-state.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import * as scoped from '../plugins/soloco/runtime/scoped-context.mjs';
const protocol=scoped.SCOPED_PROTOCOL,sha=v=>digest(JSON.stringify(v)),bytes=v=>Buffer.byteLength(typeof v==='string'?v:JSON.stringify(v));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-scoped-contract-'));
process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'cache');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const mutate=(f,fn)=>withStore(f.root,db=>db.transaction('contract.fixture',s=>{fn(s);return s;}));
const read=f=>withStore(f.root,db=>db.read());
const call=(f,args)=>engine.contextControl({...f,...args},'codex');
const token=(domain,n,status='OPEN')=>`OBL~${domain}~${String(n).padStart(3,'0')}~CUSTOMER_${n}_NO_EXPORT_ABOVE_${17*n+3}_ROWS_UNTIL_CONSENT_${n%7}_IN_REGION_${n%11}~${status}~END`;
function fixture({count=1,domains=1,extra={},maintenance=false,kind='artifact',homeKind='artifact'}={}){
  const root=fs.mkdtempSync(path.join(tmp,'company-')),session_id=id('owner'),f={root,session_id,epoch:1,source_instruction:'Explicit fixture instruction: qualify exact source read-only, preserve all failed evidence and OPEN uncertainty.'};
  engine.bind(root,session_id,'codex');engine.open({...f,idea:'Source-only contract fixture'},'codex');withStore(root,db=>db.migrate());
  const clauses=Array.from({length:count},(_,n)=>token('D'+String(Math.min(domains-1,Math.floor(n*domains/count))).padStart(2,'0'),n));
  mutate(f,s=>{s.roles={qa:{name:'Independent QA'},engineer:{name:'Engineer'}};s.governance='Preparation only. No execution or renewed allowance.';s.cos_instructions='Preserve uncertain effects and exhausted allowances.';s.records.old={id:'old',kind,revision:1,author_instance:'historical-producer',content:'Historical evidence grants no current permission.',clauses,...extra};if(maintenance)s.paused=true;s.team_sha256=teamHash(s);});
  for(let d=0;d<domains;d++){const domain='D'+String(d).padStart(2,'0');engine.save({...f,id:'home-'+domain,kind:homeKind,content:clauses.filter((_,n)=>Math.min(domains-1,Math.floor(n*domains/count))===d).join('\n')||'No additional obligation.',context_obligations:{version:1,scope:domain}},'codex');}
  const p=call(f,{action:'plan',protocol,source_id:'old',maintenance});f.plan_id=p.id;f.original=p.original;f.units=p.units;f.all_units=call(f,{action:'inspect',plan_id:p.id,limit:16});f.extraction_identity=p.extraction_identity;f.clauses=clauses;return f;
}
function unitPages(f){const units=[];let offset=0;do{const page=call(f,{action:'inspect',plan_id:f.plan_id,offset,limit:16});units.push(...page.units);offset=page.next_offset;}while(offset!==null);return units;}
function envelope(r){return {content:r.reason,messages:[],notices:[],review:{verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action},qualification_result:r};}
// CONTRACT DOUBLES, not real independent semantic QA. They implement a tiny
// explicit obligation language, check exact source/home strings and conflicts,
// and exercise the REAL public engine/store/worker/delivery/closure pipeline.
function contractReview(p){
  const sh=p.response_shape,r={protocol,phase:p.phase,extraction_identity:p.extraction_identity,target_sha256:sh.target_sha256,verdict:'Pass',reason:'CONTRACT DOUBLE: exact fixture language reviewed; no real native acceptance.',permitted_action:p.phase==='integration'?'apply_scoped_context':'continue',preservation_complete:true,interfaces_complete:true,authority_checked:true,scope_complete:true,blockers:[]};
  const block=reason=>Object.assign(r,{verdict:'Blocked',permitted_action:'hold',reason,blockers:[reason]});
  if(p.phase==='extract'){
    const bundle=p.reviewed_unit_bundle,f=bundle.primary.fragment,items=[];for(const m of f.text.matchAll(/OBL~(D\d\d)~(\d+)~[A-Z0-9_]+~(OPEN|CLOSED)~END/g)){
      const pos=f.range.delivered_start+m.index;if(pos<f.range.start||pos>=f.range.end)continue;
      items.push({id:'o'+m[2],kind:m[3]==='OPEN'?'uncertain_effect':'obligation',text:m[0],scope:m[1],provenance:bundle.provenance_sha256,interfaces:[]});
    }
    for(const m of f.text.matchAll(/NEGATIVE~(D\d\d)~NO_RETRY_WHILE_OPEN~END/g)){const pos=f.range.delivered_start+m.index;if(pos>=f.range.start&&pos<f.range.end)items.push({id:'negative',kind:'negative_finding',text:m[0],scope:m[1],provenance:bundle.provenance_sha256,interfaces:[]});}
    if(f.text.includes('DISTANT_QUALIFIER'))items.push({id:'qualifier',kind:'boundary',text:'DISTANT_QUALIFIER: D00 may not retry unless D01 permission remains OPEN.',scope:'D00',provenance:bundle.provenance_sha256,interfaces:[{id:'permission',with_scope:'D01',text:'D01 permission remains OPEN; D00 must not retry.'}]});
    if(f.text.includes('UNKNOWN_EXTRA'))items.push({id:'unknown',kind:'exhausted_allowance',text:'UNKNOWN_EXTRA: exhausted means no retry.',scope:'*',provenance:bundle.provenance_sha256,interfaces:[]});
    Object.assign(r,{unit_id:bundle.primary.id,unit_sha256:sha(bundle.primary),reviewed_unit_bundle_sha256:sha(bundle),items});
  }else if(p.phase==='applicability'){
    const items=p.extractions.flatMap(e=>e.items.map(item=>({key:e.review.id+'/'+item.id,item}))).filter(i=>p.item_keys.includes(i.key));
    r.summary=items.length?`CONTRACT DOUBLE: ${p.context_scope} preserves ${items.length} distinct per-customer export ceilings, consent classes and region conditions in exact current homes. Every OPEN outcome remains OPEN. No permission to export. Cross-domain conditions are exactly the complete interfaces below; unexpected interactions must hold.`:'No consequential effects in the exact source unit.';
    r.mappings=items.map(({key,item})=>({item:key,status:'represented',homes:p.homes.filter(h=>h.value.content.includes(item.text)).map(h=>h.source.id),reason:'Exact complete condition and OPEN state retained; grants no permission.'}));
    r.interfaces=items.flatMap(({key,item})=>item.interfaces.map(i=>({key:key+'/'+i.id,item:key,scope:item.scope,...i})));r.reviewed_interfaces=p.interface_keys;
    if(p.global_rules.unknown_outcomes.length)block('Unknown execution outcome remains held; native closure and effects are unproven.');
    if(r.mappings.some(m=>!m.homes.length))block('Specific source condition is absent from current home; retain OPEN and do not retry.');
    if(p.interface_keys.length&&p.homes.some(h=>h.value.content.includes('CONTRADICTION')))block('D00/D01 interface contradicts permission: retry denied while permission OPEN.');
    if(p.interface_keys.length)r.interfaces=[]; // Exact keys bind the full delivered interfaces; mappings still checked.
  }else {r.summary='CONTRACT DOUBLE: every domain retains its exact distinct conditions and OPEN state; all declared interfaces independently checked. No execution permission.';r.domain_review_ids=sh.domain_review_ids;r.interface_review_ids=sh.interface_review_ids;r.unreviewed_interfaces=[];}
  return envelope(r);
}
async function run(f,args,{review=contractReview,native,modelHook}={}){
  const t=call(f,{action:'target',...args,plan_id:args.plan_id??f.plan_id});if(t.reused)return t;
  const queued=engine.dispatch({...f,role:'qa',review_of:t.id,task:'Independent scoped contract review.'},'codex',{check:()=>({available:true,authenticated:true,version:'contract-double'}),launch:()=>({on(){},unref(){}})});
  await work(f.root,queued.id,async(host,session,prompt,dir,timeout,selection,options)=>{
    options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));
    const packet=JSON.parse(prompt);if(modelHook)await modelHook(packet);
    return {native_id:native??'contract-native-'+queued.id,text:JSON.stringify(review(packet))};
  });
  const s=read(f),j=s.jobs[queued.id];return {target:t,job:j,review:s.records[j.artifact_id],packet:j.qualification_delivery&&JSON.parse(j.qualification_delivery.wire)};
}
async function extraction(f){const results=[];for(const unit_id of f.extraction_unit_ids??unitPages(f).map(u=>u.id)){const v=await run(f,{phase:'extract',unit_id});assert.equal(v.job.status,'completed',v.job.error);results.push(v);}return results;}
async function qualify(f){
  const extracts=await extraction(f),byDomain=new Map();for(const e of extracts)for(const item of e.review.qualification_result.items){const d=item.scope;if(!byDomain.has(d))byDomain.set(d,[]);byDomain.get(d).push({e,item,key:e.review.id+'/'+item.id});}
  // Zero-item units still require an independent applicability receipt.
  const empty=extracts.filter(e=>!e.review.qualification_result.items.length);
  const domains=[];for(const [domain,items] of byDomain){const v=await run(f,{phase:'applicability',extraction_review_ids:[...new Set([...items.map(i=>i.e.review.id),...empty.map(e=>e.review.id)])],item_keys:items.map(i=>i.key),counterpart_ids:domain==='*'?['home-global']:['home-'+domain],context_scope:domain});assert.equal(v.job.status,'completed',v.job.error);assert.equal(v.review.review.verdict,'Pass',v.review.content);domains.push(v);}
  const integrated=await run(f,{phase:'integration',domain_review_ids:domains.map(d=>d.review.id),counterpart_ids:[...new Set(domains.flatMap(d=>d.target.target.homes.map(h=>h.id)))]});assert.equal(integrated.job.status,'completed',integrated.job.error);
  const applied=await publicCall('company_context',{root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction,action:'apply',integration_review_id:integrated.review.id},'codex');assert.equal(applied.applied,true);return {extracts,domains,integrated,proof:read(f).context_classifications[f.source_id??'old'].scoped_qualification};
}

test('public store + worker path: 500 distinct obligations / 20 domains exceed union output, bounded packets apply and archive exact originals',async t=>{
  const f=fixture({count:500,domains:20});mutate(f,s=>{s.records.unknownRule={id:'unknownRule',kind:'decision',revision:1,content:'Unknown old governing rule: never execute without current consent.'};});const before=JSON.stringify(read(f).records.old),q=await qualify(f),s=read(f);
  assert.equal(q.extracts.reduce((n,e)=>n+e.review.qualification_result.items.length,0),500);
  assert.equal(new Set(q.extracts.flatMap(e=>e.review.qualification_result.items.map(i=>i.text))).size,500);
  const total=q.extracts.reduce((n,e)=>n+bytes(e.review.qualification_output),0);assert.ok(total>12000);
  for(const v of [...q.extracts,...q.domains,q.integrated]){assert.ok(bytes(v.job.qualification_delivery.wire)<=48000);assert.ok(bytes(JSON.parse(v.review.qualification_output))<=12000);}
  assert.equal(JSON.stringify(resolveSnapshot(s,f.original)),before);assert.equal(JSON.stringify(s.records.old),before);
  assert.ok(q.extracts.every(e=>e.review.qualification_result.items.every(i=>i.kind==='uncertain_effect'&&i.text.includes('~OPEN~'))));
  assert.ok(!q.integrated.packet.domains.some(d=>Object.hasOwn(d,'mappings')));assert.ok(!JSON.stringify(q.integrated.packet).includes('unit_sha256'));assert.ok(!JSON.stringify(q.integrated.packet).includes(f.clauses[0]),'Final semantic review references accepted domain artifacts rather than re-emitting all items');
  const current=reviewedContext(s);assert.equal(current.excluded('old'),true);assert.equal(current.mandatory.size,20);
  const scoped=currentRecords(s,{role:'engineer',context_scope:'D00'},current);assert.equal(scoped.filter(r=>r.id.startsWith('home-')).length,1);assert.equal(scoped.some(r=>r.id==='old'),false);assert.ok(scoped.some(r=>r.id==='unknownRule'));
  const ordinary=assignmentContext(s,{id:'ordinary',role:'engineer',task:'Preparation',inputs:[],context_format:5,context_scope:'D00'});assert.ok(ordinary.text.includes(f.clauses[0]));assert.ok(!ordinary.text.includes(f.clauses[25]));
  // Existing default current-state handover/upgrade projection uses the same
  // classification index and archive, without a new authoritative store.
  const {buildEvidence}=await import('../plugins/soloco/runtime/upgrade-evidence.mjs');const evidence=buildEvidence(s,s.upgrade_history??[],{currentState:true,checkpointContinuity:true,snapshotState:s,contextState:s});assert.ok(evidence.handover.archive.count>0);
  t.diagnostic(JSON.stringify({contract_doubles:true,obligations:500,domains:20,extraction_jobs:q.extracts.length,total_extraction_output_bytes:total,final_packet_bytes:bytes(q.integrated.job.qualification_delivery.wire)}));
});

test('source-only extraction survives unrelated notice/global change and replacement uses canonical completed job receipt',async()=>{
  const f=fixture(),q=await qualify(f),old=q.extracts[0];
  mutate(f,s=>s.notices.push({id:'unrelated',kind:'must_know',summary:'A new current notice remains compulsory.'}));
  assert.throws(()=>reviewedContext(read(f)),/global governing identity/);
  const p=call(f,{action:'plan',protocol,source_id:'old'});assert.equal(p.extraction_identity,f.extraction_identity);f.plan_id=p.id;
  const n=Object.keys(read(f).jobs).length,reuse=call(f,{action:'target',plan_id:p.id,phase:'extract',unit_id:unitPages(f)[0].id});assert.equal(reuse.reused,true);assert.equal(reuse.job_id,old.job.id);assert.equal(reuse.review_id,old.review.id);assert.equal(Object.keys(read(f).jobs).length,n);
  const d=await run(f,{phase:'applicability',extraction_review_ids:q.extracts.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'D00'});assert.equal(d.job.status,'completed',d.job.error);
  const i=await run(f,{phase:'integration',domain_review_ids:[d.review.id],counterpart_ids:['home-D00']});assert.equal(i.job.status,'completed',i.job.error);assert.equal(call(f,{action:'apply',integration_review_id:i.review.id}).applied,true);
  const again=call(f,{action:'target',plan_id:p.id,phase:'extract',unit_id:unitPages(f)[0].id});assert.equal(again.job_id,old.job.id);assert.equal(Object.keys(read(f).jobs).length,n+2);
});

test('unknown source fields and current global rules are semantic; historical claims never current permission',async()=>{
  const f=fixture({extra:{future_protocol_field:{effect:'UNKNOWN_EXTRA'}}});engine.save({...f,id:'home-global',kind:'artifact',content:'UNKNOWN_EXTRA: exhausted means no retry.',context_obligations:{version:1,scope:'*'}},'codex');
  mutate(f,s=>{s.records.retainedRule={id:'retainedRule',kind:'decision',revision:1,content:'Previously delivered global rule: preparation needs consent.'};});
  const q=await qualify(f);assert.ok(q.extracts.flatMap(e=>e.review.qualification_result.items).some(i=>i.id==='unknown'));
  const before=read(f);for(const change of [s=>delete s.records.retainedRule,s=>s.records.retainedRule.kind='artifact',s=>s.records.retainedRule.content+=' New consequential condition.']){const copy=inheritSnapshots(before,structuredClone(before));change(copy);assert.throws(()=>scoped.validateScopedApply(copy,{integration_review_id:q.integrated.review.id}),/global governing identity/);}
  mutate(f,s=>{s.records.rule={id:'rule',kind:'decision',revision:1,author_instance:'founder-rule',content:'NEW GLOBAL RULE: consent cannot renew exhausted allowance.'};});
  assert.throws(()=>scoped.validateScopedApply(read(f),{integration_review_id:q.integrated.review.id}),/global governing identity/);
  const reuse=call(f,{action:'target',plan_id:f.plan_id,phase:'extract',unit_id:unitPages(f)[0].id});assert.equal(reuse.job_id,q.extracts[0].job.id);
});

test('distant qualifier absent from home blocks independently; no resolution of OPEN invented',async()=>{
  const f=fixture({count:80,extra:{far_qualifier:'DISTANT_QUALIFIER'}});const es=await extraction(f),e=es.find(e=>e.review.qualification_result.items.some(i=>i.id==='qualifier')),first=es.find(e=>e.review.qualification_result.items.some(i=>i.id==='o000'));
  assert.notEqual(first.target.target.unit_id,e.target.target.unit_id,'Qualifier is genuinely distant across immutable units');
  assert.ok(e.packet.reviewed_unit_bundle.primary.fragment.range.start-first.packet.reviewed_unit_bundle.primary.fragment.range.end>2400);
  const d=await run(f,{phase:'applicability',extraction_review_ids:[first.review.id,e.review.id],item_keys:[first.review.id+'/o000',e.review.id+'/qualifier'],counterpart_ids:['home-D00'],context_scope:'D00'});assert.equal(d.job.status,'completed',d.job.error);assert.equal(d.review.review.verdict,'Blocked');
  const i=await run(f,{phase:'integration',domain_review_ids:[d.review.id],counterpart_ids:['home-D00']}).catch(error=>error);assert.match(i.message,/negative receipt|global governing identity/);assert.ok(read(f).records[e.review.id]);
});

test('cross-domain interface must have independent complete exact review; contradiction holds',async()=>{
  const f=fixture({count:2,domains:2,extra:{qualifier:'DISTANT_QUALIFIER'}});
  mutate(f,s=>{s.records['home-D00'].content+='\nDISTANT_QUALIFIER: D00 may not retry unless D01 permission remains OPEN.';s.records['home-D01'].content+='\nCONTRADICTION: D01 forbids retry while OPEN.';});
  const es=await extraction(f),keys=es.flatMap(e=>e.review.qualification_result.items.filter(i=>i.scope==='D00').map(i=>e.review.id+'/'+i.id));
  const d0=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),item_keys:keys,counterpart_ids:['home-D00'],context_scope:'D00'});assert.equal(d0.review.review.verdict,'Pass');
  const d1=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),item_keys:es.flatMap(e=>e.review.qualification_result.items.filter(i=>i.scope==='D01').map(i=>e.review.id+'/'+i.id)),counterpart_ids:['home-D01'],context_scope:'D01'});
  await assert.rejects(run(f,{phase:'integration',domain_review_ids:[d0.review.id,d1.review.id],counterpart_ids:['home-D00','home-D01']}),/interface coverage/);
  const interfaces=d0.review.qualification_result.interfaces.map(i=>i.key),ir=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),interface_keys:interfaces,counterpart_ids:['home-D00','home-D01'],context_scope:'*'});assert.equal(ir.review.review.verdict,'Blocked');assert.match(ir.review.content,/contradicts/);
});

test('canonical receipt rejects forged native/job/closure/output/provenance and tampered source; no coordinator proof reuse',async()=>{
  const f=fixture(),q=await qualify(f),original=read(f);
  const changes=[s=>s.jobs[q.extracts[0].job.id].native_id='forged',s=>s.jobs[q.extracts[0].job.id].coordination_release.termination_confirmed=false,s=>s.jobs[q.extracts[0].job.id].artifact_id='forged',s=>s.jobs[q.extracts[0].job.id].execution_deadline_at='2000-01-01T00:00:00Z',s=>s.jobs[q.extracts[0].job.id].qualification_delivery.wire+=' ',s=>s.records[q.extracts[0].review.id].qualification_proof.native_id='forged',s=>s.records[q.extracts[0].review.id].qualification_result.items[0].provenance='0'.repeat(64),s=>s.records.old.clauses.push('tampered'),s=>s.records['home-D00'].content+=' changed'];
  for(const change of changes){const s=inheritSnapshots(original,structuredClone(original));change(s);assert.throws(()=>reviewedContext(s),/Scoped context hold|Immutable snapshot/);}
  mutate(f,s=>{s.jobs[q.extracts[0].job.id].coordination_release.termination_confirmed=false;});
  const t=call(f,{action:'target',plan_id:f.plan_id,phase:'extract',unit_id:unitPages(f)[0].id});assert.ok(t.id);assert.equal(t.reused,undefined);
});

test('independent reviewer cannot review source or domain producer',async()=>{
  const f=fixture(),e=await run(f,{phase:'extract',unit_id:unitPages(f)[0].id},{native:'historical-producer'});assert.equal(e.job.status,'failed');assert.match(e.job.error,/independent reviewer/);
  const g=fixture(),es=await extraction(g),d=await run(g,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'D00'},{native:es[0].job.native_id});assert.equal(d.job.status,'failed');assert.match(d.job.error,/independent reviewer|reused/);
});

test('integration coverage rejects omissions, duplicate items/ranges, substitutions and dependency cycles',async()=>{
  const f=fixture({count:3}),es=await extraction(f),all=es.flatMap(e=>e.review.qualification_result.items.map(i=>e.review.id+'/'+i.id));
  const d=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),item_keys:all.slice(1),counterpart_ids:['home-D00'],context_scope:'D00'});
  await assert.rejects(run(f,{phase:'integration',domain_review_ids:[d.review.id],counterpart_ids:['home-D00']}),/item coverage/);
  const d2=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'D00'});
  await assert.rejects(run(f,{phase:'integration',domain_review_ids:[d.review.id,d2.review.id],counterpart_ids:['home-D00']}),/item coverage/);
  assert.throws(()=>call(f,{action:'target',plan_id:f.plan_id,phase:'integration',domain_review_ids:[d2.review.id,d2.review.id],counterpart_ids:['home-D00']}),/unique/);
  mutate(f,s=>{s.context_classifications={['home-D00']:{scoped_qualification:{homes:[{id:'old'}]}}};});
  await assert.rejects(run(f,{phase:'integration',domain_review_ids:[d2.review.id],counterpart_ids:['home-D00']}),/cyclic/);
});

test('overflow retains complete rejected unit output and allows exact bounded subdivision coverage',async()=>{
  const f=fixture({count:8}),unit=unitPages(f)[0].id;
  const over=await run(f,{phase:'extract',unit_id:unit},{review:p=>{const e=contractReview(p);e.qualification_result.items[0].text+='x'.repeat(13000);return e;}});assert.equal(over.job.status,'failed');assert.ok(over.job.qualification_hold);assert.ok(over.job.rejected_output.text.includes('x'.repeat(1000)));
  const parts=[];for(const suffix of ['/0','/1']){const e=await run(f,{phase:'extract',unit_id:unit+suffix});assert.equal(e.job.status,'completed',e.job.error);parts.push(e);}
  const rest=[];for(const u of unitPages(f).slice(1))rest.push(await run(f,{phase:'extract',unit_id:u.id}));
  const es=[...parts,...rest],d=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'D00'});assert.equal(d.job.status,'completed',d.job.error);
  const i=await run(f,{phase:'integration',domain_review_ids:[d.review.id],counterpart_ids:['home-D00']});assert.equal(i.job.status,'completed',i.job.error);assert.equal(call(f,{action:'apply',integration_review_id:i.review.id}).applied,true);
  await assert.rejects(run(f,{phase:'integration',domain_review_ids:[(await run(f,{phase:'applicability',extraction_review_ids:[parts[0].review.id,...rest.map(e=>e.review.id)],counterpart_ids:['home-D00'],context_scope:'D00'})).review.id],counterpart_ids:['home-D00']}),/unit coverage/);
});

test('stale owner, paused maintenance controls, revocation and late pause fence new work and returns',async()=>{
  for(const mutation of [s=>s.owner.epoch++,s=>s.paused=true,s=>s.owner.session_id='replacement']){
    const f=fixture(),unit=unitPages(f)[0].id,v=await run(f,{phase:'extract',unit_id:unit},{modelHook:()=>mutate(f,mutation)});assert.notEqual(v.job.status,'completed');assert.ok(!v.review||v.review.status==='Quarantined');
  }
  const f=fixture({maintenance:true}),es=await extraction(f);assert.ok(es.length);
  call(f,{action:'revoke',plan_id:f.plan_id});await assert.rejects(run(f,{phase:'extract',unit_id:unitPages(f)[0].id+'/0'}),/paused|revocation|changed/);
  const g=fixture({maintenance:true});mutate(g,s=>{s.records.pause={id:'pause',kind:'decision',author_role:'human_founder',action:'pause',content:'Later pause',revision:1};});await assert.rejects(run(g,{phase:'extract',unit_id:unitPages(g)[0].id}),/paused|changed/);
});

test('main exposes usable scoped schema and public current home schema',()=>{
  const main=path.resolve('plugins/soloco/runtime/main.mjs');const result=spawnSync(process.execPath,[main,'serve','codex'],{input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})+'\n',encoding:'utf8',env:{...process.env,COMPANY_PLUGIN_DATA:path.join(tmp,'mcp-cache')}});assert.equal(result.status,0,result.stderr);const list=result.stdout.split('\n').filter(Boolean).map(x=>JSON.parse(x)).find(x=>x.id===1);assert.ok(list?.result?.tools);
  const schema=list.result.tools.find(t=>t.name==='company_context').inputSchema.properties;for(const k of ['protocol','phase','context_unit_ids','extraction_review_ids','item_keys','interface_keys','domain_review_ids','interface_review_ids','integration_review_id'])assert.ok(schema[k],k);assert.equal(schema.context_unit_ids.uniqueItems,true);
  assert.ok(list.result.tools.find(t=>t.name==='company_save').inputSchema.properties.context_obligations);
});


test('bounded independent interface review can complete integration without a global semantic union',async()=>{
  const f=fixture({count:2,domains:2,extra:{qualifier:'DISTANT_QUALIFIER'}});
  mutate(f,s=>{s.records['home-D00'].content+='\nDISTANT_QUALIFIER: D00 may not retry unless D01 permission remains OPEN.';});
  const es=await extraction(f),domains=[];
  for(const scope of ['D00','D01']){const item_keys=es.flatMap(e=>e.review.qualification_result.items.filter(i=>i.scope===scope).map(i=>e.review.id+'/'+i.id));const d=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),item_keys,counterpart_ids:['home-'+scope],context_scope:scope});assert.equal(d.job.status,'completed',d.job.error);domains.push(d);}
  const ir=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),interface_keys:domains.flatMap(d=>d.review.qualification_result.interfaces.map(i=>i.key)),counterpart_ids:['home-D00','home-D01'],context_scope:'*'});assert.equal(ir.review.review.verdict,'Pass');
  assert.deepEqual(ir.review.qualification_result.interfaces,[]);assert.ok(ir.review.qualification_result.mappings.length);assert.deepEqual(ir.review.qualification_result.reviewed_interfaces,domains.flatMap(d=>d.review.qualification_result.interfaces.map(i=>i.key)));assert.ok(ir.packet.extractions.some(e=>e.items.some(i=>i.interfaces.length)));
  const i=await run(f,{phase:'integration',domain_review_ids:domains.map(d=>d.review.id),interface_review_ids:[ir.review.id],counterpart_ids:['home-D00','home-D01']});assert.equal(i.job.status,'completed',i.job.error);assert.ok(i.packet.domains.some(d=>d.interfaces.length));assert.ok(i.packet.interface_reviews.every(r=>!Object.hasOwn(r,'interfaces')));assert.equal(call(f,{action:'apply',integration_review_id:i.review.id}).applied,true);
  const s=read(f),projection=reviewedContext(s);assert.equal(currentRecords(s,{context_scope:'different'},projection).filter(r=>r.id.startsWith('home-')).length,2,'Cross-domain interface homes remain global compulsory evidence');
});

test('closed output grammar rejects fabricated citations, altered provenance and hidden findings and retains rejected evidence',async()=>{
  for(const change of [e=>{e.citations=[{native_id:'model-claim',complete:true}];},e=>{e.qualification_result.items[0].provenance='0'.repeat(64);},e=>{e.qualification_result.hidden_finding='No renewed allowance.';}]){
    const f=fixture(),v=await run(f,{phase:'extract',unit_id:unitPages(f)[0].id},{review:p=>{const e=contractReview(p);change(e);return e;}});assert.equal(v.job.status,'failed');assert.ok(v.job.rejected_output.text);assert.ok(!v.review);assert.equal(read(f).context_classifications?.old,undefined);
  }
});

test('main routes scoped plan/target/read; owner handover fences new work while exact adopted preservation and extraction survive',async()=>{
  const f=fixture(),base={root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction};
  const plan=await publicCall('company_context',{...base,action:'plan',protocol,source_id:'old'},'codex');assert.equal(plan.protocol,protocol);
  const unit=await publicCall('company_context',{...base,action:'read',plan_id:plan.id,unit_id:plan.units[0].id},'codex');assert.equal(unit.unit.id,plan.units[0].id);assert.equal(unit.retrieval_only,true);
  const target=await publicCall('company_context',{...base,action:'target',plan_id:plan.id,phase:'extract',unit_id:plan.units[0].id},'codex');assert.equal(target.target.phase,'extract');
  const q=await qualify(f),oldOwner=f.session_id;mutate(f,s=>{s.owner={...s.owner,epoch:2,session_id:'new-owner'};s.paused=true;});
  assert.equal(reviewedContext(read(f)).excluded('old'),true);assert.throws(()=>call(f,{action:'target',plan_id:f.plan_id,phase:'extract',unit_id:unitPages(f)[0].id}),/does not own/);
  f.session_id='new-owner';f.epoch=2;engine.bind(f.root,f.session_id,'codex');
  const p=call(f,{action:'plan',protocol,source_id:'old',maintenance:true});assert.equal(p.extraction_identity,f.extraction_identity);const reuse=call(f,{action:'target',plan_id:p.id,phase:'extract',unit_id:unitPages(f)[0].id});assert.equal(reuse.job_id,q.extracts[0].job.id);assert.notEqual(f.session_id,oldOwner);
});


test('unknown terminal execution remains exact current evidence and blocks permission without spoiling immutable extraction',async()=>{
  const f=fixture(),es=await extraction(f);mutate(f,s=>{s.jobs.uncertain={id:'uncertain',status:'failed',instance_id:'uncertain-producer',execution_failure:{outcome:'unknown',message:'Descendant termination unconfirmed.'},coordination_release:{termination_confirmed:false}};});
  const reuse=call(f,{action:'target',plan_id:f.plan_id,phase:'extract',unit_id:unitPages(f)[0].id});assert.equal(reuse.job_id,es[0].job.id);
  const d=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'D00'});assert.equal(d.review.review.verdict,'Blocked');assert.equal(d.packet.global_rules.unknown_outcomes[0].id,'uncertain');assert.equal(read(f).jobs.uncertain.coordination_release.termination_confirmed,false);assert.equal(read(f).context_classifications?.old,undefined);
});

test('unknown current home scope and domain dependencies stay mandatory despite integration relabeling',async()=>{
  const f=fixture({count:2,domains:2});mutate(f,s=>{delete s.records['home-D01'].context_obligations;});await qualify(f);
  assert.equal(currentRecords(read(f),{context_scope:'D00'}).filter(r=>r.id.startsWith('home-')).length,2);
  const g=fixture({count:2,domains:2}),es=await extraction(g),domains=[];
  for(const scope of ['D00','D01']){
    const item_keys=es.flatMap(e=>e.review.qualification_result.items.filter(i=>i.scope===scope).map(i=>e.review.id+'/'+i.id));
    const d=await run(g,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),item_keys,counterpart_ids:['home-'+scope],dependency_ids:scope==='D00'?['home-D01']:[],context_scope:scope});assert.equal(d.job.status,'completed',d.job.error);domains.push(d);
  }
  const i=await run(g,{phase:'integration',domain_review_ids:domains.map(d=>d.review.id),counterpart_ids:['home-D00','home-D01'],dependency_ids:[]});assert.equal(i.job.status,'completed',i.job.error);assert.equal(call(g,{action:'apply',integration_review_id:i.review.id}).applied,true);
  assert.equal(currentRecords(read(g),{context_scope:'D00'}).filter(r=>r.id.startsWith('home-')).length,2);
});

test('regression: interface must include every exact incident-domain home',async()=>{
  const f=fixture({count:2,domains:2,extra:{qualifier:'DISTANT_QUALIFIER'}});
  mutate(f,s=>{s.records['home-D00'].content+='\nDISTANT_QUALIFIER: D00 may not retry unless D01 permission remains OPEN.';});
  engine.save({...f,id:'home-D01-second',kind:'artifact',content:'CONTRADICTION: D01 forbids retry while OPEN.',context_obligations:{version:1,scope:'D01'}},'codex');
  const es=await extraction(f),domains=[];
  for(const scope of ['D00','D01']){
    const item_keys=es.flatMap(e=>e.review.qualification_result.items.filter(i=>i.scope===scope).map(i=>e.review.id+'/'+i.id));
    const d=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),item_keys,counterpart_ids:scope==='D00'?['home-D00']:['home-D01','home-D01-second'],context_scope:scope});
    assert.equal(d.review.review.verdict,'Pass');
    domains.push(d);
  }
  const ir=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),interface_keys:domains.flatMap(d=>d.review.qualification_result.interfaces.map(i=>i.key)),counterpart_ids:['home-D00','home-D01'],context_scope:'*'});
  assert.equal(ir.review.review.verdict,'Pass');
  assert.ok(!ir.packet.homes.some(h=>h.source.id==='home-D01-second'));
  const integrate=()=>run(f,{phase:'integration',domain_review_ids:domains.map(d=>d.review.id),interface_review_ids:[ir.review.id],counterpart_ids:['home-D00','home-D01','home-D01-second']});
  await assert.rejects(integrate,/interface omitted exact incident-domain/);
});

// Governing histories and homes, separately qualified through the same REAL
// worker lifecycle with the explicit semantic CONTRACT DOUBLE above.
test('separate governing scopes reuse receipts through qualified archive growth and unrelated requalification',async()=>{
  const f=fixture({kind:'decision',homeKind:'decision'}),firstPlan={id:f.plan_id};
  const a=await qualify(f),ordinaryJob={id:'ordinary',role:'engineer',task:'Preparation',inputs:[],context_format:5,context_scope:'D00'},baseline=assignmentContext(read(f),ordinaryJob),governingBaseline=assignmentContext(read(f),{...ordinaryJob,context_format:3});
  const aDomainHash=a.domains[0].job.context_sha256,aIntegrationHash=a.integrated.job.context_sha256;
  async function addScope(n,{update=false}={}){
    const domain='D'+String(n).padStart(2,'0'),source_id='history-'+domain,home='home-'+domain,clause=token(domain,n),negative='NEGATIVE~'+domain+'~NO_RETRY_WHILE_OPEN~END';
    mutate(f,s=>{
      s.records[source_id]={id:source_id,revision:update?2:1,kind:n%2?'preference':'review',author_instance:'archive-author-'+n,content:clause,...(n%2?{}:{review:{verdict:'Fail',reason:negative}})};
      s.records[home]={id:home,revision:update?2:1,kind:n%2?'preference':'decision',author_instance:'home-author-'+n,content:clause+(n%2?'':'\n'+negative)+(update?' Updated unrelated preparation detail.':''),context_obligations:{version:1,scope:domain}};
    });
    assert.throws(()=>scoped.validateScopedApply(read(f),{integration_review_id:a.integrated.review.id}),/global governing identity/,'New unclassified or changed history must hold until reviewed');
    const p=call(f,{action:'plan',protocol,source_id});Object.assign(f,{source_id,plan_id:p.id,extraction_identity:p.extraction_identity});
    const q=await qualify(f);
    assert.equal(scoped.validateScopedApply(read(f),{integration_review_id:a.integrated.review.id}).extraction_identity,a.proof.extraction_identity);
    const state=read(f),domainAssignment=scoped.scopedAssignment(state,state.jobs[a.domains[0].job.id]),integration=scoped.scopedAssignment(state,state.jobs[a.integrated.job.id]);
    assert.equal(domainAssignment.hash,aDomainHash);assert.equal(integration.hash,aIntegrationHash);
    // Before B is qualified, its new unknown rule can expand A's scope; B's
    // first review therefore sees A's full current home. Once B is independently
    // qualified unrelated, fresh B work and existing A receipts need no replay.
    assert.ok(q.domains[0].packet.global_rules.governing.some(r=>r.source.id==='home-D00'));
    const refreshed=scoped.createScopedTarget(state,{plan_id:f.plan_id,phase:'applicability',extraction_review_ids:q.extracts.map(e=>e.review.id),counterpart_ids:[home],context_scope:domain});
    assert.ok(!resolveSnapshot(state,refreshed.global_snapshot).governing.some(r=>r.source.id==='old'||r.source.id==='home-D00'));
    if(!update)assert.equal(assignmentContext(state,ordinaryJob).text,baseline.text,'Qualified governing archive and proof growth do not grow ordinary inputs');
    assert.equal(assignmentContext(state,{...ordinaryJob,context_format:3}).text,governingBaseline.text,'Unrelated updates do not grow governing task inputs');
    if(update)assert.throws(()=>assignmentContext(state,ordinaryJob),/Unqualified referenced evidence/,'Superseded proof bodies remain unclassified in format 5; no implicit archive permission');
    assert.ok(bytes(domainAssignment.text)<48000);assert.ok(bytes(integration.text)<48000);
    return q;
  }
  // Three independent scopes include decision, preference and retained Fail
  // histories. Additional qualified archive entries cannot force A to replay.
  const b=await addScope(1),negative=await addScope(2);assert.ok(negative.extracts.some(e=>e.review.qualification_result.items.some(i=>i.kind==='negative_finding')));await addScope(3);await addScope(1,{update:true});
  const state=read(f),projection=reviewedContext(state);
  assert.equal(projection.excluded('history-D02'),true);assert.equal(state.records['history-D02'].review.verdict,'Fail');
  assert.deepEqual(currentRecords(state,{context_scope:'D00'},projection).filter(r=>r.id.startsWith('home-')).map(r=>r.id),['home-D00']);
  f.plan_id=firstPlan.id;
  assert.equal(call(f,{action:'target',phase:'extract',unit_id:a.extracts[0].target.target.unit_id}).job_id,a.extracts[0].job.id);
  const fresh=await run(f,{phase:'applicability',extraction_review_ids:a.extracts.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'D00'});
  assert.equal(fresh.review.review.verdict,'Pass');assert.ok(!fresh.packet.global_rules.governing.some(r=>r.source.id.startsWith('history-')||r.source.id==='home-D01'));
  assert.ok(bytes(fresh.job.qualification_delivery.wire)<48000);assert.equal(b.extracts[0].packet.phase,'extract');
  for(const extra of [
    {id:'unclassified',kind:'decision',content:'New history may interact; must review.'},
    {id:'proposed',kind:'preference',content:'Proposed unrelated scope still requires review.',context_obligations:{version:1,scope:'D99'}},
    {id:'global',kind:'decision',content:'NEW GLOBAL RULE: all preparation now requires fresh consent.',context_obligations:{version:1,scope:'*'}},
    {id:'negative',kind:'review',content:'Unreviewed negative.',review:{verdict:'Blocked',reason:'Unknown interaction.'}},
    {id:'negative-result',kind:'artifact',content:'Partial negative result is still evidence.',qualification_result:{verdict:'Fail',reason:'Unknown interaction.'}}
  ]){
    const copy=inheritSnapshots(state,structuredClone(state));copy.records[extra.id]={revision:1,...extra};
    assert.throws(()=>scoped.validateScopedApply(copy,{integration_review_id:a.integrated.review.id}),/global governing identity/);
    const target=scoped.createScopedTarget(copy,{plan_id:firstPlan.id,phase:'applicability',extraction_review_ids:a.extracts.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'D00'});
    assert.ok(resolveSnapshot(copy,target.global_snapshot).governing.some(r=>r.source.id===extra.id&&r.value.content===extra.content),'Full unknown/global/negative/proposed evidence reaches fresh QA');
  }
  for(const mutateRule of [s=>delete s.records['home-D00'],s=>s.records['home-D00'].content+=' New relevant condition.']){const copy=inheritSnapshots(state,structuredClone(state));mutateRule(copy);assert.throws(()=>scoped.validateScopedApply(copy,{integration_review_id:a.integrated.review.id}),/Scoped context hold/);}
  mutate(f,s=>{s.records['unknown-source']={id:'unknown-source',kind:'artifact',revision:1,content:'UNKNOWN_EXTRA'};});
  f.plan_id=call(f,{action:'plan',protocol,source_id:'unknown-source'}).id;const unknown=await extraction(f);
  const unknownState=read(f),unknownTarget=scoped.createScopedTarget(unknownState,{plan_id:f.plan_id,phase:'applicability',extraction_review_ids:unknown.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'D00'});
  assert.deepEqual(unknownTarget.governing_scopes,['*'],'Unknown extracted effects cannot be narrowed by the caller task scope');
  assert.ok(resolveSnapshot(unknownState,unknownTarget.global_snapshot).governing.some(r=>r.source.id==='home-D01'),'Unknown applicability sees independently qualified other scopes in full');

});

test('ordinary worker producer edge binds exact outcome and native closure while keeping source-only identity reusable',async()=>{
  const f=fixture(),q=await qualify(f),produced=q.extracts[0].review,state=read(f);
  const p=scoped.captureScopedPlan(state,{source_id:produced.id}),planRecord={id:'producer-plan',scoped_context_plan:p};state.records[planRecord.id]=planRecord;
  const capsule=resolveSnapshot(state,p.capsule);assert.equal(capsule.producer.id,'job:'+produced.job_id);
  assert.equal(p.extraction_identity,sha({protocol,source:p.source,producer:capsule.producer,projection_sha256:p.projection_sha256,partitioner:'lossless-ranges-v1',units:p.units}),'Ordinary producer identities preserve the original v1 grammar');
  const changed=inheritSnapshots(state,structuredClone(state));changed.notices.push({id:'new',summary:'Unrelated current rule.'});
  assert.equal(scoped.captureScopedPlan(changed,{source_id:produced.id}).extraction_identity,p.extraction_identity);
  for(const change of [j=>j.status='failed',j=>j.artifact_id='other',j=>j.native_id='changed',j=>j.coordination_release.termination_confirmed=false,j=>j.execution_failure={outcome:'unknown'}]){
    const copy=inheritSnapshots(state,structuredClone(state));change(copy.jobs[produced.job_id]);assert.throws(()=>scoped.scopedPlanView(copy,{plan_id:planRecord.id}),/Scoped context hold/);
  }
  const broken=inheritSnapshots(state,structuredClone(state));delete broken.jobs[produced.job_id];assert.throws(()=>scoped.captureScopedPlan(broken,{source_id:produced.id}),/source missing/);
});

test('regression: a represented governing rule retains its same-scope artifact home',async()=>{
  const f=fixture({kind:'decision',homeKind:'artifact'});
  const first=await qualify(f);
  assert.equal(scoped.validateScopedApply(read(f),{integration_review_id:first.integrated.review.id}).source.id,'old');
  mutate(f,s=>{
    s.records.second={id:'second',kind:'artifact',revision:1,content:token('D00',100)};
    s.records['home-second']={id:'home-second',kind:'artifact',revision:1,content:token('D00',100),context_obligations:{version:1,scope:'D00'}};
  });
  f.plan_id=call(f,{action:'plan',protocol,source_id:'second'}).id;
  const es=await extraction(f);
  const d=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-second'],context_scope:'D00'});
  assert.equal(d.job.status,'completed',d.job.error);
  const globals=JSON.stringify(d.packet.global_rules),preserved=globals.includes(f.clauses[0]);
  console.log(JSON.stringify({same_scope:'D00',qualified_artifact_home_effect_present:preserved,applicability_verdict:d.review?.review.verdict,contract_doubles_only:true}));
  {
    assert.ok(preserved,'The exact effect from home-D00 must remain in same-scope global evidence.');
    const i=await run(f,{phase:'integration',domain_review_ids:[d.review.id],counterpart_ids:['home-second']});
    assert.equal(i.job.status,'completed',i.job.error);
    assert.equal(i.review.review.verdict,'Pass');
    assert.equal(call(f,{action:'apply',integration_review_id:i.review.id}).applied,true);
    assert.equal(scoped.validateScopedApply(read(f),{integration_review_id:i.review.id}).source.id,'second');
  }
});

test('typed mandatory dependencies and changed artifact homes remain exact governing evidence',async()=>{
  const f=fixture({kind:'decision',homeKind:'artifact'});
  mutate(f,s=>{s.jobs.dep={id:'dep',status:'completed',task:'Retain the exact dependency constraint',native_id:'dependency-native',coordination_release:{termination_confirmed:true}};s.records.dep={id:'dep',kind:'artifact',revision:1,content:'Distinct record with the same raw ID; must never substitute for job:dep.'};});
  const es=await extraction(f),d=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],dependency_ids:['job:dep'],context_scope:'D00'});
  const i=await run(f,{phase:'integration',domain_review_ids:[d.review.id],counterpart_ids:['home-D00'],dependency_ids:['job:dep']});
  assert.equal(call(f,{action:'apply',integration_review_id:i.review.id}).applied,true);
  assert.equal(scoped.validateScopedApply(read(f),{integration_review_id:i.review.id}).source.id,'old');
  mutate(f,s=>{s.records.second={id:'second',kind:'artifact',revision:1,content:token('D00',100)};s.records['home-second']={id:'home-second',kind:'artifact',revision:1,content:token('D00',100),context_obligations:{version:1,scope:'D00'}};});
  f.plan_id=call(f,{action:'plan',protocol,source_id:'second'}).id;const second=await extraction(f),state=read(f);
  const args={plan_id:f.plan_id,phase:'applicability',extraction_review_ids:second.map(e=>e.review.id),counterpart_ids:['home-second'],context_scope:'D00'};
  const target=scoped.createScopedTarget(state,args),governing=resolveSnapshot(state,target.global_snapshot).governing;
  const dependency=governing.find(e=>e.source.id==='job:dep');assert.deepEqual(dependency.value,state.jobs.dep);assert.notEqual(dependency.source.sha256,sha(state.records.dep));
  assert.ok(governing.some(e=>e.source.id==='home-D00'&&e.value.content===state.records['home-D00'].content));
  for(const change of [s=>{s.records['home-D00'].revision++;s.records['home-D00'].content+=' NEW CURRENT RESTRICTION: no renewed allowance.';},s=>{s.jobs.dep.status='failed';s.jobs.dep.coordination_release.termination_confirmed=false;}]){
    const changed=inheritSnapshots(state,structuredClone(state));change(changed);
    const next=scoped.createScopedTarget(changed,args),current=resolveSnapshot(changed,next.global_snapshot).governing;
    assert.ok(current.some(e=>e.source.id==='home-D00'&&JSON.stringify(e.value)===JSON.stringify(changed.records['home-D00'])));
    assert.ok(current.some(e=>e.source.id==='job:dep'&&JSON.stringify(e.value)===JSON.stringify(changed.jobs.dep)));
  }
});


test('new global scope expansion widens old homes in fresh applicability instead of hiding their bodies',async()=>{
  const f=fixture({kind:'decision',homeKind:'artifact'}),first=await qualify(f);
  mutate(f,s=>{
    s.records.expand={id:'expand',kind:'decision',revision:1,content:'All D00 constraints now also apply to D01.'};
    s.records.second={id:'second',kind:'artifact',revision:1,content:token('D01',100)};
    s.records['home-second']={id:'home-second',kind:'artifact',revision:1,content:token('D01',100),context_obligations:{version:1,scope:'D01'}};
  });
  assert.throws(()=>scoped.validateScopedApply(read(f),{integration_review_id:first.integrated.review.id}),/global governing identity/);
  f.plan_id=call(f,{action:'plan',protocol,source_id:'second'}).id;const es=await extraction(f);
  const current=read(f),target=scoped.createScopedTarget(current,{plan_id:f.plan_id,phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-second'],context_scope:'D01'});
  const global=resolveSnapshot(current,target.global_snapshot);
  assert.ok(global.governing.some(r=>r.source.id==='expand'));
  assert.ok(global.governing.some(r=>r.source.id==='home-D00'&&r.value.content===f.clauses[0]),'Fresh QA receives the newly relevant exact scope body');
});

test('root authority changes and changed or removed scope rules widen fresh review inputs',async()=>{
  for(const change of ['root','changed-rule','removed-rule']){
    const f=fixture({kind:'decision',homeKind:'artifact'});
    mutate(f,s=>{s.records.limiter={id:'limiter',kind:'decision',revision:1,content:'D00 obligations are limited to D00 under this current rule.'};});
    const first=await qualify(f);
    mutate(f,s=>{
      if(change==='root'){s.governance+=' All D00 obligations now extend to D01.';s.team_sha256=teamHash(s);}
      if(change==='changed-rule'){s.records.limiter.revision++;s.records.limiter.content='D00 obligations now also apply to D01.';}
      if(change==='removed-rule')delete s.records.limiter;
      s.records.second={id:'second',kind:'artifact',revision:1,content:token('D01',100)};
      s.records['home-second']={id:'home-second',kind:'artifact',revision:1,content:token('D01',100),context_obligations:{version:1,scope:'D01'}};
    });
    assert.throws(()=>scoped.validateScopedApply(read(f),{integration_review_id:first.integrated.review.id}),/global governing identity/);
    f.plan_id=call(f,{action:'plan',protocol,source_id:'second'}).id;const es=await extraction(f),current=read(f);
    const target=scoped.createScopedTarget(current,{plan_id:f.plan_id,phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-second'],context_scope:'D01'});
    assert.ok(resolveSnapshot(current,target.global_snapshot).governing.some(r=>r.source.id==='home-D00'&&r.value.content===f.clauses[0]),change);
  }
});

// Synthetic evidence check only: completeness depends on the actual delivered
// sentence, never merely on changing a semantic attestation to true.
test('clipped natural-language qualifier holds until a new explicit supporting bundle supplies its entire boundary',async()=>{
  const qualifier='Sending remains blocked until independent billing evidence establishes '+[
    'whether the original charge settled, duplicated, was reversed, or remains pending in the bank ledger',
    'whether the invoice balance includes a provisional adjustment rather than a completed refund',
    'whether the payment processor and the bank describe the same transaction and settlement period',
    'whether a disputed payment was recorded separately from the original possible duplicate charge',
    'whether the customer account contains an unresolved credit that could conceal the duplicate',
    'whether an earlier repair attempt consumed the single allowance without establishing its effects',
    'whether a pending refund is conditional and could still fail before the bank confirms completion',
    'whether a settlement report excludes transactions recorded after its reporting cutoff',
    'whether an apparent reversal belongs to this invoice rather than another invoice with the same amount',
    'whether a previous reconciliation assumed success from an acknowledgement before settlement',
    'whether the billing record preserves the uncertain outcome and every exhausted repair allowance',
    'whether a separate customer account has been incorrectly used as evidence of this payment',
    'whether the reported balance includes a manual correction whose source has not been verified',
    'whether the bank statement and processor export agree about the exact transaction identifier',
    'whether an open dispute can change the settlement outcome after the current reporting date',
    'whether the ledger distinguishes a proposed refund from a refund that the bank actually completed',
    'whether the historical report omitted any pending adjustment that could restore the duplicate',
    'whether the internal draft describes the outcome as unknown while this evidence is incomplete',
    'whether another employee recorded a proposed repair as complete before independent confirmation',
    'whether any retry would exceed the exhausted allowance or presume authority absent from the source',
    'whether a later settlement correction changes the original record without resolving the uncertainty',
    'whether all statements about the payment refer to this exact fictional invoice and account',
    'whether any correction in a subsequent reporting period has been independently reconciled with the original entry',
    'whether customer contact has a separate explicit authorization covering the recipient, message and delivery method'
  ].join('; ')+ '; resolving that uncertainty alone grants no contact authority.';
  assert.ok(qualifier.length>2400);
  const f=fixture({count:0,extra:{content:qualifier}}),units=unitPages(f),reads=units.map(u=>call(f,{action:'read',plan_id:f.plan_id,unit_id:u.id}).unit);
  const primary=reads.find(u=>u.fragment.text.includes('Sending remains blocked until'));
  assert.ok(primary);assert.ok(!primary.fragment.text.includes('alone grants no contact authority.'));
  const review=p=>{
    const e=contractReview(p),r=e.qualification_result,b=p.reviewed_unit_bundle;
    // Reassemble exact overlapping frozen ranges, checking every shared code unit.
    const chars=[];for(const u of [b.primary,...b.supporting])for(let n=0;n<u.fragment.text.length;n++){
      const at=u.fragment.range.delivered_start+n;assert.ok(chars[at]===undefined||chars[at]===u.fragment.text[n]);chars[at]=u.fragment.text[n];
    }
    const complete=Array.from({length:chars.length},(_,i)=>chars[i]??'\0').join('').includes(qualifier);
    Object.assign(r,{items:complete?[{id:'boundary',kind:'boundary',text:qualifier,scope:'outreach',provenance:b.provenance_sha256,interfaces:[{id:'billing',with_scope:'billing',text:qualifier}]}]:[],...(!complete?{verdict:'Blocked',permitted_action:'hold',preservation_complete:false,interfaces_complete:false,scope_complete:false,reason:'CONTRACT DOUBLE: delivered qualifier ends mid-sentence; explicit supporting evidence required.',blockers:['Missing the complete billing condition and contact-authority boundary.']}: {})});
    return envelope(r);
  };
  const held=await run(f,{phase:'extract',unit_id:primary.id},{review});assert.equal(held.job.status,'completed',held.job.error);assert.equal(held.review.review.verdict,'Blocked');const retained=JSON.stringify(held.review);
  await assert.rejects(run(f,{phase:'applicability',extraction_review_ids:[held.review.id],counterpart_ids:['home-D00']}),/negative receipt|retained negative evidence/);
  const expanded=await run(f,{phase:'extract',unit_id:primary.id,context_unit_ids:units.filter(u=>u.id!==primary.id).map(u=>u.id)},{review});
  assert.equal(expanded.job.status,'completed',expanded.job.error);assert.equal(expanded.review.review.verdict,'Pass');assert.notEqual(expanded.target.id,held.target.id);
  assert.equal(expanded.review.qualification_result.items[0].text,qualifier);assert.equal(expanded.review.qualification_result.items[0].interfaces[0].text,qualifier);
  assert.equal(JSON.stringify(read(f).records[held.review.id]),retained,'The original hold is retained verbatim');
  assert.equal(read(f).context_classifications?.old,undefined,'Deterministic extraction evidence grants no applicability or model acceptance');
});

test('exact ordered supporting ranges and hashes survive canonical artifact delivery; only identical bundles reuse',async()=>{
  const f=fixture({count:35}),units=unitPages(f);assert.ok(units.length>=3);
  const bare=await run(f,{phase:'extract',unit_id:units[0].id});assert.equal(bare.job.status,'completed',bare.job.error);
  const args={phase:'extract',unit_id:units[0].id,context_unit_ids:[units[2].id+'/1',units[1].id]},e=await run(f,args);
  assert.notEqual(e.review.id,bare.review.id,'The less-informed completed extraction cannot satisfy expanded context');
  assert.equal(e.job.status,'completed',e.job.error);
  const b=e.packet.reviewed_unit_bundle;
  assert.deepEqual(b.supporting.map(u=>u.id),args.context_unit_ids);
  for(const [index,u] of [b.primary,...b.supporting].entries()){
    assert.deepEqual(u,call(f,{action:'read',plan_id:f.plan_id,unit_id:u.id}).unit);
    const provenance=index?b.provenance.supporting[index-1]:b.provenance.primary;
    assert.deepEqual(provenance,{unit_id:u.id,unit_sha256:sha(u),path:u.fragment.path,range:u.fragment.range});
    const projection=JSON.stringify(resolveSnapshot(read(f),resolveSnapshot(read(f),read(f).records[f.plan_id].scoped_context_plan.capsule).projection));
    assert.equal(u.fragment.text,projection.slice(u.fragment.range.delivered_start,u.fragment.range.delivered_end));
    assert.equal(b.provenance.projection_sha256,digest(projection));
  }
  assert.deepEqual(b.provenance.source,read(f).records[f.plan_id].scoped_context_plan.source);
  assert.equal(b.provenance_sha256,sha(b.provenance));
  assert.deepEqual(e.review.reviewed_unit_bundle,b);assert.equal(e.review.qualification_result.reviewed_unit_bundle_sha256,sha(b));
  assert.ok(e.review.qualification_result.items.length);assert.ok(e.review.qualification_result.items.every(i=>i.provenance===b.provenance_sha256));
  const d=await run(f,{phase:'applicability',extraction_review_ids:[e.review.id],counterpart_ids:['home-D00'],context_scope:'D00'});
  assert.equal(d.job.status,'completed',d.job.error);assert.deepEqual(d.packet.extractions[0].reviewed_unit_bundle,b);
  for(const v of [e,d])assert.equal(v.packet.response_shape.target_sha256,v.packet.target.sha256);
  assert.equal(e.packet.target.sha256,sha(read(f).records[e.target.id]));assert.notEqual(e.packet.target.sha256,sha(e.target.target));
  assert.equal(call(f,{action:'target',...args}).review_id,e.review.id);
  assert.equal(call(f,{action:'target',...args,context_unit_ids:[]}).review_id,bare.review.id);
  for(const context_unit_ids of [[units[1].id],args.context_unit_ids.toReversed(),[units[2].id+'/0',units[1].id]])assert.ok(call(f,{action:'target',...args,context_unit_ids}).id,'Different context must create a target');
  mutate(f,s=>s.notices.push({id:'unrelated-context',summary:'Current context changes do not alter frozen extraction.'}));
  const replacement=call(f,{action:'plan',protocol,source_id:'old'});assert.equal(call(f,{action:'target',...args,plan_id:replacement.id}).review_id,e.review.id);
  const original=read(f);
  for(const change of [s=>s.records[e.review.id].reviewed_unit_bundle.supporting[0].fragment.text+='substitute',s=>s.records[e.review.id].reviewed_unit_bundle.provenance.source.sha256='forged',s=>s.records[e.target.id].scoped_context_target.context_unit_ids.reverse(),s=>s.records.old.clauses.push('changed')]){
    const copy=inheritSnapshots(original,structuredClone(original));change(copy);
    assert.throws(()=>scoped.createScopedTarget(copy,{plan_id:f.plan_id,phase:'applicability',extraction_review_ids:[e.review.id],counterpart_ids:['home-D00']}),/Scoped context hold/);
  }
});

test('invalid support IDs and altered bundle provenance cannot substitute for exact frozen delivery',async()=>{
  const f=fixture({count:18}),units=unitPages(f),primary=units[0].id,support=units[1].id;
  for(const context_unit_ids of [[primary],[support,support],['u999'],[support+'/2'],[support+'/0/'.repeat(18)],null,'u1'])assert.throws(()=>call(f,{action:'target',phase:'extract',unit_id:primary,context_unit_ids}),/primary unit|unique context|unknown subdivision/);
  const forged=change=>(r,p)=>{const descriptor=structuredClone(p.reviewed_unit_bundle.provenance);change(descriptor);r.items[0].provenance=sha(descriptor);};
  for(const change of [r=>r.target_sha256='forged',(r,p)=>r.target_sha256=sha(read(f).records[p.target.id].scoped_context_target),r=>r.unit_sha256='forged',r=>r.reviewed_unit_bundle_sha256='forged',forged(d=>d.supporting[0].range.end++),forged(d=>d.supporting[0].unit_id=primary),forged(d=>d.supporting[0].unit_sha256='forged'),forged(d=>d.source.sha256='forged'),forged(d=>d.projection_sha256='forged'),forged(d=>d.supporting=[]),forged(d=>d.supporting.push(d.supporting[0]))]){
    const e=await run(f,{phase:'extract',unit_id:primary,context_unit_ids:[support]},{review:p=>{const e=contractReview(p);change(e.qualification_result,p);return e;}});
    assert.equal(e.job.status,'failed');assert.ok(e.job.rejected_output.text);assert.ok(!e.review);
  }
});

test('supporting units do not count as primary coverage; exact independent primaries still complete',async()=>{
  const f=fixture({count:8}),units=unitPages(f);assert.ok(units.length>=2);
  const first=await run(f,{phase:'extract',unit_id:units[0].id,context_unit_ids:units.slice(1).map(u=>u.id)});
  const d=await run(f,{phase:'applicability',extraction_review_ids:[first.review.id],counterpart_ids:['home-D00'],context_scope:'D00'});
  await assert.rejects(run(f,{phase:'integration',domain_review_ids:[d.review.id],counterpart_ids:['home-D00']}),/unit coverage omission/);
  const duplicate=await run(f,{phase:'extract',unit_id:units[0].id});
  const repeated=await run(f,{phase:'applicability',extraction_review_ids:[first.review.id,duplicate.review.id],counterpart_ids:['home-D00'],context_scope:'D00'});
  await assert.rejects(run(f,{phase:'integration',domain_review_ids:[repeated.review.id],counterpart_ids:['home-D00']}),/unit coverage gap\/duplicate\/overlap/);
  const es=[first];for(const u of units.slice(1))es.push(await run(f,{phase:'extract',unit_id:u.id,context_unit_ids:[units[0].id]}));
  const full=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'D00'});
  const i=await run(f,{phase:'integration',domain_review_ids:[full.review.id],counterpart_ids:['home-D00']});assert.equal(i.job.status,'completed',i.job.error);assert.equal(i.packet.response_shape.target_sha256,i.packet.target.sha256);
  assert.equal(call(f,{action:'apply',integration_review_id:i.review.id}).applied,true);
});

test('an explicit supporting context set above the original input ceiling holds without dispatch',()=>{
  const f=fixture({count:500}),units=unitPages(f),t=call(f,{action:'target',phase:'extract',unit_id:units[0].id,context_unit_ids:units.slice(1).map(u=>u.id)}),before=Object.keys(read(f).jobs).length;
  assert.throws(()=>engine.dispatch({...f,role:'qa',review_of:t.id,task:'Oversized explicit context must hold.'},'codex',{check:()=>({available:true,authenticated:true}),launch:()=>{assert.fail('Must not launch');}}),e=>e instanceof scoped.ScopedHold&&e.held.limit_bytes===48000);
  assert.equal(Object.keys(read(f).jobs).length,before);assert.equal(read(f).context_classifications?.old,undefined);
});
