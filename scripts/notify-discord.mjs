#!/usr/bin/env node
// Posts a short alert to Discord via the Linky loo bot.
//
// Same bot and same channel as mylinkedin and blastjob: projects are told apart
// by their header line, not by separate channels (Chris's call, 2026-09-04).
// Plain REST, no gateway, matching blastjob/src/blastjob/notify/discord.py.
//
// The workflows normally alert through scripts/report-incidents.mjs, which imports
// postDiscord. The CLI stays as the fallback for when that reporter itself fails.
//
// Usage: node scripts/notify-discord.mjs "<title>" "<url>"
// Requires DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID. Exits 0 when unconfigured
// so a missing secret never turns a real failure into a confusing second one.

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HEADER = '🛰️ **observatory**'

/** True when both Discord secrets are present. */
export function discordConfigured(env = process.env) {
  return Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_CHANNEL_ID)
}

/** Post `content` to the alert channel. Throws on a non-2xx answer. */
export async function postDiscord(content, env = process.env) {
  const res = await fetch(
    `https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(15_000),
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Discord notify failed: ${res.status} ${body.slice(0, 300)}`)
  }
}

async function main(argv) {
  const [title = 'alert', url = ''] = argv
  if (!discordConfigured()) {
    console.log('Discord not configured (DISCORD_BOT_TOKEN / DISCORD_CHANNEL_ID unset); skipping.')
    return 0
  }
  await postDiscord(url ? `${HEADER} — ${title}\n${url}` : `${HEADER} — ${title}`)
  console.log(`Alert posted to Discord channel ${process.env.DISCORD_CHANNEL_ID}.`)
  return 0
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
