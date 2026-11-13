//! Authored only: these tests have not been executed for this source cut.
use super::*;
use codex_http_client::HttpClientFactory;
use codex_http_client::OutboundProxyPolicy;
use codex_login::AuthManager;
use codex_login::CodexAuth;
use codex_model_provider_info::ModelProviderInfo;
use codex_models_manager::ModelsManagerConfig;
use codex_models_manager::manager::ModelsEndpointFuture;
use codex_models_manager::manager::ModelsEndpointResponse;
use codex_models_manager::manager::ModelsManager;
use codex_models_manager::manager::ModelsManagerFuture;
use codex_models_manager::manager::RefreshStrategy;
use codex_models_manager::manager::StaticModelsManager;
use codex_models_manager::model_info::model_info_from_slug;
use codex_protocol::error::Result as CoreResult;
use codex_protocol::openai_models::ModelsResponse;
use wiremock::Mock;
use wiremock::MockServer;
use wiremock::ResponseTemplate;
use wiremock::matchers::method;
use wiremock::matchers::path;

fn http() -> HttpClientFactory {
    HttpClientFactory::new(OutboundProxyPolicy::ReqwestDefault)
}

async fn server(expected: u64) -> (MockServer, String) {
    let server = MockServer::start().await;
    let response = ModelsResponse { models: vec![model_info_from_slug("private-factory-model")] };
    let raw = format!("{}\n", serde_json::to_string_pretty(&response).unwrap());
    Mock::given(method("GET"))
        .and(path("/models"))
        .respond_with(ResponseTemplate::new(200)
            .set_body_raw(raw.clone(), "application/json")
            .insert_header("etag", "\"private-default\""))
        .expect(expected)
        .mount(&server).await;
    (server, raw)
}

fn info(server: &MockServer) -> ModelProviderInfo {
    ModelProviderInfo {
        model_catalog_url: Some(format!("{}/models", server.uri()).into()),
        // Default optional environment headers are absent from this deterministic fixture.
        env_http_headers: None,
        ..ModelProviderInfo::create_openai_provider(Some(server.uri()))
    }
}

#[tokio::test]
async fn private_factory_binds_original_response_and_post_config_model() {
    let (server, raw) = server(1).await;
    let auth = AuthManager::from_auth_for_testing(CodexAuth::from_api_key("fictional-default-test-key"));
    let provider = crate::create_model_provider(info(&server), Some(auth));
    let manager = provider.models_manager_without_cache(None);
    manager.set_api_key_model_discovery_enabled(true);
    let models = manager.model_catalog_with_origins(RefreshStrategy::Online, http()).await;
    assert_eq!(models.len(), 1);
    let bound = original_default_catalog_source_for_manager(&models[0], manager.as_ref()).unwrap();
    assert_eq!(bound.catalog_source().raw_body(), raw.as_bytes());
    assert!(!bound.response_instance().is_empty());
    let configured = manager.get_model_info("private-factory-model", &ModelsManagerConfig {
        model_context_window: Some(151_123), ..Default::default()
    }).await;
    let materialized = original_default_catalog_source_for_manager(&configured, manager.as_ref()).unwrap();
    assert_eq!(materialized.response_instance(), bound.response_instance());
    assert_eq!(materialized.catalog_source().raw_body(), raw.as_bytes());
    assert_eq!(materialized.catalog_source().materialized_model_bytes(),
        serde_json::to_vec(configured.model.as_ref()).unwrap());
    assert_eq!(configured.context_window, Some(151_123));
    assert_ne!(materialized.catalog_source().materialized_model_bytes(),
        bound.catalog_source().materialized_model_bytes());
}

#[derive(Debug)]
struct ForwardedReceipt {
    response: Mutex<Option<OriginalModelsResponse>>,
    identity: String,
}

impl ModelsEndpointClient for ForwardedReceipt {
    fn identity(&self) -> Option<String> { Some(self.identity.clone()) }
    fn has_command_auth(&self) -> bool { false }
    fn uses_codex_backend(&self) -> ModelsEndpointFuture<'_, bool> { Box::pin(async { true }) }
    fn list_models<'a>(&'a self, _: &'a str, _: HttpClientFactory)
        -> ModelsEndpointFuture<'a, CoreResult<ModelsEndpointResponse>> {
        Box::pin(async { panic!("manager must call the optional evidence method") })
    }
    fn list_models_with_original<'a>(&'a self, _: &'a str, _: HttpClientFactory)
        -> ModelsEndpointFuture<'a, CoreResult<(ModelsEndpointResponse, Option<OriginalModelsResponse>)>> {
        Box::pin(async move {
            let original = self.response.lock().unwrap().take().unwrap();
            Ok((ModelsEndpointResponse {
                models: original.models().to_vec(),
                etag: original.etag().map(str::to_owned),
                identity: self.identity.clone(),
            }, Some(original)))
        })
    }
}

