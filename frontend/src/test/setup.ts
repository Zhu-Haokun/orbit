import "@testing-library/jest-dom/vitest";

/**
 * jsdom 里没有 matchMedia，而主题与响应式都依赖它（规范 §36.1 / §41）。
 */
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

/** jsdom 没有实现 scrollIntoView，下拉类组件会依赖它把高亮项滚进可视区。 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}
