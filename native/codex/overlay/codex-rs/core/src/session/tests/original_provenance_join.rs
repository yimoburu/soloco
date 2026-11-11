//! Controlled source integration only. No model is dispatched and the fixture's
//! synthetic auth is not account/native qualification. Tests are authored UNRUN.
use super::*;
use pretty_assertions::assert_eq;
use crate::original_instruction_renderer::{OriginalBaseSelection, original_renderer_frame, omit_plan_instructions};
use crate::session::step_context::StepContext;
use codex_protocol::models::BaseInstructionsProvenance;
use codex_protocol::openai_models::ToolMode;
use codex_tools::{ResponsesApiTool, ToolSpec};

struct Fixture {
    session: Session,
    step: StepContext,
    prompt: crate::Prompt,
    request: codex_api::ResponsesApiRequest,
}

fn five_declarations() -> Vec<ToolSpec> {
    // Source-owned interface DATA, not an executable tool handler or permission.
    let values: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../../codex-api/src/protected_peer_responses_tools.json")).unwrap();
    values.into_iter().map(|value|ToolSpec::Function(ResponsesApiTool {
        name:value["name"].as_str().unwrap().into(),
        description:value["description"].as_str().unwrap().into(),
        strict:value["strict"].as_bool().unwrap(), defer_loading:None, output_schema:None,
        parameters:serde_json::from_value(value["parameters"].clone()).unwrap(),
    })).collect()
}

async fn fixture() -> Fixture {
    // Configure before either Session or ModelClient is constructed. The real
    // model retains its RLite flag; this is the explicit nonincremental profile.
    let (session, mut turn) = make_session_and_context_with_config(|config| {
        config.model = Some("gpt-6.1-sol".into());
        let _ = config.features.disable(Feature::IncrementalTools);
    }).await;
    assert!(!turn.config.features.enabled(Feature::IncrementalTools));
    turn.sub_id = "original-provenance-join".into();
    let model = session.services.models_manager.get_model_info(
        "gpt-6.1-sol", &turn.config.to_models_manager_config()).await;
    assert!(model.use_responses_lite, "Use the genuine catalog's actual model flag");
    let selection = OriginalBaseSelection::render_fresh_model(
        &model, session.services.models_manager.as_ref()).unwrap();
    let mut step = Arc::unwrap_or_clone(StepContext::for_test(Arc::new(turn)));
    Arc::make_mut(&mut step.settings).model_info = Arc::new(model);
    assert!(!step.incremental_tools_enabled());
    // The registered handler set is empty: this fixture never executes tools.
    // Advertised declarations are the exact compiled five-tool source resource.
    step.tool_router = Arc::new(crate::tools::router::ToolRouter::from_parts(
        crate::tools::registry::ToolRegistry::default(), five_declarations(), ToolMode::Direct,
        std::collections::BTreeMap::new(), None, &[]));
    let mut base = selection.render_for_session(session.original_provenance_owner(), selection.rendered_text(),
        Some(BaseInstructionsProvenance::Model { model:"gpt-6.1-sol".into() })).unwrap();
    if !step.turn.config.update_plan_enabled && step.turn.config.model_catalog.is_none() {
        base = omit_plan_instructions(base);
    }
    let mut world = crate::context::world_state::WorldState::default();
    world.add_section(crate::context::world_state::EnvironmentsInstructionsState::new(true));
    world.bind_original_renderer(original_renderer_frame(&session, &step, &base));
    let (_, updates) = world.render_full();
    let generated = crate::context_manager::updates::merge_world_state_updates(updates);
    session.record_annotated_conversation_items(&step.turn, &step.settings.model_info,
        generated.into_iter().map(codex_history::ResponseItemEnvelope::new).collect()).await;
    let input = vec![UserInput::Text { text:"original accepted source input".into(), text_elements:Vec::new() }];
    let order = session.reserve_original_user_input_order(&input).await;
    session.record_user_prompt_and_emit_turn_item(&step.turn, &step.settings.model_info, &input, None,
        UserInputMetadata { acceptance_order:Some(order), ..Default::default() },
        codex_thread_store::PersistContext::Standard).await;
    let envelopes = session.clone_history().await.for_prompt_annotated(
        &step.settings.model_info.input_modalities, session.services.image_store.as_ref()).await;
    let input = envelopes.iter().map(|envelope|envelope.item.clone()).collect::<Vec<_>>();
    let mut prompt = crate::session::turn::build_prompt(input, &step, base, false);
    prompt.protected_provenance = crate::protected_provenance::capture_original_input(
        &prompt.input, &envelopes, &step, &prompt.base_instructions, &session);
    let metadata = session.responses_metadata(&step, crate::responses_metadata::CodexResponsesRequestKind::Turn).await;
    let mut request = session.services.model_client.build_responses_request(&prompt,
        &step.settings.model_info, None, codex_protocol::config_types::ReasoningSummary::None,
        None, &metadata, false).unwrap();
    session.services.model_client.prepare_original_request_for_test(&mut request);
    Fixture { session, step, prompt, request }
}

