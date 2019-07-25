const escapeRegExp = require('lodash.escaperegexp')

const hit = require('../hit')

const { spec, init, change, innerText, $$debug } = require('./commands')

// _`foo` => /\s*foo\s*/
// _('foo', bar', 'baz') => /\s*foo\s*bar\s*baz\s*/
const _ = strings =>
  new RegExp('\\s*' + strings.map(escapeRegExp).join('\\s*') + '\\s*')

describe('command: spec.expect', () => {
  let mock

  hit.beforeEach(m => {
    mock = m
  })

  it('is a function', () => {
    expect(spec.expect).to.be.a('function')
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

    hit('matches ^ regexes', function*() {
      mock.page.$eval.return('I AM CAPITAL')
      yield spec.expect(0, ['I', /^am/i, 'CAPITAL'])
    })

    hit('matches ^ regexes with no space', function*() {
      mock.page.$eval.return('IAM CAPITAL')
      yield spec.expect(0, ['I', /^am/i, 'CAPITAL'])
    })

    hit('matches ^ regexes with lot of space', function*() {
      mock.page.$eval.return('   I   AM  CAPITAL   ')
      yield spec.expect(0, ['I', /^am/i, 'CAPITAL'])
    })

    hit('matches unanchored regexes', function*() {
      mock.page.$eval.return('I <AM a bad tag> CAPITAL')
      yield spec.expect(0, ['I', /[^>]>/i, 'CAPITAL'])
    })

    hit('matches unanchored regexes with no space', function*() {
      mock.page.$eval.return('I<AM a bad tag>CAPITAL')
      yield spec.expect(0, ['I', /[^>]>/i, 'CAPITAL'])
    })

    hit('matches unanchored regexes with lot of space', function*() {
      mock.page.$eval.return('I<AM a bad tag>CAPITAL')
      yield spec.expect(0, ['I', /[^>]>/i, 'CAPITAL'])
    })
  })

  describe('yield spec.expect(int, string)', () => {
    it('flushes remaining steps when generator returns', async () => {
      const after = sinon.fake(function* after() {})

      await mock.testHmr('kitchen sink', function*() {
        mock.page.$eval.return(`
          <h2>Kild: I am expected</h2><!--<Child>--><!--<App>-->
        `)
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
      mock.page.$eval.return(`
        <h2>Kild: I am expected</h2><!--<Child>--><!--<App>-->
      `)
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
      mock.page.$eval.return(`
        <h1>I  am  title</h1>
        <p>
          I'm&nbsp;&nbsp;   paragraph <span>I am   spanning</span>
        </p>
        <!--<App>-->
      `)
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
      mock.page.$eval.return(
        `
          <h2>Kild: I am expected</h2><!--<Child>--><!--<App>-->
        `,
        `
          <h1>I am Kild</h1><!--<Child>--><!--<App>-->
        `,
        `
          <h1>I am Kild</h1><!--<Child>--> <p>oooO   oOoo</p><!--<App>-->
        `
      )
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

    hit('accepts regexes in arrays', function*() {
      yield spec.expect(0, ['I', /am/, 'expected'])
      const state = yield $$debug()
      expect(state).to.matchPattern({
        expects: new Map([
          [
            '0',
            {
              steps: [
                {
                  html: ['I', '/am/', 'expected'],
                },
              ],
            },
          ],
        ]),
      })
      expect(state.expects.get('0').steps[0].html[1]).to.be.instanceOf(RegExp)
      yield spec.$$discard()
    })

    hit('accepts regexes', function*() {
      yield spec.expect(0, /am/)
      const state = yield $$debug()
      expect(state).to.matchPattern({
        expects: new Map([
          [
            '0',
            {
              steps: [
                {
                  html: ['/am/'],
                },
              ],
            },
          ],
        ]),
      })
      expect(state.expects.get('0').steps[0].html[0]).to.be.instanceOf(RegExp)
      yield spec.$$discard()
    })
  }) // yield spec.expect(int, string)
})
