//! Authored UNRUN interoperability cases; no original process, FD or account.
use super::*;
use super::super::{RESOURCE_SHA256, select_original_context_contract, validate_selected_turn_input};
use serde_json::json;

// New fixed range/final-review families, AUTHORED_UNRUN. These are raw
// mechanical guards, never original admission, permission or closure evidence.
fn origin_framed(payload:&str,delivery:&str,protocol:&str,contract:&str,cut:Option<(&str,&str)>)->String {
    framed(payload,delivery,protocol,cut).replacen(RESOURCE_SHA256,contract,1)
}
fn origin_payload(kind:&str)->String {
    format!(r#"{{"protocol":"peer-origin-maintenance-context-v1","kind":"{kind}","opaque":{{"unsafe":9007199254740993,"lexeme":1.2300e+10,"unicode":"雪😀","escaped":"\ud800","\ud800":"literal lone key","negative":[null,false,"UNKNOWN"]}}}}"#)
}
fn owner_payload()->&'static str {
    r#"{"protocol":"peer-owner-maintenance-assignment-v1","kind":"owner-handover-review","fresh_review_purpose":"peer-owner-maintenance-fresh-purpose-v1","opaque":{"unsafe":9007199254740993,"escaped":"\ud800","unknown":false}}"#
}
#[test]
fn origin_whole_range_both_kinds_and_final_review_forms_preserve_exact_raw_data() {
    for kind in ["peer-origin-reconstruction","peer-origin-review"] {
        let payload=origin_payload(kind);let contract=super::super::ORIGIN_MAINTENANCE_RESOURCE_SHA256;
        let text=origin_framed(&payload,"origin-maintenance-assignment","peer-origin-maintenance-context-v1",contract,None);
        let decoded=decode_origin_maintenance_frame(&text,contract,100000).unwrap();
        assert_eq!(decoded.payload,payload);assert_eq!(decoded.payload_sha256,hash(payload.as_bytes()));assert_eq!(decoded.payload_utf8_bytes,payload.len());
        assert!(decoded.source_cut.is_none());assert!(decoded.source_cut_sha256.is_none());assert!(decoded.source_cut_utf8_bytes.is_none());
    }
    for (delivery,protocol,payload) in [
        ("origin-frontier-seal-assignment","peer-origin-frontier-seal-context-v1",r#"{"protocol":"peer-origin-frontier-seal-context-v1","kind":"peer-origin-frontier-seal-review","original_units":{"unsafe":9007199254740993,"escaped":"\ud800"}}"#),
        ("owner-maintenance-assignment","peer-owner-maintenance-assignment-v1",owner_payload())] {
        let contract=super::super::ORIGIN_FINAL_REVIEW_RESOURCE_SHA256;
        let text=origin_framed(payload,delivery,protocol,contract,None);
        let decoded=decode_origin_final_review_frame(&text,contract,100000).unwrap();assert_eq!(decoded.payload,payload);assert!(decoded.source_cut.is_none());
    }
}
#[test]
fn origin_constructor_family_rejects_old_delivery_even_with_replaced_resource_hash() {
    for (contract,profile) in [(super::super::ORIGIN_MAINTENANCE_RESOURCE_SHA256,super::super::OriginalToolProfile::OriginMaintenanceReadonlyThree),
        (super::super::ORIGIN_FINAL_REVIEW_RESOURCE_SHA256,super::super::OriginalToolProfile::OriginFinalReviewReadonlyThree)] {
        for (kind,protocol) in [("task-context","peer-task-context-v2"),("membership-assignment","peer-membership-assignment-v1"),
            ("bootstrap-membership-assignment","peer-bootstrap-membership-assignment-v1"),("input-frontier-assignment","peer-input-frontier-assignment-v1")] {
            let payload=format!("{{\"protocol\":\"{protocol}\"}}");let text=origin_framed(&payload,kind,protocol,contract,None);
            assert!(decode_selected_frame(&text,contract,100000,profile).is_err(),"{kind}");
        }
    }
    let payload=origin_payload("peer-origin-review");let range=origin_framed(&payload,"origin-maintenance-assignment","peer-origin-maintenance-context-v1",super::super::ORIGIN_MAINTENANCE_RESOURCE_SHA256,None);
    let owner=origin_framed(owner_payload(),"owner-maintenance-assignment","peer-owner-maintenance-assignment-v1",super::super::ORIGIN_FINAL_REVIEW_RESOURCE_SHA256,None);
    assert!(decode_origin_final_review_frame(&range,super::super::ORIGIN_MAINTENANCE_RESOURCE_SHA256,100000).is_err());
    assert!(decode_origin_maintenance_frame(&owner,super::super::ORIGIN_FINAL_REVIEW_RESOURCE_SHA256,100000).is_err());
    let cross=owner.replacen(super::super::ORIGIN_FINAL_REVIEW_RESOURCE_SHA256,super::super::ORIGIN_MAINTENANCE_RESOURCE_SHA256,1);
    assert!(decode_origin_maintenance_frame(&cross,super::super::ORIGIN_MAINTENANCE_RESOURCE_SHA256,100000).is_err());
}
#[test]
fn origin_fixed_kind_and_fresh_owner_purpose_selectors_cannot_be_relabelled() {
    let range_hash=super::super::ORIGIN_MAINTENANCE_RESOURCE_SHA256;
    for kind in ["task","input-frontier-review","owner-handover-review","peer-origin-frontier-seal-review"] {
        let payload=origin_payload(kind);let text=origin_framed(&payload,"origin-maintenance-assignment","peer-origin-maintenance-context-v1",range_hash,None);
        assert!(decode_origin_maintenance_frame(&text,range_hash,100000).is_err(),"{kind}");
    }
    let hash=super::super::ORIGIN_FINAL_REVIEW_RESOURCE_SHA256;
    for payload in [owner_payload().replace("peer-owner-maintenance-fresh-purpose-v1","peer-owner-maintenance-assignment-v1"),
        owner_payload().replace(",\"fresh_review_purpose\":\"peer-owner-maintenance-fresh-purpose-v1\"",""),
        owner_payload().replace("owner-handover-review","peer-origin-frontier-seal-review")] {
        let text=origin_framed(&payload,"owner-maintenance-assignment","peer-owner-maintenance-assignment-v1",hash,None);
        assert!(decode_origin_final_review_frame(&text,hash,100000).is_err());
    }
    let wrong=r#"{"protocol":"peer-origin-frontier-seal-context-v1","kind":"owner-handover-review","fresh_review_purpose":"peer-owner-maintenance-fresh-purpose-v1"}"#;
    let text=origin_framed(wrong,"origin-frontier-seal-assignment","peer-origin-frontier-seal-context-v1",hash,None);
    assert!(decode_origin_final_review_frame(&text,hash,100000).is_err());
}
#[test]
fn origin_escaped_selectors_accept_but_duplicate_decoded_selector_keys_hold() {
    let contract=super::super::ORIGIN_FINAL_REVIEW_RESOURCE_SHA256;
    let escaped=r#" {"pro\u0074ocol":"peer-owner-maintenance-assignment-v1","k\u0069nd":"owner-handover-review","fresh_review_purpose":"peer-owner-maintenance-fresh-purpose-v1","opaque":"\ud800"} "#;
    let text=origin_framed(escaped,"owner-maintenance-assignment","peer-owner-maintenance-assignment-v1",contract,None);
    assert_eq!(decode_origin_final_review_frame(&text,contract,100000).unwrap().payload,escaped);
    for duplicate in [r#", "\u006bind":"owner-handover-review""#,r#", "\u0066resh_review_purpose":"peer-owner-maintenance-fresh-purpose-v1""#,r#", "\u0070rotocol":"peer-owner-maintenance-assignment-v1""#] {
        let payload=format!("{}{}{}",&owner_payload()[..owner_payload().len()-1],duplicate,"}");
        let text=origin_framed(&payload,"owner-maintenance-assignment","peer-owner-maintenance-assignment-v1",contract,None);
        assert!(decode_origin_final_review_frame(&text,contract,100000).is_err());
    }
}
#[test]
fn origin_new_deliveries_require_null_inner_cut_and_exact_hash_length_envelope() {
    let contract=super::super::ORIGIN_MAINTENANCE_RESOURCE_SHA256;let payload=origin_payload("peer-origin-reconstruction");
    let text=origin_framed(&payload,"origin-maintenance-assignment","peer-origin-maintenance-context-v1",contract,None);
    let inner=r#"{"protocol":"peer-membership-context-v2"}"#;
    let inner_text=origin_framed(&payload,"origin-maintenance-assignment","peer-origin-maintenance-context-v1",contract,Some((inner,"peer-membership-context-v2")));
    assert!(decode_origin_maintenance_frame(&inner_text,contract,100000).is_err());
    for changed in [text.replace("9007199254740993","9007199254740992"),
        text.replacen(&format!("\"payload_utf8_bytes\":{}",payload.len()),&format!("\"payload_utf8_bytes\":{}",payload.len()-1),1),
        text.replacen("\"source_cut_protocol\":null","\"source_cut_protocol\":\"peer-origin-maintenance-context-v1\"",1),
        text.replacen("\"protocol\":\"soloco-peer-context-frame-v2\"","\"protocol\":\"soloco-peer-context-frame-v1\"",1),
        format!("{} ",text),text.replacen("{","{\"ready\":true,",1)] {
        assert!(decode_origin_maintenance_frame(&changed,contract,100000).is_err());
    }
}
#[test]
fn origin_new_payload_and_total_frame_caps_remain_separate_fixed_bounds() {
    for (delivery,protocol,kind,contract,profile) in [
        ("origin-maintenance-assignment","peer-origin-maintenance-context-v1","peer-origin-review",super::super::ORIGIN_MAINTENANCE_RESOURCE_SHA256,super::super::OriginalToolProfile::OriginMaintenanceReadonlyThree),
        ("origin-frontier-seal-assignment","peer-origin-frontier-seal-context-v1","peer-origin-frontier-seal-review",super::super::ORIGIN_FINAL_REVIEW_RESOURCE_SHA256,super::super::OriginalToolProfile::OriginFinalReviewReadonlyThree)] {
        let prefix=format!("{{\"protocol\":\"{protocol}\",\"kind\":\"{kind}\",\"opaque\":\"");let suffix="\"}";
        for size in [65536,65537] {
            let payload=format!("{prefix}{}{suffix}","x".repeat(size-prefix.len()-suffix.len()));
            let text=origin_framed(&payload,delivery,protocol,contract,None);
            assert_eq!(decode_selected_frame(&text,contract,100000,profile).is_ok(),size==65536);
            if size==65536 {assert!(decode_selected_frame(&text,contract,text.len(),profile).is_ok());assert!(decode_selected_frame(&text,contract,text.len()-1,profile).is_err());}
        }
        let payload=format!("{{\"protocol\":\"{protocol}\",\"kind\":\"{kind}\"}}");let text=origin_framed(&payload,delivery,protocol,contract,None);
        assert!(decode_selected_frame(&text,contract,0,profile).is_err());
        if profile==super::super::OriginalToolProfile::OriginMaintenanceReadonlyThree {assert!(decode_origin_maintenance_frame(&text,contract,100001).is_err());}
        else {assert!(decode_origin_final_review_frame(&text,contract,100001).is_err());}
    }
}

// Additive frontier cases: AUTHORED_UNRUN, mechanical SOURCE controls only.
fn frontier_framed(payload:&str,protocol:&str,cut:Option<(&str,&str)>)->String {
    framed(payload,"input-frontier-assignment",protocol,cut)
        .replacen(RESOURCE_SHA256,super::super::FRONTIER_RESOURCE_SHA256,1)
}
fn frontier_payload()->&'static str {
    r#"{"protocol":"peer-input-frontier-assignment-v1","subject":{"kind":"extract","stage":"produce"},"opaque":{"number":9007199254740993,"lexeme":1.2300e+10,"unicode":"雪😀","escaped":"\ud800","negative":[null,false,"UNKNOWN"]}}"#
}

