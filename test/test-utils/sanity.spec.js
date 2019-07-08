const fetch = require('node-fetch')

const {
  reset,
  inPage,
  innerText,
  writeFiles,
  hmrDone,
} = require('../../test-utils')
const config = require('../../test-utils/config')

describe('test utils: sanity check', () => {
  it('runs tests', () => {
    expect(true).to.be.true
  })

  it('can access puppeteer', async () => {
    const version = await browser.version()
    expect(version).not.to.be.undefined
  })

  if (config.rcOverHttp) {
    it('can reach webpack rc server', async () => {
      const res = await fetch('http://localhost:8080/_dev/ping')
      expect(res.ok).to.be.true
      expect(res.status).to.equal(200)
      expect(await res.text()).to.equal('pong')
    })
  }

  describe('remote control', function() {
    this.slow(1000)

    beforeEach(reset)

    it(
      'can load app',
      inPage('/', async page => {
        expect(await innerText(page, 'h1')).to.equal('Hello world!')
      })
    )

    it(
      'can trigger HMR',
      inPage('/', async page => {
        expect(await innerText(page, 'h1')).to.equal('Hello world!')

        await writeFiles({
          'App.svelte': '<h1>HMRd</h1>',
        })

        await hmrDone(page)

        expect(await innerText(page, 'h1')).to.equal('HMRd')
      })
    )

    it(
      'can reset source files',
      inPage('/', async page => {
        expect(await innerText(page, 'h1')).to.equal('Hello world!')
      })
    )
  })
})
