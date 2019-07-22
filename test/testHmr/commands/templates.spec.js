const hit = require('../hit')

const { templates, $$debug, innerText } = require('./commands')

describe('command: templates', () => {
  hit.beforeEach()

  it('is a function', () => {
    expect(templates).to.be.a('function')
  })

  hit('is exposed as this.templates', function*() {
    expect(this.templates).to.equal(templates)
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
})
