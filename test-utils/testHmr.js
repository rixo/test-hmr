/* eslint-env mocha */

const { expect } = require('chai')
const assert = require('assert')

const { writeHmr, loadPage } = require('.')
const normalizeHtml = require('./normalizeHtml')

const {
  commands,
  DEBUG,
  TEMPLATES,
  INIT,
  SPEC,
  EXPECT,
  EXPECT_BEFORE,
  EXPECT_AFTER,
  CHANGE,
  FLUSH_EXPECTS,
  DISCARD_EXPECTS,
  PAGE,
  INNER_TEXT,
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

const parseSpecString = (() => {
  const nameRegex = /^\s*----\s*([^-\s]+)(?:\s*-*\s*)?$/

  const emptyRegex = /^\s*$/

  const isEmpty = emptyRegex.test.bind(emptyRegex)

  const condRegex = /^(\s*)::([^\s+])(?:\s+(.*))?$/

  const expectRegex = /^\s*\*{4,}\s*$/

  const compileFileCondition = cond => {
    const { lines, steps, stepsIndex } = cond
    if (steps && steps.length > 0) {
      if (steps.length > 1) {
        throw new Error('Flow steps are only allowed in expectation context')
      }
      const html = [
        ...lines.slice(0, stepsIndex),
        ...steps[0].lines,
        ...lines.slice(stepsIndex),
      ].join('\n')
      return html
    }
    return lines.join('\n')
  }

  const compileExpectCase = ({ lines, steps, stepsIndex, ...other }) => {
    const hmrCase = {
      ...other, // really?
    }
    if (steps) {
      hmrCase.steps = steps.map(step => {
        if (step.lines) {
          const html = [
            ...lines.slice(0, stepsIndex),
            ...step.lines,
            ...lines.slice(stepsIndex),
          ].join('\n')
          return {
            html: normalizeHtml(html),
          }
        } else {
          return step
        }
      })
    } else {
      if (lines) {
        hmrCase.steps = [
          {
            html: normalizeHtml(lines.join('\n')),
          },
        ]
      }
    }
    // if (hmrCase.steps && !hmrCase.steps.length) {
    //   delete hmrCase.steps
    // }
    return hmrCase
  }

  const parseConditions = (
    lines,
    source,
    startIndex,
    initialFunctions,
    isExpectations = false
  ) => {
    const leading = []
    const conditions = {}
    const labelOrder = new Set()

    let currentLabel
    let currentBlocks
    let currentBranch
    let from

    // let currentStepLines = []

    const functions =
      initialFunctions &&
      initialFunctions.filter(({ index }) => index >= startIndex)
    let currentIndex = startIndex

    // const flushCurrentStep = () => {
    //   if (!currentLabel) {
    //     throw new Error('Illegal state: not in a condition')
    //   }
    //   const hasContent =
    //     currentStepLines.length > 0 &&
    //     currentStepLines.every(line => !isEmpty(line))
    //   // guard: current step is empty
    //   if (!hasContent) return
    //   const cond = conditions[currentLabel]
    //   if (!cond) {
    //     throw new Error('Missing condition: ' + currentLabel)
    //   }
    //   cond.steps.push({
    //     html: currentStepLines.join('\n'),
    //   })
    //   currentStepLines = []
    // }

    const shiftFunctions = (from, to, returnIndex = false) => {
      const result = []
      if (functions) {
        let next
        while ((next = functions[0])) {
          const { index } = next
          if (index < from) {
            console.log(from, to, JSON.stringify(functions))
            throw new Error('Sub handler must be in condition')
          }
          // if (index > to) { DEBUG DEBUG DEBUG
          if (index >= to) {
            break
          }
          const item = functions.shift()
          result.push(returnIndex ? item : item.fn)
        }
      }
      return result
    }

    const consumeRootFunctions = (cond, from, to) => {
      if (currentBranch != null) {
        throw new Error(
          'Illegal state: consumeRootFunctions called inside a branch'
        )
      }
      const fns = shiftFunctions(from, to)
      fns.forEach(fn => {
        if (!cond.before) {
          cond.before = fn
        } else if (!cond.after) {
          cond.after = fn
        } else {
          throw new Error(
            'Only 2 sub fns are allowed at root level (before & after)'
          )
        }
      })
    }

    const pushLine = line => {
      if (currentBranch) {
        // currentBranch.push(line)
        throw new Error('Illegal state: pushLine inside a branch')
      } else {
        leading.push(line)
        const lineStart = currentIndex
        currentIndex += line.length + 1
        const fns = shiftFunctions(lineStart, currentIndex)
        if (fns.length > 0) {
          throw new Error('Sub functions must be inside of labelled conditions')
        }
        Object.values(conditions).forEach(cond => {
          cond.lines.push(line)
        })
      }
    }

    const resolveCondition = label => {
      const cond = conditions[label]
      if (cond) {
        return cond
      } else {
        const cond = { lines: [...leading] }
        conditions[label] = cond
        labelOrder.add(label)
        return cond
      }
    }

    const pushBranchLine = string => {
      currentBranch.push(string)
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
      if (isEmpty(content)) {
        // currentIndex += content.length + 1 // +1 for '\n'
        pushBranchLine(content)
      } else {
        parseBranchLine(content)
      }
    }

    const closeBranch = () => {
      // const cond = resolveCondition(currentLabel)
      // cond.lines.push(...currentBranch)
      // console.log('closeBranch', currentIndex, currentBranch)
      // console.log(functions)
      const branchStartIndex = currentIndex
      const cond = resolveCondition(currentLabel)
      const contentLines = []
      const steps = []

      const flush = () => {
        if (contentLines.length > 0) {
          const lines = contentLines.splice(0, contentLines.length)
          steps.push({
            // html: normalizeHtml(lines.join('\n')),
            lines,
          })
        }
      }

      currentBranch.forEach(line => {
        const lineIndex = currentIndex
        const from = lineIndex
        const to = from + line.length + 1 // +1 for '\n'
        const fns = shiftFunctions(from, to, true)
        // console.log(from, to, line, fns.map(f => f.index))
        if (fns.length) {
          let leftIndex = 0
          fns.forEach(({ fn, index }, i) => {
            // 1. content before ${sub}
            const leftEnd = index - lineIndex
            const left = line.substring(leftIndex, leftEnd)
            leftIndex = leftEnd
            if (!isEmpty(left)) {
              contentLines.push(left)
            }
            flush()
            // 2. sub function step
            steps.push({ sub: fn })
            // 3. content after ${sub}
            const nextFn = fns[i + 1]
            if (!nextFn) {
              const right = line.substring(leftIndex)
              if (!isEmpty(right)) {
                contentLines.push(right)
              }
            }
          })
        } else {
          if (!isEmpty(line)) {
            contentLines.push(line)
          }
        }
        currentIndex = to
      })

      flush()

      if (steps.length) {
        if (cond.steps) {
          throw new Error(
            'Only one conditional block per HMR case can contain sub functions'
          )
        }
        cond.steps = steps
        cond.stepsIndex = cond.lines.length
      }

      currentBranch = null
    }

    const parseBranchLine = line => {
      const closed = line.split('').some((char, i) => {
        if (char === '{') {
          currentBlocks++
        } else if (char === '}') {
          currentBlocks--
        }
        // guard: still in block after this line
        if (currentBlocks === 0) {
          const left = line.substr(0, i)
          pushBranchLine(left)
          // if (!isEmpty(left)) {
          //   pushBranchLine(left)
          // } else {
          //   currentIndex += left.length
          // }
          closeBranch()
          // currentIndex += 1 // for '}'
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
        pushBranchLine(line)
      }
    }

    lines.forEach(line => {
      // console.log(currentIndex, `line "${line}"`)
      // guard: inside a conditional branch
      if (currentBranch) {
        parseBranchLine(line)
        return
      }
      // case: condition
      const condMatch = condRegex.exec(line)
      if (condMatch) {
        const [, indent, label, content] = condMatch
        // currentIndex += line.length - ((content && content.length) || 0)
        // currentStartIndex = currentIndex
        // // left indent will be fed to condition again, so we rewing a bit
        // currentIndex -= indent.length

        from = currentIndex + line.length - ((content && content.length) || 0)

        // left indent will be fed to condition again, so we rewing a bit
        // currentIndex -= indent.length
        if (content && content[0] === '{') {
          currentIndex = from
          // condition block (multiline)
          currentIndex += 1 // for '{'
          // openBranch(label, indent + content.substr(1))
          openBranch(label, content.substr(1))
        } else {
          // single line condition
          const cond = resolveCondition(label)
          const string = indent + (content || '')
          if (!isEmpty(string)) {
            cond.lines.push(string)
          }
          // subs
          const to = from + ((content && content.length) || 0) + 1
          consumeRootFunctions(cond, from, to)
          // update index
          currentIndex += line.length
          currentIndex += 1 // for '\n'
        }
        return
      }
      // case: default
      pushLine(line)
    })

    // case: parsing expectations
    if (isExpectations) {
      const result = { order: [...labelOrder] }
      if (Object.keys(conditions).length === 0) {
        return result
      }
      return {
        ...result,
        cases: Object.fromEntries(
          Object.entries(conditions).map(([label, cond]) => [
            label,
            compileExpectCase(cond),
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
        Object.entries(conditions).map(([label, cond]) => [
          label,
          compileFileCondition(cond),
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
      const { order, cases } = parseConditions(
        lines,
        specString,
        parsedLength,
        functions,
        true
      )
      return order.map(label => [label, cases[label]])
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
