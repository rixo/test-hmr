/**
 *     expectPageError('Not working')
 *
 *     expectPageErrors()
 *
 *     expectNoPageError()
 */

const EXPECT_PAGE_ERRORS = Symbol('expect page errors')

const matches = (pattern, err) => {
  if (pattern.test) {
    return pattern.test(err)
  }
  if (typeof pattern === 'string') {
    return String(err).indexOf(pattern) !== -1
  }
  throw new Error('Invalid pattern: ' + pattern)
}

const register = (state, me) => {
  const { fail, post } = state

  state.addPageErrorHandler(e => {
    const { expected, limit } = me
    me.total++
    me.current++
    if (limit !== false) {
      me.limit--
      if (me.limit < 0) {
        return false
      }
    }
    if (expected === true) return true
    if (expected === false || expected === 0) return false
    if (!matches(expected, e)) return false
    return true
  })

  post(() => {
    const { expected, limit, message, current, total } = me

    if (expected === false || expected === 0) return

    if (expected === true && current < 1) {
      throw fail(
        message || `Expected page errors that didn't happen (total: ${total})`
      )
    }

    if (limit !== false && limit > 0) {
      throw fail(
        message ||
          `Expected ${limit} page errors, but there was ${current} (total: ${total})`
      )
    }
  })
}

const doExpectPageErrors = (
  pattern = true,
  limit = false,
  message = null
) => state => {
  const {
    [EXPECT_PAGE_ERRORS]: me = {
      expected: pattern,
      limit,
      message,
      current: 0,
      total: 0,
    },
  } = state
  if (state[EXPECT_PAGE_ERRORS]) {
    me.current = 0
    me.expected = pattern
    me.limit = limit
    me.message = message
  } else {
    state[EXPECT_PAGE_ERRORS] = me
    register(state, me)
  }
}

export const expectPageErrors = msg => doExpectPageErrors(true, false, msg)

export const expectPageError = (pattern, msg) =>
  doExpectPageErrors(pattern, 1, msg)

export const expectNoPageError = msg => doExpectPageErrors(false, false, msg)
