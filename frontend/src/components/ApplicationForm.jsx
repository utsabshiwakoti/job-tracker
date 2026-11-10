import { useState } from 'react'
import { STATUSES } from '../constants'

const EMPTY = {
  company: '',
  title: '',
  status: 'wishlist',
  location: '',
  remote: false,
  url: '',
  salary_note: '',
  notes: '',
  applied_on: '',
}

// Modal form used for both "add" (initial = null) and "edit".
export default function ApplicationForm({ initial, onSave, onClose, onDelete }) {
  const [form, setForm] = useState(() => (initial ? { ...EMPTY, ...clean(initial) } : EMPTY))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    // Empty strings become null so the API stores "no value" rather than "".
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]))
    try {
      await onSave(body)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal card" onSubmit={submit} role="dialog" aria-modal="true" aria-label={initial ? 'Edit application' : 'Add application'}>
        <h2>{initial ? 'Edit application' : 'Add application'}</h2>
        <div className="grid2">
          <label>
            Company *
            <input value={form.company} onChange={set('company')} required maxLength={200} autoFocus />
          </label>
          <label>
            Job title *
            <input value={form.title} onChange={set('title')} required maxLength={200} />
          </label>
          <label>
            Status
            <select value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          <label>
            Date applied
            <input type="date" value={form.applied_on} onChange={set('applied_on')} />
          </label>
          <label>
            Location
            <input value={form.location} onChange={set('location')} maxLength={200} placeholder="Halifax, NS" />
          </label>
          <label>
            Salary / pay note
            <input value={form.salary_note} onChange={set('salary_note')} maxLength={100} placeholder="$55–65k" />
          </label>
        </div>
        <label>
          Posting URL
          <input type="url" value={form.url} onChange={set('url')} maxLength={500} placeholder="https://…" />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.remote} onChange={set('remote')} /> Remote
        </label>
        <label>
          Notes
          <textarea rows={4} value={form.notes} onChange={set('notes')} placeholder="Contacts, follow-up dates, interview questions…" />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="actions">
          {initial && (
            <button type="button" className="danger" onClick={onDelete}>Delete</button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}

function clean(app) {
  // Keep only editable fields and turn nulls into '' for controlled inputs.
  return Object.fromEntries(
    Object.keys(EMPTY).map((k) => [k, app[k] ?? EMPTY[k]]),
  )
}
