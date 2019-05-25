var SVG = require('../svg')
var assert = require('nanoassert')
var beforeUnload = require('../before-unload')
var initializeEditor = require('../editor')
var onKeyDown = require('./on-key-down')
var renderBookmarkPath = require('./partials/bookmark-path')
var renderDraftHeader = require('./partials/draft-header')
var renderIntro = require('./partials/intro')
var renderLoading = require('./loading')
var renderRefreshNotice = require('./partials/refresh-notice')
var renderRelativeTimestamp = require('./partials/relative-timestamp')
var withProject = require('./with-project')

module.exports = withProject(function (state, send, projectDiscoveryKey, digest) {
  state.route = 'viewer'
  // <main>
  var main = document.createElement('main')
  if (state.draft && state.draft.digest === digest) {
    if (state.changed) {
      main.appendChild(renderRefreshNotice(function () {
        send('reload draft', { projectDiscoveryKey, digest })
      }))
    }
    var draft = state.draft
    var div = document.createElement('div')
    div.className = 'editor'
    var editor = initializeEditor({
      element: div,
      content: draft.innerEnvelope.entry.text,
      renderNoteForm: renderNoteForm.bind(null, state, send),
      renderNote: renderNote.bind(null, state, send),
      notes: state.notesTree,
      renderMarkForm: renderMarkForm.bind(null, state, send),
      dirty: function (dirty) {
        if (dirty) beforeUnload.enable()
        else beforeUnload.disable()
        if (saveForm) {
          saveForm.className = SAVE_FORM_CLASS + ' ' + (dirty ? '' : 'hidden')
        }
        if (bookmarks) {
          bookmarks.setAttributeNS(
            null, 'class', BOOKMARKS_CLASS + ' ' + (dirty ? 'hidden' : '')
          )
        }
      },
      prior: state.parents.length !== 0
        ? state.parents[0].innerEnvelope.entry.text
        : undefined
    })
    div.onkeydown = onKeyDown(editor, [state.draft.digest], state, send)
    var saveForm = renderSaveForm(state, send, editor)
    main.appendChild(renderDraftHeader(state, saveForm))
    main.appendChild(div)
    if (state.projectMarks.filter(function (mark) {
      return mark.innerEnvelope.entry.draft === state.draft.digest
    })) {
      var bookmarkWidth = 50
      var bookmarks = document.createElementNS(SVG, 'svg')
      var marks = state.projectMarks.filter(function (mark) {
        return mark.innerEnvelope.entry.draft === state.draft.digest
      })
      var othersMarks = []
      var ourMarks = []
      marks.forEach(function (mark) {
        (mark.logPublicKey === state.identity.logPublicKey ? ourMarks : othersMarks)
          .push(mark)
      })
      bookmarks.setAttributeNS(null, 'class', BOOKMARKS_CLASS)
      bookmarks.setAttributeNS(null, 'width', bookmarkWidth * 1.5)
      bookmarks.setAttributeNS(null, 'height', bookmarkWidth * 2)
      if (othersMarks.length !== 0) {
        bookmarks.appendChild(renderBookmarkPath(0, 0, 'blue', bookmarkWidth))
      }
      if (ourMarks.length !== 0) {
        bookmarks.appendChild(renderBookmarkPath(bookmarkWidth / 2, 0, 'red', bookmarkWidth))
      }
      main.appendChild(bookmarks)
    }
  } else {
    main.appendChild(
      renderLoading(function () {
        send('load draft', {
          projectDiscoveryKey,
          digest: digest
        })
      })
    )
  }
  return main
})

var SAVE_FORM_CLASS = 'saveDraftForm'
var BOOKMARKS_CLASS = 'bookmarks'

