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

const consumeSub = (state, sub, ...args) =>
  consume(sub.call(state.commands), ...args)

module.exports = {
  consume,
  consumeSub,
}
