const fs = require('fs')
const path = require('path')

const hasTargetConfigs = (configs, appPath) => {
  const result = {}
  Object.entries(configs).forEach(([key, filename]) => {
    const configPath = path.join(appPath, filename)
    const hasConfig = fs.existsSync(configPath)
    result[key] = hasConfig
  })
  return result
}

const resolveTestServer = (has, { nollup }) => {
  if (has.webpack && has.rollup) {
    throw new Error(
      "Found both rollup.config.js and webpack.config.js: can't decide"
    )
  }
  if (has.rollup) {
    if (nollup) {
      return require('./test-server-nollup')
    }
    return require('./test-server-rollup')
  }
  if (has.webpack) {
    return require('./test-server-webpack')
  }
  throw new Error('Found neither rollup.config.js nor webpack.config.js')
}

const resolve = options => {
  const { appPath } = options
  const targetConfigs = {
    webpack: 'webpack.config.js',
    rollup: 'rollup.config.js',
  }
  const has = hasTargetConfigs(targetConfigs, appPath)
  const testServer = resolveTestServer(has, options)
  return testServer(options)
}

module.exports = resolve
