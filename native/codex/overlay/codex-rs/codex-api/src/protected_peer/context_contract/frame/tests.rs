//! Authored UNRUN interoperability cases; no original process, FD or account.
use super::*;
use super::super::{RESOURCE_SHA256, select_original_context_contract, validate_selected_turn_input};
use serde_json::json;

fn framed(payload:&str,kind:&str,protocol:&str,cut:Option<(&str,&str)>) -> String {
    let (cut_protocol,cut_sha,cut_bytes)=match cut {
        Some((raw,protocol))=>(Some(protocol.to_string()),Some(hash(raw.as_bytes())),Some(raw.len())),
        None=>(None,None,None),
    };
    format!("{{\"protocol\":\"{FRAME_PROTOCOL}\",\"contract_sha256\":\"{RESOURCE_SHA256}\",\"delivery_kind\":\"{kind}\",\"payload_protocol\":\"{protocol}\",\"payload_sha256\":\"{}\",\"payload_utf8_bytes\":{},\"source_cut_protocol\":{},\"source_cut_sha256\":{},\"source_cut_utf8_bytes\":{},\"payload\":{payload}}}",
        hash(payload.as_bytes()),payload.len(),optional_string(cut_protocol.as_deref()),optional_string(cut_sha.as_deref()),cut_bytes.map(|n|n.to_string()).unwrap_or_else(||"null".into()))
}
fn encode(payload:&str,protocol:&str)->String { framed(payload,"task-context",protocol,None) }
fn assignment(inner:&str)->String {
    format!("{{\"protocol\":\"peer-membership-assignment-v1\",\"instructions\":\"The WHOLE original task\",\"source_cut\":{inner},\"source_cut_sha256\":\"{}\",\"recovery_history\":[{{\"old\":1e+21}}],\"unknown\":\"雪😀\"}}",hash(inner.as_bytes()))
}
fn member(inner:&str,protocol:&str)->(String,String) {
    let raw=assignment(inner);let text=framed(&raw,"membership-assignment","peer-membership-assignment-v1",Some((inner,protocol)));(raw,text)
}
fn selected() -> super::super::OriginalContextSelection {
    let request=serde_json::from_value(json!({"protocol":super::super::CONTRACT_PROTOCOL,
        "contract_id":super::super::CORE_ID,"resource_sha256":RESOURCE_SHA256,
        "context_encoding":super::super::ENCODING,"scope_profile_id":super::super::PROFILE})).unwrap();
    select_original_context_contract(Some(&request)).unwrap().unwrap()
}
fn payload() -> &'static str {
    r#"{"protocol":"peer-task-context-v2","opaque":{"large":1e+21,"small":0.000001,"unicode":"雪😀","escaped":"\ud800","unknown":[null,false,{"__proto__":"DATA"}]}}"#
}

#[test]
fn original_node_numeric_unicode_escape_and_unknown_value_bytes_are_unchanged() {
    let raw=payload();let text=encode(raw,"peer-task-context-v2");
    let decoded=decode_original_frame(&text,RESOURCE_SHA256,100_000).unwrap();
    assert_eq!(decoded.payload.as_bytes(),raw.as_bytes());
    assert_eq!(decoded.payload_sha256,hash(raw.as_bytes()));
    assert_eq!(decoded.payload_utf8_bytes,raw.len());
}

#[test]
fn raw_v1_frame_remains_explicit_and_exact() {
    let raw=r#"{"protocol":"peer-task-context-v1","unknown":"still raw"}"#;
    let text=encode(raw,"peer-task-context-v1");
    assert_eq!(decode_original_frame(&text,RESOURCE_SHA256,100_000).unwrap().payload,raw);
}

#[test]
fn frame_overhead_counts_without_clipping_or_raising_a_profile_limit() {
    let text=encode(payload(),"peer-task-context-v2");
    assert!(text.len()>payload().len());
    assert!(decode_original_frame(&text,RESOURCE_SHA256,text.len()-1).is_err());
    assert_eq!(decode_original_frame(&text,RESOURCE_SHA256,text.len()).unwrap().payload,payload());
    assert!(decode_original_frame(&text,RESOURCE_SHA256,0).is_err());
    assert!(decode_original_frame(&text,RESOURCE_SHA256,4_000_001).is_err());
}

#[test]
fn duplicate_unknown_reordered_whitespace_or_trailing_envelope_data_is_held() {
    let text=encode(payload(),"peer-task-context-v2");
    for altered in [text.replace("\"payload\":","\"extra\":1,\"payload\":"),
        text.replace("\"payload\":","\"payload_utf8_bytes\":1,\"payload\":"),
        format!("{text} "),text.replacen("{\"protocol\":","{ \"protocol\":",1),
        text.replacen("\"contract_sha256\":","\"not_contract_sha256\":",1)] {
        assert!(decode_original_frame(&altered,RESOURCE_SHA256,100_000).is_err());
    }
}

