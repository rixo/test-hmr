const { isIterator } = require('../util')

const consume = async (state, gen, processCommand, firstValue) => {
  let next
  let nextValue = firstValue
  do {
    try {
      next = gen.next(nextValue)
      nextValue = undefined
      const command = next.value
      if (!command) {
        if (next.done) {
          continue
        } else {
          throw new Error(`test handler yielded ${JSON.stringify(command)}`)
        }
      }
      nextValue = await processCommand(command)
      if (nextValue instanceof consume.Return) {
        return nextValue.value
      }
    } catch (err) {
      gen.throw(err)
    }
  } while (!next.done)
}

const consumeSub = (state, sub, ...args) => {
  // array
  if (Array.isArray(sub)) {
    return Promise.all(sub.map(fn => consumeSub(state, fn, ...args)))
  }
  // iterator, async function, or plain function
  const result = sub.call(state.scope, state)
  if (isIterator(result)) {
    return consume(state, result, ...args)
  }
  return result
}

consume.Return = function ConsumeReturn(value) {
  this.value = value
}

consume.return = value => new consume.Return(value)

module.exports = {
  consume,
  consumeSub,
}
