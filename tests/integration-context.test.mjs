import test from 'node:test';
import assert from 'node:assert/strict';
import {assignmentContext,contextMatches} from '../plugins/soloco/runtime/context.mjs';
import {digest} from '../plugins/soloco/runtime/store.mjs';

// Ordinary task scope does not require every unrelated archived output to be
// semantically qualified first. Unknown sources remain retained and unclassified.
test('ordinary 1x/10x/100x archive growth preserves fixed current obligations and explicit evidence',()=>{
 const metrics=[];
 for(const scale of [1,10,100]) {
  const s={id:'fictional',name:'Scope fixture',idea:'Test ordinary relevance',mode:'preparation',phase:'Frame',team_sha256:'team',governance:'No spending without an actual grant',roles:{engineer:{instructions:'Keep unknown authority unknown'}},records:{},jobs:{},notices:[{id:'notice',kind:'must_know',summary:'Uncertain external outcome',deliveries:[]}],messages:[{id:'message',to:'engineer',content:'Do not infer permission'}]};
  for(const [id,kind,content] of [['intent','intent','Preserve founder objective'],['decision','decision','Do not contact customers'],['preference','preference','Report uncertain findings'],['negative','artifact','Unique failed condition'],['input','artifact','Exact supplied input'],['target','artifact','Exact review subject'],['dependency','artifact','Completed required dependency']])s.records[id]={id,kind,revision:1,content,...(id==='negative'?{review:{verdict:'Blocked',reason:'Restriction remains unresolved'}}:{})};
  for(let i=0;i<scale;i++) {
   s.records['archive-'+i]={id:'archive-'+i,kind:'artifact',revision:1,content:'Unclassified unrelated archived output '.repeat(3000),unknown:{retained:'Never claim inert or resolved'}};
   s.jobs['archive-'+i]={id:'archive-'+i,status:'completed',task:'Unrelated historical task',output:'Exact output retained '.repeat(3000)};
  }
  const before=digest(JSON.stringify(s));
  const job={id:'current',role:'engineer',context_format:3,task:'Review current task only',inputs:['input','dependency'].map(id=>({id,revision:1})),review_of:{id:'target',revision:1}};
  s.jobs.current=job;
  const c=assignmentContext(s,job),pack=JSON.parse(c.text);
  assert.deepEqual(new Set(c.inputs.map(r=>r.id)),new Set(['intent','decision','preference','negative','input','target','dependency']));
  assert.equal(pack.notices[0].summary,'Uncertain external outcome');assert.equal(pack.messages[0].content,'Do not infer permission');
  assert.equal(contextMatches(s,job,c.hash),true);
  delete s.jobs.current;assert.equal(digest(JSON.stringify(s)),before,'archive and unknown evidence must remain exact');
  metrics.push({scale,archive_characters:JSON.stringify(s).length,context_characters:c.text.length,mandatory_records:c.inputs.length});
 }
 assert.equal(new Set(metrics.map(m=>m.context_characters)).size,1);
 console.log('ordinary archive growth '+JSON.stringify(metrics));
});
