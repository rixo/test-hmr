/* eslint-env mocha */

const { expect } = require('chai')

const { writeHmr, loadPage } = require('.')
const normalizeHtml = require('./normalizeHtml')

const cmd = require('./testHmr.commands')
const { commands } = cmd

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
  const { fns, html, subs } = expectation
  if (fns) {
    await Promise.all(fns.map(fn => fn()))
  }
  if (subs) {
    for (const sub of subs) {
      await consume(sub.call(commands), state.processEffect)
    }
  }
  if (html) {
    const { page } = state
    const APP_ROOT_SELECTOR = '#app'
    const contents = await page.$eval(APP_ROOT_SELECTOR, el => el.innerHTML)
    const actual = normalizeHtml(contents)
    expect(actual).to.equal(html)
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

const parseSpecString = (() => {
  const nameRegex = /^\s*----\s*([^-\s]+)(?:\s*-*\s*)?$/

  const emptyRegex = /^\s*$/

  const isEmpty = emptyRegex.test.bind(emptyRegex)

  const condRegex = /^(\s*)::([^\s+])(?:\s+(.*))?$/

  const expectRegex = /^\s*\*{4,}\s*$/

  const lengthReducer = (total, { length }) => total + length

  const parseConditions = (
    lines,
    source,
    startIndex,
    initialFunctions,
    parseOrder = false
  ) => {
    const leading = []
    const conditions = {}
    const labelOrder = []

    let currentLabel
    let currentBlocks
    let currentBranch
    let currentStartIndex

    const functions =
      initialFunctions &&
      initialFunctions.filter(({ index }) => index >= startIndex)
    let currentIndex = startIndex

    const shiftFunctions = (from, to) => {
      const result = []
      if (functions) {
        let next
        while ((next = functions[0])) {
          const { index } = next
          if (index < from) {
            throw new Error('Sub handler must be in condition')
          }
          if (index > to) {
            break
          }
          result.push(functions.shift().fn)
        }
      }
      return result
    }

    const pushLine = line => {
      if (currentBranch) {
        currentBranch.push(line)
      } else {
        leading.push(line)
        const lineStart = currentIndex
        currentIndex += line.length + 1
        const fns = shiftFunctions(lineStart, currentIndex)
        Object.values(conditions).forEach(cond => {
          cond.lines.push(line)
          cond.subs.push(...fns)
        })
      }
    }

    const pushCondition = (label, ...parts) => {
      let cond = conditions[label]
      if (!cond) {
        cond = { lines: [...leading], subs: [] }
        conditions[label] = cond
        labelOrder.push(label)
      }
      cond.lines.push(...parts)
      currentIndex += parts.reduce(lengthReducer, 0)
      // subs
      const fns = shiftFunctions(currentStartIndex, currentIndex)
      cond.subs.push(...fns)
    }

    const openBranch = (label, content) => {
      if (currentBranch) {
        throw new Error(
          `Invalid specs in ${label}: conditions cannot be nested\n\n${source}`
        )
      }
      currentLabel = label
      currentBlocks = 1
      currentBranch = []
      if (!isEmpty(content)) {
        parseBranchLine(content)
      } else {
        currentIndex += content.length + 1
      }
    }

    const closeBranch = () => {
      pushCondition(currentLabel, ...currentBranch)
      currentBranch = null
    }

    const parseBranchLine = line => {
      const closed = line.split('').some((char, i) => {
        if (char === '{') {
          currentBlocks++
        } else if (char === '}') {
          currentBlocks--
        }
        if (currentBlocks === 0) {
          currentIndex += 1 // for '}'
          const left = line.substr(0, i)
          if (!isEmpty(left)) {
            currentBranch.push(left)
          } else {
            currentIndex += left.length
          }
          closeBranch()
          const right = line.substr(i + 1)
          if (!isEmpty(right)) {
            pushLine(right)
          } else {
            currentIndex += right.length + 1 // +1 for '\n'
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
      // case: condition
      const condMatch = condRegex.exec(line)
      if (condMatch) {
        const [, indent, label, content] = condMatch
        currentIndex += line.length - ((content && content.length) || 0)
        currentStartIndex = currentIndex
        // left indent will be fed to condition again, so we rewing a bit
        currentIndex -= indent.length
        if (content && content[0] === '{') {
          // multi line condition
          currentIndex += 1 // for '{'
          openBranch(label, indent + content.substr(1))
        } else {
          // single line condition
          pushCondition(label, indent + (content || ''))
        }
        currentIndex += 1 // for '\n'
        return
      }
      pushLine(line)
    })

    // case: parsing expectations
    if (parseOrder) {
      const result = { order: labelOrder }
      if (Object.keys(conditions).length === 0) {
        return result
      }
      return {
        ...result,
        conditions: Object.fromEntries(
          Object.entries(conditions).map(([label, { lines, subs }]) => [
            label,
            {
              html: lines.join('\n'),
              subs,
            },
          ])
        ),
      }
    }

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
        Object.entries(conditions).map(([label, { lines }]) => [
          label,
          lines.join('\n'),
        ])
      ),
    }
  }

  return (state, specString, functions) => {
    const specLines = specString.split('\n')

    const specs = {}
    let expects
    let currentFile
    let currentLines
    let parsedLength = 0

    const endFile = () => {
      specs[currentFile] = parseConditions(
        currentLines,
        specString,
        parsedLength,
        functions
      )
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

    const parseExpects = lines => {
      maybeEndFile()
      const { order, conditions } = parseConditions(
        lines,
        specString,
        parsedLength,
        functions,
        true
      )
      return order.map(label => [label, conditions[label]])
    }

    specLines.some((line, i) => {
      parsedLength += line.length + 1 // +1 for new line char
      const nameMatch = nameRegex.exec(line)
      if (nameMatch) {
        startFile(nameMatch[1])
      } else if (expectRegex.test(line)) {
        const remainingLines = specLines.slice(i + 1)
        expects = parseExpects(remainingLines)
        return true
      } else {
        if (!currentLines) {
          if (isEmpty(line)) {
            return
          }
          // TODO testHmr tag: parse title if files count < 0
          throw new Error(
            'Invalid spec string (probably missing filename): ' + specString
          )
        }
        currentLines.push(line)
      }
    })

    // last file
    maybeEndFile()

    return { specs, expects }
  }
})()

const parseExpect = expect => {
  let html
  const result = {}
  if (typeof expect === 'function') {
    result.fns = [expect]
  } else if (typeof expect === 'string') {
    html = expect
  } else if (typeof expect) {
    html = expect.html
    if (expect.subs && expect.subs.length > 0) {
      result.subs = expect.subs
    }
  }
  if (html) {
    result.html = normalizeHtml(html)
  }
  return result
}

const addExpects = (state, expects) => {
  // guard: empty
  if (!expects) return
  expects.forEach(([label, expect]) => {
    const parsed = parseExpect(expect)
    state.expects.set(String(label), parsed)
  })
}

const processSpec = (state, { specs, functions }) => {
  const parser = typeof specs === 'string' ? parseSpecString : parseSpecObject
  const result = parser(state, specs, functions)
  Object.assign(state.specs, result.specs)
  addExpects(state, result.expects)
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
    case cmd.DEBUG:
      return state

    case cmd.TEMPLATES:
      return processTemplates(state, effect)

    case cmd.SPEC:
      return processSpec(state, effect)

    case cmd.EXPECT:
      addExpects(state, effect.expects)
      break

    case cmd.INIT: {
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
      case cmd.DEBUG:
        return state

      case cmd.TEMPLATES:
        return processTemplates(state, effect)

      case cmd.CHANGE: {
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

      case cmd.FLUSH_EXPECTS:
        return flushExpects(state)

      // allow bailing out, for testing
      case cmd.DISCARD_EXPECTS:
        return discardExpects(state)

      case cmd.PAGE:
        return processPageProxy(state, effect)

      case cmd.INNER_TEXT:
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

    return it(description, async () => {
      const gen = handler.call(commands)
      const state = {
        config,
        pageUrl: '/',
        templates: {},
        inits: {},
        specs: {},
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
        await start(commands.spec.flush())
      }
    })
  }
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
