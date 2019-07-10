const normalizeHtml = require('../../test-utils/normalizeHtml')

describe('test-utils: normalizeHtml', () => {
  it('trims initial white spaces & new lines', () => {
    const result = normalizeHtml(`

      target
    `)
    expect(result).to.equal('target')
  })

  it('dedups white spaces', () => {
    const result = normalizeHtml(`
      left  right
    `)
    expect(result).to.equal('left right')
  })

  it('removes white spaces that are irrelevant in HTML', () => {
    const result = normalizeHtml(`
      <a >  target   </a  >
    `)
    expect(result).to.equal('<a>target</a>')
  })
})
