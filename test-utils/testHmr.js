/* eslint-env mocha */

const assert = require('assert')

const { writeHmr, loadPage } = require('.')

const INIT = 'init'
const TEMPLATES = 'templates'
const SPEC = 'specs'
const EXPECT = 'expect'
const FLUSH_EXPECTS = 'flush_expects'
const DISCARD_EXPECTS = 'discard_expects'
const CHANGE = 'changes'
const INNER_TEXT = 'inner_text'
const DEBUG = 'debug'

const nullLabel = Symbol('NULL LABEL')

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

const renderSpecs = ({ specs }, spec, rm = change.rm) =>
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

const assertExpect = (() => {
  const sanitizeHtml = require('sanitize-html')
  const { expect } = require('chai')

  // https://stackoverflow.com/a/40026669/1387519
  const trimRegex = /(<(pre|script|style|textarea)[^]+?<\/\2)|(^|>)\s+|\s+(?=<|$)/g

  const dedupSpaceRegex = / {2,}/g

  const normalizeHtml = html => {
    let result = sanitizeHtml(html, {
      allowedTags: false,
      allowedAttributes: false,
      // selfClosing: false,
      allowedSchemes: false,
      allowedSchemesByTag: false,
      allowedSchemesAppliedToAttributes: false,
    })
    result = result.replace(trimRegex, '$1$3')
    result = result.replace(dedupSpaceRegex, ' ')
    return result
  }

  return async (state, expectation) => {
    if (typeof expectation === 'function') {
      await expectation()
    } else {
      const { page } = state
      const APP_ROOT_SELECTOR = '#app'
      const contents = await page.$eval(APP_ROOT_SELECTOR, el => el.innerHTML)
      const actual = normalizeHtml(contents)
      const expected = normalizeHtml(expectation)
      expect(actual).to.equal(expected)
    }
  }
})()

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

const addExpects = (state, expects) => {
  // guard: empty
  if (!expects) return
  expects.forEach(([label, expect]) => {
    if (typeof expect === 'string') {
      expect = expect.trim()
    }
    state.expects.set(String(label), expect)
  })
}

const processExpect = (state, { expects }) => {
  addExpects(state, expects)
}

const parseSpecString = (() => {
  const nameRegex = /^\s*----\s*([^-\s]+)(?:\s*-*\s*)?$/

  const emptyRegex = /^\s*$/

  const isEmpty = emptyRegex.test.bind(emptyRegex)

  const condRegex = /^(\s*)::([^\s+])\s+(.*)$/

  const parseConditions = (lines, source) => {
    const leading = []
    const conditions = {}

    let currentLabel
    let currentIndent
    let currentBranch

    const pushLine = line => {
      if (currentBranch) {
        currentBranch.push(line)
      } else {
        leading.push(line)
        Object.values(conditions).forEach(cond => {
          cond.push(line)
        })
      }
    }

    const getCondition = label => {
      let cond = conditions[label]
      if (!cond) {
        cond = [...leading]
        conditions[label] = cond
      }
      return cond
    }

    const openBranch = (label, content) => {
      if (currentBranch) {
        throw new Error(
          'Invalid specs (only supports one conditional level): ' + source
        )
      }
      currentLabel = label
      currentIndent = 1
      currentBranch = []
      if (!isEmpty(content)) {
        parseBranchLine(content)
      }
    }

    const closeBranch = () => {
      const cond = getCondition(currentLabel)
      cond.push(...currentBranch)
      currentBranch = null
    }

    const parseBranchLine = line => {
      const closed = line.split('').some((char, i) => {
        if (char === '{') {
          currentIndent++
        } else if (char === '}') {
          currentIndent--
        }
        if (currentIndent === 0) {
          const left = line.substr(0, i)
          if (!isEmpty(left)) {
            currentBranch.push(left)
          }
          closeBranch()
          const right = line.substr(i + 1)
          if (!isEmpty(right)) {
            pushLine(right)
          }
          return true
        }
      })
      if (!closed) {
        currentBranch.push(line)
      }
    }

    lines.forEach(line => {
      // guard: inside a conditional branch
      if (currentBranch) {
        parseBranchLine(line)
        return
      }
      const condMatch = condRegex.exec(line)
      if (!condMatch) {
        pushLine(line)
        return
      }
      const [, indent, label, content] = condMatch
      if (content[0] === '{') {
        // multi line condition
        openBranch(label, indent + content.substr(1))
      } else {
        // single line condition
        const condition = getCondition(label)
        condition.push(indent + content)
      }
    })

    const result = {
      '*': leading.join('\n'),
    }
    // guard: no conditions
    if (Object.keys(conditions).length === 0) {
      return result
    }
    // with conditions
    return {
      ...result,
      ...Object.fromEntries(
        Object.entries(conditions).map(([file, lines]) => [
          file,
          lines.join('\n'),
        ])
      ),
    }
  }

  return (state, specs) => {
    const specLines = specs.split('\n')

    const result = {}
    let currentFile
    let currentLines

    const endFile = () => {
      result[currentFile] = parseConditions(currentLines, specs)
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

    return { specs: result }
  }
})()

const processSpec = (state, { specs }) => {
  const parser = typeof specs === 'string' ? parseSpecString : parseSpecObject
  const result = parser(state, specs)
  Object.assign(state.specs, result.specs)
  addExpects(state, result.expects)
}

const initEffectProcessor = (state, start) => async effect => {
  switch (effect.type) {
    case DEBUG:
      return state

    case TEMPLATES:
      return processTemplates(state, effect)

    case SPEC:
      return processSpec(state, effect)

    case EXPECT:
      return processExpect(state, effect)

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

  return (description, handler) => {
    // resolve actual config
    const { it, reset, loadPage } = config

    return it(description, async function() {
      this.slow(1000)

      const gen = handler()
      const state = {
        config,
        pageUrl: '/',
        templates: {},
        inits: {},
        specs: {},
        expects: new Map(),
        initSpecLabel: null,
      }

      let started = false

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
        started = true

        const processEffect = effectProcessor(state)

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

      if (!started && state.expects.size > 0) {
        await start(spec.flush())
      }
    })
  }
}

const testHmr = createTestHmr()

// for testing of testHmr itself
testHmr.create = createTestHmr

testHmr.skip = createTestHmr({ it: it.skip })

testHmr.only = createTestHmr({ it: it.only })

// === Effects ===

const init = inits => ({ type: INIT, inits })

const templates = templates => ({
  type: TEMPLATES,
  templates,
})

const interpolate = (strings, values) =>
  strings
    .reduce((parts, string, i) => {
      parts.push(string)
      if (values.length > i) {
        parts.push(values[i])
      }
      return parts
    }, [])
    .join('')

const spec = (arg, ...args) => {
  const specs = Array.isArray(arg) ? interpolate(arg, args) : arg
  return {
    type: SPEC,
    specs,
  }
}

spec.expect = (label, expects) => {
  let payload
  if (Array.isArray(label)) {
    // yield spec.expect([[label, expect], ...])
    assert(expects === undefined)
    payload = label
  } else if (expects === undefined) {
    // used a a template literal tag
    return (parts, ...vals) => spec.expect(label, interpolate(parts, vals))
  } else {
    // yield spec.expect(label, expect)
    assert(expects != null)
    payload = [[label, expects]]
  }
  return {
    type: EXPECT,
    expects: payload,
  }
}

spec.flush = () => ({
  type: FLUSH_EXPECTS,
})

spec.discard = () => ({
  type: DISCARD_EXPECTS,
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