#[test]
fn frontier_preserves_exact_whole_raw_assignment_without_a_synthetic_inner_cut() {
    let payload=frontier_payload();let text=frontier_framed(payload,"peer-input-frontier-assignment-v1",None);
    let decoded=decode_input_frontier_frame(&text,super::super::FRONTIER_RESOURCE_SHA256,100000).unwrap();
    assert_eq!(decoded.payload.as_bytes(),payload.as_bytes());assert_eq!(decoded.payload_utf8_bytes,payload.len());
    assert_eq!(decoded.payload_sha256,hash(payload.as_bytes()));
    assert!(decoded.source_cut.is_none());assert!(decoded.source_cut_sha256.is_none());
    assert!(decoded.source_cut_utf8_bytes.is_none());
    let escaped=r#" {"pro\u0074ocol":"\u0070eer-input-frontier-assignment-v1","raw":1.2300e+10,"unknown":false} "#;
    let text=frontier_framed(escaped,"peer-input-frontier-assignment-v1",None);
    assert_eq!(decode_input_frontier_frame(&text,super::super::FRONTIER_RESOURCE_SHA256,100000).unwrap().payload,escaped);
}

#[test]
fn frontier_never_aliases_task_ordinary_membership_bootstrap_or_an_inner_cut() {
    let payload=frontier_payload();let text=frontier_framed(payload,"peer-input-frontier-assignment-v1",None);
    assert!(decode_original_frame(&text,super::super::FRONTIER_RESOURCE_SHA256,100000).is_err());
    assert!(decode_bootstrap_frame(&text,super::super::FRONTIER_RESOURCE_SHA256,100000).is_err());
    for (kind,protocol) in [("task-context","peer-task-context-v2"),
        ("membership-assignment","peer-membership-assignment-v1"),
        ("bootstrap-membership-assignment","peer-bootstrap-membership-assignment-v1")] {
        let changed=text.replace("\"delivery_kind\":\"input-frontier-assignment\"",&format!("\"delivery_kind\":\"{kind}\""))
            .replace("\"payload_protocol\":\"peer-input-frontier-assignment-v1\"",&format!("\"payload_protocol\":\"{protocol}\""));
        assert!(decode_input_frontier_frame(&changed,super::super::FRONTIER_RESOURCE_SHA256,100000).is_err());
    }
    let inner=r#"{"protocol":"peer-bootstrap-membership-context-v1"}"#;
    let changed=frontier_framed(payload,"peer-input-frontier-assignment-v1",Some((inner,"peer-bootstrap-membership-context-v1")));
    assert!(decode_input_frontier_frame(&changed,super::super::FRONTIER_RESOURCE_SHA256,100000).is_err());
    assert!(decode_input_frontier_frame(&text,RESOURCE_SHA256,100000).is_err());
    assert!(decode_input_frontier_frame(&text,super::super::BOOTSTRAP_RESOURCE_SHA256,100000).is_err());
}

