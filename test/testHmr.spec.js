const escapeRegExp = require('lodash.escaperegexp')

const hit = require('./testHmr/hit')

const {
  templates,
  spec,
  init,
  $$debug,
  change,
  innerText,
  page,
  beforeLoad,
} = require('../lib/testHmr')

// _`foo` => /\s*foo\s*/
// _('foo', bar', 'baz') => /\s*foo\s*bar\s*baz\s*/
const _ = strings =>
  new RegExp('\\s*' + strings.map(escapeRegExp).join('\\s*') + '\\s*')

describe('test utils: testHmr', () => {
  let mock
  hit.beforeEach(m => {
    mock = m
  })

  hit("wraps mocha's it", function*() {
    expect(mock.it).to.have.been.calledOnce
  })

  hit('inits app after the first non-init effect', function*() {
    yield templates({})
    yield init({})
    expect(mock.reset).not.to.have.been.called
    expect(mock.loadPage).not.to.have.been.called
    yield innerText('*')
    expect(mock.reset).to.have.been.calledOnce
    expect(mock.loadPage).to.have.been.calledOnce
    expect(mock.writeHmr).not.to.have.been.called
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

  describe('yield beforeLoad(fn*)', () => {
    it('is a command function', () => {
      expect(beforeLoad).to.be.a('function')
    })

    hit('is exposed as this.beforeLoad', function*() {
      expect(this.beforeLoad).to.equal(beforeLoad)
    })

    hit('registers a beforeLoad hook sub', registersSub)

    describeE2e('e2e', () => {
      hit.browser('registers a beforeLoad hook sub', registersSub)
    })

    function* registersSub() {
      let pp
      const sub = sinon.fake(function*() {
        pp = yield page()
      })
      yield beforeLoad(sub)
      const p = yield page()
      expect(sub, 'beforeLoad').to.have.been.calledOnce
      expect(pp, 'yield page from beforeLoad').to.equal(p)
    }
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

    hit('parses beforeLoad hook', function*() {
      const sub = function*() {}
      yield spec`
        --- file.php ---
        * * *
        ${sub}
        ::0
      `
      const state = yield $$debug()
      expect(state.beforeLoad, 'state.beforeLoad').to.equal(sub)
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
        await mock.testHmr('kitchen sink', function*() {
          mock.page.$eval = sinon.fake(
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
        await mock.testHmr('kitchen sink', function*() {
          mock.page.$eval = sinon.fake(
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

      await mock.testHmr('kitchen sink', function*() {
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
      await mock.testHmr('kitchen sink', function*() {
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
      mock.page.$eval = sinon.fake(async () => 'html')
      await mock.testHmr('kitchen sink', function*() {
        yield this.spec.expect(0, 'html')
        yield this.spec.expect(0, sub)
        expect(fakeSub, 'sub').to.not.have.been.called
      })
      expect(fakeSub, 'sub').to.have.been.called
    })

    it('runs empty html expects', async () => {
      mock.page.$eval.return('')
      await mock.testHmr('runs empty html expects', function*() {
        yield spec.expect(0, '')
        const state = yield $$debug()
        expect(state).to.matchPattern({
          expects: new Map([['0', { steps: [{ html: _`` }] }]]),
        })
      })
      expect(mock.page.$eval).to.have.been.calledOnce
    })
  })

  describe('yield spec.expect(int, string)', () => {
    it('flushes remaining steps when generator returns', async () => {
      const after = sinon.fake(function* after() {})

      await mock.testHmr('kitchen sink', function*() {
        mock.page.$eval = sinon.fake(
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
      mock.page.$eval = sinon.fake(
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
      mock.page.$eval = sinon.fake(
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
      mock.page.$eval = sinon.fake(async () => results[i++])
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
      expect(mock.loadPage).not.to.have.been.called
      yield change({
        'main.js': 'foo',
      })
      expect(mock.loadPage).to.have.been.calledOnce
    })

    hit('writes new files and wait for HMR', function*() {
      expect(mock.writeHmr).not.to.have.been.called
      yield change({
        'main.js': 'foo',
        'App.svelte': 'bar',
      })
      expect(mock.writeHmr).to.have.been.calledOnce
    })

    hit('writes new files and wait on each call', function*() {
      expect(mock.writeHmr).not.to.have.been.called
      yield change({
        'main.js': 'foo',
      })
      expect(mock.writeHmr).to.have.been.calledOnce
      yield change({
        'App.svelte': 'bar',
      })
      expect(mock.writeHmr).to.have.been.calledTwice
    })
  })

  describe('yield change(spec)', () => {
    hit('always includes string specs', function*() {
      yield spec({ always: 'ALWAYS' })
      yield change(0)
      expect(mock.writeHmr).to.have.been.calledWith(mock.page, {
        always: 'ALWAYS',
      })
    })

    hit('always includes * specs', function*() {
      yield spec({ always: { '*': 'ALWAYS' } })
      yield change(0)
      expect(mock.writeHmr).to.have.been.calledWith(mock.page, {
        always: 'ALWAYS',
      })
      yield change(1)
      expect(mock.writeHmr).to.have.been.calledWith(mock.page, {
        always: 'ALWAYS',
      })
    })

    hit('only write files that have a matching condition label', function*() {
      yield spec({ foo: { 0: 'FOO', 1: 'foo' }, bar: { 1: 'BAR', 2: 'bar' } })
      yield change(0)
      expect(mock.writeHmr).to.have.been.calledWith(mock.page, {
        foo: 'FOO',
      })
      yield change(1)
      expect(mock.writeHmr).to.have.been.calledWith(mock.page, {
        foo: 'foo',
        bar: 'BAR',
      })
      yield change(2)
      expect(mock.writeHmr).to.have.been.calledWith(mock.page, {
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
      expect(p).to.equal(mock.page)
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
      expect(mock.page.$eval).to.have.been.calledOnce
    })

    hit('passes arguments to the proxied method', function*() {
      const a = {}
      const b = {}
      const c = {}
      yield page.$eval(a, b, c)
      expect(mock.page.$eval).to.have.been.calledWith(a, b, c)
    })

    hit('returns proxied method result', function*() {
      mock.page.$eval = sinon.fake(() => 'yep')
      const result = yield page.$eval()
      expect(result).to.equal('yep')
    })

    hit('await async results', function*() {
      mock.page.$eval = sinon.fake(async () => '... yep')
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
        expect(keyboard).to.equal(mock.page.keyboard)
      })

      it('crashes when calling an object instance with arguments', async () => {
        mock.page.keyboard = {}
        const result = mock.testHmr(function*() {
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
          expect(mock.page.keyboard.press).to.have.been.calledOnceWith(
            'Backspace'
          )
        }
      )
    })
  }) // yield page

  describe('testHmr`...`', () => {
    const runTest = wrapper => mock.testHmr('*under test*', null, null, wrapper)

    const commons = (runTest, mainTest) => {
      it('can be used as a template literal', async () => {
        mock.page.$eval = sinon.fake.returns('foo')
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
        expect(mainTest(), 'describe or it').to.have.been.calledWith('my spec')
      })

      it('marks tests with no assertions as skipped', async () => {
        const result = runTest(
          testHmr => testHmr`
            # my spec
          `
        )
        await expect(result).to.be.rejectedWith('no assertions')
      })
    }

    describe('config: { runSpecTagAsDescribe: false, describeByStep: false }', () => {
      const customizer = options => ({
        ...options,
        isRunSpecTagAsDescribe: () => false,
      })
      const runTest = wrapper =>
        mock.testHmr('*under test*', null, customizer, wrapper)

      commons(runTest, () => mock.it)

      it('registers single conditions with `it`', async () => {
        mock.page.$eval = sinon.fake(async () => '<h1>I am file</h1>')
        await runTest(
          testHmr => testHmr`
            # my spec
            ---- my-file ----
            <h1>I am file</h1>
            ****
            ::0 <h1>I am file</h1>
          `
        )
        expect(mock.it, 'it').to.have.been.calledOnceWith('my spec')
        expect(mock.page.$eval, 'page.$eval').to.have.been.calledOnce
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
        expect(mock.it).to.have.been.calledOnce
        // use `it` return value instead of runTest result, to ensure that
        // the error really did pass through the test handler (as opposed to
        // some kind of possible test artifact)
        expect(await mock.it.returnValues[0])
          .to.have.nested.property('error.message')
          .that.include('expected')
      })
    })

    describe('config: { runSpecTagAsDescribe: true, describeByStep: true }', () => {
      const customizer = options => ({
        ...options,
        isRunSpecTagAsDescribe: () => true,
        isDescribeByStep: () => true,
      })
      const runTest = wrapper =>
        mock.testHmr('*under test*', null, customizer, wrapper)

      commons(runTest, () => mock.describe)

      it('runs conditions with `describe`', async () => {
        mock.page.$eval.return('<h1>I am file</h1>', '<h1>I am still</h1>')
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
        expect(mock.describe, 'describe')
          .to.have.been.calledThrice //
          .and.calledWith('my spec')
          .and.calledWith('after update 0')
          .and.calledWith('after update 1')
        expect(mock.page.$eval, 'page.$eval').to.have.been.calledTwice
      })

      it('runs steps with `it`', async () => {
        mock.page.$eval.return('<h1>I am file</h1>', '<h2>I am still</h2>')
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
        expect(mock.describe, 'describe')
          .to.have.been.calledTwice //
          .and.calledWith('my spec')
          .and.calledWith('after update 0 (initial initialisation)')
        expect(mock.it, 'it')
          .to.have.been.calledThrice //
          .and.calledWith('step 0 (html)')
          .and.calledWith('step 1 (sub)')
          .and.calledWith('step 2 (html)')
        expect(mock.page.$eval, 'page.$eval').to.have.been.calledTwice
      })

      it('marks failed `it` steps as failure and skip subsequent steps', async () => {
        function* sub() {
          throw new Error('oops')
        }
        mock.page.$eval = sinon.fake.returns('I am file')
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
        expect(mock.describe.args, 'describe args').to.matchPattern([
          ['my spec', {}],
          ['after update 0 (init)', {}],
          ['after update 1 (crashes)', {}],
          ['after update 2 (skipped)', {}],
        ])
        expect(mock.it.args, 'it args').to.matchPattern([
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
        const results = await Promise.all(mock.it.returnValues)
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
        isRunSpecTagAsDescribe: () => true,
        isDescribeByStep: () => false,
      })
      const runTest = wrapper =>
        mock.testHmr('*under test*', null, customizer, wrapper)

      commons(runTest, () => mock.describe)

      it('registers single conditions with `it`', async () => {
        mock.page.$eval = sinon.fake(async () => '<h1>I am file</h1>')
        await runTest(
          testHmr => testHmr`
            # my spec
            ---- my-file ----
            <h1>I am file</h1>
            ****
            ::0 <h1>I am file</h1>
          `
        )
        expect(mock.it, 'it').to.have.been.calledOnceWith('my spec')
        expect(mock.page.$eval, 'page.$eval').to.have.been.calledOnce
      })

      it('runs conditions with `it`', async () => {
        mock.page.$eval.return('<h1>I am file</h1>', '<h1>I am still</h1>')
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
        expect(mock.describe, 'describe').to.have.been.calledOnceWith('my spec')
        expect(mock.it, 'it')
          .to.have.been.calledTwice //
          .and.calledWith('after update 0')
          .and.calledWith('after update 1')
        expect(mock.page.$eval, 'page.$eval').to.have.been.calledTwice
      })

      it('marks failed `it` cases as failure and skip subsequent cases', async () => {
        function* sub() {
          throw new Error('oops')
        }
        mock.page.$eval = sinon.fake.returns('I am file')
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
        expect(mock.describe, 'describe').to.have.been.calledOnceWith('my spec')
        expect(mock.it, 'it')
          .to.have.been.calledThrice //
          .and.calledWith('after update 0 (init)')
          .and.calledWith('after update 1 (crashes)')
          .and.calledWith('after update 2 (skipped)')
        // use `it` return value instead of runTest result, to ensure that
        // the error really did pass through the test handler (as opposed to
        // some kind of possible test artifact)
        const results = await Promise.all(mock.it.returnValues)
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
      mock.page.$eval = sinon.fake(async () => '<h1>I am file</h1>')
      await runTest(
        testHmr => testHmr`
          # my spec
          ---- my-file ----
          <h1>I am file</h1>
          ****
          ::0 <h1>I am file</h1>
        `
      )
      expect(mock.page.$eval, 'page.$eval').to.have.been.calledOnce
    })

    it('runs assertion steps', async () => {
      const sub = sinon.fake(function*() {})
      {
        const results = {
          0: '<h1>I am file</h1>',
          1: '<h2>I am step2</h2>',
        }
        let i = 0
        mock.page.$eval = sinon.fake(async () => results[i++])
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
      expect(mock.page.$eval, 'page.$eval').to.have.been.calledTwice
      expect(sub, 'sub').to.have.been.calledOnce
    })

    it('regiters first HMR case (cond) as init file set', async () => {
      const sub = sinon.fake(ensureInit)

      mock.page.$eval = sinon.fake.returns('i am phil')

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