#[tokio::test]
async fn fresh_r_lite_user_generated_instruction_base_and_actual_encoder_join() {
    let f = fixture().await;
    assert!(f.request.tools.is_none());
    assert!(matches!(f.request.input.first(), Some(ResponseItem::AdditionalTools { .. })));
    let provenance = f.session.services.model_client.original_prepared_provenance(
        &f.prompt, &f.step.settings.model_info, &f.request.input);
    if !codex_api::protected_peer::enabled() {
        assert!(provenance.is_none(), "Ordinary compilation has no protected ingress authority");
        return;
    }
    let provenance = provenance.expect("Real mixed origin and actual RLite projection must join");
    let facts = serde_json::to_value(provenance.as_ref()).unwrap();
    assert_eq!(facts["unknown_origins"], serde_json::json!([]));
    assert_eq!(facts["sources"]["original_input_materialization"]["complete_original_origin_chain"], true);
    assert!(facts["sources"]["original_input_materialization"]["original_generated_sources"].as_array().unwrap().len()>0);
    let actual_input = serde_json::to_vec(&f.request.input).unwrap();
    assert_eq!(facts["sources"]["original_wire_projection"]["original_wire_input_bytes_sha256"],
        codex_api::protected_peer::source_bytes_sha256(&actual_input));
    // The same real endpoint encoder used by Responses retains that exact array.
    let encoded = codex_client::EncodedJsonBody::encode(&f.request).unwrap();
    #[derive(serde::Deserialize)]
    struct Input<'a> { #[serde(borrow)] input:&'a serde_json::value::RawValue }
    let wire: Input<'_> = serde_json::from_slice(encoded.as_bytes()).unwrap();
    assert_eq!(wire.input.get().as_bytes(), actual_input);
}

#[tokio::test]
async fn actual_wire_join_holds_extra_prefix_drop_reorder_and_changed_content() {
    let f = fixture().await;
    let call = |input:&[ResponseItem]| f.session.services.model_client.original_prepared_provenance(
        &f.prompt, &f.step.settings.model_info, input);
    let mut extra = f.request.input.clone(); extra.insert(0, f.request.input[0].clone());
    assert!(call(&extra).is_none());
    let mut dropped = f.request.input.clone(); dropped.pop(); assert!(call(&dropped).is_none());
    let mut reordered = f.request.input.clone(); let n=reordered.len(); reordered.swap(n-1,n-2);
    assert!(call(&reordered).is_none());
    let mut changed = f.request.input.clone();
    let ResponseItem::Message { content, .. } = changed.last_mut().unwrap() else { panic!("expected user message"); };
    content.push(codex_protocol::models::input_text("unobserved content"));
    assert!(call(&changed).is_none());
    if codex_api::protected_peer::enabled() { assert!(call(&f.request.input).is_some()); }
    else { assert!(call(&f.request.input).is_none()); }
}

#[tokio::test]
async fn genuine_same_text_base_from_another_owner_cannot_join_actual_runtime() {
    let mut f = fixture().await;
    let foreign = fixture().await;
    assert_eq!(f.prompt.base_instructions.text, foreign.prompt.base_instructions.text);
    f.prompt.base_instructions = foreign.prompt.base_instructions;
    // Build through the actual client, with the foreign genuine capsule. Only
    // the bound owner check can reject same-text source facts at this boundary.
    let metadata = f.session.responses_metadata(&f.step, crate::responses_metadata::CodexResponsesRequestKind::Turn).await;
    let mut request = f.session.services.model_client.build_responses_request(&f.prompt,
        &f.step.settings.model_info, None, codex_protocol::config_types::ReasoningSummary::None,
        None, &metadata, false).unwrap();
    f.session.services.model_client.prepare_original_request_for_test(&mut request);
    assert!(f.session.services.model_client.original_prepared_provenance(
        &f.prompt, &f.step.settings.model_info, &request.input).is_none());
}
