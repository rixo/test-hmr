// The watcher implementation is very largely inspired by:
// https://github.com/webpack/webpack/issues/1562#issuecomment-354878322

const Debug = require('debug')
const debugPrefix = 'test-hmr:test-server:virtual-fs'
const debug = Debug(debugPrefix)

const fs = require('fs')
const path = require('path')

const { Union } = require('unionfs')
const glob = require('fast-glob')

const cacheFS = require('./cache-fs')
const tmpMemFS = require('./tmp-mem-fs')

const cached = cacheFS(fs)

function Watcher() {
  const times = {}

  let paused
  let watcher

  const close = () => {
    watcher = null
  }

  const pause = () => {
    paused = true
    throw new Error('pause')
  }

  const watch = (
    filePathsBeingWatched,
    dirPaths,
    missing,
    startTime,
    options,
    aggregatedCallback,
    immediateCallback
  ) => {
    paused = false
    watcher = {
      filePathsBeingWatched,
      dirPaths,
      missing,
      startTime,
      aggregatedCallback,
      immediateCallback,
    }
    return {
      close,
      pause,
    }
  }

  const notify = paths => {
    const now = Date.now()

    paths.forEach(path => {
      times[path] = now
    })

    if (!watcher) {
      return
    }
    if (paused) return

    const {
      filePathsBeingWatched,
      dirPaths,
      missing,
      startTime,
      aggregatedCallback,
      immediateCallback,
    } = watcher

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

    const timestamps = {
      get: path => {
        return times[path] || startTime
      },
    }

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

  return {
    watch,
    notify,
    times,
  }
}

const Chokidar = () => {
  const debug = Debug(`${debugPrefix}:chokidar`)

  const listeners = {
    add: [],
    change: [],
    all: [],
  }

  let paused = true

  const on = (type, listener) => {
    listeners[type].push(listener)
  }

  const notify = (paths, event = 'change') => {
    debug('notify("%s", "%s")', paths, event)
    if (paused) return
    const eventListeners = listeners[event]
    const allListeners = listeners.all
    paths.forEach(path => {
      if (eventListeners) {
        listeners[event].forEach(listener => listener(path))
      }
      if (allListeners) {
        allListeners.forEach(listener => listener(path))
      }
    })
  }

  // TODO maybe implement respecting those arguments?
  // const watch = (path, { ignored }) => {
  const watch = () => {
    paused = false
    return { on }
  }

  return { notify, chokidar: { watch } }
}

const FsWatch = () => {
  const debug = Debug(`${debugPrefix}:fs-watch`)

  const times = {}

  const watchers = {}

  const notify = (paths, event = 'change') => {
    debug('notify("%s", "%s")', paths, event)
    const now = Date.now()
    paths.forEach(id => {
      times[id] = now
      const handlers = watchers[id]
      if (!handlers) {
        return
      }
      handlers.forEach(handler => {
        handler(event)
      })
    })
  }

  const watch = (id, opts, handler) => {
    debug('watch', id, opts)
    if (!watchers[id]) {
      watchers[id] = []
    }
    watchers[id].push(handler)

    const close = () => {
      debug('close', id)
      const index = watchers[id].indexOf(handler)
      watchers[id].splice(index, 1)
    }

    const on = () => {}

    return { close, on }
  }

  return { notify, watch, times }
}

function VirtualFs({ srcDir, useChokidar = false, useFsWatch = false }) {
  const mfs = tmpMemFS({ srcDir })
  const ufs = new Union().use(cached).use(mfs)

  const { notify, chokidar, watch, times } = useChokidar
    ? Chokidar() // nollup
    : useFsWatch
    ? FsWatch() // rollup
    : Watcher() // webpack

  const start = new Date('1991-12-21').getTime()

  const lstatSync = path => {
    const stats = mfs.existsSync(path)
      ? mfs.statSync(path)
      : cached.lstatSync(path)
    if (times) {
      stats.mtime = times[path] || start
    }
    return stats
  }

  const allSourceFiles = fs => glob(path.join(srcDir, '**/*'), { fs })

  const fixtureFilesPromise = allSourceFiles(cached)

  const unique = items => [...new Set(items)]

  const reset = async files => {
    debug('reset(%k)', files)
    const oldFiles = await allSourceFiles(mfs)
    const newFiles = await mfs.reset(files)
    if (notify) {
      const fixtureFiles = (await fixtureFilesPromise) || []
      const changes = unique([...newFiles, ...oldFiles, ...fixtureFiles])
      await notify(changes)
      debug('reset:notified', changes)
    }
  }

  if (debug.enabled) {
    const ws = mfs.writeFile
    mfs.writeFile = (path, ...args) => {
      debug('write', path)
      return ws(path, ...args)
    }
  }

  return Object.assign(ufs, {
    out: mfs,
    watch,
    notify,
    reset,
    chokidar,
    lstatSync,
    statSync: lstatSync,
  })
}

VirtualFs.withChokidar = opts => VirtualFs({ ...opts, useChokidar: true })

VirtualFs.withFsWatch = opts => VirtualFs({ ...opts, useFsWatch: true })

module.exports = VirtualFs
