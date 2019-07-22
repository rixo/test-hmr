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