#[test]
fn equivalent_looking_numeric_lexeme_or_changed_hash_is_not_original_bytes() {
    let text=encode(payload(),"peer-task-context-v2");
    assert!(decode_original_frame(&text.replace("1e+21","1e21"),RESOURCE_SHA256,100_000).is_err());
    assert!(decode_original_frame(&text,&"a".repeat(64),100_000).is_err());
    assert!(decode_original_frame(&text.replace("雪","雨"),RESOURCE_SHA256,100_000).is_err());
}

#[test]
fn opaque_business_data_and_payload_whitespace_are_not_rust_normalized() {
    let raw=" \n{\"protocol\":\"peer-task-context-v2\",\"\\ud800\":{\"raw\":1.2300e+10},\"P5\":{\"unknown\":false}}\t ";
    let text=encode(raw,"peer-task-context-v2");
    let decoded=decode_original_frame(&text,RESOURCE_SHA256,100_000).unwrap();
    assert_eq!(decoded.payload,raw);
    // Accepting opaque bytes does not qualify this P5 value or original Node
    // semantics; those remain separate mandatory source and acceptance gates.
}

#[test]
fn payload_protocol_mismatch_nonobject_or_invalid_json_is_held() {
    for raw in [r#"{"protocol":"peer-task-context-v1"}"#,r#"["not an object"]"#,
        r#"{"protocol":"peer-task-context-v2""#,r#"{"protocol":true}"#] {
        let text=encode(raw,"peer-task-context-v2");
        assert!(decode_original_frame(&text,RESOURCE_SHA256,100_000).is_err());
    }
}

#[test]
fn unwrapped_membership_context_is_not_aliased_to_a_task_payload() {
    let raw=r#"{"protocol":"peer-membership-context-v2"}"#;
    assert!(decode_original_frame(&encode(raw,"peer-membership-context-v2"),RESOURCE_SHA256,100_000).is_err());
    assert!(decode_original_frame(&encode(raw,"peer-task-context-v2"),RESOURCE_SHA256,100_000).is_err());
}

#[test]
fn utf8_bytes_and_existing_context_upper_bound_are_enforced() {
    let text=encode(payload(),"peer-task-context-v2");
    let changed=text.replace(&format!("\"payload_utf8_bytes\":{}",payload().len()),
        &format!("\"payload_utf8_bytes\":{}",payload().chars().count()));
    assert!(decode_original_frame(&changed,RESOURCE_SHA256,100_000).is_err());
    let raw=format!("{{\"protocol\":\"peer-task-context-v2\",\"v\":\"{}\"}}","x".repeat(200_000));
    assert!(decode_original_frame(&encode(&raw,"peer-task-context-v2"),RESOURCE_SHA256,4_000_000).is_err());
}

#[test]
fn duplicate_top_level_protocol_values_are_rejected() {
    let raw=r#"{"protocol":"wrong","\ud800":"unknown data","protocol":"peer-task-context-v2"}"#;
    let text=encode(raw,"peer-task-context-v2");
    assert!(decode_original_frame(&text,RESOURCE_SHA256,100_000).is_err());
    let raw=r#"{"protocol":"peer-task-context-v2","protocol":null}"#;
    assert!(decode_original_frame(&encode(raw,"peer-task-context-v2"),RESOURCE_SHA256,100_000).is_err());
}

#[test]
fn selected_original_input_check_preserves_complete_request_without_global_lock() {
    let text=encode(payload(),"peer-task-context-v2");
    let request=json!({"method":"turn/start","params":{"input":[{"type":"text","text":"Original task instruction"},
        {"type":"text","text":text}]}});let original=request.clone();
    assert!(validate_selected_turn_input(&request,Some(&selected())).is_ok());
    assert_eq!(request,original);
}

#[test]
fn missing_or_multiple_context_frames_are_held_without_consuming_admission() {
    let selection=selected();let text=encode(payload(),"peer-task-context-v2");
    for input in [json!([]),json!([{"type":"text","text":"not a frame"}]),
        json!([{"type":"text","text":text.clone()},{"type":"text","text":text.clone()}])] {
        let request=json!({"method":"turn/start","params":{"input":input}});
        assert!(validate_selected_turn_input(&request,Some(&selection)).is_err());
    }
    // This is a pure validator: no ledger/clock/attempt/session API is present.
}

#[test]
fn legacy_absence_preserves_raw_input_but_cannot_alias_new_reserved_frame() {
    let raw=json!({"method":"turn/start","params":{"input":[{"type":"text","text":"Original raw-v1 input"}]}});
    assert!(validate_selected_turn_input(&raw,None).is_ok());
    let text=encode(payload(),"peer-task-context-v2");
    let framed=json!({"method":"turn/start","params":{"input":[{"type":"text","text":text}]}});
    assert!(validate_selected_turn_input(&framed,None).is_err());
}

