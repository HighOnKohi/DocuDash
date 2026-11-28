import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  fetchBarangays,
  fetchCitiesByProvince,
  fetchCitiesByRegion,
  fetchProvinces,
  fetchRegions,
  type PhLocationOption,
} from '@/services/locationService';

import { SelectField, type SelectOption } from './SelectField';

export interface SelectedBarangayLocation {
  region: PhLocationOption | null;
  province: PhLocationOption | null;
  city: PhLocationOption | null;
  barangay: PhLocationOption | null;
}

export interface PhilippineBarangayPickerProps {
  disabled?: boolean;
  onChange: (selection: SelectedBarangayLocation) => void;
}

function toSelectOptions(items: PhLocationOption[]): SelectOption[] {
  return items.map((item) => ({
    value: item.code,
    label: item.name,
    subtitle: item.subtitle,
  }));
}

/**
 * Reusable cascading Philippine PSGC location selector
 * (Region -> Province -> City / Municipality -> Barangay).
 */
export function PhilippineBarangayPicker({
  disabled = false,
  onChange,
}: PhilippineBarangayPickerProps) {
  const [regions, setRegions] = useState<PhLocationOption[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [regionsError, setRegionsError] = useState<string | null>(null);
  const [regionRetryKey, setRegionRetryKey] = useState(0);
  const [selectedRegion, setSelectedRegion] = useState<PhLocationOption | null>(null);

  const [provinces, setProvinces] = useState<PhLocationOption[]>([]);
  const [provincesLoading, setProvincesLoading] = useState(false);
  const [provincesError, setProvincesError] = useState<string | null>(null);
  const [provinceRetryKey, setProvinceRetryKey] = useState(0);
  const [selectedProvince, setSelectedProvince] = useState<PhLocationOption | null>(null);
  const [hasProvinces, setHasProvinces] = useState(true);

  const [cities, setCities] = useState<PhLocationOption[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);
  const [cityRetryKey, setCityRetryKey] = useState(0);
  const [selectedCity, setSelectedCity] = useState<PhLocationOption | null>(null);

  const [barangays, setBarangays] = useState<PhLocationOption[]>([]);
  const [barangaysLoading, setBarangaysLoading] = useState(false);
  const [barangaysError, setBarangaysError] = useState<string | null>(null);
  const [barangayRetryKey, setBarangayRetryKey] = useState(0);
  const [selectedBarangay, setSelectedBarangay] = useState<PhLocationOption | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchRegions()
      .then((list) => {
        if (!cancelled) {
          setRegions(list);
          setRegionsLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRegionsError(
            error instanceof Error ? error.message : 'Unable to load Philippine regions.'
          );
          setRegionsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [regionRetryKey]);

  useEffect(() => {
    if (!selectedRegion) return;
    let cancelled = false;

    void fetchProvinces(selectedRegion.code)
      .then(async (list) => {
        if (cancelled) return;
        setProvinces(list);
        setProvincesLoading(false);
        if (list.length === 0) {
          setHasProvinces(false);
          setCitiesLoading(true);
          try {
            const regionCities = await fetchCitiesByRegion(selectedRegion.code);
            if (!cancelled) {
              setCities(regionCities);
              setCitiesLoading(false);
            }
          } catch (error) {
            if (!cancelled) {
              setCitiesError(
                error instanceof Error ? error.message : 'Unable to load cities.'
              );
              setCitiesLoading(false);
            }
          }
        } else {
          setHasProvinces(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setProvincesError(
            error instanceof Error ? error.message : 'Unable to load provinces.'
          );
          setProvincesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRegion, provinceRetryKey]);

  useEffect(() => {
    if (!selectedProvince) return;
    let cancelled = false;
    void fetchCitiesByProvince(selectedProvince.code)
      .then((list) => {
        if (!cancelled) {
          setCities(list);
          setCitiesLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCitiesError(
            error instanceof Error ? error.message : 'Unable to load cities/municipalities.'
          );
          setCitiesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProvince, cityRetryKey]);

  useEffect(() => {
    if (!selectedCity) return;
    let cancelled = false;
    void fetchBarangays(selectedCity.code, selectedRegion?.code ?? '')
      .then((list) => {
        if (!cancelled) {
          setBarangays(list);
          setBarangaysLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBarangaysError(
            error instanceof Error ? error.message : 'Unable to load barangays.'
          );
          setBarangaysLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCity, selectedRegion, barangayRetryKey]);

  const handleSelectRegion = useCallback(
    (option: SelectOption) => {
      const found = regions.find((r) => r.code === option.value) ?? null;
      setSelectedRegion(found);
      setProvinces([]);
      setSelectedProvince(null);
      setHasProvinces(true);
      setProvincesLoading(Boolean(found));
      setProvincesError(null);
      setCities([]);
      setSelectedCity(null);
      setCitiesLoading(false);
      setCitiesError(null);
      setBarangays([]);
      setSelectedBarangay(null);
      setBarangaysLoading(false);
      setBarangaysError(null);
      onChange({ region: found, province: null, city: null, barangay: null });
    },
    [onChange, regions]
  );

  const handleSelectProvince = useCallback(
    (option: SelectOption) => {
      const found = provinces.find((p) => p.code === option.value) ?? null;
      setSelectedProvince(found);
      setCities([]);
      setSelectedCity(null);
      setCitiesLoading(Boolean(found));
      setCitiesError(null);
      setBarangays([]);
      setSelectedBarangay(null);
      setBarangaysLoading(false);
      setBarangaysError(null);
      onChange({ region: selectedRegion, province: found, city: null, barangay: null });
    },
    [onChange, provinces, selectedRegion]
  );

  const handleSelectCity = useCallback(
    (option: SelectOption) => {
      const found = cities.find((c) => c.code === option.value) ?? null;
      setSelectedCity(found);
      setBarangays([]);
      setSelectedBarangay(null);
      setBarangaysLoading(Boolean(found));
      setBarangaysError(null);
      onChange({
        region: selectedRegion,
        province: selectedProvince,
        city: found,
        barangay: null,
      });
    },
    [cities, onChange, selectedProvince, selectedRegion]
  );

  const handleSelectBarangay = useCallback(
    (option: SelectOption) => {
      const found = barangays.find((b) => b.code === option.value) ?? null;
      setSelectedBarangay(found);
      onChange({
        region: selectedRegion,
        province: selectedProvince,
        city: selectedCity,
        barangay: found,
      });
    },
    [barangays, onChange, selectedCity, selectedProvince, selectedRegion]
  );

  const regionOptions = useMemo(() => toSelectOptions(regions), [regions]);
  const provinceOptions = useMemo(() => toSelectOptions(provinces), [provinces]);
  const cityOptions = useMemo(() => toSelectOptions(cities), [cities]);
  const barangayOptions = useMemo(() => toSelectOptions(barangays), [barangays]);

  return (
    <View className="gap-3">
      <SelectField
        label="Region"
        placeholder="Select Region (Philippines)"
        value={selectedRegion?.code ?? null}
        displayValue={selectedRegion?.name}
        options={regionOptions}
        onSelect={handleSelectRegion}
        loading={regionsLoading}
        disabled={disabled}
        error={regionsError}
        searchPlaceholder="Search region..."
        onRetry={() => {
          setRegionsLoading(true);
          setRegionsError(null);
          setRegionRetryKey((k) => k + 1);
        }}
      />

      {hasProvinces ? (
        <SelectField
          label="Province"
          placeholder={selectedRegion ? 'Select Province' : 'Select a Region first'}
          value={selectedProvince?.code ?? null}
          displayValue={selectedProvince?.name}
          options={provinceOptions}
          onSelect={handleSelectProvince}
          loading={provincesLoading}
          disabled={disabled || !selectedRegion}
          error={provincesError}
          searchPlaceholder="Search province..."
          onRetry={() => {
            setProvincesLoading(true);
            setProvincesError(null);
            setProvinceRetryKey((k) => k + 1);
          }}
        />
      ) : null}

      <SelectField
        label="City / Municipality"
        placeholder={
          !selectedRegion
            ? 'Select a Region first'
            : hasProvinces && !selectedProvince
              ? 'Select a Province first'
              : 'Select City / Municipality'
        }
        value={selectedCity?.code ?? null}
        displayValue={selectedCity?.name}
        options={cityOptions}
        onSelect={handleSelectCity}
        loading={citiesLoading}
        disabled={disabled || !selectedRegion || (hasProvinces && !selectedProvince)}
        error={citiesError}
        searchPlaceholder="Search city or municipality..."
        onRetry={() => {
          setCitiesLoading(true);
          setCitiesError(null);
          if (!hasProvinces) setProvinceRetryKey((k) => k + 1);
          else setCityRetryKey((k) => k + 1);
        }}
      />

      <SelectField
        label="Barangay"
        placeholder={selectedCity ? 'Select Barangay' : 'Select a City / Municipality first'}
        value={selectedBarangay?.code ?? null}
        displayValue={selectedBarangay?.name}
        options={barangayOptions}
        onSelect={handleSelectBarangay}
        loading={barangaysLoading}
        disabled={disabled || !selectedCity}
        error={barangaysError}
        searchPlaceholder="Search barangay..."
        onRetry={() => {
          setBarangaysLoading(true);
          setBarangaysError(null);
          setBarangayRetryKey((k) => k + 1);
        }}
      />
    </View>
  );
}
