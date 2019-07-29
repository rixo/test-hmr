const hit = require('./hit')

const { cons, init, spec, page } = require('./commands/commands')

describe('config.console', () => {
  let mock
  hit.beforeEach(m => {
    mock = m
  })

  describeE2e('e2e', () => {
    beforeEach(() => {
      mock.console = {
        log: sinon.fake(),
        error: sinon.fake(),
        warn: sinon.fake(),
      }
      mock.customizer = hit.customizer.browser({ console: mock.console })
    })

    it('outputs browser console logs to terminal with LOG prefix', async () => {
      await mock.testHmr(function*() {
        yield spec(`
          --- main.js ---
          console.log('prout')
        `)
        yield init(0)
        yield spec.$$flush()
      })
      expect(mock.console.log).to.have.been.calledWith('[console:LOG] prout')
    })

    it('fails test on unexpected console warning and logs to terminal with WRN prefix', async () => {
      const result = mock.testHmr(function*() {
        yield spec(`
          --- main.js ---
          console.warn('attention!')
        `)
        yield init(0)
        yield spec.$$flush()
      })
      await expect(result).to.be.rejectedWith('warning')
      expect(mock.console.log).to.have.been.calledWith(
        '[console:WRN] attention!'
      )
    })

    it('fails test on unexpected console error and logs to terminal with ERR prefix', async () => {
      const result = mock.testHmr(function*() {
        yield spec(`
          --- main.js ---
          console.error('oops')
        `)
        yield init(0)
        yield spec.$$flush()
      })
      await expect(result).to.be.rejectedWith('error')
      expect(mock.console.log).to.have.been.calledWith('[console:ERR] oops')
    })
  })

  const ignoreSuite = (ignoreWhat, method, type) =>
    describe(`cons.${ignoreWhat}`, () => {
      let sendConsole

      beforeEach(() => {
        mock.page.on = (event, handler) => {
          if (event === 'console') {
            sendConsole = (type, text) =>
              handler({
                type: () => type,
                text: () => text,
                args: () => [],
              })
          }
        }
      })

      it(`does not fail test on console.${method} when ${ignoreWhat} is true`, async () => {
        const result = mock.testHmr(function*() {
          yield cons[ignoreWhat]()
          yield page()
          sendConsole(type, 'oops')
        })
        await expect(result).to.be.fulfilled
      })

      it(`does not fail test on console.${method} when ${ignoreWhat} contains a matching string`, async () => {
        const result = mock.testHmr(function*() {
          yield cons[ignoreWhat]('foo', 'bar', 'oops')
          yield page()
          sendConsole(type, 'oops')
        })
        await expect(result).to.be.fulfilled
      })

      it(`fails test on console.${method} when ${ignoreWhat} contains non matching strings`, async () => {
        const result = mock.testHmr(function*() {
          yield cons[ignoreWhat]('foo', 'bar', 'oopsies')
          yield page()
          sendConsole(type, 'oops')
        })
        await expect(result).to.be.rejectedWith('oops')
      })

      it(`does not fail test on console.${method} when ${ignoreWhat} contains a matching regex`, async () => {
        const result = mock.testHmr(function*() {
          yield cons[ignoreWhat](/oo/)
          yield page()
          sendConsole(type, 'oops')
        })
        await expect(result).to.be.fulfilled
      })

      it(`fails test on console.${method} when ${ignoreWhat} contains non matching regexes`, async () => {
        const result = mock.testHmr(function*() {
          yield cons[ignoreWhat](/oop$/, /ooc/, /mooc/)
          yield page()
          sendConsole(type, 'oops')
        })
        await expect(result).to.be.rejectedWith('oops')
      })
    })

  ignoreSuite('ignoreWarnings', 'warn', 'warning')
  ignoreSuite('ignoreErrors', 'error', 'error')
})
