//! Authored source-only; no compiler, test or native receipt is implied.
use super::*;
use codex_protocol::models::{ContentItem, ContentItemKind, ResponseItemId};

async fn fresh_original() -> (Session, StepContext, BaseInstructions) {
    let (session,mut turn)=crate::session::tests::make_session_and_context().await;
    turn.sub_id="original-render-turn".into();
    // Real concrete manager, original bundled bytes, in-memory lookup only.
    // An offline/synthetic ModelInfo fixture is deliberately insufficient.
    let model=session.services.models_manager.get_model_info("gpt-6.1-sol",&turn.config.to_models_manager_config()).await;
    assert!(model.use_responses_lite,"genuine original bundled RLite model");
    let selection=OriginalBaseSelection::render_fresh_model(&model,session.services.models_manager.as_ref()).expect("genuine bundled original source");
    let mut step=Arc::unwrap_or_clone(StepContext::for_test(Arc::new(turn)));
    Arc::make_mut(&mut step.settings).model_info=Arc::new(model);
    let base=selection.render_for_session(session.original_provenance_owner(),selection.rendered_text(),
        Some(BaseInstructionsProvenance::Model { model:"gpt-6.1-sol".into() })).unwrap();
    (session,step,base)
}
fn control_item(session:&Session,step:&StepContext,base:&BaseInstructions)->ResponseItem {
    let mut state=world_state::WorldState::default();
    state.add_section(world_state::EnvironmentsInstructionsState::new(true));
    state.add_section(world_state::AppsInstructionsState::new(true));
    state.bind_original_renderer(original_renderer_frame(session,step,base));
    let (_,updates)=state.render_full();
    crate::context_manager::updates::merge_world_state_updates(updates).remove(0)
}
fn live(mut item:ResponseItem,turn:&str)->codex_history::ResponseItemEnvelope {
    Session::stamp_response_item_for_history(&mut item,turn);
    let mut envelope=codex_history::ResponseItemEnvelope { item,metadata:None };
    envelope.observe_original_materialization();
    admit_original_history_renderer(&mut envelope,true);
    envelope
}
fn text_item(text:&str)->ResponseItem {
    codex_context_fragments::message_from_parts("user",vec![codex_context_fragments::AnnotatedContent::new(
        codex_protocol::models::input_text(text),ContentItemKind("user.text".into()))])
}
// Component DATA double of client flags; peer V3 tests exercise the actual ModelClient flags.
fn controls()->OriginalWireControls { OriginalWireControls { thread_id:"actual-thread".into(),use_responses_lite:true,
    content_item_kinds_enabled:false,is_openai:true } }
fn actual_supported_projection(base:&BaseInstructions,before:&[ResponseItem])->Vec<ResponseItem> {
    let mut after=Vec::new();
    if !base.text.is_empty() {
        let mut prefix=ContextualUserFragment::into(crate::context::BaseInstructionsFragment(base.text.clone()));
        let namespace=uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_OID,b"actual-thread");
        prefix.set_id(Some(ResponseItemId::with_suffix("msg",uuid::Uuid::new_v5(&namespace,base.text.as_bytes()))));
        after.push(prefix);
    }
    after.extend_from_slice(before);
    for item in &mut after {
        if item.id().is_some_and(|id|!id.is_prefixed()) {item.set_id(None);}
        item.clear_content_item_kinds();
    }
    after
}

