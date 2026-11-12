import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Check, X, Settings, ShieldCheck, Car, Users, MapPin, DollarSign,
  Sliders, AlertCircle, CheckCircle2, Lock, Unlock, Search, RefreshCw,
  Trash2, Edit2, Award, FileText, ArrowRight
} from 'lucide-react';
import {
  Ride,
  SystemConfig,
  RideCategoryConfig,
  CityCategoryPricingOverride,
  DriverProfile
} from '../types';
import {
  DEFAULT_RIDE_CATEGORIES,
  normalizeCategoriesFromConfig,
  evaluateAllDriverCategories,
  mapLegacyCategoryId
} from '../utils/categoryEngine';
import { StorageService } from '../services/storage';
import { formatCurrency, formatRideCode } from '../utils/format';
import { AdminKycReviewModal } from './AdminKycReviewModal';
import { DriverTermsContractModal } from './DriverTermsContractModal';

interface AdminRideCategoriesTabProps {
  config: SystemConfig;
  rides: Ride[];
  onConfigUpdated: (nextConfig: SystemConfig) => void;
}

export const AdminRideCategoriesTab: React.FC<AdminRideCategoriesTabProps> = ({
  config,
  rides,
  onConfigUpdated,
}) => {
  const [subTab, setSubTab] = useState<'categorias' | 'regras' | 'excecoes' | 'historico'>('categorias');
  const [categories, setCategories] = useState<RideCategoryConfig[]>(() =>
    normalizeCategoriesFromConfig(config)
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('kavro_go');
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [isLoadingDrivers, setIsLoadingDrivers] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<string>('');

  // Estados de Simulação Comparativa
  const [simKm, setSimKm] = useState<number>(8);
  const [simMin, setSimMin] = useState<number>(15);
  const [simNight, setSimNight] = useState<boolean>(false);
  const [simCity, setSimCity] = useState<string>('');

  // Estados para Adicionar Modelo / Cidade / Override de Cidade
  const [newModelInput, setNewModelInput] = useState<string>('');
  const [newCityInput, setNewCityInput] = useState<string>('');
  const [newOverrideCity, setNewOverrideCity] = useState<string>('');
  const [newOverrideBaseFare, setNewOverrideBaseFare] = useState<string>('8.50');
  const [newOverridePerKm, setNewOverridePerKm] = useState<string>('3.40');
  const [newOverridePerMin, setNewOverridePerMin] = useState<string>('0.55');
  const [newOverrideMinFare, setNewOverrideMinFare] = useState<string>('16.00');
  const [newOverrideMultiplier, setNewOverrideMultiplier] = useState<string>('1.00');
  const [newOverrideCommission, setNewOverrideCommission] = useState<string>('20');
  const [newOverrideMinYear, setNewOverrideMinYear] = useState<string>('2015');

  // Estados do Modal de Nova Categoria
  const [isNewCatModalOpen, setIsNewCatModalOpen] = useState<boolean>(false);
  const [newCatCode, setNewCatCode] = useState<string>('');
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatSubtitle, setNewCatSubtitle] = useState<string>('');
  const [newCatDesc, setNewCatDesc] = useState<string>('');
  const [newCatMultiplier, setNewCatMultiplier] = useState<string>('1.15');
  const [newCatCommission, setNewCatCommission] = useState<string>('20');
  const [newCatMinYear, setNewCatMinYear] = useState<string>('2017');

  // Estados da Aba de Motoristas & Exceções
  const [driverFilter, setDriverFilter] = useState<'todos' | 'pendentes_cadastro' | 'excecoes_solicitadas' | 'kavro_go' | 'kavro_plus' | 'kavro_exec'>('todos');
  const [driverSearch, setDriverSearch] = useState<string>('');
  const [updatingDriverId, setUpdatingDriverId] = useState<string | null>(null);
  const [kycInspectionDriver, setKycInspectionDriver] = useState<DriverProfile | null>(null);
  const [contractModalDriver, setContractModalDriver] = useState<DriverProfile | null>(null);

  useEffect(() => {
    setCategories(normalizeCategoriesFromConfig(config));
  }, [config]);

  const loadDrivers = async () => {
    setIsLoadingDrivers(true);
    try {
      const list = await StorageService.fetchDriversList();
      if (Array.isArray(list) && list.length > 0) {
        setDrivers(list);
      } else {
        const cached = StorageService.getDrivers();
        setDrivers(cached.length > 0 ? cached : StorageService.getOnlineDrivers());
      }
    } catch {
      const cached = StorageService.getDrivers();
      setDrivers(cached.length > 0 ? cached : StorageService.getOnlineDrivers());
    } finally {
      setIsLoadingDrivers(false);
    }
  };

  useEffect(() => {
    loadDrivers();
    const handleDbSync = () => {
      const synced = StorageService.getDrivers();
      setDrivers(synced);
    };
    window.addEventListener('up_database_synced', handleDbSync);
    return () => window.removeEventListener('up_database_synced', handleDbSync);
  }, []);

  const selectedCategory = useMemo(() => {
    return categories.find(c => c.id === selectedCategoryId) || categories[0] || DEFAULT_RIDE_CATEGORIES[0];
  }, [categories, selectedCategoryId]);

  const persistCategories = (nextCategories: RideCategoryConfig[], feedbackMsg = 'Configurações de categorias salvas e sincronizadas.') => {
    setIsSaving(true);
    setCategories(nextCategories);

    // Sincroniza a tarifa base global com a categoria KAVRO GO para retrocompatibilidade
    const goCat = nextCategories.find(c => c.id === 'kavro_go') || nextCategories[0];
    const nextConfig: SystemConfig = {
      ...config,
      baseFare: goCat ? goCat.baseFare : config.baseFare,
      pricePerKm: goCat ? goCat.pricePerKm : config.pricePerKm,
      pricePerMinute: goCat ? goCat.pricePerMinute : config.pricePerMinute,
      minimumFare: goCat ? goCat.minimumFare : config.minimumFare,
      rideCategories: nextCategories,
    };

    StorageService.saveConfig(nextConfig);
    onConfigUpdated(nextConfig);

    setSaveFeedback(feedbackMsg);
    setTimeout(() => {
      setIsSaving(false);
      setSaveFeedback('');
    }, 3000);
  };

  const handleUpdateCategoryField = <K extends keyof RideCategoryConfig>(
    catId: string,
    field: K,
    value: RideCategoryConfig[K]
  ) => {
    setCategories(prev =>
      prev.map(cat => (cat.id === catId ? { ...cat, [field]: value } : cat))
    );
  };

  const handleApplyMultiplierFromGo = (catId: string) => {
    const goCat = categories.find(c => c.id === 'kavro_go') || DEFAULT_RIDE_CATEGORIES[0];
    setCategories(prev =>
      prev.map(cat => {
        if (cat.id !== catId) return cat;
        const m = Number(cat.multiplier || 1);
        return {
          ...cat,
          baseFare: Number((goCat.baseFare * m).toFixed(2)),
          pricePerKm: Number((goCat.pricePerKm * m).toFixed(2)),
          pricePerMinute: Number((goCat.pricePerMinute * m).toFixed(2)),
          minimumFare: Number((goCat.minimumFare * m).toFixed(2)),
        };
      })
    );
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = newCatCode.trim().toUpperCase() || 'CUSTOM';
    const cleanName = newCatName.trim() || `KAVRO ${cleanCode}`;
    const idSlug = `kavro_${cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString().slice(-3)}`;
    const mult = Math.max(0.5, parseFloat(newCatMultiplier.replace(',', '.')) || 1.0);
    const comm = Math.min(80, Math.max(0, parseFloat(newCatCommission.replace(',', '.')) || 20));
    const minYear = parseInt(newCatMinYear, 10) || 2016;
    const goCat = categories.find(c => c.id === 'kavro_go') || DEFAULT_RIDE_CATEGORIES[0];

    const newCategory: RideCategoryConfig = {
      id: idSlug,
      code: cleanCode,
      name: cleanName,
      subtitle: newCatSubtitle.trim() || 'Categoria Personalizada',
      description: newCatDesc.trim() || 'Categoria configurada pela administração KAVRO DRIVE.',
      active: true,
      sortOrder: categories.length + 1,
      multiplier: mult,
      baseFare: Number((goCat.baseFare * mult).toFixed(2)),
      pricePerKm: Number((goCat.pricePerKm * mult).toFixed(2)),
      pricePerMinute: Number((goCat.pricePerMinute * mult).toFixed(2)),
      minimumFare: Number((goCat.minimumFare * mult).toFixed(2)),
      commissionPercent: comm,
      maxPassengers: 4,
      minVehicleYear: minYear,
      minDriverRating: 4.6,
      minCompletedRides: 0,
      requireFourDoors: true,
      requireAirConditioning: true,
      requireRegularDoc: true,
      requireEar: true,
      requireLargeTrunk: false,
      requireLeatherSeats: false,
      allowedModels: [],
      allowedCities: [],
      cityOverrides: []
    };

    const next = [...categories, newCategory];
    persistCategories(next, `Categoria "${cleanName}" criada com sucesso!`);
    setSelectedCategoryId(newCategory.id);
    setIsNewCatModalOpen(false);
    setNewCatCode('');
    setNewCatName('');
    setNewCatSubtitle('');
    setNewCatDesc('');
  };

  const handleDeleteCustomCategory = (catId: string) => {
    if (catId === 'kavro_go' || catId === 'kavro_plus' || catId === 'kavro_exec') {
      alert('As categorias nativas (KAVRO GO, KAVRO PLUS e KAVRO EXEC) não podem ser excluídas, apenas ativadas ou desativadas.');
      return;
    }
    if (!window.confirm('Deseja realmente remover esta categoria personalizada? Corridas antigas preservarão o histórico.')) {
      return;
    }
    const next = categories.filter(c => c.id !== catId);
    persistCategories(next, 'Categoria removida com sucesso.');
    if (selectedCategoryId === catId) {
      setSelectedCategoryId('kavro_go');
    }
  };

  // Estatísticas de Motoristas e Corridas por Categoria
  const categoryStats = useMemo(() => {
    const map: Record<string, {
      eligibleCount: number;
      onlineCount: number;
      pendingExceptionsCount: number;
      ridesCount: number;
      revenueTotal: number;
    }> = {};

    for (const cat of categories) {
      map[cat.id] = {
        eligibleCount: 0,
        onlineCount: 0,
        pendingExceptionsCount: 0,
        ridesCount: 0,
        revenueTotal: 0,
      };
    }

    for (const drv of drivers) {
      const { evaluations, enabledCategoryIds } = evaluateAllDriverCategories(drv, categories);

      for (const ev of evaluations) {
        if (!map[ev.categoryId]) continue;
        if (ev.status === 'liberada') {
          map[ev.categoryId].eligibleCount += 1;
          if (drv.isOnline && enabledCategoryIds.includes(ev.categoryId)) {
            map[ev.categoryId].onlineCount += 1;
          }
        }
        if ((drv.pendingCategoryRequests || []).includes(ev.categoryId)) {
          map[ev.categoryId].pendingExceptionsCount += 1;
        }
      }
    }

    for (const r of rides) {
      if (r.status === 'cancelada') continue;
      const cid = mapLegacyCategoryId(r.category);
      if (map[cid]) {
        map[cid].ridesCount += 1;
        map[cid].revenueTotal += Number(r.totalPrice || 0);
      }
    }

    return map;
  }, [categories, drivers, rides]);

  const totalPendingDriverApprovals = useMemo(
    () => drivers.filter(d =>
      d.approvalStatus === 'pendente_aprovacao' ||
      d.approvalStatus === 'pendente' ||
      d.approvalStatus === 'em_analise' ||
      d.approvalStatus === 'correcao_solicitada'
    ).length,
    [drivers]
  );

  const totalPendingCategoryExceptions = useMemo(
    () => drivers.reduce((acc, d) => acc + (Array.isArray(d.pendingCategoryRequests) ? d.pendingCategoryRequests.length : 0), 0),
    [drivers]
  );

  // Manipulação de Exceções e Aprovação de Motorista
  const handleDriverCategoryAction = async (
    driver: DriverProfile,
    catId: string,
    action: 'approve_exception' | 'revoke_exception' | 'block_category' | 'unblock_category' | 'approve_registration'
  ) => {
    setUpdatingDriverId(driver.id);
    try {
      let nextApprovedExceptions = Array.isArray(driver.approvedCategoryExceptions) ? [...driver.approvedCategoryExceptions] : [];
      let nextBlockedIds = Array.isArray(driver.blockedCategoryIds) ? [...driver.blockedCategoryIds] : [];
      let nextPendingReqs = Array.isArray(driver.pendingCategoryRequests) ? [...driver.pendingCategoryRequests] : [];
      let nextEnabledIds = Array.isArray(driver.enabledCategories) ? [...driver.enabledCategories] : [];
      let nextApprovalStatus = driver.approvalStatus;

      if (action === 'approve_registration') {
        nextApprovalStatus = 'aprovado';
      } else if (action === 'approve_exception') {
        if (!nextApprovedExceptions.includes(catId)) nextApprovedExceptions.push(catId);
        nextBlockedIds = nextBlockedIds.filter(id => id !== catId);
        nextPendingReqs = nextPendingReqs.filter(id => id !== catId);
        if (!nextEnabledIds.includes(catId)) nextEnabledIds.push(catId);
      } else if (action === 'revoke_exception') {
        nextApprovedExceptions = nextApprovedExceptions.filter(id => id !== catId);
      } else if (action === 'block_category') {
        if (!nextBlockedIds.includes(catId)) nextBlockedIds.push(catId);
        nextApprovedExceptions = nextApprovedExceptions.filter(id => id !== catId);
        nextEnabledIds = nextEnabledIds.filter(id => id !== catId);
      } else if (action === 'unblock_category') {
        nextBlockedIds = nextBlockedIds.filter(id => id !== catId);
      }

      await StorageService.adminUpdateDriverStatus(driver.id, {
        approvalStatus: nextApprovalStatus,
        approvedCategoryExceptions: nextApprovedExceptions,
        blockedCategoryIds: nextBlockedIds,
        pendingCategoryRequests: nextPendingReqs,
        enabledCategories: nextEnabledIds,
        crlvRegular: action === 'approve_registration' ? true : driver.crlvRegular,
      });

      await loadDrivers();
    } catch (err) {
      console.error('Erro ao atualizar categoria do motorista:', err);
    } finally {
      setUpdatingDriverId(null);
    }
  };

  const filteredDrivers = useMemo(() => {
    return drivers.filter(drv => {
      const { evaluations } = evaluateAllDriverCategories(drv, categories);
      if (driverFilter === 'pendentes_cadastro' &&
        drv.approvalStatus !== 'pendente_aprovacao' &&
        drv.approvalStatus !== 'pendente' &&
        drv.approvalStatus !== 'em_analise' &&
        drv.approvalStatus !== 'correcao_solicitada'
      ) {
        return false;
      }
      if (driverFilter === 'excecoes_solicitadas' && (!drv.pendingCategoryRequests || drv.pendingCategoryRequests.length === 0)) {
        return false;
      }
      if (driverFilter === 'kavro_go' || driverFilter === 'kavro_plus' || driverFilter === 'kavro_exec') {
        const ev = evaluations.find(e => e.categoryId === driverFilter);
        if (!ev || ev.status !== 'liberada') return false;
      }

      if (driverSearch.trim()) {
        const q = driverSearch.trim().toLowerCase();
        const match =
          (drv.name || '').toLowerCase().includes(q) ||
          (drv.vehicleModel || '').toLowerCase().includes(q) ||
          (drv.vehicleBrand || '').toLowerCase().includes(q) ||
          (drv.vehiclePlate || '').toLowerCase().includes(q) ||
          (drv.document || '').toLowerCase().includes(q) ||
          (drv.crlvNumber || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [drivers, driverFilter, driverSearch, categories]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* CABEÇALHO CORPORATIVO */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        paddingBottom: 14,
        borderBottom: '1px solid #E2E8F0'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: '1.18rem', fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>
              Categorias de Corridas — KAVRO DRIVE
            </h2>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 4,
              backgroundColor: '#F1F5F9',
              color: '#334155',
              border: '1px solid #CBD5E1'
            }}>
              {categories.filter(c => c.active).length} Ativas
            </span>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '3px 0 0 0' }}>
            Gestão completa de modalidades (KAVRO GO, KAVRO PLUS, KAVRO EXEC), tarifas independentes, regras de elegibilidade, modelos e exceções
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {saveFeedback && (
            <span style={{
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              color: '#15803D',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: '0.74rem',
              fontWeight: 600
            }}>
              {saveFeedback}
            </span>
          )}

          <button
            type="button"
            onClick={() => setIsNewCatModalOpen(true)}
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 6,
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              fontSize: '0.76rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer'
            }}
          >
            <Plus size={14} />
            <span>Nova Categoria</span>
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={() => persistCategories(categories)}
            style={{
              height: 36,
              padding: '0 16px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              fontSize: '0.76rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer'
            }}
          >
            <Check size={14} color="#76D800" />
            <span>Salvar Configurações</span>
          </button>
        </div>
      </div>

      {/* CARDS EXECUTIVOS DE CATEGORIAS (ACOMPANHAMENTO EM TEMPO REAL) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 14
      }}>
        {categories.map(cat => {
          const st = categoryStats[cat.id] || {
            eligibleCount: 0,
            onlineCount: 0,
            pendingExceptionsCount: 0,
            ridesCount: 0,
            revenueTotal: 0
          };
          const isSelected = selectedCategory.id === cat.id;

          return (
            <div
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 10,
                padding: '16px 18px',
                border: isSelected ? '2px solid #0F172A' : '1px solid #E2E8F0',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 12,
                boxShadow: isSelected ? '0 4px 12px rgba(15, 23, 42, 0.06)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: 5,
                      backgroundColor: '#0F172A',
                      color: '#76D800',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      letterSpacing: '0.04em'
                    }}>
                      {cat.code}
                    </span>
                    <span style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0F172A' }}>
                      {cat.name}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = categories.map(c => c.id === cat.id ? { ...c, active: !c.active } : c);
                      persistCategories(next, `Status da categoria ${cat.name} atualizado.`);
                    }}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 999,
                      border: `1px solid ${cat.active ? '#BBF7D0' : '#FECACA'}`,
                      backgroundColor: cat.active ? '#F0FDF4' : '#FEF2F2',
                      color: cat.active ? '#15803D' : '#DC2626',
                      fontSize: '0.66rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {cat.active ? '● Ativa' : '○ Inativa'}
                  </button>
                </div>

                <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: 4 }}>
                  {cat.subtitle} • Ano mín. <strong style={{ color: '#0F172A' }}>{cat.minVehicleYear}</strong> • Nota mín. <strong style={{ color: '#0F172A' }}>{cat.minDriverRating.toFixed(1)}★</strong>
                </div>
              </div>

              {/* Métricas de Frota e Tarifas da Categoria */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 8,
                backgroundColor: '#F8FAFC',
                border: '1px solid #F1F5F9'
              }}>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: 600 }}>HABILITADOS</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
                    {st.eligibleCount} <span style={{ fontSize: '0.68rem', color: '#15803D', fontWeight: 600 }}>({st.onlineCount} on)</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: 600 }}>MULTIPLICADOR</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
                    {cat.multiplier.toFixed(2)}x
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: 600 }}>COMISSÃO</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#15803D', marginTop: 2 }}>
                    {cat.commissionPercent}%
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: '#475569' }}>
                <span>
                  Base <strong>{formatCurrency(cat.baseFare)}</strong> • KM <strong>{formatCurrency(cat.pricePerKm)}</strong> • Mín. <strong>{formatCurrency(cat.minimumFare)}</strong>
                </span>
                <span style={{ fontWeight: 600, color: '#0F172A' }}>
                  {st.ridesCount} corrida(s)
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* BARRA DE SUB-NAVEGAÇÃO DA SEÇÃO */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        borderBottom: '1px solid #E2E8F0',
        paddingBottom: 10,
        flexWrap: 'wrap'
      }}>
        {[
          { id: 'categorias', label: '1. Tarifas, Multiplicadores & Comissões', icon: DollarSign },
          { id: 'regras', label: '2. Regras de Elegibilidade, Modelos & Cidades', icon: Sliders },
          {
            id: 'excecoes',
            label: '3. Motoristas, Aprovações & Exceções',
            icon: ShieldCheck,
            badge: (totalPendingDriverApprovals + totalPendingCategoryExceptions) > 0
              ? String(totalPendingDriverApprovals + totalPendingCategoryExceptions)
              : null
          },
          { id: 'historico', label: '4. Histórico de Tarifas Aplicadas', icon: FileText },
        ].map(tab => {
          const IconComp = tab.icon;
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id as any)}
              style={{
                padding: '8px 14px',
                borderRadius: 7,
                border: isActive ? '1px solid #0F172A' : '1px solid #E2E8F0',
                backgroundColor: isActive ? '#0F172A' : '#FFFFFF',
                color: isActive ? '#FFFFFF' : '#475569',
                fontSize: '0.78rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <IconComp size={14} color={isActive ? '#76D800' : '#64748B'} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span style={{
                  padding: '1px 6px',
                  borderRadius: 999,
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  fontSize: '0.65rem',
                  fontWeight: 700
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ===================================================================== */}
      {/* SUB-ABA 1: TARIFAS, MULTIPLICADORES, COMISSÕES E SIMULADOR            */}
      {/* ===================================================================== */}
      {subTab === 'categorias' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* EDITOR DE PRECIFICAÇÃO DA CATEGORIA SELECIONADA */}
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 10,
            border: '1px solid #E2E8F0',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              paddingBottom: 12,
              borderBottom: '1px solid #F1F5F9'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    backgroundColor: '#0F172A',
                    color: '#76D800',
                    fontSize: '0.72rem',
                    fontWeight: 800
                  }}>
                    {selectedCategory.code}
                  </span>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                    Configuração Tarifária e Identidade — {selectedCategory.name}
                  </h3>
                </div>
                <p style={{ fontSize: '0.74rem', color: '#64748B', margin: '3px 0 0 0' }}>
                  Clique em qualquer card de categoria acima para alternar a modalidade que está sendo editada
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {selectedCategory.id !== 'kavro_go' && (
                  <button
                    type="button"
                    onClick={() => handleApplyMultiplierFromGo(selectedCategory.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#F8FAFC',
                      color: '#0F172A',
                      fontSize: '0.73rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    title="Recalcular Tarifa Base, R$/KM, R$/Min e Tarifa Mínima multiplicando a base da KAVRO GO pelo multiplicador desta categoria"
                  >
                    Recalcular pela Base GO ({selectedCategory.multiplier.toFixed(2)}x)
                  </button>
                )}

                {selectedCategory.id !== 'kavro_go' && selectedCategory.id !== 'kavro_plus' && selectedCategory.id !== 'kavro_exec' && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomCategory(selectedCategory.id)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #FECACA',
                      backgroundColor: '#FEF2F2',
                      color: '#DC2626',
                      fontSize: '0.73rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Excluir Categoria</span>
                  </button>
                )}
              </div>
            </div>

            {/* Linha 1: Identificação da Categoria */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Nome da Categoria
                </label>
                <input
                  type="text"
                  value={selectedCategory.name}
                  onChange={(e) => handleUpdateCategoryField(selectedCategory.id, 'name', e.target.value)}
                  style={{
                    width: '100%',
                    height: 36,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: '#0F172A'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Sigla / Código Curto
                </label>
                <input
                  type="text"
                  value={selectedCategory.code}
                  onChange={(e) => handleUpdateCategoryField(selectedCategory.id, 'code', e.target.value.toUpperCase())}
                  style={{
                    width: '100%',
                    height: 36,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: '#0F172A'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Subtítulo Comercial (App Passageiro)
                </label>
                <input
                  type="text"
                  value={selectedCategory.subtitle}
                  onChange={(e) => handleUpdateCategoryField(selectedCategory.id, 'subtitle', e.target.value)}
                  style={{
                    width: '100%',
                    height: 36,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem',
                    color: '#0F172A'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Capacidade Máx. Passageiros
                </label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={selectedCategory.maxPassengers}
                  onChange={(e) => handleUpdateCategoryField(selectedCategory.id, 'maxPassengers', Math.max(1, parseInt(e.target.value, 10) || 4))}
                  style={{
                    width: '100%',
                    height: 36,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: '#0F172A'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Descrição Detalhada da Categoria
              </label>
              <input
                type="text"
                value={selectedCategory.description}
                onChange={(e) => handleUpdateCategoryField(selectedCategory.id, 'description', e.target.value)}
                style={{
                  width: '100%',
                  height: 36,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.8rem',
                  color: '#334155'
                }}
              />
            </div>

            {/* Linha 2: Parâmetros de Preço Independentes e Comissão */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
              gap: 12,
              padding: 16,
              borderRadius: 8,
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Tarifa Base (R$)
                </label>
                <input
                  type="number"
                  step="0.10"
                  min="0"
                  value={selectedCategory.baseFare}
                  onChange={(e) => handleUpdateCategoryField(selectedCategory.id, 'baseFare', Math.max(0, parseFloat(e.target.value) || 0))}
                  style={{
                    width: '100%',
                    height: 36,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: '#0F172A',
                    backgroundColor: '#FFFFFF'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Valor por KM (R$)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  value={selectedCategory.pricePerKm}
                  onChange={(e) => handleUpdateCategoryField(selectedCategory.id, 'pricePerKm', Math.max(0, parseFloat(e.target.value) || 0))}
                  style={{
                    width: '100%',
                    height: 36,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: '#0F172A',
                    backgroundColor: '#FFFFFF'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Valor por Minuto (R$)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  value={selectedCategory.pricePerMinute}
                  onChange={(e) => handleUpdateCategoryField(selectedCategory.id, 'pricePerMinute', Math.max(0, parseFloat(e.target.value) || 0))}
                  style={{
                    width: '100%',
                    height: 36,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: '#0F172A',
                    backgroundColor: '#FFFFFF'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Tarifa Mínima (R$)
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={selectedCategory.minimumFare}
                  onChange={(e) => handleUpdateCategoryField(selectedCategory.id, 'minimumFare', Math.max(0, parseFloat(e.target.value) || 0))}
                  style={{
                    width: '100%',
                    height: 36,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: '#0F172A',
                    backgroundColor: '#FFFFFF'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Multiplicador Referência (x)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0.5"
                  value={selectedCategory.multiplier}
                  onChange={(e) => handleUpdateCategoryField(selectedCategory.id, 'multiplier', Math.max(0.5, parseFloat(e.target.value) || 1))}
                  style={{
                    width: '100%',
                    height: 36,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: '#0F172A',
                    backgroundColor: '#FFFFFF'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#15803D', marginBottom: 4 }}>
                  Comissão KAVRO DRIVE (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="80"
                  value={selectedCategory.commissionPercent}
                  onChange={(e) => handleUpdateCategoryField(selectedCategory.id, 'commissionPercent', Math.min(80, Math.max(0, parseFloat(e.target.value) || 0)))}
                  style={{
                    width: '100%',
                    height: 36,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #86EFAC',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: '#15803D',
                    backgroundColor: '#FFFFFF'
                  }}
                />
              </div>
            </div>
          </div>

          {/* SIMULADOR COMPARATIVO LADO A LADO (KAVRO GO vs PLUS vs EXEC) */}
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 10,
            border: '1px solid #E2E8F0',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div>
                <h3 style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Simulador Comparativo de Tarifas e Comissões por Categoria
                </h3>
                <p style={{ fontSize: '0.73rem', color: '#64748B', margin: '2px 0 0 0' }}>
                  Compare em tempo real o valor final ao passageiro, a retenção da KAVRO DRIVE e o líquido do motorista
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569' }}>KM:</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={simKm}
                    onChange={(e) => setSimKm(Math.max(1, parseFloat(e.target.value) || 1))}
                    style={{ width: 64, height: 32, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.78rem', fontWeight: 600 }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569' }}>Minutos:</span>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={simMin}
                    onChange={(e) => setSimMin(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{ width: 64, height: 32, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.78rem', fontWeight: 600 }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569' }}>Cidade:</span>
                  <input
                    type="text"
                    placeholder="Padrão (Todas)"
                    value={simCity}
                    onChange={(e) => setSimCity(e.target.value)}
                    style={{ width: 130, height: 32, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.76rem' }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setSimNight(!simNight)}
                  style={{
                    height: 32,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    backgroundColor: simNight ? '#0F172A' : '#F8FAFC',
                    color: simNight ? '#FFFFFF' : '#334155',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {simNight ? `Noturno (+${config.nightSurchargePercent || 0}%)` : 'Diurno'}
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Categoria</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Multiplicador</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Base</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>R$ / KM</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>R$ / Min</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Tarifa Mín.</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Valor Passageiro</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Comissão KAVRO</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Líquido Motorista</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(cat => {
                    const simResult = StorageService.calculateRidePrice(
                      simKm,
                      simMin,
                      simNight ? '23:00' : '14:00',
                      { ...config, rideCategories: categories },
                      cat.id,
                      simCity || undefined
                    );
                    const snap = simResult.appliedFareSnapshot;
                    const commPct = snap ? snap.commissionPercent : cat.commissionPercent;
                    const commVal = Number(((simResult.totalPrice * commPct) / 100).toFixed(2));
                    const driverNet = Number((simResult.totalPrice - commVal).toFixed(2));

                    return (
                      <tr
                        key={cat.id}
                        onClick={() => setSelectedCategoryId(cat.id)}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          backgroundColor: selectedCategory.id === cat.id ? '#F8FAFC' : '#FFFFFF',
                          cursor: 'pointer'
                        }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              backgroundColor: '#0F172A',
                              color: '#76D800',
                              fontSize: '0.66rem',
                              fontWeight: 800
                            }}>
                              {cat.code}
                            </span>
                            <div>
                              <div style={{ fontWeight: 700, color: '#0F172A' }}>{cat.name}</div>
                              <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{cat.subtitle}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 12px', fontWeight: 600, color: '#0F172A' }}>
                          {(snap ? snap.multiplier : cat.multiplier).toFixed(2)}x
                        </td>
                        <td style={{ padding: '12px 12px', color: '#334155' }}>
                          {formatCurrency(snap ? snap.baseFare : cat.baseFare)}
                        </td>
                        <td style={{ padding: '12px 12px', color: '#334155' }}>
                          {formatCurrency(snap ? snap.pricePerKm : cat.pricePerKm)}
                        </td>
                        <td style={{ padding: '12px 12px', color: '#334155' }}>
                          {formatCurrency(snap ? snap.pricePerMinute : cat.pricePerMinute)}
                        </td>
                        <td style={{ padding: '12px 12px', color: '#334155' }}>
                          {formatCurrency(snap ? snap.minimumFare : cat.minimumFare)}
                        </td>
                        <td style={{ padding: '12px 12px', fontWeight: 700, color: '#0F172A', fontSize: '0.86rem' }}>
                          {formatCurrency(simResult.totalPrice)}
                        </td>
                        <td style={{ padding: '12px 12px', color: '#15803D', fontWeight: 600 }}>
                          {formatCurrency(commVal)} ({commPct}%)
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                          {formatCurrency(driverNet)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-ABA 2: REGRAS DE ELEGIBILIDADE, MODELOS PERMITIDOS E CIDADES      */}
      {/* ===================================================================== */}
      {subTab === 'regras' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Bloco 1: Requisitos de Veículo e Desempenho do Motorista */}
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 10,
            border: '1px solid #E2E8F0',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{ paddingBottom: 12, borderBottom: '1px solid #F1F5F9' }}>
              <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                Critérios de Elegibilidade Automática — {selectedCategory.name}
              </h3>
              <p style={{ fontSize: '0.74rem', color: '#64748B', margin: '3px 0 0 0' }}>
                O motor de categorias reavalia automaticamente os motoristas com base nestes parâmetros (sem regras fixas no código)
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                  Ano Mínimo do Veículo
                </label>
                <input
                  type="number"
                  min={2000}
                  max={2035}
                  value={selectedCategory.minVehicleYear}
                  onChange={(e) => handleUpdateCategoryField(selectedCategory.id, 'minVehicleYear', parseInt(e.target.value, 10) || 2015)}
                  style={{
                    width: '100%',
                    height: 36,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: '#0F172A'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                  Avaliação Média Mínima (1.0 a 5.0 ★)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min={1}
                  max={5}
                  value={selectedCategory.minDriverRating}
                  onChange={(e) => handleUpdateCategoryField(selectedCategory.id, 'minDriverRating', Math.min(5, Math.max(1, parseFloat(e.target.value) || 4.5)))}
                  style={{
                    width: '100%',
                    height: 36,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: '#0F172A'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                  Viagens Concluídas Mínimas (Experiência)
                </label>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  value={selectedCategory.minCompletedRides}
                  onChange={(e) => handleUpdateCategoryField(selectedCategory.id, 'minCompletedRides', Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={{
                    width: '100%',
                    height: 36,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: '#0F172A'
                  }}
                />
              </div>
            </div>

            {/* Checkboxes de Requisitos Físicos e Documentais */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: 10,
              marginTop: 4
            }}>
              {[
                { key: 'requireFourDoors', label: 'Exigir Veículo com 4 Portas', desc: 'Obrigatório para embarque de passageiros' },
                { key: 'requireAirConditioning', label: 'Exigir Ar-Condicionado Funcional', desc: 'Climatização obrigatória em operação' },
                { key: 'requireRegularDoc', label: 'Exigir CRLV Regular & Aprovação', desc: 'Documentação validada pela central' },
                { key: 'requireEar', label: 'Exigir CNH com EAR', desc: 'Exerce Atividade Remunerada na CNH' },
                { key: 'requireLargeTrunk', label: 'Exigir Espaço Amplo / Porta-Malas Grande', desc: 'Ideal para KAVRO PLUS e KAVRO EXEC' },
                { key: 'requireLeatherSeats', label: 'Exigir Bancos em Couro / Acabamento Premium', desc: 'Padrão executivo para KAVRO EXEC' },
              ].map(item => {
                const checked = Boolean((selectedCategory as any)[item.key]);
                return (
                  <label
                    key={item.key}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: checked ? '1px solid #0F172A' : '1px solid #E2E8F0',
                      backgroundColor: checked ? '#F8FAFC' : '#FFFFFF',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => handleUpdateCategoryField(selectedCategory.id, item.key as any, e.target.checked)}
                      style={{ marginTop: 2, accentColor: '#0F172A' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#0F172A' }}>{item.label}</div>
                      <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 1 }}>{item.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Bloco 2: Modelos de Veículos Permitidos na Categoria */}
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 10,
            border: '1px solid #E2E8F0',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              paddingBottom: 12,
              borderBottom: '1px solid #F1F5F9'
            }}>
              <div>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Modelos de Veículos Permitidos — {selectedCategory.name}
                </h3>
                <p style={{ fontSize: '0.73rem', color: '#64748B', margin: '2px 0 0 0' }}>
                  {selectedCategory.allowedModels.length === 0
                    ? 'Lista vazia: Qualquer modelo que atenda ao ano mínimo e características físicas será aceito nesta categoria.'
                    : `Restrito a ${selectedCategory.allowedModels.length} modelo(s) cadastrado(s) abaixo (ou motoristas com exceção aprovada).`}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Ex: Corolla, Civic, Nivus..."
                  value={newModelInput}
                  onChange={(e) => setNewModelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = newModelInput.trim();
                      if (val && !selectedCategory.allowedModels.includes(val)) {
                        handleUpdateCategoryField(selectedCategory.id, 'allowedModels', [...selectedCategory.allowedModels, val]);
                        setNewModelInput('');
                      }
                    }
                  }}
                  style={{
                    height: 34,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.78rem',
                    width: 210
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const val = newModelInput.trim();
                    if (!val) return;
                    const parts = val.split(',').map(s => s.trim()).filter(Boolean);
                    const merged = Array.from(new Set([...selectedCategory.allowedModels, ...parts]));
                    handleUpdateCategoryField(selectedCategory.id, 'allowedModels', merged);
                    setNewModelInput('');
                  }}
                  style={{
                    height: 34,
                    padding: '0 12px',
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: '#0F172A',
                    color: '#FFFFFF',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  + Adicionar Modelo
                </button>
                {selectedCategory.allowedModels.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Deseja limpar toda a lista de modelos restritos desta categoria (liberando qualquer modelo pelo ano mínimo)?')) {
                        handleUpdateCategoryField(selectedCategory.id, 'allowedModels', []);
                      }
                    }}
                    style={{
                      height: 34,
                      padding: '0 10px',
                      borderRadius: 6,
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#64748B',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Aceitar Todos os Modelos
                  </button>
                )}
              </div>
            </div>

            {selectedCategory.allowedModels.length === 0 ? (
              <div style={{
                padding: '16px',
                borderRadius: 8,
                backgroundColor: '#F8FAFC',
                border: '1px dashed #CBD5E1',
                fontSize: '0.78rem',
                color: '#475569',
                textAlign: 'center'
              }}>
                Todos os modelos de veículos a partir do ano <strong>{selectedCategory.minVehicleYear}</strong> que cumpram os requisitos acima estão liberados para <strong>{selectedCategory.name}</strong>. Adicione modelos acima caso deseje restringir a uma lista específica.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedCategory.allowedModels.map(model => (
                  <span
                    key={model}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 999,
                      backgroundColor: '#F1F5F9',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      color: '#0F172A'
                    }}
                  >
                    <span>{model}</span>
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateCategoryField(
                          selectedCategory.id,
                          'allowedModels',
                          selectedCategory.allowedModels.filter(m => m !== model)
                        );
                      }}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#64748B',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'inline-flex'
                      }}
                      title="Remover modelo"
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Bloco 3: Controle de Disponibilidade e Tarifas Específicas por Cidade */}
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 10,
            border: '1px solid #E2E8F0',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              paddingBottom: 12,
              borderBottom: '1px solid #F1F5F9'
            }}>
              <div>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Disponibilidade e Regras por Cidade — {selectedCategory.name}
                </h3>
                <p style={{ fontSize: '0.73rem', color: '#64748B', margin: '2px 0 0 0' }}>
                  Controle em quais municípios a categoria opera e configure tarifas ou ano mínimo diferenciados por cidade
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Restringir à cidade (Ex: Florianópolis)"
                  value={newCityInput}
                  onChange={(e) => setNewCityInput(e.target.value)}
                  style={{
                    height: 34,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.76rem',
                    width: 220
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const c = newCityInput.trim();
                    if (!c) return;
                    if (!selectedCategory.allowedCities.includes(c)) {
                      handleUpdateCategoryField(selectedCategory.id, 'allowedCities', [...selectedCategory.allowedCities, c]);
                    }
                    setNewCityInput('');
                  }}
                  style={{
                    height: 34,
                    padding: '0 12px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#F8FAFC',
                    color: '#0F172A',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  + Filtrar Cidade
                </button>
              </div>
            </div>

            {/* Cidades Permitidas */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#475569' }}>
                Abrangência Geográfica:
              </span>
              {selectedCategory.allowedCities.length === 0 ? (
                <span style={{
                  padding: '3px 10px',
                  borderRadius: 999,
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  color: '#15803D',
                  fontSize: '0.72rem',
                  fontWeight: 600
                }}>
                  Disponível em Todas as Cidades Atendidas
                </span>
              ) : (
                selectedCategory.allowedCities.map(city => (
                  <span
                    key={city}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '3px 10px',
                      borderRadius: 999,
                      backgroundColor: '#F1F5F9',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: '#0F172A'
                    }}
                  >
                    <MapPin size={11} />
                    <span>{city}</span>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateCategoryField(
                          selectedCategory.id,
                          'allowedCities',
                          selectedCategory.allowedCities.filter(item => item !== city)
                        )
                      }
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'inline-flex' }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Formulário de Exceção Tarifária por Cidade (City Override) */}
            <div style={{
              padding: 14,
              borderRadius: 8,
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0F172A' }}>
                Adicionar / Atualizar Tarifa e Regras Específicas por Cidade ({selectedCategory.name})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))', gap: 8, alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.68rem', color: '#475569', fontWeight: 600, marginBottom: 3 }}>Cidade</label>
                  <input
                    type="text"
                    placeholder="Ex: São José"
                    value={newOverrideCity}
                    onChange={(e) => setNewOverrideCity(e.target.value)}
                    style={{ width: '100%', height: 32, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.76rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.68rem', color: '#475569', fontWeight: 600, marginBottom: 3 }}>Base (R$)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newOverrideBaseFare}
                    onChange={(e) => setNewOverrideBaseFare(e.target.value)}
                    style={{ width: '100%', height: 32, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.76rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.68rem', color: '#475569', fontWeight: 600, marginBottom: 3 }}>R$ / KM</label>
                  <input
                    type="number"
                    step="0.05"
                    value={newOverridePerKm}
                    onChange={(e) => setNewOverridePerKm(e.target.value)}
                    style={{ width: '100%', height: 32, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.76rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.68rem', color: '#475569', fontWeight: 600, marginBottom: 3 }}>R$ / Min</label>
                  <input
                    type="number"
                    step="0.05"
                    value={newOverridePerMin}
                    onChange={(e) => setNewOverridePerMin(e.target.value)}
                    style={{ width: '100%', height: 32, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.76rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.68rem', color: '#475569', fontWeight: 600, marginBottom: 3 }}>Mínima (R$)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newOverrideMinFare}
                    onChange={(e) => setNewOverrideMinFare(e.target.value)}
                    style={{ width: '100%', height: 32, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.76rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.68rem', color: '#475569', fontWeight: 600, marginBottom: 3 }}>Comissão (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newOverrideCommission}
                    onChange={(e) => setNewOverrideCommission(e.target.value)}
                    style={{ width: '100%', height: 32, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.76rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.68rem', color: '#475569', fontWeight: 600, marginBottom: 3 }}>Ano Mín.</label>
                  <input
                    type="number"
                    value={newOverrideMinYear}
                    onChange={(e) => setNewOverrideMinYear(e.target.value)}
                    style={{ width: '100%', height: 32, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.76rem' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const cityClean = newOverrideCity.trim();
                    if (!cityClean) {
                      alert('Informe o nome da cidade.');
                      return;
                    }
                    const overrideItem: CityCategoryPricingOverride = {
                      city: cityClean,
                      active: true,
                      baseFare: parseFloat(newOverrideBaseFare) || selectedCategory.baseFare,
                      pricePerKm: parseFloat(newOverridePerKm) || selectedCategory.pricePerKm,
                      pricePerMinute: parseFloat(newOverridePerMin) || selectedCategory.pricePerMinute,
                      minimumFare: parseFloat(newOverrideMinFare) || selectedCategory.minimumFare,
                      multiplier: parseFloat(newOverrideMultiplier) || selectedCategory.multiplier,
                      commissionPercent: parseFloat(newOverrideCommission) || selectedCategory.commissionPercent,
                      minVehicleYear: parseInt(newOverrideMinYear, 10) || selectedCategory.minVehicleYear,
                    };
                    const existing = (selectedCategory.cityOverrides || []).filter(
                      o => o.city.toLowerCase() !== cityClean.toLowerCase()
                    );
                    handleUpdateCategoryField(selectedCategory.id, 'cityOverrides', [...existing, overrideItem]);
                    setNewOverrideCity('');
                  }}
                  style={{
                    height: 32,
                    padding: '0 12px',
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: '#0F172A',
                    color: '#FFFFFF',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  + Salvar Cidade
                </button>
              </div>

              {(selectedCategory.cityOverrides || []).length > 0 && (
                <div style={{ overflowX: 'auto', marginTop: 6 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem', backgroundColor: '#FFFFFF', borderRadius: 6, overflow: 'hidden' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F1F5F9', color: '#475569', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px' }}>Cidade</th>
                        <th style={{ padding: '8px 10px' }}>Status</th>
                        <th style={{ padding: '8px 10px' }}>Base</th>
                        <th style={{ padding: '8px 10px' }}>R$/KM</th>
                        <th style={{ padding: '8px 10px' }}>R$/Min</th>
                        <th style={{ padding: '8px 10px' }}>Mínima</th>
                        <th style={{ padding: '8px 10px' }}>Comissão</th>
                        <th style={{ padding: '8px 10px' }}>Ano Mín.</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedCategory.cityOverrides || []).map(ov => (
                        <tr key={ov.city} style={{ borderTop: '1px solid #E2E8F0' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0F172A' }}>{ov.city}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <button
                              type="button"
                              onClick={() => {
                                const next = (selectedCategory.cityOverrides || []).map(item =>
                                  item.city === ov.city ? { ...item, active: !item.active } : item
                                );
                                handleUpdateCategoryField(selectedCategory.id, 'cityOverrides', next);
                              }}
                              style={{
                                padding: '2px 7px',
                                borderRadius: 4,
                                border: 'none',
                                backgroundColor: ov.active ? '#DCFCE7' : '#FEE2E2',
                                color: ov.active ? '#15803D' : '#DC2626',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              {ov.active ? 'Ativa na Cidade' : 'Suspensa'}
                            </button>
                          </td>
                          <td style={{ padding: '8px 10px' }}>{formatCurrency(ov.baseFare ?? selectedCategory.baseFare)}</td>
                          <td style={{ padding: '8px 10px' }}>{formatCurrency(ov.pricePerKm ?? selectedCategory.pricePerKm)}</td>
                          <td style={{ padding: '8px 10px' }}>{formatCurrency(ov.pricePerMinute ?? selectedCategory.pricePerMinute)}</td>
                          <td style={{ padding: '8px 10px' }}>{formatCurrency(ov.minimumFare ?? selectedCategory.minimumFare)}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 600, color: '#15803D' }}>{ov.commissionPercent ?? selectedCategory.commissionPercent}%</td>
                          <td style={{ padding: '8px 10px' }}>{ov.minVehicleYear || selectedCategory.minVehicleYear}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => {
                                handleUpdateCategoryField(
                                  selectedCategory.id,
                                  'cityOverrides',
                                  (selectedCategory.cityOverrides || []).filter(item => item.city !== ov.city)
                                );
                              }}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#DC2626',
                                cursor: 'pointer',
                                fontSize: '0.72rem',
                                fontWeight: 600
                              }}
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-ABA 3: MOTORISTAS, APROVAÇÕES CADASTRAIS E EXCEÇÕES POR CATEGORIA */}
      {/* ===================================================================== */}
      {subTab === 'excecoes' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 10,
          border: '1px solid #E2E8F0',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div>
              <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                Matriz de Elegibilidade da Frota, Aprovações & Exceções Administrativas
              </h3>
              <p style={{ fontSize: '0.73rem', color: '#64748B', margin: '2px 0 0 0' }}>
                Aprove cadastros iniciais (CNH com EAR + CRLV), libere exceções de categoria ou bloqueie modalidades por motorista
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} color="#64748B" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Buscar motorista, placa, modelo..."
                  value={driverSearch}
                  onChange={(e) => setDriverSearch(e.target.value)}
                  style={{
                    height: 34,
                    padding: '0 10px 0 30px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.76rem',
                    width: 230
                  }}
                />
              </div>

              <button
                type="button"
                onClick={loadDrivers}
                style={{
                  height: 34,
                  padding: '0 12px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  color: '#0F172A',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={13} className={isLoadingDrivers ? 'animate-spin' : ''} />
                <span>Atualizar</span>
              </button>
            </div>
          </div>

          {/* Filtros Rápidos */}
          <div style={{
            padding: '10px 20px',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap'
          }}>
            {[
              { id: 'todos', label: `Todos (${drivers.length})` },
              { id: 'pendentes_cadastro', label: `Cadastro Pendente (${totalPendingDriverApprovals})` },
              { id: 'excecoes_solicitadas', label: `Exceções Solicitadas (${totalPendingCategoryExceptions})` },
              { id: 'kavro_go', label: `Habilitados GO (${categoryStats['kavro_go']?.eligibleCount || 0})` },
              { id: 'kavro_plus', label: `Habilitados PLUS (${categoryStats['kavro_plus']?.eligibleCount || 0})` },
              { id: 'kavro_exec', label: `Habilitados EXEC (${categoryStats['kavro_exec']?.eligibleCount || 0})` },
            ].map(f => {
              const active = driverFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDriverFilter(f.id as any)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    border: active ? '1px solid #0F172A' : '1px solid #CBD5E1',
                    backgroundColor: active ? '#0F172A' : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#475569',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {filteredDrivers.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
              Nenhum motorista encontrado para o filtro selecionado.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 16px' }}>Motorista & Documentação</th>
                    <th style={{ padding: '10px 12px' }}>Veículo & Características</th>
                    <th style={{ padding: '10px 12px' }}>Desempenho</th>
                    <th style={{ padding: '10px 12px' }}>Categorias & Controle de Exceções</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>Status Cadastral</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrivers.map(drv => {
                    const { evaluations: evals } = evaluateAllDriverCategories(drv, categories);
                    const isUpdating = updatingDriverId === drv.id;

                    return (
                      <tr key={drv.id} style={{ borderBottom: '1px solid #F1F5F9', verticalAlign: 'top' }}>
                        {/* Coluna 1: Motorista e CNH/CRLV */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {drv.photo ? (
                              <img
                                src={drv.photo}
                                alt={drv.name}
                                style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: '1px solid #CBD5E1' }}
                              />
                            ) : (
                              <div style={{
                                width: 38,
                                height: 38,
                                borderRadius: '50%',
                                backgroundColor: '#0F172A',
                                color: '#76D800',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.84rem'
                              }}>
                                {(drv.name || 'M').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.84rem' }}>
                                {drv.name}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                {drv.phone} • CPF: {drv.document || '—'}
                              </div>
                              <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <span>CNH: <strong>{drv.cnh || '—'}</strong></span>
                                <span style={{
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  backgroundColor: drv.cnhHasEar !== false ? '#DCFCE7' : '#FEE2E2',
                                  color: drv.cnhHasEar !== false ? '#15803D' : '#DC2626',
                                  fontWeight: 700
                                }}>
                                  EAR: {drv.cnhHasEar !== false ? 'Sim' : 'Não'}
                                </span>
                                {drv.crlvNumber && (
                                  <span>CRLV: <strong>{drv.crlvNumber}</strong></span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Coluna 2: Veículo e Características */}
                        <td style={{ padding: '14px 12px' }}>
                          <div style={{ fontWeight: 700, color: '#0F172A' }}>
                            {drv.vehicleBrand ? `${drv.vehicleBrand} ` : ''}{drv.vehicleModel} {drv.vehicleVersion || ''}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: 2 }}>
                            Ano: <strong>{drv.vehicleYear || 2020}</strong> • Placa: <strong>{drv.vehiclePlate}</strong> • Cor: {drv.vehicleColor}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                            {drv.hasFourDoors !== false && (
                              <span style={{ fontSize: '0.63rem', padding: '1px 6px', borderRadius: 4, backgroundColor: '#F1F5F9', color: '#334155', fontWeight: 600 }}>
                                4 Portas
                              </span>
                            )}
                            {drv.hasAirConditioning !== false && (
                              <span style={{ fontSize: '0.63rem', padding: '1px 6px', borderRadius: 4, backgroundColor: '#F1F5F9', color: '#334155', fontWeight: 600 }}>
                                Ar-Condicionado
                              </span>
                            )}
                            {drv.hasLargeTrunk && (
                              <span style={{ fontSize: '0.63rem', padding: '1px 6px', borderRadius: 4, backgroundColor: '#EFF6FF', color: '#1D4ED8', fontWeight: 600 }}>
                                Porta-Malas Amplo
                              </span>
                            )}
                            {drv.hasLeatherSeats && (
                              <span style={{ fontSize: '0.63rem', padding: '1px 6px', borderRadius: 4, backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: 600 }}>
                                Bancos em Couro
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Coluna 3: Desempenho */}
                        <td style={{ padding: '14px 12px' }}>
                          <div style={{ fontWeight: 700, color: '#0F172A' }}>
                            ★ {Number(drv.rating || 5).toFixed(2)}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 2 }}>
                            {drv.totalRides || 0} viagens concluídas
                          </div>
                          <div style={{ fontSize: '0.68rem', color: drv.isOnline ? '#15803D' : '#64748B', fontWeight: 600, marginTop: 3 }}>
                            {drv.isOnline ? '● Online no Radar' : '○ Offline'}
                          </div>
                        </td>

                        {/* Coluna 4: Status e Ações em Cada Categoria */}
                        <td style={{ padding: '14px 12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {evals.map(ev => {
                              const isExceptionApproved = (drv.approvedCategoryExceptions || []).includes(ev.categoryId);
                              const isManuallyBlocked = (drv.blockedCategoryIds || []).includes(ev.categoryId);
                              const isExceptionRequested = (drv.pendingCategoryRequests || []).includes(ev.categoryId);

                              return (
                                <div
                                  key={ev.categoryId}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    padding: '6px 8px',
                                    borderRadius: 6,
                                    backgroundColor: '#F8FAFC',
                                    border: isExceptionRequested ? '1px solid #F59E0B' : '1px solid #E2E8F0'
                                  }}
                                >
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                      <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.73rem' }}>
                                        {ev.categoryName}
                                      </span>
                                      <span style={{
                                        fontSize: '0.62rem',
                                        fontWeight: 700,
                                        padding: '1px 6px',
                                        borderRadius: 4,
                                        backgroundColor:
                                          ev.status === 'liberada' ? '#DCFCE7' :
                                          ev.status === 'aguardando_analise' ? '#FEF3C7' : '#FEE2E2',
                                        color:
                                          ev.status === 'liberada' ? '#15803D' :
                                          ev.status === 'aguardando_analise' ? '#B45309' : '#DC2626'
                                      }}>
                                        {ev.status === 'liberada'
                                          ? (isExceptionApproved ? 'Liberada (Exceção)' : 'Liberada')
                                          : ev.status === 'aguardando_analise'
                                          ? 'Em Análise'
                                          : 'Bloqueada'}
                                      </span>
                                      {isExceptionRequested && (
                                        <span style={{
                                          fontSize: '0.62rem',
                                          fontWeight: 700,
                                          padding: '1px 6px',
                                          borderRadius: 4,
                                          backgroundColor: '#FEF3C7',
                                          color: '#B45309'
                                        }}>
                                          Solicitou Exceção
                                        </span>
                                      )}
                                    </div>
                                    {ev.reasons.length > 0 && (
                                      <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: 2 }}>
                                        {ev.reasons.join(' • ')}
                                      </div>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                    {ev.status !== 'liberada' && !isManuallyBlocked && (
                                      <button
                                        type="button"
                                        disabled={isUpdating}
                                        onClick={() => handleDriverCategoryAction(drv, ev.categoryId, 'approve_exception')}
                                        style={{
                                          padding: '3px 8px',
                                          borderRadius: 5,
                                          border: '1px solid #86EFAC',
                                          backgroundColor: '#F0FDF4',
                                          color: '#15803D',
                                          fontSize: '0.66rem',
                                          fontWeight: 700,
                                          cursor: 'pointer'
                                        }}
                                        title="Liberar esta categoria manualmente para este motorista (Exceção Administrativa)"
                                      >
                                        Liberar Exceção
                                      </button>
                                    )}

                                    {isExceptionApproved && (
                                      <button
                                        type="button"
                                        disabled={isUpdating}
                                        onClick={() => handleDriverCategoryAction(drv, ev.categoryId, 'revoke_exception')}
                                        style={{
                                          padding: '3px 8px',
                                          borderRadius: 5,
                                          border: '1px solid #CBD5E1',
                                          backgroundColor: '#FFFFFF',
                                          color: '#475569',
                                          fontSize: '0.66rem',
                                          fontWeight: 600,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Revogar Exceção
                                      </button>
                                    )}

                                    {!isManuallyBlocked ? (
                                      <button
                                        type="button"
                                        disabled={isUpdating}
                                        onClick={() => handleDriverCategoryAction(drv, ev.categoryId, 'block_category')}
                                        style={{
                                          padding: '3px 8px',
                                          borderRadius: 5,
                                          border: '1px solid #FECACA',
                                          backgroundColor: '#FFFFFF',
                                          color: '#DC2626',
                                          fontSize: '0.66rem',
                                          fontWeight: 600,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Bloquear
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={isUpdating}
                                        onClick={() => handleDriverCategoryAction(drv, ev.categoryId, 'unblock_category')}
                                        style={{
                                          padding: '3px 8px',
                                          borderRadius: 5,
                                          border: '1px solid #CBD5E1',
                                          backgroundColor: '#FFFFFF',
                                          color: '#0F172A',
                                          fontSize: '0.66rem',
                                          fontWeight: 600,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Desbloquear
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>

                        {/* Coluna 5: Aprovação Cadastral Inicial */}
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: 4,
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              backgroundColor:
                                drv.approvalStatus === 'aprovado' ? '#DCFCE7' :
                                drv.approvalStatus === 'em_analise' ? '#DBEAFE' :
                                drv.approvalStatus === 'correcao_solicitada' ? '#FEF3C7' :
                                drv.approvalStatus === 'pendente_aprovacao' || drv.approvalStatus === 'pendente' ? '#FEF3C7' : '#FEE2E2',
                              color:
                                drv.approvalStatus === 'aprovado' ? '#15803D' :
                                drv.approvalStatus === 'em_analise' ? '#1D4ED8' :
                                drv.approvalStatus === 'correcao_solicitada' ? '#B45309' :
                                drv.approvalStatus === 'pendente_aprovacao' || drv.approvalStatus === 'pendente' ? '#B45309' : '#DC2626'
                            }}>
                              {drv.approvalStatus === 'aprovado' ? 'Cadastro Aprovado' :
                               drv.approvalStatus === 'em_analise' ? 'Em Análise KYC' :
                               drv.approvalStatus === 'correcao_solicitada' ? 'Correção Solicitada' :
                               drv.approvalStatus === 'pendente_aprovacao' || drv.approvalStatus === 'pendente' ? 'Aguardando Aprovação' :
                               drv.approvalStatus === 'rejeitado' ? 'Rejeitado' : drv.approvalStatus}
                            </span>

                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                onClick={() => setKycInspectionDriver(drv)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: 6,
                                  border: '1px solid #2563EB',
                                  backgroundColor: '#EFF6FF',
                                  color: '#1D4ED8',
                                  fontSize: '0.70rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                Inspecionar KYC & Docs
                              </button>

                              {drv.termsSignature?.signed && (
                                <button
                                  type="button"
                                  onClick={() => setContractModalDriver(drv)}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #BBF7D0',
                                    backgroundColor: '#F0FDF4',
                                    color: '#15803D',
                                    fontSize: '0.70rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  Contrato
                                </button>
                              )}
                            </div>

                            {drv.approvalStatus !== 'aprovado' && (
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handleDriverCategoryAction(drv, 'kavro_go', 'approve_registration')}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: 6,
                                  border: 'none',
                                  backgroundColor: '#0F172A',
                                  color: '#76D800',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                ✓ Aprovar Documentos e Liberar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-ABA 4: HISTÓRICO PRESERVADO DE CATEGORIAS E TARIFAS APLICADAS     */}
      {/* ===================================================================== */}
      {subTab === 'historico' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 10,
          border: '1px solid #E2E8F0',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
            <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
              Auditoria de Corridas — Histórico Imutável de Categorias e Tarifas Aplicadas
            </h3>
            <p style={{ fontSize: '0.73rem', color: '#64748B', margin: '2px 0 0 0' }}>
              Cada corrida armazena um snapshot contábil exato da categoria, tarifa base, R$/KM, multiplicador e comissão vigentes no momento da viagem
            </p>
          </div>

          {rides.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
              Nenhuma corrida registrada até o momento.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 16px' }}>Código / Data</th>
                    <th style={{ padding: '10px 12px' }}>Passageiro & Motorista</th>
                    <th style={{ padding: '10px 12px' }}>Categoria Aplicada</th>
                    <th style={{ padding: '10px 12px' }}>Snapshot da Tarifa na Época</th>
                    <th style={{ padding: '10px 12px' }}>Valor Bruto</th>
                    <th style={{ padding: '10px 12px' }}>Comissão KAVRO</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>Líquido Motorista</th>
                  </tr>
                </thead>
                <tbody>
                  {rides.slice(0, 60).map(r => {
                    const snap = r.appliedFareSnapshot;
                    const catLabel = r.categoryName || snap?.categoryName || (
                      mapLegacyCategoryId(r.category) === 'kavro_exec' ? 'KAVRO EXEC' :
                      mapLegacyCategoryId(r.category) === 'kavro_plus' ? 'KAVRO PLUS' : 'KAVRO GO'
                    );
                    const commPct = snap?.commissionPercent ?? r.commissionPercent ?? 20;
                    const commAmt = r.commissionAmount ?? Number(((r.totalPrice * commPct) / 100).toFixed(2));
                    const netAmt = r.driverNetAmount ?? Number((r.totalPrice - commAmt).toFixed(2));

                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 700, color: '#0F172A' }}>{formatRideCode(r.id)}</div>
                          <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{r.date} às {r.time}</div>
                        </td>
                        <td style={{ padding: '12px 12px' }}>
                          <div style={{ fontWeight: 600, color: '#0F172A' }}>{r.clientName}</div>
                          <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                            Motorista: {r.driverName || 'Aguardando / Central'}
                          </div>
                        </td>
                        <td style={{ padding: '12px 12px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: 4,
                            backgroundColor: '#0F172A',
                            color: '#76D800',
                            fontSize: '0.68rem',
                            fontWeight: 700
                          }}>
                            {catLabel}
                          </span>
                        </td>
                        <td style={{ padding: '12px 12px', color: '#475569', fontSize: '0.7rem' }}>
                          {snap ? (
                            <span>
                              Base {formatCurrency(snap.baseFare)} • KM {formatCurrency(snap.pricePerKm)} • Min {formatCurrency(snap.pricePerMinute)} • {snap.multiplier.toFixed(2)}x
                              {snap.city ? ` (${snap.city})` : ''}
                            </span>
                          ) : (
                            <span>Tarifa histórica preservada ({r.distanceKm} km / {r.durationMin} min)</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 12px', fontWeight: 700, color: '#0F172A' }}>
                          {formatCurrency(r.totalPrice)}
                        </td>
                        <td style={{ padding: '12px 12px', color: '#15803D', fontWeight: 600 }}>
                          {formatCurrency(commAmt)} ({commPct}%)
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                          {formatCurrency(netAmt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL PARA CRIAR NOVA CATEGORIA PERSONALIZADA */}
      {isNewCatModalOpen && (
        <div
          onClick={() => setIsNewCatModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateCategory}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 12,
              width: '100%',
              maxWidth: 480,
              padding: 22,
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.2)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                Criar Nova Categoria de Corrida
              </h3>
              <button
                type="button"
                onClick={() => setIsNewCatModalOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Código (Ex: VIP) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VIP"
                  value={newCatCode}
                  onChange={(e) => setNewCatCode(e.target.value.toUpperCase())}
                  style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.82rem', fontWeight: 700 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Nome da Categoria *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: KAVRO MULHER / KAVRO VIP"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.82rem', fontWeight: 600 }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Subtítulo Comercial
              </label>
              <input
                type="text"
                placeholder="Ex: Atendimento exclusivo e prioritário"
                value={newCatSubtitle}
                onChange={(e) => setNewCatSubtitle(e.target.value)}
                style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Descrição / Regras Resumidas
              </label>
              <input
                type="text"
                placeholder="Descreva os diferenciais e requisitos desta modalidade"
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Multiplicador (x)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={newCatMultiplier}
                  onChange={(e) => setNewCatMultiplier(e.target.value)}
                  style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.82rem', fontWeight: 600 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Comissão KAVRO (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={newCatCommission}
                  onChange={(e) => setNewCatCommission(e.target.value)}
                  style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.82rem', fontWeight: 600 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Ano Mín. Veículo
                </label>
                <input
                  type="number"
                  value={newCatMinYear}
                  onChange={(e) => setNewCatMinYear(e.target.value)}
                  style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.82rem', fontWeight: 600 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => setIsNewCatModalOpen(false)}
                style={{
                  height: 36,
                  padding: '0 14px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{
                  height: 36,
                  padding: '0 16px',
                  borderRadius: 6,
                  border: 'none',
                  backgroundColor: '#0F172A',
                  color: '#76D800',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Criar Categoria
              </button>
            </div>
          </form>
        </div>
      )}

      {kycInspectionDriver && (
        <AdminKycReviewModal
          driver={kycInspectionDriver}
          isOpen={Boolean(kycInspectionDriver)}
          onClose={() => setKycInspectionDriver(null)}
          onUpdated={() => {
            loadDrivers();
          }}
        />
      )}

      {contractModalDriver && (
        <DriverTermsContractModal
          isOpen={Boolean(contractModalDriver)}
          onClose={() => setContractModalDriver(null)}
          mode="admin"
          config={config}
          driver={contractModalDriver}
        />
      )}
    </div>
  );
};
