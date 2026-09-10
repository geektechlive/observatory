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

describe('CI configuration contract', () => {
  it('pins the pnpm version in package.json so pnpm/action-setup can resolve it', () => {
    // Without this, pnpm/action-setup fails with "No pnpm version is specified"
    // before a single dependency installs — every job, every branch.
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
