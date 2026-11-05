import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildEvidence, resolveBodyAlias, projectionPreview, evidencePage, createDeliveryLedger, recordDelivery, readEvidence, validateCitations, RANGE_LIMIT, admitPrompt } from '../plugins/soloco/runtime/upgrade-evidence.mjs';
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
  const {boundedReplayBatches,REQUEST_LIMIT,RESPONSE_RESERVE}=await import('../plugins/soloco/runtime/upgrade-evidence.mjs');
  const findings=Array.from({length:30},(_,index)=>({page_id:`page-${index}`,
    artifact:{content:'Detailed finding "quoted" and \\ escaped. '.repeat(400),review:{verdict:index%2?'Pass':'Blocked',reason:'Evidence-cited older constraints remain in force. '.repeat(300),blockers:[`Keep obligation ${index}`]}}}));
  const prompt=(batch,index)=>JSON.stringify({instructions:'Full instructions and authority '.repeat(3000),
    author_report:'Bounded proposed handover '.repeat(1000),phase:'replay',batch_id:`qa-replay-${index}`,findings:batch});
  const batches=[...boundedReplayBatches(findings,prompt)];
  assert.ok(batches.length>1);assert.ok(batches.some(batch=>batch.length>1));
  assert.deepEqual(batches.flat(),findings);
  batches.forEach((batch,index)=>{
    const complete=prompt(batch,index);
    assert.ok(complete.length+RESPONSE_RESERVE<=REQUEST_LIMIT);
    admitPrompt(complete);
    if(index<batches.length-1)assert.ok(prompt([...batch,batches[index+1][0]],index).length+RESPONSE_RESERVE>REQUEST_LIMIT);
  });
  assert.equal([...boundedReplayBatches(findings.slice(0,2),prompt)].length,1);
  assert.throws(()=>[...boundedReplayBatches([findings[0]],()=> 'x'.repeat(REQUEST_LIMIT))],/request has/);
});


test('multi-page whole bodies preserve UTF-16 and aliases never deliver an unread target or original', () => {
  const content = 'Fictional unresolved constraint 😀 "quoted" \\ '.repeat(5000) + String.fromCharCode(0xd800);
  const body = { content, review: { verdict: 'Blocked', blockers: ['Old blocker remains'] }, unknown: 'Keep every field' };
  const history = [{ cos_pages: [{ native_id: 'author-old', artifact: body, page_id: 'old-page' }],
    calls: [0, 1].map(() => ({ role: 'cos', phase: 'page', native_id: 'author-old', text: JSON.stringify(body, null, 2) })) }];
  const subject = buildEvidence(cp({}), history);
  const pages = subject.pages.map(page => evidencePage(subject, page));
  const stream = pages.map(page => page.text).join('');
  assert.ok(pages.length > 2);
  assert.equal(sha(stream), pages[0].sha256);
  const recovered = JSON.parse(stream).handover.history[0].value;
  assert.equal(recovered.cos_pages[0].artifact.content, content);
  const alias = subject.handover.history[0].value.calls[0].text;
  assert.equal(JSON.parse(resolveBodyAlias(subject, alias)).content, content);
  assert.throws(() => resolveBodyAlias(subject, { ...alias }), /invalid generated/);
  for (let i = 1; i < pages.length; i++) {
    const before = pages[i - 1].text.charCodeAt(pages[i - 1].text.length - 1), after = pages[i].text.charCodeAt(0);
    assert.ok(!(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff));
  }
  const author = createDeliveryLedger(subject, 'new-author'), qa = createDeliveryLedger(subject, 'new-qa');
  const aliasOffset = stream.indexOf('"evidence_body_alias"');
  const aliasPage = pages.find(page => page.offset <= aliasOffset && page.end > aliasOffset);
  assert.ok(aliasPage.offset > pages[0].end);
  recordDelivery(subject, author, aliasPage);
  const firstCitation = { source_id: pages[0].source_id, sha256: pages[0].sha256, ...pages[0].citation_ranges[0] };
  assert.throws(() => validateCitations(subject, [firstCitation], author), /not completely delivered/);
  const target = subject.sources[alias.target.source_id];
  const rawCitation = { source_id: target.source_id, sha256: target.sha256 };
  assert.throws(() => validateCitations(subject, [rawCitation], author), /not completely delivered/);
  for (const page of pages) { recordDelivery(subject, author, page); recordDelivery(subject, qa, page); }
  for (const ledger of [author, qa]) {
    assert.equal(validateCitations(subject, [firstCitation], ledger), true);
    assert.throws(() => validateCitations(subject, [rawCitation], ledger), /not completely delivered/);
  }
  // Independently retrieve every raw call byte through bounded frozen ranges.
  const source = subject.inventory.entries.find(item => item.path === '/0/calls/0/text');
  let original = '';
  for (let offset = 0; offset < source.length;) {
    let length = Math.min(32000, source.length - offset);
    const raw = subject.sources[source.source_id].raw;
    const before = raw.charCodeAt(offset + length - 1), after = raw.charCodeAt(offset + length);
    if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) length--;
    original += readEvidence(subject, request(source, offset, length)).text; offset += length;
  }
  assert.equal(original, history[0].calls[0].text);
});

