import type { PagesFunction } from '@cloudflare/workers-types'

const EPIC_ARCHIVE_BASE = 'https://epic.gsfc.nasa.gov'

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

export const onRequest: PagesFunction<Env> = async ({ request }) => {
  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year')
  const month = searchParams.get('month')
  const day = searchParams.get('day')
  const image = searchParams.get('image')

  if (!year || !month || !day || !image) {
    return new Response(
      JSON.stringify({ error: 'Missing required params: year, month, day, image' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  // Basic input validation — only alphanumeric, underscores, hyphens
  const safe = /^[\w-]+$/
  if (!safe.test(year) || !safe.test(month) || !safe.test(day) || !safe.test(image)) {
    return new Response(JSON.stringify({ error: 'Invalid params' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = `${EPIC_ARCHIVE_BASE}/archive/natural/${year}/${month}/${day}/png/${image}.png`

  const upstream = await fetch(url)

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Image not found' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  })
}
