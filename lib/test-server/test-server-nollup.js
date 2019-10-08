/* eslint-env node, mocha */

const debug = require('debug')('test-hmr:test-server:rollup')

const path = require('path')
const fs = require('fs')
const proxyquire = require('proxyquire')

const virtualFs = require('./virtual-fs')
const RemoteControl = require('./rc-middleware')

const HOST = 'localhost'

const defaultOptions = {
  // config: process.cwd() + '/rollup.config.js',
  contentBase: './',
  historyApiFallback: false,
  hot: true,
  port: 8080,
  verbose: true,
  hmrHost: undefined,
}

const noop = () => {}

const asyncNoop = async () => {}

const devServer = (nollupDevServer, config, options) => {
  const express = require('express')
  const app = express()
  app.use(nollupDevServer(app, config, options))
  app.use(express.static(options.contentBase))
  app.close = noop
  return app
}

const resolveArgs = arg => (typeof arg === 'string' ? { appPath: arg } : arg)

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
  const before = process.env.NOLLUP
  if (!before) {
    process.env.NOLLUP = 1
  }
  const config = require(path)
  process.env.NOLLUP = before
  return config
}

const start = async arg => {
  const {
    appPath,
    quiet = false, // TODO implement quiet
    srcPath = path.join(appPath, 'src'),
  } = resolveArgs(arg)

  const makeAbsolute = name =>
    path.isAbsolute(name) ? name : path.join(appPath, name)

  const options = resolveOptions(makeAbsolute)

  const rollupConfigPath = options.config || `${appPath}/rollup.config.js`
  const rollupConfig = requireRollupConfig(rollupConfigPath)

  const vfs = virtualFs.withChokidar({
    srcDir: srcPath,
  })

  const nollupDevServer = proxyquire
    .noCallThru()
    .load(`${appPath}/node_modules/nollup/lib/dev-middleware`, {
      chokidar: vfs.chokidar,
      fs: vfs,
    })

  const hotPlugin =
    rollupConfig.plugins.find(
      ({ name, _setFs }) => name === 'svelte' && _setFs
    ) || rollupConfig.plugins.find(({ name }) => name === 'svelte-hmr')

  if (!hotPlugin) {
    throw new Error(
      `Failed to find svelte plugin (config: ${rollupConfigPath})`
    )
  }

  hotPlugin._setFs(vfs)

  const emitListeners = []
  const onceEmitted = () =>
    new Promise((resolve, reject) => {
      emitListeners.push({ resolve, reject })
    })

  const inSrc = file =>
    file ? path.join(appPath, 'src', file) : path.join(appPath, 'src')

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
  let close = async () => {
    close = asyncNoop
    httpServer.close()
    await server.close()
  }

  let baseUrl

  const listen = () =>
    new Promise((resolve, reject) => {
      httpServer = server.listen(0, HOST, function(err) {
        const { address, port } = this.address()
        // eslint-disable-next-line no-console
        console.info(
          `[Test HMR] Rollup test server listening on ${address}:${port}`
        )
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
    hmrDoneMessage: '[HMR] Status Change idle',
    hmrNothingChangedMessage: '[WDS] Nothing changed.',
    hmrCompileErrorMessage: '[WDS] Errors while compiling. Reload prevented.',
  },
})

module.exports = init
