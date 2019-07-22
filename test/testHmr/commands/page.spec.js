const hit = require('../hit')

const { page, $$debug } = require('./commands')

describe('command: page', () => {
  let mock

  hit.beforeEach(m => {
    mock = m
  })

  it('is a function', () => {
    expect(page).to.be.a('function')
  })

  hit('is exposed as this.page', function*() {
    expect(this.page).to.equal(page)
  })

  describe('yield page()', () => {
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
})
