//! Source-owned protected Responses producer for the exact c407 source candidate.
//! A frame describes an observation, never qualification of this executable or its owner.
//! Only the original inherited supervisor pipes can return a one-use send permit.
use codex_client::{HttpTransport, Request, Response, ReqwestTransport, StreamResponse, TransportError};
use futures::StreamExt;
use http::Method;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use uuid::Uuid;

mod context_contract;
pub use context_contract::validate_original_context_source_request;
mod startup;
mod original_ingress;
pub(crate) mod original_history;
mod original_native_decoder;
pub use original_native_decoder::{OriginalNativeDecoderIssuer,OriginalNativeDynamicReturn,OriginalNativeClientReturn};
pub use startup::mint_original_native_decoder;
pub use original_history::OriginalResponseItem;
pub use original_ingress::OriginalLiveInputWitness;
pub use original_ingress::{OriginalAcceptedInputWitness, OriginalGeneratedInputWitness, OriginalSessionIngress, OriginalSessionInputProjection};
#[cfg(test)]
mod source_gate_tests;
#[cfg(test)]
mod original_capture_tests;
pub use startup::{NativeStartup, OriginalBootstrapClaim, begin_original_companion, observe_original_bootstrap, observe_original_context_contract};

const PROTOCOL: &str = "soloco-protected-backend-permit-v2";
const COMMIT: &str = "c40729ea5cf8e947481b130c59807273eda2f8e9";
const MAX_FRAME: usize = 100_000;
const MAX_BODY: usize = 4_000_000;
static NEXT_RUNTIME: AtomicU64 = AtomicU64::new(1);
static UNKNOWN: AtomicBool = AtomicBool::new(false);
struct OperationGuard<'a> { armed: bool, unknown: &'a AtomicBool }
impl Drop for OperationGuard<'_> {
    fn drop(&mut self) { if self.armed { self.unknown.store(true, Ordering::SeqCst); } }
}
async fn lock_original_known<'a,T>(mutex: &'a tokio::sync::Mutex<T>, unknown: &AtomicBool)
    -> Result<tokio::sync::MutexGuard<'a,T>,TransportError> {
    let guard=mutex.lock().await;ensure_known(unknown)?;Ok(guard)
}
async fn await_original_known<F: std::future::Future>(unknown: &AtomicBool, wait: F) -> Result<F::Output,TransportError> {
    let result=wait.await;ensure_known(unknown)?;Ok(result)
}
fn ensure_known(unknown: &AtomicBool) -> Result<(), TransportError> {
    if unknown.load(Ordering::SeqCst) { Err(hold("unknown prior operation/cancellation")) } else { Ok(()) }
}

/// A compile-time control selection, NOT a runtime/source-build qualification.
pub fn enabled() -> bool {
    option_env!("SOLOCO_PROTECTED_HOST_BUILD") == Some("1")
}

fn hold(reason: &str) -> TransportError {
    TransportError::Build(format!("protected peer HOLD: {reason}"))
}
pub fn source_bytes_sha256(bytes: &[u8]) -> String { hash(bytes) }

#[derive(Debug, Clone, Serialize)]
pub struct SourceProvenance {
    original_sampling_input_sha256: String, sources: Value, unknown_origins: Vec<String>,
    #[serde(skip)]
    session_projection: Option<OriginalSessionInputProjection>,
}
impl SourceProvenance {
    pub fn from_original_loaders(original_sampling_input_sha256: String, sources: Value, unknown_origins: Vec<String>) -> Self {
        let mut unknown_origins=unknown_origins;
        for missing in ["input_message_to_rendered_source_spans_not_retained", "restored_history_instruction_origins_not_retained"] {
            if !unknown_origins.iter().any(|item|item==missing) { unknown_origins.push(missing.into()); }
        }
        Self { original_sampling_input_sha256, sources, unknown_origins, session_projection: None }
    }

    /// Records a typed runtime-only materialization cut. Serialized receipt
    /// JSON is never restored as a capability. Public cross-crate materializers
    /// do not establish the original accepting Session, which remains Held.
    pub fn from_original_input_capture(capture: &codex_history::OriginalInputCapture,
        sources: Value, unknown_origins: Vec<String>) -> Self {
        Self::from_input_capture(capture, None, sources, unknown_origins)
    }

    /// Consumes an opaque projection produced by the original Session ingress.
    /// The final actual ModelClient runtime and prepared input are checked again
    /// at observation and under the original send fence after the permit wait.
    pub fn from_original_session_input_capture(capture: &codex_history::OriginalInputCapture,
        projection: OriginalSessionInputProjection, sources: Value, unknown_origins: Vec<String>) -> Self {
        Self::from_input_capture(capture, Some(projection), sources, unknown_origins)
    }

