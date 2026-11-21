import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Indicador de scroll lateral no tema oficial Kavro Drive para dispositivos touch/iOS/mobile,
 * complementando os estilos CSS de scrollbar em navegadores desktop/Android.
 */
export const KavroScrollIndicator: React.FC = () => {
  const { pathname } = useLocation();
  const [metrics, setMetrics] = useState({
    visible: false,
    thumbTopPct: 0,
    thumbHeightPct: 0,
    isScrolling: false,
  });
  const hideTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const isTouchOrMobile = () =>
      window.innerWidth < 820 || window.matchMedia('(pointer: coarse)').matches;

    const compute = (scrolling: boolean) => {
      if (!isTouchOrMobile()) {
        setMetrics((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }

      const docEl = document.documentElement;
      const scrollHeight = Math.max(docEl.scrollHeight, document.body?.scrollHeight || 0);
      const clientHeight = window.innerHeight || docEl.clientHeight;
      const maxScroll = scrollHeight - clientHeight;

      if (maxScroll <= 24 || scrollHeight <= 0) {
        setMetrics((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }

      const scrollTop = Math.min(Math.max(window.scrollY || docEl.scrollTop || 0, 0), maxScroll);
      const rawThumbPct = (clientHeight / scrollHeight) * 100;
      const thumbHeightPct = Math.min(Math.max(rawThumbPct, 10), 48);
      const progress = maxScroll > 0 ? scrollTop / maxScroll : 0;
      const thumbTopPct = progress * (100 - thumbHeightPct);

      setMetrics({
        visible: true,
        thumbTopPct,
        thumbHeightPct,
        isScrolling: scrolling,
      });
    };

    const scheduleUpdate = (scrolling: boolean) => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        compute(scrolling);
      });
    };

    const onScroll = () => {
      scheduleUpdate(true);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        compute(false);
      }, 950);
    };

    const onResize = () => scheduleUpdate(false);

    compute(false);
    const settleTimer = window.setTimeout(() => compute(false), 350);

    const ro =
      typeof ResizeObserver !== 'undefined' && document.body
        ? new ResizeObserver(() => scheduleUpdate(false))
        : null;
    if (ro && document.body) ro.observe(document.body);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      window.clearTimeout(settleTimer);
      if (ro) ro.disconnect();
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [pathname]);

  if (!metrics.visible) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
        right: 3,
        width: 5,
        borderRadius: 999,
        backgroundColor: 'rgba(13, 21, 28, 0.14)',
        pointerEvents: 'none',
        zIndex: 45,
        opacity: metrics.isScrolling ? 0.96 : 0.45,
        transition: 'opacity 0.25s ease',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${metrics.thumbTopPct}%`,
          height: `${metrics.thumbHeightPct}%`,
          borderRadius: 999,
          background: 'linear-gradient(180deg, #8CE826 0%, #76D800 55%, #4EA100 100%)',
          border: '0.5px solid rgba(13, 21, 28, 0.42)',
          boxShadow: '0 0 8px rgba(118, 216, 0, 0.48)',
        }}
      />
    </div>
  );
};
