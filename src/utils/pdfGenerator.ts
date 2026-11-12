import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export interface GeneratePdfOptions {
  filename: string;
  title?: string;
  quality?: number; // 1 a 2
}

/**
 * Converte um elemento do DOM em um arquivo PDF real e dispara o download
 * ou compartilhamento nativo no celular (compatível com PWA Android & iOS).
 */
export async function downloadElementAsPdf(
  element: HTMLElement,
  options: GeneratePdfOptions
): Promise<{ success: boolean; method: 'share' | 'download' | 'fallback'; error?: string }> {
  try {
    const filename = options.filename.endsWith('.pdf') ? options.filename : `${options.filename}.pdf`;
    
    // Captura o elemento em alta resolução usando html2canvas
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#FFFFFF',
      windowWidth: element.scrollWidth || 800,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
    const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    // Primeira página
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= pageHeight;

    // Páginas adicionais se o conteúdo for longo (como relatórios financeiros com várias despesas)
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageHeight;
    }

    const pdfBlob = pdf.output('blob');
    const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

    // 1. No Mobile PWA: Tenta a Web Share API nativa com arquivos (iOS 15+ / Android Chrome)
    // Isso permite ao usuário salvar diretamente na pasta 'Arquivos' / 'Downloads' ou mandar no WhatsApp
    if (
      typeof navigator !== 'undefined' &&
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [pdfFile] })
    ) {
      try {
        await navigator.share({
          title: options.title || filename,
          files: [pdfFile],
        });
        return { success: true, method: 'share' };
      } catch (shareErr: any) {
        // Se o usuário cancelou o menu de compartilhamento, não consideramos erro fatal
        if (shareErr.name === 'AbortError') {
          return { success: true, method: 'share' };
        }
        // Se falhou o share, cai no download tradicional via link
      }
    }

    // 2. Download via Blob URL (Padrão Web / Desktop / Android PWA)
    const blobUrl = URL.createObjectURL(pdfBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = filename;
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();

    setTimeout(() => {
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(blobUrl);
    }, 15000);

    return { success: true, method: 'download' };
  } catch (err: any) {
    console.error('Erro ao gerar PDF:', err);
    return { success: false, method: 'fallback', error: err?.message || 'Falha na geração do PDF' };
  }
}

/**
 * Converte um elemento em imagem PNG de alta definição para compartilhamento rápido ou download
 */
export async function downloadElementAsImage(
  element: HTMLElement,
  filename: string
): Promise<{ success: boolean; method: string }> {
  try {
    const cleanFilename = filename.endsWith('.png') ? filename : `${filename}.png`;
    const canvas = await html2canvas(element, {
      scale: 2.5,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#FFFFFF',
    });

    return new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          resolve({ success: false, method: 'failed' });
          return;
        }

        const file = new File([blob], cleanFilename, { type: 'image/png' });

        if (
          typeof navigator !== 'undefined' &&
          navigator.share &&
          navigator.canShare &&
          navigator.canShare({ files: [file] })
        ) {
          try {
            await navigator.share({
              title: cleanFilename,
              files: [file],
            });
            resolve({ success: true, method: 'share' });
            return;
          } catch {
            // fallback para download
          }
        }

        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = cleanFilename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        }, 15000);

        resolve({ success: true, method: 'download' });
      }, 'image/png');
    });
  } catch (err) {
    console.error('Erro ao gerar imagem:', err);
    return { success: false, method: 'failed' };
  }
}

