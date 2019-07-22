const hit = require('../hit')

const { change, spec } = require('./commands')

describe('command: change', () => {
  let mock

  hit.beforeEach(m => {
    mock = m
  })

  it('is a function', () => {
    expect(change).to.be.a('function')
  })

  hit('is exposed as this.change', function*() {
    expect(this.change).to.equal(change)
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
})
