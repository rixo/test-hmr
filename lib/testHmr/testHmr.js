/* eslint-env mocha */

const { expect } = require('chai')
const { inspect } = require('util')

const debug = require('debug')('test-hmr:testHmr')

const { writeHmr, loadPage } = require('..')
const { parseFullSpec, parseTitleOnly } = require('../hmr-spec')
const Deferred = require('../deferred')
const {
  isRunSpecTagAsDescribe,
  isDescribeByStep,
  appRootSelector,
  appHtmlPrefix,
  console: consoleConfig,
} = require('../config')

const interpolateFunctions = require('./interpolateFunctions')
const { consume, consumeSub } = require('./consume')
const { consumeExpects, flushExpects } = require('./expect')
const ConsoleMonitor = require('./console-monitor')
const { commands, handlers: publicHandlers } = require('./commands')

// internal command
const SET_SPEC = Symbol('SET_SPEC')

const handlers = {
  [SET_SPEC]: { init: setSpec },
  ...publicHandlers,
}

const ensureFirstExpect = (state, label) => {
  const { remainingExpects } = state
  if (!remainingExpects || !remainingExpects.length) return
  const [first] = remainingExpects
  const [nextLabel] = first
  if (nextLabel !== label) {
    // null out remaining expects to prevent flushing them (and crashing again)
    state.remainingExpects = null
    const details = `expected: ${nextLabel}, found: ${label}`
    throw new Error(`Must init with first step (${details})`)
  }
}

function setSpec(state, { ast }) {
  Object.assign(state.specs, ast.specs)

  state.beforeLoad = ast.beforeLoad

  // --- expectations ---
  // guard: no expects
  if (!ast.expects) return
  ast.expects.forEach(([label, expect]) => {
    state.expects.set(String(label), expect)
  })
}

const createCommandProcessor = (
  key,
  defaultHandler
) => state => async command => {
  debug('command (%s)', key, command)

  const { type } = command

  const cmd = handlers[type]

  if (!cmd) {
    throw new Error('Missing command: ' + type)
  }

  const { [key]: handler } = cmd

  if (handler) {
    return handler(state, command)
  }

  if (defaultHandler) {
    return defaultHandler(state, command)
  }
}

const initCommandProcessor = (state, start) => {
  const defaultHandler = (state, command) => start(command)
  return createCommandProcessor('init', defaultHandler)(state)
}

const commandProcessor = createCommandProcessor('run')

class FailError extends Error {
  name = 'Fail'
}

const runHandler = async (config, handler) => {
  const { reset, loadPage } = config
  const state = {
    config,
    commands,
    pageUrl: '/',
    templates: {},
    inits: {},
    specs: {},
    // expects: Map([
    //   ['label', {
    //     before: fn*,
    //     after: fn*,
    //     steps: [
    //       {function: async fn},
    //       {html: 'string'},
    //       {sub: fn*},
    //     ]
    //   }]
    // ])
    expects: new Map(),
    initSpecLabel: null,
    started: false,
    console: {
      ignoreWarnings: [],
      ignoreErrors: [],
      // expectWarnings: [],
      // expectErrors: [],
      // expectLogs: [],
    },
    scope: Object.create(commands),
  }
  const gen = handler.call(state.scope)

  // init phase -> run phase
  //
  // reset HRM sources & set initial source files...
  //
  const initTest = async () => {
    debug('initTest')
    await reset(state.inits)
    // compile expectations
    state.remainingExpects = [...state.expects]
    debug('initTest: done')
  }

  const start = async firstCommand => {
    debug('start (firstCommand=%s)', firstCommand)
    state.started = true

    const processCommand = commandProcessor(state)

    state.processCommand = processCommand

    const consoleMonitor = ConsoleMonitor(state)

    const failDeferred = Deferred()

    state.fail = x =>
      failDeferred.reject(typeof x === 'string' ? new FailError(x) : x)

    const inPage = async page => {
      state.page = page
      try {
        if (state.initSpecLabel !== null) {
          ensureFirstExpect(state, state.initSpecLabel)
          await consumeExpects(state, state.initSpecLabel, true)
        }
        const firstValue = firstCommand && (await processCommand(firstCommand))
        await consume(gen, processCommand, firstValue)
        await flushExpects(state)
      } finally {
        consoleMonitor.close()
        failDeferred.resolve()
      }
    }

    await initTest()

    const beforeGoto = page => {
      debug('start: beforeGoto(%j)', page)
      consoleMonitor.setPage(page)
      if (state.beforeLoad) {
        state.page = page
        return consumeSub(state, state.beforeLoad, processCommand)
      }
    }

    await Promise.all([
      loadPage(state.pageUrl, inPage, beforeGoto),
      consoleMonitor.promise,
      failDeferred.promise,
    ])

    debug('start: started')
  }

  const processInitCommand = initCommandProcessor(state, start)

  await consume(gen, processInitCommand)

  const nExpects = state.expects.size
  const started = !state.started && nExpects > 0
  debug('runHandler (started=%s, nExpects=%s)', started, nExpects)
  if (started) {
    await start()
  }
}

const stepTitle = (step, i) => {
  const title = `step ${i}`
  const types = ['html', 'sub', 'function']
  for (const type of types) {
    if (step[type] != null) {
      return `${title} (${type})`
    }
  }
  return title
}

const runTagHandler = (cfg, ast) =>
  runHandler(cfg, function*() {
    yield {
      type: SET_SPEC,
      ast,
    }
    const firstLabel = ast.expects && ast.expects[0] && ast.expects[0][0]
    if (firstLabel) {
      yield commands.init(firstLabel)
    }
  })

