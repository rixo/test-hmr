const IS_DEFERRED = Symbol('IS_DEFERRED')

const Deferred = () => {
  const deferred = {
    [IS_DEFERRED]: true,
  }
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve
    deferred.reject = reject
  })
  return deferred
}

Deferred.isDeferred = o => !!(o && o[IS_DEFERRED])

module.exports = Deferred
