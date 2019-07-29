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

const type = 'cons'
const IGNORE_WARNINGS = `${type}.ignore_warnings`
const IGNORE_ERRORS = `${type}.ignore_errors`

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

// --- assemble ---

Object.assign(cons, {
  ignoreWarnings,
  ignoreErrors,
})

module.exports = {
  type,
  command: cons,
  handlers: {
    [IGNORE_WARNINGS]: ignoreWarnings,
    [IGNORE_ERRORS]: ignoreErrors,
  },
}
