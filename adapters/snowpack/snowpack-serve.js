import * as path from 'path'
import relative from 'require-relative'

export default async ({
  root,
  ports: [port, hmrPort],
  // reload = false,
  reload = true,
} = {}) => {
  const snowpackPath = relative.resolve('snowpack', root)
  const { startServer, createConfiguration } = await import(snowpackPath)

  const configPath = path.resolve(root, 'snowpack.config.js')

  const { default: userConfig } = await import(configPath)

  const baseConfig = {
    root: root,
    ...userConfig,
    devOptions: {
      open: 'none',
      output: 'stream',
      port,
      hmrPort,
      ...userConfig.devOptions,
    },
  }

  const config = createConfiguration(baseConfig)

  const protocol = config.devOptions.secure ? 'https' : 'http'

  const url = `${protocol}://${config.devOptions.hostname}:${port}`

  if (reload) {
    // TODO would that ever be a need? (doesn't work with non-linked Snowpack)
    // await require('snowpack/lib/util').clearCache()
  }

  const server = await startServer({ config })

  const close = async () => await server.shutdown()

  return { close, url }
}
