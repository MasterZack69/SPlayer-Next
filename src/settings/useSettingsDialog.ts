import { useStatusStore } from "@/stores/status";

const open = ref(false);
const initialCategory = ref("general");
const initialHighlight = ref<string>();
const initialParentKeys = ref<string[]>([]);

/**
 * 设置弹窗控制
 * 全局单例，任何组件都可调用 show() 打开设置
 */
export const useSettingsDialog = () => ({
  open,
  initialCategory,
  initialHighlight,
  initialParentKeys,

  /**
   * Open settings at an optional category and result.
   * @param category - Target category.
   * @param highlight - Setting to highlight.
   * @param parents - Ancestor keys for collapsed settings.
   */
  show: (category?: string, highlight?: string, parents: string[] = []) => {
    initialCategory.value = category ?? (useStatusStore().settingsCategory || "general");
    initialHighlight.value = highlight;
    initialParentKeys.value = parents;
    open.value = true;
  },

  /** 关闭设置弹窗 */
  hide: () => {
    open.value = false;
  },

  /** 记忆用户手动选择的大分类 */
  rememberCategory: (category: string) => {
    useStatusStore().settingsCategory = category;
  },
});
