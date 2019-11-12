const chai = require('chai')
const sinon = require('sinon')
const puppeteer = require('puppeteer')
const fs = require('fs')
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

const startPuppeteer = async ({ open, userDataDir }) => {
  debug('startPuppeteer')
  // puppeteer options
  const opts = open
    ? {
        headless: false,
        slowMo: 100,
        devtools: true,
        userDataDir,
      }
    : {}
  return await puppeteer.launch(opts)
}

const wait = duration => new Promise(resolve => setTimeout(resolve, duration))

function setupPuppeteer(config) {
  debug('setupPuppeteer')
  const { keepRunning, keepOpen } = config
  let browser
  if (keepRunning) {
    const ensureBrowser = ({ log = true } = {}) => async () => {
      debug('setupPuppeteer: ensureBrowser (keepRunning)')
      await wait(10) // helps with not having closed pptr WS with nollup
      const reuse = Boolean(
        keepRunning && global.browser && global.browser.isConnected()
      )
      debug('setupPuppeteer (keepRunning): before', reuse)
      if (reuse) {
        if (log) {
          // eslint-disable-next-line no-console
          console.debug('[Test HMR]', 'Reusing existing puppeteer')
        }
      } else {
        browser = await startPuppeteer(config)
        global.browser = browser
        browser.on('disconnected', () => {
          delete global.browser
        })
      }
    }
    before(ensureBrowser())
    beforeEach(ensureBrowser({ log: false }))
  } else {
    const ensureBrowser = () => async () => {
      debug('setupPuppeteer: ensureBrowser (!keepRunning)')
      await wait(10) // helps with not having closed pptr WS with nollup
      if (browser && browser.isConnected()) return
      browser = await startPuppeteer(config)
      browser.on('disconnected', () => {
        browser = null
      })
      setGlobals({ browser })
    }
    before(ensureBrowser())
    beforeEach(ensureBrowser())
    after(async () => {
      debug('setupPuppeteer: after', keepRunning)
      // guard: no browser
      if (!browser) return
      if (keepOpen) return
      await browser.close()
    })
  }
}

const setupTestServerDefault = ({ start }, { keepOpen }) => () => {
  debug('setupDefault')
  let app
  beforeEach(async () => {
    debug('setupDefault: beforeEach')
    app = await start()
    setGlobals({ app })
  })
  afterEach(async () => {
    debug('setupDefault: afterEach', app)
    if (app) {
      await app.close().catch(err => {
        // eslint-disable-next-line no-console
        console.warn('Failed to close webpack dev server', err)
      })
    }
  })
  after(() => {
    if (keepOpen) {
      // eslint-disable-next-line no-console
      console.warn('[Test HMR] Cannot keep running with restart strategy')
    }
  })
}

// keepRunning: keep server running between full watch runs
// keepOpen: keep puppeteer open & server running after run
const setupTestServerFast = ({ start }, { keepRunning, keepOpen }) => () => {
  debug('setupTestServerFast')
  let app
  before(async () => {
    const reuse = Boolean(keepRunning && global.app)
    debug('setupTestServerFast: before', reuse)
    if (reuse) {
      // eslint-disable-next-line no-console
      console.debug('[Test HMR]', 'Reusing existing test server')
    } else {
      app = await start()
      if (keepRunning) {
        global.app = app
      } else {
        setGlobals({ app })
      }
    }
  })
  after(async () => {
    debug('setupTestServerFast: after', keepRunning)
    // guard: option keep running
    if (keepRunning) return
    // guard: can't keep
    if (keepOpen) return
    // guard: no app
    if (!app) return
    await app.close().catch(err => {
      // eslint-disable-next-line no-console
      console.warn('Failed to close test server', err)
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

  const { fastResetStrategy, e2e, nollup, keepOpen } = config

  if (fs.existsSync(appPath)) {
    // eslint-disable-next-line no-console
    console.info(`[Test HMR] Running app: ${appPath}`)
  } else {
    // eslint-disable-next-line no-console
    console.info('[Test HMR] No target app: e2e tests will be skipped')
  }

  setGlobals({ expect, sinon })

  after(restoreGlobals)

  initSelfTests(config)

  setupBailOut()

  if (e2e != 0 && e2e !== 'skip') {
    const server = testServer({
      appPath,
      quiet: !config.logs,
      nollup,
      keepOpen,
    })

    debug('test server defaultConfig: %o', server.defaultConfig)
    if (server.defaultConfig) {
      Object.assign(config, server.defaultConfig)
    }

    const setupTestServerFactory = fastResetStrategy
      ? setupTestServerFast
      : setupTestServerDefault

    const setupTestServer = setupTestServerFactory(server, config)

    setupTestServer()

    setupPuppeteer(config)
  }
}
