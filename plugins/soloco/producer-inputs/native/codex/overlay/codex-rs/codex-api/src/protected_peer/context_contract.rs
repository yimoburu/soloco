//! Source-bound opaque context framing. This is not semantic understanding,
//! native qualification, authority, or a claim that the Node interpreter joined.
//! The parent must separately qualify the actual same-graph CORE interpreter
//! and source-owned build descriptor before selecting this private protocol.
use super::{Challenge, PROTOCOL, TransportError, hash, hold};
use serde::{Deserialize, Serialize};

const RESOURCE: &[u8] = include_bytes!("peer_context_contract_v2.json");
const RESOURCE_SHA256: &str = "832fdd1c965fa0e834c030f7c1e5636e2f32636b0df899ba8aa0fa940e9032fc";
const CONTRACT_PROTOCOL: &str = "soloco-peer-context-contract-v2";
const CORE_ID: &str = "peer-task-and-whole-membership-context-v2-delivery-frame-v3";
const ENCODING: &str = "soloco-peer-context-frame-v2";
const PROFILE: &str = "protected_scoped_explicit_nonincremental_rlite_v1";
const EVIDENCE_SCOPE: &str = "source-resource-and-whole-payload-source-cut-wire-compatibility-only";

/// Optional only for compatibility with the original raw-v1 control path.
/// A new v2 caller must select the exact source-owned descriptor; it cannot
/// relabel an older reconstruction, build or runtime as supporting v2.
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ContextContractRequest {
    protocol: String,
    contract_id: String,
    resource_sha256: String,
    context_encoding: String,
    scope_profile_id: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SourceResource {
    protocol: String, contract_id: String, status: String,
    mechanical_frame: serde_json::Value,
    #[serde(rename = "Node_business_core_grammar")]
    node_business_core_grammar: serde_json::Value,
    #[serde(rename = "P5_business_extension")]
    p5_business_extension: serde_json::Value,
    interpretation_rules: Vec<String>, admission_order: serde_json::Value,
    implementation_boundary: String,
    membership_delivery_association: serde_json::Value,
}

/// Only the source-validated selection can reach the original lifecycle writer.
/// No Deserialize or public constructor and no ready/approved Boolean.
#[derive(Clone)]
pub(super) struct OriginalContextSelection {
    request: ContextContractRequest,
}

fn source_resource() -> Result<SourceResource, TransportError> {
    // Full original resource bytes are pinned; its proposed business schemas do
    // not assert implementation, model understanding or an admitted capability.
    if RESOURCE.len() != 28656 || hash(RESOURCE) != RESOURCE_SHA256 {
        return Err(hold("original context frame resource changed"));
    }
    let resource: SourceResource = serde_json::from_slice(RESOURCE)
        .map_err(|_| hold("original context frame resource shape"))?;
    if resource.protocol != CONTRACT_PROTOCOL || resource.contract_id != CORE_ID
        || resource.status != "SOURCE PROPOSAL; new frame2 actual oldv3 pure25=12Pass13Fail caused unintended fixture padding before intended membership oracles; v5 fixes that source fixture and adds2 explicit padding cases, UNRUN; mechanical code unchanged. No semantic/profile/native qualification."
        || resource.mechanical_frame.get("protocol").and_then(serde_json::Value::as_str) != Some(ENCODING)
        || !resource.node_business_core_grammar.is_object() || !resource.p5_business_extension.is_object()
        || !resource.membership_delivery_association.is_object()
        || !resource.admission_order.is_object() || resource.interpretation_rules.is_empty()
        || !resource.implementation_boundary.contains("UNIMPLEMENTED/UNQUALIFIED")
    {
        return Err(hold("unsupported original context frame source resource"));
    }
    Ok(resource)
}

/// Checks exact source identity and mechanical delivery contract only. It does
/// not upgrade the resource's DESIGN status or assert an implemented/qualified
/// Node interpreter. The original static producer must independently establish
/// that prerequisite before admission; this selection alone cannot admit work.
pub(super) fn select_original_context_contract(
    requested: Option<&ContextContractRequest>,
) -> Result<Option<OriginalContextSelection>, TransportError> {
    let Some(request) = requested else { return Ok(None); };
    source_resource()?;
    if request.protocol != CONTRACT_PROTOCOL || request.contract_id != CORE_ID
        || request.resource_sha256 != RESOURCE_SHA256 || request.context_encoding != ENCODING
        || request.scope_profile_id != PROFILE
    {
        return Err(hold("unsupported original CORE context selection"));
    }
    Ok(Some(OriginalContextSelection { request: request.clone() }))
}

#[derive(Clone, Serialize)]
pub(super) struct ContextContractObservation {
    protocol: &'static str,
    kind: &'static str,
    nonce: String,
    pid: u32,
    slot_id: String,
    executable_sha256: String,
    source_manifest_sha256: String,
    host_instance_id: String,
    scope_instance_id: String,
    context_contract_protocol: String,
    context_contract_id: String,
    context_contract_sha256: String,
    context_encoding: String,
    scope_profile_id: String,
    evidence_scope: &'static str,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ContextContractPermit {
    protocol: String,
    kind: String,
    nonce: String,
    pid: u32,
    slot_id: String,
    source_manifest_sha256: String,
    host_instance_id: String,
    scope_instance_id: String,
    binding_sha256: String,
    context_contract_protocol: String,
    context_contract_id: String,
    context_contract_sha256: String,
    context_encoding: String,
    scope_profile_id: String,
    evidence_scope: String,
}

/// Private accepted lifecycle receipt. A raw bootstrap observation, resource
/// label or copied JSON permit is not a value of this type.
pub(super) struct OriginalScopeContextReceipt {
    observation: ContextContractObservation,
}

impl OriginalContextSelection {
    pub(super) fn observation(
        &self,
        claim: &super::startup::OriginalBootstrapClaim,
        host_instance_id: String,
    ) -> ContextContractObservation {
        ContextContractObservation {
            protocol: PROTOCOL, kind: "scoped_context_contract",
            nonce: claim.nonce.clone(), pid: std::process::id(),
            slot_id: claim.slot_id.clone(), executable_sha256: claim.executable_sha256.clone(),
            source_manifest_sha256: claim.source_manifest_sha256.clone(), host_instance_id,
            scope_instance_id: uuid::Uuid::new_v4().to_string(),
            context_contract_protocol: self.request.protocol.clone(),
            context_contract_id: self.request.contract_id.clone(),
            context_contract_sha256: self.request.resource_sha256.clone(),
            context_encoding: self.request.context_encoding.clone(),
            scope_profile_id: self.request.scope_profile_id.clone(), evidence_scope: EVIDENCE_SCOPE,
        }
    }
}

pub(super) fn accept_original_context_permit(
    observation: ContextContractObservation,
    binding_sha256: &str,
    permit: ContextContractPermit,
) -> Result<OriginalScopeContextReceipt, TransportError> {
    if permit.protocol != observation.protocol || permit.kind != "context_contract_permit"
        || permit.nonce != observation.nonce || permit.pid != observation.pid
        || permit.slot_id != observation.slot_id
        || permit.source_manifest_sha256 != observation.source_manifest_sha256
        || permit.host_instance_id != observation.host_instance_id
        || permit.scope_instance_id != observation.scope_instance_id
        || permit.binding_sha256 != binding_sha256
        || permit.context_contract_protocol != observation.context_contract_protocol
        || permit.context_contract_id != observation.context_contract_id
        || permit.context_contract_sha256 != observation.context_contract_sha256
        || permit.context_encoding != observation.context_encoding
        || permit.scope_profile_id != observation.scope_profile_id
        || permit.evidence_scope != observation.evidence_scope
    {
        return Err(hold("foreign or changed original context capability acknowledgement"));
    }
    Ok(OriginalScopeContextReceipt { observation })
}

impl OriginalScopeContextReceipt {
    pub(super) fn require_current(
        &self, challenge: &Challenge, host_instance_id: &str,
    ) -> Result<(), TransportError> {
        let requested = challenge.context_contract.as_ref()
            .ok_or_else(|| hold("missing original context selection"))?;
        let original = &self.observation;
        if original.nonce != challenge.nonce || original.pid != std::process::id()
            || original.slot_id != challenge.slot_id
            || original.executable_sha256 != challenge.executable_sha256
            || original.source_manifest_sha256 != challenge.source_manifest_sha256
            || original.host_instance_id != host_instance_id
            || original.context_contract_protocol != requested.protocol
            || original.context_contract_id != requested.contract_id
            || original.context_contract_sha256 != requested.resource_sha256
            || original.context_encoding != requested.context_encoding
            || original.scope_profile_id != requested.scope_profile_id
        {
            return Err(hold("original context capability changed before send"));
        }
        Ok(())
    }
}

/// Shared actual send seam. Legacy absence is not a new capability receipt;
/// new contexts require the same current original accepted scoped observation.
pub(super) fn require_original_scope_for_send(
    challenge: &Challenge, host_instance_id: &str, receipt: Option<&OriginalScopeContextReceipt>,
) -> Result<(), TransportError> {
    if challenge.context_contract.is_none() { return Ok(()); }
    receipt.ok_or_else(|| hold("original scoped context capability unavailable before send"))?
        .require_current(challenge, host_instance_id)
}

mod frame;

// Set exactly once by the ORIGINAL successful pre-auth startup after validating
// its actual executable/source/scope association. This is immutable format
// selection, not a ready/authority Boolean or a caller-constructible receipt.
static ORIGINAL_SELECTION: std::sync::OnceLock<Option<OriginalContextSelection>> = std::sync::OnceLock::new();
pub(super) fn retain_original_context_selection(selection: Option<OriginalContextSelection>) -> Result<(), TransportError> {
    ORIGINAL_SELECTION.set(selection).map_err(|_| hold("original context selection already retained"))
}

/// Actual original bridge call, before forwarding a typed turn/start. Keep this
/// SYNCHRONOUS: steering must reach Core epoch revocation without waiting for an
/// old HTTP-header future's Channel lock. Final send independently requires the
/// original acknowledged scoped receipt and all existing currentness guards.
pub fn validate_original_context_source_request(request: &serde_json::Value) -> Result<(), TransportError> {
    if request.get("method").and_then(serde_json::Value::as_str) != Some("turn/start") { return Ok(()); }
    let selected = ORIGINAL_SELECTION.get().ok_or_else(|| hold("original context selection unavailable"))?;
    validate_selected_turn_input(request, selected.as_ref())
}

fn validate_selected_turn_input(request: &serde_json::Value, selection: Option<&OriginalContextSelection>) -> Result<(), TransportError> {
    let original_input = request.get("params").and_then(|p|p.get("input"))
        .and_then(serde_json::Value::as_array);
    let is_reserved = |item: &serde_json::Value| item.get("type").and_then(serde_json::Value::as_str) == Some("text")
        && item.get("text").and_then(serde_json::Value::as_str).is_some_and(|text|
            text.starts_with("{\"protocol\":\"soloco-peer-context-frame-"));
    let Some(selection) = selection else {
        if original_input.is_some_and(|input|input.iter().any(is_reserved)) {
            return Err(hold("new context frame requires original source selection"));
        }
        return Ok(()); // Preserve ordinary legacy raw input/parser behavior.
    };
    let input = original_input.ok_or_else(|| hold("original context turn input unavailable"))?;
    let mut frames = 0usize;
    for item in input {
        if item.get("type").and_then(serde_json::Value::as_str) != Some("text") { continue; }
        let Some(text) = item.get("text").and_then(serde_json::Value::as_str) else { continue; };
        if !text.starts_with("{\"protocol\":\"soloco-peer-context-frame-") { continue; }
        frames += 1;
        frame::decode_original_frame(text, &selection.request.resource_sha256, super::MAX_FRAME)?;
    }
    if frames != 1 { return Err(hold("exactly one original context frame required")); }
    Ok(())
}

#[cfg(test)]
mod tests;
