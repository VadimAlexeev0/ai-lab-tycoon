# Security & Robustness Audit Report  
**Repository:** `/opt/data/ai-lab-tycoon`  
**Commit audited:** `2130fe0ad7e4d8da7054f42ec2f55d44b1becebf`  
**Scope:** Read-only audit; no source changes made.

## Executive summary

The application currently uses a **client-authoritative save model**, not a server-authoritative game model.

The browser:

1. Creates the run with `startRun`.
2. Executes every game transition locally.
3. Controls the serialized `GameState`, RNG stream state, command log, incident fixtures, scores, resources, and terminal metadata.
4. Sends the complete state blob to the server.

The server validates that the blob is structurally plausible and atomically persists it, but it does **not** recompute the game, replay the command log, derive RNG state, or verify that the snapshot resulted from legal prior transitions.

Therefore:

- A malicious authenticated client can cheat its own run today.
- CAS protects against accidental/concurrent stale writes, but not deliberate rollback or replacement with a different valid snapshot.
- Cross-user IDOR was not found; all exposed CRUD operations are keyed by the authenticated session user.
- The most important deployment risks are missing explicit Better Auth secret binding, absent CSRF enforcement on RPC mutations, and lack of RPC body/rate limits.
- No unconditional remotely verified Critical finding was established because no live Worker was available. The missing/implicit auth-secret configuration is a **conditional Critical release blocker** if the deployed Worker does not receive a strong secret.

If saves are strictly private, single-player, and have no competitive or economic value, the current model may be acceptable as a “client-owned casual save.” It should not be described as tamper-resistant or authoritative. If leaderboards, rewards, achievements, rankings, or shared outcomes are added, server-side simulation/replay is required.

---

## 1. Current trust model

### Current architecture

| Component | Current authority |
|---|---|
| Better Auth session | Authoritative for user identity |
| `runs.userId` ownership | Server/database controlled |
| Game state | Client supplied |
| Game transitions | Client executed |
| Command log | Client supplied |
| RNG seed | Envelope and state seed are cross-checked |
| RNG streams | Only structurally validated; not recomputed |
| Incident rolls | Client may supply explicit values |
| Revision/CAS | Server controlled and atomic |
| `run_events` | Schema exists, but no application write path was found |
| Server engine replay | Not used by API |

The client start path is explicit: `startRun` runs in the browser and the resulting state is immediately persisted (`apps/web/src/game/components/start-run-form.tsx:79-86`). Normal commands are also executed locally and only then saved (`apps/web/src/game/game-state-context.tsx:390-402`).

The API imports the engine only for `assertGameState` and schema-version constants. `packages/api/src/routers/game-save.ts:72-105` performs JSON parsing, invariant validation, and envelope checks, but does not call `replayCommandLog`, `advanceWeek`, or any other transition.

The replay implementation exists (`packages/engine/src/replay.ts:44-84`), but current usage was found in the simulation CLI rather than the server (`apps/sim-cli/src/index.ts:187-193`).

### Required trust model

For deploy-safe authoritative saves:

1. Client submits a typed command, not a complete state snapshot.
2. Server loads the previous server state and expected revision.
3. Server validates the command against that state.
4. Server derives all results and RNG values itself.
5. Server appends the command/event and updates the snapshot atomically.
6. Server returns the new state and revision.
7. Client-side engine execution remains an optional prediction/rendering optimization only.

For Cloudflare Workers + D1, this can remain request-local and deterministic. It does not require a long-running process. The update and event append should use an atomic D1 batch/transaction pattern.

---

## 2. Findings

### Severity definitions

- **Critical:** compromise of authentication or meaningful cross-user/system integrity.
- **High:** direct integrity compromise, significant shared resource abuse, or deploy-blocking security gap.
- **Medium:** exploitable robustness/integrity issue with narrower impact.
- **Low:** defense-in-depth, product exposure, or limited operational concern.

