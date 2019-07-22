/**
 *     yield init({
 *       'main.js': 'console.log("I am main.js")'
 *     })
 *
 *     yield init({
 *       'main.js': ({name = 'main.js'}) => `console.log('I am ${name}')`
 *     })
 *
 *     yield init(0)
 */
const { renderSpecs, renderChanges } = require('../spec')

const init = inits => ({ type, inits })

const initChanges = (state, { inits }) => {
  // support for spec-change `init(0)`
  if (typeof inits !== 'object') {
    return inits
  }
  const changes = {}
  Object.entries(inits).forEach(([path, init]) => {
    if (typeof init === 'function') {
      state.templates[path] = init
      changes[path] = undefined
    } else {
      changes[path] = init
    }
  })
  return changes
}

const renderInitFiles = (state, changes) => {
  if (typeof changes === 'string' || typeof changes === 'number') {
    if (state.initSpecLabel) {
      const previous = `previous: ${state.initSpecLabel}`
      throw new Error(`init with a spec label (${previous})`)
    } else {
      state.initSpecLabel = String(changes)
    }
    return renderSpecs(state, changes)
  }
  // guard: missing argument
  if (!changes) {
    throw new Error('Illegal arguments: changes is required')
  }
  return renderChanges(state, changes)
}

const run = (state, command) => {
  const changes = initChanges(state, command)
  const files = renderInitFiles(state, changes)
  Object.assign(state.inits, files)
}

const type = (init.type = init.name)

module.exports = Object.assign(init, {
  type,
  init: run,
})
