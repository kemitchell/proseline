/* globals Node */
var assert = require('assert')
var dropCursor = require('prosemirror-dropcursor').dropCursor
var gapCursor = require('prosemirror-gapcursor').gapCursor
var keyMap = require('./key-map')
var menu = require('./menu')
var pmHistory = require('prosemirror-history')
var pmState = require('prosemirror-state')
var pmView = require('prosemirror-view')
var schema = require('./schema')

var Decoration = pmView.Decoration
var DecorationSet = pmView.DecorationSet
var EditorState = pmState.EditorState
var EditorView = pmView.EditorView
var Plugin = pmState.Plugin
var history = pmHistory.history

module.exports = function (options) {
  var element = options.element
  assert(element instanceof Node)
  var content = options.content
  var renderNoteForm = options.renderNoteForm
  assert(!renderNoteForm || typeof renderNoteForm === 'function')
  var renderNote = options.renderNote
  assert(!renderNote || typeof renderNote === 'function')
  var notes = options.notes
  assert(!notes || Array.isArray(notes))

  var doc = content
    ? schema.nodeFromJSON(content)
    : schema.node('doc', null, [
      schema.node('paragraph', null, [])
    ])
  var plugins = [
    menu,
    history(),
    keyMap,
    dropCursor(),
    gapCursor()
  ]
  var ignore = {
    stopEvent: function () { return true },
    ignoreMutation: function () { return true }
  }

  if (renderNoteForm) {
    var inlineNotePlugin = new Plugin({
      props: {
        decorations: function (state) {
          var decorations = []
          var selection = state.selection
          if (!selection.empty) {
            var $to = selection.$to
            var $from = selection.$from
            decorations.push(
              Decoration.widget(
                $to.after(),
                renderNoteForm({range: {start: $from.pos, end: $to.pos}}),
                ignore
              )
            )
            return DecorationSet.create(state.doc, decorations)
          }
        }
      }
    })
    plugins.push(inlineNotePlugin)
  }

  if (notes) {
    var notesPlugin = new Plugin({
      props: {
        decorations: function (state) {
          var decorations = []
          notes.forEach(function (note) {
            var $start = state.doc.resolve(note.message.body.range.start)
            var $end = state.doc.resolve(note.message.body.range.end)
            decorations.push(
              Decoration.widget(
                $end.after(),
                renderNote(note),
                ignore
              )
            )
            decorations.push(
              Decoration.inline(
                $start.pos,
                $end.pos,
                {class: 'highlight'}
              )
            )
          })
          return DecorationSet.create(state.doc, decorations)
        }
      }
    })
    plugins.push(notesPlugin)
  }

  return new EditorView(element, {
    state: EditorState.create({doc, plugins})
  })
}
