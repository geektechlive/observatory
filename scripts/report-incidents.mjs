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
// On an open issue, the fail and warning comments are posted only when the line changed
// since the last comment (response time, retry count, KV age and run link don't count),
// or as one heartbeat after HEARTBEAT_MS of silence (#120: #65 had 79 identical
// "Still failing" comments through a NASA outage nobody could fix).
// So an issue's comment log is that source's incident history (Chris's call, 2026-10-09).
// An issue only closes when its signature reports a pass: if a check is removed or
// renamed while its issue is open, close that issue by hand.
//
// Upstream threshold (#71, Chris's call 2026-10-25): an entry marked `upstream` (an
// outage we can't fix, e.g. NASA down) opens or reopens an issue only on its
// UPSTREAM_THRESHOLD-th run in a row; before that it is a `hold`: logged, no issue, no
// ping. At the 6 h health cadence that is 18-24 h after it starts. Contract failures,
// our own errors and a down site are never marked upstream, so they still open at once.
// The streak lives in a JSON file the workflow keeps in actions/cache; losing it only
// restarts the count (a later alert, never a false one).
//
// Usage: node scripts/report-incidents.mjs [report.json]
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY (owner/name), RUN_URL; DISCORD_* optional;
// INCIDENT_STREAKS (default incident-streaks.json).
// The repo is public: bodies carry only the report's detail lines and the run link.

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { discordConfigured, HEADER, postDiscord } from './notify-discord.mjs'

const LABEL = 'incident'
const AREA_LABEL = 'infra'
const API = 'https://api.github.com'
/** Consecutive upstream-caused failing runs before an issue opens (#71). */
export const UPSTREAM_THRESHOLD = 4
/** An unchanged open incident gets at most one comment in this long (#120). */
export const HEARTBEAT_MS = 24 * 3_600_000

export function issueTitle(signature) {
  return `[observatory] ${signature}`
}

const fence = (detail) => `\`\`\`\n${detail}\n\`\`\``

/**
 * Pure: what makes two reports of one source "the same": the status (failing or
 * tolerated) and the detail line without the numbers that move every run.
 */
