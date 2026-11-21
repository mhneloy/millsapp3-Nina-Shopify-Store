/* Native Shopify forms remain available when JavaScript is disabled. */
(() => {
  'use strict';
  document.documentElement.classList.replace('no-js', 'js');
  const config = JSON.parse(document.getElementById('NfcConfig').textContent);
  const root = config.root.endsWith('/') ? config.root : config.root + '/';
  const money = cents => new Intl.NumberFormat(document.documentElement.lang || 'en', {style:'currency', currency:config.currency}).format(cents / 100);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = value => { try { const url = new URL(value, location.origin); return ['https:', 'http:'].includes(url.protocol) ? url.href : '#'; } catch { return '#'; } };
  const request = async (path, options) => {
    const response = await fetch(path, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.description || data.message || 'Please try again.');
    return data;
  };
  function openDialog(dialog) {
    if (!dialog || !dialog.showModal) return false;
    document.querySelectorAll('dialog[open]').forEach(other => { if(other !== dialog) other.close(); });
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('dialog-open');
    return true;
  }
  document.addEventListener('close', event => {
    if (event.target.id === 'NfcNavigation') {
      event.target.querySelectorAll('.nav-dropdown[open]').forEach(dropdown => { dropdown.open = false; });
    }
    if (!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-open');
  }, true);
  function closeDesktopDropdowns(event) {
    document.querySelectorAll('.desktop-nav .nav-dropdown[open]').forEach(dropdown => {
      if (!dropdown.contains(event.target)) dropdown.open = false;
    });
  }
  document.addEventListener('click', closeDesktopDropdowns);
  document.addEventListener('focusin', closeDesktopDropdowns);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const dropdown = event.target.closest('.nav-dropdown[open]');
    if (!dropdown) return;
    event.preventDefault();
    dropdown.open = false;
    dropdown.querySelector('summary').focus();
  });
  let cartBusy = false;
  function renderCart(cart) {
    document.querySelectorAll('[data-cart-count]').forEach(el => el.textContent = cart.item_count);
    const content = document.querySelector('[data-cart-content]');
    document.querySelector('[data-cart-summary]').hidden = !cart.item_count;
    document.querySelector('[data-cart-total]').textContent = money(cart.total_price);
    if (!cart.item_count) {
      content.innerHTML = `<div class="empty-cart"><p class="eyebrow">FAITH IN EVERY FIT</p><h3>${escape(config.emptyCart)}</h3><p>Find a piece that speaks to what you believe.</p><a class="nfc-button nfc-button--dark" href="${escape(root)}collections/all">Explore the collection →</a></div>`;
      return;
    }
    content.innerHTML = '<div class="cart-lines">' + cart.items.map(item => `<div class="cart-line"><a class="cart-line__image" href="${escape(safeUrl(item.url))}">${item.image ? `<img src="${escape(safeUrl(item.image))}" alt="${escape(item.product_title)}" width="164" height="210">` : ''}</a><div class="cart-line__details"><a href="${escape(safeUrl(item.url))}">${escape(item.product_title)}</a>${item.variant_title ? `<span>${escape(item.variant_title)}</span>` : ''}${item.selling_plan_allocation ? `<span>${escape(item.selling_plan_allocation.selling_plan.name)}</span>` : ''}${Object.entries(item.properties || {}).filter(([key,value]) => value && !key.startsWith('_')).map(([key,value]) => `<span>${escape(key)}: ${escape(value)}</span>`).join('')}<span class="product-price">${money(item.final_line_price)}</span>${(item.line_level_discount_allocations || []).map(discount => `<span>${escape(discount.discount_application.title)} −${money(discount.amount)}</span>`).join('')}<label>Quantity <input type="number" min="0" step="${item.quantity_rule?.increment || 1}" value="${item.quantity}" data-cart-quantity="${escape(item.key)}" aria-label="Quantity for ${escape(item.product_title)}"></label></div><button class="nfc-button nfc-button--icon" data-cart-remove="${escape(item.key)}" aria-label="Remove ${escape(item.product_title)}">×</button></div>`).join('') + '</div>';
  }
  async function refreshCart() { const cart = await request(root + 'cart.js'); renderCart(cart); return cart; }
  async function showCart() {
    const dialog = document.getElementById('NfcCart');
    if (!openDialog(dialog)) { location.href = config.cartUrl; return; }
    const status = dialog.querySelector('[data-cart-status]');
    status.textContent = 'Loading your bag…';
    try { await refreshCart(); status.textContent = ''; }
    catch { status.innerHTML = `Unable to load your bag. <a href="${escape(config.cartUrl)}">View bag</a>`; }
  }
  async function changeCart(key, quantity) {
    if (cartBusy) return;
    cartBusy = true;
    const status = document.querySelector('[data-cart-status]');
    const controls = document.querySelectorAll('[data-cart-quantity], [data-cart-remove]');
    controls.forEach(control => control.disabled = true);
    status.textContent = 'Updating…';
    try {
      renderCart(await request(root + 'cart/change.js', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:key, quantity})}));
      status.textContent = '';
    } catch (error) { await refreshCart().catch(() => {}); status.textContent = error.message; }
    finally { cartBusy = false; controls.forEach(control => control.disabled = false); }
  }
  let quickRequest = 0;
  async function quickView(link) {
    const dialog = document.getElementById('NfcQuickView');
    if (!openDialog(dialog)) { location.href = link.href; return; }
    const content = dialog.querySelector('[data-quick-content]');
    content.innerHTML = '<h2 id="QuickViewHeading">Loading…</h2>';
    const requestId = ++quickRequest;
    try {
      const productUrl = new URL(link.dataset.quickView, location.origin);
      productUrl.pathname += '.js';
      const product = await request(productUrl.href);
      if (requestId !== quickRequest) return;
      const detailUrl = safeUrl(link.href);
      const first = product.variants.find(v => v.available) || product.variants[0];
      content.innerHTML = `<div class="quick-view-content">${product.featured_image ? `<img src="${escape(safeUrl(product.featured_image))}" alt="${escape(product.title)}" width="540" height="675">` : ''}<h2 id="QuickViewHeading">${escape(product.title)}</h2><span class="product-price" data-quick-price>${money(first.price)}</span><form action="${escape(root)}cart/add" method="post" data-add-to-cart><label for="QuickVariant">Choose option</label><select id="QuickVariant" name="id">${product.variants.map(v => `<option value="${v.id}" data-price="${v.price}" ${v.id === first.id ? 'selected' : ''} ${!v.available ? 'disabled' : ''}>${escape(v.public_title || v.title)} — ${money(v.price)}${!v.available ? ' — ' + escape(config.soldOutLabel) : ''}</option>`).join('')}</select><input type="hidden" name="quantity" value="1"><button class="nfc-button nfc-button--dark" type="submit" ${!product.available || product.requires_selling_plan ? 'disabled' : ''}>${escape(product.available ? config.addLabel : config.soldOutLabel)}</button><p class="form-note" data-form-status role="status"></p></form><a class="quick-view-link" href="${escape(detailUrl)}">View full details →</a></div>`;
    } catch { content.innerHTML = `<h2 id="QuickViewHeading">Product details</h2><a class="nfc-button nfc-button--dark" href="${escape(safeUrl(link.href))}">View product →</a>`; }
  }
  document.addEventListener('click', event => {
    const opener = event.target.closest('[data-open-dialog]');
    if (opener) { openDialog(document.getElementById(opener.dataset.openDialog)); return; }
    const closer = event.target.closest('[data-close-dialog]');
    if (closer) { closer.closest('dialog').close(); return; }
    if (event.target.matches('dialog')) {
      const rect = event.target.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close();
    }
    const cart = event.target.closest('[data-cart-open]');
    if (cart && document.getElementById('NfcCart').showModal) { event.preventDefault(); showCart(); return; }
    const quick = event.target.closest('[data-quick-view]');
    if (quick && document.getElementById('NfcQuickView').showModal) { event.preventDefault(); quickView(quick); return; }
    const remove = event.target.closest('[data-cart-remove]');
    if (remove) changeCart(remove.dataset.cartRemove, 0);
    const image = event.target.closest('[data-gallery-image]');
    if (image) {
      const section = image.closest('[data-product-section]');
      const main = section.querySelector('[data-gallery-main] img');
      if (main) { main.removeAttribute('srcset'); main.src = image.dataset.galleryImage; main.alt = image.dataset.imageAlt; }
      section.querySelectorAll('[data-gallery-image]').forEach(el => el.setAttribute('aria-pressed', String(el === image)));
    }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-add-to-cart]');
    if (!form) return;
    event.preventDefault();
    if (form.dataset.busy) return;
    const submit = form.querySelector('[type="submit"]');
    const status = form.querySelector('[data-form-status]');
    const data = new FormData(form);
    form.dataset.busy = 'true';
    submit.disabled = true;
    status.textContent = 'Adding…';
    try {
      await request(root + 'cart/add.js', {method:'POST', body:data});
      status.textContent = 'Added to your bag.';
      if (document.body.classList.contains('template-cart')) location.reload();
      else await showCart();
    } catch (error) { status.textContent = error.message; }
    finally {
      delete form.dataset.busy;
      const section = form.closest('[data-product-section]');
      const variantSelect = section?.querySelector('[data-variant-select]');
      submit.disabled = section ? variantSelect.disabled || !section.productData.variants.find(variant => String(variant.id) === variantSelect.value)?.available : false;
    }
  });
  function updateVariant(section, variant) {
    const button = section.querySelector('[data-add-button]');
    const id = section.querySelector('[data-variant-select]');
    button.disabled = !variant?.available;
    button.textContent = variant ? (variant.available ? config.addLabel : config.soldOutLabel) : 'Unavailable';
    section.querySelector('[data-availability]').textContent = variant?.available ? section.dataset.availableText : (variant ? config.soldOutLabel : 'This combination is unavailable.');
    id.disabled = !variant;
    const quantity = section.querySelector('[name="quantity"]');
    if (variant?.quantity_rule) {
      quantity.min = variant.quantity_rule.min;
      quantity.step = variant.quantity_rule.increment;
      if (variant.quantity_rule.max) quantity.max = variant.quantity_rule.max; else quantity.removeAttribute('max');
      quantity.value = variant.quantity_rule.min;
    }
    if (!variant) return;
    id.value = variant.id;
    section.querySelector('[data-variant-price]').innerHTML = money(variant.price) + (variant.compare_at_price > variant.price ? ` <s>${money(variant.compare_at_price)}</s>` : '');
    const url = new URL(location.href); url.searchParams.set('variant', variant.id); history.replaceState({}, '', url);
    if (variant.featured_image) {
      const main = section.querySelector('[data-gallery-main] img');
      if (main) { main.removeAttribute('srcset'); main.src = variant.featured_image.src; main.alt = variant.featured_image.alt || ''; }
      section.querySelectorAll('[data-gallery-image]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.galleryImage.split('?')[0] === variant.featured_image.src.split('?')[0])));
    }
  }
  function initProducts(scope = document) {
    scope.querySelectorAll('[data-product-section]').forEach(section => {
      if (section.dataset.initialized) return;
      section.dataset.initialized = 'true';
      section.dataset.availableText ||= section.querySelector('[data-availability]').textContent;
      section.productData = JSON.parse(section.querySelector('[data-product-json]').textContent);
      if (section.querySelector('[data-option-index]')) section.querySelector('[data-variant-select]').classList.add('js-variant-select');
    });
  }
  document.addEventListener('change', event => {
    const input = event.target;
    if (input.matches('[data-cart-quantity]')) {
      const quantity = Number(input.value);
      if (input.validity.valid && Number.isInteger(quantity) && quantity >= 0) changeCart(input.dataset.cartQuantity, quantity);
    }
    if (input.id === 'QuickVariant') document.querySelector('[data-quick-price]').textContent = money(Number(input.selectedOptions[0].dataset.price));
    const section = input.closest('[data-product-section]');
    if (!section) return;
    if (input.matches('[data-option-index]')) {
      section.querySelector(`[data-selected-option="${input.dataset.optionIndex}"]`).textContent = input.value;
      const selected = [...section.querySelectorAll('[data-option-index]:checked')].map(el => el.value);
      const variant = section.productData.variants.find(variant => variant.options.every((value,index) => value === selected[index]));
      updateVariant(section, variant);
    } else if (input.matches('[data-variant-select]')) updateVariant(section, section.productData.variants.find(v => String(v.id) === input.value));
  });
  initProducts();
  function initAddresses(scope = document) {
    scope.querySelectorAll('[data-address-country]').forEach(country => {
      if (country.dataset.initialized) return;
      country.dataset.initialized = 'true';
      if (country.dataset.default) {
        const option = [...country.options].find(option => option.textContent === country.dataset.default || option.value === country.dataset.default);
        if (option) option.selected = true;
      }
      const updateProvince = () => {
        const previous = document.getElementById(country.dataset.provinceId);
        if (!previous) return;
        let provinces = [];
        try { provinces = JSON.parse(country.selectedOptions[0]?.dataset.provinces || '[]'); } catch { /* Keep the text fallback. */ }
        const value = previous.value || previous.dataset.provinceValue;
        const control = document.createElement(provinces.length ? 'select' : 'input');
        control.id = previous.id;
        control.name = previous.name;
        control.autocomplete = 'address-level1';
        if (provinces.length) provinces.forEach(([code, name]) => {
          const option = new Option(name, code, false, value === code || value === name);
          control.append(option);
        });
        else control.value = value || '';
        previous.replaceWith(control);
      };
      updateProvince();
      country.addEventListener('change', updateProvince);
    });
  }
  initAddresses();
  function savedHandles() {
    try { const saved = JSON.parse(localStorage.getItem('nfc-wishlist') || '[]'); return Array.isArray(saved) ? saved.filter(handle => typeof handle === 'string' && /^[a-z0-9-]+$/.test(handle)) : []; }
    catch { return []; }
  }
  function syncWishlist() {
    const handles = savedHandles();
    document.querySelectorAll('[data-wishlist-toggle]').forEach(button => {
      const saved = handles.includes(button.dataset.wishlistToggle);
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', saved ? 'Remove from saved pieces' : 'Save this piece');
    });
  }
  async function renderWishlist() {
    const content = document.querySelector('[data-wishlist-content]');
    if (!content) return;
    const handles = savedHandles();
    if (!handles.length) {
      content.innerHTML = `<div class="empty-catalog"><h3>No saved pieces yet.</h3><p>Save your favorites from a product page.</p><a class="nfc-button nfc-button--line" href="${escape(root)}collections/all">Explore the collection →</a></div>`;
      return;
    }
    content.textContent = 'Loading your saved pieces…';
    const results = await Promise.allSettled(handles.map(handle => request(root + 'products/' + encodeURIComponent(handle) + '.js')));
    content.innerHTML = '<div class="product-grid">' + results.map((result,index) => {
      if (result.status !== 'fulfilled') return `<article><h2>Piece unavailable</h2><button class="nfc-button nfc-button--line" data-wishlist-remove="${escape(handles[index])}">Remove saved piece</button></article>`;
      const product = result.value;
      const url = root + 'products/' + encodeURIComponent(handles[index]);
      return `<article class="product-card"><div class="product-card__visual"><a class="product-card__image-link" href="${escape(url)}">${product.featured_image ? `<img src="${escape(safeUrl(product.featured_image))}" alt="${escape(product.title)}" loading="lazy">` : ''}</a></div><div class="product-card__info"><a class="product-card__title" href="${escape(url)}">${escape(product.title)}</a><span class="product-price">${money(product.price)}</span><button class="nfc-button nfc-button--text" data-wishlist-remove="${escape(handles[index])}">Remove ×</button></div></article>`;
    }).join('') + '</div>';
  }
  document.addEventListener('click', event => {
    const toggle = event.target.closest('[data-wishlist-toggle]');
    const remove = event.target.closest('[data-wishlist-remove]');
    if (!toggle && !remove) return;
    const handle = toggle?.dataset.wishlistToggle || remove.dataset.wishlistRemove;
    const saved = savedHandles();
    const next = saved.includes(handle) ? saved.filter(value => value !== handle) : [...saved, handle];
    try { localStorage.setItem('nfc-wishlist', JSON.stringify(next)); }
    catch { const status = document.querySelector('[data-wishlist-status]'); if (status) status.textContent = 'Your browser could not save this piece. Please allow local storage.'; return; }
    syncWishlist();
    if (remove) renderWishlist();
  });
  syncWishlist();
  renderWishlist();
  document.addEventListener('shopify:section:load', () => { syncWishlist(); renderWishlist(); });
  document.addEventListener('shopify:section:load', event => initProducts(event.target));
  document.addEventListener('shopify:section:load', event => initAddresses(event.target));
  document.addEventListener('shopify:section:unload', () => { if(!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-open'); });
  document.addEventListener('shopify:block:select', event => { const details = event.target.matches('details') ? event.target : event.target.querySelector('details'); if(details) details.open = true; });
})();
