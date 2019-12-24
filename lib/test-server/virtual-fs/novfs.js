const fs = require('fs')
const path = require('path')

const Debug = require('debug')
const debugPrefix = 'test-hmr:test-server:novfs'
const debug = Debug(debugPrefix)
const del = require('del')

const { writeFile } = require('../../util')

import { resolveFixtures } from './fixtures'

function noVFS({
  srcDir: srcPath,
  fixtures: fixturesSource,
  fixturesPath,
  resetGlob = '*',
}) {
  const novfs = Object.create(fs)

  const fixtureFilesPromise = resolveFixtures({
    fixturesSource,
    fixturesPath,
    fs,
  })

  const mkdirpSync = (path, options) =>
    novfs.mkdirSync(path, { ...options, recursive: true })

  const writeFiles = (dir, files) => {
    const entries = Array.isArray(files) ? files : Object.entries(files)
    const promises = entries.map(async ([name, contents]) => {
      const filename = path.join(dir, name)
      const encoding = typeof contents === 'string' ? 'utf8' : undefined
      await mkdirpSync(path.dirname(filename))
      return writeFile(filename, contents, encoding)
    })
    return Promise.all(promises)
  }

  const reset = async files => {
    debug('reset(%k)', files)
    const deleted = await del(resetGlob, { cwd: srcPath })
    debug('reset: deleted %o', deleted)
    const mergedFiles = {
      ...(fixtureFilesPromise && (await fixtureFilesPromise)),
      ...files,
    }
    await writeFiles(srcPath, mergedFiles)
    if (debug.enabled) debug('reset: written %o', mergedFiles)
  }

  const notify = (paths, event = 'change') => {
    debug('notify("%s", "%s")', paths, event)
  }

  Object.assign(novfs, {
    reset,
    notify,
    out: novfs,
    mkdirpSync,
  })

  if (debug.enabled) {
    const ws = novfs.writeFile
    novfs.writeFile = (path, ...args) => {
      debug('write', path)
      return ws(path, ...args)
    }
  }

  return novfs
}

// stubs chokidar to implement auto close from the outside
noVFS.withChokidar = (...args) => {
  const chokidar = require('chokidar')
  const watchers = []
  return Object.assign(noVFS(...args), {
    chokidar: {
      ...chokidar,
      watch(...args) {
        const watcher = chokidar.watch(...args)
        watchers.push(watcher)
        return watcher
      },
    },
    async close() {
      return Promise.all(watchers.map(w => w.close()))
    },
  })
}

module.exports = noVFS
