import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Award,
  Check,
  Edit2,
  Eye,
  EyeOff,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Plus,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import { HomePartnerBanner, PartnerBannerArea, SystemConfig } from '../types';
import { StorageService } from '../services/storage';
import { compressPartnerImageDataUrl } from '../utils/imageCompression';
import {
  doesBannerBelongToArea,
  PartnersSponsorsSection,
  sanitizePartnerHref,
} from './PartnersSponsorsSection';

interface AdminPartnersBannersTabProps {
  config: SystemConfig;
  onConfigSaved: (nextConfig: SystemConfig) => void;
}

interface AreaTabMeta {
  id: PartnerBannerArea;
  shortLabel: string;
  title: string;
  description: string;
  configFlag:
    | 'partnerShowOnSite'
    | 'partnerShowOnClientHome'
    | 'partnerShowOnClientRides'
    | 'partnerShowOnClientProfile';
  defaultEnabled: boolean;
  isSite: boolean;
}

const AREA_TABS: AreaTabMeta[] = [
  {
    id: 'site',
    shortLabel: 'Site Oficial (Home)',
    title: 'Site Oficial — Home Pública (/)',
    description: 'Patrocinadores e logos exibidos fora do app, na página inicial pública da Kavro Drive.',
    configFlag: 'partnerShowOnSite',
    defaultEnabled: true,
    isSite: true,
  },
  {
    id: 'client_home',
    shortLabel: 'Passageiro — Início',
    title: 'Área do Cliente — Tela Início (/cliente)',
    description: 'Banners e marcas exibidos dentro do app do passageiro na aba Início.',
    configFlag: 'partnerShowOnClientHome',
    defaultEnabled: true,
    isSite: false,
  },
  {
    id: 'client_rides',
    shortLabel: 'Passageiro — Atividade',
    title: 'Área do Cliente — Aba Atividade (Minhas Corridas)',
    description: 'Patrocinadores exibidos na tela de histórico e acompanhamento de viagens do passageiro.',
    configFlag: 'partnerShowOnClientRides',
    defaultEnabled: false,
    isSite: false,
  },
  {
    id: 'client_profile',
    shortLabel: 'Passageiro — Conta',
    title: 'Área do Cliente — Aba Conta (Perfil)',
    description: 'Patrocinadores exibidos dentro da tela Conta / Perfil do passageiro.',
    configFlag: 'partnerShowOnClientProfile',
    defaultEnabled: false,
    isSite: false,
  },
];

function resolveItemAreas(item: HomePartnerBanner): PartnerBannerArea[] {
  if (Array.isArray(item.areas) && item.areas.length > 0) {
    return item.areas;
  }
  const p = item.placement || 'both';
  if (p === 'site') return ['site'];
  if (p === 'client') return ['client_home'];
  return ['site', 'client_home'];
}

function deriveLegacyPlacement(areas: PartnerBannerArea[]): 'both' | 'site' | 'client' {
  const hasSite = areas.includes('site');
  const hasClient =
    areas.includes('client_home') ||
    areas.includes('client_rides') ||
    areas.includes('client_profile');
  if (hasSite && hasClient) return 'both';
  if (hasSite) return 'site';
  return 'client';
}

