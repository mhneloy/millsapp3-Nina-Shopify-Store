/* Predictive header search and paginated, in-place catalog search. */
(() => {
  'use strict';
  const config = JSON.parse(document.getElementById('NfcConfig').textContent);
  const root = config.root.endsWith('/') ? config.root : config.root + '/';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  const safeUrl = value => {
    try { const url = new URL(value, location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : '#'; }
    catch { return '#'; }
  };
  const formatPrice = value => new Intl.NumberFormat(document.documentElement.lang || 'en', {style:'currency', currency:config.currency}).format(Number(value));
  const parse = html => new DOMParser().parseFromString(html, 'text/html');
  function searchUrl(params) {
    const url = new URL(root + 'search', location.origin);
    url.search = params.toString();
    url.searchParams.set('type', 'product');
    url.searchParams.set('options[prefix]', 'last');
    url.searchParams.set('section_id', 'nfc-search-results');
    // Collection-only sort orders have no equivalent in Shopify search.
    if (!['relevance', 'price-ascending', 'price-descending'].includes(url.searchParams.get('sort_by'))) url.searchParams.set('sort_by', 'relevance');
    return url;
  }
  async function fetchHtml(url, signal) {
    const response = await fetch(url, {signal});
    if (!response.ok) throw new Error('Search is temporarily unavailable. Please try again.');
    return parse(await response.text());
  }
  const dialog = document.getElementById('NfcSearch');
  const input = dialog.querySelector('[name="q"]');
  const suggestions = dialog.querySelector('#NfcSearchResults');
  const headerStatus = dialog.querySelector('#NfcSearchStatus');
  let headerController, headerTimer, headerVersion = 0;
  function cancelHeaderSearch() {
    clearTimeout(headerTimer);
    headerController?.abort();
    return ++headerVersion;
  }
  async function findSuggestions(version) {
    const term = input.value.trim();
    if (!term) {
      suggestions.replaceChildren();
      headerStatus.textContent = 'Type a product name to find your next piece.';
      suggestions.removeAttribute('aria-busy');
      return;
    }
    headerController = new AbortController();
    const {signal} = headerController;
    headerStatus.textContent = 'Searching products…';
    suggestions.setAttribute('aria-busy', 'true');
    try {
      const url = new URL(root + 'search/suggest.json', location.origin);
      url.search = new URLSearchParams({q:term, 'resources[type]':'product', 'resources[limit]':'8', 'resources[options][unavailable_products]':'last'});
      let products;
      try {
        const response = await fetch(url, {signal});
        if (!response.ok) throw new Error('Predictive search unavailable');
        const data = await response.json();
        if (!Array.isArray(data.resources?.results?.products)) throw new Error('Invalid search response');
        products = data.resources.results.products;
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        // Shopify predictive search is not available in every store language.
        const html = await fetchHtml(searchUrl(new URLSearchParams({q:term})), signal);
        if (!html.querySelector('[data-catalog-response]')) throw new Error('Search unavailable');
        products = [...html.querySelectorAll('.product-card')].slice(0, 8).map(card => ({title:card.querySelector('.product-card__title').textContent, url:card.querySelector('.product-card__title').getAttribute('href'), image:card.querySelector('img')?.getAttribute('src'), priceText:card.querySelector('.product-price').textContent}));
      }
      if (version !== headerVersion) return;
      suggestions.innerHTML = products.length ? '<ul>' + products.map(product => {
        const image = product.featured_image?.url || product.image;
        return `<li><a class="search-suggestion" href="${escape(safeUrl(product.url))}">${image ? `<img src="${escape(safeUrl(image))}" alt="" width="56" height="70" loading="lazy">` : '<span class="search-suggestion__placeholder" aria-hidden="true"></span>'}<span><strong>${escape(product.title)}</strong><small>${escape(product.priceText || (product.price != null ? formatPrice(product.price) : ''))}</small></span><span aria-hidden="true">→</span></a></li>`;
      }).join('') + '</ul>' : '';
      if (products.length) {
        const catalog = new URL(root + 'collections/all', location.origin);
        catalog.searchParams.set('q', term);
        suggestions.insertAdjacentHTML('beforeend', `<a class="nfc-button nfc-button--line search-view-all" href="${escape(catalog.href)}">View all matching pieces →</a>`);
      }
      headerStatus.textContent = products.length ? `${products.length} matching ${products.length === 1 ? 'product' : 'products'}.` : `No products found for “${term}”. Try another name.`;
    } catch (error) {
      if (version !== headerVersion || error.name === 'AbortError') return;
      suggestions.replaceChildren();
      headerStatus.textContent = 'Unable to load products. Please try your search again.';
    } finally {
      if (version === headerVersion) suggestions.removeAttribute('aria-busy');
    }
  }
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-search-open]');
    if (!trigger) return;
    event.preventDefault();
    document.querySelectorAll('dialog[open]').forEach(other => { if (other !== dialog) other.close(); });
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('dialog-open');
    input.focus();
    findSuggestions(cancelHeaderSearch());
  });
  input.addEventListener('input', () => {
    const version = cancelHeaderSearch();
    // Remove stale matches immediately, including while waiting for debounce.
    suggestions.replaceChildren();
    if (!input.value.trim()) findSuggestions(version);
    else { headerStatus.textContent = 'Searching products…'; headerTimer = setTimeout(() => findSuggestions(version), 250); }
  });
  dialog.querySelector('form').addEventListener('submit', event => { event.preventDefault(); findSuggestions(cancelHeaderSearch()); });
  dialog.addEventListener('close', () => { cancelHeaderSearch(); suggestions.removeAttribute('aria-busy'); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); dialog.close(); return; }
    const links = [...suggestions.querySelectorAll('a')];
    if (event.key === 'ArrowDown') {
      const next = event.target === input ? links[0] : links[links.indexOf(event.target) + 1];
      if (next) { event.preventDefault(); next.focus(); }
    } else if (event.key === 'ArrowUp' && links.includes(event.target)) {
      event.preventDefault(); (links[links.indexOf(event.target) - 1] || input).focus();
    }
  });
  const catalogs = new WeakMap();
  function catalogParams(section) {
    const params = new URLSearchParams(location.search);
    [...params.keys()].forEach(key => { if (key.startsWith('filter.') || ['q', 'page', 'sort_by', 'section_id'].includes(key)) params.delete(key); });
    new FormData(section.querySelector('[data-filter-form]')).forEach((value, key) => { if (String(value).trim()) params.append(key, value); });
    const term = section.querySelector('[data-catalog-search] [name="q"]').value.trim();
    if (term) params.set('q', term);
    return params;
  }
  async function updateCatalog(section, params, updateHistory = true) {
    const state = catalogs.get(section);
    state.controller?.abort();
    const controller = state.controller = new AbortController();
    const results = section.querySelector('[data-catalog-results]');
    const status = section.querySelector('[data-catalog-status]');
    const term = params.get('q')?.trim() || '';
    status.textContent = 'Searching products…';
    results.setAttribute('aria-busy', 'true');
    try {
      const url = term ? searchUrl(params) : new URL(section.dataset.collectionUrl, location.origin);
      if (!term) { url.search = params.toString(); url.searchParams.set('section_id', section.dataset.sectionId); }
      const html = await fetchHtml(url, controller.signal);
      const response = html.querySelector(term ? '[data-catalog-response]' : '[data-catalog-results]');
      if (!response) throw new Error('Search results were not returned. Please try again.');
      if (controller !== state.controller) return;
      results.innerHTML = response.innerHTML;
      const count = section.querySelector('[data-catalog-count]');
      count.textContent = term ? `${response.dataset.resultCount} matching pieces` : html.querySelector('[data-catalog-count]').textContent;
      status.textContent = term ? `Results for “${term}”.` : '';
      section.querySelector('.active-filter-row').hidden = Boolean(term);
      state.term = term;
      section.querySelector('[data-catalog-search] [name="q"]').value = term;
      // Rewrite pagination links to the collection, preserving its URL and context.
      results.querySelectorAll('.pagination a').forEach(link => {
        const next = new URL(section.dataset.collectionUrl, location.origin);
        next.search = params.toString();
        next.searchParams.set('page', new URL(link.href).searchParams.get('page') || '1');
        link.href = next.href;
      });
      if (updateHistory) {
        const current = new URL(location.href);
        current.search = params.toString();
        history.pushState({}, '', current);
      }
    } catch (error) {
      if (controller !== state.controller || error.name === 'AbortError') return;
      status.textContent = 'Unable to load products. Please try again using Enter or Apply.';
    } finally { if (controller === state.controller) results.removeAttribute('aria-busy'); }
  }
  function initCatalogs(scope = document) {
    scope.querySelectorAll('[data-catalog-section]').forEach(section => {
      if (catalogs.has(section)) return;
      catalogs.set(section, {term:''});
      const params = new URLSearchParams(location.search);
      const field = section.querySelector('[data-catalog-search] [name="q"]');
      field.value = params.get('q') || '';
      if (field.value.trim()) updateCatalog(section, params, false);
    });
  }
  document.addEventListener('submit', event => {
    const section = event.target.closest('[data-catalog-section]');
    if (!section || !event.target.matches('[data-catalog-search], [data-filter-form]')) return;
    event.preventDefault();
    updateCatalog(section, catalogParams(section));
  });
  document.addEventListener('input', event => {
    const section = event.target.closest('[data-catalog-section]');
    if (section && event.target.matches('[data-catalog-search] [name="q"]') && !event.target.value.trim() && catalogs.get(section)?.term) updateCatalog(section, catalogParams(section));
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-catalog-results] .pagination a');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const section = link.closest('[data-catalog-section]');
    updateCatalog(section, new URL(link.href).searchParams);
  });
  window.addEventListener('popstate', () => {
    document.querySelectorAll('[data-catalog-section]').forEach(section => {
      const params = new URLSearchParams(location.search);
      const form = section.querySelector('[data-filter-form]');
      [...form.elements].forEach(control => {
        if (!control.name) return;
        if (['checkbox', 'radio'].includes(control.type)) control.checked = params.getAll(control.name).includes(control.value);
        else if (control.tagName === 'SELECT') control.value = params.get(control.name) || control.querySelector('[selected]')?.value || control.options[0].value;
        else control.value = params.get(control.name) || '';
      });
      updateCatalog(section, params, false);
    });
  });
  initCatalogs();
  document.addEventListener('shopify:section:load', event => initCatalogs(event.target));
  // Old bookmarks and direct /search links now land on Shop all as well.
  if (document.body.classList.contains('template-search')) {
    const url = new URL(root + 'collections/all', location.origin);
    url.search = location.search;
    url.searchParams.delete('section_id');
    location.replace(url.href);
  }
})();
