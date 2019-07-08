/* eslint-env mocha */

const { writeHmr, loadPage } = require('.')

const INIT = 'init'
const TEMPLATES = 'templates'
const CHANGE = 'changes'
const INNER_TEXT = 'inner_text'
const DEBUG = 'debug'

const consume = async (gen, callback, firstValue) => {
  let next
  let nextValue = firstValue
  do {
    next = gen.next(nextValue)
    nextValue = undefined
    const value = next.value
    if (!value) continue
    nextValue = await callback(value)
  } while (!next.done)
}

const renderFiles = ({ templates }, inits) =>
  Object.fromEntries(
    Object.entries(inits).map(([key, value]) => {
      const template = templates[key]
      const contents = template ? template(value) : value
      return [key, contents]
    })
  )

const processTemplates = (state, effect) => {
  Object.assign(state.templates, effect.templates)
}

const initEffectProcessor = (state, start) => async effect => {
  switch (effect.type) {
    case DEBUG:
      return state

    case TEMPLATES:
      return processTemplates(state, effect)

    case INIT: {
      const changes = {}

      // accepts templates as initial file content; template is rendered
      // with `undefined` as only argument
      //
      // yield init({
      //   'App.svelte': (slot = 'World') => `<h1>Hello, ${slot}!</h1>`
      // })
      //
      // equivalent to:
      //
      // yield templates({
      //   'App.svelte': (slot = 'World') => `<h1>Hello, ${slot}!</h1>`
      // })
      // yield init({
      //   'App.svelte': undefined
      // })
      //
      Object.entries(effect.inits).forEach(([path, init]) => {
        if (typeof init === 'function') {
          state.templates[path] = init
          changes[path] = undefined
        } else {
          changes[path] = init
        }
      })
      const files = renderFiles(state, changes)
      Object.assign(state.inits, files)
      break
    }

    default:
      return await start(effect)
  }
}

const effectProcessor = (state, { writeHmr }) => async effect => {
  switch (effect.type) {
    case DEBUG:
      return state

    case TEMPLATES:
      return processTemplates(state, effect)

    case CHANGE: {
      const files = renderFiles(state, effect.changes)
      await writeHmr(state.page, files)
      break
    }

    case INNER_TEXT:
      return await state.page.$eval(effect.selector, el => el && el.innerText)
  }
}

const createTestHmr = (options = {}) => {
  const config = {
    it,
    loadPage,
    reset: (...args) => app.reset(...args),
    writeHmr,
    ...options,
  }
  return (description, handler) => {
    const { it, reset, loadPage } = config
    return it(description, async function() {
      this.slow(1000)

      const gen = handler()
      const state = {
        pageUrl: '/',
        templates: {},
        inits: {},
      }

      const processEffect = effectProcessor(state, config)

      // reset HRM sources & set initial source files
      const initTest = async () => {
        await reset(state.inits)
        delete state.inits // free mem
      }

      const start = async firstEffect => {
        const inPage = async page => {
          state.page = page
          const firstValue = await processEffect(firstEffect)
          await consume(gen, processEffect, firstValue)
        }

        await initTest()

        await loadPage(state.pageUrl, inPage)
      }

      const processInitEffect = initEffectProcessor(state, start)

      await consume(gen, processInitEffect)
    })
  }
}

const testHmr = createTestHmr()

// for testing of testHmr itself
testHmr.create = createTestHmr

testHmr.skip = createTestHmr({ test: it.skip })

testHmr.only = createTestHmr({ test: it.only })

// === Effects ===

const init = inits => ({ type: INIT, inits })

const templates = templates => ({
  type: TEMPLATES,
  templates,
})

const innerText = selector => ({
  type: INNER_TEXT,
  selector,
})

const change = changes => ({
  type: CHANGE,
  changes,
})

change.rm = Symbol('change: rm')

const debug = () => ({ type: DEBUG })

// === Export ===

module.exports = {
  testHmr,
  init,
  templates,
  innerText,
  change,
  debug,
}
