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

module.exports = {
  fromEntries,
  noop,
  asyncNoop,
  pipe,
  rimraf: promisify(rimraf),
}
;['realpath', 'exists', 'readFile', 'writeFile'].forEach(name => {
  module.exports[name] = promisify(fs[name])
})
