import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

const repo = resolve(process.env.OFFICE_BENCHMARK ?? '')
const protocol = await readFile(join(repo, 'PROTOCOL.md'), 'utf8')
const prompts = [...protocol.matchAll(/^> (.+)$/gm)].map(match => match[1]!)
if (prompts.length !== 2) throw new Error('expected two prompts in PROTOCOL.md')

const text = (value: string) => ({ kind: 'chunks', chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: value },
  { type: 'block-end', index: 0, block: { type: 'text', text: value } },
  { type: 'finish', reason: { kind: 'stop' } },
] })
const bash = (command: string, id: string) => {
  const args = JSON.stringify({ command, description: 'Run a synthetic office fixture step' })
  return { kind: 'chunks', chunks: [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: args },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'bash', arguments: args } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ] }
}
const first = [
  bash('cat input/orders-v1.csv input/orders-v2.csv', 'office-read'),
  text('I reviewed both order sources. I will wait for your next message before writing the handoff.'),
]
// Values come from phase-one user-message text as rendered in the second request, not from the oracle.
// The regexes deliberately admit only a known local filename and a date made of digits and hyphens.
const command = [
  "python3 - '{{fromRequest:Use (input/orders-v2[.]csv)}}' '{{fromRequest:The as-of date is ([0-9]{4}-[0-9]{2}-[0-9]{2}) inclusive}}' <<'PY'",
  'import csv, hashlib, pathlib, sys',
  'source, cutoff = sys.argv[1:]',
  'totals = {}',
  "with open(source, newline='', encoding='utf-8') as f:",
  '    for row in csv.DictReader(f):',
  "        if row['order_date'] <= cutoff:",
  "            channel = row['channel']",
  "            totals[channel] = totals.get(channel, 0) + int(row['amount_cents'])",
  "with open('totals.csv', 'w', newline='', encoding='utf-8') as f:",
  "    writer = csv.writer(f, lineterminator=chr(10))",
  "    writer.writerow(['channel', 'total_cents'])",
  '    writer.writerows(sorted(totals.items()))',
  'digest = hashlib.sha256(pathlib.Path(source).read_bytes()).hexdigest()',
  "pathlib.Path('handoff.md').write_text(f'as_of: {cutoff}\\nsource: {source}\\nsource_sha256: {digest}\\n', encoding='utf-8')",
  'PY',
].join('\n')
const second = (missing: boolean) => [
  ...(missing ? [] : [bash(command, 'office-write')]),
  text('I finished the handoff and wrote totals.csv and handoff.md.'),
]

it.each(['uninterrupted', 'exact-id-restart', 'completion-without-files'] as const)('%s', async arm => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-office-'))
  const workspace = join(root, 'workspace')
  const dshHome = join(root, 'dsh-home')
  const home = join(root, 'home')
  const script = join(root, 'replay.json')
  const patches = ['cordis.yml', 'cordis.snapshot.yml'].map(f => resolve('snapshots/sdk/bash-tool', f))
  const host = () => new DeepSeekHarness({
    profile: 'sdk', patches, cwd: workspace, processCwd: workspace, dshHome,
    provider: 'deepseek-official', model: 'deepseek-v4-flash',
    env: {
      PATH: process.env.PATH, HOME: home, TZ: 'UTC',
      DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_FILE: script, DSH_SNAPSHOT_OVERRIDE: script,
      DSH_AGENTS_HOME: join(root, 'agents'), DSH_TELEMETRY_DISABLED: '1',
    },
    initializeTimeoutMs: 30_000, requestTimeoutMs: 40_000,
  })
  const restart = arm === 'exact-id-restart'
  const missing = arm === 'completion-without-files'
  let harness: DeepSeekHarness | undefined
  try {
    await mkdir(home)
    execFileSync('python3', [join(repo, 'office.py'), 'stage', workspace])
    const inputs = ['orders-v1.csv', 'orders-v2.csv'].map(f => join(workspace, 'input', f))
    const inputBytes = await Promise.all(inputs.map(f => readFile(f)))
    await writeFile(script, JSON.stringify(restart ? first : [...first, ...second(missing)]))
    harness = host()
    let session = harness.session()
    const one = await session.run(prompts[0]!, { timeZone: 'UTC' })
    expect(one.finishReason).toBe('completed')
    expect(one.finalResponse).toContain('wait')
    for (const f of ['totals.csv', 'handoff.md']) expect(existsSync(join(workspace, f))).toBe(false)

    if (restart) {
      await harness.close()
      await writeFile(script, JSON.stringify(second(false))) // adapter cursor is per process
      harness = host()
      session = await harness.resumeSession(one.sessionId)
      expect(session.id).toBe(one.sessionId)
    }
    const two = await session.run(prompts[1]!, { timeZone: 'UTC' })
    expect(two.sessionId).toBe(one.sessionId)
    expect(two.finishReason).toBe('completed')
    expect(two.finalResponse).toContain('finished the handoff')
    await harness.close()
    harness = undefined
    expect(await Promise.all(inputs.map(f => readFile(f)))).toEqual(inputBytes)
    const judge = spawnSync('python3', [join(repo, 'office.py'), 'score', workspace], { encoding: 'utf8' })
    console.log(JSON.stringify({
      arm, mode: 'scripted-provider-replay', sameSession: two.sessionId === one.sessionId,
      phase1: one.finishReason, phase2: two.finishReason, goalState: 'not-applicable',
      judgeExit: judge.status, judge: judge.stdout.trim(),
    }))
    expect(judge.status, judge.stderr || judge.stdout).toBe(missing ? 1 : 0)
  } finally {
    await harness?.close()
    await rm(root, { recursive: true, force: true })
  }
}, 110_000)
