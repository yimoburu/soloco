import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {progressSnapshot,renderProgress as render} from '../plugins/soloco/runtime/progress-view.mjs';
const renderProgress=(p,format='text',options={renderId:'test'})=>render(p,format,options);
const at='2026-01-01T00:00:00Z';
const job=(id,extra={})=>({id,role:'engineer',status:'completed',created_at:at,inputs:[],task:'Concrete task',task_summary:'Concrete task summary',...extra});
const record=(id,job_id,extra={})=>({id,job_id,revision:1,status:'Submitted',created_at:at,kind:'artifact',...extra});
function workflow(){return {paused:false,jobs:[
  job('engineering',{artifact_id:'candidate',instance_id:'eng-instance',native_id:'native-engineer',expected_deliverable:'Changed files and tests',requester:{role:'runner',session_id:'cos-native',host:'codex',epoch:1}}),
  job('parallel',{status:'running',next_handoff:'QA awaits candidate; not summoned'}),
  job('test',{kind:'development_test',candidate_id:'candidate',development_id:'plan',artifact_id:'receipt'}),
  job('qa',{role:'qa',instance_id:'qa-instance',native_id:'native-qa',artifact_id:'review',review_of:{id:'receipt',revision:1}})],records:[
  record('candidate','engineering',{development:{type:'candidate',plan_id:'plan',candidate_sha256:'hash',run:{job_id:'test',receipt_id:'receipt'}}}),
  record('receipt',undefined,{author_role:'runtime',author_instance:'test',development:{type:'test',plan_id:'plan',candidate_id:'candidate',candidate_sha256:'hash',receipt_sha256:'receipt-hash',result:{tests_executed:true,status:'passed',exit_code:0},acceptance:{at,review_id:'review',candidate_sha256:'hash',receipt_sha256:'receipt-hash',source_integrated:false}}}),
  record('review','qa',{kind:'review',review_of:{id:'receipt',revision:1},review:{verdict:'Pass',candidate_sha256:'hash',receipt_sha256:'receipt-hash'}})],notices:[{id:'notice',kind:'decision_required',reference:'candidate',summary:'Founder decides next scope',created_at:at}]};}

test('projection and all render formats show exact chain, independent identities and separate acceptance facts',()=>{
  const s=workflow(),before=JSON.stringify(s),p=progressSnapshot(s);
  assert.equal(p.graph.valid,true);
  assert.deepEqual(p.graph.edges.map(e=>[e.from,e.to,e.type]),[['engineering','test','candidate'],['test','qa','review']]);
  for(const format of ['html','text']) {
    const output=renderProgress(p,format);
    for(const fact of ['native-engineer','native-qa','cos-native','Changed files and tests','candidate@1','review verdict Pass','runtime receiver acceptance recorded','current permission/independence unknown','source integrated=false','Planned / not summoned','Founder decides next scope','Historical states unavailable']) assert.ok(output.includes(fact),fact);
  }
  assert.match(renderProgress(p,'mermaid').mermaid,/work-1 -->\|candidate\| work-4/);
  assert.equal(JSON.stringify(s),before);
  assert.equal(p.evidence.find(r=>r.id==='receipt').acceptance.bindings_match,true);
  assert.equal(p.graph.edges.some(e=>e.from==='parallel'||e.to==='parallel'),false);
});

test('public JSON and presentation exclude source files, record content and rejected responses',()=>{
  const s=workflow();
  s.records[0].content='SECRET_RECORD_BODY';s.records[0].development.files=[{path:'source',content:'SECRET_SOURCE'}];
  s.records[0].quarantined_files=[{path:'secretpath',content:'SECRET_QUARANTINE'}];
  s.jobs[0].rejected_output={text:'SECRET_REJECTED_BODY',reason:'SECRET_REASON'};
  s.jobs[0].task='T'.repeat(10000)+'SECRET_TASK_TAIL';s.jobs[1].task='SECRET_SHORT_TASK';
  const p=progressSnapshot(s),all=JSON.stringify(p)+renderProgress(p,'html')+renderProgress(p,'text');
  for(const secret of ['SECRET_RECORD_BODY','SECRET_SOURCE','secretpath','SECRET_QUARANTINE','SECRET_REJECTED_BODY','SECRET_REASON','SECRET_TASK_TAIL','SECRET_SHORT_TASK']) assert.equal(all.includes(secret),false,secret);
  assert.equal(p.nodes.find(j=>j.id==='engineering').task_truncated,true);
  assert.match(renderProgress(p),/10016 characters/);
});

