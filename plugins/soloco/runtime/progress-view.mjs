import { progressFor } from './progress.mjs';

const active = j => ['queued','running'].includes(j.status);
const rows = v => Array.isArray(v) ? v : Object.values(v ?? {});
const clip = (v,n=240) => typeof v === 'string' ? v.slice(0,n) : null;
const pick = (v,keys) => Object.fromEntries(keys.filter(k=>v?.[k] !== undefined).map(k=>[k,v[k]]));
const reference = v => v ? pick(v,['id','revision']) : null;

// Public boundary: whitelist before projection, then window jobs/evidence/events.
// The foundation remains a lossless pure diagnostic API for trusted callers.
export function progressSnapshot(state={}, {recentJobs=20}={}) {
  if (!Number.isInteger(recentJobs) || recentJobs<1 || recentJobs>50) throw new Error('recentJobs must be 1 to 50');
  const jobs=rows(state.jobs).map(j=>({
    ...pick(j,['id','role','instance_id','native_id','kind','status','created_at','started_at','execution_started_at','finished_at','artifact_id','candidate_id','development_id']),
    task:clip(j.task_summary,160),task_summary:clip(j.task_summary,160),
    task_characters:typeof j.task==='string'?j.task.length:0,
    inputs:rows(j.inputs).map(reference),review_of:reference(j.review_of),
    ...(j.expected_deliverable!==undefined?{expected_deliverable:clip(j.expected_deliverable,300)}:{}),
    ...(j.next_handoff!==undefined?{next_handoff:clip(j.next_handoff,200)}:{}),
    ...(j.requester?{requester:pick(j.requester,['role','session_id','host','epoch'])}:{}),
    ...(j.rejected_output?{rejected_output:{present:true}}:{}),
    ...(j.depends_on!==undefined?{depends_on:rows(j.depends_on).map(d=>typeof d==='string'?d:pick(d,['id']))}:{}),
  }));
  const records=rows(state.records).map(r=>({
    ...pick(r,['id','revision','kind','status','job_id','author_role','author_instance','created_at','updated_at']),
    review_of:reference(r.review_of),
    ...(r.review?{review:pick(r.review,['verdict','permitted_action','candidate_sha256','receipt_sha256'])}:{}),
    ...(r.quarantined_files?{quarantined_files:{count:rows(r.quarantined_files).length}}:{}),
    ...(r.development?{development:{...pick(r.development,['type','plan_id','candidate_id','candidate_sha256','receipt_sha256']),
      run:r.development.run?pick(r.development.run,['job_id','receipt_id','status']):null,
      result:r.development.result?pick(r.development.result,['tests_executed','status','exit_code']):null,
      acceptance:r.development.acceptance?pick(r.development.acceptance,['at','review_id','candidate_sha256','receipt_sha256','source_integrated']):null}}:{}),
  }));
  // Required attention is never windowed or summary-truncated.
  const notices=rows(state.notices).filter(n=>!n.resolution).map(n=>({...pick(n,['id','kind','reference','summary','created_at','seen_at','author_instance']),resolution:null}));
  const full=progressFor({jobs,records,notices});
  const sorted=[...jobs].sort((a,b)=>{
    const date=j=>Number.isFinite(Date.parse(j.created_at))?Date.parse(j.created_at):-Infinity;
    return date(b)-date(a) || String(a.id).localeCompare(String(b.id));
  });
  const selected=new Set([...sorted.slice(0,recentJobs),...jobs.filter(active)].map(j=>j.id));
  const recMap=new Map(records.map(r=>[r.id,r]));
  for(const n of notices) {
    if(jobs.some(j=>j.id===n.reference)) selected.add(n.reference);
    const r=recMap.get(n.reference);
    const producer=r?.job_id ?? (r?.development?.type==='test'?r.author_instance:null);
    if(jobs.some(j=>j.id===producer)) selected.add(producer);
  }
  const initial=selected.size;
  // Bounded ancestor expansion; all active and notice-associated jobs stay.
  let changed=true, expanded=0;
  while(changed && expanded<100) {
    changed=false;
    for(const e of full.graph.edges) if(selected.has(e.to) && !selected.has(e.from) && expanded<100) {
      selected.add(e.from);expanded++;changed=true;
    }
  }
  const nodes=full.nodes.filter(j=>selected.has(j.id)).map(j=>({...j,inputs:j.inputs.slice(0,40),context_inputs:j.context_inputs.slice(0,40),omitted_inputs:Math.max(0,j.inputs.length-40),omitted_context_inputs:Math.max(0,j.context_inputs.length-40),task_characters:jobs.find(v=>v.id===j.id)?.task_characters ?? 0,
    task_truncated:(jobs.find(v=>v.id===j.id)?.task_characters ?? 0)>0,task_body_included:false}));
  // Core facts precede optional input/context records, even when their IDs sort last.
  // Newest selected outputs win a core overflow; ties retain the job ID order.
  const priorityIds=new Set();
  const selectedJobs=sorted.filter(j=>selected.has(j.id));
  for(const j of selectedJobs) if(j.artifact_id)priorityIds.add(j.artifact_id);
  for(const j of selectedJobs) if(j.review_of)priorityIds.add(j.review_of.id);
  for(const a of full.attention) if(a.link?.entity==='record')priorityIds.add(a.link.id);
  const recordIds=new Set(priorityIds);
  for(const j of nodes) for(const r of [...j.inputs,...j.context_inputs]) if(r)recordIds.add(r.id);
  // Include recorded review/acceptance dependencies without response bodies.
  // Set iteration also visits newly added IDs and terminates for cyclic references.
  for(const id of recordIds) {
    const r=recMap.get(id),d=r?.development;
    for(const dependency of [r?.review_of?.id,d?.candidate_id,d?.acceptance?.review_id,d?.run?.receipt_id]) if(dependency) {
      priorityIds.add(dependency);recordIds.add(dependency);
    }
  }
  const evidenceMap=new Map(full.evidence.map(r=>[r.id,r]));
  const priorityEvidence=[...priorityIds].map(id=>evidenceMap.get(id)).filter(Boolean);
  const evidence=[...priorityEvidence,...full.evidence.filter(r=>recordIds.has(r.id)&&!priorityIds.has(r.id))].slice(0,200);
  const omittedPriority=Math.max(0,priorityEvidence.length-evidence.length);
  const edges=full.graph.edges.filter(e=>selected.has(e.from)&&selected.has(e.to)).slice(0,300);
  const relevant=full.diagnostics.filter(d=>selected.has(d.job_id) || selected.has(d.consumer) || selected.has(d.from) || selected.has(d.to) || recordIds.has(d.record?.id) || notices.some(n=>n.id===d.notice_id) || selected.has(d.id) || recordIds.has(d.id));
  const events=full.events.filter(e=>e.entity==='notice' || (e.entity==='job'?selected.has(e.id):recordIds.has(e.id)));
  const eventLimit=300;
  return {state:{paused:state.paused===true,phase:clip(state.phase,80),mode:clip(state.mode,80),active_jobs:jobs.filter(active).length},
    nodes,evidence,graph:{valid:full.graph.valid,edges},attention:full.attention,
    events:events.slice(-eventLimit),diagnostics:relevant.slice(0,100),
    coverage:{...full.coverage,scope:'Current observed snapshot; bounded work history, all active jobs and unresolved notices',
      window:{recent_jobs:recentJobs,selected_before_ancestors:initial},ancestor_expansion:expanded,
      omitted_jobs:jobs.length-nodes.length,omitted_edges:full.graph.edges.length-edges.length,
      omitted_records:records.length-evidence.length,omitted_priority_records:omittedPriority,omitted_events:events.length-Math.min(events.length,eventLimit),
      omitted_diagnostics:full.diagnostics.length-Math.min(relevant.length,100),
      ancestor_limit:100,event_limit:eventLimit,diagnostic_limit:100,evidence_limit:200,edge_limit:300,input_limit_per_job:40,
      notice_policy:'All unresolved IDs, kinds, references and exact summaries retained; attention may exceed work-history bounds.',
      limitations:[...full.coverage.limitations,
        'Evidence prioritizes selected outputs, review targets, notice-linked records and recorded review/acceptance dependencies before input/context records. Missing projected evidence does not establish absence of a verdict or acceptance.',
        ...(omittedPriority?[`Evidence priority overflow: ${omittedPriority} core records omitted at the 200-record limit; consult authoritative record IDs for omitted verdicts and acceptance dependencies.`]:[])],
      labels:'Full task instructions excluded; task_summary labels capped at 160, expected deliverable 300, planned handoff 200. Full tasks and record bodies require authoritative IDs.'}};
}

