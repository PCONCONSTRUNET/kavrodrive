import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Car,
  CheckCircle2,
  Compass,
  Globe,
  MapPin,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { SystemConfig } from '../types';
import {
  CityOrCepSuggestion,
  lookupViaCep,
  searchCitiesAndViaCep,
} from '../utils/geo';
import { getCleanWhatsappNumber } from '../utils/format';

interface CitiesServedScreenProps {
  config: SystemConfig;
}

const SC_REGIONS = [
  {
    region: 'Sul Catarinense',
    badge: 'Base Operacional',
    cities: [
      'Lauro Müller',
      'Orleans',
      'Criciúma',
      'Tubarão',
      'Urussanga',
      'Braço do Norte',
      'Içara',
      'Araranguá',
      'Laguna',
      'Imbituba',
      'Garopaba',
      'Sombrio',
    ],
  },
  {
    region: 'Grande Florianópolis',
    badge: 'Capital & Região',
    cities: [
      'Florianópolis',
      'São José',
      'Palhoça',
      'Biguaçu',
      'Santo Amaro da Imperatriz',
      'Governador Celso Ramos',
    ],
  },
  {
    region: 'Vale do Itajaí & Litoral Norte',
    badge: 'Aeroporto NVT',
    cities: [
      'Balneário Camboriú',
      'Itajaí',
      'Navegantes',
      'Itapema',
      'Blumenau',
      'Brusque',
      'Gaspar',
      'Indaial',
      'Pomerode',
      'Rio do Sul',
    ],
  },
  {
    region: 'Norte & Planalto Norte',
    badge: 'Polo Industrial',
    cities: [
      'Joinville',
      'Jaraguá do Sul',
      'São Bento do Sul',
      'Mafra',
      'Canoinhas',
      'Porto União',
      'Guaramirim',
    ],
  },
  {
    region: 'Serra Catarinense',
    badge: 'Serra & Turismo',
    cities: [
      'Lages',
      'São Joaquim',
      'Urubici',
      'Bom Jardim da Serra',
      'Curitibanos',
      'Campos Novos',
    ],
  },
  {
    region: 'Oeste & Meio-Oeste',
    badge: 'Aeroporto XAP',
    cities: [
      'Chapecó',
      'Concórdia',
      'Joaçaba',
      'Videira',
      'Caçador',
      'Xanxerê',
      'São Miguel do Oeste',
    ],
  },
];

const OUTSIDE_SC_REGIONS = [
  {
    uf: 'RS',
    title: 'Rio Grande do Sul (RS)',
    desc: 'Viagens intermunicipais, traslados para o Aeroporto Salgado Filho (Porto Alegre), Serra Gaúcha, Caxias do Sul e municípios próximos à divisa.',
    highlights: ['Porto Alegre (POA)', 'Torres', 'Gramado / Canela', 'Caxias do Sul'],
  },
  {
    uf: 'PR',
    title: 'Paraná (PR)',
    desc: 'Rotas interestaduais saindo ou chegando por Santa Catarina, Aeroporto Afonso Pena (Curitiba), litoral paranaense e regiões sul/sudeste do estado.',
    highlights: ['Curitiba (CWB)', 'São José dos Pinhais', 'União da Vitória', 'Guaratuba'],
  },
  {
    uf: 'SP+',
    title: 'São Paulo (SP) & Outras Regiões',
    desc: 'Possíveis regiões fora de Santa Catarina atendidas sob disponibilidade de motoristas parceiros, viagens programadas, entregas e demandas corporativas.',
    highlights: ['São Paulo Capital', 'Grande SP', 'Rotas Corporativas', 'Sob Consulta'],
  },
];

