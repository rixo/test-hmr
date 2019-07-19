const interpolateFunctions = (strings, values) => {
  let len = 0
  const parts = []
  const functions = []
  const push = string => {
    len += string.length
    parts.push(string)
  }
  strings.forEach((string, i) => {
    push(string)
    if (values.length > i) {
      if (typeof values[i] === 'function') {
        functions.push({ index: len, fn: values[i] })
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
