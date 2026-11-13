//! Authored source tests only. No actual channel, Config, account or provider.
use super::*;
use serde_json::{Value, json};

// Additive bootstrap readonly3 Source controls: AUTHORED_UNRUN. These prove no
// actual startup, typed company admission, Native build, model or profile QA.
fn bootstrap_request_value()->Value {
    json!({"protocol":BOOTSTRAP_PROTOCOL,"contract_id":BOOTSTRAP_CORE_ID,
        "resource_sha256":BOOTSTRAP_RESOURCE_SHA256,"context_encoding":ENCODING,"scope_profile_id":BOOTSTRAP_PROFILE})
}
fn bootstrap_selection()->OriginalContextSelection {
    select_original_context_contract(Some(&serde_json::from_value(bootstrap_request_value()).unwrap())).unwrap().unwrap()
}
fn bootstrap_assignment(inner:&str)->String {
    format!("{{\"protocol\":\"peer-bootstrap-membership-assignment-v1\",\"kind\":\"peer-bootstrap-membership-reconstruction\",\"source_cut\":{inner},\"source_cut_sha256\":\"{}\",\"negative\":[false,null,\"UNKNOWN\"],\"raw_number\":9007199254740993}}",hash(inner.as_bytes()))
}
fn bootstrap_frame(payload:&str,inner:&str,contract:&str,kind:&str,protocol:&str)->String {
    format!("{{\"protocol\":\"{ENCODING}\",\"contract_sha256\":\"{contract}\",\"delivery_kind\":\"{kind}\",\"payload_protocol\":\"{protocol}\",\"payload_sha256\":\"{}\",\"payload_utf8_bytes\":{},\"source_cut_protocol\":\"peer-bootstrap-membership-context-v1\",\"source_cut_sha256\":\"{}\",\"source_cut_utf8_bytes\":{},\"payload\":{payload}}}",hash(payload.as_bytes()),payload.len(),hash(inner.as_bytes()),inner.len())
}
fn bootstrap_wire(inner:&str)->(String,String) {
    let payload=bootstrap_assignment(inner);
    let framed=bootstrap_frame(&payload,inner,BOOTSTRAP_RESOURCE_SHA256,"bootstrap-membership-assignment","peer-bootstrap-membership-assignment-v1");
    (payload,framed)
}
fn offered(value:Value,profile:OriginalToolProfile)->Result<Value,TransportError> {
    super::super::validated_selected_offered_inventory(value.as_object().unwrap(),profile)
}

#[test]
fn bootstrap_exact_resource_and_constructor_profile_are_additive_and_closed() {
    assert_eq!(BOOTSTRAP_RESOURCE.len(),2427);assert_eq!(hash(BOOTSTRAP_RESOURCE),BOOTSTRAP_RESOURCE_SHA256);
    let selected=bootstrap_selection();assert!(selected.profile==OriginalToolProfile::BootstrapReadonlyThree);
    assert!(select_original_context_contract(Some(&request())).unwrap().unwrap().profile==OriginalToolProfile::OrdinaryFive);
    assert!(select_original_context_contract(None).unwrap().is_none());
    for key in ["protocol","contract_id","resource_sha256","context_encoding","scope_profile_id"] {
        let mut value=bootstrap_request_value();value[key]=request_value()[key].clone();
        // The shared encoding is intentionally equal; all other cross-profile
        // substitutions must reject the closed original constructor tuple.
        if key!="context_encoding"{assert!(select_original_context_contract(Some(&serde_json::from_value(value).unwrap())).is_err(),"{key}");}
    }
    let mut extra=bootstrap_request_value();extra["ready"]=json!(true);
    assert!(serde_json::from_value::<ContextContractRequest>(extra).is_err());
    let mut missing=bootstrap_request_value();missing.as_object_mut().unwrap().remove("scope_profile_id");
    assert!(serde_json::from_value::<ContextContractRequest>(missing).is_err());
    let mut encoding=bootstrap_request_value();encoding["context_encoding"]=json!("future-or-caller-codec");
    assert!(select_original_context_contract(Some(&serde_json::from_value(encoding).unwrap())).is_err());
}

#[test]
fn bootstrap_three_tools_are_literal_new_schemas_not_the_ordinary_first_three() {
    let tools=OriginalToolProfile::BootstrapReadonlyThree.offered_inventory().unwrap();
    assert_eq!(tools.as_array().unwrap().len(),3);
    assert_eq!(tools[0]["name"],"soloco_context_header");assert_eq!(tools[1]["name"],"soloco_context_read");assert_eq!(tools[2]["name"],"soloco_context_submit");
    assert_eq!(tools[0]["parameters"],json!({"type":"object","properties":{},"required":[],"additionalProperties":false}));
    assert_eq!(tools[1]["parameters"]["properties"]["length"],json!({"type":"integer","minimum":1,"maximum":4096}));
    assert_eq!(tools[2]["parameters"]["required"],json!(["sha256","content"]));
    assert!(tools[2]["parameters"]["properties"].get("operation_id").is_none());
    assert!(tools.as_array().unwrap().iter().all(|tool|tool["strict"]==false&&tool.get("inputSchema").is_none()));
    let ordinary=OriginalToolProfile::OrdinaryFive.offered_inventory().unwrap();
    let old_first_three=Value::Array(ordinary.as_array().unwrap()[..3].to_vec());
    assert_ne!(tools,old_first_three);
    assert!(offered(json!({"input":[],"tools":old_first_three}),OriginalToolProfile::BootstrapReadonlyThree).is_err());
    assert_eq!(OriginalToolProfile::BootstrapReadonlyThree.resource_sha256(),BOOTSTRAP_RESOURCE_SHA256);
}

