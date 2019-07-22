const hit = require('../hit')

const { innerText, $$debug } = require('./commands')

describe('command: innerText', () => {
  let mock

  hit.beforeEach(m => {
    mock = m
  })

  it('is a function', () => {
    expect(innerText).to.be.a('function')
  })

  hit('is exposed as this.innerText', function*() {
    expect(this.innerText).to.equal(innerText)
  })

  describe('yield innerText("selector")', () => {
    hit('returns the innerText instance', function*() {
      mock.page.$eval.return('foo')
      const text = yield innerText('h1')
      expect(text, 'text').to.equal('foo')
    })

    hit('calls page.$eval with the passed selector', function*() {
      mock.page.$eval.return('foo')
      yield innerText('h1')
      expect(mock.page.$eval, 'page.$eval').to.have.been.calledOnce
      expect(mock.page.$eval.args[0][0], 'page.$eval( $ )').to.equal('h1')
    })

    hit('triggers init', function*() {
      {
        const { started } = yield $$debug()
        expect(started, 'started').to.be.false
      }
      yield innerText()
      {
        const { started } = yield $$debug()
        expect(started, 'started').to.be.true
      }
    })
  })
})
