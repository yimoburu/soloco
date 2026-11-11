//! Real standard-bootstrap owner and same-process scoped runtime composition.
//! Opaque ownership here is source association, not qualification of the installed app.
use crate::config_manager::ConfigManager;
use crate::in_process::{self, EmbeddedNetworkPolicy, InProcessClientHandle, InProcessStartArgs};
use codex_arg0::Arg0DispatchPaths;
use codex_config::{CloudConfigBundleLoader, LoaderOverrides, NoopThreadConfigLoader};
use codex_core::config::{Config, ConfigBuilder, find_codex_home};
use codex_login::AuthManager;
use codex_model_provider_info::{ModelProviderInfo, OPENAI_PROVIDER_ID};
use codex_utils_absolute_path::AbsolutePathBuf;
use codex_utils_cli::CliConfigOverrides;
use std::{io, path::PathBuf, sync::Arc};
use std::sync::atomic::{AtomicBool, Ordering};

pub struct OriginalManagedHost { inner: Arc<OriginalHost> }
struct OriginalHost {
    auth: Arc<AuthManager>, config: Arc<Config>, network: EmbeddedNetworkPolicy,
    bootstrap: codex_api::protected_peer::OriginalBootstrapClaim,
    loader: CloudConfigBundleLoader, loader_overrides: LoaderOverrides,
    cli_overrides: Vec<(String, toml::Value)>, arg0: Arg0DispatchPaths,
}
pub struct ProtectedManagedScope {
    owner: Arc<OriginalHost>, config: Arc<Config>, loader_overrides: LoaderOverrides,
    cli_overrides: Vec<(String, toml::Value)>,
    consumed: AtomicBool,
    paths: Arc<crate::protected_paths::ScopePathBinding>,
}
fn denied(reason: &str) -> io::Error { io::Error::new(io::ErrorKind::PermissionDenied, reason) }

/// Inspect the actual typed default object selected by the original manager.
/// Disabled/absent is not local; no Boolean label or discovery-only API is used.
fn require_local_default_environment(environment: Option<Arc<codex_exec_server::Environment>>) -> io::Result<()> {
    let environment = environment.ok_or_else(|| denied("default executor is absent or unqualified for this native scope"))?;
    if environment.is_remote() {
        return Err(denied("remote executor is not qualified for this native scope"));
    }
    Ok(())
}

/// Compare the complete actual typed provider, including runtime-only fields.
/// This is compatibility for the existing managed-backend path, not egress authority.
/// No provider/credential value is serialized, exported, or included in an error.
pub(crate) fn require_original_managed_provider(
    original_id: &str, original: &ModelProviderInfo,
    requested_id: &str, requested: &ModelProviderInfo,
) -> io::Result<()> {
    let supported = original_id == OPENAI_PROVIDER_ID && original.requires_openai_auth &&
        original.supports_codex_backend_routes() && original.env_key.is_none() &&
        original.experimental_bearer_token.is_none() && !original.has_command_auth() &&
        original.gateway_oauth.is_none() && original.aws.is_none() &&
        original.project_id.is_none() && original.location.is_none() && original.credential_file.is_none();
    // Derived PartialEq covers every ModelProviderInfo field, including fields
    // omitted by serde; a hand-picked projection must not replace this check.
    if !supported || original_id != requested_id || original != requested {
        return Err(denied("original managed provider is unsupported or changed"));
    }
    Ok(())
}

/// The qualified peer lane has one explicit prompt-history profile. This is
/// an actual scoped feature choice, never a mutation of immutable model metadata
/// or a claim that the original host default used nonincremental tools.
fn append_source_owned_prompt_profile(overrides: &mut Vec<(String, toml::Value)>) {
    overrides.push(("features.incremental_tools".into(), toml::Value::Boolean(false)));
}

