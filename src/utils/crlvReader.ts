import { convertPdfToImageDataUrl } from './pdfToImage';
import {
  findVehicleTemplate,
  POPULAR_CAR_COLORS,
  POPULAR_VEHICLES_CATALOG
} from '../services/vehicleService';

export interface ParsedCrlvData {
  brand: string;
  model: string;
  year: string;
  color: string;
  plate: string;
  crlvNumber: string;
  hasLargeTrunk?: boolean;
  hasLeatherSeats?: boolean;
  source: 'pdf-text' | 'ocr';
  matchedFieldsCount: number;
  rawTextPreview: string;
}

const BRAND_ALIAS_MAP: Record<string, string> = {
  CHEV: 'Chevrolet',
  CHEVROLET: 'Chevrolet',
  GM: 'Chevrolet',
  VW: 'Volkswagen',
  VOLKSWAGEN: 'Volkswagen',
  VOLKS: 'Volkswagen',
  TOYOTA: 'Toyota',
  FIAT: 'Fiat',
  HYUNDAI: 'Hyundai',
  HMB: 'Hyundai',
  HONDA: 'Honda',
  RENAULT: 'Renault',
  NISSAN: 'Nissan',
  BYD: 'BYD',
  JEEP: 'Jeep',
  FORD: 'Ford',
  PEUGEOT: 'Peugeot',
  CITROEN: 'Citroen',
  CAOA: 'Caoa Chery',
  CHERY: 'Caoa Chery',
  MITSUBISHI: 'Mitsubishi',
  MMC: 'Mitsubishi',
  KIA: 'Kia',
  BMW: 'BMW',
  AUDI: 'Audi',
  MERCEDES: 'Mercedes-Benz',
  'M.BENZ': 'Mercedes-Benz',
  MBENZ: 'Mercedes-Benz',
  SUZUKI: 'Suzuki',
  VOLVO: 'Volvo',
  GWM: 'GWM'
};

const COLOR_SYNONYMS: Array<{ patterns: string[]; normalized: string }> = [
  { patterns: ['BRANCA', 'BRANCO'], normalized: 'Branco' },
  { patterns: ['PRETA', 'PRETO'], normalized: 'Preto' },
  { patterns: ['PRATA'], normalized: 'Prata' },
  { patterns: ['CINZA', 'GRAFITE', 'CHUMBO'], normalized: 'Cinza' },
  { patterns: ['VERMELHA', 'VERMELHO'], normalized: 'Vermelho' },
  { patterns: ['AZUL'], normalized: 'Azul' },
  { patterns: ['VINHO', 'BORDO', 'BORDÔ'], normalized: 'Vinho' },
  { patterns: ['MARROM', 'BRONZE', 'BEGE', 'DOURADA', 'DOURADO'], normalized: 'Marrom' }
];