#[test]
fn bootstrap_exact_catalog_accepts_both_original_forms_and_rejects_profile_inference() {
    let tools=OriginalToolProfile::BootstrapReadonlyThree.offered_inventory().unwrap();
    let root=json!({"input":[],"tools":tools.clone()});
    assert_eq!(offered(root.clone(),OriginalToolProfile::BootstrapReadonlyThree).unwrap(),tools);
    assert!(offered(root,OriginalToolProfile::OrdinaryFive).is_err());
    let namespace=json!({"input":[{"type":"additional_tools","id":"at_source_fixture","role":"developer",
        "tools":[{"type":"namespace","name":codex_protocol::DEFAULT_FUNCTION_NAMESPACE,"description":"","tools":tools.clone()}]}]});
    assert_eq!(offered(namespace.clone(),OriginalToolProfile::BootstrapReadonlyThree).unwrap(),tools);
    assert!(offered(namespace,OriginalToolProfile::OrdinaryFive).is_err());
    let ordinary=OriginalToolProfile::OrdinaryFive.offered_inventory().unwrap();
    assert!(offered(json!({"input":[],"tools":ordinary}),OriginalToolProfile::BootstrapReadonlyThree).is_err());
    for change in ["missing","extra","order","read","operation_id"] {
        let mut altered=tools.clone();match change {
            "missing"=>{altered.as_array_mut().unwrap().pop();}
            "extra"=>{let extra=altered[0].clone();altered.as_array_mut().unwrap().push(extra);}
            "order"=>altered.as_array_mut().unwrap().swap(0,1),
            "read"=>altered[1]["parameters"]["properties"]["length"]["maximum"]=json!(8192),
            _=>altered[2]["parameters"]["properties"]["operation_id"]=json!({"type":"string"}),
        }
        assert!(offered(json!({"input":[],"tools":altered}),OriginalToolProfile::BootstrapReadonlyThree).is_err(),"{change}");
    }
}

#[test]
fn bootstrap_whole_assignment_and_inner_cut_are_exact_raw_utf8_distinct_subjects() {
    let inner=r#"{"protocol":"peer-bootstrap-membership-context-v1","current_meaning":{"protocol":"peer-checked-input-current-meaning-v1","unknown":[false,null]},"large":9007199254740993,"lexeme":1.2300e+10,"unicode":"雪😀","surrogate":"\ud800","negative":[null,false,"UNKNOWN"]}"#;
    let (payload,text)=bootstrap_wire(inner);
    let decoded=frame::decode_bootstrap_frame(&text,BOOTSTRAP_RESOURCE_SHA256,100000).unwrap();
    assert_eq!(decoded.payload.as_bytes(),payload.as_bytes());assert_eq!(decoded.source_cut,Some(inner));
    assert_eq!(decoded.payload_utf8_bytes,payload.len());assert_eq!(decoded.source_cut_utf8_bytes,Some(inner.len()));
    assert_eq!(decoded.payload_sha256,hash(payload.as_bytes()));assert_eq!(decoded.source_cut_sha256.as_deref(),Some(hash(inner.as_bytes()).as_str()));
    assert_ne!(decoded.payload_sha256,decoded.source_cut_sha256.unwrap());
    let request=json!({"method":"turn/start","params":{"input":[{"type":"text","text":text}]}});
    assert!(validate_selected_turn_input(&request,Some(&bootstrap_selection())).is_ok());
    assert!(validate_selected_turn_input(&request,None).is_err());
}

#[test]
fn bootstrap_and_ordinary_membership_delivery_kinds_never_alias() {
    let inner=r#"{"protocol":"peer-bootstrap-membership-context-v1","current_meaning":{"protocol":"peer-checked-input-current-meaning-v1"}}"#;
    let (payload,text)=bootstrap_wire(inner);
    assert!(frame::decode_original_frame(&text,BOOTSTRAP_RESOURCE_SHA256,100000).is_err());
    let old_hash=bootstrap_frame(&payload,inner,RESOURCE_SHA256,"bootstrap-membership-assignment","peer-bootstrap-membership-assignment-v1");
    assert!(frame::decode_original_frame(&old_hash,RESOURCE_SHA256,100000).is_err());
    for (kind,protocol) in [("membership-assignment","peer-membership-assignment-v1"),("task-context","peer-task-context-v2")] {
        let altered=bootstrap_frame(&payload,inner,BOOTSTRAP_RESOURCE_SHA256,kind,protocol);
        assert!(frame::decode_bootstrap_frame(&altered,BOOTSTRAP_RESOURCE_SHA256,100000).is_err());
    }
    let turn=json!({"method":"turn/start","params":{"input":[{"type":"text","text":text}]}});
    assert!(validate_selected_turn_input(&turn,select_original_context_contract(Some(&request())).unwrap().as_ref()).is_err());
    assert!(frame::decode_bootstrap_frame(&old_hash,RESOURCE_SHA256,100000).is_err());
}

