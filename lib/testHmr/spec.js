const renderSpecs = ({ specs }, spec) =>
  Object.fromEntries(
    Object.entries(specs)
      .map(([path, fileSpec]) => {
        const content = fileSpec[spec] || fileSpec['*']
        return [path, content]
      })
      .filter(([, step]) => !!step)
  )

const renderChanges = (state, changes) => {
  const { templates } = state
  return Object.fromEntries(
    Object.entries(changes).map(([key, value]) => {
      const template = templates[key]
      const contents = template ? template(value) : value
      return [key, contents]
    })
  )
}

module.exports = { renderSpecs, renderChanges }
