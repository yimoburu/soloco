//! Runtime-owned Session ingress. Data equality alone cannot attach an admission
//! to another Session or to the actual ModelClient's different private issuer.
use super::{MAX_BODY, SourceRuntime, hold};
use codex_client::TransportError;
use codex_history::{OriginalInputCapture, OriginalItemReceipt};
use codex_protocol::user_input::UserInput;
use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Weak};
use tokio::sync::{OwnedRwLockReadGuard, RwLock};
use serde_json::Value;

type CoreOwner = dyn std::any::Any + Send + Sync;

#[derive(Debug)]
pub(super) struct RuntimeIngressIssuer { _private: () }
impl RuntimeIngressIssuer {
    pub(super) fn new() -> Self { Self { _private: () } }
}

#[derive(Default)]
struct IngressData {
    revision: u64,
    last_order: Option<u64>,
    latest_accepted: Option<u64>,
    pending: HashMap<u64, Arc<[u8]>>,
    bound_occurrences: HashSet<u64>,
}

struct IngressSession {
    issuer: Weak<RuntimeIngressIssuer>,
    closed: AtomicBool,
    epoch: AtomicU64,
    changed: tokio::sync::Notify,
    dispatch: std::sync::Mutex<()>,
    // Set only at original Session construction; never mutable/rebindable.
    core_owner: Option<Weak<CoreOwner>>,
    data: Arc<RwLock<IngressData>>,
}

/// One owning Session handle. No Clone/Deserialize or owner-assignment API.
pub struct OriginalSessionIngress { state: Arc<IngressSession> }
impl std::fmt::Debug for OriginalSessionIngress {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OriginalSessionIngress").finish_non_exhaustive()
    }
}
impl Drop for OriginalSessionIngress {
    fn drop(&mut self) {
        let _dispatch = self.state.dispatch.lock();
        self.state.closed.store(true, Ordering::SeqCst);
        self.state.changed.notify_waiters();
    }
}

impl SourceRuntime {
    /// Called by the actual Core Session factory through its private ModelClient.
    /// A different public runtime has a different issuer and cannot splice proof
    /// into that ModelClient's final step.
    pub fn original_session_ingress(&self) -> OriginalSessionIngress {
        self.session_ingress(None)
    }

    /// Original Core constructor associates its private owner allocation once.
    /// An arbitrary owner on another runtime cannot match the actual step.
    pub fn original_session_ingress_for_core(&self, owner: Arc<CoreOwner>) -> OriginalSessionIngress {
        self.session_ingress(Some(Arc::downgrade(&owner)))
    }

    fn session_ingress(&self, core_owner: Option<Weak<CoreOwner>>) -> OriginalSessionIngress {
        OriginalSessionIngress { state: Arc::new(IngressSession {
            issuer: Arc::downgrade(&self.ingress_issuer),
            closed: AtomicBool::new(false),
            epoch: AtomicU64::new(0),
            changed: tokio::sync::Notify::new(),
            dispatch: std::sync::Mutex::new(()),
            core_owner,
            data: Arc::new(RwLock::new(IngressData::default())),
        }) }
    }
}

/// A single consumed admission bound to the actual original typed input and item.
#[derive(Clone)]
pub struct OriginalAcceptedInputWitness {
    session: Weak<IngressSession>,
    order: u64,
    occurrence: u64,
    typed: Arc<[u8]>,
    materialized: Arc<[u8]>,
}
impl std::fmt::Debug for OriginalAcceptedInputWitness {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OriginalAcceptedInputWitness")
            .field("order", &self.order).field("occurrence", &self.occurrence)
            .finish_non_exhaustive()
    }
}
impl OriginalAcceptedInputWitness {
    pub fn order(&self) -> u64 { self.order }
    pub fn occurrence(&self) -> u64 { self.occurrence }
}

/// Runtime-bound instruction observation issued only through the actual Core
/// Session handle after its private renderer validator. Source facts are DATA;
/// no field, label, ready boolean or supplied validator selects authority.
#[derive(Clone)]
pub struct OriginalGeneratedInputWitness {
    session: Weak<IngressSession>,
    occurrence: u64,
    materialized: Arc<[u8]>,
    source_facts: Arc<Value>,
}
impl std::fmt::Debug for OriginalGeneratedInputWitness {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OriginalGeneratedInputWitness").field("occurrence", &self.occurrence)
            .field("materialized_bytes", &self.materialized.len()).finish_non_exhaustive()
    }
}
impl OriginalGeneratedInputWitness {
    pub fn occurrence(&self) -> u64 { self.occurrence }
    pub fn materialized_bytes(&self) -> &[u8] { &self.materialized }
    pub fn source_facts(&self) -> &Value { &self.source_facts }
}

