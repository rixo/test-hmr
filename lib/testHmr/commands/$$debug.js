/**
 *     const state = yield debug()
 *     console.log(state)
 */

const $$debug = () => ({ type })

const type = $$debug.name

const run = state => state

module.exports = Object.assign($$debug, {
  type,
  init: run,
  run,
})
