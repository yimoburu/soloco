//! Authored source tests only; no provider/native/test execution is implied.
use super::*;
use super::super::{SourceProvenance, hash};
use codex_history::ResponseItemEnvelope;
use codex_protocol::models::ResponseItem;
use serde_json::json;

#[derive(Debug)]
struct ControlledCoreOwner;

// These controlled API owners are unqualified doubles. The real Core renderer
// and private owner/normalization integration are exercised by Core's own tests.
fn controlled() -> (SourceRuntime, OriginalSessionIngress, Arc<CoreOwner>) {
    let runtime = SourceRuntime::new();
    let owner: Arc<CoreOwner> = Arc::new(ControlledCoreOwner);
    let ingress = runtime.original_session_ingress_for_core(owner.clone());
    (runtime, ingress, owner)
}

fn identity_wire(runtime: &SourceRuntime, owner: &Arc<CoreOwner>, capture: &OriginalInputCapture,
    projection: OriginalSessionInputProjection) -> OriginalSessionInputProjection {
    let provenance = SourceProvenance::from_original_session_input_capture(capture, projection, json!({}), Vec::new());
    runtime.bind_original_wire_projection(&provenance, owner.clone(), capture.serialized_input(),
        capture.serialized_input(), &json!({"scope":"unqualified controlled API identity-wire fixture"}))
        .unwrap().session_projection.unwrap()
}

fn typed(text: &str) -> Vec<UserInput> {
    vec![UserInput::Text { text: text.into(), text_elements: Vec::new() }]
}
fn envelope(text: &str, role: &str) -> ResponseItemEnvelope {
    ResponseItemEnvelope::new(serde_json::from_value::<ResponseItem>(json!({
        "type":"message", "role":role, "content":[{"type":"input_text","text":text}]
    })).unwrap())
}
fn user(text: &str) -> ResponseItemEnvelope {
    let mut envelope = envelope(text, "user");
    envelope.observe_original_user_input(&typed(text));
    envelope
}
fn receipt(envelope: &ResponseItemEnvelope) -> &OriginalItemReceipt {
    envelope.metadata.as_ref().unwrap().original_item_receipt.as_deref().unwrap()
}
fn capture(envelopes: &[ResponseItemEnvelope]) -> OriginalInputCapture {
    let mut projected = envelopes.to_vec();
    for envelope in &mut projected { envelope.observe_original_prompt_projection(); }
    let items = projected.iter().map(|envelope|envelope.item.clone()).collect::<Vec<_>>();
    OriginalInputCapture::from_original_projection(&projected, &items).unwrap()
}
fn body(capture: &OriginalInputCapture) -> Vec<u8> {
    body_array(capture.serialized_input())
}
fn body_array(input: &[u8]) -> Vec<u8> {
    let mut body = b"{\"model\":\"fixture-only\",\"input\":".to_vec();
    body.extend_from_slice(input);
    body.extend_from_slice(b",\"tools\":[]}");
    body
}
async fn accepted(ingress: &OriginalSessionIngress, order: u64, text: &str)
    -> (ResponseItemEnvelope, OriginalAcceptedInputWitness) {
    let input = typed(text);
    assert_eq!(ingress.observe_accepted_input(order, &input).await, Some(()));
    let envelope = user(text);
    let witness = ingress.bind_accepted_materialization(order, &input, receipt(&envelope)).await.unwrap();
    (envelope, witness)
}

#[tokio::test]
async fn original_session_text_projection_clears_only_its_observed_input_gaps() {
    let (runtime, ingress, _owner) = controlled();
    let (item, witness) = accepted(&ingress, 1, "quote\"\\\n雪").await;
    let capture = capture(&[item]);
    let projection = ingress.seal_original_projection(&capture, &[(0, witness)]).unwrap();
    projection.check_request(&runtime, &body(&capture)).unwrap();
    let value = SourceProvenance::from_original_session_input_capture(&capture, projection.clone(),
        json!({}), vec!["separate_catalog_hold".into()]);
    assert_eq!(value.original_sampling_input_sha256, hash(capture.serialized_input()));
    assert_eq!(value.unknown_origins, ["separate_catalog_hold"]);
    assert_eq!(value.sources["original_input_materialization"]["complete_original_origin_chain"], true);
    let wire = identity_wire(&runtime, &_owner, &capture, projection.clone());
    let guard = wire.lock_for_send(&runtime, &body(&capture)).await.unwrap();
    assert_eq!(guard.run(async { 42 }).await.unwrap(), 42);
    let serialized = serde_json::to_value(&value).unwrap();
    assert!(serialized.get("session_projection").is_none());
    assert!(!format!("{projection:?}").contains("雪"));
}

