import { describe, expect, it } from 'vitest'

import {
  discordMessage,
  issueTitle,
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
