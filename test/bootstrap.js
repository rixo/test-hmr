const path = require('path')

const { expect } = require('chai')

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

const startPuppeteer = () => {
  const puppeteer = require('puppeteer')

  // puppeteer options
  const opts = DEBUG
    ? {
        headless: false,
        slowMo: 100,
        timeout: 10000,
      }
    : {}

  // expose variables
  before(async function() {
    const browser = await puppeteer.launch(opts)
    setGlobals({ expect, browser, baseUrl })
  })

  // close browser and reset global variables
  after(async function() {
    await browser.close()
    restoreGlobals()
  })
}

const startWebpack = () => {
  const webpack = require('../app/node_modules/webpack')
  const WebpackDevServer = require('../app/node_modules/webpack-dev-server')
  const config = require('../app/webpack.config.js')
  const compiler = webpack(config)
  const server = new WebpackDevServer(compiler, {
    contentBase: path.join(__dirname, '..', 'app', 'public'),
    public: 'http://localhost:8080',
    publicPath: '/'
  })

  before(() => new Promise((resolve, reject) => {
    server.listen(PORT, HOST, function(err) {
      if (err) reject(err)
      else resolve()
    })
  }))

  after(() => {
    server.close()
  })
}

startWebpack()
startPuppeteer()