#[tokio::test]
async fn public_history_mints_and_order_numbers_are_not_an_admitted_session() {
    let (runtime, ingress, _owner) = controlled();
    let item = user("caller materialization");
    assert!(ingress.bind_accepted_materialization(1, &typed("caller materialization"), receipt(&item)).await.is_none());
    let capture = capture(&[item]);
    assert!(ingress.seal_original_projection(&capture, &[]).is_none());
    let value = SourceProvenance::from_original_input_capture(&capture, json!({"ready":true}), Vec::new());
    assert!(value.unknown_origins.iter().any(|reason|reason=="original_accepted_session_transport_binding_not_retained"));
    assert!(ingress.seal_original_projection(
        &OriginalInputCapture::from_original_projection(&[], &[]).unwrap(), &[]).is_none());
}

#[tokio::test]
async fn successful_bind_consumes_once_but_wrong_typed_input_does_not_consume_original() {
    let (runtime, ingress, _owner) = controlled();
    let input = typed("actual accepted");
    ingress.observe_accepted_input(7, &input).await.unwrap();
    let actual = user("actual accepted");
    let wrong = user("invented replacement");
    assert!(ingress.bind_accepted_materialization(7, &typed("invented replacement"), receipt(&wrong)).await.is_none());
    let witness = ingress.bind_accepted_materialization(7, &input, receipt(&actual)).await.unwrap();
    assert_eq!(witness.order(), 7);
    assert_eq!(witness.occurrence(), receipt(&actual).occurrence());
    assert!(ingress.bind_accepted_materialization(7, &input, receipt(&actual)).await.is_none());
    assert!(ingress.observe_accepted_input(7, &input).await.is_none());
    assert!(ingress.seal_original_projection(&capture(&[actual]), &[(0, witness)]).is_none());
}

#[tokio::test]
async fn foreign_session_and_rogue_runtime_cannot_supply_the_actual_runtime_proof() {
    let (runtime, ingress, _owner) = controlled();
    let other_session = runtime.original_session_ingress_for_core(_owner.clone());
    let (item, witness) = accepted(&ingress, 1, "original").await;
    let capture = capture(&[item]);
    assert!(other_session.seal_original_projection(&capture, &[(0, witness.clone())]).is_none());
    let projection = ingress.seal_original_projection(&capture, &[(0, witness)]).unwrap();
    let projection = identity_wire(&runtime, &_owner, &capture, projection);
    let rogue = SourceRuntime::new();
    assert!(projection.check_request(&rogue, &body(&capture)).is_err());
    assert!(projection.lock_for_send(&rogue, &body(&capture)).await.is_err());
    projection.check_request(&runtime, &body(&capture)).unwrap();
}

#[tokio::test]
async fn new_admission_revokes_old_projection_and_latest_order_must_be_present() {
    let (runtime, ingress, _owner) = controlled();
    let (first, first_witness) = accepted(&ingress, 1, "first").await;
    let first_capture = capture(std::slice::from_ref(&first));
    let projection = ingress.seal_original_projection(&first_capture, &[(0, first_witness.clone())]).unwrap();
    let projection = identity_wire(&runtime, &_owner, &first_capture, projection);
    let (second, second_witness) = accepted(&ingress, 2, "second").await;
    assert!(projection.check_request(&runtime, &body(&first_capture)).is_err());
    assert!(projection.lock_for_send(&runtime, &body(&first_capture)).await.is_err());
    assert!(ingress.seal_original_projection(&first_capture, &[(0, first_witness.clone())]).is_none());
    let both = capture(&[first, second]);
    assert!(ingress.seal_original_projection(&both, &[(0, first_witness.clone()),(1, first_witness.clone())]).is_none());
    let current = ingress.seal_original_projection(&both, &[(0, first_witness),(1, second_witness)]).unwrap();
    current.check_request(&runtime, &body(&both)).unwrap();
    let stale = SourceProvenance::from_original_session_input_capture(&first_capture, projection, json!({}), Vec::new());
    assert!(stale.session_projection.is_none());
    assert!(stale.unknown_origins.iter().any(|reason|reason=="original_accepted_session_transport_binding_not_retained"));
}

