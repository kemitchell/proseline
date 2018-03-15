var assert = require('assert')
var initializeEditor = require('../editor')
var renderDraftHeader = require('./partials/draft-header')
var renderExpandingTextArea = require('./partials/expanding-textarea')
var renderIntro = require('./partials/intro')
var renderLoading = require('./loading')
var renderRefreshNotice = require('./partials/refresh-notice')
var renderRelativeTimestamp = require('./partials/relative-timestamp')
var withProject = require('./with-project')

module.exports = withProject(function (state, send, discoveryKey, digest) {
  state.route = 'viewer'
  var main = document.createElement('main')
  if (state.draft && state.draft.digest === digest) {
    if (state.changed) {
      main.appendChild(renderRefreshNotice(function () {
        send('reload draft', {discoveryKey, digest})
      }))
    }
    main.appendChild(renderDraftHeader(state))
    main.appendChild(renderDraft(state, send))
  } else {
    main.appendChild(
      renderLoading(function () {
        send('load draft', {
          discoveryKey: discoveryKey,
          digest: digest
        })
      })
    )
  }
  return main
})

function renderDraft (state, send) {
  var draft = state.draft
  var fragment = document.createDocumentFragment()
  if (state.diff) {
    state.diff.changes.forEach(function (change) {
      var p = document.createElement('p')
      var text = document.createTextNode(change.value)
      if (change.added) {
        var ins = document.createElement('ins')
        ins.appendChild(text)
        p.appendChild(ins)
      } else if (change.removed) {
        var del = document.createElement('del')
        del.appendChild(text)
        p.appendChild(del)
      } else {
        p.appendChild(text)
      }
      fragment.appendChild(p)
    })
  } else {
    var div = document.createElement('div')
    fragment.appendChild(div)
    div.className = 'editor'
    initializeEditor({
      element: div,
      content: draft.message.body.text,
      renderNoteForm: renderNoteForm.bind(null, state, send),
      renderNote: renderNote.bind(null, state, send),
      notes: state.notesTree,
      renderMarkForm: renderMarkForm.bind(null, state, send)
    })
  }
  return fragment
}

var SEPARATOR = '\n\n'

function renderText (text, notes, textSelection) {
  notes = notes || []
  var fragment = document.createDocumentFragment()
  var offset = 0
  text
    .split(SEPARATOR)
    .forEach(function (line) {
      // Create <p>.
      var p = document.createElement('p')
      fragment.appendChild(p)
      p.dataset.start = offset
      p.dataset.end = offset + line.length

      var items = []
      line
        .split('')
        .forEach(function (character, relativeIndex) {
          var last = items.length ? items[items.length - 1] : false
          var absoluteIndex = relativeIndex + offset
          var inHighlighted = notes
            .map(function (note) {
              return note.message.body.range
            })
            .some(function (range) {
              return (
                range.start <= absoluteIndex &&
                absoluteIndex < range.end
              )
            })
          if (inHighlighted) {
            if (last && last.marked) {
              last.string = last.string + character
            } else {
              items.push({
                string: character,
                marked: true,
                start: absoluteIndex
              })
            }
          } else {
            if (last && !last.marked) {
              last.string = last.string + character
            } else {
              items.push({
                string: character,
                marked: false,
                start: absoluteIndex
              })
            }
          }
        })
      items.forEach(function (item) {
        var child = document.createElement(
          item.marked ? 'mark' : 'span'
        )
        child.appendChild(document.createTextNode(item.string))
        child.dataset.start = item.start
        p.appendChild(child)
      })

      offset += line.length + SEPARATOR.length
    })
  return fragment
}

function renderMarkForm (state, send) {
  var form = document.createElement('form')
  form.id = 'markDraft'
  form.addEventListener('submit', function (event) {
    event.preventDefault()
    event.stopPropagation()
    var name = input.value
    var continuing = marksICanMove.find(function (mark) {
      return mark.message.body.name === name
    })
    send('mark', {
      name: name,
      identifier: continuing
        ? continuing.message.body.identifier
        : null
    })
  })

  var input = document.createElement('input')
  input.required = true
  form.appendChild(input)

  var marksICanMove = state.projectMarks.filter(function (mark) {
    return (
      mark.publicKey === state.identity.publicKey &&
      mark.message.body.draft !== state.draft.digest
    )
  })
  if (marksICanMove.length !== 0) {
    var datalist = document.createElement('datalist')
    form.appendChild(datalist)
    datalist.id = 'marksICanMove'
    input.setAttribute('list', datalist.id)
    marksICanMove.forEach(function (mark) {
      var option = document.createElement('option')
      datalist.appendChild(option)
      option.value = mark.message.body.name
    })
  }

  var button = document.createElement('button')
  button.type = 'submit'
  button.appendChild(document.createTextNode('Put a mark on this draft.'))
  form.appendChild(button)

  return form
}

function renderNote (state, send, note) {
  var aside = document.createElement('aside')
  aside.className = 'note'
  aside.id = note.digest
  var replyTo = state.replyTo
  // <p>
  var p = document.createElement('p')
  p.className = 'byline'
  p.appendChild(renderIntro(state, note.publicKey))
  p.appendChild(document.createTextNode(' '))
  p.appendChild(renderRelativeTimestamp(note.message.body.timestamp))
  p.appendChild(document.createTextNode(':'))
  aside.appendChild(p)
  // <blockquote>
  var blockquote = document.createElement('blockquote')
  blockquote.appendChild(renderText(note.message.body.text))
  aside.appendChild(blockquote)
  if (replyTo === note.digest) {
    aside.appendChild(renderNoteForm(state, send, {parent: note.digest}))
  } else {
    // <button>
    var button = document.createElement('button')
    button.addEventListener('click', function () {
      send('reply to', note.digest)
    })
    button.appendChild(document.createTextNode('Reply to this note.'))
    aside.appendChild(button)
  }
  if (note.children.length !== 0) {
    var ol = document.createElement('ol')
    note.children.forEach(function (child) {
      ol.appendChild(renderNote(state, send, child))
    })
    aside.appendChild(ol)
  }
  return aside
}

function renderNoteForm (state, send, options) {
  options = options || {}
  var parent = options.parent
  var range = options.range
  var selected = options.selected
  assert(typeof state, 'object')
  assert(!parent || typeof parent === 'string')
  assert(
    !range ||
    (
      typeof range === 'object' &&
      range.hasOwnProperty('start') &&
      range.hasOwnProperty('end')
    )
  )
  assert(!selected || typeof selected === 'string')
  assert.equal(typeof send, 'function')
  var form = document.createElement('form')
  form.className = 'noteForm'
  form.addEventListener('submit', function (event) {
    event.preventDefault()
    event.stopPropagation()
    send('note', {
      parent,
      range,
      text: textarea.value
    })
  })
  // <textarea>
  var textarea = renderExpandingTextArea()
  textarea.required = true
  textarea.autofocus = false
  form.appendChild(textarea)
  // <button>
  var button = document.createElement('button')
  button.type = 'submit'
  button.appendChild(
    document.createTextNode(
      parent ? 'Add your reply.' : 'Add your note.'
    )
  )
  form.appendChild(button)
  return form
}
