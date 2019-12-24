const path = require('path')
const fs = require('fs')
const os = require('os')

const Mocha = require('mocha')
const glob = require('fast-glob')

// WARNING don't import the package's index, or it will break config
const { exists } = require('./util')
const config = require('./config')

const RC_FILE = '.thcrc.js'

const defaultOptions = {
  app: '',
  apps: [],
  detail: 0,
  selfTest: false,
  selfTestOnly: false,
  watch: false,
  watchDirs: [],
  watchExtensions: ['.js', '.svelte'],
  watchNodeModules: false,
  watchSelf: false,
  watchLoader: false,
  fs: false,
  fixtures: null,
  fixturesDir: null,
  nollup: false,
  // open puppeteer's browser for visual inspection
  open: false,
  keepOpen: false,
  break: false,
  // console: log browser's console output to terminal
  console: false,
  logs: false,
}

const makeAbsolute = (name, basePath) =>
  path.isAbsolute(name) ? name : path.join(basePath, name)

const abs = name => path.join(__dirname, name)

const resolveAppPath = (arg, cwd, noDefault) => {
  if (!arg) {
    return noDefault ? null : cwd
  }
  if (path.isAbsolute(arg)) {
    return arg
  }
  return makeAbsolute(arg, cwd)
}

const helpDescription = `
If no <app> is provided, then the current directory will be used.

<app> can be a path to a custom app, or one of the predefined app: rollup,
nollup, or webpack.

The --watch option will adapt to the current test target. When the target is an
app, both the app and tests directories will be placed under watch. When the
target is --self, then only the test utils directory will be watched.

If an <app> is provided with the --self option, then self e2e tests will also be
run (but HMR tests still won't be run).

Debug the tests:
  node --inspect-brk $(which thc) [options] <app>

Examples:
  thc rollup
  thc nollup --watch
  thc . --open --keep
`

const helpMessage = ({ full = true }) => `
Usage: thc [options] <app>

Options:
  --watch         Wath app and tests dirs, and rerun tests on change
  --open, -o      Open puppeteer's browser for debug (with some slowmo)
  --keep, -k      Keep the serves running after test run (useful for inspection)
  --break, -b     Pause browser after test has run
  --console, -c   Display browser's console messages in the terminal
  --logs, -l      Display bundler's output in the terminal
  --min           Display one mocha test (it) result per testHmr test (default)
  --detail        Display one test (it) result per HMR update
  --steps         Display one test (it) result per HMR update sub step
  --nollup, -n    Prefer Nollup over Rollup if target app is Rollup based
  --fs            Really write to FS (instead of mocking it in memory)
  --self          Runs test utils self tests instead of HMR tests
  --sanity        Runs test utils self tests in addition to app tests
  --watch-self    Watch test utils directory (even if not running self tests)
  --user-dir      Used for Puppeteer userDataDir
  --help, -h      Display ${full ? 'this' : 'full'} help message
${full ? helpDescription : ''}`

const convertRcOptions = (resolvePath, { app, userDataDir, ...options }) => ({
  app: resolvePath(app),
  userDataDir:
    userDataDir && resolvePath(userDataDir.replace(/^~/, os.homedir())),
  ...options,
})

const expandShortArgs = args =>
  args.flatMap(x =>
    /^-\w+$/.test(x)
      ? x
          .slice(1)
          .split('')
          .map(a => '-' + a)
      : x
  )

