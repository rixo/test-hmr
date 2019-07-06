/* eslint-env node, mocha */

const APP = __dirname

const PORT = 8080
const HOST = 'localhost'
const PROTOCOL = 'http'

const path = require('path')
const fs = require('fs')

const webpack = require('webpack')
const WebpackDevServer = require('webpack-dev-server')
const MemoryFS = require('memory-fs')

const { Union } = require('unionfs')
// const { link } = require('linkfs')

const config = require(`${APP}/webpack.config.js`)

// --- Mem fs ---

let notify

const inSrc = file =>
  file ? path.join(APP, 'src', file) : path.join(APP, 'src')

// mfs.mkdirpSync(inSrc())
// mfs.writeFileSync(
//   inSrc('main.js'),
//   fs.readFileSync(inSrc('main.js'), 'utf8'),
//   'utf8'
// )
// mfs.writeFileSync(
//   inSrc('App.svelte'),
//   fs.readFileSync(inSrc('App.svelte'), 'utf8'),
//   'utf8'
// )
// // mfs.writeFileSync(inSrc('/App.svelte'), "Hell'o", 'utf8')

// setTimeout(() => {
//   const file = inSrc('App.svelte')
//   mfs.writeFileSync(file, 'BIM !')
//   notify([file])
//   // console.log(ufs.readFileSync(APP + '/src/App.svelte', 'utf8'))
//   // console.log(server, compiler)
//   // debugger
// }, 5000)

const mfs = new MemoryFS()

const ufs = new Union().use(fs).use(mfs)

// console.log(ufs.readFileSync(inSrc('App.svelte'), 'utf8'))

const times = {}

mfs.watch = (
  filePathsBeingWatched,
  dirPaths,
  missing,
  startTime,
  options,
  aggregatedCallback,
  immediateCallback
) => {
  let listening = true

  const timestamps = {
    get: path => {
      return times[path] || startTime
    },
  }

  notify = paths => {
    if (!listening) return
    const now = Date.now()

    paths.forEach(path => {
      times[path] = now
    })

    paths.forEach(path => {
      immediateCallback(path, now)
    })

    const err = null

    const filesModified = paths
      .filter(filePath => filePathsBeingWatched.indexOf(filePath) >= 0)
      .sort()
    const contextModified = paths
      .filter(filePath => dirPaths.indexOf(filePath) >= 0)
      .sort()
    const missingModified = paths
      .filter(filePath => missing.indexOf(filePath) >= 0)
      .sort()

    const fileTimestamps = timestamps
    const contextTimestamps = timestamps
    const removedFiles = []

    aggregatedCallback(
      err,
      filesModified,
      contextModified,
      missingModified,
      fileTimestamps,
      contextTimestamps,
      removedFiles
    )
  }

  const pause = () => {
    listening = false
  }

  const close = pause

  return {
    close,
    pause,
  }
}

ufs._writeVirtualFile = (file, stats, contents) => {
  mfs.writeFileSync(file, contents, 'utf8')
  times[file] = stats.mtime
}

// console.log(ufs.readFileSync(APP + '/src/App.svelte', 'utf8'))

// --- End of compile hook ---

const listeners = []

debugger

// compiler.hooks.afterEmit.tap('svelte HMR test suite', () => {
//   console.trace('EMIT')
//   while (listeners.length > 0) {
//     const listener = listeners.shift()
//     listener()
//   }
// })

const onEmit = () =>
  new Promise(resolve => {
    listeners.push(resolve)
  })

// --- HMR control server ---

const writeSrc = (path, contents) =>
  new Promise((resolve, reject) => {
    const srcPath = inSrc(path)
    mfs.writeFile(srcPath, contents, 'utf8', err => {
      if (err) reject(err)
      else resolve(srcPath)
    })
  })

const before = app => {
  const express = require('express')

  const router = express.Router()

  router.use(express.json())

  router.get('/_dev/ping', (req, res) => {
    res.send('pong')
  })

  router.post('/_dev/reset', (req, res) => {
    const rimraf = require('rimraf')
    rimraf(inSrc('*'), mfs, err => {
      if (err) {
        res.status(500).json({
          error: String(err.stack)
        })
      } else {
        res.sendStatus(200)
      }
    })
  })

  router.put('/_dev/src', (req, res) => {
    Promise.all(
      Object.entries(req.body.files).map(([path, contents]) =>
        writeSrc(path, contents)
      )
    )
      // .then(paths => Promise.all(onEmit(), notify(paths)))
      .then(paths => {
        notify(paths)
        res.sendStatus(200)
      })
      .catch(error => {
        res.status(500).json({
          error: String(error.stack),
        })
      })
  })

  app.use(router)
}

const compiler = webpack(config)
compiler.inputFileSystem = ufs
compiler.outputFileSystem = mfs
compiler.watchFileSystem = mfs
// compiler.watchFileSystem = fs // DEBUG DEBUG DEBUG ;

const server = new WebpackDevServer(compiler, {
  contentBase: path.join(APP, 'public'),
  public: `${PROTOCOL}/${HOST}:${PORT}`,
  publicPath: '/',
  inline: true,
  hot: true,
  before,
})

const start = () =>
  new Promise((resolve, reject) => {
    server.listen(PORT, HOST, function(err) {
      if (err) reject(err)
      else resolve(function close() {
        return new Promise((resolve, reject) => {
          server.close(err => {
            if (err) reject(err)
            else resolve()
          })
        })
      })
    })
  })

start()