#[derive(Clone)]
struct OriginalWireMaterialization {
    bytes: Arc<[u8]>,
    source_facts: Arc<Value>,
}

/// Original transport ownership retained after the request send fence is released.
/// History lineage is not a fresh send permit or a claim that an old epoch is current.
#[derive(Clone)]
pub(super) struct OriginalResponseAuthority { session: Weak<IngressSession> }
impl OriginalResponseAuthority {
    pub(super) fn matches_core(&self, owner: &Arc<CoreOwner>) -> bool {
        self.session.upgrade().is_some_and(|session| !session.closed.load(Ordering::SeqCst)
            && session.issuer.upgrade().is_some()
            && session.core_owner.as_ref().and_then(Weak::upgrade).is_some_and(|actual|Arc::ptr_eq(&actual,owner)))
    }
}

#[derive(Clone)]
pub struct OriginalLiveInputWitness {
    session: Weak<IngressSession>, occurrence: u64, materialized: Arc<[u8]>,
    model: super::original_history::OriginalResponseItem, facts: Arc<Value>,
    native:Option<codex_protocol::dynamic_tools::original_exchange::OriginalDynamicReturn>,
}
impl std::fmt::Debug for OriginalLiveInputWitness {
    fn fmt(&self,f:&mut std::fmt::Formatter<'_>)->std::fmt::Result {
        f.debug_struct("OriginalLiveInputWitness").field("occurrence",&self.occurrence).finish_non_exhaustive()
    }
}
impl OriginalLiveInputWitness {
    fn current(&self)->bool {
        if !self.model.complete_original_response(){return false;}
        let Some(session)=self.session.upgrade() else{return false;};
        let Some(owner)=session.core_owner.as_ref().and_then(Weak::upgrade) else{return false;};
        self.native.as_ref().is_none_or(|returned|returned.still_original(&owner)
            && returned.witness::<super::original_native_decoder::OriginalNativeDynamicReturn>()
                .is_some_and(|proof|proof.matches_original(&self.model,returned.exchange())))
    }
    pub fn occurrence(&self)->u64 {self.occurrence}
    pub fn materialized_bytes(&self)->&[u8] {&self.materialized}
}

/// Exact current sampling projection, owned by the Session and runtime issuer.
/// The Weak reference does not keep a closed/dropped Session alive.
#[derive(Clone)]
pub struct OriginalSessionInputProjection {
    session: Weak<IngressSession>,
    revision: u64,
    latest_order: u64,
    sampling: Arc<[u8]>,
    occurrences: Arc<[(usize, u64)]>,
    generated: Arc<[(usize, OriginalGeneratedInputWitness)]>,
    live: Arc<[(usize, OriginalLiveInputWitness)]>,
    wire: Option<OriginalWireMaterialization>,
}
impl std::fmt::Debug for OriginalSessionInputProjection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OriginalSessionInputProjection")
            .field("revision", &self.revision).field("latest_order", &self.latest_order)
            .field("sampling_bytes", &self.sampling.len()).finish_non_exhaustive()
    }
}
impl OriginalSessionInputProjection {
    pub(super) fn response_authority(&self,runtime:&SourceRuntime)->Result<OriginalResponseAuthority,TransportError> {
        let session=self.checked_runtime(runtime)?;
        Ok(OriginalResponseAuthority {session:Arc::downgrade(&session)})
    }
    pub(super) fn covers_live(&self,index:usize)->bool {self.live.iter().any(|(i,_)|*i==index)}
    pub(super) fn live_source_facts(&self)->Vec<Value> {
        self.live.iter().map(|(index,witness)|serde_json::json!({"input_index":index,
            "occurrence":witness.occurrence,"model_source":witness.model.source_facts(),"core_source":witness.facts.as_ref()})).collect()
    }
    pub fn revision(&self) -> u64 { self.revision }
    pub fn latest_order(&self) -> u64 { self.latest_order }

