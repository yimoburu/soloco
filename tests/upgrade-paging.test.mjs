import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildEvidence, evidencePage, createDeliveryLedger, recordDelivery, readEvidence, validateCitations, RANGE_LIMIT, admitPrompt } from '../plugins/soloco/runtime/upgrade-evidence.mjs';
const sha=text=>createHash('sha256').update(text).digest('hex');
const cp=records=>({id:'real-company',records,jobs:{},notices:[],messages:[]});
const artifact=value=>({id:'artifact',kind:'artifact',content:JSON.stringify(value)});
const request=(source,offset=0,length=RANGE_LIMIT)=>({source_id:source.source_id,sha256:source.sha256,offset,length});
const cite=read=>({source_id:read.source_id,sha256:read.sha256,offset:read.offset,length:read.length,range_sha256:read.range_sha256});

test('over 1M semantic history reassembles deterministically with every revision and old constraint',()=>{
  const text='Unknown founder obligation 😀 never spend without approval. '.repeat(23000);
  const input=cp({r:{id:'r',revision:9,content:text,previous:[{revision:1,content:'Old Failed review remains unresolved'}]}});
  const history=[{id:'attempt',status:'failed',error:'input_too_large',review:{verdict:'Blocked',reason:'Old blocker never cleared by a later Pass'}}];
  const subject=buildEvidence(input,history),again=buildEvidence(input,history);
  assert.deepEqual(subject.pages,again.pages);
  const pages=subject.pages.map(p=>evidencePage(subject,p));
  assert.ok(pages.length>10);
  let next=0;
  for(const p of pages){assert.equal(p.offset,next);next=p.end;admitPrompt(JSON.stringify({prefix:'real envelope',page:p}));}
  const stream=pages.map(p=>p.text).join('');
  assert.equal(sha(stream),pages[0].sha256);
  const parsed=JSON.parse(stream);
  assert.deepEqual(parsed.handover,JSON.parse(JSON.stringify(subject.handover)));
  assert.deepEqual(parsed.registry,subject.inventory.entries);
  const recovered=parsed.handover.checkpoint.find(f=>f.key==='records').entries[0].value;
  assert.equal(recovered.content,text);
  assert.equal(recovered.previous[0].value.content,'Old Failed review remains unresolved');
  assert.ok(stream.includes('input_too_large')&&stream.includes('Old blocker never cleared'));
  const author=createDeliveryLedger(subject,'author'),qa=createDeliveryLedger(subject,'qa');
  const page=pages[1],read=readEvidence(subject,request(subject.sources[page.source_id],page.offset,32000));
  assert.throws(()=>validateCitations(subject,[cite(read)],author),/not completely delivered/);
  const supplied={source_id:page.source_id,sha256:page.sha256,...page.citation_ranges[0]};
  assert.throws(()=>validateCitations(subject,[supplied],author),/not completely delivered/);
  recordDelivery(subject,author,page);
  assert.equal(validateCitations(subject,[supplied],author),true);
  assert.equal(validateCitations(subject,[cite(read)],author),true);
  assert.throws(()=>validateCitations(subject,[cite(read)],qa),/not completely delivered/);
  const unseen=readEvidence(subject,request(subject.sources[page.source_id],pages[2].offset,32000));
  assert.throws(()=>validateCitations(subject,[cite(unseen)],author),/not completely delivered/);
  assert.throws(()=>recordDelivery(subject,qa,{...page}),/authentic/);
});

test('huge payload citations need only exact delivered excerpts; ledgers never share reads',()=>{
  const subject=buildEvidence(cp({r:artifact({file:{path:'src/huge.mjs',content:'body😀'.repeat(400000)},reason:'Source is not proof of accepted functionality'})}));
  const source=Object.values(subject.sources).find(s=>s.reason==='typed-file-body');
  assert.ok(source.length>2000000);
  const read=readEvidence(subject,request(source,0,32000));
  const author=createDeliveryLedger(subject,'a'),qa=createDeliveryLedger(subject,'q');
  recordDelivery(subject,author,read);
  assert.equal(validateCitations(subject,[cite(read)],author),true);
  assert.throws(()=>validateCitations(subject,[{source_id:source.source_id,sha256:source.sha256}],author),/not completely delivered/);
  assert.throws(()=>validateCitations(subject,[cite(read)],qa),/not completely delivered/);
  assert.throws(()=>validateCitations(subject,[{...cite(read),range_sha256:'wrong'}],author),/range hash/);
});

