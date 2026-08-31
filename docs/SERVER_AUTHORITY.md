# Server authority

Normal gameplay uses the authenticated `POST /rpc/gameSave/applyCommand` procedure.
Its request is a closed-world envelope:

```json
{
  "requestId": "opaque-request-id",
  "expectedRevision": 3,
  "command": { "kind": "advance_week" }
}
```

The command is one of the typed UI actions: `start_run`, explicit `replace_run`,
`advance_week`, `apply_decision`, project assignment/cancellation, model design,
evaluation, product launch/resume, compute purchase, or team hire. Full state
blobs, seeds, RNG state, incident rolls, and unknown fields are not accepted.
A plain `start_run` requires `expectedRevision: 0` and no stored run. Replacing a
run requires the explicit `replace_run` command plus the stored revision; it is
only sent by the confirmed new-run flow and is the sole command allowed to
replace a terminal snapshot. Replacement keeps the run id, increments its
revision, and preserves the prior audit events.
The Worker loads
and validates the run owned by the authenticated session user, executes the
existing engine transition, and returns the authoritative serialized state and
new revision. `start_run` creates its seed with Web Crypto; `advance_week` calls
`advanceWeek(state)` without roll options.

`(userId, requestId)` is unique in `command_requests`. A request is reserved
before execution and completed with the serialized response and revision. A
repeat completed request returns that stored response and does not execute the
engine again. Pending reservations older than five minutes are reclaimed with
an id-and-user conditional delete; all final writes are fenced to the current
reservation id and lease age, so a timed-out worker cannot commit afterward.
The D1 batch runs in this order and must return exactly one row at each step:
(snapshot insert/update, event insert, idempotency completion). The completion
also requires an event with the matching run id, revision, and request id. This
keeps snapshot, event, and ledger revision consistency fail-closed. Event rows
never contain full snapshots.

The old full-state upsert procedure and its browser callers are removed. This
is intentionally greenfield: migration `0001_server_authority` resets the old
`run_events` shape and adds the request ledger. Apply the fresh database
migrations/reset any pre-launch database before deploying; legacy client-owned
runs are not supported.
