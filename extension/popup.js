import { api, getSettings, saveSettings } from './api.js'
import './parsers.js'

const P = globalThis.JTParsers
const $ = (id) => document.getElementById(id)
const show = (el, visible = true) => (el.hidden = !visible)

let currentJob = null

function message(text, kind = 'ok') {
  const el = $('message')
  el.textContent = text
  el.className = kind
  show(el, !!text)
}

async function refreshQueue() {
  const { queue = [] } = await chrome.storage.local.get('queue')
  $('queueText').textContent = `${queue.length} save${queue.length === 1 ? '' : 's'} waiting to sync`
  show($('queue'), queue.length > 0)
}

// Ask the page's content script for the job. Unsupported sites (or tabs opened before the
// extension was installed) have no content script, so fall back to the tab's title and URL.
async function detectJob(tab) {
  if (!/^https?:/.test(tab?.url || '')) return null
  try {
    const job = await chrome.tabs.sendMessage(tab.id, { type: 'extract' })
    if (job) return job
  } catch {
    /* no content script on this page */
  }
  const host = new URL(tab.url).hostname.replace(/^www\./, '')
  return { url: P.stripHash(tab.url), title: P.clean(tab.title), company: '', location: '', remote: false, source: host.slice(0, 50) }
}

function fillJobForm(job) {
  const f = $('job')
  f.title.value = job.title || ''
  f.company.value = job.company || ''
  f.location.value = job.location || ''
  f.remote.checked = !!job.remote
  $('url').textContent = job.url
}

async function showTracked(job) {
  try {
    const existing = await api.lookup(job.url)
    const note = $('tracked')
    if (existing) {
      note.textContent = `Already tracked: ${existing.status}${existing.applied_on ? ` (applied ${existing.applied_on})` : ''}`
    }
    show(note, !!existing)
  } catch (err) {
    message(err.message, 'error')
  }
}

async function render() {
  const settings = await getSettings()
  $('settings').apiBase.value = settings.apiBase
  $('settings').appBase.value = settings.appBase
  await refreshQueue()

  const loggedIn = !!settings.token
  show($('login'), !loggedIn)
  show($('logout'), loggedIn)
  $('who').textContent = loggedIn ? settings.email || '' : ''
  show($('job'), false)
  show($('notJob'), false)
  if (!loggedIn) return

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  currentJob = await detectJob(tab)
  if (!currentJob) return show($('notJob'))
  fillJobForm(currentJob)
  show($('job'))
  showTracked(currentJob)
}

$('login').addEventListener('submit', async (e) => {
  e.preventDefault()
  const f = e.target
  message('')
  try {
    await api.login(f.email.value.trim(), f.password.value)
    f.password.value = ''
    const { synced } = await chrome.runtime.sendMessage({ type: 'flush' })
    if (synced) message(`Synced ${synced} saved job${synced === 1 ? '' : 's'}.`)
    await render()
  } catch (err) {
    message(err.message, 'error')
  }
})

$('job').addEventListener('submit', async (e) => {
  e.preventDefault()
  const f = e.target
  const status = e.submitter?.value || 'wishlist'
  const job = {
    ...currentJob,
    title: f.title.value.trim(),
    company: f.company.value.trim(),
    location: f.location.value.trim() || null,
    remote: f.remote.checked,
    status,
    applied_on: status === 'applied' ? P.today() : undefined,
  }
  for (const b of f.querySelectorAll('button')) b.disabled = true
  const res = await chrome.runtime.sendMessage({ type: 'capture', job })
  for (const b of f.querySelectorAll('button')) b.disabled = false
  if (res?.ok) {
    message(res.created ? `Saved (${res.application.status}).` : res.changed ? `Updated to ${res.application.status}.` : 'Already up to date.')
    showTracked(job)
  } else if (res?.queued) {
    message(`Couldn't reach the tracker, so this was saved to sync later. ${res.error}`, 'error')
  } else {
    message(res?.error || 'Something went wrong.', 'error')
  }
  refreshQueue()
})

$('retry').addEventListener('click', async () => {
  const { synced, remaining } = await chrome.runtime.sendMessage({ type: 'flush' })
  message(remaining ? `Synced ${synced}; ${remaining} still waiting. Is the backend running and are you logged in?` : `Synced ${synced}.`, remaining ? 'error' : 'ok')
  refreshQueue()
})

$('logout').addEventListener('click', async () => {
  await api.logout()
  message('')
  render()
})

$('open').addEventListener('click', async () => {
  chrome.tabs.create({ url: (await getSettings()).appBase })
})

$('toggleSettings').addEventListener('click', () => show($('settings'), $('settings').hidden))

$('settings').addEventListener('submit', async (e) => {
  e.preventDefault()
  const apiBase = e.target.apiBase.value.trim().replace(/\/+$/, '')
  const appBase = e.target.appBase.value.trim().replace(/\/+$/, '')
  // A deployed API is a new host: ask Chrome for permission to call it (must happen on a click).
  const origin = `${new URL(apiBase).origin}/*`
  if (!/^http:\/\/(localhost|127\.0\.0\.1):8000\/\*$/.test(origin)) {
    const granted = await chrome.permissions.request({ origins: [origin] })
    if (!granted) return message(`Permission to reach ${apiBase} was not granted.`, 'error')
  }
  await saveSettings({ apiBase, appBase })
  message('Settings saved.')
  show($('settings'), false)
  render()
})

render()
