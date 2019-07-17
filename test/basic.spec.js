const { init, templates, change, innerText } = testHmr

describe('basic HMR', () => {
  testHmr('updates text content (twice)', function*() {
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

  testHmr('updates child text when child changes', function*() {
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

  testHmr`
    # updates text content

    ---- App.svelte ----

    ::0 <h1>I am App</h1>
    ::1 <h1>I am Reloaded</h1>

    *****

    ::0 <h1>I am App</h1>
    ::1 <h1>I am Reloaded</h1>
  `

  testHmr`
    # updates children elements

    ---- App.svelte ----

    ::0::
      <p>First paragraph</p>
    ::1:: added
      <p>First paragraph</p>
      <p>Second paragraph</p>
    ::2:: changed
      <p>First paragraph</p>
      <p>Last paragraph</p>
    ::3:: inserted
      <p>First paragraph</p>
      <div>Middle</div>
      <p>Last paragraph</p>

    ****

    ::0::
      <p>First paragraph</p>
    ::1::
      <p>First paragraph</p>
      <p>Second paragraph</p>
    ::2::
      <p>First paragraph</p>
      <p>Last paragraph</p>
    ::3::
      <p>First paragraph</p>
      <div>Middle</div>
      <p>Last paragraph</p>
  `

  testHmr`
    # preserves children position when children change

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
