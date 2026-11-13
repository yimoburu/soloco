//! Actual returned protected response -> logical SSE payload -> typed item.
//! No Deserialize, caller verdict, global registry, or remote-closure claim.
use super::{SourceStep, hold, MAX_BODY};
use super::original_ingress::OriginalResponseAuthority;
use codex_client::{StreamResponse, TransportError};
use codex_protocol::{ResponseItemId, models::ResponseItem};
use serde::Deserialize;
use serde_json::{Value, value::RawValue};
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};

type CoreOwner = dyn std::any::Any + Send + Sync;

pub(crate) struct OriginalStreamResponse {
    pub(crate) response: StreamResponse,
    pub(crate) original: Option<OriginalResponseDecoder>,
}
impl crate::telemetry::WithStatus for OriginalStreamResponse {
    fn status(&self) -> http::StatusCode { self.response.status }
}

struct ResponseSource {
    authority: OriginalResponseAuthority,
    startup:super::original_native_decoder::OriginalStartupIdentity,
    request_id: String,
    request_sha256: String,
    offered: Value,
    terminal: Mutex<ResponseTerminal>,
}
#[derive(Default)]
struct ResponseTerminal {
    completed: Option<String>,
    local_eof: bool,
    unknown: bool,
    interrupted:bool,terminal_payload:Option<Arc<[u8]>>,
}

/// Only protected_peer::stream constructs this after the concrete gateway returns.
/// A public/synthetic SSE parser never receives this authority.
pub(crate) struct OriginalResponseDecoder {
    source: Arc<ResponseSource>,
    ordinal: u64,
    retained_bytes: usize,
}
impl OriginalResponseDecoder {
    pub(super) fn returned(step: &SourceStep, body: &[u8], startup:super::original_native_decoder::OriginalStartupIdentity) -> Result<Self, TransportError> {
        let provenance = step.provenance.as_ref().ok_or_else(||hold("response missing original request provenance"))?;
        let projection = provenance.session_projection.as_ref().ok_or_else(||hold("response missing original Session"))?;
        let authority = projection.response_authority(&step.runtime)?;
        let body_value: Value = serde_json::from_slice(body).map_err(|_|hold("response original request JSON"))?;
        let offered = super::validated_offered_inventory(body_value.as_object().ok_or_else(||hold("response original request object"))?)?;
        Ok(Self { source: Arc::new(ResponseSource {
            authority, startup, request_id: step.request_id.clone(), request_sha256: super::hash(body), offered,
            terminal: Mutex::new(ResponseTerminal::default()),
        }), ordinal: 0, retained_bytes: 0 })
    }
    pub(crate) fn observe_payload(&mut self, data: &str) -> Option<u64> {
        self.ordinal = match self.ordinal.checked_add(1) { Some(n)=>n, None=>{self.unknown();return None;} };
        self.retained_bytes = match self.retained_bytes.checked_add(data.len()) { Some(n) if n<=MAX_BODY=>n, _=>{self.unknown();return None;} };
        Some(self.ordinal)
    }
    pub(crate) fn done(&self, data: &str, ordinal: u64, item: ResponseItem) -> Option<OriginalResponseItem> {
        #[derive(Deserialize)]
        struct Done<'a> { #[serde(rename="type")] kind: &'a str, #[serde(borrow)] item: &'a RawValue }
        let raw: Done<'_> = serde_json::from_str(data).ok()?;
        if raw.kind!="response.output_item.done" { return None; }
        let typed: ResponseItem = serde_json::from_str(raw.item.get()).ok()?;
        if !matches!(&typed,ResponseItem::Message{role,..} if role=="assistant")
            && !matches!(&typed,ResponseItem::Reasoning{..}|ResponseItem::FunctionCall{..}) {self.unknown();return None;}
        let materialized = serde_json::to_vec(&typed).ok()?;
        if materialized != serde_json::to_vec(&item).ok()? || materialized.len()>MAX_BODY { return None; }
        Some(OriginalResponseItem {
            item, source: Arc::clone(&self.source), ordinal, raw_payload: Arc::from(data.as_bytes()),
            raw_item: Arc::from(raw.item.get().as_bytes()), materialized: materialized.into(),
            original_materialized: serde_json::to_vec(&typed).ok()?.into(),
            missing_id_assigned: false, claimed: Arc::new(AtomicBool::new(false)), invalidated:Arc::new(AtomicBool::new(false)),
        })
    }
    pub(crate) fn observe_terminal(&self,data:&str,kind:&str) {
        if let Ok(mut terminal)=self.source.terminal.lock() {
            if terminal.terminal_payload.is_some(){terminal.unknown=true;}
            if data.len()<=MAX_BODY {terminal.terminal_payload=Some(Arc::from(data.as_bytes()));}else{terminal.unknown=true;}
            terminal.interrupted=kind=="response.incomplete";
            if kind!="response.completed" {terminal.unknown=true;}
        }
    }
    pub(crate) fn completed(&self, response_id: &str) {
        if let Ok(mut terminal)=self.source.terminal.lock() {
            if terminal.completed.replace(response_id.to_string()).is_some() {terminal.unknown=true;}
        }
    }
    pub(crate) fn local_eof(&self) { if let Ok(mut terminal)=self.source.terminal.lock(){terminal.local_eof=true;} }
    pub(crate) fn unknown(&self) { if let Ok(mut terminal)=self.source.terminal.lock(){terminal.unknown=true;} }
}
impl Drop for OriginalResponseDecoder {
    fn drop(&mut self) {
        if let Ok(mut terminal)=self.source.terminal.lock() {
            if terminal.completed.is_none() || !terminal.local_eof {terminal.unknown=true;}
        }
    }
}