    fn from_input_capture(capture: &codex_history::OriginalInputCapture,
        projection: Option<OriginalSessionInputProjection>, mut sources: Value, mut unknown_origins: Vec<String>) -> Self {
        let session_projection = projection.filter(|projection| projection.matches_capture(capture));
        let ingress_bound = session_projection.is_some();
        let generated = |index|session_projection.as_ref().is_some_and(|projection|projection.covers_generated(index));
        let user_chain_unknown = capture.spans().iter().any(|span|span.user() && !generated(span.index())
            && span.receipt().is_some_and(|receipt|receipt.original_read().is_none()
                && receipt.original_user_input_bytes().is_none()));
        let mut missing = |reason: &str| {
            if !unknown_origins.iter().any(|value| value == reason) {
                unknown_origins.push(reason.into());
            }
        };
        // The history crate can retain an exact typed materialization, but its
        // public cross-crate producer API cannot attest that the caller was the
        // original accepting Session/transport. Empty input and caller-created
        // typed receipts must not turn that absent ingress link into authority.
        if !ingress_bound { missing("original_accepted_session_transport_binding_not_retained"); }
        // Without that sealed ingress, a caller-created subset also cannot
        // attest the absence or complete ancestry of restored history.
        if !ingress_bound { missing("restored_history_instruction_origins_not_retained"); }
        let origin_chain_complete = ingress_bound && capture.complete()
            && !capture.spans().is_empty() && capture.spans().iter().all(|span|span.user() || generated(span.index()) || session_projection.as_ref().is_some_and(|p|p.covers_live(span.index())))
            && !user_chain_unknown && !capture.restored_upstream_chain_unknown()
            && !capture.spans().iter().any(|span|span.receipt().is_some_and(|receipt|
                receipt.original_materialized_bytes()!=receipt.projected_bytes()));
        if !origin_chain_complete {
            missing("input_message_to_rendered_source_spans_not_retained");
        }
        if !capture.complete() || capture.restored_upstream_chain_unknown() {
            missing("restored_history_instruction_origins_not_retained");
        }
        if user_chain_unknown {
            missing("input_message_original_user_input_chain_not_retained");
        }
        if capture.restored_upstream_chain_unknown() {
            missing("restored_history_upstream_original_chain_not_retained");
        }
        if capture.restored_instruction_ancestry_unknown() {
            missing("restored_history_instruction_origins_not_retained");
        }
        if capture.restored_thread_metadata_unknown() {
            missing("restored_history_thread_metadata_origin_not_retained");
        }
        // A real item/container observation is not an invented AGENTS/template
        // ancestry link. Current unsupported instruction renderers remain Held.
        if capture.spans().iter().any(|span| span.instruction() && !generated(span.index())) {
            missing("instruction_message_original_loader_chain_not_retained");
        }
        if capture.spans().iter().any(|span| !span.user() && !span.instruction() && !generated(span.index()) && !session_projection.as_ref().is_some_and(|p|p.covers_live(span.index()))) {
            missing("non_user_input_original_producer_chain_not_retained");
        }
        if capture.spans().iter().any(|span| span.receipt().is_some_and(|receipt|
            receipt.original_materialized_bytes() != receipt.projected_bytes())) {
            missing("input_projection_upstream_span_mapping_not_retained");
        }
        let spans = capture.spans().iter().map(|span| {
            let (start, end) = span.byte_range();
            let receipt = span.receipt().map(|receipt| {
                let read = receipt.original_read().map(|(path, line, bytes)| json!({
                    "path":path,"line":line,"original_line_utf8_payload_sha256":hash(bytes),
                    "original_line_utf8_payload_bytes":bytes.len(),
                    "scope":"captured line payload; original reader call-site is not a sealed capability; not a whole/compressed file hash",
                    "original_thread_metadata_line_sha256":receipt.original_thread_metadata_bytes().map(hash),
                    "original_thread_id":receipt.original_thread_id()}));
                json!({"occurrence":receipt.occurrence(),
                    "origin_kind":if read.is_some(){"original_rollout_read"}else if receipt.original_user_input_bytes().is_some(){"original_user_input_materialization"}else{"original_live_item_materialization"},
                    "original_typed_user_input_sha256":receipt.original_user_input_bytes().map(hash),
                    "original_typed_user_input_bytes":receipt.original_user_input_bytes().map(|bytes|bytes.len()),
                    "original_item_materialization_sha256":hash(receipt.original_materialized_bytes()),
                    "original_item_materialization_bytes":receipt.original_materialized_bytes().len(),
                    "original_prompt_projection_sha256":hash(receipt.projected_bytes()),
                    "original_prompt_projection_bytes":receipt.projected_bytes().len(),"original_read":read})
            });
            json!({"index":span.index(),"sampling_json_utf8_start":start,"sampling_json_utf8_end":end,
                "instruction":span.instruction(),"original_renderer_bound":generated(span.index()),"original_receipt":receipt})
        }).collect::<Vec<_>>();
        if let Some(object) = sources.as_object_mut() {
            object.insert("original_input_materialization".into(), json!({
                "complete_occurrence_and_span_coverage":capture.complete(),"complete_original_origin_chain":origin_chain_complete,
                "serialization":"original serde_json sampling-input array; UTF-8 byte offsets",
                "sampling_input_bytes":capture.serialized_input().len(),"spans":spans,
                "accepted_session_transport_binding":if ingress_bound {"opaque original Session/runtime issuer and current accepted occurrence"} else {"not retained by public cross-crate materializer API"},
                "original_session_revision":session_projection.as_ref().map(|projection|projection.revision()),
                "latest_accepted_order":session_projection.as_ref().map(|projection|projection.latest_order()),
                "original_generated_sources":session_projection.as_ref().map(|projection|projection.generated_source_facts()),
                "original_live_sources":session_projection.as_ref().map(|projection|projection.live_source_facts()),
                "array_separators":"canonical array delimiters/commas are structural bytes, not source text",
                "raw_file_or_wire_receipt":false}));
        } else {
            missing("original_source_record_shape_invalid");
        }
        Self { original_sampling_input_sha256:hash(capture.serialized_input()), sources, unknown_origins, session_projection }
    }
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn json_hash(value: &Value) -> Result<String, TransportError> {
    serde_json::to_vec(value).map(|v| hash(&v)).map_err(|_| hold("JSON encoding"))
}

#[derive(Debug, Default)]
struct Generations {
    profile: Option<String>, services: Option<String>, instructions: Option<String>,
    profile_generation: u64, services_generation: u64, instruction_generation: u64,
    next_step: u64,
}

/// Created by the original ModelClientState constructor, shared by its clones.
/// No constructor accepts proof flags, source labels, callbacks, or generations.
#[derive(Debug, Clone)]
pub struct SourceRuntime {
    generation: u64,
    state: Arc<Mutex<Generations>>,
    ingress_issuer: Arc<original_ingress::RuntimeIngressIssuer>,
}
impl Default for SourceRuntime {
    fn default() -> Self { Self::new() }
}
impl SourceRuntime {
    pub fn new() -> Self {
        Self { generation: NEXT_RUNTIME.fetch_add(1, Ordering::SeqCst), state: Arc::default(),
            ingress_issuer: Arc::new(original_ingress::RuntimeIngressIssuer::new()) }
    }
    /// Metadata is copied at the original core call site; it is not proof of auth ownership.
    pub fn step(&self, thread_id: String, turn_id: Option<String>, auth_owner: Option<u64>,
                auth_revision: Option<u64>, runtime_id: Option<String>, provenance: Option<Arc<SourceProvenance>>) -> SourceStep {
        SourceStep { runtime: self.clone(), thread_id, turn_id, auth_owner, auth_revision,
            runtime_id, provenance, request_id: Uuid::new_v4().to_string(), consumed: Arc::new(AtomicBool::new(false)) }
    }
}

#[derive(Debug, Clone)]
pub struct SourceStep {
    runtime: SourceRuntime, thread_id: String, turn_id: Option<String>,
    auth_owner: Option<u64>, auth_revision: Option<u64>, runtime_id: Option<String>, provenance: Option<Arc<SourceProvenance>>,
    request_id: String, consumed: Arc<AtomicBool>,
}
/// The original native transport object, not a caller callback or qualification label.
/// Its constructor accepts the real concrete transport, never an HttpTransport implementation.
pub struct ProtectedGatewayTransport { inner: ReqwestTransport, instance_id: String, auth: Option<codex_http_client::AuthSendLease>, auth_provider: Option<crate::SharedAuthProvider> }
pub fn bind_native_gateway(inner: ReqwestTransport, auth: Option<codex_http_client::AuthSendLease>,
    auth_provider: Option<crate::SharedAuthProvider>) -> ProtectedGatewayTransport {
    ProtectedGatewayTransport { inner, auth, auth_provider, instance_id: if enabled() { Uuid::new_v4().to_string() } else { String::new() } }
}
impl HttpTransport for ProtectedGatewayTransport {
    async fn execute(&self, request: Request) -> Result<Response, TransportError> {
        if enabled() { return Err(hold("native gateway non-Responses route")); }
        self.inner.execute(request).await
    }
    async fn stream(&self, request: Request) -> Result<StreamResponse, TransportError> {
        if enabled() { return Err(hold("native gateway requires original final-step cut")); }
        self.inner.stream(request).await
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Challenge {
    protocol: String, kind: String, nonce: String, pid: u32,
    upstream_url: String, slot_id: String, executable_sha256: String, source_manifest_sha256: String,
    state_root: String, cwd: String, original_home_sha256: Option<String>,
    #[serde(default)]
    context_contract: Option<context_contract::ContextContractRequest>,
    #[serde(default)]
    loopback_proxy_port: Option<u16>,
}
fn validate_challenge(challenge: &Challenge) -> Result<(), TransportError> {
    let url = url::Url::parse(&challenge.upstream_url).map_err(|_| hold("upstream URL"))?;
    let hash = |v: &str| v.len()==64 && v.bytes().all(|b| b.is_ascii_hexdigit());
    if challenge.protocol != PROTOCOL || challenge.kind != "challenge" || challenge.pid != std::process::id() ||
        !hash(&challenge.nonce) || !hash(&challenge.executable_sha256) || !hash(&challenge.source_manifest_sha256) ||
        challenge.slot_id.is_empty() || challenge.slot_id.len()>200 ||
        challenge.loopback_proxy_port == Some(0) ||
        challenge.loopback_proxy_port.is_some() && !challenge.nonce.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)) ||
        !std::path::Path::new(&challenge.state_root).is_absolute() || !std::path::Path::new(&challenge.cwd).is_absolute() ||
        url.scheme() != "https" || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() ||
        url.query().is_some() || url.fragment().is_some() || !url.path().ends_with("/responses") {
        return Err(hold("original v2 challenge binding"));
    }
    Ok(())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Permit {
    protocol: String, kind: String, nonce: String, pid: u32, sequence: u64,
    binding_sha256: String, request_sha256: String, request_id: String,
    gateway_instance_id: String,
}
#[derive(Serialize)]
struct FinalObservation<'a> {
    protocol: &'static str, kind: &'static str, nonce: &'a str, pid: u32, sequence: u64,
    source_commit: &'static str, producer_module_sha256: String, tool_resource_sha256: String,
    host_instance_id: &'a str,
    runtime_generation: u64, profile_generation: u64, services_generation: u64,
    instruction_generation: u64, thread_id: &'a str, turn_id: &'a str, step_id: u64,
    auth_owner_generation: u64, auth_revision: u64, auth_send_epoch: u64, runtime_id: &'a Option<String>,
    request_id: &'a str, gateway_instance_id: &'a str, method: &'a str, url: &'a str,
    request_sha256: String, request_bytes: usize, context_sha256: String,
    input_text_sha256s: Vec<String>,
    ordered_instructions: Vec<Value>, ordered_instructions_sha256: String,
    profile: Value, tools: Value, provenance: &'a Option<Arc<SourceProvenance>>,
}

fn generation(previous: &mut Option<String>, current: String, n: &mut u64) -> Result<(), TransportError> {
    if previous.as_ref() != Some(&current) {
        *n = n.checked_add(1).ok_or_else(|| hold("generation overflow"))?;
        *previous = Some(current);
    }
    Ok(())
}

/// Exact catalog equality follows the immutable original startup selection.
/// A request body cannot select bootstrap or an arbitrary ordinary subset.
fn validated_offered_inventory(root: &serde_json::Map<String, Value>) -> Result<Value, TransportError> {
    validated_selected_offered_inventory(root,context_contract::selected_original_tool_profile())
}
fn validated_selected_offered_inventory(root:&serde_json::Map<String,Value>,profile:context_contract::OriginalToolProfile)->Result<Value,TransportError> {
    let expected=profile.offered_inventory()?;
    let input = root.get("input").and_then(Value::as_array).ok_or_else(||hold("ordered input"))?;
    let additional: Vec<_> = input.iter().enumerate().filter(|(_,item)|
        item.get("type").and_then(Value::as_str)==Some("additional_tools")).collect();
    if let Some(tools) = root.get("tools") {
        if tools != &expected || !additional.is_empty() {
            return Err(hold("full original selected tool/schema equality or deferred offered inventory"));
        }
    } else {
        let [(index, item)] = additional.as_slice() else {
            return Err(hold("missing or duplicate original RLite offered inventory"));
        };
        if *index != 0 || item.get("role").and_then(Value::as_str)!=Some("developer") {
            return Err(hold("original RLite inventory must be the first developer prefix"));
        }
        let namespace = json!([{"type":"namespace", "name":codex_protocol::DEFAULT_FUNCTION_NAMESPACE,
            "description":"", "tools":expected.clone()}]);
        if item.get("tools") != Some(&namespace) {
            return Err(hold("full original RLite selected tool namespace/schema equality"));
        }
    }
    Ok(expected)
}

#[cfg(test)]
mod offered_inventory_tests {
    use super::*;
    fn ordinary() -> Value {
        json!({"input":[{"type":"message","role":"user","content":[]}],
            "tools":serde_json::from_str::<Value>(include_str!("protected_peer_responses_tools.json")).unwrap()})
    }
    fn rlite() -> Value {
        let expected = ordinary()["tools"].clone();
        json!({"input":[{"type":"additional_tools","id":"at_controlled_fixture","role":"developer",
            "tools":[{"type":"namespace","name":codex_protocol::DEFAULT_FUNCTION_NAMESPACE,"description":"","tools":expected}]},
            {"type":"message","role":"user","content":[]}]})
    }
    fn validate(value: &Value) -> Result<Value, TransportError> {
        validated_offered_inventory(value.as_object().unwrap())
    }
    #[test]
    fn ordinary_and_exact_rlite_namespace_report_only_the_canonical_five() {
        let expected = ordinary()["tools"].clone();
        assert_eq!(validate(&ordinary()).unwrap(), expected);
        assert_eq!(validate(&rlite()).unwrap(), expected);
    }
    #[test]
    fn ordinary_inventory_rejects_missing_extra_changed_schema_and_order() {
        let mut missing = ordinary(); missing["tools"].as_array_mut().unwrap().pop();
        let mut extra = ordinary(); extra["tools"].as_array_mut().unwrap().push(json!({"type":"function","name":"extra"}));
        let mut changed = ordinary(); changed["tools"][0]["strict"] = json!(true);
        let mut reordered = ordinary(); reordered["tools"].as_array_mut().unwrap().swap(0,1);
        let mut absent = ordinary(); absent.as_object_mut().unwrap().remove("tools");
        for value in [missing, extra, changed, reordered, absent] { assert!(validate(&value).is_err()); }
    }
    #[test]
    fn rlite_requires_root_tools_absent_and_exactly_one_first_developer_prefix() {
        let mut with_tools = rlite(); with_tools["tools"] = ordinary()["tools"].clone();
        let mut null_tools = rlite(); null_tools["tools"] = Value::Null;
        let mut misplaced = rlite(); misplaced["input"].as_array_mut().unwrap().swap(0,1);
        let mut duplicate = rlite(); let prefix = duplicate["input"][0].clone(); duplicate["input"].as_array_mut().unwrap().push(prefix);
        let mut wrong_role = rlite(); wrong_role["input"][0]["role"] = json!("user");
        let mut absent = rlite(); absent["input"].as_array_mut().unwrap().remove(0);
        for value in [with_tools,null_tools,misplaced,duplicate,wrong_role,absent] { assert!(validate(&value).is_err()); }
    }
    #[test]
    fn rlite_namespace_type_name_description_and_complete_schema_must_match() {
        let mut kind = rlite(); kind["input"][0]["tools"][0]["type"] = json!("function");
        let mut name = rlite(); name["input"][0]["tools"][0]["name"] = json!("foreign");
        let mut description = rlite(); description["input"][0]["tools"][0]["description"] = json!("changed");
        let mut schema = rlite(); schema["input"][0]["tools"][0]["tools"][1]["parameters"]["additionalProperties"] = json!(true);
        let mut strict = rlite(); strict["input"][0]["tools"][0]["tools"][0]["strict"] = json!(true);
        for value in [kind,name,description,schema,strict] { assert!(validate(&value).is_err()); }
    }
    #[test]
    fn rlite_rejects_missing_extra_reordered_tools_and_extra_namespaces() {
        let mut missing = rlite(); missing["input"][0]["tools"][0]["tools"].as_array_mut().unwrap().pop();
        let mut extra = rlite(); let duplicate = extra["input"][0]["tools"][0]["tools"][0].clone();
        extra["input"][0]["tools"][0]["tools"].as_array_mut().unwrap().push(duplicate);
        let mut reordered = rlite(); reordered["input"][0]["tools"][0]["tools"].as_array_mut().unwrap().swap(0,1);
        let mut namespace = rlite(); let extra_namespace = namespace["input"][0]["tools"][0].clone();
        namespace["input"][0]["tools"].as_array_mut().unwrap().push(extra_namespace);
        for value in [missing,extra,reordered,namespace] { assert!(validate(&value).is_err()); }
    }
}

fn observation<'a>(request: &'a Request, body: &[u8], step: &'a SourceStep, gateway: &'a ProtectedGatewayTransport,
                   challenge: &'a Challenge, host_instance_id: &'a str, sequence: u64) -> Result<FinalObservation<'a>, TransportError> {
    let projection = step.provenance.as_ref().and_then(|provenance|provenance.session_projection.as_ref())
        .ok_or_else(||hold("missing original Session and Core wire materialization"))?;
    projection.check_final_request(&step.runtime, body)?;
    if step.runtime.generation == 0 || step.runtime.generation == u64::MAX {
        return Err(hold("runtime generation exhausted"));
    }
    let turn_id = step.turn_id.as_deref().filter(|s| !s.is_empty()).ok_or_else(|| hold("missing original turn"))?;
    if step.thread_id.is_empty() { return Err(hold("missing original thread")); }
    let auth_owner = step.auth_owner.ok_or_else(|| hold("normal auth owner unobserved"))?;
    let auth_revision = step.auth_revision.ok_or_else(|| hold("normal auth revision unobserved"))?;
    let live_auth = gateway.auth.as_ref().ok_or_else(|| hold("original same-manager send lease unavailable"))?;
    live_auth.check().map_err(|_| hold("original auth changed after provider callback"))?;
    if live_auth.auth_owner_generation() != auth_owner || live_auth.auth_revision() != auth_revision {
        return Err(hold("copied setup metadata differs from original live lease"));
    }
    if request.method != Method::POST || request.url != challenge.upstream_url ||
        request.headers.contains_key(http::header::CONTENT_ENCODING) {
        return Err(hold("final gateway/request-id/compression mismatch"));
    }
    let mut document: Value = serde_json::from_slice(body).map_err(|_| hold("final JSON body"))?;
    let root = document.as_object_mut().ok_or_else(|| hold("final body object"))?;
    // Preserve the supervisor's canonical ordinary inventory only after exact
    // equality of the actual ordinary list or actual fresh RLite namespace.
    let tools = validated_offered_inventory(root)?;
    let input = root.get("input").and_then(Value::as_array).ok_or_else(|| hold("ordered input"))?;
    let context_sha256 = json_hash(&Value::Array(input.clone()))?;
    let input_text_sha256s = input.iter().flat_map(|item|item.get("content").and_then(Value::as_array).into_iter().flatten())
        .filter_map(|content|content.get("text").and_then(Value::as_str)).map(|text|hash(text.as_bytes())).collect();
    let ordered_instructions: Vec<Value> = input.iter().enumerate().filter_map(|(index, item)| {
        let role = item.get("role").and_then(Value::as_str)?;
        matches!(role, "system" | "developer").then(|| json!({"input_index": index, "item": item}))
    }).collect();
    let instructions_hash = json_hash(&Value::Array(ordered_instructions.clone()))?;
    root.remove("input"); root.remove("tools"); root.remove("client_metadata");
    let profile = document;
    let profile_hash = json_hash(&profile)?;
    let services_hash = json_hash(&tools)?;
    let mut state = step.runtime.state.lock().map_err(|_| hold("runtime state poisoned"))?;
    // Destructure to keep disjoint mutable field borrows explicit.
    let Generations { profile: old_profile, services: old_services, instructions: old_instructions,
        profile_generation, services_generation, instruction_generation, next_step } = &mut *state;
    generation(old_profile, profile_hash, profile_generation)?;
    generation(old_services, services_hash, services_generation)?;
    generation(old_instructions, instructions_hash.clone(), instruction_generation)?;
    *next_step = next_step.checked_add(1).ok_or_else(|| hold("step overflow"))?;
    Ok(FinalObservation { protocol: PROTOCOL, kind: "final_request", nonce: &challenge.nonce,
        pid: std::process::id(), sequence, source_commit: COMMIT,
        producer_module_sha256: hash(include_bytes!("protected_peer.rs")),
        tool_resource_sha256: context_contract::selected_original_tool_profile().resource_sha256(),
        host_instance_id, runtime_generation: step.runtime.generation, profile_generation: *profile_generation,
        services_generation: *services_generation, instruction_generation: *instruction_generation,
        thread_id: &step.thread_id, turn_id, step_id: *next_step, auth_owner_generation: auth_owner,
        auth_revision, auth_send_epoch: live_auth.epoch(), runtime_id: &step.runtime_id, request_id: &step.request_id,
        gateway_instance_id: &gateway.instance_id, method: request.method.as_str(), url: &request.url,
        request_sha256: hash(body), request_bytes: body.len(), context_sha256,
        input_text_sha256s, ordered_instructions, ordered_instructions_sha256: instructions_hash, profile, tools, provenance: &step.provenance })
}

