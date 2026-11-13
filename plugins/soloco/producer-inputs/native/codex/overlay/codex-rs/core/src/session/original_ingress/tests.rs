use super::*;
use codex_api::protected_peer::SourceRuntime;
use codex_protocol::models::ResponseItem;
use serde_json::json;

fn input(text: &str) -> Vec<UserInput> {
    vec![UserInput::Text { text:text.into(), text_elements:Vec::new() }]
}
fn envelope(text: &str) -> ResponseItemEnvelope {
    let item: ResponseItem = serde_json::from_value(json!({"type":"message","role":"user",
        "content":[{"type":"input_text","text":text}]})).unwrap();
    let mut envelope = ResponseItemEnvelope::new(item);
    envelope.observe_original_user_input(&input(text));
    envelope
}
fn isolated() -> (SessionIngress, SourceRuntime) {
    let runtime = SourceRuntime::new();
    let owner = Arc::new(OriginalSessionOwner { _private:() });
    let ingress = SessionIngress {
        original:runtime.original_session_ingress_for_core(owner.clone()),
        owner,
        admission:tokio::sync::Mutex::new(()),
    };
    (ingress, runtime)
}
fn cut(envelopes: &[ResponseItemEnvelope]) -> OriginalInputCapture {
    OriginalInputCapture::from_original_projection(envelopes,
        &envelopes.iter().map(|envelope|envelope.item.clone()).collect::<Vec<_>>()).unwrap()
}
async fn admitted(ingress: &SessionIngress, order: u64, text: &str) -> ResponseItemEnvelope {
    let mut envelope = envelope(text);
    ingress.observe_accepted(order, &input(text)).await;
    ingress.bind_materialization(Some(order), &input(text), &mut envelope).await;
    envelope.observe_original_prompt_projection();
    envelope
}

#[tokio::test]
async fn actual_session_private_owner_can_seal_its_observed_accepted_input() {
    // Uses the existing controlled Session constructor fixture. Its test auth
    // and model metadata are unqualified; no provider/native request is made.
    let (session, _) = crate::session::tests::make_session_and_context().await;
    let envelope = admitted(&session.original_ingress, 1, "original typed input").await;
    assert!(session.seal_original_session_input(&cut(&[envelope.clone()]), &[envelope]).is_some());
}

#[tokio::test]
async fn foreign_session_forwarding_and_lookalike_any_data_never_pass_private_core_owner() {
    let (original, _runtime) = isolated();
    let (foreign, _foreign_runtime) = isolated();
    let envelope = admitted(&original, 1, "same visible data").await;
    let genuine = envelope.clone();
    assert!(foreign.seal(&cut(&[envelope.clone()]), &[envelope.clone()]).is_none());
    let mut forged = envelope;
    forged.metadata.as_mut().unwrap().original_session_ingress = Some(
        OriginalProducerWitness::new(Arc::new(json!({"owner":"same","accepted":true,"order":1}))));
    assert!(original.seal(&cut(&[forged.clone()]), &[forged]).is_none());
    // Hold even with the identical API runtime/session state if its private
    // Core owner is different. This isolates the Core ownership check.
    let mut same_api_state = original;
    let retained_owner = same_api_state.owner.clone();
    same_api_state.owner = Arc::new(OriginalSessionOwner { _private:() });
    assert!(same_api_state.seal(&cut(&[genuine.clone()]), &[genuine.clone()]).is_none());
    same_api_state.owner = retained_owner;
    assert!(same_api_state.seal(&cut(&[genuine.clone()]), &[genuine]).is_some());
}

#[tokio::test]
async fn synthesized_recording_and_serialized_acceptance_order_cannot_issue_admission() {
    let (ingress, _runtime) = isolated();
    let mut synthetic = envelope("review prompt generated internally");
    // Same recorder shape as the synthetic review path: no actual admission.
    ingress.bind_materialization(None, &input("review prompt generated internally"), &mut synthetic).await;
    assert!(synthetic.metadata.as_ref().unwrap().original_session_ingress.is_none());
    ingress.bind_materialization(Some(7), &input("review prompt generated internally"), &mut synthetic).await;
    assert!(synthetic.metadata.as_ref().unwrap().original_session_ingress.is_none());
    assert!(ingress.seal(&cut(&[synthetic.clone()]), &[synthetic]).is_none());
}

#[tokio::test]
async fn one_accepted_occurrence_cannot_be_consumed_twice_or_rebuilt_from_replay() {
    let (ingress, _runtime) = isolated();
    let original = admitted(&ingress, 1, "accepted once").await;
    let mut duplicate = envelope("accepted once");
    ingress.bind_materialization(Some(1), &input("accepted once"), &mut duplicate).await;
    assert!(duplicate.metadata.as_ref().unwrap().original_session_ingress.is_none());
    let bytes = serde_json::to_vec(
        &codex_history::RolloutItem::ResponseItem(original.clone()),
    ).unwrap();
    let codex_history::RolloutItem::ResponseItem(mut restored) =
        serde_json::from_slice::<codex_history::RolloutItem>(&bytes).unwrap()
    else { panic!("expected persisted response item"); };
    assert!(restored.metadata.as_ref().is_none_or(|metadata|metadata.original_session_ingress.is_none()));
    restored.observe_original_user_input(&input("accepted once"));
    restored.observe_original_prompt_projection();
    ingress.bind_materialization(Some(1), &input("accepted once"), &mut restored).await;
    assert!(ingress.seal(&cut(&[restored.clone()]), &[restored]).is_none());
    assert!(ingress.seal(&cut(&[original.clone(), original.clone()]), &[original.clone(), original]).is_none());
}

#[tokio::test]
async fn different_typed_input_and_changed_projection_cannot_borrow_an_admission() {
    let (ingress, _runtime) = isolated();
    ingress.observe_accepted(1, &input("accepted original")).await;
    let mut changed = envelope("different typed content");
    ingress.bind_materialization(Some(1), &input("different typed content"), &mut changed).await;
    assert!(changed.metadata.as_ref().unwrap().original_session_ingress.is_none());
    let mut original = envelope("accepted original");
    ingress.bind_materialization(Some(1), &input("accepted original"), &mut original).await;
    original.item = envelope("later changed").item;
    original.observe_original_prompt_projection();
    assert!(ingress.seal(&cut(&[original.clone()]), &[original]).is_none());
}
