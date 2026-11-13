//! Authored source tests only. No actual channel, Config, account or provider.
use super::*;
use serde_json::{Value, json};

fn request_value() -> Value {
    json!({"protocol":CONTRACT_PROTOCOL,"contract_id":CORE_ID,
        "resource_sha256":RESOURCE_SHA256,"context_encoding":ENCODING,"scope_profile_id":PROFILE})
}
fn request() -> ContextContractRequest { serde_json::from_value(request_value()).unwrap() }
fn fixture_observation() -> ContextContractObservation {
    ContextContractObservation { protocol:PROTOCOL,kind:"scoped_context_contract",nonce:"a".repeat(64),
        pid:std::process::id(),slot_id:"fixture-slot".into(),executable_sha256:"b".repeat(64),
        source_manifest_sha256:"c".repeat(64),host_instance_id:"fixture-host".into(),
        scope_instance_id:"fixture-scope-one".into(),context_contract_protocol:CONTRACT_PROTOCOL.into(),
        context_contract_id:CORE_ID.into(),context_contract_sha256:RESOURCE_SHA256.into(),
        context_encoding:ENCODING.into(),scope_profile_id:PROFILE.into(),evidence_scope:EVIDENCE_SCOPE }
}
fn fixture_binding(observation: &ContextContractObservation) -> String {
    hash(&serde_json::to_vec(observation).unwrap())
}
fn fixture_permit(observation: &ContextContractObservation, binding: &str) -> Value {
    let mut value=serde_json::to_value(observation).unwrap();
    value.as_object_mut().unwrap().remove("executable_sha256");
    value["kind"]=json!("context_contract_permit");
    value["binding_sha256"]=json!(binding);
    value
}
fn fixture_challenge() -> Challenge {
    serde_json::from_value(json!({"protocol":PROTOCOL,"kind":"challenge","nonce":"a".repeat(64),
        "pid":std::process::id(),"upstream_url":"https://example.invalid/v1/responses",
        "slot_id":"fixture-slot","executable_sha256":"b".repeat(64),"source_manifest_sha256":"c".repeat(64),
        "state_root":"/fictional/state","cwd":"/fictional/work","original_home_sha256":"d".repeat(64),
        "context_contract":request_value()})).unwrap()
}

#[test]
fn exact_frame_resource_keeps_proposed_business_status() {
    let resource=source_resource().unwrap();
    assert_eq!(resource.status,"SOURCE PROPOSAL; new frame2 actual oldv3 pure25=12Pass13Fail caused unintended fixture padding before intended membership oracles; v5 fixes that source fixture and adds2 explicit padding cases, UNRUN; mechanical code unchanged. No semantic/profile/native qualification.");
    assert_eq!(resource.contract_id,CORE_ID);
    assert!(resource.implementation_boundary.contains("UNIMPLEMENTED/UNQUALIFIED"));
    assert_eq!(hash(RESOURCE),RESOURCE_SHA256);
    // This source selection is a mechanical descriptor, never interpreter
    // qualification, a static build slot, current authority or understanding.
    assert!(select_original_context_contract(Some(&request())).unwrap().is_some());
}

#[test]
fn old_raw_absence_does_not_manufacture_new_context_capability() {
    assert!(select_original_context_contract(None).unwrap().is_none());
    let mut challenge=fixture_challenge();challenge.context_contract=None;
    assert!(require_original_scope_for_send(&challenge,"fixture-host",None).is_ok());
}

#[test]
fn caller_ready_flags_missing_fields_and_duplicate_request_keys_are_rejected() {
    let mut extra=request_value();extra["ready"]=json!(true);
    assert!(serde_json::from_value::<ContextContractRequest>(extra).is_err());
    let mut missing=request_value();missing.as_object_mut().unwrap().remove("contract_id");
    assert!(serde_json::from_value::<ContextContractRequest>(missing).is_err());
    let text=serde_json::to_string(&request_value()).unwrap();
    let duplicate=format!("{{\"protocol\":\"{CONTRACT_PROTOCOL}\",{}",&text[1..]);
    assert!(serde_json::from_str::<ContextContractRequest>(&duplicate).is_err());
}

