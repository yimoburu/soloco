//! AUTHORED_UNRUN. These negative Core boundaries confer no native readiness.
use super::*;
use serde_json::json;
#[tokio::test]
async fn caller_data_and_a_generic_witness_cannot_bind_core_live_history() {
    let (session,_)=crate::session::tests::make_session_and_context().await;
    let mut envelope=ResponseItemEnvelope::new(serde_json::from_value(json!({"type":"message","role":"assistant","content":[{"type":"output_text","text":"same bytes"}]})).unwrap());
    envelope.observe_original_materialization();
    envelope.metadata.get_or_insert_default().original_live_history=Some(OriginalProducerWitness::new(Arc::new(json!({"verified":true,"owner":"same"}))));
    assert!(clone_live_origin(envelope.metadata.as_ref().unwrap().original_live_history.as_ref().unwrap()).is_none());
    attach_model(&session,&mut envelope,None);
    assert!(clone_live_origin(envelope.metadata.as_ref().unwrap().original_live_history.as_ref().unwrap()).is_none());
}
#[test]
fn plain_tool_output_and_copied_json_do_not_supply_a_dynamic_producer_capsule() {
    let output=FunctionToolOutput::from_text("opaque returned text".into(),Some(false));
    let payload=ToolPayload::Function{arguments:"{}".into()};
    let item:ResponseItem=output.to_response_item("call",&payload).into();
    let mut envelope=ResponseItemEnvelope::new(item);
    attach_dynamic(&mut envelope,&output);
    assert!(envelope.metadata.as_ref().and_then(|m|m.original_live_history.as_ref()).is_none());
}
#[test]
fn runtime_history_carrier_is_not_persisted_or_reconstructed() {
    let mut metadata=codex_history::CodexHarnessMetadata::default();
    metadata.original_live_history=Some(OriginalProducerWitness::new(Arc::new(json!({"native":true}))));
    let value=serde_json::to_value(&metadata).unwrap();
    assert!(value.get("original_live_history").is_none());
    let restored:codex_history::CodexHarnessMetadata=serde_json::from_value(value).unwrap();
    assert!(restored.original_live_history.is_none());
}

