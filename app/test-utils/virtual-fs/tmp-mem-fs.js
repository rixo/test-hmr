// A memory fs that can be blanked out

const MemoryFS = require('memory-fs')

const tmpMemFs = ({ srcDir }) => {
  let mfsTarget

  // async, might become in the future
  const reset = async () => {
    mfsTarget = new MemoryFS()
    // FIXME changes detection should be implemented correctly: this is
    //   probably the root cause of stability issues with reset
    return [`${srcDir}/main.js`, `${srcDir}/App.svelte`]
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