/// An original done item, before and after the narrow missing-ID assignment.
/// Clones share one materialization claim. Raw payload and raw item differ from
/// typed JSON and never substitute for HTTP/SSE framing or model comprehension.
#[derive(Clone)]
pub struct OriginalResponseItem {
    item: ResponseItem,
    source: Arc<ResponseSource>,
    ordinal: u64,
    raw_payload: Arc<[u8]>,
    raw_item: Arc<[u8]>,
    original_materialized: Arc<[u8]>,
    materialized: Arc<[u8]>,
    missing_id_assigned: bool,
    claimed: Arc<AtomicBool>,
    invalidated:Arc<AtomicBool>,
}
impl std::fmt::Debug for OriginalResponseItem {
    fn fmt(&self,f:&mut std::fmt::Formatter<'_>)->std::fmt::Result {
        f.debug_struct("OriginalResponseItem").field("ordinal",&self.ordinal).finish_non_exhaustive()
    }
}
impl OriginalResponseItem {
    pub(super) fn matches_startup(&self,identity:&super::original_native_decoder::OriginalStartupIdentity)->bool {&self.source.startup==identity}
    pub fn item(&self)->&ResponseItem {&self.item}
    pub fn materialized_bytes(&self)->&[u8] {&self.materialized}
    pub(super) fn accepts_history_stamp(&self,after:&ResponseItem)->bool {
        let mut expected=self.item.clone();
        if let Some(turn)=after.turn_id(){expected.set_turn_id_if_missing(turn);}
        // Original model receipts admit only assistant/Reasoning/FunctionCall;
        // the protocol creation-time setter is a no-op for these variants.
        if expected.id().is_none_or(|id|id.is_empty()){expected.set_id(after.id().cloned());}
        serde_json::to_vec(&expected).ok()==serde_json::to_vec(after).ok()
    }
    /// Only a missing structural ID can change; content/call_id/arguments cannot.
    pub fn assign_missing_id(&mut self,id:Option<ResponseItemId>) {
        if self.item.id().is_none_or(|id|id.is_empty()) && !self.missing_id_assigned {
            self.item.set_id(id);
            if let Ok(bytes)=serde_json::to_vec(&self.item) {self.materialized=bytes.into();self.missing_id_assigned=true;}
            else if let Ok(mut terminal)=self.source.terminal.lock(){terminal.unknown=true;}
        }
    }
    pub fn claim_for_original_core(&self,owner:&Arc<CoreOwner>)->bool {
        self.source.authority.matches_core(owner)
            && !self.claimed.swap(true,Ordering::SeqCst)
    }
    pub(super) fn authority(&self)->&OriginalResponseAuthority {&self.source.authority}
    pub fn revoke_unsupported_transform(&self) {self.invalidated.store(true,Ordering::SeqCst);}
    pub fn complete_original_response(&self)->bool {
        !self.invalidated.load(Ordering::SeqCst) && self.source.terminal.lock().is_ok_and(|t|t.completed.is_some()&&t.local_eof&&!t.unknown)
    }
    pub fn matches_fixed_call(&self,call_id:&str,namespace:Option<&str>,name:&str,arguments:&str,resolved_spec:&Value)->bool {
        if namespace.is_some_and(|n|n!=codex_protocol::DEFAULT_FUNCTION_NAMESPACE) {return false;}
        let ResponseItem::FunctionCall {call_id:original_call,name:original_name,arguments:original_arguments,namespace:original_namespace,..}=&self.item else{return false;};
        original_call==call_id && original_name==name && original_arguments==arguments
            && original_namespace.as_deref().is_none_or(|n|n==codex_protocol::DEFAULT_FUNCTION_NAMESPACE)
            && self.source.offered.as_array().is_some_and(|tools|tools.iter().any(|tool|tool==resolved_spec))
            && resolved_spec.get("name").and_then(Value::as_str)==Some(name)
    }
    pub fn source_facts(&self)->Value {
        let terminal=self.source.terminal.lock().ok();
        serde_json::json!({"kind":"original_protected_response_done","request_id":self.source.request_id,
            "original_request_sha256":self.source.request_sha256,"event_ordinal":self.ordinal,
            "logical_sse_payload_sha256":super::hash(&self.raw_payload),"logical_sse_payload_bytes":self.raw_payload.len(),
            "raw_item_json_sha256":super::hash(&self.raw_item),"raw_item_json_bytes":self.raw_item.len(),
            "typed_before_ids_sha256":super::hash(&self.original_materialized),"typed_after_ids_sha256":super::hash(&self.materialized),
            "missing_structural_id_assigned":self.missing_id_assigned,
            "response_completed_id":terminal.as_ref().and_then(|t|t.completed.as_deref()),
            "local_body_eof_observed":terminal.as_ref().is_some_and(|t|t.local_eof),
            "unknown":terminal.as_ref().is_none_or(|t|t.unknown),"interrupted":terminal.as_ref().is_some_and(|t|t.interrupted),
            "terminal_logical_payload_sha256":terminal.as_ref().and_then(|t|t.terminal_payload.as_deref()).map(super::hash),"remote_domain_closed":false,
            "scope":"logical SSE payload and source-owned typed transforms; no exact HTTP framing or semantic understanding"})
    }
}

#[cfg(test)]
#[path="original_history_tests.rs"]
mod tests;