#[tokio::test]
async fn changed_materialization_projection_and_actual_prepared_input_stay_held() {
    let (runtime, ingress, _owner) = controlled();
    let (original, witness) = accepted(&ingress, 1, "original").await;
    let original_capture = capture(std::slice::from_ref(&original));
    let projection = ingress.seal_original_projection(&original_capture, &[(0, witness.clone())]).unwrap();
    let projection = identity_wire(&runtime, &_owner, &original_capture, projection);
    let mut changed = original.clone();
    changed.item = envelope("changed", "user").item;
    let changed_capture = capture(&[changed]);
    assert!(ingress.seal_original_projection(&changed_capture, &[(0, witness)]).is_none());
    assert!(projection.check_request(&runtime, &body(&changed_capture)).is_err());
    let wrong_cut = SourceProvenance::from_original_session_input_capture(&changed_capture, projection, json!({}), Vec::new());
    assert!(wrong_cut.session_projection.is_none());
    assert!(wrong_cut.unknown_origins.iter().any(|reason|reason=="input_message_to_rendered_source_spans_not_retained"));
}

#[tokio::test]
async fn persisted_metadata_drops_the_session_item_chain_and_restored_read_is_not_live_admission() {
    let (runtime, ingress, _owner) = controlled();
    let (item, witness) = accepted(&ingress, 1, "original").await;
    let encoded = serde_json::to_vec(item.metadata.as_ref().unwrap()).unwrap();
    let replay = ResponseItemEnvelope { item: item.item.clone(), metadata: Some(serde_json::from_slice(&encoded).unwrap()) };
    assert!(ingress.seal_original_projection(&capture(&[replay]), &[(0, witness.clone())]).is_none());
    let mut restored = ResponseItemEnvelope::new(item.item.clone());
    let line = serde_json::to_vec(&json!({"timestamp":"2026-11-10T00:00:00Z","type":"response_item","payload":item.item})).unwrap();
    restored.observe_original_rollout_read("/fixture-only/rollout.jsonl", 2, &line, None);
    assert!(ingress.seal_original_projection(&capture(&[restored]), &[(0, witness)]).is_none());
}

#[tokio::test]
async fn instruction_and_other_item_categories_do_not_become_complete_user_origin() {
    let (runtime, ingress, _owner) = controlled();
    let (item, witness) = accepted(&ingress, 1, "original").await;
    for role in ["developer", "assistant"] {
        let mut other = envelope("unsealed other source", role);
        other.observe_original_materialization();
        let cut = capture(&[item.clone(), other]);
        let projection = ingress.seal_original_projection(&cut, &[(0, witness.clone())]).unwrap();
        let value = SourceProvenance::from_original_session_input_capture(&cut, projection, json!({}), Vec::new());
        assert!(value.unknown_origins.iter().any(|reason|reason=="input_message_to_rendered_source_spans_not_retained"));
        assert_eq!(value.sources["original_input_materialization"]["complete_original_origin_chain"], false);
        let expected = if role=="developer" { "instruction_message_original_loader_chain_not_retained" }
            else { "non_user_input_original_producer_chain_not_retained" };
        assert!(value.unknown_origins.iter().any(|reason|reason==expected));
    }
}

#[tokio::test]
async fn closed_or_dropped_session_cannot_reuse_a_projection_or_poll_gateway() {
    let (runtime, ingress, _owner) = controlled();
    let (item, witness) = accepted(&ingress, 1, "original").await;
    let first_capture = capture(&[item]);
    let projection = ingress.seal_original_projection(&first_capture, &[(0, witness)]).unwrap();
    let projection = identity_wire(&runtime, &_owner, &first_capture, projection);
    let guard = projection.lock_for_send(&runtime, &body(&first_capture)).await.unwrap();
    drop(ingress);
    assert!(guard.run(async { panic!("closed Session must not poll the gateway") }).await.is_err());
    drop(guard);
    assert!(projection.check_request(&runtime, &body(&first_capture)).is_err());
    let another = runtime.original_session_ingress_for_core(_owner.clone());
    let (item, witness) = accepted(&another, 1, "new session").await;
    let capture = capture(&[item]);
    let projection = another.seal_original_projection(&capture, &[(0, witness)]).unwrap();
    another.close().await;
    assert!(projection.check_request(&runtime, &body(&capture)).is_err());
}

