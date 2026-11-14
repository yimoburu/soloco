import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as wire from '../plugins/soloco/runtime/peers/origin-maintenance-wire.mjs';
import {isOriginalContextInterpreterUnavailable} from '../plugins/soloco/runtime/peers/protected-source-build-slot.mjs';

// Pure SOURCE geometry and resource tests only. Fixture JSON is never original
// admission, authority, current meaning, Native qualification or launch proof.
const hash=v=>createHash('sha256').update(v).digest('hex');
function range(kind='peer-origin-reconstruction'){
 return {protocol:'peer-origin-maintenance-context-v1',kind,company_id:'SYNTHETIC',subject:{},subject_sha256:'a'.repeat(64),pinned_team:{},authority:{peer_policy:{max_context_bytes:65536}},original_source_manifest:[],legacy_frontier:[],compulsory_originals:[],legacy_reservations:[],late_obligations:[],late_obligation_refs:[],current_obligations:[],current_reservations:[],prior_reviews:[],sources:[],reconstruction:null,response_contract:{},instructions:'SYNTHETIC original business DATA'};
}
function seal(){return {protocol:'peer-origin-frontier-seal-context-v1',kind:'peer-origin-frontier-seal-review',connection:{},subject:{},checkpoint:{},checked_current_meaning:{},pinned_team:{},authority:{peer_policy:{max_context_bytes:65536}},mandatory_markers:[],reservations:[],notices:[],late_obligations:[],excluded_native_ids:[],response_contract:{}};}
function owner(){return {protocol:'peer-owner-maintenance-assignment-v1',kind:'owner-handover-review',fresh_review_purpose:'peer-owner-maintenance-fresh-purpose-v1',connection:{},owner_handover_id:'SYNTHETIC',owner_epoch:8,subject:{},reconstruction:{},reviewer:{},prior_attempts:[],prior_reconstructions:[],recovery_dispositions:[],prior_external_attempts:[],late_obligations:[],subject_refreshes:[],authority:{peer_policy:{max_context_bytes:65536}}};}
const forms=[['reconstruction',()=>range(),wire.encodeOriginMaintenanceDeliveryFrame,'origin-maintenance-assignment'],['range review',()=>range('peer-origin-review'),wire.encodeOriginMaintenanceDeliveryFrame,'origin-maintenance-assignment'],['seal',seal,wire.encodeOriginFrontierSealDeliveryFrame,'origin-frontier-seal-assignment'],['owner fresh',owner,wire.encodeOwnerMaintenanceFreshDeliveryFrame,'owner-maintenance-assignment']];
for(const [name,body,encode,delivery] of forms){
 test(name+' geometry retains complete payload bytes under its fixed closed delivery',()=>{
  const text=JSON.stringify(body()),frame=encode(text),start=frame.text.indexOf('"payload":')+10;
  assert.equal(frame.text.slice(start,-1),text);assert.equal(frame.sha256,hash(frame.text));assert.equal(frame.utf8_bytes,Buffer.byteLength(frame.text));assert.equal(JSON.parse(frame.text).delivery_kind,delivery);assert.equal(JSON.parse(frame.text).source_cut_protocol,null);
 });
 test(name+' opaque business strings and finite unsafe numbers retain lexical bytes',()=>{
  const text=JSON.stringify(body()).replace('"subject":{}','"subject":{"original_units":{"\\ud800":"\\udfff","n":9007199254740993,"nested":[{"x":1.234567890123456789e30}]}}');
  const frame=encode(text);assert.ok(frame.text.includes('"n":9007199254740993'));assert.ok(frame.text.includes('"\\ud800":"\\udfff"'));assert.ok(frame.text.endsWith(text+'}'));
 });
 test(name+' escaped duplicate opaque keys are rejected before framing',()=>{
  const text=JSON.stringify(body()).replace('"subject":{}','"subject":{"a":1,"\\u0061":2}');assert.throws(()=>encode(text),{code:'ORIGIN_WIRE_DUPLICATE'});
 });
 test(name+' policy capacity remains an actual safe bounded control selector',()=>{
  const text=JSON.stringify(body()).replace('"max_context_bytes":65536','"max_context_bytes":9007199254740993');assert.throws(()=>encode(text),{code:'ORIGIN_WIRE_PAYLOAD'});
 });
}
test('two exact resources are byte-identical between Node and Native and have distinct tuples',()=>{
 const tuples=[['origin-maintenance','origin_maintenance',wire.ORIGIN_MAINTENANCE_CONTEXT_SELECTION,3122],['origin-final-review','origin_final_review',wire.ORIGIN_FINAL_REVIEW_CONTEXT_SELECTION,3476]];
 for(const [node,native,selection,size]of tuples){const bytes=fs.readFileSync(new URL('../plugins/soloco/runtime/peers/'+node+'-readonly3-contract-v1.json',import.meta.url)),compiled=fs.readFileSync(new URL('../native/codex/overlay/codex-rs/codex-api/src/protected_peer/'+native+'_readonly3_contract_v1.json',import.meta.url));assert.deepEqual(bytes,compiled);assert.equal(bytes.length,size);assert.equal(hash(bytes),selection.resource_sha256);const r=JSON.parse(bytes);assert.equal(r.scope_profile_id,selection.scope_profile_id);assert.equal(r.fresh_thread_required,true);assert.equal(r.tools.length,3);}
 assert.notDeepEqual(tuples[0][2],tuples[1][2]);
});
test('fixed Responses inventory matches SDK numeric projection and preserves raw 4096 bound',()=>{
 for(const [raw,response]of [[wire.originMaintenanceReadonly3Tools(),wire.originMaintenanceResponsesTools()],[wire.originFinalReviewReadonly3Tools(),wire.originFinalReviewResponsesTools()]]){
  assert.deepEqual(raw.map(t=>t.name),['soloco_context_header','soloco_context_read','soloco_context_submit']);assert.equal(raw[1].inputSchema.properties.length.maximum,4096);
  assert.deepEqual(response[1].parameters,{type:'object',properties:{sha256:{type:'string'},offset:{type:'integer'},length:{type:'integer'}},required:['sha256','offset','length'],additionalProperties:false});assert.equal(response[1].strict,false);assert.equal(Object.hasOwn(response[1].parameters.properties.length,'maximum'),false);assert.ok(Object.isFrozen(raw)&&Object.isFrozen(response));
 }
});
test('final-review resource retains owner 1024/8192 versus seal 4096/16384 purpose limits',()=>{
 const r=JSON.parse(fs.readFileSync(new URL('../plugins/soloco/runtime/peers/origin-final-review-readonly3-contract-v1.json',import.meta.url)));
 assert.deepEqual(r.deliveries.map(d=>[d.delivery_kind,d.read_maximum_characters,d.response_maximum_utf8_bytes]),[['origin-frontier-seal-assignment',4096,16384],['owner-maintenance-assignment',1024,8192]]);
});
test('closed forms cannot relabel task bootstrap frontier old owner or arbitrary kind',()=>{
 for(const [make,encode]of [[range,wire.encodeOriginMaintenanceDeliveryFrame],[seal,wire.encodeOriginFrontierSealDeliveryFrame],[owner,wire.encodeOwnerMaintenanceFreshDeliveryFrame]])for(const protocol of ['peer-task-context-v2','peer-bootstrap-membership-assignment-v1','peer-input-frontier-assignment-v1']){assert.throws(()=>encode(JSON.stringify({...make(),protocol})),{code:'ORIGIN_WIRE_PAYLOAD'});}
 assert.throws(()=>wire.encodeOriginMaintenanceDeliveryFrame(JSON.stringify({...range(),kind:'peer-origin-frontier-seal-review'})),{code:'ORIGIN_WIRE_PAYLOAD'});
 const old=owner();delete old.fresh_review_purpose;delete old.kind;assert.throws(()=>wire.encodeOwnerMaintenanceFreshDeliveryFrame(JSON.stringify(old)),{code:'ORIGIN_WIRE_PAYLOAD'});
 assert.throws(()=>wire.encodeOwnerMaintenanceFreshDeliveryFrame(JSON.stringify({...owner(),fresh_review_purpose:'old-purpose'})),{code:'ORIGIN_WIRE_PAYLOAD'});
});
test('escaped top-level duplicate selector cannot choose another original purpose',()=>{
 const text=JSON.stringify(range()).replace('"kind":"peer-origin-reconstruction"','"kind":"peer-origin-reconstruction","\\u006bind":"peer-origin-review"');assert.throws(()=>wire.encodeOriginMaintenanceDeliveryFrame(text),{code:'ORIGIN_WIRE_DUPLICATE'});
});
test('whole framed input capacity and malformed JSON cannot be bypassed by a compact checksum',()=>{
 assert.throws(()=>wire.encodeOriginMaintenanceDeliveryFrame(JSON.stringify({...range(),subject:{huge:'x'.repeat(65536)}})),{code:'ORIGIN_WIRE_PAYLOAD'});
 for(const text of ['{} trailing','{"protocol":','[]','{"a":1,}','{"a":[1,]}'])assert.throws(()=>wire.encodeOriginMaintenanceDeliveryFrame(text));
});
test('preflight requires the genuinely selected original interpreter and copied plans cannot join',()=>{
 for(const call of [()=>wire.preflightOriginalOriginMaintenanceContext(JSON.stringify(range())),()=>wire.preflightOriginalOriginFrontierSealContext(JSON.stringify(seal())),()=>wire.preflightOriginalOwnerMaintenanceFreshContext(JSON.stringify(owner()))])assert.throws(call,isOriginalContextInterpreterUnavailable);
 for(const inspect of [wire.inspectOriginalOriginMaintenancePreflight,wire.inspectOriginalOriginFrontierSealPreflight,wire.inspectOriginalOwnerMaintenanceFreshPreflight])assert.throws(()=>inspect({}),{code:'ORIGIN_WIRE_ORIGINAL_PLAN_REQUIRED'});
});

