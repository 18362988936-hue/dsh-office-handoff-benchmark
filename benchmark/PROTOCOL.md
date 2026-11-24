# DSH office handoff benchmark

**Question:** After an ordinary DSH turn or a persisted session resume, does the actual handoff satisfy the user's original task? This is an external benchmark, not a completion gate or a claim of an upstream bug. All input is synthetic.

## Prepare

From the project directory, for each run:

```sh
python3 benchmark/office.py stage /path/to/new/agent-workspace
```

The staged workspace contains source CSVs only; the experiment operator holds the prompt and frozen oracle outside the agent's workspace. Configure the runtime so the agent cannot access the scorer, protocol, or oracle (isolated filesystem or OS account; a different cwd alone is not isolation). No program should copy expected results into the agent runtime. Use a different new workspace per trial and a persistent runtime home across the two phases of each trial.

## Give these exact messages

**Phase 1**

> Prepare a two-file order handoff. Use input/orders-v2.csv, not orders-v1.csv. The as-of date is 2026-11-22 inclusive. Read the inputs and plan how you will do it. Do not create or change files yet. Wait for my next message. When I ask you to deliver, write totals.csv in the workspace root, with UTF-8 header channel,total_cents and one row per channel, summing integer amount_cents for included dates. Write handoff.md in the workspace root as exactly three lines: as_of: YYYY-MM-DD, source: input/<filename>, then source_sha256: <lowercase SHA-256 of the raw source bytes>. Each field goes on its own line. Do not change the source files.

**Phase 2**

> Please finish the handoff now, following the original instructions.

## Matched runtime arms

- **Uninterrupted:** Create a session, send phase 1 and await its terminal event. Verify no outputs already exist. Send phase 2 in the same live session; await its terminal event.
- **Resumed:** Create a fresh session in a new equivalent workspace. Send phase 1 and await its terminal event. Verify no outputs already exist. Save the exact persisted session ID. Shut down the SDK client and harness process normally; restart with the same runtime home and workspace, resume the exact ID without resending phase 1, then send phase 2. Verify restored ID equals saved ID. This tests clean reopening, not crash recovery.
- Pin DSH release, model, model settings, permissions, plugins, prompt bytes and baseline input bytes across arms. First run vanilla DSH; any compatibility comparison is a separate cohort. Record each run's version, arm, repetition, stop point, saved and restored ID (redact/share only when appropriate), finish reason, Goal state when applicable, tool/runtime errors, and independent judge result. Do not silently discard truncations, authentication failures, or failed resumes. Mark whether the runtime ran at all; never substitute a fixture verdict for a live run.
- Repeat matched trials and report per-arm attempted / completed / accepted counts and failure breakdown. A single matching pass proves wiring only; it doesn't estimate failure rates. A completed turn is not an assertion of Goal completion or valid delivery.

## Score

```sh
python3 benchmark/office.py score /path/to/agent-workspace
```

The judge opens the actual named files and checks CSV contents, exact note fields and frozen source bytes; no model-written manifest or success claim is read. Correct results do not prove the internal reasoning path or the order in which files were read. A missing file, duplicate or incorrect totals, stale source reference, changed source bytes or changed as-of date fails. Exit 0 = accepted, 1 = rejected, 2 = harness/argument error. A malformed or unreadable deliverable fails acceptance.

`python3 -m unittest -v` injects offline controls to calibrate the scorer (including a wrong result with a correct-looking note). Injected cases are not observed DSH failures.

## Runtime controls

The upstream [clean-restart snapshot](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/snapshots/sdk/session-resume/snapshot.yml) with the pinned SDK is a keyless replay control. It is not our office trial: it deliberately changes the model and uses a read-only override. Keep model settings and permissions constant between the office arms. For the ordinary two-turn trial, send phase 2 following exact-ID restoration and record Goal state as not applicable. Run native Goal separately; restoring the session alone does not resume the Goal, so re-arm intentionally via the [documented Goal command](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/packages/sdk/server/README.md) and measure a durable Goal terminal separately from the artifact verdict.

Keep replay execution, model-generated outputs, and offline injected negatives as separate evidence categories. Test an in-flight interruption only after the clean-restart path works; never generalize clean close/reopen evidence to crash recovery.
