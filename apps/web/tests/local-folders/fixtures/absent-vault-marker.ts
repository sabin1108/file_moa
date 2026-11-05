import { vi } from "vitest";

/** 기존 최소 FS adapter에 예약 표식의 metadata 조회를 추가한다. 본문 mock/호출 순서는 유지한다. */
export function withAbsentVaultMarker<T extends object>(directory: T): T {
  const wrap = (value: unknown) => new Proxy(typeof value === "function" ? value : vi.fn(async () => {
    throw new DOMException("missing", "NotFoundError");
  }), {
    apply(target, receiver, args: unknown[]) {
      if (args[0] === ".moa-vault.json") return Promise.reject(new DOMException("missing", "NotFoundError"));
      return Reflect.apply(target, receiver, args);
    },
  });
  let lookup = wrap(Reflect.get(directory, "getFileHandle"));
  Object.defineProperty(directory, "getFileHandle", {
    configurable: true, enumerable: true,
    get: () => lookup,
    set: (value: unknown) => { lookup = wrap(value); },
  });
  return directory;
}
