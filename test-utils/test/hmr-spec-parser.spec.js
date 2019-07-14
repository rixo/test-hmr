const { parse } = require('../hmr-spec-parser')
const escapeRegExp = require('lodash.escaperegexp')

const testParseWith = it => (source, ...args) => {
  it(source, async () => {
    if (args.length < 1) {
      throw new Error('No assertions')
    }
    let ast
    try {
      ast = parse(source)
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
const _ = strings => {
  const text = Array.isArray(strings) ? strings.join('') : strings
  return new RegExp('\\s*' + escapeRegExp(text) + '\\s*')
}

describe('hmr spec parser.parse', () => {
  it('is a function', () => {
    expect(typeof parse).to.equal('function')
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
        ---- file0 ----
      `,
      ast => {
        expect(ast.expectations).to.not.exist
      }
    )

    testParse(
      `
        ****
      `,
      {
        expectations: {
          parts: [{}],
        },
      }
    )

    testParse(`****`, {
      expectations: {
        parts: [],
      },
    })

    testParse(
      `
        ****************************
      `,
      {
        expectations: {
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
              end: 90,
              content: { start: 66, end: 80 },
            },
            { condition: undefined },
          ],
        },
      }
    )
  })

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
  }) // conditions
})