test('new original selectors preserve provider and deployment-drift exception identity rather than relabeling absence',async t=>{
 // Exact production slot BODY; only its loader predecessor is SYNTHETIC.
 // No build, selected deployment, private interpreter or runtime is issued.
 const [{default:os},{default:path},{fileURLToPath,pathToFileURL}]=await Promise.all([import('node:os'),import('node:path'),import('node:url')]);
 const file=fileURLToPath(new URL('../plugins/soloco/runtime/peers/protected-source-build-slot.mjs',import.meta.url)),directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-origin-selector-source-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const loader=path.join(directory,'SYNTHETIC-loader.mjs');
 fs.writeFileSync(loader,"let failure;const unavailable=new WeakSet();export function setFailure(error){failure=error;}export function originalMissing(){const error=Object.assign(Error('SYNTHETIC original absence'),{code:'COMPONENT_DEPLOYMENT_NOT_LOADED'});unavailable.add(error);return error;}export function inspectOriginalLoadedPeerBridge(){throw failure;}export function isOriginalLoadedPeerBridgeUnavailable(error){return unavailable.has(error);}\n");
 const original=fs.readFileSync(file,'utf8');let predecessor=0;
 const relocated=original.replace(/from '(\.\/[^']+)'/g,(_all,name)=>{if(name==='./context-component-deployment.mjs'){predecessor++;return 'from '+JSON.stringify(pathToFileURL(loader).href);}return 'from '+JSON.stringify(new URL(name,pathToFileURL(file)).href);});assert.equal(predecessor,1);assert.equal(relocated.split('\n').filter(l=>!l.startsWith('import ')).join('\n'),original.split('\n').filter(l=>!l.startsWith('import ')).join('\n'));
 const copy=path.join(directory,'slots.mjs');fs.writeFileSync(copy,relocated);const slots=await import(pathToFileURL(copy).href),source=await import(pathToFileURL(loader).href),member=Error('SYNTHETIC provider member'),cause=Error('SYNTHETIC provider cause');
 for(const error of [Object.assign(Error('SYNTHETIC drift'),{code:'COMPONENT_DEPLOYMENT_CHANGED'}),Object.assign(new AggregateError([member],'SYNTHETIC provider',{cause}),{code:'COMPONENT_DEPLOYMENT_NOT_LOADED'})]){
  source.setFailure(error);for(const resolve of [slots.resolveOriginalOriginMaintenanceInterpreter,slots.resolveOriginalOriginFinalReviewInterpreter])assert.throws(resolve,caught=>{assert.equal(caught,error);assert.equal(slots.isOriginalContextInterpreterUnavailable(caught),false);return true;});
 }
 source.setFailure(source.originalMissing());for(const resolve of [slots.resolveOriginalOriginMaintenanceInterpreter,slots.resolveOriginalOriginFinalReviewInterpreter])assert.throws(resolve,slots.isOriginalContextInterpreterUnavailable);
});
