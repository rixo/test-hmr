const hit = require('./hit')

const { spec } = require('./commands/commands')

const trinity = (...args) => {
  if (args.length === 1) {
    const [factory] = args
    return trinity(undefined, factory)
  }
  const [run = it, factory, { only = run.only, skip = run.only } = {}] = args
  const handlers = {}
  const create = (name, handler) =>
    factory(handler, (...args) => handlers[name](...args))
  Object.assign(handlers, {
    run: create('run', run),
    only: create('only', only),
    skip: create('skip', skip),
  })
  return Object.assign(handlers.run, handlers)
}

describe('testHmr: expectations', () => {
  let actualHtml
  const getActual = (selector, html) => {
    const selectors = selector.split(',').map(s => s.trim())
    if (selectors.includes('x-focus')) {
      const match = /<x-focus\b[^>]*>([\s\S]*?)<\/x-focus\s*>/.exec(html)
      if (match) {
        return match && match[1]
      }
    }
    if (selectors.includes('[data-focus]')) {
      const match = /<([^\s>]+)[^>]*\bdata-focus\b[^>]*>([\s\S]*)/.exec(html)
      if (match) {
        const [, tag, right] = match
        let nesting = 1
        const closer = `</${tag}`
        const opener = `<${tag}`
        for (let i = 0; i < right.length; i++) {
          if (right.substr(i, opener.length) === opener) {
            nesting++
          } else if (right.substr(i, closer.length) === closer) {
            nesting--
            if (nesting === 0) {
              return right.substr(0, i)
            }
          }
        }
      }
    }
    return html
  }

  let mock
  hit.beforeEach(m => {
    mock = m
    mock.page.$eval = sinon.fake(selector => getActual(selector, actualHtml))
  })

  const passes = trinity(hit, (_hit, recurse) => (...args) => {
    if (args.length === 1) {
      // allows for nicer prettier
      const [title] = args
      return (actualHtml, expected) => recurse(title, actualHtml, expected)
    }
    const [title, actual, expected] = args
    return _hit(`passes ${title}`, function*() {
      actualHtml = actual
      yield spec.expect(0, expected)
    })
  })

  const fails = trinity(_it => (...args) => {
    if (args.length === 1) {
      // allows for nicer prettier
      return (...rest) => fails(...args, ...rest)
    }
    const [title, actual, expected, error] = args
    return _it(`fails ${title}`, async () => {
      actualHtml = actual
      const result = mock.testHmr(function*() {
        yield spec.expect(0, expected)
      })
      await expect(result).to.be.rejectedWith(error)
    })
  })

  passes('with same strings')(`I am foo`, `I am foo`)

  passes('with tags')(
    `<p>I <strong>am</strong> foo</p>`,
    `<p>I <strong>am</strong> foo</p>`
  )

  fails('with missing expected tag')(
    `<p>I <strong>am</strong> foo</p>`,
    `<p>I am foo</p>`,
    'strong'
  )

  fails('with extraneous actual tag')(
    `<p>I am foo</p>`,
    `<p>I <strong>am</strong> foo</p>`,
    'strong'
  )

  passes('with attributes')(
    `<p style="display: all">I am foo</p>`,
    `<p style="display: all">I am foo</p>`
  )

  fails('when attributes have different values')(
    `<p style="display: all">I am foo</p>`,
    `<p style="display: none">I am foo</p>`,
    'none'
  )

  fails('when attributes are missing')(
    `<p style="display: all">I am foo</p>`,
    `<p>I am foo</p>`,
    'style'
  )

  fails('when there are extraneous attributes')(
    `<p>I am foo</p>`,
    `<p style="display: all">I am foo</p>`,
    'style'
  )

  passes('with extra white spaces')(
    `<p style="display: all">I am foo</p>`,
    `
      <p    style="display:    all"    >
        I  am
        foo
        </p >
    `
  )

  passes('when expected has more white spaces')(
    `
      <p    style="display:    all"    >
        I  am
        foo
        </p >
    `,
    `<p style="display: all">I am foo</p>`
  )

  passes('when expected has more white spaces')(
    `
      <p    style="display:    all"    >
        I  am
        foo
        </p >
    `,
    `<p style="display: all">I am foo</p>`
  )

  fails('when a white space is breaking HTML')(
    `
      <p    style="display:    all"    >
        I  am
        foo
        </p >
    `,
    `< p style="display: all">I am foo</p>`,
    '&lt; p style' // TODO this shouldn't be encoded, right?
  )

  describe('<x-focus>', () => {
    passes('with a string')(`before <x-focus>FOCUSD</x-focus> after`, `FOCUSD`)

    passes('with a multiline string')(
      `
        beef
        <x-focus>
          FOC
        </x-focus>
        aft
      `,
      `FOC`
    )

    passes('with a html string')(
      `
        <header>beef</header>
        <div data-focus>
          <p id="pp">
            <span class="pan" hidden>FOC</span>
          </p>
          <div>Child</div>
        </div>
        <footer>aft</footer>
      `,
      `<p id="pp"><span class="pan" hidden>FOC</span></p><div>Child</div>`
    )

    describeE2e('e2e', () => {
      hit.browser('passes with a html string', function*() {
        yield spec`
          --- App.svelte ---

          ::0

          <header>beef</header>
          <x-focus nimp nimp2="2" >
            <p id="pp">
              {#if false}nope{/if}
              <span class="pan" hidden
                >
                FOC
              </span >
            </p>
            <div>Child</div>
          </x-focus>
          <footer>
              aft    </footer>

          * * *

          ::0::

          <p id="pp">
            <span class="pan" hidden>FOC</span>
          </p>
          <div>Child</div>
        `
      })

      hit.browser('fails with a non matching html string', function*() {
        yield spec`
          --- App.svelte ---

          ::0

          <header>beef</header>
          <x-focus>
            <p id="pp">
              <span class="pan" hidden>FOC</span>
            </p>
            <div>Child</div>
          </x-focus>
          <footer>aft</footer>

          * * *

          ::0::

          <p>
            <span class="pan" hidden>FOC</span>
          </p>
          <div>Child</div>
        `
        let error
        try {
          yield spec.$$flush()
        } catch (err) {
          error = err
        }
        expect(error)
          .to.exist.and.have.property('message')
          .that.includes('id="pp"')
      })
    })
  }) // <x-focus>

  describe('[data-focus]', () => {
    passes('with a string')(`before <x-focus>FOCUSD</x-focus> after`, `FOCUSD`)

    passes('with a html string')(
      `
        <header>beef</header>
        <div data-focus>
          <p id="pp">
            <span class="pan" hidden>FOC</span>
          </p>
          <div>Child</div>
        </div>
        <footer>aft</footer>
      `,
      `<p id="pp"><span class="pan" hidden>FOC</span></p><div>Child</div>`
    )

    describeE2e('e2e', () => {
      hit.browser('passes with a html string', function*() {
        yield spec`
          --- App.svelte ---

          ::0

          <header>beef</header>
          <div data-focus="1" >
            <p id="pp">
              {#if false}nope{/if}
              <span class="pan" hidden>
                FOC
              </span>
            </p>
            <div>Child</div>
          </div>
          <footer>aft</footer>

          * * *

          ::0::

          <p id="pp">
            <span class="pan" hidden>FOC</span>
          </p>
          <div>Child</div>
        `
      })

      hit.browser('fails with a non matching html string', function*() {
        yield spec`
          --- App.svelte ---

          ::0

          <header>beef</header>
          <div data-focus>
            <p id="pp">
              <span class="pan" hidden>FOC</span>
            </p>
            <div>Child</div>
          </div>
          <footer>aft</footer>

          * * *

          ::0::

          <p>
            <span class="pan" hidden>FOC</span>
          </p>
          <div>Child</div>
        `
        let error
        try {
          yield spec.$$flush()
        } catch (err) {
          error = err
        }
        expect(error)
          .to.exist.and.have.property('message')
          .that.includes('id="pp"')
      })
    })
  }) // [data-focus]
})
