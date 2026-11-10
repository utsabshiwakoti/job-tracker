// API client shared by the popup and the background worker. Requests from extension pages
// to hosts listed in host_permissions are not subject to CORS, so the backend needs no changes.

const DEFAULTS = { apiBase: 'http://localhost:8000', appBase: 'http://localhost:5173' }

export async function getSettings() {
  const stored = await chrome.storage.local.get(['apiBase', 'appBase', 'token', 'email'])
  return { ...DEFAULTS, ...Object.fromEntries(Object.entries(stored).filter(([, v]) => v)) }
}

export const saveSettings = (patch) => chrome.storage.local.set(patch)

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

function errorMessage(body, fallback) {
  const detail = body?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => `${d.loc?.slice(1).join('.')}: ${d.msg}`).join('; ')
  return fallback
}

async function request(path, { method = 'GET', body, form } = {}) {
  const { apiBase, token } = await getSettings()
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (form) payload = new URLSearchParams(form)
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(`${apiBase.replace(/\/+$/, '')}/api${path}`, { method, headers, body: payload })
  } catch {
    throw new ApiError(`Can't reach the tracker at ${apiBase}. Is the backend running?`, 0)
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (res.status === 401 && token) await chrome.storage.local.remove('token')
  if (!res.ok) throw new ApiError(errorMessage(data, `Request failed (${res.status})`), res.status)
  return data
}

export const api = {
  async login(email, password) {
    const { access_token } = await request('/auth/token', { method: 'POST', form: { username: email, password } })
    await saveSettings({ token: access_token, email })
  },
  logout: () => chrome.storage.local.remove(['token', 'email']),
  me: () => request('/auth/me'),
  capture: (job) => request('/applications/capture', { method: 'POST', body: job }),
  async lookup(url) {
    try {
      return await request(`/applications/lookup?url=${encodeURIComponent(url)}`)
    } catch (err) {
      if (err.status === 404) return null
      throw err
    }
  },
}
