const { rcOverHttp } = require('./config')

const rcUtils = require(rcOverHttp ? './rc-http' : './rc-process')

const { writeFiles, reset } = rcUtils

const innerText = async (page, selector) => {
  return page.$eval(selector, el => el.innerText)
}

const loadPage = async (url, callback) => {
  const page = await browser.newPage()
  await page.goto(baseUrl + url)
  // await new Promise(resolve => page.once('load', resolve))
  await callback(page)
  await page.close()
}

const inPage = (...args) => () => loadPage(...args)

const hmrDone = page =>
  new Promise(resolve => {
    page.on('console', msg => {
      if (msg.text() === '[HMR] App is up to date.') {
        resolve()
      }
    })
  })

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