export const AdminPartnersBannersTab: React.FC<AdminPartnersBannersTabProps> = ({
  config,
  onConfigSaved,
}) => {
  const [activeArea, setActiveArea] = useState<PartnerBannerArea>('site');
  const [items, setItems] = useState<HomePartnerBanner[]>(() =>
    Array.isArray(config.partnerBanners)
      ? config.partnerBanners.slice().sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
      : []
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<'parceiro' | 'patrocinador'>('patrocinador');
  const [displayMode, setDisplayMode] = useState<'logo' | 'banner'>('logo');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [active, setActive] = useState(true);
  const [formError, setFormError] = useState('');
  const [saveBannerNotice, setSaveBannerNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(true);

  useEffect(() => {
    const synced = Array.isArray(config.partnerBanners)
      ? config.partnerBanners.slice().sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
      : [];
    setItems(synced);
  }, [config.partnerBanners]);

  const currentTabMeta = AREA_TABS.find((t) => t.id === activeArea) || AREA_TABS[0];

  const isAreaEnabled = (tab: AreaTabMeta): boolean => {
    const raw = config[tab.configFlag];
    return tab.defaultEnabled ? raw !== false : Boolean(raw);
  };

  const currentAreaEnabled = isAreaEnabled(currentTabMeta);
  const areaItems = items.filter((item) => doesBannerBelongToArea(item, activeArea));

  const resetForm = () => {
    setEditingId(null);
    setKind('patrocinador');
    setDisplayMode('logo');
    setImageUrl('');
    setLinkUrl('');
    setActive(true);
    setFormError('');
  };

  const handleSelectAreaTab = (area: PartnerBannerArea) => {
    setActiveArea(area);
    resetForm();
  };

  const persistPartnerSettings = async (patch: Partial<SystemConfig>, message: string) => {
    setIsSaving(true);
    setFormError('');
    const latest = StorageService.getConfig();
    const updatedConfig: SystemConfig = {
      ...latest,
      ...config,
      ...patch,
    };
    const ok = await StorageService.saveConfig(updatedConfig);
    const syncedConfig = ok ? StorageService.getConfig() : updatedConfig;
    if (Array.isArray(syncedConfig.partnerBanners)) {
      setItems(
        syncedConfig.partnerBanners
          .slice()
          .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
      );
    }
    setIsSaving(false);
    onConfigSaved(syncedConfig);
    setSaveBannerNotice(
      ok ? message : 'Salvo localmente, mas houve erro ao sincronizar com o servidor.'
    );
    setTimeout(() => setSaveBannerNotice(''), 3500);
  };

  const persistPartnerBanners = async (nextList: HomePartnerBanner[], message: string) => {
    const ordered = nextList.map((item, idx) => ({ ...item, sortOrder: idx + 1 }));
    setItems(ordered);
    await persistPartnerSettings({ partnerBanners: ordered }, message);
  };

  const handleImageFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFormError('');
    const isImageMime = file.type.startsWith('image/');
    const isImageExt = /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name);
    if (!isImageMime && !isImageExt) {
      setFormError('Selecione uma imagem ou GIF animado válido (GIF, PNG, JPG, WebP ou SVG).');
      return;
    }
    const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name);
    if (isGif && file.size > 2.5 * 1024 * 1024) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setFormError(
        `GIF animado muito grande (${sizeMb} MB). Envie um GIF de até 2,5 MB ou cole a URL externa (https://...) no campo ao lado.`
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawDataUrl) return;
      const compressed = await compressPartnerImageDataUrl(rawDataUrl, displayMode);
      if (compressed.length > 3_500_000) {
        setFormError(
          'Arquivo animado muito pesado para envio direto. Reduza para até 2,5 MB ou cole uma URL externa (https://...).'
        );
        return;
      }
      setImageUrl(compressed);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const cleanImage = imageUrl.trim();
    if (
      !cleanImage ||
      (!cleanImage.startsWith('data:image/') &&
        !/^https?:\/\//i.test(cleanImage) &&
        !cleanImage.startsWith('/'))
    ) {
      setFormError('Envie uma imagem ou informe uma URL válida (https://...).');
      return;
    }

    const normalizedLink = linkUrl.trim() ? sanitizePartnerHref(linkUrl) : '';
    if (linkUrl.trim() && !normalizedLink) {
      setFormError('Link externo inválido. Use um endereço completo como https://site.com.br.');
      return;
    }

    const existingItem = editingId ? items.find((it) => it.id === editingId) : undefined;
    const itemAreas: PartnerBannerArea[] = existingItem
      ? resolveItemAreas(existingItem)
      : [activeArea];

    const recordId = editingId || `prt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let persistedImageUrl = cleanImage;
    if (cleanImage.startsWith('data:image/')) {
      setIsSaving(true);
      const uploadRes = await StorageService.uploadPublicMedia('partner-banner', cleanImage, recordId);
      if (uploadRes.ok && uploadRes.url) {
        persistedImageUrl = uploadRes.url;
      }
      setIsSaving(false);
    }

    const nextRecord: HomePartnerBanner = {
      id: recordId,
      kind,
      displayMode,
      areas: itemAreas,
      placement: deriveLegacyPlacement(itemAreas),
      imageUrl: persistedImageUrl,
      linkUrl: normalizedLink,
      active,
      sortOrder: existingItem ? Number(existingItem.sortOrder ?? items.length + 1) : items.length + 1,
    };

    const nextList = editingId
      ? items.map((it) => (it.id === editingId ? nextRecord : it))
      : [...items, nextRecord];

    await persistPartnerBanners(
      nextList,
      editingId
        ? `Atualizado em ${currentTabMeta.shortLabel}!`
        : `Publicado em ${currentTabMeta.shortLabel}!`
    );
    resetForm();
  };

  const handleEditItem = (item: HomePartnerBanner) => {
    setEditingId(item.id);
    setKind(item.kind);
    setDisplayMode(item.displayMode);
    setImageUrl(item.imageUrl);
    setLinkUrl(item.linkUrl || '');
    setActive(item.active !== false);
    setFormError('');
  };

  const handleMoveWithinArea = async (areaIdx: number, delta: -1 | 1) => {
    const targetAreaIdx = areaIdx + delta;
    if (targetAreaIdx < 0 || targetAreaIdx >= areaItems.length) return;
    const currentItem = areaItems[areaIdx];
    const targetItem = areaItems[targetAreaIdx];
    const fullIdxA = items.findIndex((it) => it.id === currentItem.id);
    const fullIdxB = items.findIndex((it) => it.id === targetItem.id);
    if (fullIdxA < 0 || fullIdxB < 0) return;
    const copy = items.slice();
    copy[fullIdxA] = targetItem;
    copy[fullIdxB] = currentItem;
    await persistPartnerBanners(copy, 'Ordem atualizada!');
  };

  const handleToggleActive = async (id: string) => {
    const nextList = items.map((item) =>
      item.id === id ? { ...item, active: item.active === false } : item
    );
    await persistPartnerBanners(nextList, 'Status atualizado!');
  };

  const handleDeleteFromArea = async (id: string) => {
    const target = items.find((it) => it.id === id);
    if (!target) return;
    const targetAreas = resolveItemAreas(target);
    let nextList: HomePartnerBanner[];

    if (targetAreas.length > 1) {
      const remainingAreas = targetAreas.filter((a) => a !== activeArea);
      nextList = items.map((item) =>
        item.id === id
          ? {
              ...item,
              areas: remainingAreas,
              placement: deriveLegacyPlacement(remainingAreas),
            }
          : item
      );
    } else {
      nextList = items.filter((item) => item.id !== id);
    }

    if (editingId === id) resetForm();
    await persistPartnerBanners(nextList, `Removido de ${currentTabMeta.shortLabel}.`);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 38,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid #CBD5E1',
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontSize: '0.84rem',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Cabeçalho */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
            Parceiros &amp; Patrocinadores
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '3px 0 0 0' }}>
            Escolha abaixo a aba da área que deseja gerenciar (Site Oficial ou telas do App do Passageiro).
          </p>
        </div>

        {saveBannerNotice && (
          <div
            style={{
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              color: '#15803D',
              padding: '7px 14px',
              borderRadius: 8,
              fontSize: '0.78rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Check size={14} />
            <span>{saveBannerNotice}</span>
          </div>
        )}
      </div>

      {/* ═══ ABAS SEPARADAS POR ÁREA (SITE OFICIAL VS ÁREAS DO CLIENTE) ═══ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
          gap: 10,
        }}
      >
        {AREA_TABS.map((tab) => {
          const isSelected = activeArea === tab.id;
          const tabEnabled = isAreaEnabled(tab);
          const countInTab = items.filter((it) => doesBannerBelongToArea(it, tab.id)).length;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelectAreaTab(tab.id)}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 12,
                border: isSelected ? '2px solid #0F172A' : '1px solid #CBD5E1',
                backgroundColor: isSelected ? '#0F172A' : '#FFFFFF',
                color: isSelected ? '#FFFFFF' : '#0F172A',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                boxShadow: isSelected ? '0 8px 20px rgba(15, 23, 42, 0.14)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 800 }}>
                  {tab.isSite ? (
                    <Globe size={15} color={isSelected ? '#76D800' : '#0F172A'} />
                  ) : (
                    <Smartphone size={15} color={isSelected ? '#76D800' : '#15803D'} />
                  )}
                  <span>{tab.shortLabel}</span>
                </span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: 999,
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.16)' : '#F1F5F9',
                    color: isSelected ? '#FFFFFF' : '#334155',
                  }}
                >
                  {countInTab}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', fontWeight: 700 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    backgroundColor: tabEnabled ? '#22C55E' : '#94A3B8',
                  }}
                />
                <span style={{ color: isSelected ? '#CBD5E1' : '#64748B' }}>
                  {tabEnabled ? 'Visível no sistema' : 'Oculto no momento'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ═══ BARRA DE CONTROLE DA ABA ATIVA ═══ */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
            {currentTabMeta.title}
          </div>
          <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: 2 }}>
            {currentTabMeta.description}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label
            style={{
              height: 36,
              padding: '0 12px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              backgroundColor: '#F8FAFC',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              cursor: 'pointer',
              fontSize: '0.76rem',
              fontWeight: 600,
              color: '#334155',
            }}
          >
            <input
              type="checkbox"
              disabled={isSaving}
              checked={Boolean(config.partnerHideEmptyPlaceholder)}
              onChange={() =>
                persistPartnerSettings(
                  { partnerHideEmptyPlaceholder: !config.partnerHideEmptyPlaceholder },
                  !config.partnerHideEmptyPlaceholder
                    ? 'Blocos vazios serão ocultados.'
                    : 'Blocos vazios mostrarão espaço reservado.'
                )
              }
            />
            <span>Ocultar área se vazia</span>
          </label>

          <button
            type="button"
            disabled={isSaving}
            onClick={() =>
              persistPartnerSettings(
                { [currentTabMeta.configFlag]: !currentAreaEnabled },
                `${currentTabMeta.shortLabel}: ${!currentAreaEnabled ? 'Ativado' : 'Desativado'}.`
              )
            }
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 8,
              border: currentAreaEnabled ? '1.5px solid #16A34A' : '1px solid #CBD5E1',
              backgroundColor: currentAreaEnabled ? '#15803D' : '#E2E8F0',
              color: currentAreaEnabled ? '#FFFFFF' : '#334155',
              fontSize: '0.78rem',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: isSaving ? 'wait' : 'pointer',
            }}
          >
            {currentAreaEnabled ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>{currentAreaEnabled ? 'Exibindo nesta área (ON)' : 'Oculto nesta área (OFF)'}</span>
          </button>
        </div>
      </div>

      {/* ═══ FORMULÁRIO EXCLUSIVO DA ABA SELECIONADA ═══ */}
      <form
        onSubmit={handleSaveForm}
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Award size={17} color="#15803D" />
            <span>
              {editingId
                ? `Editando item em "${currentTabMeta.shortLabel}"`
                : `Adicionar Patrocinador ou Logo em "${currentTabMeta.shortLabel}"`}
            </span>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
                color: '#334155',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar edição
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Classificação
            </label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value === 'parceiro' ? 'parceiro' : 'patrocinador')}
              style={inputStyle}
            >
              <option value="patrocinador">Patrocinador</option>
              <option value="parceiro">Parceiro</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Formato Visual
            </label>
            <select
              value={displayMode}
              onChange={(e) => setDisplayMode(e.target.value === 'banner' ? 'banner' : 'logo')}
              style={inputStyle}
            >
              <option value="logo">Logo (Card Compacto de Marca)</option>
              <option value="banner">Banner (Destaque Largo)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Link ao clicar (opcional)
            </label>
            <input
              type="url"
              placeholder="https://instagram.com/empresa"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Status inicial
            </label>
            <label
              style={{
                height: 38,
                padding: '0 12px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                backgroundColor: active ? '#F0FDF4' : '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: active ? '#15803D' : '#64748B',
              }}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              <span>{active ? 'Ativo (visível)' : 'Inativo (oculto)'}</span>
            </label>
          </div>
        </div>

        {/* Upload ou URL da Imagem */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
            alignItems: 'center',
            padding: 12,
            borderRadius: 10,
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              URL da Imagem, GIF Animado ou Logo *
            </label>
            <input
              type="text"
              placeholder="Cole https://... (.gif, .png, .webp) ou envie um arquivo ao lado"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label
              style={{
                height: 38,
                padding: '0 14px',
                borderRadius: 8,
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                cursor: 'pointer',
              }}
            >
              <Upload size={15} />
              <span>Enviar imagem ou GIF animado</span>
              <input
                type="file"
                accept="image/*,.gif,.webp,.png,.jpg,.jpeg,.svg"
                onChange={handleImageFileSelected}
                style={{ display: 'none' }}
              />
            </label>

            {imageUrl && (
              <div
                style={{
                  width: displayMode === 'banner' ? 144 : 68,
                  height: displayMode === 'banner' ? 32 : 40,
                  borderRadius: 10,
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  padding: displayMode === 'banner' ? 0 : 4,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={imageUrl}
                  alt="Pré-visualização"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: displayMode === 'banner' ? 'cover' : 'contain',
                    display: 'block',
                  }}
                />
              </div>
            )}
          </div>
          <div style={{ gridColumn: '1 / -1', fontSize: '0.72rem', color: '#475569' }}>
            {displayMode === 'banner'
              ? 'Tamanho único para todas as áreas (Site Oficial e App): 1080 × 240 px ou 1200 × 267 px (proporção 9:2, sem cortes).'
              : 'Tamanho ideal para Logo em todas as áreas: 520 × 260 px ou 500 × 500 px (PNG/WebP transparente ou GIF animado).'}
          </div>
        </div>

        {formError && (
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#DC2626' }}>
            {formError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={isSaving}
            style={{
              height: 40,
              padding: '0 20px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: '#0F172A',
              color: '#76D800',
              fontSize: '0.84rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              cursor: isSaving ? 'wait' : 'pointer',
            }}
          >
            <Plus size={16} />
            <span>
              {isSaving
                ? 'Salvando...'
                : editingId
                  ? 'Salvar Alterações'
                  : `Adicionar em ${currentTabMeta.shortLabel}`}
            </span>
          </button>
        </div>
      </form>

      {/* ═══ LISTA EXCLUSIVA DA ABA ATUAL ═══ */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
            Cadastrados em {currentTabMeta.shortLabel} ({areaItems.length})
          </div>
          <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
            Edite, reordene, deixe inativo ou exclua
          </span>
        </div>

        {areaItems.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#64748B', fontSize: '0.8rem' }}>
            <ImageIcon size={22} color="#94A3B8" style={{ marginBottom: 4 }} />
            <div>
              Nenhum patrocinador ou logo cadastrado em <strong>{currentTabMeta.shortLabel}</strong> ainda.
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                areaItems.length > 1 ? 'repeat(auto-fill, minmax(390px, 1fr))' : '1fr',
              gap: 8,
              padding: 10,
              backgroundColor: '#F8FAFC',
            }}
          >
            {areaItems.map((item, areaIdx) => {
              const isInactive = item.active === false;
              return (
                <div
                  key={item.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid #E2E8F0',
                    backgroundColor: isInactive ? '#F8FAFC' : '#FFFFFF',
                    opacity: isInactive ? 0.78 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180, flex: 1 }}>
                    <div
                      style={{
                        width: item.displayMode === 'banner' ? 126 : 54,
                        height: item.displayMode === 'banner' ? 28 : 36,
                        borderRadius: 10,
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#FFFFFF',
                        overflow: 'hidden',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: item.displayMode === 'banner' ? 0 : 3,
                      }}
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.kind === 'patrocinador' ? 'Patrocinador' : 'Parceiro'}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: item.displayMode === 'banner' ? 'cover' : 'contain',
                        }}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: 999,
                            backgroundColor: '#F1F5F9',
                            color: '#475569',
                          }}
                        >
                          #{areaIdx + 1}
                        </span>
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 999,
                            backgroundColor: item.kind === 'patrocinador' ? '#DCFCE7' : '#EFF6FF',
                            color: item.kind === 'patrocinador' ? '#15803D' : '#1D4ED8',
                          }}
                        >
                          {item.kind === 'patrocinador' ? 'Patrocinador' : 'Parceiro'}
                        </span>
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 999,
                            backgroundColor: '#F1F5F9',
                            color: '#334155',
                          }}
                        >
                          {item.displayMode === 'banner' ? 'Banner' : 'Logo'}
                        </span>
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: 999,
                            backgroundColor: isInactive ? '#FEF2F2' : '#ECFDF5',
                            color: isInactive ? '#DC2626' : '#15803D',
                          }}
                        >
                          {isInactive ? 'Inativo' : 'Ativo'}
                        </span>
                      </div>
                      {item.linkUrl && (
                        <a
                          href={item.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: '0.68rem',
                            color: '#2563EB',
                            marginTop: 2,
                            textDecoration: 'none',
                            maxWidth: 240,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <ExternalLink size={10} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.linkUrl}</span>
                        </a>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={areaIdx === 0 || isSaving}
                      onClick={() => handleMoveWithinArea(areaIdx, -1)}
                      title="Subir posição"
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#FFFFFF',
                        color: areaIdx === 0 ? '#CBD5E1' : '#334155',
                        cursor: areaIdx === 0 ? 'default' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      disabled={areaIdx === areaItems.length - 1 || isSaving}
                      onClick={() => handleMoveWithinArea(areaIdx, 1)}
                      title="Descer posição"
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#FFFFFF',
                        color: areaIdx === areaItems.length - 1 ? '#CBD5E1' : '#334155',
                        cursor: areaIdx === areaItems.length - 1 ? 'default' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ArrowDown size={13} />
                    </button>

                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleToggleActive(item.id)}
                      style={{
                        height: 26,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: '1px solid #E2E8F0',
                        backgroundColor: isInactive ? '#ECFDF5' : '#F8FAFC',
                        color: isInactive ? '#15803D' : '#475569',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {isInactive ? <Eye size={12} /> : <EyeOff size={12} />}
                      <span>{isInactive ? 'Ativar' : 'Inativar'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleEditItem(item)}
                      style={{
                        height: 26,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#FFFFFF',
                        color: '#0F172A',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Edit2 size={12} />
                      <span>Editar</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleDeleteFromArea(item.id)}
                      style={{
                        height: 26,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: '1px solid #FECACA',
                        backgroundColor: '#FEF2F2',
                        color: '#DC2626',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Trash2 size={12} />
                      <span>Excluir</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ PRÉ-VISUALIZAÇÃO COMPACTA DESTA ABA ═══ */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '8px 14px',
            backgroundColor: '#F8FAFC',
            borderBottom: showLivePreview ? '1px solid #E2E8F0' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>
            Pré-visualização compacta — {currentTabMeta.shortLabel}
          </span>
          <button
            type="button"
            onClick={() => setShowLivePreview((prev) => !prev)}
            style={{
              height: 24,
              padding: '0 9px',
              borderRadius: 6,
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontSize: '0.68rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {showLivePreview ? <EyeOff size={12} /> : <Eye size={12} />}
            <span>{showLivePreview ? 'Recolher prévia' : 'Ver prévia'}</span>
          </button>
        </div>
        {showLivePreview && (
          <div style={{ padding: 10, backgroundColor: '#F1F5F9' }}>
            <div
              style={{
                maxWidth: currentTabMeta.isSite ? 560 : 340,
                backgroundColor: currentTabMeta.isSite ? '#0D151C' : '#FFFFFF',
                borderRadius: 10,
                border: '1px solid #CBD5E1',
                overflow: 'hidden',
                paddingBottom: currentTabMeta.isSite ? 0 : 8,
              }}
            >
              <PartnersSponsorsSection
                items={items}
                variant={currentTabMeta.isSite ? 'dark' : 'light'}
                area={activeArea}
                sectionEnabled={currentAreaEnabled}
                hideWhenEmpty={Boolean(config.partnerHideEmptyPlaceholder)}
                compactPreview
              />
              {!currentAreaEnabled && (
                <div style={{ padding: 12, fontSize: '0.74rem', color: '#94A3B8', textAlign: 'center' }}>
                  Esta aba está configurada como Oculta (OFF) no botão acima.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