#[tokio::test]
async fn admission_revokes_before_waiting_for_original_send_read_fence() {
    let (runtime, ingress, _owner) = controlled();
    let (item, witness) = accepted(&ingress, 1, "first").await;
    let capture = capture(&[item]);
    let projection = ingress.seal_original_projection(&capture, &[(0, witness)]).unwrap();
    let projection = identity_wire(&runtime, &_owner, &capture, projection);
    let guard = projection.lock_for_send(&runtime, &body(&capture)).await.unwrap();
    let next_input = typed("second");
    let mut observe = Box::pin(ingress.observe_accepted_input(2, &next_input));
    assert!(futures::poll!(observe.as_mut()).is_pending());
    assert!(guard.run(async { panic!("new admission must prevent original send poll") }).await.is_err());
    drop(guard);
    observe.await.unwrap();
    assert!(projection.check_request(&runtime, &body(&capture)).is_err());
}

#[tokio::test]
async fn actual_responses_encoded_body_retains_exact_original_input_array_bytes() {
    let (runtime, ingress, _owner) = controlled();
    let (item, witness) = accepted(&ingress, 1, "quote\"\\\n雪").await;
    let capture = capture(std::slice::from_ref(&item));
    let projection = ingress.seal_original_projection(&capture, &[(0, witness)]).unwrap();
    let request = crate::common::ResponsesApiRequest {
        model:"fixture-only".into(), stream:true, service_tier:None, input:vec![item.item],
        tools:None, tool_choice:"auto".into(), parallel_tool_calls:false, reasoning:None,
        store:false, stream_options:None, include:Vec::new(), prompt_cache_key:None,
        text:None, client_metadata:None, access_programs:None,
    };
    // The actual endpoint uses EncodedJsonBody::encode(&ResponsesApiRequest),
    // then preserves those encoded bytes through Request::into_prepared.
    let encoded = codex_client::EncodedJsonBody::encode(&request).unwrap();
    projection.check_request(&runtime, encoded.as_bytes()).unwrap();
    let mut http = codex_client::Request::new(http::Method::POST, "https://fixture.invalid/responses".into());
    http.body = Some(codex_client::RequestBody::EncodedJson(encoded));
    let prepared = http.into_prepared().unwrap().prepare_body_for_send().unwrap();
    projection.check_request(&runtime, prepared.body.as_ref().unwrap()).unwrap();
}

#[tokio::test]
async fn exact_discard_releases_unsupported_pending_bytes_without_mint_or_order_reset() {
    let (runtime, ingress, _owner) = controlled();
    let input = vec![UserInput::LocalAudio { path:"/never-read/fixture.wav".into() }];
    ingress.observe_accepted_input(1, &input).await.unwrap();
    assert!(ingress.discard_unmaterialized_admission(1, &typed("wrong input")).await.is_none());
    assert_eq!(ingress.discard_unmaterialized_admission(1, &input).await, Some(()));
    assert!(ingress.discard_unmaterialized_admission(1, &input).await.is_none());
    assert!(ingress.observe_accepted_input(1, &typed("cannot reuse old order")).await.is_none());
    let (item, witness) = accepted(&ingress, 2, "later supported text").await;
    assert!(ingress.seal_original_projection(&capture(&[item]), &[(0,witness)]).is_some());
}