#[test]
fn bootstrap_hash_counts_prefix_duplicates_and_inner_protocol_fail_closed() {
    let inner=r#"{"protocol":"peer-bootstrap-membership-context-v1","current_meaning":{"protocol":"peer-checked-input-current-meaning-v1"},"raw":"雪"}"#;
    let (_,text)=bootstrap_wire(inner);
    assert!(frame::decode_bootstrap_frame(&text,BOOTSTRAP_RESOURCE_SHA256,text.len()-1).is_err());
    assert!(frame::decode_bootstrap_frame(&text,BOOTSTRAP_RESOURCE_SHA256,0).is_err());
    assert!(frame::decode_bootstrap_frame(&text,BOOTSTRAP_RESOURCE_SHA256,100001).is_err());
    for altered in [text.replace("雪","雨"),text.replace("\"payload\":","\"extra\":null,\"payload\":"),
        text.replace("\"payload\":","\"payload_utf8_bytes\":1,\"payload\":"),format!("{text} "),
        text.replacen("{\"protocol\":","{ \"protocol\":",1)] {
        assert!(frame::decode_bootstrap_frame(&altered,BOOTSTRAP_RESOURCE_SHA256,100000).is_err());
    }
    let wrong=r#"{"protocol":"peer-membership-context-v2"}"#;let (_,altered)=bootstrap_wire(wrong);
    assert!(frame::decode_bootstrap_frame(&altered,BOOTSTRAP_RESOURCE_SHA256,100000).is_err());
    let duplicate=r#"{"protocol":"peer-bootstrap-membership-context-v1","\u0070rotocol":"peer-bootstrap-membership-context-v1","current_meaning":{"protocol":"peer-checked-input-current-meaning-v1"}}"#;
    let (_,altered)=bootstrap_wire(duplicate);assert!(frame::decode_bootstrap_frame(&altered,BOOTSTRAP_RESOURCE_SHA256,100000).is_err());
}

#[test]
fn bootstrap_current_meaning_is_required_and_duplicate_decoded_keys_reject() {
    for inner in [r#"{"protocol":"peer-bootstrap-membership-context-v1"}"#,
        r#"{"protocol":"peer-bootstrap-membership-context-v1","current_meaning":null}"#,
        r#"{"protocol":"peer-bootstrap-membership-context-v1","current_meaning":{"protocol":"generic-meaning-v1"}}"#,
        r#"{"protocol":"peer-bootstrap-membership-context-v1","current_meaning":{"protocol":"peer-checked-input-current-meaning-v1","\u0070rotocol":"peer-checked-input-current-meaning-v1"}}"#,
        r#"{"protocol":"peer-bootstrap-membership-context-v1","current_meaning":{"protocol":"peer-checked-input-current-meaning-v1"},"\u0063urrent_meaning":{"protocol":"peer-checked-input-current-meaning-v1"}}"#] {
        let (_,text)=bootstrap_wire(inner);
        assert!(frame::decode_bootstrap_frame(&text,BOOTSTRAP_RESOURCE_SHA256,100000).is_err());
    }
}

#[test]
fn bootstrap_policy_payload_cap_is_not_the_ordinary_payload_ceiling() {
    let inner=format!("{{\"protocol\":\"peer-bootstrap-membership-context-v1\",\"current_meaning\":{{\"protocol\":\"peer-checked-input-current-meaning-v1\"}},\"opaque\":\"{}\"}}","x".repeat(65536));
    let (_,text)=bootstrap_wire(&inner);assert!(text.len()<100000);
    assert!(frame::decode_bootstrap_frame(&text,BOOTSTRAP_RESOURCE_SHA256,100000).is_err());
}

#[test]
fn old_five_tool_and_context_resource_bytes_remain_the_original_pins() {
    let old_tools=include_bytes!("../../protected_peer_responses_tools.json");
    assert_eq!(old_tools.len(),2038);assert_eq!(hash(old_tools),"04811953467e598da671fb72aafe202ee716a10c10dcf5497bd81f51729da5f1");
    assert_eq!(RESOURCE.len(),28656);assert_eq!(hash(RESOURCE),"832fdd1c965fa0e834c030f7c1e5636e2f32636b0df899ba8aa0fa940e9032fc");
    assert_eq!(OriginalToolProfile::OrdinaryFive.resource_sha256(),hash(old_tools));
}

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
