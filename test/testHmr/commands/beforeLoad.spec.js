const hit = require('../hit')

const { beforeLoad, page } = require('./commands')

describe('command: beforeLoad', () => {
  hit.beforeEach()

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
})
