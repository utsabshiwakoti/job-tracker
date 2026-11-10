// Service worker: the only place that talks to the API for content scripts.
// Failed saves (backend not running, logged out) go into a queue and are retried later,
// so an application is never lost just because the tracker wasn't open.
import { api } from './api.js'
import './parsers.js'

const P = globalThis.JTParsers
const PENDING_MAX_AGE_MS = 3 * 60 * 60 * 1000 // an Indeed apply flow older than 3h is ignored

// ---------- retry queue ----------

async function getQueue() {
  return (await chrome.storage.local.get('queue')).queue || []
}

async function setQueue(queue) {
  await chrome.storage.local.set({ queue })
  await chrome.action.setBadgeText({ text: queue.length ? String(queue.length) : '' })
  await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' })
}

async function enqueue(job) {
  const queue = await getQueue()
  const existing = queue.find((j) => j.url === job.url)
  if (!existing) queue.push(job)
  else if (job.status === 'applied') Object.assign(existing, job) // keep the strongest status
  await setQueue(queue)
}

export async function flushQueue() {
  const queue = await getQueue()
  const remaining = []
  for (const job of queue) {
    try {
      await api.capture(job)
    } catch (err) {
      if (err.status !== 422) remaining.push(job) // 422 = bad data; retrying won't help
    }
  }
  await setQueue(remaining)
  return { synced: queue.length - remaining.length, remaining: remaining.length }
}

// ---------- capture ----------

async function capture(job) {
  try {
    const result = await api.capture(job)
    flushQueue() // the API is reachable again: send anything that was waiting
    return { ok: true, ...result }
  } catch (err) {
    if (err.status === 422) return { ok: false, error: err.message }
    await enqueue(job)
    return { ok: false, queued: true, needsLogin: err.status === 401, error: err.message }
  }
}

async function handle(msg) {
  switch (msg?.type) {
    case 'capture':
      return capture(msg.job)

    case 'pending': {
      // Indeed "Apply" clicked: remember the job for the confirmation page and save it as wishlist.
      await chrome.storage.session.set({ pendingIndeed: { job: msg.job, at: Date.now() } })
      return capture({ ...msg.job, status: 'wishlist' })
    }

    case 'pendingApplied': {
      const { pendingIndeed } = await chrome.storage.session.get('pendingIndeed')
      if (!pendingIndeed || Date.now() - pendingIndeed.at > PENDING_MAX_AGE_MS) {
        return { ok: false, error: 'no-pending' }
      }
      await chrome.storage.session.remove('pendingIndeed')
      return capture({ ...pendingIndeed.job, status: 'applied', applied_on: msg.applied_on || P.today() })
    }

    case 'flush':
      return flushQueue()

    default:
      return { ok: false, error: `Unknown message ${msg?.type}` }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse)
  return true // keep the channel open for the async response
})

// Retry whatever is queued whenever the browser starts.
chrome.runtime.onStartup.addListener(() => flushQueue())
