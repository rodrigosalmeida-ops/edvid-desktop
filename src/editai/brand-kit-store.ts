import {
  EDIT_AI_ACTIVE_BRAND_KEY,
  EDIT_AI_BRAND_STORAGE_KEY,
  EDIT_AI_DEFAULT_BRAND,
  sanitizeBrandKit,
  type EditAiBrandKit,
} from './brand-kit';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const projectBrandKey = (directory: string) => `editai:project-brand:v1:${directory}`;

export function readBrandKits(storage: StorageLike): EditAiBrandKit[] {
  try {
    const parsed = JSON.parse(storage.getItem(EDIT_AI_BRAND_STORAGE_KEY) ?? '[]');
    const values = Array.isArray(parsed) ? parsed.map((item) => sanitizeBrandKit(item)) : [];
    const byId = new Map(values.map((item) => [item.id, item]));
    if (!byId.has(EDIT_AI_DEFAULT_BRAND.id)) byId.set(EDIT_AI_DEFAULT_BRAND.id, EDIT_AI_DEFAULT_BRAND);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  } catch {
    return [EDIT_AI_DEFAULT_BRAND];
  }
}

export function writeBrandKits(storage: StorageLike, brands: readonly EditAiBrandKit[]): EditAiBrandKit[] {
  const byId = new Map<string, EditAiBrandKit>();
  for (const value of brands) {
    const brand = sanitizeBrandKit(value);
    byId.set(brand.id, brand);
  }
  if (!byId.has(EDIT_AI_DEFAULT_BRAND.id)) byId.set(EDIT_AI_DEFAULT_BRAND.id, EDIT_AI_DEFAULT_BRAND);
  const clean = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  storage.setItem(EDIT_AI_BRAND_STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

export function upsertBrandKit(storage: StorageLike, brands: readonly EditAiBrandKit[], value: EditAiBrandKit): EditAiBrandKit[] {
  const brand = sanitizeBrandKit({ ...value, updatedAt: Date.now() });
  return writeBrandKits(storage, [...brands.filter((item) => item.id !== brand.id), brand]);
}

export function removeBrandKit(storage: StorageLike, brands: readonly EditAiBrandKit[], id: string): EditAiBrandKit[] {
  if (id === EDIT_AI_DEFAULT_BRAND.id) return writeBrandKits(storage, brands);
  return writeBrandKits(storage, brands.filter((item) => item.id !== id));
}

export function readActiveBrandId(storage: StorageLike, brands: readonly EditAiBrandKit[]): string {
  const stored = storage.getItem(EDIT_AI_ACTIVE_BRAND_KEY) ?? '';
  return brands.some((brand) => brand.id === stored) ? stored : EDIT_AI_DEFAULT_BRAND.id;
}

export function writeActiveBrandId(storage: StorageLike, brands: readonly EditAiBrandKit[], id: string): string {
  const active = brands.some((brand) => brand.id === id) ? id : EDIT_AI_DEFAULT_BRAND.id;
  storage.setItem(EDIT_AI_ACTIVE_BRAND_KEY, active);
  return active;
}

export function activeBrandKit(brands: readonly EditAiBrandKit[], id: string): EditAiBrandKit {
  return brands.find((brand) => brand.id === id) ?? brands[0] ?? EDIT_AI_DEFAULT_BRAND;
}


export function readProjectBrandId(
  storage: StorageLike,
  directory: string | null | undefined,
  brands: readonly EditAiBrandKit[],
): string {
  if (!directory) return readActiveBrandId(storage, brands);
  const stored = storage.getItem(projectBrandKey(directory)) ?? '';
  return brands.some((brand) => brand.id === stored) ? stored : readActiveBrandId(storage, brands);
}

export function writeProjectBrandId(
  storage: StorageLike,
  directory: string | null | undefined,
  brands: readonly EditAiBrandKit[],
  id: string,
): string {
  const active = writeActiveBrandId(storage, brands, id);
  if (directory) storage.setItem(projectBrandKey(directory), active);
  return active;
}
