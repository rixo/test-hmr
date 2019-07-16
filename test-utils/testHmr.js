/* eslint-env mocha */

const { expect } = require('chai')
const assert = require('assert')

const { writeHmr, loadPage } = require('.')
const normalizeHtml = require('./normalizeHtml')
const interpolateFunctions = require('./interpolateFunctions')
const { parseInlineSpec, parseFullSpec, parseTitleOnly } = require('./hmr-spec')
const { runSpecTagAsDescribe, describeByStep } = require('./config')

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

// internal command
const SET_SPEC = Symbol('SET_SPEC')

const nullLabel = Symbol('NULL LABEL')

const isGenerator = (() => {
  const GeneratorFunction = function*() {
    yield undefined
  }.constructor
  return fn => fn instanceof GeneratorFunction
})()

const IS_DEFERRED = Symbol('IS_DEFERRED')

const Deferred = () => {
  const deferred = {
    [IS_DEFERRED]: true,
  }
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve
    deferred.reject = reject
  })
  return deferred
}

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
      if (nextValue instanceof consume.Return) {
        return nextValue.value
      }
    } catch (err) {
      gen.throw(err)
    }
  } while (!next.done)
}

consume.Return = function ConsumeReturn(value) {
  this.value = value
}

consume.return = value => new consume.Return(value)

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

const passIt = (its, key, handler) => {
  const promise = handler()
  if (its && its[key]) {
    // NOTE mute the error, if we're running in a describe
    return promise
      .then(r => {
        its[key].resolve(r)
      })
      .catch(err => {
        its[key].reject(err)
      })
  }
  return promise
}

