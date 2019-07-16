const { parse } = require('../hmr-spec/hmr-spec-parser')
const escapeRegExp = require('lodash.escaperegexp')

const parseSpec = (source, ...options) =>
  parse(source, {
    startRule: 'Spec',
    ...options,
  })

const parseFullSpec = (source, ...options) =>
  parse(source, {
    startRule: 'FullSpec',
    ...options,
  })

const parseTitleOnly = (source, ...options) =>
  parse(source, {
    startRule: 'TitleOnly',
    ...options,
  })

const testParseWith = it => (source, ...args) => {
  it(source, async () => {
    if (args.length < 1) {
      throw new Error('No assertions')
    }
    let ast
    try {
      ast = parseSpec(source)
    } catch (err) {
      if (err && err.location) {
        const {
          location: { start },
        } = err
        throw new Error(`${start.line}:${start.column} ${err.message}`)
      }
      throw new Error(`parsing failed: ${err}`)
    }
    let cur = ast
    for (const arg of args) {
      if (typeof arg === 'function') {
        cur = (await arg(cur, ast)) || cur
      } else {
        expect(cur).to.matchPattern(arg)
      }
    }
  })
}

const testParse = Object.assign(testParseWith(it), {
  only: testParseWith(it.only),
  skip: testParseWith(it.skip),
})

// _`foo` => /\s*foo\s*/
// _('foo', bar', 'baz') => /\s*foo\s*bar\s*baz\s*/
const _ = strings =>
  new RegExp('\\s*' + strings.map(escapeRegExp).join('\\s*') + '\\s*')

const __ = (...strings) => _(strings)

