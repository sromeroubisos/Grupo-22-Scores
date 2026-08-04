'use client';

import { useCallback, useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Only the topmost dialog answers Escape and Tab, so a drawer opened from the
// bottom sheet doesn't close both surfaces on a single keypress.
const openDialogs: symbol[] = [];

let scrollLocks = 0;
let previousBodyOverflow = '';
let previousHtmlOverflow = '';

function lockScroll() {
  if (scrollLocks === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousHtmlOverflow = document.documentElement.style.overflow;
    // iOS Safari doesn't honour overflow:hidden on html alone.
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }
  scrollLocks += 1;
}

function releaseScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousHtmlOverflow;
  }
}

// offsetParent is null for position:fixed elements, which is what every drawer
// and sheet here is, so visibility has to be measured from client rects.
function visibleFocusable(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

type UseDialogOptions = {
  open: boolean;
  onClose: () => void;
  /** id of the element that names the dialog. Preferred over `label`. */
  labelledBy?: string;
  label?: string;
  lockPageScroll?: boolean;
  /**
   * 'menu' opts into arrow-key navigation over `itemSelector` and drops
   * aria-modal, which does not belong on a menu. Declaring role="menu" without
   * the arrow keys promises a keyboard model that isn't there.
   */
  role?: 'dialog' | 'menu';
  itemSelector?: string;
};

/**
 * Gives a dialog the five behaviours none of the tournament drawers had:
 * focus moved in on open, focus trapped while open, focus returned to the
 * trigger on close, Escape to dismiss, and a page scroll lock. Returns the ARIA
 * props too, so a surface can't be wired up without an accessible name.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>({
  open,
  onClose,
  labelledBy,
  label,
  lockPageScroll = true,
  role = 'dialog',
  itemSelector = '[role="menuitem"]',
}: UseDialogOptions) {
  const ref = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const openRef = useRef(open);
  openRef.current = open;
  const hasFocusedRef = useRef(false);

  const focusInto = (node: T) => {
    const first = visibleFocusable(node)[0];
    if (first) {
      first.focus();
    } else {
      node.tabIndex = -1;
      node.focus();
    }
  };

  // Callback ref rather than focusing from the effect: these surfaces mount
  // through useAnimatedDisclosure, which renders the panel one commit *after*
  // `open` flips. An effect keyed on `open` therefore runs while the node is
  // still null and the focus move is silently lost. This fires whenever the
  // node actually attaches.
  const setRef = useCallback((node: T | null) => {
    ref.current = node;
    if (node && openRef.current && !hasFocusedRef.current) {
      hasFocusedRef.current = true;
      focusInto(node);
    }
  }, []);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;

    const id = Symbol('dialog');
    openDialogs.push(id);
    const isTopmost = () => openDialogs[openDialogs.length - 1] === id;

    const restoreTo = document.activeElement as HTMLElement | null;

    if (lockPageScroll) lockScroll();

    // Covers the case where the node is already mounted when `open` flips.
    if (ref.current && !hasFocusedRef.current) {
      hasFocusedRef.current = true;
      focusInto(ref.current);
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost()) return;

      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      const current = ref.current;
      if (!current) return;

      if (role === 'menu' && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const items = Array.from(current.querySelectorAll<HTMLElement>(itemSelector)).filter(
          (el) => el.getClientRects().length > 0,
        );
        if (items.length === 0) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLElement);
        let next: number;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = items.length - 1;
        else if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % items.length;
        else next = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length;
        items[next].focus();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = visibleFocusable(current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!current.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const index = openDialogs.indexOf(id);
      if (index !== -1) openDialogs.splice(index, 1);
      if (lockPageScroll) releaseScroll();
      hasFocusedRef.current = false;
      // Returning focus is what makes a keyboard dismissal feel like the sheet
      // closed, rather than dropping the user back at the top of the document.
      if (restoreTo && document.contains(restoreTo)) {
        restoreTo.focus();
      }
    };
  }, [open, lockPageScroll, role, itemSelector]);

  const dialogProps = {
    role,
    // aria-modal describes a dialog that blocks the rest of the page; a menu
    // isn't one, and asserting it there confuses screen reader navigation.
    ...(role === 'dialog' ? { 'aria-modal': true } : {}),
    ...(labelledBy ? { 'aria-labelledby': labelledBy } : {}),
    ...(!labelledBy && label ? { 'aria-label': label } : {}),
  };

  return { ref: setRef, dialogProps };
}
