/**
 * Минимальные заглушки браузерных API для Node-тестов js/.
 *
 * Нужны только потому, что некоторые модули js/ обращаются к localStorage/DOM
 * при импорте (settings, dimension helper, canvas-текстуры). Решатель и
 * сущности эскиза этих API не используют.
 */
export function installBrowserStubs() {
    const ctx2d = new Proxy({}, {
        get: (_t, prop) => {
            if (prop === 'measureText') return () => ({ width: 10 });
            if (prop === 'canvas') return { width: 300, height: 150 };
            return () => {};
        },
        set: () => true
    });
    const makeElement = () => ({
        style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild() {}, removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
        setAttribute() {}, getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [],
        getContext: () => ctx2d, width: 0, height: 0,
        getBoundingClientRect: () => ({ width: 10, height: 10, left: 0, top: 0, right: 10, bottom: 10 })
    });

    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    globalThis.window = {
        matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
        innerWidth: 1600, innerHeight: 900,
        addEventListener() {}, removeEventListener() {},
        getComputedStyle: () => ({}),
        devicePixelRatio: 1
    };
    globalThis.document = {
        createElement: makeElement,
        createElementNS: makeElement,
        body: makeElement(),
        documentElement: makeElement(),
        addEventListener() {}, removeEventListener() {},
        querySelector: () => null, querySelectorAll: () => [],
        getElementById: () => null
    };
    globalThis.getComputedStyle = () => ({});
}
