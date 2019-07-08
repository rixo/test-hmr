/* eslint-env mocha */

const { writeHmr, loadPage } = require('.')

const INIT = 'init'
const TEMPLATES = 'templates'
const SPEC = 'specs'
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

// accepts templates as initial file content; templates are also rendered
// with `undefined` as only argument, and included into initial files (inits)
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

const renderFiles = (state, changes, rm) => {
  if (typeof changes === 'string' || typeof changes === 'number') {
    return renderSpecs(state, changes, rm)
  }
  const { templates } = state
  return Object.fromEntries(
    Object.entries(changes).map(([key, value]) => {
      const template = templates[key]
      const contents = template ? template(value) : value
      return [key, contents]
    })
  )
}

const renderSpecs = ({ specs }, spec, rm = change.rm) =>
  Object.fromEntries(
    Object.entries(specs)
      .map(([path, fileSpec]) => {
        const content = fileSpec[spec] || fileSpec['*'] || rm
        return [path, content]
      })
      .filter(([, step]) => !!step)
  )

const processTemplates = (state, effect) => {
  Object.assign(state.templates, effect.templates)
}

const parseSpecObject = (state, specs) =>
  Object.fromEntries(
    Object.entries(specs).map(([file, spec]) => {
      if (typeof spec === 'string') {
        return [file, { '*': spec }]
      }
      return [file, spec]
    })
  )

const parseSpecString = (() => {
  const nameRegex = /^\s*====\s*([^=\s]+)(?:\s*====\s*)?$/

  const emptyRegex = /^\s*$/

  const isEmpty = emptyRegex.test.bind(emptyRegex)

  const condRegex = /^(\s*)#([^\s+])\s+(.*)$/

  const parseConditions = lines => {
    const leading = []
    const conditions = {}

    const getCondition = label => {
      let cond = conditions[label]
      if (!cond) {
        cond = [...leading]
        conditions[label] = cond
      }
      return cond
    }

    const pushLine = line => {
      leading.push(line)
      Object.values(conditions).forEach(cond => {
        cond.push(line)
      })
    }

    lines.forEach(line => {
      const condMatch = condRegex.exec(line)
      if (condMatch) {
        const [, indent, label, content] = condMatch
        const condition = getCondition(label)
        condition.push(indent + content)
      } else {
        pushLine(line)
      }
    })

    // guard: no conditions
    if (Object.keys(conditions).length === 0) {
      return {
        '*': leading.join('\n'),
      }
    }
    // with conditions
    return Object.fromEntries(
      Object.entries(conditions).map(([file, lines]) => [
        file,
        lines.join('\n'),
      ])
    )
  }

  return (state, specs) => {
    const specLines = specs.split('\n')

    const result = {}
    let currentFile
    let currentLines

    const endFile = () => {
      result[currentFile] = parseConditions(currentLines)
    }

    const maybeEndFile = () => {
      if (currentLines) {
        endFile()
      }
    }

    const startFile = filename => {
      maybeEndFile()
      currentFile = filename
      // empty line for indentation consistency (read: this ways, it is
      // easier to write expectations to test parseSpecString)
      currentLines = ['']
    }

    specLines.forEach(line => {
      const nameMatch = nameRegex.exec(line)
      if (nameMatch) {
        startFile(nameMatch[1])
      } else {
        if (!currentLines) {
          if (isEmpty(line)) {
            return
          }
          throw new Error('Invalid spec string: ' + specs)
        }
        currentLines.push(line)
      }
    })

    // last file
    maybeEndFile()

    return result
  }
})()

const processSpec = (state, { specs }) => {
  const parser = typeof specs === 'string' ? parseSpecString : parseSpecObject
  const result = parser(state, specs)
  Object.assign(state.specs, result)
}

const initEffectProcessor = (state, start) => async effect => {
  switch (effect.type) {
    case DEBUG:
      return state

    case TEMPLATES:
      return processTemplates(state, effect)

    case SPEC:
      return processSpec(state, effect)

    case INIT: {
      const changes = initChanges(state, effect)
      const files = renderFiles(state, changes, false)
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
        specs: {},
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

const spec = specs => ({
  type: SPEC,
  specs,
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
  spec,
  innerText,
  change,
  debug,
}
