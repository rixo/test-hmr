const assert = require('assert')

const cache = new Map()

const put = (key, data) => {
  cache.set(key, data)
}

const get = key => cache.get(key)

const wrap = (fs, op) => (...args) => {
  const passthrough = args.slice(0, args.length - 1)
  const callback = args[args.length - 1]
  const key = `${op}:${passthrough.map(JSON.stringify).join(',')}`
  const cached = get(key)

  if (cached) {
    setTimeout(() => {
      callback(null, cached)
    })
    return
  }

  fs[op].apply(
    fs,
    passthrough.concat((err, data) => {
      if (err) {
        callback(err, data)
        return
      }
      put(key, data)
      callback(err, data)
    })
  )
}

const wrapSync = (fs, opAsync) => {
  const op = `${opAsync}Sync`
  return (...args) => {
    const passthrough = args.slice(0, args.length - 1)
    passthrough.forEach(arg => assert.equal(typeof arg, 'string'))
    const key = `${opAsync}:${passthrough.join('📎')}`
    const cached = get(key)

    if (cached) {
      return cached
    }

    const data = fs[op].apply(fs, passthrough)
    put(key, data)
    return data
  }
}

module.exports = fs => {
  const cached = Object.create(fs)
  Object.assign(cached, {
    readFile: wrap(fs, 'readFile'),
    readdir: wrap(fs, 'readdir'),
    readFileSync: wrapSync(fs, 'readFile'),
    readdirSync: wrapSync(fs, 'readdir'),
  })
  return cached
}