#[tokio::test]
async fn close_revokes_before_waiting_for_the_existing_send_read_fence() {
    let (runtime, ingress, _owner) = controlled();
    let (item, witness) = accepted(&ingress, 1, "original").await;
    let capture = capture(&[item]);
    let projection = ingress.seal_original_projection(&capture, &[(0,witness)]).unwrap();
    let projection = identity_wire(&runtime, &_owner, &capture, projection);
    let guard = projection.lock_for_send(&runtime, &body(&capture)).await.unwrap();
    let mut close = Box::pin(ingress.close());
    assert!(futures::poll!(close.as_mut()).is_pending());
    assert!(guard.run(async { panic!("closed owner must not poll send") }).await.is_err());
    drop(guard);
    close.await;
    assert!(projection.check_request(&runtime, &body(&capture)).is_err());
}

#[tokio::test]
async fn newly_accepted_input_wakes_and_cancels_an_already_pending_send() {
    let (runtime, ingress, _owner) = controlled();
    let (item, witness) = accepted(&ingress, 1, "original").await;
    let capture = capture(&[item]);
    let projection = ingress.seal_original_projection(&capture, &[(0,witness)]).unwrap();
    let projection = identity_wire(&runtime, &_owner, &capture, projection);
    let guard = projection.lock_for_send(&runtime, &body(&capture)).await.unwrap();
    let mut send = Box::pin(guard.run(std::future::pending::<()>()));
    assert!(futures::poll!(send.as_mut()).is_pending());
    let next = typed("steer while request is pending");
    let mut observe = Box::pin(ingress.observe_accepted_input(2, &next));
    assert!(futures::poll!(observe.as_mut()).is_pending());
    assert!(send.await.is_err());
    drop(guard);
    observe.await.unwrap();
    assert!(projection.check_request(&runtime, &body(&capture)).is_err());
}

fn generated(ingress: &OriginalSessionIngress, text: &str, role: &str, facts: &Value)
    -> (ResponseItemEnvelope, OriginalGeneratedInputWitness) {
    let mut item = envelope(text, role);
    item.observe_original_materialization();
    item.observe_original_prompt_projection();
    let witness = ingress.bind_original_generated_materialization(receipt(&item), facts).unwrap();
    (item, witness)
}

#[tokio::test]
async fn controlled_mixed_union_covers_generated_user_system_and_developer_without_readiness_flags() {
    let (_runtime, ingress, _owner) = controlled();
    let (input, accepted) = accepted(&ingress, 1, "accepted typed text").await;
    // DATA, not verdicts. These controlled witnesses are not real Core renderer
    // qualification; the actual private validator's integration tests live there.
    let facts = json!({"scope":"unqualified API generated fixture", "ready":false, "verdict":"deny", "protocol":"arbitrary data"});
    let (developer, developer_witness) = generated(&ingress, "retained developer render", "developer", &facts);
    let (user_fragment, user_witness) = generated(&ingress, "retained contextual user render", "user", &facts);
    let (system, system_witness) = generated(&ingress, "retained system render", "system", &facts);
    let cut = capture(&[developer, input, user_fragment, system]);
    assert!(cut.live_user_input_chain_unknown());
    let projection = ingress.seal_original_mixed_projection(&cut, &[(1,accepted)],
        &[(0,developer_witness),(2,user_witness),(3,system_witness)]).unwrap();
    let value = SourceProvenance::from_original_session_input_capture(&cut, projection,
        json!({}), vec!["existing_independent_hold".into()]);
    assert_eq!(value.unknown_origins, ["existing_independent_hold"]);
    assert_eq!(value.sources["original_input_materialization"]["complete_original_origin_chain"], true);
    let recorded = value.sources["original_input_materialization"]["original_generated_sources"].as_array().unwrap();
    assert_eq!(recorded.len(), 3);
    assert_eq!(recorded[0]["source_facts"], facts);
}

