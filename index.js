const testHmr = require('./lib/testHmr')

const thc = testHmr.bind(null)

module.exports = Object.assign(thc, {
  ...testHmr,
  testHmr,
  bootstrap: require('./lib/bootstrap'),
  config: require('./lib/config'),
  ...require('./commands'),
})