#[test]
fn frontier_closed_envelope_and_duplicate_decoded_assignment_keys_are_held() {
    let text=frontier_framed(frontier_payload(),"peer-input-frontier-assignment-v1",None);
    for changed in [text.replace("\"payload\":","\"extra\":null,\"payload\":"),
        text.replace("\"payload\":","\"payload_utf8_bytes\":1,\"payload\":"),
        text.replacen("{\"protocol\":","{ \"protocol\":",1),format!("{text} "),
        text.replace("\"source_cut_protocol\":null,","")] {
        assert!(decode_input_frontier_frame(&changed,super::super::FRONTIER_RESOURCE_SHA256,100000).is_err());
    }
    for payload in [r#"{"protocol":"peer-input-frontier-assignment-v1","\u0070rotocol":"peer-input-frontier-assignment-v1"}"#,
        r#"{"protocol":"peer-input-frontier-assignment-v1","scope":false,"\u0073cope":false}"#,
        r#"{"protocol":"peer-input-frontier-assignment-v1","protocol":null}"#,
        r#"{"protocol":"peer-task-context-v2"}"#,
        r#"{"protocol":true}"#,r#"["frontier"]"#,
        r#"{"protocol":"peer-input-frontier-assignment-v1""#] {
        let changed=frontier_framed(payload,"peer-input-frontier-assignment-v1",None);
        assert!(decode_input_frontier_frame(&changed,super::super::FRONTIER_RESOURCE_SHA256,100000).is_err());
    }
}

