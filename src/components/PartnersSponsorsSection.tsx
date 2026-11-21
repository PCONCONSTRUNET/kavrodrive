import React from 'react';
import { Award, ExternalLink, Image as ImageIcon, ArrowUpRight } from 'lucide-react';
import { HomePartnerBanner, PartnerBannerArea } from '../types';

interface PartnersSponsorsSectionProps {
  items?: HomePartnerBanner[] | null;
  variant: 'dark' | 'light';
  area?: PartnerBannerArea;
  context?: 'site' | 'client';
  sectionEnabled?: boolean;
  hideWhenEmpty?: boolean;
  isMobile?: boolean;
  compactPreview?: boolean;
  onBecomePartnerClick?: () => void;
}

export function doesBannerBelongToArea(
  item: HomePartnerBanner,
  area: PartnerBannerArea
): boolean {
  if (Array.isArray(item.areas) && item.areas.length > 0) {
    return item.areas.includes(area);
  }
  const p = item.placement || 'both';
  if (p === 'site') return area === 'site';
  if (p === 'client') return area === 'client_home';
  return area === 'site' || area === 'client_home';
}

export function sanitizePartnerHref(rawUrl?: string): string {
  const val = String(rawUrl || '').trim();
  if (!val) return '';
  const withProto = /^https?:\/\//i.test(val)
    ? val
    : /^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(val)
      ? `https://${val}`
      : '';
  if (!withProto) return '';
  try {
    const parsed = new URL(withProto);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }
  return '';
}

