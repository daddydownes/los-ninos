(() => {
  'use strict';

  const source = document.currentScript?.src || location.href;
  const thumbnail = new URL('../../../assets/hat-front-logo-v1.webp', source).href;
  const storageKey = 'los-ninos-preview-bag-v1';
  const limit = 10;
  // Leave the completed button feedback readable before opening the drawer.
  const confirmationDuration = 1000;
  const closeDuration = 240;
  // Draw decorative arrows instead of using a glyph that iOS can render as emoji.
  const arrowIcon = '<svg class="journey-bag-arrow" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 19 19 5M5 5h14v14"/></svg>';

  function install() {
    if (window.LosNinosBag) return;

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let quantity = 0;
    let phase = 'closed';
    let opener = null;
    let position = null;
    let scrollStyles = null;
    let overlayId = null;
    let overlayURL = null;
    let awaitingBack = false;
    let closeTimer = null;
    let pendingAdd = null;
    let pendingNavigate = null;
    let queuedOpen = null;
    let expectedCloseEvents = 0;
    let backdropPointer = null;

    function loadQuantity() {
      try {
        // The previous demo stored a plain number under this same tab-local key.
        const saved = Number(sessionStorage.getItem(storageKey));
        if (Number.isInteger(saved)) quantity = Math.max(0, Math.min(limit, saved));
      } catch (_) { /* The current document still works when storage is blocked. */ }
    }

    function saveQuantity() {
      try { sessionStorage.setItem(storageKey, String(quantity)); } catch (_) {}
    }

    loadQuantity();

    const dialog = document.createElement('dialog');
    dialog.id = 'journey-bag';
    dialog.className = 'journey-bag';
    dialog.setAttribute('aria-labelledby', 'journey-bag-title');
    dialog.innerHTML = `
      <div class="journey-bag-heading">
        <div><p class="bag-eyebrow">LOS NIÑOS CON SUEÑOS</p><h2 id="journey-bag-title">Your bag.</h2></div>
        <button type="button" class="journey-bag-close" aria-label="Close bag" autofocus><span aria-hidden="true">×</span></button>
      </div>
      <div class="journey-bag-content">
        <div class="journey-bag-empty">
          <p>Your bag<br>is empty.</p>
          <span class="bag-empty-note">Start with the navy snapback.</span>
          <button type="button" class="journey-bag-shop">Explore the snapback ${arrowIcon}</button>
        </div>
        <div class="journey-bag-item" hidden>
          <img src="${thumbnail}" width="1254" height="1254" decoding="async" alt="Front concept render of the navy Los Niños snapback">
          <div class="journey-bag-details">
            <h3>Navy snapback</h3>
            <div class="journey-bag-controls">
              <div class="journey-bag-quantity" role="group" aria-label="Hat quantity">
                <button type="button" class="journey-bag-minus" aria-label="Decrease quantity">−</button>
                <output class="journey-bag-number" aria-label="Quantity">1</output>
                <button type="button" class="journey-bag-plus" aria-label="Increase quantity">+</button>
              </div>
              <button type="button" class="journey-bag-remove">Remove</button>
            </div>
          </div>
        </div>
        <p class="journey-bag-limit" hidden>Maximum quantity: 10.</p>
        <p class="journey-bag-status" role="status" aria-live="polite" aria-atomic="true"></p>
      </div>
      <div class="journey-bag-footer"><button type="button" class="journey-bag-continue">Continue exploring ${arrowIcon}</button></div>`;
    document.body.append(dialog);

    // This live region is available during the brief confirmation before the dialog opens.
    const pageStatus = document.createElement('p');
    pageStatus.className = 'journey-bag-page-status';
    pageStatus.setAttribute('role', 'status');
    pageStatus.setAttribute('aria-live', 'polite');
    pageStatus.setAttribute('aria-atomic', 'true');
    document.body.append(pageStatus);

    const empty = dialog.querySelector('.journey-bag-empty');
    const item = dialog.querySelector('.journey-bag-item');
    const minus = dialog.querySelector('.journey-bag-minus');
    const plus = dialog.querySelector('.journey-bag-plus');
    const count = dialog.querySelector('.journey-bag-number');
    const limitNote = dialog.querySelector('.journey-bag-limit');
    const status = dialog.querySelector('.journey-bag-status');
    const closeButton = dialog.querySelector('.journey-bag-close');
    const shopButton = dialog.querySelector('.journey-bag-shop');

    function isBagState(state) {
      const marker = state?.lnBag;
      return Boolean(marker && typeof marker === 'object' && marker.version === 1 &&
        marker.open === true && typeof marker.id === 'string' && marker.id.length > 0);
    }

    function cleanMalformedMarker() {
      if (!history.state || !Object.hasOwn(history.state, 'lnBag') || isBagState(history.state)) return;
      const nextState = baseState();
      delete nextState.lnBag;
      try { history.replaceState(nextState, '', location.href); } catch (_) {}
    }

    function readPosition(state) {
      const marker = state?.lnBag;
      return {
        x: Number.isFinite(marker?.x) ? Math.max(0, marker.x) : window.scrollX,
        y: Number.isFinite(marker?.y) ? Math.max(0, marker.y) : window.scrollY
      };
    }

    function baseState() {
      return history.state && typeof history.state === 'object' && !Array.isArray(history.state)
        ? { ...history.state } : {};
    }

    function ownsCurrentEntry() {
      if (!isBagState(history.state)) return false;
      return overlayId !== null && history.state.lnBag.id === overlayId;
    }

    function fallbackOpener() {
      return document.querySelector('[data-bag-open]');
    }

    function focusTarget(target) {
      const candidate = target instanceof HTMLElement && target.isConnected &&
        !target.matches(':disabled') && target.getClientRects().length ? target : fallbackOpener();
      candidate?.focus({ preventScroll: true });
    }

    function announce(message) {
      (dialog.open ? status : pageStatus).textContent = message;
    }

    function render() {
      empty.hidden = quantity > 0;
      item.hidden = quantity === 0;
      count.value = String(quantity);
      count.textContent = String(quantity);
      minus.disabled = quantity <= 1;
      plus.disabled = quantity >= limit;
      limitNote.hidden = quantity < limit;
      document.querySelectorAll('[data-bag-count]').forEach(slot => { slot.textContent = String(quantity); });
      document.querySelectorAll('[data-bag-open]').forEach(trigger => {
        trigger.setAttribute('aria-label', `Open bag, ${quantity} ${quantity === 1 ? 'item' : 'items'}`);
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-controls', dialog.id);
      });
      document.querySelectorAll('[data-add-to-bag]').forEach(trigger => {
        const label = trigger.querySelector('[data-add-label]') || trigger;
        label.textContent = pendingAdd?.trigger === trigger ? 'Added to bag' : quantity >= limit ? 'View bag' : 'Add to bag';
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-controls', dialog.id);
      });
    }

    function lockPage(savedPosition) {
      const root = document.documentElement;
      const body = document.body;
      const gutter = Math.max(0, window.innerWidth - root.clientWidth);
      const rootProperties = ['overflow', 'scrollbarGutter', 'scrollBehavior'];
      const bodyProperties = ['position', 'top', 'left', 'right', 'width', 'overflow', 'paddingRight'];
      scrollStyles = {
        root: Object.fromEntries(rootProperties.map(name => [name, root.style[name]])),
        body: Object.fromEntries(bodyProperties.map(name => [name, body.style[name]]))
      };
      // Reserving the gutter also prevents fixed header controls from shifting.
      if (gutter && CSS.supports('scrollbar-gutter: stable')) root.style.scrollbarGutter = 'stable';
      else if (gutter) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + gutter}px`;
      root.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = `${-savedPosition.y}px`;
      body.style.left = `${-savedPosition.x}px`;
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      root.setAttribute('data-journey-bag-open', '');
    }

    function unlockPage() {
      if (!scrollStyles) return;
      const root = document.documentElement;
      const savedStyles = scrollStyles;
      scrollStyles = null;
      Object.assign(document.body.style, savedStyles.body);
      Object.assign(root.style, savedStyles.root);
      root.removeAttribute('data-journey-bag-open');
      // Override any page-level smooth scrolling for the exact return position.
      root.style.scrollBehavior = 'auto';
      window.scrollTo(position?.x || 0, position?.y || 0);
      root.style.scrollBehavior = savedStyles.root.scrollBehavior;
    }

    function cancelPendingAdd() {
      if (!pendingAdd) return;
      clearTimeout(pendingAdd.timer);
      pendingAdd.trigger.removeAttribute('aria-disabled');
      pendingAdd.trigger.removeAttribute('data-bag-pending');
      pendingAdd = null;
      render();
    }

    function displayBag(trigger, fromHistory = false) {
      if (phase === 'open') return;
      cancelPendingAdd();
      opener = trigger instanceof HTMLElement && !dialog.contains(trigger) ? trigger : fallbackOpener();
      position = fromHistory ? readPosition(history.state) : { x: window.scrollX, y: window.scrollY };
      overlayURL = fromHistory && typeof history.state?.lnBag?.href === 'string'
        ? history.state.lnBag.href : location.href;
      if (!fromHistory && !isBagState(history.state)) {
        overlayId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
        const nextState = baseState();
        nextState.lnBag = { version: 1, open: true, id: overlayId, href: overlayURL, ...position };
        try { history.pushState(nextState, '', location.href); } catch (_) { overlayId = null; }
      } else overlayId = history.state?.lnBag?.id || null;
      status.textContent = '';
      render();
      lockPage(position);
      dialog.classList.remove('journey-bag-closing');
      dialog.showModal();
      phase = 'open';
      closeButton.focus({ preventScroll: true });
    }

    function open(trigger) {
      cancelPendingAdd();
      if (phase === 'closing' || awaitingBack) {
        pendingNavigate = null;
        queuedOpen = { trigger };
        return;
      }
      if (phase === 'open') return;
      displayBag(trigger, isBagState(history.state));
    }

    function finishClose({ restoreFocus = true } = {}) {
      clearTimeout(closeTimer);
      closeTimer = null;
      phase = 'closed';
      awaitingBack = false;
      backdropPointer = null;
      dialog.classList.remove('journey-bag-closing');
      if (dialog.open) {
        expectedCloseEvents += 1;
        dialog.close();
      }
      unlockPage();
      overlayId = null;
      overlayURL = null;
      const navigate = pendingNavigate;
      const reopen = queuedOpen;
      pendingNavigate = null;
      queuedOpen = null;
      if (navigate) navigate();
      else if (reopen) open(reopen.trigger);
      else if (restoreFocus) focusTarget(opener);
    }

    function beginVisualClose() {
      if (closeTimer !== null) return;
      phase = 'closing';
      if (!dialog.open || reducedMotion.matches || document.hidden) { finishClose(); return; }
      dialog.classList.add('journey-bag-closing');
      closeTimer = setTimeout(finishClose, closeDuration);
    }

    function close(options = {}) {
      cancelPendingAdd();
      queuedOpen = null;
      pendingNavigate = typeof options.navigate === 'function' ? options.navigate : null;
      if (phase === 'closed') {
        const navigate = pendingNavigate;
        pendingNavigate = null;
        navigate?.();
        return;
      }
      if (phase === 'closing' || awaitingBack) return;
      phase = 'closing';
      if (ownsCurrentEntry()) {
        awaitingBack = true;
        history.back();
      } else beginVisualClose();
    }

    window.addEventListener('popstate', event => {
      cancelPendingAdd();
      const isOverlay = isBagState(event.state);
      cleanMalformedMarker();
      if (isOverlay) {
        event.lnBagHandled = true;
        // A newer Forward intent wins over an in-flight dismissal/navigation.
        clearTimeout(closeTimer);
        closeTimer = null;
        awaitingBack = false;
        pendingNavigate = null;
        queuedOpen = null;
        dialog.classList.remove('journey-bag-closing');
        if (dialog.open) {
          phase = 'open';
          overlayId = event.state.lnBag?.id || null;
        } else displayBag(opener, true);
      } else if (phase !== 'closed') {
        // After Bag has been consumed, a further Back belongs to page navigation.
        // A traversal to another address also supersedes any queued Shop shortcut.
        const alreadyConsumed = phase === 'closing' && !awaitingBack && closeTimer !== null;
        if (alreadyConsumed || overlayURL !== location.href) {
          pendingNavigate = null;
          queuedOpen = null;
          finishClose({ restoreFocus: false });
          return;
        }
        event.lnBagHandled = true;
        awaitingBack = false;
        beginVisualClose();
      }
    }, true);

    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => {
      if (expectedCloseEvents > 0) { expectedCloseEvents -= 1; return; }
      if (phase !== 'closed') close();
    });
    closeButton.addEventListener('click', () => close());
    dialog.querySelector('.journey-bag-continue').addEventListener('click', () => close());
    shopButton.addEventListener('click', () => close({ navigate: () => {
      if (window.LosNinosJourney?.navigateToShop) window.LosNinosJourney.navigateToShop();
      else location.hash = 'shop';
    } }));

    function outsidePanel(event) {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom;
    }
    dialog.addEventListener('pointerdown', event => {
      backdropPointer = event.isPrimary && event.button === 0 && event.target === dialog && outsidePanel(event)
        ? event.pointerId : null;
    });
    dialog.addEventListener('pointerup', event => {
      const dismiss = backdropPointer === event.pointerId && event.target === dialog && outsidePanel(event);
      backdropPointer = null;
      if (dismiss) close();
    });
    dialog.addEventListener('pointercancel', () => { backdropPointer = null; });

    minus.addEventListener('click', () => {
      if (quantity <= 1) return;
      quantity -= 1;
      saveQuantity();
      render();
      if (minus.disabled) plus.focus({ preventScroll: true });
      announce(`Quantity ${quantity}.`);
    });
    plus.addEventListener('click', () => {
      if (quantity >= limit) return;
      quantity += 1;
      saveQuantity();
      render();
      if (plus.disabled) minus.focus({ preventScroll: true });
      announce(quantity === limit ? 'Quantity 10. Maximum quantity reached.' : `Quantity ${quantity}.`);
    });
    dialog.querySelector('.journey-bag-remove').addEventListener('click', () => {
      quantity = 0;
      saveQuantity();
      render();
      announce('Hat removed. Your bag is empty.');
      shopButton.focus({ preventScroll: true });
    });

    document.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const bagTrigger = event.target.closest('[data-bag-open]');
      if (bagTrigger) { event.preventDefault(); open(bagTrigger); return; }
      const addTrigger = event.target.closest('[data-add-to-bag]');
      if (!addTrigger) return;
      event.preventDefault();
      if (pendingAdd) return;
      if (quantity >= limit) {
        open(addTrigger);
        announce('Maximum quantity: 10.');
        return;
      }
      quantity += 1;
      saveQuantity();
      addTrigger.setAttribute('aria-disabled', 'true');
      addTrigger.setAttribute('data-bag-pending', '');
      const confirmation = { trigger: addTrigger, timer: null };
      pendingAdd = confirmation;
      render();
      announce(`Added one hat. Bag contains ${quantity} ${quantity === 1 ? 'item' : 'items'}.`);
      confirmation.timer = setTimeout(() => {
        if (pendingAdd !== confirmation) return;
        cancelPendingAdd();
        open(addTrigger);
      }, reducedMotion.matches ? 0 : confirmationDuration);
    });

    window.addEventListener('hashchange', cancelPendingAdd);
    window.addEventListener('pagehide', cancelPendingAdd);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      // Mobile Safari throttles background timers. Do not reopen a bag from a
      // stale add confirmation when someone returns from another app or tab.
      cancelPendingAdd();
      if (closeTimer !== null && !awaitingBack) finishClose({ restoreFocus: false });
    });
    window.addEventListener('pageshow', event => {
      loadQuantity();
      render();
      if (!event.persisted) return;
      if (isBagState(history.state)) {
        if (phase === 'closed') displayBag(fallbackOpener(), true);
      } else if (phase !== 'closed') {
        pendingNavigate = null;
        queuedOpen = null;
        finishClose();
      }
    });
    reducedMotion.addEventListener('change', () => {
      if (!reducedMotion.matches) return;
      if (pendingAdd) open(pendingAdd.trigger);
      if (closeTimer !== null && !awaitingBack) finishClose();
    });

    cleanMalformedMarker();
    render();
    window.LosNinosBag = { open, close, render, getQuantity: () => quantity };
    // Let the page finish its own initial section alignment before restoring an overlay.
    if (isBagState(history.state)) requestAnimationFrame(() => {
      if (isBagState(history.state) && phase === 'closed') displayBag(fallbackOpener(), true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
