const {
  testHmr: { create: createTestHmr },
  templates,
  spec,
  init,
  debug,
  change,
  innerText,
} = require('../../test-utils/testHmr')

const noop = () => {}

describe('test utils: testHmr', () => {
  let _it
  let reset
  let writeHmr
  let page
  let loadPage
  let _testHmr

  beforeEach(() => {
    _it = null
    reset = sinon.fake()
    writeHmr = sinon.fake(async () => {})
    page = {
      $eval: sinon.fake(),
    }
    loadPage = sinon.fake(async (url, callback) => callback(page))
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
        ['0', 'before anything:\n expect#0\n after all'],
        ['1', 'before anything:\n expect#1\n after all'],
      ])
      expect(state.specs).to.deep.equal({
        file: {
          '*': lorem,
        },
      })
      yield spec.discard()
    })

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
      `)
      const fooAny = `
        top
        middle
        bottom
      `
      const foo0 = `
        top
        on 000
        middle
        bottom
      `
      const foo1 = `
        top
        middle
          function foo() { console.log('bar') }
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
  })

  describe('yield spec.expect(...)', () => {
    hit('accepts two args', function*() {
      yield spec.expect(0, '<p>foo</p>')
      yield spec.expect(1, 'Babar')
      const state = yield debug()
      expect([...state.expects]).to.deep.equal([
        ['0', '<p>foo</p>'],
        ['1', 'Babar'],
      ])
      yield spec.discard()
    })

    hit('accepts a single array arg', function*() {
      yield spec.expect([[0, '<p>foo</p>'], [1, 'Babar']])
      const state = yield debug()
      expect([...state.expects]).to.deep.equal([
        ['0', '<p>foo</p>'],
        ['1', 'Babar'],
      ])
      yield spec.discard()
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
        ['0', '<p>foo</p>'],
        ['1', 'Babar'],
      ])
      yield spec.discard()
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
        expect(state.remainingExpects).to.deep.equal([['0', '<p>foo</p>']])
      }
      yield spec.discard()
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
      const expects = {
        0: sinon.fake(),
        1: sinon.fake(),
        2: sinon.fake(),
        3: sinon.fake(),
      }
      yield spec.expect(0, expects[0])
      yield spec.expect(1, expects[1])
      yield spec.expect(2, expects[2])
      yield spec.expect(3, expects[3])

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
      const expects = {
        0: sinon.fake(),
        1: sinon.fake(),
        2: sinon.fake(),
        3: sinon.fake(),
      }

      await _testHmr('kitchen sink', function*() {
        yield spec.expect(0, expects[0])
        yield spec.expect(1, expects[1])
        yield spec.expect(2, expects[2])
        yield spec.expect(3, expects[3])

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

  describe.skip('yield spec.expect: string expectations', () => {
    hit.browser('matches full result content', function*() {
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
      yield spec.expect(
        0,
        `
          <h2>Kild: I am expected</h2>
        `
      )
    })

    hit.browser(
      'collapses white spaces between tags to match HTML',
      function*() {
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
      }
    )

    hit.browser('matches full result content in all conditions', function*() {
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
      expect(writeHmr).to.have.been.calledWith(page, { always: 'ALWAYS' })
    })

    hit('always includes * specs', function*() {
      yield spec({ always: { '*': 'ALWAYS' } })
      yield change(0)
      expect(writeHmr).to.have.been.calledWith(page, { always: 'ALWAYS' })
      yield change(1)
      expect(writeHmr).to.have.been.calledWith(page, { always: 'ALWAYS' })
    })

    hit('conditionnaly includes labeled specs', function*() {
      yield spec({ foo: { 0: 'FOO' }, bar: { 1: 'BAR' } })
      yield change(0)
      expect(writeHmr).to.have.been.calledWith(page, {
        foo: 'FOO',
        bar: change.rm,
      })
      yield change(1)
      expect(writeHmr).to.have.been.calledWith(page, {
        foo: change.rm,
        bar: 'BAR',
      })
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
})
