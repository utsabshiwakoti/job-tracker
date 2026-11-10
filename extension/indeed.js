// Indeed: read the job on the page. Clicking "Apply" saves it to Wishlist and remembers it;
// when Indeed's apply flow (smartapply.indeed.com) shows its confirmation, it's marked applied.
;(function () {
  const P = globalThis.JTParsers
  const isTopFrame = window.top === window
  const onSmartApply = location.hostname.startsWith('smartapply.')

  const TITLE = [
    '[data-testid="jobsearch-JobInfoHeader-title"]',
    'h1.jobsearch-JobInfoHeader-title',
    '.jobsearch-JobInfoHeader-title',
  ]
  const COMPANY = [
    '[data-testid="inlineHeader-companyName"]',
    '[data-company-name="true"]',
    '.jobsearch-CompanyInfoContainer a',
  ]
  const LOCATION = [
    '[data-testid="inlineHeader-companyLocation"]',
    '[data-testid="job-location"]',
    '[data-testid="jobsearch-JobInfoHeader-companyLocation"]',
  ]

  function extract() {
    // On search results the selected job is shown in a side pane.
    const root = document.querySelector('#jobsearch-ViewjobPaneWrapper, .jobsearch-ViewJobLayout') || document
    const fromTitle = P.parseIndeedTitle(document.title)
    const title = P.stripJobPost(JT.firstText(TITLE, root)) || fromTitle?.title || ''
    const company = JT.firstText(COMPANY, root) || fromTitle?.company || ''
    const loc = JT.firstText(LOCATION, root) || fromTitle?.location || ''
    return {
      url: P.canonicalIndeed(location.href) || P.stripHash(location.href),
      title,
      company,
      location: loc,
      remote: P.detectRemote(loc),
      source: 'indeed',
    }
  }

  if (!onSmartApply && isTopFrame) {
    JT.listen(extract)

    // Capture phase so we see the click even if the site stops it from bubbling.
    document.addEventListener(
      'click',
      async (e) => {
        const btn = e.target.closest('button, a')
        if (!btn) return
        const label = P.clean(btn.innerText || btn.getAttribute('aria-label'))
        if (!/^apply\b/i.test(label)) return // "Apply now", "Apply on company site"
        const job = extract()
        if (!job.title || !job.company) return
        JT.showResult(await JT.send({ type: 'pending', job }), job)
      },
      true,
    )
  }

  if (onSmartApply) {
    let done = false
    const check = () => {
      if (done) return
      const text = P.clean(document.body?.innerText).slice(0, 3000)
      if (/post-apply/i.test(location.pathname) || P.isApplicationSentText(text)) {
        done = true
        JT.send({ type: 'pendingApplied', applied_on: P.today() }).then((res) =>
          JT.showResult(res, res?.application),
        )
      }
    }
    check()
    JT.onDomSettled(check, 600)
  }
})()