#[tokio::test]
async fn genuine_registered_endpoint_receipt_cannot_qualify_a_generic_manager_owner() {
    let (server, _) = server(2).await;
    let auth = AuthManager::from_auth_for_testing(CodexAuth::from_api_key("fictional-forward-test-key"));
    let provider = crate::create_model_provider(info(&server), Some(auth));
    let original_manager = provider.models_manager_without_cache(None);
    original_manager.set_api_key_model_discovery_enabled(true);
    let current = original_manager.model_catalog_with_origins(RefreshStrategy::Online, http()).await;
    assert!(original_default_catalog_source_for_manager(&current[0], original_manager.as_ref()).is_some());
    let original = original_catalog_source(&current[0]).unwrap();
    let owner = original.manager_owner().unwrap();
    let endpoint = {
        let registry = bindings().lock().unwrap();
        registry.get(&(Arc::as_ptr(&owner) as usize)).unwrap().endpoint.upgrade().unwrap()
    };
    // This is a genuine fresh receipt from the exact registered concrete endpoint,
    // not fabricated bytes or a fake transport. Forwarding still changes its owner.
    let (response, receipt) = ModelsEndpointClient::list_models_with_original(
        endpoint.as_ref(), &codex_models_manager::client_version_to_whole(), http(),
    ).await.unwrap();
    let generic = OpenAiModelsManager::new_without_cache(Arc::new(ForwardedReceipt {
        response: Mutex::new(receipt), identity: response.identity,
    }), None).with_provider_catalog();
    let forwarded = generic.model_catalog_with_origins(RefreshStrategy::Online, http()).await;
    let raw = original_catalog_source(&forwarded[0]).unwrap();
    assert_ne!(raw.response_instance(), original.response_instance());
    assert!(!Arc::ptr_eq(&owner, &raw.manager_owner().unwrap()));
    assert!(original_default_catalog_source_for_manager(&forwarded[0], &generic).is_none());
    // The prior materialization is no longer the registered endpoint's latest occurrence.
    assert!(original_default_catalog_source_for_manager(&current[0], original_manager.as_ref()).is_none());
}

#[tokio::test]
async fn auth_generation_change_invalidates_previously_bound_model() {
    let (server, _) = server(1).await;
    let home = tempfile::tempdir().unwrap();
    let auth = AuthManager::from_auth_for_testing_with_home(
        CodexAuth::from_api_key("fictional-revision-test-key"), home.path().to_path_buf(),
    );
    let provider = crate::create_model_provider(info(&server), Some(auth.clone()));
    let manager = provider.models_manager_without_cache(None);
    manager.set_api_key_model_discovery_enabled(true);
    let models = manager.model_catalog_with_origins(RefreshStrategy::Online, http()).await;
    let captured = original_default_catalog_source_for_manager(&models[0], manager.as_ref()).unwrap();
    let prepared_generation = captured.auth_generation();
    let owner = captured.catalog_source().manager_owner().unwrap();
    let endpoint = {
        let registry = bindings().lock().unwrap();
        registry.get(&(Arc::as_ptr(&owner) as usize)).unwrap().endpoint.upgrade().unwrap()
    };
    let original_identity = endpoint.identity();
    auth.logout().await.unwrap();
    assert!(auth.auth_change_state_receiver().borrow().generation > prepared_generation);
    assert!(original_catalog_source(&models[0]).is_some());
    assert!(original_default_catalog_source_for_manager(&models[0], manager.as_ref()).is_none());
    // Restore the identical credential in this fixture's own temporary file store.
    // The identity matches again, but its intervening generation is still different.
    codex_login::login_with_api_key(
        home.path(), "fictional-revision-test-key",
        codex_login::AuthCredentialsStoreMode::File,
        codex_login::AuthKeyringBackendKind::default(),
    ).unwrap();
    auth.reload().await;
    assert_eq!(endpoint.identity(), original_identity);
    assert!(auth.auth_change_state_receiver().borrow().generation > prepared_generation);
    assert!(original_default_catalog_source_for_manager(&models[0], manager.as_ref()).is_none());
    assert_eq!(captured.auth_generation(), prepared_generation);
}

#[tokio::test]
async fn cache_restore_and_unregistered_originator_do_not_inherit_default_binding() {
    let (server, _) = server(2).await;
    let auth = AuthManager::from_auth_for_testing(CodexAuth::from_api_key("fictional-cache-test-key"));
    let home = tempfile::tempdir().unwrap();
    let provider = crate::create_model_provider(info(&server), Some(auth));
    let manager = provider.models_manager(home.path().to_path_buf(), None);
    manager.set_api_key_model_discovery_enabled(true);
    let current = manager.model_catalog_with_origins(RefreshStrategy::Online, http()).await;
    assert!(original_default_catalog_source_for_manager(&current[0], manager.as_ref()).is_some());

    let originator = manager.for_originator("codex_work_cca").unwrap();
    let partition = originator.model_catalog_with_origins(RefreshStrategy::Online, http()).await;
    assert!(original_catalog_source(&partition[0]).is_some());
    assert!(original_default_catalog_source_for_manager(&partition[0], originator.as_ref()).is_none());
    assert!(original_default_catalog_source_for_manager(&current[0], manager.as_ref()).is_some());

    let restored = manager.model_catalog_with_origins(RefreshStrategy::Offline, http()).await;
    assert!(original_catalog_source(&restored[0]).is_none());
    assert!(original_default_catalog_source_for_manager(&restored[0], manager.as_ref()).is_none());
    // Historical raw evidence survives, but is no longer the owner's active fetch.
    assert!(original_catalog_source(&current[0]).is_some());
    assert!(original_default_catalog_source_for_manager(&current[0], manager.as_ref()).is_none());
}

