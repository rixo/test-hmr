const { inPage, innerText, writeHmr } = require('.')

describe('basic HMR', () => {
  it(
    'replaces text content (twice)',
    inPage('/', async page => {
      expect(await innerText(page, 'h1')).to.equal('Hello world!')

      await writeHmr(page, {
        'App.svelte': '<h1>HMRd</h1>',
      })
      expect(await innerText(page, 'h1')).to.equal('HMRd')

      await writeHmr(page, {
        'App.svelte': '<h1>HMRd (twice)</h1>',
      })
      expect(await innerText(page, 'h1')).to.equal('HMRd (twice)')
    })
  )
})
