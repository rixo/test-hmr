import * as path from 'path'
import * as ports from 'port-authority'

import * as config from './config.js'

const FIXTURES = path.resolve(config.cwd, '../fixtures')

let nextPort = 13000
let nextHmrPort = 14000

let currentInstances = 0
const maxInstances = 15
const queue = []

const freeSlot = () => {
  if (currentInstances < maxInstances) {
    currentInstances++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    queue.push(resolve)
  })
}

const release = () => {
  currentInstances--
  while (queue.length > 0 && currentInstances < maxInstances) {
    currentInstances++
    queue.shift()()
  }
}

const freePorts = async () => {
  const [port, hmrPort] = await Promise.all([
    await ports.find(nextPort),
    await ports.find(nextHmrPort),
  ])
  nextPort = port + 1
  nextHmrPort = hmrPort + 1
  return [port, hmrPort]
}

export default (adapter) => async ({
  fixture = 'default',
  root = fixture.dir || path.resolve(FIXTURES, fixture),
} = {}) => {
  await freeSlot()

  const ports = await freePorts()

  const server = await adapter({ root, ports })

  const protocol = 'http'

  const url = `${protocol}://localhost:${ports[0]}`

  const self = {
    url,

    ...server,

    closed: false,

    close: async () => {
      await server.close()
      self.closed = true
      release()
    },
  }

  return self
}
