//! Source binding for the private, configured default endpoint/manager pair.
//! The public endpoint trait and the raw receipt getter are not authority here.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::sync::Weak;

use codex_api::OriginalModelsResponse;
use codex_login::AuthChangeState;
use codex_models_manager::CatalogModel;
use codex_models_manager::OriginalCatalogEvidence;
use codex_models_manager::OriginalCatalogOwner;
use codex_models_manager::manager::ModelsEndpointClient;
use codex_models_manager::manager::ModelsManager;
use codex_models_manager::manager::OpenAiModelsManager;
use codex_models_manager::original_catalog_source;
use codex_models_manager::original_manager_owner;

use crate::models_endpoint::OpenAiModelsEndpoint;

struct FetchBinding {
    response_instance: String,
    request_url: String,
    identity: String,
    auth: AuthChangeState,
}

struct DefaultBinding {
    owner: Weak<OriginalCatalogOwner>,
    endpoint: Weak<OpenAiModelsEndpoint>,
    latest: Option<FetchBinding>,
}

fn bindings() -> &'static Mutex<HashMap<usize, DefaultBinding>> {
    static BINDINGS: OnceLock<Mutex<HashMap<usize, DefaultBinding>>> = OnceLock::new();
    BINDINGS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Called only by ConfiguredModelProvider's private factory, which creates both
/// concrete objects. No public registration, owner assignment or ready API exists.
pub(crate) fn register_default_manager(
    manager: &OpenAiModelsManager,
    endpoint: &Arc<OpenAiModelsEndpoint>,
) {
    let owner = manager.original_catalog_owner();
    let Ok(mut registry) = bindings().lock() else { return; };
    registry.retain(|_, binding| binding.owner.strong_count() > 0 && binding.endpoint.strong_count() > 0);
    registry.entry(Arc::as_ptr(owner) as usize).or_insert_with(|| DefaultBinding {
        owner: Arc::downgrade(owner),
        endpoint: Arc::downgrade(endpoint),
        latest: None,
    });
}

/// Only the concrete original endpoint calls this after its one actual request.
/// A response forwarded through an arbitrary trait implementation cannot record
/// an occurrence for that implementation's separate manager owner.
pub(crate) fn record_default_fetch(
    endpoint: &OpenAiModelsEndpoint,
    response: &OriginalModelsResponse,
    identity: &str,
    prepared_auth: Option<AuthChangeState>,
) {
    let Some(auth) = prepared_auth else { return; };
    if endpoint.original_catalog_auth_state() != Some(auth)
        || endpoint.identity().as_deref() != Some(identity)
    {
        return;
    }
    let Ok(mut registry) = bindings().lock() else { return; };
    for binding in registry.values_mut() {
        let Some(bound_endpoint) = binding.endpoint.upgrade() else { continue; };
        if std::ptr::eq(bound_endpoint.as_ref(), endpoint) && binding.owner.strong_count() > 0 {
            binding.latest = Some(FetchBinding {
                response_instance: response.response_instance().to_owned(),
                request_url: response.request_url().to_owned(),
                identity: identity.to_owned(),
                auth,
            });
        }
    }
}

/// Original response/model evidence plus a current private factory/source binding.
/// This is a local source observation, not native execution or dispatch approval.
#[derive(Clone)]
pub struct OriginalDefaultCatalogEvidence {
    catalog: OriginalCatalogEvidence,
    auth: AuthChangeState,
}

impl std::fmt::Debug for OriginalDefaultCatalogEvidence {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OriginalDefaultCatalogEvidence")
            .field("response_instance", &self.response_instance())
            .field("auth", &self.auth)
            .finish_non_exhaustive()
    }
}

impl OriginalDefaultCatalogEvidence {
    pub fn catalog_source(&self) -> &OriginalCatalogEvidence { &self.catalog }
    pub fn response_instance(&self) -> &str {
        // The constructor below admits only provider observations with an occurrence.
        self.catalog.response_instance().unwrap_or_default()
    }
    pub fn auth_generation(&self) -> u64 { self.auth.generation }
    pub fn auth_owner_generation(&self) -> u64 { self.auth.owner_generation }
    pub fn auth_source_generation(&self) -> u64 { self.auth.source_generation }
}

/// Original metadata producer binding only. A genuine model Arc can be forwarded,
/// so this internal check alone must not attest the current consuming manager.
fn original_default_catalog_source(catalog: &CatalogModel) -> Option<OriginalDefaultCatalogEvidence> {
    let source = original_catalog_source(catalog)?;
    let owner = source.manager_owner()?;
    if owner.current_response_instance().as_deref() != source.response_instance() {
        return None;
    }
    let registry = bindings().lock().ok()?;
    let binding = registry.get(&(Arc::as_ptr(&owner) as usize))?;
    if !Arc::ptr_eq(&owner, &binding.owner.upgrade()?) { return None; }
    let endpoint = binding.endpoint.upgrade()?;
    let fetch = binding.latest.as_ref()?;
    if source.response_instance() != Some(fetch.response_instance.as_str())
        || source.request_url() != Some(fetch.request_url.as_str())
        || endpoint.identity().as_deref() != Some(fetch.identity.as_str())
        || endpoint.original_catalog_auth_state() != Some(fetch.auth)
    {
        return None;
    }
    Some(OriginalDefaultCatalogEvidence { catalog: source, auth: fetch.auth })
}

/// Checks the actual consuming manager before revalidating the original model
/// Arc/bytes, latest response occurrence/URL, endpoint identity and auth revision.
/// A generic manager forwarding even the same genuine Arc cannot inherit the
/// original producer's authority; another default manager also has its own owner.
pub fn original_default_catalog_source_for_manager(
    catalog: &CatalogModel,
    actual: &dyn ModelsManager,
) -> Option<OriginalDefaultCatalogEvidence> {
    let actual_owner = original_manager_owner(actual)?;
    let source = original_catalog_source(catalog)?;
    if !Arc::ptr_eq(actual_owner, &source.manager_owner()?) {
        return None;
    }
    original_default_catalog_source(catalog)
}

#[cfg(test)]
#[path = "original_default_catalog_tests.rs"]
mod tests;
