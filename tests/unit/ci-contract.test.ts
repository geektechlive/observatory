import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Contract tests for the CI configuration.
 *
 * These exist for the same reason src/lib/health.ts gives every data source a
 * content contract: a workflow can drift out of sync with package.json and
 * still look fine on inspection, failing only on a runner. Both assertions
 * below were red when this file was written — the pnpm setup action had no
 * version to resolve, and ci.yml invoked a script that did not exist.
 */

const ROOT = join(__dirname, '..', '..')
const WORKFLOW_DIR = join(ROOT, '.github', 'workflows')

interface PackageJson {
  packageManager?: string
  scripts?: Record<string, string>
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as PackageJson

/** Subcommands built into pnpm itself, which never resolve to a package script. */
const PNPM_BUILTINS = new Set([
  'add',
  'audit',
  'dedupe',
  'dlx',
  'exec',
  'install',
  'licenses',
  'link',
  'list',
  'outdated',
  'pack',
  'patch',
  'prune',
  'publish',
  'remove',
  'run',
  'store',
  'update',
  'why',
])

const workflowFiles = readdirSync(WORKFLOW_DIR).filter(
  (f) => f.endsWith('.yml') || f.endsWith('.yaml'),
)

/** Every `pnpm <word>` invocation in a workflow `run:` step, with its source file. */
function pnpmInvocations(): { file: string; script: string }[] {
  const found: { file: string; script: string }[] = []

  for (const file of workflowFiles) {
    const body = readFileSync(join(WORKFLOW_DIR, file), 'utf8')

    // `run:` steps may be inline or a block scalar, so scan every line rather
    // than parsing YAML — a dependency-free regex is sufficient here.
    for (const line of body.split('\n')) {
      const match = /(?:^|\s|&&|\|\||;)pnpm\s+([\w:.-]+)/.exec(line)
      if (!match) continue

      const script = match[1]
      if (!script || script.startsWith('-')) continue
      if (PNPM_BUILTINS.has(script)) continue

      found.push({ file, script })
    }
  }

  return found
}

describe('local verify gate', () => {
  // There is no CI (#33): `pnpm verify` is the only gate before a merge to main,
  // so it must run every check CI used to run. Dropping one here drops it entirely.
  // test:coverage, not test:unit: vitest.config.ts enforces coverage thresholds.
  // #224: the whole gate runs inside the machine-wide test lock, so two worktrees'
  // gates never overlap; the checks themselves live in verify:gate.
  it('runs the gate inside the test lock', () => {
    expect(pkg.scripts?.verify).toBe('node scripts/test-lock.mjs pnpm verify:gate')
  })

  it.each(['test:unit', 'test:coverage', 'test:e2e'])('%s runs inside the test lock', (name) => {
    expect(pkg.scripts?.[name] ?? '').toMatch(/^node scripts\/test-lock\.mjs /)
  })

  it.each(['lint', 'typecheck', 'test:coverage', 'test:e2e', 'build', 'audit'])(
    'verify runs %s',
    (gate) => {
      const verify = pkg.scripts?.['verify:gate'] ?? ''
      expect(verify).toMatch(new RegExp(`pnpm (run )?${gate.replace(':', '\\:')}\\b`))
    },
  )

  it('checks the bundle budget after the build and before e2e (#46)', () => {
    // check-bundle reads dist/, so it must follow build; it runs before the slow e2e suite.
    const steps = (pkg.scripts?.['verify:gate'] ?? '').split('&&').map((s) => s.trim())
    const at = (name: string) => steps.findIndex((s) => s === `pnpm ${name}`)
    expect(at('check:bundle')).toBeGreaterThan(at('build'))
    expect(at('check:bundle')).toBeLessThan(at('test:e2e'))
    expect(pkg.scripts?.['check:bundle']).toBe('node scripts/check-bundle.mjs')
  })

  it('audits at the high level, so the accepted advisories in pnpm-workspace.yaml apply', () => {
    expect(pkg.scripts?.['verify:gate'] ?? '').toContain('pnpm audit --audit-level=high')
  })
})

describe('workflow contract', () => {
  it('pins the pnpm version in package.json', () => {
    // One pnpm version for every checkout and worktree (corepack reads this).
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+/)
  })

  it('finds workflow files to check', () => {
    expect(workflowFiles.length).toBeGreaterThan(0)
  })

  it('only invokes package scripts that exist', () => {
    const scripts = pkg.scripts ?? {}
    const missing = pnpmInvocations().filter(({ script }) => !(script in scripts))

    expect(
      missing.map(({ file, script }) => `${file}: pnpm ${script}`),
      'workflow steps reference package scripts that are not defined',
    ).toEqual([])
  })
})

