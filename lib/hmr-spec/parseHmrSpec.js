const normalizeHtml = require('../normalizeHtml')

const { parse } = require('./hmr-spec-parser')

const emptyRegex = /^\s*$/

const isEmpty = text => emptyRegex.test(text)

const isString = part => typeof part === 'string'

const flatten = arr => arr.reduce((result, item) => result.concat(item), [])

const normalizeString = part =>
  typeof part === 'string' ? normalizeHtml(part) : part

const compileFileContent = (shiftValues, { parts, conditions }) => {
  if (!parts.length) {
    return {}
  }
  const allLines = []
  const result = { '*': allLines }
  const all = conditions.map(cond => {
    const lines = []
    result[cond] = lines
    return lines
  })
  all.push(allLines)

  const pushAll = text => {
    all.forEach(lines => lines.push(text))
  }

  const pushCondition = (condition, text) => {
    if (!result[condition]) {
      result[condition] = []
    }
    result[condition].push(text)
  }

  for (const { condition, text } of parts) {
    if (condition != null) {
      pushCondition(condition, text)
    } else {
      pushAll(text)
    }
  }

  // only add * for files with exactly zero condition cases
  const hasCondition = Object.keys(result).length > 1
  if (hasCondition) {
    delete result['*']
  }

  Object.keys(result).forEach(key => {
    result[key] = result[key].join('')
  })

  return result
}

const shiftValues = functions => ({ start, end }) => {
  const result = []
  if (functions) {
    let next
    while ((next = functions[0])) {
      const { index } = next
      if (index < start) {
        throw new Error('Sub handler must be inside an assertion condition')
      }
      // if (index > to) { DEBUG DEBUG DEBUG
      if (index >= end) {
        break
      }
      const item = functions.shift()
      result.push(item)
    }
  }
  return result
}

const splitValuesFunctions = values => {
  const fns = []
  const others = []
  for (const val of values) {
    if (val.fn) fns.push(val)
    else others.push(val)
  }
  return [fns, others]
}

const ValuesQueue = initialFunctions => {
  if (!initialFunctions) {
    return () => []
  }

  const functions = [...initialFunctions]

  const shift = shiftValues(functions)

  return shift
}

const splitSteps = (part, values) => {
  const {
    text,
    content: { start, end },
  } = part
  const result = []
  let leftIndex = start
  const [fns, others] = splitValuesFunctions(values)
  const shiftRegexes = ValuesQueue(others)

  const pushText = text => {
    const regexes = shiftRegexes({
      start,
      end: leftIndex + text.length,
    })
    const [matchers, rest] = applyRegexes(regexes, text, leftIndex)
    if (rest.length > 0) {
      throw new Error('Invalid interpolated values (must be subs or regexes)')
    }
    if (matchers.length > 0) {
      result.push({
        text: matchers,
      })
    }
  }

  fns.forEach(({ index, fn }) => {
    if (index > leftIndex) {
      pushText(text.substring(leftIndex - start, index - start))
      leftIndex = index
    }
    result.push({
      sub: fn,
    })
  })
  if (leftIndex < end) {
    pushText(text.substring(leftIndex - start))
  }

  // trim
  if (result[0] && result[0].text && isEmpty(result[0].text)) {
    result.shift()
  }
  if (result.length > 1) {
    const lastStep = result[result.length - 1]
    if (lastStep.text && isEmpty(lastStep.text)) {
      result.pop()
    }
  }

  return result
}

const applyRegexes = (values, text, start) => {
  const matchers = []

  let right = text
  let cur = 0

  const rest = values.filter(({ regex, index }) => {
    // guard: not regex
    if (!regex) return true
    // case: regex
    // WARNING text start index might be AFTER regex index (because
    //   left white spaces from text will have been ignored by parser)
    const cut = Math.max(0, index - start - cur)
    const left = right.substring(0, cut)
    right = right.substr(cut)
    cur += cut
    if (!isEmpty(left)) {
      matchers.push(left)
    }
    matchers.push(regex)
  })

  if (!isEmpty(right)) {
    matchers.push(right)
  }

  return [matchers, rest]
}