| ID / rank | Evidence | Exploit scenario and impact | Recommendation |
|---|---|---|---|
| **C-01 — CRITICAL condition: Better Auth secret is not explicitly bound or fail-closed** | `apps/server/src/auth.ts:17-26` calls `betterAuth` without `secret`. `packages/infra/alchemy.run.ts:20-28` exposes only `DB` and `CORS_ORIGIN` to the Worker. Installed Better Auth code falls back to `BETTER_AUTH_SECRET`/`AUTH_SECRET`, and then a default if unavailable (`better-auth/dist/context/create-context.mjs:38-44,69-80`). | If the production Worker does not actually receive a strong secret, session encryption/signing can be predictable or shared. An attacker could forge or impersonate sessions, defeating all user-scoped save authorization. Better Auth may fail in some production configurations instead, but the deployment contract is not explicit from the repository. | Bind a Cloudflare secret explicitly, pass/use it in the Better Auth configuration, enforce minimum length/entropy, and fail closed when absent. Test the deployed Worker—not just local Node behavior. Rotate the secret with an intentional session invalidation procedure. |
| **H-01 — HIGH: Complete client-authoritative state allows direct cheating** | Client starts and mutates state locally (`start-run-form.tsx:79-86`; `game-state-context.tsx:390-402`). Server validates only the submitted snapshot (`game-save.ts:72-105`). No server replay call exists. | An authenticated client can intercept or construct a save with modified cash, insight, research, true scores, products, projects, rivals, or terminal state, provided it satisfies structural invariants. In-memory probes accepted `cash = 999999999` and a forged completed research node through the engine validation path. | Replace full-state PUT/upsert with server-validated commands and server-derived transitions. At minimum, server-replay the command log and compare the reconstructed state byte-for-byte or by canonical hash. Treat existing snapshots as untrusted during migration. |
| **H-02 — HIGH: RNG streams are not tied cryptographically or deterministically to the seed** | `createRngState` derives streams from the seed (`packages/engine/src/components/rng.ts:29-37`), but `assertRngState` only checks shape/ranges (`rng.ts:73-94`). The API checks only `state.rng.seed === input.seed` (`game-save.ts:85-89`). | A client can retain the legitimate seed while replacing all RNG stream states with another valid four-int32 state. A probe with all streams set to `[1,2,3,4]` passed validation. Future training, product, rival, funding, or incident outcomes can then be manipulated. | Never accept RNG stream state from the client. Reconstruct it from a server-owned seed and authoritative command/event history, or generate and persist server-side random outcomes. |
| **H-03 — HIGH: Client-selectable incident rolls are an explicit outcome-manipulation vector** | `AdvanceWeekOptions` accepts `incidentRolls` and `incidentRoll` (`packages/engine/src/advance-week.ts:18-21`). They are passed to every system and persisted into the command log (`advance-week.ts:108-150`). Replay also trusts those values (`packages/engine/src/replay.ts:165-174`). | A browser console caller can invoke `advanceWeek(state, { incidentRolls: [0, ...] })`, choose favorable outcomes, and save the result. A current probe accepted zero incident rolls and recorded them in `advance_week`. This is both a cheat path and a determinism break if the intended RNG source is the seed. | Remove client control of production incident rolls. Keep explicit-roll support in a test-only/local fixture API, or have the server issue the roll/result and include it in an authoritative event. |
| **H-04 — HIGH: CAS prevents races, not rollback or state rewriting** | The update uses atomic revision comparison (`packages/api/src/routers/game-save.ts:138-159`), but there is no comparison with the prior week/state/status. The only terminal mutation guard is a client/engine guard (`packages/engine/src/guards.ts:3-7`). | A user can read revision `N`, construct an older but structurally valid snapshot, and submit it with revision `N`. The CAS succeeds. A terminal save can also be replaced by a valid active snapshot because the API only checks that the incoming status matches the incoming state (`game-save.ts:90-97`), not that terminal state is immutable. | Enforce monotonic week/revision semantics, bind the command sequence to the stored head, reject terminal-to-active transitions, and use append-only commands/events. CAS should be treated as concurrency control, not anti-cheat or anti-rollback. |
| **H-05 — HIGH: No CSRF protection is installed for state-changing RPC routes** | CORS is configured at `apps/server/src/index.ts:20-28`, but `RPCHandler` has no CSRF/origin plugin (`index.ts:51-57`). Better Auth’s origin check applies to Better Auth endpoints, not automatically to `/rpc/*` (`auth.ts:22`; installed Better Auth origin middleware is separate). | A malicious same-site origin, or a deployment with weaker cookie attributes, could submit a credentialed save overwrite or delete request. CORS can prevent reading the response, but CORS is not request-side CSRF protection. Same-site sibling origins are particularly relevant with `SameSite=Lax`. | For every non-GET RPC request, validate `Origin` and/or `Sec-Fetch-Site`; reject missing/untrusted origins. Add a double-submit or session-bound CSRF token if needed. Add the token header to the CORS allow-list. |
| **H-06 — HIGH: RPC body/rate/resource controls are insufficient** | The save state is capped at 2,000,000 characters (`game-save.ts:20-28`), but no Hono request-body limit or oRPC `BodyLimitPlugin` is installed (`apps/server/src/index.ts:38-57`). There is no application RPC rate limiter. Better Auth’s own default limiter, where enabled, protects auth processing rather than game RPC. | An attacker can create anonymous sessions and repeatedly submit expensive state validation and D1 writes. Unknown top-level JSON fields can still inflate the raw request before Zod validation. Full snapshots amplify parsing, validation, and database write cost. | Add an early byte-level request limit before JSON parsing, plus per-IP and per-user limits using Cloudflare Rate Limiting or another edge-native mechanism. Add write quotas and backoff. Do not use D1 itself as a high-frequency rate-counter store. |
| **H-07 — HIGH: Command log and nested state have no semantic bounds** | `assertCommandLog` checks ordering and entry shape but has no maximum count (`packages/engine/src/invariants.ts:603-635`). JSON validation is recursive with no maximum depth (`packages/engine/src/validation.ts:185-248`). The state blob cap is the only broad bound. | A probe accepted 10,001 commands and a roughly 568 KB serialized state. A deep nested object caused a direct validation `RangeError: Maximum call stack size exceeded`. The API catch likely converts ordinary validator exceptions to 422, but the request still consumes parse/stack/CPU resources. | Set maximum command count, entity counts, array lengths, string lengths, and nesting depth. Reject before expensive invariant passes. Add fuzz/property tests for deep and wide JSON. |
| **M-01 — MEDIUM: `currentWeek` envelope is not cross-validated against `state.meta.week`** | The API accepts `currentWeek` (`game-save.ts:20-27`) but checks schema, seed, and status only (`game-save.ts:75-97`). It writes the unverified envelope value (`game-save.ts:145-148`). | A client can save state week 1 while the row says week 9,007,199,254,740,991, or otherwise create inconsistent metadata. The play screen displays the row field (`apps/web/src/routes/play.tsx:196-199`), while the engine uses `state.meta.week`. | Require `input.currentWeek === state.meta.week`; preferably remove duplicate metadata and derive it server-side. Add a reasonable maximum week. Also bind `state.meta.runId` to the database run ID or remove the duplicated identity. |
| **M-02 — MEDIUM: “Replace and start” is currently a save dead-end** | New-run creation calls `persistActiveRun(state)` without a revision (`start-run-form.tsx:79-86`). Existing-row updates default missing revision to `0` (`game-save.ts:138-141`), while created rows start at revision `1` (`game-save.ts:115-125`). | When a user confirms replacement of an existing run, the request reaches the update path with expected revision 0 and normally conflicts against revision 1 or higher. The form displays an error and does not replace the run. Concurrent first creates can also race at the unique index and surface as an unhandled database error rather than a clean conflict. | Add an explicit `replaceActiveRun` operation with expected revision, or delete/create atomically. Map unique-insert races to `CONFLICT`. Add an integration test for replacement. |
| **M-03 — MEDIUM: `run_events` is defined but not an actual audit/source-of-truth path** | `run_events` exists in the schema (`packages/db/src/schema/index.ts:150-165`), but no application insert/read path was found. | There is no append-only server evidence of what happened. A mutable client snapshot cannot be independently audited or reconstructed. Future Chronicle/reporting features may incorrectly assume the table is populated. | Make events append-only and write them in the same D1 transaction as the revision update. Define sequence, event hash/head, payload limits, and retention. |
| **M-04 — MEDIUM: Schema versioning is fail-closed but has no migration path** | The API requires the current version and rejects all other versions (`game-save.ts:75-83`). `GAME_STATE_SCHEMA_VERSION` is currently 1. | Any future state shape change will make old saves unloadable unless every client is upgraded simultaneously. A future client cannot safely save a newer version to this API. | Add explicit migration functions by version, migration tests, and a compatibility policy. Store the persisted version independently and reject unsupported versions with a recoverable UI state. |
| **M-05 — MEDIUM: Anonymous sessions are easy to multiply and cannot be recovered** | Anonymous auth is enabled and email/password is disabled (`apps/server/src/auth.ts:21-25`). Client bootstrap depends on the browser session cookie (`apps/web/src/utils/auth-client.ts:47-75`). | Clearing cookies, changing browsers, or losing the session loses access to the save. An attacker can also create many anonymous identities by rotating cookies/devices, increasing auth/session/D1 resource usage. | Add an optional account migration/recovery path, session/device quotas, and rate limits. Make the loss-of-anonymous-session behavior explicit in the product UX. |
| **M-06 — MEDIUM: Public API reference executes third-party CDN JavaScript on the API origin** | `OpenAPIReferencePlugin` is enabled in production (`apps/server/src/index.ts:38-43`). Its default Scalar script is an external CDN resource (installed plugin implementation `@orpc/openapi/.../plugins/index.mjs:23-35`). `/api-reference/*` uses optional session middleware, not required auth (`index.ts:35-36`). | A compromise of the external docs script would execute with the API origin’s browser privileges and could issue credentialed same-origin RPC requests. Public docs also enumerate protected save endpoints and schemas. | Disable docs in production, protect them, or serve them on a separate origin. If retained, self-host/pin the asset, apply CSP and SRI, and avoid allowing arbitrary docs-head/script configuration. |
| **M-07 — MEDIUM/LOW: No explicit application security-header policy** | The server sets CORS and logging but no CSP, HSTS, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, Referrer-Policy, or Permissions-Policy (`apps/server/src/index.ts:17-29`). No corresponding application header middleware was found for the web app. | The platform may add some headers, but the repository does not guarantee them. This increases exposure to clickjacking, framing, and script-injection impact, especially with public API docs and debug surfaces. | Add an explicit header policy at the Worker/website edge. Use a restrictive CSP, frame denial, HSTS on HTTPS, and `nosniff`. Verify actual deployed headers. |
| **L-01 — LOW: Debug/preview controls are production-accessible** | Search parameters expose debug controls (`apps/web/src/routes/game.tsx:42-54,215-284`). `DebugDrawer` is visible when `?debug=1` or localStorage `ailt-debug=1` (`debug-drawer.tsx:46-62`). | Any user can activate preview-only news, quarterly, lineage, notebook, AGI socket overrides, and rival-progress displays. Current controls appear UI-only and do not mutate the saved engine state, so this is not an authority bypass. | Gate debug features with `import.meta.env.DEV` or a server/feature flag. Keep URL parameters as presentation controls only. |
| **L-02 — LOW: Validation errors expose internal invariant text** | The API returns `cause.message` in 422 responses (`game-save.ts:98-104`) and logs complete errors (`apps/server/src/index.ts:45-56`). | Attackers can learn internal state/validation details. Interpolated user-controlled identifiers can also enlarge error responses/logs. No stack traces were observed in the oRPC error conversion path, which normally maps unknown errors to a generic 500. | Return stable, short public error codes/messages; retain detailed diagnostics only in redacted server logs. Truncate interpolated values. |
| **L-03 — LOW: Server-side field-length limits are incomplete** | The UI limits company name to 80 characters (`start-run-form.tsx:154-164`), but engine validation only requires a nonempty string (`packages/engine/src/components/company.ts:47-50`). Similar command/entity strings are generally nonempty rather than bounded. | A direct API client can place very large names/text values inside the 2 MB blob. React text rendering is escaped, so no confirmed stored-XSS path was found, but oversized text can cause layout, memory, and rendering problems. | Enforce per-field limits in shared server validators, not only browser controls. Canonicalize/truncate only where product semantics permit. |

