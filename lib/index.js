require('./configure-debug')

const Debug = require('debug')
const debug = Debug('test-hmr:index')
const debugConsole = Debug('test-hmr:console')

const { rcOverHttp } = require('./config')

debug('rcOverHttp: %s', rcOverHttp)

const { writeFiles, reset } = require(rcOverHttp ? './rc-http' : './rc-process')

const config = require('./config')

const getInnerText = el => el.innerText

const innerText = async (page, selector) => {
  return page.$eval(selector, getInnerText)
}

// NOTE HMR client is _not_ ready when page load event fires, we have to
//   wait for HMR ready console message for a reliable hook
const loadPage = async (url, callback, beforeGoto) => {
  debug('loadPage(%s, %callback, %beforeGoto)', url, callback, beforeGoto)
  const page = await browser.newPage()
  try {
    if (config.open) {
      debug('loadPage: unset navigation timeout because of config.open')
      page.setDefaultNavigationTimeout(0)
      page.setDefaultTimeout(0)
    }
    if (beforeGoto) {
      debug('loadPage: running beforeGoto')
      await beforeGoto(page)
    }
    // we don't really want to await on goto because console message is
    // enough, but we _do want_ to catch & propagate goto's possible error
    debug('loadPage: waiting for HMR ready (%s)', config.hmrReadyMessage)
    await Promise.all([
      page.goto(app.baseUrl + url),
      waitConsoleMessage(page, config.hmrReadyMessage),
    ]).then(() => {
      debug('loadPage: HMR ready')
    })
    await callback(page)
  } finally {
    if (config.break) {
      const code = '// You are here because of --break option\ndebugger'
      await page.evaluate(code)
    }
    if (!config.keepOpen) {
      await page.close()
    }
  }
}

const inPage = (...args) => () => loadPage(...args)

const reportConsoleError = (page, reject, firstMsg, buffer = 100) => {
  const messages = [firstMsg]
  const onConsole = msg => {
    if (msg.type() === 'error') {
      messages.push(msg)
    }
  }
  const flush = () => {
    const msg = messages.map(msg => msg.text()).join('\n\n')
    const error = new Error(msg)
    error.name = 'ClientConsoleError'
    reject(error)
  }
  page.on('console', onConsole)
  setTimeout(() => {
    page.removeListener('console', onConsole)
    flush()
  }, buffer)
}

const waitConsoleMessage = (page, ...doneTexts) =>
  new Promise((resolve, reject) => {
    debug('waitConsoleMessage', doneTexts)
    const onConsole = msg => {
      const type = msg.type()
      const text = msg.text()
      debugConsole(type, text)
      if (type === 'error') {
        if (hmrFailTexts.includes(text)) {
          reportConsoleError(page, reject, msg)
        } else {
          wait()
        }
      } else {
        if (doneTexts.includes(text)) {
          resolve()
        } else {
          wait()
        }
      }
    }
    const wait = () => page.once('console', onConsole)
    wait()
  })

const hmrFailTexts = [config.hmrCompileErrorMessage]

const hmrDone = page =>
  waitConsoleMessage(
    page,
    config.hmrDoneMessage,
    config.hmrNothingChangedMessage
  )

const writeHmr = async (page, files) => {
  await writeFiles(files)
  await hmrDone(page)
}

module.exports = {
  writeFiles,
  reset,
  writeHmr,
  innerText,
  loadPage,
  inPage,
  hmrDone,
}