#[tokio::test]
async fn mixed_union_rejects_gaps_overlap_out_of_bounds_and_identical_text_occurrence_reuse() {
    let (_runtime, ingress, _owner) = controlled();
    let (input, accepted) = accepted(&ingress, 1, "accepted").await;
    let (first, first_witness) = generated(&ingress, "identical", "developer", &json!({}));
    let (second, second_witness) = generated(&ingress, "identical", "developer", &json!({}));
    let cut = capture(&[input,first,second]);
    assert!(cut.complete());
    assert!(ingress.seal_original_mixed_projection(&cut, &[(0,accepted.clone())], &[(1,first_witness.clone())]).is_none());
    assert!(ingress.seal_original_mixed_projection(&cut, &[(0,accepted.clone())],
        &[(0,first_witness.clone()),(1,first_witness.clone()),(2,second_witness.clone())]).is_none());
    assert!(ingress.seal_original_mixed_projection(&cut, &[(0,accepted.clone())],
        &[(1,first_witness.clone()),(3,second_witness.clone())]).is_none());
    assert!(ingress.seal_original_mixed_projection(&cut, &[(0,accepted.clone())],
        &[(1,first_witness.clone()),(2,first_witness.clone())]).is_none());
    assert!(ingress.seal_original_mixed_projection(&cut, &[],
        &[(1,first_witness.clone()),(2,second_witness.clone())]).is_none());
    assert!(ingress.seal_original_mixed_projection(&cut, &[(0,accepted)], &[(1,first_witness),(2,second_witness)]).is_some());
}

#[tokio::test]
async fn generated_binding_rejects_other_roles_admitted_receipts_restored_bytes_and_foreign_session() {
    let (runtime, ingress, _owner) = controlled();
    let (input, accepted) = accepted(&ingress, 1, "accepted").await;
    assert!(ingress.bind_original_generated_materialization(receipt(&input), &json!({"ready":true})).is_none());
    let mut assistant = envelope("not an original instruction renderer", "assistant");
    assistant.observe_original_materialization();
    assert!(ingress.bind_original_generated_materialization(receipt(&assistant), &json!({"ready":true})).is_none());
    let other_owner: Arc<CoreOwner> = Arc::new(ControlledCoreOwner);
    let foreign = runtime.original_session_ingress_for_core(other_owner.clone());
    let (instruction, foreign_witness) = generated(&foreign, "foreign renderer", "developer", &json!({}));
    let cut = capture(&[input,instruction.clone()]);
    assert!(ingress.seal_original_mixed_projection(&cut, &[(0,accepted)], &[(1,foreign_witness)]).is_none());
    let mut restored = ResponseItemEnvelope::new(instruction.item.clone());
    let line = serde_json::to_vec(&json!({"timestamp":"2026-11-10T00:00:00Z","type":"response_item","payload":instruction.item})).unwrap();
    restored.observe_original_rollout_read("/fixture-only/rollout.jsonl", 4, &line, None);
    assert!(ingress.bind_original_generated_materialization(receipt(&restored), &json!({"ready":true})).is_none());
}

#[tokio::test]
async fn changed_generated_projection_and_stale_latest_admission_do_not_reuse_a_mixed_seal() {
    let (_runtime, ingress, _owner) = controlled();
    let (input, accepted) = accepted(&ingress, 1, "accepted").await;
    let (mut instruction, generated_witness) = generated(&ingress, "original render", "developer", &json!({}));
    let original = capture(&[input.clone(),instruction.clone()]);
    let projection = ingress.seal_original_mixed_projection(&original, &[(0,accepted.clone())], &[(1,generated_witness.clone())]).unwrap();
    instruction.item = envelope("changed render", "developer").item;
    instruction.observe_original_prompt_projection();
    assert!(ingress.seal_original_mixed_projection(&capture(&[input,instruction]), &[(0,accepted.clone())], &[(1,generated_witness.clone())]).is_none());
    ingress.observe_accepted_input(2, &typed("new latest admission")).await.unwrap();
    assert!(!projection.matches_capture(&original));
    assert!(ingress.seal_original_mixed_projection(&original, &[(0,accepted)], &[(1,generated_witness)]).is_none());
}

#[tokio::test]
async fn final_consumption_requires_the_genuine_core_wire_join_even_for_identity_text() {
    let (runtime, ingress, owner) = controlled();
    let (input, witness) = accepted(&ingress, 1, "accepted").await;
    let cut = capture(&[input]);
    let projection = ingress.seal_original_projection(&cut, &[(0,witness)]).unwrap();
    projection.check_request(&runtime, &body(&cut)).unwrap(); // pre-wire component state only
    assert!(projection.check_final_request(&runtime, &body(&cut)).is_err());
    assert!(projection.lock_for_send(&runtime, &body(&cut)).await.is_err());
    let bound = identity_wire(&runtime, &owner, &cut, projection);
    bound.check_final_request(&runtime, &body(&cut)).unwrap();
    bound.lock_for_send(&runtime, &body(&cut)).await.unwrap();
}

