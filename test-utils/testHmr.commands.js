const assert = require('assert')

const INIT = 'init'
const TEMPLATES = 'templates'
const SPEC = 'specs'
const EXPECT = 'expect'
const EXPECT_BEFORE = 'expect_before'
const EXPECT_AFTER = 'expect_after'
const FLUSH_EXPECTS = 'flush_expects'
const DISCARD_EXPECTS = 'discard_expects'
const CHANGE = 'changes'
const PAGE = 'page'
const INNER_TEXT = 'inner_text'
const DEBUG = 'debug'

const init = inits => ({ type: INIT, inits })

const templates = templates => ({
  type: TEMPLATES,
  templates,
})

const interpolate = (strings, values) =>
  strings
    .reduce((parts, string, i) => {
      parts.push(string)
      if (values.length > i) {
        parts.push(values[i])
      }
      return parts
    }, [])
    .join('')

const interpolateFunctions = (strings, values) => {
  let len = 0
  const parts = []
  const functions = []
  const push = string => {
    len += string.length
    parts.push(string)
  }
  strings.forEach((string, i) => {
    push(string)
    if (values.length > i) {
      if (typeof values[i] === 'function') {
        functions.push({ index: len, fn: values[i] })
      } else {
        push(String(values[i]))
      }
    }
  })
  const specs = parts.join('')
  return {
    specs,
    functions,
  }
}

const spec = (arg, ...args) => {
  if (Array.isArray(arg)) {
    const { specs, functions } = interpolateFunctions(arg, args)
    return {
      type: SPEC,
      specs,
      functions,
    }
  } else {
    return {
      type: SPEC,
      specs: arg,
    }
  }
}

spec.expect = (label, expects) => {
  let payload
  if (Array.isArray(label)) {
    // yield spec.expect([[label, expect], ...])
    assert(expects === undefined)
    payload = label
  } else if (expects === undefined) {
    // used a a template literal tag
    return (parts, ...vals) => spec.expect(label, interpolate(parts, vals))
  } else {
    // yield spec.expect(label, expect)
    assert(expects != null)
    payload = [[label, expects]]
  }
  return {
    type: EXPECT,
    expects: payload,
  }
}

spec.before = (label, sub) => ({
  type: EXPECT_BEFORE,
  label,
  sub,
})

spec.after = (label, sub) => ({
  type: EXPECT_AFTER,
  label,
  sub,
})

spec.$$flush = () => ({
  type: FLUSH_EXPECTS,
})

spec.$$discard = () => ({
  type: DISCARD_EXPECTS,
})

const pageProxy = new Proxy(
  () => ({
    type: PAGE,
  }),
  {
    get(target, prop) {
      return (...args) => ({
        type: PAGE,
        method: prop,
        args,
      })
    },
  }
)

const innerText = selector => ({
  type: INNER_TEXT,
  selector,
})

const change = changes => ({
  type: CHANGE,
  changes,
})

change.rm = Symbol('change: rm')

const debug = () => ({ type: DEBUG })

module.exports = {
  INIT,
  TEMPLATES,
  SPEC,
  EXPECT,
  EXPECT_BEFORE,
  EXPECT_AFTER,
  FLUSH_EXPECTS,
  DISCARD_EXPECTS,
  CHANGE,
  PAGE,
  INNER_TEXT,
  DEBUG,

  commands: {
    debug,
    spec,
    templates,
    change,
    init,
    page: pageProxy,
    innerText,
  },
}
