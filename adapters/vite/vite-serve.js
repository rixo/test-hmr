import * as path from 'path'
import relative from 'require-relative'

export default async ({
  root,
  ports: [port, hmrPort],
  // TODO would that ever be a need? (doesn't work with non-linked Snowpack)
  // eslint-disable-next-line no-unused-vars
  reload = true,
} = {}) => {
  const vitePath = relative.resolve('vite', root)
  const { createServer } = await import(vitePath)

  const server = await createServer({
    configFile: false,
    root: path.resolve(root),
    clearScreen: false,
    server: {
      port,
      hmr: {
        // TODO doesn't work apparently:
        //     WebSocket connection to 'ws://localhost:14004/' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED
        // port: hmrPort,
      },
    },
  })

  await server.listen()

  const close = async () => await server.close()

  return { close }
}
