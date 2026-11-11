//! Concrete Core-owned live model/dynamic-return ancestry. Runtime capsules
//! are attached to original envelopes, not a second authority registry.
use crate::session::{OriginalSessionOwner, session::Session};
use crate::tools::context::{FunctionToolOutput,ToolInvocation,ToolPayload,ToolOutput};
use codex_api::protected_peer::{OriginalResponseItem,OriginalLiveInputWitness};
use codex_history::{OriginalProducerWitness,OriginalItemReceipt,ResponseItemEnvelope};
use codex_protocol::dynamic_tools::original_exchange::{OriginalDynamicExchange,OriginalDynamicReturn};
use codex_protocol::models::{ResponseItem,ResponseInputItem};
use serde_json::Value;
use std::sync::{Arc,Weak,OnceLock,atomic::{AtomicBool,AtomicU64,Ordering}};

type Owner=dyn std::any::Any+Send+Sync;
fn owner(session:&Session)->Arc<Owner> {session.original_provenance_owner().clone()}

enum Origin {
    Model(OriginalResponseItem),
    Dynamic {model:Arc<LiveOrigin>,returned:OriginalDynamicReturn,resolved_spec:Arc<Value>,native_arguments:Arc<[u8]>},
}
struct LiveOrigin {
    owner:Weak<OriginalSessionOwner>, expected:Arc<[u8]>, kind:Origin,
    occurrence:AtomicU64, unsupported_hook:AtomicBool,
    bookkeeping:OnceLock<Arc<[u8]>>,prepared:OnceLock<Arc<[u8]>>,
}
impl LiveOrigin {
    fn expected_bytes(&self)->&[u8] {
        self.prepared.get().or_else(||self.bookkeeping.get()).map(|v|v.as_ref()).unwrap_or(&self.expected)
    }
    fn model(&self)->&OriginalResponseItem {match &self.kind {Origin::Model(model)=>model,Origin::Dynamic{model,..}=>model.model()}}
    fn original(&self,session:&Session,receipt:&OriginalItemReceipt,require_complete:bool)->bool {
        if !self.owner.upgrade().is_some_and(|actual|Arc::ptr_eq(&actual,session.original_provenance_owner()))
            || self.unsupported_hook.load(Ordering::SeqCst)
            || receipt.original_read().is_some() || receipt.original_user_input_bytes().is_some()
            || receipt.original_materialized_bytes()!=self.expected_bytes()
            || receipt.projected_bytes()!=self.expected_bytes()
            || require_complete&&!self.model().complete_original_response() {return false;}
        match self.occurrence.compare_exchange(0,receipt.occurrence(),Ordering::SeqCst,Ordering::SeqCst) {
            Ok(_)=>{},Err(actual) if actual==receipt.occurrence()=>{},_=>return false,
        }
        match &self.kind {
            Origin::Model(_)=>true,
            Origin::Dynamic{model,returned,..}=>!model.unsupported_hook.load(Ordering::SeqCst)
                && returned.still_original(&owner(session))
                && returned.witness::<codex_api::protected_peer::OriginalNativeDynamicReturn>()
                    .is_some_and(|proof|proof.matches_original(model.model(),returned.exchange())),
        }
    }
    fn facts(&self)->Value {let source=match &self.kind {
        Origin::Model(model)=>model.source_facts(),
        Origin::Dynamic{model,returned,resolved_spec,native_arguments}=>serde_json::json!({
            "kind":"original_fixed_five_dynamic_return","model_source":model.model().source_facts(),
            "actual_resolved_declaration":resolved_spec.as_ref(),
            "actual_typed_native_request_arguments_sha256":codex_api::protected_peer::source_bytes_sha256(native_arguments),
            "native_decoder":returned.witness::<codex_api::protected_peer::OriginalNativeDynamicReturn>().map(|proof|proof.source_facts()),
            "model_visible_item_sha256":codex_api::protected_peer::source_bytes_sha256(self.expected_bytes()),
            "scope":"actual native request/return and mechanical output conversion only",
            "external_effects":"not proved; may be partial, adverse or unknown",
            "remote_domain_closed":false,"rollback_or_refund":false}),
    };serde_json::json!({"source":source,"initial_model_visible_sha256":codex_api::protected_peer::source_bytes_sha256(&self.expected),
        "native_bookkeeping_after_sha256":self.bookkeeping.get().map(|b|codex_api::protected_peer::source_bytes_sha256(b)),
        "native_history_preparation_after_sha256":self.prepared.get().map(|b|codex_api::protected_peer::source_bytes_sha256(b))})}
}

