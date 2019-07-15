/* eslint-env mocha */

const { expect } = require('chai')
const assert = require('assert')

const { writeHmr, loadPage } = require('.')
const normalizeHtml = require('./normalizeHtml')
const { parseSpecString } = require('./parseHmrSpec')

const {
  CHANGE,
  DEBUG,
  DISCARD_EXPECTS,
  EXPECT,
  EXPECT_AFTER,
  EXPECT_BEFORE,
  FLUSH_EXPECTS,
  INIT,
  INNER_TEXT,
  PAGE,
  SPEC,
  TEMPLATES,
  commands,
} = require('./testHmr.commands')

const nullLabel = Symbol('NULL LABEL')

const isGenerator = (() => {
  const GeneratorFunction = function*() {
    yield undefined
  }.constructor
  return fn => fn instanceof GeneratorFunction
})()

const consumeSub = (sub, callback) => consume(sub.call(commands), callback)

const consume = async (gen, callback, firstValue) => {
  let next
  let nextValue = firstValue
  do {
    next = gen.next(nextValue)
    nextValue = undefined
    const value = next.value
    if (!value) continue
    try {
      nextValue = await callback(value)
    } catch (err) {
      gen.throw(err)
    }
  } while (!next.done)
}

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

const renderChanges = (state, changes) => {
  const { templates } = state
  return Object.fromEntries(
    Object.entries(changes).map(([key, value]) => {
      const template = templates[key]
      const contents = template ? template(value) : value
      return [key, contents]
    })
  )
}

const renderSpecs = ({ specs }, spec, rm = commands.change.rm) =>
  Object.fromEntries(
    Object.entries(specs)
      .map(([path, fileSpec]) => {
        const content = fileSpec[spec] || fileSpec['*'] || rm
        return [path, content]
      })
      .filter(([, step]) => !!step)
  )

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

const assertExpect = async (state, expectation) => {
  const { before, after, steps = [] } = expectation
  if (before) {
    await consumeSub(before, state.processEffect)
  }
  for (const step of steps) {
    const { function: fn, html, before: beforeStep, after: afterStep } = step
    if (beforeStep) {
      await consumeSub(beforeStep, state.processEffect)
    }
    if (fn) {
      await fn.call(commands)
    }
    if (html) {
      const { page } = state
      const APP_ROOT_SELECTOR = '#app'
      const contents = await page.$eval(APP_ROOT_SELECTOR, el => el.innerHTML)
      const actual = normalizeHtml(contents)
      expect(actual).to.equal(html)
    }
    if (afterStep) {
      await consumeSub(afterStep, state.processEffect)
    }
  }
  if (after) {
    await consumeSub(after, state.processEffect)
  }
}

const consumeExpects = async (state, _untilLabel, alreadyWritten = false) => {
  const {
    config: { writeHmr },
  } = state
  const untilLabel = String(_untilLabel)
  const { remainingExpects } = state
  let lastLabel = nullLabel

  if (!remainingExpects || !remainingExpects.length) {
    return lastLabel
  }

  while (remainingExpects.length > 0) {
    const next = remainingExpects.shift()
    const [label, expect] = next

    lastLabel = label

    if (!alreadyWritten) {
      // const files = renderSpecs(state, changes)
      // await writeHmr(state.page, files)
      const files = renderSpecs(state, label)
      await writeHmr(state.page, files)
    }

    await assertExpect(state, expect)

    if (label === untilLabel) {
      return label
    }
  }

  return lastLabel
}

const flushExpects = state => consumeExpects(state, nullLabel)

const discardExpects = state => {
  state.remainingExpects = null
}

const renderInitFiles = (state, changes) => {
  if (typeof changes === 'string' || typeof changes === 'number') {
    if (state.initSpecLabel) {
      const previous = `previous: ${state.initSpecLabel}`
      throw new Error(`init with a spec label (${previous})`)
    } else {
      state.initSpecLabel = String(changes)
    }
    return renderSpecs(state, changes, false)
  }
  return renderChanges(state, changes)
}

const processTemplates = (state, effect) => {
  Object.assign(state.templates, effect.templates)
}

const parseSpecObject = (state, specs) => {
  const result = Object.fromEntries(
    Object.entries(specs).map(([file, spec]) => {
      if (typeof spec === 'string') {
        return [file, { '*': spec }]
      }
      return [file, spec]
    })
  )
  return { specs: result }
}

const parseRawExpectStep = expect => {
  const type = typeof expect
  switch (type) {
    case 'function':
      if (isGenerator(expect)) {
        return { sub: expect }
      } else {
        return { function: expect }
      }
    case 'string':
      return { html: expect }
    case 'object':
      return expect
    default:
      throw new Error(`Invalid expect argument (${typeof expect})`)
  }
}

const parseExpectStep = expect => {
  const result = parseRawExpectStep(expect)
  if (result.html) {
    result.html = normalizeHtml(result.html)
  }
  return result
}