#[cfg(unix)]
mod pipe {
    use super::*;
    use std::io;
    use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
    use tokio::io::unix::AsyncFd;
    pub(super) struct Pipe(AsyncFd<OwnedFd>);
    impl Pipe {
        pub(super) fn inherited(fd: i32) -> io::Result<Self> {
            // Only fixed descriptors inherited from the original launch; no path/env override.
            let mut stat = std::mem::MaybeUninit::<libc::stat>::uninit();
            if unsafe { libc::fstat(fd, stat.as_mut_ptr()) } != 0 { return Err(io::Error::last_os_error()); }
            // Establish that the inherited descriptor is open before claiming ownership.
            let owned = unsafe { OwnedFd::from_raw_fd(fd) };
            let mode = unsafe { stat.assume_init() }.st_mode & libc::S_IFMT;
            // libuv may implement Node's original anonymous stdio pipes as socketpairs.
            if mode != libc::S_IFIFO && mode != libc::S_IFSOCK {
                return Err(io::Error::other("protected descriptor is not original pipe"));
            }
            let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
            let descriptor_flags = unsafe { libc::fcntl(fd, libc::F_GETFD) };
            if flags < 0 || descriptor_flags < 0 || unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0 ||
                unsafe { libc::fcntl(fd, libc::F_SETFD, descriptor_flags | libc::FD_CLOEXEC) } < 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(Self(AsyncFd::new(owned)?))
        }
        pub(super) async fn read_byte(&self) -> io::Result<u8> {
            loop {
                let mut ready = self.0.readable().await?;
                match ready.try_io(|fd| {
                    let mut byte = 0u8;
                    let n = unsafe { libc::read(fd.get_ref().as_raw_fd(), (&mut byte as *mut u8).cast(), 1) };
                    if n == 1 { Ok(byte) } else if n == 0 { Err(io::Error::from(io::ErrorKind::UnexpectedEof)) }
                    else { Err(io::Error::last_os_error()) }
                }) { Ok(result) => return result, Err(_) => continue }
            }
        }
        pub(super) async fn write(&self, bytes: &[u8]) -> io::Result<()> {
            let mut offset = 0;
            while offset < bytes.len() {
                let mut ready = self.0.writable().await?;
                match ready.try_io(|fd| {
                    let n = unsafe { libc::write(fd.get_ref().as_raw_fd(), bytes[offset..].as_ptr().cast(), bytes.len()-offset) };
                    if n > 0 { Ok(n as usize) } else if n == 0 { Err(io::Error::from(io::ErrorKind::WriteZero)) }
                    else { Err(io::Error::last_os_error()) }
                }) { Ok(Ok(n)) => offset += n, Ok(Err(e)) => return Err(e), Err(_) => continue }
            }
            Ok(())
        }
    }
}

