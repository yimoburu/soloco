use crate::auth::SharedAuthProvider;
use crate::endpoint::session::EndpointSession;
use crate::error::ApiError;
use crate::provider::Provider;
use bytes::Bytes;
use codex_client::HttpTransport;
use codex_client::RequestTelemetry;
use codex_client::ReqwestTransport;
use codex_protocol::openai_models::ModelInfo;
use codex_protocol::openai_models::ModelsResponse;
use http::HeaderMap;
use http::Method;
use http::header::ETAG;
use std::sync::Arc;
use url::Url;

pub struct ModelsClient<T: HttpTransport> {
    session: EndpointSession<T>,
}

/// A decoded response owned by the original concrete HTTP request. There is no
/// public constructor or deserializer: supplied bytes and generic transports
/// cannot manufacture this observation.
pub struct OriginalModelsResponse {
    response_instance: String,
    body: Bytes,
    request_url: String,
    etag: Option<String>,
    models: Vec<ModelInfo>,
}

impl std::fmt::Debug for OriginalModelsResponse {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Catalog URLs may contain credentials; raw values are deliberate getters.
        f.debug_struct("OriginalModelsResponse")
            .field("body_bytes", &self.body.len())
            .field("models", &self.models.len())
            .finish_non_exhaustive()
    }
}

impl OriginalModelsResponse {
    /// Fresh occurrence minted by this concrete successful request, never caller supplied.
    pub fn response_instance(&self) -> &str {
        &self.response_instance
    }

    pub fn raw_body(&self) -> &[u8] {
        &self.body
    }

    /// The exact requested URL, not a claim about a redirect's final destination.
    pub fn request_url(&self) -> &str {
        &self.request_url
    }

    pub fn etag(&self) -> Option<&str> {
        self.etag.as_deref()
    }

    pub fn models(&self) -> &[ModelInfo] {
        &self.models
    }
}

fn decode_models(body: &[u8]) -> Result<Vec<ModelInfo>, ApiError> {
    let ModelsResponse { models } = serde_json::from_slice::<ModelsResponse>(body).map_err(|e| {
        ApiError::Stream(format!(
            "failed to decode models response: {:?} at line {} column {} (body: {} bytes)",
            e.classify(), e.line(), e.column(), body.len()
        ))
    })?;
    Ok(models)
}

impl ModelsClient<ReqwestTransport> {
    /// Observe actual response bytes while using the same auth, request, limits,
    /// retries and decoder as the ordinary endpoint. Only this concrete path
    /// creates an original response receipt.
    pub async fn list_models_observed(
        &self,
        request_url: String,
        extra_headers: HeaderMap,
        response_body_limit_bytes: Option<usize>,
    ) -> Result<OriginalModelsResponse, ApiError> {
        let (body, etag) = self
            .list_models_raw(request_url.clone(), extra_headers, response_body_limit_bytes)
            .await?;
        let models = decode_models(&body)?;
        Ok(OriginalModelsResponse {
            response_instance: uuid::Uuid::new_v4().to_string(),
            body, request_url, etag, models,
        })
    }
}

