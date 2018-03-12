var assert = require('assert')
var renderDraftHeader = require('./partials/draft-header')
var renderDraftLink = require('./partials/draft-link')
var renderLoading = require('./loading')
var renderRefreshNotice = require('./partials/refresh-notice')
var renderRelativeTimestamp = require('./partials/relative-timestamp')
var withProject = require('./with-project')

module.exports = withProject(function (state, send, discoveryKey, publicKey, identifier) {
  state.route = 'mark'
  assert.equal(typeof state, 'object')
  assert.equal(typeof send, 'function')
  assert.equal(typeof discoveryKey, 'string')
  assert.equal(discoveryKey.length, 64)
  assert.equal(typeof publicKey, 'string')
  assert.equal(publicKey.length, 64)
  assert.equal(typeof identifier, 'string')
  assert.equal(identifier.length, 8)
  var main = document.createElement('main')
  if (
    state.markPublicKey !== publicKey ||
    state.markIdentifier !== identifier
  ) {
    main.appendChild(
      renderLoading(function () {
        send('load mark', {
          discoveryKey: discoveryKey,
          publicKey: publicKey,
          identifier: identifier
        })
      })
    )
  } else {
    if (state.changed) {
      main.appendChild(renderRefreshNotice(function () {
        send('reload mark', {discoveryKey, publicKey, identifier})
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
    var body = envelope.message.body
    var brief = state.draftBriefs.find(function (brief) {
      return brief.digest === body.draft
    })
    li.appendChild(renderDraftLink(state, brief))
    li.appendChild(document.createTextNode(' '))
    li.appendChild(renderRelativeTimestamp(brief.timestamp))
  })
  return ol
}