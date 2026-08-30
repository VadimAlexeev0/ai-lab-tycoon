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

The command is one of the typed UI actions: `start_run`, `advance_week`,
`apply_decision`, project assignment/cancellation, model design, evaluation,
product launch/resume, compute purchase, or team hire. Full state blobs, seeds,
RNG state, incident rolls, and unknown fields are not accepted. The Worker loads
and validates the run owned by the authenticated session user, executes the
existing engine transition, and returns the authoritative serialized state and
new revision. `start_run` creates its seed with Web Crypto; `advance_week` calls
`advanceWeek(state)` without roll options.

`(userId, requestId)` is unique in `command_requests`. A request is reserved
before execution and completed with the serialized response and revision. A
repeat completed request returns that stored response and does not execute the
engine again. The snapshot update uses the expected-revision CAS. Each accepted
command appends one `run_events` row containing the run id, revision, request
id, command kind, bounded command JSON, and timestamp; event rows never contain
full snapshots.

The old full-state upsert procedure and its browser callers are removed. This
is intentionally greenfield: migration `0001_server_authority` resets the old
`run_events` shape and adds the request ledger. Apply the fresh database
migrations/reset any pre-launch database before deploying; legacy client-owned
runs are not supported.
