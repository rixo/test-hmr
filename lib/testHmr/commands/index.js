const CHANGE = 'changes'
const TEMPLATES = 'templates'

const templates = templates => ({
  type: TEMPLATES,
  templates,
})

const change = changes => ({
  type: CHANGE,
  changes,
})

change.rm = Symbol('change: rm')

const loadCommands = (...files) => {
  const commands = {}
  const handlers = {}
  for (const file of files) {
    const cmd = require(file)
    const { type, command = cmd, handler = cmd, handlers: subHandlers } = cmd
    if (handler) {
      handlers[type] = handler
    }
    if (command) {
      commands[type] = command
    }
    if (subHandlers) {
      Object.assign(handlers, subHandlers)
    }
  }
  return {
    commands,
    handlers,
  }
}

const cmds = loadCommands(
  './$$debug',
  './beforeLoad',
  './init',
  './innerText',
  './page',
  './spec',
  './wait'
)

const commands = {
  change,
  templates,
  ...cmds.commands,
}

module.exports = {
  cmds: cmds.handlers,
  commands,

  CHANGE,
  TEMPLATES,
}
