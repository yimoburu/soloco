//! Source-owned protected Responses producer for the exact c407 source candidate.
//! A frame describes an observation, never qualification of this executable or its owner.
//! Only the original inherited supervisor pipes can return a one-use send permit.
use codex_client::{HttpTransport, Request, Response, ReqwestTransport, StreamResponse, TransportError};
use futures::StreamExt;
use http::Method;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use uuid::Uuid;

mod startup;
#[cfg(test)]
mod source_gate_tests;
pub use startup::{NativeStartup, OriginalBootstrapClaim, begin_original_companion, observe_original_bootstrap};

const PROTOCOL: &str = "soloco-protected-backend-permit-v2";
const COMMIT: &str = "c40729ea5cf8e947481b130c59807273eda2f8e9";
const MAX_FRAME: usize = 100_000;
const MAX_BODY: usize = 4_000_000;
static NEXT_RUNTIME: AtomicU64 = AtomicU64::new(1);
static UNKNOWN: AtomicBool = AtomicBool::new(false);
struct OperationGuard<'a> { armed: bool, unknown: &'a AtomicBool }
impl Drop for OperationGuard<'_> {
    fn drop(&mut self) { if self.armed { self.unknown.store(true, Ordering::SeqCst); } }
}
async fn lock_original_known<'a,T>(mutex: &'a tokio::sync::Mutex<T>, unknown: &AtomicBool)
    -> Result<tokio::sync::MutexGuard<'a,T>,TransportError> {
    let guard=mutex.lock().await;ensure_known(unknown)?;Ok(guard)
}
async fn await_original_known<F: std::future::Future>(unknown: &AtomicBool, wait: F) -> Result<F::Output,TransportError> {
    let result=wait.await;ensure_known(unknown)?;Ok(result)
}
fn ensure_known(unknown: &AtomicBool) -> Result<(), TransportError> {
    if unknown.load(Ordering::SeqCst) { Err(hold("unknown prior operation/cancellation")) } else { Ok(()) }
}

/// A compile-time control selection, NOT a runtime/source-build qualification.
pub fn enabled() -> bool {
    option_env!("SOLOCO_PROTECTED_HOST_BUILD") == Some("1")
}

fn hold(reason: &str) -> TransportError {
    TransportError::Build(format!("protected peer HOLD: {reason}"))
}
pub fn source_bytes_sha256(bytes: &[u8]) -> String { hash(bytes) }

