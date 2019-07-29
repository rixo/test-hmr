const hit = require('./hit')

const { init, spec } = require('./commands/commands')

describeE2e('config.console', () => {
  let mock
  hit.beforeEach(m => {
    mock = m
  })

  let cons
  beforeEach(() => {
    cons = {
      log: sinon.fake(),
      error: sinon.fake(),
      warn: sinon.fake(),
    }
    mock.customizer = hit.customizer.browser({ console: cons })
  })

  it('outputs browser console logs to terminal with LOG prefix', async () => {
    await mock.testHmr(function*() {
      yield spec(`
        --- main.js ---
        console.log('prout')
      `)
      yield init(0)
      yield spec.$$flush()
    })
    expect(cons.log).to.have.been.calledWith('[console:LOG] prout')
  })

  it('fails test on unexpected console warning and logs to terminal with WRN prefix', async () => {
    const result = mock.testHmr(function*() {
      yield spec(`
        --- main.js ---
        console.warn('attention!')
      `)
      yield init(0)
      yield spec.$$flush()
    })
    await expect(result).to.be.rejectedWith('warning')
    expect(cons.log).to.have.been.calledWith('[console:WRN] attention!')
  })

  it('fails test on unexpected console error and logs to terminal with ERR prefix', async () => {
    const result = mock.testHmr(function*() {
      yield spec(`
        --- main.js ---
        console.error('oops')
      `)
      yield init(0)
      yield spec.$$flush()
    })
    await expect(result).to.be.rejectedWith('error')
    expect(cons.log).to.have.been.calledWith('[console:ERR] oops')
  })
})