async fn wire_fixture()->(Session,codex_protocol::models::BaseInstructions,Arc<codex_models_manager::CatalogModel>) {
    let (session,turn)=crate::session::tests::make_session_and_context().await;
    let model=session.services.models_manager.get_model_info("gpt-6.1-sol",&turn.config.to_models_manager_config()).await;
    assert!(model.use_responses_lite);
    let selection=crate::original_instruction_renderer::OriginalBaseSelection::render_fresh_model(&model,session.services.models_manager.as_ref()).unwrap();
    let base=selection.render_for_session(session.original_provenance_owner(),selection.rendered_text(),
        Some(codex_protocol::models::BaseInstructionsProvenance::Model{model:"gpt-6.1-sol".into()})).unwrap();
    (session,base,Arc::new(model))
}
fn wire_controls()->crate::original_instruction_renderer::OriginalWireControls {
    // Controlled component flags only. Actual ModelClient rebinds its own controls.
    crate::original_instruction_renderer::OriginalWireControls{thread_id:"wire-fixture".into(),use_responses_lite:true,
        content_item_kinds_enabled:false,is_openai:true}
}
fn mechanical_projection(base:&codex_protocol::models::BaseInstructions,before:&[ResponseItem])->Vec<ResponseItem> {
    use codex_context_fragments::ContextualUserFragment;
    let mut after=Vec::new();
    if !base.text.is_empty() {
        let mut prefix=ContextualUserFragment::into(crate::context::BaseInstructionsFragment(base.text.clone()));
        let namespace=uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_OID,b"wire-fixture");
        prefix.set_id(Some(codex_protocol::ResponseItemId::with_suffix("msg",uuid::Uuid::new_v5(&namespace,base.text.as_bytes()))));
        after.push(prefix);
    }
    after.extend_from_slice(before);
    for item in &mut after {if item.id().is_some_and(|id|!id.is_prefixed()){item.set_id(None);}item.clear_content_item_kinds();}
    after
}
fn live_shaped_dtos()->Vec<ResponseItem> {vec![
    serde_json::from_value(json!({"type":"message","role":"assistant","content":[{"type":"output_text","text":"original-looking text"}]})).unwrap(),
    serde_json::from_value(json!({"type":"function_call","call_id":"call","name":"soloco_context_header","arguments":"{}"})).unwrap(),
    serde_json::from_value(json!({"type":"function_call_output","call_id":"call","output":"opaque returned business text: 9007199254740993 雪"})).unwrap(),
]}
#[tokio::test]
async fn exact_core_wire_mapper_accepts_declared_live_dto_shapes_and_preserves_every_span() {
    // Mechanical mapping regression only. These DTOs deliberately have no model
    // or decoder witness; API's separate live-receipt integration tests that gate.
    let (_session,base,_model)=wire_fixture().await;let before=live_shaped_dtos();let after=mechanical_projection(&base,&before);
    let mapped=crate::original_instruction_renderer::original_wire_projection(&base,&before,&after,wire_controls(),&[]).unwrap();
    assert_eq!(mapped.original_input_bytes(),serde_json::to_vec(&before).unwrap());
    assert_eq!(mapped.final_input_bytes(),serde_json::to_vec(&after).unwrap());
    assert_eq!(mapped.source_facts()["exact_original_item_mapping"].as_array().unwrap().len(),before.len());
    let mut changed=after.clone();let last=changed.len()-1;
    changed[last]=serde_json::from_value(json!({"type":"function_call_output","call_id":"call","output":"rewritten"})).unwrap();
    assert!(crate::original_instruction_renderer::original_wire_projection(&base,&before,&changed,wire_controls(),&[]).is_none());
}
#[tokio::test]
async fn matching_plain_nonuser_dto_wire_mapping_alone_cannot_qualify_history() {
    let (session,base,model)=wire_fixture().await;let before=live_shaped_dtos();let after=mechanical_projection(&base,&before);
    assert!(crate::original_instruction_renderer::original_wire_projection(&base,&before,&after,wire_controls(),&[]).is_some());
    let mut envelopes=before.iter().cloned().map(ResponseItemEnvelope::new).collect::<Vec<_>>();
    for e in &mut envelopes{e.observe_original_materialization();e.observe_original_prompt_projection();}
    let capture=codex_history::OriginalInputCapture::from_original_projection(&envelopes,&before).unwrap();
    let provenance=codex_api::protected_peer::SourceProvenance::from_original_input_capture(&capture,json!({"mapping_matched":true}),Vec::new());
    let facts=serde_json::to_value(&provenance).unwrap();
    assert!(facts["unknown_origins"].as_array().unwrap().iter().any(|v|v=="non_user_input_original_producer_chain_not_retained"));
    let prompt=crate::Prompt{input:before,base_instructions:base,protected_provenance:Some(Arc::new(provenance)),..Default::default()};
    assert!(session.services.model_client.original_prepared_provenance(&prompt,&model,&after).is_none());
}
#[tokio::test]
async fn media_other_and_non_declared_tool_output_kinds_remain_outside_wire_mapping() {
    let (_session,base,_model)=wire_fixture().await;
    for item in [
        serde_json::from_value(json!({"type":"message","role":"assistant","content":[{"type":"input_image","image_url":"data:image/png;base64,AA=="}]})).unwrap(),
        serde_json::from_value(json!({"type":"function_call_output","call_id":"call","output":[{"type":"input_image","image_url":"data:image/png;base64,AA=="}]})).unwrap(),
        ResponseItem::Other,
    ] {let before=vec![item];let after=mechanical_projection(&base,&before);
        assert!(crate::original_instruction_renderer::original_wire_projection(&base,&before,&after,wire_controls(),&[]).is_none());}
}