pub(crate) fn attach_model(session:&Session,envelope:&mut ResponseItemEnvelope,model:Option<OriginalResponseItem>) {
    let Some(model)=model else{return;};
    let Ok(bytes)=serde_json::to_vec(&envelope.item) else{return;};
    if bytes.as_slice()!=model.materialized_bytes() || !model.claim_for_original_core(&owner(session)) {return;}
    let origin=LiveOrigin {owner:Arc::downgrade(session.original_provenance_owner()),expected:bytes.into(),
        kind:Origin::Model(model),occurrence:AtomicU64::new(0),unsupported_hook:AtomicBool::new(false),bookkeeping:OnceLock::new(),prepared:OnceLock::new()};
    envelope.metadata.get_or_insert_default().original_live_history=Some(OriginalProducerWitness::new(Arc::new(LiveOriginHolder(Arc::new(origin)))));
}

pub(crate) fn bind_materialization(session:&Session,envelope:&ResponseItemEnvelope,receipt:&OriginalItemReceipt,
    ingress:&codex_api::protected_peer::OriginalSessionIngress)->Option<OriginalLiveInputWitness> {
    let origin=clone_live_origin(envelope.metadata.as_ref()?.original_live_history.as_ref()?)?;
    if !origin.original(session,receipt,true) {return None;}
    ingress.bind_original_live_materialization(receipt,owner(session),origin.model().clone(),origin.facts(),origin.expected_bytes(),
        match &origin.kind{Origin::Dynamic{returned,..}=>Some(returned.clone()),Origin::Model(_)=>None})
}

pub(crate) struct DynamicInvocation {
    model:Arc<LiveOrigin>, exchange:OriginalDynamicExchange, resolved_spec:Arc<Value>,
    call_id:String, payload:ToolPayload,native_arguments:Option<Arc<[u8]>>,
}
impl DynamicInvocation {
    pub(crate) fn observe_actual_arguments(&mut self,arguments:&Value) {
        self.native_arguments=serde_json::to_vec(arguments).ok().filter(|b|b.len()<=4_000_000).map(Arc::from);
    }
    pub(crate) fn exchange(&self)->OriginalDynamicExchange {self.exchange.clone()}
    pub(crate) fn finish(self,session:&Session,response:&codex_protocol::dynamic_tools::DynamicToolResponse,
        output:FunctionToolOutput)->Option<OriginalDynamicOutput> {
        let native_arguments=self.native_arguments?;
        let returned=self.exchange.claim_return(&owner(session),response)?;
        if !returned.witness::<codex_api::protected_peer::OriginalNativeDynamicReturn>()?
            .matches_original(self.model.model(),returned.exchange()){return None;}
        let item:ResponseItem=output.to_response_item(&self.call_id,&self.payload).into();
        let expected=serde_json::to_vec(&item).ok()?;
        Some(OriginalDynamicOutput {output,origin:Arc::new(LiveOrigin {
            owner:Arc::downgrade(session.original_provenance_owner()),expected:expected.into(),
            kind:Origin::Dynamic{model:self.model,returned,resolved_spec:self.resolved_spec,native_arguments},
            occurrence:AtomicU64::new(0),unsupported_hook:AtomicBool::new(false),bookkeeping:OnceLock::new(),prepared:OnceLock::new(),
        })})
    }
}

