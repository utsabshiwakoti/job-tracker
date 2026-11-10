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

// Which content scripts handle a URL (mirrors manifest.json).
function scriptsFor(url) {
  const host = new URL(url).hostname
  if (host === 'www.linkedin.com') return ['parsers.js', 'common.js', 'linkedin.js']
  if (host.endsWith('.indeed.com')) return ['parsers.js', 'common.js', 'indeed.js']
  return null
}

async function askContentScript(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'extract' }, { frameId: 0 })
  } catch {
    return null // no content script listening on this page
  }
}

// Ask the page's content script for the job. A tab opened before the extension was installed
// or reloaded has no content script yet, so inject it now (allowed by activeTab) and ask again.
// Unsupported sites fall back to the tab's title and URL.
async function detectJob(tab) {
  if (!/^https?:/.test(tab?.url || '')) return null
  let job = await askContentScript(tab.id)
  const files = scriptsFor(tab.url)
  if (!job && files) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files })
      job = await askContentScript(tab.id)
    } catch {
      /* page refused injection; use the fallback below */
    }
  }
  if (job) return job

  const host = new URL(tab.url).hostname.replace(/^www\./, '')
  const site = host === 'linkedin.com' ? 'linkedin' : host.endsWith('indeed.com') ? 'indeed' : null
  const parsed =
    site === 'linkedin' ? P.parseLinkedInTitle(tab.title) : site === 'indeed' ? P.parseIndeedTitle(tab.title) : null
  const canonical =
    site === 'linkedin' ? P.canonicalLinkedIn(tab.url) : site === 'indeed' ? P.canonicalIndeed(tab.url) : null
  return {
    url: canonical || P.stripHash(tab.url),
    title: parsed?.title || P.clean(tab.title),
    company: parsed?.company || '',
    location: parsed?.location || '',
    remote: false,
    source: (site || host).slice(0, 50),
  }
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

const openTracker = async () => chrome.tabs.create({ url: (await getSettings()).appBase })
$('open').addEventListener('click', openTracker)
$('openToLogin').addEventListener('click', openTracker)

// If the dashboard hands over a login while the popup is open, switch views right away.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.token) render()
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
