const fs = require('fs')

const MemoryFS = require('memory-fs')
const { Union } = require('unionfs')
// const { link } = require('linkfs')

const cacheFS = require('./cache-fs')

const cached = cacheFS(fs)

function VirtualFs({ srcDir }) {
  let mfsTarget = new MemoryFS()
  const mfs = new Proxy(mfsTarget, {
    get(target, key) {
      return mfsTarget[key]
    },
  })

  const ufs = new Union().use(cached).use(mfs)

  let notify

  const times = {}

  ufs.watch = (
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

  ufs.out = mfs

  ufs.notify = (...args) => notify(...args)

  ufs.reset = async () => {
    mfsTarget = new MemoryFS()
    if (notify) {
      await notify([`${srcDir}/main.js`, `${srcDir}/App.svelte`])
    }
  }

  return ufs
}

module.exports = VirtualFs
