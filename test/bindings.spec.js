const { clickButton, replaceInputValue } = require('./helpers')

describe('bindings', () => {
  testHmr`
    # preserves bound values when child changes

    --- App.svelte ---

    <script>
      import Child from './Child'
      let value
    </script>

    <Child bind:value />

    {value}

    --- Child.svelte ---

    <script>
      export let value = 0
      const onClick = () => value = value + 1
    </script>

    <button on:click={onClick}>+</button>

    ::0
    ::1 reloaded

    * * *

    <button>+</button>

    ::0::
      0 ${clickButton()} 1
    ::1::
      reloaded 1
  `

  // I'm not entirely sure this is the optimal behaviour but, since the
  // whole script content is going to be executed again on update, I think
  // it is expected that local variables are reset (and I'm affraid doing
  // otherwise might prove confusing). Not entirely sure, though...
  testHmr`
    # resets bound values when owner is updated

    --- App.svelte ---

    <script>
      let value = 123
    </script>

    ::0 <input bind:value />
    ::1 <input type="number" bind:value />

    <div>{value}</div>

    * * *

    ::0:: init

      <input />
      <div>123</div>
      ${replaceInputValue('456')}
      <input />
      <div>456</div>

    ::1:: change input type

      <input type="number" />
      <div>123</div>
  `
})
