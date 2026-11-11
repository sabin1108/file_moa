import { createSignal } from "./signal";

/** Raw browser persistence and same-tab notification; feature code owns parsing. */

export function createBrowserStringStore(key: string, storage: () => Storage) {
  const changes = createSignal<void>();
  let temporary: string | null | undefined;

  return {
    read() {
      if (temporary !== undefined) return temporary ?? "";

      try {
        return storage().getItem(key) ?? "";
      }
      catch {
        return "";
      }
    },
    write(value: string | null) {
      let saved = true;

      try {
        if (value === null) storage().removeItem(key);
        else storage().setItem(key, value);

        temporary = undefined;
      } catch {
        temporary = value;
        saved = false;
      }

      changes.emit();

      return saved;
    },
    subscribe(listener: () => void) {
      const unsubscribe = changes.subscribe(listener);
      const external = (event: StorageEvent) => {
        if (event.key !== null && event.key !== key) return;

        try {
          if (event.storageArea && event.storageArea !== storage()) return;
        }
        catch {
          return;
        }

        listener();
      };

      window.addEventListener("storage", external);

      return () => {
        unsubscribe();
        window.removeEventListener("storage", external);
      };
    },
  };
}
