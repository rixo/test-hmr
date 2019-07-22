/**
 *     const p = yield page()
 *     await p.click('button')
 *     const html = await p.$eval('body', el => el.innerHTML)
 *
 *     yield page.click('button')
 *
 *     const html = yield page.$eval('body', el => el.innerHTML)
 */

const type = 'page'

// Allows to retrieve objects, and proxies method calls to the page instance.
//
//     // retrieve references to objects
//     const page = yield page()
//     const keyboard = yield page.keybard()
//
//     // proxy method calls (also, await on returned promises)
//     yield page.click('button')
//     yield page.keyboard.press('Esc')
//
const PageProxy = (path = []) => {
  // reuse already created proxy objects
  const cache = {}
  return new Proxy(
    (...args) => ({
      type,
      path,
      args,
    }),
    {
      get(target, prop) {
        if (cache[prop]) {
          return cache[prop]
        }
        const proxy = PageProxy([...path, prop])
        cache[prop] = proxy
        return proxy
      },
    }
  )
}

const page = PageProxy()

const resolvePath = (obj, path) => {
  let parent
  let target = obj
  if (path) {
    for (const step of path) {
      parent = target
      target = parent[step]
    }
  }
  return { target, parent }
}

const run = (state, { path, args }) => {
  const { target, parent } = resolvePath(state.page, path)
  if (args) {
    if (typeof target === 'function') {
      return target.apply(parent, args)
    } else {
      if (args.length > 0) {
        throw new Error(
          `page.${path.join('.')} is not a function: the proxy call must ` +
            'have exactly 0 arguments to retrieve the object instance'
        )
      }
      return target
    }
  } else {
    return target
  }
}

module.exports = {
  type,
  command: page,
  handler: { run },
}