#[cfg(unix)]
struct Channel {
    incoming: pipe::Pipe, outgoing: pipe::Pipe, challenge: Option<Challenge>,
    sequence: u64, unresolved: Option<String>, poisoned: bool, host_observation: Option<Value>,
    scope_context_receipt: Option<context_contract::OriginalScopeContextReceipt>,
    scope_context_attempted: bool,
}
#[cfg(unix)]
impl Channel {
    async fn read<T: serde::de::DeserializeOwned>(&self) -> Result<T, TransportError> {
        let mut bytes = Vec::new();
        loop {
            let byte = self.incoming.read_byte().await.map_err(|_| hold("original control pipe closed/error"))?;
            if byte == b'\n' { break; }
            if bytes.len() == MAX_FRAME { return Err(hold("control frame byte limit")); }
            bytes.push(byte);
        }
        serde_json::from_slice(&bytes).map_err(|_| hold("strict control frame"))
    }
    async fn write(&self, value: &impl Serialize) -> Result<(), TransportError> {
        let mut bytes = serde_json::to_vec(value).map_err(|_| hold("witness encoding"))?;
        if bytes.len() > MAX_FRAME { return Err(hold("witness frame byte limit")); }
        bytes.push(b'\n');
        self.outgoing.write(&bytes).await.map_err(|_| hold("original witness pipe closed/error"))
    }
    async fn write_observation(&self, facts: &impl Serialize) -> Result<String, TransportError> {
        // Hash the exact original serialization; no cross-language reserialization assumption.
        let observed = serde_json::to_vec(facts).map_err(|_| hold("observation encoding"))?;
        let binding = hash(&observed);
        let mut frame = format!("{{\"binding_sha256\":\"{binding}\",\"observation\":").into_bytes();
        frame.extend_from_slice(&observed); frame.push(b'}');
        if frame.len() > MAX_FRAME { return Err(hold("witness frame byte limit")); }
        frame.push(b'\n');
        self.outgoing.write(&frame).await.map_err(|_| hold("original witness pipe closed/error"))?;
        Ok(binding)
    }
    async fn permit(&mut self, request: &Request, body: &[u8], step: &SourceStep, gateway: &ProtectedGatewayTransport) -> Result<(), TransportError> {
        if self.poisoned || self.unresolved.is_some() { return Err(hold("unresolved prior backend operation")); }
        if self.host_observation.is_none() || self.challenge.is_none() {
            return Err(hold("original pre-auth challenge/bootstrap observation unavailable"));
        }
        self.sequence = self.sequence.checked_add(1).ok_or_else(|| hold("channel sequence overflow"))?;
        let challenge = self.challenge.as_ref().ok_or_else(|| hold("missing challenge"))?;
        let host_id = self.host_observation.as_ref().and_then(|h| h.get("host_instance_id")).and_then(Value::as_str)
            .ok_or_else(|| hold("original host instance unavailable"))?;
        context_contract::require_original_scope_for_send(challenge, host_id, self.scope_context_receipt.as_ref())?;
        let facts = observation(request, body, step, gateway, challenge, host_id, self.sequence)?;
        let binding = self.write_observation(&facts).await?;
        let permit: Permit = self.read().await?;
        if permit.protocol != PROTOCOL || permit.kind != "send_permit" || permit.nonce != challenge.nonce ||
            permit.pid != std::process::id() || permit.sequence != self.sequence || permit.binding_sha256 != binding ||
            permit.request_sha256 != hash(body) || permit.request_id != step.request_id ||
            permit.gateway_instance_id != gateway.instance_id {
            return Err(hold("one-use original request/gateway permit mismatch"));
        }
        // A consumed permit reserves this operation. Errors/cancellation cannot unreserve it.
        self.unresolved = Some(step.request_id.clone());
        Ok(())
    }
}
/// The concrete original FD3 writer is retained by the SAME response decoder.
/// Raw byte EOF cannot release its request reservation or disarm cancellation.
#[cfg(unix)]
struct OriginalResponseDrainWriter {
    owner:&'static tokio::sync::Mutex<Channel>,
    startup:original_native_decoder::OriginalStartupIdentity,
    request_id:String,request_sha256:String,sequence:u64,
    guard:OperationGuard<'static>,
}
#[cfg(unix)]
impl OriginalResponseDrainWriter {
    fn matches(&self,startup:&original_native_decoder::OriginalStartupIdentity,request_id:&str,request_sha256:&str)->bool {
        &self.startup==startup&&self.request_id==request_id&&self.request_sha256==request_sha256
    }
    async fn publish(mut self,drained:original_history::OriginalResponseTerminalDrained)->Result<(),TransportError> {
        let mut state=lock_original_known(self.owner,self.guard.unknown).await?;
        if state.poisoned||state.sequence!=self.sequence||state.unresolved.as_deref()!=Some(self.request_id.as_str())
            ||original_native_decoder::OriginalStartupIdentity::observe(&state)?!=self.startup
            ||!drained.matches(&self.startup,&self.request_id,&self.request_sha256) {
            state.poisoned=true;return Err(hold("response original terminal drain channel changed"));
        }
        let frame=drained.frame(self.sequence);
        let result=tokio::time::timeout(std::time::Duration::from_secs(5),state.write(&frame)).await;
        if !matches!(result,Ok(Ok(()))) {
            state.poisoned=true;return Err(hold("response original terminal drain witness write failed/deadline"));
        }
        // Only an authoritative parser+same-body drain written on the original
        // inherited FD3 releases THIS request. Drop/error keeps UNKNOWN sticky.
        state.unresolved=None;self.guard.armed=false;Ok(())
    }
}
#[cfg(unix)]
static CHANNEL: tokio::sync::OnceCell<Result<tokio::sync::Mutex<Channel>, String>> = tokio::sync::OnceCell::const_new();
#[cfg(unix)]
async fn channel() -> Result<&'static tokio::sync::Mutex<Channel>, TransportError> {
    // Initialization failure is retained: a later call must not re-claim recycled fd numbers.
    let result = CHANNEL.get_or_init(|| async {
        let outgoing = pipe::Pipe::inherited(3).map_err(|_| "original FD3 unavailable".to_string())?;
        let incoming = pipe::Pipe::inherited(4).map_err(|_| "original FD4 unavailable".to_string())?;
        Ok(tokio::sync::Mutex::new(Channel { incoming, outgoing, challenge: None, sequence: 0, unresolved: None, poisoned: false, host_observation: None, scope_context_receipt: None, scope_context_attempted: false }))
    }).await;
    result.as_ref().map_err(|reason| hold(reason))
}

