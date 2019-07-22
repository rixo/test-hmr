module.exports = {
  testHmr: require('./lib/testHmr'),
  bootstrap: require('./lib/bootstrap'),
  config: require('./lib/config'),
  ...require('./commands'),
}