---

## 3. Confirmed positive controls

### Authorization / IDOR

No cross-user IDOR was found in the exposed run CRUD:

- `getActiveRun` filters by `runs.userId` (`game-save.ts:48-53`).
- `upsertActiveRun` derives `userId` from the authenticated session and includes it in the update predicate (`game-save.ts:65-70,152-157`).
- `deleteActiveRun` deletes by authenticated `userId` (`game-save.ts:183-196`).
- The client cannot submit an owner ID.
- The database has a foreign key and one-run-per-user unique index (`packages/db/src/schema/index.ts:121-147`).

The exposed run ID is not used as a client-selected lookup key, which substantially reduces classic guessed-ID access.

### Authentication boundary

- `/rpc/*` resolves the Better Auth session through middleware (`apps/server/src/index.ts:34-36`; `session-middleware.ts:21-29,66-70`).
- Every game-save procedure uses `authedProcedure`, which rejects missing users (`packages/api/src/authed-procedure.ts:10-15`).
- Better Auth owns `/api/auth/*` and is mounted before the oRPC catch-all (`apps/server/src/index.ts:31-32`).
- Email/password is disabled, so conventional email-account enumeration is not part of the current product.

### CAS

The update CAS is correctly atomic:

```text
UPDATE ... SET revision = revision + 1
WHERE id = ? AND user_id = ? AND revision = ?
RETURNING ...
```