#[tokio::test]
async fn wire_factory_preserves_all_old_holds_and_exact_after_bytes_without_interpreting_fact_verdicts() {
    let (runtime, ingress, owner) = controlled();
    let (input, witness) = accepted(&ingress, 1, "accepted").await;
    let cut = capture(&[input]);
    let projection = ingress.seal_original_projection(&cut, &[(0,witness)]).unwrap();
    let provenance = SourceProvenance::from_original_session_input_capture(&cut, projection, json!({}),
        vec!["existing_input_hold".into(),"base_instructions_original_renderer_chain_not_retained".into()]);
    // Only a controlled API transform double. The real Core helper independently
    // validates every permitted prefix and normalization before calling this API.
    let after = b"[ {\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"accepted\"}]} ]";
    let facts = json!({"scope":"unqualified API wire double","ready":true,"verdict":"Pass","unknown_origins":[]});
    let bound = runtime.bind_original_wire_projection(&provenance, owner, cut.serialized_input(), after, &facts).unwrap();
    assert_eq!(bound.unknown_origins, provenance.unknown_origins);
    assert_eq!(bound.original_sampling_input_sha256, hash(cut.serialized_input()));
    assert_eq!(bound.sources["original_wire_projection"]["source_facts"], facts);
    let projection = bound.session_projection.as_ref().unwrap();
    projection.check_final_request(&runtime, &body_array(after)).unwrap();
    assert!(projection.check_final_request(&runtime, &body(&cut)).is_err());
}

#[tokio::test]
async fn wire_binding_rejects_foreign_owner_runtime_parent_before_shape_and_rebinding() {
    let (runtime, ingress, owner) = controlled();
    let (input, witness) = accepted(&ingress, 1, "accepted").await;
    let cut = capture(&[input]);
    let projection = ingress.seal_original_projection(&cut, &[(0,witness)]).unwrap();
    let provenance = SourceProvenance::from_original_session_input_capture(&cut, projection, json!({}), Vec::new());
    let before = cut.serialized_input();
    let foreign_owner: Arc<CoreOwner> = Arc::new(ControlledCoreOwner);
    assert!(runtime.bind_original_wire_projection(&provenance, foreign_owner, before, before, &json!({"ready":true})).is_none());
    assert!(SourceRuntime::new().bind_original_wire_projection(&provenance, owner.clone(), before, before, &json!({"ready":true})).is_none());
    let mut changed_before = b" ".to_vec(); changed_before.extend_from_slice(before);
    assert!(runtime.bind_original_wire_projection(&provenance, owner.clone(), &changed_before, before, &json!({})).is_none());
    assert!(runtime.bind_original_wire_projection(&provenance, owner.clone(), before, b"{}", &json!({})).is_none());
    let unsealed = SourceProvenance::from_original_input_capture(&cut, json!({"ready":true}), Vec::new());
    assert!(runtime.bind_original_wire_projection(&unsealed, owner.clone(), before, before, &json!({})).is_none());
    let bound = runtime.bind_original_wire_projection(&provenance, owner.clone(), before, before, &json!({"ready":false})).unwrap();
    assert!(runtime.bind_original_wire_projection(&bound, owner, before, before, &json!({"ready":true})).is_none());
}

#[tokio::test]
async fn unbound_legacy_factory_missing_core_owner_and_stale_wire_parent_stay_held() {
    let runtime = SourceRuntime::new();
    let unbound = runtime.original_session_ingress();
    let (input, witness) = accepted(&unbound, 1, "unbound API admission").await;
    let cut = capture(&[input]);
    assert!(unbound.seal_original_projection(&cut, &[(0,witness)]).is_none());
    let mut unbound_generated = envelope("unbound renderer claim", "developer");
    unbound_generated.observe_original_materialization();
    assert!(unbound.bind_original_generated_materialization(receipt(&unbound_generated), &json!({"ready":true,"verdict":"Pass"})).is_none());

    let (runtime, ingress, owner) = controlled();
    let (input, witness) = accepted(&ingress, 1, "accepted").await;
    let cut = capture(&[input]);
    let projection = ingress.seal_original_projection(&cut, &[(0,witness)]).unwrap();
    let provenance = SourceProvenance::from_original_session_input_capture(&cut, projection.clone(), json!({}), Vec::new());
    ingress.observe_accepted_input(2, &typed("new admission")).await.unwrap();
    assert!(runtime.bind_original_wire_projection(&provenance, owner.clone(), cut.serialized_input(), cut.serialized_input(), &json!({})).is_none());
    drop(owner);
    assert!(!projection.matches_capture(&cut));
    assert!(projection.check_request(&runtime, &body(&cut)).is_err());
}

