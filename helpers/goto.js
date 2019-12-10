const isUrlRoot = url => url.slice(0, 1) === '/'

// http://foo.biz/about/me => http://foo.biz/
const getBaseUrl = url => /^\w*:\/\/[^/]*\//.exec(url)[0]

export const goto = url => async ({ page }) => {
  const pageUrl = await page.url()
  const baseUrl = isUrlRoot(url) ? getBaseUrl(pageUrl) : pageUrl
  const targetUrl = baseUrl + url
  await page.goto(targetUrl)
}

export const gotoState = url => ({ page }) =>
  // eslint-disable-next-line no-undef
  page.evaluate(url => window.history.pushState({}, '', url), url)

goto.push = gotoState