const esc = v => String(v ?? 'unknown').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Plain text is literal data; strip terminal control codes, never interpret Markdown.
const literal = v => String(v ?? 'unknown').replace(/[\x00-\x1f\x7f]/g,c=>c==='\n'?' ⏎ ':' ');
const refLabel = r => r ? `${r.id}@${r.revision ?? '?'}` : 'none recorded';
function nodeLines(n,p) {
  const incoming=p.graph.edges.filter(e=>e.to===n.id);
  return [
    `${n.id} · ${n.role ?? 'unknown role'} · ${n.actor} · ${n.status ?? 'unknown'}`,
    `Summoned by: ${n.requester?`${n.requester.role} ${n.requester.session_id} (${n.requester.host}, epoch ${n.requester.epoch})`:'unknown (historical requester not recorded)'}`,
    `Instance: ${n.instance_id ?? 'unknown'}; native: ${n.native_id ?? (n.actor==='software'?'not a native agent session':'not yet observed')}`,
    `Task label: ${n.task ?? (n.actor==='software'?'Run bounded candidate tests (runtime job)':'unknown (no task_summary recorded)')}${n.task_truncated?` [full instructions excluded; ${n.task_characters} characters; see job ${n.id}]`:''}`,
    `Expected deliverable: ${n.expected_deliverable ?? 'unknown (not recorded)'}`,
    `Returned artifact: ${refLabel(n.returned)}${n.rejected_output?'; rejected response retained outside this view':''}`,
    `Inputs omitted from this label: ${n.omitted_inputs}; founder-context references omitted: ${n.omitted_context_inputs}.`,
    `Non-job founder context: ${n.context_inputs.map(refLabel).join(', ') || 'none linked'}`,
    `Evidence supplied to this work: ${incoming.map(e=>`${e.from} → ${n.id} (${e.type}: ${refLabel(e.reference)})`).join('; ') || 'no proven job relationship'}`,
    'Waiting: no active wait or worker gating established by these record links.',
    ...(n.next_handoff?[`Planned / not summoned: ${n.next_handoff}`]:[]),
  ];
}
function evidenceLine(r) {
  return `${refLabel(r)}: ${r.kind}, ${r.status}${r.context?'; non-job founder context':''}`
    + (r.review?`; review verdict ${r.review.recorded.verdict ?? 'unknown'}; current applicability unknown; independence not verified by this view`:'')
    + (r.acceptance?`; runtime receiver acceptance recorded at ${r.acceptance.recorded.at ?? 'unknown'}; review ${r.acceptance.recorded.review_id ?? 'unknown'}; structural bindings_match=${r.acceptance.bindings_match}; current permission/independence unknown; source integrated=${r.acceptance.recorded.source_integrated ?? 'unknown'}`:'; no runtime acceptance recorded')
    + (r.quarantined_files?'; quarantined files excluded':'');
}
const eventLine = e => `${e.at} · ${e.entity} ${e.id} · ${e.type}${e.tied?' · tied instant; order is not causality':''}`;
function preamble(p) {
  return [`Observed current snapshot · phase ${p.state.phase ?? 'unknown'} · mode ${p.state.mode ?? 'unknown'} · graph ${p.graph.valid?'consistent':'has unresolved evidence'} · ${p.state.paused?'Paused':'Not paused'} · ${p.state.active_jobs} active jobs${p.state.active_jobs===0?' · No active work':''}`,
    `History: latest ${p.coverage.window.recent_jobs} jobs + all active/notice work + ${p.coverage.ancestor_expansion} ancestors (limit ${p.coverage.ancestor_limit}). Omitted: ${p.coverage.omitted_jobs} jobs, ${p.coverage.omitted_records} records, ${p.coverage.omitted_edges} edges, ${p.coverage.omitted_events} events, ${p.coverage.omitted_diagnostics} diagnostics.`,
    `Payload limits: ${p.coverage.evidence_limit} evidence records, ${p.coverage.edge_limit} edges, ${p.coverage.input_limit_per_job} input labels per job; omitted counts disclosed.`,
    'Events highlight associated current work only. Historical states unavailable; no replay, progress percentage or inferred activity.',p.coverage.labels];
}
export function renderProgress(p,format='text',{renderId}={}) {
  const ids=new Map(p.nodes.map((n,i)=>[n.id,`work-${i+1}`]));
  const text=[...preamble(p),'ATTENTION — unresolved founder notices',...p.attention.map(a=>`${a.notice.id} · ${a.notice.kind} · reference ${a.notice.reference ?? 'unknown'} · ${a.notice.summary ?? 'No summary recorded'}`),
    'DAG — prerequisite → consumer (evidence links; no scheduling)',...p.nodes.flatMap(n=>nodeLines(n,p)),
    ...(!p.nodes.length?['No observed jobs.']:[]),'EVIDENCE',...p.evidence.map(evidenceLine),
    'CHRONOLOGY — recorded events',...p.events.map(eventLine),'DIAGNOSTICS',...p.diagnostics.map(d=>JSON.stringify(d)),...p.coverage.limitations].map(literal).join('\n');
  // Mermaid labels use generated IDs and numeric entity encoding exclusively.
  const mmLabel = v => Array.from(String(v)).map(c=>`#${c.codePointAt(0)};`).join('');
  const mermaid=['flowchart LR',...p.nodes.map(n=>`${ids.get(n.id)}["${mmLabel(`${n.role ?? 'unknown'}: ${n.summary ?? n.task ?? n.id} (${n.status})`)}"]`),...p.graph.edges.map(e=>`${ids.get(e.from)} -->|${e.type}| ${ids.get(e.to)}`)].join('\n');
  if(format==='text')return text;
  if(format==='mermaid')return {mermaid,text};
  if(format!=='html')throw new Error('Unknown render format');
  // Explicit caller namespace keeps rendering pure and supports relocated scripts.
  if(typeof renderId!=='string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(renderId)) throw new Error('HTML requires renderId: 1–64 ASCII letters, digits, underscore or hyphen, starting with a letter; unique per mounted fragment');
  const rootId=`soloco-progress-${renderId}-root`, scope=`#${rootId}`;
  const domId=id=>`soloco-progress-${renderId}-${ids.get(id)}`;
  const role=n=>n?.actor==='software'?'Runtime tests':({engineer:'Engineering',engineering:'Engineering',qa:'QA',designer:'Design',runner:'Chief of Staff'}[n?.role] ?? n?.role ?? 'Unknown role');
  const task=n=>n.summary ?? n.task ?? (n.actor==='software'?'Run candidate tests':'Task summary unknown');
  const recordOwner=id=>{const r=p.evidence.find(r=>r.id===id);return r?.job_id ?? r?.author_instance;};
  const owner=e=>{
    if(e.entity==='job')return e.id;
    if(e.entity==='record')return recordOwner(e.id);
    const link=p.attention.find(a=>a.notice.id===e.id)?.link;
    return link?.entity==='job'?link.id:link?.entity==='record'?recordOwner(link.id):null;
  };
  const targetFor=e=>ids.has(owner(e))?domId(owner(e)):null;
  const eventLabel=e=>{
    const n=p.nodes.find(n=>n.id===owner(e)), who=role(n);
    if(e.entity==='job') return `${who} ${{created_at:'assignment recorded',started_at:'started',execution_started_at:'execution started',finished_at:n?.returned?'returned a result':`finished (${n?.status ?? 'unknown'})`}[e.type] ?? e.type}`;
    if(e.type==='acceptance')return 'Runtime acceptance recorded';
    if(e.entity==='notice')return e.type==='seen_at'?'Notice marked seen':'Founder notice recorded';
    return `${who} ${e.type==='updated_at'?'result updated':'result recorded'}`;
  };
  const recordedTime=e=>{
    const date=new Date(e.at);
    if(!Number.isFinite(date.getTime()))return '<span class="recorded-time">Recorded time unknown</span>';
    const iso=date.toISOString();
    return `<time class="recorded-time" datetime="${esc(e.at)}"><span>${iso.slice(0,10)}</span> <span>${iso.slice(11,19)} UTC</span></time>`;
  };
  // Rank only the proven acyclic edges; keep layers vertical at every width.
  const ranks=new Map(p.nodes.map(n=>[n.id,0]));
  for(let i=0;i<p.nodes.length;i++)for(const e of p.graph.edges)ranks.set(e.to,Math.max(ranks.get(e.to),ranks.get(e.from)+1));
  const layers=[...new Set(ranks.values())].sort((a,b)=>a-b);
  const diagram=layers.map(rank=>`<div class="rank" aria-label="Evidence layer ${rank+1}">${p.nodes.filter(n=>ranks.get(n.id)===rank).map(n=>{
    const returned=p.evidence.find(r=>r.id===n.returned?.id);
    const incoming=p.graph.edges.filter(e=>e.to===n.id);
    return `<article id="${domId(n.id)}" data-status="${esc(n.status)}" tabindex="-1" aria-label="${esc(role(n))}: ${esc(task(n))}">
      ${incoming.length?`<div class="incoming">${incoming.map(e=>`<a href="#${domId(e.from)}">${esc(role(p.nodes.find(n=>n.id===e.from)))}: ${esc(task(p.nodes.find(n=>n.id===e.from)))}</a> → ${esc(e.type)} evidence`).join('<br>')}</div>`:''}
      <h4>${esc(role(n))} <span class="status">${esc(n.status)}</span></h4><p class="task">${esc(task(n))}</p>
      <p>${n.requester?`Summoned by ${esc(n.requester.role==='runner'?'Chief of Staff (CoS)':n.requester.role ?? 'unknown role')}`:'Requester unknown (historical metadata not recorded)'}</p>
      <p><strong>Expected:</strong> ${esc(n.expected_deliverable ?? 'Not recorded')}</p>
      <p><strong>Returned:</strong> ${n.returned?`${esc(returned?.kind ?? 'Artifact')} · ${esc(clip(n.returned.id,32))}${n.returned.id.length>32?'…':''} · ${esc(returned?.status ?? 'status unknown')}${returned?.review?`; recorded verdict ${esc(returned.review.recorded.verdict ?? 'unknown')}`:''}`:'None recorded'}</p>
      <details><summary>Work identity, output references and evidence</summary>${nodeLines(n,p).map(l=>`<p>${esc(l)}</p>`).join('')}${returned?`<p>${esc(evidenceLine(returned))}</p>`:''}</details>
    </article>`;
  }).join('')}</div>`).join('');
  const css=`
${scope}{font:14px/1.5 system-ui,sans-serif;color:CanvasText;background:Canvas;max-width:1400px;padding:12px;overflow-wrap:anywhere;container-type:inline-size;color-scheme:inherit}
${scope} *{box-sizing:border-box;min-width:0}
${scope} .layout{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:16px;align-items:start}
${scope} .attention{border:2px solid #b66a00;padding:12px;border-radius:6px}
${scope} .dag{position:relative;display:grid;gap:32px;padding-inline-start:24px}
${scope} .rank{display:grid;gap:32px}
${scope} .connectors{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden;color:GrayText}
${scope} .connectors path[data-from]{fill:none;stroke:currentColor;stroke-width:2}
${scope} article[data-status="running"],${scope} article[data-status="queued"]{border-inline-start-color:Highlight}
${scope} .timeline ol{list-style:none;border-inline-start:2px solid GrayText;padding-inline-start:10px}
${scope} .timeline li{position:relative}
${scope} .timeline li::before{content:"";position:absolute;left:-15px;top:8px;width:8px;height:8px;border-radius:50%;background:GrayText}
${scope} .recorded-time{display:block;font-size:12px;font-variant-numeric:tabular-nums;margin-bottom:4px}
${scope} .recorded-time span{display:block}
${scope} article{position:relative;background:Canvas;border:1px solid GrayText;border-inline-start-width:4px;border-radius:6px;padding:12px;scroll-margin:12px}
${scope} article:target,${scope} article.selected{outline:3px solid Highlight;outline-offset:2px}
${scope} .incoming{border-bottom:1px solid GrayText;padding-bottom:8px;margin-bottom:8px}
${scope} .task{font-weight:600}
${scope} .status{font-weight:400}
${scope} button,${scope} a{font:inherit;color:LinkText}
${scope} button{cursor:pointer;padding:8px;text-align:left;white-space:normal;background:Canvas;border:1px solid GrayText;border-radius:4px;max-width:100%;overflow-wrap:anywhere}
${scope} :focus-visible{outline:3px solid Highlight;outline-offset:2px}
${scope} li{margin-bottom:12px}
${scope} ol{padding-inline-start:24px}
${scope} pre{white-space:pre-wrap;overflow-wrap:anywhere}
${scope} h2,${scope} h3,${scope} h4{margin:8px 0}
${scope} p{margin:8px 0}
${scope} summary{cursor:pointer}
@container(max-width:540px){${scope} .layout{grid-template-columns:minmax(0,1fr)}}
@supports not (container-type:inline-size){@media(max-width:540px){${scope} .layout{grid-template-columns:minmax(0,1fr)}}}`;
  return `<section id="${rootId}" aria-label="Company observed progress"><style>${css}</style><h2>Company work and chronology</h2><p>${esc(preamble(p)[0])}</p>
<aside class="attention" aria-label="Founder decisions and must-know notices"><h3>Founder attention · ${p.attention.length} unresolved</h3>${p.attention.length?p.attention.map(a=>`<details open><summary>${esc(a.notice.kind)} · ${esc(a.notice.id)}</summary><p>Reference: ${esc(a.notice.reference)}</p><p>${esc(a.notice.summary ?? 'No summary recorded')}</p></details>`).join(''):'<p>No unresolved notices recorded.</p>'}</aside>
<div class="layout"><div><h3>Primary DAG · prerequisite → consumer</h3><p>Arrows show supplied evidence, not active waits. Queued jobs run immediately.</p><div class="dag"><svg id="${rootId}-edges" class="connectors" aria-hidden="true" focusable="false"><defs><marker id="${rootId}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 1 1 L 9 5 L 1 9 Z" fill="currentColor"></path></marker></defs>${p.graph.edges.map(e=>`<path data-from="${domId(e.from)}" data-to="${domId(e.to)}" marker-end="url(#${rootId}-arrow)"></path>`).join('')}</svg>${diagram || '<p>No observed jobs.</p>'}</div></div>
<aside class="timeline" aria-label="Recorded event chronology"><h3>Chronology</h3><p>Events highlight current work only. Historical states unavailable.</p><ol>${p.events.map(e=>`<li>${recordedTime(e)}${targetFor(e)?`<button type="button" data-focus="${targetFor(e)}">${esc(eventLabel(e))}</button>`:esc(eventLabel(e))}<details><summary>Recorded event details</summary><p>${esc(eventLine(e))}</p></details></li>`).join('') || '<li>No recorded events.</li>'}</ol></aside></div>
<details><summary>Evidence and acceptance (${p.evidence.length})</summary>${p.evidence.map(r=>`<p>${esc(evidenceLine(r))}</p><pre>${esc(JSON.stringify(r,null,2))}</pre>`).join('')}</details>
<details><summary>Coverage and diagnostics (${p.diagnostics.length})</summary>${preamble(p).slice(1).map(l=>`<p>${esc(l)}</p>`).join('')}<pre>${esc(p.diagnostics.map(d=>JSON.stringify(d)).join('\n'))}</pre></details>
<details><summary>Readable text fallback · equivalent facts</summary><pre>${esc(text)}</pre></details>
<script>(function(){const root=document.getElementById('${rootId}');if(!root)return;
const svg=document.getElementById('${rootId}-edges');
const dag=svg.parentElement;
function drawEdges(){
  const bounds=dag.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return;
  svg.setAttribute('viewBox','0 0 '+bounds.width+' '+bounds.height);
  svg.querySelectorAll('path[data-from]').forEach(function(path,i){
    const from=document.getElementById(path.dataset.from),to=document.getElementById(path.dataset.to);
    if(!from||!to||!root.contains(from)||!root.contains(to))return;
    const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
    const x1=a.left+a.width/2-bounds.left,y1=a.bottom-bounds.top;
    const x2=b.left+b.width/2-bounds.left,y2=b.top-bounds.top;
    // Route skipped layers through the reserved gutter, never through other cards.
    const lane=4+(i%3)*6;
    path.setAttribute('d','M '+x1+' '+y1+' V '+(y1+12)+' H '+lane+' V '+(y2-12)+' H '+x2+' V '+(y2-4));
  });
}
if(typeof ResizeObserver==='function'){
  const observer=new ResizeObserver(drawEdges);
  observer.observe(dag);
  root.querySelectorAll('article').forEach(function(card){observer.observe(card);});
}
root.addEventListener('toggle',drawEdges,true);
drawEdges();
root.addEventListener('click',function(e){const b=e.target.closest('button[data-focus]');if(!b||!root.contains(b))return;const n=document.getElementById(b.dataset.focus);if(!n||!root.contains(n))return;root.querySelectorAll('article.selected').forEach(x=>x.classList.remove('selected'));n.classList.add('selected');n.focus();});})();</script></section>`;
}
