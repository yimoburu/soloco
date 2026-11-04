export const TIMEOUT_POLICY_VERSION = 1;
export const DEFAULT_EXECUTION_TIMEOUT_MS = 180000;
export const MIN_EXECUTION_TIMEOUT_MS = 1000;
export const MAX_EXECUTION_TIMEOUT_MS = 600000;
export const STARTUP_TIMEOUT_MS = 240000;
export const TERMINATION_GRACE_MS = 3000;
export const DEFAULT_TIMEOUT_REASON = 'Backward-compatible default execution timeout';

function instant(value, label) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
  if (!Number.isSafeInteger(number) || number < 0 || number > 8640000000000000) throw new Error(`Invalid ${label}`);
  return number;
}
function add(start, duration) {
  return instant(start + duration, 'deadline');
}

// The existing adapter's explicit 180000 argument remains a default choice.
// A different duration requires a reason. No extensions are represented here.
export function normalizeTimeout(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid timeout settings');
  for (const key of Object.keys(input)) if (!['timeout_ms', 'timeout_reason'].includes(key)) throw new Error(`Unsupported timeout setting: ${key}`);
  const timeout_ms = input.timeout_ms === undefined ? DEFAULT_EXECUTION_TIMEOUT_MS : input.timeout_ms;
  if (!Number.isSafeInteger(timeout_ms) || timeout_ms < MIN_EXECUTION_TIMEOUT_MS || timeout_ms > MAX_EXECUTION_TIMEOUT_MS) {
    throw new Error(`Execution timeout must be an integer from ${MIN_EXECUTION_TIMEOUT_MS} to ${MAX_EXECUTION_TIMEOUT_MS} ms`);
  }
  let timeout_reason;
  if (input.timeout_reason !== undefined) {
    if (typeof input.timeout_reason !== 'string' || !input.timeout_reason.trim() || input.timeout_reason.length > 300) throw new Error('Timeout reason must be nonempty and at most 300 characters');
    timeout_reason = input.timeout_reason.trim();
  } else {
    if (timeout_ms !== DEFAULT_EXECUTION_TIMEOUT_MS) throw new Error('A custom execution timeout requires a reason');
    timeout_reason = DEFAULT_TIMEOUT_REASON;
  }
  return {timeout_ms, timeout_reason};
}

export function executionTiming(spawnedAt, settings = {}) {
  const start = instant(spawnedAt, 'execution start');
  const policy = normalizeTimeout(settings);
  const deadline = add(start, policy.timeout_ms);
  return {
    timeout_policy_version: TIMEOUT_POLICY_VERSION,
    ...policy,
    execution_started_at: new Date(start).toISOString(),
    execution_deadline_at: new Date(deadline).toISOString(),
    termination_deadline_at: new Date(add(deadline, TERMINATION_GRACE_MS)).toISOString()
  };
}

// A deadline is exclusive: completion at the deadline is already too late.
export function deadlinePhase(deadlineAt, now) {
  const deadline = instant(deadlineAt, 'deadline');
  const current = instant(now, 'current time');
  if (current < deadline) return 'before';
  return current < add(deadline, TERMINATION_GRACE_MS) ? 'termination_grace' : 'overdue';
}

const terminalStatuses = new Set(['completed', 'succeeded', 'failed', 'cancelled', 'canceled', 'interrupted', 'quarantined', 'rejected', 'timed_out']);

// Shared worker/engine timing contract. New jobs explicitly carry
// timeout_policy_version=1. A worker records executionTiming at spawn.
// Legacy running jobs use started_at + the original execution default. Missing
// or contradictory timing holds inspection; it never resets an allowance.
// Deadlines establish lateness, never proof that a process has terminated.
export function jobTimeoutState(job, now) {
  const current = instant(now, 'current time');
  const inspect = reason => ({state: 'inspection', reason});
  if (!job || typeof job !== 'object' || Array.isArray(job)) return inspect('Missing job');
  if (job.type === 'development_test' || job.kind === 'development_test') return {state: 'excluded', reason: 'Development tests have a separate timeout policy'};
  if (terminalStatuses.has(job.status)) return {state: 'terminal'};
  if (!['queued', 'running'].includes(job.status)) return inspect('Unknown job status');
  try {
    const legacy = job.timeout_policy_version === undefined;
    if (!legacy && job.timeout_policy_version !== TIMEOUT_POLICY_VERSION) return inspect('Unsupported timeout policy version');
    if (legacy && (job.execution_started_at != null || job.execution_deadline_at != null)) return inspect('Execution timing lacks a policy version');
    if (!legacy && job.timeout_ms === undefined) return inspect('Missing recorded execution timeout');
    const policy = legacy ? normalizeTimeout() : normalizeTimeout({timeout_ms: job.timeout_ms, timeout_reason: job.timeout_reason});
    let phase, start, deadline;
    if (!legacy && job.execution_started_at != null) {
      if (job.status !== 'running') return inspect('Execution timing on a queued job');
      phase = 'execution';
      start = instant(job.execution_started_at, 'execution start');
      deadline = add(start, policy.timeout_ms);
      if (instant(job.execution_deadline_at, 'recorded execution deadline') !== deadline) return inspect('Execution deadline disagrees with recorded policy');
    } else if (legacy && job.status === 'running') {
      phase = 'execution';
      start = instant(job.started_at, 'legacy worker start');
      deadline = add(start, DEFAULT_EXECUTION_TIMEOUT_MS);
    } else {
      if (!legacy && job.execution_deadline_at != null) return inspect('Execution deadline without an execution start');
      phase = job.status === 'queued' ? 'queue' : 'startup';
      start = instant(phase === 'queue' ? job.created_at : job.started_at, `${phase} start`);
      deadline = add(start, STARTUP_TIMEOUT_MS);
    }
    if (current < start) return inspect('Current time precedes recorded start');
    const effectiveDeadline = phase === 'queue' ? deadline : add(deadline, TERMINATION_GRACE_MS);
    const state = current < deadline ? (phase === 'execution' ? 'executing' : 'waiting') : current < effectiveDeadline ? 'terminating' : 'overdue';
    return {
      state, phase, legacy,
      timeout_ms: policy.timeout_ms,
      timeout_reason: policy.timeout_reason,
      deadline_at: new Date(deadline).toISOString(),
      reconciliation_deadline_at: new Date(effectiveDeadline).toISOString(),
      termination_confirmed: false
    };
  } catch (error) {
    return inspect(error.message);
  }
}
