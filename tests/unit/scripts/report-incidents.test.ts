import { describe, expect, it } from 'vitest'

// @ts-expect-error plain ESM script, no type declarations
import { discordMessage, issueTitle, planActions } from '../../../scripts/report-incidents.mjs'

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
