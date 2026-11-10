// LinkedIn: read the job in the details pane, and log it as applied when Easy Apply confirms.
;(function () {
  const P = globalThis.JTParsers

  // LinkedIn renames its CSS classes often, so each field has several fallbacks,
  // ending with the page title. The popup lets you fix anything that comes back wrong.
  const TOP_CARD = [
    '.job-details-jobs-unified-top-card__container--two-pane',
    '.job-details-jobs-unified-top-card__container',
    '.jobs-unified-top-card',
    '.jobs-details__main-content',
    '.top-card-layout', // logged-out public job page
  ]
  const TITLE = [
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title',
    '.top-card-layout__title',
    'h1',
  ]
  const COMPANY = [
    '.job-details-jobs-unified-top-card__company-name a',
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name',
    '.topcard__org-name-link',
  ]
  const LOCATION = [
    '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
    '.job-details-jobs-unified-top-card__tertiary-description-container span',
    '.jobs-unified-top-card__bullet',
    '.topcard__flavor--bullet',
  ]

  function topCard() {
    for (const sel of TOP_CARD) {
      const el = document.querySelector(sel)
      if (el) return el
    }
    return null
  }

  function extract() {
    const card = topCard()
    const root = card || document
    const fromTitle = P.parseLinkedInTitle(document.title)
    const title = JT.firstText(TITLE, root) || fromTitle?.title || ''
    const company = JT.firstText(COMPANY, root) || fromTitle?.company || ''
    const loc = JT.firstText(LOCATION, root).replace(/\s*·.*$/, '') // "Halifax, NS · 2 days ago" -> "Halifax, NS"
    // Workplace type ("Remote" / "Hybrid" / "On-site") is shown as a pill in the top card.
    const cardText = card ? P.clean(card.innerText).slice(0, 600) : ''
    return {
      url: P.canonicalLinkedIn(location.href) || P.stripHash(location.href),
      title,
      company,
      location: loc,
      remote: P.detectRemote(`${loc} ${cardText}`),
      source: 'linkedin',
    }
  }

  // Easy Apply ends with a dialog like "Your application was sent to Acme!"
  const logged = new Set()
  function checkForConfirmation() {
    const boxes = document.querySelectorAll('[role="dialog"], .artdeco-modal, .artdeco-toast-item')
    for (const box of boxes) {
      if (P.isApplicationSentText(P.clean(box.innerText).slice(0, 400))) {
        const job = extract()
        if (logged.has(job.url)) return
        logged.add(job.url)
        JT.capture(job, 'applied')
        return
      }
    }
  }

  JT.listen(extract)
  JT.onDomSettled(checkForConfirmation)
})()
