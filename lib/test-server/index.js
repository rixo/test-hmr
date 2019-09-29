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

const resolveTestServer = has => {
  if (has.webpack && has.rollup) {
    throw new Error(
      "Found both rollup.config.js and webpack.config.js: can't decide"
    )
  }
  if (has.rollup) {
    return require('./test-server-nollup')
  }
  if (has.webpack) {
    // TODO rename to test-server-webpack.js
    // return require('./test-server-webpack')
    return require('./test-server')
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
  const testServer = resolveTestServer(has)
  return testServer(options)
}

module.exports = resolve
