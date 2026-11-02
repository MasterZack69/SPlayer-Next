import { settingsSchema } from "@/settings/schema";
import type { SettingItem } from "@/types/settings-schema";

export interface SearchResult {
  categoryId: string;
  itemKey: string;
  parentKeys: string[];
  label: string;
  description: string;
  categoryLabel: string;
}

/**
 * Search visible settings and section headings.
 * @param query - Search text.
 * @param t - Translate a key.
 * @param te - Check whether a translation exists.
 * @returns Matching settings with their ancestor paths.
 */
export const searchSettings = (
  query: string,
  t: (key: string) => string,
  te: (key: string) => boolean,
): SearchResult[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SearchResult[] = [];
  for (const cat of settingsSchema) {
    /**
     * Search translated labels, descriptions, and keywords at every nesting level.
     * @param items - Settings at the current nesting level.
     * @param parentKeys - Ancestor keys ordered from outermost to innermost.
     */
    const searchItems = (items: SettingItem[], parentKeys: string[]): void => {
      for (const item of items) {
        if (item.visible && !item.visible()) continue;
        if (item.searchable !== false) {
          const labelKey = `settings.${item.key}.label`;
          const descriptionKey = item.descriptionKey ?? `settings.${item.key}.description`;
          const label = te(labelKey) ? t(labelKey) : "";
          const desc = !item.hideDescription && te(descriptionKey) ? t(descriptionKey) : "";
          const kw =
            item.keywords
              ?.filter((key) => te(key))
              .map((key) => t(key))
              .join(" ") ?? "";
          if (label && `${label} ${desc} ${kw}`.toLowerCase().includes(q)) {
            out.push({
              categoryId: cat.id,
              itemKey: item.key,
              parentKeys,
              label,
              description: desc,
              categoryLabel: t(`settings.group.${cat.id}`),
            });
          }
        }
        if (item.children) {
          searchItems(item.children, [...parentKeys, item.key]);
        }
      }
    };
    for (const sec of cat.sections ?? []) {
      if (sec.visible && !sec.visible()) continue;
      if (!sec.items.some((item) => !item.visible || item.visible())) continue;
      const sectionKey = `settings.section.${sec.id}`;
      const label = te(sectionKey) ? t(sectionKey) : "";
      if (label && label.toLowerCase().includes(q)) {
        out.push({
          categoryId: cat.id,
          itemKey: `section-${sec.id}`,
          parentKeys: [],
          label,
          description: "",
          categoryLabel: t(`settings.group.${cat.id}`),
        });
      }
      searchItems(sec.items, []);
    }
  }
  return out;
};