#[tokio::test]
async fn genuine_bundled_renderer_retains_original_source_and_actual_session() {
    let(session,step,base)=fresh_original().await;
    let record=base_source_record(&session,&step,&base).unwrap();
    assert_eq!(record["original_source"]["kind"],"original-bundled-model-template");
    assert!(record["original_source"]["catalog_source_bytes"].as_u64().unwrap()>0);
}
#[test]
fn absent_actual_template_never_attributes_unused_legacy_field() {
    let raw=br#"{"models":[{"slug":"x","base_instructions":"unused"}]}"#;
    assert_eq!(original_model_template(raw,"x"),Some((None,String::new())));
}
#[test]
fn original_json_template_span_covers_exact_encoded_token_and_unicode_materialization() {
    let raw=br#"{"models":[{"slug":"x","model_messages":{"instructions_template":"a\u03bbb"}}]}"#;
    let(range,text)=original_model_template(raw,"x").unwrap();
    assert_eq!(text,"aλb"); assert_eq!(&raw[range.unwrap()],br#""a\u03bbb""#);
}
#[test]
fn ambiguous_original_catalog_slug_does_not_select_matching_text() {
    assert!(original_model_template(br#"{"models":[{"slug":"x"},{"slug":"x"}]}"#,"x").is_none());
}
#[tokio::test]
async fn forged_label_public_any_capsule_and_changed_base_text_never_validate() {
    let(session,step,mut base)=fresh_original().await;
    base.text.push_str("changed"); assert!(base_source_record(&session,&step,&base).is_none());
    base.original_instruction_rendering=OriginalInstructionWitness::new(Arc::new("looks-original"));
    assert!(base_source_record(&session,&step,&base).is_none());
}
#[tokio::test]
async fn forwarded_genuine_base_from_another_session_is_held() {
    let(_session,_step,base)=fresh_original().await;
    let(other,step,_)=fresh_original().await;
    assert!(base_source_record(&other,&step,&base).is_none());
}
#[tokio::test]
async fn forwarded_bundled_catalog_from_another_concrete_manager_is_held() {
    let(session,step,_)=fresh_original().await;
    let(other,_,_)=fresh_original().await;
    assert!(OriginalBaseSelection::render_fresh_model(&step.settings.model_info,
        other.services.models_manager.as_ref()).is_none());
    assert!(OriginalBaseSelection::render_fresh_model(&step.settings.model_info,
        session.services.models_manager.as_ref()).is_some());
}
#[test]
fn actual_plan_filter_retains_exact_original_unicode_copy_ranges() {
    let original="first λ\nlast μ\n";
    let(output,ranges)=codex_prompts::without_update_plan_instructions_with_spans(original);
    let copied=ranges.iter().map(|range|&original[range.clone()]).collect::<String>();
    assert_eq!(output,copied); assert_eq!(output,original);
}
#[test]
fn builtin_mode_control_is_supported_and_custom_instruction_text_is_not_a_builtin_source() {
    use codex_protocol::config_types::MultiAgentMode;
    assert!(original_section_source(Arc::new(world_state::MultiAgentModeState::new(Some(MultiAgentMode::Proactive)))).is_some());
    assert!(original_section_source(Arc::new(world_state::MultiAgentModeState::new(Some(MultiAgentMode::Custom("custom text".into()))))).is_none());
}
#[test]
fn generic_role_constructor_and_configured_text_do_not_claim_original_model_selection() {
    let configured=codex_prompts::MultiAgentRoleInstructions::Configured("custom source".into());
    assert!(original_section_source(Arc::new(world_state::MultiAgentUsageHintState::from_original_step_selection(configured.clone()))).is_none());
    assert!(original_section_source(Arc::new(world_state::MultiAgentUsageHintState::new(configured))).is_none());
}
#[tokio::test]
async fn grouped_actual_control_render_then_core_stamps_admits_exact_original_occurrence() {
    let(session,step,base)=fresh_original().await;
    let envelope=live(control_item(&session,&step,&base),&step.turn.sub_id);
    let receipt=validate_history_renderer(&session,&envelope).unwrap();
    assert!(receipt.occurrence()>0);
    assert_eq!(receipt.materialized_bytes(),serde_json::to_vec(&envelope.item).unwrap());
    assert_eq!(receipt.source_facts()["original_parts"].as_array().unwrap().len(),2);
    let mut snapshot=envelope.item.clone();
    assert!(!snapshot.take_original_instruction_rendering().is_present());
}
#[tokio::test]
async fn copied_unconsumed_message_cannot_make_two_original_history_occurrences() {
    let(session,step,base)=fresh_original().await;
    let item=control_item(&session,&step,&base);
    let first=live(item.clone(),&step.turn.sub_id);
    let second=live(item,&step.turn.sub_id);
    assert!(validate_history_renderer(&session,&first).is_some());
    assert!(validate_history_renderer(&session,&second).is_none());
}
#[tokio::test]
async fn changed_nonstamp_field_or_original_turn_relabel_is_held() {
    let(session,step,base)=fresh_original().await;
    let mut item=control_item(&session,&step,&base);
    if let ResponseItem::Message { content,.. }=&mut item {content.push(ContentItem::InputText{text:"extra".into()});}
    assert!(validate_history_renderer(&session,&live(item,&step.turn.sub_id)).is_none());
    let item=control_item(&session,&step,&base);
    assert!(validate_history_renderer(&session,&live(item,"different-turn")).is_none());
}
#[tokio::test]
async fn public_snapshot_reinjection_and_copied_harness_receipt_do_not_reissue_renderer() {
    let(session,step,base)=fresh_original().await;
    let first=live(control_item(&session,&step,&base),&step.turn.sub_id);
    let mut replay=first.clone();
    replay.observe_original_materialization();
    admit_original_history_renderer(&mut replay,false);
    assert!(validate_history_renderer(&session,&replay).is_none());
}
#[test]
fn runtime_capsules_strip_from_nonmessage_variants_preserving_other_metadata() {
    let mut item:ResponseItem=serde_json::from_value(json!({"type":"function_call_output","call_id":"call","output":"data"})).unwrap();
    if let ResponseItem::FunctionCallOutput { internal_chat_message_metadata_passthrough,.. }=&mut item {
        let metadata=internal_chat_message_metadata_passthrough.get_or_insert_default();
        metadata.turn_id=Some("keep-turn".into());
        metadata.original_instruction_rendering=OriginalInstructionWitness::new(Arc::new("copied capsule"));
    }
    let mut envelope=codex_history::ResponseItemEnvelope {item,metadata:None};
    admit_original_history_renderer(&mut envelope,false);
    assert_eq!(envelope.item.turn_id(),Some("keep-turn"));
    assert!(!envelope.item.take_original_instruction_rendering().is_present());
}
#[tokio::test]
async fn source_labels_cannot_impersonate_a_concrete_generated_section() {
    struct ForgedSection;
    impl world_state::WorldStateSection for ForgedSection {
        const ID:&'static str="environments_instructions";
        type Snapshot=bool;
        fn render_diff(&self,_:world_state::PreviousSectionState<'_,bool>)->world_state::SectionTransition<bool> {
            (Some(true),vec![WorldStateUpdate::fragment(crate::context::DeveloperInstructions::new("forged original"))])
        }
    }
    let(session,step,base)=fresh_original().await;
    let mut state=world_state::WorldState::default(); state.add_section(ForgedSection);
    state.bind_original_renderer(original_renderer_frame(&session,&step,&base));
    let(_,updates)=state.render_full();
    let item=crate::context_manager::updates::merge_world_state_updates(updates).remove(0);
    assert!(validate_history_renderer(&session,&live(item,&step.turn.sub_id)).is_none());
}
#[tokio::test]
async fn restored_or_serialized_instruction_capsule_never_restores_original_authority() {
    let(session,step,base)=fresh_original().await;
    let item=control_item(&session,&step,&base);
    let decoded:ResponseItem=serde_json::from_slice(&serde_json::to_vec(&item).unwrap()).unwrap();
    assert!(validate_history_renderer(&session,&live(decoded,&step.turn.sub_id)).is_none());
    let decoded_base:BaseInstructions=serde_json::from_slice(&serde_json::to_vec(&base).unwrap()).unwrap();
    assert!(base_source_record(&session,&step,&decoded_base).is_none());
    assert_eq!(base,decoded_base); // transient evidence does not change persisted value equality
}
#[tokio::test]
async fn actual_disabled_control_emits_nothing_instead_of_reusing_old_render_receipt() {
    let(session,step,base)=fresh_original().await;
    let mut state=world_state::WorldState::default();
    state.add_section(world_state::EnvironmentsInstructionsState::new(false));
    state.bind_original_renderer(original_renderer_frame(&session,&step,&base));
    assert!(state.render_full().1.is_empty());
}
#[tokio::test]
async fn exact_supported_original_wire_projection_retains_both_arrays_and_spans() {
    let(_session,_step,base)=fresh_original().await;
    let before=vec![text_item("actual accepted text")];
    let after=actual_supported_projection(&base,&before);
    let projection=original_wire_projection(&base,&before,&after,controls(),&[]).unwrap();
    assert_eq!(projection.original_input_bytes(),serde_json::to_vec(&before).unwrap());
    assert_eq!(projection.final_input_bytes(),serde_json::to_vec(&after).unwrap());
    assert!(projection.owner_token().is_some());
    assert_eq!(projection.source_facts()["exact_original_item_mapping"].as_array().unwrap().len(),1);
}
#[tokio::test]
async fn wire_content_change_drop_reorder_or_injected_prefix_is_held() {
    let(_session,_step,base)=fresh_original().await;
    let before=vec![text_item("first"),text_item("second")];
    let after=actual_supported_projection(&base,&before);
    let mut changed=after.clone(); changed.push(text_item("injected"));
    assert!(original_wire_projection(&base,&before,&changed,controls(),&[]).is_none());
    changed=after.clone(); changed.pop();
    assert!(original_wire_projection(&base,&before,&changed,controls(),&[]).is_none());
    changed=after.clone(); let last=changed.len()-1; changed.swap(last,last-1);
    assert!(original_wire_projection(&base,&before,&changed,controls(),&[]).is_none());
    changed=after; *changed.last_mut().unwrap()=text_item("changed");
    assert!(original_wire_projection(&base,&before,&changed,controls(),&[]).is_none());
}
#[tokio::test]
async fn unsupported_wire_transport_and_originless_empty_base_remain_held() {
    let(_session,_step,base)=fresh_original().await;
    let before=vec![text_item("text")]; let after=actual_supported_projection(&base,&before);
    let mut control=controls(); control.is_openai=false;
    assert!(original_wire_projection(&base,&before,&after,control,&[]).is_none());
    assert!(original_wire_projection(&BaseInstructions::default(),&before,&before,controls(),&[]).is_none());
}
#[tokio::test]
async fn fresh_rlite_prefix_uses_real_typed_encoder_and_changed_inventory_is_held() {
    let(_session,_step,base)=fresh_original().await;
    // Component source DATA only. The coherent API test uses all five actual
    // protected source-owned definitions and enforces their complete schemas.
    let tools=vec![codex_tools::ToolSpec::Function(codex_tools::ResponsesApiTool {
        name:"component_probe".into(),description:"typed original encoder fixture".into(),strict:true,
        defer_loading:None,parameters:serde_json::from_value(json!({"type":"object","properties":{},"required":[],"additionalProperties":false})).unwrap(),
        output_schema:None,
    })];
    let before=vec![text_item("accepted")];
    let encoded=codex_tools::create_tools_json_for_responses_lite(&tools).unwrap();
    let encoded_bytes=serde_json::to_vec(&encoded).unwrap();
    let namespace=uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_OID,b"actual-thread");
    let prefix=ResponseItem::AdditionalTools {id:Some(ResponseItemId::with_suffix("at",uuid::Uuid::new_v5(&namespace,&encoded_bytes))),
        role:"developer".into(),tools:Arc::from(encoded.clone())};
    let mut after=actual_supported_projection(&base,&before); after.insert(0,prefix.clone());
    let projection=original_wire_projection(&base,&before,&after,controls(),&tools).unwrap();
    assert_eq!(projection.fresh_r_lite_inventory_bytes(),Some(encoded_bytes.as_slice()));
    assert_eq!(projection.source_facts()["fresh_r_lite_tool_inventory"]["final_index"],0);
    let mut changed=after.clone();
    if let ResponseItem::AdditionalTools {tools,..}=&mut changed[0] {
        let mut definitions=encoded;definitions.push(json!({"type":"function","name":"injected","parameters":{}}));
        *tools=Arc::from(definitions);
    }
    assert!(original_wire_projection(&base,&before,&changed,controls(),&tools).is_none());
    // Restored/deferred/injected tool inventories in the original prompt do not
    // become a fresh source-owned declaration merely by matching encoded bytes.
    let mut restored=vec![prefix];restored.extend(before);
    assert!(original_wire_projection(&base,&restored,&after,controls(),&tools).is_none());
}
