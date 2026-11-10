/* Pure snapshot projection; no enforcement or historical state reconstruction.
 * Input: {jobs,records,notices}, each an ID-keyed object or array.
 * Output: nodes (jobs), evidence (current records), graph {valid,edges},
 * diagnostics, events, attention (unresolved notices), coverage.
 * Edges run prerequisite -> consumer; types: dependency, input, review, candidate.
 * Optional depends_on entries are job ID strings or {id}; expected_deliverable
 * is copied only when explicitly recorded. Unknown reference shapes are diagnosed.
 * Evidence refs are {id,revision}. Current provenance never proves an older
 * revision's producer. Specialist publications use job_id; runtime development
 * test receipts use author_instance with an exact software-job artifact binding.
 * Conflicting producer claims are unresolved. All output is detached from input.
 * acceptance describes only a nested local-test receipt fact: bindings_match is
 * a partial structural observation, not review validity or renewed permission.
 * Event order uses recorded instants; stable tie ordering has no causal meaning.
 */
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const copy = value => {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort(compare).map(k => [k,copy(value[k])]));
  return value;
};
const ref = r => ({id:r.id,revision:r.revision ?? null});
// Canonical role catalog; context kinds come from engine.save/control and the
// planning APIs. These fields also survive the public snapshot whitelist.
const specialistRoles = new Set(['pm','research','designer','engineer','qa','architect','frontend','backend','release','growth','support','legal','security','finance']);
const preflightContext = r => r.kind === 'artifact' && (
  r.author_role === 'runtime' && r.status === 'Submitted'
    && r.preflight_qualification?.protocol === 'legacy-M98-preflight-qualification-target-v1'
    && typeof r.preflight_qualification.plan_id === 'string' && !!r.preflight_qualification.plan_id
    && /^[a-f0-9]{64}$/.test(r.preflight_qualification.binding_sha256 ?? '')
  || r.author_role === 'human_founder' && r.status === 'Recorded'
    && r.development?.type === 'preflight_recovery_request'
    && r.development.protocol === 'original-grant-validation-recovery-v1'
    && r.development.status === 'consumed' && r.development.generation_permission === false && r.development.allowance_reset === false
    && ['plan_id','candidate_id','job_id','receipt_id'].every(key => typeof r.development.subject?.[key] === 'string' && !!r.development.subject[key])
);
const contextKind = r => preflightContext(r) || (r.author_role === 'runner' && ['intent','plan','decision','preference','artifact'].includes(r.kind))
  || (r.author_role === 'human_founder' && r.kind === 'decision');
const positiveRevision = r => Number.isInteger(r.revision) && r.revision > 0;
// Missing/undefined survives assignmentContext and its JSON round trip; null,
// zero and other malformed revisions are not unversioned control records.
const unversionedControl = r => r.author_role === 'human_founder' && r.kind === 'decision' && r.revision === undefined;
const exact = (r,x) => !!r && !!x && r.id === x.id && r.revision === x.revision && Number.isInteger(x.revision) && x.revision > 0;

