# Office handoff through the real SDK runtime (scripted provider)

Tested against official release `dsh-v0.2.3-alpha.2`, commit `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`. Uses DSH's shipped `sdk` profile via the source launcher, with the official replay adapter replacing live model calls. Linux x64 glibc and the verified native system addon from [UPSTREAM-REPLAY.md](UPSTREAM-REPLAY.md). Office data are entirely synthetic.

| Scenario | SDK phase 1 / phase 2 | Session ID | Independent file verdict |
|---|---|---|---|
| Uninterrupted | completed / completed | unchanged | Accepted |
| Close host, reopen exact ID, continue | completed / completed | unchanged | Accepted |
| Injected claim of delivery without writing either file | completed / completed | unchanged | Rejected |

Vitest: **3 passed**, 11.02 s total on the recorded run. See [structured case results](OFFICE-REPLAY-RESULT.json). Each scenario uses an ordinary two-turn exchange (Goal state not applicable). The fresh and restart cases write the output solely through the actual DSH bash tool; on phase two the replay adapter reads the required v2 input path and cutoff from the restored **model request**, not the expected-output tree. The matcher admits only one fixed synthetic path and digit-only YYYY-MM-DD date. First-turn output is checked to be absent, and both inputs must remain byte-identical afterward. The caller invokes the Python scorer after closing DSH; the judge oracle is not copied into the agent workspace or supplied to the replay adapter. The negative control intentionally scripts an inaccurate success message and makes no phase-two write.

## Reproduce

Prepare a spare checkout (toolchain, pinned source, dependencies, and official native addon) using [UPSTREAM-REPLAY.md](UPSTREAM-REPLAY.md). Then run this from the project root:

```bash
./benchmark/replay-office.sh /absolute/path/to/prepared/pinned/upstream
```

The wrapper checks the exact commit. It stages a temporary test file in the checkout so upstream Vitest's source-alias config can load the SDK, uses a fresh HOME with no provider keys, and removes that file on exit. Existing official source is not modified. The driver uses only predetermined local commands and temporary workspace and DSH-home directories; it does not establish an OS-level barrier around the scorer. The live-model protocol requires additional filesystem isolation before reuse with model-generated commands.

## Interpretation

This tests SDK turn completion, prompt-context continuity across a **clean** exact-ID restart, actual tool side effects, and the separation of completion from independent artifact acceptance. It does not measure model output quality, true production incident frequency, native Goal behavior, security isolation, or recovery from a crash mid-turn. The rejected scenario is an intentionally injected control, not a DSH defect.
