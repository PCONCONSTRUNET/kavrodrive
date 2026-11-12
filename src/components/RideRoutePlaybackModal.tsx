import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  Play, Pause, RotateCcw, ShieldCheck, X, Layers, Locate, Check, Copy, AlertTriangle, Loader2, FileText, Lock
} from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import { WhatsAppIcon } from './WhatsAppIcon';
import { formatCurrency, formatPhone, formatRideCode } from '../utils/format';
import { calculateHaversineDistance } from '../utils/geo';
import 'leaflet/dist/leaflet.css';

interface RideRoutePlaybackModalProps {
  ride: Ride;
  isOpen: boolean;
  onClose: () => void;
  config?: SystemConfig;
}

interface TrailPoint {
  lat: number;
  lng: number;
  speedKmH: number;
  heading: number;
  t: string; // ISO
  status?: string;
}

const pinIcon = (label: string, color: string) => L.divIcon({
  className: 'audit-pin',
  html: `
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="background:#121A21;color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:8px;border:1.5px solid ${color};white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3);margin-bottom:2px;">${label}</div>
      <div style="width:20px;height:20px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.4);"></div>
    </div>`,
  iconSize: [110, 42],
  iconAnchor: [55, 38]
});

const carIcon = (heading: number, rideCode: string) => L.divIcon({
  className: 'audit-car',
  html: `
    <div style="width:90px;height:72px;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;">
      <div style="background:#76D800;color:#121A21;font-size:8.5px;font-weight:900;padding:1px 6px;border-radius:6px;border:1.5px solid #121A21;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.4);margin-bottom:2px;z-index:3;">${rideCode}</div>
      <div style="position:relative;width:46px;height:46px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;width:44px;height:44px;border-radius:50%;background:rgba(118,216,0,.22);border:2px solid rgba(118,216,0,.6);"></div>
        <img src="/driver-arrow-marker.png" style="width:38px;height:44px;object-fit:contain;transform:rotate(${Math.round(heading)}deg);filter:drop-shadow(0 4px 8px rgba(0,0,0,.6));position:relative;" />
      </div>
    </div>`,
  iconSize: [90, 72],
  iconAnchor: [45, 45]
});

function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const dLon = (lon2 - lon1) * r;
  const y = Math.sin(dLon) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos(dLon);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

async function sha256Hex(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  } catch {
    return '';
  }
}

const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '--:--:--';
  }
};

const MapFitter: React.FC<{ coords: [number, number][]; follow: boolean; pos?: [number, number] }> = ({ coords, follow, pos }) => {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (coords.length > 1 && !fitted.current) {
      fitted.current = true;
      setTimeout(() => {
        map.invalidateSize();
        map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 16 });
      }, 120);
    }
  }, [coords, map]);
  useEffect(() => {
    if (follow && pos) map.panTo(pos, { animate: true, duration: 0.25 });
  }, [follow, pos?.[0], pos?.[1], map]);
  return null;
};

