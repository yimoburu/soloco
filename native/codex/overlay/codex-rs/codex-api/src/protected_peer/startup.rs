//! Original inherited startup ownership. No auth constructor runs before this cut.
use super::*;
use std::{io::Read, path::Path, sync::atomic::AtomicBool};

pub struct NativeStartup { claim: OriginalBootstrapClaim }
pub struct OriginalBootstrapClaim {
    pub(super) nonce: String, pub(super) slot_id: String,
    pub(super) executable_sha256: String, pub(super) source_manifest_sha256: String,
    pub(super) original_home_sha256: String, pub(super) state_root: String, pub(super) cwd: String,
    context_selection: Option<super::context_contract::OriginalContextSelection>,
    consumed: AtomicBool,
    decoder_issued: AtomicBool,
}
static STARTED: AtomicBool = AtomicBool::new(false);

impl NativeStartup {
    pub fn claim_bootstrap(self, actual_home: &Path) -> Result<OriginalBootstrapClaim, TransportError> {
        if self.claim.consumed.swap(true, Ordering::SeqCst) ||
            hash(actual_home.to_string_lossy().as_bytes()) != self.claim.original_home_sha256 {
            return Err(hold("original host context mismatch before auth"));
        }
        Ok(self.claim)
    }
}
impl OriginalBootstrapClaim {
    pub fn state_root(&self) -> &str { &self.state_root }
    pub fn cwd(&self) -> &str { &self.cwd }
}
fn executable_hash() -> Result<String, TransportError> {
    let path = std::env::current_exe().map_err(|_| hold("original executable identity"))?;
    let mut file = std::fs::File::open(path).map_err(|_| hold("original executable read"))?;
    let before = file.metadata().map_err(|_| hold("original executable metadata"))?;
    if !before.is_file() || before.len() > 2_147_483_648 { return Err(hold("original executable bound")); }
    let mut sha = Sha256::new(); let mut buffer = [0u8; 65536]; let mut read = 0u64;
    loop { let n = file.read(&mut buffer).map_err(|_| hold("original executable hash"))?;
        if n == 0 { break; } read += n as u64; if read > before.len() { return Err(hold("executable changed")); } sha.update(&buffer[..n]); }
    let after = file.metadata().map_err(|_| hold("original executable metadata"))?;
    if read != before.len() || after.len() != before.len() || after.modified().ok() != before.modified().ok() {
        return Err(hold("original executable changed"));
    }
    Ok(format!("{:x}", sha.finalize()))
}

/// Called by the actual companion executable before OriginalManagedHost::bootstrap.
/// Runtime flags cannot replace compile/output association or the original FD challenge.
pub async fn begin_original_companion(state_root: &Path, cwd: &Path) -> Result<NativeStartup, TransportError> {
    if !enabled() || STARTED.swap(true, Ordering::SeqCst) { return Err(hold("unqualified/repeated companion startup")); }
    #[cfg(not(unix))] { let _ = (state_root, cwd); return Err(hold("unsupported native host")); }
    #[cfg(unix)] {
        let owner = channel().await?;
        let mut state = owner.lock().await;
        let challenge: Challenge = tokio::time::timeout(std::time::Duration::from_secs(5), state.read())
            .await.map_err(|_| hold("pre-auth challenge deadline"))??;
        validate_challenge(&challenge)?;
        let context_selection = super::context_contract::select_original_context_contract(challenge.context_contract.as_ref())?;
        let compiled = option_env!("SOLOCO_SOURCE_MANIFEST_SHA256").ok_or_else(|| hold("unassociated source build"))?;
        if compiled != challenge.source_manifest_sha256 || executable_hash()? != challenge.executable_sha256 ||
            state_root.to_str() != Some(challenge.state_root.as_str()) || cwd.to_str() != Some(challenge.cwd.as_str()) ||
            challenge.original_home_sha256.as_ref().is_none_or(|v| v.len()!=64 || !v.bytes().all(|b| b.is_ascii_hexdigit())) {
            return Err(hold("source/output/scope/original-context association unproved before auth"));
        }
        let claim = OriginalBootstrapClaim { nonce: challenge.nonce.clone(), slot_id: challenge.slot_id.clone(),
            executable_sha256: challenge.executable_sha256.clone(), source_manifest_sha256: challenge.source_manifest_sha256.clone(),
            original_home_sha256: challenge.original_home_sha256.clone().ok_or_else(|| hold("missing original host"))?,
            state_root: challenge.state_root.clone(), cwd: challenge.cwd.clone(), context_selection, consumed: AtomicBool::new(false), decoder_issued:AtomicBool::new(false) };
        super::context_contract::retain_original_context_selection(claim.context_selection.clone())?;
        state.challenge = Some(challenge);
        Ok(NativeStartup { claim })
    }
}

