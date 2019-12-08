const fs = require('fs')
const path = require('path')
const glob = require('fast-glob')

const Debug = require('debug')
const debugPrefix = 'test-hmr:test-server:novfs'
const debug = Debug(debugPrefix)

const { readFile, writeFile, rimraf } = require('../../util')

const readFixtures = async source => {
  const files = await glob(`${source}/**/*`)
  const promises = files.map(async file => [
    path.relative(source, file),
    await readFile(file),
  ])
  return Promise.all(promises)
}

function noVFS({ srcDir: srcPath, fixtures, fixturesPath }) {
  const novfs = Object.create(fs)

  const fixtureFilesPromise = fixturesPath && readFixtures(fixturesPath)

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
    if (fixtureFilesPromise) {
      await rimraf(path.resolve(srcPath, '**'))
      await mkdirpSync(srcPath)
      const fixtureFiles = await fixtureFilesPromise
      await writeFiles(fixturesPath, fixtureFiles)
    }
    if (fixtures) {
      await writeFiles(srcPath, fixtures)
    }
    if (files) {
      await writeFiles(srcPath, files)
    }
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