function renderSaveForm (state, send, editor) {
  // <form>
  var form = document.createElement('form')
  form.className = SAVE_FORM_CLASS + ' hidden'
  form.addEventListener('submit', function (event) {
    event.preventDefault()
    event.stopPropagation()
    send('save', {
      projectDiscoveryKey: state.projectDiscoveryKey,
      text: editor.state.doc.toJSON(),
      parents: [state.draft.digest]
    })
  })

  // <button>
  var save = document.createElement('button')
  form.appendChild(save)
  save.className = 'button'
  save.appendChild(document.createTextNode('Save'))
  return form
}

var SEPARATOR = '\n\n'

function renderText (text) {
  var fragment = document.createDocumentFragment()
  text
    .split(SEPARATOR)
    .forEach(function (line) {
      // <p>
      var p = document.createElement('p')
      fragment.appendChild(p)
      p.appendChild(document.createTextNode(line))
    })
  return fragment
}

function renderMarkForm (state, send) {
  // <form>
  var form = document.createElement('form')
  form.id = 'markDraft'
  form.addEventListener('submit', function (event) {
    event.preventDefault()
    event.stopPropagation()
    var name = input.value
    var continuing = marksICanMove.find(function (mark) {
      return mark.innerEnvelope.entry.name === name
    })
    send('mark', {
      name: name,
      identifier: continuing
        ? continuing.innerEnvelope.entry.identifier
        : null
    })
  })

  // <input>
  var input = document.createElement('input')
  input.required = true
  form.appendChild(input)

  var marksICanMove = state.projectMarks.filter(function (mark) {
    return (
      mark.logPublicKey === state.identity.logPublicKey &&
      mark.innerEnvelope.entry.draft !== state.draft.digest
    )
  })
  if (marksICanMove.length !== 0) {
    // <datalist>
    var datalist = document.createElement('datalist')
    form.appendChild(datalist)
    datalist.id = 'marksICanMove'
    input.setAttribute('list', datalist.id)
    marksICanMove.forEach(function (mark) {
      var option = document.createElement('option')
      datalist.appendChild(option)
      option.value = mark.innerEnvelope.entry.name
    })
  }

  // <button>
  var button = document.createElement('button')
  button.type = 'submit'
  button.appendChild(document.createTextNode('Put a mark on this draft.'))
  form.appendChild(button)

  return form
}

function renderNote (state, send, note) {
  // <aside>
  var aside = document.createElement('aside')
  aside.className = 'note'
  aside.id = note.digest
  var replyTo = state.replyTo

  // <p>
  var p = document.createElement('p')
  p.className = 'byline'
  p.appendChild(renderIntro(state, note.logPublicKey))
  p.appendChild(document.createTextNode(' '))
  p.appendChild(renderRelativeTimestamp(note.innerEnvelope.entry.timestamp))
  p.appendChild(document.createTextNode(':'))
  aside.appendChild(p)

  // <blockquote>
  var blockquote = document.createElement('blockquote')
  aside.appendChild(blockquote)
  blockquote.appendChild(renderText(note.innerEnvelope.entry.text))

  if (replyTo === note.digest) {
    aside.appendChild(renderNoteForm(state, send, { parent: note.digest }))
  } else {
    // <button>
    var button = document.createElement('button')
    aside.appendChild(button)
    button.addEventListener('click', function () {
      send('reply to', note.digest)
    })
    button.appendChild(document.createTextNode('Reply to this note.'))
  }

  if (note.children.length !== 0) {
    // <ol>
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
  assert(typeof send === 'function')

  // <form>
  var form = document.createElement('form')
  form.className = 'noteForm'
  form.addEventListener('submit', function (event) {
    event.preventDefault()
    event.stopPropagation()
    send('note', { parent, range, text: textarea.value })
  })

  // <textarea>
  var textarea = document.createElement('textarea')
  form.appendChild(textarea)
  textarea.required = true
  textarea.rows = 3
  textarea.autofocus = false

  // <button>
  var button = document.createElement('button')
  form.appendChild(button)
  button.type = 'submit'
  button.appendChild(
    document.createTextNode(
      parent ? 'Add your reply.' : 'Add your note.'
    )
  )

  return form
}