const assertExpect = async (state, expectation, cond) => {
  // its: test promises that we need to resolve (for tag spec as describe)
  const { its: { [cond]: its } = {} } = state.config
  const { before, after, steps = [] } = expectation
  let stepName = ''
  try {
    if (before) {
      stepName = 'before'
      await consumeSub(before, state.processEffect)
    }
    let i = 0
    for (const step of steps) {
      const index = i++
      stepName = `step ${index}`
      // eslint-disable-next-line no-loop-func
      await passIt(its, index, async () => {
        const {
          function: fn,
          html,
          sub,
          before: beforeStep,
          after: afterStep,
        } = step
        if (beforeStep) {
          stepName = `step ${index} (before)`
          await consumeSub(beforeStep, state.processEffect)
        }
        if (fn) {
          stepName = `step ${index} (sub)`
          await fn.call(commands)
        }
        if (sub) {
          stepName = `step ${index} (sub)`
          await consumeSub(sub, state.processEffect)
        }
        if (html != null) {
          stepName = `step ${index} (html)`
          const { page } = state
          const APP_ROOT_SELECTOR = '#app'
          const contents = await page.$eval(
            APP_ROOT_SELECTOR,
            el => el.innerHTML
          )
          const actual = normalizeHtml(contents)
          expect(actual).to.equal(html)
        }
        if (afterStep) {
          stepName = `step ${index} (after)`
          await consumeSub(afterStep, state.processEffect)
        }
      })
    }
    if (after) {
      stepName = 'after'
      await consumeSub(after, state.processEffect)
    }
    // case: spec tag as 1 it by condition (not step)
    if (its && its[IS_DEFERRED]) {
      its.resolve()
    }
  } catch (err) {
    // case: spec tag as 1 it by condition (not step)
    if (its && its[IS_DEFERRED]) {
      if (steps.length > 1 && stepName) {
        err.name = stepName
      }
      its.reject(err)
    } else {
      throw err
    }
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
      const files = renderSpecs(state, label)
      await writeHmr(state.page, files)
    }

    await assertExpect(state, expect, label)

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

const parseSpecObject = specs => {
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

const setSpec = (state, ast) => {
  Object.assign(state.specs, ast.specs)
  // --- expectations ---
  // guard: no expects
  if (!ast.expects) return
  ast.expects.forEach(([label, expect]) => {
    state.expects.set(String(label), expect)
  })
}

const processSpec = (state, { specs, functions }) => {
  const parser = typeof specs === 'string' ? parseInlineSpec : parseSpecObject
  const ast = parser(specs, functions)
  return setSpec(state, ast)
}

const resolvePath = (obj, path) => {
  let parent
  let target = obj
  if (path) {
    for (const step of path) {
      parent = target
      target = parent[step]
    }
  }
  return { target, parent }
}

const processPageProxy = (state, { path, args }) => {
  const { target, parent } = resolvePath(state.page, path)
  if (args) {
    if (typeof target === 'function') {
      return target.apply(parent, args)
    } else {
      if (args.length > 0) {
        throw new Error(
          `page.${path.join('.')} is not a function: the proxy call must ` +
            'have exactly 0 arguments to retrieve the object instance'
        )
      }
      return target
    }
  } else {
    return target
  }
}

const initEffectProcessor = (state, start) => async command => {
  switch (command.type) {
    case DEBUG:
      return state

    case TEMPLATES:
      return processTemplates(state, command)

    case SPEC:
      return processSpec(state, command)

    case EXPECT_BEFORE:
      return addExpectHook(state, 'before', command)

    case EXPECT_AFTER:
      return addExpectHook(state, 'after', command)

    case EXPECT:
      addExpects(state, command.expects)
      break

    case INIT: {
      const changes = initChanges(state, command)
      const files = renderInitFiles(state, changes)
      Object.assign(state.inits, files)
      break
    }

    case SET_SPEC: {
      setSpec(state, command.ast)
      break
    }

    default:
      return await start(command)
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

const runHandler = async (config, handler) => {
  const { reset, loadPage } = config
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
      const firstValue = firstEffect && (await processEffect(firstEffect))
      await consume(gen, processEffect, firstValue)
      await flushExpects(state)
    }

    await initTest()

    await loadPage(state.pageUrl, inPage)
  }

  const processInitEffect = initEffectProcessor(state, start)

  await consume(gen, processInitEffect)

  if (!state.started && state.expects.size > 0) {
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

const runAsDescribeTag = (config, strings, values) => {
  const { source, functions } = interpolateFunctions(strings, values)
  const { title } = parseTitleOnly(source)
  let ast
  // we ought not to crash outside of a `it` block for good manners
  try {
    ast = parseFullSpec(source, functions)
  } catch (err) {
    err.name = 'SpecParseError'
    throw err
  }

  // guard: no expectations => skip
  if (!ast.expects || !ast.expects.length) {
    config.describeSkip(title)
    return
  }
  // guard: only one update case => run as 'it'
  if (ast.expects.length === 1 && ast.expects[0][1].steps.length === 1) {
    return config.it(title, async function() {
      return runHandler(config, function*() {
        yield {
          type: SET_SPEC,
          ast,
        }
      })
    })
  }
  // nominal: run as 'describe'
  config.describe(title, function() {
    let abort = false
    const condEntries = ast.expects.map(([, expect], index) => {
      const steps = expect.steps
      const desc = `after update ${index}${
        expect.title ? ` (${expect.title})` : ''
      }`

      if (!config.describeByStep) {
        const deferred = Deferred()
        const promise = deferred.promise.catch(err => {
          deferred.error = err
        })
        config.it(desc, function() {
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
    config.before(() => {
      const cfg = { ...config, its }
      return runHandler(cfg, function*() {
        yield {
          type: SET_SPEC,
          ast,
        }
      })
    })
  })
}

const runAsItTag = (config, strings, values) => {
  const { source, functions } = interpolateFunctions(strings, values)
  const { title } = parseTitleOnly(source)
  config.it(title, async function() {
    const ast = parseFullSpec(source, functions)
    if (!ast.expects) {
      this.skip()
    } else {
      return runHandler(config, function*() {
        yield {
          type: SET_SPEC,
          ast,
        }
      })
    }
  })
}

const configDefaults = {
  it,
  describe,
  actualDescribe: describe,
  describeSkip: it.skip, // use `it` because skipped describe are not reported
  before,
  loadPage,
  // TODO remove dep on global
  reset: (...args) => app.reset(...args),
  writeHmr,
  runTagAsDescribe: runSpecTagAsDescribe,
  describeByStep,
}

const createTestHmr = (options = {}) => {
  // config defaults
  const config = {
    ...configDefaults,
    ...options,
  }

  const testHmr = (description, handler) =>
    config.it(description, () => runHandler(config, handler))

  const runAsTag = config.runTagAsDescribe ? runAsDescribeTag : runAsItTag

  const testHmrTag = (strings, values) => runAsTag(config, strings, values)

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

testHmr.skip = createTestHmr({ it: it.skip, describe: describe.skip })

testHmr.only = createTestHmr({ it: it.only, describe: describe.only })

// === Export ===

module.exports = Object.assign(testHmr, {
  testHmr,
  ...commands,
})
