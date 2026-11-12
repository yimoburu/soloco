# Pending founder STOP

The actual canonical incoming founder can use `company_owner pause` during a
typed pending handover. The existing HOST identity, matching managed startup
hook, current epoch, original transfer custody and handover identity checks
still apply. A pending-looking principal without the original handover, a
foreign or revoked outgoing caller, stale epoch or JSON actor is rejected.

Each new pause operation advances `pause_generation`, even when the company is
already paused. An exact operation replay remains idempotent. STOP preserves
pending status, the original handover deadline, spent/remaining calls, grants
and UNKNOWN reservations; it grants no work or activation authority. It remains
available after handover expiry because stopping does not renew that authority.

Pending STOP leaves the handover subject and its overrides unchanged. The new
control generation is a real source barrier, so prior private or qualified
read/reconstruction/review paths can remain Held until their separately
supported source transition. This change does not supply that transition,
ordinary readiness, native closure or company adoption.
