import type { MockCard, MockPageResult } from "../types";

const numberFormat = new Intl.NumberFormat("zh-CN");
const tags = ["审核", "草稿", "已同步", "待确认", "归档", "变更"];

function makeAbortError(): Error {
  try {
    return new DOMException("Mock request aborted", "AbortError");
  } catch {
    const error = new Error("Mock request aborted");
    error.name = "AbortError";
    return error;
  }
}

function buildMockCards(page: number, pageSize: number): MockCard[] {
  return Array.from({ length: pageSize }, (_, index) => {
    const id = (page - 1) * pageSize + index + 1;
    return {
      id,
      title: `第 ${numberFormat.format(page)} 页卡片 ${index + 1}`,
      note: `mockFetchCards 异步返回的数据；真实项目里这里会接 DataSet / DataView 的 page=${page} 查询结果。`,
      tag: tags[(id + page) % tags.length],
      score: `${((id * 17) % 91) + 9}%`
    };
  });
}

export function mockFetchCards(params: {
  page: number;
  pageSize: number;
  signal?: AbortSignal;
}): Promise<MockPageResult> {
  const { page, pageSize, signal } = params;
  const delay = 260 + Math.floor(Math.random() * 260);

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }

    const timer = window.setTimeout(() => {
      if (signal?.aborted) {
        reject(makeAbortError());
        return;
      }

      resolve({
        page,
        pageSize,
        delay,
        cards: buildMockCards(page, pageSize)
      });
    }, delay);

    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(makeAbortError());
      },
      { once: true }
    );
  });
}
