const assert = require('assert')

const interpolateFunctions = require('./interpolateFunctions')

const BEFORE_LOAD = 'before_load'
const CHANGE = 'changes'
const DEBUG = 'debug'
const DISCARD_EXPECTS = 'discard_expects'
const EXPECT = 'expect'
const EXPECT_AFTER = 'expect_after'
const EXPECT_BEFORE = 'expect_before'
const FLUSH_EXPECTS = 'flush_expects'
const INIT = 'init'
const INNER_TEXT = 'inner_text'
const PAGE = 'page'
const SPEC = 'specs'
const TEMPLATES = 'templates'
const WAIT = 'wait'

const init = inits => ({ type: INIT, inits })

const templates = templates => ({
  type: TEMPLATES,
  templates,
})

const beforeLoad = sub => ({ type: BEFORE_LOAD, sub })

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

const spec = (arg, ...args) => {
  if (Array.isArray(arg)) {
    const { source, functions } = interpolateFunctions(arg, args)
    return {
      type: SPEC,
      specs: source,
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

// Allows to retrieve objects, and proxies method calls to the page instance.
//
//     // retrieve references to objects
//     const page = yield page()
//     const keyboard = yield page.keybard()
//
//     // proxy method calls (also, await on returned promises)
//     yield page.click('button')
//     yield page.keyboard.press('Esc')
//
const PageProxy = (path = []) => {
  // reuse already created proxy objects
  const cache = {}
  return new Proxy(
    (...args) => ({
      type: PAGE,
      path,
      args,
    }),
    {
      get(target, prop) {
        if (cache[prop]) {
          return cache[prop]
        }
        const proxy = PageProxy([...path, prop])
        cache[prop] = proxy
        return proxy
      },
    }
  )
}

const pageProxy = PageProxy()

const innerText = selector => ({
  type: INNER_TEXT,
  selector,
})

const change = changes => ({
  type: CHANGE,
  changes,
})

change.rm = Symbol('change: rm')

const $$debug = () => ({ type: DEBUG })

// TODO test wait
const wait = what => ({ type: wait, what })

module.exports = {
  BEFORE_LOAD,
  CHANGE,
  DEBUG,
  DISCARD_EXPECTS,
  EXPECT,
  EXPECT_AFTER,
  EXPECT_BEFORE,
  FLUSH_EXPECTS,
  INIT,
  INNER_TEXT,
  PAGE,
  SPEC,
  TEMPLATES,
  WAIT,

  commands: {
    $$debug,
    beforeLoad,
    change,
    init,
    innerText,
    page: pageProxy,
    spec,
    templates,
    wait,
  },
}
