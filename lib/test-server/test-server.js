/* eslint-env node, mocha */

const path = require('path')

const virtualFs = require('./virtual-fs')
const RemoteControl = require('./rc-middleware')

// --- Config ---

const PORT = 8080
const HOST = 'localhost'
const PROTOCOL = 'http'

const baseUrl = `${PROTOCOL}://${HOST}:${PORT}`

// --- HMR control server ---

const asyncNoop = async () => {}

const emitWatcher = compiler => {
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

const start = async ({
  webpack,
  webpackConfig,
  WebpackDevServer,
  appPath,
  srcPath = path.join(appPath, 'src'),
}) => {
  const compiler = webpack(webpackConfig)

  const vfs = virtualFs({
    srcDir: srcPath,
  })

  compiler.inputFileSystem = vfs
  compiler.outputFileSystem = vfs.out
  compiler.watchFileSystem = vfs

  const onEmit = emitWatcher(compiler)

  const inSrc = file =>
    file ? path.join(appPath, 'src', file) : path.join(appPath, 'src')

  const writeFile = (filePath, contents) => {
    const srcPath = inSrc(filePath)
    if (contents && contents.rm) {
      // TODO implment delete (not easy with current virtual fs layout)
      return Promise.resolve(srcPath)
    } else {
      return new Promise((resolve, reject) => {
        vfs.out.mkdirpSync(path.dirname(srcPath))
        vfs.out.writeFile(srcPath, contents, 'utf8', err => {
          if (err) reject(err)
          else resolve(srcPath)
        })
      })
    }
  }

  const writeFiles = async files => {
    const paths = await Promise.all(
      Object.entries(files).map(([path, contents]) => writeFile(path, contents))
    )
    await Promise.all([onEmit(), vfs.notify(paths)])
  }

  const reset = files => Promise.all([onEmit(), vfs.reset(files)])

  const server = new WebpackDevServer(compiler, {
    contentBase: path.join(appPath, 'public'),
    public: baseUrl,
    publicPath: '/',
    inline: true,
    hot: true,
    stats: {
      maxModules: 50,
      reasons: true,
    },
    quiet: true,
    before: app => {
      app.use(
        RemoteControl({
          writeFiles,
          reset,
        })
      )
    },
  })

  let close = async () => {
    await server.close()
    close = asyncNoop
  }

  const listen = () =>
    new Promise((resolve, reject) => {
      server.listen(PORT, HOST, function(err) {
        if (err) reject(err)
        else resolve()
      })
    })

  await Promise.all([onEmit(), listen()])

  return {
    baseUrl,
    close,
    reset,
    writeFiles,
  }
}

const init = options => {
  const startWebpack = () => start(options)
  return {
    startWebpack,
  }
}

module.exports = init
