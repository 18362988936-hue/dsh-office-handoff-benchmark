# Upstream keyless SDK smoke, 2026-11-23

**Result:** The unmodified official `session-resume` and `multi-turn` fixtures passed through the real DSH `sdk` profile (2 passed, 45 skipped, 9.26 s). This used the source launcher and a deterministic replay in place of the model provider. It did not call a live model, run the separate office benchmark, exercise an active Goal, or simulate a mid-turn crash. The upstream transition changes its model route and requests a read-only override; do not copy either change into the matched office comparison.

- DSH: `dsh-v0.2.3-alpha.2`, commit `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`
- Host: Linux x64 glibc, Node 24.22.3, pnpm 11.25.0 (available; repository pin 11.28.5), Vitest 4.1.11
- Route: shipped SDK profile, `DSH_EXAMPLE_MODE=src`, keyless `DSH_SNAPSHOT=replay`, fresh HOME; no credentials passed or loaded, no source edits
- Normal multi-turn fixture: passed in 2.728 s
- Authored clean restart fixture: passed in 4.389 s; upstream driver explicitly rejects an unknown ID and accepts the same saved ID after closing and restarting the host.

## Reproduce

Use a fresh temp directory and public sources only:

```bash
tmp="$(mktemp -d)"
git clone --depth 1 --branch dsh-v0.2.3-alpha.2 \
  https://github.com/deepseek-ai/deepseek-harness.git "$tmp/upstream"
(
  cd "$tmp/upstream"
  test "$(git rev-parse HEAD)" = 4b399c39a6d1479cd84ca591b4d7c88e24d38a96
  CI=1 pnpm install --frozen-lockfile --ignore-scripts --store-dir "$tmp/store"
)
mkdir -p "$tmp/addon" "$tmp/home"
(
  cd "$tmp/addon"
  npm --cache="$tmp/npm-cache" --fetch-retries=0 --fetch-timeout=10000 \
    pack --ignore-scripts @deepseek-ai/node-addon-system-linux-x64@0.1.2
)
(
  cd "$tmp/upstream/native/system/packages/linux-x64"
  tar --strip-components=1 -xzf \
    "$tmp/addon/deepseek-ai-node-addon-system-linux-x64-0.1.2.tgz" \
    package/bin/glibc/system.node
  printf '%s  %s\n' 54a9c25c05186c17520f6b7a5ced5f005752c08044c3eb76524cd517287600bc \
    bin/glibc/system.node | sha256sum -c
)
(
  cd "$tmp/upstream"
  env -i PATH="$PATH" HOME="$tmp/home" CI=1 NO_COLOR=1 DSH_EXAMPLE_MODE=src \
    DSH_SNAPSHOT=replay DSH_SNAPSHOT_MAX_CONCURRENCY=1 DSH_SNAPSHOT_MAX_WORKERS=1 \
    pnpm run test:snapshot snapshots/sdk/sdk.snapshot.ts \
    -t 'replays (multi-turn|session-resume) through dsh --profile sdk'
)
```

The glibc prebuilt is specific to this host. Alternatively use the official host-native build with matching Node-API headers and compiler: `pnpm run build:native-system`. Before adding the official prebuilt, both controls failed in the same source launcher: the ordinary fixture had zero durable logs and restart returned `session "fixture-root-session" not found`. An isolated fixture directory contained the lock and projection cache but no durable session log. The persistence package documents its POSIX native lock prerequisite; do not attribute the initial environment failure to DSH recovery.

Sources: [restart driver](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/snapshots/sdk/sdk.snapshot.ts#L979-L988), [source versus built launcher](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/packages/test-support/loader-smoke/README.md), [POSIX persistence prerequisite](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/packages/session/session-persistence-jsonl/README.md).
