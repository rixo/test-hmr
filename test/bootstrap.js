/* eslint-env mocha */
/* globals browser */

const { expect } = require('chai')
const puppeteer = require('puppeteer')

const { startWebpack } = require('../app/test-utils')

const { DEBUG } = process.env

const HOST = 'localhost'
const PORT = 8080

const baseUrl = `http://${HOST}:${PORT}`

// default: relaunch webpack dev server before each test
//
// fast: launch a single webpack dev server for all tests, and simply reset
//   source files (and do a full recompile of main.js entry point)
//
// fast is faster but may encounter stability issues... especially since it
// is not completely implemented yet
//
const resetStrategy = 'fast'
// const resetStrategy = 'stable'

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
        // slowMo: 200,
        timeout: 10000,
        devtools: true,
      }
    : {}
  return await puppeteer.launch(opts)
}

const defaultResetHandler = () => {
  let closeWebpack

  before(async () => {
    const [close, browser] = await Promise.all([
      startWebpack(),
      startPuppeteer(),
    ])
    if (close) {
      closeWebpack = () => {
        closeWebpack = null
        return close().catch(err => {
          // eslint-disable-next-line no-console
          console.warn('Failed to close webpack dev server', err)
        })
      }
    }
    setGlobals({ baseUrl, expect, browser })
  })

  after(async () => {
    const ops = [browser.close()]
    if (closeWebpack) {
      ops.push(closeWebpack())
    }
    await Promise.all(ops)
    if (closeWebpack) {
      restoreGlobals()
    }
  })
}

const fastResetHandler = () => {
  before(async () => {
    const browser = await startPuppeteer()
    setGlobals({ baseUrl, expect, browser })
  })

  after(async () => {
    await browser.close()
    restoreGlobals()
  })

  {
    let rc
    before(async () => {
      rc = await startWebpack()
    })
    after(() => {
      if (rc) {
        return rc.close().catch(err => {
          // eslint-disable-next-line no-console
          console.warn('Failed to close webpack dev server', err)
        })
      }
    })
    beforeEach(async () => {
      // eslint-disable-next-line no-unused-expressions
      expect(rc).not.to.be.undefined
      await rc.reset()
    })
  }
}

const resetHandler =
  resetStrategy === 'fast' ? fastResetHandler : defaultResetHandler

resetHandler()