/// Check the actual typed effective Config feature set. A managed requirement
/// that re-enables incremental tools must hold; it cannot be silently ignored.
/// This one feature boundary is not native/auth/tool-history qualification.
pub(crate) fn require_source_owned_instruction_profile(features: &codex_features::Features) -> io::Result<()> {
    if features.enabled(codex_features::Feature::IncrementalTools) {
        return Err(denied("incremental tool history is unsupported by this protected source profile"));
    }
    Ok(())
}

impl OriginalManagedHost {
    /// This source entry is called inside the native embedding host. It uses the normal
    /// standard bootstrap and constructs its original manager there. No credential is
    /// accepted as an argument, copied, returned or serialized. No environment changes.
    pub async fn bootstrap(startup: codex_api::protected_peer::NativeStartup,
        arg0: Arg0DispatchPaths, overrides: CliConfigOverrides,
        loader_overrides: LoaderOverrides) -> io::Result<Self> {
        if !codex_core::protected_peer_enabled() { return Err(denied("protected source build required")); }
        if loader_overrides.ignore_managed_requirements || loader_overrides.ignore_login_requirements {
            return Err(denied("original managed/login requirements cannot be bypassed"));
        }
        let home = find_codex_home()?;
        let claim = startup.claim_bootstrap(home.as_path()).map_err(io::Error::other)?;
        let network = EmbeddedNetworkPolicy::load(&loader_overrides).await;
        let cli_overrides = overrides.parse_overrides().map_err(io::Error::other)?;
        let manager = ConfigManager::new(home.to_path_buf(), cli_overrides.clone(),
            loader_overrides.clone(), true, Default::default(), arg0.clone(),
            Arc::new(NoopThreadConfigLoader)).with_embedded_network_policy(network.clone());
        // This is the original native app-server's existing standard managed bootstrap.
        let loaded = manager.load_managed_startup_config(std::env::current_dir().ok()).await?;
        let config = loaded.config?;
        config.validate_windows_mxc_requirement()?;
        config.auth_config().validate()?;
        let auth = AuthManager::shared_from_config(&config, false).await.map_err(io::Error::other)?;
        auth.validate_scoped_runtime_auth(&config.auth_config())?;
        manager.update_managed_config_loader(auth.clone(), &config);
        manager.sync_default_client_residency_requirement().await;
        let state = *auth.auth_change_state_receiver().borrow();
        codex_api::protected_peer::observe_original_bootstrap(&claim, serde_json::json!({
            "config_layers": codex_core::protected_config_source_records(&config),
            "auth_owner_generation":state.owner_generation,"auth_revision":state.generation
        })).await.map_err(io::Error::other)?;
        Ok(Self { inner: Arc::new(OriginalHost { auth, config: Arc::new(config), network, bootstrap: claim,
            loader: manager.current_managed_config_loader(), loader_overrides, cli_overrides, arg0 }) })
    }

