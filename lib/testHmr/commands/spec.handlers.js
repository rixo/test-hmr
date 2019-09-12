const assert = require('assert')

const { parseInlineSpec } = require('../../hmr-spec')
const normalizeHtml = require('../../normalizeHtml')
const { fromEntries } = require('../../util')

const { flushExpects } = require('../expect')

const isGenerator = (() => {
  const GeneratorFunction = function*() {
    yield undefined
  }.constructor
  return fn => fn instanceof GeneratorFunction
})()

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
      if (Array.isArray(expect)) {
        return { html: expect }
      } else if (expect instanceof RegExp) {
        return { html: [expect] }
      }
      return expect
    default:
      throw new Error(`Invalid expect argument (${typeof expect})`)
  }
}

const normalizeStrings = arg => {
  if (typeof arg === 'string') {
    return normalizeHtml(arg)
  } else if (Array.isArray(arg)) {
    return arg.map(value =>
      typeof value === 'string' ? normalizeHtml(value) : value
    )
  } else {
    throw new Error('Not normalizable: ' + arg)
  }
}

const parseExpectStep = expect => {
  const result = parseRawExpectStep(expect)
  if (result.html) {
    result.html = normalizeStrings(result.html)
  }
  return result
}

const addExpects = (state, { expects }) => {
  // guard: empty
  if (!expects) return
  expects.forEach(([label, input]) => {
    const step = parseExpectStep(input)
    const expect = resolveExpect(state, label)
    expect.steps.push(step)
  })
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

const addExpectHook = (state, hook, { label, sub }) => {
  assert(hook === 'before' || hook === 'after')
  const expect = resolveExpect(state, label)
  expect[hook] = sub
}

const parseSpecObject = specs => {
  const result = fromEntries(
    Object.entries(specs).map(([file, spec]) => {
      if (typeof spec === 'string') {
        return [file, { '*': spec }]
      }
      return [file, spec]
    })
  )
  return { specs: result }
}

const setSpec = (state, ast) => {
  Object.assign(state.specs, ast.specs)

  state.beforeLoad = ast.beforeLoad

  // --- expectations ---
  // guard: no expects
  if (!ast.expects) return
  ast.expects.forEach(([label, expect]) => {
    state.expects.set(String(label), expect)
  })
}

const init = (state, { specs, functions }) => {
  const parser = typeof specs === 'string' ? parseInlineSpec : parseSpecObject
  const ast = parser(specs, functions)
  return setSpec(state, ast)
}

const before = {
  init: (state, command) => {
    addExpectHook(state, 'before', command)
  },
}

const after = {
  init: (state, command) => {
    addExpectHook(state, 'after', command)
  },
}

const expect = {
  init: addExpects,
}

const $$flush = {
  run: flushExpects,
}

const $$discard = {
  run: state => {
    state.remainingExpects = null
  },
}

module.exports = spec => ({
  [spec.type]: { init },
  [spec.before.type]: before,
  [spec.after.type]: after,
  [spec.expect.type]: expect,
  [spec.$$flush.type]: $$flush,
  [spec.$$discard.type]: $$discard,
})
