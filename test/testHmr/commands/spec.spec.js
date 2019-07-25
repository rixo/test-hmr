const escapeRegExp = require('lodash.escaperegexp')

const hit = require('../hit')

const { spec, $$debug } = require('./commands')

// _`foo` => /\s*foo\s*/
// _('foo', bar', 'baz') => /\s*foo\s*bar\s*baz\s*/
const _ = strings =>
  new RegExp('\\s*' + strings.map(escapeRegExp).join('\\s*') + '\\s*')

describe('command: spec', () => {
  hit.beforeEach()

  it('is a function', () => {
    expect(spec).to.be.a('function')
  })

  hit('is exposed as this.spec', function*() {
    expect(this.spec).to.equal(spec)
  })

  describe('yield spec({...})', () => {
    hit('can registers file specs', function*() {
      yield spec({ foo: 'FOO', bar: { 0: 'BAR' } })
      const state = yield $$debug()
      expect(state.specs).to.deep.equal({
        foo: { '*': 'FOO' },
        bar: { 0: 'BAR' },
      })
    })

    hit('can be called multiple times (before init)', function*() {
      yield spec({ foo: 'FOO', bar: { 0: 'BAR' } })
      yield spec({ baz: { '*': 'BAZ' } })
      const state = yield $$debug()
      expect(state.specs).to.deep.equal({
        foo: { '*': 'FOO' },
        bar: { 0: 'BAR' },
        baz: { '*': 'BAZ' },
      })
    })
  })

  describe('yield spec("string")', () => {
    hit('can be used as a template literal tag', function*() {
      yield spec`
        ---- file ----
        contents ${'part'}
      `
      const state = yield $$debug()
      expect(state.specs).to.matchPattern({
        file: {
          '*': _`contents part`,
        },
      })
    })

    hit('registers simple specs with shortcut', function*() {
      yield spec(`
        ---- ether ----
        I just am.
      `)
      expect(yield $$debug()).to.matchPattern({
        specs: {
          ether: {
            '*': _`I just am`,
          },
        },
      })
    })

    hit('registers multiple specs with shortcut', function*() {
      yield spec(`
        ---- first ----
        I am just above.
        ---- second ----
        I am just bellow.
      `)
      expect(yield $$debug()).to.matchPattern({
        specs: {
          first: {
            '*': _`I am just above`,
          },
          second: {
            '*': _`I am just bellow`,
          },
        },
      })
    })

    hit('can be called multiple times (before init)', function*() {
      yield spec(`
        ---- first ----
        I am just above.
      `)
      yield spec(`
        ---- second ----
        I am just bellow.
      `)
      expect(yield $$debug()).to.matchPattern({
        specs: {
          first: {
            '*': _`I am just above`,
          },
          second: {
            '*': _`I am just bellow`,
          },
        },
      })
    })

    hit('parses single line conditions', function*() {
      yield spec(`
        ---- foo.js ----
        top
        ::0 on 0
        middle
        ::1 on 1
        bottom
      `)
      expect(yield $$debug()).to.matchPattern({
        specs: {
          'foo.js': {
            '*': undefined,
            '0': _(['top', 'on 0', 'middle', 'bottom']),
            '1': _(['top', 'middle', 'on 1', 'bottom']),
          },
        },
      })
    })

    hit('parses multiline conditions', function*() {
      yield spec(`
        ---- first ----
        I am just above.
        ---- foo.js ----
        top
        ::0 on 000
        middle
        ::1::
          function foo() { console.log('bar') }
        :::::
        bottom
        ---- second ----
        I am just bellow.
      `)
      expect(yield $$debug()).to.matchPattern({
        specs: {
          first: {
            '*': _`I am just above.`,
          },
          'foo.js': {
            '*': undefined,
            '0': _(['top', 'on 000', 'middle', 'bottom']),
            '1': _([
              'top',
              'middle',
              "function foo() { console.log('bar') }",
              'bottom',
            ]),
          },
          second: {
            '*': _`I am just bellow.`,
          },
        },
      })
    })

    hit('only parses * for files that have zero condition cases', function*() {
      yield spec(`
        ---- foo ----
        ::0 f00
        ::1 f11
        ---- bar ----
        ::1 b00
        ::2 b22
        ---- baz ----
        I am baz
      `)
      expect(yield $$debug()).to.matchPattern({
        specs: {
          foo: {
            '*': undefined,
            '0': _`f00`,
            '1': _`f11`,
          },
          bar: {
            '*': undefined,
            '1': _`b00`,
            '2': _`b22`,
          },
          baz: {
            '*': _`I am baz`,
          },
        },
      })
    })

    hit('parses expectations', function*() {
      yield spec(`
        ---- file ----
        lorem ipsum
        ****
        before anything:
        ::0::
          expect#0
        ::
        ::1 expect#1
        after all
      `)
      expect(yield $$debug()).to.matchPattern({
        specs: {
          file: {
            '*': _`lorem ipsum`,
          },
        },
        expects: new Map([
          ['0', { steps: [{ html: 'before anything: expect#0 after all' }] }],
          ['1', { steps: [{ html: 'before anything: expect#1 after all' }] }],
        ]),
      })
      yield spec.$$discard()
    })

    describe('expectations subs', () => {
      let sub0
      let sub1
      let sub2

      const fakeSub = i =>
        Object.assign(function*() {}, {
          toJSON: () => 'sub' + i,
          toString: () => 'sub' + i,
        })

      beforeEach(() => {
        sub0 = fakeSub(0)
        sub1 = fakeSub(1)
        sub2 = fakeSub(2)
      })

      hit('parses before & after hooks', function*() {
        yield spec`
          ---- file.ext ---
          filled
          ********
          top
          ::0 ${sub0}
          ::0 ${sub1}
          bottom
        `
        expect(yield $$debug()).to.matchPattern({
          expects: new Map([
            [
              '0',
              {
                before: sub0,
                after: sub1,
                steps: [{ html: 'top bottom' }],
              },
            ],
          ]),
        })
        yield spec.$$discard()
      })

      hit('throws if there are more than 2 hook functions', function*() {
        let error
        try {
          yield spec`
            ---- file.ext ---
            filled
            ********
            top
            ::0 ${sub0}
            ::0 ${sub1}
            ::0 ${sub2}
            bottom
          `
        } catch (err) {
          error = err
        }
        expect(error).not.to.be.undefined
        yield spec.$$discard()
      })

      hit('parses steps in condition blocks', function*() {
        yield spec`
          ---- file.ext ---
          filled
          ********
          top
          ::0 zero
          ::1::
            ${sub0}
            first
            ${sub1}
            second
            ${sub2}
          ::
          bottom
        `
        const state = yield $$debug()
        expect(state.expects).to.matchPattern(
          new Map([
            [
              '0',
              {
                steps: [{ html: 'top zero bottom' }],
              },
            ],
            [
              '1',
              {
                steps: [
                  { sub: sub0 },
                  { html: 'top first bottom' },
                  { sub: sub1 },
                  { html: 'top second bottom' },
                  { sub: sub2 },
                ],
              },
            ],
          ])
        )
        yield spec.$$discard()
      })

      hit('parses last expectation step when not a sub', function*() {
        yield spec`
          ---- file.ext ---
          filled
          ********
          top
          ::0 zero
          ::1::
            ${sub0}
            first
            ${sub1}
            second
            ${sub2}
            last
          ::
          bottom
        `
        const state = yield $$debug()
        expect([...state.expects]).to.matchPattern([
          [
            '0',
            {
              steps: [{ html: 'top zero bottom' }],
            },
          ],
          [
            '1',
            {
              steps: [
                { sub: sub0 },
                { html: 'top first bottom' },
                { sub: sub1 },
                { html: 'top second bottom' },
                { sub: sub2 },
                { html: 'top last bottom' },
              ],
            },
          ],
        ])
        yield spec.$$discard()
      })

      hit('parses multiple step subs on a single line', function*() {
        const sub3 = fakeSub(3)
        yield spec`
          ---- file.ext ---
          filled
          ********
          top
          ::0 zero
          ::1::
            ${(113, '')}
            ${sub0}
            first
            ${sub1}
            second ${sub2} last ${sub3}
            everlast
          ::
          bottom
        `
        const state = yield $$debug()
        expect([...state.expects]).to.matchPattern([
          [
            '0',
            {
              steps: [{ html: 'top zero bottom' }],
            },
          ],
          [
            '1',
            {
              steps: [
                { sub: sub0 },
                { html: 'top first bottom' },
                { sub: sub1 },
                { html: 'top second bottom' },
                { sub: sub2 },
                { html: 'top last bottom' },
                { sub: sub3 },
                { html: 'top everlast bottom' },
              ],
            },
          ],
        ])
        yield spec.$$discard()
      })

      hit('parses multiple step per line in edge cases', function*() {
        const sub3 = fakeSub(3)
        yield spec`
          ---- file.ext ---
          filled
          ********
          top
          ::0::
            f${sub0}i${sub1}rst
            ${sub2}${sub3}
            everlast
          ::
          bottom
        `
        const state = yield $$debug()
        expect([...state.expects]).to.matchPattern([
          [
            '0',
            {
              steps: [
                { html: 'top f bottom' },
                { sub: sub0 },
                { html: 'top i bottom' },
                { sub: sub1 },
                { html: 'top rst bottom' },
                { sub: sub2 },
                { sub: sub3 },
                { html: 'top everlast bottom' },
              ],
            },
          ],
        ])
        yield spec.$$discard()
      })

      hit('parses before and after hooks when there are steps', function*() {
        const sub3 = fakeSub(3)
        const subBefore = fakeSub('before')
        const subAfter = fakeSub('after')
        yield spec`
          ---- file.ext ---
          filled
          ********
          top
          ::1::
            zip
          ::0 ${subBefore}
          ::0::
            f${sub0}i${sub1}rst
            ${sub2}${sub3}
            everlast
          ::0 ${subAfter}
          bottom
        `
        const state = yield $$debug()
        expect([...state.expects]).to.matchPattern([
          ['1', { steps: [{ html: 'top zip bottom' }] }],
          [
            '0',
            {
              before: subBefore,
              after: subAfter,
              steps: [
                { html: 'top f bottom' },
                { sub: sub0 },
                { html: 'top i bottom' },
                { sub: sub1 },
                { html: 'top rst bottom' },
                { sub: sub2 },
                { sub: sub3 },
                { html: 'top everlast bottom' },
              ],
            },
          ],
        ])
        yield spec.$$discard()
      })
    }) // expectation subs

    hit('parses empty condition lines in files', function*() {
      yield spec`
        ---- file.js ----
        ::0
      `
      const state = yield $$debug()
      expect(state).to.matchPattern({
        specs: {
          'file.js': {
            '*': undefined,
            0: _``,
          },
        },
      })
      yield spec.$$discard()
    })

    hit('parses empty condition lines in expects', function*() {
      yield spec`
        ---- file.js ----

        ****
        ::0
      `
      const state = yield $$debug()
      expect(state).to.matchPattern({
        specs: {
          'file.js': {
            '*': _``,
          },
        },
        expects: new Map([['0', { steps: [{ html: _`` }] }]]),
      })
      yield spec.$$discard()
    })

    hit('parses beforeLoad hook', function*() {
      const sub = function*() {}
      yield spec`
        --- file.php ---
        * * *
        ${sub}
        ::0
      `
      const state = yield $$debug()
      expect(state.beforeLoad, 'state.beforeLoad').to.equal(sub)
      yield spec.$$discard()
    })

    hit('parses regex outside of conditions', function*() {
      yield spec`
        ****
        before
        ${/^i am/i}
        aft
        ::0::
          in
        ::
      `
      const state = yield $$debug()
      expect(state).to.matchPattern({
        expects: new Map([
          [
            '0',
            {
              steps: [
                {
                  html: ['before', '/^i am/i', 'aft', 'in'],
                },
              ],
            },
          ],
        ]),
      })
      expect(state.expects.get('0').steps[0].html[1]).to.be.instanceOf(RegExp)
      yield spec.$$discard()
    })

    hit('parses regex in inline conditions', function*() {
      yield spec`
        ****
        before
        ::0 I ${/^AM/i} expected
      `
      const state = yield $$debug()
      expect(state).to.matchPattern({
        expects: new Map([
          [
            '0',
            {
              steps: [
                {
                  html: ['before', 'I', '/^AM/i', 'expected'],
                },
              ],
            },
          ],
        ]),
      })
      expect(state.expects.get('0').steps[0].html[2]).to.be.instanceOf(RegExp)
      yield spec.$$discard()
    })

    hit('parses multiple regexes in inline conditions', function*() {
      yield spec`
        ****
        before
        ::0 I ${/^AM/i} expected ${/for$/} dinner ${/^[.]/}
      `
      const state = yield $$debug()
      expect(state).to.matchPattern({
        expects: new Map([
          [
            '0',
            {
              steps: [
                {
                  html: [
                    'before',
                    'I',
                    '/^AM/i',
                    'expected',
                    '/for$/',
                    'dinner',
                    '/^[.]/',
                  ],
                },
              ],
            },
          ],
        ]),
      })
      yield spec.$$discard()
    })

    hit(
      'parses initial regex in inline conditions with multiple regexes',
      function*() {
        yield spec`
          ****
          before
          ::0 ${/^AM/i} I expected ${/for$/}
        `
        const state = yield $$debug()
        expect(state).to.matchPattern({
          expects: new Map([
            [
              '0',
              {
                steps: [
                  {
                    html: ['before', '/^AM/i', 'I expected', '/for$/'],
                  },
                ],
              },
            ],
          ]),
        })
        yield spec.$$discard()
      }
    )

    hit('parses regex inside block conditions', function*() {
      yield spec`
        ****
        before
        ::0::
          I ${/^AM/i} expected
        ::
      `
      const state = yield $$debug()
      expect(state).to.matchPattern({
        expects: new Map([
          [
            '0',
            {
              steps: [
                {
                  html: ['before', 'I', '/^AM/i', 'expected'],
                },
              ],
            },
          ],
        ]),
      })
      expect(state.expects.get('0').steps[0].html[2]).to.be.instanceOf(RegExp)
      yield spec.$$discard()
    })

    hit('parses multiple regexes inside block conditions', function*() {
      yield spec`
        ****
        before
        ::0::
          I ${/^AM/i} expected ${/for/} dinner
        ::
      `
      const state = yield $$debug()
      expect(state).to.matchPattern({
        expects: new Map([
          [
            '0',
            {
              steps: [
                {
                  html: [
                    'before',
                    'I',
                    '/^AM/i',
                    'expected',
                    '/for/',
                    'dinner',
                  ],
                },
              ],
            },
          ],
        ]),
      })
      yield spec.$$discard()
    })

    hit('parses mixed subs & regexes in block conditions', function*() {
      function* sub() {}
      yield spec`
        ****
        before
        ::0::
          I ${/^AM/i} expected ${/for/} dinner
          ${sub}
          A${/re|m/i}n't ${/i/i}?
        ::
      `
      const state = yield $$debug()
      expect(state).to.matchPattern({
        expects: new Map([
          [
            '0',
            {
              steps: [
                {
                  html: [
                    'before',
                    'I',
                    '/^AM/i',
                    'expected',
                    '/for/',
                    'dinner',
                  ],
                },
                { sub },
                {
                  html: ['before', 'A', '/re|m/i', "n't", '/i/i', '?'],
                },
              ],
            },
          ],
        ]),
      })
      yield spec.$$discard()
    })

    // kitchen sink
    hit('lets mix all styles for maximum expressivity', function*() {
      const sub = function*() {}
      yield spec`
        ---- foo.js ----
        top
        ::0 on 000
        middle
        ::1::
          function foo() { console.log('bar') }
        ::
        bottom
        ---- Bar.svelte ----
        <h1>I am Bar</h1>
        ********
        <h1>Result...</h1>
        ::0
        ::1 <p>has arrived!</p>
        ::2 ${/I/} am ${/regular/}
        ::finally::
          ${/any/} other
          ${sub}
          to ${/the*/} bitter ${/end/}
      `

      const state = yield $$debug()
      expect(state).to.matchPattern({
        // --- Files ---

        specs: {
          'foo.js': {
            '*': undefined,
            0: _(['top', 'on 000', 'middle', 'bottom']),
            1: _([
              'top',
              'middle',
              "function foo() { console.log('bar') }",
              'bottom',
            ]),
          },
          'Bar.svelte': {
            '*': _`<h1>I am Bar</h1>`,
          },
        },

        // --- Expectations ---

        expects: new Map([
          ['0', { steps: [{ html: '<h1>Result...</h1>' }] }],
          ['1', { steps: [{ html: '<h1>Result...</h1><p>has arrived!</p>' }] }],
          [
            '2',
            {
              steps: [
                {
                  html: ['<h1>Result...</h1>', '/I/', 'am', '/regular/'],
                },
              ],
            },
          ],
          [
            'finally',
            {
              steps: [
                { html: ['<h1>Result...</h1>', '/any/', 'other'] },
                { sub },
                {
                  html: [
                    '<h1>Result...</h1>',
                    'to',
                    '/the*/',
                    'bitter',
                    '/end/',
                  ],
                },
              ],
            },
          ],
        ]),
      })

      yield spec.$$discard()
    })
  })
})
