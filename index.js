const { commands } = require('./lib/testHmr.commands')

module.exports = {
  testHmr: require('./lib/testHmr'),
  bootstrap: require('./lib/bootstrap'),
  config: require('./lib/config'),
  ...commands,
}