export const PartnersSponsorsSection: React.FC<PartnersSponsorsSectionProps> = ({
  items,
  variant,
  area,
  context,
  sectionEnabled = true,
  hideWhenEmpty = false,
  isMobile = false,
  compactPreview = false,
  onBecomePartnerClick,
}) => {
  if (!sectionEnabled) return null;

  const targetArea: PartnerBannerArea =
    area || (context === 'site' || (!context && variant === 'dark') ? 'site' : 'client_home');
  const activeItems = (Array.isArray(items) ? items : [])
    .filter((item) => {
      if (!item || item.active === false || String(item.imageUrl || '').trim().length === 0) {
        return false;
      }
      return doesBannerBelongToArea(item, targetArea);
    })
    .slice()
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));

  if (hideWhenEmpty && activeItems.length === 0) return null;

  const banners = activeItems.filter((item) => item.displayMode === 'banner');
  const logos = activeItems.filter((item) => item.displayMode !== 'banner');
  const isDark = variant === 'dark';

  const buildLoopHalf = <T,>(itemsList: T[], minItems: number): T[] => {
    if (itemsList.length === 0) return [];
    const out: T[] = [];
    while (out.length < minItems) {
      out.push(...itemsList);
    }
    return out;
  };

  const bannerLoopHalf = buildLoopHalf(banners, 4);
  const logoLoopHalf = buildLoopHalf(logos, 8);
  const bannerDurationSec = Math.max(22, bannerLoopHalf.length * 7);
  const logoDurationSec = Math.max(22, logoLoopHalf.length * 3.5);

  const handleItemClick = (linkUrl?: string) => {
    const safeUrl = sanitizePartnerHref(linkUrl);
    if (!safeUrl) return;
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
  };

  if (isDark) {
    return (
      <section
        id="parceiros"
        style={{
          backgroundColor: '#0E141B',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: compactPreview ? 12 : isMobile ? 28 : 40,
          paddingBottom: compactPreview ? 14 : isMobile ? 30 : 42,
          scrollMarginTop: 68,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 1200,
            margin: '0 auto',
            padding: compactPreview ? '0 14px' : isMobile ? '0 18px' : '0 32px',
          }}
        >
          {/* Cabeçalho institucional da área de Parceiros & Patrocinadores */}
          <div
            style={{
              display: 'flex',
              alignItems: isMobile ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: compactPreview ? 8 : 12,
              marginBottom: compactPreview ? 10 : isMobile ? 14 : 20,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: compactPreview ? '0.62rem' : '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#94A3B8',
                  marginBottom: compactPreview ? 2 : 4,
                }}
              >
                Rede Comercial &amp; Parceiros
              </div>
              <h2
                style={{
                  fontSize: compactPreview ? '0.96rem' : isMobile ? '1.18rem' : '1.42rem',
                  fontWeight: 700,
                  color: '#F8FAFC',
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                Empresas conveniadas e apoiadores regionais
              </h2>
            </div>

            {onBecomePartnerClick && (
              <button
                type="button"
                onClick={onBecomePartnerClick}
                style={{
                  height: 36,
                  padding: '0 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  color: '#F8FAFC',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                <span>Anunciar ou ser parceiro</span>
                <ArrowUpRight size={14} color="#94A3B8" />
              </button>
            )}
          </div>

          {activeItems.length === 0 ? (
            <button
              type="button"
              onClick={onBecomePartnerClick}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: isMobile ? '16px' : '18px 22px',
                borderRadius: 10,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: '#131B23',
                color: '#FFFFFF',
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                gap: isMobile ? 12 : 20,
                cursor: onBecomePartnerClick ? 'pointer' : 'default',
              }}
            >
              <div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#F8FAFC' }}>
                  Espaço comercial disponível para marcas e estabelecimentos locais
                </div>
                <div style={{ fontSize: '0.82rem', color: '#94A3B8', marginTop: 4, lineHeight: 1.45 }}>
                  Divulgue postos, comércios e serviços na página oficial e no aplicativo dos passageiros.
                </div>
              </div>
              {onBecomePartnerClick && (
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#E2E8F0',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  <span>Consultar formatos</span>
                  <ArrowUpRight size={14} color="#94A3B8" />
                </span>
              )}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Banners em Destaque (loop contínuo lento na Home oficial; estático apenas no preview do Admin) */}
              {banners.length > 0 && (
                compactPreview ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        banners.length === 1
                          ? 'minmax(0, 360px)'
                          : 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {banners.map((banner) => {
                      const safeHref = sanitizePartnerHref(banner.linkUrl);
                      return (
                        <div
                          key={banner.id}
                          role={safeHref ? 'button' : undefined}
                          tabIndex={safeHref ? 0 : undefined}
                          onClick={() => handleItemClick(banner.linkUrl)}
                          onKeyDown={(e) => {
                            if (safeHref && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              handleItemClick(banner.linkUrl);
                            }
                          }}
                          style={{
                            position: 'relative',
                            width: '100%',
                            aspectRatio: '9 / 2',
                            borderRadius: 10,
                            overflow: 'hidden',
                            backgroundColor: '#131B23',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            boxShadow: '0 8px 22px rgba(0, 0, 0, 0.24)',
                            cursor: safeHref ? 'pointer' : 'default',
                          }}
                        >
                          <img
                            src={banner.imageUrl}
                            alt={banner.name?.trim() || (banner.kind === 'patrocinador' ? 'Banner Patrocinador' : 'Banner Parceiro')}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="kavro-marquee" style={{ borderRadius: 12 }}>
                    <div
                      className="kavro-marquee-track"
                      style={{ animationDuration: `${bannerDurationSec}s` }}
                    >
                      {[0, 1].map((dupIdx) =>
                        bannerLoopHalf.map((banner, idx) => {
                          const safeHref = sanitizePartnerHref(banner.linkUrl);
                          return (
                            <div
                              key={`${dupIdx}-${idx}-${banner.id}`}
                              role={safeHref ? 'button' : undefined}
                              tabIndex={safeHref ? 0 : undefined}
                              onClick={() => handleItemClick(banner.linkUrl)}
                              onKeyDown={(e) => {
                                if (safeHref && (e.key === 'Enter' || e.key === ' ')) {
                                  e.preventDefault();
                                  handleItemClick(banner.linkUrl);
                                }
                              }}
                              style={{
                                position: 'relative',
                                flex: '0 0 auto',
                                width: isMobile ? 'min(84vw, 350px)' : 420,
                                marginRight: isMobile ? 10 : 14,
                                aspectRatio: '9 / 2',
                                borderRadius: 12,
                                overflow: 'hidden',
                                backgroundColor: '#131B23',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                boxShadow: '0 8px 22px rgba(0, 0, 0, 0.24)',
                                cursor: safeHref ? 'pointer' : 'default',
                              }}
                            >
                              <img
                                src={banner.imageUrl}
                                alt={banner.name?.trim() || (banner.kind === 'patrocinador' ? 'Banner Patrocinador' : 'Banner Parceiro')}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                  objectPosition: 'center',
                                  display: 'block',
                                }}
                              />
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 6,
                                  right: 8,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 7px',
                                  borderRadius: 999,
                                  backgroundColor: 'rgba(11, 18, 24, 0.64)',
                                  backdropFilter: 'blur(6px)',
                                  border: '1px solid rgba(255, 255, 255, 0.14)',
                                  color: '#FFFFFF',
                                  fontSize: '0.54rem',
                                  fontWeight: 700,
                                  letterSpacing: '0.04em',
                                  textTransform: 'uppercase',
                                }}
                              >
                                <span>{banner.kind === 'patrocinador' ? 'Patrocinador' : 'Parceiro'}</span>
                                {safeHref && <ExternalLink size={10} color="#76D800" />}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )
              )}

              {/* Faixa de Logos de Parceiros & Patrocinadores (loop contínuo lento na Home) */}
              {logos.length > 0 && (
                compactPreview ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {logos.map((logo) => {
                      const safeHref = sanitizePartnerHref(logo.linkUrl);
                      return (
                        <div
                          key={logo.id}
                          role={safeHref ? 'button' : undefined}
                          tabIndex={safeHref ? 0 : undefined}
                          onClick={() => handleItemClick(logo.linkUrl)}
                          onKeyDown={(e) => {
                            if (safeHref && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              handleItemClick(logo.linkUrl);
                            }
                          }}
                          style={{
                            backgroundColor: '#131B23',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: 8,
                            padding: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            gap: 5,
                            cursor: safeHref ? 'pointer' : 'default',
                          }}
                        >
                          <div
                            style={{
                              width: '100%',
                              height: 44,
                              borderRadius: 7,
                              backgroundColor: 'rgba(255, 255, 255, 0.96)',
                              padding: '4px 6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                            }}
                          >
                            <img
                              src={logo.imageUrl}
                              alt={logo.name?.trim() || (logo.kind === 'patrocinador' ? 'Logo Patrocinador' : 'Logo Parceiro')}
                              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                            />
                          </div>
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              color: logo.kind === 'patrocinador' ? '#8CE826' : '#CBD5E1',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}
                          >
                            <span>{logo.kind === 'patrocinador' ? 'Patrocinador' : 'Parceiro'}</span>
                            {safeHref && <ExternalLink size={10} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="kavro-marquee">
                    <div
                      className="kavro-marquee-track"
                      style={{ animationDuration: `${logoDurationSec}s` }}
                    >
                      {[0, 1].map((dupIdx) =>
                        logoLoopHalf.map((logo, idx) => {
                          const safeHref = sanitizePartnerHref(logo.linkUrl);
                          return (
                            <div
                              key={`${dupIdx}-${idx}-${logo.id}`}
                              role={safeHref ? 'button' : undefined}
                              tabIndex={safeHref ? 0 : undefined}
                              onClick={() => handleItemClick(logo.linkUrl)}
                              onKeyDown={(e) => {
                                if (safeHref && (e.key === 'Enter' || e.key === ' ')) {
                                  e.preventDefault();
                                  handleItemClick(logo.linkUrl);
                                }
                              }}
                              style={{
                                flex: '0 0 132px',
                                width: 132,
                                marginRight: 12,
                                backgroundColor: '#131B23',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: 10,
                                padding: '10px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textAlign: 'center',
                                gap: 6,
                                cursor: safeHref ? 'pointer' : 'default',
                              }}
                            >
                              <div
                                style={{
                                  width: '100%',
                                  height: 54,
                                  borderRadius: 10,
                                  backgroundColor: 'rgba(255, 255, 255, 0.96)',
                                  padding: '6px 10px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  overflow: 'hidden',
                                }}
                              >
                                <img
                                  src={logo.imageUrl}
                                  alt={logo.name?.trim() || (logo.kind === 'patrocinador' ? 'Logo Patrocinador' : 'Logo Parceiro')}
                                  style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain',
                                    display: 'block',
                                  }}
                                />
                              </div>
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: '0.62rem',
                                  fontWeight: 700,
                                  color: logo.kind === 'patrocinador' ? '#8CE826' : '#CBD5E1',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                <span>{logo.kind === 'patrocinador' ? 'Patrocinador' : 'Parceiro'}</span>
                                {safeHref && <ExternalLink size={10} />}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </section>
    );
  }

  // Variante Clara (App do Passageiro — Banner fino de borda a borda estilo faixa/pop-up)
  return (
    <div style={{ padding: compactPreview ? '10px 0 4px 0' : '18px 0 8px 0' }}>
      <div
        style={{
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: '0.68rem',
            fontWeight: 800,
            color: '#64748B',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Award size={12} color="#15803D" />
          <span>Parceiros &amp; Patrocinadores</span>
        </div>
        {activeItems.length > 0 && (
          <span
            style={{
              fontSize: '0.62rem',
              fontWeight: 700,
              color: '#15803D',
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              padding: '2px 8px',
              borderRadius: 999,
            }}
          >
            Destaques
          </span>
        )}
      </div>

      {activeItems.length === 0 ? (
        <div style={{ padding: '0 16px' }}>
          <div
            style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 16,
              padding: '13px 14px',
              border: '1px dashed #CBD5E1',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#15803D',
              }}
            >
              <ImageIcon size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                Logos &amp; Banners de Parceiros
              </div>
              <div style={{ fontSize: '0.71rem', color: '#64748B', marginTop: 1 }}>
                Espaço reservado para patrocinadores, promoções e empresas locais.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {banners.length > 0 && (
            compactPreview ? (
              <div
                style={{
                  display: 'flex',
                  gap: banners.length === 1 ? 0 : 8,
                  overflowX: 'auto',
                  padding: '0 8px',
                  boxSizing: 'border-box',
                }}
              >
                {banners.map((banner) => {
                  const safeHref = sanitizePartnerHref(banner.linkUrl);
                  return (
                    <div
                      key={banner.id}
                      role={safeHref ? 'button' : undefined}
                      tabIndex={safeHref ? 0 : undefined}
                      onClick={() => handleItemClick(banner.linkUrl)}
                      style={{
                        position: 'relative',
                        flex: banners.length === 1 ? '0 0 100%' : '0 0 92%',
                        width: banners.length === 1 ? '100%' : undefined,
                        aspectRatio: '9 / 2',
                        borderRadius: 12,
                        overflow: 'hidden',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)',
                        cursor: safeHref ? 'pointer' : 'default',
                        backgroundColor: '#0F172A',
                      }}
                    >
                      <img
                        src={banner.imageUrl}
                        alt={banner.name?.trim() || (banner.kind === 'patrocinador' ? 'Banner Patrocinador' : 'Banner Parceiro')}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="kavro-marquee">
                <div
                  className="kavro-marquee-track"
                  style={{ animationDuration: `${bannerDurationSec}s` }}
                >
                  {[0, 1].map((dupIdx) =>
                    bannerLoopHalf.map((banner, idx) => {
                      const safeHref = sanitizePartnerHref(banner.linkUrl);
                      return (
                        <div
                          key={`${dupIdx}-${idx}-${banner.id}`}
                          role={safeHref ? 'button' : undefined}
                          tabIndex={safeHref ? 0 : undefined}
                          onClick={() => handleItemClick(banner.linkUrl)}
                          onKeyDown={(e) => {
                            if (safeHref && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              handleItemClick(banner.linkUrl);
                            }
                          }}
                          style={{
                            position: 'relative',
                            flex: '0 0 auto',
                            width: 'min(86vw, 360px)',
                            marginRight: 10,
                            aspectRatio: '9 / 2',
                            borderRadius: 14,
                            overflow: 'hidden',
                            border: '1px solid #E2E8F0',
                            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)',
                            cursor: safeHref ? 'pointer' : 'default',
                            backgroundColor: '#0F172A',
                          }}
                        >
                          <img
                            src={banner.imageUrl}
                            alt={banner.name?.trim() || (banner.kind === 'patrocinador' ? 'Banner Patrocinador' : 'Banner Parceiro')}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              objectPosition: 'center',
                              display: 'block',
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              top: 5,
                              right: 8,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 7px',
                              borderRadius: 999,
                              backgroundColor: 'rgba(15, 23, 42, 0.56)',
                              backdropFilter: 'blur(6px)',
                              color: '#FFFFFF',
                              fontSize: '0.54rem',
                              fontWeight: 700,
                              letterSpacing: '0.03em',
                            }}
                          >
                            <span>{banner.kind === 'patrocinador' ? 'Patrocinador' : 'Parceiro'}</span>
                            {safeHref && <ExternalLink size={9} color="#76D800" />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )
          )}

          {logos.length > 0 && (
            compactPreview ? (
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  overflowX: 'auto',
                  padding: '0 16px 2px 16px',
                }}
              >
                {logos.map((logo) => {
                  const safeHref = sanitizePartnerHref(logo.linkUrl);
                  return (
                    <div
                      key={logo.id}
                      role={safeHref ? 'button' : undefined}
                      tabIndex={safeHref ? 0 : undefined}
                      onClick={() => handleItemClick(logo.linkUrl)}
                      style={{
                        flex: '0 0 112px',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: 14,
                        padding: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        gap: 6,
                        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
                        cursor: safeHref ? 'pointer' : 'default',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: 44,
                          borderRadius: 10,
                          backgroundColor: '#F8FAFC',
                          padding: '5px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        <img
                          src={logo.imageUrl}
                          alt={logo.name?.trim() || (logo.kind === 'patrocinador' ? 'Logo Patrocinador' : 'Logo Parceiro')}
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                        />
                      </div>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.58rem',
                          fontWeight: 700,
                          color: logo.kind === 'patrocinador' ? '#15803D' : '#475569',
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                        }}
                      >
                        <span>{logo.kind === 'patrocinador' ? 'Patrocinador' : 'Parceiro'}</span>
                        {safeHref && <ExternalLink size={9} />}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="kavro-marquee">
                <div
                  className="kavro-marquee-track"
                  style={{ animationDuration: `${logoDurationSec}s` }}
                >
                  {[0, 1].map((dupIdx) =>
                    logoLoopHalf.map((logo, idx) => {
                      const safeHref = sanitizePartnerHref(logo.linkUrl);
                      return (
                        <div
                          key={`${dupIdx}-${idx}-${logo.id}`}
                          role={safeHref ? 'button' : undefined}
                          tabIndex={safeHref ? 0 : undefined}
                          onClick={() => handleItemClick(logo.linkUrl)}
                          onKeyDown={(e) => {
                            if (safeHref && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              handleItemClick(logo.linkUrl);
                            }
                          }}
                          style={{
                            flex: '0 0 132px',
                            width: 132,
                            marginRight: 10,
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            borderRadius: 14,
                            padding: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            textAlign: 'center',
                            gap: 6,
                            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
                            cursor: safeHref ? 'pointer' : 'default',
                          }}
                        >
                          <div
                            style={{
                              width: '100%',
                              height: 54,
                              borderRadius: 10,
                              backgroundColor: '#F8FAFC',
                              padding: '5px 8px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                            }}
                          >
                            <img
                              src={logo.imageUrl}
                              alt={logo.name?.trim() || (logo.kind === 'patrocinador' ? 'Logo Patrocinador' : 'Logo Parceiro')}
                              style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                objectFit: 'contain',
                                display: 'block',
                              }}
                            />
                          </div>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: '0.58rem',
                              fontWeight: 700,
                              color: logo.kind === 'patrocinador' ? '#15803D' : '#475569',
                              textTransform: 'uppercase',
                              letterSpacing: '0.03em',
                            }}
                          >
                            <span>{logo.kind === 'patrocinador' ? 'Patrocinador' : 'Parceiro'}</span>
                            {safeHref && <ExternalLink size={9} />}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};
