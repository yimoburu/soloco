//! Private original instruction renderer receipts. Runtime facts, never grants.
//! Only concrete original rendering sites mint these values. Protocol carriers
//! transport data; labels, equal text and deserialized metadata mint nothing.
use std::ops::Range;
use std::sync::{Arc, Weak};
use codex_models_manager::{CatalogModel, OriginalCatalogEvidence, OriginalCatalogOwner, OriginalCatalogSourceKind};
use codex_models_manager::manager::ModelsManager;
use codex_protocol::models::{BaseInstructions, BaseInstructionsProvenance, ResponseItem};
use codex_protocol::OriginalInstructionWitness;
use serde::Deserialize;
use serde_json::{Value, json};
use serde_json::value::RawValue;
use crate::session::OriginalSessionOwner;
use crate::session::session::Session;
use crate::session::step_context::StepContext;

const MAX_RENDER_SOURCE_BYTES: usize = 4_000_000;
const MODEL_RENDERER: &[u8] = include_bytes!("../../prompts/src/model_instructions.rs");
const PLAN_RENDERER: &[u8] = include_bytes!("../../prompts/src/update_plan_instructions.rs");

#[derive(Deserialize)]
struct RawModels<'a> { #[serde(borrow)] models: Vec<&'a RawValue> }
#[derive(Deserialize)]
struct RawModel<'a> {
    slug: String,
    #[serde(borrow)] model_messages: Option<&'a RawValue>,
}
#[derive(Deserialize)]
struct RawMessages<'a> { #[serde(borrow)] instructions_template: Option<&'a RawValue> }

/// The actual selected catalog/renderer occurrence, not persisted provenance.
/// The constructor below performs the render and retains original catalog bytes.
pub(crate) struct OriginalBaseSelection {
    source: OriginalBaseSource,
    template: Arc<str>,
}

enum OriginalBaseSource {
    Model { model: CatalogModel, manager: Arc<OriginalCatalogOwner>,
        catalog: OriginalCatalogEvidence, template_token: Option<Range<usize>> },
    Config(codex_config::OriginalConfigInstruction),
}

struct BaseRendering {
    owner: Weak<OriginalSessionOwner>,
    selection: Arc<OriginalBaseSelection>,
    output: Arc<str>,
    source_ranges: Vec<Range<usize>>,
    plan_omitted: bool,
}

impl std::fmt::Debug for OriginalBaseSelection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OriginalBaseSelection").field("template_bytes", &self.template.len()).finish_non_exhaustive()
    }
}
impl std::fmt::Debug for BaseRendering {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BaseRendering").field("output_bytes", &self.output.len()).finish_non_exhaustive()
    }
}

