const webpack = require('webpack')
const WebpackDevServer = require('webpack-dev-server')

const webpackConfig = require(`./webpack.config.js`)

const testServer = require('../lib/test-server')

module.exports = testServer({
  webpack,
  webpackConfig,
  WebpackDevServer,
  appPath: __dirname,
})
