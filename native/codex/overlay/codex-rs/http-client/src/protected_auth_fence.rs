//! Live send fence. The real AuthManager owns the producer; transports receive read leases.
//! A lease contains no credential and is not source-build/owner qualification by itself.
use crate::{NetworkPermit, NetworkPolicy, NetworkPolicyRevision};
use std::{future::Future, io};
use tokio::sync::watch;
use url::Url;

pub struct AuthSendFence { epoch: watch::Sender<u64> }
impl Default for AuthSendFence { fn default() -> Self { Self { epoch: watch::channel(0).0 } } }
impl AuthSendFence {
    /// Terminal for this original protected owner. No runtime reset/ready flag exists.
    pub fn revoke(&self) { self.epoch.send_modify(|n| *n = u64::MAX); }
    pub fn advance(&self) { self.epoch.send_modify(|n| *n = n.saturating_add(1)); }
    pub fn lease(&self, policy: NetworkPolicy, owner: u64, revision: u64) -> io::Result<AuthSendLease> {
        if !policy.is_managed() || *self.epoch.borrow() == u64::MAX { return Err(io::Error::other("unmanaged/exhausted auth send owner")); }
        Ok(AuthSendLease { expected_epoch: *self.epoch.borrow(), epoch: self.epoch.subscribe(),
            policy_revision: policy.revision(), policy, owner, revision })
    }
}
#[derive(Clone)]
pub struct AuthSendLease {
    expected_epoch: u64, epoch: watch::Receiver<u64>, policy: NetworkPolicy,
    policy_revision: NetworkPolicyRevision, owner: u64, revision: u64,
}
impl AuthSendLease {
    pub fn auth_owner_generation(&self) -> u64 { self.owner }
    pub fn auth_revision(&self) -> u64 { self.revision }
    pub fn epoch(&self) -> u64 { self.expected_epoch }
    pub fn check(&self) -> io::Result<()> {
        if self.expected_epoch == u64::MAX || self.epoch.has_changed().is_err() ||
            *self.epoch.borrow() != self.expected_epoch || self.policy.revision() != self.policy_revision {
            return Err(io::Error::other("original live auth/policy owner changed"));
        }
        Ok(())
    }
    pub fn authorize(&self, url: &Url) -> io::Result<NetworkPermit> {
        self.check()?;
        self.policy.acquire(url).map_err(io::Error::other)
    }
    /// Runs the actual original transport future while observing owner revocation.
    /// This future is an operation, never a caller qualification predicate.
    pub async fn run<T>(&self, permit: &NetworkPermit, operation: impl Future<Output=T>) -> io::Result<T> {
        self.check()?; permit.check().map_err(io::Error::other)?;
        let mut changes = self.epoch.clone();
        // Compare again after subscribing; an intervening change cannot disappear.
        if *changes.borrow_and_update() != self.expected_epoch { return Err(io::Error::other("stale original auth lease")); }
        let result = tokio::select! {
            biased;
            _ = changes.changed() => Err(io::Error::other("original auth revoked during transport")),
            result = permit.run(operation) => result.map_err(io::Error::other),
        };
        self.check()?; permit.check().map_err(io::Error::other)?;
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{DestinationPolicy, NetworkPolicyController};
    use std::sync::{Arc, atomic::{AtomicBool, Ordering}};

    fn lease(fence: &AuthSendFence) -> AuthSendLease {
        let controller = NetworkPolicyController::default();
        let policy = controller.policy();
        assert!(controller.publish(policy.revision(), DestinationPolicy::Unrestricted));
        fence.lease(policy.for_current_account(), 4, 9).unwrap()
    }

    #[tokio::test]
    async fn owner_change_after_permit_wait_prevents_transport_poll() {
        let owner = AuthSendFence::default();
        let lease = lease(&owner);
        let permit = lease.authorize(&Url::parse("https://example.invalid/responses").unwrap()).unwrap();
        tokio::task::yield_now().await; // completed awaited supervisor-permit boundary
        owner.advance();
        let started = Arc::new(AtomicBool::new(false));
        let observe = started.clone();
        let result = lease.run(&permit, async move { observe.store(true, Ordering::SeqCst); }).await;
        assert!(result.is_err());
        assert!(!started.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn owner_revocation_drops_an_outstanding_operation() {
        let owner = AuthSendFence::default();
        let lease = lease(&owner);
        let permit = lease.authorize(&Url::parse("https://example.invalid/responses").unwrap()).unwrap();
        let started = Arc::new(tokio::sync::Notify::new());
        let entered = started.clone();
        let dropped = Arc::new(AtomicBool::new(false));
        struct DropFlag(Arc<AtomicBool>);
        impl Drop for DropFlag { fn drop(&mut self) { self.0.store(true, Ordering::SeqCst); } }
        let track = dropped.clone();
        let operation = async move { let _guard = DropFlag(track); entered.notify_one(); std::future::pending::<()>().await };
        let (result, ()) = tokio::join!(lease.run(&permit, operation), async {
            started.notified().await; owner.advance();
        });
        assert!(result.is_err());
        assert!(lease.check().is_err());
        assert!(dropped.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn account_policy_revocation_cancels_an_outstanding_operation() {
        let owner = AuthSendFence::default();
        let controller = NetworkPolicyController::default();
        let policy = controller.policy();
        assert!(controller.publish(policy.revision(), DestinationPolicy::Unrestricted));
        let lease = owner.lease(policy.clone().for_current_account(), 4, 9).unwrap();
        let permit = lease.authorize(&Url::parse("https://example.invalid/responses").unwrap()).unwrap();
        let started = tokio::sync::Notify::new();
        let (result, ()) = tokio::join!(lease.run(&permit, async {
            started.notify_one(); std::future::pending::<()>().await
        }), async { started.notified().await; policy.invalidate(); });
        assert!(result.is_err());
    }
}
