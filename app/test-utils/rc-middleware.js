const p = require('path')

const express = require('express')

const RemoteControl = ({ root, vfs, onEmit }) => {
  const inSrc = file => (file ? p.join(root, 'src', file) : p.join(root, 'src'))

  const writeSrc = (path, contents) =>
    new Promise((resolve, reject) => {
      const srcPath = inSrc(path)
      vfs.out.mkdirpSync(p.dirname(srcPath))
      vfs.out.writeFile(srcPath, contents, 'utf8', err => {
        if (err) reject(err)
        else resolve(srcPath)
      })
    })

  const router = express.Router()

  router.use(express.json())

  router.get('/_dev/ping', (req, res) => {
    res.send('pong')
  })

  router.post('/_dev/reset', (req, res) => {
    vfs
      .reset()
      .then(() => {
        res.sendStatus(200)
      })
      .catch(err => {
        res.status(500).send(`${err.stack}`)
      })
  })

  router.put('/_dev/src', (req, res) => {
    Promise.all(
      Object.entries(req.body.files).map(([path, contents]) =>
        writeSrc(path, contents)
      )
    )
      .then(paths => Promise.all([onEmit(), vfs.notify(paths)]))
      .then(() => {
        // vfs.notify(paths)
        res.sendStatus(200)
      })
      .catch(error => {
        res.status(500).send(String(error.stack))
      })
  })

  return router
}

module.exports = RemoteControl
