//! Snapshots from ORIGINAL materialized loaders and the exact captured StepContext.
//! Semantic/config hashes are labelled separately from original file-byte receipts.
use crate::{config::Config, session::step_context::StepContext};
use codex_api::protected_peer::{SourceProvenance, source_bytes_sha256};
use codex_config::ConfigLayerSource;
use codex_protocol::models::{BaseInstructions, ResponseItem};
use serde_json::{Value, json};
use std::sync::Arc;

pub fn config_source_records(config: &Config) -> Value {
    let records: Vec<Value> = config.config_layer_stack.layers_low_to_high().map(|layer| {
        let (kind, descriptor, file) = match &layer.name {
            ConfigLayerSource::PackagedDefaults { file } => ("packaged_defaults", json!({}), Some(file.as_path().display().to_string())),
            ConfigLayerSource::System { file } => ("system", json!({}), Some(file.as_path().display().to_string())),
            ConfigLayerSource::User { file, profile } => ("user", json!({"profile":profile}), Some(file.as_path().display().to_string())),
            ConfigLayerSource::LegacyManagedConfigTomlFromFile { file } => ("legacy_managed_file", json!({}), Some(file.as_path().display().to_string())),
            ConfigLayerSource::Mdm { domain, key } => ("mdm", json!({"domain":domain,"key":key}), None),
            ConfigLayerSource::EnterpriseManaged { id, name } => ("enterprise_managed", json!({"id":id,"name":name}), None),
            ConfigLayerSource::Project { dot_codex_folder } => ("project", json!({"dot_codex_folder":dot_codex_folder.as_path().display().to_string(),"exact_config_file":"unknown: not retained by ConfigLayerSource"}), None),
            ConfigLayerSource::SessionFlags => ("session_flags", json!({"source":"typed startup overrides"}), None),
            ConfigLayerSource::LegacyManagedConfigTomlFromMdm => ("legacy_mdm", json!({}), None),
        };
        json!({"origin_kind":kind,"origin_descriptor":descriptor,"file_path":file,
            "materialized_layer_version":layer.version,"disabled":layer.disabled_reason.is_some(),
            "disabled_reason_sha256":layer.disabled_reason.as_ref().map(|text|source_bytes_sha256(text.as_bytes())),
            "retained_source_utf8_sha256":layer.raw_toml().map(|text|source_bytes_sha256(text.as_bytes())),
            "file_byte_receipt":"UTF-8 bytes retained by original loader when present; never a later filesystem reread"})
    }).collect();
    Value::Array(records)
}

pub(crate) fn capture(input: &[ResponseItem], step: &StepContext, base: &BaseInstructions)
    -> Option<Arc<SourceProvenance>> {
    if !codex_api::protected_peer::enabled() { return None; }
    let mut unknown = vec!["input_message_to_rendered_source_spans_not_retained".to_string(),
        "restored_history_instruction_origins_not_retained".to_string()];
    let agents = step.loaded_agents_md.as_ref().map(|loaded|loaded.protected_source_records());
    if let Some(records) = &agents {
        if records.as_array().is_some_and(|items|items.iter().any(|item|item.get("original_file_bytes_sha256").is_some_and(Value::is_null))) {
            unknown.push("host_user_or_thread_instruction_original_read_receipt_not_retained".into());
        }
    }
    let origin = match step.settings.model_info.origin {
        codex_protocol::openai_models::ModelOrigin::Bundled => "bundled",
        codex_protocol::openai_models::ModelOrigin::Provider => { unknown.push("provider_catalog_response_origin_receipt_not_retained".into()); "provider" },
        codex_protocol::openai_models::ModelOrigin::ExplicitConfig => "explicit_config",
        codex_protocol::openai_models::ModelOrigin::Synthetic => { unknown.push("synthetic_model_metadata_has_no_authoritative_catalog_origin".into()); "synthetic" },
    };
    let sources = json!({"config_layers":config_source_records(&step.turn.config),"agents_md":agents,
        "model_catalog":{"slug":step.settings.model_info.slug,"origin_class":origin},
        "base_instructions":{"text_sha256":source_bytes_sha256(base.text.as_bytes()),"declared_provenance":format!("{:?}",base.provenance)},
        "tool_router":step.tool_router.protected_source_record(),
        "capture_site":{"module":file!(),"line":line!(),"phase":"original build_prompt StepContext before wire normalization"}});
    let input = serde_json::to_vec(input).ok()?;
    Some(Arc::new(SourceProvenance::from_original_loaders(source_bytes_sha256(&input), sources, unknown)))
}