    /// Creates an isolated runtime configuration with original managed auth/network policy.
    /// Existing directories are required; this API does not install or broaden a sandbox.
    pub async fn prepare_scope(&self, state_root: AbsolutePathBuf, cwd: AbsolutePathBuf)
        -> io::Result<ProtectedManagedScope> {
        let root = std::fs::canonicalize(state_root.as_path())?;
        if root.to_str()!=Some(self.inner.bootstrap.state_root()) || cwd.as_path().to_str()!=Some(self.inner.bootstrap.cwd()) {
            return Err(denied("scope differs from original pre-auth challenge"));
        }
        let owner_home = std::fs::canonicalize(self.inner.config.codex_home.as_path())?;
        if root == PathBuf::from("/") || root.starts_with(&owner_home) || owner_home.starts_with(&root) {
            return Err(denied("runtime state must be separate from original credential home"));
        }
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            if std::fs::metadata(&root)?.permissions().mode() & 0o077 != 0 {
                return Err(denied("runtime state directory must be private"));
            }
        }
        #[cfg(not(unix))] { return Err(denied("unqualified scoped host platform")); }
        let mut loader_overrides = self.inner.loader_overrides.clone();
        loader_overrides.ignore_user_config = true;
        loader_overrides.ignore_project_config = true;
        loader_overrides.user_config_path = None;
        loader_overrides.user_config_profile = None;
        // Carry non-credential native auth preferences explicitly. The scoped home
        // has no user credential/config copy; managed requirements still apply last.
        let mut cli_overrides = self.inner.cli_overrides.clone();
        let owner = self.inner.config.as_ref();
        cli_overrides.push(("cli_auth_credentials_store".into(), toml::Value::try_from(owner.cli_auth_credentials_store_mode).map_err(io::Error::other)?));
        cli_overrides.push(("chatgpt_base_url".into(), toml::Value::String(owner.chatgpt_base_url.clone())));
        if let Some(method) = owner.forced_login_method {
            cli_overrides.push(("forced_login_method".into(), toml::Value::try_from(method).map_err(io::Error::other)?));
        }
        if let Some(workspaces) = &owner.forced_chatgpt_workspace_id {
            cli_overrides.push(("forced_chatgpt_workspace_id".into(), toml::Value::try_from(workspaces).map_err(io::Error::other)?));
        }
        for (name, feature) in [("secret_auth_storage", codex_features::Feature::SecretAuthStorage),
            ("respect_system_proxy", codex_features::Feature::RespectSystemProxy),
            ("system_proxy_fallback", codex_features::Feature::SystemProxyFallback),
            ("psp", codex_features::Feature::Psp)] {
            cli_overrides.push((format!("features.{name}"), toml::Value::Boolean(owner.features.enabled(feature))));
        }
        // Append the explicit source-owned choice after original CLI preferences.
        // Managed requirements still apply; check the actual result below.
        append_source_owned_prompt_profile(&mut cli_overrides);
        let mut config = ConfigBuilder::default().codex_home(root.clone())
            .cli_overrides(cli_overrides.clone()).loader_overrides(loader_overrides.clone())
            .strict_config(true).cloud_config_bundle(self.inner.loader.clone())
            .fallback_cwd(Some(cwd.to_path_buf())).build().await?;
        require_original_managed_provider(&owner.model_provider_id, &owner.model_provider,
            &config.model_provider_id, &config.model_provider)?;
        require_source_owned_instruction_profile(&config.features)?;
        self.inner.network.bind_config(&mut config);
        config.application_auth_route_config = Some(self.inner.config.auth_route_config());
        if config.codex_home.as_path() != root || !config.sqlite_config().home().starts_with(&root) ||
            !config.log_dir.starts_with(&root) {
            return Err(denied("scoped configuration redirects mutable state outside its root"));
        }
        let paths = crate::protected_paths::ScopePathBinding::capture(&root, &[config.sqlite_config().home().to_path_buf(),config.log_dir.clone()])?;
        self.inner.auth.validate_scoped_runtime_auth(&config.auth_config())?;
        Ok(ProtectedManagedScope { owner: self.inner.clone(), config: Arc::new(config),
            loader_overrides, cli_overrides, paths, consumed: AtomicBool::new(false) })
    }
}

impl ProtectedManagedScope {
    /// The caller may use this exact Arc to assemble the ordinary typed start arguments.
    /// The scope retains another strong reference, so mutable replacement breaks identity.
    pub fn config(&self) -> Arc<Config> { self.config.clone() }

