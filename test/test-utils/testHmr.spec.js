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

describe.only('test utils: testHmr', () => {
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
    _testHmr = (title, handler) =>
      new Promise((resolve, reject) => {
        _it = sinon.fake(function(desc, handler) {
          return handler
            .call({ slow: noop })
            .then(resolve)
            .catch(reject)
        })
        const testHmr = createTestHmr({
          it: _it,
          reset,
          writeHmr,
          loadPage,
        })
        return testHmr(title, handler)
      })
  })

  // h[mr, ]it...
  const hit = (title, handler, _it = it) =>
    _it(title, () => {
      return _testHmr(title, handler)
    })
  hit.only = (title, handler) => hit(title, handler, it.only)
  hit.skip = (title, handler) => hit(title, handler, it.skip)

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
    hit('registers full specs', function*() {
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
