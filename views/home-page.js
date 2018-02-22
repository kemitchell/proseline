var loading = require('./loading')
var renderHomeLink = require('./partials/home-link')

// TODO: paid peer UI

module.exports = function (state, send) {
  var main = document.createElement('main')
  if (!state.projects) {
    main.appendChild(
      loading(function () {
        send('load projects')
      })
    )
  } else {
    main.appendChild(header())
    main.appendChild(projectsList(state.projects))
    main.appendChild(createProject(send))
    main.appendChild(backup(send))
  }
  return main
}

function header () {
  var header = document.createElement('header')
  header.appendChild(renderHomeLink())
  return header
}

function projectsList (projects) {
  var section = document.createElement('section')
  if (projects.length === 0) {
    var p = document.createElement('p')
    p.appendChild(document.createTextNode('You do not have any projects.'))
    section.appendChild(p)
  } else {
    var ul = document.createElement('ul')
    projects.forEach(function (project) {
      var li = document.createElement('li')
      var a = document.createElement('a')
      a.href = '/projects/' + project.discoveryKey
      a.appendChild(document.createTextNode(project.title))
      li.appendChild(a)
      ul.appendChild(li)
    })
    section.appendChild(ul)
  }
  return section
}

function createProject (send) {
  var button = document.createElement('button')
  button.addEventListener('click', function () {
    send('create project')
  })
  button.appendChild(document.createTextNode('Create a project.'))
  return button
}

function backup (send) {
  var button = document.createElement('button')
  button.addEventListener('click', function () {
    send('backup')
  })
  button.appendChild(document.createTextNode('Backup projects.'))
  return button
}