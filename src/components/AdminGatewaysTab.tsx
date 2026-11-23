import React, { useEffect, useState } from 'react';
import { CreditCard, Landmark, Power, ShieldCheck } from 'lucide-react';
import { EfiBankAdminConfig, MercadoPagoAdminConfig } from '../types';
import { StorageService } from '../services/storage';
import { AdminEfiBankTab } from './AdminEfiBankTab';
import { AdminMercadoPagoTab } from './AdminMercadoPagoTab';

type GatewayKey = 'efibank' | 'mercadopago';

interface AdminGatewaysTabProps {
  initialGateway?: GatewayKey;
}

export const AdminGatewaysTab: React.FC<AdminGatewaysTabProps> = ({ initialGateway = 'efibank' }) => {
  const [selectedGateway, setSelectedGateway] = useState<GatewayKey>(initialGateway);
  const [efiCfg, setEfiCfg] = useState<EfiBankAdminConfig | null>(null);
  const [mpCfg, setMpCfg] = useState<MercadoPagoAdminConfig | null>(null);
  const [togglingKey, setTogglingKey] = useState<GatewayKey | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [efiRes, mpRes] = await Promise.all([
        StorageService.fetchAdminEfiBankConfig(),
        StorageService.fetchAdminMercadoPagoConfig()
      ]);
      if (cancelled) return;
      if (efiRes.ok && efiRes.config) setEfiCfg(efiRes.config);
      if (mpRes.ok && mpRes.config) setMpCfg(mpRes.config);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleQuickToggle = async (e: React.MouseEvent, target: GatewayKey) => {
    e.stopPropagation();
    setQuickError(null);
    setSelectedGateway(target);
    setTogglingKey(target);

    if (target === 'efibank') {
      const nextEnabled = !efiCfg?.enabled;
      const res = await StorageService.saveAdminEfiBankConfig({ enabled: nextEnabled });
      setTogglingKey(null);
      if (!res.ok || !res.config) {
        setQuickError(res.error || 'Complete as credenciais da Efí Bank abaixo antes de ativar.');
        return;
      }
      setEfiCfg(res.config);
      setRefreshCounter((c) => c + 1);
      return;
    }

    const nextEnabled = !mpCfg?.enabled;
    const res = await StorageService.saveAdminMercadoPagoConfig({ enabled: nextEnabled });
    setTogglingKey(null);
    if (!res.ok || !res.config) {
      setQuickError(res.error || 'Complete o Access Token do Mercado Pago abaixo antes de ativar.');
      return;
    }
    setMpCfg(res.config);
    setRefreshCounter((c) => c + 1);
  };

  const efiActive = Boolean(efiCfg?.enabled);
  const mpActive = Boolean(mpCfg?.enabled);
  const efiPixActive = Boolean(efiCfg?.enabled && efiCfg?.useForPassengerPix && efiCfg?.credentialsReady);
  const mpPixActive = Boolean(mpCfg?.enabled && mpCfg?.useForPassengerPix && mpCfg?.credentialsReady);
  const mpCardActive = Boolean(mpCfg?.enabled && mpCfg?.useForCard && mpCfg?.credentialsReady);

  const activePixLabel = efiPixActive
    ? 'Efí Bank PIX (Principal)'
    : mpPixActive
      ? 'Mercado Pago PIX'
      : 'Sandbox (EMV Estático)';

  const activeCardLabel = mpCardActive
    ? 'Mercado Pago (Cartão Crédito/Débito)'
    : 'Sandbox (Sem gateway real ativo)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Seletor Superior de Gateways (clique em cima para abrir, configurar, ativar e desativar) */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 14,
          border: '1px solid #E2E8F0',
          padding: 12,
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)'
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 10
          }}
        >
          {/* Cartão Superior 1: Efí Bank */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              setQuickError(null);
              setSelectedGateway('efibank');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelectedGateway('efibank');
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 12,
              cursor: 'pointer',
              border: selectedGateway === 'efibank' ? '2px solid #0F172A' : '1px solid #E2E8F0',
              backgroundColor: selectedGateway === 'efibank' ? '#F8FAFC' : '#FFFFFF',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: efiActive ? '#DCFCE7' : '#F1F5F9',
                  color: efiActive ? '#15803D' : '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <Landmark size={19} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#0F172A' }}>Efí Bank</span>
                  <span
                    style={{
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      padding: '2px 7px',
                      borderRadius: 999,
                      backgroundColor: efiActive ? '#16A34A' : '#E2E8F0',
                      color: efiActive ? '#FFFFFF' : '#475569'
                    }}
                  >
                    {efiActive ? 'ATIVA' : 'DESATIVADA'}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
                  PIX Instantâneo, Split &amp; Saque API{efiCfg ? ` • ${efiCfg.sandbox ? 'Homologação' : 'Produção'}` : ''}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => handleQuickToggle(e, 'efibank')}
              disabled={togglingKey === 'efibank'}
              title={efiActive ? 'Desativar Efí Bank' : 'Ativar Efí Bank'}
              style={{
                height: 34,
                padding: '0 10px',
                borderRadius: 8,
                border: efiActive ? '1px solid #FECACA' : '1px solid #BBF7D0',
                backgroundColor: efiActive ? '#FEF2F2' : '#F0FDF4',
                color: efiActive ? '#DC2626' : '#15803D',
                fontSize: '0.72rem',
                fontWeight: 800,
                cursor: togglingKey === 'efibank' ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0
              }}
            >
              <Power size={13} />
              <span>{efiActive ? 'Desativar' : 'Ativar'}</span>
            </button>
          </div>

          {/* Cartão Superior 2: Mercado Pago */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              setQuickError(null);
              setSelectedGateway('mercadopago');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelectedGateway('mercadopago');
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 12,
              cursor: 'pointer',
              border: selectedGateway === 'mercadopago' ? '2px solid #009EE3' : '1px solid #E2E8F0',
              backgroundColor: selectedGateway === 'mercadopago' ? '#F0F9FF' : '#FFFFFF',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: mpActive ? '#E0F2FE' : '#F1F5F9',
                  color: mpActive ? '#0284C7' : '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <CreditCard size={19} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#0F172A' }}>Mercado Pago</span>
                  <span
                    style={{
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      padding: '2px 7px',
                      borderRadius: 999,
                      backgroundColor: mpActive ? '#009EE3' : '#E2E8F0',
                      color: mpActive ? '#FFFFFF' : '#475569'
                    }}
                  >
                    {mpActive ? 'ATIVO' : 'DESATIVADO'}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
                  Cartões Crédito/Débito &amp; PIX{mpCfg ? ` • ${mpCfg.sandbox ? 'Sandbox' : 'Produção'}` : ''}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => handleQuickToggle(e, 'mercadopago')}
              disabled={togglingKey === 'mercadopago'}
              title={mpActive ? 'Desativar Mercado Pago' : 'Ativar Mercado Pago'}
              style={{
                height: 34,
                padding: '0 10px',
                borderRadius: 8,
                border: mpActive ? '1px solid #FECACA' : '1px solid #BAE6FD',
                backgroundColor: mpActive ? '#FEF2F2' : '#E0F2FE',
                color: mpActive ? '#DC2626' : '#0369A1',
                fontSize: '0.72rem',
                fontWeight: 800,
                cursor: togglingKey === 'mercadopago' ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0
              }}
            >
              <Power size={13} />
              <span>{mpActive ? 'Desativar' : 'Ativar'}</span>
            </button>
          </div>
        </div>

        {/* Resumo ao vivo de roteamento ativo */}
        <div
          style={{
            marginTop: 10,
            padding: '8px 12px',
            borderRadius: 9,
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            fontSize: '0.73rem',
            color: '#334155'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
            <ShieldCheck size={14} color="#16A34A" />
            <span>Roteamento Ativo:</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <span>
              <strong>PIX:</strong> {activePixLabel}
            </span>
            <span>
              <strong>Cartões:</strong> {activeCardLabel}
            </span>
          </div>
        </div>

        {quickError && (
          <div
            style={{
              marginTop: 10,
              padding: '9px 12px',
              borderRadius: 8,
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#991B1B',
              fontSize: '0.76rem',
              fontWeight: 700
            }}
          >
            {quickError}
          </div>
        )}
      </div>

      {/* Painel do Gateway selecionado */}
      {selectedGateway === 'efibank' ? (
        <AdminEfiBankTab
          refreshSignal={refreshCounter}
          onConfigUpdated={(nextCfg) => setEfiCfg(nextCfg)}
        />
      ) : (
        <AdminMercadoPagoTab
          refreshSignal={refreshCounter}
          onConfigUpdated={(nextCfg) => setMpCfg(nextCfg)}
        />
      )}
    </div>
  );
};
