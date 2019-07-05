const { expect } = require('chai')

describe('sample test', () => {

  it('runs tests', () => {
    expect(true).to.be.true
  })

  it('can access puppeteer', async () => {
    const version = await browser.version()
    expect(version).not.to.be.undefined
  })

  it('can load app', async function() {
    const page = await browser.newPage()
    await page.goto(baseUrl)
  })
})
