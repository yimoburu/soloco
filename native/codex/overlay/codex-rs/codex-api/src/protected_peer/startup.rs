//! Original inherited startup ownership. No auth constructor runs before this cut.
use super::*;
use std::{io::Read, path::Path, sync::atomic::AtomicBool};

pub struct NativeStartup { claim: OriginalBootstrapClaim }
pub struct OriginalBootstrapClaim {
    pub(super) nonce: String, pub(super) slot_id: String,
    pub(super) executable_sha256: String, pub(super) source_manifest_sha256: String,
    pub(super) original_home_sha256: String, pub(super) state_root: String, pub(super) cwd: String,
    consumed: AtomicBool,
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
        let compiled = option_env!("SOLOCO_SOURCE_MANIFEST_SHA256").ok_or_else(|| hold("unassociated source build"))?;
        if compiled != challenge.source_manifest_sha256 || executable_hash()? != challenge.executable_sha256 ||
            state_root.to_str() != Some(challenge.state_root.as_str()) || cwd.to_str() != Some(challenge.cwd.as_str()) ||
            challenge.original_home_sha256.as_ref().is_none_or(|v| v.len()!=64 || !v.bytes().all(|b| b.is_ascii_hexdigit())) {
            return Err(hold("source/output/scope/original-context association unproved before auth"));
        }
        let claim = OriginalBootstrapClaim { nonce: challenge.nonce.clone(), slot_id: challenge.slot_id.clone(),
            executable_sha256: challenge.executable_sha256.clone(), source_manifest_sha256: challenge.source_manifest_sha256.clone(),
            original_home_sha256: challenge.original_home_sha256.clone().ok_or_else(|| hold("missing original host"))?,
            state_root: challenge.state_root.clone(), cwd: challenge.cwd.clone(), consumed: AtomicBool::new(false) };
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