#[tokio::test]
async fn dropping_the_bound_core_owner_revokes_otherwise_current_sampling_and_wire() {
    let (runtime, ingress, owner) = controlled();
    let (input, witness) = accepted(&ingress, 1, "accepted").await;
    let cut = capture(&[input]);
    let projection = ingress.seal_original_projection(&cut, &[(0,witness)]).unwrap();
    assert!(projection.matches_capture(&cut));
    let wire = identity_wire(&runtime, &owner, &cut, projection.clone());
    let guard = wire.lock_for_send(&runtime, &body(&cut)).await.unwrap();
    drop(owner);
    assert!(!projection.matches_capture(&cut));
    assert!(wire.check_final_request(&runtime, &body(&cut)).is_err());
    assert!(guard.run(async { panic!("dropped private owner must not poll gateway") }).await.is_err());
    let held = SourceProvenance::from_original_session_input_capture(&cut, projection, json!({}), Vec::new());
    assert!(held.unknown_origins.iter().any(|reason|reason=="original_accepted_session_transport_binding_not_retained"));
}

#[tokio::test]
async fn identical_rendered_bytes_with_new_public_occurrences_cannot_replace_the_sealed_capture() {
    let (_runtime, ingress, _owner) = controlled();
    let (input, witness) = accepted(&ingress, 1, "same visible bytes").await;
    let original = capture(&[input]);
    let projection = ingress.seal_original_projection(&original, &[(0,witness)]).unwrap();
    let replacement = capture(&[user("same visible bytes")]);
    assert_eq!(replacement.serialized_input(), original.serialized_input());
    assert_ne!(replacement.spans()[0].receipt().unwrap().occurrence(), original.spans()[0].receipt().unwrap().occurrence());
    assert!(!projection.matches_capture(&replacement));
    let held = SourceProvenance::from_original_session_input_capture(&replacement, projection, json!({}), Vec::new());
    assert!(held.unknown_origins.iter().any(|reason|reason=="input_message_to_rendered_source_spans_not_retained"));
}

#[tokio::test]
async fn wire_binding_rejects_restored_or_deferred_inventory_and_misplaced_added_prefixes() {
    let (runtime, ingress, owner) = controlled();
    let (input, accepted) = accepted(&ingress, 1, "accepted").await;
    let additional = json!({"type":"additional_tools","id":"at_controlled_fixture","role":"developer","tools":[]});
    let mut deferred = ResponseItemEnvelope::new(serde_json::from_value(additional.clone()).unwrap());
    deferred.observe_original_materialization();
    let old = capture(&[deferred,input.clone()]);
    let old_projection = ingress.seal_original_projection(&old, &[(1,accepted.clone())]).unwrap();
    let old_provenance = SourceProvenance::from_original_session_input_capture(&old, old_projection, json!({}), Vec::new());
    assert!(runtime.bind_original_wire_projection(&old_provenance, owner.clone(), old.serialized_input(), old.serialized_input(), &json!({"ready":true})).is_none());
    let fresh = capture(&[input.clone()]);
    let projection = ingress.seal_original_projection(&fresh, &[(0,accepted)]).unwrap();
    let provenance = SourceProvenance::from_original_session_input_capture(&fresh, projection, json!({}), Vec::new());
    let misplaced = serde_json::to_vec(&json!([input.item.clone(),additional.clone()])).unwrap();
    let duplicate = serde_json::to_vec(&json!([additional.clone(),additional,input.item])).unwrap();
    for after in [misplaced,duplicate] {
        assert!(runtime.bind_original_wire_projection(&provenance, owner.clone(), fresh.serialized_input(), &after, &json!({"ready":true})).is_none());
    }
}