    pub async fn start(self, mut args: InProcessStartArgs) -> io::Result<InProcessClientHandle> {
        if self.consumed.swap(true, Ordering::SeqCst) { return Err(denied("scoped start already consumed")); }
        if !Arc::ptr_eq(&args.config, &self.config) || args.enable_codex_api_key_env ||
            args.state_db.is_some() || args.log_db.is_some() {
            return Err(denied("foreign scoped configuration/auth/storage handle"));
        }
        require_source_owned_instruction_profile(&self.config.features)?;
        require_local_default_environment(args.environment_manager.default_environment())?;
        self.paths.verify_before_mutable_start()?;
        args.protected_paths = Some(self.paths.clone());
        self.owner.auth.validate_scoped_runtime_auth(&self.config.auth_config())?;
        args.arg0_paths = self.owner.arg0.clone();
        args.cli_overrides = self.cli_overrides;
        args.loader_overrides = self.loader_overrides;
        args.cloud_config_bundle = self.owner.loader.clone();
        args.embedded_network_policy = self.owner.network.clone();
        // The exact same manager Arc and same controller objects reach scoped startup.
        // There is no credential IPC, environment rewrite, or second scoped auth load.
        in_process::start_with_existing_auth_manager(args, self.owner.auth.clone()).await
    }
}

#[cfg(test)]
mod controlled_environment_tests {
    use super::*;
    use codex_exec_server::{Environment, EnvironmentManager};
    use codex_http_client::{HttpClientFactory, OutboundProxyPolicy};

    #[test]
    fn absent_actual_default_executor_remains_held() {
        let manager=EnvironmentManager::without_environments(HttpClientFactory::new(OutboundProxyPolicy::ReqwestDefault));
        assert!(manager.default_environment().is_none());
        let error=require_local_default_environment(manager.default_environment()).unwrap_err();
        assert_eq!(error.kind(),io::ErrorKind::PermissionDenied);
        assert_eq!(error.to_string(),"default executor is absent or unqualified for this native scope");
    }

    #[tokio::test]
    async fn actual_local_default_passes_only_this_executor_kind_boundary() {
        // LocalProcess::default starts an in-memory notification drain task, so
        // use the real current-thread runtime. No exec/filesystem method is used.
        let manager=EnvironmentManager::default_for_tests();
        assert!(!manager.default_environment().expect("actual local object").is_remote());
        assert!(require_local_default_environment(manager.default_environment()).is_ok());
        // This result is not host/auth/model/native or whole-domain qualification.
    }

    #[test]
    fn actual_lazy_remote_object_remains_held_without_connection() {
        // Pinned Environment::create_for_tests -> create_inner -> remote_with_transport
        // only constructs LazyRemoteExecServerClient. Do NOT add it to a manager or
        // call start_connecting/get/status/exec/filesystem: those can start IO.
        // Plain #[test] intentionally constructs no Tokio runtime or provider.
        let environment=Environment::create_for_tests(Some("ws://controlled.invalid:1".into())).expect("actual lazy remote object");
        assert!(environment.is_remote());
        let error=require_local_default_environment(Some(Arc::new(environment))).unwrap_err();
        assert_eq!(error.kind(),io::ErrorKind::PermissionDenied);
        assert_eq!(error.to_string(),"remote executor is not qualified for this native scope");
    }
}

#[cfg(test)]
mod controlled_provider_tests {
    use super::*;
    use codex_model_provider_info::ModelProviderAwsAuthInfo;

    fn managed() -> ModelProviderInfo {
        // Actual literal-only constructor: no Config/AuthManager/env or I/O.
        ModelProviderInfo::create_openai_provider(None)
    }
    fn assert_held(result: io::Result<()>) {
        let error = result.expect_err("provider compatibility must remain held");
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(error.to_string(), "original managed provider is unsupported or changed");
    }

    #[test]
    fn matching_managed_provider_is_compatible() {
        let original = managed();
        let requested = original.clone();
        assert!(require_original_managed_provider(OPENAI_PROVIDER_ID, &original,
            OPENAI_PROVIDER_ID, &requested).is_ok());
        // Passing this memory-only boundary proves no auth/provider/native qualification.
    }

    #[test]
    fn changed_provider_id_remains_held() {
        let original = managed();
        assert_held(require_original_managed_provider(OPENAI_PROVIDER_ID, &original,
            "controlled-provider-alias", &original));
    }