function incidentKey(kind, detail) {
  const steady = detail
    .replace(/\b\d+ms\b/g, '')
    .replace(/\(after \d+ attempts\)/g, '')
    .replace(/\b\d+h old\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `${kind}|${steady}`
}

/** Pure: the key of an earlier comment or opening body, or null if it isn't one of ours. */
function keyOfPosted(body) {
  const detail = /```\n([\s\S]*?)\n```/.exec(body)?.[1]
  if (detail === undefined) return null
  const kind = body.startsWith('Tolerated') ? 'warn' : 'fail'
  return incidentKey(kind, detail)
}

/**
 * Pure: the comment for an open issue, or a `skip` when it would repeat the last one
 * within HEARTBEAT_MS. An issue without a known lastComment always gets the comment.
 */
function quietComment(base, issue, kind, detail, lead, runUrl, now) {
  const comment = `${lead}\n\n${fence(detail)}\n\nRun: ${runUrl}`
  const last = issue.lastComment
  const post = { ...base, type: 'comment', number: issue.number, comment, notify: false }
  if (!last || keyOfPosted(last.body) !== incidentKey(kind, detail)) return post
  const age = now - Date.parse(last.createdAt)
  // `!(age < …)` so an unparseable timestamp (NaN) posts rather than goes quiet.
  if (!(age < HEARTBEAT_MS)) {
    const heartbeat = `${lead} No change in 24 h.\n\n${fence(detail)}\n\nRun: ${runUrl}`
    return { ...post, comment: heartbeat }
  }
  return { ...base, type: 'skip', number: issue.number, ageMs: age, notify: false }
}

/**
 * Pure: each signature's run of consecutive upstream-caused failures, including this
 * report. A pass, a non-upstream failure or a missing entry resets it (and drops it).
 */
export function nextStreaks(report, previous) {
  const out = {}
  for (const entry of report) {
    if (!entry.ok && entry.upstream) out[entry.signature] = (previous[entry.signature] ?? 0) + 1
  }
  return out
}

function openBody(entry, runUrl, streak) {
  const why = entry.upstream
    ? ` It is upstream-caused and has failed ${String(streak)} health runs in a row.`
    : ''
  return [
    `Opened automatically by the \`data-refresh\` workflow: **${entry.signature}** failed.${why}`,
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
 * Returns actions of type open | reopen | comment | close | hold | skip; `notify` marks
 * the ones that should ping Discord. `streaks` is nextStreaks() for this report. An
 * open issue may carry `lastComment` ({ body, createdAt }) so repeats can be skipped.
 */
export function planActions(report, issues, runUrl, streaks = {}, now = Date.now()) {
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
      const streak = streaks[entry.signature] ?? 0
      if (entry.upstream && issue?.state !== 'open' && streak < UPSTREAM_THRESHOLD) {
        actions.push({ ...base, type: 'hold', streak, notify: false })
      } else if (!issue) {
        const body = openBody(entry, runUrl, streak)
        actions.push({ ...base, type: 'open', body, notify: true })
      } else if (issue.state !== 'open') {
        const comment = `Failed again. Reopening.\n\n${fence(entry.detail)}\n\nRun: ${runUrl}`
        actions.push({ ...base, type: 'reopen', number: issue.number, comment, notify: true })
      } else {
        actions.push(quietComment(base, issue, 'fail', entry.detail, 'Still failing.', runUrl, now))
      }
      continue
    }

    if (issue?.state !== 'open') continue
    if (entry.warning) {
      const lead = 'Tolerated, not yet recovered.'
      actions.push(quietComment(base, issue, 'warn', entry.detail, lead, runUrl, now))
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

/**
 * The newest comment on an issue, or its opening body when it has none, as
 * { body, createdAt }. Comments list oldest first, so read the last page.
 */
export async function lastComment(gh, repo, issue) {
  if (!issue.comments) return { body: issue.body ?? '', createdAt: issue.created_at }
  const page = Math.ceil(issue.comments / 100)
  const path = `/repos/${repo}/issues/${String(issue.number)}/comments?per_page=100&page=${String(page)}`
  const comments = (await gh('GET', path)) ?? []
  const last = comments.at(-1)
  return last ? { body: last.body ?? '', createdAt: last.created_at } : null
}

/** Each open issue with its lastComment; a failed lookup just leaves it off (= comment). */
async function withLastComments(gh, repo, issues) {
  return Promise.all(
    issues.map(async (issue) => {
      if (issue.state !== 'open') return issue
      try {
        return { ...issue, lastComment: await lastComment(gh, repo, issue) }
      } catch (err) {
        console.warn(`last comment of #${String(issue.number)} unavailable: ${err.message}`)
        return issue
      }
    }),
  )
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
    case 'hold':
      return `upstream failure ${String(action.streak)}/${String(UPSTREAM_THRESHOLD)}, no issue yet`
    case 'skip':
      return `#${String(action.number)} unchanged, last comment ${String(Math.round(action.ageMs / 3_600_000))}h ago`
    default:
      throw new Error(`unknown action ${String(action.type)}`)
  }
  return `https://github.com/${repo}/issues/${String(action.number)}`
}

/** The previous run's streaks; none (first run, cache evicted, bad file) means start over. */
async function readStreaks(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(([, n]) => Number.isInteger(n) && n > 0),
    )
  } catch {
    return {}
  }
}

async function main(argv) {
  const reportPath = argv[0] ?? process.env.INCIDENT_REPORT ?? 'incident-report.json'
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  const runUrl = process.env.RUN_URL ?? '(no run URL)'
  if (!token || !repo) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required')

  const report = JSON.parse(await readFile(reportPath, 'utf8'))
  if (!Array.isArray(report)) throw new Error(`${reportPath} is not an array`)

  // Written before any GitHub call, so a GitHub outage can't lose the count.
  const streaksPath = process.env.INCIDENT_STREAKS ?? 'incident-streaks.json'
  const streaks = nextStreaks(report, await readStreaks(streaksPath))
  await writeFile(streaksPath, JSON.stringify(streaks, null, 2))

  const gh = github(token)
  await ensureLabel(gh, repo)
  const issues = await withLastComments(gh, repo, await listIncidentIssues(gh, repo))
  const actions = planActions(report, issues, runUrl, streaks)
  if (actions.length === 0) {
    console.log('no actions: nothing failing, no open incidents to update')
    return 0
  }

  let failures = 0
  for (const action of actions) {
    let url
    try {
      url = await apply(gh, repo, action)
    } catch (err) {
      // One flaky GitHub call must not skip the other sources' updates and pings.
      console.error(`${action.type} ${action.signature} failed: ${err.message}`)
      failures++
      continue
    }
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