#[test]
fn changed_resource_profile_contract_or_explicit_future_encoding_is_unsupported() {
    for key in ["protocol","contract_id","resource_sha256","context_encoding","scope_profile_id"] {
        let mut value=request_value();value[key]=json!("peer-P5-preserved-meaning-continuation-v1");
        let requested:ContextContractRequest=serde_json::from_value(value).unwrap();
        assert!(select_original_context_contract(Some(&requested)).is_err(),"{key}");
    }
    // Same protocol/profile is insufficient: the previous resource is a distinct source contract.
    let mut historical=request_value();historical["resource_sha256"]=json!("7b24c15b0b45ddf284ede1817fdbe47cef9f156a169ace1093ce3f00244a0243");
    let historical:ContextContractRequest=serde_json::from_value(historical).unwrap();
    assert!(select_original_context_contract(Some(&historical)).is_err());
}

#[test]
fn exact_original_serialization_ack_produces_only_a_scoped_source_receipt() {
    let observation=fixture_observation();let binding=fixture_binding(&observation);
    let permit:ContextContractPermit=serde_json::from_value(fixture_permit(&observation,&binding)).unwrap();
    let receipt=accept_original_context_permit(observation,&binding,permit).unwrap();
    assert!(require_original_scope_for_send(&fixture_challenge(),"fixture-host",Some(&receipt)).is_ok());
}

#[test]
fn foreign_ack_identity_resource_scope_encoding_or_byte_binding_is_held() {
    for key in ["protocol","kind","nonce","slot_id","source_manifest_sha256","host_instance_id",
        "scope_instance_id","binding_sha256","context_contract_protocol","context_contract_id",
        "context_contract_sha256","context_encoding","scope_profile_id","evidence_scope"] {
        let observation=fixture_observation();let binding=fixture_binding(&observation);
        let mut value=fixture_permit(&observation,&binding);value[key]=json!("foreign-or-altered");
        let permit=serde_json::from_value(value).unwrap();
        assert!(accept_original_context_permit(observation,&binding,permit).is_err(),"{key}");
    }
    let observation=fixture_observation();let binding=fixture_binding(&observation);
    let mut value=fixture_permit(&observation,&binding);value["pid"]=json!(std::process::id().saturating_add(1));
    assert!(accept_original_context_permit(observation,&binding,serde_json::from_value(value).unwrap()).is_err());
}

#[test]
fn unknown_or_duplicate_ack_fields_cannot_bypass_closed_source_protocol() {
    let observation=fixture_observation();let binding=fixture_binding(&observation);
    let mut extra=fixture_permit(&observation,&binding);extra["understood"]=json!(true);
    assert!(serde_json::from_value::<ContextContractPermit>(extra).is_err());
    let text=serde_json::to_string(&fixture_permit(&observation,&binding)).unwrap();
    let duplicate=format!("{{\"pid\":{},{}",std::process::id(),&text[1..]);
    assert!(serde_json::from_str::<ContextContractPermit>(&duplicate).is_err());
}

#[test]
fn original_bootstrap_identity_without_accepted_scope_cannot_send_new_context() {
    assert!(require_original_scope_for_send(&fixture_challenge(),"fixture-host",None).is_err());
}

#[test]
fn accepted_scope_is_bound_to_original_current_challenge_and_host() {
    for key in ["nonce","slot_id","executable_sha256","source_manifest_sha256"] {
        let observation=fixture_observation();let binding=fixture_binding(&observation);
        let permit=serde_json::from_value(fixture_permit(&observation,&binding)).unwrap();
        let receipt=accept_original_context_permit(observation,&binding,permit).unwrap();
        let mut value=serde_json::to_value(json!({"protocol":PROTOCOL,"kind":"challenge","nonce":"a".repeat(64),
            "pid":std::process::id(),"upstream_url":"https://example.invalid/v1/responses","slot_id":"fixture-slot",
            "executable_sha256":"b".repeat(64),"source_manifest_sha256":"c".repeat(64),"state_root":"/fictional/state",
            "cwd":"/fictional/work","original_home_sha256":"d".repeat(64),"context_contract":request_value()})).unwrap();
        value[key]=json!("foreign");let challenge=serde_json::from_value(value).unwrap();
        assert!(require_original_scope_for_send(&challenge,"fixture-host",Some(&receipt)).is_err(),"{key}");
    }
    let observation=fixture_observation();let binding=fixture_binding(&observation);
    let permit=serde_json::from_value(fixture_permit(&observation,&binding)).unwrap();
    let receipt=accept_original_context_permit(observation,&binding,permit).unwrap();
    assert!(require_original_scope_for_send(&fixture_challenge(),"other-host",Some(&receipt)).is_err());
}
