const express = require('express')

const RemoteControl = ({ writeFiles, reset }) => {
  const router = express.Router()

  router.use(express.json())

  router.get('/_dev/ping', (req, res) => {
    res.send('pong')
  })

  router.post('/_dev/reset', (req, res) => {
    reset()
      .then(() => {
        res.sendStatus(200)
      })
      .catch(err => {
        res.status(500).send(`${err.stack}`)
      })
  })

  router.put('/_dev/src', (req, res) => {
    writeFiles(req.body.files)
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
