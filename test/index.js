/* eslint-env mocha */
/* globals browser, baseUrl */

const { expect } = require('chai')
const fetch = require('node-fetch')

const writeFiles = async files => {
  const res = await fetch('http://localhost:8080/_dev/src', {
    method: 'PUT',
    headers: {
      'Content-type': 'application/json',
    },
    body: JSON.stringify({ files }),
  })
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error(await res.text())
  }
  expect(res.status).to.equal(200)
}

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
  writeHmr,
  innerText,
  // loadPage,
  inPage,
  hmrDone,
}
