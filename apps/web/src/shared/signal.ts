export function createSignal<T>() {
  const subscriptions = new Set<{ listener: (value: T) => void }>();

  return {
    subscribe(listener: (value: T) => void) {
      const subscription = { listener };

      subscriptions.add(subscription);

      return () => {
        subscriptions.delete(subscription);
      };
    },
    emit(value: T) {
      const failures: unknown[] = [];

      for (const subscription of [...subscriptions]) {
        if (!subscriptions.has(subscription)) continue;

        try {
          subscription.listener(value);
        }
        catch (error) {
          failures.push(error);
        }
      }

      // Every security cleanup runs before subscriber errors are reported.

      if (failures.length) queueMicrotask(() => {
        throw new AggregateError(failures, "Signal subscriber failed.");
      });
    },
  };
}
