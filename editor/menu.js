var commands = require('./commands')
var eachHeadingLevel = require('./each-heading-level')
var pmMenu = require('prosemirror-menu')
var schema = require('./schema')

var Dropdown = pmMenu.Dropdown
var MenuItem = pmMenu.MenuItem
var icons = pmMenu.icons

module.exports = pmMenu.menuBar({
  floating: true,
  content: [
    [
      new MenuItem({
        title: 'Strong',
        label: 'Strong',
        icon: icons.strong,
        active: function (state) {
          return isMarkActive(state, schema.marks.strong)
        },
        enable: function (state) {
          return !state.selection.empty
        },
        run: commands.strong
      }),
      new MenuItem({
        title: 'Emphasis',
        label: 'Emphasis',
        icon: icons.em,
        active: function (state) {
          return isMarkActive(state, schema.marks.em)
        },
        enable: function (state) {
          return !state.selection.empty
        },
        run: commands.em
      }),
      new MenuItem({
        title: 'Code',
        label: 'Code',
        icon: icons.code,
        active: function (state) {
          return isMarkActive(state, schema.marks.code)
        },
        enable: function (state) {
          return !state.selection.empty
        },
        run: commands.code
      })
    ],
    [
      new MenuItem({
        title: 'Rule',
        label: 'Rule',
        icon: icons.rule,
        enable: commands.hr,
        run: commands.hr
      }),
      new Dropdown(
        eachHeadingLevel(function (level) {
          var name = 'h' + level
          return new MenuItem({
            title: 'Heading ' + level,
            label: name,
            enable: commands[name],
            run: commands[name]
          })
        }),
        {label: 'Headings'}
      )
    ],
    [
      pmMenu.undoItem,
      pmMenu.redoItem
    ]
  ]
})

function isMarkActive (state, type) {
  var empty = state.selection.empty
  var $from = state.selection.$from
  if (empty) {
    return type.isInSet(state.storedMarks || $from.marks())
  }
  var from = state.selection.from
  var to = state.selection.to
  return state.doc.rangeHasMark(from, to, type)
}
