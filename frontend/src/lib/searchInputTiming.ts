export function scheduleSearchCommit(query: string, commit: (query: string) => void) {
  const timer = globalThis.setTimeout(() => commit(query), 300);
  return () => globalThis.clearTimeout(timer);
}
