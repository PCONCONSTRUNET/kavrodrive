import React, { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import {
  BRAZILIAN_STATES,
  formatCityStateValue,
  getCitiesByState,
  getFallbackCitiesByState,
} from '../utils/geo';

interface CityStateSelectorProps {
  uf: string;
  city: string;
  onChange: (next: { uf: string; city: string; formatted: string }) => void;
  variant?: 'onboarding' | 'compact';
  showIcons?: boolean;
}

export const CityStateSelector: React.FC<CityStateSelectorProps> = ({
  uf,
  city,
  onChange,
  variant = 'onboarding',
  showIcons = false,
}) => {
  const normalizedUf = String(uf || '').trim().toUpperCase();
  const [citiesByUf, setCitiesByUf] = useState<Record<string, string[]>>({});
  const [failedByUf, setFailedByUf] = useState<Record<string, boolean>>({});
  const [manualByUf, setManualByUf] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!normalizedUf || citiesByUf[normalizedUf]) return;

    let cancelled = false;
    getCitiesByState(normalizedUf)
      .then((list) => {
        if (cancelled) return;
        setCitiesByUf((prev) => ({ ...prev, [normalizedUf]: list }));
      })
      .catch(() => {
        if (cancelled) return;
        setFailedByUf((prev) => ({ ...prev, [normalizedUf]: true }));
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedUf, citiesByUf]);

  const fallbackCities = getFallbackCitiesByState(normalizedUf);
  const fetchedCities = normalizedUf ? citiesByUf[normalizedUf] : undefined;
  const cities =
    fetchedCities && fetchedCities.length > 0 ? fetchedCities : fallbackCities;
  const loadingCities = Boolean(
    normalizedUf && fetchedCities === undefined && !failedByUf[normalizedUf]
  );
  const manualMode = Boolean(
    normalizedUf &&
      (manualByUf[normalizedUf] ||
        (!loadingCities && cities.length === 0))
  );

  const handleStateChange = (nextUf: string) => {
    const cleanUf = nextUf.trim().toUpperCase();
    onChange({
      uf: cleanUf,
      city: '',
      formatted: '',
    });
  };

  const handleCityChange = (nextCity: string) => {
    onChange({
      uf: normalizedUf,
      city: nextCity,
      formatted: formatCityStateValue(nextCity, normalizedUf),
    });
  };

  const cityOptions = (() => {
    if (!city.trim()) return cities;
    const exists = cities.some((c) => c.toLowerCase() === city.trim().toLowerCase());
    return exists ? cities : [city.trim(), ...cities];
  })();

  const isCompact = variant === 'compact';

  const labelStyle: React.CSSProperties = isCompact
    ? { display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#374151', marginBottom: 4 }
    : { display: 'block', fontSize: '0.84rem', color: '#000000', fontWeight: 600, marginBottom: 6 };

  const fieldStyle: React.CSSProperties = isCompact
    ? {
        width: '100%',
        padding: showIcons ? '10px 10px 10px 36px' : '10px 12px',
        borderRadius: 10,
        border: '1.5px solid #E5E7EB',
        backgroundColor: '#F9FAFB',
        color: '#111111',
        fontSize: '0.86rem',
        fontWeight: 600,
        outline: 'none',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
      }
    : {
        width: '100%',
        boxSizing: 'border-box',
        height: 52,
        padding: '0 14px',
        borderRadius: 8,
        border: '2px solid transparent',
        backgroundColor: '#F3F3F3',
        color: '#000000',
        fontSize: '1rem',
        outline: 'none',
        fontFamily: 'inherit',
      };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isCompact ? 'minmax(0, 0.9fr) minmax(0, 1.35fr)' : '1fr',
        gap: isCompact ? 8 : 14,
      }}
    >
      <div>
        <label style={labelStyle}>Estado (UF) *</label>
        <select
          value={normalizedUf}
          onChange={(e) => handleStateChange(e.target.value)}
          aria-label="Estado (UF)"
          style={fieldStyle}
        >
          <option value="">Selecione o estado</option>
          {BRAZILIAN_STATES.map((st) => (
            <option key={st.uf} value={st.uf}>
              {isCompact ? `${st.uf} — ${st.name}` : `${st.uf} - ${st.name}`}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>
          Cidade *
          {!isCompact && loadingCities && normalizedUf ? (
            <span style={{ color: '#6B6B6B', fontWeight: 400, marginLeft: 6 }}>
              (carregando municípios...)
            </span>
          ) : null}
        </label>

        <div style={{ position: 'relative' }}>
          {showIcons && isCompact && (
            <MapPin
              size={15}
              color="#6B7280"
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            />
          )}

          {manualMode ? (
            <input
              type="text"
              placeholder={normalizedUf ? 'Digite o nome da cidade' : 'Selecione primeiro o estado'}
              value={city}
              disabled={!normalizedUf}
              onChange={(e) => handleCityChange(e.target.value)}
              style={{
                ...fieldStyle,
                opacity: !normalizedUf ? 0.65 : 1,
              }}
            />
          ) : (
            <select
              value={city}
              disabled={!normalizedUf}
              onChange={(e) => handleCityChange(e.target.value)}
              aria-label="Cidade"
              style={{
                ...fieldStyle,
                opacity: !normalizedUf ? 0.65 : 1,
              }}
            >
              <option value="">
                {!normalizedUf
                  ? 'Selecione o estado primeiro'
                  : loadingCities && cityOptions.length === 0
                    ? 'Carregando cidades...'
                    : 'Selecione a cidade'}
              </option>
              {cityOptions.map((cityName) => (
                <option key={cityName} value={cityName}>
                  {cityName}
                </option>
              ))}
            </select>
          )}
        </div>

        {normalizedUf && (cities.length > 0 || manualMode) && (
          <button
            type="button"
            onClick={() => {
              if (cities.length === 0) return;
              setManualByUf((prev) => ({ ...prev, [normalizedUf]: !prev[normalizedUf] }));
            }}
            style={{
              marginTop: 5,
              padding: 0,
              background: 'none',
              border: 'none',
              color: '#4B5563',
              fontSize: isCompact ? '0.68rem' : '0.76rem',
              fontWeight: 600,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            {manualMode ? 'Escolher da lista oficial IBGE' : 'Não encontrou a cidade? Digitar manualmente'}
          </button>
        )}
      </div>
    </div>
  );
};
