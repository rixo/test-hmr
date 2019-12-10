/* eslint-env node, mocha */

const debug = require('debug')('test-hmr:test-server:rollup')

const path = require('path')
const fs = require('fs')
const proxyquire = require('proxyquire')
const rewiremock = require('rewiremock/node')

const { noop, asyncNoop, pipe, realpath } = require('../util')

const virtualFs = require('./virtual-fs')
const noVFS = require('./virtual-fs/novfs')
const { resolveRequire } = require('./util-rollup')

const HOST = 'localhost'

const defaultOptions = {
  // config: process.cwd() + '/rollup.config.js',
  contentBase: './public',
  historyApiFallback: false,
  hot: true,
  port: 8080,
  verbose: true,
  hmrHost: undefined,
}

const devServer = (nollupDevServer, config, options) => {
  const express = require('express')
  const app = express()
  app.use(nollupDevServer(app, config, options))
  app.use(express.static(options.contentBase))
  if (options.historyApiFallback) {
    // https://gitlab.com/sebdeckers/express-history-api-fallback/blob/master/lib/index.js
    app.use((req, res, next) => {
      if (
        (req.method === 'GET' || req.method === 'HEAD') &&
        req.accepts('html')
      ) {
        ;(res.sendFile || res.sendfile).call(
          res,
          'index.html',
          { root: options.contentBase },
          err => err && next()
        )
      } else next()
    })
  }
  app.close = noop
  return app
}

const resolveAppPath = arg => (typeof arg === 'string' ? { appPath: arg } : arg)

const makeAppPathAbsolute = async args => ({
  ...args,
  appPath: await realpath(args.appPath),
})

const resolveArgs = pipe(
  resolveAppPath,
  makeAppPathAbsolute
)

const resolveOptions = makeAbsolute => {
  let options = defaultOptions
  const rcPath = makeAbsolute('.nolluprc')
  const rcjsPath = makeAbsolute('.nolluprc.js')
  if (fs.existsSync(rcPath)) {
    options = Object.assign({}, options, JSON.parse(fs.readFileSync(rcPath)))
  } else if (fs.existsSync(rcjsPath)) {
    options = Object.assign({}, options, require(path.resolve(rcjsPath)))
  }
  return options
}

const requireRollupConfig = path => {
  const before = { ...process.env }
  process.env.NODE_ENV = 'test'
  // NOLLUP and ROLLUP_WATCH are automatically added by Nollup's cli since 0.9.0
  process.env.NOLLUP = 'true'
  process.env.ROLLUP_WATCH = 'true'
  const req = require('esm')(module)
  const config = req(path).default
  Object.assign(process.env, before)
  return config
}

const start = async arg => {
  const {
    appPath,
    quiet = false, // TODO implement quiet
    // srcPath = path.join(appPath, 'src'),
    fs: useFs = false,
    srcDir = useFs ? 'src.test' : 'src',
    srcPath = path.resolve(appPath, srcDir),
    fixtures = null,
    fixturesDir = useFs ? 'src' : false,
    fixturesPath = fixturesDir && path.resolve(appPath, fixturesDir),
    resetGlob = '*',
  } = await resolveArgs(arg)

  process.chdir(appPath)

  const vfs = useFs
    ? noVFS.withChokidar({ srcDir: srcPath, fixtures, fixturesPath, resetGlob })
    : virtualFs.withChokidar({ srcDir: srcPath })

  // WARNING reset must happen BEFORE requiring rollup config -- or we might get
  // issues with plugins that read fs when they are created (e.g./ routify)
  await vfs.reset()

  const makeAbsolute = name =>
    path.isAbsolute(name) ? name : path.join(appPath, name)

  const options = resolveOptions(makeAbsolute)

  const rollupConfigPath = options.config || `${appPath}/rollup.config.js`
  const rollupConfig = requireRollupConfig(rollupConfigPath)

  const devMiddlewarePath = resolveRequire(appPath)(
    'nollup/lib/dev-middleware.js'
  )

  const nollupDevServer = proxyquire.noCallThru().load(devMiddlewarePath, {
    chokidar: vfs.chokidar,
    fs: vfs,
  })

  const hotPlugin = rollupConfig.plugins.find(
    ({ _setFs }) => typeof _setFs === 'function'
  )

  if (!hotPlugin) {
    throw new Error(
      `Failed to find test target plugin plugin (config: ${rollupConfigPath})`
    )
  }

  hotPlugin._setFs(vfs)

  const emitListeners = []
  const onceEmitted = () =>
    new Promise((resolve, reject) => {
      emitListeners.push({ resolve, reject })
    })

  const inSrc = file =>
    file ? path.join(srcPath, file) : path.join(appPath, srcDir)

  const writeFile = (filePath, contents) => {
    debug("writeFile('%s', '%h')", filePath, contents)
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
    if (errors && errors.length > 0) {
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
    debug(
      'writeFiles: await Promise.all([onceEmitted(), vfs.notify(%s)])',
      paths
    )
    await Promise.all([onceEmitted(), vfs.notify(paths)]).then(
      throwCompilationErrors
    )
  }

  const reset = files =>
    Promise.all([onceEmitted(), vfs.reset(files)]).then(throwCompilationErrors)

  if (options.contentBase) {
    options.contentBase = makeAbsolute(options.contentBase)
  }

  hotPlugin._onBundleGenerated(() => {
    debug('_onBundleGenerated')
    while (emitListeners.length > 0) {
      const next = emitListeners.shift()
      next.resolve({})
    }
  })

  hotPlugin._onRenderError(err => {
    debug('_onRenderError')
    while (emitListeners.length > 0) {
      const next = emitListeners.shift()
      next.reject(err)
    }
  })

  const server = devServer(nollupDevServer, rollupConfig, options)

  let httpServer
  let doClose = async () => {
    doClose = asyncNoop
    httpServer.close()
    await Promise.all([
      ...rollupConfig.plugins.filter(p => p && p._close).map(p => p._close()),
      server.close(),
      vfs.close(),
    ])
  }

  const close = () => doClose()

  let baseUrl

  const listen = () =>
    new Promise((resolve, reject) => {
      httpServer = server.listen(0, HOST, function(err) {
        const { address, port } = this.address()
        // eslint-disable-next-line no-console
        console.info(`[Test HMR] Nollup listening on ${address}:${port}`)
        baseUrl = `http://${address}:${port}`
        if (err) reject(err)
        else resolve()
      })
    })

  await Promise.all([onceEmitted(), listen()])

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
    hmrReadyMessage: '[HMR] Enabled',
    // Nollup's own log message is not enough because rollup-plugin-hot's (and
    // Svelte's) accept handlers are async
    //   hmrDoneMessage: '[HMR] Status Change idle',
    hmrDoneMessage: '[HMR] Up to date',
    hmrNothingChangedMessage: '[WDS] Nothing changed.',
    hmrCompileErrorMessage: '[WDS] Errors while compiling. Reload prevented.',
  },
})

module.exports = init
