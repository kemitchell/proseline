var Database = require('./database')
var IDBKeyRange = require('./idbkeyrange')
var assert = require('assert')
var createIdentity = require('../crypto/create-identity')
var hash = require('../crypto/hash')
var inherits = require('inherits')
var multistream = require('multistream')
var runParallel = require('run-parallel')
var sign = require('../crypto/sign')
var stringify = require('../utilities/stringify')
var through2 = require('through2')

module.exports = Project

function Project (secretKey) {
  this._updateStreams = []
  Database.call(this, {
    name: secretKey,
    version: 1
  })
}

inherits(Project, Database)

Project.prototype._upgrade = function (db, oldVersion, callback) {
  if (oldVersion < 1) {
    // Identities
    var identities = db.createObjectStore('identities')
    identities.createIndex('publicKey', 'publicKey', {unique: true})

    // Logs
    var logs = db.createObjectStore('logs')
    logs.createIndex('publicKey', 'publicKey', {unique: false})
    var TYPE_KEY_PATH = 'message.body.type'
    logs.createIndex('type', TYPE_KEY_PATH, {unique: false})
    logs.createIndex(
      'publicKey-type', ['publicKey', TYPE_KEY_PATH], {unique: false}
    )
    // Draft Indexes
    logs.createIndex('parents', 'message.body.parents', {
      unique: false,
      multiEntry: true
    })
    // Mark and Note Index
    logs.createIndex(
      'type-draft',
      [TYPE_KEY_PATH, 'message.body.draft'],
      {unique: false}
    )
    // Mark Index
    logs.createIndex(
      'publicKey-identifier',
      ['publicKey', 'message.body.identifier'],
      {unique: false}
    )
    // General Indexes
    logs.createIndex('digest', 'digest', {unique: true})
  }

  callback()
}

// Identities

Project.prototype.createIdentity = function (setDefault, callback) {
  var self = this
  var identity = createIdentity()
  self._put('identities', identity.publicKey, identity, function (error) {
    if (error) return callback(error)
    if (setDefault) {
      self._put('identities', 'default', identity.publicKey, function (error) {
        if (error) return callback(error)
        callback(null, identity)
      })
    } else {
      callback(null, identity)
    }
  })
}

Project.prototype.getIdentity = function (publicKey, callback) {
  this._get('identities', publicKey, callback)
}

Project.prototype.getDefaultIdentity = function (callback) {
  var self = this
  self.getIdentity('default', function (error, publicKey) {
    if (error) return callback(error)
    if (publicKey === undefined) {
      callback()
    } else {
      self.getIdentity(publicKey, callback)
    }
  })
}

// Intros

Project.prototype.listIntros = function (callback) {
  this._indexQuery('logs', 'type', 'intro', callback)
}

Project.prototype.putIntro = function (message, identity, callback) {
  assert.equal(typeof message, 'object')
  assert.equal(typeof identity, 'object')
  assert.equal(typeof callback, 'function')
  this._log(identity.publicKey, message, identity, callback)
}

// Logs

Project.prototype.getLogHead = function (publicKey, callback) {
  this._count(
    'logs',
    logEntryKey(publicKey, MIN_INDEX),
    logEntryKey(publicKey, MAX_INDEX),
    function (error, count) {
      if (error) return callback(error)
      if (count === 0) return callback(null, undefined)
      return callback(null, count - 1)
    }
  )
}

Project.prototype.listLogs = function (callback) {
  this._listIndexedValues('logs', 'publicKey', callback)
}

var MIN_INDEX = 0
var INDEX_DIGITS = 5
var MAX_INDEX = Number('9'.repeat(INDEX_DIGITS))

function logEntryKey (publicKey, index) {
  return publicKey + ':' + formatEntryIndex(index)
}

function formatEntryIndex (index) {
  return index.toString().padStart(INDEX_DIGITS, '0')
}

var COMPUTE_DIGEST = {}

Project.prototype._log = function (key, message, identity, callback) {
  assert.equal(typeof message, 'object')
  assert(message.hasOwnProperty('project'))
  assert(message.hasOwnProperty('body'))
  assert.equal(typeof callback, 'function')
  var self = this
  var publicKey = identity.publicKey
  // Determine the current log head, create an envelope, and append
  // it in a single transaction.
  var envelope
  var transaction = self._db.transaction(['logs'], 'readwrite')
  transaction.onerror = function () {
    callback(transaction.error)
  }
  transaction.oncomplete = function () {
    self._streamUpdate(
      envelope.publicKey, envelope.message.index,
      function (error) {
        if (error) return callback(error)
        callback(null, envelope, envelope.digest)
      }
    )
  }
  // Find the head of the log by counting entries.
  var lower = logEntryKey(publicKey, MIN_INDEX)
  var upper = logEntryKey(publicKey, MAX_INDEX)
  var headRequest = transaction
    .objectStore('logs')
    .count(IDBKeyRange.bound(lower, upper))
  headRequest.onsuccess = function () {
    var index = headRequest.result
    message.index = index
    var stringified = stringify(message)
    envelope = {
      message: message,
      publicKey: identity.publicKey,
      signature: sign(stringified, identity.secretKey)
    }
    addDigestForIndexing(envelope)
    transaction
      .objectStore('logs')
      .add(envelope, logEntryKey(envelope.publicKey, index))
  }
}

