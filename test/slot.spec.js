describe('slots', () => {
  testHmr`
    # updates default slot when parent changes

    --- App.svelte ---

    <script>
      import Child from './Child'
    </script>

    ::0 <Child />
    ::1 <Child>I am Slot</Child>

    --- Child.svelte ---

    <h2>
      <slot>I am Child</slot>
    </h2>

    * * * * *

    ::0 <h2>I am Child</h2>
    ::1 <h2>I am Slot</h2>
  `

  testHmr`
    # updates default slot when child changes

    --- App.svelte ---

    <script>
      import Child from './Child'
    </script>

    <Child>I am Slot</Child>

    --- Child.svelte ---

    <h2>
      ::0 <slot>I am Child</slot>
      ::1 I am Child
    </h2>

    * * * * *

    ::0 <h2>I am Slot</h2>
    ::1 <h2>I am Child</h2>
  `

  testHmr`
    # updates named slot when parent changes

    --- App.svelte ---

    <script>
      import Child from './Child'
    </script>

    ::0 <Child />
    ::1 <Child><span slot="div">Hello</span></Child>
    ::2 <Child><span slot="p">Hello</span></Child>
    ::3 <Child><span slot="p">Bye</span></Child>

    --- Child.svelte ---

    <div>
      <slot name="div" />
    </div>

    <p>
      <slot name="p">Po po po</slot>
    </p>

    * * * * * * * *

    ::0::
      <div></div>
      <p>Po po po</p>
    ::1::
      <div><span slot="div">Hello</span></div>
      <p>Po po po</p>
    ::2::
      <div></div>
      <p><span slot="p">Hello</span></p>
    ::3::
      <div></div>
      <p><span slot="p">Bye</span></p>
  `

  testHmr`
    # updates named slot when child changes

    --- App.svelte ---

    <script>
      import Child from './Child'
    </script>

    <Child>
      <span slot="dd">Ola</span>
    </Child>

    --- Child.svelte ---

    <div>
      ::0 <slot name="dd" />
      ::1 <slot name="pp" />
      ::2 <slot name="pp" />
    </div>

    <p>
      ::0 <slot name="pp">Pa pa pa</slot>
      ::1 <slot name="dd">Pa pa pa</slot>
      ::2 <slot name="xx">Pa pa pa</slot>
    </p>

    ::2 <h1><slot name="dd" /></h1>

    * * * * * * * *

    ::0:: init

      <div>
        <span slot="dd">Ola</span>
      </div>
      <p>Pa pa pa</p>

    ::1:: move to another element

      <div></div>
      <p>
        <span slot="dd">Ola</span>
      </p>

    ::2:: move to a new element

      <div></div>
      <p>Pa pa pa</p>
      <h1>
        <span slot="dd">Ola</span>
      </h1>
  `
})