#[derive(Debug, Clone, Serialize)]
pub struct SourceProvenance {
    original_sampling_input_sha256: String, sources: Value, unknown_origins: Vec<String>,
}
impl SourceProvenance {
    pub fn from_original_loaders(original_sampling_input_sha256: String, sources: Value, unknown_origins: Vec<String>) -> Self {
        let mut unknown_origins=unknown_origins;
        for missing in ["input_message_to_rendered_source_spans_not_retained", "restored_history_instruction_origins_not_retained"] {
            if !unknown_origins.iter().any(|item|item==missing) { unknown_origins.push(missing.into()); }
        }
        Self { original_sampling_input_sha256, sources, unknown_origins }
    }
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn json_hash(value: &Value) -> Result<String, TransportError> {
    serde_json::to_vec(value).map(|v| hash(&v)).map_err(|_| hold("JSON encoding"))
}

#[derive(Debug, Default)]
struct Generations {
    profile: Option<String>, services: Option<String>, instructions: Option<String>,
    profile_generation: u64, services_generation: u64, instruction_generation: u64,
    next_step: u64,
}

/// Created by the original ModelClientState constructor, shared by its clones.
/// No constructor accepts proof flags, source labels, callbacks, or generations.
#[derive(Debug, Clone)]
pub struct SourceRuntime {
    generation: u64,
    state: Arc<Mutex<Generations>>,
}
impl Default for SourceRuntime {
    fn default() -> Self { Self::new() }
}
impl SourceRuntime {
    pub fn new() -> Self {
        Self { generation: NEXT_RUNTIME.fetch_add(1, Ordering::SeqCst), state: Arc::default() }
    }
    /// Metadata is copied at the original core call site; it is not proof of auth ownership.
    pub fn step(&self, thread_id: String, turn_id: Option<String>, auth_owner: Option<u64>,
                auth_revision: Option<u64>, runtime_id: Option<String>, provenance: Option<Arc<SourceProvenance>>) -> SourceStep {
        SourceStep { runtime: self.clone(), thread_id, turn_id, auth_owner, auth_revision,
            runtime_id, provenance, request_id: Uuid::new_v4().to_string(), consumed: Arc::new(AtomicBool::new(false)) }
    }
}

#[derive(Debug, Clone)]
pub struct SourceStep {
    runtime: SourceRuntime, thread_id: String, turn_id: Option<String>,
    auth_owner: Option<u64>, auth_revision: Option<u64>, runtime_id: Option<String>, provenance: Option<Arc<SourceProvenance>>,
    request_id: String, consumed: Arc<AtomicBool>,
}
/// The original native transport object, not a caller callback or qualification label.
/// Its constructor accepts the real concrete transport, never an HttpTransport implementation.
pub struct ProtectedGatewayTransport { inner: ReqwestTransport, instance_id: String, auth: Option<codex_http_client::AuthSendLease>, auth_provider: Option<crate::SharedAuthProvider> }
pub fn bind_native_gateway(inner: ReqwestTransport, auth: Option<codex_http_client::AuthSendLease>,
    auth_provider: Option<crate::SharedAuthProvider>) -> ProtectedGatewayTransport {
    ProtectedGatewayTransport { inner, auth, auth_provider, instance_id: if enabled() { Uuid::new_v4().to_string() } else { String::new() } }
}
impl HttpTransport for ProtectedGatewayTransport {
    async fn execute(&self, request: Request) -> Result<Response, TransportError> {
        if enabled() { return Err(hold("native gateway non-Responses route")); }
        self.inner.execute(request).await
    }
    async fn stream(&self, request: Request) -> Result<StreamResponse, TransportError> {
        if enabled() { return Err(hold("native gateway requires original final-step cut")); }
        self.inner.stream(request).await
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Challenge {
    protocol: String, kind: String, nonce: String, pid: u32,
    upstream_url: String, slot_id: String, executable_sha256: String, source_manifest_sha256: String,
    state_root: String, cwd: String, original_home_sha256: Option<String>,
}
fn validate_challenge(challenge: &Challenge) -> Result<(), TransportError> {
    let url = url::Url::parse(&challenge.upstream_url).map_err(|_| hold("upstream URL"))?;
    let hash = |v: &str| v.len()==64 && v.bytes().all(|b| b.is_ascii_hexdigit());
    if challenge.protocol != PROTOCOL || challenge.kind != "challenge" || challenge.pid != std::process::id() ||
        !hash(&challenge.nonce) || !hash(&challenge.executable_sha256) || !hash(&challenge.source_manifest_sha256) ||
        challenge.slot_id.is_empty() || challenge.slot_id.len()>200 ||
        !std::path::Path::new(&challenge.state_root).is_absolute() || !std::path::Path::new(&challenge.cwd).is_absolute() ||
        url.scheme() != "https" || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() ||
        url.query().is_some() || url.fragment().is_some() || !url.path().ends_with("/responses") {
        return Err(hold("original v2 challenge binding"));
    }
    Ok(())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Permit {
    protocol: String, kind: String, nonce: String, pid: u32, sequence: u64,
    binding_sha256: String, request_sha256: String, request_id: String,
    gateway_instance_id: String,
}
#[derive(Serialize)]
struct FinalObservation<'a> {
    protocol: &'static str, kind: &'static str, nonce: &'a str, pid: u32, sequence: u64,
    source_commit: &'static str, producer_module_sha256: String, tool_resource_sha256: String,
    host_instance_id: &'a str,
    runtime_generation: u64, profile_generation: u64, services_generation: u64,
    instruction_generation: u64, thread_id: &'a str, turn_id: &'a str, step_id: u64,
    auth_owner_generation: u64, auth_revision: u64, auth_send_epoch: u64, runtime_id: &'a Option<String>,
    request_id: &'a str, gateway_instance_id: &'a str, method: &'a str, url: &'a str,
    request_sha256: String, request_bytes: usize, context_sha256: String,
    input_text_sha256s: Vec<String>,
    ordered_instructions: Vec<Value>, ordered_instructions_sha256: String,
    profile: Value, tools: Value, provenance: &'a Option<Arc<SourceProvenance>>,
}

fn generation(previous: &mut Option<String>, current: String, n: &mut u64) -> Result<(), TransportError> {
    if previous.as_ref() != Some(&current) {
        *n = n.checked_add(1).ok_or_else(|| hold("generation overflow"))?;
        *previous = Some(current);
    }
    Ok(())
}

fn observation<'a>(request: &'a Request, body: &[u8], step: &'a SourceStep, gateway: &'a ProtectedGatewayTransport,
                   challenge: &'a Challenge, host_instance_id: &'a str, sequence: u64) -> Result<FinalObservation<'a>, TransportError> {
    if step.runtime.generation == 0 || step.runtime.generation == u64::MAX {
        return Err(hold("runtime generation exhausted"));
    }
    let turn_id = step.turn_id.as_deref().filter(|s| !s.is_empty()).ok_or_else(|| hold("missing original turn"))?;
    if step.thread_id.is_empty() { return Err(hold("missing original thread")); }
    let auth_owner = step.auth_owner.ok_or_else(|| hold("normal auth owner unobserved"))?;
    let auth_revision = step.auth_revision.ok_or_else(|| hold("normal auth revision unobserved"))?;
    let live_auth = gateway.auth.as_ref().ok_or_else(|| hold("original same-manager send lease unavailable"))?;
    live_auth.check().map_err(|_| hold("original auth changed after provider callback"))?;
    if live_auth.auth_owner_generation() != auth_owner || live_auth.auth_revision() != auth_revision {
        return Err(hold("copied setup metadata differs from original live lease"));
    }
    if request.method != Method::POST || request.url != challenge.upstream_url ||
        request.headers.contains_key(http::header::CONTENT_ENCODING) {
        return Err(hold("final gateway/request-id/compression mismatch"));
    }
    let mut document: Value = serde_json::from_slice(body).map_err(|_| hold("final JSON body"))?;
    let root = document.as_object_mut().ok_or_else(|| hold("final body object"))?;
    let tools = root.get("tools").cloned().ok_or_else(|| hold("missing full offered inventory"))?;
    let expected: Value = serde_json::from_str(include_str!("protected_peer_responses_tools.json"))
        .map_err(|_| hold("compiled tool resource"))?;
    if tools != expected { return Err(hold("full original five-tool/schema equality")); }
    let input = root.get("input").and_then(Value::as_array).ok_or_else(|| hold("ordered input"))?;
    if input.iter().any(|v| v.get("type").and_then(Value::as_str) == Some("additional_tools")) {
        return Err(hold("unqualified restored/deferred offered inventory"));
    }
    let context_sha256 = json_hash(&Value::Array(input.clone()))?;
    let input_text_sha256s = input.iter().flat_map(|item|item.get("content").and_then(Value::as_array).into_iter().flatten())
        .filter_map(|content|content.get("text").and_then(Value::as_str)).map(|text|hash(text.as_bytes())).collect();
    let ordered_instructions: Vec<Value> = input.iter().enumerate().filter_map(|(index, item)| {
        let role = item.get("role").and_then(Value::as_str)?;
        matches!(role, "system" | "developer").then(|| json!({"input_index": index, "item": item}))
    }).collect();
    let instructions_hash = json_hash(&Value::Array(ordered_instructions.clone()))?;
    root.remove("input"); root.remove("tools"); root.remove("client_metadata");
    let profile = document;
    let profile_hash = json_hash(&profile)?;
    let services_hash = json_hash(&tools)?;
    let mut state = step.runtime.state.lock().map_err(|_| hold("runtime state poisoned"))?;
    // Destructure to keep disjoint mutable field borrows explicit.
    let Generations { profile: old_profile, services: old_services, instructions: old_instructions,
        profile_generation, services_generation, instruction_generation, next_step } = &mut *state;
    generation(old_profile, profile_hash, profile_generation)?;
    generation(old_services, services_hash, services_generation)?;
    generation(old_instructions, instructions_hash.clone(), instruction_generation)?;
    *next_step = next_step.checked_add(1).ok_or_else(|| hold("step overflow"))?;
    Ok(FinalObservation { protocol: PROTOCOL, kind: "final_request", nonce: &challenge.nonce,
        pid: std::process::id(), sequence, source_commit: COMMIT,
        producer_module_sha256: hash(include_bytes!("protected_peer.rs")),
        tool_resource_sha256: hash(include_bytes!("protected_peer_responses_tools.json")),
        host_instance_id, runtime_generation: step.runtime.generation, profile_generation: *profile_generation,
        services_generation: *services_generation, instruction_generation: *instruction_generation,
        thread_id: &step.thread_id, turn_id, step_id: *next_step, auth_owner_generation: auth_owner,
        auth_revision, auth_send_epoch: live_auth.epoch(), runtime_id: &step.runtime_id, request_id: &step.request_id,
        gateway_instance_id: &gateway.instance_id, method: request.method.as_str(), url: &request.url,
        request_sha256: hash(body), request_bytes: body.len(), context_sha256,
        input_text_sha256s, ordered_instructions, ordered_instructions_sha256: instructions_hash, profile, tools, provenance: &step.provenance })
}

#[cfg(unix)]
mod pipe {
    use super::*;
    use std::io;
    use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
    use tokio::io::unix::AsyncFd;
    pub(super) struct Pipe(AsyncFd<OwnedFd>);
    impl Pipe {
        pub(super) fn inherited(fd: i32) -> io::Result<Self> {
            // Only fixed descriptors inherited from the original launch; no path/env override.
            let mut stat = std::mem::MaybeUninit::<libc::stat>::uninit();
            if unsafe { libc::fstat(fd, stat.as_mut_ptr()) } != 0 { return Err(io::Error::last_os_error()); }
            // Establish that the inherited descriptor is open before claiming ownership.
            let owned = unsafe { OwnedFd::from_raw_fd(fd) };
            let mode = unsafe { stat.assume_init() }.st_mode & libc::S_IFMT;
            // libuv may implement Node's original anonymous stdio pipes as socketpairs.
            if mode != libc::S_IFIFO && mode != libc::S_IFSOCK {
                return Err(io::Error::other("protected descriptor is not original pipe"));
            }
            let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
            let descriptor_flags = unsafe { libc::fcntl(fd, libc::F_GETFD) };
            if flags < 0 || descriptor_flags < 0 || unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0 ||
                unsafe { libc::fcntl(fd, libc::F_SETFD, descriptor_flags | libc::FD_CLOEXEC) } < 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(Self(AsyncFd::new(owned)?))
        }
        pub(super) async fn read_byte(&self) -> io::Result<u8> {
            loop {
                let mut ready = self.0.readable().await?;
                match ready.try_io(|fd| {
                    let mut byte = 0u8;
                    let n = unsafe { libc::read(fd.get_ref().as_raw_fd(), (&mut byte as *mut u8).cast(), 1) };
                    if n == 1 { Ok(byte) } else if n == 0 { Err(io::Error::from(io::ErrorKind::UnexpectedEof)) }
                    else { Err(io::Error::last_os_error()) }
                }) { Ok(result) => return result, Err(_) => continue }
            }
        }
        pub(super) async fn write(&self, bytes: &[u8]) -> io::Result<()> {
            let mut offset = 0;
            while offset < bytes.len() {
                let mut ready = self.0.writable().await?;
                match ready.try_io(|fd| {
                    let n = unsafe { libc::write(fd.get_ref().as_raw_fd(), bytes[offset..].as_ptr().cast(), bytes.len()-offset) };
                    if n > 0 { Ok(n as usize) } else if n == 0 { Err(io::Error::from(io::ErrorKind::WriteZero)) }
                    else { Err(io::Error::last_os_error()) }
                }) { Ok(Ok(n)) => offset += n, Ok(Err(e)) => return Err(e), Err(_) => continue }
            }
            Ok(())
        }
    }
}

#[cfg(unix)]
struct Channel {
    incoming: pipe::Pipe, outgoing: pipe::Pipe, challenge: Option<Challenge>,
    sequence: u64, unresolved: Option<String>, poisoned: bool, host_observation: Option<Value>,
}
#[cfg(unix)]
impl Channel {
    async fn read<T: serde::de::DeserializeOwned>(&self) -> Result<T, TransportError> {
        let mut bytes = Vec::new();
        loop {
            let byte = self.incoming.read_byte().await.map_err(|_| hold("original control pipe closed/error"))?;
            if byte == b'\n' { break; }
            if bytes.len() == MAX_FRAME { return Err(hold("control frame byte limit")); }
            bytes.push(byte);
        }
        serde_json::from_slice(&bytes).map_err(|_| hold("strict control frame"))
    }
    async fn write(&self, value: &impl Serialize) -> Result<(), TransportError> {
        let mut bytes = serde_json::to_vec(value).map_err(|_| hold("witness encoding"))?;
        if bytes.len() > MAX_FRAME { return Err(hold("witness frame byte limit")); }
        bytes.push(b'\n');
        self.outgoing.write(&bytes).await.map_err(|_| hold("original witness pipe closed/error"))
    }
    async fn write_observation(&self, facts: &impl Serialize) -> Result<String, TransportError> {
        // Hash the exact original serialization; no cross-language reserialization assumption.
        let observed = serde_json::to_vec(facts).map_err(|_| hold("observation encoding"))?;
        let binding = hash(&observed);
        let mut frame = format!("{{\"binding_sha256\":\"{binding}\",\"observation\":").into_bytes();
        frame.extend_from_slice(&observed); frame.push(b'}');
        if frame.len() > MAX_FRAME { return Err(hold("witness frame byte limit")); }
        frame.push(b'\n');
        self.outgoing.write(&frame).await.map_err(|_| hold("original witness pipe closed/error"))?;
        Ok(binding)
    }
    async fn permit(&mut self, request: &Request, body: &[u8], step: &SourceStep, gateway: &ProtectedGatewayTransport) -> Result<(), TransportError> {
        if self.poisoned || self.unresolved.is_some() { return Err(hold("unresolved prior backend operation")); }
        if self.host_observation.is_none() || self.challenge.is_none() {
            return Err(hold("original pre-auth challenge/bootstrap observation unavailable"));
        }
        self.sequence = self.sequence.checked_add(1).ok_or_else(|| hold("channel sequence overflow"))?;
        let challenge = self.challenge.as_ref().ok_or_else(|| hold("missing challenge"))?;
        let host_id = self.host_observation.as_ref().and_then(|h| h.get("host_instance_id")).and_then(Value::as_str)
            .ok_or_else(|| hold("original host instance unavailable"))?;
        let facts = observation(request, body, step, gateway, challenge, host_id, self.sequence)?;
        let binding = self.write_observation(&facts).await?;
        let permit: Permit = self.read().await?;
        if permit.protocol != PROTOCOL || permit.kind != "send_permit" || permit.nonce != challenge.nonce ||
            permit.pid != std::process::id() || permit.sequence != self.sequence || permit.binding_sha256 != binding ||
            permit.request_sha256 != hash(body) || permit.request_id != step.request_id ||
            permit.gateway_instance_id != gateway.instance_id {
            return Err(hold("one-use original request/gateway permit mismatch"));
        }
        // A consumed permit reserves this operation. Errors/cancellation cannot unreserve it.
        self.unresolved = Some(step.request_id.clone());
        Ok(())
    }
}
#[cfg(unix)]
static CHANNEL: tokio::sync::OnceCell<Result<tokio::sync::Mutex<Channel>, String>> = tokio::sync::OnceCell::const_new();
#[cfg(unix)]
async fn channel() -> Result<&'static tokio::sync::Mutex<Channel>, TransportError> {
    // Initialization failure is retained: a later call must not re-claim recycled fd numbers.
    let result = CHANNEL.get_or_init(|| async {
        let outgoing = pipe::Pipe::inherited(3).map_err(|_| "original FD3 unavailable".to_string())?;
        let incoming = pipe::Pipe::inherited(4).map_err(|_| "original FD4 unavailable".to_string())?;
        Ok(tokio::sync::Mutex::new(Channel { incoming, outgoing, challenge: None, sequence: 0, unresolved: None, poisoned: false, host_observation: None }))
    }).await;
    result.as_ref().map_err(|reason| hold(reason))
}