#[test]
fn whole_membership_v1_v2_keep_whole_assignment_and_inner_cut_distinct() {
    for protocol in ["peer-membership-context-v1","peer-membership-context-v2"] {
        let inner=format!("{{\"protocol\":\"{protocol}\",\"raw\":1.2300e+10}}");let (raw,text)=member(&inner,protocol);
        let result=decode_original_frame(&text,RESOURCE_SHA256,100_000).unwrap();
        assert_eq!(result.payload,raw);assert_eq!(result.source_cut,Some(inner.as_str()));
        assert_eq!(result.payload_sha256,hash(raw.as_bytes()));assert_eq!(result.source_cut_sha256,Some(hash(inner.as_bytes())));
        assert_ne!(result.payload_sha256,result.source_cut_sha256.as_ref().unwrap().as_str());
        assert_eq!(result.payload_utf8_bytes,raw.len());assert_eq!(result.source_cut_utf8_bytes,Some(inner.len()));
        let request=json!({"method":"turn/start","params":{"input":[{"type":"text","text":text}]}});let before=request.clone();
        assert!(validate_selected_turn_input(&request,Some(&selected())).is_ok());assert_eq!(request,before);
    }
}

#[test]
fn inner_only_payload_cannot_replace_a_whole_assignment() {
    let inner=r#"{"protocol":"peer-membership-context-v2","homes":[]}"#;
    let text=framed(inner,"membership-assignment","peer-membership-assignment-v1",Some((inner,"peer-membership-context-v2")));
    assert!(decode_original_frame(&text,RESOURCE_SHA256,100_000).is_err());
}

#[test]
fn whole_inner_and_p1_row_reference_digests_are_not_interchangeable() {
    let inner=r#"{"protocol":"peer-membership-context-v2","value":1e+21}"#;let (raw,text)=member(inner,"peer-membership-context-v2");
    let whole=hash(raw.as_bytes());let cut=hash(inner.as_bytes());let row=hash(b"P1 ROW VALUE is a different subject from row.value.text");
    for changed in [text.replacen(&format!("\"payload_sha256\":\"{whole}\""),&format!("\"payload_sha256\":\"{cut}\""),1),
        text.replacen(&format!("\"payload_sha256\":\"{whole}\""),&format!("\"payload_sha256\":\"{row}\""),1),
        text.replacen(&format!("\"source_cut_sha256\":\"{cut}\""),&format!("\"source_cut_sha256\":\"{whole}\""),1)] {
        assert!(decode_original_frame(&changed,RESOURCE_SHA256,100_000).is_err());
    }
    assert!(decode_original_frame(&text.replace("The WHOLE original task",""),RESOURCE_SHA256,100_000).is_err());
}

#[test]
fn raw_inner_relation_uses_actual_outer_source_cut_sha_and_exact_span() {
    let inner="{\n \"protocol\":\"peer-membership-context-v2\",\"n\":1.2300e+10 }";let (raw,text)=member(inner,"peer-membership-context-v2");
    let result=decode_original_frame(&text,RESOURCE_SHA256,100_000).unwrap();assert_eq!(result.source_cut,Some(inner));
    let changed=raw.replace(&hash(inner.as_bytes()),&"a".repeat(64));
    let frame=framed(&changed,"membership-assignment","peer-membership-assignment-v1",Some((inner,"peer-membership-context-v2")));
    assert!(decode_original_frame(&frame,RESOURCE_SHA256,100_000).is_err());
}

#[test]
fn delivery_branch_and_inner_protocol_or_null_mismatches_are_held() {
    let raw=payload();assert!(decode_original_frame(&framed(raw,"task-context","peer-task-context-v2",Some((raw,"peer-membership-context-v2"))),RESOURCE_SHA256,100_000).is_err());
    let inner=r#"{"protocol":"peer-membership-context-v1"}"#;let raw=assignment(inner);
    for text in [framed(&raw,"membership-assignment","peer-membership-assignment-v1",None),
        framed(&raw,"membership-assignment","peer-membership-assignment-v1",Some((inner,"peer-membership-context-v2"))),
        framed(&raw,"task-context","peer-membership-assignment-v1",None)] {
        assert!(decode_original_frame(&text,RESOURCE_SHA256,100_000).is_err());
    }
}

#[test]
fn escaped_utf16_duplicate_outer_or_inner_selector_keys_are_rejected() {
    for raw in [r#"{"protocol":"peer-task-context-v2","pro\u0074ocol":"peer-task-context-v2"}"#,
        r#"{"protocol":"peer-task-context-v2","a":1,"\u0061":2}"#,
        r#"{"protocol":"peer-task-context-v2","\ud800":1,"\uD800":2}"#,
        r#"{"protocol":"peer-task-context-v2","😀":1,"\ud83d\ude00":2}"#] {
        assert!(decode_original_frame(&encode(raw,"peer-task-context-v2"),RESOURCE_SHA256,100_000).is_err());
    }
    let inner=r#"{"protocol":"peer-membership-context-v2","x":1,"\u0078":2}"#;
    let (_,text)=member(inner,"peer-membership-context-v2");assert!(decode_original_frame(&text,RESOURCE_SHA256,100_000).is_err());
}
