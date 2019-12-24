/* eslint-env node, mocha */

const fs = require('fs')
const path = require('path')
const { promisify } = require('util')

const { Deferred } = require('../util')

const virtualFs = require('./virtual-fs')
const noVFS = require('./virtual-fs/novfs')
const RemoteControl = require('./rc-middleware')

const debug = require('debug')('test-hmr:test-server:webpack')

const HOST = 'localhost'

const realpath = promisify(fs.realpath)

const thenDebug = (...args) => result => {
  debug(...args)
  return result
}

const asyncNoop = async () => {}

const emitWatcher = compiler => {
  let deferred = Deferred()

  // all hooks: https://webpack.js.org/api/compiler-hooks/
  compiler.hooks.afterEmit.tap('svelte HMR test suite', compilation => {
    debug('compiler: afterEmit')
    const { resolve } = deferred
    deferred = Deferred()
    resolve(compilation)
  })

  const onceEmit = () => deferred.promise

  return onceEmit
}

const resolveContentBase = webpackConfig => {
  const { devServer: { contentBase } = {} } = webpackConfig
  if (!contentBase) {
    throw new Error('devServer.contentBase is required in webpack config')
  }
  return contentBase
}

const resolveArgs = arg => (typeof arg === 'string' ? { appPath: arg } : arg)

const realAppPath = async args => ({
  ...args,
  appPath: await realpath(args.appPath),
})

const start = async arg => {
  const {
    appPath,
    quiet = false,
    fs: useFs = false,
    srcDir = useFs ? 'src.test' : 'src',
    srcPath = path.resolve(appPath, srcDir),
    fixtures = null,
    fixturesDir = useFs ? 'src' : false,
    fixturesPath = fixturesDir && path.resolve(appPath, fixturesDir),
    resetGlob = '*',
    // webpack = require(`${appPath}/node_modules/webpack`),
    // webpackConfig = require(`${appPath}/webpack.config.js`),
    // WebpackDevServer = require(`${appPath}/node_modules/webpack-dev-server`),
    webpack = require.main.require('webpack'),
    webpackConfig = require(`${appPath}/webpack.config.js`),
    WebpackDevServer = require.main.require(`webpack-dev-server`),
  } = await realAppPath(resolveArgs(arg))

  delete webpackConfig.module.rules[0].exclude

  const makeAbsolute = name =>
    path.isAbsolute(name) ? name : path.join(appPath, name)

  const compiler = webpack({
    ...webpackConfig,
    // context is needed so that we are not dependent on working dir
    context: makeAbsolute(webpackConfig.context || ''),
  })

  const Fs = useFs ? noVFS : virtualFs
  const vfs = Fs({ srcDir: srcPath, fixtures, fixturesPath, resetGlob })

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
    debug('writeFiles(%k)', files)
    const paths = await Promise.all(
      Object.entries(files).map(([path, contents]) => writeFile(path, contents))
    )
    await Promise.all([onceEmit(), vfs.notify(paths)]).then(
      throwCompilationErrors
    )
  }

  const reset = async files => {
    debug('reset(%k)', files)
    await Promise.all([
      onceEmit().then(thenDebug('reset: onceEmit done')),
      vfs.reset(files).then(thenDebug('reset: vfs.reset done')),
    ])
      .then(throwCompilationErrors)
      .then(thenDebug('reset: done'))
  }

  // All options: https://webpack.js.org/configuration/dev-server/
  const server = new WebpackDevServer(compiler, {
    // contentBase must be absolute, so we are not dependent on working dir
    contentBase: makeAbsolute(resolveContentBase(webpackConfig)),
    publicPath: '/',
    inline: true,
    hot: true,
    // stats: {
    //   maxModules: 50,
    //   reasons: true,
    // },
    quiet,
    before: app => {
      app.use(
        RemoteControl({
          writeFiles,
          reset,
        })
      )
    },
  })

  let doClose = async () => {
    doClose = asyncNoop
    await server.close()
  }

  const close = () => doClose()

  let baseUrl

  const listen = () =>
    new Promise((resolve, reject) => {
      server.listen(0, HOST, function(err) {
        const { address, port } = this.address()
        // eslint-disable-next-line no-console
        console.info(`[Test HMR] Test server listening on ${address}:${port}`)
        baseUrl = `http://${address}:${port}`
        if (err) reject(err)
        else resolve()
      })
    })

  await Promise.all([onceEmit(), listen()])

  return {
    get baseUrl() {
      return baseUrl
    },
    close,
    reset,
    writeFiles,
  }
}

const init = options => ({
  start: () => start(options),
  defaultConfig: {
    // yes, that may be brittle if webpack/dev server ever changes its message
    // content, but they're the most readily available source to track HMR state
    // (and they conform to HMR user's expectations, so we can argue that we're
    // testing that, integration level...)
    hmrReadyMessage: '[WDS] Hot Module Replacement enabled.',
    // Webpack's own log message arrives too early because Svelte HMR accept
    // handlers are async (and Webpack's message comes sync).
    // hmrDoneMessage: '[HMR] App is up to date.',
    hmrDoneMessage: '[HMR:Svelte] Up to date',
    hmrNothingChangedMessage: '[WDS] Nothing changed.',
    hmrCompileErrorMessage: '[WDS] Errors while compiling. Reload prevented.',
  },
})

module.exports = init
