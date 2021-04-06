import * as fs from 'fs'
import * as path from 'path'

import { describe, test, browse, fixture, dev, checkpoints } from './index.js'

test('zorax', (t) => {
  t.ok(true)
})

test('browse', browse(), checkpoints(), async (t) => {
  t.ok(t.browser, 'provides t.browser')
  t.ok(t.page, 'provides t.page')

  const check = t.checkpoints(2)

  await t.test('concurency', browse(), async () => {
    check()
  })

  check()
})

// TODO standalone serve without fixture is not supported anymore... any point
// to keep / restore this test?
//
// test('serve', serve(), browse(), async (t) => {
//   t.ok(t.server, 'provides t.server')
//   t.ok(t.server.url, 't.server has a url')
//
//   await t.page.goto(t.server.url)
//
//   t.eq(
//     await t.page.$eval('h1', (el) => el.innerHTML),
//     'Welcome to Snowpack!',
//     'can test the page'
//   )
// })

describe('fixture', () => {
  test('defaults', fixture(), async (t) => {
    t.ok(t.fixture, 'provides t.fixture')
    t.ok(typeof t.fixture.dir === 'string', 't.fixture object has a dir')
  })

  test(
    'fixture inline files',
    fixture([
      {
        'index.js': '// hello',
      },
    ]),
    async (t) => {
      const indexFile = path.resolve(t.fixture.dir, 'src/index.js')
      const index = await fs.promises.readFile(indexFile, 'utf8')
      t.eq(index, '// hello')
    }
  )
})

test('hmr', dev({ fixture: 'hmr', open: true }), async (t) => {
  t.ok(t.hmr, 'provides t.hmr')

  await t.hmr.ready()

  t.pass('sees HMR ready message')

  const innerHTML = 'updated!'

  await Promise.all([
    t.hmr.idle(),
    t.fixture.write({
      'index.js': `
        document.body.innerHTML = ${JSON.stringify(innerHTML)}
        import.meta.hot.accept()
      `,
    }),
  ])

  t.pass('sees HMR complete messages')

  const body = await t.page.$eval('body', (el) => el.innerHTML)
  t.eq(body, innerHTML, 'body has been updated')
})

test('dev', dev({ fixture: 'hmr', open: true }), async (t) => {
  t.ok(t.fixture, 'provides t.fixture')
  t.ok(t.browser, 'provides t.browser')
  t.ok(t.page, 'provides t.page')
  t.ok(t.server, 'provides t.server')
  await t.hmr.ready()
  t.eq(
    await t.page.$eval('h1', (el) => el.innerHTML),
    'bim!',
    'opens the page of the server URL'
  )
})
