//! Original catalog observations live outside public model/cache shapes. A label,
//! restored cache entry, equal model value or caller-created Arc is not a receipt.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::sync::Weak;

use codex_api::OriginalModelsResponse;
use codex_protocol::openai_models::ModelInfo;
use codex_protocol::openai_models::ModelsResponse;

use crate::CatalogModel;
use crate::ModelOrigin;

/// Identity owned by one real manager instance. Callers can compare an existing
/// owner but cannot create or assign one to a manager or materialized model.
#[derive(Debug)]
pub struct OriginalCatalogOwner {
    active_response: Mutex<Option<String>>,
}

impl OriginalCatalogOwner {
    pub(crate) fn new() -> Arc<Self> {
        Arc::new(Self { active_response: Mutex::new(None) })
    }

    /// Read-only current in-memory original occurrence. Cache restore clears it.
    pub fn current_response_instance(&self) -> Option<String> {
        self.active_response.lock().ok()?.clone()
    }

    pub(crate) fn select_response(&self, original: Option<&OriginalCatalogCapture>) {
        if let Ok(mut current) = self.active_response.lock() {
            *current = original.and_then(|capture| match capture.0.as_ref() {
                OriginalSource::Provider(response) => Some(response.response_instance().to_owned()),
                OriginalSource::Bundled { .. } => None,
            });
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OriginalCatalogSourceKind {
    /// Original concrete response bytes, not current provider/auth-fetch authority.
    ProviderResponse,
    Bundled,
}

enum OriginalSource {
    Provider(OriginalModelsResponse),
    Bundled {
        body: &'static [u8],
        models: Vec<ModelInfo>,
    },
}

impl std::fmt::Debug for OriginalSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OriginalCatalogSource")
            .field("kind", &self.kind())
            .field("body_bytes", &self.raw_body().len())
            .finish_non_exhaustive()
    }
}

impl OriginalSource {
    fn kind(&self) -> OriginalCatalogSourceKind {
        match self {
            Self::Provider(_) => OriginalCatalogSourceKind::ProviderResponse,
            Self::Bundled { .. } => OriginalCatalogSourceKind::Bundled,
        }
    }

    fn raw_body(&self) -> &[u8] {
        match self {
            Self::Provider(response) => response.raw_body(),
            Self::Bundled { body, .. } => body,
        }
    }

    fn models(&self) -> &[ModelInfo] {
        match self {
            Self::Provider(response) => response.models(),
            Self::Bundled { models, .. } => models,
        }
    }
}

/// Shared capture created only inside actual fetch or bundled-load processing.
#[derive(Debug, Clone)]
pub(crate) struct OriginalCatalogCapture(Arc<OriginalSource>);

impl OriginalCatalogCapture {
    pub(crate) fn provider(
        response: OriginalModelsResponse,
        models: &[ModelInfo],
        etag: Option<&str>,
    ) -> Option<Self> {
        // A generic endpoint may return an existing opaque receipt. It cannot
        // relabel another response or mutate decoded models beneath that receipt.
        if response.models() != models || response.etag() != etag {
            return None;
        }
        Some(Self(Arc::new(OriginalSource::Provider(response))))
    }

    pub(crate) fn matches_catalog(&self, models: &[ModelInfo]) -> bool {
        self.0.models() == models
    }

    pub(crate) fn bind_model(
        &self,
        catalog: &CatalogModel,
        original_model: &ModelInfo,
        owner: Option<&Arc<OriginalCatalogOwner>>,
    ) {
        if !self.0.models().iter().any(|model| model == original_model) {
            return;
        }
        bind_materialized(catalog, Arc::clone(&self.0), owner.map(Arc::downgrade));
    }
}

/// Genuine compile-time bundled bytes are decoded at this original load site.
/// Arbitrary StaticModelsManager values never pass through this constructor.
pub(crate) fn load_bundled_original()
-> Result<(ModelsResponse, OriginalCatalogCapture), serde_json::Error> {
    let body: &'static [u8] = include_bytes!("../models.json");
    let response: ModelsResponse = serde_json::from_slice(body)?;
    let capture = OriginalCatalogCapture(Arc::new(OriginalSource::Bundled {
        body,
        models: response.models.clone(),
    }));
    Ok((response, capture))
}

/// Read-only original bytes and the separately retained materialized-model view.
/// No constructor, Deserialize implementation, or caller-supplied ready bit exists.
/// This raw evidence alone does not attest current provider/auth scope. Only the
/// model-provider's separate private default-factory binding can establish that.
#[derive(Clone)]
pub struct OriginalCatalogEvidence {
    source: Arc<OriginalSource>,
    materialized_model: Arc<[u8]>,
    manager_owner: Option<Weak<OriginalCatalogOwner>>,
}

impl std::fmt::Debug for OriginalCatalogEvidence {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OriginalCatalogEvidence")
            .field("source_kind", &self.source_kind())
            .field("raw_body_bytes", &self.raw_body().len())
            .field("materialized_model_bytes", &self.materialized_model.len())
            .finish_non_exhaustive()
    }
}