test('large history retains active work and every unresolved notice while bounding history honestly',()=>{
  const jobs=Array.from({length:1500},(_,i)=>job('j'+i,{created_at:new Date(Date.UTC(2025,0,1)+i*1000).toISOString()}));
  jobs[0].status='running';
  const notices=Array.from({length:120},(_,i)=>({id:'n'+i,kind:i%2?'must_know':'decision_required',reference:'missing'+i,summary:'Exact summary '+i+'!'.repeat(500),created_at:at}));
  const p=progressSnapshot({jobs,notices},{recentJobs:8});
  assert.equal(p.nodes.length,9);assert.equal(p.coverage.omitted_jobs,1491);
  assert.ok(p.nodes.some(n=>n.id==='j0'));
  assert.deepEqual(p.attention.map(a=>[a.notice.id,a.notice.kind,a.notice.reference,a.notice.summary]),[...notices].sort((a,b)=>a.id<b.id?-1:1).map(n=>[n.id,n.kind,n.reference,n.summary]));
  const withoutNotices=progressSnapshot({jobs},{recentJobs:8});
  assert.ok(JSON.stringify(withoutNotices).length<18000);
  assert.equal(withoutNotices.events.length,9);
});

test('ancestor, event, edge, evidence and input bounds disclose omitted facts',()=>{
  const jobs=Array.from({length:180},(_,i)=>job('j'+i,{depends_on:i?['j'+(i-1)]:[],created_at:new Date(Date.UTC(2025,0,1)+i*1000).toISOString()}));
  const p=progressSnapshot({jobs},{recentJobs:1});
  assert.equal(p.nodes.length,101);assert.equal(p.coverage.ancestor_expansion,100);assert.equal(p.coverage.omitted_jobs,79);assert.equal(p.coverage.omitted_edges,79);
  const s=workflow();s.jobs[0].inputs=Array.from({length:600},(_,i)=>({id:'r'+i,revision:1}));
  s.records.push(...s.jobs[0].inputs.map(r=>record(r.id,undefined,{kind:'intent',author_role:'runner'})));
  const bounded=progressSnapshot(s);
  assert.equal(bounded.nodes.find(n=>n.id==='engineering').inputs.length,40);
  assert.equal(bounded.nodes.find(n=>n.id==='engineering').omitted_inputs,560);
  assert.ok(bounded.evidence.length<=200);assert.ok(bounded.events.length<=300);
  assert.ok(bounded.coverage.omitted_records>0);
});

test('over 200 context references cannot evict latest returned verdicts or receipt acceptance',()=>{
  for(const verdict of ['Fail','Pass']) {
    const s=workflow();
    s.jobs.find(j=>j.id==='qa').created_at='2026-01-02T00:00:00Z';
    s.records.find(r=>r.id==='review').review.verdict=verdict;
    for(let i=0;i<6;i++) {
      const inputs=Array.from({length:40},(_,k)=>({id:`a-context-${i}-${k}`,revision:1}));
      s.jobs.push(job(`context-job-${i}`,{inputs}));
      s.records.push(...inputs.map(r=>record(r.id,undefined,{kind:'intent',author_role:'runner'})));
    }
    const before=JSON.stringify(s),p=progressSnapshot(s);
    assert.equal(p.nodes.find(n=>n.id==='qa').returned.id,'review');
    assert.equal(p.evidence.find(r=>r.id==='review').review.recorded.verdict,verdict);
    assert.equal(p.evidence.find(r=>r.id==='receipt').acceptance.recorded.review_id,'review');
    assert.equal(p.evidence.find(r=>r.id==='receipt').acceptance.bindings_match,verdict==='Pass');
    assert.ok(p.evidence.some(r=>r.id==='candidate'));
    assert.equal(p.evidence.length,200);
    assert.equal(p.coverage.omitted_records,43);
    assert.equal(p.coverage.omitted_priority_records,0);
    for(const format of ['text','html'])assert.ok(renderProgress(p,format).includes(`review verdict ${verdict}`));
    assert.deepEqual(progressSnapshot({...s,records:[...s.records].reverse(),jobs:[...s.jobs].reverse()}),p);
    assert.equal(JSON.stringify(s),before);
  }
});

