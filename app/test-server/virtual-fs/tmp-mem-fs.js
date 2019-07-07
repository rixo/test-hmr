// A memory fs that can be blanked out

const path = require('path')

const MemoryFS = require('memory-fs')

const tmpMemFs = ({ srcDir }) => {
  let mfsTarget

  const writeFile = (fs, filePath, contents) =>
    new Promise((resolve, reject) => {
      const srcPath = path.join(srcDir, filePath)
      fs.mkdirpSync(path.dirname(srcPath))
      fs.writeFile(srcPath, contents, 'utf8', err => {
        if (err) reject(err)
        else resolve(srcPath)
      })
    })

  // async, might become in the future
  const reset = async files => {
    mfsTarget = new MemoryFS()
    // FIXME changes detection should be implemented correctly: this is
    //   probably the root cause of stability issues with reset
    const changes = [`${srcDir}/main.js`, `${srcDir}/App.svelte`]
    if (files) {
      await Promise.all(
        Object.entries(files).map(([path, contents]) =>
          writeFile(mfsTarget, path, contents)
        )
      ).then(paths => {
        changes.push(...paths)
      })
    }
    return changes
  }

  reset()

  const mfs = new Proxy(mfsTarget, {
    get(target, key) {
      if (key === 'nuke') {
        return reset
      }
      return mfsTarget[key]
    },
  })

  return mfs
}

module.exports = tmpMemFs
