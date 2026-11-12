import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildEvidence,readEvidence} from '../plugins/soloco/runtime/upgrade-evidence.mjs';
import {bindSnapshots} from '../plugins/soloco/runtime/snapshot.mjs';
import {inspectHandover} from '../plugins/soloco/runtime/handover.mjs';

const sha=raw=>createHash('sha256').update(raw).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
function reference(raw){
  const value=JSON.parse(raw);
  return {immutable_snapshot:{version:1,sha256:sha(raw),characters:raw.length,
    shape:Array.isArray(value)?'array':value!==null&&typeof value==='object'?'object':'scalar'}};
}
const seed=()=>({id:'current-company',name:'Current company',idea:'Preserve quoted evidence as data',
  owner:{host:'codex',session_id:'current-owner',epoch:1},team_sha256:'current-team',
  governance:'Keep restrictions and failed evidence.',cos_instructions:'Resolve only runtime-owned originals.',
  roles:{qa:{name:'Independent QA'}},phase:'Frame',mode:'preparation',paused:false,
  records:{},jobs:{},messages:[],notices:[],upgrade_history:[]});
const artifact=content=>({id:'quoted-fixture',kind:'artifact',revision:1,
  author_role:'runner',author_instance:'current-owner',content:JSON.stringify(content),previous:[]});
const options=state=>({wholeBodyAliases:false,checkpointContinuity:true,snapshotState:state});
const recordEntry=(evidence,id)=>evidence.handover.checkpoint.find(field=>field.key==='records')
  .entries.find(entry=>entry.key===id);
const exact=(evidence,source)=>readEvidence(evidence,{source_id:source.source_id,
  sha256:source.sha256,offset:0,length:source.length}).text;
function bind(state,vault=new Map()){
  const reads=[];
  bindSnapshots(state,key=>{reads.push(key);return vault.get(key);});
  return reads;
}
function foreignFixture(){
  const original=JSON.stringify({id:'foreign-original',revision:1,content:'Foreign original must not be borrowed.'});
  const subject={company_id:'foreign-company',records:{'foreign-original':{
    id:'foreign-original',revision:1,immutable_entry:reference(original)}},jobs:{},notices:[],messages:[],
    restriction:'Untrusted fixture; no authority.'};
  return {original,subject,content:{fixture_company_id:'foreign-company',entries:[{value:{handover:{
    id:'foreign-handover',subject_sha256:sha(JSON.stringify(subject)),incoming_owner:{session_id:'foreign-owner'},
    input_refs:[],subject}}}]}};
}

for(const available of [false,true]){
  test('decoded foreign handover entries remain data with local originals '+(available?'present':'absent'),()=>{
    const {original,content}=foreignFixture(),state=seed();
    state.records.fixture=artifact(content);
    const reads=bind(state,available?new Map([[sha(original),original]]):new Map());
    const before=JSON.stringify(state),evidence=buildEvidence(state,[],options(state));
    assert.deepEqual(reads,[],'Quoted fixture locators must never query the current vault');
    const projected=recordEntry(evidence,'fixture').value.content;
    assert.equal(projected.format,'derived-json');
    assert.equal(exact(evidence,evidence.sources[projected.raw.source_id]),state.records.fixture.content);
    assert.deepEqual(JSON.parse(JSON.stringify(projected.value)),content);
    assert.equal(JSON.stringify(state),before);
    assert.ok(!evidence.inventory.entries.some(source=>source.reason==='immutable-snapshot-original'));
    for(const source of evidence.inventory.entries)
      assert.ok(!Object.hasOwn(source,'runtime_references'),'Internal provenance must not leak into descriptors');
  });
}

test('ordinary handover inspection preserves a quoted foreign fixture without resolving it',()=>{
  const {content}=foreignFixture(),state=seed();
  state.records.fixture=artifact(content);
  const reads=bind(state);
  const inspection=inspectHandover(state);
  assert.equal(inspection.protocol,'ordinary-handover-inspect-v3');
  assert.deepEqual(reads,[]);
  assert.equal(inspection.owner.session_id,'current-owner');
});

