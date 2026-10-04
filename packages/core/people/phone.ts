import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import { countryOf } from "../regions/iso3166";

// Phone numbers are stored in E.164 ("+14155550123"), with an extension in RFC 3966 form when
// there is one ("+14155550123;ext=12"). A number typed without a country code is read as being
// in the person's home country. Server-only in practice: the metadata is large, so the browser
// gets numbers already formatted (DirectoryPerson.phone).

export type PhoneParse = { ok: true; value: string | null } | { ok: false; message: string };

export function normalizePhone(raw: string | null | undefined, homeRegion: string): PhoneParse {
  if (raw === null || raw === undefined || raw.trim() === "") return { ok: true, value: null };
  const number = parsePhoneNumberFromString(raw.trim(), countryOf(homeRegion) as CountryCode);
  if (!number?.isValid()) {
    return {
      ok: false,
      message: "Phone isn't a valid number. Include the country code (+44 …) if it's not in the home region's country",
    };
  }
  return { ok: true, value: number.ext ? `${number.number};ext=${number.ext}` : number.number };
}

export interface PhoneDisplay {
  // For a tel: link, null when the stored value can't be parsed (from before validation).
  uri: string | null;
  label: string;
}

// "+1 415 555 0123 ext. 12". A value stored before numbers were validated is shown as it is.
export function displayPhone(stored: string): PhoneDisplay {
  const number = parsePhoneNumberFromString(stored);
  return number?.isValid()
    ? { uri: number.getURI(), label: number.formatInternational() }
    : { uri: null, label: stored };
}