/// A generic consumer can return the very same genuine Arc and even delegate
/// metadata methods, but it cannot supply the concrete manager's private TypeId.
#[derive(Debug)]
struct ForwardedCatalog {
    catalog: CatalogModel,
    inner: StaticModelsManager,
}

impl ModelsManager for ForwardedCatalog {
    fn model_catalog_with_origins(&self, _: RefreshStrategy, _: HttpClientFactory)
        -> ModelsManagerFuture<'_, Vec<CatalogModel>> {
        Box::pin(async { vec![self.catalog.clone()] })
    }
    fn get_model_info<'a>(&'a self, _: &'a str, _: &'a ModelsManagerConfig)
        -> ModelsManagerFuture<'a, CatalogModel> {
        Box::pin(async { self.catalog.clone() })
    }
    fn get_remote_models(&self)
        -> ModelsManagerFuture<'_, Vec<codex_protocol::openai_models::ModelInfo>> {
        self.inner.get_remote_models()
    }
    fn try_get_remote_models(&self)
        -> Result<Vec<codex_protocol::openai_models::ModelInfo>, tokio::sync::TryLockError> {
        self.inner.try_get_remote_models()
    }
    fn auth_manager(&self) -> Option<&AuthManager> { self.inner.auth_manager() }
    fn list_collaboration_modes(&self) -> Vec<codex_protocol::config_types::CollaborationModeMask> {
        self.inner.list_collaboration_modes()
    }
    fn refresh_if_new_etag(&self, etag: String, factory: HttpClientFactory)
        -> ModelsManagerFuture<'_, ()> {
        self.inner.refresh_if_new_etag(etag, factory)
    }
}

#[tokio::test]
async fn same_genuine_catalog_arc_cannot_qualify_a_different_actual_consumer() {
    let (server, _) = server(1).await;
    let auth = AuthManager::from_auth_for_testing(CodexAuth::from_api_key("fictional-consumer-test-key"));
    let provider = crate::create_model_provider(info(&server), Some(auth));
    let manager = provider.models_manager_without_cache(None);
    manager.set_api_key_model_discovery_enabled(true);
    let current = manager.model_catalog_with_origins(RefreshStrategy::Online, http()).await;
    let catalog = current[0].clone();
    assert!(original_default_catalog_source_for_manager(&catalog, manager.as_ref()).is_some());
    let metadata = ModelsResponse { models: vec![catalog.model.as_ref().clone()] };
    let forwarded = ForwardedCatalog {
        catalog: catalog.clone(),
        inner: StaticModelsManager::new(None, metadata.clone(), catalog.origin),
    };
    let forwarded_models = forwarded.model_catalog_with_origins(RefreshStrategy::InMemory, http()).await;
    assert!(Arc::ptr_eq(&forwarded_models[0].model, &catalog.model));
    assert!(original_catalog_source(&forwarded_models[0]).is_some());
    assert!(original_manager_owner(&forwarded).is_none());
    assert!(original_default_catalog_source_for_manager(&forwarded_models[0], &forwarded).is_none());
    let static_consumer = StaticModelsManager::new(None, metadata, catalog.origin);
    assert!(original_default_catalog_source_for_manager(&catalog, &static_consumer).is_none());
    let other_default = provider.models_manager_without_cache(None);
    assert!(!Arc::ptr_eq(original_manager_owner(manager.as_ref()).unwrap(),
        original_manager_owner(other_default.as_ref()).unwrap()));
    assert!(original_default_catalog_source_for_manager(&catalog, other_default.as_ref()).is_none());
    assert!(original_default_catalog_source_for_manager(&catalog, manager.as_ref()).is_some());
}

#[tokio::test]
async fn provider_selector_outside_selected_auth_stays_held_without_changing_request() {
    let (server, _) = server(1).await;
    let mut configured = info(&server);
    configured.http_headers.get_or_insert_default().insert(
        "ChatGPT-Account-ID".into(), "unowned-configured-selector".into(),
    );
    let auth = AuthManager::from_auth_for_testing(CodexAuth::from_api_key("fictional-selector-test-key"));
    let provider = crate::create_model_provider(configured, Some(auth));
    let manager = provider.models_manager_without_cache(None);
    manager.set_api_key_model_discovery_enabled(true);
    let models = manager.model_catalog_with_origins(RefreshStrategy::Online, http()).await;
    assert!(original_catalog_source(&models[0]).is_some());
    assert!(original_default_catalog_source_for_manager(&models[0], manager.as_ref()).is_none());
    let requests = server.received_requests().await.unwrap();
    assert_eq!(requests[0].headers.get("authorization").unwrap(), "Bearer fictional-selector-test-key");
    assert_eq!(requests[0].headers.get("chatgpt-account-id").unwrap(), "unowned-configured-selector");
}