test('recorded acceptance dependencies and notice records survive outside the selected job window',()=>{
  const s=workflow();
  s.jobs=s.jobs.filter(j=>j.id!=='parallel');
  s.jobs.find(j=>j.id==='test').created_at='2026-01-03T00:00:00Z';
  s.notices[0].reference='notice-record';
  s.records.push(record('notice-record',undefined));
  const p=progressSnapshot(s,{recentJobs:1});
  assert.equal(p.nodes.some(n=>n.id==='qa'),false);
  for(const id of ['receipt','candidate','review','notice-record'])assert.ok(p.evidence.some(r=>r.id===id),id);
  assert.equal(p.evidence.find(r=>r.id==='receipt').acceptance.bindings_match,true);
});

test('core overflow stays bounded and explicitly discloses omitted evidence without losing notices',()=>{
  const jobs=Array.from({length:205},(_,i)=>job(`job-${i}`,{status:'running',artifact_id:`output-${i}`,created_at:new Date(Date.UTC(2026,0,1)+i*1000).toISOString()}));
  const records=jobs.map(j=>record(j.artifact_id,j.id,{kind:'review',review:{verdict:'Fail'}}));
  const notices=records.map(r=>({id:`notice-${r.id}`,kind:'must_know',reference:r.id,summary:`Exact ${r.id}`,created_at:at}));
  const p=progressSnapshot({jobs,records,notices},{recentJobs:1});
  assert.equal(p.evidence.length,200);
  assert.equal(p.evidence[0].id,'output-204');
  assert.equal(p.coverage.omitted_records,5);
  assert.equal(p.coverage.omitted_priority_records,5);
  assert.equal(p.attention.length,205);
  assert.deepEqual(p.attention.map(a=>a.notice.summary).sort(),notices.map(n=>n.summary).sort());
  for(const format of ['text','html']) {
    const output=renderProgress(p,format);
    assert.ok(output.includes('Evidence priority overflow: 5 core records omitted'));
    assert.ok(output.includes('Missing projected evidence does not establish absence of a verdict or acceptance.'));
  }
});

