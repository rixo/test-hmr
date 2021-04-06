export * from '../lib/harness.js'

export const checkpoints = () =>
  async function zora_spec_fn(t, next, ...args) {
    const after = []

    t.checkpoints = (expected, msg = 'pass all checkpoints') => {
      const checkpoints = []

      const check = (name) => {
        checkpoints.push(name)
      }

      after.push(() => {
        t.eq(checkpoints.length, expected, msg)
      })

      return check
    }

    await next(t, ...args)

    for (const fn of after) {
      fn()
    }
  }
