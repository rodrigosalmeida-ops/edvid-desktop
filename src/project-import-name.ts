const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

export function cleanProjectName(value: string): string {
  return value
    .replace(/[<>:"\/\\|?*\u0000-\u001f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 80);
}

export function safeDirectoryPart(value: string): string {
  const cleaned = cleanProjectName(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-zA-Z0-9._ -]/gu, '')
    .replace(/[ .]+$/gu, '')
    .trim();

  if (!cleaned || WINDOWS_RESERVED_NAMES.test(cleaned)) return 'video';
  return cleaned;
}
