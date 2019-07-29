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

const ConsoleMonitor = ({
  config,
  config: { console: consoleConfig },
  // console: {
  //   ignoreWarnings,
  //   ignoreErrors,
  //   // expectWarnings,
  //   // expectErrors,
  //   // expectLogs,
  // },
}) => {
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
    return '\n\n' + lines.join('\n')
  }

  const buffer = callback => {
    buffering = true
    setTimeout(callback, 10)
  }

  const bufferAndReject = (msg, errorMessage) => {
    messages.push(msg)
    buffer(async () => {
      try {
        const sum = await summary()
        reject(new Error(errorMessage + sum))
      } catch (err) {
        const formatted = await formatMsg(msg)
        reject(new Error(errorMessage + formatted))
      }
    })
  }

  const processMsg = async msg => {
    if (config.console) {
      const formatted = await formatMsg(msg)
      // eslint-disable-next-line no-console
      logger.log(`[console:${formatType(msg)}] ${formatted}`)
    }
    if (buffering) {
      messages.push(msg)
      return
    }
    if (msg.type() === 'error') {
      // const text = msg.text()
      // if (ignoreErrors.includes(text)) return
      bufferAndReject(msg, 'Unexpected console error: ')
    }
    if (msg.type() === 'warning') {
      // const text = msg.text()
      // if (ignoreWarnings.includes(text)) return
      bufferAndReject(msg, 'Unexpected console warning: ')
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
    reject(error)
  }

  const onError = err => {
    reject(err)
  }

  const unregister = () => {
    if (page) {
      page.removeListener('console', onConsole)
      page.removeListener('pageerror', onPageError)
      page.removeListener('error', onError)
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
    if (!rejected) {
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