    pub(super) fn matches_capture(&self, capture: &OriginalInputCapture) -> bool {
        if self.sampling.as_ref() != capture.serialized_input() || self.live.iter().any(|(_,w)|!w.current()) { return false; }
        if self.occurrences.len() != capture.spans().len()
            || self.occurrences.iter().zip(capture.spans()).any(|((index, occurrence), span)|
                span.index()!=*index || span.receipt().is_none_or(|receipt|receipt.occurrence()!=*occurrence))
        { return false; }
        let Some(session) = self.session.upgrade() else { return false; };
        if session.closed.load(Ordering::SeqCst) || session.issuer.upgrade().is_none()
            || session.core_owner.as_ref().and_then(Weak::upgrade).is_none() { return false; }
        let Ok(data) = session.data.try_read() else { return false; };
        session.epoch.load(Ordering::SeqCst) == self.revision
            && data.revision == self.revision && data.latest_accepted == Some(self.latest_order)
    }

    pub(super) fn check_request(&self, runtime: &SourceRuntime, body: &[u8]) -> Result<(), TransportError> {
        let session = self.checked_session(runtime, body)?;
        let data = session.data.try_read().map_err(|_| hold("Session ingress is changing"))?;
        self.check_revision(&session, &data)
    }

    pub(super) fn check_final_request(&self, runtime: &SourceRuntime, body: &[u8]) -> Result<(), TransportError> {
        if self.wire.is_none() { return Err(hold("original Core wire materialization unavailable")); }
        self.check_request(runtime, body)
    }

    fn checked_session(&self, runtime: &SourceRuntime, body: &[u8]) -> Result<Arc<IngressSession>, TransportError> {
        let session = self.checked_runtime(runtime)?;
        // Borrow the exact serialized input array; Value reserialization would
        // reorder object keys and replace the original byte comparison.
        #[derive(serde::Deserialize)]
        struct FinalInput<'a> {
            #[serde(borrow)]
            input: &'a serde_json::value::RawValue,
        }
        let final_input: FinalInput<'_> = serde_json::from_slice(body)
            .map_err(|_| hold("original ingress final input shape"))?;
        let expected = self.wire.as_ref().map(|wire|wire.bytes.as_ref()).unwrap_or(self.sampling.as_ref());
        if final_input.input.get().as_bytes() != expected {
            return Err(hold("original ingress projection differs from final prepared input"));
        }
        Ok(session)
    }

    fn checked_runtime(&self, runtime: &SourceRuntime) -> Result<Arc<IngressSession>, TransportError> {
        let session = self.session.upgrade().ok_or_else(|| hold("original Session ingress dropped"))?;
        let issuer = session.issuer.upgrade().ok_or_else(|| hold("original ingress runtime dropped"))?;
        if !Arc::ptr_eq(&issuer, &runtime.ingress_issuer) {
            return Err(hold("foreign Session ingress runtime issuer"));
        }
        session.core_owner.as_ref().and_then(Weak::upgrade)
            .ok_or_else(||hold("original Core Session owner unavailable"))?;
        Ok(session)
    }

    pub(super) fn covers_generated(&self, index: usize) -> bool {
        self.generated.iter().any(|(covered, _)|*covered == index)
    }

    pub(super) fn generated_source_facts(&self) -> Vec<Value> {
        self.generated.iter().map(|(index,witness)|serde_json::json!({
            "input_index":index,"original_occurrence":witness.occurrence,
            "materialized_bytes_sha256":super::hash(&witness.materialized),
            "source_facts":witness.source_facts.as_ref()})).collect()
    }

    fn check_revision(&self, session: &IngressSession, data: &IngressData) -> Result<(), TransportError> {
        if self.live.iter().any(|(_,w)|!w.current()) || session.closed.load(Ordering::SeqCst)
            || session.core_owner.as_ref().and_then(Weak::upgrade).is_none()
            || session.epoch.load(Ordering::SeqCst) != self.revision
            || data.revision != self.revision || data.latest_accepted != Some(self.latest_order)
        {
            return Err(hold("original Session ingress closed or changed"));
        }
        Ok(())
    }

    pub(super) async fn lock_for_send(&self, runtime: &SourceRuntime, body: &[u8])
        -> Result<OriginalIngressSendGuard, TransportError> {
        if self.wire.is_none() { return Err(hold("original Core wire materialization unavailable")); }
        let session = self.checked_session(runtime, body)?;
        let data = Arc::clone(&session.data).read_owned().await;
        self.check_revision(&session, &data)?;
        Ok(OriginalIngressSendGuard { session, data, revision: self.revision, latest_order: self.latest_order,live:self.live.clone() })
    }
}

