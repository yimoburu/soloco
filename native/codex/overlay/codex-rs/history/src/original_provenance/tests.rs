use super::*;
use crate::CodexHarnessMetadata;
use serde_json::json;

fn message(text: &str, role: &str) -> ResponseItem {
    serde_json::from_value(json!({"type":"message","role":role,
        "content":[{"type":"input_text","text":text}]})).unwrap()
}
fn live(text: &str) -> ResponseItemEnvelope {
    let mut item = ResponseItemEnvelope::new(message(text, "user"));
    item.observe_original_materialization();
    item.observe_original_prompt_projection();
    item
}

#[test]
fn exact_original_sampling_spans_preserve_escaped_utf8_bytes_and_distinct_occurrences() {
    let a = live("quote\"\\\n雪");
    let b = live("quote\"\\\n雪");
    let input = vec![a.item.clone(), b.item.clone()];
    let capture = OriginalInputCapture::from_original_projection(&[a, b], &input).unwrap();
    assert!(capture.complete());
    assert_eq!(capture.serialized_input(), serde_json::to_vec(&input).unwrap());
    assert_ne!(capture.spans()[0].receipt().unwrap().occurrence(), capture.spans()[1].receipt().unwrap().occurrence());
    for span in capture.spans() {
        let (start, end) = span.byte_range();
        assert_eq!(&capture.serialized_input()[start..end], serde_json::to_vec(&input[span.index()]).unwrap());
    }
}

#[test]
fn receipt_shaped_json_never_deserializes_original_authority() {
    let metadata: CodexHarnessMetadata = serde_json::from_value(json!({
        "original_item_receipt":{"occurrence":1,"complete":true,"materialized":"invented"}
    })).unwrap();
    assert!(metadata.original_item_receipt.is_none());
    let item = ResponseItemEnvelope { item: message("same", "user"), metadata: Some(metadata) };
    let capture = OriginalInputCapture::from_original_projection(&[item.clone()], &[item.item.clone()]).unwrap();
    assert!(!capture.complete());
}

#[test]
fn serialization_drops_runtime_receipt_and_generic_replay_remains_unknown() {
    let original = live("private original");
    let encoded = serde_json::to_value(original.metadata.as_ref().unwrap()).unwrap();
    assert!(encoded.get("original_item_receipt").is_none());
    let replayed = ResponseItemEnvelope { item: original.item.clone(),
        metadata: Some(serde_json::from_value(encoded).unwrap()) };
    let capture = OriginalInputCapture::from_original_projection(&[replayed.clone()], &[replayed.item.clone()]).unwrap();
    assert!(!capture.complete());
}

#[test]
fn missing_reordered_changed_and_duplicated_occurrences_do_not_prove_coverage() {
    let a = live("first");
    let b = live("second");
    assert!(!OriginalInputCapture::from_original_projection(&[a.clone()], &[a.item.clone(), b.item.clone()]).unwrap().complete());
    assert!(!OriginalInputCapture::from_original_projection(&[a.clone(), b.clone()], &[b.item.clone(), a.item.clone()]).unwrap().complete());
    assert!(!OriginalInputCapture::from_original_projection(&[a.clone()], &[message("changed", "user")]).unwrap().complete());
    assert!(!OriginalInputCapture::from_original_projection(&[a.clone(), a.clone()], &[a.item.clone(), a.item.clone()]).unwrap().complete());
}

#[test]
fn original_projection_retains_pre_truncation_materialization_and_later_changes_fail() {
    let mut item = live("complete original");
    item.item = message("short", "user");
    item.observe_original_prompt_projection();
    let capture = OriginalInputCapture::from_original_projection(&[item.clone()], &[item.item.clone()]).unwrap();
    assert!(capture.complete());
    let receipt = capture.spans()[0].receipt().unwrap();
    assert_eq!(receipt.original_materialized_bytes(), serde_json::to_vec(&message("complete original", "user")).unwrap());
    assert_ne!(receipt.original_materialized_bytes(), receipt.projected_bytes());
    assert!(!OriginalInputCapture::from_original_projection(&[item], &[message("later mutation", "user")]).unwrap().complete());
}