/// Only the opaque original-bootstrap claim can emit this lifecycle observation.
/// Records describe actual original loaders; they do not assert ready/qualified.
pub async fn observe_original_bootstrap(claim: &OriginalBootstrapClaim, records: Value) -> Result<(), TransportError> {
    #[cfg(not(unix))] { let _ = (claim, records); return Err(hold("unsupported native host")); }
    #[cfg(unix)] {
        let owner = channel().await?; let mut state = owner.lock().await;
        if !claim.consumed.load(Ordering::SeqCst) || state.host_observation.is_some() ||
            state.challenge.as_ref().is_none_or(|c| c.nonce != claim.nonce) { return Err(hold("foreign/replayed original bootstrap")); }
        let facts = json!({"protocol":PROTOCOL,"kind":"host_bootstrap","nonce":claim.nonce,
            "pid":std::process::id(),"slot_id":claim.slot_id,"executable_sha256":claim.executable_sha256,
            "source_manifest_sha256":claim.source_manifest_sha256,"original_home_sha256":claim.original_home_sha256,
            "state_root":claim.state_root,"cwd":claim.cwd,"host_instance_id":Uuid::new_v4().to_string(),"sources":records});
        tokio::time::timeout(std::time::Duration::from_secs(5), state.write(&facts)).await
            .map_err(|_| hold("bootstrap observation deadline"))??;
        state.host_observation = Some(facts);
        Ok(())
    }
}

/// The original app-server scoped owner calls this only AFTER effective config,
/// profile/provider and same AuthManager checks. The claim cannot be reconstructed.
pub async fn mint_original_native_decoder(claim:&OriginalBootstrapClaim)
    ->Result<std::sync::Arc<super::original_native_decoder::OriginalNativeDecoderIssuer>,TransportError> {
    #[cfg(not(unix))] {let _=claim;return Err(hold("original native decoder unsupported host"));}
    #[cfg(unix)] {
        let owner=channel().await?;let state=owner.lock().await;
        let identity=super::original_native_decoder::OriginalStartupIdentity::observe(&state)?;
        let challenge=state.challenge.as_ref().ok_or_else(||hold("original decoder context challenge absent"))?;
        let host_id=state.host_observation.as_ref().and_then(|h|h.get("host_instance_id")).and_then(Value::as_str)
            .ok_or_else(||hold("original decoder context host absent"))?;
        // A selected v5 contract must have its original accepted context receipt
        // before the native decoder is issued. None preserves legacy raw-v1.
        super::context_contract::require_original_scope_for_send(challenge,host_id,state.scope_context_receipt.as_ref())?;
        if !claim.consumed.load(Ordering::SeqCst)||!identity.matches_claim(claim)
            ||state.poisoned||state.unresolved.is_some()||state.sequence!=0||UNKNOWN.load(Ordering::SeqCst)
            ||claim.decoder_issued.swap(true,Ordering::SeqCst) {return Err(hold("foreign/repeated original decoder issuer"));}
        Ok(std::sync::Arc::new(super::original_native_decoder::OriginalNativeDecoderIssuer::new(identity)))
    }
}

/// Actual scoped configuration calls this AFTER its effective reload and checks,
/// BEFORE spawning the in-process runtime. The opaque bootstrap owner is retained
/// throughout. No ready Boolean, caller JSON facts or proof callback is accepted.
/// A legacy raw-v1 startup emits no new context-capability observation.
pub async fn observe_original_context_contract(claim: &OriginalBootstrapClaim) -> Result<(), TransportError> {
    let Some(selection) = claim.context_selection.as_ref() else { return Ok(()); };
    #[cfg(not(unix))] { let _ = selection; return Err(hold("unsupported native host")); }
    #[cfg(unix)] {
        let owner = channel().await?;
        let mut state = owner.lock().await;
        if !claim.consumed.load(Ordering::SeqCst) || state.scope_context_attempted || state.scope_context_receipt.is_some()
            || state.poisoned || state.unresolved.is_some() || state.sequence != 0
            || state.challenge.as_ref().is_none_or(|c| c.nonce != claim.nonce
                || c.slot_id != claim.slot_id || c.source_manifest_sha256 != claim.source_manifest_sha256)
        {
            return Err(hold("foreign or repeated original scoped context owner"));
        }
        let host_instance_id = state.host_observation.as_ref()
            .and_then(|h| h.get("host_instance_id")).and_then(Value::as_str)
            .ok_or_else(|| hold("original bootstrap missing before scope capability"))?.to_owned();
        let observation = selection.observation(claim, host_instance_id);
        // Reserve before the original write. Failure/timeout never makes an old
        // scope acknowledgement reusable or permits a second observation.
        state.scope_context_attempted = true;
        // As with final request observations, bind the EXACT original Rust bytes;
        // a Node canonical reserialization is not the original observation.
        let binding = tokio::time::timeout(std::time::Duration::from_secs(5), state.write_observation(&observation))
            .await.map_err(|_| hold("context capability observation deadline"))??;
        let permit: super::context_contract::ContextContractPermit =
            tokio::time::timeout(std::time::Duration::from_secs(5), state.read())
                .await.map_err(|_| hold("context capability acknowledgement deadline"))??;
        state.scope_context_receipt = Some(super::context_contract::accept_original_context_permit(observation, &binding, permit)?);
        Ok(())
    }
}
