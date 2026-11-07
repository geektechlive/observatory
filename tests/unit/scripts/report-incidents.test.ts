import { describe, expect, it } from 'vitest'

import {
  discordMessage,
  issueTitle,
  lastComment,
  nextStreaks,
  planActions,
  UPSTREAM_THRESHOLD,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/report-incidents.mjs'

const RUN = 'https://github.com/geektechlive/observatory/actions/runs/1'

const fail = (signature: string, detail = 'FAIL HTTP 502') => ({ signature, ok: false, detail })
const pass = (signature: string, detail = 'PASS') => ({ signature, ok: true, detail })
const issue = (signature: string, state: 'open' | 'closed', number = 7) => ({
  number,
  state,
  title: issueTitle(signature),
  html_url: `https://github.com/geektechlive/observatory/issues/${String(number)}`,
})

describe('issueTitle', () => {
  it('is a stable per-source title', () => {
    expect(issueTitle('health:/api/eonet')).toBe('[observatory] health:/api/eonet')
  })
})

describe('planActions', () => {
  it('opens an issue for a failure with no history, and notifies', () => {
    const [action] = planActions([fail('health:/api/eonet')], [], RUN)
    expect(action).toMatchObject({
      type: 'open',
      title: '[observatory] health:/api/eonet',
      notify: true,
    })
    expect(action.body).toContain('FAIL HTTP 502')
    expect(action.body).toContain(RUN)
  })

  it('reopens a closed issue for the same source, and notifies', () => {
    const [action] = planActions(
      [fail('health:/api/eonet')],
      [issue('health:/api/eonet', 'closed')],
      RUN,
    )
    expect(action).toMatchObject({ type: 'reopen', number: 7, notify: true })
    expect(action.comment).toContain(RUN)
  })

  it('only comments on an issue that is already open', () => {
    const [action] = planActions(
      [fail('health:/api/eonet')],
      [issue('health:/api/eonet', 'open')],
      RUN,
    )
    expect(action).toMatchObject({ type: 'comment', number: 7, notify: false })
    expect(action.comment).toContain('FAIL HTTP 502')
  })

  it('closes an open issue when its source passes, and notifies', () => {
    const [action] = planActions(
      [pass('health:/api/eonet')],
      [issue('health:/api/eonet', 'open')],
      RUN,
    )
    expect(action).toMatchObject({ type: 'close', number: 7, notify: true })
    expect(action.comment).toMatch(/recovered/i)
  })

  it('does nothing for a pass with no open issue', () => {
    expect(planActions([pass('health:/api/neo')], [], RUN)).toEqual([])
    expect(
      planActions([pass('health:/api/neo')], [issue('health:/api/neo', 'closed')], RUN),
    ).toEqual([])
  })

  it('records a tolerated warning on an open issue without closing it', () => {
    // refresh: a failed fetch while the KV copy is still young is ok=true but not a recovery.
    const warn = {
      ...pass('refresh:iss', 'refresh:iss WARN fetch failed; KV copy 12h old, limit 36h'),
      warning: true,
    }
    const [action] = planActions([warn], [issue('refresh:iss', 'open')], RUN)
    expect(action).toMatchObject({ type: 'comment', number: 7, notify: false })
  })

  it('ignores issues for other sources', () => {
    const actions = planActions(
      [fail('health:/api/eonet')],
      [issue('health:/api/neo', 'open')],
      RUN,
    )
    expect(actions).toHaveLength(1)
    expect(actions[0].type).toBe('open')
  })
})

// #71 (owner's call, 2026-10-25): outages we can't fix were noise. An upstream-caused
// failure opens an issue only on its 4th health run in a row; everything else at once.
describe('upstream threshold', () => {
  const up = (signature: string) => ({
    ...fail(signature, 'FAIL HTTP 503 upstream'),
    upstream: true,
  })

  it('counts consecutive upstream failures, and resets on a pass or any other failure', () => {
    const prev = { 'health:/api/apod': 2, 'health:/api/donki': 3, 'health:/api/neo': 1 }
    expect(
      nextStreaks(
        [
          up('health:/api/apod'),
          pass('health:/api/donki'),
          fail('health:/api/neo'),
          up('health:/api/eonet'),
        ],
        prev,
      ),
    ).toEqual({ 'health:/api/apod': 3, 'health:/api/eonet': 1 })
  })

  it('holds an upstream failure below the threshold: no issue, no ping', () => {
    const [action] = planActions([up('health:/api/apod')], [], RUN, { 'health:/api/apod': 3 })
    expect(action).toMatchObject({ type: 'hold', notify: false, streak: 3 })
  })

  it(`opens on the ${String(UPSTREAM_THRESHOLD)}th upstream failure in a row, and says so`, () => {
    expect(UPSTREAM_THRESHOLD).toBe(4)
    const [action] = planActions([up('health:/api/apod')], [], RUN, { 'health:/api/apod': 4 })
    expect(action).toMatchObject({ type: 'open', notify: true })
    expect(action.body).toContain('4 health runs in a row')
  })

  it('holds a reopen the same way', () => {
    const closed = [issue('health:/api/apod', 'closed')]
    expect(
      planActions([up('health:/api/apod')], closed, RUN, { 'health:/api/apod': 1 })[0],
    ).toMatchObject({ type: 'hold' })
    expect(
      planActions([up('health:/api/apod')], closed, RUN, { 'health:/api/apod': 4 })[0],
    ).toMatchObject({ type: 'reopen' })
  })

  it('keeps commenting on an issue that is already open', () => {
    const open = [issue('health:/api/apod', 'open')]
    expect(
      planActions([up('health:/api/apod')], open, RUN, { 'health:/api/apod': 1 })[0],
    ).toMatchObject({ type: 'comment' })
  })

  it('opens a contract or site failure on the first run, streak or not', () => {
    const [action] = planActions([fail('health:/api/apod', 'FAIL missing title')], [], RUN, {})
    expect(action).toMatchObject({ type: 'open', notify: true })
  })

  it('loses nothing but time if the streak store is gone: a hold, never a false open', () => {
    const [action] = planActions(
      [up('health:/api/apod')],
      [],
      RUN,
      nextStreaks([up('health:/api/apod')], {}),
    )
    expect(action).toMatchObject({ type: 'hold', streak: 1 })
  })
})

describe('quiet open incidents (#120)', () => {
  // #65 collected 79 identical "Still failing" comments, one per 6 h run, through a
  // NASA DONKI outage nobody could fix.
  const NOW = Date.parse('2026-11-07T12:00:00Z')
  const HOUR = 3_600_000
  const DONKI = 'health:/api/donki'
  const detail = (ms: number) => `FAIL /api/donki HTTP 200 ${String(ms)}ms degraded (noaa-flares)`
  const openWith = (body: string, hoursAgo: number) => ({
    ...issue(DONKI, 'open'),
    lastComment: { body, createdAt: new Date(NOW - hoursAgo * HOUR).toISOString() },
  })
  const stillFailing = (d: string) => `Still failing.\n\n\`\`\`\n${d}\n\`\`\`\n\nRun: ${RUN}`

  it('skips an unchanged failure: response time and run link are not a change', () => {
    const issues = [openWith(stillFailing(detail(3078)), 6)]
    const [action] = planActions([fail(DONKI, detail(2210))], issues, RUN, {}, NOW)
    expect(action).toMatchObject({ type: 'skip', notify: false })
  })

  it('treats a retry count as noise too', () => {
    const issues = [openWith(stillFailing(detail(3078)), 6)]
    const now = `${detail(9000)} (after 3 attempts)`
    const [action] = planActions([fail(DONKI, now)], issues, RUN, {}, NOW)
    expect(action.type).toBe('skip')
  })

  it('comments when the failure line changes', () => {
    const issues = [openWith(stillFailing(detail(3078)), 6)]
    const changed = 'FAIL /api/donki HTTP 503 8011ms upstream unavailable'
    const [action] = planActions([fail(DONKI, changed)], issues, RUN, {}, NOW)
    expect(action).toMatchObject({ type: 'comment', notify: false })
    expect(action.comment).toContain('HTTP 503')
  })

  it('posts one heartbeat once the last comment is 24 h old', () => {
    const issues = [openWith(stillFailing(detail(3078)), 24)]
    const [action] = planActions([fail(DONKI, detail(2210))], issues, RUN, {}, NOW)
    expect(action.type).toBe('comment')
    expect(action.comment).toMatch(/no change in 24 h/i)
  })

  it('compares against the opening body when the issue has no comments yet', () => {
    const body = `Opened automatically by the \`data-refresh\` workflow: **${DONKI}** failed.\n\n\`\`\`\n${detail(3078)}\n\`\`\`\n\nRun: ${RUN}`
    const [action] = planActions([fail(DONKI, detail(1))], [openWith(body, 2)], RUN, {}, NOW)
    expect(action.type).toBe('skip')
  })

  it('comments when a tolerated warning follows a failure, and skips a repeated warning', () => {
    const warnDetail = 'WARN /api/donki HTTP 200 100ms STALE 1h (upstream)'
    const warn = { signature: DONKI, ok: true, warning: true, detail: warnDetail }
    const afterFail = planActions([warn], [openWith(stillFailing(detail(1)), 6)], RUN, {}, NOW)
    expect(afterFail[0].type).toBe('comment')
    const tolerated = `Tolerated, not yet recovered.\n\n\`\`\`\n${warnDetail}\n\`\`\`\n\nRun: ${RUN}`
    const again = planActions([warn], [openWith(tolerated, 6)], RUN, {}, NOW)
    expect(again[0].type).toBe('skip')
  })

  it('still comments when the last comment is unknown, as before', () => {
    const [action] = planActions([fail(DONKI, detail(1))], [issue(DONKI, 'open')], RUN, {}, NOW)
    expect(action.type).toBe('comment')
  })

  it('never quiets a recovery: it closes and notifies', () => {
    const issues = [openWith(stillFailing(detail(1)), 1)]
    const [action] = planActions([pass(DONKI)], issues, RUN, {}, NOW)
    expect(action).toMatchObject({ type: 'close', notify: true })
  })
})

describe('lastComment (#120)', () => {
  it('reads the newest comment, from the last page of a long thread', async () => {
    const calls: string[] = []
    const gh = (_method: string, path: string) => {
      calls.push(path)
      return Promise.resolve([
        { body: 'older', created_at: '2026-11-06T00:00:00Z' },
        { body: 'newest', created_at: '2026-11-07T00:00:00Z' },
      ])
    }
    const last = await lastComment(gh, 'o/r', {
      number: 65,
      comments: 179,
      body: 'b',
      created_at: 'x',
    })
    expect(calls[0]).toContain('/issues/65/comments?per_page=100&page=2')
    expect(last).toEqual({ body: 'newest', createdAt: '2026-11-07T00:00:00Z' })
  })

  it('falls back to the issue body when there are no comments', async () => {
    const gh = () => Promise.reject(new Error('should not be called'))
    const last = await lastComment(gh, 'o/r', {
      number: 9,
      comments: 0,
      body: 'opened',
      created_at: '2026-11-07T00:00:00Z',
    })
    expect(last).toEqual({ body: 'opened', createdAt: '2026-11-07T00:00:00Z' })
  })
})

describe('discordMessage', () => {
  it('links the issue for an open, reopen or close', () => {
    const url = 'https://github.com/geektechlive/observatory/issues/7'
    expect(discordMessage({ type: 'open', signature: 'health:/api/eonet' }, url)).toMatch(
      /health:\/api\/eonet.*issues\/7/s,
    )
    expect(discordMessage({ type: 'close', signature: 'health:/api/eonet' }, url)).toMatch(
      /recovered/,
    )
  })
})
