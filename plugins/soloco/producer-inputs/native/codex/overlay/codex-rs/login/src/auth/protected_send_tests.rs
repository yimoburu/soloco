//! Controlled source cases: fake in-memory credentials, no account/storage/network operation.
use super::*;
use codex_http_client::{AuthSendLease, DestinationPolicy, NetworkPolicyController};
use std::panic::{AssertUnwindSafe, catch_unwind};

fn lease(manager: &AuthManager) -> AuthSendLease {
    let controller = NetworkPolicyController::default();
    let policy = controller.policy();
    assert!(controller.publish(policy.revision(), DestinationPolicy::Unrestricted));
    manager.protected_send_fence.lease(policy.for_current_account(), 0, 0).unwrap()
}
fn poison_cache(manager: &AuthManager) {
    assert!(catch_unwind(AssertUnwindSafe(|| {
        let _guard = manager.inner.write().unwrap();
        panic!("controlled cache-poison source fixture");
    })).is_err());
}
#[test]
fn actual_mode_restriction_invalidates_lease_and_hides_disallowed_cached_kind() {
    let manager = AuthManager::from_auth_for_testing(CodexAuth::from_api_key("controlled-memory-only"));
    let prior = lease(&manager);
    assert!(manager.auth_cached().is_some());
    manager.restrict_auth_modes(vec![AuthMode::Chatgpt]).unwrap();
    assert!(prior.check().is_err());
    assert!(manager.auth_cached().is_none());
    let policy = manager.scoped_runtime_policy().unwrap();
    assert!(manager.validate_scoped_runtime_auth(&policy).is_err());
}
#[test]
fn poisoned_invalidation_is_terminal_before_any_logout_io() {
    let manager = AuthManager::from_optional_auth_for_testing(None);
    let prior = lease(&manager);
    poison_cache(&manager);
    assert!(manager.invalidate_pending_auth_reads().is_err());
    assert!(prior.check().is_err());
    let controller = NetworkPolicyController::default();
    assert!(manager.protected_send_fence.lease(controller.policy(), 0, 0).is_err());
}
#[test]
fn poisoned_cache_publication_cannot_leave_existing_lease_valid() {
    let manager = AuthManager::from_optional_auth_for_testing(None);
    let prior = lease(&manager);
    poison_cache(&manager);
    assert!(!manager.set_cached_auth(None));
    assert!(prior.check().is_err());
}
#[test]
fn panic_in_actual_cache_writer_revokes_before_lock_poison_is_observed() {
    let manager=AuthManager::from_optional_auth_for_testing(None);
    let prior=lease(&manager);
    assert!(catch_unwind(AssertUnwindSafe(|| {
        let _original=manager.protected_cache_write().unwrap();
        panic!("controlled actual cache-writer unwind");
    })).is_err());
    assert!(manager.inner.is_poisoned());
    assert!(prior.check().is_err());
}
