// Runs on the Job Tracker dashboard. When you log in there, hand the session to the extension
// so you don't have to log in twice. Only this page's own token is read, and the background
// worker checks it with the API before using it.
;(function () {
  const TOKEN_KEY = 'jobtracker.token' // same key as frontend/src/api.js
  let lastSent = null

  function readToken() {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  }

  function sync() {
    const token = readToken()
    if (!token || token === lastSent) return
    lastSent = token
    chrome.runtime.sendMessage({ type: 'syncToken', token }).catch(() => {
      lastSent = null // extension was reloaded; try again next tick
    })
  }

  sync()
  // Logging in doesn't reload the page, and same-tab localStorage writes fire no event,
  // so check every couple of seconds. It's one string read, so this costs nothing.
  setInterval(sync, 2000)
})()