pub(super) struct OriginalIngressSendGuard {
    session: Arc<IngressSession>,
    data: OwnedRwLockReadGuard<IngressData>,
    revision: u64,
    latest_order: u64,
    live:Arc<[(usize,OriginalLiveInputWitness)]>,
}
impl OriginalIngressSendGuard {
    /// Holds the actual Session read fence through original gateway send, with
    /// closure/drop checked before every poll. No caller verdict callback.
    pub(super) async fn run<F: std::future::Future>(&self, send: F) -> Result<F::Output, TransportError> {
        let mut send = std::pin::pin!(send);
        let mut changed = std::pin::pin!(self.session.changed.notified());
        std::future::poll_fn(|cx| {
            // Serialize admission/closure publication with this synchronous
            // gateway poll. This lock is never held across an await.
            let Ok(_dispatch) = self.session.dispatch.lock() else {
                return std::task::Poll::Ready(Err(hold("original Session dispatch fence poisoned")));
            };
            if self.live.iter().any(|(_,w)|!w.current()) || self.session.closed.load(Ordering::SeqCst)
                || self.session.issuer.upgrade().is_none()
                || self.session.core_owner.as_ref().and_then(Weak::upgrade).is_none()
                || self.session.epoch.load(Ordering::SeqCst) != self.revision
                || self.data.revision != self.revision
                || self.data.latest_accepted != Some(self.latest_order)
            {
                return std::task::Poll::Ready(Err(hold("original Session ingress revoked before gateway poll")));
            }
            if changed.as_mut().poll(cx).is_ready()
                || self.session.closed.load(Ordering::SeqCst)
                || self.session.epoch.load(Ordering::SeqCst) != self.revision
            {
                return std::task::Poll::Ready(Err(hold("original Session ingress changed during gateway send")));
            }
            send.as_mut().poll(cx).map(Ok)
        }).await
    }
}

impl OriginalSessionIngress {
    /// The original private Core renderer validator calls this on its owning
    /// Session handle. Facts remain bounded DATA; no fact field grants authority.
    pub fn bind_original_generated_materialization(&self, receipt: &OriginalItemReceipt, source_facts: &Value)
        -> Option<OriginalGeneratedInputWitness> {
        let _owner = self.state.core_owner.as_ref()?.upgrade()?;
        if self.state.closed.load(Ordering::SeqCst) || self.state.issuer.upgrade().is_none()
            || receipt.original_read().is_some() || receipt.original_user_input_bytes().is_some()
            || receipt.original_materialized_bytes() != receipt.projected_bytes()
            || receipt.original_materialized_bytes().len() > MAX_BODY
            || serde_json::to_vec(source_facts).ok()?.len() > MAX_BODY { return None; }
        let item: codex_protocol::models::ResponseItem = serde_json::from_slice(receipt.original_materialized_bytes()).ok()?;
        if !matches!(item, codex_protocol::models::ResponseItem::Message { role, .. }
            if matches!(role.as_str(), "user" | "developer" | "system")) { return None; }
        let data = self.state.data.try_read().ok()?;
        if self.state.epoch.load(Ordering::SeqCst) != data.revision { return None; }
        Some(OriginalGeneratedInputWitness {
            session: Arc::downgrade(&self.state), occurrence: receipt.occurrence(),
            materialized: Arc::from(receipt.original_materialized_bytes()), source_facts: Arc::new(source_facts.clone()),
        })
    }

