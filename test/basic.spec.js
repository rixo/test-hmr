const {
  testHmr,
  init,
  templates,
  change,
  innerText,
} = require('./utils/testHmr')

describe('basic HMR', () => {
  testHmr('replaces text content (twice)', function*() {
    expect(yield innerText('h1')).to.equal('Hello world!')

    yield change({
      'App.svelte': '<h1>HMRd</h1>',
    })
    expect(yield innerText('h1')).to.equal('HMRd')

    yield change({
      'App.svelte': '<h1>reHMRd</h1>',
    })
    expect(yield innerText('h1')).to.equal('reHMRd')
  })

  testHmr('replaces child text when child changes', function*() {
    yield templates({
      'App.svelte': slot => `
        <script>
          import Child from './Child'
        </script>
        ${slot}
      `,
    })

    yield init({
      'App.svelte': '<Child />',
      'Child.svelte': '<h2>I am Child</h2>',
    })
    expect(yield innerText('h2')).to.equal('I am Child')

    yield change({
      'Child.svelte': '<h2>I am Kid</h2>',
    })
    expect(yield innerText('h2')).to.equal('I am Kid')
  })
})