test('unknown string maps remain semantic and JSON escape spelling normalizes without losing duplicate keys',()=>{
  const raw=String.raw`{ "file": {"path":"src\/x.mjs","content":"\u0061"}, "claim":"\u0062" }`;
  const duplicate=String.raw`{"rule":"old","rule":"new","file":{"path":"x.mjs","content":"body"}}`;
  const input=cp({r:artifact({sources:{founder_rule:'Never spend without approval'},files:{'src/a.mjs':'known body'},unknown:'Keep this obligation'}),escaped:{id:'e',kind:'artifact',content:raw},duplicate:{id:'d',kind:'artifact',content:duplicate}});
  const subject=buildEvidence(input),entries=subject.handover.checkpoint.find(f=>f.key==='records').entries;
  const value=entries[0].value.content.value;
  assert.deepEqual({...value.sources},{founder_rule:'Never spend without approval'});
  assert.ok(!Object.values(subject.sources).some(s=>s.kind==='payload'&&s.raw==='Never spend without approval'));
  assert.equal(entries[1].value.content.value.claim,'b');
  assert.equal(entries[2].value.content,duplicate);
  assert.equal(Object.values(subject.sources).find(s=>s.reason==='typed-file-body'&&s.raw==='a').raw,'a');
});

test('dotted obligation keys stay semantic while recognizable paths and explicit runtime files retain provenance',()=>{
  const obligations={
    'Founder rule.':'Never spend without approval',
    'budget.max':'Keep below100',
    '.':'Keep founder authority',
    'legal\\rule':'Unknown prose is still an obligation'
  };
  const input=cp({
    obligations:artifact({sources:obligations,files:{'src/policy.mjs':'export const hold = true;'},claim:'Keep limits visible'}),
    explicit:artifact({sources:{'budget.max':{path:'custom-extension.policy',content:'explicit source body',authority:'Still preparation only'}}}),
    runtime:{id:'runtime',development:{type:'candidate',files:[{path:'custom filename',content:'runtime file body',owner:'Engineering'}]}}
  });
  const subject=buildEvidence(input),entries=subject.handover.checkpoint.find(f=>f.key==='records').entries;
  assert.deepEqual(JSON.parse(JSON.stringify(entries[0].value.content.value.sources)),obligations);
  for(const [key,text] of Object.entries(obligations)) {
    assert.ok(JSON.stringify(subject.handover).includes(text));
    assert.ok(!Object.values(subject.sources).some(source=>source.kind==='payload'&&source.raw===text));
    // Each key must remain semantic even without an ambiguous sibling key.
    const alone=buildEvidence(cp({r:artifact({sources:{[key]:text}})}));
    assert.ok(JSON.stringify(alone.handover).includes(text),key);
    assert.equal(alone.inventory.counts.payload_occurrences,0,key);
  }
  for(const [raw,provenance] of [
    ['export const hold = true;','/files/src~1policy.mjs'],
    ['explicit source body','/sources/budget.max/content'],
    ['runtime file body','/records/runtime/development/files/0/content']
  ]) {
    const source=Object.values(subject.sources).find(source=>source.kind==='payload'&&source.raw===raw);
    assert.ok(source,raw);assert.ok(source.path.endsWith(provenance),source.path);
  }
  assert.equal(entries[1].value.content.value.sources['budget.max'].authority,'Still preparation only');
  assert.equal(entries[2].value.development.files[0].owner,'Engineering');
});

test('replay packing uses the full escaped envelope plus reserve and preserves all findings and blockers',async()=>{
  const {boundedReplayBatches,REQUEST_LIMIT,RESPONSE_LIMIT}=await import('../plugins/soloco/runtime/upgrade-evidence.mjs');
  const findings=Array.from({length:30},(_,index)=>({page_id:`page-${index}`,
    artifact:{content:'Detailed finding "quoted" and \\ escaped. '.repeat(400),review:{verdict:index%2?'Pass':'Blocked',reason:'Evidence-cited older constraints remain in force. '.repeat(300),blockers:[`Keep obligation ${index}`]}}}));
  const prompt=(batch,index)=>JSON.stringify({instructions:'Full instructions and authority '.repeat(3000),
    author_report:'Bounded proposed handover '.repeat(1000),phase:'replay',batch_id:`qa-replay-${index}`,findings:batch});
  const batches=[...boundedReplayBatches(findings,prompt)];
  assert.ok(batches.length>1);assert.ok(batches.some(batch=>batch.length>1));
  assert.deepEqual(batches.flat(),findings);
  batches.forEach((batch,index)=>{
    const complete=prompt(batch,index);
    assert.ok(complete.length+RESPONSE_LIMIT<=REQUEST_LIMIT);
    admitPrompt(complete);
    if(index<batches.length-1)assert.ok(prompt([...batch,batches[index+1][0]],index).length+RESPONSE_LIMIT>REQUEST_LIMIT);
  });
  assert.equal([...boundedReplayBatches(findings.slice(0,2),prompt)].length,1);
  assert.throws(()=>[...boundedReplayBatches([findings[0]],()=> 'x'.repeat(REQUEST_LIMIT))],/request has/);
});
