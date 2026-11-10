// Run with: node --test extension/test/parsers.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const P = require('../parsers.js')

test('LinkedIn job id from view, slug and search URLs', () => {
  assert.equal(P.linkedinJobId('https://www.linkedin.com/jobs/view/4012345678/'), '4012345678')
  assert.equal(P.linkedinJobId('https://www.linkedin.com/jobs/view/junior-developer-at-acme-4012345678?trk=x'), '4012345678')
  assert.equal(P.linkedinJobId('https://www.linkedin.com/jobs/search/?currentJobId=4099&keywords=dev'), '4099')
  assert.equal(P.linkedinJobId('https://www.linkedin.com/feed/'), null)
  assert.equal(P.canonicalLinkedIn('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=55'), 'https://www.linkedin.com/jobs/view/55/')
})

test('Indeed job key from viewjob and search URLs', () => {
  assert.equal(P.canonicalIndeed('https://ca.indeed.com/viewjob?jk=abc123&from=serp'), 'https://ca.indeed.com/viewjob?jk=abc123')
  assert.equal(P.canonicalIndeed('https://ca.indeed.com/jobs?q=developer&l=Halifax&vjk=def456'), 'https://ca.indeed.com/viewjob?jk=def456')
  assert.equal(P.canonicalIndeed('https://ca.indeed.com/'), null)
})

test('page title fallbacks', () => {
  assert.deepEqual(P.parseLinkedInTitle('(3) Junior Developer | Acme Inc. | LinkedIn'), { title: 'Junior Developer', company: 'Acme Inc.' })
  assert.equal(P.parseLinkedInTitle('Feed | LinkedIn'), null)
  assert.deepEqual(P.parseIndeedTitle('Junior Developer - Acme Inc - Halifax, NS | Indeed.com'), {
    title: 'Junior Developer',
    company: 'Acme Inc',
    location: 'Halifax, NS',
  })
  assert.equal(P.stripJobPost('Junior Developer\n - job post'), 'Junior Developer')
})

test('remote and confirmation detection', () => {
  assert.ok(P.detectRemote('Remote in Halifax, NS'))
  assert.ok(!P.detectRemote('Halifax, NS (On-site)'))
  assert.ok(P.isApplicationSentText('Your application was sent to Acme!'))
  assert.ok(P.isApplicationSentText('Your application has been submitted!'))
  assert.ok(!P.isApplicationSentText('Review your application'))
})

test('today is local YYYY-MM-DD', () => {
  assert.match(P.today(), /^\d{4}-\d{2}-\d{2}$/)
})
