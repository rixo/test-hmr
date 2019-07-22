const {
  testHmr: { create: createTestHmr },
} = require('../../lib/testHmr')

const noop = () => {}

let mock

// h[mr, ]it...
const makeHit = (title, handler, customizer, _it = it) =>
  _it(title, () => mock.testHmr(title, handler, customizer))
const hit = (title, handler) => makeHit(title, handler, null, it)
hit.only = (title, handler) => makeHit(title, handler, null, it.only)
hit.skip = (title, handler) => makeHit(title, handler, null, it.skip)
// custom
// hit.browser: doesn't mock browser
const makeBrowserHit = it => (title, handler) =>
  makeHit(
    title,
    handler,
    // eslint-disable-next-line no-unused-vars
    ({ reset, writeHmr, loadPage, ...opts }) => opts,
    it
  )
hit.browser = makeBrowserHit(it)
hit.browser.only = makeBrowserHit(it.only)
hit.browser.skip = makeBrowserHit(it.skip)

const setup = () => {
  mock = {
    it: null,
    describe: null,
    reset: sinon.fake(),
    writeHmr: sinon.fake(async () => {}),
  }

  mock.page = {
    $eval: sinon.fake(() => {
      return mock.page.$eval.results && mock.page.$eval.results.shift()
    }),
    keyboard: {
      press: sinon.fake(),
    },
    on: noop,
    once: noop,
    removeListener: noop,
  }

  mock.page.$eval.return = (...results) => {
    mock.page.$eval.results = results
  }

  mock.loadPage = sinon.fake(
    (url, callback, beforeGoto) =>
      new Promise((resolve, reject) => {
        // dezalgo
        setImmediate(() => {
          Promise.resolve(mock.page)
            .then(async () => {
              if (beforeGoto) {
                await beforeGoto(mock.page)
              }
              return mock.page
            })
            .then(callback)
            .then(resolve)
            .catch(reject)
        })
      })
  )

  mock.testHmr = (title, handler, customizer, executer) =>
    new Promise((resolve, reject) => {
      let rootPromises
      let previousItPromise

      const startIt = () => {
        if (rootPromises) {
          const deferred = {}
          const promise = new Promise((resolve, reject) => {
            deferred.resolve = resolve
            deferred.reject = reject
          })
          rootPromises.push(promise)
          return deferred
        } else {
          return { resolve, reject }
        }
      }

      mock.it = sinon.fake((desc, handler) => {
        const { resolve } = startIt()
        let skipped = false
        const scope = {
          slow: noop,
          skip: () => {
            skipped = true
          },
        }
        const run = async () => {
          if (handler) {
            try {
              const value = await handler.call(scope)
              const result = {
                skipped,
                result: value,
                it: desc,
              }
              resolve()
              return result
            } catch (error) {
              // don't reject the it, actual mocha's `it` never
              // throws/rejects... but do reject the test, to
              // prevent silent failures/errors
              const result = { error, skipped: false }
              reject(error)
              return result
            }
          } else {
            const result = {
              skipped: true,
              it: desc,
            }
            resolve(result)
            return result
          }
        }
        // previousItPromise: run tests in a series
        const prev = previousItPromise
        previousItPromise = Promise.resolve(prev).then(run)
        return previousItPromise
      })

      mock.describe = sinon.fake((desc, handler) => {
        let promises
        if (!rootPromises) {
          // claim root
          promises = []
          rootPromises = promises
        }
        const scope = {
          slow: noop,
          skip: () => {
            throw new Error('TODO')
          },
        }
        if (handler) {
          handler.call(scope)
        }
        if (promises) {
          Promise.all(promises)
            .then(results => {
              resolve({
                result: results,
                describe: desc,
                skipped: !handler,
              })
            })
            .catch(reject)
        }
      })

      const _before = handler =>
        new Promise((resolve, reject) => {
          setImmediate(() => {
            Promise.resolve(handler()).then(resolve, reject)
          })
        })

      let options = {
        it: mock.it,
        describe: mock.describe,
        actualDescribe: mock.describe,
        before: _before,
        reset: mock.reset,
        writeHmr: mock.writeHmr,
        loadPage: mock.loadPage,
        appHtmlPrefix: '',
      }
      if (customizer) {
        options = customizer(options)
      }
      const testHmr = createTestHmr(options)
      if (executer) {
        return executer(testHmr)
      } else if (typeof title === 'function') {
        return testHmr(null, title)
      } else {
        return testHmr(title, handler)
      }
    })
}

hit.beforeEach = onBeforeEach => {
  beforeEach(() => {
    setup()
    if (onBeforeEach) {
      onBeforeEach(mock)
    }
  })
}

module.exports = hit
