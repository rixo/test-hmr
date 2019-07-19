const chai = require('chai')
const sinon = require('sinon')
const puppeteer = require('puppeteer')

const testServer = require('./test-server')
const testHmr = require('./testHmr')
const config = require('./config')

const { expect } = chai

const { fastResetStrategy, keepRunning } = config

const { DEBUG } = process.env

const originalGlobals = {}

const { startWebpack } = testServer(config.appPath)

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
  const opts = DEBUG
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
  let browser
  before(async () => {
    if (keepRunning && global.browser) {
      // eslint-disable-next-line no-console
      console.debug('[HMR Test]', 'Reusing existing puppeteer')
    } else {
      browser = await startPuppeteer()
      setGlobals({ browser })
    }
  })
  after(async () => {
    // guard: option keep running
    if (keepRunning) return
    // guard: no browser
    if (!browser) return
    await browser.close()
  })
}

const setupDefaultWebpack = () => {
  let app
  beforeEach(async () => {
    app = await startWebpack()
    setGlobals({ app })
  })
  afterEach(async () => {
    if (app) {
      await app.close().catch(err => {
        // eslint-disable-next-line no-console
        console.warn('Failed to close webpack dev server', err)
      })
    }
  })
}

const setupFastWebpack = () => {
  let app
  before(async () => {
    if (keepRunning && global.app) {
      // eslint-disable-next-line no-console
      console.debug('[HMR Test]', 'Reusing existing webpack')
    } else {
      app = await startWebpack()
      setGlobals({ app })
    }
  })
  after(async () => {
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

const setupWebpack = fastResetStrategy ? setupFastWebpack : setupDefaultWebpack

after(restoreGlobals)

setGlobals({ expect, sinon, testHmr })

initSelfTests()

setupBailOut()

if (config.e2e != 0 && config.e2e !== 'skip') {
  setupWebpack()
  setupPuppeteer()
}
