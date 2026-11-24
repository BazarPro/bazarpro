import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '.';
import { api } from '../lib/api/functions';
import { useQuery } from '../lib/api/react';
import type { EventService } from '../lib/api/types';

/**
 * Name of an event service in the current language; the stored value stays German. The
 * English name comes from the admins' list, else from the translations of the defaults.
 */
export function serviceLabel(service: string, services?: readonly EventService[]): string {
  if (i18n.resolvedLanguage === 'en') {
    const nameEn = services?.find((other) => other.name === service)?.nameEn;
    if (nameEn) return nameEn;
  }
  const key = `service.${service}`;
  return i18n.exists(key, { ns: 'records' })
    ? (i18n.t(key as never, { ns: 'records' }) as string)
    : service;
}

/** The services organizers pick from (#256), in the admins' order. */
export function useServices(): readonly EventService[] | undefined {
  return useQuery(api.services.list, {});
}

/** `serviceLabel` with the English names of the admins' list. */
export function useServiceLabel(): (service: string) => string {
  const services = useServices();
  const { i18n: current } = useTranslation();
  return useCallback(
    (service: string) => serviceLabel(service, services),
    // The language picks the name
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [services, current.resolvedLanguage]
  );
}