export function progressFor(snapshot = {}) {
  const diagnostics = [], events = [], candidates = [];
  const diagnostic = (code,details) => diagnostics.push({code,...copy(details)});
  function collection(value,kind) {
    const result = new Map(), duplicates = new Set();
    const rows = Array.isArray(value) ? value.map(v => [null,v]) : value && typeof value === 'object' ? Object.entries(value).sort(([a],[b]) => compare(a,b)) : [];
    if (value != null && !Array.isArray(value) && typeof value !== 'object') diagnostic('invalid_collection',{kind});
    for (const [key,row] of rows) {
      if (!row || typeof row.id !== 'string' || !row.id || (key !== null && key !== row.id)) {
        diagnostic('invalid_identity',{kind,key}); continue;
      }
      if (result.has(row.id) || duplicates.has(row.id)) {
        duplicates.add(row.id); result.delete(row.id); diagnostic('ambiguous_identity',{kind,id:row.id});
      } else result.set(row.id,row);
    }
    return new Map([...result].sort(([a],[b]) => compare(a,b)));
  }
  const jobs = collection(snapshot.jobs,'job'), records = collection(snapshot.records,'record'), notices = collection(snapshot.notices,'notice');
  const outputClaims = new Map(), producers = new Map(), contexts = new Map();
  for (const job of jobs.values()) {
    if (job.artifact_id == null) continue;
    const claims = outputClaims.get(job.artifact_id) ?? [];
    claims.push(job.id);
    outputClaims.set(job.artifact_id,claims);
  }
  // Resolve provenance once so context labels, outputs and consumed records agree.
  // A context role cannot also claim a job producer, including via artifact_id.
  function producerFor(record) {
    if (producers.has(record.id)) return producers.get(record.id);
    const softwareReceipt = record.author_role === 'runtime' && ['test','preflight_diagnostic'].includes(record.development?.type);
    const softwareKind = record.development?.type === 'preflight_diagnostic' ? 'development_preflight' : 'development_test';
    const claimedId = softwareReceipt ? record.author_instance : record.job_id;
    const job = jobs.get(claimedId);
    const claims = outputClaims.get(record.id) ?? [];
    const nonJob = contextKind(record);
    const conflict = (nonJob && (record.job_id != null || claims.length > 0))
      || (softwareReceipt && record.job_id != null && record.job_id !== claimedId)
      || claims.some(id => id !== claimedId);
    let resolved = null;
    if (conflict) {
      diagnostic('conflicting_producer',{record:ref(record),job_id:record.job_id ?? null,author_instance:record.author_instance ?? null,output_claims:claims});
    } else if (nonJob && record.job_id == null) {
      contexts.set(record.id,positiveRevision(record) || unversionedControl(record));
    } else if (job && positiveRevision(record) && (softwareReceipt
      ? job.kind === softwareKind && job.artifact_id === record.id
      : specialistRoles.has(record.author_role ?? job.role) && specialistRoles.has(job.role)
        && (record.author_role == null || record.author_role === job.role) && job.kind !== 'development_test' && (job.artifact_id == null || job.artifact_id === record.id))) {
      resolved = job;
    }
    producers.set(record.id,resolved);
    return resolved;
  }
  function isContext(record) {
    if (!record) return false;
    producerFor(record);
    return contexts.get(record.id) === true;
  }
  function contextReference(record,reference) {
    return isContext(record) && (exact(record,reference)
      || (unversionedControl(record) && reference?.revision === undefined));
  }
  function event(entity,id,type,value) {
    if (value == null) { diagnostic('missing_date',{entity,id,type}); return; }
    const ms = typeof value === 'string' ? Date.parse(value) : NaN;
    if (!Number.isFinite(ms)) { diagnostic('invalid_date',{entity,id,type,value}); return; }
    events.push({entity,id,type,at:value,instant:ms});
  }
  function edge(from,to,type,reference = null) {
    if (!jobs.has(from) || !jobs.has(to)) { diagnostic('unknown_job_relation',{from,to,type,reference}); return; }
    if (from === to) { diagnostic('self_relation',{from,to,type,reference}); return; }
    candidates.push({from,to,type,reference:copy(reference)});
  }
  function producer(reference,consumer,type) {
    const record = records.get(reference?.id);
    if (contextReference(record,reference)) return;
    if (!exact(record,reference)) {
      diagnostic('unresolved_revision',{consumer,type,reference:reference ?? null,current:record ? ref(record) : null}); return;
    }
    const job = producerFor(record);
    if (!job) {
      diagnostic('unresolved_producer',{consumer,type,reference,job_id:record.job_id ?? null}); return;
    }
    edge(job.id,consumer,type,reference);
  }
  const nodes = [...jobs.values()].map(job => {
    const returned = records.get(job.artifact_id);
    const returnedRef = own(job,'artifact_id') && job.artifact_id != null ? {id:job.artifact_id,revision:returned?.revision ?? null} : null;
    if (returnedRef && (!returned || producerFor(returned)?.id !== job.id)) diagnostic('returned_link_mismatch',{job_id:job.id,reference:returnedRef});
    const node = {
      id:job.id,role:job.role ?? null,instance_id:job.instance_id ?? null,
      native_id:job.native_id ?? null,kind:job.kind ?? null,
      actor:['development_test','development_preflight'].includes(job.kind) ? 'software' : 'specialist',
      task:job.task ?? null,summary:job.task_summary ?? (typeof job.task === 'string' ? job.task.slice(0,120) : null),
      status:job.status ?? null,returned:returnedRef,
      inputs:copy(job.inputs ?? []),review_of:copy(job.review_of ?? null),
      rejected_output:copy(job.rejected_output ?? null)
    };
    if (own(job,'requester')) node.requester = copy(job.requester);
    if (own(job,'specialist')) node.specialist = copy(job.specialist);
    node.context_inputs = (Array.isArray(job.inputs) ? job.inputs : []).filter(r => contextReference(records.get(r?.id),r)).map(copy);
    if (own(job,'expected_deliverable')) node.expected_deliverable = copy(job.expected_deliverable);
    if (own(job,'next_handoff')) node.next_handoff = copy(job.next_handoff);
    for (const field of ['created_at','started_at','execution_started_at','finished_at']) {
      if (own(job,field) || field === 'created_at') event('job',job.id,field,job[field]);
    }
    if (Array.isArray(job.inputs)) for (const input of job.inputs) producer(input,job.id,'input');
    else diagnostic('invalid_inputs',{job_id:job.id});
    if (job.review_of != null) producer(job.review_of,job.id,'review');
    if (job.kind === 'development_test') {
      const candidate = records.get(job.candidate_id), d = candidate?.development;
      const receipt = records.get(job.artifact_id), t = receipt?.development;
      const request = records.get(d?.preflight_recovery), recovery = request?.development;
      const prior = Array.isArray(d?.run_history) ? d.run_history.find(run => run.job_id === job.id && run.receipt_id === job.artifact_id && run.status === 'completed') : null;
      const historical = prior && preflightContext(request ?? {}) && recovery?.type === 'preflight_recovery_request'
        && recovery.subject.plan_id === d.plan_id && recovery.subject.candidate_id === candidate.id
        && recovery.subject.job_id === job.id && recovery.subject.receipt_id === job.artifact_id
        && recovery.subject.candidate_sha256 === d.candidate_sha256 && recovery.subject.receipt_sha256 === t?.receipt_sha256
        && job.status === 'completed';
      const run = d?.run?.job_id === job.id ? d.run : historical ? prior : null;
      const bound = d?.type === 'candidate' && candidate.status === 'Submitted'
        && d.plan_id === job.development_id && run?.job_id === job.id
        && typeof d.candidate_sha256 === 'string' && !!d.candidate_sha256
        && (!job.artifact_id || (receipt && producerFor(receipt)?.id === job.id
          && run.receipt_id === receipt.id && t?.candidate_id === candidate.id
          && t.plan_id === d.plan_id && t.candidate_sha256 === d.candidate_sha256));
      if (bound) producer(ref(candidate),job.id,'candidate');
      else diagnostic('unresolved_candidate',{job_id:job.id,candidate_id:job.candidate_id ?? null});
    }
    if (own(job,'depends_on')) {
      if (!Array.isArray(job.depends_on)) diagnostic('invalid_dependencies',{job_id:job.id});
      else for (const dependency of job.depends_on) {
        const id = typeof dependency === 'string' ? dependency : dependency?.id;
        if (typeof id !== 'string' || (typeof dependency === 'object' && Object.keys(dependency).some(k => k !== 'id'))) diagnostic('invalid_dependency',{job_id:job.id,dependency});
        else edge(id,job.id,'dependency');
      }
    }
    return node;
  });
  function acceptanceFor(record) {
    const d = record.development, a = d?.acceptance;
    if (!a) return null;
    const candidate = records.get(d.candidate_id), review = records.get(a.review_id);
    const job = producerFor(record);
    const matching = d.type === 'test' && record.status === 'Submitted'
      && candidate?.status === 'Submitted'
      && candidate.development?.type === 'candidate'
      && candidate.development?.plan_id === d.plan_id
      && typeof d.candidate_sha256 === 'string' && !!d.candidate_sha256
      && typeof d.receipt_sha256 === 'string' && !!d.receipt_sha256
      && a.candidate_sha256 === d.candidate_sha256
      && a.receipt_sha256 === d.receipt_sha256
      && candidate.development?.candidate_sha256 === d.candidate_sha256
      && candidate.development?.run?.receipt_id === record.id
      && candidate.development?.run?.job_id === record.author_instance
      && record.author_role === 'runtime' && job?.kind === 'development_test'
      && job.status === 'completed' && job.artifact_id === record.id
      && d.result?.tests_executed === true && d.result?.status === 'passed' && d.result?.exit_code === 0
      && review?.kind === 'review' && review.status === 'Submitted'
      && exact(record,review.review_of) && review.review?.verdict === 'Pass'
      && review.review?.candidate_sha256 === d.candidate_sha256
      && review.review?.receipt_sha256 === d.receipt_sha256;
    if (!matching) diagnostic('acceptance_binding_mismatch',{record:ref(record)});
    event('record',record.id,'acceptance',a.at);
    return {recorded:copy(a),bindings_match:!!matching,current_applicability:'unknown',source:ref(record)};
  }
  const evidence = [...records.values()].map(record => {
    event('record',record.id,'created_at',record.created_at);
    if (own(record,'updated_at')) event('record',record.id,'updated_at',record.updated_at);
    return {
      ...ref(record),kind:record.kind ?? null,status:record.status ?? null,
      context:isContext(record),
      job_id:record.job_id ?? null,author_role:record.author_role ?? null,author_instance:record.author_instance ?? null,
      review_of:copy(record.review_of ?? null),
      review:record.review == null ? null : {recorded:copy(record.review),current_applicability:'unknown'},
      acceptance:acceptanceFor(record),
      quarantined_files:copy(record.quarantined_files ?? null)
    };
  });
  const attention = [...notices.values()].filter(n => !n.resolution).map(n => {
    event('notice',n.id,'created_at',n.created_at);
    if (n.seen_at != null) event('notice',n.id,'seen_at',n.seen_at);
    for (const delivery of n.deliveries ?? []) {
      // Delivery entries have no supplied canonical timestamp schema; retain only.
      void delivery;
    }
    const reference = n.reference;
    const matches = [jobs.has(reference) ? {entity:'job',id:reference} : null,records.has(reference) ? {entity:'record',id:reference} : null].filter(Boolean);
    if (reference != null && matches.length !== 1) diagnostic('unresolved_notice_reference',{notice_id:n.id,reference});
    return {notice:copy(n),link:matches.length === 1 ? matches[0] : null};
  });
  const unique = new Map(candidates.map(e => [JSON.stringify(e),e]));
  const allEdges = [...unique.values()].sort((a,b) => compare(JSON.stringify(a),JSON.stringify(b)));
  const adjacency = new Map([...jobs.keys()].map(id => [id,[]]));
  for (const e of allEdges) adjacency.get(e.from).push(e.to);
  function reaches(start,target) {
    const pending = [start], seen = new Set();
    while (pending.length) {
      const id = pending.pop();
      if (id === target) return true;
      if (seen.has(id)) continue;
      seen.add(id); pending.push(...adjacency.get(id));
    }
    return false;
  }
  const edges = allEdges.filter(e => {
    if (!reaches(e.to,e.from)) return true;
    diagnostic('cyclic_relation',e); return false;
  });
  events.sort((a,b) => a.instant - b.instant || compare(JSON.stringify([a.entity,a.id,a.type]),JSON.stringify([b.entity,b.id,b.type])));
  const counts = new Map();
  for (const e of events) counts.set(e.instant,(counts.get(e.instant) ?? 0)+1);
  for (const e of events) { e.tied = counts.get(e.instant) > 1; delete e.instant; }
  diagnostics.sort((a,b) => compare(JSON.stringify(a),JSON.stringify(b)));
  const relationCodes = new Set(['invalid_collection','invalid_identity','ambiguous_identity','unknown_job_relation','self_relation','unresolved_revision','unresolved_producer','conflicting_producer','invalid_inputs','invalid_dependencies','invalid_dependency','cyclic_relation','returned_link_mismatch','unresolved_candidate']);
  return {nodes,evidence,graph:{valid:!diagnostics.some(d => relationCodes.has(d.code)),edges},events,attention,diagnostics,coverage:{
    scope:'all supplied current jobs, records and unresolved notices',window:null,ancestor_expansion:false,
    historical_states:'unavailable',resolved_notice_history:'not guaranteed by supplied snapshot',
    limitations:['No inference from elapsed time, prose or role names.','Missing or tied dates cannot establish chronological precedence.','Previous record content does not establish producer lineage.','Recorded reviews and acceptance do not prove current applicability.','Acceptance bindings_match checks partial structure only; it does not verify reviewer independence, full review validity or authorization.','Delivery and seen status do not establish authorization.','Events describe recorded instants, never historical playback.']
  }};
}
