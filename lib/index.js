const { rcOverHttp } = require('./config')

const { writeFiles, reset } = require(rcOverHttp ? './rc-http' : './rc-process')

// yes, that may be brittle if webpack/dev server ever changes its message
// content, but they're the most readily available source to track HMR state
// (and they conform to HMR user's expectations, so we can argue that we're
// testing that, integration level...)
const hmrReadyMessage = '[WDS] Hot Module Replacement enabled.'
const hmrDoneMessage = '[HMR] App is up to date.'
const hmrNothingChangedMessage = '[WDS] Nothing changed.'
// const hmrCompileErrorMessage = '[WDS] Errors while compiling. Reload prevented.'

const getInnerText = el => el.innerText

const innerText = async (page, selector) => {
  return page.$eval(selector, getInnerText)
}

// NOTE HMR client is _not_ ready when page load event fires, we have to
//   wait for HMR ready console message for a reliable hook
const loadPage = async (url, callback, beforeGoto) => {
  const page = await browser.newPage()
  if (beforeGoto) {
    await beforeGoto(page)
  }
  // we don't really want to await on goto because console message is
  // enough, but we _do want_ to catch & propagate goto's possible error
  await Promise.all([
    page.goto(app.baseUrl + url),
    waitConsoleMessage(page, hmrReadyMessage),
  ])
  await callback(page)
  await page.close()
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
    const onConsole = msg => {
      if (msg.type() === 'error') {
        reportConsoleError(page, reject, msg)
      } else {
        const text = msg.text()
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

const hmrDone = page =>
  waitConsoleMessage(page, hmrDoneMessage, hmrNothingChangedMessage)

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
