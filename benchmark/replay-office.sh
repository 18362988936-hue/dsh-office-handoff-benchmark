#!/usr/bin/env bash
set -euo pipefail
bench="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
upstream="$(cd "${1:?Usage: replay-office.sh /path/to/prepared-pinned-upstream}" && pwd)"
cd "$upstream"
expected=4b399c39a6d1479cd84ca591b4d7c88e24d38a96
[[ "$(git rev-parse HEAD)" == "$expected" ]] || { echo 'Invalid upstream commit' >&2; exit 2; }
dest="$upstream/snapshots/sdk/office-handoff-private.snapshot.ts"
[[ ! -e "$dest" ]] || { echo "Temporary test file already exists: $dest" >&2; exit 2; }
scratch="$(mktemp -d)"
trap 'rm -f "$dest"; rmdir "$scratch"' EXIT
cp "$bench/office-replay.snapshot.ts" "$dest"
env -i PATH="$PATH" HOME="$scratch" NO_COLOR=1 CI=1 DSH_EXAMPLE_MODE=src DSH_SNAPSHOT=replay \
  OFFICE_BENCHMARK="$bench" DSH_SNAPSHOT_MAX_CONCURRENCY=1 DSH_SNAPSHOT_MAX_WORKERS=1 \
  pnpm run test:snapshot snapshots/sdk/office-handoff-private.snapshot.ts
