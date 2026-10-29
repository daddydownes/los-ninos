(() => {
  'use strict';
  if (window.LosNinosBagState) return;

  const quantityKey = 'los-ninos-preview-bag-v1';
  const revisionKey = 'los-ninos-bag-revision-v1';
  let memory = { quantity: 0, revision: null };
  let storageAvailable = true;
  const validQuantity = value => Number.isInteger(value) && value >= 0 && value <= 10;
  const revision = () => crypto.randomUUID();
  const snapshot = () => ({ ...memory });

  function persist() {
    if (!storageAvailable) return;
    try {
      sessionStorage.setItem(quantityKey, String(memory.quantity));
      sessionStorage.setItem(revisionKey, JSON.stringify(memory));
    } catch (_) { storageAvailable = false; }
  }

  function read() {
    if (storageAvailable) {
      try {
        const raw = sessionStorage.getItem(quantityKey);
        const value = raw === null ? 0 : Number(raw);
        const quantity = validQuantity(value) ? value : 0;
        let saved;
        try { saved = JSON.parse(sessionStorage.getItem(revisionKey) || 'null'); } catch (_) {}
        // Retain the numeric key used by older storefronts, but notice writes
        // made by them so an old checkout cannot clear a more recent bag.
        if (saved?.quantity === quantity && typeof saved.revision === 'string') {
          memory = { quantity, revision: saved.revision };
        } else {
          memory = { quantity, revision: revision() };
          persist();
        }
      } catch (_) { storageAvailable = false; }
    }
    if (!memory.revision) memory.revision = revision();
    return snapshot();
  }

  function setQuantity(quantity) {
    if (!validQuantity(quantity)) throw new RangeError('Bag quantity must be an integer from 0 to 10.');
    const previous = read();
    if (previous.quantity === quantity) return previous;
    memory = { quantity, revision: revision() };
    persist();
    const next = snapshot();
    document.dispatchEvent(new CustomEvent('ln:bag-state', { detail: next }));
    return next;
  }

  function clearIfUnchanged(submitted) {
    const current = read();
    if (!submitted || submitted.quantity !== current.quantity || submitted.revision !== current.revision) return false;
    setQuantity(0);
    return true;
  }

  window.LosNinosBagState = Object.freeze({ read, setQuantity, clearIfUnchanged });
})();