describe('hmr spec parser.parse', () => {
  it('is a function', () => {
    expect(typeof parseSpec).to.equal('function')
  })

  describe('files', () => {
    describe('command', () => {
      testParse(`---- file.txt ----`, {
        files: [{ path: 'file.txt' }],
      })

      testParse(
        `
          ---- file.txt ----
        `,
        {
          files: [
            {
              path: 'file.txt',
            },
          ],
        }
      )
    })

    describe('text lines', () => {
      testParse(
        `
          ---- file.txt ----
          line1`,
        {
          files: [{ path: 'file.txt' }],
        }
      )
      testParse(
        `
          ---- file.txt ----
          line1
          line2
        `,
        {
          files: [{ path: 'file.txt' }],
        }
      )
    })

    describe('multiple files', () => {
      testParse(
        `
          ---- file.txt ----
          ---- file2.foo ----
        `,
        {
          files: [{ path: 'file.txt' }, { path: 'file2.foo' }],
        }
      )
      testParse(
        `
          ---- file.txt ----
          line 1
          ---- file2.foo ----
          line 2
        `,
        {
          files: [{ path: 'file.txt' }, { path: 'file2.foo' }],
        }
      )
    })

    describe('single line conditions', () => {
      testParse(
        `
          ---- file.txt ----
          ::0 cond1
        `,
        {
          files: [
            {
              path: 'file.txt',
              content: {
                conditions: ['0'],
                parts: [
                  {
                    condition: '0',
                    text: _`cond1`,
                  },
                  {},
                ],
              },
            },
          ],
        }
      )

      testParse(
        `
          ---- file.txt ----
          ::0 cond1`,
        {
          files: [
            {
              path: 'file.txt',
              content: {
                conditions: ['0'],
                parts: [
                  {
                    condition: '0',
                    text: 'cond1',
                  },
                ],
              },
            },
          ],
        }
      )

      testParse(
        `
          ---- file.txt ----
          ::random cond1`,
        {
          files: [
            {
              path: 'file.txt',
              content: {
                conditions: ['random'],
                parts: [
                  {
                    condition: 'random',
                    text: 'cond1',
                  },
                ],
              },
            },
          ],
        }
      )

      testParse(
        `
          ---- file.txt ----
          line1
          ::bob cond1
          line2
        `,
        {
          files: [
            {
              path: 'file.txt',
              content: {
                conditions: ['bob'],
                parts: [
                  {},
                  {
                    condition: 'bob',
                    content: {
                      text: 'cond1\n',
                    },
                  },
                  {},
                ],
              },
            },
          ],
        }
      )

      testParse(
        `
          ---- file.txt ----
          line1
          ::0 cond1
          line2`,
        {
          files: [
            {
              path: 'file.txt',
              content: {
                conditions: ['0'],
                parts: [
                  {},
                  {
                    condition: '0',
                  },
                  {},
                ],
              },
            },
          ],
        }
      )
    }) // single line conditions

    describe('multiline conditions', () => {
      testParse(
        `
          ---- file.txt ----
          ::0::
            cond1
          ::`,
        {
          files: [
            {
              path: 'file.txt',
              content: {
                conditions: ['0'],
                parts: [
                  {
                    condition: '0',
                    text: _`cond1`,
                    content: {
                      text: _`cond1`,
                    },
                  },
                ],
              },
            },
          ],
        }
      )

      testParse(
        `
          ---- file.txt ----
          ::   randy spacy   ::
            cond1
          ::`,
        {
          files: [
            {
              path: 'file.txt',
              content: {
                conditions: ['randy spacy'],
                parts: [
                  {
                    condition: 'randy spacy',
                    text: _`cond1`,
                    content: {
                      text: _`cond1`,
                    },
                  },
                ],
              },
            },
          ],
        }
      )

      testParse(
        `
          ---- file.txt ----
          ::0::
            cond1
            cond1-2
          :::::`,
        {
          files: [
            {
              path: 'file.txt',
              content: {
                conditions: ['0'],
                parts: [
                  {
                    condition: '0',
                    text: /\s*cond1\s*cond1-2\s*/,
                  },
                ],
              },
            },
          ],
        }
      )

      testParse(
        `
          ---- file.txt ----
          line before
          :: 0 :::
            cond1
          :::
        `,
        {
          files: [
            {
              path: 'file.txt',
              content: {
                conditions: ['0'],
                parts: [
                  {},
                  {
                    condition: '0',
                    text: _`cond1`,
                  },
                  {},
                ],
              },
            },
          ],
        }
      )
    }) // multiline conditions

    describe('kichen sink', () => {
      testParse(
        `
          ---- file.txt ----
          line 00
          ::0 cond0
          line before
          :: 1 ::
            cond1
          ::
          line after
          ::2 cond2
          ::3 cond3 multi word
          line zz
          ---- tmp/foo.txt ----
          ::0::
            foo
          ::1::
          bar
          :::::
          baz
        `,
        {
          files: [
            {
              path: 'file.txt',
              content: {
                conditions: ['0', '1', '2', '3'],
                parts: [
                  {
                    condition: undefined,
                  },
                  {
                    condition: '0',
                  },
                  {
                    condition: undefined,
                  },
                  {
                    condition: '1',
                  },
                  {
                    condition: undefined,
                  },
                  {
                    condition: '2',
                  },
                  {
                    condition: '3',
                  },
                  {
                    condition: undefined,
                  },
                ],
              },
            },
            {
              path: 'tmp/foo.txt',
              content: {
                conditions: ['0', '1'],
                parts: [
                  {
                    condition: '0',
                  },
                  {
                    condition: '1',
                  },
                  {
                    condition: undefined,
                  },
                ],
              },
            },
          ],
        }
      )
    })
  }) // files

  describe('expectations', () => {
    testParse(
      `
        --- file0 ---
      `,
      ast => {
        expect(ast.expectations).to.not.exist
      }
    )

    testParse(
      `
        ***
      `,
      {
        expectations: {
          conditions: [],
          parts: [{}],
        },
      }
    )

    testParse(`***`, {
      expectations: {
        conditions: [],
        parts: [],
      },
    })

    testParse(`* * *`, {
      expectations: {
        conditions: [],
        parts: [],
      },
    })

    testParse(
      `
        ****************************
      `,
      {
        expectations: {
          conditions: [],
          parts: [{}],
        },
      }
    )

    testParse(
      `
        * * * * * * * *  *   *    *    *    *   *  * * ** * * *  *  * * * * * *
      `,
      {
        expectations: {
          conditions: [],
          parts: [{}],
        },
      }
    )

    testParse(
      `
        ****
        line 1
        line 2
      `,
      {
        expectations: {
          conditions: [],
          parts: [{ text: /\s*line 1\s*line 2\s*/ }],
        },
      }
    )

    testParse(
      `
        ****
        ::0 cond0
      `,
      {
        expectations: {
          conditions: ['0'],
          parts: [
            { condition: '0', text: _`cond0` },
            { condition: undefined, text: _`` },
          ],
        },
      }
    )

    testParse(
      `
        ****
        line before
        ::0 cond0
        ::1::
        cond1
        ::
        line after
      `,
      {
        expectations: {
          conditions: ['0', '1'],
          parts: [
            { condition: undefined },
            {
              condition: '0',
              text: _`cond0`,
              start: 42,
              end: 52,
              content: { start: 46, end: 52 },
            },
            {
              condition: '1',
              text: _`cond1`,
              start: 60,
              end: 91,
              content: { start: 66, end: 80 },
            },
            { condition: undefined },
          ],
        },
      }
    )

    describe('with files', () => {
      testParse(
        `
          ---- my.file ----
          ****
          ::0 cond0
        `,
        {
          files: [
            {
              path: 'my.file',
              content: {
                parts: [],
              },
            },
          ],
          expectations: {
            conditions: ['0'],
            parts: [
              { condition: '0', text: _`cond0` },
              { condition: undefined, text: _`` },
            ],
          },
        }
      )

      testParse(
        `
          ---- my.file ----
          file content
          ****
          ::0::
          cond0
          ::1::
          cond1
          ::
        `,
        {
          files: [
            {
              path: 'my.file',
              content: {
                parts: [{ text: _`file content` }],
              },
            },
          ],
          expectations: {
            conditions: ['0', '1'],
            parts: [
              { condition: '0', text: _`cond0` },
              { condition: '1', text: _`cond1` },
              { condition: undefined, text: _`` },
            ],
          },
        }
      )
    }) // expectations > with files
  }) // expectations

  describe('conditions', () => {
    testParse(
      `
        ---- file1 ----
        ::0::
          if (false) {
            console.log("}")
          }
        :::::
        line after
      `,
      {
        files: [
          {
            content: {
              conditions: ['0'],
              parts: [
                {
                  condition: '0',
                  text: /\s*if \(false\) \{\s*console\.log\("\}"\)\s*\}\s*/,
                  content: {
                    text: /\s*if \(false\) \{\s*console\.log\("\}"\)\s*\}\s*/,
                  },
                },
                {
                  condition: undefined,
                  text: _`line after`,
                },
              ],
            },
          },
        ],
      }
    )

    testParse(
      `
        ---- file1 ----
        ::0::
          cond0
        ::1::
          cond1
        :::::
        line after
      `,
      {
        files: [
          {
            content: {
              conditions: ['0', '1'],
              parts: [
                {
                  condition: '0',
                  text: _`cond0`,
                },
                {
                  condition: '1',
                  text: _`cond1`,
                },
                {
                  condition: undefined,
                  text: _`line after`,
                },
              ],
            },
          },
        ],
      }
    )

    testParse(
      `
        ---- file1 ----
        ::1 first cond
        med
        ::0::
          cond0
        ::1::
          cond1
        :::::
        ::2 last cond
        line after
      `,
      {
        files: [
          {
            content: {
              conditions: ['1', '0', '2'],
              parts: [
                { condition: '1', text: _`first cond` },
                {
                  condition: undefined,
                  text: _`med`,
                },
                {
                  condition: '0',
                  text: _`cond0`,
                },
                {
                  condition: '1',
                  text: _`cond1`,
                },
                {
                  condition: '2',
                  text: _`last cond`,
                },
                {
                  condition: undefined,
                  text: _`line after`,
                },
              ],
            },
          },
        ],
      }
    )

    testParse(
      `
        ---- file1 ----
        ::0:: comments are allowed here
          cond0
        ::1::
          cond1
          line after
      `,
      {
        files: [
          {
            content: {
              conditions: ['0', '1'],
              parts: [
                {
                  condition: '0',
                  title: 'comments are allowed here',
                  text: _`cond0`,
                },
                {
                  condition: '1',
                  title: '',
                  text: __('cond1', 'line after'),
                },
              ],
            },
          },
        ],
      }
    )

    testParse(
      `
        ---- file1 ----
        ::0::
          cond0
        ::1::
          cond1
          line after
        *****
      `,
      {
        files: [
          {
            content: {
              conditions: ['0', '1'],
              parts: [
                {
                  condition: '0',
                  text: _`cond0`,
                },
                {
                  condition: '1',
                  text: __('cond1', 'line after'),
                },
              ],
            },
          },
        ],
      }
    )

    testParse(
      `
        ****
        before
        ::0::
          step0
        ::1::
          step 1
          after
      `,
      {
        expectations: {
          conditions: ['0', '1'],
          parts: [
            { condition: undefined, text: _`before` },
            { condition: '0', text: _`step0` },
            { condition: '1', text: __('step 1', 'after') },
          ],
        },
      }
    )

    describe('{block}', () => {
      testParse(
        `
          ---- file ----
          ::0
          ::0::
          ::1::
          ::1
        `,
        {
          files: [
            {
              content: {
                parts: [
                  { condition: '0', block: false },
                  { condition: '0', block: true },
                  { condition: '1', block: true },
                  { condition: '1', block: false },
                  { condition: undefined, text: _`` },
                ],
              },
            },
          ],
        }
      )
    }) // {block}
  }) // conditions

  describe('full spec', () => {
    it('accepts a title', () => {
      const ast = parseFullSpec(`
        # My Title
      `)
      expect(ast.title).to.equal('My Title')
    })

    it('throws when title is missing', () => {
      const parse = () => {
        parseFullSpec(`
          ---- my-file ----
        `)
      }
      expect(parse).to.throw('Expected title')
    })

    it('parses title when there are files', () => {
      const ast = parseFullSpec(`
        # My Title

        ---- my.file ----
      `)
      expect(ast.title).to.equal('My Title')
    })
  })

  describe('title only', () => {
    it('parses the title', () => {
      const ast = parseTitleOnly(`
        # My Title`)
      expect(ast.title).to.equal('My Title')
    })

    it('parses the title when there is gibberish after it', () => {
      const ast = parseTitleOnly(`
        # My Title
        NOT ALLOWED BY GRAMMAR
      `)
      expect(ast.title).to.equal('My Title')
    })
  })
})
