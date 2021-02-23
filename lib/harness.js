import * as config from './config.js'
import _browse, { lock as lockBrowser } from './browse.js'
import createFixture from './fixture.js'
import createServe from './serve.js'
import createHmr from './hmr.js'

if (!global.ZOAR_OPTIONS || !global.ZOAR_OPTIONS.zorax) {
  throw new Error('Missing zorax?')
}

const { plug } = require(global.ZOAR_OPTIONS.zorax
  .split('::')
  .slice(0, -1)
  .join('::'))

let loadAdapter = async () => {
  const { serve, hmr } = await import(`../adapters/${config.target}`)
  const loaded = {
    fixture: createFixture(config.target),
    serve: createServe(serve),
    hmr: createHmr(hmr),
  }
  loadAdapter = async () => loaded
  return loaded
}

const closable = (get, supervisor) => (opts) =>
  async function zora_spec_fn(t, next, ...args) {
    if (Array.isArray(next)) {
      if (!next.includes(t.target)) {
        t.skip(`target not applicable: ${t.target} (only: ${next})`)
        return
      }
      next = args.shift()
    }
    const [close, service] = await get(opts)
    try {
      Object.assign(t, service)

      const promises = [next(t, ...args)]

      if (supervisor) {
        promises.push(...supervisor(service).filter(Boolean))
      }

      await Promise.race(promises)
    } finally {
      await close()
    }
  }

// TODO standalone serve without fixture is not supported anymore... any point
// to keep / restore this macro?
//
// export const serve = closable(async (opts) => {
//   const { serve } = await loadAdapter()
//   const { close, ...server } = await serve(opts)
//   return [close, { server }]
// })

export const browse = closable(async (opts) => {
  const { close, ...browser } = await _browse(opts)
  return [
    close,
    {
      browser,
      page: browser.page,
    },
  ]
})

export const fixture = closable(async (opts) => {
  const { fixture: _fixture } = await loadAdapter()
  const fixture = await _fixture(opts)
  return [fixture.close, { fixture }]
})

export const dev = closable(
  async (arg) => {
    const userOpts =
      typeof arg === 'string' || Array.isArray(arg)
        ? { fixture: arg }
        : arg || {}

    const { open = false, ...opts } = userOpts

    const { fixture: _fixture, serve: _serve, hmr: _hmr } = await loadAdapter()

    const { close: closeFixture, ...fixture } = await _fixture(opts.fixture)

    const [
      { close: closeServer, ...server },
      { close: closeBrowser, ...browser },
    ] = await Promise.all([
      _serve({ fixture, ...opts.serve }),
      _browse(opts.browse),
    ])

    const { page } = browser

    const hmr = _hmr({ page, ...opts.hmr })

    if (open) {
      const url = open === true ? '/' : open
      await browser.page.goto(server.url + url)
    }

    return [
      async () => {
        await Promise.all([
          closeBrowser(),
          Promise.resolve().then(async () => {
            await closeServer()
            await new Promise((resolve) => setTimeout(resolve, 100))
            await closeFixture()
          }),
        ])
      },
      {
        fixture,
        server,
        browser,
        page,
        hmr,
      },
    ]
  },
  ({ page, hmr }) => [
    // Timeout
    //
    // NOTE disabled when browser is open for debugging
    //
    !config.open &&
      new Promise((resolve, reject) =>
        setTimeout(() => reject(new Error('Timeout after 5s')), 5000)
      ),
    // Unexpected console errors
    //
    hmr.nextConsoleError().catch((err) => {
      // eslint-disable-next-line no-throw-literal
      throw `Unexpected console error:\n\n${err}`
    }),
    new Promise((resolve, reject) => {
      page.exposeFunction('reportError', (err) => {
        reject(new Error(`Unexpected error: ${err}`))
      })
    }),
    // Unexpected navigation (should not happen with HMR!)
    new Promise((resolve, reject) => {
      let loaded = false
      page.on('framenavigated', () => {
        if (!loaded) {
          loaded = true
          return
        }
        if (hmr.consumeExpectedNavigation()) {
          return
        }
        reject(new Error('Unexpected page navigation'))
      })
    }),
  ]
)

export const { test, describe } = plug([
  {
    name: 'isFunction',
    test(t) {
      t.isFunction = (x, msg = 'should be a function') =>
        t.ok(typeof x === 'function', msg)
    },
  },

  {
    name: 'eqBody',
    test(t) {
      t.eqBody = async (content, message = `body should be ${content}`) =>
        t.eq(await t.page.$eval('body', (el) => el.innerHTML), content, message)
    },
  },

  {
    name: 'report time',
    report() {
      const started = Date.now()
      return () => {
        const elapsed = Date.now() - started
        let msg
        if (elapsed < 1000) {
          msg = `${elapsed}ms`
        } else {
          msg = `${(elapsed / 1000).toFixed(2)}s`
        }
        // eslint-disable-next-line no-console
        console.info(` ${msg}`)
        // eslint-disable-next-line no-console
        console.info()
      }
    },
  },

  {
    name: 'lock browser',
    report: () => lockBrowser(),
  },

  {
    name: 'pageSpy',
    test(t) {
      t.pageSpy = async (name, ...args) => {
        const spy = t.spy(...args)
        await t.page.exposeFunction(name, spy)
        return spy
      }
    },
  },

  {
    name: 'test-hmr target',
    test(t) {
      t.target = config.target
      t.isSnowpack = () => config.target === 'snowpack'
      t.isVite = () => config.target === 'vite'
    },
  },
])
