/**
 *     expectPageLoads()
 *
 *     expectNoPageLoad() // eq. expectPageLoads(0)
 *
 *     expectPageLoad() // <- singular, n = 1
 *
 *
 *     expectPageLoads()
 *     // ...
 *     expectPageLoads(2)
 *     // ...
 *     expectNoPageLoad()
 *     // ...
 *     expectPageLoad()
 *     // ...
 *     expectNoPageLoad()
 */

const EXPECT_PAGE_LOADS = Symbol('expect page loads')

const register = (state, me) => {
  const { page, fail, post } = state

  const onLoad = () => {
    const { expected, message } = me
    me.total++
    me.current++
    if (expected === true) return
    if (expected === false || expected === 0) {
      throw fail(message || `Unexpected page load (total: ${me.total})`)
    }
    if (me.current > expected) {
      throw fail(
        message ||
          `Expected ${expected} page loads, but we're at ${me.current} (total: ${me.total})`
      )
    }
  }

  page.on('load', onLoad)

  post(() => {
    page.off('load', onLoad)

    const { expected, current, total, message } = me

    if (expected === false || expected === 0) return

    if (expected === true) {
      if (current < 1) {
        throw fail(
          message ||
            `Expected more page loads that didn't happen (total: ${total})`
        )
      }
    } else {
      if (expected !== current) {
        throw fail(
          message ||
            `Expected ${expected} page loads, but there was ${current} (total: ${total})`
        )
      }
    }
  })
}

export const expectPageLoads = (expected = true, message = null) => state => {
  const {
    [EXPECT_PAGE_LOADS]: me = {
      current: 0,
      total: 0,
      expected,
      message,
    },
  } = state

  if (state[EXPECT_PAGE_LOADS]) {
    me.current = 0
    me.expected = expected
    me.message = message
  } else {
    state[EXPECT_PAGE_LOADS] = me
    register(state, me)
  }
}

export const expectPageLoad = msg => expectPageLoads(1, msg)

export const expectNoPageLoad = msg => expectPageLoads(false, msg)
