/**
 *     click()
 */

export const click = selector => ({ page }) => page.click(selector)

export const clickButton = (selector = 'button') => click(selector)

export const clickLink = href => click(href ? `a[href="${href}"]` : 'a')