pub(crate) async fn original_dynamic_invocation(invocation:&ToolInvocation,resolved_spec:Value)->Option<DynamicInvocation> {
    if !crate::protected_peer_enabled() || !matches!(invocation.source,crate::tools::context::ToolCallSource::Direct) {return None;}
    let native=invocation.native_call.as_ref()?;
    let expected=serde_json::to_vec(native.as_ref()).ok()?;
    let ToolPayload::Function{arguments}=&invocation.payload else{return None;};
    let history=invocation.session.clone_history().await;
    let mut found=None;
    for envelope in history.annotated_items() {
        let Some(capsule)=envelope.metadata.as_ref().and_then(|m|m.original_live_history.as_ref()) else{continue;};
        let Some(original)=clone_live_origin(capsule) else{continue;};
        if !matches!(&original.kind,Origin::Model(_))||serde_json::to_vec(original.model().item()).ok()?.as_slice()!=expected.as_slice(){continue;}
        let receipt=envelope.metadata.as_ref()?.original_item_receipt.as_ref()?;
        if !matches!(&original.kind,Origin::Model(_)) || !original.original(&invocation.session,receipt,false)
            || !original.model().matches_fixed_call(&invocation.call_id,invocation.tool_name.namespace.as_deref(),
                &invocation.tool_name.name,arguments,&resolved_spec) {return None;}
        // Keep this private capsule, not a reconstructed facts object. The carrier
        // clone downcasts to an Arc holder below without exposing a public maker.
        let model=clone_live_origin(capsule)?;
        if found.is_some(){return None;}
        found=Some(model);
    }
    let model=found?;
    Some(DynamicInvocation {model,exchange:OriginalDynamicExchange::for_original_invocation(owner(&invocation.session)),
        resolved_spec:Arc::new(resolved_spec),call_id:invocation.call_id.clone(),payload:invocation.payload.clone(),native_arguments:None})
}

// OriginalProducerWitness transports an Arc<T> internally; downcast gives &T.
// Capture a private Arc holder so the concrete producer can share its exact capsule.
fn clone_live_origin(capsule:&OriginalProducerWitness)->Option<Arc<LiveOrigin>> {
    capsule.downcast_ref::<LiveOriginHolder>().map(|holder|holder.0.clone())
}
struct LiveOriginHolder(Arc<LiveOrigin>);

pub(crate) struct OriginalDynamicOutput {output:FunctionToolOutput,origin:Arc<LiveOrigin>}
impl ToolOutput for OriginalDynamicOutput {
    fn log_output(&self)->String {self.output.log_output()}
    fn success_for_logging(&self)->bool {self.output.success_for_logging()}
    fn to_response_item(&self,call_id:&str,payload:&ToolPayload)->ResponseInputItem {self.output.to_response_item(call_id,payload)}
    fn original_history_witness(&self)->Option<&(dyn std::any::Any+Send+Sync)> {Some(self)}
}
pub(crate) fn attach_dynamic(envelope:&mut ResponseItemEnvelope,output:&dyn ToolOutput) {
    let Some(output)=output.original_history_witness().and_then(|proof|proof.downcast_ref::<OriginalDynamicOutput>()) else{return;};
    if serde_json::to_vec(&envelope.item).is_ok_and(|bytes|bytes.as_slice()==output.origin.expected_bytes()) {
        envelope.metadata.get_or_insert_default().original_live_history=Some(OriginalProducerWitness::new(Arc::new(LiveOriginHolder(output.origin.clone()))));
    }
}

/// Called only at actual hook selection/execution seams. A hook observation
/// invalidates eligibility; absence of this marker never creates a source receipt.
pub(crate) async fn observed_unsupported_hook(session:&Session,call_id:&str) {
    let history=session.clone_history().await;
    for envelope in history.annotated_items() {
        if !matches!(&envelope.item,ResponseItem::FunctionCall{call_id:actual,..} if actual==call_id) {continue;}
        if let Some(origin)=envelope.metadata.as_ref().and_then(|m|m.original_live_history.as_ref()).and_then(clone_live_origin) {
            if origin.owner.upgrade().is_some_and(|owner|Arc::ptr_eq(&owner,session.original_provenance_owner())) {
                origin.unsupported_hook.store(true,Ordering::SeqCst);
                origin.model().revoke_unsupported_transform();
            }
        }
    }
}

