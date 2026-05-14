const DEFAULT_PREFIX = "cs";

export function createClientId(prefix = DEFAULT_PREFIX): string {
  const value = createRandomValue();
  return `${prefix}-${value}`;
}

function createRandomValue(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("当前浏览器不支持安全随机数，无法创建本地任务 ID");
}