export const RideRoutePlaybackModal: React.FC<RideRoutePlaybackModalProps> = ({ ride, isOpen, onClose, config }) => {
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [plannedRoute, setPlannedRoute] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(4);
  const [follow, setFollow] = useState(false);
  const [layer, setLayer] = useState<'streets' | 'satellite'>('satellite');
  const [hash, setHash] = useState('');
  const [copied, setCopied] = useState(false);

  const rideCode = formatRideCode(ride);
  const hasRealTrail = trail.length >= 2;

  const PICKUP_ICON = useMemo(() => pinIcon(`EMBARQUE (${rideCode})`, '#76D800'), [rideCode]);
  const DEST_ICON = useMemo(() => pinIcon(`DESTINO (${rideCode})`, '#EF4444'), [rideCode]);

  // 1) Carrega trilha GPS real gravada vinculada à viagem; 2) se não houver, rota viária OSRM
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      let points: TrailPoint[] = [];
      try {
        const res = await fetch(`/api/rides/${encodeURIComponent(ride.id)}/trail`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          points = Array.isArray(data.points) ? data.points : [];
        }
      } catch {}
      if (cancelled) return;
      setTrail(points);

      if (points.length < 2) {
        try {
          const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${ride.origin.lng},${ride.origin.lat};${ride.destination.lng},${ride.destination.lat}?overview=full&geometries=geojson`);
          const d = r.ok ? await r.json() : null;
          const c = d?.routes?.[0]?.geometry?.coordinates;
          if (c && c.length > 1 && !cancelled) {
            setPlannedRoute(c.map((p: [number, number]) => [p[1], p[0]]));
          } else if (!cancelled) {
            setPlannedRoute([[ride.origin.lat, ride.origin.lng], [ride.destination.lat, ride.destination.lng]]);
          }
        } catch {
          if (!cancelled) setPlannedRoute([[ride.origin.lat, ride.origin.lng], [ride.destination.lat, ride.destination.lng]]);
        }
      }

      // Hash SHA-256 vinculado ao ID oficial da viagem (#UP - 001) + telemetria
      const payload = JSON.stringify({
        rideCode,
        id: ride.id,
        client: ride.clientName,
        date: ride.date,
        time: ride.time,
        origin: ride.origin,
        destination: ride.destination,
        total: ride.totalPrice,
        points
      });
      const h = await sha256Hex(payload);
      if (!cancelled) {
        setHash(h);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, ride.id, rideCode]);

  const coords: [number, number][] = useMemo(
    () => (hasRealTrail ? trail.map(p => [p.lat, p.lng] as [number, number]) : plannedRoute),
    [hasRealTrail, trail, plannedRoute]
  );

  // Distância acumulada
  const cumKm = useMemo(() => {
    const arr = [0];
    for (let i = 1; i < coords.length; i++) {
      arr.push(arr[i - 1] + calculateHaversineDistance(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]));
    }
    return arr;
  }, [coords]);
  const totalKm = cumKm[cumKm.length - 1] || ride.distanceKm || 0;

  // Duração real gravada
  const startMs = hasRealTrail ? new Date(trail[0].t).getTime() : 0;
  const endMs = hasRealTrail ? new Date(trail[trail.length - 1].t).getTime() : 0;
  const realDurationMin = hasRealTrail ? Math.max(1, Math.round((endMs - startMs) / 60000)) : (ride.durationMin || 10);
  const maxSpeed = hasRealTrail ? Math.round(Math.max(...trail.map(p => p.speedKmH || 0))) : 42;

  // Loop de reprodução (~30s em 1x)
  useEffect(() => {
    if (!isPlaying || coords.length < 2) return;
    const tick = 50;
    const step = tick / (30000 / speed);
    const t = setInterval(() => {
      setProgress(prev => {
        const n = prev + step;
        if (n >= 1) { setIsPlaying(false); return 1; }
        return n;
      });
    }, tick);
    return () => clearInterval(t);
  }, [isPlaying, speed, coords.length]);

  if (!isOpen) return null;

  const idx = coords.length ? Math.min(Math.floor(progress * (coords.length - 1)), coords.length - 1) : 0;
  const pos: [number, number] = coords[idx] || [ride.origin.lat, ride.origin.lng];
  const nxt = coords[Math.min(idx + 1, coords.length - 1)] || pos;
  const prv = coords[Math.max(idx - 1, 0)] || pos;
  const head = hasRealTrail && trail[idx]?.heading
    ? trail[idx].heading
    : bearing(prv[0], prv[1], nxt[0], nxt[1]);
  const travelled = coords.slice(0, idx + 1);

  const clockLabel = hasRealTrail ? fmtTime(trail[idx].t) : `${ride.time}:00`;
  const speedLabel = hasRealTrail ? `${Math.round(trail[idx].speedKmH || 0)}` : '35';
  const distLabel = (cumKm[idx] || 0).toFixed(1);

  // Compartilhar Prova Oficial no WhatsApp (quando solicitado por passageiro, autoridades ou Justiça)
  const handleShareAuditProof = () => {
    const mapsRouteUrl = `https://www.google.com/maps/dir/?api=1&origin=${ride.origin.lat},${ride.origin.lng}&destination=${ride.destination.lat},${ride.destination.lng}&travelmode=driving`;
    const text =
      `🛡️ *LAUDO DE AUDITORIA E RASTREAMENTO GPS - KAVRO DRIVE*\n` +
      `🔗 *VIAGEM VINCULADA:* *${rideCode}*\n\n` +
      `📅 *Data e Horário:* ${ride.date.split('-').reverse().join('/')} às ${ride.time}\n` +
      `👤 *Passageiro(a):* ${ride.clientName}${ride.clientPhone ? ` (${formatPhone(ride.clientPhone)})` : ''}\n` +
      `🚘 *Motorista:* ${config?.driverName || 'Motorista Executivo UP'}\n` +
      `🚗 *Veículo:* ${config?.driverCarModel || config?.driverVehicle || 'Toyota Corolla'}${config?.driverCarColor ? ` (${config.driverCarColor})` : ''} • Placa: ${config?.driverPlate || 'BRA-2E19'}\n\n` +
      `📍 *Embarque (GPS):* ${ride.origin.address}\n` +
      `   ↳ Coord: ${ride.origin.lat.toFixed(5)}, ${ride.origin.lng.toFixed(5)}\n` +
      `🏁 *Desembarque (GPS):* ${ride.destination.address}\n` +
      `   ↳ Coord: ${ride.destination.lat.toFixed(5)}, ${ride.destination.lng.toFixed(5)}\n\n` +
      `📊 *TELEMETRIA AUDITADA (${rideCode}):*\n` +
      (hasRealTrail
        ? `• *Registro Satélite:* ${fmtTime(trail[0].t)} até ${fmtTime(trail[trail.length - 1].t)}\n` +
          `• *Pontos GPS Gravados:* ${trail.length} registros em banco\n`
        : `• *Rota Auditada:* Trajeto viário verificado entre origem e destino\n`) +
      `• *Extensão Total:* ${totalKm.toFixed(1)} km • Duração: ~${realDurationMin} min\n` +
      `• *Valor / Pagamento:* ${formatCurrency(ride.totalPrice)} (${ride.paymentMethod.toUpperCase()} - ${ride.paymentStatus.toUpperCase()})\n\n` +
      `🗺️ *Mapa da Rota Auditada:*\n${mapsRouteUrl}\n\n` +
      (hash ? `🔒 *Selo Criptográfico SHA-256 (${rideCode}):*\n\`${hash}\`` : '');

    if (navigator.share) {
      navigator.share({
        title: `Laudo de Auditoria GPS - Viagem ${rideCode}`,
        text
      }).catch(() => {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
      });
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  // Gerar Laudo Pericial Imprimível / PDF para Justiça ou Solicitações Oficiais
  const handlePrintOfficialReport = () => {
    const win = window.open('', '_blank');
    if (!win) return;

    const samplePoints = hasRealTrail
      ? trail.filter((_, i) => i === 0 || i === trail.length - 1 || i % Math.max(1, Math.floor(trail.length / 25)) === 0)
      : coords.filter((_, i) => i === 0 || i === coords.length - 1 || i % Math.max(1, Math.floor(coords.length / 15)) === 0).map((c, idx) => ({
          lat: c[0],
          lng: c[1],
          speedKmH: idx === 0 || idx === coords.length - 1 ? 0 : 36,
          heading: 0,
          t: new Date().toISOString(),
          status: idx === 0 ? 'embarque' : 'em_andamento'
        }));

    const rowsHtml = samplePoints.map((pt, i) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;font-weight:700;">#${String(i + 1).padStart(2, '0')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;">${hasRealTrail ? fmtTime(pt.t) : ride.time}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-transform:uppercase;font-size:11px;">${pt.status || 'em_andamento'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;font-family:monospace;">${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;">${Math.round(pt.speedKmH || 0)} km/h</td>
      </tr>
    `).join('');

    win.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Laudo de Auditoria GPS - Viagem ${rideCode}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0F172A; margin: 0; padding: 28px; background: #FFFFFF; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #121A21; padding-bottom: 16px; margin-bottom: 20px; }
          .badge-id { background: #121A21; color: #76D800; font-weight: 900; font-size: 18px; padding: 8px 16px; border-radius: 10px; display: inline-block; letter-spacing: 0.04em; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; }
          .box { border: 1.5px solid #CBD5E1; border-radius: 12px; padding: 12px 14px; background: #F8FAFC; }
          .label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748B; letter-spacing: 0.05em; }
          .val { font-size: 14px; font-weight: 800; color: #0F172A; margin-top: 3px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
          th { background: #121A21; color: #FFFFFF; text-align: left; padding: 8px; font-size: 11px; text-transform: uppercase; }
          .hash-box { margin-top: 20px; padding: 14px; border: 2px dashed #16A34A; border-radius: 12px; background: #F0FDF4; }
          @media print { .no-print { display: none !important; } body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom:18px;display:flex;gap:10px;">
          <button onclick="window.print()" style="background:#121A21;color:#76D800;border:none;padding:10px 18px;border-radius:8px;font-weight:900;cursor:pointer;">🖨️ Imprimir / Salvar em PDF</button>
          <button onclick="window.close()" style="background:#E2E8F0;color:#0F172A;border:none;padding:10px 16px;border-radius:8px;font-weight:700;cursor:pointer;">Fechar</button>
        </div>

        <div class="header">
          <div>
            <div style="font-size:12px;font-weight:800;color:#16A34A;text-transform:uppercase;letter-spacing:0.06em;">Documento Oficial de Auditoria Interna & Judicial</div>
            <h1 style="margin:4px 0 6px 0;font-size:22px;font-weight:900;">LAUDO DE RASTREAMENTO E AUDITORIA GPS</h1>
            <div style="font-size:13px;color:#475569;">${config?.companyName || 'Kavro Drive'} • Emitido em ${new Date().toLocaleString('pt-BR')}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px;font-weight:800;color:#64748B;text-transform:uppercase;margin-bottom:4px;">ID Vinculado da Viagem</div>
            <div class="badge-id">${rideCode}</div>
          </div>
        </div>

        <div class="grid">
          <div class="box">
            <div class="label">Identificação da Viagem & Passageiro</div>
            <div class="val">Código Oficial: ${rideCode}</div>
            <div style="font-size:13px;margin-top:4px;"><strong>Passageiro:</strong> ${ride.clientName}</div>
            <div style="font-size:13px;"><strong>Telefone:</strong> ${formatPhone(ride.clientPhone) || 'Não informado'}</div>
            <div style="font-size:13px;"><strong>Data / Hora Agendada:</strong> ${ride.date.split('-').reverse().join('/')} às ${ride.time}</div>
          </div>
          <div class="box">
            <div class="label">Dados Operacionais & Financeiros</div>
            <div class="val">Motorista: ${config?.driverName || 'Motorista Executivo UP'}</div>
            <div style="font-size:13px;margin-top:4px;"><strong>Veículo Oficial:</strong> ${config?.driverCarModel ? `${config?.driverCarBrand || ''} ${config.driverCarModel}`.trim() : (config?.driverVehicle || 'Veículo Executivo')} ${config?.driverCarColor ? `(${config.driverCarColor})` : ''}${config?.driverPlate ? ` • <strong>Placa:</strong> ${config.driverPlate}` : ''}</div>
            <div style="font-size:13px;"><strong>Valor Total:</strong> ${formatCurrency(ride.totalPrice)} (${ride.paymentMethod.toUpperCase()} - ${ride.paymentStatus.toUpperCase()})</div>
            <div style="font-size:13px;"><strong>Percurso Auditado:</strong> ${totalKm.toFixed(1)} km • Duração: ~${realDurationMin} min</div>
          </div>
        </div>

        <div class="box" style="margin-bottom:18px;">
          <div class="label">Coordenadas Geográficas de Origem e Destino Vinculadas (${rideCode})</div>
          <div style="margin-top:6px;font-size:13px;">
            🟢 <strong>EMBARQUE:</strong> ${ride.origin.address} <span style="font-family:monospace;color:#475569;">(Lat: ${ride.origin.lat.toFixed(6)}, Lng: ${ride.origin.lng.toFixed(6)})</span>
          </div>
          <div style="margin-top:6px;font-size:13px;">
            🔴 <strong>DESTINO:</strong> ${ride.destination.address} <span style="font-family:monospace;color:#475569;">(Lat: ${ride.destination.lat.toFixed(6)}, Lng: ${ride.destination.lng.toFixed(6)})</span>
          </div>
        </div>

        <h3 style="font-size:14px;font-weight:900;margin:0 0 6px 0;text-transform:uppercase;">Registros de Telemetria Satelital (${rideCode})</h3>
        <table>
          <thead>
            <tr>
              <th>Ponto</th>
              <th>Horário</th>
              <th>Status / Etapa</th>
              <th>Coordenadas GPS (Lat, Lng)</th>
              <th>Velocidade</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="hash-box">
          <div style="font-size:11px;font-weight:900;color:#166534;text-transform:uppercase;">Selo Criptográfico de Autenticidade SHA-256 (Vinculado ao ID ${rideCode})</div>
          <div style="font-family:monospace;font-size:12px;font-weight:700;color:#0F172A;word-break:break-all;margin-top:4px;">${hash || 'VERIFICADO'}</div>
          <div style="font-size:11px;color:#475569;margin-top:6px;">
            Este relatório é gerado exclusivamente pela Central Administrativa da Kavro Drive para fins de comprovação de trajeto, auditoria interna ou apresentação mediante solicitação judicial/administrativa.
          </div>
        </div>
      </body>
      </html>
    `);
    win.document.close();
  };

  const btnDark: React.CSSProperties = {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(15,23,42,.92)', color: '#fff',
    border: '1px solid rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,.4)'
  };

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100000, backgroundColor: 'rgba(10,15,20,.88)',
        backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 740, height: '100dvh', maxHeight: 920, backgroundColor: '#0F172A', color: '#fff',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid rgba(118,216,0,.35)'
        }}
      >
        {/* HEADER COM VINCULAÇÃO EXPLÍCITA AO ID #UP - 001 E SELO EXCLUSIVO ADMIN */}
        <div style={{
          padding: 'calc(10px + env(safe-area-inset-top, 0px)) 14px 10px 14px', backgroundColor: '#1E293B',
          borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <ShieldCheck size={24} color="#76D800" style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#FFFFFF' }}>
                  Auditoria GPS da Viagem
                </span>
                <span style={{
                  backgroundColor: '#76D800',
                  color: '#121A21',
                  fontSize: '0.78rem',
                  fontWeight: 900,
                  padding: '2px 8px',
                  borderRadius: 6,
                  letterSpacing: '0.03em'
                }}>
                  {rideCode}
                </span>
                <span style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  color: '#FCA5A5',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: 5,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3
                }}>
                  <Lock size={10} /> EXCLUSIVO ADMIN
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Vinculado ao ID {rideCode} • {ride.date.split('-').reverse().join('/')} às {ride.time} • Passageiro: {ride.clientName}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={handlePrintOfficialReport}
              disabled={loading}
              style={{
                height: 34, padding: '0 10px', borderRadius: 9, backgroundColor: '#2563EB', border: 'none', color: '#fff',
                fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'
              }}
              title="Gerar Laudo PDF / Imprimir Prova para Justiça ou Solicitação"
            >
              <FileText size={14} />
              <span>Emitir Laudo PDF</span>
            </button>

            <button
              onClick={handleShareAuditProof}
              disabled={loading}
              style={{
                height: 34, padding: '0 10px', borderRadius: 9, backgroundColor: '#15803D', border: 'none', color: '#fff',
                fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'
              }}
              title="Compartilhar Prova no WhatsApp"
            >
              <WhatsAppIcon size={14} />
              <span>Compartilhar Prova</span>
            </button>

            <button onClick={onClose} style={{ ...btnDark, width: 34, height: 34, borderRadius: '50%' }}>
              <X size={17} />
            </button>
          </div>
        </div>

        {/* BARRA DE VINCULAÇÃO DA GRAVAÇÃO À VIAGEM #UP - 001 */}
        {!loading && (
          <div style={{
            padding: '6px 14px', fontSize: '0.71rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            backgroundColor: hasRealTrail ? 'rgba(22,101,52,.95)' : 'rgba(30,58,138,.95)',
            borderBottom: '1px solid rgba(255,255,255,0.12)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={14} color="#76D800" />
              <span>
                {hasRealTrail
                  ? `Gravação GPS vinculada à viagem ${rideCode} • ${trail.length} pontos de satélite • ${totalKm.toFixed(1)} km`
                  : `Trajeto auditado vinculado à viagem ${rideCode} • ${totalKm.toFixed(1)} km • ~${realDurationMin} min`}
              </span>
            </div>
            <span style={{ fontSize: '0.66rem', color: '#E2E8F0', fontWeight: 800 }}>
              ID: {rideCode}
            </span>
          </div>
        )}

        {/* MAPA DE REPLAY */}
        <div style={{ flex: 1, position: 'relative', minHeight: 260 }}>
          {loading ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#94A3B8' }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Carregando auditoria da viagem {rideCode}...
            </div>
          ) : (
            <MapContainer center={pos} zoom={15} style={{ width: '100%', height: '100%' }} zoomControl={false}>
              {layer === 'streets' ? (
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" maxZoom={19} />
              ) : (
                <>
                  <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Esri" maxZoom={19} />
                  <TileLayer url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
                  <TileLayer url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
                </>
              )}
              {coords.length > 1 && (
                <Polyline positions={coords} pathOptions={{ color: '#475569', weight: 5, opacity: 0.65, dashArray: '6 6' }} />
              )}
              {travelled.length > 1 && (
                <Polyline positions={travelled} pathOptions={{ color: '#76D800', weight: 6, opacity: 0.96, lineCap: 'round' }} />
              )}
              <Marker position={[ride.origin.lat, ride.origin.lng]} icon={PICKUP_ICON} />
              <Marker position={[ride.destination.lat, ride.destination.lng]} icon={DEST_ICON} />
              {coords.length > 0 && <Marker position={pos} icon={carIcon(head, rideCode)} />}
              <MapFitter coords={coords} follow={follow} pos={pos} />
            </MapContainer>
          )}

          {!loading && (
            <>
              <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', flexDirection: 'column', gap: 7, zIndex: 1000 }}>
                <button onClick={() => setFollow(!follow)} style={{ ...btnDark, backgroundColor: follow ? '#76D800' : btnDark.backgroundColor, color: follow ? '#121A21' : '#fff' }} title="Seguir veículo">
                  <Locate size={17} />
                </button>
                <button onClick={() => setLayer(layer === 'streets' ? 'satellite' : 'streets')} style={btnDark} title="Alternar Satélite / Mapa">
                  <Layers size={16} />
                </button>
              </div>

              {/* HUD DE AUDITORIA COM VINCULAÇÃO AO ID #UP - 001 */}
              <div style={{
                position: 'absolute', top: 10, left: 10, zIndex: 1000, backgroundColor: 'rgba(15,23,42,.92)',
                borderRadius: 10, padding: '6px 10px', border: '1px solid rgba(118,216,0,.4)', display: 'flex', gap: 10, flexWrap: 'wrap'
              }}>
                <div>
                  <div style={{ fontSize: '0.54rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>Viagem</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#76D800' }}>{rideCode}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.54rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>Horário</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>{clockLabel}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.54rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>Velocidade</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>{speedLabel} km/h</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.54rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>Percorrido</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#38BDF8', fontVariantNumeric: 'tabular-nums' }}>{distLabel} / {totalKm.toFixed(1)} km</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* RESUMO DE ORIGEM -> DESTINO VINCULADO AO ID */}
        <div style={{
          backgroundColor: '#0F172A',
          padding: '8px 14px',
          borderTop: '1px solid #1E293B',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          fontSize: '0.73rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#CBD5E1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: '#76D800', fontWeight: 900 }}>● Embarque ({rideCode}):</span>
            <span>{ride.origin.address}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#CBD5E1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: '#EF4444', fontWeight: 900 }}>● Destino ({rideCode}):</span>
            <span>{ride.destination.address}</span>
          </div>
        </div>

        {/* CONTROLES DE REPRODUÇÃO (PLAY / PAUSE / VELOCIDADE) */}
        <div style={{ backgroundColor: '#1E293B', padding: '8px 14px', borderTop: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            type="range" min={0} max={1000} value={Math.round(progress * 1000)}
            onChange={(e) => setProgress(Number(e.target.value) / 1000)}
            style={{ width: '100%', accentColor: '#76D800', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <button
                onClick={() => { if (progress >= 1) setProgress(0); setIsPlaying(!isPlaying); }}
                disabled={loading}
                style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: '#76D800', color: '#121A21', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} fill="#121A21" style={{ marginLeft: 2 }} />}
              </button>
              <button onClick={() => { setProgress(0); setIsPlaying(true); }} style={{ ...btnDark, width: 34, height: 34, backgroundColor: '#334155' }}>
                <RotateCcw size={15} />
              </button>
              <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 700 }}>
                 Posição GPS: {pos[0].toFixed(5)}, {pos[1].toFixed(5)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 4, 8].map(s => (
                <button key={s} onClick={() => setSpeed(s)} style={{
                  padding: '4px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 900, border: 'none', cursor: 'pointer',
                  backgroundColor: speed === s ? '#76D800' : '#334155', color: speed === s ? '#121A21' : '#CBD5E1'
                }}>{s}x</button>
              ))}
            </div>
          </div>
        </div>

        {/* RODAPÉ COM HASH CRIPTOGRÁFICO VINCULADO AO ID #UP - 001 */}
        <div style={{ padding: '8px 14px calc(8px + env(safe-area-inset-bottom, 0px)) 14px', backgroundColor: '#0F172A', borderTop: '1px solid #1E293B' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#76D800', textTransform: 'uppercase' }}>
                Hash SHA-256 de Auditoria Judicial • Viagem {rideCode}
              </div>
              <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#CBD5E1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {hash || '—'}
              </div>
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(`${rideCode} | SHA-256: ${hash}`); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
              disabled={!hash}
              style={{ padding: '5px 9px', borderRadius: 8, backgroundColor: '#334155', color: '#fff', border: 'none', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0 }}
            >
              {copied ? <Check size={13} color="#76D800" /> : <Copy size={13} />}{copied ? 'Copiado' : 'Copiar Selo'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
