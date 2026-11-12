import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  User, Phone, Car, ShieldCheck, CheckCircle2, Camera, Trash2,
  Award, Share2, Check, Search, Calendar, MapPin, Clock, Eye, Play, Lock,
  AlertCircle
} from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import { StorageService } from '../services/storage';
import { formatPhone, formatRideCode, getCleanWhatsappNumber } from '../utils/format';
import { DriverPublicAuditModal } from './DriverPublicAuditModal';
import { RideRoutePlaybackModal } from './RideRoutePlaybackModal';
import { PushToggleButton } from './PushNotifications';
import { ADMIN_EXTERNAL_ID } from '../services/push';
import { cleanPlate, formatPlate, POPULAR_CAR_COLORS, isDriverVehicleConfigured, getMissingVehicleFields } from '../services/vehicleService';
import { VehiclePhotoPreview } from './VehiclePhotoPreview';
import { MercosulPlateBadge } from './MercosulPlateBadge';

interface AdminDriverProfileTabProps {
  config: SystemConfig;
  rides: Ride[];
  onSaved: (newConfig: SystemConfig) => void;
}

// Redimensiona e comprime a imagem selecionada para 320x320 JPEG (leve e instantânea no banco Supabase)
function compressProfileImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 320;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(ev.target?.result || ''));
          return;
        }
        // Recorte central quadrado (cover)
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      };
      img.onerror = reject;
      img.src = String(ev.target?.result || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Comprime a foto do veículo mantendo proporção original nítida (até 960x640 JPEG)
function compressVehicleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 960;
        const maxH = 640;
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        if (h > maxH) {
          w = Math.round((w * maxH) / h);
          h = maxH;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(ev.target?.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = reject;
      img.src = String(ev.target?.result || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const AdminDriverProfileTab: React.FC<AdminDriverProfileTabProps> = ({
  config,
  rides,
  onSaved,
}) => {
  const [driverName, setDriverName] = useState(config.driverName || '');
  const [driverPhone, setDriverPhone] = useState(formatPhone(config.driverPhone || config.companyPhone || '(48) 99691-5303'));
  const [driverPhoto, setDriverPhoto] = useState(config.driverPhoto || '');
  const [driverVehicle, setDriverVehicle] = useState(config.driverVehicle || '');
  const [driverPlate, setDriverPlate] = useState(config.driverPlate || '');
  const [driverCarBrand, setDriverCarBrand] = useState(config.driverCarBrand || '');
  const [driverCarModel, setDriverCarModel] = useState(config.driverCarModel || '');
  const [driverCarColor, setDriverCarColor] = useState(config.driverCarColor || '');
  const [driverCarYear, setDriverCarYear] = useState(config.driverCarYear || '');
  const [driverCarCategory, setDriverCarCategory] = useState(config.driverCarCategory || 'Sedan Executivo');
  const [driverCarPhoto, setDriverCarPhoto] = useState(config.driverCarPhoto || '');
  const [driverCarCity, setDriverCarCity] = useState(config.driverCarCity || 'Lauro Müller/SC');
  const [formError, setFormError] = useState<string | null>(null);

  const [driverBio, setDriverBio] = useState(
    config.driverBio ||
      'Motorista particular verificado com agendamento exclusivo, rastreamento ao vivo e histórico de viagens 100% auditado.'
  );
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [playbackRide, setPlaybackRide] = useState<Ride | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const carFileInputRef = useRef<HTMLInputElement | null>(null);

  // Sincroniza quando não estiver editando
  useEffect(() => {
    if (isDirty) return;
    setDriverName(config.driverName || '');
    setDriverPhone(formatPhone(config.driverPhone || config.companyPhone || '(48) 99691-5303'));
    setDriverPhoto(config.driverPhoto || '');
    setDriverVehicle(config.driverVehicle || '');
    setDriverPlate(config.driverPlate || '');
    setDriverCarBrand(config.driverCarBrand || '');
    setDriverCarModel(config.driverCarModel || '');
    setDriverCarColor(config.driverCarColor || '');
    setDriverCarYear(config.driverCarYear || '');
    setDriverCarCategory(config.driverCarCategory || 'Sedan Executivo');
    setDriverCarPhoto(config.driverCarPhoto || '');
    setDriverCarCity(config.driverCarCity || 'Lauro Müller/SC');
    setDriverBio(
      config.driverBio ||
        'Motorista particular verificado com agendamento exclusivo, rastreamento ao vivo e histórico de viagens 100% auditado.'
    );
  }, [config, isDirty]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await compressProfileImage(file);
      setDriverPhoto(base64);
      setIsDirty(true);
    } catch (err) {
      console.error('Erro ao processar foto de perfil:', err);
    }
  };

  const handleCarPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await compressVehicleImage(file);
      setDriverCarPhoto(base64);
      setIsDirty(true);
    } catch (err) {
      console.error('Erro ao processar foto do veículo:', err);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const formattedPlateClean = formatPlate(cleanPlate(driverPlate));
    const candidateConfig: Partial<SystemConfig> = {
      driverName: driverName.trim(),
      driverPlate: formattedPlateClean,
      driverCarBrand: driverCarBrand.trim(),
      driverCarModel: driverCarModel.trim(),
      driverCarColor: driverCarColor.trim(),
    };

    const missing = getMissingVehicleFields(candidateConfig);
    if (missing.length > 0) {
      setFormError(`Preencha todos os dados obrigatórios do veículo para liberar as corridas: ${missing.join(', ')}.`);
      return;
    }

    setIsSaving(true);
    const cleanPhoneFormatted = formatPhone(driverPhone);
    const cleanWhatsapp = getCleanWhatsappNumber(driverPhone);

    const fullVehicleTitle = `${driverCarBrand.trim()} ${driverCarModel.trim()} • Ar-Condicionado`.trim();

    const updatedConfig: SystemConfig = {
      ...config,
      driverName: driverName.trim(),
      driverPhone: cleanPhoneFormatted,
      driverPhoto,
      driverVehicle: fullVehicleTitle,
      driverPlate: formattedPlateClean,
      driverCarBrand: driverCarBrand.trim(),
      driverCarModel: driverCarModel.trim(),
      driverCarColor: driverCarColor.trim(),
      driverCarYear: driverCarYear.trim(),
      driverCarCategory: driverCarCategory.trim() || 'Sedan Executivo',
      driverCarPhoto,
      driverCarCity: driverCarCity.trim(),
      driverBio: driverBio.trim(),
      companyPhone: cleanPhoneFormatted,
      companyWhatsapp: cleanWhatsapp,
    };

    await StorageService.saveConfig(updatedConfig);
    setIsSaving(false);
    setIsDirty(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
    onSaved(updatedConfig);
  };

  // Estatísticas e Auditoria de Corridas Finalizadas
  const completedRides = useMemo(() => {
    return rides
      .filter((r) => r.status === 'finalizada')
      .sort((a, b) => {
        const dA = `${a.date}T${a.time || '00:00'}`;
        const dB = `${b.date}T${b.time || '00:00'}`;
        return dB.localeCompare(dA);
      });
  }, [rides]);

  const filteredCompletedRides = useMemo(() => {
    if (!auditSearch.trim()) return completedRides;
    const q = auditSearch.toLowerCase();
    return completedRides.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        formatRideCode(r).toLowerCase().includes(q) ||
        r.clientName.toLowerCase().includes(q) ||
        r.origin.address.toLowerCase().includes(q) ||
        r.destination.address.toLowerCase().includes(q) ||
        r.date.includes(q)
    );
  }, [completedRides, auditSearch]);

  const totalCompletedCount = completedRides.length;
  const totalAllRidesCount = rides.filter((r) => r.status !== 'cancelada').length;
  const totalKmCompleted = useMemo(
    () => completedRides.reduce((acc, r) => acc + (Number(r.distanceKm) || 0), 0),
    [completedRides]
  );
  const totalRevenueCompleted = useMemo(
    () => completedRides.reduce((acc, r) => acc + (Number(r.totalPrice) || 0), 0),
    [completedRides]
  );

  const handleCopyAuditUrl = () => {
    const url = `${window.location.origin}/auditoria`;
    navigator.clipboard.writeText(url);
    setCopiedPublicUrl(true);
    setTimeout(() => setCopiedPublicUrl(false), 2500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Modal de Pré-visualização Pública (como o cliente enxerga) */}
      <DriverPublicAuditModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        config={{
          ...config,
          driverName,
          driverPhone,
          driverPhoto,
          driverVehicle,
          driverPlate,
          driverCarBrand,
          driverCarModel,
          driverCarColor,
          driverCarYear,
          driverCarCategory,
          driverCarPhoto,
          driverCarCity,
          driverBio,
        }}
        rides={rides}
        isAdminView={false}
      />

      {/* ── ATIVAÇÃO DE NOTIFICAÇÕES PUSH NO APARELHO DO MOTORISTA ── */}
      <PushToggleButton role="admin" externalId={ADMIN_EXTERNAL_ID} />

      {/* ── TOPO: RESUMO E CONTADORES DO PERFIL DO MOTORISTA ── */}
      <div
        style={{
          backgroundColor: '#121A21',
          color: '#FFFFFF',
          borderRadius: 20,
          padding: '18px',
          border: '1.5px solid #2C3E50',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative' }}>
              {driverPhoto ? (
                <img
                  src={driverPhoto}
                  alt={driverName}
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '3px solid #76D800',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: '50%',
                    backgroundColor: '#1E293B',
                    color: '#76D800',
                    border: '3px solid #76D800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.6rem',
                    fontWeight: 900,
                  }}
                >
                  {(driverName || 'M').charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Alterar Foto do Motorista"
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  backgroundColor: '#76D800',
                  color: '#121A21',
                  border: '2px solid #121A21',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Camera size={13} />
              </button>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontSize: '0.64rem',
                    fontWeight: 800,
                    color: '#76D800',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Perfil Oficial do Motorista
                </span>
                <span
                  style={{
                    backgroundColor: 'rgba(118, 216, 0, 0.16)',
                    color: '#76D800',
                    fontSize: '0.6rem',
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: 999,
                  }}
                >
                  ✓ Auditado
                </span>
              </div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 900, margin: '2px 0 0 0', color: '#FFFFFF' }}>
                {driverName || 'Motorista Kavro Drive'}
              </h2>
              <div style={{ fontSize: '0.76rem', color: '#94A3B8', fontWeight: 600, marginTop: 2 }}>
                {driverPhone} • {driverCarBrand && driverCarModel ? `${driverCarBrand} ${driverCarModel} (${driverPlate || 'Sem placa'})` : 'Veículo pendente de cadastro'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setIsPreviewModalOpen(true)}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                backgroundColor: 'rgba(255,255,255,0.1)',
                color: '#FFFFFF',
                border: '1px solid #334155',
                fontSize: '0.76rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <Eye size={14} color="#76D800" />
              <span>Ver Visão do Cliente</span>
            </button>

            <button
              type="button"
              onClick={handleCopyAuditUrl}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                backgroundColor: copiedPublicUrl ? '#76D800' : 'rgba(118, 216, 0, 0.14)',
                color: copiedPublicUrl ? '#121A21' : '#76D800',
                border: '1px solid rgba(118, 216, 0, 0.4)',
                fontSize: '0.76rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              {copiedPublicUrl ? <Check size={14} /> : <Share2 size={14} />}
              <span>{copiedPublicUrl ? 'Link da Auditoria Copiado!' : 'Copiar Link da Auditoria'}</span>
            </button>
          </div>
        </div>

        {/* 4 Cards de Métricas do Motorista */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: '10px 8px',
              textAlign: 'center',
              border: '1px solid rgba(118, 216, 0, 0.35)',
            }}
          >
            <div style={{ fontSize: '0.58rem', color: '#76D800', fontWeight: 800, textTransform: 'uppercase' }}>
              Finalizadas
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#FFFFFF', marginTop: 2 }}>
              {totalCompletedCount}
            </div>
            <div style={{ fontSize: '0.58rem', color: '#94A3B8' }}>Na auditoria</div>
          </div>

          <div
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: 12,
              padding: '10px 8px',
              textAlign: 'center',
              border: '1px solid #2C3E50',
            }}
          >
            <div style={{ fontSize: '0.58rem', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>
              Total Corridas
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#FFFFFF', marginTop: 2 }}>
              {totalAllRidesCount}
            </div>
            <div style={{ fontSize: '0.58rem', color: '#94A3B8' }}>Agendadas/Ativas</div>
          </div>

          <div
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: 12,
              padding: '10px 8px',
              textAlign: 'center',
              border: '1px solid #2C3E50',
            }}
          >
            <div style={{ fontSize: '0.58rem', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>
              KM Concluídos
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#76D800', marginTop: 2 }}>
              {totalKmCompleted.toFixed(0)} km
            </div>
            <div style={{ fontSize: '0.58rem', color: '#94A3B8' }}>Percorridos</div>
          </div>

          <div
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: 12,
              padding: '10px 8px',
              textAlign: 'center',
              border: '1px solid #2C3E50',
            }}
          >
            <div style={{ fontSize: '0.58rem', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>
              Total Auditado
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#4ADE80', marginTop: 4 }}>
              R$ {totalRevenueCompleted.toFixed(0)}
            </div>
            <div style={{ fontSize: '0.58rem', color: '#94A3B8' }}>Concluído</div>
          </div>
        </div>
      </div>

      {/* ── FORMULÁRIO DE EDIÇÃO DO PERFIL DO MOTORISTA ── */}
      <form
        onSubmit={handleSaveProfile}
        className="card-glass"
        style={{
          padding: '18px',
          borderRadius: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #F1F5F9',
            paddingBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={18} color="#16A34A" />
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 900, color: '#0F172A', margin: 0 }}>
                Dados do Perfil do Motorista
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                Estes dados aparecem no GPS ao vivo, no comprovante e na Auditoria Pública para seus clientes
              </span>
            </div>
          </div>
        </div>

        {/* Upload de Foto de Perfil */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            backgroundColor: '#F8FAFC',
            padding: '12px 14px',
            borderRadius: 14,
            border: '1px solid #E2E8F0',
          }}
        >
          {driverPhoto ? (
            <img
              src={driverPhoto}
              alt="Foto do Motorista"
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2.5px solid #76D800',
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                backgroundColor: '#121A21',
                color: '#76D800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '1.35rem',
                flexShrink: 0,
              }}
            >
              {(driverName || 'M').charAt(0).toUpperCase()}
            </div>
          )}

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
              Foto Oficial do Motorista
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748B', marginBottom: 8 }}>
              Escolha uma foto nítida do seu rosto ou veículo para transmitir máxima confiança ao passageiro.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  backgroundColor: '#121A21',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <Camera size={14} color="#76D800" />
                <span>{driverPhoto ? 'Trocar Foto' : 'Enviar Foto'}</span>
              </button>

              {driverPhoto && (
                <button
                  type="button"
                  onClick={() => {
                    setDriverPhoto('');
                    setIsDirty(true);
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    backgroundColor: '#FEE2E2',
                    color: '#DC2626',
                    border: 'none',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={13} />
                  <span>Remover</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Campos Nome Completo e Telefone */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.74rem',
                fontWeight: 800,
                color: '#334155',
                marginBottom: 5,
              }}
            >
              Nome Completo do Motorista *
            </label>
            <div style={{ position: 'relative' }}>
              <User
                size={15}
                color="#64748B"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                value={driverName}
                onChange={(e) => {
                  setDriverName(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Ex: Alisson Santos"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 34px',
                  borderRadius: 10,
                  border: '1.5px solid #CBD5E1',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: '#0F172A',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.74rem',
                fontWeight: 800,
                color: '#334155',
                marginBottom: 5,
              }}
            >
              Telefone / WhatsApp do Motorista *
            </label>
            <div style={{ position: 'relative' }}>
              <Phone
                size={15}
                color="#16A34A"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="tel"
                value={driverPhone}
                onChange={(e) => {
                  setDriverPhone(formatPhone(e.target.value));
                  setIsDirty(true);
                }}
                placeholder="(48) 99691-5303"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 34px',
                  borderRadius: 10,
                  border: '1.5px solid #CBD5E1',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: '#0F172A',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        </div>

        {/* ── ÁREA DE IDENTIFICAÇÃO OFICIAL DO VEÍCULO (CADASTRO MANUAL OBRIGATÓRIO) ── */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            borderRadius: 16,
            padding: '16px',
            border: isDriverVehicleConfigured({
              driverName,
              driverPlate,
              driverCarBrand,
              driverCarModel,
              driverCarColor,
            })
              ? '1.5px solid #E2E8F0'
              : '2px solid #F59E0B',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              borderBottom: '1px solid #E2E8F0',
              paddingBottom: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: '#121A21',
                  color: '#76D800',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Car size={18} />
              </div>
              <div>
                <h4 style={{ fontSize: '0.90rem', fontWeight: 900, color: '#0F172A', margin: 0 }}>
                  Identificação Oficial do Veículo (Preenchimento Manual Obrigatório)
                </h4>
                <span style={{ fontSize: '0.70rem', color: '#64748B' }}>
                  Digite manualmente a placa, marca, modelo e cor real do seu veículo para liberar o início de corridas
                </span>
              </div>
            </div>

            <span
              style={{
                fontSize: '0.66rem',
                fontWeight: 800,
                color: isDriverVehicleConfigured({
                  driverName,
                  driverPlate,
                  driverCarBrand,
                  driverCarModel,
                  driverCarColor,
                })
                  ? '#16A34A'
                  : '#B45309',
                backgroundColor: isDriverVehicleConfigured({
                  driverName,
                  driverPlate,
                  driverCarBrand,
                  driverCarModel,
                  driverCarColor,
                })
                  ? '#DCFCE7'
                  : '#FEF3C7',
                padding: '3px 8px',
                borderRadius: 999,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <ShieldCheck size={12} />
              {isDriverVehicleConfigured({
                driverName,
                driverPlate,
                driverCarBrand,
                driverCarModel,
                driverCarColor,
              })
                ? 'Veículo Cadastrado'
                : 'Obrigatório para Corridas'}
            </span>
          </div>

          {/* Campo Placa Manual com Preview Mercosul */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.74rem',
                fontWeight: 800,
                color: '#334155',
                marginBottom: 6,
              }}
            >
              Placa do Veículo (Padrão Mercosul ou Tradicional - 7 dígitos) *
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: 155 }}>
                <input
                  type="text"
                  value={driverPlate}
                  onChange={(e) => {
                    const raw = formatPlate(cleanPlate(e.target.value));
                    setDriverPlate(raw);
                    setIsDirty(true);
                  }}
                  placeholder="ABC-1D23"
                  maxLength={8}
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    color: '#0F172A',
                    letterSpacing: '0.08em',
                    boxSizing: 'border-box',
                    textAlign: 'center',
                  }}
                />
              </div>

              {/* Placa Mercosul Estilizada */}
              {driverPlate.trim() && <MercosulPlateBadge plate={driverPlate} size="sm" />}
            </div>
          </div>

          {/* Grid de Dados Técnicos do Carro */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 10,
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: '#334155',
                  marginBottom: 4,
                }}
              >
                Marca do Veículo *
              </label>
              <input
                type="text"
                value={driverCarBrand}
                onChange={(e) => {
                  setDriverCarBrand(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Digite a marca (Ex: Chevrolet, Fiat, VW...)"
                required
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1.5px solid #CBD5E1',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: '#0F172A',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: '#334155',
                  marginBottom: 4,
                }}
              >
                Modelo e Versão *
              </label>
              <input
                type="text"
                value={driverCarModel}
                onChange={(e) => {
                  setDriverCarModel(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Digite o modelo exato do seu carro"
                required
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1.5px solid #CBD5E1',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: '#0F172A',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: '#334155',
                  marginBottom: 4,
                }}
              >
                Ano Fab/Modelo
              </label>
              <input
                type="text"
                value={driverCarYear}
                onChange={(e) => {
                  setDriverCarYear(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Ex: 2022/2023"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1.5px solid #CBD5E1',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: '#0F172A',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: '#334155',
                  marginBottom: 4,
                }}
              >
                Categoria do Veículo
              </label>
              <select
                value={driverCarCategory}
                onChange={(e) => {
                  setDriverCarCategory(e.target.value);
                  setIsDirty(true);
                }}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1.5px solid #CBD5E1',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: '#0F172A',
                  boxSizing: 'border-box',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="Sedan Executivo">Sedan Executivo</option>
                <option value="SUV Premium">SUV Premium</option>
                <option value="Hatch Conforto">Hatch Conforto</option>
                <option value="Minivan / Espaçoso">Minivan / Espaçoso</option>
              </select>
            </div>
          </div>

          {/* Seletor de Cor Oficial do Carro */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  color: '#334155',
                }}
              >
                Cor do Veículo (Importante para o cliente reconhecer o carro) *
              </label>
              <span style={{ fontSize: '0.72rem', color: '#16A34A', fontWeight: 700 }}>
                {driverCarColor || 'Selecione abaixo'}
              </span>
            </div>

            {/* Chips de Cores Populares */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {POPULAR_CAR_COLORS.map((cp) => {
                const isSelected = driverCarColor.toLowerCase().includes(cp.name.toLowerCase());
                return (
                  <button
                    key={cp.name}
                    type="button"
                    onClick={() => {
                      setDriverCarColor(cp.label);
                      setIsDirty(true);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 10px',
                      borderRadius: 20,
                      backgroundColor: isSelected ? '#121A21' : '#FFFFFF',
                      color: isSelected ? '#FFFFFF' : '#334155',
                      border: isSelected ? '1.5px solid #76D800' : '1px solid #CBD5E1',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: cp.hex,
                        border: '1px solid rgba(0,0,0,0.2)',
                      }}
                    />
                    <span>{cp.name}</span>
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              value={driverCarColor}
              onChange={(e) => {
                setDriverCarColor(e.target.value);
                setIsDirty(true);
              }}
              placeholder="Ou digite a cor exata (Ex: Branco Pérola, Preto Ônix...)"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1.5px solid #CBD5E1',
                fontSize: '0.82rem',
                color: '#0F172A',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Upload da Foto Real do Veículo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              backgroundColor: '#FFFFFF',
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid #E2E8F0',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                Foto Real do Veículo (Opcional, porém altamente recomendado)
              </div>
              <div style={{ fontSize: '0.70rem', color: '#64748B' }}>
                Mostre o exterior limpo do carro para transmitir segurança aos passageiros antes do embarque.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                ref={carFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleCarPhotoUpload}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => carFileInputRef.current?.click()}
                style={{
                  padding: '7px 12px',
                  borderRadius: 8,
                  backgroundColor: '#121A21',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <Camera size={14} color="#76D800" />
                <span>{driverCarPhoto ? 'Trocar Foto do Carro' : 'Enviar Foto do Carro'}</span>
              </button>

              {driverCarPhoto && (
                <button
                  type="button"
                  onClick={() => {
                    setDriverCarPhoto('');
                    setIsDirty(true);
                  }}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 8,
                    backgroundColor: '#FEE2E2',
                    color: '#DC2626',
                    border: 'none',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={13} />
                  <span>Remover</span>
                </button>
              )}
            </div>
          </div>

          {/* Pré-visualização ao Vivo de como o passageiro vê o carro */}
          <div
            style={{
              backgroundColor: '#F1F5F9',
              borderRadius: 14,
              padding: '12px',
              border: '1px dashed #CBD5E1',
            }}
          >
            <div
              style={{
                fontSize: '0.70rem',
                fontWeight: 800,
                color: '#475569',
                textTransform: 'uppercase',
                marginBottom: 8,
                letterSpacing: '0.04em',
                textAlign: 'center',
              }}
            >
              📱 Pré-visualização Oficial no Aplicativo (Proporção Real da Tela do Cliente):
            </div>
            <div style={{ maxWidth: 440, margin: '0 auto' }}>
              <VehiclePhotoPreview
                photoUrl={driverCarPhoto}
                brand={driverCarBrand}
                model={driverCarModel}
                colorName={driverCarColor}
                plate={driverPlate}
                category={driverCarCategory}
                year={driverCarYear}
                size="normal"
                showPlate={true}
              />
            </div>
          </div>
        </div>

        {/* Mensagem de Segurança / Apresentação */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.74rem',
              fontWeight: 800,
              color: '#334155',
              marginBottom: 5,
            }}
          >
            Selo / Apresentação de Segurança (Visível aos Clientes)
          </label>
          <textarea
            rows={2}
            value={driverBio}
            onChange={(e) => {
              setDriverBio(e.target.value);
              setIsDirty(true);
            }}
            placeholder="Descreva sua experiência e compromisso com pontualidade e segurança..."
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1.5px solid #CBD5E1',
              fontSize: '0.82rem',
              color: '#0F172A',
              resize: 'vertical',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {formError && (
          <div
            style={{
              backgroundColor: '#FEF2F2',
              border: '1.5px solid #FECACA',
              color: '#DC2626',
              padding: '10px 14px',
              borderRadius: 12,
              fontSize: '0.80rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertCircle size={17} style={{ flexShrink: 0 }} />
            <span>{formError}</span>
          </div>
        )}

        {/* Botão Salvar Perfil */}
        <button
          type="submit"
          disabled={isSaving}
          className="btn-ios-primary"
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 12,
            fontSize: '0.9rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: 'pointer',
          }}
        >
          <CheckCircle2 size={18} />
          <span>
            {isSaving
              ? 'Salvando no Banco de Dados...'
              : savedSuccess
                ? '✓ Perfil Salvo e Atualizado com Sucesso!'
                : 'Salvar Perfil do Motorista'}
          </span>
        </button>
      </form>

      {/* ── AUDITORIA PÚBLICA DE CORRIDAS FINALIZADAS (PAINEL DO MOTORISTA) ── */}
      <div
        className="card-glass"
        style={{
          padding: '18px',
          borderRadius: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: '#DCFCE7',
                color: '#15803D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 900, color: '#0F172A', margin: 0 }}>
                Auditoria Pública de Corridas Finalizadas ({completedRides.length})
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                Todas as corridas concluídas ficam auditadas para comprovar sua credibilidade e segurança aos clientes
              </span>
            </div>
          </div>

          <span
            style={{
              backgroundColor: '#DCFCE7',
              color: '#15803D',
              fontSize: '0.7rem',
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Award size={13} />
            <span>100% Verificado</span>
          </span>
        </div>

        {/* Campo de busca na auditoria */}
        <div style={{ position: 'relative' }}>
          <Search
            size={15}
            color="#94A3B8"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            placeholder="Filtrar corridas finalizadas por código (#UP), cliente, endereço ou data..."
            value={auditSearch}
            onChange={(e) => setAuditSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 34px',
              borderRadius: 10,
              border: '1px solid #CBD5E1',
              backgroundColor: '#F8FAFC',
              fontSize: '0.8rem',
              color: '#0F172A',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Lista de Corridas Finalizadas */}
        {filteredCompletedRides.length === 0 ? (
          <div
            style={{
              padding: '28px 16px',
              textAlign: 'center',
              backgroundColor: '#F8FAFC',
              borderRadius: 12,
              border: '1px dashed #CBD5E1',
              color: '#64748B',
              fontSize: '0.82rem',
            }}
          >
            {completedRides.length === 0
              ? 'Ainda não há corridas com status "Finalizada". Assim que você concluir corridas no painel, elas serão listadas automaticamente aqui e na auditoria pública dos clientes.'
              : 'Nenhuma corrida finalizada encontrada para o filtro informado.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 460, overflowY: 'auto' }}>
            {filteredCompletedRides.map((r) => {
              const formattedDate = r.date ? r.date.split('-').reverse().join('/') : '';
              const rideCode = formatRideCode(r);
              return (
                <div
                  key={r.id}
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: 12,
                    padding: '10px 12px',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          backgroundColor: '#121A21',
                          color: '#76D800',
                          fontSize: '0.72rem',
                          fontWeight: 900,
                          padding: '2px 8px',
                          borderRadius: 6,
                        }}
                      >
                        {rideCode}
                      </span>
                      <span
                        style={{
                          backgroundColor: '#DCFCE7',
                          color: '#15803D',
                          fontSize: '0.64rem',
                          fontWeight: 800,
                          padding: '2px 7px',
                          borderRadius: 999,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <CheckCircle2 size={11} />
                        <span>Finalizada & Auditada</span>
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: '#475569',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Calendar size={11} />
                      <span>
                        {formattedDate} às {r.time}
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.76rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <strong style={{ color: '#0F172A' }}>Embarque:</strong> {r.origin.address}
                    </div>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <strong style={{ color: '#0F172A' }}>Destino:</strong> {r.destination.address}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid #E2E8F0',
                      paddingTop: 6,
                      fontSize: '0.7rem',
                      color: '#64748B',
                      fontWeight: 700,
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <span>👤 Cliente: {r.clientName}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span>
                        <MapPin size={10} style={{ display: 'inline', marginRight: 2 }} />
                        {r.distanceKm} km
                      </span>
                      <span>
                        <Clock size={10} style={{ display: 'inline', marginRight: 2 }} />
                        ~{r.durationMin} min
                      </span>
                      <span style={{ color: '#16A34A', fontWeight: 900 }}>
                        R$ {r.totalPrice.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPlaybackRide(r)}
                    style={{
                      marginTop: 2,
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 9,
                      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                      border: '1px solid #38BDF8',
                      color: '#FFFFFF',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      cursor: 'pointer',
                    }}
                  >
                    <Play size={13} color="#76D800" fill="#76D800" />
                    <span>Abrir Gravação GPS & Emitir Laudo de Prova ({rideCode})</span>
                    <Lock size={11} color="#94A3B8" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Exclusivo Admin de Replay e Emissão de Prova Judicial / Auditoria */}
      {playbackRide && (
        <RideRoutePlaybackModal
          ride={playbackRide}
          isOpen={Boolean(playbackRide)}
          onClose={() => setPlaybackRide(null)}
          config={{
            ...config,
            driverName,
            driverPhone,
            driverVehicle,
            driverPlate,
          }}
        />
      )}
    </div>
  );
};

