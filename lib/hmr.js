/**
 * HMR adapter
 */

import getConfig from './config.js'

const Deferred = () => {
  let resolve, reject
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  return { promise, resolve, reject }
}

const shouldIgnore = (ignore, err) => {
  if (typeof ignore === 'function') {
    if (ignore(err)) return true
  } else if (typeof ignore === 'string') {
    if (err && err.message === ignore) return true
  } else {
    throw new Error('Unsuported ignore type', typeof ignore, ignore)
  }
  return false
}

const ignoreErrors = (handler, ignores) => async (...args) => {
  try {
    return await handler(...args)
  } catch (err) {
    for (const ignore of ignores) {
      if (shouldIgnore(ignore, err)) return
    }
    throw err
  }
}

const matchMessage = (matcher, text) => {
  switch (typeof matcher) {
    case 'function':
      return matcher(text)
    case 'string':
      return text === matcher
    default:
      if (matcher instanceof RegExp) return matcher.test(text)
      throw new Error('Unsupported message matcher type: ' + typeof matcher)
  }
}

export default ({
  hmrReadyMessage,
  hmrStartMessage,
  hmrCompleteMessage,
  hmrCompleteDelay,
}) => ({ page }) => {
  const readyDeferred = Deferred()
  let updateDeferred = Deferred()
  let idleDeferred = Deferred()
  let errorDeferred = Deferred()

  const pushError = (error) => {
    errorDeferred.reject(error)
    errorDeferred = Deferred()
  }

  const handleConsole = async (e) => {
    if (page.isClosed()) return
    const { logConsole } = await getConfig()
    if (e.type() === 'error') {
      const args = await Promise.all(e.args().map((x) => x.jsonValue()))
      // eslint-disable-next-line no-console
      console.error(e.text(), args)
      pushError(args.join(' '))
    } else if (logConsole) {
      // eslint-disable-next-line no-console
      console.log('>', e.text())
    }
    if (page.isClosed()) return
    const text = e.text()
    if (matchMessage(hmrStartMessage, text)) {
      updateDeferred.resolve()
      updateDeferred = Deferred()
    }
    if (matchMessage(hmrReadyMessage, text)) {
      readyDeferred.resolve()
      idleDeferred.resolve()
      idleDeferred = Deferred()
    } else if (matchMessage(hmrCompleteMessage, text)) {
      if (hmrCompleteDelay) {
        await new Promise((resolve) => setTimeout(resolve, hmrCompleteDelay))
      }
      idleDeferred.resolve()
      idleDeferred = Deferred()
    }
  }

  page.on(
    'console',
    ignoreErrors(handleConsole, [
      'Target page, context or browser has been closed',
      'Protocol error (Runtime.callFunction): Target isClosed().undefined',
      'Protocol error (Runtime.callFunctionOn): Target closed.',
      'Execution context was destroyed, most likely because of a navigation.',
    ])
  )

  const ready = () => readyDeferred.promise

  const update = () => updateDeferred.promise

  const idle = () => idleDeferred.promise

  const nextConsoleError = async () => {
    const error = await errorDeferred.promise
    if (page.isClosed()) return
    // TODO
    // if (isExpectedError(error)) return nextConsoleError()
    return error
  }

  // --- Expected navigation ---

  let expectedNavigation

  const expectNavigation = () => {
    expectedNavigation++
  }

  const consumeExpectedNavigation = () => {
    if (expectedNavigation < 1) return false
    expectedNavigation--
    return true
  }

  // ------

  return {
    ready,
    update,
    idle,
    nextConsoleError,
    expectNavigation,
    consumeExpectedNavigation,
  }
}