fn original_model_template(body: &[u8], slug: &str) -> Option<(Option<Range<usize>>, String)> {
    if body.len() > MAX_RENDER_SOURCE_BYTES { return None; }
    let document = std::str::from_utf8(body).ok()?;
    let models: RawModels<'_> = serde_json::from_str(document).ok()?;
    let mut selected = None;
    for raw in models.models {
        let model: RawModel<'_> = serde_json::from_str(raw.get()).ok()?;
        if model.slug != slug { continue; }
        // Ambiguous same-name sources are not resolved by a matching text hash.
        if selected.is_some() { return None; }
        let token = model.model_messages.and_then(|raw|serde_json::from_str::<RawMessages<'_>>(raw.get()).ok())
            .and_then(|messages|messages.instructions_template).filter(|token|token.get() != "null");
        let value = match token {
            Some(raw) if raw.get() != "null" => {
                let template: String = serde_json::from_str(raw.get()).ok()?;
                let start = (raw.get().as_ptr() as usize).checked_sub(document.as_ptr() as usize)?;
                let end = start.checked_add(raw.get().len())?;
                if end > body.len() { return None; }
                (Some(start..end), template)
            }
            _ => (None, String::new()),
        };
        selected = Some(value);
    }
    selected
}

impl OriginalBaseSelection {
    /// Called only in the original FRESH model-base selection branch. It calls
    /// the actual model renderer; it never recognizes arbitrary supplied text.
    pub(crate) fn render_fresh_model(model: &CatalogModel, actual_manager: &dyn ModelsManager) -> Option<Arc<Self>> {
        let catalog = codex_models_manager::original_catalog_source(model)?;
        if catalog.source_kind() != OriginalCatalogSourceKind::Bundled { return None; }
        let actual = codex_models_manager::manager::original_manager_owner(actual_manager)?;
        let manager = catalog.manager_owner()?;
        if !Arc::ptr_eq(actual, &manager) { return None; }
        let (template_token, original_template) = original_model_template(catalog.raw_body(), &model.slug)?;
        let rendered = codex_prompts::render_model_instructions(model);
        if rendered != original_template || rendered.len() > MAX_RENDER_SOURCE_BYTES { return None; }
        Some(Arc::new(Self { source: OriginalBaseSource::Model { model: model.clone(), manager, catalog, template_token }, template: rendered.into() }))
    }
    pub(crate) fn render_fresh_config(config: &crate::config::Config) -> Option<Arc<Self>> {
        let text = config.base_instructions.as_deref()?;
        let source = config.config_layer_stack.original_direct_instruction("base_instructions", text)?;
        Some(Arc::new(Self { source: OriginalBaseSource::Config(source), template: Arc::from(text) }))
    }
    pub(crate) fn rendered_text(&self) -> &str { &self.template }
    pub(crate) fn render_for_session(self: &Arc<Self>, owner: &Arc<OriginalSessionOwner>, actual_text: &str,
        provenance: Option<BaseInstructionsProvenance>) -> Option<BaseInstructions> {
        if actual_text != self.template.as_ref() { return None; }
        let proof = Arc::new(BaseRendering { owner: Arc::downgrade(owner), selection: Arc::clone(self),
            output: Arc::clone(&self.template), source_ranges: vec![0..self.template.len()], plan_omitted: false });
        Some(BaseInstructions { text: proof.output.to_string(), provenance,
            original_instruction_rendering: OriginalInstructionWitness::new(proof) })
    }
}

/// Performs the actual request-only transformation, retaining exact copied UTF8
/// ranges from the original decoded model template. Unattributed input stays so.
pub(crate) fn omit_plan_instructions(mut base: BaseInstructions) -> BaseInstructions {
    let before = base.text.clone();
    let (output, spans) = codex_prompts::without_update_plan_instructions_with_spans(&before);
    let rendering = base.original_instruction_rendering.downcast_ref::<BaseRendering>()
        .filter(|proof| !proof.plan_omitted && proof.output.as_ref() == before);
    let witness = rendering.map(|proof|OriginalInstructionWitness::new(Arc::new(BaseRendering {
        owner: proof.owner.clone(), selection: Arc::clone(&proof.selection), output: Arc::from(output.as_str()),
        source_ranges: spans, plan_omitted: true,
    }))).unwrap_or_default();
    base.text = output;
    base.original_instruction_rendering = witness;
    base
}

pub(crate) fn base_source_record(session: &Session, step: &StepContext, base: &BaseInstructions) -> Option<Value> {
    let proof = base.original_instruction_rendering.downcast_ref::<BaseRendering>()?;
    let owner = proof.owner.upgrade()?;
    if !Arc::ptr_eq(&owner, session.original_provenance_owner()) || proof.output.as_ref() != base.text { return None; }
    let source = match &proof.selection.source {
        OriginalBaseSource::Model { model, manager, catalog, template_token } => {
            let current_owner = codex_models_manager::manager::original_manager_owner(session.services.models_manager.as_ref())?;
            if !Arc::ptr_eq(current_owner, manager) || !Arc::ptr_eq(&model.model, &step.settings.model_info.model) { return None; }
            let current = codex_models_manager::original_catalog_source(model)?;
            if current.source_kind() != OriginalCatalogSourceKind::Bundled ||
                current.materialized_model_bytes() != catalog.materialized_model_bytes() || current.raw_body() != catalog.raw_body() { return None; }
            json!({"kind":"original-bundled-model-template",
                "catalog_source_bytes_sha256":codex_api::protected_peer::source_bytes_sha256(catalog.raw_body()),
                "catalog_source_bytes":catalog.raw_body().len(),
                "model_template_json_token":template_token.as_ref().map(|r|json!({"start":r.start,"end":r.end}))})
        }
        OriginalBaseSource::Config(source) => {
            let current = step.turn.config.config_layer_stack.original_direct_instruction("base_instructions", source.materialized_text())?;
            if current.original_occurrence() != source.original_occurrence() || current.original_utf8() != source.original_utf8() { return None; }
            original_config_record(source)
        }
    };
    if proof.plan_omitted && (step.turn.config.update_plan_enabled || step.turn.config.model_catalog.is_some()) { return None; }
    let spans = proof.source_ranges.iter().map(|range|json!({"template_utf8_start":range.start,"template_utf8_end":range.end})).collect::<Vec<_>>();
    Some(json!({"protocol":"original-model-base-renderer-v1",
        "original_source":source,
        "decoded_template_utf8_bytes":proof.selection.template.len(),
        "rendered_utf8_bytes":proof.output.len(),"rendered_utf8_sha256":codex_api::protected_peer::source_bytes_sha256(proof.output.as_bytes()),
        "actual_model_renderer_source_sha256":codex_api::protected_peer::source_bytes_sha256(MODEL_RENDERER),
        "request_plan_transform":proof.plan_omitted,
        "plan_transform_source_sha256":proof.plan_omitted.then(||codex_api::protected_peer::source_bytes_sha256(PLAN_RENDERER)),
        "exact_original_template_copy_ranges":spans,
        "authority":"source facts only; current grants/approval/model policy remain independent"}))
}

/// Data-only carry at the ACTUAL client base-prefix creation seam. Final runtime
/// wire projection must still bind this prefix and every original input item.
pub(crate) fn carry_base_prefix(base: &BaseInstructions, item: &mut ResponseItem) {
    if base.original_instruction_rendering.downcast_ref::<BaseRendering>().is_none() { return; }
    if let ResponseItem::Message { internal_chat_message_metadata_passthrough, .. } = item {
        internal_chat_message_metadata_passthrough.get_or_insert_default().original_instruction_rendering =
            base.original_instruction_rendering.clone();
    }
}

fn original_config_record(source: &codex_config::OriginalConfigInstruction) -> Value {
    let range = source.original_token_range();
    json!({"kind":"original-direct-config-file-field", "path":source.original_path().as_path().display().to_string(),
        "original_read_occurrence":source.original_occurrence(), "field":source.field(),
        "original_utf8_bytes":source.original_utf8().len(),
        "original_utf8_sha256":codex_api::protected_peer::source_bytes_sha256(source.original_utf8().as_bytes()),
        "toml_string_token":{"start":range.start,"end":range.end},
        "materialization":"original loader parse + path resolution + enabled layer order; direct field only"})
}

use std::any::{Any, TypeId};
use std::sync::atomic::{AtomicBool, Ordering};
use codex_context_fragments::{ContextualUserFragment, RenderedFragment};
use crate::context::world_state::{self, WorldStateUpdate, WorldStateUpdateContent};

/// Retains the ACTUAL private Step and its immutable controls. Compact rollout
/// comparison hashes are recorded separately and never stand in for controls.
pub(crate) struct OriginalRendererFrame {
    owner: Weak<OriginalSessionOwner>, step: Arc<StepContext>, base: BaseInstructions,
    original_base: Value,
}

pub(crate) fn original_renderer_frame(session: &Session, step: &StepContext, base: &BaseInstructions)
    -> Option<Arc<OriginalRendererFrame>> {
    let original_base = base_source_record(session, step, base)?;
    let catalog = codex_models_manager::original_catalog_source(&step.settings.model_info)?;
    let actual = codex_models_manager::manager::original_manager_owner(session.services.models_manager.as_ref())?;
    if catalog.source_kind() != OriginalCatalogSourceKind::Bundled ||
        !Arc::ptr_eq(actual, &catalog.manager_owner()?) { return None; }
    Some(Arc::new(OriginalRendererFrame { owner: Arc::downgrade(session.original_provenance_owner()),
        step: Arc::new(step.clone()), base: base.clone(), original_base }))
}

/// The actual concrete section object is retained, including its un-hashed
/// materialized controls. TypeId selects supported source implementations;
/// an extension advertising the same section ID cannot mint this receipt.
pub(crate) struct OriginalWorldSectionSource {
    kind: &'static str, _actual_typed_controls: Arc<dyn Any + Send + Sync>,
}
pub(crate) fn original_section_source<S: Any + Send + Sync>(section: Arc<S>) -> Option<Arc<OriginalWorldSectionSource>> {
    let id = TypeId::of::<S>();
    macro_rules! known { ($($ty:ty => $name:literal),* $(,)?) => { $(
        if id == TypeId::of::<$ty>() {
            return Some(Arc::new(OriginalWorldSectionSource { kind:$name, _actual_typed_controls:section }));
        }
    )* }; }
    known!(world_state::PermissionsState => "permissions", world_state::CompactPermissionsState => "approved-prefixes",
        world_state::EnvironmentsState => "environments", world_state::EnvironmentsInstructionsState => "environment-guidance",
        world_state::AppsInstructionsState => "apps-guidance", world_state::PluginsInstructionsState => "plugins-guidance",
        world_state::ModelInstructionsState => "model-instructions", world_state::ContextWindowGuidanceState => "context-window-guidance",
        world_state::AgentsMdState => "agents-md");
    let typed = section.as_ref() as &dyn Any;
    let known_selection = if typed.downcast_ref::<world_state::MultiAgentModeState>().is_some_and(|state|state.original_builtin_mode()) {
        Some("builtin-multi-agent-mode")
    } else if typed.downcast_ref::<world_state::MultiAgentUsageHintState>().is_some_and(|state|state.original_composed_selection()) {
        Some("original-step-model-role-selection")
    } else if typed.downcast_ref::<world_state::CollaborationModeState>().is_some_and(|state|state.original_catalog_selection()) {
        Some("original-model-collaboration-selection")
    } else { None };
    if let Some(kind) = known_selection {
        return Some(Arc::new(OriginalWorldSectionSource {kind,_actual_typed_controls:section}));
    }
    // Custom collaboration/multi-agent text, managed requirements, remote tool
    // declarations, persistent goals, realtime and extension contributions need
    // their own original loader/selector receipts; no label/text recognition.
    None
}

enum OriginalFragmentSource {
    World { frame: Arc<OriginalRendererFrame>, section: Arc<OriginalWorldSectionSource>,
        previous: Value, comparison_snapshot: Option<Value> },
    Config { owner: Weak<OriginalSessionOwner>, turn_id: String, source: codex_config::OriginalConfigInstruction },
}
struct OriginalFragmentRendering {
    source: Arc<OriginalFragmentSource>, body: Arc<[u8]>, consumed: AtomicBool,
}
/// This is private Core evidence, unlike the public data-only carrier.
struct OriginalMessageRendering {
    parts: Vec<Arc<OriginalFragmentRendering>>, body: Arc<[u8]>, consumed: AtomicBool,
}
struct AdmittedOriginalRendering {
    rendering: Arc<OriginalMessageRendering>, occurrence: u64, materialized: Arc<[u8]>,
}

fn renderer_body(item: &ResponseItem) -> Option<Vec<u8>> {
    let mut body = item.clone();
    // Original Core ID/turn/time stamps are bound at live admission below. Only
    // that known metadata stage may differ from the original fragment body.
    body.set_id(None);
    if let ResponseItem::Message { internal_chat_message_metadata_passthrough, .. } = &mut body {
        let metadata = internal_chat_message_metadata_passthrough.get_or_insert_default();
        metadata.turn_id = None; metadata.create_time = None;
        metadata.original_instruction_rendering = Default::default();
    }
    let bytes = serde_json::to_vec(&body).ok()?;
    (bytes.len() <= MAX_RENDER_SOURCE_BYTES).then_some(bytes)
}
fn fragment_with_source(fragment: RenderedFragment, source: Arc<OriginalFragmentSource>) -> RenderedFragment {
    let Some(body) = renderer_body(&ResponseItem::from(fragment.clone())) else { return fragment; };
    fragment.with_original_instruction_rendering(OriginalInstructionWitness::new(Arc::new(
        OriginalFragmentRendering { source, body:body.into(), consumed:AtomicBool::new(false) })))
}

struct OriginalWorldFragment {
    fragment: Box<dyn ContextualUserFragment>, source: Arc<OriginalFragmentSource>,
}
impl ContextualUserFragment for OriginalWorldFragment {
    fn role(&self) -> &'static str { self.fragment.role() }
    fn content_metadata(&self) -> codex_protocol::models::ContentItemMetadata { self.fragment.content_metadata() }
    fn content_kind(&self) -> codex_protocol::models::ContentItemKind { self.fragment.content_kind() }
    fn markers(&self) -> (&'static str, &'static str) { self.fragment.markers() }
    fn type_markers() -> (&'static str, &'static str) { ("", "") }
    fn body(&self) -> codex_protocol::models::ContentItem { self.fragment.body() }
    fn render(&self) -> codex_protocol::models::ContentItem { self.fragment.render() }
    fn render_fragment(&self) -> RenderedFragment {
        // The actual original concrete fragment performs the render here.
        fragment_with_source(self.fragment.render_fragment(), Arc::clone(&self.source))
    }
}

pub(crate) fn bind_world_section_updates(frame: &Arc<OriginalRendererFrame>, section: &Arc<OriginalWorldSectionSource>,
    previous: Value, comparison_snapshot: Option<Value>, updates: &mut [WorldStateUpdate]) {
    if section.kind == "agents-md" && frame.step.loaded_agents_md.as_ref().is_some_and(|loaded|
        loaded.protected_source_records().as_array().is_none_or(|records|
            records.iter().any(|record|record.get("original_file_bytes_sha256").is_none_or(Value::is_null)))) { return; }
    for update in updates {
        let source = Arc::new(OriginalFragmentSource::World { frame: Arc::clone(frame), section: Arc::clone(section),
            previous: previous.clone(), comparison_snapshot:comparison_snapshot.clone() });
        let original = std::mem::replace(&mut update.content, WorldStateUpdateContent::Item(Box::new(
            codex_context_fragments::message_from_parts("developer", Vec::new()))));
        update.content = match original {
            WorldStateUpdateContent::Fragment(fragment) => WorldStateUpdateContent::Fragment(Box::new(
                OriginalWorldFragment { fragment, source })),
            WorldStateUpdateContent::Item(mut item) => {
                if let Some(body) = renderer_body(&item) {
                    let part = Arc::new(OriginalFragmentRendering { source, body:body.clone().into(), consumed:AtomicBool::new(true) });
                    set_message_witness(&mut item, Arc::new(OriginalMessageRendering {
                        parts: vec![part], body:body.into(), consumed:AtomicBool::new(false) }));
                }
                WorldStateUpdateContent::Item(item)
            }
        };
    }
}

/// Called at the actual direct-config developer renderer, not by text matching.
pub(crate) fn render_original_developer(session: &Session, step: &StepContext, text: &str) -> RenderedFragment {
    let rendered = crate::context::DeveloperInstructions::new(text).render_fragment();
    let Some(source) = step.turn.config.config_layer_stack.original_direct_instruction("developer_instructions", text)
        else { return rendered; };
    fragment_with_source(rendered, Arc::new(OriginalFragmentSource::Config {
        owner:Arc::downgrade(session.original_provenance_owner()), turn_id:step.turn.sub_id.clone(), source }))
}

pub(crate) struct OriginalMessageParts(Vec<Arc<OriginalFragmentRendering>>);
pub(crate) fn original_message_parts(fragments: &[RenderedFragment]) -> Option<OriginalMessageParts> {
    let mut parts = Vec::new();
    for fragment in fragments {
        let proof = fragment.original_instruction_rendering().downcast_ref::<OriginalFragmentRendering>()?;
        if renderer_body(&ResponseItem::from(fragment.clone()))?.as_slice() != proof.body.as_ref() ||
            proof.consumed.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() { return None; }
        // The original source object is retained; only its per-fragment data is
        // copied. The old publicly transportable capsule is now spent.
        parts.push(Arc::new(OriginalFragmentRendering { source:Arc::clone(&proof.source),
            body:Arc::clone(&proof.body), consumed:AtomicBool::new(true) }));
    }
    (!parts.is_empty()).then_some(OriginalMessageParts(parts))
}
fn set_message_witness(item: &mut ResponseItem, proof: Arc<OriginalMessageRendering>) {
    if let ResponseItem::Message { internal_chat_message_metadata_passthrough, .. } = item {
        internal_chat_message_metadata_passthrough.get_or_insert_default().original_instruction_rendering = OriginalInstructionWitness::new(proof);
    }
}
pub(crate) fn bind_assembled_message(item: &mut ResponseItem, parts: Option<OriginalMessageParts>) {
    let Some(parts) = parts else { return; };
    let Some(body) = renderer_body(item) else { return; };
    let ResponseItem::Message { role, .. } = item else { return; };
    let mut contents = Vec::new();
    for part in &parts.0 {
        let Ok(mut original) = serde_json::from_slice::<ResponseItem>(&part.body) else { return; };
        if !matches!(&original, ResponseItem::Message { role:original_role, .. } if original_role == role) { return; }
        let Some(parts) = codex_context_fragments::to_annotated_content(&mut original) else { return; };
        contents.extend(parts);
    }
    let composed = codex_context_fragments::message_from_parts(role.clone(), contents);
    if renderer_body(&composed).as_deref() != Some(body.as_slice()) { return; }
    set_message_witness(item, Arc::new(OriginalMessageRendering { parts:parts.0, body:body.into(), consumed:AtomicBool::new(false) }));
}

/// ORIGINAL live history producer only. The protocol capsule is ALWAYS removed
/// before a public snapshot can expose the stored item. A replayed/spent or
/// changed capsule cannot acquire a new occurrence, even in the same Session.
pub(crate) fn admit_original_history_renderer(envelope: &mut codex_history::ResponseItemEnvelope, original_live: bool) {
    let witness = envelope.item.take_original_instruction_rendering();
    // Do not trust a copied harness-level capsule on generic injection/replay.
    if let Some(metadata) = envelope.metadata.as_mut() {
        metadata.original_instruction_rendering = None;
    }
    if !original_live { return; }
    if !matches!(&envelope.item, ResponseItem::Message { .. }) { return; }
    let single;
    let proof = if let Some(proof) = witness.downcast_ref::<OriginalMessageRendering>() { proof }
        else if let Some(part) = witness.downcast_ref::<OriginalFragmentRendering>() {
            if part.consumed.compare_exchange(false,true,Ordering::SeqCst,Ordering::SeqCst).is_err() { return; }
            single = OriginalMessageRendering { parts:vec![Arc::new(OriginalFragmentRendering {
                source:Arc::clone(&part.source),body:Arc::clone(&part.body),consumed:AtomicBool::new(true) })],
                body:Arc::clone(&part.body),consumed:AtomicBool::new(false) };
            &single
        } else { return; };
    let Some(body) = renderer_body(&envelope.item) else { return; };
    if body.as_slice() != proof.body.as_ref() || proof.consumed.compare_exchange(false,true,Ordering::SeqCst,Ordering::SeqCst).is_err() { return; }
    let Some(receipt) = envelope.metadata.as_ref().and_then(|metadata|metadata.original_item_receipt.as_ref()) else { return; };
    let Ok(materialized) = serde_json::to_vec(&envelope.item) else { return; };
    if materialized.as_slice() != receipt.original_materialized_bytes() { return; }
    let admitted = AdmittedOriginalRendering { rendering:Arc::new(OriginalMessageRendering {
        parts:proof.parts.clone(), body:Arc::clone(&proof.body), consumed:AtomicBool::new(true) }),
        occurrence:receipt.occurrence(), materialized:materialized.into() };
    envelope.metadata.get_or_insert_default().original_instruction_rendering = Some(
        codex_history::OriginalProducerWitness::new(Arc::new(admitted)));
}

/// Private Core validator for the later typed runtime projection join. Returning
/// JSON source facts alone never clears the API's original-origin Hold.
pub(crate) struct ValidatedOriginalRendering {
    occurrence: u64, materialized: Arc<[u8]>, sources: Value,
}
impl ValidatedOriginalRendering {
    pub(crate) fn occurrence(&self) -> u64 { self.occurrence }
    pub(crate) fn materialized_bytes(&self) -> &[u8] { &self.materialized }
    pub(crate) fn source_facts(&self) -> &Value { &self.sources }
}
fn original_content_ranges(bytes: &[u8]) -> Option<Vec<Range<usize>>> {
    #[derive(Deserialize)]
    struct Content<'a> { #[serde(borrow)] content: Vec<&'a RawValue> }
    let contents: Content<'_> = serde_json::from_slice(bytes).ok()?;
    contents.content.into_iter().map(|raw| {
        let start=(raw.get().as_ptr() as usize).checked_sub(bytes.as_ptr() as usize)?;
        let end=start.checked_add(raw.get().len())?;
        (end<=bytes.len()).then_some(start..end)
    }).collect()
}
pub(crate) fn validate_history_renderer(session: &Session, envelope: &codex_history::ResponseItemEnvelope) -> Option<ValidatedOriginalRendering> {
    let metadata = envelope.metadata.as_ref()?;
    let admitted = metadata.original_instruction_rendering.as_ref()?.downcast_ref::<AdmittedOriginalRendering>()?;
    let receipt = metadata.original_item_receipt.as_ref()?;
    let bytes = serde_json::to_vec(&envelope.item).ok()?;
    if receipt.occurrence() != admitted.occurrence || receipt.original_read().is_some() ||
        bytes.as_slice() != admitted.materialized.as_ref() || bytes.as_slice() != receipt.original_materialized_bytes() ||
        bytes.as_slice() != receipt.projected_bytes() { return None; }
    let mut sources = Vec::new();
    let final_content = original_content_ranges(&bytes)?;
    let mut next_content = 0;
    for part in &admitted.rendering.parts {
        let original_content = original_content_ranges(&part.body)?;
        let mut content_mapping = Vec::new();
        for original in original_content {
            let final_range = final_content.get(next_content)?;
            if part.body.get(original.clone()) != bytes.get(final_range.clone()) { return None; }
            content_mapping.push(json!({"final_content_index":next_content,
                "original_fragment_json_utf8_start":original.start,"original_fragment_json_utf8_end":original.end,
                "materialized_message_json_utf8_start":final_range.start,"materialized_message_json_utf8_end":final_range.end}));
            next_content += 1;
        }
        let source = match part.source.as_ref() {
            OriginalFragmentSource::World { frame, section, previous, comparison_snapshot } => {
                if !Arc::ptr_eq(&frame.owner.upgrade()?, session.original_provenance_owner()) ||
                    envelope.item.turn_id() != Some(frame.step.turn.sub_id.as_str()) { return None; }
                base_source_record(session, &frame.step, &frame.base)?;
                let controls = serde_json::to_vec(&frame.step.to_turn_context_item()).ok()?;
                json!({"kind":"original-concrete-world-state-renderer", "concrete_type":section.kind,
                    "original_base":frame.original_base,
                    "original_step_controls_retained_privately":true,
                    "original_step_controls_utf8_bytes":controls.len(),
                    "original_step_controls_utf8_sha256":codex_api::protected_peer::source_bytes_sha256(&controls),
                    "actual_typed_section_controls_retained":true,
                    "comparison_state_only":previous,"comparison_snapshot_only":comparison_snapshot,
                    "agents_original_sources":(section.kind=="agents-md").then(||frame.step.loaded_agents_md.as_ref().map(|loaded|loaded.protected_source_records()))})
            }
            OriginalFragmentSource::Config { owner, turn_id, source } => {
                if !Arc::ptr_eq(&owner.upgrade()?, session.original_provenance_owner()) ||
                    envelope.item.turn_id() != Some(turn_id.as_str()) { return None; }
                original_config_record(source)
            }
        };
        sources.push(json!({"original_source":source,"exact_original_content_spans":content_mapping,"original_rendered_fragment_bytes":part.body.len(),
            "original_rendered_fragment_sha256":codex_api::protected_peer::source_bytes_sha256(&part.body)}));
    }
    if next_content != final_content.len() { return None; }
    let resources = crate::original_instruction_resources::ORIGINAL_RENDERER_RESOURCES.iter().map(|(path,bytes)|
        json!({"path":path,"bytes":bytes.len(),"sha256":codex_api::protected_peer::source_bytes_sha256(bytes)})).collect::<Vec<_>>();
    let sources = json!({"protocol":"original-instruction-renderer-chain-v1","original_history_occurrence":admitted.occurrence,
        "original_materialized_message_bytes":bytes.len(),"original_materialized_message_sha256":codex_api::protected_peer::source_bytes_sha256(&bytes),
        "original_parts":sources,"compile_time_renderer_inputs":resources,
        "authority":"source facts only; actual Session/runtime/current grants remain independent"});
    Some(ValidatedOriginalRendering { occurrence:admitted.occurrence, materialized:Arc::clone(&admitted.materialized), sources })
}

