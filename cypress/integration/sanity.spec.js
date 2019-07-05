const dedent = require('dedent')

describe('sanity check', () => {
  // it('can access web app', () => {
  //   cy.visit('/')
  //   cy.get('h1').should('have.text', 'Hello world!')
  //   cy.get('p').should('have.text', 'Change me...')
  // })

  // it('can reach dev endpoint', () => {
  //   cy.request('/_dev/ping')
  // })

  it('can reset src', () => {
    cy.resetSrc().its('status').should('equal', 200)
  })

  it('can trigger HMR', () => {
    cy.visit('/')
    cy.get('h1').should('have.text', 'Hello world!')
    cy.wait(100) // fuck it: without wait, HMR client is not ready
    cy.writeSrc({
      'App.svelte': `<h1>High five!</h1>`,
    })
    cy.get('h1').should('have.text', 'High five!')
  })
})
