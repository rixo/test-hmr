const renderSpecs = ({ specs }, spec) =>
  Object.fromEntries(
    Object.entries(specs)
      .map(([path, fileSpec]) => {
        const content = fileSpec[spec] || fileSpec['*']
        return [path, content]
      })
      .filter(([, step]) => !!step)
  )

module.exports = { renderSpecs }