This is implemented at `packages/api/src/routers/game-save.ts:138-159`.

The current client also has a useful conflict path: it fetches the stored winner and exposes a “Reload saved version” action (`apps/web/src/utils/orpc.ts:118-135`; `apps/web/src/routes/game.tsx:332-370`).

### XSS / browser surfaces

No confirmed user-controlled raw HTML or JavaScript execution sink was found in the audited application paths.

- Company names and error messages are rendered as React text (`apps/web/src/routes/play.tsx:187-199`; `apps/web/src/routes/game.tsx:347-352`).
- `ailt-debug` is checked for exact equality with `"1"`, not inserted into markup.
- Debug search values are parsed into bounded numbers (`apps/web/src/routes/game.tsx:702-730`).
- No saved-game data is placed into an arbitrary `href` or script source.
- Three.js/WebGL surfaces appear to use state for display/geometry rather than evaluation.

This does not remove the need for CSP and length limits.

---

## 4. API surface

oRPC has no custom route metadata in the application router. The installed oRPC default method is POST (`@orpc/contract/.../dist/index.mjs:269-280`).

### RPC routes

| Endpoint | Method | Auth | Input |
|---|---:|---|---|
| `/rpc/healthCheck` | POST | Public | No input |
| `/rpc/gameSave/getActiveRun` | POST | Required | `undefined` |
| `/rpc/gameSave/upsertActiveRun` | POST | Required | Zod envelope plus parsed/validated state |
| `/rpc/gameSave/deleteActiveRun` | POST | Required | `undefined` |

