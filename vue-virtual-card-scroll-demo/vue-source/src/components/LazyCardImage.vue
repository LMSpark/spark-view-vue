<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { buildMockCardImagePreview, mockFetchCardImage } from "../mock/mockFetchCardImage";
import type { CardImageStatus, MockCard } from "../types";

const props = withDefaults(
  defineProps<{
    card: MockCard;
    rootMargin?: string;
  }>(),
  {
    rootMargin: "96px 0px"
  }
);

type CardImageViewState = {
  status: CardImageStatus;
  src: string;
  previewSrc: string;
  errorText: string;
  delay: number | null;
};

const host = ref<HTMLDivElement | null>(null);
const imageState = ref<CardImageViewState>(newIdleState());

let observer: IntersectionObserver | null = null;
let activeController: AbortController | null = null;
let requestToken = 0;
let isVisible = false;

const statusText = computed(() => {
  switch (imageState.value.status) {
    case "loading":
      return "图片请求中";
    case "loaded":
      return imageState.value.delay ? `已加载 ${imageState.value.delay}ms` : "已加载";
    case "downgraded":
      return "离开后降级";
    case "error":
      return imageState.value.errorText || "图片失败";
    default:
      return "等待进入视口";
  }
});

const placeholderText = computed(() => {
  return imageState.value.status === "loading" ? "requesting" : "queued";
});

function newIdleState(): CardImageViewState {
  return {
    status: "idle",
    src: "",
    previewSrc: "",
    errorText: "",
    delay: null
  };
}

function resetImageState(): void {
  imageState.value = newIdleState();
}

function abortCurrentRequest(): void {
  requestToken += 1;
  activeController?.abort();
  activeController = null;
}

function requestImage(): void {
  if (imageState.value.status === "loading" || imageState.value.status === "loaded") return;

  const controller = new AbortController();
  const token = ++requestToken;
  const previewSrc = imageState.value.previewSrc || buildMockCardImagePreview(props.card);
  activeController = controller;
  imageState.value = {
    status: "loading",
    src: previewSrc,
    previewSrc,
    errorText: "",
    delay: null
  };

  mockFetchCardImage({
    card: props.card,
    signal: controller.signal
  })
    .then((result) => {
      if (token !== requestToken || controller.signal.aborted) return;

      imageState.value = {
        status: "loaded",
        src: result.src,
        previewSrc: result.previewSrc,
        errorText: "",
        delay: result.delay
      };
    })
    .catch((error: unknown) => {
      if (token !== requestToken || controller.signal.aborted) return;

      imageState.value = {
        ...imageState.value,
        status: "error",
        errorText: error instanceof Error ? error.message : String(error)
      };
    })
    .finally(() => {
      if (activeController === controller) {
        activeController = null;
      }
    });
}

function downgradeImage(): void {
  abortCurrentRequest();

  const previewSrc = imageState.value.previewSrc;
  if (!previewSrc) {
    resetImageState();
    return;
  }

  imageState.value = {
    ...imageState.value,
    status: "downgraded",
    src: previewSrc,
    errorText: ""
  };
}

function handleIntersection(entries: IntersectionObserverEntry[]): void {
  const nextVisible = entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0);
  if (nextVisible === isVisible) return;

  isVisible = nextVisible;
  if (isVisible) {
    requestImage();
    return;
  }

  downgradeImage();
}

function mountObserver(): void {
  const element = host.value;
  if (!element) return;

  observer?.disconnect();
  if (!("IntersectionObserver" in window)) {
    isVisible = true;
    requestImage();
    return;
  }

  const root = element.closest(".viewport");
  observer = new IntersectionObserver(handleIntersection, {
    root: root instanceof Element ? root : null,
    rootMargin: props.rootMargin,
    threshold: 0.01
  });
  observer.observe(element);
}

onMounted(() => {
  nextTick(mountObserver);
});

watch(
  () => props.card.id,
  () => {
    abortCurrentRequest();
    resetImageState();
    if (isVisible) {
      requestImage();
    }
  }
);

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  abortCurrentRequest();
});
</script>

<template>
  <div ref="host" class="card-image" :class="`status-${imageState.status}`">
    <img
      v-if="imageState.src"
      :src="imageState.src"
      :alt="`${card.title} 缩略图`"
      decoding="async"
      loading="eager"
    />
    <div v-else class="card-image-placeholder">
      <span>{{ placeholderText }}</span>
    </div>
    <span class="card-image-status">{{ statusText }}</span>
  </div>
</template>
