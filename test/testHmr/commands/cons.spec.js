const hit = require('../hit')

const { cons, $$debug } = require('./commands')

describe('command: cons', () => {
  hit.beforeEach()

  it('is a function', () => {
    expect(cons).to.be.a('function')
  })

  hit('is exposed as this.cons', function*() {
    expect(this.cons).to.equal(cons)
  })

  const ignoreSuite = ignoreWhat =>
    describe(`cons.${ignoreWhat}`, () => {
      it('is a function', () => {
        expect(cons[ignoreWhat]).to.be.a('function')
      })

      describe(`yield cons.${ignoreWhat}()`, () => {
        hit(`sets state.console.${ignoreWhat} to true`, function*() {
          yield cons[ignoreWhat]()
          const state = yield $$debug()
          expect(state.console).to.matchPattern({
            [ignoreWhat]: true,
          })
        })
      })

      describe(`yield cons.${ignoreWhat}(false)`, () => {
        hit(`sets state.console.${ignoreWhat} to false`, function*() {
          yield cons[ignoreWhat]()
          const state = yield $$debug()
          expect(state.console).to.matchPattern({
            [ignoreWhat]: true,
          })
        })
      })

      describe(`yield cons.${ignoreWhat}("string")`, () => {
        hit(`adds ignore string to state.console.${ignoreWhat}`, function*() {
          yield cons[ignoreWhat]('str')
          const state = yield $$debug()
          expect(state.console).to.matchPattern({
            [ignoreWhat]: ['str'],
          })
        })

        hit(`accepts multiple string arguments`, function*() {
          yield cons[ignoreWhat]('str', 'wr')
          const state = yield $$debug()
          expect(state.console).to.matchPattern({
            [ignoreWhat]: ['str', 'wr'],
          })
        })
      })

      describe(`yield cons.${ignoreWhat}(/regex/)`, () => {
        hit(`adds ignore regex to state.console.${ignoreWhat}`, function*() {
          const regex = /str/
          yield cons[ignoreWhat](regex)
          const state = yield $$debug()
          expect(state.console).to.matchPattern({
            [ignoreWhat]: ['/str/'],
          })
          expect(state.console[ignoreWhat][0]).to.equal(regex)
        })

        hit(`accepts multiple regex arguments`, function*() {
          const regexes = [/str/, /wr/i]
          yield cons[ignoreWhat](regexes[0], regexes[1])
          const state = yield $$debug()
          expect(state.console[ignoreWhat]).to.deep.equal(regexes)
        })
      })

      hit(
        'can add strings after having been called with no args (all)',
        function*() {
          yield cons[ignoreWhat]()
          yield cons[ignoreWhat]('str')
          const state = yield $$debug()
          expect(state.console).to.matchPattern({
            [ignoreWhat]: ['str'],
          })
        }
      )

      hit('can mix strings and regexes in the same call', function*() {
        const regexes = [/str/, /wr/i]
        yield cons[ignoreWhat]('a', regexes[0], 'bb', regexes[1])
        const state = yield $$debug()
        expect(state.console[ignoreWhat]).to.deep.equal([
          'a',
          regexes[0],
          'bb',
          regexes[1],
        ])
      })
    })

  ignoreSuite('ignoreWarnings')
  ignoreSuite('ignoreErrors')
})
