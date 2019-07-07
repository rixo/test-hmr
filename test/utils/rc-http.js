// eslint-disable-next-line no-console
console.info('(i) mocha tests are using HTTP RC')

const { expect } = require('chai')
const fetch = require('node-fetch')

const writeFiles = async files => {
  const res = await fetch('http://localhost:8080/_dev/src', {
    method: 'PUT',
    headers: {
      'Content-type': 'application/json',
    },
    body: JSON.stringify({ files }),
  })
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error(await res.text())
  }
  expect(res.status).to.equal(200)
}

const reset = async () => {
  const res = await fetch('http://localhost:8080/_dev/reset', {
    method: 'POST',
  })
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error(await res.text())
  }
  expect(res.status).to.equal(200)
}

module.exports = {
  writeFiles,
  reset,
}
