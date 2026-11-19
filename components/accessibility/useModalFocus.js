'use client';
import { useEffect, useRef } from 'react';

/** Keep modal navigation keyboard-accessible and its background inert. */
export function useModalFocus(open, ref, onClose, initialFocus) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open || !ref.current) return;
    const root = ref.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    const inert = [];
    for (let node = root; node && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling !== node && sibling instanceof HTMLElement) {
          inert.push([sibling, sibling.inert]);
          sibling.inert = true;
        }
      }
    }
    const controls = () => [...root.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')]
      .filter(el => !el.disabled && el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    document.body.style.overflow = 'hidden';
    (initialFocus?.current ?? controls()[0] ?? root).focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const list = controls();
      const first = list[0], last = list.at(-1);
      if (!first) { event.preventDefault(); root.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const desktop = window.matchMedia('(min-width: 1024px)');
    const onSize = () => { if (desktop.matches) close.current(); };
    document.addEventListener('keydown', onKey, true);
    desktop.addEventListener('change', onSize);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      desktop.removeEventListener('change', onSize);
      document.body.style.overflow = overflow;
      for (const [element, value] of inert) element.inert = value;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, ref, initialFocus]);
}
