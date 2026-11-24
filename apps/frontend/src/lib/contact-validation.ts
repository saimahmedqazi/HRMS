import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

const names = new Intl.DisplayNames(['en'], { type: 'region' });
export const countries = getCountries().map((code) => ({ code, name: names.of(code) || code, dial: getCountryCallingCode(code) })).sort((a, b) => a.name.localeCompare(b.name));
export function countryCode(value?: string | null): CountryCode | undefined {
  const text = value?.trim().toLowerCase();
  if (!text) return undefined;
  if (['usa', 'united states of america'].includes(text)) return 'US';
  return countries.find((country) => country.code.toLowerCase() === text || country.name.toLowerCase() === text)?.code;
}
export function validPhone(value: string, country?: string | null): boolean {
  const phone = parsePhoneNumberFromString(value.trim(), { defaultCountry: countryCode(country), extract: false });
  return Boolean(phone && !phone.ext && phone.isValid());
}
export function hasLetter(value: string): boolean { return /\p{L}/u.test(value); }
