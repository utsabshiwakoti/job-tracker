// Pure helpers with no DOM or chrome.* access, so they can be unit-tested in Node.
// Loaded as a classic content script, imported by the service worker, and require()'d by tests.
;(function (root) {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()

  const safeUrl = (href) => {
    try {
      return new URL(href)
    } catch {
      return null
    }
  }

  // LinkedIn: /jobs/view/4012345678/ or /jobs/view/junior-dev-at-acme-4012345678,
  // or a search/collections page with ?currentJobId=4012345678 (job shown in the right pane).
  function linkedinJobId(href) {
    const u = safeUrl(href)
    if (!u) return null
    const m = u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/)
    return m ? m[1] : u.searchParams.get('currentJobId')
  }

  function canonicalLinkedIn(href) {
    const id = linkedinJobId(href)
    return id ? `https://www.linkedin.com/jobs/view/${id}/` : null
  }

  // Indeed: /viewjob?jk=abc123, or a search page with ?vjk=abc123 for the selected job.
  function indeedJobKey(href) {
    const u = safeUrl(href)
    return u ? u.searchParams.get('jk') || u.searchParams.get('vjk') : null
  }

  function canonicalIndeed(href) {
    const u = safeUrl(href)
    const jk = indeedJobKey(href)
    return u && jk ? `${u.origin}/viewjob?jk=${encodeURIComponent(jk)}` : null
  }

  function stripHash(href) {
    const u = safeUrl(href)
    if (!u) return href
    u.hash = ''
    return u.toString()
  }

  // "(3) Junior Developer | Acme | LinkedIn" -> { title, company }
  function parseLinkedInTitle(docTitle) {
    const parts = clean(docTitle).replace(/^\(\d+\)\s*/, '').split(' | ')
    if (parts.length >= 3 && /linkedin/i.test(parts[parts.length - 1])) {
      return { title: parts[0], company: parts[1] }
    }
    return null
  }

  // "Junior Developer - Acme Inc - Halifax, NS | Indeed.com" -> { title, company, location }
  function parseIndeedTitle(docTitle) {
    const main = clean(docTitle).replace(/\s*\|\s*Indeed.*$/i, '')
    const parts = main.split(' - ')
    if (parts.length < 2) return null
    return {
      title: stripJobPost(parts[0]),
      company: parts[1],
      location: parts.slice(2).join(' - ') || '',
    }
  }

  // Indeed's heading reads "Junior Developer - job post"
  const stripJobPost = (s) => clean(s).replace(/\s*-\s*job post$/i, '')

  const detectRemote = (text) => /\bremote\b/i.test(text || '')

  const isApplicationSentText = (text) =>
    /your application was sent|application sent|your application has been submitted|application submitted/i.test(
      text || '',
    )

  // YYYY-MM-DD in the user's own timezone (toISOString would use UTC and can be off by a day).
  const today = () => new Date().toLocaleDateString('en-CA')

  const P = {
    clean,
    linkedinJobId,
    canonicalLinkedIn,
    indeedJobKey,
    canonicalIndeed,
    stripHash,
    parseLinkedInTitle,
    parseIndeedTitle,
    stripJobPost,
    detectRemote,
    isApplicationSentText,
    today,
  }
  root.JTParsers = P
  if (typeof module === 'object' && module.exports) module.exports = P
})(globalThis)
