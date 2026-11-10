import { useCallback, useEffect, useState } from 'react'
import { api, getToken, setToken } from './api'
import AuthForm from './components/AuthForm'
import Board from './components/Board'
import ApplicationForm from './components/ApplicationForm'
import StatsBar from './components/StatsBar'

export default function App() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(!!getToken())

  const loadUser = useCallback(async () => {
    try {
      setUser(await api.me())
    } catch {
      setToken(null) // expired or invalid token
      setUser(null)
    } finally {
      setChecking(false)
    }
  }, [])

  // `checking` starts true only when a stored token exists, so this runs once on page load.
  useEffect(() => {
    if (checking) loadUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  if (checking) return <p className="center muted">Loading…</p>
  if (!user) return <AuthForm onAuthed={loadUser} />
  return <Dashboard user={user} onLogout={logout} />
}

function Dashboard({ user, onLogout }) {
  const [applications, setApplications] = useState([])
  const [stats, setStats] = useState(null)
  const [query, setQuery] = useState('')
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [editing, setEditing] = useState(null) // null = closed, {} = new, {id,...} = existing
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([api.list({ q: query, remote: remoteOnly }), api.stats()])
      setApplications(list)
      setStats(s)
      setError('')
    } catch (err) {
      if (err.status === 401) return onLogout()
      setError(err.message)
    }
  }, [query, remoteOnly, onLogout])

  // Debounce the search box so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(refresh, 250)
    return () => clearTimeout(t)
  }, [refresh])

  async function save(body) {
    if (editing?.id) await api.update(editing.id, body)
    else await api.create(body)
    setEditing(null)
    refresh()
  }

  async function remove() {
    if (!window.confirm(`Delete "${editing.title}" at ${editing.company}? This can't be undone.`)) return
    await api.remove(editing.id)
    setEditing(null)
    refresh()
  }

  async function move(id, status) {
    const current = applications.find((a) => a.id === id)
    if (!current || current.status === status) return
    // Optimistic update so the card jumps immediately; refresh() reconciles with the server.
    setApplications((list) => list.map((a) => (a.id === id ? { ...a, status } : a)))
    try {
      // First time a job moves to "applied", stamp today's date if none is set.
      const patch = { status }
      if (status === 'applied' && !current.applied_on) patch.applied_on = new Date().toLocaleDateString('en-CA')
      await api.update(id, patch)
    } catch (err) {
      setError(err.message)
    }
    refresh()
  }

  return (
    <div className="app">
      <header>
        <h1>Job Tracker</h1>
        <div className="header-right">
          <span className="muted">{user.email}</span>
          <button onClick={onLogout}>Log out</button>
        </div>
      </header>

      <StatsBar stats={stats} />

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search company, title or notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search applications"
        />
        <label className="check">
          <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} /> Remote only
        </label>
        <button className="primary" onClick={() => setEditing({})}>+ Add application</button>
      </div>

      {error && <p role="alert" className="error">{error}</p>}

      {stats && stats.total === 0 && !query && !remoteOnly ? (
        <p className="center muted">No applications yet. Add your first one to get started.</p>
      ) : (
        <Board applications={applications} onEdit={setEditing} onMove={move} />
      )}

      {editing && (
        <ApplicationForm
          key={editing.id ?? 'new'}
          initial={editing.id ? editing : null}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
