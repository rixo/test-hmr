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

const flatten = array =>
  array.reduce((flat, cur) => flat.concat(Array.isArray(cur) ? cur : [cur]), [])

function Watcher({ times }) {
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
  }
}

const Chokidar = () => {
  const debug = Debug(`${debugPrefix}:chokidar`)

  const listeners = {
    add: [],
    change: [],
  }

  let paused = true

  const on = (type, listener) => {
    listeners[type].push(listener)
  }

  const notify = (paths, event = 'change') => {
    debug('notify("%s", "%s")', paths, event)
    if (paused) return
    paths.forEach(path => {
      listeners[event].forEach(listener => listener(path))
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

function VirtualFs({ srcDir, useChokidar = false }) {
  const mfs = tmpMemFS({ srcDir })
  const ufs = new Union().use(cached).use(mfs)

  const times = {}

  const { notify, chokidar, watch } = useChokidar
    ? Chokidar()
    : Watcher({ times })

  const _writeVirtualFile = (file, stats, contents) => {
    mfs.writeFileSync(file, contents, 'utf8')
    times[file] = stats.mtime
  }

  const lstatSync = path => {
    return mfs.existsSync(path) ? mfs.statSync(path) : cached.lstatSync(path)
  }

  const allSourceFiles = fs => glob(path.join(srcDir, '**/*'), { fs })

  const fixtureFiles = allSourceFiles(cached)

  const unique = items => [...new Set(items)]

  const reset = async files => {
    debug('reset(%k)', files)
    const allChanges = await Promise.all([
      fixtureFiles,
      allSourceFiles(mfs).then(async oldFiles => {
        const newFiles = await mfs.reset(files)
        return { oldFiles, newFiles }
        // return [...oldFiles, ...newFiles]
      }),
    ]).then(([fixtureFiles = [], { oldFiles = [], newFiles }]) => ({
      oldFiles: unique([...oldFiles, ...fixtureFiles]),
      newFiles,
    }))
    if (notify) {
      const changes = unique(flatten(Object.values(allChanges)))
      await notify(changes)
      debug('reset:notified', changes)
    }
  }

  return Object.assign(ufs, {
    out: mfs,
    watch,
    notify,
    reset,
    _writeVirtualFile,
    chokidar,
    lstatSync,
  })
}

VirtualFs.withChokidar = opts => VirtualFs({ ...opts, useChokidar: true })

module.exports = VirtualFs
