const { testHmr } = require('../test-utils/testHmr')

describe('HMR: props', () => {
  testHmr`
    # preserves children props when parent changes

    ---- App.svelte ----

    <script>
      import Child from './Child'
    </script>

    <p>Pre</p>
    <Child name="foo" />
    <p>Mid</p>
    <Child name="bar" />
    <p>Post</p>

    ---- Child.svelte ----

    <script>
      export let name = 'Child'
    </script>

    ::0 <h2>I am {name}</h2>
    ::1 <h3>My name is {name}</h3>

    ****

    <p>Pre</p>
    0:: <h2>I am foo</h2>
    1:: <h2>My name is foo</h2>
    <p>Mid</p>
    0:: <h2>I am bar</h2>
    1:: <h2>My name is bar</h2>
    <p>Post</p>
  `
})