describe('lint', () => {
  // 27 warnings sat on main unnoticed, so two new ones in #106 went unseen (#113).
  // Stylelint already fails on its findings; ESLint must too.
  it('fails on any ESLint warning', () => {
    expect(pkg.scripts?.['lint']).toMatch(/eslint \. --max-warnings 0/)
  })
})

describe('health alerting (#120)', () => {
  // check-health exits 0 with failures (the reporter is the alert), so the reporter's
  // own exit code is what keeps a broken alert path visible: it must fail the job.
  const workflow = readFileSync(join(WORKFLOW_DIR, 'data-refresh.yml'), 'utf8')

  it('lets a failing reporter fail its job', () => {
    expect(workflow).not.toMatch(/continue-on-error/)
    expect(workflow.match(/run: node scripts\/report-incidents\.mjs/g)).toHaveLength(2)
  })

  it('still runs the reporter after a crashed check', () => {
    expect(workflow.match(/if: always\(\) && steps\.check\.outcome != 'skipped'/g)).toHaveLength(2)
  })
})

describe('refresh job time (#128)', () => {
  // A job killed at timeout-minutes writes no incident report, so its failures go
  // unreported. The job's deadline, one fetch still running past it, and the time for
  // setup, KV writes and the reporter must fit inside the limit.
  const workflow = readFileSync(join(WORKFLOW_DIR, 'data-refresh.yml'), 'utf8')
  const refreshJob = workflow.slice(workflow.indexOf('  refresh:'), workflow.indexOf('  health:'))

  it('finishes inside the refresh job timeout, with margin', async () => {
    const minutes = Number(/timeout-minutes: (\d+)/.exec(refreshJob)?.[1])
    expect(minutes).toBeGreaterThan(0)
    // @ts-expect-error plain ESM script, no type declarations
    const job = (await import('../../scripts/refresh-data.mjs')) as Record<string, number>
    const worst =
      Number(job['JOB_DEADLINE_MS']) + Number(job['WORST_FETCH_MS']) + Number(job['RUN_MARGIN_MS'])
    expect(worst).toBeGreaterThan(0)
    expect(worst).toBeLessThanOrEqual(minutes * 60_000)
  })
})

describe('refresh job accounts (#101)', () => {
  // The Space-Track and DISCOSweb steps skip with a warning when their secrets are
  // absent, so a missing env line would go quiet rather than fail: pin it here.
  const workflow = readFileSync(join(WORKFLOW_DIR, 'data-refresh.yml'), 'utf8')
  const refreshJob = workflow.slice(workflow.indexOf('  refresh:'), workflow.indexOf('  health:'))

  it.each(['SPACETRACK_USER', 'SPACETRACK_PASS', 'DISCOSWEB_TOKEN'])(
    'passes %s from the repository secrets to the refresh step',
    (name) => {
      expect(refreshJob).toContain(`${name}: \${{ secrets.${name} }}`)
    },
  )
})

describe('Vite configs', () => {
  // Vite's future native config loader has no CommonJS globals; it warned on every
  // build and test run until #95.
  it.each(['vite.config.ts', 'vitest.config.ts'])(
    '%s uses import.meta.dirname, not __dirname',
    (file) => {
      expect(readFileSync(join(ROOT, file), 'utf8')).not.toMatch(/\b__dirname\b/)
    },
  )
})
