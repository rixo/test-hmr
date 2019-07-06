const { expect } = require('chai')
const fetch = require('node-fetch')

const write = async files => {
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

describe('sanity check', () => {
  it('runs tests', () => {
    expect(true).to.be.true
  })

  it('can access puppeteer', async () => {
    const version = await browser.version()
    expect(version).not.to.be.undefined
  })

  it(
    'can load app',
    inPage('/', async page => {
      expect(await innerText(page, 'h1')).to.equal('Hello world!')
    })
  )

  it('can reach webpack rc server', async () => {
    const res = await fetch('http://localhost:8080/_dev/ping')
    expect(res.ok).to.be.true
    expect(res.status).to.equal(200)
    expect(await res.text()).to.equal('pong')
  })

  it(
    'can trigger HMR',
    inPage('/', async page => {
      expect(await innerText(page, 'h1')).to.equal('Hello world!')

      await write({
        'App.svelte': '<h1>HMRd</h1>',
      })

      await hmrDone(page)

      expect(await innerText(page, 'h1')).to.equal('HMRd')
    })
  )

  it(
    'reset overwritten sources for each test',
    inPage('/', async page => {
      expect(await innerText(page, 'h1')).to.equal('Hello world!')
    })
  )
})
