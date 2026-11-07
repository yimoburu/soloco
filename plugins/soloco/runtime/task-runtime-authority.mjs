import {digest,owner,stamp,id,requireText,teamHash,compatibleRuntime,upgradePending} from './store.mjs';

export const RUNTIME_CONTROL_ID='async-runtime-control';
const CONTROL_CONTENT='Runtime lifecycle metadata; task authority remains separately required.';
const fields=['id','kind','status','content','author_role','author_instance','recorded_by','revision','created_at','updated_at','runtime_control'];
const controlFields=['version','enabled','instance_id','owner','team_sha256','source_instruction','control_revision','pid','heartbeat_at','started_at','stopped_at','error'];
export function runtimeControl(state,{enabled=false}={}) {
  const record=state.records?.[RUNTIME_CONTROL_ID],c=record?.runtime_control;
  if(!record||record.id!==RUNTIME_CONTROL_ID||record.kind!=='artifact'||record.content!==CONTROL_CONTENT||record.status!==(c?.enabled?'Runtime:enabled':'Runtime:stopped')||record.author_role!=='runtime'||record.author_instance!==c?.instance_id||record.recorded_by!==c?.owner?.session_id||Object.keys(record).some(k=>!fields.includes(k))||!Number.isInteger(record.revision)||record.revision<1||!c||c.version!==1||typeof c.enabled!=='boolean'||typeof c.instance_id!=='string'||c.instance_id.length>200||!Number.isInteger(c.control_revision)||c.control_revision<1||Object.keys(c).some(k=>!controlFields.includes(k)))throw Error('Runtime control missing or invalid; use company_runtime start');
  if(c.pid!==undefined&&(!Number.isInteger(c.pid)||c.pid<1)||c.error!==undefined&&(typeof c.error!=='string'||c.error.length>1000))throw Error('Runtime operational metadata is invalid');
  for(const key of ['heartbeat_at','started_at','stopped_at'])if(c[key]!==undefined&&(typeof c[key]!=='string'||!Number.isFinite(Date.parse(c[key]))))throw Error('Runtime timestamp is invalid');
  if(!c.owner||Object.keys(c.owner).sort().join(',')!=='epoch,host,session_id'||JSON.stringify(c.owner)!==JSON.stringify(state.owner)||c.team_sha256!==state.team_sha256||!compatibleRuntime(state)||upgradePending(state)||state.team_sha256!==teamHash(state))throw Error('Runtime authority changed; explicit current-owner restart is required');
  requireText(c.source_instruction,'runtime source_instruction');
  if(enabled&&(!c.enabled||state.paused||state.mode!=='preparation'))throw Error('Runtime disabled, company paused, or unsupported execution mode');
  return record;
}
export function runtimeControlBinding(state) {
  const c=runtimeControl(state).runtime_control;
  return {version:1,enabled:c.enabled,instance_id:c.instance_id,owner:c.owner,team_sha256:c.team_sha256,source_instruction:c.source_instruction,control_revision:c.control_revision};
}
export function isRuntimeBookkeeping(state,record) {
  if(record?.id!==RUNTIME_CONTROL_ID||state.records?.[RUNTIME_CONTROL_ID]!==record)return false;
  try{runtimeControl(state);return true;}catch{return false;}
}
export function setRuntimeControl(state,args,host) {
  owner(state,args.session_id,host,args.epoch);
  requireText(args.source_instruction,'source_instruction');
  if(!['start','stop'].includes(args.action))throw Error('Runtime control action must be start or stop');
  if(state.paused&&args.action==='start')throw Error('Company is paused; runtime cannot start ordinary work');
  if(state.mode!=='preparation'&&args.action==='start')throw Error('Async runtime currently supports bounded preparation only');
  const previous=state.records?.[RUNTIME_CONTROL_ID],old=previous?.runtime_control;
  const same=old?.enabled&&!old.error&&JSON.stringify(old.owner)===JSON.stringify(state.owner)&&old.team_sha256===state.team_sha256;
  if(same&&args.action==='start'&&old.source_instruction===args.source_instruction)return previous;
  const instance=args.action==='start'&&same?old.instance_id:id('supervisor');
  const control={version:1,enabled:args.action==='start',instance_id:instance,owner:{...state.owner},team_sha256:state.team_sha256,source_instruction:args.source_instruction,control_revision:(old?.control_revision??0)+1,started_at:stamp()};
  state.records[RUNTIME_CONTROL_ID]={id:RUNTIME_CONTROL_ID,kind:'artifact',status:control.enabled?'Runtime:enabled':'Runtime:stopped',content:CONTROL_CONTENT,author_role:'runtime',author_instance:instance,recorded_by:state.owner.session_id,revision:(previous?.revision??0)+1,created_at:previous?.created_at??stamp(),updated_at:stamp(),runtime_control:control};
  return state.records[RUNTIME_CONTROL_ID];
}
export function runtimeGrant(state,task) {
  const control=runtimeControl(state,{enabled:true}),t=task?.runtime_task;
  if(!t||JSON.stringify(t.owner)!==JSON.stringify(state.owner))throw Error('Task owner authority changed');
  return {actor:'runtime',instance_id:control.runtime_control.instance_id,task_id:task.id,definition_revision:t.definition_revision,definition_sha256:t.definition_sha256,owner_epoch:state.owner.epoch,control_sha256:digest(JSON.stringify(runtimeControlBinding(state)))};
}
