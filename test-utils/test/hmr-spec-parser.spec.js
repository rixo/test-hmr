const { parse } = require('../hmr-spec-parser')

const testParseWith = it => (source, ...args) => {
  it(source, async () => {
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
        expect(cur).to.deep.include(arg)
      }
    }
  })
}

const testParse = Object.assign(testParseWith(it), {
  only: testParseWith(it.only),
  skip: testParseWith(it.skip),
})

describe.only('hmr spec parser.parse', () => {
  it('is a function', () => {
    expect(typeof parse).to.equal('function')
  })

  describe('files', () => {
    describe('command', () => {
      testParse(`---- file.txt ----`, ast => {
        expect(ast.files)
          .to.be.an('array')
          .of.length(1)
        expect(ast.files[0]).to.contain({ path: 'file.txt' })
      })

      testParse(
        `
          ---- file.txt ----
        `,
        ast => ast.files[0],
        { path: 'file.txt' }
      )
    })

    describe('text lines', () => {
      testParse(
        `
          ---- file.txt ----
          line1`,
        ast => {
          expect(ast.files, 'ast.files')
            .to.be.an('array')
            .of.length(1)
          expect(ast.files[0]).to.include({ path: 'file.txt' })
        }
      )
      testParse(
        `
          ---- file.txt ----
          line1
          line2
        `,
        ast => {
          expect(ast.files, 'ast.files')
            .to.be.an('array')
            .of.length(1)
          expect(ast.files[0]).to.include({ path: 'file.txt' })
        }
      )
    })

    describe('multiple files', () => {
      testParse(
        `
          ---- file.txt ----
          ---- file2.foo ----
        `,
        ast => {
          expect(ast.files, 'ast.files')
            .to.be.an('array')
            .of.length(2)
          expect(ast.files[0]).to.include({ path: 'file.txt' })
          expect(ast.files[1]).to.include({ path: 'file2.foo' })
        }
      )
      testParse(
        `
          ---- file.txt ----
          line 1
          ---- file2.foo ----
          line 2
        `,
        ast => {
          expect(ast.files, 'ast.files')
            .to.be.an('array')
            .of.length(2)
          expect(ast.files[0]).to.include({ path: 'file.txt' })
          expect(ast.files[1]).to.include({ path: 'file2.foo' })
        }
      )
    })

    describe('single line conditions', () => {
      testParse(
        `
          ---- file.txt ----
          ::0 cond1
        `,
        ast => ast.files[0],
        { path: 'file.txt' },
        file => file.content.parts,
        parts => {
          expect(parts)
            .to.be.an('array')
            .of.length(2)
        },
        parts => parts[0],
        parts0 => {
          expect(parts0).to.include({ condition: '0' })
          expect(parts0.content).to.include({ text: 'cond1\n' })
        }
      )

      testParse(
        `
          ---- file.txt ----
          ::0 cond1`,
        ast => {
          expect(ast.files, 'ast.files')
            .to.be.an('array')
            .of.length(1)
        },
        ast => ast.files[0],
        { path: 'file.txt' },
        file => {
          expect(file.content.parts, 'file.content.parts')
            .to.be.an('array')
            .of.length(1)
          expect(file.content.parts[0].condition).to.equal('0')
          expect(file.content.parts[0].content).to.include({ text: 'cond1' })
        }
      )

      testParse(
        `
          ---- file.txt ----
          line1
          ::0 cond1
          line2
        `,
        ast => {
          expect(ast.files, 'ast.files')
            .to.be.an('array')
            .of.length(1)
        },
        ast => ast.files[0],
        { path: 'file.txt' },
        file => {
          expect(file.content.parts, 'file.content.parts')
            .to.be.an('array')
            .of.length(3)
          expect(file.content.parts[1].condition).to.equal('0')
          expect(file.content.parts[1].content).to.include({ text: 'cond1\n' })
        }
      )

      testParse(
        `
          ---- file.txt ----
          line1
          ::0 cond1
          line2`,
        ast => {
          expect(ast.files, 'ast.files')
            .to.be.an('array')
            .of.length(1)
        },
        ast => ast.files[0],
        { path: 'file.txt' },
        file => {
          expect(file.content.parts, 'file.content.parts')
            .to.be.an('array')
            .of.length(3)
        }
      )
    }) // single line conditions

    describe('multiline conditions', () => {
      testParse(
        `
          ---- file.txt ----
          ::0 {
            cond1
          }`,
        ast => {
          expect(ast.files, 'ast.files')
            .to.be.an('array')
            .of.length(1)
        },
        ast => ast.files[0],
        { path: 'file.txt' },
        file => {
          expect(file.content.parts, 'file.content.parts')
            .to.be.an('array')
            .of.length(1)
          expect(file.content.parts[0].condition).to.equal('0')
          expect(file.content.parts[0].content.text).to.match(/\s*cond1\s*/)
        }
      )

      testParse(
        `
          ---- file.txt ----
          ::0 {
            cond1
            cond1-2
          }`,
        ast => {
          expect(ast.files, 'ast.files')
            .to.be.an('array')
            .of.length(1)
        },
        ast => ast.files[0],
        { path: 'file.txt' },
        file => {
          expect(file.content.parts, 'file.content.parts')
            .to.be.an('array')
            .of.length(1)
          expect(file.content.parts[0].condition).to.equal('0')
          expect(file.content.parts[0].content.text).to.match(
            /\s*cond1\s*cond1-2\s*/
          )
        }
      )

      testParse(
        `
          ---- file.txt ----
          line before
          ::0 {
            cond1
          }
        `,
        ast => {
          expect(ast.files, 'ast.files')
            .to.be.an('array')
            .of.length(1)
          expect(ast.files[0]).to.include({ path: 'file.txt' })
          return ast.files[0]
        },
        file => {
          expect(file.content.parts, 'file.content.parts')
            .to.be.an('array')
            .of.length(3)
          expect(file.content.parts[1].condition).to.equal('0')
          expect(file.content.parts[1].content.text).to.match(/\s*cond1\s*/)
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
          ::1 {
            cond1
          }
          line after
          ::2 { cond2 }
          ::3 cond3 multi word
          line zz
          ---- tmp/foo.txt ----
          ::0 {
            foo
          }
          ::1 { bar }
          baz
        `,
        ast => {
          expect(ast.files, 'ast.files')
            .to.be.an('array')
            .of.length(2)
          expect(ast.files[0]).to.include({ path: 'file.txt' })
          expect(ast.files[1]).to.include({ path: 'tmp/foo.txt' })
          return ast.files
        },
        files => {
          expect(files[0].content.parts, 'file.content.parts[0]')
            .to.be.an('array')
            .of.length(8)
          expect(files[1].content.parts, 'file.content.parts[1]')
            .to.be.an('array')
            .of.length(3)
        }
      )
    })
  }) // files
})
