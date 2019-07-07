const { expect } = require('chai')
const puppeteer = require('puppeteer')

const { startWebpack } = require('../app/test-utils')

const { fastResetStrategy } = require('./utils/config')

const { DEBUG } = process.env

const HOST = 'localhost'
const PORT = 8080

const baseUrl = `http://${HOST}:${PORT}`

const globalVariables = {}

const setGlobals = values => {
  Object.entries(values).forEach(([key, value]) => {
    globalVariables[key] = global[key]
    global[key] = value
  })
}

const restoreGlobals = () => {
  Object.entries(globalVariables).forEach(([key, value]) => {
    global[key] = value
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
  before(async () => {
    const browser = await startPuppeteer()
    setGlobals({ browser })
  })
  after(async () => {
    await browser.close()
    restoreGlobals()
  })
}

const setupDefaultWebpack = () => {
  let app
  beforeEach(async () => {
    app = await startWebpack()
    setGlobals({ app })
  })
  afterEach(() => {
    if (app) {
      return app.close().catch(err => {
        // eslint-disable-next-line no-console
        console.warn('Failed to close webpack dev server', err)
      })
    }
  })
}

const setupFastWebpack = () => {
  let app

  before(async () => {
    app = await startWebpack()
    setGlobals({ app })
  })

  after(() => {
    if (app) {
      return app.close().catch(err => {
        // eslint-disable-next-line no-console
        console.warn('Failed to close webpack dev server', err)
      })
    }
  })
}

const setupWebpack = fastResetStrategy ? setupFastWebpack : setupDefaultWebpack

setGlobals({ baseUrl, expect })
setupWebpack()
setupPuppeteer()
