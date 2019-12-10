const Deferred = require('../deferred')

const formatType = msg => {
  const type = msg.type()
  switch (type) {
    case 'error':
      return 'ERR'
    case 'warning':
      return 'WRN'
    default:
      return String(type)
        .substr(0, 3)
        .toUpperCase()
  }
}

const formatMsg = async msg => {
  const parts = [msg.text()]
  const args = await msg.args()
  for (const arg of args.slice(1)) {
    const o = arg && arg._remoteObject
    if (o) {
      if (o.subtype === 'error' && o.description) {
        parts.push(`${o.className}: ${o.description}`)
      } else if (o.type === 'string') {
        parts.push(JSON.stringify(o.value))
      } else {
        parts.push(JSON.stringify(o))
      }
    }
  }
  return parts.join(' ')
}

const ConsoleMonitor = state => {
  const {
    config: { console: consoleConfig },
  } = state
  const logger = typeof consoleConfig === 'object' ? consoleConfig : console

  const deferred = Deferred()

  let rejected = false
  let buffering = false
  let page
  const messages = []

  const summary = async () => {
    const lines = await Promise.all(
      messages.map(async msg => {
        const formatted = await formatMsg(msg)
        const type = formatType(msg)
        return `${type} ${formatted}`
      })
    )
    return lines.join('\n')
  }

  const buffer = callback => {
    buffering = true
    setTimeout(callback, 10)
  }

  const bufferAndReject = (msg, errorMessage) => {
    // guard: already buffering
    if (buffering) return
    messages.push(msg)
    buffer(async () => {
      try {
        const sum = await summary()
        // TODO try to format summary? (it is just ignored for now)
        reject(new Error(`${errorMessage}: "${msg.text()}"`, sum))
      } catch (err) {
        const formatted = await formatMsg(msg)
        reject(new Error(errorMessage + formatted))
      }
    })
  }

  const shouldIgnore = (ignores, msg) => {
    // guard: ignore all
    if (ignores === true) return true
    if (!ignores) return false

    const text = msg.text()

    return ignores.some(spec => {
      if (typeof spec === 'string') {
        return spec === text
      } else if (spec instanceof RegExp) {
        return spec.test(text)
      }
    })
  }

  const processMsg = async msg => {
    if (consoleConfig) {
      const formatted = await formatMsg(msg)
      // eslint-disable-next-line no-console
      logger.log(`[console:${formatType(msg)}] ${formatted}`)
    }
    if (buffering) {
      messages.push(msg)
      return
    }
    const cons = state.console || false
    const type = msg.type()
    if (type === 'error') {
      if (!shouldIgnore(cons && cons.ignoreErrors, msg)) {
        bufferAndReject(msg, 'Unexpected console error')
      }
    } else if (type === 'warning') {
      if (!shouldIgnore(cons && cons.ignoreWarnings, msg)) {
        bufferAndReject(msg, 'Unexpected console warning')
      }
    }
  }

  const onConsole = msg => {
    processMsg(msg).catch(err => {
      // eslint-disable-next-line no-console
      logger.error('Failed to process console error', err)
    })
  }

  const onPageError = err => {
    const error = new Error(err.message)
    error.name = 'PageError'
    if (state.catchPageError(err) !== true) {
      reject(error)
    }
  }

  const onError = err => {
    reject(err)
  }

  const unregister = () => {
    if (page) {
      page.removeListener('console', onConsole)
      page.removeListener('pageerror', onPageError)
      page.removeListener('error', onError)
      page = null
    }
  }

  const register = _page => {
    if (page) {
      throw new Error('Already registered')
    }
    page = _page
    page.on('console', onConsole)
    page.on('pageerror', onPageError)
    page.on('error', onError)
  }

  const reject = err => {
    rejected = true
    unregister()
    deferred.reject(err)
  }

  const close = () => {
    if (!rejected && !buffering) {
      unregister()
      deferred.resolve()
    }
  }

  return {
    promise: deferred.promise,
    close,
    setPage: register,
  }
}

module.exports = ConsoleMonitor
