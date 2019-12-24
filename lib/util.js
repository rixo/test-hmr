const fs = require('fs')
const { promisify } = require('util')
const rimraf = require('rimraf')

const fromEntries = entries => {
  const o = {}
  for (const [k, v] of entries) {
    o[k] = v
  }
  return o
}

const noop = () => {}

const asyncNoop = async () => {}

const pipe = (...args) => {
  const fns = args.filter(Boolean)
  return x => fns.reduce((a, b) => b(a), x)
}

const dedent = s => {
  if (Array.isArray(s)) {
    s = s.join('')
  }
  const lines = []
  const isEmpty = line => !line || /^\s*$/.test(line)
  let trimStart = true
  let indent = ''
  let n = indent.length
  for (const line of s.split('\n')) {
    if (trimStart) {
      if (isEmpty(line)) continue
      trimStart = false
      indent = /^(\s*)/.exec(line)[1]
      if (!indent) break
    }
    n = indent.length
    const trimmed =
      line.slice(0, n) === indent ? line.slice(n) : line.replace(/^\s*$/, '')
    lines.push(trimmed)
  }
  return lines.join('\n')
}

const dedentAll = o => {
  const result = {}
  for (const [name, contents] of Object.entries(o)) {
    result[name] = dedent(contents)
  }
  return result
}

const isFunction = x => typeof x === 'function'

const hasMethods = (...methods) => x =>
  x && methods.every(m => isFunction(x[m]))

const isPromise = hasMethods('then', 'catch')

const isIterator = hasMethods('next', 'throw')

const Deferred = () => {
  let resolve
  let reject
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  return { promise, resolve, reject }
}

module.exports = {
  dedent,
  dedentAll,
  fromEntries,
  noop,
  asyncNoop,
  pipe,
  rimraf: promisify(rimraf),
  isIterator,
  isPromise,
  Deferred,
}

// fs promise
;['realpath', 'exists', 'readFile', 'writeFile'].forEach(name => {
  module.exports[name] = promisify(fs[name])
})
