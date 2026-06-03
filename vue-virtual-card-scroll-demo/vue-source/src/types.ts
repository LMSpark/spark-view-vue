export interface MockCard {
  id: number;
  title: string;
  note: string;
  tag: string;
  score: string;
}

export type CardImageStatus = "idle" | "loading" | "loaded" | "downgraded" | "error";

export interface MockCardImageRequest {
  card: MockCard;
  signal?: AbortSignal;
}

export interface MockCardImageResult {
  cardId: number;
  delay: number;
  src: string;
  previewSrc: string;
}

export interface MockPageResult {
  page: number;
  pageSize: number;
  delay: number;
  cards: MockCard[];
}

export interface WheelPageEvent {
  deltaY: number;
  timeStamp: number;
}

export interface VirtualCardViewportExpose {
  setScrollTop(value: number): void;
  viewportHeight(): number;
  viewportScrollTop(): number;
}
