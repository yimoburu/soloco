// Source transport boundary only. The fixed MCP serve path supplies HOST _meta
// AFTER the supported Codex host has inserted/overwritten its identity fields.
// This assumption is external to JSON: neither a matching object nor a static
// version string attests an installed host. Model tool arguments cannot select
// this callback/context. Capturing a request alone grants no authority.
import {AsyncLocalStorage} from 'node:async_hooks';
import {types} from 'node:util';

const requests=new AsyncLocalStorage();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOT_CODE='MCP_CODEX_ROOT_CALLER_REQUIRED';
const ROOT_MESSAGE=ROOT_CODE+': A supported Codex root HOST caller matching the session selector is required.';
const HOOK_BOUND_CODE='MCP_CLAUDE_HOOK_BOUND_CALLER_REQUIRED';
const HOOK_BOUND_MESSAGE=HOOK_BOUND_CODE+': An active Claude MCP invocation whose host and session selector match is required.';
const plain=value=>value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function ownData(value,key){
 if(!plain(value))return {present:false,data:false,value:undefined};
 const descriptor=Object.getOwnPropertyDescriptor(value,key);
 const data=Boolean(descriptor?.enumerable&&Object.hasOwn(descriptor,'value'));
 return {present:Boolean(descriptor),data,value:data?descriptor.value:undefined};
}
function capture(host,rawMeta){
 // Read only the two identity descriptors; unrelated HOST metadata is ignored.
 // Keep immutable primitive snapshots without changing or freezing the input.
 const thread=ownData(rawMeta,'threadId'),session=ownData(rawMeta,'sessionId');
 const ownFields=thread.data&&session.data;
 const valid=ownFields&&typeof thread.value==='string'&&UUID.test(thread.value)&&typeof session.value==='string'&&UUID.test(session.value);
 return Object.freeze({host,supplied:rawMeta!==undefined,object:plain(rawMeta),ownFields,valid,
  threadId:valid?thread.value:null,sessionId:valid?session.value:null});
}
function selector(input){
 const host=ownData(input,'host'),session=ownData(input,'session_id');
 return {host:host.data&&typeof host.value==='string'?host.value:null,
  session:session.data&&typeof session.value==='string'&&UUID.test(session.value)?session.value:null};
}
function current(input){
 const record=requests.getStore(),active=record?.active===true,selected=selector(input),observed=active&&record.snapshot.valid;
 const hostMatches=active&&selected.host===record.snapshot.host;
 const supported=hostMatches&&selected.host==='codex';
 const root=active&&record.snapshot.host==='codex'&&observed&&record.snapshot.threadId===record.snapshot.sessionId;
 const matches=observed&&selected.session!==null&&selected.session===record.snapshot.sessionId;
 return {record,active,selected,observed,hostMatches,supported,root,matches};
}

/** Private source entry for one MCP invocation; never a public tool argument.
 * Missing/malformed/unsupported metadata still permits legacy preparation to
 * run. New root-actor consumers fail closed through requireCodexRootActor.
 * The private record expires after the full awaited invocation, including on
 * error; detached async descendants retain only a revoked record. */
export async function runWithMcpHostContext(host,rawMeta,invoke){
 if(typeof invoke!=='function'||types.isProxy(invoke))throw Object.assign(new TypeError('A source-owned MCP invocation callback is required.'),{code:'MCP_HOST_CONTEXT_CALLBACK_REQUIRED'});
 const record={snapshot:capture(host,rawMeta),active:true};
 return requests.run(record,async()=>{
  try{return await invoke();}finally{record.active=false;}
 });
}

/** Bounded observational DATA, never an authentication token or permission.
 * root describes the HOST pair; host_matches and selector_matches describe
 * this selector separately. No actual thread/session/native ID is returned. */
export function mcpCallerDiagnostic(input={}){
 const state=current(input),snapshot=state.active?state.record.snapshot:null;
 return Object.freeze({
  identity_basis:state.supported&&state.observed?'CODEX_HOST_META_OBSERVED':'LEGACY_UNQUALIFIED',
  context_active:state.active,
  host_supported:state.supported,
  host_matches:state.hostMatches,
  metadata_supplied:Boolean(snapshot?.supplied),
  metadata_object:Boolean(snapshot?.object),
  identity_fields_data:Boolean(snapshot?.ownFields),
  observed:state.observed,
  root:state.root,
  hook_bound_tier_eligible:state.active&&state.hostMatches&&state.selected.host==='claude'&&state.selected.session!==null,
  selector_observed:state.selected.session!==null,
  selector_matches:state.matches,
  authority_granted:false,
  native_qualification:false
 });
}

/** Synchronous source consumer. No row, binding file, tool argument, diagnostic
 * object or identity normalization can replace the active HOST observation. */
export function requireCodexRootActor(input){
 const state=current(input);
 if(!state.active||!state.supported||!state.observed||!state.root||!state.matches)throw Object.assign(new Error(ROOT_MESSAGE),{code:ROOT_CODE});
 return Object.freeze({host:'codex',session_id:state.record.snapshot.sessionId,native_id:state.record.snapshot.threadId});
}

/** WEAKER TIER. Claude supplies no host-observed thread/session identity, so this
 * proves only that (a) the call runs inside the fixed main.serve invocation scope
 * of the Claude server, (b) the selector host is 'claude' and (c) session_id is a
 * well-formed UUID. It cannot distinguish a root chat from a descendant that knows
 * the session ID. It is never native identity, never grants authority, and callers
 * must additionally require the current managed hook record for the same actor and
 * must restrict themselves to read-only operations. If the host ever supplies
 * valid identity metadata naming a different session, the tier is refused. */
export function requireClaudeHookBoundActor(input){
 const state=current(input);
 if(!state.active||!state.hostMatches||state.selected.host!=='claude'||state.selected.session===null||state.observed&&!state.matches)throw Object.assign(new Error(HOOK_BOUND_MESSAGE),{code:HOOK_BOUND_CODE});
 return Object.freeze({host:'claude',session_id:state.selected.session,native_id:null,tier:'HOOK_BOUND'});
}