/// DATA captured from the actual private ModelClient at its final prepared-input
/// seam. These flags describe a supported normalization; none confers authority.
pub(crate) struct OriginalWireControls {
    pub(crate) thread_id: String,
    pub(crate) use_responses_lite: bool,
    pub(crate) content_item_kinds_enabled: bool,
    pub(crate) is_openai: bool,
}
pub(crate) struct OriginalWireProjection {
    owner: Weak<OriginalSessionOwner>, before: Arc<[u8]>, after: Arc<[u8]>, sources: Value,
    _actual_typed_tools: Arc<[codex_tools::ToolSpec]>, fresh_r_lite_inventory: Option<Arc<[u8]>>,
}
impl OriginalWireProjection {
    pub(crate) fn original_input_bytes(&self) -> &[u8] { &self.before }
    pub(crate) fn final_input_bytes(&self) -> &[u8] { &self.after }
    pub(crate) fn source_facts(&self) -> &Value { &self.sources }
    pub(crate) fn fresh_r_lite_inventory_bytes(&self) -> Option<&[u8]> { self.fresh_r_lite_inventory.as_deref() }
    pub(crate) fn owner_token(&self) -> Option<Arc<dyn Any + Send + Sync>> {
        Some(self.owner.upgrade()?)
    }
}