test('malicious labels remain inert HTML and Mermaid data with generated display IDs',()=>{
  const attack='</script><script>alert("x")</script><img src=x onerror=alert(1)> [x](javascript:alert(1)) `x` %% -->';
  const s={jobs:[job(attack,{task:attack,task_summary:attack,native_id:attack})],notices:[{id:attack,kind:attack,reference:attack,summary:attack,created_at:at}]};
  const p=progressSnapshot(s),html=renderProgress(p,'html'),mm=renderProgress(p,'mermaid');
  assert.equal(html.includes(attack),false);assert.ok(html.includes('&lt;/script&gt;'));
  assert.equal((html.match(/<script>/g)||[]).length,1);
  assert.equal(/id="[^\"]*alert/.test(html),false);
  assert.equal(mm.mermaid.includes(attack),false);assert.ok(mm.mermaid.includes('#60;'));
  assert.ok(renderProgress(p,'text').includes(attack)); // Literal text, not executed Markdown.
});

test('empty, paused, failed, missing dates, stale evidence and cycles remain truthful',()=>{
  const empty=progressSnapshot({paused:true});
  assert.match(renderProgress(empty,'html'),/Paused/);assert.match(renderProgress(empty),/No observed jobs/);assert.match(renderProgress(empty),/No active work/);
  const p=progressSnapshot({jobs:[job('a',{status:'failed',created_at:null,depends_on:['b'],inputs:[{id:'gone',revision:1}]}),job('b',{depends_on:['a']})]});
  assert.equal(p.graph.valid,false);assert.deepEqual(p.graph.edges,[]);
  for(const code of ['missing_date','unresolved_revision','cyclic_relation'])assert.ok(p.diagnostics.some(d=>d.code===code));
  assert.equal(p.events.some(e=>e.id==='a'),false);
  assert.match(renderProgress(p),/failed/);
});


// Minimal DOM for this fragment's native HTML: parse the actual element tree,
// IDs and attributes. Scripts execute separately under an unrelated host parent.
// Layout and native keyboard activation are deliberately left to browser QA.
function mountFragments(fragments) {
  const byId=new Map(),scripts=[],roots=[],observers=[];
  class Element {
    constructor(tag,attrs,parent) {
      this.tag=tag;this.attrs=attrs;this.parentElement=parent;this.children=[];this.listeners={};this.focusCount=0;
      this.dataset={focus:attrs['data-focus'],from:attrs['data-from'],to:attrs['data-to']};
      this.rect={left:100,top:100,width:450,height:2000,bottom:2100};
      const classes=new Set((attrs.class ?? '').split(/\s+/).filter(Boolean));
      this.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)};
      if(attrs.id){assert.ok(!byId.has(attrs.id),`duplicate ID ${attrs.id}`);byId.set(attrs.id,this);}
      parent?.children.push(this);
    }
    contains(n){return n===this || this.children.some(c=>c.contains(n));}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    closest(selector){return this.tag==='button' && this.attrs['data-focus'] && selector==='button[data-focus]'?this:this.parentElement?.closest(selector);}
    querySelectorAll(selector){return this.children.flatMap(c=>[...((selector==='article.selected'&&c.tag==='article'&&c.classList.contains('selected')) || (selector==='article'&&c.tag==='article') || (selector==='path[data-from]'&&c.tag==='path'&&c.dataset.from)?[c]:[]),...c.querySelectorAll(selector)]);}
    setAttribute(key,value){this.attrs[key]=value;}
    getBoundingClientRect(){return this.rect;}
    focus(){this.focusCount++;}
    click(){for(let n=this;n;n=n.parentElement)for(const handler of n.listeners.click??[])handler({target:this});}
  }
  for(const html of fragments) {
    scripts.push(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
    const markup=html.replace(/<(style|script)>[\s\S]*?<\/\1>/g,''),stack=[];
    for(const match of markup.matchAll(/<(\/?)([a-z][a-z0-9]*)([^>]*)>/gi)) {
      if(match[1]){assert.equal(stack.pop()?.tag,match[2]);continue;}
      const attrs=Object.fromEntries([...match[3].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
      const el=new Element(match[2],attrs,stack.at(-1));
      if(!stack.length)roots.push(el);
      if(!['br','hr','input','img','meta','link'].includes(el.tag))stack.push(el);
    }
    assert.equal(stack.length,0);
  }
  const relocatedHost=new Element('div',{},null);
  const document={getElementById:id=>byId.get(id),currentScript:{parentElement:relocatedHost}};
  // Synthetic bounds exercise path math and resize wiring, not browser layout.
  roots.forEach(root=>root.querySelectorAll('article').forEach((card,i)=>{
    card.rect={left:124,top:100+i*232,width:426,height:200,bottom:300+i*232};
  }));
  class ResizeObserver {
    constructor(callback){this.callback=callback;this.targets=[];observers.push(this);}
    observe(target){this.targets.push(target);}
  }
  for(const script of scripts)vm.runInNewContext(script,{document,ResizeObserver});
  return {byId,roots,relocatedHost,observers,document,scripts};
}

test('real generated handlers bind relocated scripts to two explicit roots and isolate selection',()=>{
  const p=progressSnapshot(workflow());
  const fragments=['first','second'].map(renderId=>renderProgress(p,'html',{renderId}));
  const {byId,roots,relocatedHost}=mountFragments(fragments);
  assert.equal(relocatedHost.children.length,0);
  assert.deepEqual(relocatedHost.listeners,{});
  for(let i=0;i<roots.length;i++) {
    const html=fragments[i],root=roots[i];
    const targets=[...html.matchAll(/data-focus="([^"]+)"/g)].map(m=>m[1]);
    assert.ok(targets.length>1);
    const buttons=targets.map(id=>{
      const walk=n=>n.children.flatMap(c=>[c,...walk(c)]);
      return walk(root).find(n=>n.tag==='button'&&n.dataset.focus===id);
    });
    buttons[0].click();
    assert.ok(byId.get(targets[0]).classList.contains('selected'));
    assert.equal(byId.get(targets[0]).focusCount,1);
    assert.equal(roots[1-i].querySelectorAll('article.selected').length,i===0?0:1);
    const different=buttons.find(b=>b.dataset.focus!==targets[0]);
    different.click();
    assert.equal(root.querySelectorAll('article.selected').length,1);
    assert.equal(byId.get(targets[0]).classList.contains('selected'),false);
    assert.ok(byId.get(different.dataset.focus).classList.contains('selected'));
    // A button with a target in another root cannot select or focus it.
    const other=roots[1-i].querySelectorAll('article.selected')[0];
    buttons[0].dataset.focus=other?.attrs.id ?? 'soloco-progress-second-work-1';
    const prior=root.querySelectorAll('article.selected')[0];
    buttons[0].click();assert.equal(root.querySelectorAll('article.selected')[0],prior);
  }
  for(const html of fragments) {
    const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
    for(const [,target] of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.has(target));
    assert.equal(html.includes('currentScript'),false);
    assert.equal(/setTimeout|setInterval|fetch\(|window\.|openai/.test(html),false);
    assert.ok(html.includes('type="button"'));
  }
});

test('HTML namespace is explicit, validated and deterministic without changing snapshot',()=>{
  const p=progressSnapshot(workflow()),before=JSON.stringify(p);
  mountFragments(['prefix','prefix-work-1'].map(renderId=>render(p,'html',{renderId})));
  for(const renderId of [undefined,'','a" onclick="bad','</script>','1invalid','a'.repeat(65)])assert.throws(()=>render(p,'html',{renderId}),/renderId/);
  assert.equal(renderProgress(p,'html'),renderProgress(p,'html'));
  assert.equal(JSON.stringify(p),before);
});

test('primary cards expose task, role, status and provenance; details retain full facts',()=>{
  const p=progressSnapshot(workflow()),html=renderProgress(p,'html');
  const primary=html.match(/<div class="dag">([\s\S]*?)<aside class="timeline" aria-label="Recorded event chronology">/)[1].replace(/<details>[\s\S]*?<\/details>/g,'');
  for(const fact of ['Engineering','Concrete task summary','Changed files and tests','completed','Summoned by Chief of Staff (CoS)','Requester unknown','Returned:','Submitted','Expected:','→ candidate evidence'])assert.ok(primary.includes(fact),fact);
  assert.equal(primary.includes('native-engineer'),false);
  assert.equal(primary.includes('cos-native'),false);
  assert.equal(/<article[^>]*>[^]*?<h4>Chief of Staff/.test(primary),false);
  assert.ok(html.includes('runtime receiver acceptance recorded'));
  assert.ok(html.includes('candidate_sha256'));
  assert.ok(html.includes('QA result recorded'));
  assert.ok(html.includes('Runtime acceptance recorded'));
  assert.match(html, /data-focus="soloco-progress-test-work-1">Founder notice recorded<\/button>/);
  assert.ok(html.includes(at));
  assert.equal(/QA (?:returned )?Pass/.test(html),false);
});

test('long labels, empty and no-active fragments preserve responsive readable markup',()=>{
  const s=workflow();s.jobs[0].task_summary='long-word'.repeat(80);s.jobs[0].expected_deliverable='Output '.repeat(40);
  const html=renderProgress(progressSnapshot(s),'html');
  assert.ok(html.includes('grid-template-columns:minmax(0,1fr) 150px'));
  assert.ok(html.includes('@container(max-width:540px)'));
  assert.equal(html.includes('850px'),false);
  assert.ok(html.includes('.rank{display:grid;gap:32px}'));
  assert.equal(html.includes('flex-wrap:wrap'),false);
  assert.ok(html.includes('grid-template-columns:minmax(0,1fr)'));
  assert.ok(html.includes('overflow-wrap:anywhere'));
  assert.equal(/overflow:\s*auto|min-width:\d+px/.test(html),false);
  assert.ok(html.includes('color:CanvasText;background:Canvas'));
  assert.ok(html.includes('font:14px/1.5'));
  assert.ok(html.includes(':focus-visible'));
  const empty=renderProgress(progressSnapshot({paused:true}),'html');
  const mounted=mountFragments([empty]);
  assert.equal(mounted.roots.length,1);
  for(const fact of ['No observed jobs','No active work','Paused','No unresolved notices recorded','No recorded events'])assert.ok(empty.includes(fact));
  const finished=progressSnapshot({jobs:[job('qa-done',{role:'qa',finished_at:at,artifact_id:'result'})],records:[record('result','qa-done')]});
  const finishedHtml=renderProgress(finished,'html');
  assert.ok(finishedHtml.includes('QA returned a result'));assert.equal(finishedHtml.includes('Pass'),false);
});


test('chronology exposes recorded UTC date and time outside event details',()=>{
  const p=progressSnapshot(workflow());
  p.events.push({...p.events[0],at:'2026-02-03T04:05:06-08:00'});
  const html=renderProgress(p,'html');
  const timeline=html.match(/<aside class="timeline"[^>]*>([\s\S]*?)<\/aside>/)[1];
  const visible=timeline.replace(/<details>[\s\S]*?<\/details>/g,'');
  assert.equal((visible.match(/<time /g)||[]).length,p.events.length);
  assert.match(visible,/<span>2026-01-01<\/span> <span>00:00:00 UTC<\/span>/);
  assert.match(visible,/<span>2026-02-03<\/span> <span>12:05:06 UTC<\/span>/);
  assert.ok(timeline.includes('2026-02-03T04:05:06-08:00 ·'));
  p.events[0].at='invalid';
  assert.ok(renderProgress(p,'html').includes('Recorded time unknown'));
});

test('only proven edges get scoped arrows; relocated scripts redraw for card and details resizing',()=>{
  const p=progressSnapshot(workflow());
  const fragments=['arrows-a','arrows-b'].map(renderId=>renderProgress(p,'html',{renderId}));
  const {roots,byId,observers,document,scripts}=mountFragments(fragments);
  roots.forEach((root,i)=>{
    const paths=root.querySelectorAll('path[data-from]'),cards=root.querySelectorAll('article');
    assert.equal(paths.length,p.graph.edges.length);
    const marker=byId.get(root.attrs.id+'-arrow');
    assert.ok(marker);
    paths.forEach((path,index)=>{
      const edge=p.graph.edges[index];
      const from=byId.get('soloco-progress-'+['arrows-a','arrows-b'][i]+'-work-'+(p.nodes.findIndex(n=>n.id===edge.from)+1));
      const to=byId.get('soloco-progress-'+['arrows-a','arrows-b'][i]+'-work-'+(p.nodes.findIndex(n=>n.id===edge.to)+1));
      assert.equal(path.dataset.from,from.attrs.id);
      assert.equal(path.dataset.to,to.attrs.id);
      assert.equal(path.attrs['marker-end'],'url(#'+marker.attrs.id+')');
      const a=from.rect,b=to.rect,bounds=observers[i].targets[0].rect;
      const x1=a.left+a.width/2-bounds.left,y1=a.bottom-bounds.top;
      const x2=b.left+b.width/2-bounds.left,y2=b.top-bounds.top;
      assert.equal(path.attrs.d,`M ${x1} ${y1} V ${y1+12} H ${4+(index%3)*6} V ${y2-12} H ${x2} V ${y2-4}`);
    });
    assert.equal(observers[i].targets.length,cards.length+1);
    const before=paths[0].attrs.d,other=roots[1-i].querySelectorAll('path[data-from]')[0].attrs.d;
    const source=byId.get(paths[0].dataset.from);
    source.rect={...source.rect,bottom:source.rect.bottom+80};
    observers[i].callback();
    assert.notEqual(paths[0].attrs.d,before);
    assert.equal(roots[1-i].querySelectorAll('path[data-from]')[0].attrs.d,other);
    const resized=paths[0].attrs.d;
    source.rect={...source.rect,width:source.rect.width-80};
    root.listeners.toggle[0]();
    assert.notEqual(paths[0].attrs.d,resized);
  });
  // Without ResizeObserver, initial drawing and captured details toggles still work.
  assert.doesNotThrow(()=>vm.runInNewContext(scripts[0],{document}));
  const invalid=progressSnapshot({jobs:[job('a',{depends_on:['b']}),job('b',{depends_on:['a']})]});
  assert.equal(mountFragments([renderProgress(invalid,'html')]).roots[0].querySelectorAll('path[data-from]').length,0);
});
