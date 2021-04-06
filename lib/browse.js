/* eslint-env browser */

import * as path from 'path'
import { fileURLToPath } from 'url'
// import { firefox as Browser } from 'playwright'
import { chromium as Browser } from 'playwright'

import getConfig from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let latches = 0
let locks = 0
let browserPromise

const getBrowser = async (opts) => {
  latches++
  if (latches === 1) {
    const userDir = path.resolve(__dirname, '../node_modules/.snowgun/chromium')
    const config = await getConfig()
    const defaults = config.open
      ? {
          headless: false,
          slowMo: 200,
          devtools: true,
        }
      : {}
    if (config.open) {
      browserPromise = Browser.launchPersistentContext(userDir, {
        ...defaults,
        ...opts,
      })
    } else {
      browserPromise = Browser.launch({ ...defaults, ...opts })
    }
  }
  return await browserPromise
}

const maybeClose = async () => {
  if (latches === 0 && locks === 0) {
    const browser = await browserPromise
    if (!browser) return
    await browser.close()
  } else if (latches < 0 || locks < 0) {
    throw new Error('Illegal state')
  }
}

const release = async () => {
  latches--
  maybeClose()
}

export const lock = () => {
  locks++
  let released = false
  return () => {
    if (released) return
    released = true
    locks--
    maybeClose()
  }
}

export default async (opts) => {
  const config = await getConfig()
  const browser = await getBrowser(opts)

  const context = config.open ? browser : await browser.newContext()

  const page = await context.newPage()

  await page.evaluate(() => {
    window.console.error = window.console.trace
  })

  if (config.open) {
    page.setDefaultNavigationTimeout(0)
  }

  let released = false

  page.on('close', () => {
    if (released) return
    released = true
    release()
  })

  const close = async () => {
    const config = await getConfig()
    if (!page.isClosed()) {
      if (config.brk) {
        /* eslint-disable no-debugger */
        await page.evaluate(() => {
          // paused by test-hmr
          debugger
        })
        /* eslint-enable no-debugger */
      }
      await page.close()
    }
  }

  return { page, close }
}
