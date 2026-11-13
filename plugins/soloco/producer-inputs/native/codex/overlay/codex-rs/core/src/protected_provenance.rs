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

// Byte provenance is not a current provider/auth binding. In particular an
// optional generic endpoint may forward a genuine receipt from another fetch.
fn catalog_origin_hold(origin: codex_protocol::openai_models::ModelOrigin, retained: bool, original_default_bound: bool) -> Option<&'static str> {
    use codex_protocol::openai_models::ModelOrigin;
    match (origin, retained, original_default_bound) {
        (ModelOrigin::Synthetic, _, _) => Some("synthetic_model_metadata_has_no_authoritative_catalog_origin"),
        (ModelOrigin::Provider, false, _) => Some("provider_catalog_response_origin_receipt_not_retained"),
        (ModelOrigin::Provider, true, false) => Some("provider_catalog_current_fetch_source_binding_not_retained"),
        (ModelOrigin::Provider, true, true) => None,
        (_, false, _) => Some("model_catalog_original_loader_receipt_not_retained"),
        (ModelOrigin::ExplicitConfig, true, _) => Some("explicit_catalog_original_config_binding_not_retained"),
        (ModelOrigin::Bundled, true, _) => None,
    }
}

fn source_records(step: &StepContext, base: &BaseInstructions, actual_session: Option<&crate::session::session::Session>) -> (Value, Vec<String>) {
    let actual_manager = actual_session.map(|session|session.services.models_manager.as_ref());
    let mut unknown = Vec::new();
    let base_renderer = actual_session.and_then(|session|
        crate::original_instruction_renderer::base_source_record(session, step, base));
    // Labels/equal text cannot mint the original selection or actual Session.
    if base_renderer.is_none() {
        unknown.push("base_instructions_original_renderer_chain_not_retained".into());
    }
    let agents = step.loaded_agents_md.as_ref().map(|loaded|loaded.protected_source_records());
    if let Some(records) = &agents {
        if records.as_array().is_some_and(|items|items.iter().any(|item|item.get("original_file_bytes_sha256").is_some_and(Value::is_null))) {
            unknown.push("host_user_or_thread_instruction_original_read_receipt_not_retained".into());
        }
    }
    let default_catalog = actual_manager.and_then(|manager|
        codex_model_provider::original_default_catalog_source_for_manager(&step.settings.model_info, manager));
    let catalog_source = default_catalog.as_ref().map(|source|source.catalog_source().clone())
        .or_else(||codex_models_manager::original_catalog_source(&step.settings.model_info));
    let catalog_manager_bound = actual_manager.and_then(codex_models_manager::original_manager_owner)
        .zip(catalog_source.as_ref().and_then(|source|source.manager_owner()))
        .is_some_and(|(actual, captured)|Arc::ptr_eq(actual, &captured));
    if catalog_source.is_some() && !catalog_manager_bound {
        unknown.push("model_catalog_original_current_manager_binding_not_retained".into());
    }
    let origin = match step.settings.model_info.origin {
        codex_protocol::openai_models::ModelOrigin::Bundled => "bundled",
        codex_protocol::openai_models::ModelOrigin::Provider => "provider",
        codex_protocol::openai_models::ModelOrigin::ExplicitConfig => "explicit_config",
        codex_protocol::openai_models::ModelOrigin::Synthetic => "synthetic",
    };
    if let Some(reason) = catalog_origin_hold(step.settings.model_info.origin, catalog_source.is_some(), default_catalog.is_some()) {
        unknown.push(reason.into());
    }
    let sources = json!({"config_layers":config_source_records(&step.turn.config),"agents_md":agents,
        "model_catalog":{"slug":step.settings.model_info.slug,"origin_class":origin,"current_original_manager_bound":catalog_manager_bound,
            "original_source":catalog_source.as_ref().map(|source|json!({
                "kind":format!("{:?}",source.source_kind()),
                "original_source_bytes_sha256":source_bytes_sha256(source.raw_body()),
                "original_source_bytes":source.raw_body().len(),
                "materialized_selected_model_sha256":source_bytes_sha256(source.materialized_model_bytes()),
                "request_url_sha256":source.request_url().map(|url|source_bytes_sha256(url.as_bytes())),
                "etag_sha256":source.etag().map(|etag|source_bytes_sha256(etag.as_bytes()))}))},
        "original_default_catalog_binding":default_catalog.as_ref().map(|source|json!({
            "response_instance":source.response_instance(),"auth_generation":source.auth_generation(),
            "auth_owner_generation":source.auth_owner_generation(),"auth_source_generation":source.auth_source_generation(),
            "binding":"private original default factory, manager owner, actual current fetch, route and AuthManager snapshot"})),
        "base_instructions":{"text_sha256":source_bytes_sha256(base.text.as_bytes()),"declared_provenance":format!("{:?}",base.provenance),"original_renderer":base_renderer},
        "tool_router":step.tool_router.protected_source_record(),
        "capture_site":{"module":file!(),"line":line!(),"phase":"original build_prompt StepContext before wire normalization"}});
    (sources, unknown)
}

/// Legacy/unattributed callers retain the original mandatory unknowns.
pub(crate) fn capture(input: &[ResponseItem], step: &StepContext, base: &BaseInstructions)
    -> Option<Arc<SourceProvenance>> {
    if !codex_api::protected_peer::enabled() { return None; }
    let (sources, unknown) = source_records(step, base, None);
    let input = serde_json::to_vec(input).ok()?;
    Some(Arc::new(SourceProvenance::from_original_loaders(source_bytes_sha256(&input), sources, unknown)))
}

/// Only the original sampling path supplies nonserialized history envelopes.
pub(crate) fn capture_original_input(input: &[ResponseItem], envelopes: &[codex_history::ResponseItemEnvelope],
    step: &StepContext, base: &BaseInstructions, actual_session: &crate::session::session::Session) -> Option<Arc<SourceProvenance>> {
    if !codex_api::protected_peer::enabled() { return None; }
    let Some(input_capture) = codex_history::OriginalInputCapture::from_original_projection(envelopes, input) else {
        return capture(input, step, base);
    };
    let (sources, unknown) = source_records(step, base, Some(actual_session));
    let provenance = match actual_session.seal_original_session_input(&input_capture, envelopes) {
        Some(projection) => SourceProvenance::from_original_session_input_capture(&input_capture, projection, sources, unknown),
        None => SourceProvenance::from_original_input_capture(&input_capture, sources, unknown),
    };
    Some(Arc::new(provenance))
}

#[cfg(test)]
mod original_origin_tests {
    use super::*;
    use codex_protocol::openai_models::ModelOrigin;
    #[test]
    fn origin_labels_and_forwarded_provider_receipts_never_become_current_authority() {
        assert_eq!(catalog_origin_hold(ModelOrigin::Provider, true, false), Some("provider_catalog_current_fetch_source_binding_not_retained"));
        assert!(catalog_origin_hold(ModelOrigin::Provider, false, false).is_some());
        assert!(catalog_origin_hold(ModelOrigin::Synthetic, true, false).is_some());
        assert!(catalog_origin_hold(ModelOrigin::ExplicitConfig, true, false).is_some());
        assert!(catalog_origin_hold(ModelOrigin::Bundled, false, false).is_some());
        assert_eq!(catalog_origin_hold(ModelOrigin::Bundled, true, false), None);
        assert_eq!(catalog_origin_hold(ModelOrigin::Provider, true, true), None);
        assert!(catalog_origin_hold(ModelOrigin::Synthetic, true, true).is_some());
    }
}
