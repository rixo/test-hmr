const {
  testHmr,
  spec,
  init,
  change,
  innerText,
} = require('../test-utils/testHmr')

describe('HMR (slots)', () => {
  testHmr('updates default slot when parent changes', function*() {
    yield spec(`
      ---- App.svelte ----

      <script>
        import Child from './Child'
        setTimeout(() => {
          debugger
        }, 2500)
      </script>

      ::0 <Child />

      ::1 <Child>I am Slot</Child>

      ---- Child.svelte ----

      <h2>
        <slot>I am Child</slot>
      </h2>
    `)

    yield init(0)
    expect(yield innerText('h2')).to.equal('I am Child')

    yield change(1)
    expect(yield innerText('h2')).to.equal('I am Slot')
  })

  testHmr('updates default slot when child changes', function*() {
    yield spec(`
      ---- App.svelte ----

      <script>
        import Child from './Child'
      </script>

      <Child>I am Slot</Child>

      ---- Child.svelte ----

      <h2>
        ::0 <slot>I am Child</slot>
        ::1 I am Child
      </h2>
    `)

    // yield init({
    //   'App.svelte': `
    //     <script>
    //       import Child from './Child'
    //     </script>
    //     <Child>I am Slot</Child>
    //   `,
    //   'Child.svelte': (val = '<slot>I am Child</slot>') => `
    //     <h2>${val}</h2>
    //   `,
    // })
    yield init(0)
    expect(yield innerText('h2')).to.equal('I am Slot')

    // yield change({
    //   'Child.svelte': 'I am Child',
    // })
    yield change(1)
    expect(yield innerText('h2')).to.equal('I am Child')
  })
})