const parseArgs = (argv, defaultOptions) => {
  const options = {
    watch: false,
    watchDirs: [],
    ...defaultOptions,
    set 'watchDirs.push'(value) {
      options.watchDirs.push(value)
    },
  }

  const args = expandShortArgs(argv.slice(2))

  let help = false
  let setKey = null
  let maybeSetKey = null
  let positionals = args.filter(arg => {
    if (setKey) {
      options[setKey] = arg
      setKey = maybeSetKey = null
    } else if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--watch') {
      options.watch = true
      options.keepOpen = true
    } else if (arg === '--open' || arg === '-o') {
      options.open = true
    } else if (arg === '--keep' || arg === '-k') {
      options.keepOpen = true
    } else if (arg === '--break' || arg === '-b') {
      options.break = true
    } else if (arg === '--fs') {
      options.fs = true
    } else if (arg === '--no-fs') {
      options.fs = false
    } else if (arg === '--console' || arg === '-c') {
      options.console = true
    } else if (arg === '--nollup' || arg === '-n') {
      // prefer nollup over rollup
      options.nollup = true
    } else if (arg === '--logs' || arg === '-l') {
      options.logs = true
    } else if (arg === '--watch-dir' || arg === '-w') {
      options.watch = true
      maybeSetKey = 'watchDirs.push'
    } else if (arg === '--watch-self') {
      options.watch = true
      options.watchSelf = true
    } else if (arg === '--watch-loader') {
      options.watch = true
      options.watchLoader = true
    } else if (arg === '--sanity') {
      options.selfTest = true
      options.watchSelf = true
    } else if (arg === '--self') {
      options.selfTest = true
      options.watchSelf = true
      options.selfTestOnly = true
    } else if (arg === '--steps') {
      options.detail = Math.max(options.detail || 0, 2)
    } else if (arg === '--detail' || arg === '-d') {
      // setKey = 'detail'
      options.detail = Math.max(options.detail || 0, 1)
    } else if (arg === '--min') {
      options.detail = Math.min(options.detail || 0, 0)
    } else if (arg === '--user-data-dir') {
      setKey = 'userDataDir'
    } else if (maybeSetKey) {
      options[maybeSetKey] = arg
      maybeSetKey = null
    } else {
      return true
    }
  })

  let error = false

  ;(() => {
    const { appPaths } = options

    if (positionals.length > 0) {
      positionals.forEach(arg => {
        if (arg.slice(0, 1) === '-') {
          error = 'Invalid option: ' + arg
          return
        }
      })

      if (appPaths) {
        const apps = []
        positionals = positionals.filter(arg => {
          const app = appPaths[arg]
          if (app) {
            if (typeof app === 'object') {
              Object.assign(options, app.config)
              apps.push(app.path)
            } else {
              apps.push(app)
            }
            return false
          }
          return true
        })
        if (apps.length > 0) {
          options.apps = apps
        }
      }
    }

    if (positionals.length > 0) {
      options.app = positionals.shift()
      if (options.apps.length > 0) {
        error = 'Custom app and default apps cannot be used together'
      } else if (positionals.length > 0) {
        error = 'Only one <app> path can be provided'
      }
    }
  })()

  if (help || error) {
    // eslint-disable-next-line no-console
    console.log(helpMessage({ full: help }))
    if (typeof error === 'string') {
      // eslint-disable-next-line no-console
      console.log('ERROR:', error, '\n')
    }
    process.exit(error ? 255 : 0)
  }

  if (options.open && options.watch) {
    // eslint-disable-next-line no-console
    console.warn(
      "Don't use --watch with --open option, it's a mess. Watch will be ignored."
    )
    options.watch = false
  }

  return options
}

const createWatchFilter = ({ watchExtensions, watchNodeModules }) => ({
  path: name,
  stats,
}) => {
  const excludeDirRegex = watchNodeModules
    ? /(?:^|\/)(?:\.git)(?:\/|$)/
    : /(?:^|\/)(?:node_modules|\.git)(?:\/|$)/
  // case: directory
  if (stats.isDirectory()) {
    return !excludeDirRegex.test(name)
  }
  // case: file
  const ext = path.extname(name)
  return watchExtensions.includes(ext)
}

const parents = from => {
  let p = from
  let last
  const result = [from]
  while ((p = path.dirname(p)) && p !== last) {
    result.push(p)
    last = p
  }
  return result
}

export const findRc = async (cwd = process.cwd()) => {
  const target = RC_FILE
  for (const dir of parents(cwd)) {
    const file = path.join(dir, target)
    if (await exists(file)) {
      return file
    }
  }
  // eslint-disable-next-line no-console
  console.error('Failed to find .thcrc.js file from %s', cwd)
  process.exit(1)
}

