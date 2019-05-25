var Database = require('./database')
var assert = require('nanoassert')
var crypto = require('@proseline/crypto')
var inherits = require('inherits')
var pageBus = require('../page-bus')

// Proseline wraps a single IndexedDB database that stores
// client-global data, including data about other IndexedDB
// databases storing project data.
module.exports = Proseline

function Proseline () {
  this._projectStreams = []
  Database.call(this, {
    name: 'proseline',
    version: 2
  })
}

inherits(Proseline, Database)

var prototype = Proseline.prototype

prototype._upgrade = function (db, oldVersion, callback) {
  if (oldVersion < 1) {
    // The `projects` database holds information on projects the
    // user is working on.
    db.createObjectStore('projects')
  }
  if (oldVersion < 2) {
    // The `user` database holds the user's keypair for interacting
    // with paid.proseline.com.
    db.createObjectStore('user')
  }
  callback()
}

// Projects

prototype.putProject = function (project, callback) {
  assert(typeof project === 'object')
  assert(project.hasOwnProperty('projectDiscoveryKey'))
  assert(project.hasOwnProperty('projectReadKey'))
  var self = this
  var projectDiscoveryKey = project.projectDiscoveryKey
  self._put('projects', projectDiscoveryKey, project, function (error) {
    if (error) return callback(error)
    pageBus.emit('added project', projectDiscoveryKey)
    callback()
  })
}

prototype.overwriteProject = function (project, callback) {
  assert(typeof project === 'object')
  assert(project.hasOwnProperty('projectDiscoveryKey'))
  assert(project.hasOwnProperty('projectReadKey'))
  var self = this
  var projectDiscoveryKey = project.projectDiscoveryKey
  self._put('projects', projectDiscoveryKey, project, function (error) {
    if (error) return callback(error)
    pageBus.emit('overwrote project', projectDiscoveryKey)
    callback()
  })
}

prototype.getProject = function (projectDiscoveryKey, callback) {
  this._get('projects', projectDiscoveryKey, callback)
}

prototype.deleteProject = function (projectDiscoveryKey, callback) {
  var self = this
  self._delete('projects', projectDiscoveryKey, function (error) {
    if (error) return callback(error)
    pageBus.emit('deleted project', projectDiscoveryKey)
    callback()
  })
}

prototype.listProjects = function (callback) {
  this._listValues('projects', callback)
}

// User

// Get the user keypair for signing messages to paid.proseline.com.
// If the keypair doesn't exist yet, create it.
prototype.getUserIdentity = function (callback) {
  var self = this
  self._get('user', 'identity', function (error, identity) {
    if (error) return callback(error)
    if (identity !== undefined) {
      return callback(null, identity)
    }
    identity = crypto.makeSigningKeyPair()
    identity.publicKey = identity.publicKey.toString('hex')
    identity.secretKey = identity.secretKey.toString('hex')
    self._put('user', 'identity', identity, function (error) {
      if (error) return callback(error)
      callback(null, identity)
    })
  })
}

prototype.getSubscription = function (callback) {
  this._get('user', 'subscription', callback)
}

prototype.setSubscription = function (subscription, callback) {
  this._put('user', 'subscription', subscription, callback)
}

// Introduction

prototype.getIntro = function (callback) {
  this._get('user', 'intro', callback)
}

prototype.setIntro = function (intro, callback) {
  this._put('user', 'intro', intro, callback)
}
