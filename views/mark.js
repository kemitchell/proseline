var assert = require('assert')
var renderDraftHeader = require('./partials/draft-header')
var renderDraftLink = require('./partials/draft-link')
var renderLoading = require('./loading')
var renderRefreshNotice = require('./partials/refresh-notice')
var renderRelativeTimestamp = require('./partials/relative-timestamp')
var withProject = require('./with-project')

module.exports = withProject(function (state, send, projectDiscoveryKey, publicKey, identifier) {
  state.route = 'mark'
  assert.strictEqual(typeof state, 'object')
  assert.strictEqual(typeof send, 'function')
  assert.strictEqual(typeof projectDiscoveryKey, 'string')
  assert.strictEqual(projectDiscoveryKey.length, 64)
  assert.strictEqual(typeof publicKey, 'string')
  assert.strictEqual(publicKey.length, 64)
  assert.strictEqual(typeof identifier, 'string')
  assert.strictEqual(identifier.length, 8)
  var main = document.createElement('main')
  if (
    state.markPublicKey !== publicKey ||
    state.markIdentifier !== identifier
  ) {
    main.appendChild(
      renderLoading(function () {
        send('load mark', {
          projectDiscoveryKey,
          publicKey: publicKey,
          identifier: identifier
        })
      })
    )
  } else {
    if (state.changed) {
      main.appendChild(renderRefreshNotice(function () {
        send('reload mark', { projectDiscoveryKey, publicKey, identifier })
      }))
    }
    main.appendChild(renderDraftHeader(state))

    var section = document.createElement('section')
    main.appendChild(section)

    var h2 = document.createElement('h2')
    section.appendChild(h2)
    h2.appendChild(document.createTextNode('Mark History'))

    section.appendChild(renderMarkHistory(state))
  }
  return main
})

function renderMarkHistory (state) {
  var ol = document.createElement('ol')
  ol.className = 'activity'
  state.markHistory.forEach(function (envelope) {
    var li = document.createElement('li')
    ol.appendChild(li)
    var body = envelope.innerEnvelope.entry
    var brief = state.draftBriefs.find(function (brief) {
      return brief.digest === body.draft
    })
    li.appendChild(renderDraftLink(state, brief))
    li.appendChild(document.createTextNode(' '))
    li.appendChild(renderRelativeTimestamp(brief.timestamp))
  })
  return ol
}