// we ought not to crash outside of a `it` block for good manners
const parseFullSpecAst = (config, strings, values) => {
  const { source, functions } = interpolateFunctions(strings, values)
  try {
    const { title } = parseTitleOnly(source)
    try {
      const ast = parseFullSpec(source, functions)
      // guard: no expectations => skip
      if (!ast.expects || !ast.expects.length) {
        config.it(title, () => {
          let msg = 'no assertions'
          const match = /(!::\s*)((\w+)::)/.exec(source)
          if (match) {
            msg += ` -- are you mistaking "${match[1]}" for "::${match[2]}"?`
          }
          expect.fail(msg)
        })
        return false
      }
      return { ast, title }
    } catch (parseFullSpecError) {
      config.it(title, () => {
        parseFullSpecError.name = 'SpecParseError'
        throw parseFullSpecError
      })
      return false
    }
  } catch (parseTitleError) {
    config.it(source, () => {
      parseTitleError.name = 'SpecParseError'
      throw parseTitleError
    })
  }
}

const runAsDescribeTag = (config, strings, values) => {
  const parsed = parseFullSpecAst(config, strings, values)
  // guard: parse error (already reported)
  if (!parsed) return
  const { ast, title } = parsed
  // guard: only one update case => run as 'it'
  if (
    !config.isDescribeByStep() &&
    ast.expects.length === 1 &&
    ast.expects[0][1].steps.length === 1
  ) {
    return config.it(title, function() {
      return runTagHandler(config, ast)
    })
  }
  // nominal: run as 'describe'
  config.describe(title, function() {
    let globalError = null
    let abort = false

    const condEntries = ast.expects.map(([, expect], index) => {
      const steps = expect.steps
      const desc = `after update ${index}${
        expect.title ? ` (${expect.title})` : ''
      }`

      if (!config.isDescribeByStep()) {
        const deferred = Deferred()
        const promise = deferred.promise.catch(err => {
          deferred.error = err
        })
        config.it(desc, function() {
          if (globalError) {
            const error = globalError
            globalError = null
            abort = true
            throw error
          } else if (abort) {
            this.skip()
          } else {
            return promise
              .then(() => {
                const err = deferred.error
                if (err) {
                  throw err
                }
              })
              .catch(err => {
                abort = true
                throw err
              })
          }
        })
        return [index, deferred]
      }

      let stepEntries
      config.actualDescribe(desc, () => {
        stepEntries = steps.map((step, i) => {
          const deferred = Deferred()
          const promise = deferred.promise.catch(err => {
            deferred.error = err
          })
          config.it(stepTitle(step, i), function() {
            if (abort) {
              this.skip()
            } else {
              return promise.then(() => {
                const err = deferred.error
                if (err) {
                  abort = true
                  throw err
                }
              })
            }
          })
          return [i, deferred]
        })
      })
      return [index, Object.fromEntries(stepEntries)]
    })
    const its = Object.fromEntries(condEntries)

    const cfg = { ...config, its }

    config.before(async () => {
      try {
        return runTagHandler(cfg, ast)
      } catch (err) {
        globalError = err
      }
    })
  })
}

const runAsItTag = (config, strings, values) => {
  const parsed = parseFullSpecAst(config, strings, values)
  // guard: parse error (already reported)
  if (!parsed) return
  const { ast, title } = parsed
  config.it(title, () => runTagHandler(config, ast))
}

const configDefaults = {
  it: (...args) => it(...args),
  describe: (...args) => describe(...args),
  actualDescribe: (...args) => describe(...args),
  before: (...args) => before(...args),
  loadPage,
  // TODO remove dep on global
  reset: (...args) => app.reset(...args),
  writeHmr,
  isRunSpecTagAsDescribe,
  isDescribeByStep,
  appRootSelector,
  appHtmlPrefix,
  console: consoleConfig,
}

const createTestHmr = (options = {}) => {
  // config defaults
  const config = {
    ...configDefaults,
    ...options,
  }

  const testHmr = (description, handler) =>
    config.it(description, () => runHandler(config, handler))

  const testHmrTag = (strings, values) => {
    const runAsTag = config.isRunSpecTagAsDescribe()
      ? runAsDescribeTag
      : runAsItTag
    return runAsTag(config, strings, values)
  }

  const runAsTestOrTag = (...args) => {
    const [arg1, ...values] = args
    if (Array.isArray(arg1)) {
      return testHmrTag(arg1, values)
    } else {
      return testHmr(...args)
    }
  }

  return runAsTestOrTag
}

const testHmr = createTestHmr()

// for testing of testHmr itself
testHmr.create = createTestHmr

testHmr.skip = createTestHmr({
  it: (...args) => it.skip(...args),
  describe: (...args) => describe.skip(...args),
})

testHmr.only = createTestHmr({
  it: (...args) => it.only(...args),
  describe: (...args) => describe.only(...args),
})

testHmr.debug = (strings, ...values) => {
  const { source, functions } = interpolateFunctions(strings, values)
  const { title } = parseTitleOnly(source)
  // eslint-disable-next-line no-console
  console.debug('Debugging test', title)
  const ast = parseFullSpec(source, functions)
  // eslint-disable-next-line no-console
  console.debug(inspect(ast, false, 10, true))
  cancelRunningTests()
}

// === Export ===

module.exports = Object.assign(testHmr, {
  testHmr,
  ...commands,
})
