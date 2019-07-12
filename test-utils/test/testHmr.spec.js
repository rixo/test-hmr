const {
  testHmr: { create: createTestHmr },
  templates,
  spec,
  init,
  debug,
  change,
  innerText,
  page,
} = require('../../test-utils/testHmr')

const noop = () => {}

describe('test utils: testHmr', () => {
  let _it
  let reset
  let writeHmr
  let _page
  let loadPage
  let _testHmr

  beforeEach(() => {
    _it = null
    reset = sinon.fake()
    writeHmr = sinon.fake(async () => {})
    _page = {
      $eval: sinon.fake(),
    }
    loadPage = sinon.fake(async (url, callback) => callback(_page))
    _testHmr = (title, handler, customizer) =>
      new Promise((resolve, reject) => {
        _it = sinon.fake(function(desc, handler) {
          const scope = { slow: noop }
          return handler
            .call(scope)
            .then(resolve)
            .catch(reject)
        })
        let options = {
          it: _it,
          reset,
          writeHmr,
          loadPage,
        }
        if (customizer) {
          options = customizer(options)
        }
        const testHmr = createTestHmr(options)
        return testHmr(title, handler)
      })
  })

  // h[mr, ]it...
  const makeHit = (title, handler, customizer, _it = it) =>
    _it(title, () => {
      return _testHmr(title, handler, customizer)
    })
  const hit = (title, handler) => makeHit(title, handler, null, it)
  hit.only = (title, handler) => makeHit(title, handler, null, it.only)
  hit.skip = (title, handler) => makeHit(title, handler, null, it.skip)
  // custom
  // hit.browser: doesn't mock browser
  hit.browser = (title, handler) =>
    makeHit(title, handler, ({ it }) => ({ it }), it)

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
      const state = yield debug()
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
      const state = yield debug()
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
      const state = yield debug()
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
      const state = yield debug()
      expect(state.templates).to.deep.equal({
        'first.js': tpl1,
        'second.svelte': tpl2,
      })
    })
  })

  describe('yield spec({...})', () => {
    hit('can registers file specs', function*() {
      yield spec({ foo: 'FOO', bar: { 0: 'BAR' } })
      const state = yield debug()
      expect(state.specs).to.deep.equal({
        foo: { '*': 'FOO' },
        bar: { 0: 'BAR' },
      })
    })

    hit('can be called multiple times (before init)', function*() {
      yield spec({ foo: 'FOO', bar: { 0: 'BAR' } })
      yield spec({ baz: { '*': 'BAZ' } })
      const state = yield debug()
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
      const contents = `
        contents part
      `
      const state = yield debug()
      expect(state.specs).to.deep.equal({
        file: {
          '*': contents,
        },
      })
    })

    hit('registers simple specs with shortcut', function*() {
      yield spec(`
        ---- ether ----
        I just am.
      `)
      const ether = `
        I just am.
      `
      const state = yield debug()
      expect(state.specs).to.deep.equal({
        ether: {
          '*': ether,
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
      const first = `
        I am just above.`
      const second = `
        I am just bellow.
      `
      const state = yield debug()
      expect(state.specs).to.deep.equal({
        first: {
          '*': first,
        },
        second: {
          '*': second,
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
      const first = `
        I am just above.
      `
      const second = `
        I am just bellow.
      `
      const state = yield debug()
      expect(state.specs).to.deep.equal({
        first: {
          '*': first,
        },
        second: {
          '*': second,
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
      const fooAny = `
        top
        middle
        bottom
      `
      const foo0 = `
        top
        on 0
        middle
        bottom
      `
      const foo1 = `
        top
        middle
        on 1
        bottom
      `
      const state = yield debug()
      expect(state.specs).to.deep.equal({
        'foo.js': {
          '*': fooAny,
          0: foo0,
          1: foo1,
        },
      })
    })

    hit('parses muliline conditions', function*() {
      yield spec(`
        ---- first ----
        I am just above.
        ---- foo.js ----
        top
        ::0 on 000
        middle
        ::1 {
          function foo() { console.log('bar') }
        }
        bottom
        ---- second ----
        I am just bellow.
      `)
      const first = `
        I am just above.`
      const second = `
        I am just bellow.
      `
      const fooAny = `
        top
        middle
        bottom`
      const foo0 = `
        top
        on 000
        middle
        bottom`
      const foo1 = `
        top
        middle
          function foo() { console.log('bar') }
        bottom`
      const state = yield debug()
      expect(state.specs).to.deep.equal({
        first: {
          '*': first,
        },
        second: {
          '*': second,
        },
        'foo.js': {
          '*': fooAny,
          0: foo0,
          1: foo1,
        },
      })
    })

    hit('parses expectations', function*() {
      yield spec(`
        ---- file ----
        lorem ipsum
        ****
        before anything:
        ::0 {
          expect#0
        }
        ::1 expect#1
        after all
      `)
      const lorem = `
        lorem ipsum`
      const state = yield debug()
      expect([...state.expects]).to.deep.equal([
        ['0', { steps: [{ html: 'before anything:\n expect#0\n after all' }] }],
        ['1', { steps: [{ html: 'before anything:\n expect#1\n after all' }] }],
      ])
      expect(state.specs).to.deep.equal({
        file: {
          '*': lorem,
        },
      })
      yield spec.$$discard()
    })

    describe('expectations subs', () => {
      let sub0
      let sub1
      let sub2
      const html = 'top\n \n bottom'

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
        // DEBUG DEBUG DEBUG
        // yield spec`
        //   ---- file.ext ---
        //   filled
        //   ${(56, '')}********
        //   ${(75, '')}top
        //   ${(89, '')}::0 ${(93, sub0)}
        //   ${(104, '')}::0 ${(108, sub1)}
        //   ${(119, '')}bottom
        // `
        yield spec`
          ---- file.ext ---
          filled
          ********
          top
          ::0 ${sub0}
          ::0 ${sub1}
          bottom
        `
        const state = yield debug()
        expect([...state.expects]).to.deep.equal([
          [
            '0',
            {
              before: sub0,
              after: sub1,
              steps: [{ html: 'top\n bottom' }],
            },
          ],
        ])
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
          ::1 {
            ${sub0}
            first
            ${sub1}
            second
            ${sub2}
          }
          bottom
        `
        const state = yield debug()
        expect([...state.expects]).to.deep.equal([
          [
            '0',
            {
              steps: [{ html: 'top\n zero\n bottom' }],
            },
          ],
          [
            '1',
            {
              steps: [
                { sub: sub0 },
                { html: 'top\n first\n bottom' },
                { sub: sub1 },
                { html: 'top\n second\n bottom' },
                { sub: sub2 },
              ],
            },
          ],
        ])
        yield spec.$$discard()
      })

      hit('parses last expectation step when not a sub', function*() {
        yield spec`
          ---- file.ext ---
          filled
          ********
          top
          ::0 zero
          ::1 {
            ${sub0}
            first
            ${sub1}
            second
            ${sub2}
            last
          }
          bottom
        `
        const state = yield debug()
        expect([...state.expects]).to.deep.equal([
          [
            '0',
            {
              steps: [{ html: 'top\n zero\n bottom' }],
            },
          ],
          [
            '1',
            {
              steps: [
                { sub: sub0 },
                { html: 'top\n first\n bottom' },
                { sub: sub1 },
                { html: 'top\n second\n bottom' },
                { sub: sub2 },
                { html: 'top\n last\n bottom' },
              ],
            },
          ],
        ])
        yield spec.$$discard()
      })

      hit('parses multiple step subs on a single line', function*() {
        const sub3 = fakeSub(3)
        const sub4 = fakeSub(4)
        const sub5 = fakeSub(5)
        // yield spec`
        //   ---- file.ext ---
        //   filled
        //   ********
        //   top
        //   ::0 zero
        //   ::1 {
        //     ${sub0}
        //     first
        //     ${sub1}
        //     second ${sub2} last ${sub3}
        //     everlast
        //   }
        //   bottom
        // `
        yield spec`
          ---- file.ext ---
          filled
          ********
          top
          ::0 zero
          ::1 {${(113, '')}
            ${sub0}
            first
            ${sub1}
            second ${sub2} last ${sub3}
            everlast
          }
          bottom
        `
        const state = yield debug()
        // console.log(JSON.stringify([...state.expects], false, 2))
        expect([...state.expects]).to.deep.equal([
          [
            '0',
            {
              steps: [{ html: 'top\n zero\n bottom' }],
            },
          ],
          [
            '1',
            {
              steps: [
                { sub: sub0 },
                { html: 'top\n first\n bottom' },
                { sub: sub1 },
                { html: 'top\n second \n bottom' },
                { sub: sub2 },
                { html: 'top\n last \n bottom' },
                { sub: sub3 },
                { html: 'top\n everlast\n bottom' },
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
          ::0 {
            f${sub0}i${sub1}rst
            ${sub2}${sub3}
            everlast
          }
          bottom
        `
        const state = yield debug()
        expect([...state.expects]).to.deep.equal([
          [
            '0',
            {
              steps: [
                { html: 'top\n f\n bottom' },
                { sub: sub0 },
                { html: 'top\ni\n bottom' },
                { sub: sub1 },
                { html: 'top\nrst\n bottom' },
                { sub: sub2 },
                { sub: sub3 },
                { html: 'top\n everlast\n bottom' },
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
          ::1 {
            zip
          }
          ::0 ${subBefore}
          ::0 {
            f${sub0}i${sub1}rst
            ${sub2}${sub3}
            everlast
          }
          ::0 ${subAfter}
          bottom
        `
        const state = yield debug()
        expect([...state.expects]).to.deep.equal([
          ['1', { steps: [{ html: 'top\n zip\n bottom' }] }],
          [
            '0',
            {
              before: subBefore,
              after: subAfter,
              steps: [
                { html: 'top\n f\n bottom' },
                { sub: sub0 },
                { html: 'top\ni\n bottom' },
                { sub: sub1 },
                { html: 'top\nrst\n bottom' },
                { sub: sub2 },
                { sub: sub3 },
                { html: 'top\n everlast\n bottom' },
              ],
            },
          ],
        ])
        yield spec.$$discard()
      })

      hit.only('parses multiline sub steps', function*() {
        const sub3 = fakeSub(3)
        const subBefore = fakeSub('before')
        const subAfter = fakeSub('after')
        yield spec`
          ---- App.svelte ----

          ::0 <Child />
          ::1 <Child />
          ::2 <Child />

          ********

          <h2>
            ::0 {
              I am Crash
              ${sub3}
            }
          </h2>
        `
        const state = yield debug()
        console.log(JSON.stringify([...state.expects], false, 2))
        // expect([...state.expects]).to.deep.equal([
        //   ['1', { steps: [{ html: 'top\n zip\n bottom' }] }],
        //   [
        //     '0',
        //     {
        //       before: subBefore,
        //       after: subAfter,
        //       steps: [
        //         { html: 'top\n f\n bottom' },
        //         { sub: sub0 },
        //         { html: 'top\ni\n bottom' },
        //         { sub: sub1 },
        //         { html: 'top\nrst\n bottom' },
        //         { sub: sub2 },
        //         { sub: sub3 },
        //         { html: 'top\n everlast\n bottom' },
        //       ],
        //     },
        //   ],
        // ])
        yield spec.$$discard()
      })

      // hit('are parsed in multi line conditions', function*() {
      //   yield spec`
      //     ---- file.ext ---
      //     filled
      //     ********
      //     top
      //     ::0 ${sub0}
      //     ::1 {
      //       ${sub1}
      //     }
      //     ::2 ${sub2}
      //     bottom
      //   `
      //   const state = yield debug()
      //   expect([...state.expects]).to.deep.equal([
      //     ['0', { html, subs: [sub0] }],
      //     ['1', { html, subs: [sub1] }],
      //     ['2', { html, subs: [sub2] }],
      //   ])
      //   yield spec.$$discard()
      // })
      //
      // hit('stress test', function*() {
      //   const sub3 = fakeSub(3)
      //   const sub4 = fakeSub(4)
      //   const sub5 = fakeSub(5)
      //   yield spec`
      //     ---- file.ext ---
      //     filled
      //     ********
      //     top
      //     ::0 ${(93, sub0)}
      //     ::1 ${(108, '')}{
      //       ${(122, sub1)}
      //     }
      //     mid
      //     ::2 {
      //       LLL ${sub2} RRR
      //     }
      //     ::3 I am ${sub3} tired
      //     ::4 {
      //       ${sub4}
      //       ${sub5}
      //     }
      //     bottom
      //   `
      //   const state = yield debug()
      //   // console.log(JSON.stringify([...state.expects], false, 2))
      //   expect([...state.expects]).to.deep.equal([
      //     ['0', { html: 'top\n \n mid\n bottom', subs: [sub0] }],
      //     ['1', { html: 'top\n \n mid\n bottom', subs: [sub1] }],
      //     ['2', { html: 'top\n mid\n LLL RRR\n bottom', subs: [sub2] }],
      //     ['3', { html: 'top\n mid\n I am tired\n bottom', subs: [sub3] }],
      //     ['4', { html: 'top\n mid\n \n \n bottom', subs: [sub4, sub5] }],
      //   ])
      //   yield spec.$$discard()
      // })
    })

    // kitchen sink
    hit('lets mix all styles for maximum expressivity', function*() {
      yield spec(`
        ---- foo.js ----
        top
        ::0 on 000
        middle
        ::1 {
          function foo() { console.log('bar') }
        }
        bottom
        ---- Bar.svelte ----
        <h1>I am Bar</h1>
        ********
        <h1>Result...</h1>
        ::0
        ::1 <p>has arrived!</p>
      `)

      // --- Files ---

      const fooAny = `
        top
        middle
        bottom`
      const foo0 = `
        top
        on 000
        middle
        bottom`
      const foo1 = `
        top
        middle
          function foo() { console.log('bar') }
        bottom`
      const iAmBar = `
        <h1>I am Bar</h1>`
      const state = yield debug()
      expect(state.specs).to.deep.equal({
        'foo.js': {
          '*': fooAny,
          0: foo0,
          1: foo1,
        },
        'Bar.svelte': {
          '*': iAmBar,
        },
      })

      // --- Expectations ---

      expect([...state.expects]).to.deep.equal([
        ['0', { steps: [{ html: '<h1>Result...</h1>' }] }],
        ['1', { steps: [{ html: '<h1>Result...</h1><p>has arrived!</p>' }] }],
      ])

      yield spec.$$discard()
    })
  })

  describe('yield spec.expect(...)', () => {
    hit('accepts two args', function*() {
      yield spec.expect(0, '<p>foo</p>')
      yield spec.expect(1, 'Babar')
      const state = yield debug()
      expect([...state.expects]).to.deep.equal([
        ['0', { steps: [{ html: '<p>foo</p>' }] }],
        ['1', { steps: [{ html: 'Babar' }] }],
      ])
      yield spec.$$discard()
    })

    hit('accepts a single array arg', function*() {
      yield spec.expect([[0, '<p>foo</p>'], [1, 'Babar']])
      const state = yield debug()
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
      const state = yield debug()
      expect([...state.expects]).to.deep.equal([
        ['0', { steps: [{ html: '<p>foo</p>' }] }],
        ['1', { steps: [{ html: 'Babar' }] }],
      ])
      yield spec.$$discard()
    })

    hit('accepts strings for html', function*() {
      yield spec.expect(0, 'foo')
      yield spec.expect(1, 'bar')
      const state = yield debug()
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
      const state = yield debug()
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
      const state = yield debug()
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
      const state = yield debug()
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
        const state = yield debug()
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
        const state = yield debug()
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
        const state = yield debug()
        expect(state.remainingExpects).to.be.undefined
      }
      yield innerText('*')
      {
        const state = yield debug()
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
  })

  describe('yield init({...})', () => {
    hit('configures initial files', function*() {
      yield init({
        'main.js': 'console.log("I am main.js")',
      })
      const state = yield debug()
      expect(state.inits).to.deep.equal({
        'main.js': 'console.log("I am main.js")',
      })
    })

    hit('accepts functions for templates', function*() {
      const tpl = () => 'console.log("I am main.js")'
      yield init({
        'main.js': tpl,
      })
      const state = yield debug()
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
      const state = yield debug()
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
      const state = yield debug()
      expect(state.inits).to.deep.equal({ always: 'ALWAYS' })
    })

    hit('always includes * specs', function*() {
      yield spec({ always: { '*': 'ALWAYS' } })
      yield init(0)
      const state = yield debug()
      expect(state.inits).to.deep.equal({ always: 'ALWAYS' })
    })

    hit('conditionnaly includes labeled specs', function*() {
      yield spec({ foo: { 0: 'FOO' }, bar: { 1: 'BAR' } })
      yield init(1)
      const state = yield debug()
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

    hit('conditionnaly includes labeled specs', function*() {
      yield spec({ foo: { 0: 'FOO' }, bar: { 1: 'BAR' } })
      yield change(0)
      expect(writeHmr).to.have.been.calledWith(_page, {
        foo: 'FOO',
        bar: change.rm,
      })
      yield change(1)
      expect(writeHmr).to.have.been.calledWith(_page, {
        foo: change.rm,
        bar: 'BAR',
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
        const { started } = yield debug()
        expect(started).to.be.false
      }
      yield page()
      {
        const { started } = yield debug()
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
        const { started } = yield debug()
        expect(started).to.be.false
      }
      yield page.$eval()
      {
        const { started } = yield debug()
        expect(started).to.be.true
      }
    })
  })
})
