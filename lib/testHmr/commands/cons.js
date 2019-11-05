/**
 *    yield cons.ignoreWarnings()
 *
 *    yield cons.ignoreWarnings('full match string')
 *
 *    yield cons.ignoreWarnings(/regex/i)
 *
 *    yield cons.ignoreWarnings('mixed', /regex/, 'and strings')
 *
 *    yield cons.ignoreWarnings(false)
 *
 *    yield cons.ignoreErrors()
 *
 *    yield cons.ignoreErrors('full match string')
 *
 *    yield cons.ignoreErrors(/regex/i)
 *
 *    yield cons.ignoreErrors('mixed', /regex/, 'and strings')
 *
 *    yield cons.ignoreWarnings(true)
 */

const Debug = require('debug')
const debug = Debug('test-hmr:cons')

const type = 'cons'
const IGNORE_WARNINGS = `${type}.ignore_warnings`
const IGNORE_ERRORS = `${type}.ignore_errors`
const WAIT = `${type}.wait`

const ALL = 'all'
const NONE = 'none'

const cons = (...warnings) => ({
  type,
  warnings,
})

// --- cons.ignoreWarnings ---

const ignoreWarnings = (...args) => {
  let ignore = args
  if (args.length === 0) {
    ignore = ALL
  }
  return {
    type: IGNORE_WARNINGS,
    ignore,
  }
}

ignoreWarnings.run = (state, { ignore }) => {
  if (ignore === ALL) {
    state.console.ignoreWarnings = true
  } else {
    if (!Array.isArray(state.console.ignoreWarnings)) {
      state.console.ignoreWarnings = []
    }
    state.console.ignoreWarnings.push(...ignore)
  }
}

ignoreWarnings.init = ignoreWarnings.run

// --- cons.ignoreErrors ---

const ignoreErrors = (...args) => {
  let ignore = args
  if (args.length === 0) {
    ignore = ALL
  } else if (args.length === 1 && args[0] === false) {
    ignore = NONE
  }
  return {
    type: IGNORE_ERRORS,
    ignore,
  }
}

ignoreErrors.run = (state, { ignore }) => {
  if (ignore === ALL) {
    state.console.ignoreErrors = true
  } else if (ignore === NONE) {
    state.console.ignoreErrors = false
  } else {
    if (!Array.isArray(state.console.ignoreErrors)) {
      state.console.ignoreErrors = []
    }
    state.console.ignoreErrors.push(...ignore)
  }
}

ignoreErrors.init = ignoreErrors.run

// --- cons.wait ---

const wait = (...args) => {
  const [maybeTimeout, ...rest] = args
  let timeout = 50
  let matchers
  if (typeof maybeTimeout === 'number') {
    timeout = maybeTimeout
    matchers = rest
  } else {
    matchers = args
  }
  return {
    type: WAIT,
    timeout,
    matchers,
  }
}

{
  const isMatch = (type, text, matcher) => {
    if (typeof matcher === 'string') {
      return matcher === text
    }
    if (!matcher) {
      return false
    }
    if (typeof matcher.test === 'function') {
      return matcher.test(text)
    }
    if (matcher.type) {
      if (matcher.type !== type) {
        return false
      }
    }
    if (matcher.text) {
      if (!isMatch(type, text, matcher.text)) {
        return false
      }
    }
    return true
  }

  const matches = (type, text) => matcher => isMatch(type, text, matcher)

  wait.run = (state, { timeout: timeoutDelay, matchers }) => {
    return new Promise((resolve, reject) => {
      debug('wait: run', matchers)
      const timeout = setTimeout(() => {
        reject(new Error('Log message not found before timeout'))
      }, timeoutDelay)
      const onConsole = msg => {
        const type = msg.type()
        const text = msg.text()
        debug('wait: seen: [%s] %s', type, text)
        if (matchers.some(matches(type, text))) {
          debug('wait: found!')
          clearTimeout(timeout)
          resolve()
        } else {
          wait()
        }
      }
      const wait = () => {
        debug('wait: waiting')
        state.page.once('console', onConsole)
      }
      wait()
    })
  }
}

// --- assemble ---

Object.assign(cons, {
  ignoreWarnings,
  ignoreErrors,
  wait,
})

module.exports = {
  type,
  command: cons,
  handlers: {
    [IGNORE_WARNINGS]: ignoreWarnings,
    [IGNORE_ERRORS]: ignoreErrors,
    [WAIT]: wait,
  },
}
