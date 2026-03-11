'use client';

import { useEffect, useState } from 'react';

export function useAnimatedDisclosure(isOpen: boolean, duration = 180) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(isOpen);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let frameId: number | undefined;

    if (isOpen) {
      setShouldRender(true);
      frameId = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
      timeoutId = window.setTimeout(() => setShouldRender(false), duration);
    }

    return () => {
      if (typeof frameId === 'number') {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [duration, isOpen]);

  return {
    isVisible,
    shouldRender,
  };
}