### Upsert validation depth

The envelope validates:

- `seed`: integer, nonnegative
- `state`: string, 1–2,000,000 characters
- `currentWeek`: integer, nonnegative
- `status`: `active` or `terminal`
- `schemaVersion`: positive integer
- `revision`: optional nonnegative integer

The state then receives:

- JSON parsing
- plain-object/array checks
- JSON-compatible finite safe-integer checks
- exact component-key checks
- component invariants
- relationship/ownership checks
- command-log structural checks
- seed/schema/status cross-checks

This is substantially stronger than raw passthrough, but it validates **shape and invariants, not provenance or causality**.

Zod objects are not explicitly `.strict()`, but the default behavior strips unknown envelope fields rather than passing them to the handler. The major remaining gaps are request-size-before-parse, nesting/count limits, and lack of server replay.

### OpenAPI/reference surface

The reference plugin is mounted at `/api-reference/*`:

- `/api-reference` — generated HTML docs
- `/api-reference/spec.json` — generated OpenAPI document
- `/api-reference/<procedure>` — OpenAPI-formatted procedure routes

The reference surface is not itself protected by `requireSessionMiddleware`; it can enumerate and document protected procedures. It should be disabled or isolated in production.

---

## 5. Robustness and QoL assessment

### Interrupted writes

