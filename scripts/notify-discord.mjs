#!/usr/bin/env node
// Posts a short alert to Discord via the Linky loo bot.
//
// Same bot and same channel as mylinkedin and blastjob: projects are told apart
// by their header line, not by separate channels (Chris's call, 2026-09-04).
// Plain REST, no gateway, matching blastjob/src/blastjob/notify/discord.py.
//
// Usage: node scripts/notify-discord.mjs "<title>" "<url>"
// Requires DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID. Exits 0 when unconfigured
// so a missing secret never turns a real failure into a confusing second one.

const token = process.env.DISCORD_BOT_TOKEN
const channelId = process.env.DISCORD_CHANNEL_ID
const HEADER = '🛰️ **observatory**'
const [title = 'alert', url = ''] = process.argv.slice(2)

if (!token || !channelId) {
  console.log('Discord not configured (DISCORD_BOT_TOKEN / DISCORD_CHANNEL_ID unset); skipping.')
  process.exit(0)
}

const content = url ? `${HEADER} — ${title}\n${url}` : `${HEADER} — ${title}`

const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
  method: 'POST',
  headers: {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  signal: AbortSignal.timeout(15_000),
})

if (!res.ok) {
  const body = await res.text().catch(() => '')
  console.error(`Discord notify failed: ${res.status} ${body.slice(0, 300)}`)
  process.exit(1)
}

console.log(`Alert posted to Discord channel ${channelId}.`)
