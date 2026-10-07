import { create } from "zustand";

import { readThemePreference, writeThemePreference, type ThemePreference } from "@/lib/preferences";

/**
 * 规范 §75 推荐前端状态边界 —— Zustand 只存：
 * 当前 galaxy filter / drawer state / UI preferences / search overlay / temporary draft。
 * 业务数据一律走 TanStack Query。
 */
interface UiState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;

  /** Tablet 折叠侧栏的临时浮层（规范 §9.2）。 */
  sidebarExpanded: boolean;
  setSidebarExpanded: (expanded: boolean) => void;

  /** 星图当前星系筛选，null = 全部（规范 §16）。 */
  galaxyGroupId: string | null;
  setGalaxyGroupId: (groupId: string | null) => void;

  /** 星图浮动搜索（规范 §15）。 */
  galaxyQuery: string;
  setGalaxyQuery: (query: string) => void;

  /** 星图 Drawer（规范 §18）。 */
  selectedPersonId: string | null;
  openPerson: (personId: string) => void;
  closePerson: () => void;

  hoveredPersonId: string | null;
  setHoveredPersonId: (personId: string | null) => void;

  /** 全局搜索浮层（规范 §60: Cmd/Ctrl + K）。 */
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;

  createPersonOpen: boolean;
  /** 打开新建人物弹窗时预填的姓名（例如在人物选择器里输入了没匹配到的名字）。 */
  createPersonSeed: string;
  openCreatePerson: (seed?: string) => void;
  setCreatePersonOpen: (open: boolean) => void;

  /** 规范 §56 星图图例。 */
  galaxyHelpOpen: boolean;
  setGalaxyHelpOpen: (open: boolean) => void;

  /**
   * 规范 §54.2：新建人物保存后要自动聚焦那颗新星。
   * 这里只存一个一次性意图，星图消费掉就清空，避免下次进星图又跳一次。
   */
  focusPersonId: string | null;
  requestFocusPerson: (personId: string) => void;
  clearFocusPerson: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  theme: readThemePreference(),
  setTheme: (theme) => {
    writeThemePreference(theme);
    set({ theme });
  },

  sidebarExpanded: false,
  setSidebarExpanded: (sidebarExpanded) => set({ sidebarExpanded }),

  galaxyGroupId: null,
  setGalaxyGroupId: (galaxyGroupId) => set({ galaxyGroupId }),

  galaxyQuery: "",
  setGalaxyQuery: (galaxyQuery) => set({ galaxyQuery }),

  selectedPersonId: null,
  openPerson: (selectedPersonId) => set({ selectedPersonId }),
  closePerson: () => set({ selectedPersonId: null, hoveredPersonId: null }),

  hoveredPersonId: null,
  setHoveredPersonId: (hoveredPersonId) => set({ hoveredPersonId }),

  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),

  createPersonOpen: false,
  createPersonSeed: "",
  openCreatePerson: (seed = "") => set({ createPersonOpen: true, createPersonSeed: seed }),
  setCreatePersonOpen: (createPersonOpen) =>
    set(createPersonOpen ? { createPersonOpen } : { createPersonOpen, createPersonSeed: "" }),

  galaxyHelpOpen: false,
  setGalaxyHelpOpen: (galaxyHelpOpen) => set({ galaxyHelpOpen }),

  focusPersonId: null,
  requestFocusPerson: (focusPersonId) => set({ focusPersonId }),
  clearFocusPerson: () => set({ focusPersonId: null }),
}));