impl<T: HttpTransport + 'static> ModelsClient<T> {
    pub fn new(transport: T, provider: Provider, auth: SharedAuthProvider) -> Self {
        Self {
            session: EndpointSession::new(transport, provider, auth),
        }
    }

    pub fn with_telemetry(self, request: Option<Arc<dyn RequestTelemetry>>) -> Self {
        Self {
            session: self.session.with_request_telemetry(request),
        }
    }

    fn path() -> &'static str {
        "models"
    }

    fn append_client_version_query(req: &mut codex_client::Request, client_version: &str) {
        let separator = if req.url.contains('?') { '&' } else { '?' };
        req.url = format!("{}{}client_version={client_version}", req.url, separator);
    }

    pub fn request_url(provider: &Provider, client_version: &str) -> String {
        let mut request = provider.build_request(Method::GET, Self::path());
        Self::append_client_version_query(&mut request, client_version);
        request.url
    }

    /// Builds a full catalog URL, preserving provider routing parameters and client version.
    pub fn catalog_request_url(
        provider: &Provider,
        catalog_url: &str,
        client_version: &str,
    ) -> Result<String, ApiError> {
        let invalid = |message: &str| ApiError::InvalidRequest {
            message: message.to_string(),
        };
        let mut url = Url::parse(catalog_url)
            .map_err(|_| invalid("model_catalog_url must be an absolute URL"))?;
        {
            let mut query = url.query_pairs_mut();
            if let Some(params) = &provider.query_params {
                query.extend_pairs(params);
            }
            query.append_pair("client_version", client_version);
        }
        Ok(url.into())
    }

    /// Fetches and decodes a catalog, optionally bounding response bytes before decoding.
    pub async fn list_models(
        &self,
        request_url: String,
        extra_headers: HeaderMap,
        response_body_limit_bytes: Option<usize>,
    ) -> Result<(Vec<ModelInfo>, Option<String>), ApiError> {
        let (body, header_etag) = self
            .list_models_raw(request_url, extra_headers, response_body_limit_bytes)
            .await?;
        let models = decode_models(&body)?;

        Ok((models, header_etag))
    }

    /// Fetches a catalog using the provider's auth and retry policy without decoding it.
    ///
    /// Callers accepting provider-controlled catalogs must validate the native response
    /// without including raw values in diagnostics.
    pub async fn list_models_raw(
        &self,
        request_url: String,
        extra_headers: HeaderMap,
        response_body_limit_bytes: Option<usize>,
    ) -> Result<(Bytes, Option<String>), ApiError> {
        let resp = self
            .session
            .execute_models_get(
                request_url,
                extra_headers,
                response_body_limit_bytes,
            )
            .await?;

        let header_etag = resp
            .headers
            .get(ETAG)
            .and_then(|value| value.to_str().ok())
            .map(ToString::to_string);

        Ok((resp.body, header_etag))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::AuthError;
    use crate::auth::AuthProvider;
    use crate::auth::AuthProviderFuture;
    use crate::provider::RetryConfig;
    use codex_client::Request;
    use codex_client::Response;
    use codex_client::StreamResponse;
    use codex_client::TransportError;
    use http::HeaderMap;
    use http::StatusCode;
    use pretty_assertions::assert_eq;
    use serde_json::json;
    use std::sync::Arc;
    use std::sync::Mutex;
    use std::time::Duration;

    #[derive(Clone)]
    struct CapturingTransport {
        last_request: Arc<Mutex<Option<Request>>>,
        body: Arc<ModelsResponse>,
        etag: Option<String>,
    }

    impl Default for CapturingTransport {
        fn default() -> Self {
            Self {
                last_request: Arc::new(Mutex::new(None)),
                body: Arc::new(ModelsResponse { models: Vec::new() }),
                etag: None,
            }
        }
    }

    impl HttpTransport for CapturingTransport {
        async fn execute(&self, req: Request) -> Result<Response, TransportError> {
            *self.last_request.lock().unwrap() = Some(req);
            let body = serde_json::to_vec(&*self.body).unwrap();
            let mut headers = HeaderMap::new();
            if let Some(etag) = &self.etag {
                headers.insert(ETAG, etag.parse().unwrap());
            }
            Ok(Response {
                status: StatusCode::OK,
                headers,
                body: body.into(),
            })
        }

        async fn stream(&self, _req: Request) -> Result<StreamResponse, TransportError> {
            Err(TransportError::Build("stream should not run".to_string()))
        }
    }

    #[derive(Clone, Default)]
    struct DummyAuth;

    impl AuthProvider for DummyAuth {
        fn add_auth_headers(&self, _headers: &mut HeaderMap) -> Result<(), crate::AuthError> {
            Ok(())
        }
    }

    #[derive(Default)]
    struct RetryAuth {
        request_limits: Mutex<Vec<Option<usize>>>,
    }

    impl AuthProvider for RetryAuth {
        fn add_auth_headers(&self, headers: &mut HeaderMap) -> Result<(), AuthError> {
            headers.insert(http::header::AUTHORIZATION, "Bearer test".parse().unwrap());
            Ok(())
        }

        fn apply_auth(&self, mut request: Request) -> AuthProviderFuture<'_> {
            Box::pin(async move {
                let mut limits = self.request_limits.lock().unwrap();
                limits.push(request.response_body_limit_bytes);
                if limits.len() == 1 {
                    return Err(AuthError::Transient("retry authentication".to_string()));
                }
                self.add_auth_headers(&mut request.headers)?;
                Ok(request)
            })
        }
    }

    fn provider(base_url: &str) -> Provider {
        Provider {
            name: "test".to_string(),
            base_url: base_url.to_string(),
            query_params: None,
            headers: HeaderMap::new(),
            retry: RetryConfig {
                max_attempts: 1,
                base_delay: Duration::from_millis(1),
                retry_429: false,
                retry_5xx: true,
                retry_transport: true,
            },
            stream_idle_timeout: Duration::from_secs(1),
        }
    }

    #[test]
    fn catalog_request_url_preserves_routing_and_encodes_queries() {
        let mut provider = provider("https://gateway.example/v1");
        provider.query_params = Some(std::collections::HashMap::from([(
            "api-version".to_string(),
            "2026 09".to_string(),
        )]));
        let url = ModelsClient::<CapturingTransport>::catalog_request_url(
            &provider,
            "https://catalog.example/codex/models?deployment=one",
            "1.2.3",
        )
        .unwrap();
        assert_eq!(
            url,
            "https://catalog.example/codex/models?deployment=one&api-version=2026+09&client_version=1.2.3"
        );
    }

    #[test]
    fn catalog_request_url_rejects_relative_urls() {
        let provider = provider("https://gateway.example/v1");
        for catalog_url in ["/codex/models", "codex/models"] {
            let error = ModelsClient::<CapturingTransport>::catalog_request_url(
                &provider,
                catalog_url,
                "1.2.3",
            )
            .unwrap_err();
            assert!(matches!(error, ApiError::InvalidRequest { .. }));
        }
    }

    #[tokio::test]
    async fn response_body_limit_survives_auth_retry_without_limiting_other_models_requests() {
        let transport = CapturingTransport::default();
        let auth = Arc::new(RetryAuth::default());
        let mut provider = provider("https://example.com/api/codex");
        provider.retry.max_attempts = 2;
        let request_url = ModelsClient::<CapturingTransport>::request_url(&provider, "0.99.0");
        let client = ModelsClient::new(transport.clone(), provider, auth.clone());

        client
            .list_models(
                request_url.clone(),
                HeaderMap::new(),
                /*response_body_limit_bytes*/ Some(64),
            )
            .await
            .expect("limited request should succeed after auth retry");
        {
            let request = transport.last_request.lock().unwrap();
            let request = request.as_ref().unwrap();
            assert_eq!(request.response_body_limit_bytes, Some(64));
            assert_eq!(request.url, request_url);
            assert_eq!(request.headers[http::header::AUTHORIZATION], "Bearer test");
        }

        let (models, _) = client
            .list_models(
                request_url,
                HeaderMap::new(),
                /*response_body_limit_bytes*/ None,
            )
            .await
            .expect("ordinary request on the same client should remain unbounded");
        assert!(models.is_empty());
        assert_eq!(
            transport
                .last_request
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .response_body_limit_bytes,
            None
        );
        assert_eq!(
            *auth.request_limits.lock().unwrap(),
            vec![Some(64), Some(64), None]
        );
    }

    #[tokio::test]
    async fn appends_client_version_query() {
        let response = ModelsResponse { models: Vec::new() };

        let transport = CapturingTransport {
            last_request: Arc::new(Mutex::new(None)),
            body: Arc::new(response),
            etag: None,
        };

        let provider = provider("https://example.com/api/codex");
        let request_url = ModelsClient::<CapturingTransport>::request_url(&provider, "0.99.0");
        let client = ModelsClient::new(transport.clone(), provider, Arc::new(DummyAuth));

        let (models, _) = client
            .list_models(
                request_url,
                HeaderMap::new(),
                /*response_body_limit_bytes*/ None,
            )
            .await
            .expect("request should succeed");

        assert_eq!(models.len(), 0);

        let url = transport
            .last_request
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .url
            .clone();
        assert_eq!(
            url,
            "https://example.com/api/codex/models?client_version=0.99.0"
        );
    }

    #[tokio::test]
    async fn parses_models_response() {
        let response = ModelsResponse {
            models: vec![
                serde_json::from_value(json!({
                    "slug": "gpt-test",
                    "display_name": "gpt-test",
                    "description": "desc",
                    "default_reasoning_level": "medium",
                    "supported_reasoning_levels": [{"effort": "low", "description": "low"}, {"effort": "medium", "description": "medium"}, {"effort": "high", "description": "high"}],
                    "shell_type": "shell_command",
                    "visibility": "list",
                    "minimal_client_version": [0, 99, 0],
                    "supported_in_api": true,
                    "priority": 1,
                    "upgrade": null,
                    "support_verbosity": false,
                    "default_verbosity": null,
                    "apply_patch_tool_type": null,
                    "truncation_policy": {"mode": "bytes", "limit": 10_000},
                    "supports_image_detail_original": false,
                    "context_window": 272_000,
                    "experimental_supported_tools": [],
                }))
                .unwrap(),
            ],
        };

        let transport = CapturingTransport {
            last_request: Arc::new(Mutex::new(None)),
            body: Arc::new(response),
            etag: None,
        };

        let provider = provider("https://example.com/api/codex");
        let request_url = ModelsClient::<CapturingTransport>::request_url(&provider, "0.99.0");
        let client = ModelsClient::new(transport, provider, Arc::new(DummyAuth));

        let (models, _) = client
            .list_models(
                request_url,
                HeaderMap::new(),
                /*response_body_limit_bytes*/ None,
            )
            .await
            .expect("request should succeed");

        assert_eq!(models.len(), 1);
        assert_eq!(models[0].slug, "gpt-test");
        assert_eq!(models[0].supported_in_api, true);
        assert_eq!(models[0].priority, 1);
    }

    #[tokio::test]
    async fn list_models_includes_etag() {
        let response = ModelsResponse { models: Vec::new() };

        let transport = CapturingTransport {
            last_request: Arc::new(Mutex::new(None)),
            body: Arc::new(response),
            etag: Some("\"abc\"".to_string()),
        };

        let provider = provider("https://example.com/api/codex");
        let request_url = ModelsClient::<CapturingTransport>::request_url(&provider, "0.1.0");
        let client = ModelsClient::new(transport, provider, Arc::new(DummyAuth));

        let (models, etag) = client
            .list_models(
                request_url,
                HeaderMap::new(),
                /*response_body_limit_bytes*/ None,
            )
            .await
            .expect("request should succeed");

        assert_eq!(models.len(), 0);
        assert_eq!(etag, Some("\"abc\"".to_string()));
    }

    // Authored source tests only: these require a separately authorized test run.
    #[tokio::test]
    async fn concrete_observation_retains_exact_noncanonical_response_bytes() {
        use wiremock::Mock;
        use wiremock::MockServer;
        use wiremock::ResponseTemplate;
        use wiremock::matchers::method;
        use wiremock::matchers::path;

        let server = MockServer::start().await;
        let raw = "{\n  \"models\" : []\n}\n";
        Mock::given(method("GET"))
            .and(path("/models"))
            .respond_with(ResponseTemplate::new(200)
                .set_body_raw(raw, "application/json")
                .insert_header("etag", "\"original\""))
            .expect(1)
            .mount(&server)
            .await;
        let transport = ReqwestTransport::from_http_client(
            codex_http_client::HttpClientBuilder::new().build_direct().unwrap(),
        );
        let url = format!("{}/models?catalog-token=fixture-only", server.uri());
        let client = ModelsClient::new(transport, provider(&server.uri()), Arc::new(DummyAuth));
        let observed = client.list_models_observed(url.clone(), HeaderMap::new(), Some(4096))
            .await.unwrap();
        assert_eq!(observed.raw_body(), raw.as_bytes());
        assert_eq!(observed.request_url(), url);
        assert_eq!(observed.etag(), Some("\"original\""));
        assert!(observed.models().is_empty());
        assert_ne!(observed.raw_body(), serde_json::to_vec(&ModelsResponse { models: vec![] }).unwrap());
        assert!(!format!("{observed:?}").contains("catalog-token"));
        assert!(!format!("{observed:?}").contains(raw));
    }

    #[derive(Clone, Copy)]
    enum ModelsAuthReplacement {
        ExactScope,
        Method,
        Url,
        Body,
        Limit,
    }

    struct ReplacingModelsAuth {
        replacement: ModelsAuthReplacement,
    }

    impl AuthProvider for ReplacingModelsAuth {
        fn add_auth_headers(&self, headers: &mut HeaderMap) -> Result<(), AuthError> {
            headers.insert(http::header::AUTHORIZATION, "Bearer replacement".parse().unwrap());
            Ok(())
        }

        fn apply_auth(&self, request: Request) -> AuthProviderFuture<'_> {
            Box::pin(async move {
                // Exercise the documented whole-request replacement contract.
                let mut replacement = Request::new(Method::GET, request.url);
                replacement.headers = request.headers;
                replacement.response_body_limit_bytes = request.response_body_limit_bytes;
                self.add_auth_headers(&mut replacement.headers)?;
                match self.replacement {
                    ModelsAuthReplacement::ExactScope => {}
                    ModelsAuthReplacement::Method => replacement.method = Method::POST,
                    ModelsAuthReplacement::Url => replacement.url.push_str("&retargeted=1"),
                    ModelsAuthReplacement::Body => {
                        replacement.body = Some(codex_client::RequestBody::Json(json!({"unexpected": true})));
                    }
                    ModelsAuthReplacement::Limit => replacement.response_body_limit_bytes = None,
                }
                Ok(replacement)
            })
        }
    }

    #[tokio::test]
    async fn whole_request_auth_replacement_preserves_models_get_scope() {
        let transport = CapturingTransport::default();
        let provider = provider("https://example.com/api/codex");
        let url = ModelsClient::<CapturingTransport>::request_url(&provider, "0.99.0");
        let client = ModelsClient::new(
            transport.clone(), provider,
            Arc::new(ReplacingModelsAuth { replacement: ModelsAuthReplacement::ExactScope }),
        );
        let (models, _) = client.list_models(url.clone(), HeaderMap::new(), Some(64)).await.unwrap();
        assert!(models.is_empty());
        let request = transport.last_request.lock().unwrap();
        let request = request.as_ref().unwrap();
        assert_eq!(request.method, Method::GET);
        assert_eq!(request.url, url);
        assert!(request.body.is_none());
        assert_eq!(request.response_body_limit_bytes, Some(64));
        assert_eq!(request.headers[http::header::AUTHORIZATION], "Bearer replacement");
    }

    async fn assert_models_auth_scope_replacement(replacement: ModelsAuthReplacement) {
        let transport = CapturingTransport::default();
        let provider = provider("https://example.com/api/codex");
        let url = ModelsClient::<CapturingTransport>::request_url(&provider, "0.99.0");
        let client = ModelsClient::new(
            transport.clone(), provider,
            Arc::new(ReplacingModelsAuth { replacement }),
        );
        let result = client.list_models(url.clone(), HeaderMap::new(), Some(64)).await;
        if crate::protected_peer::enabled() {
            assert!(matches!(result,
                Err(ApiError::Transport(TransportError::Build(message)))
                    if message == "protected models GET scope HOLD"));
            assert!(transport.last_request.lock().unwrap().is_none());
        } else {
            // Ordinary auth providers keep their existing returned-request behavior.
            result.unwrap();
            let request = transport.last_request.lock().unwrap();
            let request = request.as_ref().unwrap();
            assert_eq!(request.headers[http::header::AUTHORIZATION], "Bearer replacement");
            match replacement {
                ModelsAuthReplacement::ExactScope => unreachable!(),
                ModelsAuthReplacement::Method => assert_eq!(request.method, Method::POST),
                ModelsAuthReplacement::Url => assert_eq!(request.url, format!("{url}&retargeted=1")),
                ModelsAuthReplacement::Body => assert_eq!(
                    request.body, Some(codex_client::RequestBody::Json(json!({"unexpected": true})))),
                ModelsAuthReplacement::Limit => assert_eq!(request.response_body_limit_bytes, None),
            }
        }
    }

    #[tokio::test]
    async fn protected_models_get_rejects_post_auth_method_replacement() {
        assert_models_auth_scope_replacement(ModelsAuthReplacement::Method).await;
    }

    #[tokio::test]
    async fn protected_models_get_rejects_post_auth_url_replacement() {
        assert_models_auth_scope_replacement(ModelsAuthReplacement::Url).await;
    }

    #[tokio::test]
    async fn protected_models_get_rejects_post_auth_body_replacement() {
        assert_models_auth_scope_replacement(ModelsAuthReplacement::Body).await;
    }

    #[tokio::test]
    async fn protected_models_get_rejects_post_auth_response_limit_replacement() {
        assert_models_auth_scope_replacement(ModelsAuthReplacement::Limit).await;
    }

    #[tokio::test]
    async fn protected_generic_endpoint_execution_still_holds_models() {
        let transport = CapturingTransport::default();
        let session = EndpointSession::new(
            transport.clone(), provider("https://example.com/api/codex"), Arc::new(DummyAuth),
        );
        let configured = std::sync::atomic::AtomicUsize::new(0);
        let result = session.execute_with(Method::GET, "models", HeaderMap::new(), None, |_| {
            configured.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        }).await;
        if crate::protected_peer::enabled() {
            assert!(matches!(result, Err(ApiError::Stream(message))
                if message == "protected non-Responses endpoint HOLD"));
            assert_eq!(configured.load(std::sync::atomic::Ordering::SeqCst), 0);
            assert!(transport.last_request.lock().unwrap().is_none());
            assert!(matches!(session.execute(Method::GET, "models", HeaderMap::new(), None).await,
                Err(ApiError::Stream(message)) if message == "protected non-Responses endpoint HOLD"));
            assert!(transport.last_request.lock().unwrap().is_none());
        } else {
            result.unwrap();
            assert_eq!(configured.load(std::sync::atomic::Ordering::SeqCst), 1);
            assert!(transport.last_request.lock().unwrap().is_some());
        }
    }
}