test('realistic fictional reports reduce net escaped stream and page counts with identical preview inputs', t => {
  const reports = Array.from({ length: 24 }, (_, index) => ({
    content: `Fictional page ${index}: retain distinct obligation. ` + 'Blocker: evidence and founder approval remain missing. '.repeat(250),
    citations: [{ source_id: 'old-stream', sha256: 'fictional-hash', offset: index, length: 1, range_sha256: 'fictional-range' }],
    review: { verdict: index % 2 ? 'Fail' : 'Blocked', reason: 'Keep this review', blockers: [`Distinct blocker ${index}`], permitted_action: 'hold' },
    unknown: { uncertainty: `Unknown extension ${index}` }
  }));
  const history = [{ id: 'fictional-attempt', status: 'failed',
    calls: reports.map(artifact => ({ role: 'qa', phase: 'page', native_id: 'old-reviewer', text: JSON.stringify(artifact, null, 2) })),
    qa_pages: reports.map((artifact, i) => ({ native_id: 'old-reviewer', page_id: `old-${i}`, artifact })) }];
  const current = { id: 'terminal-current', status: 'recovered', error: 'Stopped deliberately; no timeout' };
  const input = cp({}), combined = [...history, current];
  const before = buildEvidence(input, combined, { wholeBodyAliases: false }), after = buildEvidence(input, combined);
  const preview = projectionPreview(input, history, current);
  const stream = subject => subject.pages.map(page => evidencePage(subject, page).text).join('');
  assert.equal(preview.baseline.stream_characters, stream(before).length);
  assert.equal(preview.candidate.stream_characters, stream(after).length);
  assert.equal(preview.baseline.stream_sha256, sha(stream(before)));
  assert.equal(preview.candidate.stream_sha256, sha(stream(after)));
  assert.equal(preview.baseline.pages, before.pages.length); assert.equal(preview.candidate.pages, after.pages.length);
  assert.equal(preview.baseline.checkpoint_sha256, preview.candidate.checkpoint_sha256);
  assert.equal(preview.baseline.history_sha256, sha(JSON.stringify(combined)));
  assert.equal(preview.baseline.history_sha256, preview.candidate.history_sha256);
  assert.ok(preview.net_characters_saved > 250000); assert.ok(preview.pages_saved > 0);
  assert.equal(preview.matched_bodies, 24); assert.equal(preview.aliased_occurrences, 24);
  assert.equal(preview.current_upgrade_included, true); assert.equal(preview.exact_reservation, false); assert.equal(preview.time_forecast, false);
  for (let index = 0; index < reports.length; index++) {
    const alias = after.handover.history[0].value.qa_pages[index].artifact;
    assert.deepEqual(JSON.parse(JSON.stringify(resolveBodyAlias(after, alias))), reports[index]);
  }
  t.diagnostic(`FICTIONAL ONLY: ${preview.baseline.stream_characters} -> ${preview.candidate.stream_characters} UTF-16 units; ${preview.baseline.pages} -> ${preview.candidate.pages} pages; ${preview.net_characters_saved} net saved; ${preview.matched_bodies} matched, ${preview.aliased_occurrences} aliased`);
});
