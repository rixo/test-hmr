const hit = require('../hit')

const {
  commands: { wait },
} = require('@/lib/testHmr/commands')

describe('command: wait', () => {
  let mock

  hit.beforeEach(m => {
    mock = m
  })

  beforeEach(() => {
    wait.setTimeout = sinon.fake(setImmediate)
  })
  afterEach(() => {
    delete wait.setTimeout
  })

  it('is a function', () => {
    expect(wait).to.be.a('function')
  })

  hit('is exposed as this.wait', function*() {
    expect(this.wait).to.equal(wait)
  })

  describe('yield wait(num)', () => {
    hit('waits for the given amount of ms', function*() {
      expect(wait.setTimeout).to.not.have.been.called
      yield wait(42)
      expect(wait.setTimeout).to.have.been.calledOnce
      expect(wait.setTimeout.args[0][1]).to.equal(42)
    })
  })

  describe('yield wait(promise)', () => {
    hit('wait for the promise resolution', function*() {
      let resolved = false
      const promise = new Promise(resolve => {
        setImmediate(() => {
          resolved = true
          resolve()
        })
      })
      expect(resolved, 'resolved').to.be.false
      yield wait(promise)
      expect(resolved, 'resolved').to.be.true
    })

    it('throws on promise rejection', async () => {
      let afterWait = false
      const result = mock.testHmr(function*() {
        let resolved = false
        const promise = new Promise((resolve, reject) => {
          setImmediate(() => {
            resolved = true
            reject(new Error('oops'))
          })
        })
        expect(resolved, 'resolved').to.be.false
        yield wait(promise)
        afterWait = true
      })
      await expect(result, 'testHmr result').to.be.rejectedWith('oops')
      expect(afterWait, 'afterWait').to.be.false
    })
  })
})