export const CitiesServedScreen: React.FC<CitiesServedScreenProps> = ({ config }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CityOrCepSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [checkedResult, setCheckedResult] = useState<{
    cityLabel: string;
    uf: string;
    isSc: boolean;
    subtitle: string;
  } | null>(null);

  const cleanWa = getCleanWhatsappNumber(config.companyWhatsapp);

  useEffect(() => {
    const raw = query.trim();
    if (!raw || raw.length < 2) {
      setSuggestions([]);
      return;
    }
    let active = true;
    const tid = setTimeout(async () => {
      setIsSearching(true);
      const list = await searchCitiesAndViaCep(raw);
      if (active) {
        setSuggestions(list);
        setIsSearching(false);
      }
    }, 240);
    return () => {
      active = false;
      clearTimeout(tid);
    };
  }, [query]);

  const handleOpenCityBooking = (cityLabel: string) => {
    try {
      sessionStorage.setItem(
        'kavro_landing_prefill',
        JSON.stringify({
          pickup: '',
          destination: '',
          whenMode: 'now',
          city: cityLabel,
        })
      );
    } catch {
      // ignore storage errors
    }
    navigate('/cliente');
  };

  const handleCheckSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = query.trim();
    if (!raw) return;

    const digits = raw.replace(/\D/g, '');
    if (digits.length === 8) {
      setIsSearching(true);
      const via = await lookupViaCep(digits);
      setIsSearching(false);
      if (via) {
        const uf = String(via.uf || '').toUpperCase();
        setCheckedResult({
          cityLabel: `${via.localidade} - ${uf}, BR`,
          uf,
          isSc: uf === 'SC',
          subtitle: via.formattedAddress || `${via.localidade}/${uf}`,
        });
        setSuggestions([]);
        return;
      }
    }

    if (suggestions.length > 0) {
      const first = suggestions[0];
      const uf = String(first.uf || '').toUpperCase();
      setCheckedResult({
        cityLabel: first.cityLabel,
        uf,
        isSc: uf === 'SC',
        subtitle: first.subtitle,
      });
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    const list = await searchCitiesAndViaCep(raw);
    setIsSearching(false);
    if (list.length > 0) {
      const first = list[0];
      const uf = String(first.uf || '').toUpperCase();
      setCheckedResult({
        cityLabel: first.cityLabel,
        uf,
        isSc: uf === 'SC',
        subtitle: first.subtitle,
      });
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: '#0B1218',
        color: '#FFFFFF',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Topo Fixo Glassmorphism Escuro */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          backgroundColor: 'rgba(11, 18, 24, 0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(118, 216, 0, 0.2)',
          padding: '12px 18px',
        }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <button
              type="button"
              onClick={() => navigate('/')}
              title="Voltar para a Home"
              aria-label="Voltar para a Home"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.16)',
                backgroundColor: '#131E26',
                color: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <img
              src="/logo-horizontal-white.png"
              alt="Kavro Drive"
              onClick={() => navigate('/')}
              style={{ height: 24, width: 'auto', objectFit: 'contain', cursor: 'pointer', flexShrink: 0 }}
            />
          </div>

          <button
            type="button"
            onClick={() => navigate('/cliente')}
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 10,
              border: 'none',
              backgroundColor: '#76D800',
              color: '#0B1218',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
            }}
          >
            <span>Pedir corrida</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '28px 18px 64px 18px' }}>
        {/* Hero Cobertura 100% SC */}
        <section
          style={{
            background:
              'radial-gradient(circle at 85% 15%, rgba(118, 216, 0, 0.16) 0%, rgba(19, 30, 38, 0.96) 55%)',
            border: '1px solid rgba(118, 216, 0, 0.28)',
            borderRadius: 22,
            padding: '26px 22px',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              backgroundColor: 'rgba(118, 216, 0, 0.14)',
              border: '1px solid rgba(118, 216, 0, 0.35)',
              color: '#8CE826',
              fontSize: '0.76rem',
              fontWeight: 800,
              padding: '5px 12px',
              borderRadius: 999,
              marginBottom: 14,
            }}
          >
            <Compass size={14} />
            <span>100% de Santa Catarina + Regiões Fora de SC</span>
          </div>

          <h1
            style={{
              fontSize: 'clamp(1.65rem, 3.8vw, 2.55rem)',
              fontWeight: 800,
              lineHeight: 1.12,
              letterSpacing: '-0.03em',
              margin: '0 0 12px 0',
              color: '#FFFFFF',
            }}
          >
            Atendemos em <span style={{ color: '#76D800' }}>100% de Santa Catarina</span> e possíveis regiões fora do estado
          </h1>

          <p
            style={{
              fontSize: '0.96rem',
              lineHeight: 1.55,
              color: '#CBD5E1',
              maxWidth: 760,
              margin: '0 0 20px 0',
            }}
          >
            Nossa plataforma está preparada para atender todos os <strong>295 municípios catarinenses</strong> — do Litoral
            ao Extremo Oeste, Sul, Serra, Grande Florianópolis, Vale do Itajaí e Norte — além de viagens intermunicipais,
            aeroportos e possíveis regiões fora de Santa Catarina mediante disponibilidade ou agendamento prévio.
          </p>

          {/* Consulta Rápida por Município (IBGE) ou CEP (ViaCEP) */}
          <form
            onSubmit={handleCheckSearchSubmit}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              maxWidth: 620,
            }}
          >
            <div
              style={{
                flex: '1 1 240px',
                minWidth: 0,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#FFFFFF',
                borderRadius: 11,
                padding: '0 12px',
                height: 46,
              }}
            >
              <Search size={17} color="#64748B" style={{ flexShrink: 0, marginRight: 8 }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Digite qualquer cidade de SC, fora de SC ou CEP..."
                style={{
                  width: '100%',
                  minWidth: 0,
                  border: 'none',
                  outline: 'none',
                  fontSize: '0.92rem',
                  color: '#0B1218',
                  backgroundColor: 'transparent',
                }}
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              style={{
                height: 46,
                padding: '0 20px',
                borderRadius: 11,
                border: 'none',
                backgroundColor: '#76D800',
                color: '#0B1218',
                fontSize: '0.9rem',
                fontWeight: 800,
                cursor: isSearching ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {isSearching ? 'Verificando...' : 'Verificar atendimento'}
            </button>
          </form>

          {suggestions.length > 0 && (
            <div
              style={{
                marginTop: 10,
                maxWidth: 620,
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid #CBD5E1',
              }}
            >
              {suggestions.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    const uf = String(item.uf || '').toUpperCase();
                    setCheckedResult({
                      cityLabel: item.cityLabel,
                      uf,
                      isSc: uf === 'SC',
                      subtitle: item.subtitle,
                    });
                    setSuggestions([]);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: 'none',
                    borderBottom: '1px solid #E2E8F0',
                    backgroundColor: '#FFFFFF',
                    color: '#0B1218',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>{item.cityLabel}</div>
                    <div style={{ fontSize: '0.74rem', color: '#475569' }}>{item.subtitle}</div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: 999,
                      backgroundColor: item.uf === 'SC' ? '#DCFCE7' : '#EFF6FF',
                      color: item.uf === 'SC' ? '#15803D' : '#1D4ED8',
                      flexShrink: 0,
                    }}
                  >
                    {item.uf === 'SC' ? '100% SC' : 'Fora de SC'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {checkedResult && (
            <div
              style={{
                marginTop: 14,
                maxWidth: 620,
                backgroundColor: checkedResult.isSc ? 'rgba(22, 163, 74, 0.16)' : 'rgba(59, 130, 246, 0.16)',
                border: checkedResult.isSc
                  ? '1px solid rgba(118, 216, 0, 0.5)'
                  : '1px solid rgba(96, 165, 250, 0.5)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.92rem', fontWeight: 800, color: '#FFFFFF' }}>
                  <CheckCircle2 size={17} color={checkedResult.isSc ? '#76D800' : '#60A5FA'} />
                  <span>{checkedResult.cityLabel}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#E2E8F0', marginTop: 3 }}>
                  {checkedResult.isSc
                    ? 'Atendimento completo confirmado! Cobertura oficial em 100% de Santa Catarina.'
                    : 'Região fora de Santa Catarina — atendida sob disponibilidade, rotas intermunicipais ou agendamento.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleOpenCityBooking(checkedResult.cityLabel)}
                style={{
                  height: 38,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: 'none',
                  backgroundColor: '#76D800',
                  color: '#0B1218',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Solicitar nesta cidade →
              </button>
            </div>
          )}
        </section>

        {/* Todas as Regiões de Santa Catarina */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#FFFFFF' }}>
                Cobertura em 100% de Santa Catarina (295 Municípios)
              </h2>
              <p style={{ fontSize: '0.84rem', color: '#94A3B8', margin: '4px 0 0 0' }}>
                Toque em qualquer cidade abaixo para simular ou chamar sua corrida no app.
              </p>
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: '#131E26',
                border: '1px solid rgba(118, 216, 0, 0.3)',
                color: '#8CE826',
                fontSize: '0.76rem',
                fontWeight: 700,
                padding: '6px 12px',
                borderRadius: 999,
              }}
            >
              <ShieldCheck size={14} />
              <span>Todas as regiões de SC ativas</span>
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
              gap: 14,
            }}
          >
            {SC_REGIONS.map((group) => (
              <div
                key={group.region}
                style={{
                  backgroundColor: '#131E26',
                  border: '1px solid rgba(118, 216, 0, 0.2)',
                  borderRadius: 16,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MapPin size={16} color="#76D800" />
                    <strong style={{ fontSize: '0.96rem', color: '#FFFFFF' }}>{group.region}</strong>
                  </div>
                  <span
                    style={{
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      color: '#8CE826',
                      backgroundColor: 'rgba(118, 216, 0, 0.12)',
                      border: '1px solid rgba(118, 216, 0, 0.25)',
                      padding: '3px 8px',
                      borderRadius: 999,
                    }}
                  >
                    {group.badge}
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {group.cities.map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => handleOpenCityBooking(`${city} - SC, BR`)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        border: '1px solid rgba(255,255,255,0.12)',
                        backgroundColor: '#0B1218',
                        color: '#E2E8F0',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 14,
              padding: '12px 16px',
              borderRadius: 12,
              backgroundColor: 'rgba(118, 216, 0, 0.08)',
              border: '1px solid rgba(118, 216, 0, 0.22)',
              fontSize: '0.82rem',
              color: '#CBD5E1',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <CheckCircle2 size={16} color="#76D800" style={{ flexShrink: 0 }} />
            <span>
              <strong>Além dos polos acima:</strong> todos os demais 295 municípios catarinenses possuem suporte completo via busca de endereço e CEP na Kavro Drive.
            </span>
          </div>
        </section>

        {/* Possíveis Regiões fora de Santa Catarina */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#60A5FA', fontSize: '0.76rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              <Globe size={14} />
              <span>Expansão Interestadual &amp; Rotas Especiais</span>
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#FFFFFF' }}>
              Possíveis regiões fora de Santa Catarina
            </h2>
            <p style={{ fontSize: '0.84rem', color: '#94A3B8', margin: '4px 0 0 0' }}>
              Viagens para outros estados, divisas, aeroportos interestaduais e atendimento sob consulta conforme disponibilidade de motoristas parceiros.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 14,
            }}
          >
            {OUTSIDE_SC_REGIONS.map((item) => (
              <div
                key={item.uf}
                style={{
                  backgroundColor: '#111C24',
                  border: '1px solid rgba(148, 163, 184, 0.24)',
                  borderRadius: 16,
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong style={{ fontSize: '1rem', color: '#FFFFFF' }}>{item.title}</strong>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: 999,
                        backgroundColor: 'rgba(96, 165, 250, 0.14)',
                        border: '1px solid rgba(96, 165, 250, 0.35)',
                        color: '#93C5FD',
                      }}
                    >
                      Sob Demanda
                    </span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: '#CBD5E1', lineHeight: 1.5, margin: 0 }}>
                    {item.desc}
                  </p>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {item.highlights.map((h) => (
                    <span
                      key={h}
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '4px 9px',
                        borderRadius: 8,
                        backgroundColor: '#0B1218',
                        color: '#94A3B8',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Final */}
        <section
          style={{
            backgroundColor: '#131E26',
            border: '1px solid rgba(118, 216, 0, 0.28)',
            borderRadius: 18,
            padding: '20px 22px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.08rem', fontWeight: 800, margin: '0 0 4px 0', color: '#FFFFFF' }}>
              Pronto para viajar ou ser motorista parceiro na sua cidade?
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#94A3B8', margin: 0 }}>
              Solicite sua viagem em segundos ou cadastre-se para dirigir na rede Kavro Drive.
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              onClick={() => navigate('/cliente')}
              style={{
                height: 42,
                padding: '0 18px',
                borderRadius: 10,
                border: 'none',
                backgroundColor: '#76D800',
                color: '#0B1218',
                fontSize: '0.86rem',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Simular e Pedir Corrida
            </button>
            <button
              type="button"
              onClick={() => navigate('/kavro-drive')}
              style={{
                height: 42,
                padding: '0 16px',
                borderRadius: 10,
                border: '1px solid rgba(118, 216, 0, 0.38)',
                backgroundColor: '#0B1218',
                color: '#FFFFFF',
                fontSize: '0.86rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Car size={15} color="#76D800" />
              <span>Portal do Motorista</span>
            </button>
            {cleanWa ? (
              <a
                href={`https://wa.me/${cleanWa}?text=${encodeURIComponent('Olá! Gostaria de consultar atendimento na minha cidade pela Kavro Drive.')}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  height: 42,
                  padding: '0 16px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.16)',
                  backgroundColor: 'transparent',
                  color: '#CBD5E1',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                Consultar via WhatsApp
              </a>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/ajuda')}
                style={{
                  height: 42,
                  padding: '0 16px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.16)',
                  backgroundColor: 'transparent',
                  color: '#CBD5E1',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Central de Ajuda
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