/// Source-owned direct-call accounting may add a structural ID and native
/// attribution metadata, but never alter call_id/name/namespace/output bytes.
pub(crate) fn observe_output_bookkeeping(before:&ResponseItem,envelope:&ResponseItemEnvelope) {
    let Some(origin)=envelope.metadata.as_ref().and_then(|m|m.original_live_history.as_ref()).and_then(clone_live_origin) else{return;};
    if !matches!(&origin.kind,Origin::Dynamic{..}){return;}
    let (Ok(before_bytes),Ok(after_bytes))=(serde_json::to_vec(before),serde_json::to_vec(&envelope.item)) else{origin.model().revoke_unsupported_transform();return;};
    let mut left=serde_json::to_value(before).ok();let mut right=serde_json::to_value(&envelope.item).ok();
    for value in [&mut left,&mut right] {
        if let Some(object)=value.as_mut().and_then(Value::as_object_mut){object.remove("id");object.remove("internal_chat_message_metadata_passthrough");}
    }
    if before_bytes.as_slice()!=origin.expected_bytes()||left.is_none()||left!=right||origin.prepared.get().is_some()
        ||origin.bookkeeping.set(after_bytes.into()).is_err(){origin.model().revoke_unsupported_transform();}
}
/// Observe the genuine one-to-one native history preparation. Reconstruct only
/// its structural ID/turn/time stamps. Changed media or other content remains Held.
pub(crate) fn observe_history_preparation(before:&ResponseItemEnvelope,after:&ResponseItemEnvelope,turn_id:&str) {
    let Some(origin)=before.metadata.as_ref().and_then(|m|m.original_live_history.as_ref()).and_then(clone_live_origin) else{return;};
    let mut expected=before.item.clone();
    expected.set_turn_id_if_missing(turn_id);
    // Only the supported concrete tool-return variant receives a native
    // creation-time stamp. Read its public typed field, not protocol's private getter.
    if let ResponseItem::FunctionCallOutput {internal_chat_message_metadata_passthrough:Some(metadata),..}=&after.item {
        if let Some(time)=metadata.create_time.clone(){expected.set_create_time_if_missing(time);}
    }
    if expected.id().is_none_or(|id|id.is_empty()){expected.set_id(after.item.id().cloned());}
    let (Ok(before_bytes),Ok(expected_bytes),Ok(after_bytes))=(serde_json::to_vec(&before.item),serde_json::to_vec(&expected),serde_json::to_vec(&after.item)) else{origin.model().revoke_unsupported_transform();return;};
    if before_bytes.as_slice()!=origin.expected_bytes()||expected_bytes!=after_bytes||origin.prepared.set(after_bytes.into()).is_err(){origin.model().revoke_unsupported_transform();}
}

#[cfg(test)]
#[path="original_live_history_tests.rs"]
mod tests;

/// Mechanical wire grammar only, never a producer witness or origin verdict.
/// The caller must still obtain every non-user span's original live capsule.
pub(crate) fn supported_wire_item(item:&ResponseItem)->bool {
    use codex_protocol::models::{ContentItem,FunctionCallOutputBody,FunctionCallOutputContentItem};
    match item {
        ResponseItem::Message{role,content,..} if matches!(role.as_str(),"user"|"developer"|"system")=>
            content.iter().all(|part|matches!(part,ContentItem::InputText{..})),
        ResponseItem::Message{role,content,..} if role=="assistant"=>
            content.iter().all(|part|matches!(part,ContentItem::OutputText{..})),
        ResponseItem::Reasoning{..}|ResponseItem::FunctionCall{..}=>true,
        ResponseItem::FunctionCallOutput{output,..}=>match &output.body {
            FunctionCallOutputBody::Text(_)=>true,
            FunctionCallOutputBody::ContentItems(items)=>items.iter().all(|part|matches!(part,FunctionCallOutputContentItem::InputText{..})),
        },
        _=>false,
    }
}
