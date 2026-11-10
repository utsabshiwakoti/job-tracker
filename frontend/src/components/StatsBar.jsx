import { pct } from '../constants'

export default function StatsBar({ stats }) {
  if (!stats) return null
  const submitted = stats.total - stats.by_status.wishlist
  const items = [
    ['Tracked', stats.total],
    ['Submitted', submitted],
    ['Interviews', stats.by_status.interview + stats.by_status.offer],
    ['Response rate', pct(stats.response_rate)],
    ['Interview rate', pct(stats.interview_rate)],
  ]
  return (
    <section className="stats" aria-label="Summary">
      {items.map(([label, value]) => (
        <div key={label} className="stat">
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </section>
  )
}
