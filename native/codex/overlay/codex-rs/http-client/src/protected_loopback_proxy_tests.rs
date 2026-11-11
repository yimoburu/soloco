//! Controlled source tests. No network, auth, provider, socket or native host.
use super::*;

fn nonce() -> String { "a".repeat(64) }
fn fixed(policy: OutboundProxyPolicy) -> HttpClientFactory {
    HttpClientFactory::new(policy)
        .with_system_proxy_fallback()
        .with_protected_loopback_proxy(23456, &nonce()).unwrap()
}
fn expected_route() -> OutboundProxyRoute {
    OutboundProxyRoute::Proxy {
        url: format!("http://soloco:{}@127.0.0.1:23456", nonce()), no_proxy: None,
    }
}

#[test]
fn fixed_loopback_precedes_default_and_system_discovery_without_fallback() {
    for policy in [OutboundProxyPolicy::ReqwestDefault, OutboundProxyPolicy::RespectSystemProxy] {
        let factory = fixed(policy).with_system_proxy_fallback();
        assert_eq!(factory.resolve_proxy_route("https://example.invalid/responses"), expected_route());
        assert!(!factory.allows_system_proxy_fallback());
        assert!(!factory.system_proxy_fallback);
    }
}

#[tokio::test]
async fn async_resolution_uses_the_same_fixed_route_without_system_lookup() {
    for policy in [OutboundProxyPolicy::ReqwestDefault, OutboundProxyPolicy::RespectSystemProxy] {
        assert_eq!(fixed(policy).resolve_proxy_route_async("https://example.invalid/responses".into()).await.unwrap(), expected_route());
    }
}

#[test]
fn fixed_route_retains_cookies_and_current_destination_policy() {
    let controller = crate::NetworkPolicyController::default();
    let policy = controller.policy();
    let factory = HttpClientFactory::new(OutboundProxyPolicy::RespectSystemProxy)
        .with_network_policy(policy.clone())
        .with_chatgpt_cookies([HeaderValue::from_static("synthetic-cookie=true")])
        .with_protected_loopback_proxy(23456, &nonce()).unwrap();
    assert_eq!(factory.network_policy(), &policy);
    assert!(factory.has_chatgpt_cookies());
    assert_eq!(factory.clone(), factory);
    assert_eq!(factory.resolve_proxy_route("https://example.invalid/"), expected_route());
}

#[test]
fn rebuilt_factory_inherits_only_original_fixed_route() {
    let controller = crate::NetworkPolicyController::default();
    let policy = controller.policy();
    let rebuilt = HttpClientFactory::new(OutboundProxyPolicy::RespectSystemProxy)
        .with_network_policy(policy.clone())
        .with_chatgpt_cookies([HeaderValue::from_static("different-synthetic-cookie=true")])
        .with_system_proxy_fallback()
        .with_protected_loopback_proxy_from(&fixed(OutboundProxyPolicy::ReqwestDefault));
    assert_eq!(rebuilt.outbound_proxy_policy(), OutboundProxyPolicy::RespectSystemProxy);
    assert_eq!(rebuilt.network_policy(), &policy);
    assert!(rebuilt.has_chatgpt_cookies());
    assert_eq!(rebuilt.resolve_proxy_route("https://example.invalid/"), expected_route());
    assert!(!rebuilt.allows_system_proxy_fallback());
}

#[test]
fn ordinary_factories_preserve_transport_default_behavior() {
    let ordinary = HttpClientFactory::new(OutboundProxyPolicy::ReqwestDefault).with_system_proxy_fallback();
    let inherited = ordinary.clone().with_protected_loopback_proxy_from(&HttpClientFactory::new(OutboundProxyPolicy::RespectSystemProxy));
    assert_eq!(inherited, ordinary);
    assert!(inherited.allows_system_proxy_fallback());
    assert_eq!(inherited.resolve_proxy_route("https://example.invalid/"), OutboundProxyRoute::TransportDefault);
}

#[test]
fn fixed_route_rejects_zero_port_invalid_token_and_changes() {
    assert!(HttpClientFactory::new(OutboundProxyPolicy::ReqwestDefault).with_protected_loopback_proxy(0, &nonce()).is_err());
    for invalid in [String::new(), "short".into(), "g".repeat(64), "a".repeat(65), "A".repeat(64)] {
        assert!(HttpClientFactory::new(OutboundProxyPolicy::ReqwestDefault).with_protected_loopback_proxy(23456, &invalid).is_err());
    }
    assert!(fixed(OutboundProxyPolicy::ReqwestDefault).with_protected_loopback_proxy(23457, &nonce()).is_err());
    assert!(fixed(OutboundProxyPolicy::ReqwestDefault).with_protected_loopback_proxy(23456, &"b".repeat(64)).is_err());
    assert!(fixed(OutboundProxyPolicy::ReqwestDefault).with_protected_loopback_proxy(23456, &nonce()).is_ok());
}

#[test]
fn transient_connect_token_is_redacted_from_factory_and_route_debug() {
    let factory = fixed(OutboundProxyPolicy::RespectSystemProxy);
    let route = factory.resolve_proxy_route("https://example.invalid/");
    for diagnostic in [format!("{factory:?}"), format!("{route:?}")] {
        assert!(!diagnostic.contains(&nonce()));
        assert!(!diagnostic.contains("soloco:"));
        assert!(diagnostic.contains("<redacted>"));
    }
}
