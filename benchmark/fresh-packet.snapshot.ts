import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

const repo = resolve(process.env.OFFICE_BENCHMARK ?? '')

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

const receiverIds = new Set<string>()

it.each(['matching-revision', 'prior-revision'] as const)('%s', async arm => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-fresh-packet-'))
  const cwd = join(root, 'packet')
  const home = join(root, 'home')
  const script = join(root, 'replay.json')
  const revision = arm === 'matching-revision' ? 2 : 1
  const prompt = 'Review only the staged packet. Required current source: input/orders-v2.csv. Check handoff.md declares this version. Report disposition without modifying any files.'
  let host: DeepSeekHarness | undefined
  try {
    await mkdir(home)
    execFileSync('python3', [join(repo, 'office.py'), 'stage', cwd])
    const digest = createHash('sha256').update(await readFile(join(cwd, 'input', `orders-v${revision}.csv`))).digest('hex')
    await writeFile(join(cwd, 'totals.csv'), 'channel,total_cents\ndirect,1848\npartner,' + (revision === 2 ? '2725' : '2675') + '\n')
    await writeFile(join(cwd, 'handoff.md'), 'as_of: 2026-11-22\nsource: input/orders-v' + revision + '.csv\nsource_sha256: ' + digest + '\n')
    const paths = ['totals.csv', 'handoff.md', 'input/orders-v1.csv', 'input/orders-v2.csv']
    const bytes = async () => ({
      entries: (await readdir(cwd)).sort(),
      inputEntries: (await readdir(join(cwd, 'input'))).sort(),
      bytes: await Promise.all(paths.map(p => readFile(join(cwd, p)))),
    })
    const before = await bytes()
    const command = "if grep -Fxq 'source: {{fromRequest:Required current source: (input/orders-v2[.]csv)}}' handoff.md; then echo MATCHING_REVISION; else echo STALE_REVISION; fi"
    await writeFile(script, JSON.stringify([
      bash(command, 'verify-staged-revision'),
      text('Revision check: {{fromRequest:(MATCHING_REVISION|STALE_REVISION)}}'),
    ]))
    host = new DeepSeekHarness({
      profile: 'sdk', patches: ['cordis.yml', 'cordis.snapshot.yml'].map(f => resolve('snapshots/sdk/bash-tool', f)),
      cwd, processCwd: cwd, dshHome: join(root, 'new-dsh-home'),
      provider: 'deepseek-official', model: 'deepseek-v4-flash',
      env: { PATH: process.env.PATH, HOME: home, TZ: 'UTC', DSH_SNAPSHOT: 'replay',
        DSH_SNAPSHOT_FILE: script, DSH_SNAPSHOT_OVERRIDE: script,
        DSH_AGENTS_HOME: join(root, 'agents'), DSH_TELEMETRY_DISABLED: '1' },
      initializeTimeoutMs: 30_000, requestTimeoutMs: 40_000,
    })
    expect(existsSync(join(root, 'new-dsh-home'))).toBe(false)
    const result = await host.session().run(prompt, { timeZone: 'UTC' })
    expect(result.finishReason).toBe('completed')
    expect(result.sessionId).toBeTruthy()
    expect(receiverIds.has(result.sessionId)).toBe(false)
    receiverIds.add(result.sessionId)
    expect(result.finalResponse.trim()).toBe('Revision check: ' + (revision === 2 ? 'MATCHING_REVISION' : 'STALE_REVISION'))
    await host.close()
    host = undefined
    expect(await bytes()).toEqual(before)
    const judge = spawnSync('python3', [join(repo, 'office.py'), 'score', cwd], { encoding: 'utf8' })
    expect(judge.status, judge.stderr || judge.stdout).toBe(revision === 2 ? 0 : 1)
    console.log(JSON.stringify({ arm, mode: 'scripted-fresh-session', terminal: result.finishReason, receiver: result.finalResponse.trim(), judge: JSON.parse(judge.stdout) }))
  } finally {
    await host?.close()
    await rm(root, { recursive: true, force: true })
  }
}, 110_000)
