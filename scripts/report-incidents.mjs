#!/usr/bin/env node
// Turn a data-refresh job's incident-report.json into GitHub issues and Discord pings.
//
// Why: Discord alone left no history and no dedup. Every blip paged, nothing recorded
// how often a source flaked, and there was nowhere to gather data. Now each source
// (signature, e.g. `health:/api/eonet`) owns ONE issue, labelled `incident`:
//   - fails, no issue      -> open it            + Discord
//   - fails, issue closed  -> reopen + comment   + Discord
//   - fails, issue open    -> comment only (no ping: you already know)
//   - passes, issue open   -> comment + close    + Discord "recovered"
//   - warning, issue open  -> comment only (tolerated, not yet recovered)
// So an issue's comment log is that source's incident history (Chris's call, 2026-10-09).
//
// Usage: node scripts/report-incidents.mjs [report.json]
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY (owner/name), RUN_URL; DISCORD_* optional.
// The repo is public: bodies carry only the report's detail lines and the run link.

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { discordConfigured, HEADER, postDiscord } from './notify-discord.mjs'

const LABEL = 'incident'
const AREA_LABEL = 'infra'
const API = 'https://api.github.com'

export function issueTitle(signature) {
  return `[observatory] ${signature}`
}

const fence = (detail) => `\`\`\`\n${detail}\n\`\`\``

function openBody(entry, runUrl) {
  return [
    `Opened automatically by the \`data-refresh\` workflow: **${entry.signature}** failed.`,
    '',
    fence(entry.detail),
    '',
    `Run: ${runUrl}`,
    '',
    'This issue closes itself when the source passes again and reopens if it fails again,',
    'so each comment below is one occurrence. Investigate here; the run log has the full output.',
  ].join('\n')
}

/**
 * Pure: decide what to do for each report entry given the existing incident issues.
 * Returns actions of type open | reopen | comment | close; `notify` marks the ones
 * that should ping Discord.
 */
export function planActions(report, issues, runUrl) {
  const byTitle = new Map()
  for (const issue of issues) {
    const seen = byTitle.get(issue.title)
    // Should two exist, prefer the open one so we never open a duplicate.
    if (!seen || (seen.state !== 'open' && issue.state === 'open')) byTitle.set(issue.title, issue)
  }

  const actions = []
  for (const entry of report) {
    const title = issueTitle(entry.signature)
    const issue = byTitle.get(title)
    const base = { signature: entry.signature, title }

    if (!entry.ok) {
      if (!issue) {
        actions.push({ ...base, type: 'open', body: openBody(entry, runUrl), notify: true })
      } else if (issue.state !== 'open') {
        const comment = `Failed again. Reopening.\n\n${fence(entry.detail)}\n\nRun: ${runUrl}`
        actions.push({ ...base, type: 'reopen', number: issue.number, comment, notify: true })
      } else {
        const comment = `Still failing.\n\n${fence(entry.detail)}\n\nRun: ${runUrl}`
        actions.push({ ...base, type: 'comment', number: issue.number, comment, notify: false })
      }
      continue
    }

    if (issue?.state !== 'open') continue
    if (entry.warning) {
      const comment = `Tolerated, not yet recovered.\n\n${fence(entry.detail)}\n\nRun: ${runUrl}`
      actions.push({ ...base, type: 'comment', number: issue.number, comment, notify: false })
    } else {
      const comment = `Recovered. Closing.\n\n${fence(entry.detail)}\n\nRun: ${runUrl}`
      actions.push({ ...base, type: 'close', number: issue.number, comment, notify: true })
    }
  }
  return actions
}

/** The Discord line for a notifying action. */
export function discordMessage(action, issueUrl) {
  const what =
    action.type === 'close'
      ? `✅ ${action.signature} recovered`
      : `⚠️ ${action.signature} ${action.type === 'reopen' ? 'failing again' : 'failing'}`
  return `${HEADER} — ${what}\n${issueUrl}`
}

// ---------------------------------------------------------------- GitHub I/O

function github(token) {
  return async (method, path, body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 404 && method === 'GET') return null
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`GitHub ${method} ${path}: HTTP ${String(res.status)} ${text.slice(0, 300)}`)
    }
    return res.status === 204 ? null : res.json()
  }
}

async function ensureLabel(gh, repo) {
  if (await gh('GET', `/repos/${repo}/labels/${LABEL}`)) return
  try {
    await gh('POST', `/repos/${repo}/labels`, {
      name: LABEL,
      color: 'e11d21',
      description: 'Opened automatically by the data-refresh workflow',
    })
  } catch (err) {
    // On workflow_dispatch both jobs run at once; the other may have just created it.
    if (!String(err.message).includes('HTTP 422')) throw err
  }
}

// The label-filtered listing lags issue creation by a few seconds (seen 2026-10-09:
// back-to-back local runs opened a duplicate). Scheduled runs are hours apart, so
// that only matters for manual testing; planActions prefers the open issue if a
// duplicate ever exists.
async function listIncidentIssues(gh, repo) {
  const issues = await gh('GET', `/repos/${repo}/issues?labels=${LABEL}&state=all&per_page=100`)
  // The issues endpoint also returns pull requests.
  return (issues ?? []).filter((i) => !i.pull_request)
}

/** Apply one action; returns the issue URL it touched. */
async function apply(gh, repo, action) {
  const issuePath = `/repos/${repo}/issues/${String(action.number)}`
  switch (action.type) {
    case 'open': {
      const created = await gh('POST', `/repos/${repo}/issues`, {
        title: action.title,
        body: action.body,
        labels: [LABEL, AREA_LABEL],
      })
      return created.html_url
    }
    case 'reopen':
      await gh('PATCH', issuePath, { state: 'open' })
      await gh('POST', `${issuePath}/comments`, { body: action.comment })
      break
    case 'comment':
      await gh('POST', `${issuePath}/comments`, { body: action.comment })
      break
    case 'close':
      await gh('POST', `${issuePath}/comments`, { body: action.comment })
      await gh('PATCH', issuePath, { state: 'closed', state_reason: 'completed' })
      break
    default:
      throw new Error(`unknown action ${String(action.type)}`)
  }
  return `https://github.com/${repo}/issues/${String(action.number)}`
}

async function main(argv) {
  const reportPath = argv[0] ?? process.env.INCIDENT_REPORT ?? 'incident-report.json'
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  const runUrl = process.env.RUN_URL ?? '(no run URL)'
  if (!token || !repo) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required')

  const report = JSON.parse(await readFile(reportPath, 'utf8'))
  if (!Array.isArray(report)) throw new Error(`${reportPath} is not an array`)

  const gh = github(token)
  await ensureLabel(gh, repo)
  const actions = planActions(report, await listIncidentIssues(gh, repo), runUrl)
  if (actions.length === 0) {
    console.log('no actions: nothing failing, no open incidents to update')
    return 0
  }

  let failures = 0
  for (const action of actions) {
    const url = await apply(gh, repo, action)
    console.log(`${action.type.padEnd(7)} ${action.signature} ${url}`)
    if (!action.notify || !discordConfigured()) continue
    try {
      await postDiscord(discordMessage(action, url))
    } catch (err) {
      // The issue is the record; a failed ping must still fail the step so the
      // workflow's fallback notifier gets its chance.
      console.error(err.message)
      failures++
    }
  }
  return failures > 0 ? 1 : 0
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((err) => {
      console.error(err.message)
      process.exitCode = 1
    })
}
