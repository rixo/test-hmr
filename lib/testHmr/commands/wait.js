/**
 *     yield wait(50)
 *
 *     yield wait(async () => { ... })
 */

const wait = what => ({ type, what })

const run = async (state, command) => {
  const { what } = command
  if (typeof what === 'number') {
    return new Promise(resolve => wait.setTimeout(resolve, what))
  } else if (what && what.then) {
    return what
  } else {
    throw new Error('Unsupported wait operand: ' + what)
  }
}

const type = wait.name

module.exports = Object.assign(wait, {
  type,
  init: run,
  run,
  setTimeout,
})
