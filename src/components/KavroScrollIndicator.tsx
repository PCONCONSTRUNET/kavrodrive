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
  const pendingScrollingRef = useRef<boolean>(false);
  const activeScrollerRef = useRef<HTMLElement | null>(null);
  const activeHintTargetRef = useRef<EventTarget | null>(null);

  useEffect(() => {
    activeScrollerRef.current = null;
    activeHintTargetRef.current = null;

    const isTouchOrMobile = () =>
      window.innerWidth < 820 || window.matchMedia('(pointer: coarse)').matches;

    const isEligibleElementScroller = (el: HTMLElement | null): el is HTMLElement => {
      if (!el || !el.isConnected) return false;
      if (el === document.documentElement || el === document.body) return false;
      const ov = window.getComputedStyle(el).overflowY;
      if (ov !== 'auto' && ov !== 'scroll') return false;
      if (el.scrollHeight - el.clientHeight <= 24) return false;
      // Ignora caixas pequenas internas (ex: selects/autocomplete) para acompanhar a página principal
      const vw = window.innerWidth || document.documentElement.clientWidth || 360;
      const vh = window.innerHeight || document.documentElement.clientHeight || 640;
      return el.clientHeight >= vh * 0.4 && el.clientWidth >= vw * 0.55;
    };

    const resolveScroller = (hintTarget?: EventTarget | null): HTMLElement | null => {
      if (hintTarget instanceof HTMLElement && isEligibleElementScroller(hintTarget)) {
        activeScrollerRef.current = hintTarget;
        return hintTarget;
      }
      if (isEligibleElementScroller(activeScrollerRef.current)) {
        return activeScrollerRef.current;
      }
      const appScrollEl = document.querySelector<HTMLElement>('.kavro-mobile-app-scroll');
      if (isEligibleElementScroller(appScrollEl)) {
        activeScrollerRef.current = appScrollEl;
        return appScrollEl;
      }
      return null;
    };

    const getDocumentScrollMetrics = () => {
      const docEl = document.documentElement;
      const bodyEl = document.body;
      const scrollingEl = document.scrollingElement as HTMLElement | null;
      const bodyOv = bodyEl ? window.getComputedStyle(bodyEl).overflowY : '';
      const bodyActsAsScroller = Boolean(
        bodyEl &&
        (bodyOv === 'auto' || bodyOv === 'scroll') &&
        bodyEl.scrollHeight > bodyEl.clientHeight + 24 &&
        bodyEl.clientHeight <= (window.innerHeight || docEl.clientHeight) + 2
      );

      if (bodyActsAsScroller && bodyEl) {
        return {
          scrollHeight: bodyEl.scrollHeight,
          clientHeight: bodyEl.clientHeight,
          scrollTop: bodyEl.scrollTop,
        };
      }

      const scrollHeight = Math.max(
        scrollingEl?.scrollHeight || 0,
        docEl?.scrollHeight || 0,
        bodyEl?.scrollHeight || 0
      );
      const clientHeight = window.innerHeight || docEl?.clientHeight || 0;
      const scrollTop = Math.max(
        window.scrollY || 0,
        scrollingEl?.scrollTop || 0,
        docEl?.scrollTop || 0,
        bodyEl?.scrollTop || 0
      );
      return { scrollHeight, clientHeight, scrollTop };
    };

    const compute = (scrolling: boolean, hintTarget?: EventTarget | null) => {
      if (!isTouchOrMobile()) {
        setMetrics((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }

      const containerEl = resolveScroller(hintTarget);
      const { scrollHeight, clientHeight, scrollTop: rawTop } = containerEl
        ? {
            scrollHeight: containerEl.scrollHeight,
            clientHeight: containerEl.clientHeight,
            scrollTop: containerEl.scrollTop,
          }
        : getDocumentScrollMetrics();

      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 24 || scrollHeight <= 0 || clientHeight <= 0) {
        setMetrics((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }

      const scrollTop = Math.min(Math.max(rawTop, 0), maxScroll);
      const rawThumbPct = (clientHeight / scrollHeight) * 100;
      const thumbHeightPct = Math.min(Math.max(rawThumbPct, 10), 42);
      const progress = maxScroll > 0 ? scrollTop / maxScroll : 0;
      const thumbTopPct = progress * (100 - thumbHeightPct);

      setMetrics((prev) => {
        if (
          prev.visible &&
          prev.isScrolling === scrolling &&
          Math.abs(prev.thumbTopPct - thumbTopPct) < 0.05 &&
          Math.abs(prev.thumbHeightPct - thumbHeightPct) < 0.05
        ) {
          return prev;
        }
        return {
          visible: true,
          thumbTopPct,
          thumbHeightPct,
          isScrolling: scrolling,
        };
      });
    };

    const scheduleUpdate = (scrolling: boolean, hintTarget?: EventTarget | null) => {
      if (scrolling) pendingScrollingRef.current = true;
      if (hintTarget) activeHintTargetRef.current = hintTarget;
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        const isActivelyScrolling = scrolling || pendingScrollingRef.current;
        pendingScrollingRef.current = false;
        compute(isActivelyScrolling, activeHintTargetRef.current);
      });
    };

    const onScroll = (evt: Event) => {
      const target = evt?.target || null;
      if (target === document || target === document.documentElement || target === document.body) {
        activeScrollerRef.current = null;
      }
      scheduleUpdate(true, target);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        scheduleUpdate(false, target);
      }, 900);
    };

    const onResize = () => scheduleUpdate(false);

    const observedSet = new Set<Element>();
    const observeSafely = (roInstance: ResizeObserver | null, el: Element | null | undefined) => {
      if (!roInstance || !el || observedSet.has(el)) return;
      observedSet.add(el);
      roInstance.observe(el);
    };

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            scheduleUpdate(false);
          })
        : null;

    const mo =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            if (!isEligibleElementScroller(activeScrollerRef.current)) {
              activeScrollerRef.current = null;
            }
            const nextContainer = resolveScroller();
            observeSafely(ro, nextContainer);
            observeSafely(ro, nextContainer?.firstElementChild);
            scheduleUpdate(false);
          })
        : null;

    const rootEl = document.getElementById('root') || document.body;
    observeSafely(ro, rootEl);
    const initialContainer = resolveScroller();
    observeSafely(ro, initialContainer);
    observeSafely(ro, initialContainer?.firstElementChild);
    if (mo && rootEl) {
      mo.observe(rootEl, { childList: true, subtree: true });
    }

    compute(false);
    const settleTimer1 = window.setTimeout(() => compute(false), 180);
    const settleTimer2 = window.setTimeout(() => compute(false), 600);

    // Captura fase 'capture: true' pois eventos scroll de containers (como .kavro-mobile-app-scroll e body) não fazem bubble até window
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      window.clearTimeout(settleTimer1);
      window.clearTimeout(settleTimer2);
      if (ro) ro.disconnect();
      if (mo) mo.disconnect();
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      document.removeEventListener('scroll', onScroll, { capture: true });
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
