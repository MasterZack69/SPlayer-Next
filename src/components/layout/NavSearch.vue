<script setup lang="ts">
const SearchCommands = defineAsyncComponent(() => import("./SearchCommands.vue"));
import { PAGE_SEARCH_SCOPES } from "@/utils/search/match";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const keyword = ref("");
const commandIndex = ref(0);
const commandCount = ref(0);
const commandRef = ref<{ run: (index: number) => void }>();
const focused = ref(false);
const root = ref<HTMLFormElement>();
/** Keep the palette open while focus moves to a command. */
const onFocusOut = (): void => {
  setTimeout(() => {
    focused.value = root.value?.contains(document.activeElement) ?? false;
  }, 0);
};
const isCommand = computed(() => keyword.value.startsWith("/"));
/** Restore the underlying route search without changing its results. */
const closeCommands = (): void => {
  const value = scope.value ? route.query.filter : route.name === "search" ? route.query.q : "";
  keyword.value = typeof value === "string" ? value : "";
  commandIndex.value = 0;
};
/** Handle keyboard navigation for the command results. @param event - Search input key event. */
const onKeydown = (event: KeyboardEvent): void => {
  if (!isCommand.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeCommands();
  } else if (!(event.target instanceof HTMLInputElement)) {
    return;
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (commandCount.value)
      commandIndex.value =
        (commandIndex.value + (event.key === "ArrowDown" ? 1 : -1) + commandCount.value) %
        commandCount.value;
  } else if (event.key === "Enter") {
    event.preventDefault();
    commandRef.value?.run(commandIndex.value);
  }
};
const scope = computed(() => PAGE_SEARCH_SCOPES[String(route.name)]);
const placeholder = computed(() =>
  scope.value ? t(`search.scope.${scope.value}`) : t("nav.searchPlaceholder"),
);

watch(
  () => route.fullPath,
  () => {
    const value = scope.value ? route.query.filter : route.name === "search" ? route.query.q : "";
    keyword.value = typeof value === "string" ? value : "";
  },
  { immediate: true },
);

/**
 * Update scoped filters or global results as the user types, with one history entry per search.
 * @param value - Current input text, including an empty value from the clear button.
 */
const updateKeyword = (value: string): void => {
  keyword.value = value;
  commandIndex.value = 0;
  if (value.startsWith("/")) return;
  if (scope.value) {
    void router.replace({ query: { ...route.query, filter: value || undefined } });
  } else if (route.name === "search") {
    void router.replace({ name: "search", query: value.trim() ? { q: value } : {} });
  } else if (value.trim()) {
    void router.push({ name: "search", query: { q: value } });
  }
};

/**
 * Submit global search or apply the current page's filter, including paste-and-search text.
 * @param value - Submitted text; defaults to the current input.
 */
const search = (value = keyword.value): void => {
  if (value.startsWith("/")) {
    commandRef.value?.run(commandIndex.value);
    return;
  }
  keyword.value = value;
  if (scope.value) updateKeyword(value);
  else void router.push({ name: "search", query: value.trim() ? { q: value.trim() } : {} });
};
</script>

<template>
  <form
    ref="root"
    class="app-no-drag relative min-w-0 w-60 lt-compact:w-44 lt-md:flex-1"
    role="search"
    @submit.prevent="search()"
    @focusin="focused = true"
    @focusout="onFocusOut"
    @keydown="onKeydown"
  >
    <NavSearchInput
      :model-value="keyword"
      :placeholder="placeholder"
      @update:model-value="updateKeyword"
      @search="search"
    />
    <SearchCommands
      v-if="isCommand && focused"
      ref="commandRef"
      :query="keyword.slice(1)"
      :selected="commandIndex"
      @run="closeCommands"
      @count="commandCount = $event"
    />
  </form>
</template>
