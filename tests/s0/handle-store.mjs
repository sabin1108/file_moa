async function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('moa-s0-probe', 1);

    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function keepHandle(handle) {
  const db = await openStore();

  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('handles', 'readwrite');

      transaction.objectStore('handles').put(handle, 'test');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function restoreHandle() {
  const db = await openStore();

  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('handles').objectStore('handles').get('test');

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
