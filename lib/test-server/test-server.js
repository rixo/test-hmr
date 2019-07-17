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

  // all hooks: https://webpack.js.org/api/compiler-hooks/
  compiler.hooks.afterEmit.tap('svelte HMR test suite', compilation => {
    while (listeners.length > 0) {
      const listener = listeners.shift()
      listener(compilation)
    }
  })

  const onEmit = () =>
    new Promise(resolve => {
      listeners.push(resolve)
    })

  return onEmit
}

const resolveArgs = arg => (typeof arg === 'string' ? { appPath: arg } : arg)

const start = async arg => {
  const {
    appPath,
    srcPath = path.join(appPath, 'src'),
    webpack = require(`${appPath}/node_modules/webpack`),
    webpackConfig = require(`${appPath}/webpack.config.js`),
    WebpackDevServer = require(`${appPath}/node_modules/webpack-dev-server`),
  } = resolveArgs(arg)

  const compiler = webpack(webpackConfig)

  const vfs = virtualFs({
    srcDir: srcPath,
  })

  compiler.inputFileSystem = vfs
  compiler.outputFileSystem = vfs.out
  compiler.watchFileSystem = vfs

  const onceEmit = emitWatcher(compiler)

  const inSrc = file =>
    file ? path.join(appPath, 'src', file) : path.join(appPath, 'src')

  const writeFile = (filePath, contents) => {
    const srcPath = inSrc(filePath)
    if (contents && contents.rm) {
      // TODO implement delete (not easy with current virtual fs layout)
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

  const throwCompilationErrors = ([compilation]) => {
    const { errors } = compilation
    if (errors.length > 0) {
      const err = new Error(errors[0])
      err.name = 'CompileError'
      throw err
    }
    return compilation
  }

  const writeFiles = async files => {
    const paths = await Promise.all(
      Object.entries(files).map(([path, contents]) => writeFile(path, contents))
    )
    await Promise.all([onceEmit(), vfs.notify(paths)]).then(
      throwCompilationErrors
    )
  }

  const reset = files =>
    Promise.all([onceEmit(), vfs.reset(files)]).then(throwCompilationErrors)

  // All options: https://webpack.js.org/configuration/dev-server/
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

  await Promise.all([onceEmit(), listen()])

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