const resolveExpect = (state, label) => {
  const stringLabel = String(label)
  const expect = state.expects.get(stringLabel)
  if (!expect) {
    const expect = { steps: [] }
    state.expects.set(String(label), expect)
    return expect
  }
  return expect
}

const addExpects = (state, expects) => {
  // guard: empty
  if (!expects) return
  expects.forEach(([label, input]) => {
    const step = parseExpectStep(input)
    const expect = resolveExpect(state, label)
    expect.steps.push(step)
  })
}

const addExpectHook = (state, hook, { label, sub }) => {
  assert(hook === 'before' || hook === 'after')
  const expect = resolveExpect(state, label)
  expect[hook] = sub
}

const processSpec = (state, { specs, functions }) => {
  const parser = typeof specs === 'string' ? parseSpecString : parseSpecObject
  const result = parser(state, specs, functions)
  Object.assign(state.specs, result.specs)
  // --- expectations ---
  // guard: no expects
  if (!result.expects) return
  result.expects.forEach(([label, expect]) => {
    state.expects.set(String(label), expect)
  })
}

const processPageProxy = (state, { method, args }) => {
  if (method) {
    return state.page[method](...args)
  } else {
    return state.page
  }
}

const initEffectProcessor = (state, start) => async effect => {
  switch (effect.type) {
    case DEBUG:
      return state

    case TEMPLATES:
      return processTemplates(state, effect)

    case SPEC:
      return processSpec(state, effect)

    case EXPECT_BEFORE:
      return addExpectHook(state, 'before', effect)

    case EXPECT_AFTER:
      return addExpectHook(state, 'after', effect)

    case EXPECT:
      addExpects(state, effect.expects)
      break

    case INIT: {
      const changes = initChanges(state, effect)
      const files = renderInitFiles(state, changes)
      Object.assign(state.inits, files)
      break
    }

    default:
      return await start(effect)
  }
}

const effectProcessor = state => {
  const {
    config: { writeHmr },
  } = state
  return async effect => {
    switch (effect.type) {
      case DEBUG:
        return state

      case TEMPLATES:
        return processTemplates(state, effect)

      case CHANGE: {
        const { changes } = effect
        if (typeof changes === 'string' || typeof changes === 'number') {
          const lastLabel = await consumeExpects(state, changes)
          // if our label has not been processed by consumeExpects (because
          // not present as an expectation), then we must do it ourselves
          if (lastLabel !== String(changes)) {
            const files = renderSpecs(state, changes)
            await writeHmr(state.page, files)
          }
        } else {
          const files = renderChanges(state, changes)
          await writeHmr(state.page, files)
        }
        break
      }

      case FLUSH_EXPECTS:
        return flushExpects(state)

      // allow bailing out, for testing
      case DISCARD_EXPECTS:
        return discardExpects(state)

      case PAGE:
        return processPageProxy(state, effect)

      case INNER_TEXT:
        return await state.page.$eval(effect.selector, el => el && el.innerText)
    }
  }
}

const createTestHmr = (options = {}) => {
  // config defaults
  const config = {
    it,
    loadPage,
    // TODO remove dep on global
    reset: (...args) => app.reset(...args),
    writeHmr,
    ...options,
  }

  const testHmr = (description, handler) => {
    // resolve actual config
    const { it, reset, loadPage } = config

    return it(description, async () => {
      const gen = handler.call(commands)
      const state = {
        config,
        pageUrl: '/',
        templates: {},
        inits: {},
        specs: {},
        // expects: Map([
        //   ['label', {
        //     before: fn*,
        //     after: fn*,
        //     steps: [
        //       {fn: async fn},
        //       {html: 'string'},
        //       {sub: fn*},
        //     ]
        //   }]
        // ])
        expects: new Map(),
        initSpecLabel: null,
        started: false,
      }

      // init phase -> run phase
      //
      // reset HRM sources & set initial source files...
      //
      const initTest = async () => {
        await reset(state.inits)
        delete state.inits // free mem

        // compile expectations
        state.remainingExpects = [...state.expects]

        if (state.initSpecLabel !== null) {
          ensureFirstExpect(state, state.initSpecLabel)
          await consumeExpects(state, state.initSpecLabel, true)
        }
      }

      const start = async firstEffect => {
        state.started = true

        const processEffect = effectProcessor(state)

        state.processEffect = processEffect

        const inPage = async page => {
          state.page = page
          const firstValue = await processEffect(firstEffect)
          await consume(gen, processEffect, firstValue)
          await flushExpects(state)
        }

        await initTest()

        await loadPage(state.pageUrl, inPage)
      }

      const processInitEffect = initEffectProcessor(state, start)

      await consume(gen, processInitEffect)

      if (!state.started && state.expects.size > 0) {
        await start(commands.spec.$$flush())
      }
    })
  }

  return testHmr
}

const testHmr = createTestHmr()

// for testing of testHmr itself
testHmr.create = createTestHmr

testHmr.skip = createTestHmr({ it: it.skip })

testHmr.only = createTestHmr({ it: it.only })

// === Export ===

module.exports = {
  testHmr,
  ...commands,
}
