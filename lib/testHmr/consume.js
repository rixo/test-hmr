const consume = async (gen, processCommand, firstValue) => {
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

consume.Return = function ConsumeReturn(value) {
  this.value = value
}

consume.return = value => new consume.Return(value)

const consumeSub = (state, sub, ...args) => {
  if (Array.isArray(sub)) {
    return Promise.all(sub.map(fn => consumeSub(state, fn, ...args)))
  } else {
    return consume(sub.call(state.commands), ...args)
  }
}

module.exports = {
  consume,
  consumeSub,
}
