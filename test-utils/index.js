const { rcOverHttp } = require('./config')

const rcUtils = require(rcOverHttp ? './rc-http' : './rc-process')

const { writeFiles, reset } = rcUtils

// yes, that may be brittle if webpack/dev server ever changes its message
// content, but they're the most readily available source to track HMR state
// (and they conform to HMR user's expectations, so we can argue that we're
// testing that, integration level...)
const hmrReadyMessage = '[WDS] Hot Module Replacement enabled.'
const hmrDoneMessage = '[HMR] App is up to date.'

const getInnerText = el => el.innerText

const innerText = async (page, selector) => {
  return page.$eval(selector, getInnerText)
}

// NOTE HMR client is _not_ ready when page load event fires, we have to
//   wait for HMR ready console message for a reliable hook
const loadPage = async (url, callback) => {
  const page = await browser.newPage()
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

const waitConsoleMessage = (page, text) =>
  new Promise(resolve => {
    const wait = () =>
      page.once('console', msg => {
        if (msg.text() === text) {
          resolve()
        } else {
          wait()
        }
      })
    wait()
  })

const hmrDone = page => waitConsoleMessage(page, hmrDoneMessage)

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
