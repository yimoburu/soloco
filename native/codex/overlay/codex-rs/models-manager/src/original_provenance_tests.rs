//! Authored source tests; no provider or test execution is implied by this file.
use super::*;
use crate::ModelsManagerConfig;
use crate::cache::ModelsCache;
use crate::cache::ModelsCacheEntry;
use crate::cache::ModelsCacheError;
use crate::cache::ModelsCacheFuture;
use crate::catalog::CatalogState;
use crate::catalog::SelectedCatalog;
use crate::manager::ModelsEndpointClient;
use crate::manager::ModelsEndpointFuture;
use crate::manager::ModelsEndpointResponse;
use crate::manager::ModelsManager;
use crate::manager::OpenAiModelsManager;
use crate::manager::RefreshStrategy;
use crate::manager::StaticModelsManager;
use chrono::Utc;
use codex_http_client::HttpClientFactory;
use codex_http_client::OutboundProxyPolicy;
use codex_protocol::error::Result as CoreResult;
use std::borrow::Cow;

const HTTP: HttpClientFactory = HttpClientFactory::new(OutboundProxyPolicy::ReqwestDefault);

fn entry(models: Vec<ModelInfo>) -> ModelsCacheEntry {
    ModelsCacheEntry {
        fetched_at: Utc::now(), etag: None,
        client_version: Some(crate::client_version_to_whole()),
        identity: Some("generic-current".into()), models,
    }
}

fn original_bundled_model() -> CatalogModel {
    let (response, original) = load_bundled_original().unwrap();
    let state = CatalogState::bundled(entry(response.models)).with_original(Some(original));
    let selected = SelectedCatalog::CurrentSnapshot(Cow::Borrowed(&state.entry.models));
    state.materialize_model(&selected, state.entry.models[0].clone())
}

#[test]
fn bundled_original_is_the_whole_include_bytes_not_a_model_hash() {
    let catalog = original_bundled_model();
    let evidence = original_catalog_source(&catalog).unwrap();
    assert_eq!(evidence.source_kind(), OriginalCatalogSourceKind::Bundled);
    assert_eq!(evidence.raw_body(), include_bytes!("../models.json"));
    assert_eq!(evidence.materialized_model_bytes(), serde_json::to_vec(catalog.model.as_ref()).unwrap());
    assert!(evidence.request_url().is_none());
    assert!(evidence.etag().is_none());
    assert_ne!(evidence.raw_body(), evidence.materialized_model_bytes());
}

#[test]
fn shared_arc_is_valid_but_cow_mutation_new_arc_and_origin_changes_are_not() {
    let catalog = original_bundled_model();
    let shared = catalog.clone();
    assert!(original_catalog_source(&shared).is_some());
    let mut changed = catalog.clone();
    Arc::make_mut(&mut changed.model).display_name.push_str(" changed");
    assert!(original_catalog_source(&changed).is_none());
    assert!(original_catalog_source(&catalog).is_some());
    let copied = CatalogModel { model: Arc::new(catalog.model.as_ref().clone()), origin: catalog.origin };
    assert!(original_catalog_source(&copied).is_none());
    let relabeled = CatalogModel { model: Arc::clone(&catalog.model), origin: ModelOrigin::Provider };
    assert!(original_catalog_source(&relabeled).is_none());
}

#[test]
fn weak_sidecar_does_not_keep_model_alive_or_bind_equal_later_allocations() {
    let catalog = original_bundled_model();
    let metadata = catalog.model.as_ref().clone();
    let weak = Arc::downgrade(&catalog.model);
    drop(catalog);
    assert!(weak.upgrade().is_none());
    let later = CatalogModel { model: Arc::new(metadata), origin: ModelOrigin::Bundled };
    assert!(original_catalog_source(&later).is_none());
}

#[derive(Debug)]
struct GenericEndpoint(Vec<ModelInfo>);

impl ModelsEndpointClient for GenericEndpoint {
    fn identity(&self) -> Option<String> { Some("generic-current".into()) }
    fn has_command_auth(&self) -> bool { false }
    fn uses_codex_backend(&self) -> ModelsEndpointFuture<'_, bool> { Box::pin(async { true }) }
    fn list_models<'a>(&'a self, _: &'a str, _: HttpClientFactory)
    -> ModelsEndpointFuture<'a, CoreResult<ModelsEndpointResponse>> {
        Box::pin(async { Ok(ModelsEndpointResponse {
            models: self.0.clone(), etag: None, identity: "generic-current".into(),
        }) })
    }
}

#[tokio::test]
async fn generic_endpoint_provider_label_and_static_labels_are_not_originals() {
    let models = crate::bundled_models_response().unwrap().models;
    let endpoint = Arc::new(GenericEndpoint(models.clone()));
    let (_, original) = endpoint.list_models_with_original("1.2.3", HTTP).await.unwrap();
    assert!(original.is_none());
    let manager = OpenAiModelsManager::new_without_cache(endpoint, None).with_provider_catalog();
    let fetched = manager.model_catalog_with_origins(RefreshStrategy::Online, HTTP).await;
    assert!(!fetched.is_empty());
    assert!(fetched.iter().all(|model| model.origin == ModelOrigin::Provider && original_catalog_source(model).is_none()));
    for origin in [ModelOrigin::Provider, ModelOrigin::Bundled, ModelOrigin::ExplicitConfig, ModelOrigin::Synthetic] {
        let manager = StaticModelsManager::new(None, ModelsResponse { models: models.clone() }, origin);
        assert!(manager.model_catalog_with_origins(RefreshStrategy::InMemory, HTTP).await
            .iter().all(|model| original_catalog_source(model).is_none()));
    }
    let synthetic = manager.get_model_info("not-in-original-catalog", &ModelsManagerConfig::default()).await;
    assert_eq!(synthetic.origin, ModelOrigin::Synthetic);
    assert!(original_catalog_source(&synthetic).is_none());
}

#[derive(Debug)]
struct RestoredCache(ModelsCacheEntry);
impl ModelsCache for RestoredCache {
    fn load<'a>(&'a self, _: &'a str) -> ModelsCacheFuture<'a, Result<Option<ModelsCacheEntry>, ModelsCacheError>> {
        Box::pin(async { Ok(Some(self.0.clone())) })
    }
    fn store<'a>(&'a self, _: &'a ModelsCacheEntry) -> ModelsCacheFuture<'a, Result<(), ModelsCacheError>> {
        Box::pin(async { Ok(()) })
    }
    fn refresh_ttl<'a>(&'a self, _: &'a str, _: &'a str, _: &'a str) -> ModelsCacheFuture<'a, Result<(), ModelsCacheError>> {
        Box::pin(async { Ok(()) })
    }
}

#[tokio::test]
async fn restored_cache_keeps_provider_models_but_cannot_restore_original_bytes() {
    let models = crate::bundled_models_response().unwrap().models;
    let endpoint = Arc::new(GenericEndpoint(models.clone()));
    let manager = OpenAiModelsManager::new_with_cache(Arc::new(RestoredCache(entry(models))), endpoint, None)
        .with_provider_catalog();
    let cached = manager.model_catalog_with_origins(RefreshStrategy::Offline, HTTP).await;
    assert!(!cached.is_empty());
    assert!(cached.iter().all(|model| model.origin == ModelOrigin::Provider && original_catalog_source(model).is_none()));
}
