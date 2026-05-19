export interface MockCard {
  id: number;
  title: string;
  note: string;
  tag: string;
  score: string;
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