impl OriginalCatalogEvidence {
    pub fn manager_owner(&self) -> Option<Arc<OriginalCatalogOwner>> {
        self.manager_owner.as_ref()?.upgrade()
    }

    pub fn response_instance(&self) -> Option<&str> {
        match self.source.as_ref() {
            OriginalSource::Provider(response) => Some(response.response_instance()),
            OriginalSource::Bundled { .. } => None,
        }
    }

    pub fn source_kind(&self) -> OriginalCatalogSourceKind {
        self.source.kind()
    }

    pub fn raw_body(&self) -> &[u8] {
        self.source.raw_body()
    }

    pub fn request_url(&self) -> Option<&str> {
        match self.source.as_ref() {
            OriginalSource::Provider(response) => Some(response.request_url()),
            OriginalSource::Bundled { .. } => None,
        }
    }

    pub fn etag(&self) -> Option<&str> {
        match self.source.as_ref() {
            OriginalSource::Provider(response) => response.etag(),
            OriginalSource::Bundled { .. } => None,
        }
    }

    pub fn materialized_model_bytes(&self) -> &[u8] {
        &self.materialized_model
    }
}

struct BoundModel {
    model: Weak<ModelInfo>,
    origin: ModelOrigin,
    evidence: OriginalCatalogEvidence,
}

fn bindings() -> &'static Mutex<HashMap<usize, BoundModel>> {
    static BINDINGS: OnceLock<Mutex<HashMap<usize, BoundModel>>> = OnceLock::new();
    BINDINGS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn bind_materialized(
    catalog: &CatalogModel,
    source: Arc<OriginalSource>,
    manager_owner: Option<Weak<OriginalCatalogOwner>>,
) {
    let expected_origin = match source.kind() {
        OriginalCatalogSourceKind::ProviderResponse => ModelOrigin::Provider,
        OriginalCatalogSourceKind::Bundled => ModelOrigin::Bundled,
    };
    if catalog.origin != expected_origin {
        return;
    }
    let Ok(bytes) = serde_json::to_vec(catalog.model.as_ref()) else {
        return;
    };
    let Ok(mut registry) = bindings().lock() else {
        return;
    };
    // Weak references neither keep model values alive nor admit allocator reuse.
    registry.retain(|_, bound| bound.model.strong_count() > 0);
    registry.insert(Arc::as_ptr(&catalog.model) as usize, BoundModel {
        model: Arc::downgrade(&catalog.model),
        origin: catalog.origin,
        evidence: OriginalCatalogEvidence { source, materialized_model: bytes.into(), manager_owner },
    });
}

/// Returns source-byte evidence only. A Provider response cannot clear a current
/// fetch/provider-scope HOLD merely because its models, ETag or labels agree.
pub fn original_catalog_source(catalog: &CatalogModel) -> Option<OriginalCatalogEvidence> {
    let registry = bindings().lock().ok()?;
    let bound = registry.get(&(Arc::as_ptr(&catalog.model) as usize))?;
    let original = bound.model.upgrade()?;
    if !Arc::ptr_eq(&original, &catalog.model) || bound.origin != catalog.origin {
        return None;
    }
    let current = serde_json::to_vec(catalog.model.as_ref()).ok()?;
    if current.as_slice() != bound.evidence.materialized_model_bytes() {
        return None;
    }
    Some(bound.evidence.clone())
}

/// Only manager-owned slug/config materialization may carry a validated capture
/// into its newly allocated Arc. Public callers cannot attach evidence to a model.
pub(crate) fn carry_materialized_original(
    evidence: Option<OriginalCatalogEvidence>,
    catalog: &CatalogModel,
) {
    if let Some(evidence) = evidence {
        bind_materialized(catalog, evidence.source, evidence.manager_owner);
    }
}

#[cfg(test)]
#[path = "original_provenance_tests.rs"]
mod tests;