function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function normalizeBrandName(rawBrand: string): string {
  const clean = stripAccents(rawBrand || '')
    .toUpperCase()
    .replace(/^(I|IMP)\//, '')
    .replace(/[^A-Z0-9.\s-]/g, '')
    .trim();
  if (!clean) return '';
  if (BRAND_ALIAS_MAP[clean]) return BRAND_ALIAS_MAP[clean];
  for (const [alias, canonical] of Object.entries(BRAND_ALIAS_MAP)) {
    if (clean === alias || clean.startsWith(alias)) return canonical;
  }
  return titleCase(clean);
}

function normalizeColorName(rawColorText: string): string {
  const upper = stripAccents(rawColorText || '').toUpperCase();
  for (const entry of COLOR_SYNONYMS) {
    if (entry.patterns.some(p => new RegExp(`\\b${p}\\b`).test(upper))) {
      return entry.normalized;
    }
  }
  const catalogMatch = POPULAR_CAR_COLORS.find(c =>
    upper.includes(stripAccents(c.name).toUpperCase())
  );
  return catalogMatch ? catalogMatch.name : '';
}

function extractPlate(textUpper: string, lines: string[]): string {
  const plateRegex = /\b([A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2})\b/g;

  // 1. Prioriza linhas que mencionam PLACA ou ficam logo após PLACA
  for (let i = 0; i < lines.length; i++) {
    const lineUpper = stripAccents(lines[i]).toUpperCase();
    if (lineUpper.includes('PLACA')) {
      const windowText = [lines[i], lines[i + 1] || ''].join(' ').toUpperCase();
      const matches = [...windowText.matchAll(plateRegex)];
      for (const m of matches) {
        const candidate = m[1].replace(/[^A-Z0-9]/g, '');
        if (/^[A-Z]{3}[0-9]([A-Z]|[0-9])[0-9]{2}$/.test(candidate)) {
          return candidate;
        }
      }
    }
  }

  // 2. Fallback global no documento inteiro (padrão Mercosul ou placa antiga)
  const allMatches = [...textUpper.matchAll(plateRegex)];
  for (const m of allMatches) {
    const candidate = m[1].replace(/[^A-Z0-9]/g, '');
    if (/^[A-Z]{3}[0-9]([A-Z]|[0-9])[0-9]{2}$/.test(candidate) && candidate !== 'CRV1000') {
      return candidate;
    }
  }
  return '';
}

function extractCrlvNumber(lines: string[], fullText: string): string {
  const priorityLabels = [
    'CODIGO DE SEGURANCA DO CLA',
    'CODIGO DE SEGURANCA',
    'NUMERO DO CRV',
    'NO DO CRV',
    'CRLV',
    'RENAVAM'
  ];

  for (const label of priorityLabels) {
    for (let i = 0; i < lines.length; i++) {
      const norm = stripAccents(lines[i]).toUpperCase();
      if (norm.includes(label)) {
        const windowText = [lines[i], lines[i + 1] || ''].join(' ');
        const numMatch = windowText.match(/\b(\d{9,12})\b/);
        if (numMatch) return numMatch[1];
      }
    }
  }

  // Fallback: sequência de 10-11 dígitos comum de CRV/RENAVAM/CLA
  const fallbackMatch = fullText.match(/\b(\d{10,12})\b/);
  return fallbackMatch ? fallbackMatch[1] : '';
}

function extractYear(lines: string[], fullText: string): string {
  const yearLabels = ['ANO MODELO', 'ANO FABRICACAO', 'EXERCICIO'];
  for (const label of yearLabels) {
    for (let i = 0; i < lines.length; i++) {
      const norm = stripAccents(lines[i]).toUpperCase();
      if (norm.includes(label)) {
        const windowText = [lines[i], lines[i + 1] || ''].join(' ');
        const years = [...windowText.matchAll(/\b(20[0-2]\d|199\d)\b/g)].map(m => Number(m[1]));
        if (years.length > 0) {
          // Em "2023 / 2024" ou "ANO FABRICAÇÃO / ANO MODELO", o maior costuma ser Ano Modelo
          return String(Math.max(...years));
        }
      }
    }
  }

  const slashYears = fullText.match(/\b(20[0-2]\d)\s*[/\\-]\s*(20[0-2]\d)\b/);
  if (slashYears) {
    return String(Math.max(Number(slashYears[1]), Number(slashYears[2])));
  }

  const allYears = [...fullText.matchAll(/\b(20[1-2]\d)\b/g)].map(m => Number(m[1]));
  if (allYears.length > 0) {
    const nonFuture = allYears.filter(y => y <= 2028);
    if (nonFuture.length > 0) return String(Math.max(...nonFuture));
  }
  return '';
}

function extractColor(lines: string[], fullText: string): string {
  for (let i = 0; i < lines.length; i++) {
    const norm = stripAccents(lines[i]).toUpperCase();
    if (norm.includes('COR PREDOMINANTE') || /\bCOR\b/.test(norm)) {
      const windowText = [lines[i], lines[i + 1] || ''].join(' ');
      const found = normalizeColorName(windowText);
      if (found) return found;
    }
  }
  return normalizeColorName(fullText);
}

function extractBrandAndModel(lines: string[], fullText: string): {
  brand: string;
  model: string;
  hasLargeTrunk?: boolean;
  hasLeatherSeats?: boolean;
} {
  // 1. Procura trecho "MARCA / MODELO / VERSÃO" ou linhas com padrão DENATRAN "MARCA/MODELO" (ex: CHEV/ONIX PLUS 1.0)
  const candidateSegments: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const norm = stripAccents(lines[i]).toUpperCase();
    if (norm.includes('MARCA') && (norm.includes('MODELO') || norm.includes('VERSAO'))) {
      if (lines[i + 1]) candidateSegments.push(lines[i + 1]);
      if (lines[i + 2]) candidateSegments.push(lines[i + 2]);
      candidateSegments.push(lines[i]);
    }
    if (/\b(?:I\/|IMP\/)?[A-Z.]{2,12}\/[A-Z0-9]/.test(norm)) {
      candidateSegments.push(lines[i]);
    }
  }

  const orderedCatalog = [...POPULAR_VEHICLES_CATALOG].sort(
    (a, b) => b.model.length - a.model.length
  );

  // Testa catálogo primeiro nos segmentos prioritários, depois no documento todo
  for (const sourceText of [...candidateSegments, fullText]) {
    const cleanSource = stripAccents(sourceText).toUpperCase();

    // Verifica "MARCA/MODELO" direto (ex: CHEV/ONIX PLUS LTZ, TOYOTA/COROLLA XEI)
    const slashMatch = cleanSource.match(/(?:^|\s)(?:I\/|IMP\/)?([A-Z.]{2,12})\/([A-Z0-9][A-Z0-9\s.-]{1,36})/);
    if (slashMatch) {
      const rawBrandToken = slashMatch[1];
      const rawModelRemainder = slashMatch[2]
        .replace(/\b(PR|AT|MT|LT|LTZ|XEI|GLS|FLEX|AUT|MEC|TURBO|1\.0|1\.4|1\.5|1\.6|1\.8|2\.0|10T|16V|8V)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const canonicalBrand = normalizeBrandName(rawBrandToken);

      const matchedCat = orderedCatalog.find(item => {
        const mUpper = stripAccents(item.model).toUpperCase();
        const bUpper = stripAccents(item.brand).toUpperCase();
        const modelFirstWord = mUpper.split(' ')[0];
        const brandMatches =
          !canonicalBrand ||
          bUpper === canonicalBrand.toUpperCase() ||
          bUpper.includes(rawBrandToken);
        return (
          brandMatches &&
          (cleanSource.includes(mUpper) ||
            (modelFirstWord.length >= 3 && rawModelRemainder.includes(modelFirstWord)))
        );
      });

      if (matchedCat) {
        return {
          brand: matchedCat.brand,
          model: matchedCat.model,
          hasLargeTrunk: matchedCat.hasLargeTrunk,
          hasLeatherSeats: matchedCat.hasLeatherSeats
        };
      }

      // Mesmo que não esteja no catálogo padrão, devolve Marca + Modelo limpos do CRLV
      const cleanedModelWords = rawModelRemainder
        .split(' ')
        .filter(w => w.length > 0 && !/^\d+$/.test(w))
        .slice(0, 3)
        .join(' ');
      if (canonicalBrand && cleanedModelWords) {
        return {
          brand: canonicalBrand,
          model: titleCase(cleanedModelWords)
        };
      }
    }

    // Fallback pelo catálogo
    const catalogMatch = orderedCatalog.find(item => {
      const modelUpper = stripAccents(item.model).toUpperCase();
      return cleanSource.includes(modelUpper);
    });
    if (catalogMatch) {
      return {
        brand: catalogMatch.brand,
        model: catalogMatch.model,
        hasLargeTrunk: catalogMatch.hasLargeTrunk,
        hasLeatherSeats: catalogMatch.hasLeatherSeats
      };
    }
  }

  // Fallback para modelos populares abreviados no CRLV ("HB20", "ONIX", "ARGO", "YARIS", "KA", "CITY")
  const normFull = stripAccents(fullText).toUpperCase();
  const shortAliasList: Array<{ needle: string; brand: string; model: string }> = [
    { needle: 'ONIX PLUS', brand: 'Chevrolet', model: 'Onix Plus' },
    { needle: 'ONIX', brand: 'Chevrolet', model: 'Onix Hatch' },
    { needle: 'HB20S', brand: 'Hyundai', model: 'HB20S Sedan' },
    { needle: 'HB20', brand: 'Hyundai', model: 'HB20 Hatch' },
    { needle: 'COROLLA CROSS', brand: 'Toyota', model: 'Corolla Cross' },
    { needle: 'COROLLA', brand: 'Toyota', model: 'Corolla' },
    { needle: 'T-CROSS', brand: 'Volkswagen', model: 'T-Cross' },
    { needle: 'T CROSS', brand: 'Volkswagen', model: 'T-Cross' },
    { needle: 'DOLPHIN MINI', brand: 'BYD', model: 'Dolphin Mini' },
    { needle: 'DOLPHIN', brand: 'BYD', model: 'Dolphin' }
  ];

  for (const alias of shortAliasList) {
    if (normFull.includes(alias.needle)) {
      const tmpl = findVehicleTemplate(alias.brand, alias.model);
      return {
        brand: alias.brand,
        model: alias.model,
        hasLargeTrunk: tmpl?.hasLargeTrunk,
        hasLeatherSeats: tmpl?.hasLeatherSeats
      };
    }
  }

  return { brand: '', model: '' };
}

export function parseCrlvText(
  rawText: string,
  source: 'pdf-text' | 'ocr'
): ParsedCrlvData {
  const normalizedRaw = (rawText || '').replace(/\r/g, '\n');
  const lines = normalizedRaw
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const fullUpper = stripAccents(lines.join(' ')).toUpperCase();

  const plate = extractPlate(fullUpper, lines);
  const crlvNumber = extractCrlvNumber(lines, lines.join(' '));
  const year = extractYear(lines, lines.join(' '));
  const color = extractColor(lines, lines.join(' '));
  const { brand, model, hasLargeTrunk, hasLeatherSeats } = extractBrandAndModel(
    lines,
    lines.join(' ')
  );

  const matchedFieldsCount = [brand, model, year, color, plate, crlvNumber].filter(Boolean).length;

  return {
    brand,
    model,
    year,
    color,
    plate,
    crlvNumber,
    hasLargeTrunk,
    hasLeatherSeats,
    source,
    matchedFieldsCount,
    rawTextPreview: lines.slice(0, 8).join(' | ')
  };
}

async function extractPdfTextFromFile(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version || '4.0.379'}/pdf.worker.min.mjs`;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const maxPages = Math.min(pdf.numPages, 3);
  const allLines: string[] = [];

  for (let p = 1; p <= maxPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Agrupa itens na mesma linha visual (coordenada Y aproximada)
    const rows = new Map<number, Array<{ x: number; str: string }>>();
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      const str = (item.str || '').trim();
      if (!str) continue;
      const x = Array.isArray(item.transform) ? item.transform[4] : 0;
      const y = Array.isArray(item.transform) ? Math.round(item.transform[5] / 4) * 4 : 0;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, str });
    }

    const sortedY = [...rows.keys()].sort((a, b) => b - a);
    for (const y of sortedY) {
      const rowItems = rows.get(y)!.sort((a, b) => a.x - b.x);
      allLines.push(rowItems.map(r => r.str).join(' '));
    }
  }

  return allLines.join('\n');
}

async function runOcrOnImageDataUrl(
  imageDataUrl: string,
  onProgress?: (label: string) => void
): Promise<string> {
  onProgress?.('Iniciando leitura inteligente do CRLV...');
  const Tesseract = await import('tesseract.js');
  const result = await Tesseract.recognize(imageDataUrl, 'por', {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        const pct = Math.round(m.progress * 100);
        onProgress?.(`Lendo dados do documento... ${pct}%`);
      } else if (m.status) {
        onProgress?.('Processando imagem do CRLV...');
      }
    }
  });
  return result?.data?.text || '';
}

/**
 * Lê um arquivo CRLV / CRLV-e (PDF digital, PDF escaneado ou foto)
 * e extrai automaticamente Placa, Marca, Modelo, Ano, Cor e Código do CRLV.
 */
export async function readCrlvDocumentFile(
  file: File,
  imageDataUrlForOcr?: string,
  onProgress?: (label: string) => void
): Promise<ParsedCrlvData> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    onProgress?.('Lendo texto oficial do PDF CRLV-e...');
    try {
      const pdfText = await extractPdfTextFromFile(file);
      if (pdfText.replace(/\s+/g, '').length >= 25) {
        const parsedPdf = parseCrlvText(pdfText, 'pdf-text');
        if (parsedPdf.matchedFieldsCount >= 2) {
          return parsedPdf;
        }
      }
    } catch (err) {
      console.warn('[CRLV Reader] Falha ao extrair texto nativo do PDF, tentando OCR:', err);
    }

    // Fallback: PDF escaneado (sem texto selecionável) -> converte p/ imagem e roda OCR
    onProgress?.('PDF escaneado detectado. Lendo via OCR...');
    const renderedImg = await convertPdfToImageDataUrl(file);
    const ocrText = await runOcrOnImageDataUrl(renderedImg, onProgress);
    return parseCrlvText(ocrText, 'ocr');
  }

  // Foto / Imagem direta (JPG, PNG, WEBP)
  const imgUrl =
    imageDataUrlForOcr ||
    (await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
      reader.readAsDataURL(file);
    }));

  const ocrText = await runOcrOnImageDataUrl(imgUrl, onProgress);
  return parseCrlvText(ocrText, 'ocr');
}
