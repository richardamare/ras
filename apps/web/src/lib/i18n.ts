import i18n from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import HttpApi from "i18next-http-backend"
import * as I18nextHttpBackend from "i18next-http-backend"
import * as ReactI18next from "react-i18next"

import * as Environment from "@/lib/environment"

/**
 * The languages the app ships locale files for. A new entry needs `public/locales/<code>/` to
 * exist with every namespace in it - i18next falls back per key, so a half-translated language
 * renders as a silent mix of two rather than as an error.
 */
export const LANGUAGES = [
  { code: "en", labelKey: "english", countryCode: "GB" },
  { code: "cs", labelKey: "czech", countryCode: "CZ" }
] as const

export const LANGUAGE_KEY = "lang"

i18n
  .use(HttpApi)
  .use(LanguageDetector)
  .use(ReactI18next.initReactI18next)
  .init<I18nextHttpBackend.HttpBackendOptions>({
    fallbackLng: "cs",
    returnNull: false,
    returnEmptyString: true,
    load: "languageOnly",
    debug: Environment.isLocal(),
    interpolation: {
      // React escapes everything it renders, so i18next must not escape as well. Left on, a
      // value carrying a slash, an apostrophe or an ampersand reaches the screen as its HTML
      // entity: an IANA zone renders as `Europe&#x2F;Berlin`, and a name as `O&#39;Brien`.
      escapeValue: false
    },
    detection: {
      order: ["querystring", "localStorage", "cookie"],

      lookupQuerystring: LANGUAGE_KEY,
      lookupCookie: LANGUAGE_KEY,
      lookupLocalStorage: LANGUAGE_KEY,
      lookupSessionStorage: LANGUAGE_KEY,

      caches: ["localStorage", "cookie"],

      cookieOptions: {
        path: "/",
        sameSite: "strict",
        // No httpOnly: this cookie is written by client-side JS, which by definition cannot
        // set an HttpOnly cookie — the browser would silently ignore the flag.
        secure: !Environment.isLocal()
      },

      convertDetectedLanguage: (lng) => lng.slice(0, 2)
    },
    backend: {
      // The locale files keep their names across releases, so the commit in the URL keeps a browser from
      // pairing a new bundle with the translations it cached from an older release.
      loadPath: "/locales/{{lng}}/{{ns}}.json",
      queryStringParams: { v: __APP_COMMIT__ },
      crossDomain: false,
      withCredentials: false
    }
  })
