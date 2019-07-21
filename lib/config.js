const path = require('path')

const {
  env: {
    APP = path.join(process.cwd(), 'app'),
    DETAIL = 1,
    WATCH = 0,
    E2E = true,
    RC_HTTP = 0,
  },
} = process

const resolveAppPath = name =>
  path.isAbsolute(name) ? name : path.join(process.cwd(), name)

const config = {
  set(cfg) {
    Object.entries(cfg).forEach(([key, value]) => {
      if (value !== undefined) {
        config[key] = value
      }
    })
  },

  appRootSelector: 'body',
  // this is ignored from HTML retrieved from the page, for HTML spec
  // expectations
  appHtmlPrefix: '<script src="bundle.js"></script>',

  appPath: resolveAppPath(APP),

  // use HTTP endpoints to remote control webpack server -- main use case is
  // to test the HTTP client/server themselves
  //
  // NOTE HTTP RC is not needed for mocha + puppeteer because the webpack
  //   server runs in the same process, but it would be useful if we decide
  //   to move webpack to its own proccess (it was first needed with Cypress,
  //   that was been investigated as a possible solution).
  //
  rcOverHttp: RC_HTTP != 0,

  // default: relaunch webpack dev server before each test
  //
  // fast: launch a single webpack dev server for all tests, and simply reset
  //   source files (and do a full recompile of main.js entry point)
  //
  // fast is faster but may encounter stability issues... especially since it
  // is not completely implemented yet
  //
  fastResetStrategy: true,
  // keep webpack & puppeteer running between test runs, in watch mode
  keepRunning: WATCH && WATCH != '0',

  // self integration tests: they're slow, so they're annoying during active
  // dev... by default, they're disabled when watching
  //
  // 0, or 'skip' -- default: true
  e2e: E2E,

  // runSpecTagAsDescribe: DETAIL == null || DETAIL > 0,
  // describeByStep: DETAIL > 1,
  detail: DETAIL,
  isRunSpecTagAsDescribe() {
    const { detail } = config
    return detail == null || detail > 0
  },
  isDescribeByStep() {
    return config.detail > 1
  },
}

module.exports = config