    #[test]
    fn changed_provider_definition_or_route_remains_held() {
        let original = managed();
        let mut route = original.clone();
        route.base_url = Some("https://changed.invalid/v1".into());
        let mut runtime_only = original.clone();
        runtime_only.include_internal_metadata = !original.include_internal_metadata;
        let mut headers = original.clone();
        headers.http_headers.as_mut().expect("built-in version header")
            .insert("x-controlled-test".into(), "nonsecret-controlled-value".into());
        let mut retries = original.clone();
        retries.request_max_retries = Some(0);
        for requested in [route, runtime_only, headers, retries] {
            assert_held(require_original_managed_provider(OPENAI_PROVIDER_ID, &original,
                OPENAI_PROVIDER_ID, &requested));
        }
    }

    #[test]
    fn unsupported_original_provider_remains_held() {
        let original = managed();
        let mut named_custom = original.clone();
        named_custom.name = "Controlled custom provider".into();
        let mut anonymous = original.clone();
        anonymous.requires_openai_auth = false;
        let mut env_key = original.clone();
        env_key.env_key = Some("CONTROLLED_UNUSED_PROVIDER_KEY".into());
        let mut bearer = original.clone();
        bearer.experimental_bearer_token = Some("nonsecret-controlled-marker".into());
        let mut aws = original.clone();
        aws.aws = Some(ModelProviderAwsAuthInfo { profile: None, region: None,
            credential_export: None, auth_refresh: None });
        let mut custom_route = original.clone();
        custom_route.base_url = Some("https://controlled.invalid/v1".into());
        for (id, provider) in [("controlled-provider", original),
            (OPENAI_PROVIDER_ID, named_custom), (OPENAI_PROVIDER_ID, anonymous),
            (OPENAI_PROVIDER_ID, env_key), (OPENAI_PROVIDER_ID, bearer),
            (OPENAI_PROVIDER_ID, aws), (OPENAI_PROVIDER_ID, custom_route)] {
            // Even an unchanged unsupported definition/ID is never made compatible.
            assert_held(require_original_managed_provider(id, &provider, id, &provider));
        }
    }
}

#[cfg(test)]
mod controlled_prompt_profile_tests {
    use super::*;
    use codex_features::{Feature, Features};

    #[test]
    fn original_default_incremental_tools_remains_held_and_unchanged() {
        let original = Features::with_defaults();
        assert!(original.enabled(Feature::IncrementalTools));
        let error = require_source_owned_instruction_profile(&original).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(error.to_string(), "incremental tool history is unsupported by this protected source profile");
        assert!(original.enabled(Feature::IncrementalTools));
    }

    #[test]
    fn explicit_nonincremental_profile_passes_but_effective_reenable_is_held() {
        let mut scoped = Features::with_defaults();
        scoped.disable(Feature::IncrementalTools);
        assert!(require_source_owned_instruction_profile(&scoped).is_ok());
        // A later effective configuration is checked independently; earlier
        // source preparation cannot authorize a changed actual feature set.
        let mut effective = scoped.clone();
        effective.enable(Feature::IncrementalTools);
        assert!(require_source_owned_instruction_profile(&effective).is_err());
        assert!(!scoped.enabled(Feature::IncrementalTools));
    }

    #[test]
    fn source_owned_override_is_explicit_last_and_preserves_original_preferences() {
        let original = vec![("features.incremental_tools".to_string(), toml::Value::Boolean(true)),
            ("model".to_string(), toml::Value::String("gpt-6.1-sol".to_string()))];
        let mut scoped = original.clone();
        append_source_owned_prompt_profile(&mut scoped);
        assert_eq!(&scoped[..original.len()], original.as_slice());
        assert_eq!(scoped.len(), original.len() + 1);
        assert_eq!(scoped.last(), Some(&("features.incremental_tools".to_string(), toml::Value::Boolean(false))));
    }
}
