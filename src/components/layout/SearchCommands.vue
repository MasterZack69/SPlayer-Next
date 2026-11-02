<script setup lang="ts">
import { HOTKEY_ACTIONS } from "@shared/defaults/hotkeys";
import { dispatch } from "@/core/hotkey/registry";
import { useSettingsDialog } from "@/settings/useSettingsDialog";
import { SIDEBAR_NAV_META } from "./sidebarNav";
import type { SearchResult } from "@/settings/searchSettings";

const props = defineProps<{ query: string; selected: number }>();
const emit = defineEmits<{ run: []; count: [value: number] }>();
const { t, te } = useI18n();
const router = useRouter();
const list = ref<HTMLElement>();
const settingsDialog = useSettingsDialog();
const searchSettings = shallowRef<typeof import("@/settings/searchSettings").searchSettings>();
onMounted(async () => {
  searchSettings.value = (await import("@/settings/searchSettings")).searchSettings;
});
interface Command {
  id: string;
  label: string;
  group: string;
  run: () => void;
}
const commands = computed<Command[]>(() => {
  const keyword = props.query.trim().toLowerCase();
  if (!keyword) return [];
  const settingItems = (
    searchSettings.value?.(
      keyword,
      (key) => t(key),
      (key) => te(key),
    ) ?? []
  )
    .slice(0, 8)
    .map((result: SearchResult) => ({
      id: `setting-${result.categoryId}-${result.itemKey}`,
      label: result.label,
      group: result.categoryLabel,
      run: () => settingsDialog.show(result.categoryId, result.itemKey, result.parentKeys),
    }));
  const pages = Object.values(SIDEBAR_NAV_META)
    .filter((item) => `${t(item.labelKey)} ${item.key}`.toLowerCase().includes(keyword))
    .map((item) => ({
      id: `page-${item.key}`,
      label: t(item.labelKey),
      group: t("nav.commandPages"),
      run: () => {
        void router.push(item.key);
      },
    }));
  const actions = HOTKEY_ACTIONS.filter(
    (item) =>
      !["view.openSearch", "view.searchInPage"].includes(item.id) &&
      t(item.labelKey).toLowerCase().includes(keyword),
  ).map((item) => ({
    id: `action-${item.id}`,
    label: t(item.labelKey),
    group: t("nav.commandActions"),
    run: () => {
      dispatch(item.id);
    },
  }));
  return [...settingItems, ...pages, ...actions];
});
watch(commands, (items) => emit("count", items.length), { immediate: true });
watch(
  () => props.selected,
  async () => {
    await nextTick();
    list.value
      ?.querySelector<HTMLElement>(`[data-command-index="${props.selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  },
);
/** Execute one command after the search input has been restored. @param index - Result index. */
const run = (index: number): void => {
  const command = commands.value[index];
  if (!command) return;
  emit("run");
  command.run();
};
defineExpose({ run });
</script>

<template>
  <div
    ref="list"
    class="absolute z-50 top-full mt-2 left-0 w-[min(28rem,90vw)] lt-md:fixed lt-md:left-4 lt-md:right-4 lt-md:top-16 lt-md:mt-0 lt-md:w-auto max-h-80 overflow-y-auto rounded-xl bg-surface-panel shadow-lg p-2"
    role="listbox"
    :aria-label="$t('nav.commandTitle')"
  >
    <p v-if="!commands.length" class="px-3 py-2 text-sm text-on-surface-variant">
      {{ query.trim() ? $t("common.noData") : $t("nav.commandHint") }}
    </p>
    <button
      v-for="(command, index) in commands"
      :key="command.id"
      :data-command-index="index"
      type="button"
      role="option"
      :aria-selected="selected === index"
      class="w-full flex justify-between gap-3 border-none rounded-lg bg-transparent px-3 py-2 text-left text-on-surface cursor-pointer focus-visible:outline focus-visible:outline-2"
      :class="selected === index ? 'bg-on-surface/10' : 'hover:bg-on-surface/5'"
      @mousedown.prevent
      @click="run(index)"
    >
      <span>{{ command.label }}</span>
      <span class="text-xs text-on-surface-variant">{{ command.group }}</span>
    </button>
  </div>
</template>
