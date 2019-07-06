/* eslint-env node, mocha */

const path = require('path')

const webpack = require('webpack')
const WebpackDevServer = require('webpack-dev-server')

const config = require(`../webpack.config.js`)

const virtualFs = require('./virtual-fs')
const RemoteControl = require('./rc-middleware')

// --- Config ---

const APP = path.join(__dirname, '..')
const SRC = path.join(APP, 'src')

const PORT = 8080
const HOST = 'localhost'
const PROTOCOL = 'http'

const createOnEmit = compiler => {
  const listeners = []

  compiler.hooks.afterEmit.tap('svelte HMR test suite', () => {
    while (listeners.length > 0) {
      const listener = listeners.shift()
      listener()
    }
  })

  const onEmit = () =>
    new Promise(resolve => {
      listeners.push(resolve)
    })

  return onEmit
}

// --- HMR control server ---

const start = () =>
  new Promise((resolve, reject) => {
    const compiler = webpack(config)

    const vfs = virtualFs({
      srcDir: SRC,
    })

    compiler.inputFileSystem = vfs
    compiler.outputFileSystem = vfs.out
    compiler.watchFileSystem = vfs

    const onEmit = createOnEmit(compiler)

    const server = new WebpackDevServer(compiler, {
      contentBase: path.join(APP, 'public'),
      public: `${PROTOCOL}://${HOST}:${PORT}`,
      publicPath: '/',
      inline: true,
      hot: true,
      stats: 'errors-warnings',
      quiet: true,
      before: app => {
        app.use(
          RemoteControl({
            root: APP,
            vfs,
            onEmit,
          })
        )
      },
    })

    const reset = async () => {
      await vfs.reset()
      return onEmit()
    }

    server.listen(PORT, HOST, function(err) {
      if (err) reject(err)
      else {
        const close = () => {
          server.close()
          return Promise.resolve()
        }
        resolve({
          close,
          reset,
        })
      }
    })
  })

module.exports = start
