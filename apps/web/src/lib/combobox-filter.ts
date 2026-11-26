/** An option stays when its label holds what was typed; its value is an id and never matches. */
export const filter = (_value: string, search: string, keywords?: ReadonlyArray<string>) =>
  keywords?.some((label) => label.toLowerCase().includes(search.trim().toLowerCase())) === true ? 1 : 0