fn serialized_item_ranges(bytes: &[u8]) -> Option<Vec<Range<usize>>> {
    let values: Vec<&RawValue> = serde_json::from_slice(bytes).ok()?;
    values.into_iter().map(|value| {
        let start = (value.get().as_ptr() as usize).checked_sub(bytes.as_ptr() as usize)?;
        let end = start.checked_add(value.get().len())?;
        (end <= bytes.len() && bytes.get(start..end) == Some(value.get().as_bytes())).then_some(start..end)
    }).collect()
}

/// Exact source-owned mapping at the ACTUAL final ModelClient projection seam.
/// No omission algorithm, injected prefix, or restored/compacted content can be
/// blessed by an equal semantic hash. The API still has to bind this value to
/// the SAME actual Session/runtime, original parent input and current send fence.
pub(crate) fn original_wire_projection(base: &BaseInstructions, before: &[ResponseItem], after: &[ResponseItem],
    controls: OriginalWireControls, tools: &[codex_tools::ToolSpec]) -> Option<OriginalWireProjection> {
    if !controls.is_openai || before.is_empty() { return None; }
    let proof = base.original_instruction_rendering.downcast_ref::<BaseRendering>()?;
    proof.owner.upgrade()?;
    if proof.output.as_ref() != base.text { return None; }
    // Media transformations and every non-message producer require their own
    // original exact projection; this initial path does not infer those links.
    if !before.iter().all(|item|matches!(item, ResponseItem::Message { role, content, .. }
        if matches!(role.as_str(), "user"|"developer"|"system") &&
        content.iter().all(|part|matches!(part,codex_protocol::models::ContentItem::InputText { .. })))) { return None; }
    let mut expected = Vec::with_capacity(before.len()+2);
    let namespace = uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_OID,controls.thread_id.as_bytes());
    let fresh_r_lite_inventory = if controls.use_responses_lite && !tools.is_empty() {
        // The real original typed encoder, not a receipt-shaped JSON declaration.
        let encoded = codex_tools::create_tools_json_for_responses_lite(tools).ok()?;
        let bytes = serde_json::to_vec(&encoded).ok()?;
        if bytes.len() > MAX_RENDER_SOURCE_BYTES { return None; }
        expected.push(ResponseItem::AdditionalTools {
            id:Some(codex_protocol::ResponseItemId::with_suffix("at",uuid::Uuid::new_v5(&namespace,&bytes))),
            role:"developer".to_owned(),tools:Arc::from(encoded),
        });
        Some(Arc::<[u8]>::from(bytes))
    } else { None };
    let base_index = expected.len();
    if !base.text.is_empty() {
        let mut prefix = ContextualUserFragment::into(crate::context::BaseInstructionsFragment(base.text.clone()));
        prefix.set_id(Some(codex_protocol::ResponseItemId::with_suffix("msg",
            uuid::Uuid::new_v5(&namespace,base.text.as_bytes()))));
        expected.push(prefix);
    }
    expected.extend_from_slice(before);
    for item in &mut expected {
        // These are the exact existing normalizations in client.rs for this
        // supported transport. Preserve role/text/content count and all other
        // fields; unrecognized changes simply fail the final byte comparison.
        if !controls.use_responses_lite { item.clear_content_item_metadata(); }
        if item.id().is_some_and(|id|!id.is_prefixed()) { item.set_id(None); }
        if !controls.content_item_kinds_enabled { item.clear_content_item_kinds(); }
    }
    let before_bytes = serde_json::to_vec(before).ok()?;
    let expected_bytes = serde_json::to_vec(&expected).ok()?;
    let after_bytes = serde_json::to_vec(after).ok()?;
    if before_bytes.len()>MAX_RENDER_SOURCE_BYTES || after_bytes.len()>MAX_RENDER_SOURCE_BYTES ||
        expected_bytes != after_bytes { return None; }
    let old_ranges = serialized_item_ranges(&before_bytes)?;
    let new_ranges = serialized_item_ranges(&after_bytes)?;
    let offset = base_index+usize::from(!base.text.is_empty());
    let mapping = old_ranges.iter().enumerate().map(|(index,range)| {
        let output = &new_ranges[index+offset];
        json!({"original_index":index,"original_json_utf8_start":range.start,"original_json_utf8_end":range.end,
            "final_index":index+offset,"final_json_utf8_start":output.start,"final_json_utf8_end":output.end,
            "role_content_order_and_text":"exact unchanged; only enumerated metadata/ID normalization"})
    }).collect::<Vec<_>>();
    let prefix = (!base.text.is_empty()).then(|| {
        let range = &new_ranges[base_index];
        json!({"final_index":base_index,"final_json_utf8_start":range.start,"final_json_utf8_end":range.end,
            "source":"same private original BaseRendering capsule","original_rendered_utf8_bytes":proof.output.len(),
            "original_rendered_utf8_sha256":codex_api::protected_peer::source_bytes_sha256(proof.output.as_bytes()),
            "template_copy_ranges":proof.source_ranges.iter().map(|r|json!({"start":r.start,"end":r.end})).collect::<Vec<_>>()})
    });
    let sources = json!({"protocol":"original-core-text-wire-projection-v1","original_input_bytes":before_bytes.len(),
        "original_input_sha256":codex_api::protected_peer::source_bytes_sha256(&before_bytes),
        "final_input_bytes":after_bytes.len(),"final_input_sha256":codex_api::protected_peer::source_bytes_sha256(&after_bytes),
        "exact_original_item_mapping":mapping,"original_base_prefix":prefix,
        "fresh_r_lite_tool_inventory":fresh_r_lite_inventory.as_ref().map(|bytes|json!({
            "final_index":0,"final_json_utf8_start":new_ranges[0].start,"final_json_utf8_end":new_ranges[0].end,
            "encoder_source":"codex-tools/src/tool_spec.rs::create_tools_json_for_responses_lite",
            "actual_typed_tools_retained_privately":true,"encoded_inventory_bytes":bytes.len(),
            "encoded_inventory_sha256":codex_api::protected_peer::source_bytes_sha256(bytes),
            "acceptance":"API must still enforce the complete fixed-five source-owned schemas; this mapping confers no tool authority"})),
        "actual_responses_lite":controls.use_responses_lite,
        "normalization":"actual OpenAI Responses: preserve RLite content metadata; clear it otherwise; clear nonprefixed IDs; optionally clear content kinds",
        "authority":"private source mapping only; API must bind same actual Session/runtime and current parent projection"});
    Some(OriginalWireProjection { owner:proof.owner.clone(),before:before_bytes.into(),after:after_bytes.into(),sources,
        _actual_typed_tools:Arc::from(tools),fresh_r_lite_inventory })
}

#[cfg(test)]
#[path = "original_instruction_renderer_tests.rs"]
mod tests;
