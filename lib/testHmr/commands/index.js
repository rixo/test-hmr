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
  './change',
  './init',
  './innerText',
  './page',
  './spec',
  './templates',
  './wait'
)

const commands = cmds.commands

module.exports = {
  cmds: cmds.handlers,
  commands,
}
