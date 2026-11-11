//! Source-only private fixtures. These do not invoke original FD startup, an
//! AuthManager, a native host, a provider, a socket or a source-build capability.
use super::*;
use codex_http_client::{HttpClientFactory, OutboundProxyPolicy, OutboundProxyRoute};

fn fixture(port: Option<u16>) -> NativeStartup {
    NativeStartup { claim: OriginalBootstrapClaim {
        nonce: "a".repeat(64), slot_id: "synthetic-source-slot".into(),
        executable_sha256: "b".repeat(64), source_manifest_sha256: "c".repeat(64),
        original_home_sha256: hash(b"/synthetic-original-home"),
        state_root: "/synthetic-state".into(), cwd: "/synthetic-project".into(),
        loopback_proxy_port: port, context_selection: None,
        consumed: AtomicBool::new(false), decoder_issued: AtomicBool::new(false),
    } }
}
fn challenge(port: Option<serde_json::Value>) -> serde_json::Value {
    let mut value = json!({"protocol":PROTOCOL,"kind":"challenge","nonce":"a".repeat(64),
        "pid":std::process::id(),"upstream_url":"https://example.invalid/responses",
        "slot_id":"synthetic-source-slot","executable_sha256":"b".repeat(64),
        "source_manifest_sha256":"c".repeat(64),"state_root":"/synthetic-state",
        "cwd":"/synthetic-project","original_home_sha256":"d".repeat(64)});
    if let Some(port) = port { value["loopback_proxy_port"] = port; }
    value
}

#[test]
fn private_challenge_accepts_only_optional_nonzero_u16_proxy_port() {
    let legacy: Challenge = serde_json::from_value(challenge(None)).unwrap();
    assert_eq!(legacy.loopback_proxy_port, None);
    assert!(validate_challenge(&legacy).is_ok());
    let selected: Challenge = serde_json::from_value(challenge(Some(json!(23456)))).unwrap();
    assert_eq!(selected.loopback_proxy_port, Some(23456));
    assert!(validate_challenge(&selected).is_ok());
    let zero: Challenge = serde_json::from_value(challenge(Some(json!(0)))).unwrap();
    assert!(validate_challenge(&zero).is_err());
    let mut uppercase = challenge(Some(json!(23456))); uppercase["nonce"] = json!("A".repeat(64));
    assert!(validate_challenge(&serde_json::from_value::<Challenge>(uppercase).unwrap()).is_err());
    for invalid in [json!(-1),json!(65536),json!(1.5),json!("23456")] {
        assert!(serde_json::from_value::<Challenge>(challenge(Some(invalid))).is_err());
    }
}

#[test]
fn unconsumed_original_claim_cannot_bind_a_factory() {
    let startup = fixture(Some(23456));
    assert!(startup.claim.bind_original_http_client_factory(HttpClientFactory::new(OutboundProxyPolicy::ReqwestDefault)).is_err());
}

#[test]
fn consumed_original_claim_retains_its_exact_fixed_proxy_without_fallback() {
    let claim = fixture(Some(23456)).claim_bootstrap(Path::new("/synthetic-original-home")).unwrap();
    let factory = claim.bind_original_http_client_factory(HttpClientFactory::new(OutboundProxyPolicy::RespectSystemProxy).with_system_proxy_fallback()).unwrap();
    assert_eq!(factory.resolve_proxy_route("https://example.invalid/responses"), OutboundProxyRoute::Proxy {
        url: format!("http://soloco:{}@127.0.0.1:23456", "a".repeat(64)), no_proxy: None,
    });
    assert!(!factory.with_system_proxy_fallback().allows_system_proxy_fallback());
}

#[test]
fn legacy_claim_keeps_original_factory_and_no_new_route() {
    let claim = fixture(None).claim_bootstrap(Path::new("/synthetic-original-home")).unwrap();
    let factory = HttpClientFactory::new(OutboundProxyPolicy::ReqwestDefault).with_system_proxy_fallback();
    assert_eq!(claim.bind_original_http_client_factory(factory.clone()).unwrap(), factory);
}