Current behavior is partly safe:

- Local state is only advanced in React state after persistence succeeds (`game-state-context.tsx:397-403`).
- If the server committed but the browser lost the response, the next load should recover the server snapshot.
- If the request never reached the server, the local action is lost; there is no durable offline journal or pending command queue.
- There is no idempotency key, so retrying an ambiguous create can produce a conflict even if the first request actually committed.

### Concurrent tabs

CAS behavior is fundamentally correct:

- Only one update with a given revision succeeds.
- The loser receives `CONFLICT`.
- The client fetches the stored winner and offers an explicit reload/adopt action.

There is no automatic merge, which is appropriate for deterministic game state. The remaining issue is UX: the user must explicitly adopt the winner, and the conflict path should validate the fetched state before installing it.

### Retry dead-end status

The latest commit `985ef9e` fixed the previously identified retry dead ends for:

- anonymous-session bootstrap retry
- saved-run load retry

The current effects intentionally depend on retry counters (`game-state-context.tsx:250-277,294-337`), and the engine/web test suites pass.

However, the “replace existing run” flow remains broken as described in **M-02**.

### Schema migration

Current behavior intentionally fails closed on unsupported versions, which is safer than silently misinterpreting state. It is not migration-ready: there is no version dispatcher, migration chain, or recovery UX beyond rejection.

### Error boundaries

No clear application-level React error boundary or route-specific error component was found in the audited web source. Invalid initial saves are handled defensively by the loader, but unexpected rendering errors, malformed conflict records, or WebGL/runtime failures may still result in a poor failure screen.

---

## 6. Prioritized hardening plan

### P0 — Before treating saves as authoritative

1. **Make the Better Auth secret explicit**
   - Bind a Cloudflare Worker secret.
   - Fail deployment/startup if absent or weak.
   - Verify actual deployed session cookie behavior and session forgery resistance.
   - Rotate any potentially exposed or default-derived credential material.

2. **Add RPC CSRF/origin enforcement**
   - Reject state-changing requests with absent/untrusted `Origin`.
   - Add Fetch Metadata checks.
   - Add a CSRF token if browser cookie authentication remains the model.
   - Keep CORS exact-origin and credentialed; do not use CORS as the sole defense.

3. **Add request and abuse limits**
   - Enforce raw request byte limits before JSON parsing.
   - Add per-IP and per-session RPC rate limits using Cloudflare-native controls.
   - Add per-user write quotas and backoff.
   - Cap JSON depth, command count, arrays, entities, and all free-form strings.

4. **Fix metadata consistency**
   - Require `currentWeek === state.meta.week`.
   - Bind or remove the duplicated `runId`.
   - Enforce a practical maximum week.
   - Reject terminal-to-active rewrites.
   - Map unique-insert races to a defined conflict response.

### P1 — Replace client authority

