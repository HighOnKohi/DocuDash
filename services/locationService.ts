const PSGC_BASE_URL = 'https://psgc.cloud/api/v2';
const REQUEST_TIMEOUT_MS = 10_000;

export interface PhLocationOption {
  code: string;
  name: string;
  subtitle?: string;
}

export interface PhilippineAddressParts {
  streetAddress: string;
  region: string;
  province?: string;
  city: string;
  barangay: string;
}

interface PsgcListItem {
  code?: unknown;
  name?: unknown;
  city_municipality?: unknown;
}

interface PsgcListResponse {
  data?: unknown;
}

let regionsCache: PhLocationOption[] | null = null;
const provincesCache = new Map<string, PhLocationOption[]>();
const citiesByProvinceCache = new Map<string, PhLocationOption[]>();
const citiesByRegionCache = new Map<string, PhLocationOption[]>();
const barangaysByCityCache = new Map<string, PhLocationOption[]>();
const barangaysByRegionCache = new Map<string, PsgcListItem[]>();

function compareNames(a: PhLocationOption, b: PhLocationOption): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

async function fetchPsgcItems(path: string): Promise<PsgcListItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${PSGC_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Location service returned status ${response.status}.`);
    }

    const json = (await response.json()) as PsgcListResponse;
    return Array.isArray(json.data) ? (json.data as PsgcListItem[]) : [];
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Location lookup timed out. Check your connection or enter your address manually.');
    }
    throw new Error('Unable to load Philippine locations. Check your connection or enter your address manually.');
  } finally {
    clearTimeout(timer);
  }
}

function toOptions(items: PsgcListItem[], includeCitySubtitle = false): PhLocationOption[] {
  const options: PhLocationOption[] = [];
  for (const item of items) {
    if (typeof item.code !== 'string' || typeof item.name !== 'string') {
      continue;
    }
    const code = item.code.trim();
    const name = item.name.trim();
    if (!code || !name) {
      continue;
    }
    const subtitle =
      includeCitySubtitle &&
      typeof item.city_municipality === 'string' &&
      item.city_municipality.trim().length > 0
        ? item.city_municipality.trim()
        : undefined;
    options.push(subtitle ? { code, name, subtitle } : { code, name });
  }
  return options;
}

/** Fetches all Philippine regions (cached in memory). */
export async function fetchRegions(): Promise<PhLocationOption[]> {
  if (regionsCache) {
    return regionsCache;
  }

  const items = await fetchPsgcItems('/regions');
  const options = toOptions(items);
  regionsCache = options;
  return options;
}

/** Fetches provinces for a Philippine region (returns `[]` for NCR). */
export async function fetchProvinces(regionCode: string): Promise<PhLocationOption[]> {
  const cached = provincesCache.get(regionCode);
  if (cached) {
    return cached;
  }

  const items = await fetchPsgcItems(`/regions/${encodeURIComponent(regionCode)}/provinces`);
  const options = toOptions(items).sort(compareNames);
  provincesCache.set(regionCode, options);
  return options;
}

/** Fetches cities and municipalities inside a Philippine province. */
export async function fetchCitiesByProvince(provinceCode: string): Promise<PhLocationOption[]> {
  const cached = citiesByProvinceCache.get(provinceCode);
  if (cached) {
    return cached;
  }

  const items = await fetchPsgcItems(
    `/provinces/${encodeURIComponent(provinceCode)}/cities-municipalities`
  );
  const options = toOptions(items).sort(compareNames);
  citiesByProvinceCache.set(provinceCode, options);
  return options;
}

/** Fetches cities and municipalities directly under a region (e.g. NCR). */
export async function fetchCitiesByRegion(regionCode: string): Promise<PhLocationOption[]> {
  const cached = citiesByRegionCache.get(regionCode);
  if (cached) {
    return cached;
  }

  const items = await fetchPsgcItems(
    `/regions/${encodeURIComponent(regionCode)}/cities-municipalities`
  );
  const options = toOptions(items).sort(compareNames);
  citiesByRegionCache.set(regionCode, options);
  return options;
}

/**
 * Fetches barangays for a Philippine city or municipality.
 * Falls back to region-level barangays filtered by the 5-digit city prefix
 * when a city groups barangays under sub-municipalities (e.g. City of Manila).
 */
export async function fetchBarangays(
  cityCode: string,
  regionCode: string
): Promise<PhLocationOption[]> {
  const cached = barangaysByCityCache.get(cityCode);
  if (cached) {
    return cached;
  }

  const directItems = await fetchPsgcItems(
    `/cities-municipalities/${encodeURIComponent(cityCode)}/barangays`
  );
  let options = toOptions(directItems);

  if (options.length === 0 && regionCode) {
    let regionItems = barangaysByRegionCache.get(regionCode);
    if (!regionItems) {
      regionItems = await fetchPsgcItems(`/regions/${encodeURIComponent(regionCode)}/barangays`);
      barangaysByRegionCache.set(regionCode, regionItems);
    }

    const prefix = cityCode.slice(0, 5);
    const matching = regionItems.filter(
      (item) => typeof item.code === 'string' && item.code.startsWith(prefix)
    );
    options = toOptions(matching, true);
  }

  options.sort(compareNames);
  barangaysByCityCache.set(cityCode, options);
  return options;
}

/** Formats structured Philippine address selections + street input into a single address string. */
export function composePhilippineAddress(parts: PhilippineAddressParts): string {
  const rawBarangay = parts.barangay.trim();
  const barangayLabel = rawBarangay
    ? /^(brgy\.?|barangay)\b/i.test(rawBarangay)
      ? rawBarangay
      : `Brgy. ${rawBarangay}`
    : '';

  const segments = [
    parts.streetAddress.trim(),
    barangayLabel,
    parts.city.trim(),
    parts.province?.trim() ?? '',
    parts.region.trim(),
  ].filter((segment) => segment.length > 0);

  const combined = segments.join(', ');
  return combined.length > 300 ? combined.slice(0, 300).trim() : combined;
}