Project.prototype.getEnvelope = function (publicKey, index, callback) {
  var key = logEntryKey(publicKey, index)
  this._get('logs', key, function (error, envelope) {
    if (error) return callback(error)
    callback(null, {
      message: envelope.message,
      publicKey: envelope.publicKey,
      signature: envelope.signature
      // (Omit the digest stored for indexing.)
    })
  })
}

Project.prototype.putEnvelope = function (envelope, callback) {
  assert.equal(typeof envelope, 'object')
  assert(envelope.hasOwnProperty('message'))
  assert(envelope.hasOwnProperty('publicKey'))
  assert(envelope.hasOwnProperty('signature'))
  assert.equal(typeof callback, 'function')
  var self = this
  addDigestForIndexing(envelope)
  var transaction = self._db.transaction(['logs'], 'readwrite')
  transaction.onerror = function () {
    callback(transaction.error)
  }
  transaction.oncomplete = function () {
    self.emit('change')
    self._streamUpdate(
      envelope.publicKey, envelope.message.index, callback
    )
  }
  var key = logEntryKey(
    envelope.publicKey, envelope.message.index
  )
  transaction
    .objectStore('logs')
    .add(envelope, key)
}

function addDigestForIndexing (envelope) {
  envelope.digest = hash(stringify(envelope.message))
}

Project.prototype._streamUpdate = function (publicKey, index, callback) {
  runParallel(
    this._updateStreams.map(function (stream) {
      return function (done) {
        stream.write({publicKey, index}, done)
      }
    }),
    callback
  )
}

Project.prototype.createOfferStream = function () {
  var self = this
  return multistream.obj([
    function currentHeads () {
      var stream = through2.obj()
      self.listLogs(function (error, publicKeys) {
        if (error) return stream.destroy(error)
        runParallel(
          publicKeys.map(function (publicKey) {
            return function (done) {
              self.getLogHead(publicKey, function (error, index) {
                if (error) return done(error)
                stream.write({publicKey, index}, done)
              })
            }
          }),
          function (error) {
            if (error) stream.destroy(error)
            stream.end()
          }
        )
      })
      return stream
    },
    function updatedHeads () {
      var stream = through2.obj()
      self._updateStreams.push(stream)
      return stream
    }
  ])
}

// Drafts

Project.prototype.putDraft = function (message, identity, callback) {
  this._log(COMPUTE_DIGEST, message, identity, callback)
}

Project.prototype.getDraft = function (digest, callback) {
  this._getFromIndex('logs', 'digest', digest, callback)
}

Project.prototype.getChildren = function (digest, callback) {
  this._indexQuery('logs', 'parents', digest, callback)
}

Project.prototype.listDraftBriefs = function (callback) {
  this._indexQuery('logs', 'type', 'draft', function (error, drafts) {
    if (error) return callback(error)
    callback(null, drafts.map(function (draft) {
      var body = draft.message.body
      return {
        digest: draft.digest,
        publicKey: draft.publicKey,
        parents: body.parents,
        timestamp: body.timestamp
      }
    }))
  })
}

// Marks

Project.prototype.putMark = function (message, identity, callback) {
  var publicKey = identity.publicKey
  var identifier = message.body.identifier
  var key = markKey(publicKey, identifier)
  this._log(key, message, identity, callback)
}

Project.prototype.getMark = function (publicKey, identifier, callback) {
  var transaction = this._db.transaction(['logs'], 'readonly')
  transaction.onerror = function () {
    callback(transaction.error)
  }
  var objectStore = transaction.objectStore('logs')
  var index = objectStore.index('publicKey-identifier')
  var request = index.openCursor([publicKey, identifier], 'prev')
  request.onsuccess = function () {
    var cursor = request.result
    callback(null, cursor ? cursor.value : undefined)
  }
}

function markKey (publicKey, identifier) {
  return publicKey + ':' + identifier
}

Project.prototype.getMarks = function (digest, callback) {
  this._indexQuery('logs', 'type-draft', ['mark', digest], callback)
}

Project.prototype.listMarks = function (callback) {
  this._indexQuery('logs', 'type', 'mark', callback)
}

// Notes

Project.prototype.getNotes = function (digest, callback) {
  this._indexQuery('logs', 'type-draft', ['note', digest], callback)
}

Project.prototype.putNote = function (message, identity, callback) {
  this._log(COMPUTE_DIGEST, message, identity, callback)
}