    /// Records accepted typed bytes under the same write fence used by send.
    /// Every attempt advances revision; duplicate/oversized/empty admissions
    /// revoke a previous cut and cannot replace a consumed pending order.
    pub async fn observe_accepted_input(&self, order: u64, input: &[UserInput]) -> Option<()> {
        let revision = {
            let Ok(_dispatch) = self.state.dispatch.lock() else {
                self.state.closed.store(true, Ordering::SeqCst);
                self.state.changed.notify_waiters();
                return None;
            };
            if self.state.closed.load(Ordering::SeqCst) { return None; }
            match self.state.epoch.fetch_update(Ordering::SeqCst, Ordering::SeqCst,
                |epoch|epoch.checked_add(1)) {
                Ok(previous) => previous + 1,
                Err(_) => {
                    self.state.closed.store(true, Ordering::SeqCst);
                    self.state.changed.notify_waiters();
                    return None;
                }
            }
        };
        // Revoke and wake an outstanding original send BEFORE waiting for its
        // read fence; a steer must not wait for old HTTP headers to invalidate it.
        self.state.changed.notify_waiters();
        let typed = serde_json::to_vec(input).ok().filter(|bytes| !input.is_empty() && bytes.len() <= MAX_BODY);
        let mut data = self.state.data.write().await;
        if self.state.closed.load(Ordering::SeqCst) || self.state.issuer.upgrade().is_none()
            || self.state.epoch.load(Ordering::SeqCst) != revision { return None; }
        data.revision = revision;
        data.latest_accepted = None;
        if data.last_order.is_some_and(|last| order <= last) { return None; }
        data.last_order = Some(order);
        let typed = typed?;
        let retained = data.pending.values().try_fold(typed.len(), |total, bytes| total.checked_add(bytes.len()))?;
        if retained > MAX_BODY { return None; }
        data.pending.insert(order, typed.into());
        data.latest_accepted = Some(order);
        Some(())
    }

    /// Consumes the private pending admission once. Matching JSON metadata or a
    /// receipt from a different order/session cannot recreate that admission.
    pub async fn bind_accepted_materialization(&self, order: u64, input: &[UserInput], receipt: &OriginalItemReceipt)
        -> Option<OriginalAcceptedInputWitness> {
        let supplied = serde_json::to_vec(input).ok()?;
        let mut data = self.state.data.write().await;
        let typed = data.pending.get(&order)?;
        if self.state.closed.load(Ordering::SeqCst) || self.state.issuer.upgrade().is_none() { return None; }
        if supplied.as_slice() != typed.as_ref()
            || receipt.original_user_input_bytes() != Some(typed.as_ref())
            || receipt.original_read().is_some()
            || receipt.projected_bytes() != receipt.original_materialized_bytes()
            || data.bound_occurrences.contains(&receipt.occurrence())
        {
            return None;
        }
        let typed = data.pending.remove(&order)?;
        data.bound_occurrences.insert(receipt.occurrence());
        Some(OriginalAcceptedInputWitness {
            session: Arc::downgrade(&self.state), order, occurrence: receipt.occurrence(), typed,
            materialized: Arc::from(receipt.original_materialized_bytes()),
        })
    }

    /// Releases only the exact unmaterialized admission. It cannot create a
    /// witness, revive an old cut or reset the Session's monotonic order/revision.
    pub async fn discard_unmaterialized_admission(&self, order: u64, input: &[UserInput]) -> Option<()> {
        let supplied = serde_json::to_vec(input).ok()?;
        let mut data = self.state.data.write().await;
        if data.pending.get(&order)?.as_ref() != supplied.as_slice() { return None; }
        data.pending.remove(&order);
        if data.latest_accepted == Some(order) { data.latest_accepted = None; }
        Some(())
    }

    pub fn seal_original_projection(&self, capture: &OriginalInputCapture,
        accepted: &[(usize, OriginalAcceptedInputWitness)]) -> Option<OriginalSessionInputProjection> {
        self.seal_projection(capture, accepted, None, &[])
    }

    /// Exact union of actual accepted input and privately validated renderer
    /// occurrences. A generated user-role fragment does not become UserInput.
    pub fn seal_original_mixed_projection(&self, capture: &OriginalInputCapture,
        accepted: &[(usize, OriginalAcceptedInputWitness)], generated: &[(usize, OriginalGeneratedInputWitness)])
        -> Option<OriginalSessionInputProjection> {
        self.seal_projection(capture, accepted, Some(generated), &[])
    }

