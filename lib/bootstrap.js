const chai = require('chai')
const sinon = require('sinon')
const puppeteer = require('puppeteer')
const debug = require('debug')('test-hmr:bootstrap')

const testServer = require('./test-server')
const testHmr = require('./testHmr')
const config = require('./config')

chai.use(require('sinon-chai'))
chai.use(require('chai-as-promised'))
chai.use(require('./chai-match-pattern'))

const { expect } = chai

const originalGlobals = {}

const setGlobals = values => {
  Object.entries(values).forEach(([key, value]) => {
    originalGlobals[key] = global[key]
    global[key] = value
  })
}

const restoreGlobals = () => {
  Object.entries(originalGlobals).forEach(([key, value]) => {
    global[key] = value
  })
}

function initSelfTests({ e2e }) {
  let describeE2e = describe
  if (e2e == 0) {
    const noop = () => {}
    Object.assign(noop, {
      skip: noop,
      only: noop,
    })
    describeE2e = noop
  } else if (e2e === 'skip') {
    describeE2e = describe.skip
  }
  setGlobals({
    describeE2e,
  })
}

const startPuppeteer = async ({ open }) => {
  debug('startPuppeteer')
  // puppeteer options
  const opts = open
    ? {
        headless: false,
        slowMo: 100,
        devtools: true,
      }
    : {}
  return await puppeteer.launch(opts)
}

function setupPuppeteer(config) {
  debug('setupPuppeteer')
  const { keepRunning } = config
  let browser
  before(async () => {
    const reuse = Boolean(keepRunning && global.browser)
    debug('setupPuppeteer: before', reuse)
    if (reuse) {
      // eslint-disable-next-line no-console
      console.debug('[HMR Test]', 'Reusing existing puppeteer')
    } else {
      browser = await startPuppeteer(config)
      if (keepRunning) {
        global.browser = browser
      } else {
        setGlobals({ browser })
      }
    }
  })
  after(async () => {
    debug('setupPuppeteer: after', keepRunning)
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

const setupFastWebpack = ({ startWebpack }, { keepRunning }) => () => {
  debug('setupFastWebpack')
  let app
  before(async () => {
    const reuse = Boolean(keepRunning && global.app)
    debug('setupFastWebpack: before', reuse)
    if (reuse) {
      // eslint-disable-next-line no-console
      console.debug('[HMR Test]', 'Reusing existing webpack')
    } else {
      app = await startWebpack()
      if (keepRunning) {
        global.app = app
      } else {
        setGlobals({ app })
      }
    }
  })
  after(async () => {
    debug('setupFastWebpack: after', keepRunning)
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

// WARNING testHmr must always be present (because we can have no guarantee
//   that our bootstrap function will be called before any random describe
//   with a testHmr inside).
//
// NOTE this works because this bootstrap.js file is required by the
//   package's index.js, and it is a requirement of us to run mocha with
//   `--require test-hmr`.
//
Object.assign(global, { testHmr })

module.exports = ({ appPath = config.appPath } = {}) => {
  debug('boostrap', appPath, config)

  const { fastResetStrategy, e2e } = config

  // eslint-disable-next-line no-console
  console.info(`[HMR Test] Running app: ${appPath}`)

  setGlobals({ expect, sinon })

  after(restoreGlobals)

  initSelfTests(config)

  setupBailOut()

  if (e2e != 0 && e2e !== 'skip') {
    const server = testServer(appPath)

    const setupWebpackFactory = fastResetStrategy
      ? setupFastWebpack
      : setupDefaultWebpack

    const setupWebpack = setupWebpackFactory(server, config)

    setupWebpack()

    setupPuppeteer(config)
  }
}
