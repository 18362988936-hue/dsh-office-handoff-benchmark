# Unknown tool outcome: recovery receipt versus delivery

| Evidence | Actual result |
| --- | --- |
| Pinned authored snapshot | Contains one `TOOL_OUTCOME_UNKNOWN` receipt for `unknown-outcome-call`, after a recorded call without a durable result. |
| Authored headless runtime test | The normalized persisted-session comparison and safety-text assertions completed. The overall Vitest run **failed** at the separate empty-stderr assertion: this source-only checkout was missing 10 built Typert `lib/typert.host.js` modules. Therefore no passing upstream test is claimed. |
| Independent offline office calibration | With that exact same tagged receipt attached to two synthetic workspaces, the real office scorer accepted the correct preseeded files and rejected absent files. Both input digests passed in both arms. The scorer did not change file names or contents in either arm. |

The upstream receipt comes from the authored **seeded** recovery case, not a real crash of our office benchmark. File states were imposed by the calibration; the pair did not run DSH, reconcile or retry a tool, or measure duplicate dispatch. This does not identify a runtime defect or establish live model behavior.

## Reproduce

With the prepared official DSH checkout from [UPSTREAM-REPLAY.md](UPSTREAM-REPLAY.md), run from the benchmark project's root:

```bash
python3 benchmark/unknown_outcome.py /path/to/pinned-deepseek-harness
python3 -m unittest -q
```

Separately, from the prepared upstream checkout (this source-only run produced the warnings above):

```bash
isolated_home="$(mktemp -d)"
env -i PATH="$PATH" HOME="$isolated_home" CI=1 NO_COLOR=1 \
  DSH_EXAMPLE_MODE=src DSH_SNAPSHOT=replay \
  pnpm run test:expected apps/cli/tests/profiles/headless/tests/semantic-checkpoint.expected.e2e.ts
```

A later crash-test integration needs an observable barrier after call persistence and before result persistence, evidence the first host actually exited and a different host recovered the same session, independent checks of final content for both landed and not-landed arms, and a tool-dispatch or write counter for any claim about duplicate writes. Keep this separate from the clean-restart suite.

Sources: [pinned expected receipt](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/apps/cli/tests/profiles/headless/tests/expected/semantic-checkpoint/session.expected.jsonl#L7-L8), [pinned checkpoint policy](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/packages/session/session-checkpoint-policy/README.md).