const compileSteps = (
  shiftValues,
  { parts, conditions },
  { compactStringMatchers = false } = {}
) => {
  if (!parts.length) {
    return []
  }

  let beforeLoad

  const buckets = {}
  const all = conditions.map(cond => {
    const item = { condition: cond, lines: [] }
    buckets[cond] = item
    return item
  })

  const pushAll = part => {
    const { start, text } = part
    const values = shiftValues(part)
    const [matchers, fns] = applyRegexes(values, text, start)
    while (fns.length > 0) {
      const val = fns.shift()
      const { fn } = val
      if (fn) {
        if (!beforeLoad) {
          beforeLoad = fn
        } else {
          throw new Error(
            'Only one sub is allowed outside of a condition (before load sub)'
          )
        }
      } else {
        throw new Error('Illegal value: ' + JSON.stringify(val))
      }
    }
    all.forEach(({ lines }) => lines.push(matchers))
  }

  const registerHook = (item, fn) => {
    if (!item.before) {
      item.before = fn
    } else if (!item.after) {
      item.after = fn
    } else {
      throw new Error(
        'Only two root level hooks are allowed (before and after)'
      )
    }
  }

  const pushCond = (cond, part) => {
    const item = buckets[cond]
    // title
    if (part.title) {
      item.title = part.title
    }
    // subs / regex / lines
    const values = shiftValues(part)
    if (values.length > 0) {
      if (part.block === true) {
        if (item.steps) {
          throw new Error('Only a single condition block can have sub steps')
        }
        item.steps = splitSteps(part, values)
        item.stepsIndex = item.lines.length
      } else if (part.block === false) {
        // -- regexes --
        const {
          text,
          content: { start },
        } = part
        const [matchers, fns] = applyRegexes(values, text, start)
        if (matchers.length > 0) {
          item.lines.push(matchers)
        }
        // -- functions --
        fns.forEach(val => {
          if (val.fn) {
            registerHook(item, val.fn)
          } else {
            throw new Error(
              'Invalid interpolated value: ' + JSON.stringify(val)
            )
          }
        })
      } else {
        throw new Error('Invalid part: ' + JSON.stringify(part))
      }
    } else {
      item.lines.push([part.text])
    }
  }

  for (const part of parts) {
    const { condition } = part
    if (condition != null) {
      pushCond(condition, part)
    } else {
      pushAll(part)
    }
  }

  // --- assembling ---

  const linesToHtml = lines => {
    let parts = flatten(lines)
    // glue together successive string matchers... I currently fail to
    // appreciate whether this is desirable or not
    if (compactStringMatchers) {
      const compactParts = parts
      let strings = []
      parts.forEach(part => {
        if (isString(part)) {
          strings.push(part)
        } else {
          if (strings.length) {
            compactParts.push(strings.join(''))
            strings = []
          }
          compactParts.push(part)
        }
      })
      if (strings.length) {
        compactParts.push(strings.join(''))
      }
      parts = compactParts
    }
    const onlyStrings = parts.every(isString)
    if (onlyStrings) {
      return normalizeHtml(parts.join(''))
    } else {
      return parts.map(normalizeString).filter(Boolean)
    }
  }

  const spreadSteps = ({ condition, lines, steps, stepsIndex }) => {
    if (!steps) {
      const html = linesToHtml(lines)
      return [{ html }]
    }
    // sanity check
    if (lines.length > 0) {
      const hasHtmlStep = steps.some(({ text }) => !isEmpty(text))
      if (!hasHtmlStep) {
        const error = new Error(
          `Expected condition "${condition}" has some HTML parts, but ` +
            'no HTML step (HTML expecations would not be asserted!)'
        )
        error.name = 'ParseError'
        throw error
      }
    }
    const before = lines.slice(0, stepsIndex)
    const after = lines.slice(stepsIndex)
    const result = []
    for (const step of steps) {
      const { text, sub } = step
      if (sub) {
        result.push({ sub })
      } else if (text != null) {
        const lines = [...before, text, ...after]
        const html = linesToHtml(lines)
        result.push({ html })
      } else {
        throw new Error('Invalid step: ' + JSON.stringify(step))
      }
    }
    return result
  }

  const expects = conditions.map(cond => {
    const item = buckets[cond]
    const { before, after, title } = item
    const steps = spreadSteps(item)
    return [cond, { steps, before, after, title }]
  })

  return { beforeLoad, expects }
}

// PEG grammar AST => Spec object
const mapAst = (ast, values) => {
  const result = {}

  const shiftValues = ValuesQueue(values)

  {
    const specs = {}
    for (const file of ast.files) {
      specs[file.path] = compileFileContent(shiftValues, file.content)
    }
    result.specs = specs
  }

  if (ast.expectations) {
    const { expects, beforeLoad } = compileSteps(shiftValues, ast.expectations)
    Object.assign(result, { expects, beforeLoad })
  }

  return result
}

const parseInlineSpec = (source, functions) => {
  const ast = parse(source, {
    startRule: 'Spec',
  })
  return mapAst(ast, functions)
}

const parseFullSpec = (source, functions) => {
  const ast = parse(source, {
    startRule: 'FullSpec',
  })
  const spec = mapAst(ast, functions)

  spec.title = ast.title

  return spec
}

const parseTitleOnly = source =>
  parse(source, {
    startRule: 'TitleOnly',
  })

module.exports = {
  parseInlineSpec,
  parseFullSpec,
  parseTitleOnly,
}
