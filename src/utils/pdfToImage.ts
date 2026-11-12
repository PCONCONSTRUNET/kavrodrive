/**
 * Utilitário de conversão de CNH em PDF para imagem Canvas (JPEG/PNG)
 * Permite que a IA facial (Human) execute no navegador e o usuário visualize
 * o documento mesmo quando enviado em formato PDF.
 */

let workerConfigured = false;

async function getPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  if (!workerConfigured) {
    try {
      // Configurar worker seguro via CDN unpkg / cdnjs
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version || '4.0.379'}/pdf.worker.min.mjs`;
      workerConfigured = true;
    } catch (e) {
      console.warn('[PDF to Image] Não foi possível configurar workerSrc externo:', e);
    }
  }
  return pdfjs;
}

/**
 * Converte a primeira página de um arquivo PDF para Data URL de Imagem (JPEG em alta resolução)
 */
export async function convertPdfToImageDataUrl(fileOrBuffer: File | Blob | ArrayBuffer | string): Promise<string> {
  let arrayBuffer: ArrayBuffer;

  if (typeof fileOrBuffer === 'string') {
    if (fileOrBuffer.startsWith('data:application/pdf') || fileOrBuffer.startsWith('data:')) {
      const base64Part = fileOrBuffer.split(',')[1] || fileOrBuffer;
      const binaryString = atob(base64Part);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      arrayBuffer = bytes.buffer;
    } else {
      throw new Error('Formato de string PDF inválido.');
    }
  } else if (fileOrBuffer instanceof ArrayBuffer) {
    arrayBuffer = fileOrBuffer;
  } else {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
  }

  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;

  // Carregar a primeira página (onde fica a CNH)
  const page = await pdf.getPage(1);
  const scale = 2.0; // Resolução nítida para a IA identificar o rosto
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Contexto 2D do Canvas indisponível.');
  }

  // Fundo branco caso o PDF seja transparente
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: context,
    viewport: viewport,
  }).promise;

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  return dataUrl;
}

/**
 * Verifica se um arquivo ou Data URL é PDF
 */
export function isPdfDocument(fileOrDataUrl: File | Blob | string): boolean {
  if (typeof fileOrDataUrl === 'string') {
    return fileOrDataUrl.startsWith('data:application/pdf') || fileOrDataUrl.toLowerCase().includes('.pdf');
  }
  if (fileOrDataUrl instanceof File || fileOrDataUrl instanceof Blob) {
    return fileOrDataUrl.type === 'application/pdf' || (fileOrDataUrl instanceof File && fileOrDataUrl.name.toLowerCase().endsWith('.pdf'));
  }
  return false;
}

