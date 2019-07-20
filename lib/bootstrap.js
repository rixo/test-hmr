const chai = require('chai')
const sinon = require('sinon')
const puppeteer = require('puppeteer')
const debug = require('debug')('test-hmr:bootstrap')

const testServer = require('./test-server')
const testHmr = require('./testHmr')
const config = require('./config')

const { expect } = chai

const { fastResetStrategy, keepRunning } = config

const { OPEN } = process.env

const originalGlobals = {}

chai.use(require('sinon-chai'))
chai.use(require('chai-as-promised'))
chai.use(require('./chai-match-pattern'))

const setGlobals = values => {
  Object.entries(values).forEach(([key, value]) => {
    originalGlobals[key] = global[key]
    global[key] = value
  })
}

const restoreGlobals = () => {
  let entries = Object.entries(originalGlobals)
  if (keepRunning) {
    entries = entries.filter(([key]) => key !== 'app' && key !== 'browser')
  }
  entries.forEach(([key, value]) => {
    global[key] = value
  })
}

function initSelfTests() {
  let describeE2e = describe
  if (config.e2e == 0) {
    const noop = () => {}
    Object.assign(noop, {
      skip: noop,
      only: noop,
    })
    describeE2e = noop
  } else if (config.e2e === 'skip') {
    describeE2e = describe.skip
  }
  setGlobals({
    describeE2e,
  })
}

const startPuppeteer = async () => {
  // puppeteer options
  const opts = OPEN
    ? {
        headless: false,
        slowMo: 100,
        timeout: 10000,
        devtools: true,
      }
    : {}
  return await puppeteer.launch(opts)
}

function setupPuppeteer() {
  debug('setupPuppeteer')
  let browser
  before(async () => {
    debug('setupPuppeteer: before')
    if (keepRunning && global.browser) {
      // eslint-disable-next-line no-console
      console.debug('[HMR Test]', 'Reusing existing puppeteer')
    } else {
      browser = await startPuppeteer()
      setGlobals({ browser })
    }
  })
  after(async () => {
    debug('setupPuppeteer: after')
    // guard: option keep running
    if (keepRunning) return
    // guard: no browser
    if (!browser) return
    await browser.close()
  })
}

const setupDefaultWebpack = ({ startWebpack }) => () => {
  debug('setupDefaultWebpack')
  let app
  beforeEach(async () => {
    debug('setupDefaultWebpack: beforeEach')
    app = await startWebpack()
    setGlobals({ app })
  })
  afterEach(async () => {
    debug('setupDefaultWebpack: afterEach', app)
    if (app) {
      await app.close().catch(err => {
        // eslint-disable-next-line no-console
        console.warn('Failed to close webpack dev server', err)
      })
    }
  })
}

const setupFastWebpack = ({ startWebpack }) => () => {
  debug('setupFastWebpack')
  let app
  before(async () => {
    debug('setupFastWebpack: before')
    if (keepRunning && global.app) {
      // eslint-disable-next-line no-console
      console.debug('[HMR Test]', 'Reusing existing webpack')
    } else {
      app = await startWebpack()
      setGlobals({ app })
    }
  })
  after(async () => {
    debug('setupFastWebpack: after')
    // guard: option keep running
    if (keepRunning) return
    // guard: no app
    if (!app) return
    await app.close().catch(err => {
      // eslint-disable-next-line no-console
      console.warn('Failed to close webpack dev server', err)
    })
  })
}

// this is useful to run a "debug pass": display debug info about a test,
// and skip every test
const setupBailOut = () => {
  let bailed = false
  before(function() {
    if (bailed) {
      this.skip()
    }
  })
  const cancelRunningTests = () => {
    bailed = true
  }
  setGlobals({ cancelRunningTests })
}

module.exports = ({ app = config.appPath }) => {
  debug('boostrap', app)

  after(restoreGlobals)

  setGlobals({ expect, sinon, testHmr })

  initSelfTests()

  setupBailOut()

  if (config.e2e != 0 && config.e2e !== 'skip') {
    const server = testServer(app)

    const setupWebpackFactory = fastResetStrategy
      ? setupFastWebpack
      : setupDefaultWebpack

    const setupWebpack = setupWebpackFactory(server)

    setupWebpack()

    setupPuppeteer()
  }
}
