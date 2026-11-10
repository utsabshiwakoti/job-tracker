import { STATUSES } from '../constants'

const SOURCE_LABELS = { linkedin: 'LinkedIn', indeed: 'Indeed' }
const sourceLabel = (s) => SOURCE_LABELS[s] || s

// Kanban-style board. Cards can be dragged between columns (HTML5 drag and drop),
// and the status <select> on each card is the keyboard/touch-friendly alternative.
export default function Board({ applications, onEdit, onMove }) {
  return (
    <div className="board">
      {STATUSES.map((col) => {
        const items = applications.filter((a) => a.status === col.value)
        return (
          <section
            key={col.value}
            className={`column col-${col.value}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = Number(e.dataTransfer.getData('text/plain'))
              if (id) onMove(id, col.value)
            }}
            aria-label={`${col.label} column`}
          >
            <h3>
              {col.label} <span className="count">{items.length}</span>
            </h3>
            {items.map((a) => (
              <article
                key={a.id}
                className="job"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', String(a.id))}
              >
                <button className="job-main" onClick={() => onEdit(a)}>
                  <strong>{a.title}</strong>
                  <span>{a.company}</span>
                </button>
                <div className="tags">
                  {a.source && <span className="tag source">{sourceLabel(a.source)}</span>}
                  {/* skip the Remote tag when the location already says so ("Remote (Canada)") */}
                  {a.remote && !/remote/i.test(a.location || '') && <span className="tag">Remote</span>}
                  {a.location && <span className="tag">{a.location}</span>}
                  {a.applied_on && <span className="tag">{a.applied_on}</span>}
                </div>
                <select
                  aria-label={`Move ${a.title} at ${a.company}`}
                  value={a.status}
                  onChange={(e) => onMove(a.id, e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </article>
            ))}
            {items.length === 0 && <p className="empty">Nothing here</p>}
          </section>
        )
      })}
    </div>
  )
}
