const { testHmr, init, change, innerText } = require('../test-utils/testHmr')

describe('HMR (slots)', () => {
  testHmr('updates default slot when parent changes', function*() {
    yield init({
      'App.svelte': (val = '<Child />') => `
        <script>
          import Child from './Child'
        </script>
        ${val}
      `,
      'Child.svelte': '<h2><slot>I am Child</slot></h2>',
    })
    expect(yield innerText('h2')).to.equal('I am Child')

    yield change({
      'App.svelte': '<Child>I am Slot</Child>',
    })
    expect(yield innerText('h2')).to.equal('I am Slot')
  })

  testHmr('updates default slot when child changes', function*() {
    yield init({
      'App.svelte': `
        <script>
          import Child from './Child'
        </script>
        <Child>I am Slot</Child>
      `,
      'Child.svelte': (val = '<slot>I am Child</slot>') => `
        <h2>${val}</h2>
      `,
    })
    expect(yield innerText('h2')).to.equal('I am Slot')

    yield change({
      'Child.svelte': 'I am Child',
    })
    expect(yield innerText('h2')).to.equal('I am Child')
  })
})
