use super::*;
use codex_history::OriginalInputCapture;
use serde_json::json;

#[tokio::test]
async fn actual_typed_admission_and_recording_qualifies_only_the_protected_session_path() {
    let (session, turn) = crate::session::tests::make_session_and_context().await;
    let pending = pending_turn_input(&session,
        SubmittedTurnInput::UserInput {
            content:vec![UserInput::Text { text:"original admitted input".into(), text_elements:Vec::new() }],
            client_id:None,
        }, None, &turn.sub_id, UserInputMetadata::default()).await;
    let TurnInput::UserInput { content, client_id, metadata } = pending else { panic!("expected typed input"); };
    session.record_user_prompt_and_emit_turn_item(&turn, turn.model_info(), &content, client_id,
        metadata, codex_thread_store::PersistContext::Standard).await;
    let history = session.clone_history().await;
    let envelopes = history.for_prompt_annotated(&turn.model_info().input_modalities,
        session.services.image_store.as_ref()).await;
    let input = envelopes.iter().map(|envelope|envelope.item.clone()).collect::<Vec<_>>();
    let capture = OriginalInputCapture::from_original_projection(&envelopes, &input).unwrap();
    let projection = session.seal_original_session_input(&capture, &envelopes);
    // This tests both configurations without silently skipping. Only a compile
    // with the actual protected producer enabled exercises the positive path.
    assert_eq!(projection.is_some(), codex_api::protected_peer::enabled());
}

#[tokio::test]
async fn raw_user_response_item_cannot_borrow_the_original_typed_admission_route() {
    let (session, turn) = crate::session::tests::make_session_and_context().await;
    let item: ResponseItem = serde_json::from_value(json!({"type":"message","role":"user",
        "content":[{"type":"input_text","text":"same visible input"}]})).unwrap();
    let pending = pending_turn_input(&session, SubmittedTurnInput::ResponseItem(item), None,
        &turn.sub_id, UserInputMetadata { acceptance_order:Some(0), ..Default::default() }).await;
    let TurnInput::ResponseItem(envelope) = pending else { panic!("expected raw response item"); };
    session.record_annotated_conversation_items(&turn, turn.model_info(), vec![envelope]).await;
    let history = session.clone_history().await;
    let envelopes = history.for_prompt_annotated(&turn.model_info().input_modalities,
        session.services.image_store.as_ref()).await;
    let input = envelopes.iter().map(|envelope|envelope.item.clone()).collect::<Vec<_>>();
    let capture = OriginalInputCapture::from_original_projection(&envelopes, &input).unwrap();
    assert!(session.seal_original_session_input(&capture, &envelopes).is_none());
}
