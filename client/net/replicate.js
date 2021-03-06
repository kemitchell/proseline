const Protocol = require('./protocol')
const assert = require('nanoassert')
const crypto = require('@proseline/crypto')
const debug = require('debug')
const pageBus = require('../page-bus')
const runSeries = require('run-series')

const DEBUG_NAMESPACE = 'proseline:replicate:'

module.exports = ({
  peerID,
  replicationKey,
  discoveryKey,
  encryptionKey,
  projectPublicKey,
  database
}) => {
  assert(typeof peerID === 'string')
  assert(typeof replicationKey === 'string')
  assert(typeof discoveryKey === 'string')
  assert(typeof encryptionKey === 'string')
  assert(typeof projectPublicKey === 'object')
  assert(database)

  const log = debug(DEBUG_NAMESPACE + peerID + ':' + discoveryKey)

  const protocol = new Protocol({
    key: Buffer.from(replicationKey, 'base64')
  })

  let listeningToDatabase = false

  protocol.once('handshake', function () {
    log('received handshake')
    // Offer new outer envelopes as we receive them.
    pageBus.addListener('envelope', onEnvelope)
    listeningToDatabase = true
    // Offer outer envelopes we already have.
    database.listLogs((error, logPublicKeys) => {
      if (error) return log(error)
      logPublicKeys.forEach(logPublicKey => {
        database.getLogHead(logPublicKey, (error, index) => {
          if (error) return log(error)
          offerEnvelope(logPublicKey, index)
        })
      })
    })
  })

  function onEnvelope (envelope) {
    if (envelope.discoveryKey !== discoveryKey) return
    offerEnvelope(envelope.logPublicKey, envelope.index)
  }

  function offerEnvelope (logPublicKey, index) {
    const id = loggingID(logPublicKey, index)
    log('sending offer: %s', id)
    protocol.offer({ logPublicKey, index }, error => {
      if (error) return log(error)
      log('sent offer: %s', id)
    })
  }

  // When our peer requests an outer envelope...
  protocol.on('request', request => {
    const logPublicKey = request.logPublicKey
    const index = request.index
    const id = loggingID(logPublicKey, index)
    log('received request: %s', id)
    database.getEntry(logPublicKey, index, (error, entry) => {
      if (error) return log(error)
      if (entry === undefined) return
      log('sending outer envelope: %s', id)
      protocol.envelope(entry.envelope, error => {
        if (error) return log(error)
        log('sent outer envelope: %s', id)
      })
    })
  })

  // TODO: Prevent duplicate requests for the same outer envelope.

  // When our peer offers outer envelopes...
  protocol.on('offer', offer => {
    const logPublicKey = offer.logPublicKey
    const offeredIndex = offer.index
    const offeredID = loggingID(logPublicKey, offeredIndex)
    log('received offer: %s', offeredID)
    database.getLogHead(logPublicKey, (error, head) => {
      if (error) return log(error)
      if (head === undefined) head = -1
      const indexes = inclusiveRange(head + 1, offeredIndex)
      runSeries(indexes.map(index => {
        const requestID = loggingID(logPublicKey, index)
        return done => {
          log('sending request: %s', requestID)
          protocol.request({ logPublicKey, index }, error => {
            if (error) log(error)
            else log('sent request: %s', requestID)
            done()
          })
        }
      }))
    })
  })

  // When our peer sends an outer envelope...
  protocol.on('envelope', envelope => {
    const id = loggingID(envelope.logPublicKey, envelope.index)
    const errors = crypto.validateEnvelope({
      envelope,
      projectPublicKey,
      encryptionKey
    })
    if (errors.length !== 0) {
      throw new Error('Failed to validate envelope.')
    }
    const entry = crypto.decryptJSON(
      envelope.entry.ciphertext,
      envelope.entry.nonce,
      encryptionKey
    )
    log('received envelope: %s', id)
    database.putEnvelope(envelope, entry, error => {
      if (error) return log(error)
      log('put envelope: %s', id)
    })
  })

  protocol.on('invalid', body => {
    log('received invalid entry: %O', body)
  })

  protocol.on('error', error => {
    log(error)
    if (listeningToDatabase) {
      database.removeListener('envelope', onEnvelope)
    }
  })

  // Extend our handshake.
  log('sending handshake')
  protocol.handshake(error => {
    if (error) return log(error)
    log('sent handshake')
  })

  return protocol
}

function loggingID (logPublicKey, index) {
  return logPublicKey + ' # ' + index
}

function inclusiveRange (from, to) {
  if (from > to) return []
  if (from === to) return [from]
  const returned = []
  for (let index = from; index <= to; index++) {
    returned.push(index)
  }
  return returned
}
