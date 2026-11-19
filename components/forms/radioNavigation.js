/** Standard single-select radio keyboard behavior; multi-select stays independent. */
export function radioNavigation(event) {
  const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  if (delta === undefined && event.key !== 'Home' && event.key !== 'End') return;
  const radios = [...event.currentTarget.querySelectorAll('[role="radio"]')].filter(el => !el.disabled && el.getAttribute('aria-disabled') !== 'true');
  if (!radios.length) return;
  event.preventDefault();
  const current = Math.max(0, radios.indexOf(document.activeElement));
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? radios.length - 1 : (current + delta + radios.length) % radios.length;
  radios[index].focus();
  radios[index].click();
}