    /// Core calls this only after downcasting its private original producer capsule.
    /// Exact owning allocation and the original model response remain mandatory.
    pub fn bind_original_live_materialization(&self, receipt:&OriginalItemReceipt,
        owner:Arc<CoreOwner>, model:super::original_history::OriginalResponseItem, facts:Value,
        expected:&[u8],native:Option<codex_protocol::dynamic_tools::original_exchange::OriginalDynamicReturn>)->Option<OriginalLiveInputWitness> {
        let actual=self.state.core_owner.as_ref()?.upgrade()?;
        let model_session=model.authority().session.upgrade()?;
        if !Arc::ptr_eq(&actual,&owner) || !Arc::ptr_eq(&model_session,&self.state)
            || !model.complete_original_response() || self.state.closed.load(Ordering::SeqCst)
            || receipt.original_read().is_some() || receipt.original_user_input_bytes().is_some()
            || receipt.original_materialized_bytes()!=expected || receipt.projected_bytes()!=expected
            || expected.len()>MAX_BODY || serde_json::to_vec(&facts).ok()?.len()>MAX_BODY {return None;}
        if let Some(returned)=&native {
            if !returned.still_original(&owner)||!returned.witness::<super::original_native_decoder::OriginalNativeDynamicReturn>()?
                .matches_original(&model,returned.exchange()){return None;}
            let materialized:codex_protocol::models::ResponseItem=serde_json::from_slice(expected).ok()?;
            if !matches!((&materialized,model.item()),
                (codex_protocol::models::ResponseItem::FunctionCallOutput{call_id:out,..},codex_protocol::models::ResponseItem::FunctionCall{call_id:call,..}) if out.as_deref()==Some(call.as_str())){return None;}
        } else {
            let typed:codex_protocol::models::ResponseItem=serde_json::from_slice(expected).ok()?;
            if !model.accepts_history_stamp(&typed){return None;}
        }
        Some(OriginalLiveInputWitness {session:Arc::downgrade(&self.state),occurrence:receipt.occurrence(),
            materialized:Arc::from(expected),model,facts:Arc::new(facts),native})
    }
    pub fn seal_original_live_projection(&self,capture:&OriginalInputCapture,
        accepted:&[(usize,OriginalAcceptedInputWitness)],generated:&[(usize,OriginalGeneratedInputWitness)],
        live:&[(usize,OriginalLiveInputWitness)])->Option<OriginalSessionInputProjection> {
        self.seal_projection(capture,accepted,Some(generated),live)
    }
    fn seal_projection(&self, capture: &OriginalInputCapture,
        accepted: &[(usize, OriginalAcceptedInputWitness)], generated: Option<&[(usize, OriginalGeneratedInputWitness)]>,
        live:&[(usize,OriginalLiveInputWitness)])
        -> Option<OriginalSessionInputProjection> {
        if !capture.complete() || capture.spans().is_empty()
            || self.state.closed.load(Ordering::SeqCst) || self.state.issuer.upgrade().is_none() { return None; }
        let _owner = self.state.core_owner.as_ref()?.upgrade()?;
        let data = self.state.data.try_read().ok()?;
        if self.state.epoch.load(Ordering::SeqCst) != data.revision { return None; }
        let latest_order = data.latest_accepted?;
        let users = capture.spans().iter().filter(|span| span.user()).count();
        if users == 0 || accepted.is_empty() || (generated.is_none() && users != accepted.len()) { return None; }
        let mut indices = HashSet::new();
        let mut orders = HashSet::new();
        let mut occurrences = HashSet::new();
        let mut latest_present = false;
        for (index, witness) in accepted {
            let span = capture.spans().get(*index)?;
            let receipt = span.receipt()?;
            let witness_session = witness.session.upgrade()?;
            if !span.user() || span.index() != *index || !indices.insert(*index)
                || !orders.insert(witness.order) || !occurrences.insert(witness.occurrence)
                || !Arc::ptr_eq(&witness_session, &self.state)
                || !data.bound_occurrences.contains(&witness.occurrence)
                || receipt.occurrence() != witness.occurrence
                || receipt.original_read().is_some()
                || receipt.original_user_input_bytes() != Some(witness.typed.as_ref())
                || receipt.original_materialized_bytes() != witness.materialized.as_ref()
                || receipt.projected_bytes() != witness.materialized.as_ref()
            { return None; }
            latest_present |= witness.order == latest_order;
        }
        if let Some(generated) = generated {
            for (index, witness) in generated {
                let span = capture.spans().get(*index)?;
                let receipt = span.receipt()?;
                if span.index() != *index || (!span.user() && !span.instruction())
                    || !indices.insert(*index) || !occurrences.insert(witness.occurrence)
                    || !Arc::ptr_eq(&witness.session.upgrade()?, &self.state)
                    || receipt.occurrence() != witness.occurrence || receipt.original_read().is_some()
                    || receipt.original_user_input_bytes().is_some()
                    || receipt.original_materialized_bytes() != witness.materialized.as_ref()
                    || receipt.projected_bytes() != witness.materialized.as_ref() { return None; }
            }
        }
        for (index,witness) in live {
            let span=capture.spans().get(*index)?;let receipt=span.receipt()?;
            if span.user() || span.instruction() || span.index()!=*index
                || !indices.insert(*index) || !occurrences.insert(witness.occurrence)
                || !Arc::ptr_eq(&witness.session.upgrade()?,&self.state)
                || !witness.model.complete_original_response() || receipt.occurrence()!=witness.occurrence
                || receipt.original_read().is_some() || receipt.original_user_input_bytes().is_some()
                || receipt.original_materialized_bytes()!=witness.materialized.as_ref()
                || receipt.projected_bytes()!=witness.materialized.as_ref() {return None;}
        }
        if generated.is_some() && indices.len()!=capture.spans().len() {return None;}
        if !latest_present || self.state.epoch.load(Ordering::SeqCst) != data.revision
            || self.state.closed.load(Ordering::SeqCst) { return None; }
        Some(OriginalSessionInputProjection {
            session: Arc::downgrade(&self.state), revision: data.revision, latest_order,
            sampling: Arc::from(capture.serialized_input()),
            occurrences: capture.spans().iter().map(|span|
                Some((span.index(),span.receipt()?.occurrence()))).collect::<Option<Vec<_>>>()?.into(),
            generated: Arc::from(generated.unwrap_or_default()), live:Arc::from(live), wire: None,
        })
    }

