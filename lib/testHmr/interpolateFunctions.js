// TODO rename interpolateValues
const interpolateFunctions = (strings, values) => {
  let len = 0
  const parts = []
  // TODO rename functions to values
  const functions = []
  const push = string => {
    len += string.length
    parts.push(string)
  }
  strings.forEach((string, i) => {
    push(string)
    if (values.length > i) {
      const value = values[i]
      const type = typeof value
      if (type === 'function') {
        functions.push({ index: len, fn: value })
      } else if (type === 'object') {
        if (value instanceof RegExp) {
          functions.push({ index: len, regex: value })
        } else {
          functions.push({ index: len, obj: value })
        }
      } else {
        push(String(values[i]))
      }
    }
  })
  const source = parts.join('')
  return {
    source,
    functions,
  }
}

module.exports = interpolateFunctions
