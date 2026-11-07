import { digest } from './store.mjs';
import {taskMessageInput} from './tasks.mjs';

const active=new Set(['queued','running']);
function names(value,label,max) {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>max||value.some(v=>typeof v!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(v)))throw new Error(`${label} must contain at most ${max} bounded identifiers`);
  if(new Set(value).size!==value.length)throw new Error(`${label} must not contain duplicates`);
  return [...value].sort();
}
export function normalizeCoordination(args={}) {
  return {depends_on:names(args.depends_on,'depends_on',16),resources:names(args.resources,'resources',16)};
}
function dependency(state,id,seen=new Set()) {
  if(seen.has(id))throw new Error('Cyclic coordination prerequisite');seen.add(id);
  const job=state.jobs?.[id],artifact=state.records?.[job?.artifact_id];
  const software=job?.kind==='development_test';
  if(!job || job.status!=='completed' || !artifact || artifact.status!=='Submitted' || (software ? artifact.kind!=='artifact'||artifact.author_role!=='runtime'||artifact.author_instance!==job.id : artifact.job_id!==job.id||artifact.author_instance!==job.instance_id))throw new Error(`Dependency ${id} is not a completed, attributable submitted output; keep dependent work planned`);
  if((job.inputs??[]).some(ref=>{const value=state.records?.[ref.id];return (job.runtime_task?taskMessageInput(state,job,value):value)?.revision!==ref.revision;}))throw new Error(`Dependency ${id} has changed prerequisite evidence`);
  if(!Number.isInteger(artifact.revision)||artifact.revision<1)throw new Error(`Dependency ${id} has an invalid artifact version`);
  if(software) {
    const d=artifact.development,c=state.records[d?.candidate_id],p=state.records[d?.plan_id],producer=state.jobs?.[c?.job_id];
    if(d?.type!=='test'||job.development_id!==d.plan_id||job.candidate_id!==d.candidate_id||c?.status!=='Submitted'||c.development?.type!=='candidate'||p?.development?.type!=='plan'||c.development.plan_id!==p?.id||c.development.scope_sha256!==p?.development?.scope_sha256||producer?.status!=='completed'||producer.artifact_id!==c.id||producer.instance_id!==c.author_instance||c.development.run?.job_id!==job.id||c.development.run.receipt_id!==artifact.id||c.development.run.status!=='completed'||c.development.candidate_sha256!==d.candidate_sha256||!Array.isArray(c.development.files)||digest(JSON.stringify(c.development.files))!==d.candidate_sha256||d.result?.candidate_sha256!==d.candidate_sha256||!Array.isArray(p?.development?.scope?.test_paths)||JSON.stringify(d.result?.test_paths)!==JSON.stringify(p.development.scope.test_paths)||d.result?.tests_executed!==true||d.result.status!=='passed'||d.result.exit_code!==0||d.receipt_sha256!==digest(JSON.stringify(d.result)))throw new Error(`Dependency ${id} lacks a canonical passing test receipt`);
  }
  let subject=null;
  if(artifact.kind==='review') {
    const target=state.records[artifact.review_of?.id];
    if(!target || target.status!=='Submitted' || target.revision!==artifact.review_of.revision || job.review_of?.id!==target.id || job.review_of?.revision!==target.revision || artifact.review?.verdict!=='Pass' || (artifact.review.blockers!==undefined && (!Array.isArray(artifact.review.blockers)||artifact.review.blockers.length)))throw new Error(`Dependency ${id} lacks a current exact-subject Pass; a review is not acceptance or permission`);
    if(target.development?.type==='test') {
      dependency(state,target.author_instance,seen);
      const d=target.development;
      if(artifact.review.permitted_action!=='accept_local_development'||artifact.review.candidate_sha256!==d.candidate_sha256||artifact.review.receipt_sha256!==d.receipt_sha256||!Array.isArray(artifact.review.blockers))throw new Error(`Dependency ${id} review lacks exact candidate/receipt binding`);
    }
    subject={id:target.id,revision:target.revision,sha256:digest(JSON.stringify(target))};
    const candidate=target.development?.type==='test'?state.records[target.development.candidate_id]:target;
    const author=state.jobs[candidate?.job_id];
    if(!job.native_id || artifact.author_instance===target.author_instance || artifact.author_instance===candidate?.author_instance || job.native_id===target.author_instance || job.native_id===candidate?.author_instance || author?.native_id===job.native_id)throw new Error(`Dependency ${id} is not an independent review`);
  }
  return {job_id:job.id,epoch:job.epoch??null,instance_id:job.instance_id??null,artifact_id:artifact.id,revision:artifact.revision,sha256:digest(JSON.stringify(artifact)),...(subject?{subject}:{})};
}
export function resourceClaims(state,excluding=null) {
  const claims=[];
  for(const job of Object.values(state.jobs??{})) {
    if(job.id===excluding || !job.coordination?.resources?.length)continue;
    // A pause/deadline may change status before process closure. Only runtime
    // closure evidence releases claims; no clock or terminal label proves it.
    if(!active.has(job.status) && job.coordination_release?.termination_confirmed===true)continue;
    for(const resource of job.coordination.resources)claims.push({resource,job_id:job.id,status:job.status,termination_unverified:!active.has(job.status)});
  }
  return claims;
}
export function bindCoordination(state,args) {
  const value=normalizeCoordination(args);
  if(!value.depends_on.length&&!value.resources.length)return null;
  const dependencies=value.depends_on.map(id=>dependency(state,id));
  const claims=resourceClaims(state);
  for(const resource of value.resources)if(claims.some(c=>c.resource===resource))throw new Error(`Resource ${resource} is reserved; wait for confirmed completion or inspect uncertain execution`);
  return {version:1,dependencies,resources:value.resources};
}
export function coordinationEligible(state,job) {
  if(!job.coordination)return true;
  const value=job.coordination;
  if(value.version!==1 || !Array.isArray(value.dependencies))throw new Error('Unsupported coordination record');
  names(value.resources,'resources',16);
  for(const bound of value.dependencies) {
    if(bound.job_id===job.id || JSON.stringify(dependency(state,bound.job_id))!==JSON.stringify(bound))throw new Error('Coordination dependency changed');
    if(!job.inputs?.some(input=>input.id===bound.artifact_id&&input.revision===bound.revision))throw new Error('Coordination dependency evidence is missing from assignment inputs');
  }
  const claims=resourceClaims(state,job.id);
  for(const resource of value.resources)if(claims.some(c=>c.resource===resource))throw new Error('Conflicting resource claim; execution held for inspection');
  return true;
}
