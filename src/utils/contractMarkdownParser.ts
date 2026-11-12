export interface ParsedTermsSection {
  heading: string;
  blocks: Array<
    | { type: 'paragraph'; text: string }
    | { type: 'bullets'; items: string[] }
  >;
}

export interface TermsAcceptancePayload {
  accepted: boolean;
  contractId: string;
  contractVersion: string;
  acceptedAtClient: string;
  affirmativeText: string;
  language: string;
  timezone: string;
}

export function buildTermsAcceptancePayload(
  contractId: string,
  contractVersion: string,
  affirmativeText: string
): TermsAcceptancePayload {
  return {
    accepted: true,
    contractId,
    contractVersion,
    acceptedAtClient: new Date().toISOString(),
    affirmativeText,
    language: typeof navigator !== 'undefined' ? navigator.language : 'pt-BR',
    timezone:
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : 'America/Sao_Paulo'
  };
}

export function parseContractSections(rawText: string): ParsedTermsSection[] {
  const parts = String(rawText || '').split(/^###\s+/m).slice(1);
  return parts.map((chunk) => {
    const lines = chunk.split('\n');
    const heading = (lines[0] || '').trim();
    const rest = lines.slice(1).join('\n').trim();
    const paragraphs = rest.split(/\n\s*\n/).filter(Boolean);
    const blocks: ParsedTermsSection['blocks'] = paragraphs.map((p) => {
      const pLines = p
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const bulletLines = pLines.filter((l) => l.startsWith('- '));
      if (bulletLines.length === pLines.length && bulletLines.length > 0) {
        return { type: 'bullets', items: bulletLines.map((l) => l.slice(2).trim()) };
      }
      if (bulletLines.length > 0) {
        return {
          type: 'bullets',
          items: pLines.map((l) => (l.startsWith('- ') ? l.slice(2).trim() : l))
        };
      }
      return { type: 'paragraph', text: pLines.join(' ') };
    });
    return { heading, blocks };
  });
}

