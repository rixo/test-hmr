/**
 *     yield spec({
 *       'filename.ext': `
 *         file contents
 *         ::0 conditional
 *         ::1 cond 1
 *       `
 *     })
 *
 *     yield spec.expect(1, 'file contents cond 1')
 *
 *     yield spec.expect(0, function* sub() {
 *       // yield...
 *     })
 *
 *     yield spec.expect([
 *       ['0', 'file contents conditional'],
 *       ['1', 'file contents cond 1'],
 *     ])
 *
 *     yield spec(`
 *       --- file.js ---
 *       console.log(
 *         ::0 'hello'
 *         ::1 'bye'
 *       )
 *       * * *
 *       console.log(
 *         ::0 'hello'
 *         ::1 'bye'
 *       )
 *     `)
 *
 *     yield spec`
 *       --- file.js ---
 *       console.log(
 *         ::0 'hello'
 *         ::1 'bye'
 *       )
 *       * * *
 *       console.log(
 *         ::0 'hello'
 *         ::1 'bye'
 *       )
 *     `
 */

const assert = require('assert')

const interpolateFunctions = require('../interpolateFunctions')

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

const sub = (subType, handler) => {
  const fn = (...args) => ({
    type: fn.type,
    ...(handler && handler(...args)),
  })
  fn.type = `${spec.type}.${subType}`
  return fn
}

const spec = (arg, ...args) => {
  if (Array.isArray(arg)) {
    const { source, functions } = interpolateFunctions(arg, args)
    return {
      type: spec.type,
      specs: source,
      functions,
    }
  } else {
    return {
      type: spec.type,
      specs: arg,
    }
  }
}

spec.type = spec.name

const expect = (label, expects) => {
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
    type: spec.expect.type,
    expects: payload,
  }
}

expect.type = `${spec.type}.${expect.name}`

const before = sub('before', (label, sub) => ({
  label,
  sub,
}))

const after = sub('after', (label, sub) => ({
  label,
  sub,
}))

const $$flush = sub('$$flush')

// allow bailing out, for testing
const $$discard = sub('$$discard')

Object.assign(spec, {
  expect,
  before,
  after,
  $$flush,
  $$discard,
})

spec.handlers = require('./spec.handlers')(spec)

module.exports = spec
