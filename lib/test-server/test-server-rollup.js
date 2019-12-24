/* eslint-env node, mocha */

const debug = require('debug')('test-hmr:test-server:rollup')

const path = require('path')
const proxyquire = require('proxyquire')
const rewiremock = require('rewiremock/node')
const express = require('express')

const { noop, asyncNoop, pipe, realpath } = require('../util')

const virtualFs = require('./virtual-fs')
const noVFS = require('./virtual-fs/novfs')
const { resolveRequire } = require('./util-rollup')

const HOST = 'localhost'

const devServer = ({ contentBase, vfs, historyApiFallback = 'index.html' }) => {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
  }

  const sendError = (res, error) => {
    if (error.code === 'ENOENT') {
      if (historyApiFallback) {
        send(res, path.resolve(contentBase, historyApiFallback))
      } else {
        res.sendStatus(404)
      }
    } else {
      res.status(500).send(JSON.stringify(error))
    }
  }

  const send = (res, file) => {
    vfs.stat(file, (err, stats) => {
      if (err) {
        sendError(res, err)
      } else if (stats.isDirectory()) {
        send(res, path.join(file + '/index.html'))
      } else {
        vfs.readFile(file, 'utf8', (err, contents) => {
          if (err) {
            sendError(res, err)
          } else {
            const ext = path.extname(file)
            const mime = mimeTypes[ext]
            if (mime) {
              res.set({ 'Content-Type': mime })
            }
            res.send(contents)
          }
        })
      }
    })
  }

  const app = express()

  app.get('*', (req, res) => {
    const file = path.resolve(path.join(contentBase, req.path))
    send(res, file)
  })

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

const requireRollupConfig = async (path, vfs) => {
  const before = { ...process.env }
  process.env.NODE_ENV = 'test'
  process.env.ROLLUP_WATCH = 'true'
  const req = require('esm')(module)
  const { default: config } = rewiremock.proxy(() => req(path), { fs: vfs })
  Object.assign(process.env, before)
  return {
    ...config,
    plugins: config.plugins.filter(p => p.name !== 'svelte/template:serve'),
  }
}

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
  } = await resolveArgs(arg)

  process.chdir(appPath)

  const Vfs = useFs ? noVFS : virtualFs.withFsWatch
  const vfs = Vfs({ srcDir: srcPath, fixtures, fixturesPath, resetGlob })

  // WARNING reset must happen BEFORE requiring rollup config -- or we might get
  // issues with plugins that read fs when they are created (e.g./ routify)
  await vfs.reset()

  const rollupConfigPath = `${appPath}/rollup.config.js`
  const rollupConfig = await requireRollupConfig(rollupConfigPath, vfs)

  const findHotPlugin = rollupConfig => {
    const plugins = rollupConfig.plugins.filter(Boolean)
    const svelteHotPlugin = plugins.find(
      ({ _setFs }) => typeof _setFs === 'function'
    )
    const hotPlugin = plugins.find(({ name }) => name === 'hot')
    return {
      hotPlugin,
      svelteHotPlugin,
    }
  }

  const { hotPlugin, svelteHotPlugin } = findHotPlugin(rollupConfig)

  if (!hotPlugin) {
    throw new Error(`Failed to find hot plugin (config: ${rollupConfigPath})`)
  }

  if (!svelteHotPlugin) {
    throw new Error(
      `Failed to find svelte hot plugin (config: ${rollupConfigPath})`
    )
  }

  svelteHotPlugin._setFs(vfs)

  const rollupPath = resolveRequire(appPath)('rollup/dist/rollup.js')
  const rollup = proxyquire.noCallThru().load(rollupPath, { fs: vfs })

  const watchOptions = {
    ...rollupConfig,
    watch: {
      ...rollupConfig.watch,
      chokidar: false,
    },
  }
  const watcher = rollup.watch(watchOptions)

  watcher.on('event', event => {
    if (event.code === 'BUNDLE_END') {
      if (!quiet) {
        // eslint-disable-next-line no-console
        console.debug('Compiled in %sms', event.duration)
      }
      notifyEmitted()
    } else if (event.code === 'ERROR') {
      // eslint-disable-next-line no-console
      console.error(String(event.error))
      notifyError(event.error)
    }
  })

  let emitListeners = []
  const onceEmitted = () =>
    new Promise((resolve, reject) => {
      emitListeners.push({ resolve, reject })
    })

  const notifyEmitted = () => {
    debug('notifyEmitted')
    const listeners = emitListeners
    emitListeners = []
    for (const { resolve } of listeners) {
      resolve({})
    }
  }

  const notifyError = error => {
    debug('notifyError', error)
    const listeners = emitListeners
    emitListeners = []
    for (const { reject } of listeners) {
      reject(error)
    }
  }

  const inSrc = file =>
    file ? path.join(appPath, srcDir, file) : path.join(appPath, srcDir)

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
    await Promise.all([onceEmitted(), vfs.notify(paths)]).then(
      throwCompilationErrors
    )
  }

  const reset = async files => {
    debug('reset: enter')
    await vfs.reset(files)
    const compilation = await onceEmitted()
    throwCompilationErrors([compilation])
    debug('reset: leave')
  }

  const contentBase =
    hotPlugin._publicDir ||
    rollupConfig.output.dir ||
    path.dirname(rollupConfig.output.file)

  const server = devServer({ vfs, contentBase })

  let httpServer
  let doClose = async () => {
    doClose = asyncNoop
    httpServer.close()
    watcher.close()
    // if (hotPlugin) {
    //   hotPlugin._close()
    // }
    await Promise.all([
      ...rollupConfig.plugins.filter(p => p && p._close).map(p => p._close()),
      server.close(),
    ])
    // for (const plugin of rollupConfig.plugins) {
    //   if (!plugin) continue
    //   if (!plugin._close) continue
    //   await plugin._close()
    // }
    // await server.close()
  }

  const close = () => doClose()

  let baseUrl
  const listen = () =>
    new Promise((resolve, reject) => {
      httpServer = server.listen(0, HOST, function(err) {
        const { address, port } = this.address()
        // eslint-disable-next-line no-console
        console.info(
          `[Test HMR] Rollup test server listening at http://${address}:${port}`
        )
        baseUrl = `http://${address}:${port}`
        if (err) reject(err)
        else resolve()
      })
    })

  await Promise.all([onceEmitted(), listen()])

  debug('started')

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
    hmrDoneMessage: '[HMR] Up to date',
    hmrNothingChangedMessage: '[HMR] Nothing changed',
    hmrCompileErrorMessage: null,
  },
})

module.exports = init
