<script setup lang="ts">
import { useWindowControls } from "@/composables/useWindowControls";
import { useSettingsStore } from "@/stores/settings";

const settings = useSettingsStore();
const route = useRoute();
const { close, quit } = useWindowControls();
let offCloseRequested: (() => void) | undefined;

onMounted(() => {
  offCloseRequested = window.api.window.onCloseRequested(() => {
    if (route.name === "onboarding" || route.name === "agreement-update") quit();
    else void close();
  });
});
onBeforeUnmount(() => offCloseRequested?.());

watchEffect(() => {
  document.documentElement.toggleAttribute("data-reduced-motion", settings.reducedMotion);
  const v = settings.appearance.fontFamily;
  const root = document.documentElement.style;
  if (v) root.setProperty("--user-font", `${v}, var(--app-font)`);
  else root.removeProperty("--user-font");
});
</script>

<template>
  <AppBackground />
  <RouterView />
</template>