#[test]
fn real_read_payload_is_bound_to_the_decoded_item_but_not_promoted_to_old_instruction_ancestry() {
    let mut item = ResponseItemEnvelope::new(message("restored instruction", "developer"));
    let line = json!({"timestamp":"2026-11-10T00:00:00Z","type":"response_item","payload":item.item});
    let bytes = serde_json::to_vec(&line).unwrap();
    item.observe_original_rollout_read("/original/rollout.jsonl", 3, &bytes, None);
    item.observe_original_prompt_projection();
    let capture = OriginalInputCapture::from_original_projection(&[item.clone()], &[item.item.clone()]).unwrap();
    assert!(capture.complete());
    assert!(capture.restored_instruction_ancestry_unknown());
    let (_, line, read) = capture.spans()[0].receipt().unwrap().original_read().unwrap();
    assert_eq!(line, 3);
    assert_eq!(read, bytes);
    item.observe_original_rollout_read("/original/rollout.jsonl", 4, b"{}", None);
    assert!(item.metadata.unwrap().original_item_receipt.is_none());
}

#[test]
fn unknown_metadata_equality_and_debug_do_not_promote_or_expose_receipts() {
    let original = live("never dump this raw private text");
    let metadata = original.metadata.unwrap();
    assert_eq!(metadata, CodexHarnessMetadata::default());
    assert!(!format!("{:?}", metadata.original_item_receipt).contains("never dump"));
}

#[test]
fn accepted_original_user_input_is_retained_before_projection_and_not_inferred_from_role() {
    let input = vec![codex_protocol::user_input::UserInput::Text {
        text:"actual original".into(), text_elements:Vec::new(),
    }];
    let mut envelope = ResponseItemEnvelope::new(message("actual original", "user"));
    envelope.observe_original_user_input(&input);
    let occurrence = envelope.metadata.as_ref().unwrap().original_item_receipt.as_ref().unwrap().occurrence();
    envelope.observe_original_materialization();
    envelope.observe_original_prompt_projection();
    let capture = OriginalInputCapture::from_original_projection(&[envelope.clone()], &[envelope.item.clone()]).unwrap();
    assert!(capture.complete());
    assert!(!capture.live_user_input_chain_unknown());
    assert_eq!(capture.spans()[0].receipt().unwrap().occurrence(), occurrence);
    assert_eq!(capture.spans()[0].receipt().unwrap().original_user_input_bytes().unwrap(), serde_json::to_vec(&input).unwrap());
    let generic = live("actual original");
    let capture = OriginalInputCapture::from_original_projection(&[generic.clone()], &[generic.item.clone()]).unwrap();
    assert!(capture.live_user_input_chain_unknown());
    let mut wrong = ResponseItemEnvelope::new(message("different rendered text", "user"));
    wrong.observe_original_user_input(&input);
    assert!(wrong.metadata.unwrap().original_item_receipt.is_none());
    let mut developer = ResponseItemEnvelope::new(message("actual original", "developer"));
    developer.observe_original_user_input(&input);
    assert!(developer.metadata.unwrap().original_item_receipt.is_none());
}

#[test]
fn local_media_and_extension_inputs_never_trigger_a_second_materialization_read() {
    use codex_protocol::user_input::UserInput;
    for input in [
        UserInput::LocalImage { path:"/unobserved/image.png".into(), detail:None },
        UserInput::LocalAudio { path:"/unobserved/audio.wav".into() },
        UserInput::Skill { name:"unobserved".into(), path:"/unobserved/SKILL.md".into() },
        UserInput::Mention { name:"unobserved".into(), path:"app://unobserved".into() },
    ] {
        let mut envelope = live("preexisting receipt must be invalidated");
        envelope.observe_original_user_input(&[input]);
        assert!(envelope.metadata.unwrap().original_item_receipt.is_none());
    }
}

#[test]
fn opaque_runtime_witnesses_never_enter_json_or_change_history_value_equality() {
    let mut original = live("visible input");
    let before = original.clone();
    let secret = Arc::new(String::from("private runtime producer capsule"));
    let metadata = original.metadata.as_mut().unwrap();
    metadata.original_session_ingress = Some(OriginalProducerWitness::new(secret.clone()));
    metadata.original_instruction_rendering = Some(OriginalProducerWitness::new(secret));
    assert_eq!(original, before);
    let bytes = serde_json::to_vec(&crate::RolloutItem::ResponseItem(original.clone())).unwrap();
    assert!(!String::from_utf8_lossy(&bytes).contains("private runtime producer capsule"));
    let crate::RolloutItem::ResponseItem(replay) =
        serde_json::from_slice::<crate::RolloutItem>(&bytes).unwrap()
    else { panic!("expected persisted response item"); };
    assert!(replay.metadata.as_ref().is_none_or(|metadata|
        metadata.original_session_ingress.is_none() && metadata.original_instruction_rendering.is_none()));
    assert!(!format!("{:?}", original.metadata).contains("private runtime producer capsule"));
}