    pub async fn close(&self) {
        {
            let _dispatch = self.state.dispatch.lock();
            self.state.closed.store(true, Ordering::SeqCst);
            self.state.changed.notify_waiters();
        }
        let mut data = self.state.data.write().await;
        data.latest_accepted = None;
        data.pending.clear();
    }
}

impl SourceRuntime {
    /// The private Core wire helper supplies exact original before/after arrays.
    /// Owner allocation and actual runtime identity select the binding; facts
    /// are retained as DATA and never interpreted as ready/verdict/authority.
    pub fn bind_original_wire_projection(&self, provenance: &super::SourceProvenance,
        owner_token: Arc<CoreOwner>, before: &[u8], after: &[u8], facts: &Value)
        -> Option<super::SourceProvenance> {
        let projection = provenance.session_projection.as_ref()?;
        if projection.wire.is_some() || before != projection.sampling.as_ref()
            || provenance.original_sampling_input_sha256 != super::hash(before)
            || before.len() > MAX_BODY || after.len() > MAX_BODY
            || serde_json::to_vec(facts).ok()?.len() > MAX_BODY { return None; }
        // Validate shape without canonicalizing or substituting semantic hashes
        // for the retained original arrays.
        let before_items: Vec<&serde_json::value::RawValue> = serde_json::from_slice(before).ok()?;
        let after_items: Vec<&serde_json::value::RawValue> = serde_json::from_slice(after).ok()?;
        let additional = |item: &&serde_json::value::RawValue| serde_json::from_str::<Value>(item.get())
            .ok().is_some_and(|item|item.get("type").and_then(Value::as_str)==Some("additional_tools"));
        if before_items.iter().any(additional) { return None; }
        let added_tools: Vec<_> = after_items.iter().enumerate().filter(|(_,item)|additional(item)).collect();
        if added_tools.len()>1 || added_tools.first().is_some_and(|(index,_)|*index!=0) { return None; }
        let session = projection.checked_runtime(self).ok()?;
        let actual_owner = session.core_owner.as_ref()?.upgrade()?;
        if !Arc::ptr_eq(&actual_owner, &owner_token) { return None; }
        let data = session.data.try_read().ok()?;
        projection.check_revision(&session, &data).ok()?;
        let mut bound = provenance.clone();
        let mut projection = projection.clone();
        projection.wire = Some(OriginalWireMaterialization {
            bytes: Arc::from(after), source_facts: Arc::new(facts.clone()),
        });
        let object = bound.sources.as_object_mut()?;
        object.insert("original_wire_projection".into(), serde_json::json!({
            "original_sampling_bytes_sha256":super::hash(before),"original_sampling_bytes":before.len(),
            "original_wire_input_bytes_sha256":super::hash(after),"original_wire_input_bytes":after.len(),
            "source_facts":projection.wire.as_ref()?.source_facts.as_ref(),
            "authority":"actual private Core owner allocation and runtime issuer",
        }));
        bound.session_projection = Some(projection);
        Some(bound)
    }
}

#[cfg(test)]
#[path = "original_ingress_tests.rs"]
mod tests;