1. Change the API from `upsertActiveRun(fullState)` to something like:

```text
applyCommand({
  command,
  expectedRevision,
  requestId
})
```

2. On the Worker:
   - Load the current run by authenticated user.
   - Verify revision and command sequence.
   - Validate the command against stored state.
   - Derive RNG/results server-side.
   - Apply the engine transition.
   - Append command/facts to `run_events`.
   - Update snapshot, revision, and command head atomically in D1.
   - Return the authoritative snapshot.

3. Remove production acceptance of:
   - client-supplied RNG streams
   - client-supplied incident rolls
   - arbitrary full snapshots
   - arbitrary terminal status changes

4. Add a request-idempotency table or unique command/request key so retries after a lost response are safe.

5. Treat all existing snapshots as untrusted during migration. Either replay/verify them, quarantine unverifiable runs, or explicitly mark them as legacy casual saves.

### P2 — Operational and client robustness

1. Add explicit production security headers and CSP.
2. Disable or isolate `/api-reference` in production; self-host/pin documentation assets if retained.
3. Gate debug controls behind a build-time or server-side flag.
4. Add a real atomic “replace run” operation.
5. Add a global error boundary and malformed-save recovery screen.
6. Validate conflict records before adopting them.
7. Add save-size, validation-duration, conflict-rate, and failure telemetry without logging full state blobs.
8. Add anonymous-session recovery/account migration if retaining persistent saves.

### P3 — Verification

Add Worker-level integration tests covering:

- missing/weak Better Auth secret
- forged session rejection
- cross-user get/update/delete attempts
- CSRF from allowed, disallowed, same-site, and missing-origin requests
- CORS behavior with credentials
- raw-body and JSON-depth limits
- CAS races
- rollback and terminal rewrite rejection
- deterministic server replay
- incident/RNG manipulation
- idempotent retry after committed-but-lost response
- D1 unique-insert race
- schema migration and legacy-save recovery

---

## 7. Quick wins vs. deep work

### Quick wins

- Explicit secret binding and fail-closed startup.
- Origin/Fetch Metadata CSRF middleware for `/rpc`.
- Raw body cap and RPC rate limiting.
- `currentWeek` equality check.
- Server-side string/entity/command/depth limits.
- Terminal immutability and monotonic-week checks.
- Fix “Replace and start” using expected revision.
- Disable public API docs or move them off the API origin.
- Add CSP/security headers.
- Gate production debug controls.
- Add API/server integration tests.

### Deep work

- Server-authoritative command API.
- Server-derived RNG and incident outcomes.
- Append-only command/event history.
- D1 transactional snapshot + event updates.
- Replay/hash verification and migration of existing saves.
- Idempotency protocol.
- Offline/pending-command UX and stronger multi-tab coordination.
- Anonymous account recovery and quota design.

---

## Verification performed

- Audited the server, API, database schema, engine, client save lifecycle, authentication bootstrap, debug controls, UI rendering paths, and deployment configuration.
- Ran engine tests: **64 suites, 280 tests passed**.
- Ran web tests: **69 suites, 84 tests passed**. The run emitted two jsdom warnings that `HTMLCanvasElement.getContext()` is not implemented; tests still passed.
- Ran read-only engine probes confirming:
  - forged high cash and research state can pass structural validation;
  - maximum safe week values can pass;
  - arbitrary valid RNG stream states can pass;
  - explicit incident rolls are accepted and persisted in commands;
  - 10,001 command entries can pass validation;
  - deeply nested input can trigger a validator `RangeError`.
- No live API/Worker was available, so cookie headers, deployed CORS behavior, D1 limits, and remote exploitability were not HTTP-tested.
- **No repository files were created or modified.**
- Git status showed the audited branch at the stated commit with only a pre-existing untracked archive: `ai-lab-tycoon-ultimate-gold.zip`.
- No secrets, tokens, passwords, or credential values are reproduced here; any sensitive material observed during inspection is intentionally omitted as `[REDACTED]`.