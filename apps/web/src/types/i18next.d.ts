/**
 * Types every `t()` key against the English locale files, so a key that does not exist in the
 * namespace is a compile error instead of a raw key on screen. English is the fallback language and
 * the reference; `cs` is kept in step by the `check-locales` skill.
 */
import "i18next"

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation"
    resources: {
      "@App": typeof import("../../public/locales/en/@App.json")
      "@Auth": typeof import("../../public/locales/en/@Auth.json")
      "@CoreError": typeof import("../../public/locales/en/@CoreError.json")
      "@ModuleError": typeof import("../../public/locales/en/@ModuleError.json")
      "@Navbar": typeof import("../../public/locales/en/@Navbar.json")
      "@Sidebar": typeof import("../../public/locales/en/@Sidebar.json")
      Home: typeof import("../../public/locales/en/Home.json")
      Work: typeof import("../../public/locales/en/Work.json")
      translation: typeof import("../../public/locales/en/translation.json")
    }
  }
}