/// The single actual HTTP cut. Auth has already run and may have replaced the request.
/// No async/caller mutation is allowed between permit validation and transport invocation.
pub(crate) async fn stream<T: HttpTransport + 'static>(transport: &T, request: Request, step: Option<&SourceStep>, auth_provider: &crate::SharedAuthProvider)
    -> Result<StreamResponse, TransportError> {
    if !enabled() { return transport.stream(request).await; }
    #[cfg(not(unix))]
    { let _ = (transport, request, step, auth_provider); Err(hold("unsupported inherited-pipe host")) }
    #[cfg(unix)]
    {
        // Concrete type identity is required. No caller boolean or trait proof callback.
        let gateway = (transport as &dyn std::any::Any).downcast_ref::<ProtectedGatewayTransport>()
            .ok_or_else(|| hold("unbound stock/foreign upstream transport"))?;
        if !gateway.auth_provider.as_ref().is_some_and(|original| Arc::ptr_eq(original, auth_provider)) {
            return Err(hold("foreign authentication provider object"));
        }
        ensure_known(&UNKNOWN)?;
        let step = step.ok_or_else(|| hold("missing original ModelClient step"))?;
        if step.consumed.swap(true, Ordering::SeqCst) { return Err(hold("step already consumed")); }
        let request = request.into_prepared().map_err(TransportError::Build)?;
        let prepared = request.prepare_body_for_send().map_err(TransportError::Build)?;
        let body = prepared.body.as_ref().ok_or_else(|| hold("missing final body"))?;
        if body.is_empty() || body.len() > MAX_BODY { return Err(hold("final body byte limit")); }
        let owner = channel().await?;
        let guard = OperationGuard { armed: true, unknown: &UNKNOWN };
        let mut state = lock_original_known(owner,&UNKNOWN).await?;
        let permit = await_original_known(&UNKNOWN,tokio::time::timeout(std::time::Duration::from_secs(5), state.permit(&request, body, step, gateway))).await;
        if !matches!(permit, Ok(Ok(Ok(())))) { state.poisoned = true; return Err(hold("permit failed/timed out")); }
        if let Err(error) = ensure_known(&UNKNOWN) { state.poisoned = true; return Err(error); }
        drop(state);
        // Recheck AFTER the awaited supervisor permit as well as after authentication.
        // The original manager owns this read lease; no callback supplies a verdict.
        let live_auth = gateway.auth.as_ref().ok_or_else(|| hold("missing original live auth lease"))?.clone();
        live_auth.check().map_err(|_| hold("original auth changed during permit wait"))?;
        let url = url::Url::parse(&request.url).map_err(|_| hold("final URL"))?;
        let network_permit = live_auth.authorize(&url).map_err(|_| hold("original account-bound egress revoked"))?;
        ensure_known(&UNKNOWN)?;
        let result = live_auth.run(&network_permit, gateway.inner.stream(request)).await;
        let response = match result {
            Err(_) => { owner.lock().await.poisoned = true; return Err(hold("original auth/policy revoked at transport cut")); },
            Ok(result) => match result {
            Ok(response) => response,
            Err(error) => { owner.lock().await.poisoned = true; return Err(error); }
            }
        };
        let StreamResponse { status, headers, bytes } = response;
        {
            let state=owner.lock().await;
            let frame=json!({"protocol":PROTOCOL,"kind":"transport_headers","nonce":state.challenge.as_ref().map(|c|c.nonce.as_str()),
                "pid":std::process::id(),"sequence":state.sequence,"request_id":step.request_id,
                "gateway_instance_id":gateway.instance_id,"status":status.as_u16()});
            tokio::time::timeout(std::time::Duration::from_secs(5),state.write(&frame)).await
                .map_err(|_|hold("actual transport header observation deadline"))??;
        }
        let request_id = step.request_id.clone();
        // EOF is local observed transport-body closure, not remote model/backend-domain death.
        let bytes = futures::stream::unfold((bytes, owner, request_id, false, guard, live_auth, network_permit), |(mut bytes, owner, request_id, ended, mut guard, live_auth, network_permit)| async move {
            if ended { return None; }
            let next = match live_auth.run(&network_permit, bytes.next()).await {
                Ok(next) => next,
                Err(_) => Some(Err(hold("original auth/policy revoked while response outstanding"))),
            };
            match next {
                Some(Ok(chunk)) => Some((Ok(chunk), (bytes, owner, request_id, false, guard, live_auth, network_permit))),
                Some(Err(error)) => { owner.lock().await.poisoned = true; Some((Err(error), (bytes, owner, request_id, true, guard, live_auth, network_permit))) },
                None => {
                    let mut state = owner.lock().await;
                    if state.unresolved.as_ref() != Some(&request_id) { state.poisoned = true; return None; }
                    let frame = json!({"protocol":PROTOCOL,"kind":"local_body_eof","request_id":request_id,
                        "sequence":state.sequence,"pid":std::process::id(),"remote_domain_closed":false});
                    let result = tokio::time::timeout(std::time::Duration::from_secs(5), state.write(&frame)).await;
                    if matches!(result, Ok(Ok(()))) { state.unresolved = None; guard.armed = false; }
                    else { state.poisoned = true; }
                    None
                }
            }
        });
        Ok(StreamResponse { status, headers, bytes: Box::pin(bytes) })
    }
}
