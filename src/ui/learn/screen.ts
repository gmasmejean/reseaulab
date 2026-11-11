import { screenElement } from '../../learn/content/screen';

/** How long an element of the screen blinks when a card shows it. */
const FLASH_MS = 2400;

/**
 * « Me montrer » : makes the element marked `data-ui="<id>"` blink on the
 * screen. Returns where to find it instead when it is not displayed (another
 * mode, a hidden tool).
 */
export function showOnScreen(id: string): { shown: true } | { shown: false; where: string } {
  // What is not displayed is not rendered at all (see App and Toolbar).
  const element = [...document.querySelectorAll<HTMLElement>('[data-ui]')].find((e) => e.dataset.ui === id);
  if (!element) {
    return { shown: false, where: screenElement(id)?.where ?? 'pas affiché pour le moment' };
  }
  // Every element of the list sits in a fixed part of the screen: no scrolling needed.
  element.classList.remove('ui-flash');
  // Reading the layout restarts the animation when it is asked again.
  element.getBoundingClientRect();
  element.classList.add('ui-flash');
  window.setTimeout(() => {
    element.classList.remove('ui-flash');
  }, FLASH_MS);
  return { shown: true };
}
