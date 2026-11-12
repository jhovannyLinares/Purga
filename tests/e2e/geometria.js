// Revisión de geometría que corre en la página (P9). Devuelve la lista de problemas visibles:
// - texto que se sale o se recorta sin «…» y sin el texto completo en `title`
// - la página o la columna central con desplazamiento horizontal
// - menús, avisos y diálogos fuera de la ventana
// - casillas que no quedan a la izquierda de su texto ni centradas con él
() => {
  const problems = []
  const visible = (element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
  }
  const label = (element) => `${element.tagName.toLowerCase()}.${[...element.classList].join('.')} «${(element.textContent || '').trim().slice(0, 50)}»`
  const SLACK_PX = 1

  // 1. texto recortado o desbordado
  for (const element of document.querySelectorAll('body *')) {
    if (!visible(element) || ['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'IMG', 'svg', 'path'].includes(element.tagName)) continue
    const ownText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
    if (!ownText) continue
    const style = getComputedStyle(element)
    if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue
    const overflowsX = element.scrollWidth > element.clientWidth + SLACK_PX && element.clientWidth > 0
    if (!overflowsX) continue
    const ellipsis = style.textOverflow === 'ellipsis'
    const titled = element.closest('[title]')
    if (ellipsis && titled) continue
    problems.push(`texto ${ellipsis ? 'recortado sin title' : 'desbordado'}: ${label(element)} (${element.scrollWidth} > ${element.clientWidth})`)
  }

  // 2. desplazamiento horizontal donde no debe haberlo
  const page = document.scrollingElement
  if (page.scrollWidth > window.innerWidth + SLACK_PX) problems.push(`la página se desplaza en horizontal (${page.scrollWidth} > ${window.innerWidth})`)
  for (const area of document.querySelectorAll('.list, .view-scroll, .detail, .nav, .dialog-body')) {
    if (visible(area) && area.scrollWidth > area.clientWidth + SLACK_PX) problems.push(`desplazamiento horizontal en ${label(area)} (${area.scrollWidth} > ${area.clientWidth})`)
  }

  // 3. capas dentro de la ventana
  for (const layer of document.querySelectorAll('.ctx, .dialog, .toast')) {
    if (!visible(layer)) continue
    const rect = layer.getBoundingClientRect()
    if (rect.left < 0 || rect.top < 0 || rect.right > window.innerWidth + SLACK_PX || rect.bottom > window.innerHeight + SLACK_PX) {
      problems.push(`fuera de la ventana: ${label(layer)} (${Math.round(rect.left)},${Math.round(rect.top)} → ${Math.round(rect.right)},${Math.round(rect.bottom)})`)
    }
  }
  for (const option of document.querySelectorAll('.ctx button')) {
    const key = option.querySelector('.ctx-key')
    const panel = option.closest('.ctx').getBoundingClientRect()
    if (key && key.textContent && key.getBoundingClientRect().right > panel.right + SLACK_PX) problems.push(`atajo fuera del menú: ${label(option)}`)
  }

  // 4. casillas: a la izquierda de su texto y centradas con él
  for (const box of document.querySelectorAll('input[type="checkbox"]')) {
    if (!visible(box)) continue
    const container = box.closest('label, .tr')
    const text = container && [...container.children].find((child) => child !== box && visible(child) && child.textContent.trim())
    if (!text) continue
    const boxRect = box.getBoundingClientRect()
    const textRect = text.getBoundingClientRect()
    if (boxRect.right > textRect.left + SLACK_PX) problems.push(`casilla encima o a la derecha del texto: ${label(text)}`)
    const boxCenter = (boxRect.top + boxRect.bottom) / 2
    if (boxCenter < textRect.top - SLACK_PX || boxCenter > textRect.bottom + SLACK_PX) problems.push(`casilla desalineada de su texto: ${label(text)}`)
  }
  return problems
}
