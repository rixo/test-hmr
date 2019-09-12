const fromEntries = entries => {
  const o = {}
  for (const [k, v] of entries) {
    o[k] = v
  }
  return o
}

module.exports = {
  fromEntries,
}
