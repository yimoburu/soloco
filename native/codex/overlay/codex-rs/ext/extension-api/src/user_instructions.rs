use std::future::Future;
use std::pin::Pin;

use codex_utils_absolute_path::AbsolutePathBuf;

/// Instructions supplied by the host.
///
/// Filesystem-backed instructions retain their absolute source path for the
/// app-server `instructionSources` API. Other host-provided instructions do
/// not report a filesystem source.
// TODO(anp): Replace the absolute path with a more general instruction-source
// abstraction when non-filesystem providers need first-class attribution.
#[derive(Clone, Debug)]
pub struct Instructions {
    /// Model-visible instruction text.
    pub text: String,
    /// Absolute filesystem path reported through `instructionSources`, if any.
    pub source: Option<AbsolutePathBuf>,
    // No Deserialize/public field: a source path or caller metadata is not a
    // file receipt. Only the original byte-reading producer below can mint it.
    original_read: Option<std::sync::Arc<OriginalInstructionRead>>,
}

struct OriginalInstructionRead {
    path: AbsolutePathBuf,
    occurrence: u64,
    file_sha256: String,
    file_bytes: usize,
    lossy: bool,
    materialized_text: String,
}

impl std::fmt::Debug for OriginalInstructionRead {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OriginalInstructionRead")
            .field("occurrence", &self.occurrence).field("file_bytes", &self.file_bytes)
            .field("lossy", &self.lossy).finish_non_exhaustive()
    }
}

// Preserve the existing instruction-value equality contract. Receipt identity
// is verified explicitly at capture, never inferred from semantic equality.
impl PartialEq for Instructions {
    fn eq(&self, other: &Self) -> bool { self.text == other.text && self.source == other.source }
}
impl Eq for Instructions {}

impl Instructions {
    /// Generic providers retain their old text/path semantics and no invented
    /// original-file authority. Protected provenance explicitly Holds them.
    pub fn unattributed(text: String, source: Option<AbsolutePathBuf>) -> Self {
        Self { text, source, original_read: None }
    }

    /// The real loader: performs the original read exactly once, before lossy
    /// UTF-8 decoding and trimming. This is not a post-hoc receipt constructor.
    pub async fn read_original_file(path: AbsolutePathBuf) -> std::io::Result<Option<Self>> {
        let data = tokio::fs::read(path.as_path()).await?;
        let text = String::from_utf8_lossy(&data).trim().to_owned();
        if text.is_empty() { return Ok(None); }
        static NEXT_READ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let occurrence = NEXT_READ.fetch_update(std::sync::atomic::Ordering::Relaxed,
            std::sync::atomic::Ordering::Relaxed, |value|value.checked_add(1)).ok();
        let original_read = occurrence.map(|occurrence|std::sync::Arc::new(OriginalInstructionRead {
            path: path.clone(), occurrence, file_sha256: codex_api::protected_peer::source_bytes_sha256(&data),
            file_bytes: data.len(), lossy: std::str::from_utf8(&data).is_err(),
            materialized_text: text.clone(),
        }));
        Ok(Some(Self { text, source: Some(path), original_read }))
    }

    /// A changed public text/path invalidates the retained read. Returned DATA
    /// reports the original byte digest separately from decoded/trimmed text.
    pub fn original_source_record(&self) -> Option<serde_json::Value> {
        let receipt = self.original_read.as_ref()?;
        if self.source.as_ref() != Some(&receipt.path) || self.text != receipt.materialized_text { return None; }
        Some(serde_json::json!({
            "source_path":receipt.path.as_path().display().to_string(),"original_read_occurrence":receipt.occurrence,
            "original_file_bytes_sha256":receipt.file_sha256,
            "original_file_bytes":receipt.file_bytes,"decoded_lossy":receipt.lossy,
            "materialization":"original UTF-8 lossy decode followed by trim",
            "decoded_trimmed_text_sha256":codex_api::protected_peer::source_bytes_sha256(self.text.as_bytes())
        }))
    }
}

/// Result of loading host-provided user instructions.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct LoadedUserInstructions {
    /// Loaded instructions, or `None` when the provider has no applicable text.
    pub instructions: Option<Instructions>,
    /// Recoverable loading problems that should be surfaced to the host.
    /// Providers own suppression of recurring warnings; Core forwards each returned warning.
    pub warnings: Vec<String>,
}

/// Future returned by an instruction provider.
pub type LoadInstructionsFuture<'a> =
    Pin<Box<dyn Future<Output = LoadedUserInstructions> + Send + 'a>>;

/// Loads host-provided instructions that apply to one root thread.
///
/// These instructions follow the global [`UserInstructionsProvider`] snapshot
/// and precede repository instructions. A result with no instructions or
/// blank instructions clears only the thread-scoped contribution. Core retains
/// the provider and reads it at startup and when capturing model-request context.
/// Implementations own fetching and caching; repeated reads should be cheap and
/// return a coherent snapshot. On a recoverable fetch failure, return the last
/// usable snapshot with warnings rather than an empty result that clears it.
pub trait ThreadInstructionsProvider: Send + Sync {
    /// Loads the current snapshot for the provider's root thread.
    fn load_thread_instructions(&self) -> LoadInstructionsFuture<'_>;

    /// Whether descendants should retain this provider instead of only its applied text.
    /// Defaults to snapshot inheritance. Opt in only when the same instruction scope and
    /// credentials apply to descendants. Descendants share the installed provider; a root
    /// resume can replace it for surviving descendants. Providers must coalesce/cache
    /// concurrent reads and retain a usable snapshot during outages.
    /// If a resumed root supplies a non-sharing provider, existing descendants keep their
    /// last shared instructions without receiving any new private updates.
    /// Updates are loaded at each descendant's next model-request boundary, not mid-request.
    fn share_with_subagents(&self) -> bool {
        false
    }
}

/// Loads global user instructions shared across root threads.
///
/// Core reads this provider at startup and when capturing model-request context.
/// Implementations own fetching and caching, so repeated reads should be cheap.
/// Implementations should return any recoverable loading problems as warnings
/// while still returning usable fallback instructions when available.
pub trait UserInstructionsProvider: Send + Sync {
    /// Loads the current global snapshot for a root runtime.
    fn load_user_instructions(&self) -> LoadInstructionsFuture<'_>;
}
