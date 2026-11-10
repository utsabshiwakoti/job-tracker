// Thin fetch wrapper: attaches the JWT, parses JSON, and turns API errors into readable messages.

const TOKEN_KEY = 'jobtracker.token'

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable: user just has to log in again next visit */
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

function errorMessage(body, fallback) {
  const detail = body?.detail
  if (typeof detail === 'string') return detail
  // FastAPI validation errors are a list of {loc, msg}
  if (Array.isArray(detail)) {
    return detail.map((d) => `${d.loc?.slice(1).join('.') || 'field'}: ${d.msg}`).join('; ')
  }
  return fallback
}

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (form) {
    payload = new URLSearchParams(form)
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const res = await fetch(`/api${path}`, { method, headers, body: payload })
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(errorMessage(data, `Request failed (${res.status})`), res.status)
  return data
}

export const api = {
  register: (email, password) => request('/auth/register', { method: 'POST', body: { email, password } }),
  login: (email, password) =>
    request('/auth/token', { method: 'POST', form: { username: email, password } }),
  me: () => request('/auth/me'),
  list: ({ q, remote } = {}) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (remote) params.set('remote', 'true')
    const qs = params.toString()
    return request(`/applications${qs ? `?${qs}` : ''}`)
  },
  stats: () => request('/applications/stats'),
  create: (data) => request('/applications', { method: 'POST', body: data }),
  update: (id, data) => request(`/applications/${id}`, { method: 'PATCH', body: data }),
  remove: (id) => request(`/applications/${id}`, { method: 'DELETE' }),
}
