module.exports = {
  // use HTTP endpoints to remote control webpack server -- main use case is
  // to test the HTTP client/server themselves
  //
  // NOTE HTTP RC is not needed for mocha + puppeteer because the webpack
  //   server runs in the same process, but it would be useful if we decide
  //   to move webpack to its own proccess (it was first needed with Cypress,
  //   that has been investigated as a possible solution).
  //
  rcOverHttp: process.env.RC_HTTP != null,

  // default: relaunch webpack dev server before each test
  //
  // fast: launch a single webpack dev server for all tests, and simply reset
  //   source files (and do a full recompile of main.js entry point)
  //
  // fast is faster but may encounter stability issues... especially since it
  // is not completely implemented yet
  //
  fastResetStrategy: true,
}