#[test]
fn frontier_hash_and_utf8_byte_counts_do_not_normalize_opaque_data() {
    let payload=frontier_payload();let text=frontier_framed(payload,"peer-input-frontier-assignment-v1",None);
    for changed in [text.replace("雪","雨"),text.replace("1.2300e+10","1.23e10"),
        text.replace(&format!("\"payload_utf8_bytes\":{}",payload.len()),
            &format!("\"payload_utf8_bytes\":{}",payload.chars().count())),
        text.replacen(&hash(payload.as_bytes()),&"f".repeat(64),1)] {
        assert!(decode_input_frontier_frame(&changed,super::super::FRONTIER_RESOURCE_SHA256,100000).is_err());
    }
}

#[test]
fn frontier_payload_and_whole_frame_limits_are_separate_and_not_raised_to_ordinary() {
    let hash=super::super::FRONTIER_RESOURCE_SHA256;
    let text=frontier_framed(frontier_payload(),"peer-input-frontier-assignment-v1",None);
    assert!(decode_input_frontier_frame(&text,hash,text.len()).is_ok());
    assert!(decode_input_frontier_frame(&text,hash,text.len()-1).is_err());
    assert!(decode_input_frontier_frame(&text,hash,0).is_err());
    assert!(decode_input_frontier_frame(&text,hash,100001).is_err());
    let prefix="{\"protocol\":\"peer-input-frontier-assignment-v1\",\"opaque\":\"";
    let suffix="\"}";
    for size in [65536usize,65537] {
        let payload=format!("{prefix}{}{suffix}","x".repeat(size-prefix.len()-suffix.len()));
        assert_eq!(payload.len(),size);
        let text=frontier_framed(&payload,"peer-input-frontier-assignment-v1",None);
        assert!(text.len()<100000);
        assert_eq!(decode_input_frontier_frame(&text,hash,100000).is_ok(),size==65536);
    }
}

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