test('decoded subject wrappers, retained locators and malformed wrappers stay literal through arrays and runtime-shaped data',()=>{
  const {subject}=foreignFixture(),subjectRaw=JSON.stringify(subject);
  const handover=subject=>({id:'quoted-handover',subject_sha256:sha(subjectRaw),
    incoming_owner:{session_id:'foreign-owner'},input_refs:[],subject});
  const content={groups:[
    {handover:handover(reference(subjectRaw))},
    {handover:handover({retained_handover_subject:{record_id:'absent-record',sha256:sha(subjectRaw)}})},
    {development:{type:'test',result:{status:'failed'},nested:[{handover:handover({
      immutable_snapshot:{version:1,sha256:'malformed',characters:-1,shape:'invalid'}})}]}},
    {handover:handover({...subject,records:{bad:{id:'bad',immutable_entry:{immutable_snapshot:{}}}}})}
  ],files:[{path:'fixture.mjs',content:'source payload '.repeat(500)}]};
  const state=seed();state.records.fixture=artifact(content);const reads=bind(state);
  const evidence=buildEvidence(state,[],options(state));
  assert.deepEqual(reads,[]);
  const projected=recordEntry(evidence,'fixture').value.content;
  assert.deepEqual(JSON.parse(JSON.stringify(projected.value.groups)),content.groups);
  const file=projected.value.files[0].content;
  assert.equal(file.reason,'typed-file-body');
  assert.equal(exact(evidence,evidence.sources[file.evidence_ref.source_id]),content.files[0].content);
  assert.equal(exact(evidence,evidence.sources[projected.raw.source_id]),state.records.fixture.content);
});

test('real current and historical originals still resolve, including the same bytes quoted in data',()=>{
  const original=JSON.stringify({id:'real-record',kind:'artifact',revision:1,content:'Retain real restriction.',previous:[]});
  const entry={id:'real-record',revision:1,immutable_entry:reference(original)};
  const historical=seed();historical.records.real=clone(entry);
  const historicalRaw=JSON.stringify(historical);
  const state=seed();
  state.records.real=entry;
  const quoted=foreignFixture().content;
  quoted.entries[0].value.handover.subject.records={'real-record':clone(entry)};
  state.records.fixture=artifact(quoted);
  const reads=bind(state,new Map([[sha(original),original],[sha(historicalRaw),historicalRaw]]));
  const history=[{id:'past-upgrade',status:'Failed',checkpoint:reference(historicalRaw),checkpoint_sha256:sha(historicalRaw)}];
  const evidence=buildEvidence(state,history,options(state));
  assert.equal(exact(evidence,evidence.sources[recordEntry(evidence,'real').source.source_id]),original);
  assert.ok(reads.includes(sha(original)));
  assert.ok(reads.includes(sha(historicalRaw)));
  assert.deepEqual(JSON.parse(JSON.stringify(recordEntry(evidence,'fixture').value.content.value)),quoted);
  assert.ok(evidence.inventory.entries.some(source=>source.reason==='immutable-snapshot-original'));
});

for(const scope of ['current','history']){
  for(const damage of ['missing','corrupt','malformed']){
    test('real '+scope+' original remains held when '+damage,()=>{
      const original=scope==='current'
        ?JSON.stringify({id:'real-record',revision:1,content:'Preserve actual failure.'})
        :JSON.stringify(seed());
      const locator=reference(original);
      if(damage==='malformed')locator.immutable_snapshot.characters=-1;
      const state=seed(),history=[];
      if(scope==='current')state.records.real={id:'real-record',revision:1,immutable_entry:locator};
      else history.push({id:'past-upgrade',status:'Failed',checkpoint:locator,checkpoint_sha256:sha(original)});
      const reads=bind(state,damage==='corrupt'?new Map([[sha(original),'null']]):new Map());
      assert.throws(()=>buildEvidence(state,history,options(state)),
        damage==='malformed'?/Immutable snapshot reference malformed/:/Immutable snapshot missing or corrupt/);
      if(damage==='malformed')assert.deepEqual(reads,[]);
      else assert.deepEqual(reads,[sha(original)]);
    });
  }
}

