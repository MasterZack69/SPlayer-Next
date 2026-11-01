<script setup lang="ts">
import { settingsSchema } from "@/settings/schema";
import type { SettingItem } from "@/types/settings-schema";

const emit = defineEmits<{
  select: [categoryId: string, itemKey: string, parentKeys: string[]];
  "active-change": [active: boolean];
}>();

const { t, te } = useI18n();
const query = ref("");
const isFocused = ref(false);
const searchRef = ref<HTMLElement>();

const isSearchActive = computed(() => isFocused.value && query.value.trim().length > 0);

watch(isSearchActive, (v) => emit("active-change", v));

interface SearchResult {
  categoryId: string;
  itemKey: string;
  parentKeys: string[];
  label: string;
  description: string;
  categoryLabel: string;
}

const results = computed<SearchResult[]>(() => {
  const q = query.value.trim().toLowerCase();
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
});

/**
 * Select a result with its ancestor path and clear the search.
 * @param r - Search result to locate.
 */
const handleSelect = (r: SearchResult) => {
  emit("select", r.categoryId, r.itemKey, r.parentKeys);
  query.value = "";
};

/** Keep results open while keyboard focus moves between the input and results. */
const handleBlur = () => {
  setTimeout(() => {
    isFocused.value = searchRef.value?.contains(document.activeElement) ?? false;
  }, 150);
};
</script>

<template>
  <div ref="searchRef" class="relative" @focusin="isFocused = true" @focusout="handleBlur">
    <SInput v-model="query" :placeholder="t('settings.search')" clearable @focus="isFocused = true">
      <template #prefix>
        <IconLucideSearch class="size-3.5 text-on-surface-variant/50" />
      </template>
    </SInput>

    <!-- 搜索结果 -->
    <Transition
      enter-active-class="transition-[opacity,transform] duration-200 ease-out"
      leave-active-class="transition-[opacity,transform] duration-150 ease-in"
      enter-from-class="opacity-0 -translate-y-1"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="isSearchActive"
        class="motion-enter absolute left-0 right-0 top-full mt-2 max-h-[calc(75vh-220px)] overflow-y-auto rounded-lg border border-solid border-outline-variant/80 z-10 p-1"
      >
        <template v-if="results.length > 0">
          <button
            v-for="r in results"
            :key="`${r.categoryId}-${r.itemKey}`"
            type="button"
            class="w-full text-left flex flex-col px-3 py-2 rounded-lg border-none bg-transparent focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer transition-[background-color] duration-200 hover:bg-on-surface/8"
            @mousedown.prevent
            @click="handleSelect(r)"
          >
            <span class="text-xs text-on-surface-variant/40">{{ r.categoryLabel }}</span>
            <span class="text-sm font-medium">{{ r.label }}</span>
            <span v-if="r.description" class="text-xs text-on-surface-variant/50 truncate">
              {{ r.description }}
            </span>
          </button>
        </template>
        <div v-else class="px-3 py-4 text-sm text-on-surface-variant/50 text-center">
          {{ t("common.noData") }}
        </div>
      </div>
    </Transition>
  </div>
</template>
