const hit = require('../hit')

const { init, $$debug, spec } = require('./commands')

describe('command: init', () => {
  hit.beforeEach()

  it('is a function', () => {
    expect(init).to.be.a('function')
  })

  hit('is exposed as this.init', function*() {
    expect(this.init).to.equal(init)
  })

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
})
