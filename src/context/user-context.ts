import { AsyncLocalStorage } from "node:async_hooks";

const userStore = new AsyncLocalStorage<{ userId: number }>();

export function getUserId(): number {
  const store = userStore.getStore();
  if (!store) {
    throw new Error("getUserId() called outside of auth context");
  }
  return store.userId;
}

export function runWithUser<T>(userId: number, fn: () => T): T {
  return userStore.run({ userId }, fn);
}
