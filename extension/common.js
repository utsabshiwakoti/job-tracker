// Shared content-script helpers: reading the page, talking to the background worker, and toasts.
;(function () {
  const P = globalThis.JTParsers

  function firstText(selectors, root = document) {
    for (const sel of selectors) {
      const el = root.querySelector(sel)
      const text = el && P.clean(el.innerText || el.textContent)
      if (text) return text
    }
    return ''
  }

  async function send(message) {
    try {
      return await chrome.runtime.sendMessage(message)
    } catch {
      return { ok: false, error: 'Extension was reloaded. Refresh this page.' }
    }
  }

  // Small notice in the corner of the page. Shadow DOM keeps the site's CSS from restyling it.
  function toast(text, kind = 'ok') {
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px'
    const shadow = host.attachShadow({ mode: 'closed' })
    const colors = { ok: '#12b76a', warn: '#f59e0b', error: '#e5484d' }
    shadow.innerHTML = `<div style="font:14px system-ui,sans-serif;background:#1c2330;color:#fff;
      padding:10px 14px;border-radius:10px;border-left:4px solid ${colors[kind] || colors.ok};
      box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:320px"></div>`
    shadow.firstElementChild.textContent = text
    document.documentElement.appendChild(host)
    setTimeout(() => host.remove(), 5000)
  }

  function showResult(res, job) {
    if (!res) return
    const what = job ? `${job.title} at ${job.company}` : 'this job'
    if (res.ok) {
      const status = res.application?.status
      if (res.created) toast(`Job Tracker: saved ${what} (${status})`)
      else if (res.changed) toast(`Job Tracker: updated ${what} to ${status}`)
    } else if (res.queued) {
      toast(`Job Tracker: couldn't reach the tracker, so ${what} will sync later. ${res.needsLogin ? 'Log in from the extension.' : ''}`, 'warn')
    } else if (res.error && res.error !== 'no-pending') {
      toast(`Job Tracker: ${res.error}`, 'error')
    }
  }

  async function capture(job, status) {
    if (!job.title || !job.company) {
      toast("Job Tracker: couldn't read this job's details. Open the extension to save it.", 'warn')
      return
    }
    const payload = { ...job, status }
    if (status === 'applied') payload.applied_on = P.today()
    showResult(await send({ type: 'capture', job: payload }), job)
  }

  // Answer the popup's "what job is on this page?" question.
  function listen(extract) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'extract') sendResponse(extract())
    })
  }

  // Run fn shortly after the page stops changing (sites like LinkedIn re-render constantly).
  function onDomSettled(fn, delay = 400) {
    let timer
    new MutationObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(fn, delay)
    }).observe(document.documentElement, { childList: true, subtree: true })
  }

  globalThis.JT = { firstText, send, toast, showResult, capture, listen, onDomSettled }
})()
