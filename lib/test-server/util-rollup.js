const fs = require('fs')

const ifExists = name => (fs.existsSync(name) ? name : null)

const resolveRequire = appPath => request =>
  ifExists(`${appPath}/node_modules/${request}`) ||
  require.resolve(request, require.main)

module.exports = {
  resolveRequire,
}
