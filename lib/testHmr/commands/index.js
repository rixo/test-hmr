const CHANGE = 'changes'
const INIT = 'init'
const INNER_TEXT = 'inner_text'
const PAGE = 'page'
const TEMPLATES = 'templates'

const init = inits => ({ type: INIT, inits })

const templates = templates => ({
  type: TEMPLATES,
  templates,
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

const loadCommands = (...files) => {
  const commands = {}
  const handlers = {}
  for (const file of files) {
    const cmd = require(file)
    const { name, command = name, type = command, handlers: subHandlers } = cmd
    if (type) {
      handlers[type] = cmd
    }
    if (command) {
      commands[command] = cmd
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

const cmds = loadCommands('./$$debug', './beforeLoad', './spec', './wait')

const commands = {
  change,
  init,
  innerText,
  page: pageProxy,
  templates,
  ...cmds.commands,
}

module.exports = {
  cmds: cmds.handlers,
  commands,

  CHANGE,
  INIT,
  INNER_TEXT,
  PAGE,
  TEMPLATES,
}