/// The single actual HTTP cut. Auth has already run and may have replaced the request.
/// No async/caller mutation is allowed between permit validation and transport invocation.
pub(crate) async fn stream<T: HttpTransport + 'static>(transport: &T, request: Request, step: Option<&SourceStep>, auth_provider: &crate::SharedAuthProvider)
    -> Result<original_history::OriginalStreamResponse, TransportError> {
    if !enabled() { return transport.stream(request).await.map(|response|original_history::OriginalStreamResponse {response,original:None}); }
    #[cfg(not(unix))]
    { let _ = (transport, request, step, auth_provider); Err(hold("unsupported inherited-pipe host")) }
    #[cfg(unix)]
    {
        // Concrete type identity is required. No caller boolean or trait proof callback.
        let gateway = (transport as &dyn std::any::Any).downcast_ref::<ProtectedGatewayTransport>()
            .ok_or_else(|| hold("unbound stock/foreign upstream transport"))?;
        if !gateway.auth_provider.as_ref().is_some_and(|original| Arc::ptr_eq(original, auth_provider)) {
            return Err(hold("foreign authentication provider object"));
        }
        ensure_known(&UNKNOWN)?;
        let step = step.ok_or_else(|| hold("missing original ModelClient step"))?;
        if step.consumed.swap(true, Ordering::SeqCst) { return Err(hold("step already consumed")); }
        let request = request.into_prepared().map_err(TransportError::Build)?;
        let prepared = request.prepare_body_for_send().map_err(TransportError::Build)?;
        let body = prepared.body.as_ref().ok_or_else(|| hold("missing final body"))?;
        if body.is_empty() || body.len() > MAX_BODY { return Err(hold("final body byte limit")); }
        let owner = channel().await?;
        let guard = OperationGuard { armed: true, unknown: &UNKNOWN };
        let mut state = lock_original_known(owner,&UNKNOWN).await?;
        let permit = await_original_known(&UNKNOWN,tokio::time::timeout(std::time::Duration::from_secs(5), state.permit(&request, body, step, gateway))).await;
        if !matches!(permit, Ok(Ok(Ok(())))) { state.poisoned = true; return Err(hold("permit failed/timed out")); }
        if let Err(error) = ensure_known(&UNKNOWN) { state.poisoned = true; return Err(error); }
        drop(state);
        // The supervisor await can race a newly accepted input. Acquire the
        // original Session read fence afterwards and validate that exact cut.
        let projection = step.provenance.as_ref().and_then(|provenance|provenance.session_projection.as_ref())
            .ok_or_else(||hold("missing original Session and Core wire materialization"))?;
        let ingress_guard = projection.lock_for_send(&step.runtime, body).await?;
        // Recheck AFTER the awaited supervisor permit as well as after authentication.
        // The original manager owns this read lease; no callback supplies a verdict.
        let live_auth = gateway.auth.as_ref().ok_or_else(|| hold("missing original live auth lease"))?.clone();
        live_auth.check().map_err(|_| hold("original auth changed during permit wait"))?;
        let url = url::Url::parse(&request.url).map_err(|_| hold("final URL"))?;
        let network_permit = live_auth.authorize(&url).map_err(|_| hold("original account-bound egress revoked"))?;
        ensure_known(&UNKNOWN)?;
        let send = live_auth.run(&network_permit, gateway.inner.stream(request));
        let result = match ingress_guard.run(send).await {
            Ok(result) => result,
            Err(error) => { owner.lock().await.poisoned = true; return Err(error); }
        };
        drop(ingress_guard);
        let response = match result {
            Err(_) => { owner.lock().await.poisoned = true; return Err(hold("original auth/policy revoked at transport cut")); },
            Ok(result) => match result {
            Ok(response) => response,
            Err(error) => { owner.lock().await.poisoned = true; return Err(error); }
            }
        };
        let (startup_identity,sequence)={let state=owner.lock().await;
            (original_native_decoder::OriginalStartupIdentity::observe(&state)?,state.sequence)};
        let original = original_history::OriginalResponseDecoder::returned_from_original_channel(step,body,startup_identity.clone(),
            OriginalResponseDrainWriter {owner,startup:startup_identity,request_id:step.request_id.clone(),
                request_sha256:hash(body),sequence,guard})?;
        let StreamResponse { status, headers, bytes } = response;
        {
            let state=owner.lock().await;
            let frame=json!({"protocol":PROTOCOL,"kind":"transport_headers","nonce":state.challenge.as_ref().map(|c|c.nonce.as_str()),
                "pid":std::process::id(),"sequence":state.sequence,"request_id":step.request_id,
                "gateway_instance_id":gateway.instance_id,"status":status.as_u16()});
            tokio::time::timeout(std::time::Duration::from_secs(5),state.write(&frame)).await
                .map_err(|_|hold("actual transport header observation deadline"))??;
        }
        let request_id = step.request_id.clone();
        // Raw EOF is only local transport bookkeeping. The original SSE decoder
        // must observe Completed AND this same body drain before releasing it.
        let bytes = futures::stream::unfold((bytes, owner, request_id, sequence, false, live_auth, network_permit), |(mut bytes, owner, request_id, sequence, ended, live_auth, network_permit)| async move {
            if ended { return None; }
            let next = match live_auth.run(&network_permit, bytes.next()).await {
                Ok(next) => next,
                Err(_) => Some(Err(hold("original auth/policy revoked while response outstanding"))),
            };
            match next {
                Some(Ok(chunk)) => Some((Ok(chunk), (bytes, owner, request_id, sequence, false, live_auth, network_permit))),
                Some(Err(error)) => { owner.lock().await.poisoned = true; Some((Err(error), (bytes, owner, request_id, sequence, true, live_auth, network_permit))) },
                None => {
                    let mut state = owner.lock().await;
                    if state.poisoned||state.sequence!=sequence||state.unresolved.as_ref()!=Some(&request_id) { state.poisoned = true; return None; }
                    let frame = json!({"protocol":PROTOCOL,"kind":"local_body_eof","request_id":request_id,
                        "sequence":sequence,"pid":std::process::id(),"remote_domain_closed":false});
                    let result = tokio::time::timeout(std::time::Duration::from_secs(5), state.write(&frame)).await;
                    if !matches!(result, Ok(Ok(()))) { state.poisoned = true; }
                    None
                }
            }
        });
        Ok(original_history::OriginalStreamResponse { response: StreamResponse { status, headers, bytes: Box::pin(bytes) }, original: Some(original) })
    }
}
