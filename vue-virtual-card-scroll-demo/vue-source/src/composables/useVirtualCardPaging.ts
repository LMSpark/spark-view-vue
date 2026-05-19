import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import { mockFetchCards } from "../mock/mockFetchCards";
import type { MockCard, VirtualCardViewportExpose, WheelPageEvent } from "../types";

const numberFormat = new Intl.NumberFormat("zh-CN");

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toPositiveInteger(value: unknown, fallback = 1): number {
  const next = Number.parseInt(String(value), 10);
  return Number.isFinite(next) ? next : fallback;
}

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function useVirtualCardPaging(viewportRef: Ref<VirtualCardViewportExpose | null>) {
  const totalPages = ref(1000);
  const draftTotalPages = ref(1000);
  const pageSize = ref(6);
  const pageHeight = ref(540);
  const scrollTop = ref(0);
  const viewportHeight = ref(0);
  const rangePage = ref(1);
  const jumpPage = ref(800);
  const isDragging = ref(false);
  const lastLoadTarget = ref(1);
  const maxCachedPages = ref(24);
  const programmaticScroll = ref(false);
  const requestEpoch = ref(0);
  const cache = ref<Record<number, MockCard[]>>({});
  const pending = ref<Record<number, boolean>>({});
  const notice = ref("");
  const lastRequestText = ref("");
  const lastWheelJumpPages = ref(0);
  const lastWheelSpeed = ref(0);

  const controllers = markRaw(new Map<number, AbortController>());
  let dragTimer = 0;
  let loadTimer = 0;
  let resizeTimer = 0;
  let wheelTimer = 0;
  let wheelDelta = 0;
  let wheelStartAt = 0;
  let wheelLastAt = 0;

  const totalCards = computed(() => totalPages.value * pageSize.value);
  const virtualHeight = computed(() => totalPages.value * pageHeight.value);
  const scrollSpacerHeight = computed(() => {
    return virtualHeight.value + Math.max(0, viewportHeight.value - pageHeight.value);
  });

  const currentPage = computed(() => pageFromScroll(scrollTop.value));
  const firstCardNumber = computed(() => (currentPage.value - 1) * pageSize.value + 1);
  const lastCardNumber = computed(() => {
    return Math.min(firstCardNumber.value + pageSize.value - 1, totalCards.value);
  });
  const progressText = computed(() => {
    const maxScroll = Math.max(1, scrollSpacerHeight.value - viewportHeight.value);
    const ratio = clamp((scrollTop.value / maxScroll) * 100, 0, 100);
    return `${ratio.toFixed(2)}%`;
  });
  const visiblePages = computed(() => {
    const first = pageFromScroll(Math.max(0, scrollTop.value - pageHeight.value));
    const last = pageFromScroll(scrollTop.value + viewportHeight.value + pageHeight.value);
    const pages: number[] = [];

    for (let page = first; page <= last; page += 1) {
      pages.push(page);
    }

    return pages;
  });
  const cachedPages = computed(() => Object.keys(cache.value).map(Number).sort((a, b) => a - b));
  const pendingPages = computed(() => Object.keys(pending.value).map(Number).sort((a, b) => a - b));
  const loadPolicyText = computed(() => {
    return isDragging.value ? "停稳吸附页开头" : `加载第 ${formatNumber(lastLoadTarget.value)} 页附近`;
  });
  const wheelStatusText = computed(() => {
    if (!lastWheelJumpPages.value) return "滚轮按速度跳页";
    return `滚轮跳 ${formatNumber(lastWheelJumpPages.value)} 页`;
  });

  function computePageHeight(): number {
    return window.innerWidth <= 700 ? 850 : 540;
  }

  function updatePageHeight(): void {
    pageHeight.value = computePageHeight();
  }

  function refreshViewportHeight(height?: number): void {
    viewportHeight.value = height || viewportRef.value?.viewportHeight() || 0;
  }

  function pageFromScroll(value: number): number {
    const lastPageTop = Math.max(0, (totalPages.value - 1) * pageHeight.value);
    if (value >= lastPageTop - 1) return totalPages.value;
    return clamp(Math.floor(value / pageHeight.value) + 1, 1, totalPages.value);
  }

  function markDragging(): void {
    isDragging.value = true;
    window.clearTimeout(dragTimer);
    window.clearTimeout(loadTimer);
  }

  function releaseDragging(): void {
    scheduleSettledLoad(120);
  }

  function handleViewportScroll(nextScrollTop: number): void {
    scrollTop.value = nextScrollTop;
    rangePage.value = currentPage.value;
    jumpPage.value = currentPage.value;

    if (programmaticScroll.value) {
      programmaticScroll.value = false;
      return;
    }

    markDragging();
    scheduleSettledLoad(220);
  }

  function handleRangeInput(page: number): void {
    rangePage.value = page;
    markDragging();
    scrollToPage(rangePage.value, true);
  }

  function nudgePage(delta: number): void {
    scrollToPage(clamp(currentPage.value + delta, 1, totalPages.value), false);
  }

  function handleWheelPage(event: WheelPageEvent): void {
    const now = performance.now();
    const directionChanged = Math.sign(wheelDelta) !== Math.sign(event.deltaY);
    if (!wheelStartAt || now - wheelLastAt > 140 || directionChanged) {
      wheelDelta = 0;
      wheelStartAt = now;
    }

    wheelDelta += event.deltaY;
    wheelLastAt = now;
    window.clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(flushWheelJump, 70);
  }

  function flushWheelJump(): void {
    if (!wheelDelta) return;

    const direction = wheelDelta > 0 ? 1 : -1;
    const duration = Math.max(80, wheelLastAt - wheelStartAt);
    const distance = Math.abs(wheelDelta);
    const speed = distance / duration;
    const distancePages = Math.max(1, Math.ceil(distance / 180));
    const speedMultiplier = speed >= 12 ? 4 : speed >= 6 ? 3 : speed >= 2.5 ? 2 : 1;
    const pageStep = clamp(distancePages * speedMultiplier, 1, 40);
    const targetPage = clamp(currentPage.value + direction * pageStep, 1, totalPages.value);
    const jumpedPages = Math.abs(targetPage - currentPage.value);

    wheelDelta = 0;
    wheelStartAt = 0;
    wheelLastAt = 0;
    lastWheelSpeed.value = speed;
    lastWheelJumpPages.value = jumpedPages;

    if (targetPage !== currentPage.value) {
      scrollToPage(targetPage, false);
    }
  }

  function handleResize(): void {
    const page = currentPage.value;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      updatePageHeight();
      nextTick(() => {
        refreshViewportHeight();
        scrollToPage(page, false);
      });
    }, 80);
  }

  function scrollToPage(page: number, keepDragging = false): void {
    const targetPage = clamp(toPositiveInteger(page, 1), 1, totalPages.value);
    const targetTop = Math.min(
      (targetPage - 1) * pageHeight.value,
      scrollSpacerHeight.value - viewportHeight.value
    );
    const nextScrollTop = Math.max(0, targetTop);
    const currentViewportTop = viewportRef.value?.viewportScrollTop() || 0;
    const willScroll = Math.round(currentViewportTop) !== Math.round(nextScrollTop);

    rangePage.value = targetPage;
    jumpPage.value = targetPage;
    scrollTop.value = nextScrollTop;
    programmaticScroll.value = !keepDragging && willScroll;
    viewportRef.value?.setScrollTop(nextScrollTop);

    if (keepDragging) {
      markDragging();
      scheduleSettledLoad(220);
      return;
    }

    isDragging.value = false;
    loadPageWindow(targetPage, 1);
  }

  function applyTotalPages(): void {
    const nextTotal = clamp(toPositiveInteger(draftTotalPages.value, 1), 1, 100000);
    abortAllRequests();
    totalPages.value = nextTotal;
    draftTotalPages.value = nextTotal;
    requestEpoch.value += 1;
    cache.value = {};
    pending.value = {};
    notice.value = "";
    lastRequestText.value = "";
    nextTick(() => {
      scrollToPage(clamp(currentPage.value, 1, totalPages.value), false);
    });
  }

  function clearCache(): void {
    abortAllRequests();
    requestEpoch.value += 1;
    cache.value = {};
    pending.value = {};
    notice.value = "";
    lastRequestText.value = "";
    loadPageWindow(currentPage.value, 1);
  }

  function scheduleSettledLoad(delay: number): void {
    window.clearTimeout(dragTimer);
    window.clearTimeout(loadTimer);
    dragTimer = window.setTimeout(() => {
      isDragging.value = false;
    }, delay);
    loadTimer = window.setTimeout(() => {
      const targetPage = currentPage.value;
      isDragging.value = false;
      scrollToPage(targetPage, false);
    }, delay + 40);
  }

  function loadPageWindow(centerPage: number, radius = 1): void {
    const targetPage = clamp(centerPage, 1, totalPages.value);
    const pages = new Set<number>();
    lastLoadTarget.value = targetPage;

    for (let page = targetPage - radius; page <= targetPage + radius; page += 1) {
      if (page >= 1 && page <= totalPages.value) {
        pages.add(page);
      }
    }

    abortRequestsOutside(pages);
    for (const page of pages) {
      requestPage(page);
    }
    trimCache(targetPage);
  }

  function requestPage(page: number): void {
    if (page < 1 || page > totalPages.value) return;
    if (cache.value[page] || pending.value[page]) return;

    const epoch = requestEpoch.value;
    const controller = new AbortController();
    controllers.set(page, controller);
    pending.value = { ...pending.value, [page]: true };

    mockFetchCards({
      page,
      pageSize: pageSize.value,
      signal: controller.signal
    })
      .then((result) => {
        if (epoch !== requestEpoch.value || controller.signal.aborted) return;
        cache.value = { ...cache.value, [page]: result.cards };
        lastRequestText.value = `page=${page}, ${result.delay}ms`;
        trimCache(currentPage.value);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        notice.value = `mockFetchCards(page=${page}) 失败: ${error instanceof Error ? error.message : String(error)}`;
      })
      .finally(() => {
        if (controllers.get(page) === controller) {
          controllers.delete(page);
        }
        if (pending.value[page]) {
          const nextPending = { ...pending.value };
          delete nextPending[page];
          pending.value = nextPending;
        }
      });
  }

  function abortRequestsOutside(keepPages: Set<number>): void {
    let changed = false;
    const nextPending = { ...pending.value };

    for (const [page, controller] of controllers.entries()) {
      if (!keepPages.has(page)) {
        controller.abort();
        controllers.delete(page);
        delete nextPending[page];
        changed = true;
      }
    }

    if (changed) {
      pending.value = nextPending;
    }
  }

  function abortAllRequests(): void {
    for (const controller of controllers.values()) {
      controller.abort();
    }
    controllers.clear();
    pending.value = {};
  }

  function trimCache(anchorPage: number): void {
    const pages = Object.keys(cache.value).map(Number);
    if (pages.length <= maxCachedPages.value) return;

    const keep = pages
      .sort((a, b) => Math.abs(a - anchorPage) - Math.abs(b - anchorPage))
      .slice(0, maxCachedPages.value);
    const keepSet = new Set(keep);
    const nextCache: Record<number, MockCard[]> = {};

    for (const page of pages) {
      if (keepSet.has(page)) {
        nextCache[page] = cache.value[page];
      }
    }

    cache.value = nextCache;
  }

  onMounted(() => {
    updatePageHeight();
    nextTick(() => {
      refreshViewportHeight();
      loadPageWindow(currentPage.value, 1);
    });
    window.addEventListener("resize", handleResize);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", handleResize);
    window.clearTimeout(dragTimer);
    window.clearTimeout(loadTimer);
    window.clearTimeout(resizeTimer);
    window.clearTimeout(wheelTimer);
    abortAllRequests();
  });

  return {
    totalPages,
    draftTotalPages,
    pageSize,
    pageHeight,
    rangePage,
    jumpPage,
    isDragging,
    cache,
    pending,
    notice,
    lastRequestText,
    totalCards,
    scrollSpacerHeight,
    currentPage,
    firstCardNumber,
    lastCardNumber,
    progressText,
    visiblePages,
    cachedPages,
    pendingPages,
    loadPolicyText,
    wheelStatusText,
    refreshViewportHeight,
    markDragging,
    releaseDragging,
    handleViewportScroll,
    handleRangeInput,
    nudgePage,
    handleWheelPage,
    scrollToPage,
    applyTotalPages,
    clearCache
  };
}