// Run mocha programmatically:
//   https://github.com/mochajs/mocha/wiki/Using-mocha-programmatically
const doRun = async (rcOptions = {}) => {
  let mocha
  let files
  let runAgain
  let runner

  const {
    cwd = process.cwd(),
    root = cwd,
    bootstrap,
    files: filesPattern = 'test/**/*.spec.js',
    ...rcDefaults
  } = rcOptions

  const options = parseArgs(process.argv, {
    ...defaultOptions,
    ...convertRcOptions(p => (p && path.resolve(root, p)) || p, rcDefaults),
  })

  const {
    watch,
    watchSelf,
    watchLoader,
    apps,
    app,
    detail,
    selfTest,
    selfTestOnly,
    open,
    keepOpen,
    break: breakAfter,
    userDataDir,
    logs,
    nollup,
    fs: useFs,
    fixtures,
    fixturesDir,
    resetGlob,
  } = options

  let useApp
  if (apps.length > 0) {
    if (apps.length === 1) {
      useApp = apps[0]
    } else {
      // TODO
      throw new Error('TODO')
    }
  } else {
    // don't use default appPath with self only: if app path is provided, e2e
    // self tests will be run, else marked as pending
    useApp = await resolveAppPath(app, cwd, selfTestOnly)
  }

  const appPath = useApp

  if (!selfTestOnly && !fs.existsSync(appPath)) {
    // eslint-disable-next-line no-console
    console.error('App not found: ' + appPath)
    process.exit(1)
  }

  const runMocha = async () => {
    if (mocha) {
      mocha.unloadFiles()
    }

    files = []

    mocha = new Mocha({
      reporter: 'mocha-unfunk-reporter',
      timeout: open ? Infinity : 5000,
      slow: 1500,
    })

    files.push(abs('bootstrap.run.js'))

    if (selfTest) {
      const testHmrDir = path.dirname(__dirname)
      const selfTestDir = path.join(testHmrDir, 'test')
      const selfTestFiles = await glob(`${selfTestDir}/**/*.spec.js`)
      files.push(...selfTestFiles)
    }

    if (!selfTestOnly) {
      const testFiles = (await glob(filesPattern, { cwd: root })).map(file =>
        path.resolve(root, file)
      )
      files.push(...testFiles)
    }

    files.forEach(file => {
      mocha.addFile(file)
    })

    runAgain = false

    // see: https://stackoverflow.com/a/29802434/1387519
    runner = mocha.run(() => {
      runner = null
      if (runAgain) {
        runMocha().catch(err => {
          // eslint-disable-next-line no-console
          console.error(err.stack)
        })
      }
    })
  }

  if (watch) {
    const CheapWatch = require('cheap-watch')

    const apply = () => {
      const files = getWatchedFiles()
      files.forEach(Mocha.unloadFile)
      if (runner) {
        runner.abort()
      } else {
        runMocha().catch(err => {
          // eslint-disable-next-line no-console
          console.error(err.stack)
        })
      }
    }

    let applyTimeout = null

    const schedule = () => {
      clearTimeout(applyTimeout)
      applyTimeout = setTimeout(apply, 20)
    }

    const rerun = () => {
      runAgain = true
      schedule()
    }

    const watchDirs = new Set()

    if (watchSelf) {
      let selfDir = path.dirname(require.resolve('test-hmr'))
      selfDir = path.resolve(selfDir)
      watchDirs.add(selfDir)
    }

    if (watchLoader) {
      const loaderPath = path.resolve(`${appPath}/node_modules/svelte-loader`)
      watchDirs.add(loaderPath)
      const devHelperPath = path.resolve(
        `${appPath}/node_modules/svelte-dev-helper`
      )
      watchDirs.add(devHelperPath)
    }

    if (!selfTestOnly) {
      watchDirs.add(abs('test'))
      if (appPath) {
        watchDirs.add(appPath)
      }
    }

    if (options.watchDirs) {
      options.watchDirs.forEach(dir => watchDirs.add(dir))
    }

    const getWatchedFiles = () => {
      const files = new Set()
      for (const watch of watches) {
        const { dir } = watch
        for (const [name, stat] of watch.paths) {
          if (stat.isFile()) {
            files.add(path.resolve(path.join(dir, name)))
          }
        }
      }
      return [...files]
    }

    const filter = createWatchFilter(options)

    const watches = await Promise.all(
      [...watchDirs].map(async dir => {
        // eslint-disable-next-line no-console
        console.info('Watching dir', dir)

        const watch = new CheapWatch({
          dir,
          filter,
        })

        await watch.init()

        watch.on('+', rerun)
        watch.on('-', rerun)

        return watch
      })
    )
  }

  config.set({
    appPath: appPath,
    bootstrap,
    e2e: appPath ? true : 'skip',
    // keepRunning: keep server running between full watch runs
    keepRunning: !!watch,
    detail,
    open,
    // keepOpen: keep puppeteer open & server running after run
    keepOpen,
    break: breakAfter,
    console: options.console,
    logs,
    userDataDir,
    nollup,
    fs: useFs,
    fixtures,
    fixturesDir,
    resetGlob,
  })

  return runMocha()
}

export const run = (_findRc = findRc) =>
  Promise.resolve(_findRc())
    .then(async rcFile => {
      const m = await import(rcFile)
      const options = (m && m.default) || m
      const args = process.argv.slice(1)
      return doRun({
        root: path.dirname(rcFile),
        ...options,
        args,
      })
    })
    .catch(err => {
      // eslint-disable-next-line no-console
      console.error(err)
    })
