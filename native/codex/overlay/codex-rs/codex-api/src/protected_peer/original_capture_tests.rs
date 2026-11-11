use super::*;
use codex_history::{OriginalInputCapture, ResponseItemEnvelope};
use codex_protocol::models::ResponseItem;

fn item(text: &str, role: &str) -> ResponseItem {
    serde_json::from_value(json!({"type":"message","role":role,
        "content":[{"type":"input_text","text":text}]})).unwrap()
}
fn capture(role: &str) -> OriginalInputCapture {
    let mut envelope = ResponseItemEnvelope::new(item("original", role));
    if role == "user" {
        envelope.observe_original_user_input(&[codex_protocol::user_input::UserInput::Text {
            text:"original".into(), text_elements:Vec::new(),
        }]);
    } else {
        envelope.observe_original_materialization();
    }
    envelope.observe_original_prompt_projection();
    OriginalInputCapture::from_original_projection(&[envelope.clone()], &[envelope.item.clone()]).unwrap()
}

#[test]
fn legacy_constructor_cannot_clear_mandatory_unknowns_using_json_flags() {
    let value = SourceProvenance::from_original_loaders("a".repeat(64),
        json!({"ready":true,"complete_occurrence_and_span_coverage":true}), Vec::new());
    assert!(value.unknown_origins.iter().any(|v|v=="input_message_to_rendered_source_spans_not_retained"));
    assert!(value.unknown_origins.iter().any(|v|v=="restored_history_instruction_origins_not_retained"));
}

#[test]
fn typed_live_cut_retains_physical_coverage_without_inventing_session_ingress() {
    let capture = capture("user");
    let value = SourceProvenance::from_original_input_capture(&capture, json!({}),
        vec!["synthetic_model_metadata_has_no_authoritative_catalog_origin".into()]);
    assert_eq!(value.original_sampling_input_sha256, hash(capture.serialized_input()));
    assert!(value.unknown_origins.iter().any(|v|v=="synthetic_model_metadata_has_no_authoritative_catalog_origin"));
    assert!(value.unknown_origins.iter().any(|v|v=="original_accepted_session_transport_binding_not_retained"));
    assert!(value.unknown_origins.iter().any(|v|v=="input_message_to_rendered_source_spans_not_retained"));
    assert_eq!(value.sources["original_input_materialization"]["complete_occurrence_and_span_coverage"], true);
    assert_eq!(value.sources["original_input_materialization"]["complete_original_origin_chain"], false);
}

#[test]
fn public_typed_mint_and_empty_capture_cannot_fabricate_original_session_authority() {
    for capture in [capture("user"), OriginalInputCapture::from_original_projection(&[], &[]).unwrap()] {
        let value = SourceProvenance::from_original_input_capture(&capture, json!({"ready":true}), Vec::new());
        assert!(value.unknown_origins.iter().any(|v|v=="original_accepted_session_transport_binding_not_retained"));
        assert!(value.unknown_origins.iter().any(|v|v=="input_message_to_rendered_source_spans_not_retained"));
        assert!(value.unknown_origins.iter().any(|v|v=="restored_history_instruction_origins_not_retained"));
        assert_eq!(value.sources["original_input_materialization"]["complete_original_origin_chain"], false);
    }
}

#[test]
fn instruction_materialization_without_upstream_loader_link_remains_held() {
    let value = SourceProvenance::from_original_input_capture(&capture("developer"), json!({}), Vec::new());
    assert!(value.unknown_origins.iter().any(|v|v=="instruction_message_original_loader_chain_not_retained"));
}

#[test]
fn missing_original_receipt_or_transformed_source_cannot_erase_unknowns() {
    let mut envelope = ResponseItemEnvelope::new(item("original", "user"));
    let missing = OriginalInputCapture::from_original_projection(&[envelope.clone()], &[envelope.item.clone()]).unwrap();
    let value = SourceProvenance::from_original_input_capture(&missing, json!({}), Vec::new());
    assert!(!value.unknown_origins.is_empty());
    envelope.observe_original_materialization();
    envelope.item = item("shortened", "user");
    envelope.observe_original_prompt_projection();
    let changed = OriginalInputCapture::from_original_projection(&[envelope.clone()], &[envelope.item.clone()]).unwrap();
    let value = SourceProvenance::from_original_input_capture(&changed, json!({}), Vec::new());
    assert!(value.unknown_origins.iter().any(|v|v=="input_projection_upstream_span_mapping_not_retained"));
}
