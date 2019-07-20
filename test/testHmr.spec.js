const escapeRegExp = require('lodash.escaperegexp')

const {
  testHmr: { create: createTestHmr },
  templates,
  spec,
  init,
  $$debug,
  change,
  innerText,
  page,
} = require('../lib/testHmr')

const noop = () => {}

// _`foo` => /\s*foo\s*/
// _('foo', bar', 'baz') => /\s*foo\s*bar\s*baz\s*/
const _ = strings =>
  new RegExp('\\s*' + strings.map(escapeRegExp).join('\\s*') + '\\s*')

describe('test utils: testHmr', () => {
  let _it
  let _describe
  let reset
  let writeHmr
  let _page
  let loadPage
  let _testHmr

  beforeEach(() => {
    _it = null
    _describe = null
    reset = sinon.fake()
    writeHmr = sinon.fake(async () => {})
    _page = {
      $eval: sinon.fake(() => {
        return _page.$eval.results && _page.$eval.results.shift()
      }),
      keyboard: {
        press: sinon.fake(),
      },
    }
    _page.$eval.return = (...results) => {
      _page.$eval.results = results
    }
    loadPage = sinon.fake(
      (url, callback) =>
        new Promise((resolve, reject) => {
          // dezalgo
          setImmediate(() => {
            Promise.resolve(callback(_page))
              .then(resolve)
              .catch(reject)
          })
        })
    )

    _testHmr = (title, handler, customizer, executer) =>
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

        _it = sinon.fake((desc, handler) => {
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

        _describe = sinon.fake((desc, handler) => {
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
          it: _it,
          describe: _describe,
          actualDescribe: _describe,
          before: _before,
          reset,
          writeHmr,
          loadPage,
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
  })

  // h[mr, ]it...
  const makeHit = (title, handler, customizer, _it = it) =>
    _it(title, () => _testHmr(title, handler, customizer))
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

  hit("wraps mocha's it", function*() {
    expect(_it).to.have.been.calledOnce
  })

  hit('inits app after the first non-init effect', function*() {
    yield templates({})
    yield init({})
    expect(reset).not.to.have.been.called
    expect(loadPage).not.to.have.been.called
    yield innerText('*')
    expect(reset).to.have.been.calledOnce
    expect(loadPage).to.have.been.calledOnce
    expect(writeHmr).not.to.have.been.called
  })

  describe('yield debug()', () => {
    hit('returns current HMR test state', function*() {
      const state = yield $$debug()
      expect(state).not.to.be.undefined
    })
  })

  describe('yield templates({...})', () => {
    const tpl1 = name => `console.log("${name}")`
    const tpl2 = name => `Hello ${name}`

    function* beforeEach() {
      yield templates({
        'first.js': tpl1,
      })
      const state = yield $$debug()
      expect(state.templates).to.deep.equal({
        'first.js': tpl1,
      })
    }

    hit('register file templates', function*() {
      yield* beforeEach()
    })

    hit('can be called multiple times', function*() {
      yield* beforeEach()
      yield templates({
        'second.svelte': tpl2,
      })
      const state = yield $$debug()
      expect(state.templates).to.deep.equal({
        'first.js': tpl1,
        'second.svelte': tpl2,
      })
    })

    hit('can be called after init', function*() {
      yield* beforeEach()
      yield innerText('*')
      yield templates({
        'second.svelte': tpl2,
      })
      const state = yield $$debug()
      expect(state.templates).to.deep.equal({
        'first.js': tpl1,
        'second.svelte': tpl2,
      })
    })
  })

  describe('yield spec({...})', () => {
    hit('can registers file specs', function*() {
      yield spec({ foo: 'FOO', bar: { 0: 'BAR' } })
      const state = yield $$debug()
      expect(state.specs).to.deep.equal({
        foo: { '*': 'FOO' },
        bar: { 0: 'BAR' },
      })
    })

    hit('can be called multiple times (before init)', function*() {
      yield spec({ foo: 'FOO', bar: { 0: 'BAR' } })
      yield spec({ baz: { '*': 'BAZ' } })
      const state = yield $$debug()
      expect(state.specs).to.deep.equal({
        foo: { '*': 'FOO' },
        bar: { 0: 'BAR' },
        baz: { '*': 'BAZ' },
      })
    })
  })

  describe('yield spec("string")', () => {
    hit('can be used as a template literal tag', function*() {
      yield spec`
        ---- file ----
        contents ${'part'}
      `
      const state = yield $$debug()
      expect(state.specs).to.matchPattern({
        file: {
          '*': _`contents part`,
        },
      })
    })

    hit('registers simple specs with shortcut', function*() {
      yield spec(`
        ---- ether ----
        I just am.
      `)
      expect(yield $$debug()).to.matchPattern({
        specs: {
          ether: {
            '*': _`I just am`,
          },
        },
      })
    })

    hit('registers multiple specs with shortcut', function*() {
      yield spec(`
        ---- first ----
        I am just above.
        ---- second ----
        I am just bellow.
      `)
      expect(yield $$debug()).to.matchPattern({
        specs: {
          first: {
            '*': _`I am just above`,
          },
          second: {
            '*': _`I am just bellow`,
          },
        },
      })
    })

    hit('can be called multiple times (before init)', function*() {
      yield spec(`
        ---- first ----
        I am just above.
      `)
      yield spec(`
        ---- second ----
        I am just bellow.
      `)
      expect(yield $$debug()).to.matchPattern({
        specs: {
          first: {
            '*': _`I am just above`,
          },
          second: {
            '*': _`I am just bellow`,
          },
        },
      })
    })

    hit('parses single line conditions', function*() {
      yield spec(`
        ---- foo.js ----
        top
        ::0 on 0
        middle
        ::1 on 1
        bottom
      `)
      expect(yield $$debug()).to.matchPattern({
        specs: {
          'foo.js': {
            '*': undefined,
            '0': _(['top', 'on 0', 'middle', 'bottom']),
            '1': _(['top', 'middle', 'on 1', 'bottom']),
          },
        },
      })
    })

    hit('parses multiline conditions', function*() {
      yield spec(`
        ---- first ----
        I am just above.
        ---- foo.js ----
        top
        ::0 on 000
        middle
        ::1::
          function foo() { console.log('bar') }
        :::::
        bottom
        ---- second ----
        I am just bellow.
      `)
      expect(yield $$debug()).to.matchPattern({
        specs: {
          first: {
            '*': _`I am just above.`,
          },
          'foo.js': {
            '*': undefined,
            '0': _(['top', 'on 000', 'middle', 'bottom']),
            '1': _([
              'top',
              'middle',
              "function foo() { console.log('bar') }",
              'bottom',
            ]),
          },
          second: {
            '*': _`I am just bellow.`,
          },
        },
      })
    })

    hit('only parses * for files that have zero condition cases', function*() {
      yield spec(`
        ---- foo ----
        ::0 f00
        ::1 f11
        ---- bar ----
        ::1 b00
        ::2 b22
        ---- baz ----
        I am baz
      `)
      expect(yield $$debug()).to.matchPattern({
        specs: {
          foo: {
            '*': undefined,
            '0': _`f00`,
            '1': _`f11`,
          },
          bar: {
            '*': undefined,
            '1': _`b00`,
            '2': _`b22`,
          },
          baz: {
            '*': _`I am baz`,
          },
        },
      })
    })

    hit('parses expectations', function*() {
      yield spec(`
        ---- file ----
        lorem ipsum
        ****
        before anything:
        ::0::
          expect#0
        ::
        ::1 expect#1
        after all
      `)
      expect(yield $$debug()).to.matchPattern({
        specs: {
          file: {
            '*': _`lorem ipsum`,
          },
        },
        expects: new Map([
          ['0', { steps: [{ html: 'before anything: expect#0 after all' }] }],
          ['1', { steps: [{ html: 'before anything: expect#1 after all' }] }],
        ]),
      })
      yield spec.$$discard()
    })

    describe('expectations subs', () => {
      let sub0
      let sub1
      let sub2

      const fakeSub = i =>
        Object.assign(function*() {}, {
          toJSON: () => 'sub' + i,
          toString: () => 'sub' + i,
        })

      beforeEach(() => {
        sub0 = fakeSub(0)
        sub1 = fakeSub(1)
        sub2 = fakeSub(2)
      })

      hit('parses before & after hooks', function*() {
        yield spec`
          ---- file.ext ---
          filled
          ********
          top
          ::0 ${sub0}
          ::0 ${sub1}
          bottom
        `
        expect(yield $$debug()).to.matchPattern({
          expects: new Map([
            [
              '0',
              {
                before: sub0,
                after: sub1,
                steps: [{ html: 'top bottom' }],
              },
            ],
          ]),
        })
        yield spec.$$discard()
      })

      hit('throws if there are more than 2 hook functions', function*() {
        let error
        try {
          yield spec`
            ---- file.ext ---
            filled
            ********
            top
            ::0 ${sub0}
            ::0 ${sub1}
            ::0 ${sub2}
            bottom
          `
        } catch (err) {
          error = err
        }
        expect(error).not.to.be.undefined
        yield spec.$$discard()
      })

      hit('parses steps in condition blocks', function*() {
        yield spec`
          ---- file.ext ---
          filled
          ********
          top
          ::0 zero
          ::1::
            ${sub0}
            first
            ${sub1}
            second
            ${sub2}
          ::
          bottom
        `
        const state = yield $$debug()
        expect(state.expects).to.matchPattern(
          new Map([
            [
              '0',
              {
                steps: [{ html: 'top zero bottom' }],
              },
            ],
            [
              '1',
              {
                steps: [
                  { sub: sub0 },
                  { html: 'top first bottom' },
                  { sub: sub1 },
                  { html: 'top second bottom' },
                  { sub: sub2 },
                ],
              },
            ],
          ])
        )
        yield spec.$$discard()
      })

      hit('parses last expectation step when not a sub', function*() {
        yield spec`
          ---- file.ext ---
          filled
          ********
          top
          ::0 zero
          ::1::
            ${sub0}
            first
            ${sub1}
            second
            ${sub2}
            last
          ::
          bottom
        `
        const state = yield $$debug()
        expect([...state.expects]).to.matchPattern([
          [
            '0',
            {
              steps: [{ html: 'top zero bottom' }],
            },
          ],
          [
            '1',
            {
              steps: [
                { sub: sub0 },
                { html: 'top first bottom' },
                { sub: sub1 },
                { html: 'top second bottom' },
                { sub: sub2 },
                { html: 'top last bottom' },
              ],
            },
          ],
        ])
        yield spec.$$discard()
      })

      hit('parses multiple step subs on a single line', function*() {
        const sub3 = fakeSub(3)
        yield spec`
          ---- file.ext ---
          filled
          ********
          top
          ::0 zero
          ::1::
            ${(113, '')}
            ${sub0}
            first
            ${sub1}
            second ${sub2} last ${sub3}
            everlast
          ::
          bottom
        `
        const state = yield $$debug()
        expect([...state.expects]).to.matchPattern([
          [
            '0',
            {
              steps: [{ html: 'top zero bottom' }],
            },
          ],
          [
            '1',
            {
              steps: [
                { sub: sub0 },
                { html: 'top first bottom' },
                { sub: sub1 },
                { html: 'top second bottom' },
                { sub: sub2 },
                { html: 'top last bottom' },
                { sub: sub3 },
                { html: 'top everlast bottom' },
              ],
            },
          ],
        ])
        yield spec.$$discard()
      })

      hit('parses multiple step per line in edge cases', function*() {
        const sub3 = fakeSub(3)
        yield spec`
          ---- file.ext ---
          filled
          ********
          top
          ::0::
            f${sub0}i${sub1}rst
            ${sub2}${sub3}
            everlast
          ::
          bottom
        `
        const state = yield $$debug()
        expect([...state.expects]).to.matchPattern([
          [
            '0',
            {
              steps: [
                { html: 'top f bottom' },
                { sub: sub0 },
                { html: 'top i bottom' },
                { sub: sub1 },
                { html: 'top rst bottom' },
                { sub: sub2 },
                { sub: sub3 },
                { html: 'top everlast bottom' },
              ],
            },
          ],
        ])
        yield spec.$$discard()
      })

      hit('parses before and after hooks when there are steps', function*() {
        const sub3 = fakeSub(3)
        const subBefore = fakeSub('before')
        const subAfter = fakeSub('after')
        yield spec`
          ---- file.ext ---
          filled
          ********
          top
          ::1::
            zip
          ::0 ${subBefore}
          ::0::
            f${sub0}i${sub1}rst
            ${sub2}${sub3}
            everlast
          ::0 ${subAfter}
          bottom
        `
        const state = yield $$debug()
        expect([...state.expects]).to.matchPattern([
          ['1', { steps: [{ html: 'top zip bottom' }] }],
          [
            '0',
            {
              before: subBefore,
              after: subAfter,
              steps: [
                { html: 'top f bottom' },
                { sub: sub0 },
                { html: 'top i bottom' },
                { sub: sub1 },
                { html: 'top rst bottom' },
                { sub: sub2 },
                { sub: sub3 },
                { html: 'top everlast bottom' },
              ],
            },
          ],
        ])
        yield spec.$$discard()
      })
    }) // expectation subs

    hit('parses empty condition lines in files', function*() {
      yield spec`
        ---- file.js ----
        ::0
      `
      const state = yield $$debug()
      expect(state).to.matchPattern({
        specs: {
          'file.js': {
            '*': undefined,
            0: _``,
          },
        },
      })
    })

    hit('parses empty condition lines in expects', function*() {
      yield spec`
        ---- file.js ----

        ****
        ::0
      `
      const state = yield $$debug()
      expect(state).to.matchPattern({
        specs: {
          'file.js': {
            '*': _``,
          },
        },
        expects: new Map([['0', { steps: [{ html: _`` }] }]]),
      })
      yield spec.$$discard()
    })

    // kitchen sink
    hit('lets mix all styles for maximum expressivity', function*() {
      yield spec(`
        ---- foo.js ----
        top
        ::0 on 000
        middle
        ::1::
          function foo() { console.log('bar') }
        ::
        bottom
        ---- Bar.svelte ----
        <h1>I am Bar</h1>
        ********
        <h1>Result...</h1>
        ::0
        ::1 <p>has arrived!</p>
      `)

      const state = yield $$debug()
      expect(state).to.matchPattern({
        // --- Files ---

        specs: {
          'foo.js': {
            '*': undefined,
            0: _(['top', 'on 000', 'middle', 'bottom']),
            1: _([
              'top',
              'middle',
              "function foo() { console.log('bar') }",
              'bottom',
            ]),
          },
          'Bar.svelte': {
            '*': _`<h1>I am Bar</h1>`,
          },
        },

        // --- Expectations ---

        expects: new Map([
          ['0', { steps: [{ html: '<h1>Result...</h1>' }] }],
          ['1', { steps: [{ html: '<h1>Result...</h1><p>has arrived!</p>' }] }],
        ]),
      })

      yield spec.$$discard()
    })
  })

  describe('yield spec.expect(...)', () => {
    hit('accepts two args', function*() {
      yield spec.expect(0, '<p>foo</p>')
      yield spec.expect(1, 'Babar')
      const state = yield $$debug()
      expect([...state.expects]).to.deep.equal([
        ['0', { steps: [{ html: '<p>foo</p>' }] }],
        ['1', { steps: [{ html: 'Babar' }] }],
      ])
      yield spec.$$discard()
    })

    hit('accepts a single array arg', function*() {
      yield spec.expect([[0, '<p>foo</p>'], [1, 'Babar']])
      const state = yield $$debug()
      expect([...state.expects]).to.deep.equal([
        ['0', { steps: [{ html: '<p>foo</p>' }] }],
        ['1', { steps: [{ html: 'Babar' }] }],
      ])
      yield spec.$$discard()
    })

    // helps with maintaining a sane formatting with prettier
    hit('can be used as a template literal tag', function*() {
      yield spec.expect(0)`
        <p>f${'o'}o</p>
      `
      yield spec.expect(1)`
        Babar
      `
      const state = yield $$debug()
      expect([...state.expects]).to.deep.equal([
        ['0', { steps: [{ html: '<p>foo</p>' }] }],
        ['1', { steps: [{ html: 'Babar' }] }],
      ])
      yield spec.$$discard()
    })

    hit('accepts strings for html', function*() {
      yield spec.expect(0, 'foo')
      yield spec.expect(1, 'bar')
      const state = yield $$debug()
      expect([...state.expects]).to.deep.equal([
        ['0', { steps: [{ html: 'foo' }] }],
        ['1', { steps: [{ html: 'bar' }] }],
      ])
      yield spec.$$discard()
    })

    hit('accepts function', function*() {
      const foo = () => {}
      const bar = async () => {}
      yield spec.expect(0, foo)
      yield spec.expect(1, bar)
      const state = yield $$debug()
      expect([...state.expects]).to.deep.equal([
        ['0', { steps: [{ function: foo }] }],
        ['1', { steps: [{ function: bar }] }],
      ])
      yield spec.$$discard()
    })

    hit('accepts generator for sub functions', function*() {
      const foo = function*() {}
      const bar = function* bar() {}
      yield spec.expect(0, foo)
      yield spec.expect(1, bar)
      const state = yield $$debug()
      expect([...state.expects]).to.deep.equal([
        ['0', { steps: [{ sub: foo }] }],
        ['1', { steps: [{ sub: bar }] }],
      ])
      yield spec.$$discard()
    })

    hit('adds up successive calls for the same label', function*() {
      const foo = () => {}
      const bar = () => {}
      yield spec.expect(0, foo)
      yield spec.expect(1, 'bar')
      yield spec.expect(0, 'foo')
      yield spec.expect(1, bar)
      const state = yield $$debug()
      expect([...state.expects]).to.deep.equal([
        ['0', { steps: [{ function: foo }, { html: 'foo' }] }],
        ['1', { steps: [{ html: 'bar' }, { function: bar }] }],
      ])
      yield spec.$$discard()
    })

    describe('yield spec.before(fn*)', () => {
      hit('adds a before sub to the case', function*() {
        const foo = function*() {}
        const bar = function* bar() {}
        yield spec.before(0, foo)
        yield spec.expect(1, 'bar')
        yield spec.expect(0, 'foo')
        yield spec.before(1, bar)
        const state = yield $$debug()
        expect([...state.expects]).to.deep.equal([
          ['0', { before: foo, steps: [{ html: 'foo' }] }],
          ['1', { before: bar, steps: [{ html: 'bar' }] }],
        ])
        yield spec.$$discard()
      })

      it('runs before hook before all steps in the case', async () => {
        // before test
        const before = sinon.fake(function* after() {})
        const step0 = sinon.fake(() => {
          expect(before, 'before').not.to.have.been.called
          expect(step1, 'step1').not.to.have.been.called
        })
        const step1 = sinon.fake(() => {
          expect(before, 'before').to.have.been.called
          expect(step0, 'step0').to.have.been.calledOnce
        })
        // test
        await _testHmr('kitchen sink', function*() {
          _page.$eval = sinon.fake(
            async () => `
              <h2>Kild: I am expected</h2><!--<Child>--><!--<App>-->
            `
          )
          yield spec.expect(0, step0)
          yield spec.expect(1, step1)
          yield spec.before(1, before)
        })
        // after test
        expect(step1, 'step1').to.have.been.calledOnce
      })
    })

    describe('yield spec.after(fn*)', () => {
      hit('adds a after sub to the case', function*() {
        const foo = function*() {}
        const bar = function* bar() {}
        yield spec.after(0, foo)
        yield spec.expect(1, 'bar')
        yield spec.expect(0, 'foo')
        yield spec.after(1, bar)
        const state = yield $$debug()
        expect([...state.expects]).to.deep.equal([
          ['0', { after: foo, steps: [{ html: 'foo' }] }],
          ['1', { after: bar, steps: [{ html: 'bar' }] }],
        ])
        yield spec.$$discard()
      })

      it('runs after hook after all steps in the case', async () => {
        // before test
        const after = sinon.fake(function* after() {})
        const step0 = sinon.fake(() => {
          expect(after, 'after').not.to.have.been.called
          expect(step1, 'step1').not.to.have.been.called
        })
        const step1 = sinon.fake(() => {
          expect(after, 'after').to.have.been.calledOnce
          expect(step0, 'step0').to.have.been.calledOnce
        })
        // test
        await _testHmr('kitchen sink', function*() {
          _page.$eval = sinon.fake(
            async () => `
              <h2>Kild: I am expected</h2><!--<Child>--><!--<App>-->
            `
          )
          yield spec.after(0, after)
          yield spec.expect(0, step0)
          yield spec.expect(1, step1)
        })
        // after test
        expect(step1, 'step1').to.have.been.calledOnce
      })
    })

    hit('compiles expectations on first non-init effect', function*() {
      yield spec.expect(0, '<p>foo</p>')
      {
        const state = yield $$debug()
        expect(state.remainingExpects).to.be.undefined
      }
      yield innerText('*')
      {
        const state = yield $$debug()
        expect(state.remainingExpects).to.deep.equal([
          ['0', { steps: [{ html: '<p>foo</p>' }] }],
        ])
      }
      yield spec.$$discard()
    })

    hit('crashes when init not on the first expectation step', function*() {
      yield spec.expect(0, sinon.fake())
      yield spec.expect(1, sinon.fake())
      let initError
      let after = false
      try {
        yield init(1)
        yield innerText('*')
        // ensures controller stop yielding after throw
        after = true
        yield innerText('*')
      } catch (err) {
        initError = err
      }
      expect(initError).not.to.be.undefined
      expect(after).to.be.false
    })

    hit('runs expectations for steps that are activated manually', function*() {
      const expects = {
        0: sinon.fake(),
        1: sinon.fake(),
      }
      yield spec.expect(0, expects[0])
      yield spec.expect(1, expects[1])
      // flow
      expect(expects[0], '-0.0').not.to.have.been.called
      yield change(0)
      expect(expects[0], '0.0').to.have.been.calledOnce
      expect(expects[1], '0.1').not.to.have.been.called
      yield change(1)
      expect(expects[1], '1.1').to.have.been.calledOnce
    })

    hit('runs skipped expectations', function*() {
      const expects = {}
      for (let i = 0; i < 4; i++) {
        expects[i] = sinon.fake()
        yield spec.expect(i, expects[i])
      }
      yield init(0)
      expect(expects[1], '-0.0').not.to.have.been.called
      // 0
      yield innerText('*')
      expect(expects[0], '0.0').to.have.been.calledOnce
      expect(expects[1], '0.1').not.to.have.been.called
      expect(expects[2], '0.2').not.to.have.been.called
      // 1, 2
      yield change(2) // <- NOTE skips 1
      expect(expects[0], '1.0').to.have.been.calledOnce
      expect(expects[1], '1.1').to.have.been.calledOnce
      expect(expects[2], '1.2').to.have.been.calledOnce
      // 3
      expect(expects[3], '2.3').not.to.have.been.called
    })

    it('flushes remaining steps when generator returns', async () => {
      const expects = {}

      await _testHmr('kitchen sink', function*() {
        for (let i = 0; i < 4; i++) {
          expects[i] = sinon.fake()
          yield spec.expect(i, expects[i])
        }

        yield init(0)
        expect(expects[1], '-0.0').not.to.have.been.called
        // 0
        // yield innerText('*')
        // expect(expects[0], '0.0').to.have.been.calledOnce
        expect(expects[1], '0.1').not.to.have.been.called
        expect(expects[2], '0.2').not.to.have.been.called
        // 1, 2
        yield change(2)
        expect(expects[0], '1.0').to.have.been.calledOnce
        expect(expects[1], '1.1').to.have.been.calledOnce
        expect(expects[2], '1.2').to.have.been.calledOnce
        // 3
        expect(expects[3], '2.3').not.to.have.been.called
      })

      expect(expects[3], '3.3').to.have.been.calledOnce
    })

    it('flushes all steps if generator returns during init phase', async () => {
      const expects = {
        0: sinon.fake(),
      }
      await _testHmr('kitchen sink', function*() {
        yield spec.expect(0, expects[0])
        expect(expects[0]).not.to.have.been.called
      })
      expect(expects[0]).to.have.been.calledOnce
    })

    it('runs steps sub functions', async () => {
      const fakeSub = sinon.fake()
      function* sub(...args) {
        fakeSub(...args) // tracks calls for us
      }
      _page.$eval = sinon.fake(async () => 'html')
      await _testHmr('kitchen sink', function*() {
        yield this.spec.expect(0, 'html')
        yield this.spec.expect(0, sub)
        expect(fakeSub, 'sub').to.not.have.been.called
      })
      expect(fakeSub, 'sub').to.have.been.called
    })

    it('runs empty html expects', async () => {
      _page.$eval.return('')
      await _testHmr('runs empty html expects', function*() {
        yield spec.expect(0, '')
        const state = yield $$debug()
        expect(state).to.matchPattern({
          expects: new Map([['0', { steps: [{ html: _`` }] }]]),
        })
      })
      expect(_page.$eval).to.have.been.calledOnce
    })
  })

  describe('yield spec.expect(int, string)', () => {
    it('flushes remaining steps when generator returns', async () => {
      const after = sinon.fake(function* after() {})

      await _testHmr('kitchen sink', function*() {
        _page.$eval = sinon.fake(
          async () => `
            <h2>Kild: I am expected</h2><!--<Child>--><!--<App>-->
          `
        )
        yield spec(`
          ---- App.svelte ----
          <script>
            import Child from './Child'
          </script>
          <Child name="Kild" />
          ---- Child.svelte ----
          <script>
            export let name
          </script>
          <h2>{name}: I am expected</h2>
        `)
        yield spec.expect(0)`
          <h2>Kild: I am expected</h2>
        `
        yield spec.after(0, after)
      })

      expect(after, 'after hook').to.have.been.calledOnce
    })

    hit('matches full result content', function*() {
      _page.$eval = sinon.fake(
        async () => `
          <h2>Kild: I am expected</h2><!--<Child>--><!--<App>-->
        `
      )
      yield spec(`
        ---- App.svelte ----
        <script>
          import Child from './Child'
        </script>
        <Child name="Kild" />
        ---- Child.svelte ----
        <script>
          export let name
        </script>
        <h2>{name}: I am expected</h2>
      `)
      yield spec.expect(0)`
        <h2>Kild: I am expected</h2>
      `
    })

    hit('collapses white spaces between tags to match HTML', function*() {
      _page.$eval = sinon.fake(
        async () => `
          <h1>I  am  title</h1>
          <p>
            I'm&nbsp;&nbsp;   paragraph <span>I am   spanning</span>
          </p>
          <!--<App>-->
        `
      )
      yield spec(`
        ---- App.svelte ----
        <h1>I  am  title</h1>
        <p> I'm&nbsp;&nbsp;   paragraph <span>  I am   spanning</span>
          </p>
      `)
      yield spec.expect(0)`
        <h1>I am title</h1>
        <p>
          I'm&nbsp;&nbsp; paragraph <span>I am spanning</span>
        </p>
      `
    })

    hit('matches full result content in all conditions', function*() {
      const results = {
        0: `
          <h2>Kild: I am expected</h2><!--<Child>--><!--<App>-->
        `,
        1: `
          <h1>I am Kild</h1><!--<Child>--><!--<App>-->
        `,
        2: `
          <h1>I am Kild</h1><!--<Child>--> <p>oooO   oOoo</p><!--<App>-->
        `,
      }
      let i = 0
      _page.$eval = sinon.fake(async () => results[i++])
      yield spec(`
        ---- App.svelte ----
        <script>
          import Child from './Child'
        </script>
        <Child name="Kild" />
        ::2 <p>oooO   oOoo</p>
        ---- Child.svelte ----
        <script>
          export let name
        </script>
        ::0 <h2>{name}: I am expected</h2>
        ::1 <h1>I am {name}</h1>
        ::2 <h1>I am {name}</h1>
      `)
      yield spec.expect(0, `<h2>Kild: I am expected</h2>`)
      yield spec.expect(1, `<h1>I am Kild</h1>`)
      yield spec.expect(2, `<h1>I am Kild</h1> <p>oooO   oOoo</p>`)
    })
  }) // yield spec.expect(int, string)

  describe('yield init({...})', () => {
    hit('configures initial files', function*() {
      yield init({
        'main.js': 'console.log("I am main.js")',
      })
      const state = yield $$debug()
      expect(state.inits).to.deep.equal({
        'main.js': 'console.log("I am main.js")',
      })
    })

    hit('accepts functions for templates', function*() {
      const tpl = () => 'console.log("I am main.js")'
      yield init({
        'main.js': tpl,
      })
      const state = yield $$debug()
      expect(state.templates).to.deep.equal({
        'main.js': tpl,
      })
    })

    hit('renders templates with undefined', function*() {
      const content = 'console.log("I am main.js")'
      const tpl = sinon.fake(() => content)
      yield init({
        'main.js': tpl,
      })
      const state = yield $$debug()
      expect(state.inits).to.deep.equal({
        'main.js': content,
      })
      expect(tpl).to.have.been.calledOnceWith(undefined)
    })
  })

  describe('yield init(spec)', () => {
    hit('always includes string specs', function*() {
      yield spec({ always: 'ALWAYS' })
      yield init(0)
      const state = yield $$debug()
      expect(state.inits).to.deep.equal({ always: 'ALWAYS' })
    })

    hit('always includes * specs', function*() {
      yield spec({ always: { '*': 'ALWAYS' } })
      yield init(0)
      const state = yield $$debug()
      expect(state.inits).to.deep.equal({ always: 'ALWAYS' })
    })

    hit('conditionnaly includes labeled specs', function*() {
      yield spec({ foo: { 0: 'FOO' }, bar: { 1: 'BAR' } })
      yield init(1)
      const state = yield $$debug()
      expect(state.inits).to.deep.equal({ bar: 'BAR' })
    })
  })

  describe('yield change({...})', () => {
    hit('triggers app init', function*() {
      expect(loadPage).not.to.have.been.called
      yield change({
        'main.js': 'foo',
      })
      expect(loadPage).to.have.been.calledOnce
    })

    hit('writes new files and wait for HMR', function*() {
      expect(writeHmr).not.to.have.been.called
      yield change({
        'main.js': 'foo',
        'App.svelte': 'bar',
      })
      expect(writeHmr).to.have.been.calledOnce
    })

    hit('writes new files and wait on each call', function*() {
      expect(writeHmr).not.to.have.been.called
      yield change({
        'main.js': 'foo',
      })
      expect(writeHmr).to.have.been.calledOnce
      yield change({
        'App.svelte': 'bar',
      })
      expect(writeHmr).to.have.been.calledTwice
    })
  })

  describe('yield change(spec)', () => {
    hit('always includes string specs', function*() {
      yield spec({ always: 'ALWAYS' })
      yield change(0)
      expect(writeHmr).to.have.been.calledWith(_page, { always: 'ALWAYS' })
    })

    hit('always includes * specs', function*() {
      yield spec({ always: { '*': 'ALWAYS' } })
      yield change(0)
      expect(writeHmr).to.have.been.calledWith(_page, { always: 'ALWAYS' })
      yield change(1)
      expect(writeHmr).to.have.been.calledWith(_page, { always: 'ALWAYS' })
    })

    hit('only write files that have a matching condition label', function*() {
      yield spec({ foo: { 0: 'FOO', 1: 'foo' }, bar: { 1: 'BAR', 2: 'bar' } })
      yield change(0)
      expect(writeHmr).to.have.been.calledWith(_page, {
        foo: 'FOO',
      })
      yield change(1)
      expect(writeHmr).to.have.been.calledWith(_page, {
        foo: 'foo',
        bar: 'BAR',
      })
      yield change(2)
      expect(writeHmr).to.have.been.calledWith(_page, {
        bar: 'bar',
      })
    })
  })

  describe('yield page()', () => {
    hit('is exposed as this.page', function*() {
      expect(this.page).to.equal(page)
    })

    hit('returns the page instance', function*() {
      const p = yield page()
      expect(p).to.equal(_page)
    })

    hit('triggers init', function*() {
      {
        const { started } = yield $$debug()
        expect(started).to.be.false
      }
      yield page()
      {
        const { started } = yield $$debug()
        expect(started).to.be.true
      }
    })
  })

  describe('yield page[method](...args)', () => {
    hit('proxies the method to the actual page instance', function*() {
      yield page.$eval()
      expect(_page.$eval).to.have.been.calledOnce
    })

    hit('passes arguments to the proxied method', function*() {
      const a = {}
      const b = {}
      const c = {}
      yield page.$eval(a, b, c)
      expect(_page.$eval).to.have.been.calledWith(a, b, c)
    })

    hit('returns proxied method result', function*() {
      _page.$eval = sinon.fake(() => 'yep')
      const result = yield page.$eval()
      expect(result).to.equal('yep')
    })

    hit('await async results', function*() {
      _page.$eval = sinon.fake(async () => '... yep')
      const result = yield page.$eval()
      expect(result).to.equal('... yep')
    })

    hit('triggers init', function*() {
      {
        const { started } = yield $$debug()
        expect(started).to.be.false
      }
      yield page.$eval()
      {
        const { started } = yield $$debug()
        expect(started).to.be.true
      }
    })

    describe('yield page.keyboard()', () => {
      hit('returns the object instance', function*() {
        const keyboard = yield page.keyboard()
        expect(keyboard).to.equal(_page.keyboard)
      })

      it('crashes when calling an object instance with arguments', async () => {
        _page.keyboard = {}
        const result = _testHmr(function*() {
          yield page.keyboard('boom')
        })
        await expect(result).to.be.rejectedWith('not a function')
      })
    })

    describe('yield page.keyboard[method](...args)', () => {
      hit(
        'proxies the method to the actual page.keyboard instance',
        function*() {
          yield page.keyboard.press('Backspace')
          expect(_page.keyboard.press).to.have.been.calledOnceWith('Backspace')
        }
      )
    })
  }) // yield page

  describe('testHmr`...`', () => {
    const runTest = wrapper => _testHmr('*under test*', null, null, wrapper)

    describe('config: { runSpecTagAsDescribe: false, describeByStep: false }', () => {
      const customizer = options => ({
        ...options,
        runTagAsDescribe: false,
      })
      const runTest = wrapper =>
        _testHmr('*under test*', null, customizer, wrapper)
      it('can be used as a template literal', async () => {
        await runTest(
          testHmr => testHmr`
            # my spec
          `
        )
        expect(_it).to.have.been.calledOnceWith('my spec')
      })

      it('reports errors as test failure', async () => {
        const promise = runTest(
          testHmr => testHmr`
            # my spec
            --- myfile ---
            ::0 nothing
            * * *
            ::0 something
          `
        )
        await expect(promise, 'runTest').to.be.rejected
        expect(_it).to.have.been.calledOnce
        // use `it` return value instead of runTest result, to ensure that
        // the error really did pass through the test handler (as opposed to
        // some kind of possible test artifact)
        expect(await _it.returnValues[0])
          .to.have.nested.property('error.message')
          .that.include('expected')
      })
    })

    describe('config: { runSpecTagAsDescribe: true, describeByStep: true }', () => {
      const customizer = options => ({
        ...options,
        runTagAsDescribe: true,
        describeByStep: true,
      })
      const runTest = wrapper =>
        _testHmr('*under test*', null, customizer, wrapper)

      it('can be used as a template literal', async () => {
        _page.$eval = sinon.fake.returns('foo')
        await runTest(
          testHmr => testHmr`
            # my spec
            --- App.svelte ---
            ::0 foo
            * * *
            ::0 foo
          `
        )
        expect(_describe, 'describe').to.have.been.calledWith('my spec')
      })

      it('runs conditions with `describe`', async () => {
        _page.$eval.return('<h1>I am file</h1>', '<h1>I am still</h1>')
        await runTest(
          testHmr => testHmr`
            # my spec
            ---- my-file ----
            <h1>I am file</h1>
            ****
            ::0 <h1>I am file</h1>
            ::1 <h1>I am still</h1>
          `
        )
        expect(_describe, 'describe')
          .to.have.been.calledThrice //
          .and.calledWith('my spec')
          .and.calledWith('after update 0')
          .and.calledWith('after update 1')
        expect(_page.$eval, 'page.$eval').to.have.been.calledTwice
      })

      it('runs steps with `it`', async () => {
        _page.$eval.return('<h1>I am file</h1>', '<h2>I am still</h2>')
        await runTest(
          testHmr => testHmr`
            # my spec
            ---- my-file ----
            <h1>I am file</h1>
            ****
            ::0:: initial initialisation
              <h1>I am file</h1>
              ${function*() {}}
              <h2>I am still</h2>
          `
        )
        expect(_describe, 'describe')
          .to.have.been.calledTwice //
          .and.calledWith('my spec')
          .and.calledWith('after update 0 (initial initialisation)')
        expect(_it, 'it')
          .to.have.been.calledThrice //
          .and.calledWith('step 0 (html)')
          .and.calledWith('step 1 (sub)')
          .and.calledWith('step 2 (html)')
        expect(_page.$eval, 'page.$eval').to.have.been.calledTwice
      })

      it('marks failed `it` steps as failure and skip subsequent steps', async () => {
        function* sub() {
          throw new Error('oops')
        }
        _page.$eval = sinon.fake.returns('I am file')
        const result = runTest(
          testHmr => testHmr`
            # my spec
            ---- my-file ----
            ::0 I am file
            ****
            ::0:: init
              I am file
            ::1:: crashes
              I am file
              ${sub}
              I am file... not!
            ::2:: skipped
              Skipped
              ${sub}
          `
        )
        await expect(result).to.be.rejected
        expect(_describe.args, 'describe args').to.matchPattern([
          ['my spec', {}],
          ['after update 0 (init)', {}],
          ['after update 1 (crashes)', {}],
          ['after update 2 (skipped)', {}],
        ])
        expect(_it.args, 'it args').to.matchPattern([
          ['step 0 (html)', {}],
          ['step 0 (html)', {}],
          ['step 1 (sub)', {}],
          ['step 2 (html)', {}],
          ['step 0 (html)', {}],
          ['step 1 (sub)', {}],
        ])
        // use `it` return value instead of runTest result, to ensure that
        // the error really did pass through the test handler (as opposed to
        // some kind of possible test artifact)
        const results = await Promise.all(_it.returnValues)
        expect(results, 'it return values').to.matchPattern([
          // 0-0 (html)
          { error: undefined, skipped: false },
          // 1-0 (html)
          { error: undefined, skipped: false },
          // 1-1 (sub) <== error
          {
            error: { message: 'oops' },
            skipped: false,
          },
          // 1-2 (html)
          { error: undefined, skipped: true },
          // 2-0 (html)
          { error: undefined, skipped: true },
          // 2-1 (sub)
          { error: undefined, skipped: true },
        ])
      })
    })

    describe('config: { runSpecTagAsDescribe: true, describeByStep: false }', () => {
      const customizer = options => ({
        ...options,
        runTagAsDescribe: true,
        describeByStep: false,
      })
      const runTest = wrapper =>
        _testHmr('*under test*', null, customizer, wrapper)

      it('can be used as a template literal', async () => {
        _page.$eval = sinon.fake.returns('foo')
        await runTest(
          testHmr => testHmr`
            # my spec
            --- App.svelte ---
            ::0 foo
            * * *
            ::0 foo
            ::1 foo
          `
        )
        expect(_describe, 'describe').to.have.been.calledOnceWith('my spec')
      })

      it('runs conditions with `it`', async () => {
        _page.$eval.return('<h1>I am file</h1>', '<h1>I am still</h1>')
        await runTest(
          testHmr => testHmr`
            # my spec
            ---- my-file ----
            <h1>I am file</h1>
            ****
            ::0 <h1>I am file</h1>
            ::1 <h1>I am still</h1>
          `
        )
        expect(_describe, 'describe').to.have.been.calledOnceWith('my spec')
        expect(_it, 'it')
          .to.have.been.calledTwice //
          .and.calledWith('after update 0')
          .and.calledWith('after update 1')
        expect(_page.$eval, 'page.$eval').to.have.been.calledTwice
      })
    })

    it('marks tests with no assertions as skipped', async () => {
      const result = runTest(
        testHmr => testHmr`
          # my spec
        `
      )
      await expect(result).to.be.rejectedWith('no assertions')
    })

    it('throws on missing title', async () => {
      const result = runTest(
        testHmr => testHmr`
          ---- just-a-file ----
          * * *
          ::0
        `
      )
      await expect(result).to.be.rejectedWith('Expected title')
    })

    it('runs simple assertions', async () => {
      _page.$eval = sinon.fake(async () => '<h1>I am file</h1>')
      await runTest(
        testHmr => testHmr`
          # my spec
          ---- my-file ----
          <h1>I am file</h1>
          ****
          ::0 <h1>I am file</h1>
        `
      )
      expect(_page.$eval, 'page.$eval').to.have.been.calledOnce
    })

    it('registers single conditions with `it`', async () => {
      _page.$eval = sinon.fake(async () => '<h1>I am file</h1>')
      await runTest(
        testHmr => testHmr`
          # my spec
          ---- my-file ----
          <h1>I am file</h1>
          ****
          ::0 <h1>I am file</h1>
        `
      )
      expect(_it, 'it').to.have.been.calledOnceWith('my spec')
      expect(_page.$eval, 'page.$eval').to.have.been.calledOnce
    })

    it('runs assertion steps', async () => {
      const sub = sinon.fake(function*() {})
      {
        const results = {
          0: '<h1>I am file</h1>',
          1: '<h2>I am step2</h2>',
        }
        let i = 0
        _page.$eval = sinon.fake(async () => results[i++])
      }
      await runTest(
        testHmr => testHmr`
          # my spec
          ---- my-file ----
          <h1>I am file</h1>
          ****
          ::0::
            <h1>I am file</h1>
            ${sub}
            <h2>I am step2</h2>
          ::
        `
      )
      expect(_page.$eval, 'page.$eval').to.have.been.calledTwice
      expect(sub, 'sub').to.have.been.calledOnce
    })

    it('marks failed `it` cases as failure and skip subsequent cases', async () => {
      function* sub() {
        throw new Error('oops')
      }
      _page.$eval = sinon.fake.returns('I am file')
      const result = runTest(
        testHmr => testHmr`
          # my spec
          ---- my-file ----
          ::0 I am file
          ****
          ::0:: init
            I am file
          ::1:: crashes
            I am file... not!
            ${sub}
          ::2:: skipped
            Skipped
        `
      )
      await expect(result).to.be.rejected
      expect(_describe, 'describe').to.have.been.calledOnceWith('my spec')
      expect(_it, 'it')
        .to.have.been.calledThrice //
        .and.calledWith('after update 0 (init)')
        .and.calledWith('after update 1 (crashes)')
        .and.calledWith('after update 2 (skipped)')
      // use `it` return value instead of runTest result, to ensure that
      // the error really did pass through the test handler (as opposed to
      // some kind of possible test artifact)
      const results = await Promise.all(_it.returnValues)
      // console.log(results)
      expect(results, 'it return values').to.matchPattern([
        {
          error: undefined,
          skipped: false,
        },
        {
          error: {
            message: /\bexpected\b/,
          },
        },
        {
          error: undefined,
          skipped: true,
        },
      ])
    })

    it('regiters first HMR case (cond) as init file set', async () => {
      const sub = sinon.fake(ensureInit)

      _page.$eval = sinon.fake.returns('i am phil')

      await runTest(
        testHmr => testHmr`
          # my spec
          ---- my-file ----
          i am phil
          ****
          ::0::
            i am phil
            ${sub}
            i am phil
          ::
        `
      )

      function* ensureInit() {
        const state = yield $$debug()
        expect(state).to.matchPattern({
          inits: { 'my-file': /\s*i am phil\s*/ },
        })
      }

      expect(sub, 'ensureInit').to.have.been.calledOnce
    })
  })
})
