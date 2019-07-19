const { testHmr } = require('../test-utils/testHmr')

describe('HMR: props', () => {
  testHmr`
    # preserves props value

    --- App.svelte ---

    <script>
      import Child from './Child'
    </script>

    <Child name="foo" />
    <Child name="bar" />

    --- Child.svelte ---

    <script>
      export let name = 'Child'
    </script>

    ::0 I am {name}
    ::1 My name is {name}

    * * *

    ::0::
      I am foo
      I am bar
    ::1::
      My name is foo
      My name is bar
  `
})