// Ordinary-origin raw wire cases, AUTHORED_UNRUN. Original business values
// stay byte-exact DATA; none of these codec fixtures claims Native authority.
fn ordinary_origin_framed(payload:&str)->String {
    origin_framed(payload,"origin-ordinary-task-assignment","peer-origin-ordinary-task-context-v1",super::super::ORIGIN_ORDINARY_TASK_RESOURCE_SHA256,None)
}
#[test]
fn ordinary_origin_frame_preserves_complete_opaque_raw_values() {
    let payload=r#" {"pro\u0074ocol":"peer-origin-ordinary-task-context-v1","k\u0069nd":"peer-origin-ordinary-task-review","raw":{"n":9007199254740993,"lexeme":1.2300e+10,"unknown":"UNKNOWN","escaped":"\ud800","unicode":"雪😀"}} "#;
    let text=ordinary_origin_framed(payload);let contract=super::super::ORIGIN_ORDINARY_TASK_RESOURCE_SHA256;
    let decoded=decode_origin_ordinary_task_frame(&text,contract,100000).unwrap();
    assert_eq!(decoded.payload,payload);assert_eq!(decoded.payload_utf8_bytes,payload.len());assert_eq!(decoded.payload_sha256,hash(payload.as_bytes()));
    assert!(decoded.source_cut.is_none());assert!(decoded.source_cut_sha256.is_none());
}
#[test]
fn ordinary_origin_frame_rejects_relabelled_old_purposes_and_inner_cuts() {
    let contract=super::super::ORIGIN_ORDINARY_TASK_RESOURCE_SHA256;
    for kind in ["peer-origin-frontier-seal-review","peer-origin-review","owner-handover-review","input-frontier-review","task"] {
        let raw=format!(r#"{{"protocol":"peer-origin-ordinary-task-context-v1","kind":"{kind}"}}"#);
        assert!(decode_origin_ordinary_task_frame(&ordinary_origin_framed(&raw),contract,100000).is_err());
    }
    for (delivery,protocol) in [("origin-frontier-seal-assignment","peer-origin-frontier-seal-context-v1"),("origin-maintenance-assignment","peer-origin-maintenance-context-v1"),("owner-maintenance-assignment","peer-owner-maintenance-assignment-v1")] {
        let raw=format!(r#"{{"protocol":"{protocol}","kind":"peer-origin-ordinary-task-review"}}"#);
        let text=origin_framed(&raw,delivery,protocol,contract,None);
        assert!(decode_origin_ordinary_task_frame(&text,contract,100000).is_err());
    }
    let raw=r#"{"protocol":"peer-origin-ordinary-task-context-v1","kind":"peer-origin-ordinary-task-review"}"#;
    let text=origin_framed(raw,"origin-ordinary-task-assignment","peer-origin-ordinary-task-context-v1",contract,Some((raw,"peer-origin-ordinary-task-context-v1")));
    assert!(decode_origin_ordinary_task_frame(&text,contract,100000).is_err());
}
#[test]
fn ordinary_origin_duplicate_selector_and_changed_body_or_envelope_hold() {
    let contract=super::super::ORIGIN_ORDINARY_TASK_RESOURCE_SHA256;
    for raw in [r#"{"protocol":"peer-origin-ordinary-task-context-v1","pro\u0074ocol":"peer-origin-ordinary-task-context-v1","kind":"peer-origin-ordinary-task-review"}"#,
        r#"{"protocol":"peer-origin-ordinary-task-context-v1","kind":"peer-origin-ordinary-task-review","k\u0069nd":"peer-origin-ordinary-task-review"}"#] {
        assert!(decode_origin_ordinary_task_frame(&ordinary_origin_framed(raw),contract,100000).is_err());
    }
    let raw=r#"{"protocol":"peer-origin-ordinary-task-context-v1","kind":"peer-origin-ordinary-task-review","value":1}"#;
    let frame=ordinary_origin_framed(raw);
    for changed in [frame.replace("\"value\":1","\"value\":2"),frame.replacen("\"source_cut_sha256\":null","\"source_cut_sha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"",1),format!("{frame} ")] {
        assert!(decode_origin_ordinary_task_frame(&changed,contract,100000).is_err());
    }
    assert!(decode_origin_final_review_frame(&frame,contract,100000).is_err());
}
#[test]
fn ordinary_origin_raw_capacity_and_frame_capacity_are_both_enforced() {
    let contract=super::super::ORIGIN_ORDINARY_TASK_RESOURCE_SHA256;
    let prefix=r#"{"protocol":"peer-origin-ordinary-task-context-v1","kind":"peer-origin-ordinary-task-review","raw":""#;let suffix="\"}";
    for size in [65536,65537] {
        let payload=format!("{prefix}{}{suffix}","x".repeat(size-prefix.len()-suffix.len()));let text=ordinary_origin_framed(&payload);
        assert_eq!(decode_origin_ordinary_task_frame(&text,contract,100000).is_ok(),size==65536);
        if size==65536 {assert!(decode_origin_ordinary_task_frame(&text,contract,text.len()).is_ok());assert!(decode_origin_ordinary_task_frame(&text,contract,text.len()-1).is_err());}
        assert!(decode_origin_ordinary_task_frame(&text,contract,0).is_err());assert!(decode_origin_ordinary_task_frame(&text,contract,100001).is_err());
    }
}
