/**
 * The "Look closer" view (#203) without WebGL: a fake scene factory stands in for the
 * renderer, so the view's own behaviour (load, fail, retry, abort, Escape, context loss)
 * is what runs.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BoxGeometry, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest'

import { DetailView } from '@/components/orrery/DetailView'
import { SearchBox } from '@/components/orrery/SearchBox'
import { Term } from '@/components/orrery/Term'
import type {
  CreateDetailScene,
  DetailSceneHandle,
  DetailSceneOptions,
} from '@/components/orrery/three/DetailScene'
import type { FileDescriptor, StandInDescriptor } from '@/lib/orrery/modelDescriptor'

afterEach(cleanup)

const file: FileDescriptor = {
  kind: 'file',
  file: '/models/craft/jwst.glb',
  credit: 'NASA and Christopher R. Meaney',
  licence: 'NASA media usage guidelines',
  sourceUrl: 'https://example.test/jwst',
  attitude: 'sun',
  axis: [0, 0, 1],
  attitudeNote: 'Sun shield toward the Sun',
  scope: 'own',
}
const standIn: StandInDescriptor = {
  kind: 'standin',
  file: null,
  standIn: 'psyche',
  sourceUrl: null,
  credit: 'Built for this site',
  licence: 'Own work, built in code',
  attitude: 'sun',
  axis: [0, 0, 1],
  attitudeNote: 'Arrays toward the Sun',
  scope: 'own',
}

const box = (): Object3D => new Mesh(new BoxGeometry(1, 2, 3), new MeshStandardMaterial())

interface Harness {
  create: CreateDetailScene
  setModel: Mock<DetailSceneHandle['setModel']>
  dispose: Mock<DetailSceneHandle['dispose']>
  rotate: Mock<DetailSceneHandle['rotate']>
  zoom: Mock<DetailSceneHandle['zoom']>
  options: () => DetailSceneOptions
  created: () => number
}

function harness(): Harness {
  const setModel = vi.fn<DetailSceneHandle['setModel']>()
  const dispose = vi.fn<DetailSceneHandle['dispose']>()
  const rotate = vi.fn<DetailSceneHandle['rotate']>()
  const zoom = vi.fn<DetailSceneHandle['zoom']>()
  let options: DetailSceneOptions | null = null
  let created = 0
  const create: CreateDetailScene = (_host, o) => {
    options = o
    created += 1
    return { setModel, dispose, rotate, zoom }
  }
  return {
    create,
    setModel,
    dispose,
    rotate,
    zoom,
    options: () => {
      if (!options) throw new Error('no scene created')
      return options
    },
    created: () => created,
  }
}

const flush = () => act(async () => {})

describe('<DetailView> (#203)', () => {
  it('names the object, credits the model and links its source', async () => {
    const h = harness()
    render(
      <DetailView
        descriptor={file}
        title="JWST"
        onClose={vi.fn()}
        reducedMotion={false}
        createScene={h.create}
        load={() => Promise.resolve(box())}
      />,
    )
    await flush()
    expect(screen.getByRole('region', { name: /JWST/ })).toBeTruthy()
    expect(document.body.textContent).toContain('NASA and Christopher R. Meaney')
    expect(document.body.textContent).toContain('NASA media usage guidelines')
    const link = screen.getByRole('link', { name: /source/i })
    expect(link.getAttribute('href')).toBe('https://example.test/jwst')
  })

  it('says a built stand-in is a simplified model', async () => {
    const h = harness()
    render(
      <DetailView
        descriptor={standIn}
        title="Psyche"
        onClose={vi.fn()}
        reducedMotion={false}
        createScene={h.create}
        load={() => Promise.reject(new Error('never asked'))}
      />,
    )
    await flush()
    expect(document.body.textContent).toMatch(/simplified/i)
    expect(screen.queryByRole('link', { name: /source/i })).toBeNull()
    expect(h.setModel).toHaveBeenCalledTimes(1)
  })

  it('says a family model is a stand-in for the whole family', async () => {
    const h = harness()
    render(
      <DetailView
        descriptor={{ ...file, scope: 'family' }}
        title="A Starlink"
        onClose={vi.fn()}
        reducedMotion={false}
        createScene={h.create}
        load={() => Promise.resolve(box())}
      />,
    )
    await flush()
    expect(document.body.textContent).toMatch(/stand-in/i)
  })

  it('does not call a real model a stand-in', async () => {
    const h = harness()
    render(
      <DetailView
        descriptor={file}
        title="JWST"
        onClose={vi.fn()}
        reducedMotion={false}
        createScene={h.create}
        load={() => Promise.resolve(box())}
      />,
    )
    await flush()
    expect(document.body.textContent).not.toMatch(/stand-in|simplified/i)
  })

  it('hands the loaded model to the scene', async () => {
    const h = harness()
    render(
      <DetailView
        descriptor={file}
        title="JWST"
        onClose={vi.fn()}
        reducedMotion={false}
        createScene={h.create}
        load={() => Promise.resolve(box())}
      />,
    )
    await flush()
    expect(h.setModel).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Model unavailable')).toBeNull()
  })

  it('closes on Escape once, and puts focus on its Close button when it opens', async () => {
    const onClose = vi.fn()
    const h = harness()
    render(
      <DetailView
        descriptor={file}
        title="JWST"
        onClose={onClose}
        reducedMotion={false}
        createScene={h.create}
        load={() => Promise.resolve(box())}
      />,
    )
    await flush()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to orrery' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores an Escape another control already handled', async () => {
    const onClose = vi.fn()
    const h = harness()
    render(
      <DetailView
        descriptor={file}
        title="JWST"
        onClose={onClose}
        reducedMotion={false}
        createScene={h.create}
        load={() => Promise.resolve(box())}
      />,
    )
    await flush()
    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    handled.preventDefault()
    window.dispatchEvent(handled)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes from its Close button', async () => {
    const onClose = vi.fn()
    const h = harness()
    render(
      <DetailView
        descriptor={file}
        title="JWST"
        onClose={onClose}
        reducedMotion={false}
        createScene={h.create}
        load={() => Promise.resolve(box())}
      />,
    )
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Back to orrery' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open on a failed load, says so, and shows the model after Retry', async () => {
    const onClose = vi.fn()
    const h = harness()
    const load = vi
      .fn<() => Promise<Object3D>>()
      .mockRejectedValueOnce(new Error('HTTP 404'))
      .mockResolvedValueOnce(box())
    render(
      <DetailView
        descriptor={file}
        title="JWST"
        onClose={onClose}
        reducedMotion={false}
        createScene={h.create}
        load={load}
      />,
    )
    await flush()
    expect(screen.getByText('Model unavailable')).toBeTruthy()
    expect(h.setModel).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await flush()
    expect(load).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Model unavailable')).toBeNull()
    expect(h.setModel).toHaveBeenCalledTimes(1)
    expect(h.created()).toBe(1)
  })

  it('discards a model that arrives after the view closed, and disposes the scene', async () => {
    const h = harness()
    let arrive: (o: Object3D) => void = () => {}
    const load = () =>
      new Promise<Object3D>((resolve) => {
        arrive = resolve
      })
    const view = render(
      <DetailView
        descriptor={file}
        title="JWST"
        onClose={vi.fn()}
        reducedMotion={false}
        createScene={h.create}
        load={load}
      />,
    )
    await flush()
    view.unmount()
    expect(h.dispose).toHaveBeenCalledTimes(1)
    arrive(box())
    await flush()
    expect(h.setModel).not.toHaveBeenCalled()
  })

  it('does not show a failure that follows a close', async () => {
    const h = harness()
    let fail: (e: Error) => void = () => {}
    const load = () =>
      new Promise<Object3D>((_resolve, reject) => {
        fail = reject
      })
    const view = render(
      <DetailView
        descriptor={file}
        title="JWST"
        onClose={vi.fn()}
        reducedMotion={false}
        createScene={h.create}
        load={load}
      />,
    )
    await flush()
    view.unmount()
    fail(new Error('late'))
    await flush()
    expect(document.body.textContent).not.toContain('Model unavailable')
  })

  it('closes when the scene reports a lost WebGL context', async () => {
    const onClose = vi.fn()
    const h = harness()
    render(
      <DetailView
        descriptor={file}
        title="JWST"
        onClose={onClose}
        reducedMotion={false}
        createScene={h.create}
        load={() => Promise.resolve(box())}
      />,
    )
    await flush()
    act(() => {
      h.options().onContextLost()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('creates one scene per mount and disposes it on unmount', async () => {
    const h = harness()
    const view = render(
      <DetailView
        descriptor={file}
        title="JWST"
        onClose={vi.fn()}
        reducedMotion={false}
        createScene={h.create}
        load={() => Promise.resolve(box())}
      />,
    )
    await flush()
    expect(h.created()).toBe(1)
    expect(h.dispose).not.toHaveBeenCalled()
    view.unmount()
    expect(h.dispose).toHaveBeenCalledTimes(1)
  })

  it('renders a CC BY credit with source and licence links and a statement of changes', async () => {
    const h = harness()
    render(
      <DetailView
        descriptor={{
          ...file,
          credit: 'Some Artist',
          licence: 'CC BY 4.0',
          licenceUrl: 'https://example.test/cc-by',
          changes: 'Simplified for this site.',
        }}
        title="JWST"
        onClose={vi.fn()}
        reducedMotion={false}
        createScene={h.create}
        load={() => Promise.resolve(box())}
      />,
    )
    await flush()
    const credit = document.querySelector('[data-detail-credit]')
    expect(credit?.textContent.replace(/\s+/g, ' ')).toContain(
      'Model: Some Artist (source (opens in a new tab)), CC BY 4.0 (licence (opens in a new tab)). Simplified for this site.',
    )
    expect(screen.getByRole('link', { name: /^licence/ }).getAttribute('href')).toBe(
      'https://example.test/cc-by',
    )
    expect(screen.getByRole('link', { name: /^source/ }).getAttribute('href')).toBe(
      'https://example.test/jwst',
    )
  })

  it('renders a NASA credit as before, with no licence link and no changes line', async () => {
    const h = harness()
    render(
      <DetailView
        descriptor={file}
        title="JWST"
        onClose={vi.fn()}
        reducedMotion={false}
        createScene={h.create}
        load={() => Promise.resolve(box())}
      />,
    )
    await flush()
    const credit = document.querySelector('[data-detail-credit]')
    expect(credit?.textContent).toContain(
      'Model: NASA and Christopher R. Meaney · NASA media usage guidelines · Source',
    )
    expect(screen.queryByRole('link', { name: /^licence/ })).toBeNull()
  })

  const mount = (
    h: Harness,
    onClose = vi.fn(),
    load: () => Promise<Object3D> = () => Promise.resolve(box()),
  ) =>
    render(
      <DetailView
        descriptor={file}
        title="JWST"
        onClose={onClose}
        reducedMotion={false}
        createScene={h.create}
        load={load}
      />,
    )

  it('names its button "Back to orrery" and its title is a level 2 heading', async () => {
    mount(harness())
    await flush()
    expect(screen.getByRole('button', { name: 'Back to orrery' }).textContent).toBe(
      'Back to orrery',
    )
    expect(screen.getByRole('heading', { level: 2, name: 'JWST' })).toBeTruthy()
  })

  it('tells the owner whether a close came from the user or from a lost context', async () => {
    const onClose = vi.fn()
    const h = harness()
    mount(h, onClose)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Back to orrery' }))
    expect(onClose).toHaveBeenLastCalledWith('user')
    act(() => {
      h.options().onContextLost()
    })
    expect(onClose).toHaveBeenLastCalledWith('lost')
  })

  it('turns the model with the arrow keys and zooms with plus and minus', async () => {
    const h = harness()
    mount(h)
    await flush()
    const model = screen.getByRole('group', { name: /Model of JWST/ })
    expect(model.tabIndex).toBe(0)
    expect(model.getAttribute('aria-keyshortcuts')).toContain('ArrowLeft')
    fireEvent.keyDown(model, { key: 'ArrowLeft' })
    fireEvent.keyDown(model, { key: 'ArrowRight' })
    fireEvent.keyDown(model, { key: 'ArrowUp' })
    fireEvent.keyDown(model, { key: 'ArrowDown' })
    const [left, right, up, down] = h.rotate.mock.calls
    expect(left?.[0]).toBeLessThan(0)
    expect(right?.[0]).toBeGreaterThan(0)
    expect(up?.[1]).toBeLessThan(0)
    expect(down?.[1]).toBeGreaterThan(0)
    fireEvent.keyDown(model, { key: '+' })
    fireEvent.keyDown(model, { key: '=' })
    fireEvent.keyDown(model, { key: '-' })
    expect(h.zoom.mock.calls.map((c) => c[0] < 1)).toEqual([true, true, false])
  })

  it('has zoom buttons for a single pointer', async () => {
    const h = harness()
    mount(h)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(h.zoom.mock.calls.map((c) => c[0] < 1)).toEqual([true, false])
  })

  it('keeps one always-present status region and announces the failure as an alert', async () => {
    const h = harness()
    const load = vi
      .fn<() => Promise<Object3D>>()
      .mockRejectedValueOnce(new Error('HTTP 404'))
      .mockResolvedValueOnce(box())
    mount(h, vi.fn(), load)
    const status = () => document.querySelector('[data-detail-announce]')
    expect(status()?.getAttribute('role')).toBe('status')
    expect(status()?.textContent).toBe('Loading the model')
    await flush()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Model unavailable')
    expect(status()).toBe(document.querySelector('[data-detail-announce]'))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    // Focus must not fall to the page when Retry's own button goes away.
    expect(document.activeElement).toBe(screen.getByRole('group', { name: /Model of JWST/ }))
    await flush()
    expect(status()?.textContent).toBe('Model ready')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('gives its root an id the inspector button can point at', async () => {
    mount(harness())
    await flush()
    expect(document.querySelector('[data-detail-view]')?.id).toBe('orrery-detail-view')
  })

  it('gives the credit link a hidden "opens in a new tab"', async () => {
    mount(harness())
    await flush()
    expect(screen.getByRole('link', { name: /source.*opens in a new tab/i })).toBeTruthy()
  })

  describe('Escape (#203 review)', () => {
    it('lets a Term popover take its own Escape, and a second one closes the view', async () => {
      const onClose = vi.fn()
      render(
        <>
          <Term id="light-time">Light time</Term>
          <DetailView
            descriptor={file}
            title="JWST"
            onClose={onClose}
            reducedMotion={false}
            createScene={harness().create}
            load={() => Promise.resolve(box())}
          />
        </>,
      )
      await flush()
      const term = screen.getByRole('button', { name: 'Light time' })
      fireEvent.click(term)
      await flush()
      expect(term.getAttribute('aria-expanded')).toBe('true')
      fireEvent.keyDown(term, { key: 'Escape' })
      expect(term.getAttribute('aria-expanded')).toBe('false')
      expect(onClose).not.toHaveBeenCalled()
      fireEvent.keyDown(term, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('lets the Find box dismiss its suggestions first', async () => {
      const onClose = vi.fn()
      render(
        <>
          <SearchBox items={[]} onSelect={() => undefined} />
          <DetailView
            descriptor={file}
            title="JWST"
            onClose={onClose}
            reducedMotion={false}
            createScene={harness().create}
            load={() => Promise.resolve(box())}
          />
        </>,
      )
      await flush()
      const find = screen.getByRole('combobox')
      fireEvent.keyDown(find, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
      fireEvent.keyDown(document.body, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('leaves an open guide to close first', async () => {
      const onClose = vi.fn()
      const guide = document.createElement('div')
      guide.setAttribute('data-guide-drawer', '')
      document.body.append(guide)
      mount(harness(), onClose)
      await flush()
      fireEvent.keyDown(document.body, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
      guide.remove()
      fireEvent.keyDown(document.body, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })
})
