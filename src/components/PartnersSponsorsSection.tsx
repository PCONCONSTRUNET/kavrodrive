import React from 'react';
import { Award, ExternalLink, Image as ImageIcon, Sparkles } from 'lucide-react';
import { HomePartnerBanner } from '../types';

interface PartnersSponsorsSectionProps {
  items?: HomePartnerBanner[] | null;
  variant: 'dark' | 'light';
  context?: 'site' | 'client';
  sectionEnabled?: boolean;
  hideWhenEmpty?: boolean;
  isMobile?: boolean;
  onBecomePartnerClick?: () => void;
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
  context,
  sectionEnabled = true,
  hideWhenEmpty = false,
  isMobile = false,
  onBecomePartnerClick,
}) => {
  if (!sectionEnabled) return null;

  const targetContext: 'site' | 'client' = context || (variant === 'dark' ? 'site' : 'client');
  const activeItems = (Array.isArray(items) ? items : [])
    .filter((item) => {
      if (!item || item.active === false || String(item.imageUrl || '').trim().length === 0) {
        return false;
      }
      const p = item.placement || 'both';
      return p === 'both' || p === targetContext;
    })
    .slice()
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));

  if (hideWhenEmpty && activeItems.length === 0) return null;

  const banners = activeItems.filter((item) => item.displayMode === 'banner');
  const logos = activeItems.filter((item) => item.displayMode !== 'banner');
  const isDark = variant === 'dark';

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
          backgroundColor: '#0D151C',
          borderTop: '1px solid rgba(118, 216, 0, 0.12)',
          borderBottom: '1px solid rgba(118, 216, 0, 0.12)',
          paddingTop: isMobile ? 32 : 44,
          paddingBottom: isMobile ? 34 : 48,
          scrollMarginTop: 68,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 1200,
            margin: '0 auto',
            padding: isMobile ? '0 18px' : '0 32px',
          }}
        >
          {/* Cabeçalho da área de Parceiros & Patrocinadores */}
          <div
            style={{
              display: 'flex',
              alignItems: isMobile ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: isMobile ? 16 : 22,
            }}
          >
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#8CE826',
                  marginBottom: 4,
                }}
              >
                <Award size={14} />
                <span>Parceiros &amp; Patrocinadores</span>
              </div>
              <h2
                style={{
                  fontSize: isMobile ? '1.22rem' : '1.48rem',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                Marcas que apoiam a Kavro Drive
              </h2>
            </div>

            {onBecomePartnerClick && (
              <button
                type="button"
                onClick={onBecomePartnerClick}
                style={{
                  height: 36,
                  padding: '0 14px',
                  borderRadius: 999,
                  border: '1px solid rgba(118, 216, 0, 0.34)',
                  backgroundColor: 'rgba(118, 216, 0, 0.1)',
                  color: '#8CE826',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                <Sparkles size={13} />
                <span>Seja parceiro ou patrocinador</span>
              </button>
            )}
          </div>

          {activeItems.length === 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                gap: 12,
              }}
            >
              <button
                type="button"
                onClick={onBecomePartnerClick}
                style={{
                  textAlign: 'left',
                  padding: '16px 18px',
                  borderRadius: 16,
                  border: '1px dashed rgba(118, 216, 0, 0.32)',
                  backgroundColor: '#111C24',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  cursor: onBecomePartnerClick ? 'pointer' : 'default',
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: 'rgba(118, 216, 0, 0.12)',
                    border: '1px solid rgba(118, 216, 0, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: '#8CE826',
                  }}
                >
                  <ImageIcon size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#FFFFFF' }}>
                    Espaço para Banners Patrocinados
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: 2 }}>
                    Destaque campanhas e promoções locais diretamente na Home.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={onBecomePartnerClick}
                style={{
                  textAlign: 'left',
                  padding: '16px 18px',
                  borderRadius: 16,
                  border: '1px dashed rgba(148, 163, 184, 0.3)',
                  backgroundColor: '#111C24',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  cursor: onBecomePartnerClick ? 'pointer' : 'default',
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: '#CBD5E1',
                  }}
                >
                  <Award size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#FFFFFF' }}>
                    Espaço para Logos de Parceiros
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: 2 }}>
                    Exiba logotipos oficiais de postos, comércios e empresas conveniadas.
                  </div>
                </div>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Banners Largos em Destaque */}
              {banners.length > 0 && (
                <div
                  style={
                    isMobile
                      ? {
                          display: 'flex',
                          gap: 12,
                          overflowX: 'auto',
                          scrollSnapType: 'x mandatory',
                          paddingBottom: 4,
                        }
                      : {
                          display: 'grid',
                          gridTemplateColumns:
                            banners.length === 1
                              ? 'minmax(0, 1fr)'
                              : banners.length === 2
                                ? 'repeat(2, minmax(0, 1fr))'
                                : 'repeat(3, minmax(0, 1fr))',
                          gap: 14,
                        }
                  }
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
                          flex: isMobile ? (banners.length === 1 ? '0 0 100%' : '0 0 84%') : undefined,
                          scrollSnapAlign: 'start',
                          height: isMobile ? 164 : banners.length === 1 ? 220 : 184,
                          borderRadius: 18,
                          overflow: 'hidden',
                          backgroundColor: '#131E26',
                          border: '1px solid rgba(118, 216, 0, 0.24)',
                          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.32)',
                          cursor: safeHref ? 'pointer' : 'default',
                        }}
                      >
                        <img
                          src={banner.imageUrl}
                          alt={banner.name}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background:
                              'linear-gradient(180deg, rgba(11,18,24,0.08) 25%, rgba(11,18,24,0.88) 100%)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            padding: '12px 14px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span
                              style={{
                                fontSize: '0.64rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                padding: '3px 9px',
                                borderRadius: 999,
                                backgroundColor:
                                  banner.kind === 'patrocinador'
                                    ? 'rgba(118, 216, 0, 0.92)'
                                    : 'rgba(15, 23, 42, 0.78)',
                                color: banner.kind === 'patrocinador' ? '#0B1218' : '#E2E8F0',
                                border: '1px solid rgba(255,255,255,0.16)',
                              }}
                            >
                              {banner.kind === 'patrocinador' ? 'Patrocinador' : 'Parceiro'}
                            </span>
                            {safeHref && (
                              <span
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: '50%',
                                  backgroundColor: 'rgba(11, 18, 24, 0.72)',
                                  color: '#FFFFFF',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <ExternalLink size={13} />
                              </span>
                            )}
                          </div>

                          <div>
                            <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.2 }}>
                              {banner.name}
                            </div>
                            {banner.subtitle && (
                              <div style={{ fontSize: '0.76rem', color: '#CBD5E1', marginTop: 3 }}>
                                {banner.subtitle}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Faixa de Logos de Parceiros & Patrocinadores */}
              {logos.length > 0 && (
                <div
                  style={
                    isMobile
                      ? {
                          display: 'flex',
                          gap: 10,
                          overflowX: 'auto',
                          scrollSnapType: 'x mandatory',
                          paddingBottom: 4,
                        }
                      : {
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                          gap: 12,
                        }
                  }
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
                          flex: isMobile ? '0 0 148px' : undefined,
                          scrollSnapAlign: 'start',
                          backgroundColor: '#131E26',
                          border: '1px solid rgba(118, 216, 0, 0.18)',
                          borderRadius: 14,
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center',
                          gap: 8,
                          cursor: safeHref ? 'pointer' : 'default',
                        }}
                      >
                        <div
                          style={{
                            width: '100%',
                            height: 54,
                            borderRadius: 10,
                            backgroundColor: 'rgba(255, 255, 255, 0.94)',
                            padding: '6px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                          }}
                        >
                          <img
                            src={logo.imageUrl}
                            alt={logo.name}
                            style={{
                              maxWidth: '100%',
                              maxHeight: '100%',
                              objectFit: 'contain',
                              display: 'block',
                            }}
                          />
                        </div>
                        <div style={{ minWidth: 0, width: '100%' }}>
                          <div
                            style={{
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              color: '#FFFFFF',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {logo.name}
                          </div>
                          {logo.subtitle && (
                            <div
                              style={{
                                fontSize: '0.68rem',
                                color: '#8CE826',
                                marginTop: 1,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {logo.subtitle}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    );
  }

  // Variante Clara (App Home do Passageiro)
  return (
    <div style={{ padding: '16px 16px 4px 16px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            color: '#64748B',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Award size={13} color="#15803D" />
          <span>Parceiros &amp; Patrocinadores</span>
        </div>
        {activeItems.length > 0 && (
          <span
            style={{
              fontSize: '0.66rem',
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
              Espaço reservado para patrocinadores, promoções e empresas locais na Home.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {banners.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 10,
                overflowX: 'auto',
                scrollSnapType: 'x mandatory',
                paddingBottom: 2,
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
                      flex: banners.length === 1 ? '0 0 100%' : '0 0 85%',
                      scrollSnapAlign: 'start',
                      height: 136,
                      borderRadius: 16,
                      overflow: 'hidden',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)',
                      cursor: safeHref ? 'pointer' : 'default',
                      backgroundColor: '#0F172A',
                    }}
                  >
                    <img
                      src={banner.imageUrl}
                      alt={banner.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background:
                          'linear-gradient(180deg, rgba(15,23,42,0.06) 20%, rgba(15,23,42,0.86) 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: '0.6rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            padding: '3px 8px',
                            borderRadius: 999,
                            backgroundColor:
                              banner.kind === 'patrocinador' ? '#76D800' : 'rgba(255,255,255,0.9)',
                            color: '#0F172A',
                          }}
                        >
                          {banner.kind === 'patrocinador' ? 'Patrocinador' : 'Parceiro'}
                        </span>
                        {safeHref && (
                          <ExternalLink size={13} color="#FFFFFF" />
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.2 }}>
                          {banner.name}
                        </div>
                        {banner.subtitle && (
                          <div style={{ fontSize: '0.7rem', color: '#E2E8F0', marginTop: 2 }}>
                            {banner.subtitle}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {logos.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 10,
                overflowX: 'auto',
                scrollSnapType: 'x mandatory',
                paddingBottom: 2,
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
                      flex: '0 0 118px',
                      scrollSnapAlign: 'start',
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
                        height: 46,
                        borderRadius: 10,
                        backgroundColor: '#F8FAFC',
                        padding: '4px 6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={logo.imageUrl}
                        alt={logo.name}
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
                        width: '100%',
                        fontSize: '0.73rem',
                        fontWeight: 700,
                        color: '#0F172A',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {logo.name}
                    </div>
                    <span
                      style={{
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        color: logo.kind === 'patrocinador' ? '#15803D' : '#475569',
                      }}
                    >
                      {logo.subtitle || (logo.kind === 'patrocinador' ? 'Patrocinador' : 'Parceiro')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
