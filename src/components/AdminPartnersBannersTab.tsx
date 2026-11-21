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
import { HomePartnerBanner, SystemConfig } from '../types';
import { StorageService } from '../services/storage';
import { compressPartnerImageDataUrl } from '../utils/imageCompression';
import { PartnersSponsorsSection, sanitizePartnerHref } from './PartnersSponsorsSection';

interface AdminPartnersBannersTabProps {
  config: SystemConfig;
  onConfigSaved: (nextConfig: SystemConfig) => void;
}

export const AdminPartnersBannersTab: React.FC<AdminPartnersBannersTabProps> = ({
  config,
  onConfigSaved,
}) => {
  const initialItems = Array.isArray(config.partnerBanners)
    ? config.partnerBanners.slice().sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
    : [];

  const [items, setItems] = useState<HomePartnerBanner[]>(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'parceiro' | 'patrocinador'>('patrocinador');
  const [displayMode, setDisplayMode] = useState<'logo' | 'banner'>('logo');
  const [placement, setPlacement] = useState<'both' | 'site' | 'client'>('both');
  const [previewTarget, setPreviewTarget] = useState<'site' | 'client'>('site');
  const [imageUrl, setImageUrl] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [active, setActive] = useState(true);
  const [formError, setFormError] = useState('');
  const [saveBannerNotice, setSaveBannerNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const synced = Array.isArray(config.partnerBanners)
      ? config.partnerBanners.slice().sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
      : [];
    setItems(synced);
  }, [config.partnerBanners]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setKind('patrocinador');
    setDisplayMode('logo');
    setPlacement('both');
    setImageUrl('');
    setSubtitle('');
    setLinkUrl('');
    setActive(true);
    setFormError('');
  };

  const persistPartnerSettings = async (
    patch: Partial<SystemConfig>,
    message: string
  ) => {
    setIsSaving(true);
    setFormError('');
    const latest = StorageService.getConfig();
    const updatedConfig: SystemConfig = {
      ...latest,
      ...config,
      ...patch,
    };
    const ok = await StorageService.saveConfig(updatedConfig);
    setIsSaving(false);
    onConfigSaved(updatedConfig);
    setSaveBannerNotice(
      ok
        ? message
        : 'Salvo localmente, mas houve erro ao sincronizar com o servidor.'
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
    if (!file) return;
    setFormError('');
    if (!file.type.startsWith('image/')) {
      setFormError('Selecione um arquivo de imagem válido (PNG, JPG, WebP ou SVG).');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawDataUrl) return;
      const compressed = await compressPartnerImageDataUrl(rawDataUrl, displayMode);
      setImageUrl(compressed);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const cleanName = name.trim();
    const cleanImage = imageUrl.trim();
    if (!cleanName) {
      setFormError('Informe o nome do parceiro ou patrocinador.');
      return;
    }
    if (!cleanImage || (!cleanImage.startsWith('data:image/') && !/^https?:\/\//i.test(cleanImage) && !cleanImage.startsWith('/'))) {
      setFormError('Envie uma imagem ou informe uma URL válida (https://...).');
      return;
    }

    const normalizedLink = linkUrl.trim() ? sanitizePartnerHref(linkUrl) : '';
    if (linkUrl.trim() && !normalizedLink) {
      setFormError('Link externo inválido. Use um endereço completo como https://site.com.br.');
      return;
    }

    const nextRecord: HomePartnerBanner = {
      id: editingId || `prt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      kind,
      displayMode,
      placement,
      imageUrl: cleanImage,
      subtitle: subtitle.trim(),
      linkUrl: normalizedLink,
      active,
      sortOrder: editingId
        ? Number(items.find((it) => it.id === editingId)?.sortOrder ?? items.length + 1)
        : items.length + 1,
    };

    const nextList = editingId
      ? items.map((it) => (it.id === editingId ? nextRecord : it))
      : [...items, nextRecord];

    await persistPartnerBanners(
      nextList,
      editingId ? 'Parceiro atualizado!' : 'Parceiro adicionado e publicado!'
    );
    resetForm();
  };

  const handleEditItem = (item: HomePartnerBanner) => {
    setEditingId(item.id);
    setName(item.name);
    setKind(item.kind);
    setDisplayMode(item.displayMode);
    setPlacement(item.placement || 'both');
    setImageUrl(item.imageUrl);
    setSubtitle(item.subtitle || '');
    setLinkUrl(item.linkUrl || '');
    setActive(item.active !== false);
    setFormError('');
  };

  const handleCyclePlacement = async (id: string) => {
    const order: Array<'both' | 'site' | 'client'> = ['both', 'site', 'client'];
    const nextList = items.map((item) => {
      if (item.id !== id) return item;
      const cur = item.placement || 'both';
      const next = order[(order.indexOf(cur) + 1) % order.length];
      return { ...item, placement: next };
    });
    await persistPartnerBanners(nextList, 'Área de exibição do parceiro atualizada.');
  };

  const handleMove = async (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= items.length) return;
    const copy = items.slice();
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, moved);
    await persistPartnerBanners(copy, 'Ordem de exibição atualizada na Home.');
  };

  const handleToggleActive = async (id: string) => {
    const nextList = items.map((item) =>
      item.id === id ? { ...item, active: item.active === false } : item
    );
    await persistPartnerBanners(nextList, 'Visibilidade atualizada na Home.');
  };

  const handleDelete = async (id: string) => {
    const nextList = items.filter((item) => item.id !== id);
    if (editingId === id) resetForm();
    await persistPartnerBanners(nextList, 'Item removido da Home.');
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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
            Parceiros &amp; Banners (Site Oficial e Áreas do Cliente)
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '3px 0 0 0' }}>
            Controle onde cada logo ou banner aparece: na Home pública do site oficial e dentro das telas do app do cliente.
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

      {/* Painel Global: Onde a Seção de Parceiros & Banners Fica Visível */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A' }}>
              Controle de Visibilidade por Área
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 2 }}>
              Ative ou desative os blocos de patrocinadores e parceiros no site oficial e nas telas internas do cliente.
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
          {([
            {
              key: 'partnerShowOnSite',
              label: 'Site Oficial (Home /)',
              desc: 'Página pública fora do app',
              checked: config.partnerShowOnSite !== false,
              icon: <Globe size={15} />,
            },
            {
              key: 'partnerShowOnClientHome',
              label: 'Cliente — Início',
              desc: 'Tela principal do passageiro',
              checked: config.partnerShowOnClientHome !== false,
              icon: <Smartphone size={15} />,
            },
            {
              key: 'partnerShowOnClientRides',
              label: 'Cliente — Atividade',
              desc: 'Aba Minhas Corridas / Histórico',
              checked: Boolean(config.partnerShowOnClientRides),
              icon: <Smartphone size={15} />,
            },
            {
              key: 'partnerShowOnClientProfile',
              label: 'Cliente — Conta',
              desc: 'Aba Perfil e Segurança',
              checked: Boolean(config.partnerShowOnClientProfile),
              icon: <Smartphone size={15} />,
            },
            {
              key: 'partnerHideEmptyPlaceholder',
              label: 'Ocultar bloco quando vazio',
              desc: 'Não mostrar espaço reservado sem itens',
              checked: Boolean(config.partnerHideEmptyPlaceholder),
              icon: <EyeOff size={15} />,
            },
          ] as const).map((toggle) => (
            <button
              key={toggle.key}
              type="button"
              disabled={isSaving}
              onClick={() =>
                persistPartnerSettings(
                  { [toggle.key]: !toggle.checked },
                  `${toggle.label}: ${!toggle.checked ? 'Ativado' : 'Desativado'}.`
                )
              }
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 10,
                border: toggle.checked ? '1.5px solid #16A34A' : '1px solid #CBD5E1',
                backgroundColor: toggle.checked ? '#F0FDF4' : '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                cursor: isSaving ? 'wait' : 'pointer',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: toggle.checked ? '#15803D' : '#64748B', display: 'inline-flex' }}>{toggle.icon}</span>
                  <span>{toggle.label}</span>
                </div>
                <div style={{ fontSize: '0.69rem', color: '#64748B', marginTop: 2 }}>{toggle.desc}</div>
              </div>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: 999,
                  backgroundColor: toggle.checked ? '#15803D' : '#E2E8F0',
                  color: toggle.checked ? '#FFFFFF' : '#475569',
                  flexShrink: 0,
                }}
              >
                {toggle.checked ? 'ON' : 'OFF'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Formulário de Cadastro / Edição */}
      <form
        onSubmit={handleSaveForm}
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Award size={17} color="#15803D" />
            <span>{editingId ? 'Editar Parceiro / Patrocinador' : 'Novo Logo ou Banner para a Home'}</span>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Nome da Empresa / Patrocinador *
            </label>
            <input
              type="text"
              placeholder="Ex: Auto Posto Serra"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

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
              Formato de Exibição
            </label>
            <select
              value={displayMode}
              onChange={(e) => setDisplayMode(e.target.value === 'banner' ? 'banner' : 'logo')}
              style={inputStyle}
            >
              <option value="logo">Logo (Card Compacto de Marca)</option>
              <option value="banner">Banner (Destaque Horizontal Largo)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Onde Exibir
            </label>
            <select
              value={placement}
              onChange={(e) => {
                const v = e.target.value;
                setPlacement(v === 'site' || v === 'client' ? v : 'both');
              }}
              style={inputStyle}
            >
              <option value="both">Site Oficial + Área do Cliente</option>
              <option value="site">Somente Site Oficial (Home)</option>
              <option value="client">Somente Área do Cliente (App)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Subtítulo ou Benefício (opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: 10% OFF para passageiros Kavro"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              style={inputStyle}
            />
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
              Visibilidade na Home
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
              <span>{active ? 'Ativo e visível na Home' : 'Oculto (rascunho)'}</span>
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
              URL da Imagem ou Logo *
            </label>
            <input
              type="text"
              placeholder="Cole https://... ou envie um arquivo ao lado"
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
              <span>Enviar arquivo (PNG/JPG/WebP)</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageFileSelected}
                style={{ display: 'none' }}
              />
            </label>

            {imageUrl && (
              <div
                style={{
                  width: displayMode === 'banner' ? 110 : 68,
                  height: 44,
                  borderRadius: 8,
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
                ? 'Publicando...'
                : editingId
                  ? 'Atualizar & Publicar na Home'
                  : 'Adicionar & Publicar na Home'}
            </span>
          </button>
        </div>
      </form>

      {/* Lista Cadastrada */}
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
            padding: '14px 18px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
            Itens Cadastrados ({items.length})
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
            Banners aparecem em destaque largo; Logos aparecem na faixa de marcas
          </span>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#64748B', fontSize: '0.84rem' }}>
            <ImageIcon size={28} color="#94A3B8" style={{ marginBottom: 6 }} />
            <div>Nenhum logo ou banner cadastrado ainda. Use o formulário acima para publicar na Home.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  padding: '12px 16px',
                  borderBottom: idx < items.length - 1 ? '1px solid #F1F5F9' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 220, flex: 1 }}>
                  <div
                    style={{
                      width: item.displayMode === 'banner' ? 104 : 64,
                      height: 46,
                      borderRadius: 8,
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#F8FAFC',
                      overflow: 'hidden',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: item.displayMode === 'banner' ? 0 : 4,
                    }}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: item.displayMode === 'banner' ? 'cover' : 'contain',
                      }}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.86rem', color: '#0F172A' }}>{item.name}</strong>
                      <span
                        style={{
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 999,
                          backgroundColor: item.kind === 'patrocinador' ? '#DCFCE7' : '#EFF6FF',
                          color: item.kind === 'patrocinador' ? '#15803D' : '#1D4ED8',
                        }}
                      >
                        {item.kind === 'patrocinador' ? 'Patrocinador' : 'Parceiro'}
                      </span>
                      <span
                        style={{
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 999,
                          backgroundColor: '#F1F5F9',
                          color: '#334155',
                        }}
                      >
                        {item.displayMode === 'banner' ? 'Banner' : 'Logo'}
                      </span>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleCyclePlacement(item.id)}
                        title="Clique para alternar onde este item aparece"
                        style={{
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          border: '1px solid #CBD5E1',
                          backgroundColor:
                            item.placement === 'site'
                              ? '#EEF2FF'
                              : item.placement === 'client'
                                ? '#FEF3C7'
                                : '#ECFDF5',
                          color:
                            item.placement === 'site'
                              ? '#3730A3'
                              : item.placement === 'client'
                                ? '#92400E'
                                : '#166534',
                          cursor: 'pointer',
                        }}
                      >
                        {item.placement === 'site'
                          ? 'Só Site Oficial'
                          : item.placement === 'client'
                            ? 'Só Área do Cliente'
                            : 'Site + Cliente'}
                      </button>
                      {item.active === false && (
                        <span
                          style={{
                            fontSize: '0.66rem',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: 999,
                            backgroundColor: '#FEF2F2',
                            color: '#DC2626',
                          }}
                        >
                          Oculto
                        </span>
                      )}
                    </div>
                    {item.subtitle && (
                      <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: 2 }}>
                        {item.subtitle}
                      </div>
                    )}
                    {item.linkUrl && (
                      <a
                        href={item.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.7rem',
                          color: '#2563EB',
                          marginTop: 2,
                          textDecoration: 'none',
                        }}
                      >
                        <ExternalLink size={11} />
                        <span>{item.linkUrl}</span>
                      </a>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    disabled={idx === 0 || isSaving}
                    onClick={() => handleMove(idx, -1)}
                    title="Subir posição"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 6,
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#FFFFFF',
                      color: idx === 0 ? '#CBD5E1' : '#334155',
                      cursor: idx === 0 ? 'default' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={idx === items.length - 1 || isSaving}
                    onClick={() => handleMove(idx, 1)}
                    title="Descer posição"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 6,
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#FFFFFF',
                      color: idx === items.length - 1 ? '#CBD5E1' : '#334155',
                      cursor: idx === items.length - 1 ? 'default' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleToggleActive(item.id)}
                    title={item.active === false ? 'Exibir na Home' : 'Ocultar da Home'}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 6,
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#FFFFFF',
                      color: item.active === false ? '#64748B' : '#15803D',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {item.active === false ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEditItem(item)}
                    title="Editar"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 6,
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#FFFFFF',
                      color: '#0F172A',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleDelete(item.id)}
                    title="Excluir"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 6,
                      border: '1px solid #FECACA',
                      backgroundColor: '#FEF2F2',
                      color: '#DC2626',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pré-visualização ao vivo (alternando entre Site Oficial e Área do Cliente) */}
      <div
        style={{
          backgroundColor: previewTarget === 'site' ? '#0D151C' : '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '10px 16px',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
            Pré-visualização ao vivo
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setPreviewTarget('site')}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: previewTarget === 'site' ? '1.5px solid #0F172A' : '1px solid #CBD5E1',
                backgroundColor: previewTarget === 'site' ? '#0F172A' : '#FFFFFF',
                color: previewTarget === 'site' ? '#FFFFFF' : '#334155',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Site Oficial (Home)
            </button>
            <button
              type="button"
              onClick={() => setPreviewTarget('client')}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: previewTarget === 'client' ? '1.5px solid #15803D' : '1px solid #CBD5E1',
                backgroundColor: previewTarget === 'client' ? '#15803D' : '#FFFFFF',
                color: previewTarget === 'client' ? '#FFFFFF' : '#334155',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Área do Cliente (App)
            </button>
          </div>
        </div>
        <div style={{ maxWidth: previewTarget === 'site' ? '100%' : 460, paddingBottom: 14 }}>
          <PartnersSponsorsSection
            items={items}
            variant={previewTarget === 'site' ? 'dark' : 'light'}
            context={previewTarget}
            sectionEnabled={
              previewTarget === 'site'
                ? config.partnerShowOnSite !== false
                : config.partnerShowOnClientHome !== false
            }
            hideWhenEmpty={Boolean(config.partnerHideEmptyPlaceholder)}
          />
          {((previewTarget === 'site' && config.partnerShowOnSite === false) ||
            (previewTarget === 'client' && config.partnerShowOnClientHome === false)) && (
            <div style={{ padding: 18, fontSize: '0.78rem', color: '#94A3B8', textAlign: 'center' }}>
              Esta área está desativada no momento no painel de visibilidade acima.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
