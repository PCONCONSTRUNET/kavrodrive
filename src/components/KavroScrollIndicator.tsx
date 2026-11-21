import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Indicador único de scroll lateral no tema oficial Kavro Drive para mobile/touch (iOS e Android),
 * substituindo o fundo cinza padrão sem duplicar barras com a versão desktop CSS.
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

    const getScrollerEl = (): HTMLElement | null => {
      const el = document.querySelector<HTMLElement>('.kavro-mobile-app-scroll');
      if (!el) return null;
      const ov = window.getComputedStyle(el).overflowY;
      if (ov === 'auto' || ov === 'scroll') return el;
      return null;
    };

    const compute = (scrolling: boolean) => {
      if (!isTouchOrMobile()) {
        setMetrics((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }

      const containerEl = getScrollerEl();
      const scrollHeight = containerEl
        ? containerEl.scrollHeight
        : Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
      const clientHeight = containerEl
        ? containerEl.clientHeight
        : window.innerHeight || document.documentElement.clientHeight;
      const maxScroll = scrollHeight - clientHeight;

      if (maxScroll <= 24 || scrollHeight <= 0) {
        setMetrics((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }

      const rawTop = containerEl
        ? containerEl.scrollTop
        : window.scrollY || document.documentElement.scrollTop || 0;
      const scrollTop = Math.min(Math.max(rawTop, 0), maxScroll);
      const rawThumbPct = (clientHeight / scrollHeight) * 100;
      const thumbHeightPct = Math.min(Math.max(rawThumbPct, 10), 42);
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
      }, 900);
    };

    const onResize = () => scheduleUpdate(false);

    let boundEl: HTMLElement | null = null;
    let observedContent: Element | null = null;

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            bindScrollTarget();
            scheduleUpdate(false);
          })
        : null;

    const bindScrollTarget = () => {
      const nextEl = getScrollerEl();
      if (boundEl !== nextEl) {
        if (boundEl) boundEl.removeEventListener('scroll', onScroll);
        boundEl = nextEl;
        if (boundEl) boundEl.addEventListener('scroll', onScroll, { passive: true });
      }
      const nextContent = nextEl?.firstElementChild || document.body;
      if (ro && nextContent && observedContent !== nextContent) {
        if (observedContent) ro.unobserve(observedContent);
        observedContent = nextContent;
        ro.observe(observedContent);
      }
    };

    bindScrollTarget();
    compute(false);
    const settleTimer = window.setTimeout(() => {
      bindScrollTarget();
      compute(false);
    }, 300);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      window.clearTimeout(settleTimer);
      if (ro) ro.disconnect();
      if (boundEl) boundEl.removeEventListener('scroll', onScroll);
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
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        right: 3,
        width: 4.5,
        backgroundColor: 'transparent',
        pointerEvents: 'none',
        zIndex: 45,
        opacity: metrics.isScrolling ? 0.96 : 0.42,
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
          background: 'linear-gradient(180deg, #8CE826 0%, #76D800 60%, #4EA100 100%)',
          border: '0.5px solid rgba(13, 21, 28, 0.35)',
          boxShadow: '0 0 8px rgba(118, 216, 0, 0.42)',
        }}
      />
    </div>
  );
};
