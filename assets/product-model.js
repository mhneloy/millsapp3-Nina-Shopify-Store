if (!customElements.get('product-model')) {
    customElements.define('product-model', class ProductModel extends DeferredMedia {
      constructor() {
        super();
      }
  
      loadContent() {
        super.loadContent();
  
        Shopify.loadFeatures([
          {
            name: 'model-viewer-ui',
            version: '1.0',
            onLoad: this.setupModelViewerUI.bind(this),
          },
        ]);
      }
  
      setupModelViewerUI(errors) {
        if (errors) return;
  
        this.modelViewerUI = new Shopify.ModelViewerUI(this.querySelector('model-viewer'));
      }
    });
  }
  
  window.ProductModel = {
    loadShopifyXR() {
      Shopify.loadFeatures([
        {
          name: 'shopify-xr',
          version: '1.0',
          onLoad: this.setupShopifyXR.bind(this),
        },
      ]);
    },
  
    setupShopifyXR(errors) {
      if (errors) return;
  
      if (!window.ShopifyXR) {
        document.addEventListener('shopify_xr_initialized', () =>
          this.setupShopifyXR()
        );
        return;
      }
  
      document.querySelectorAll('[id^="ProductJSON-"]').forEach((modelJSON) => {
        window.ShopifyXR.addModels(JSON.parse(modelJSON.textContent));
        modelJSON.remove();
      });
      window.ShopifyXR.setupXRElements();
    },
  };
  
  window.addEventListener('DOMContentLoaded', () => {
    if (window.ProductModel) window.ProductModel.loadShopifyXR();
  });
  

  // badge layout 

(function () {
  if (window.smartProductBadgesInitialized) return;
  window.smartProductBadgesInitialized = true;

  const selectors = ".product-badges";
  const instances = new WeakMap();

  function packBadges(container) {
    const badges = Array.from(
      container.querySelectorAll(":scope > .product-badge")
    );

    if (!badges.length) return;

    const styles = getComputedStyle(container);
    const gap = parseFloat(styles.columnGap) || 0;
    const width = container.clientWidth;

    if (!width) return;

    // Reset previous visual order before measuring.
    badges.forEach(badge => {
      badge.style.order = "";
    });

    const items = badges.map((badge, index) => ({
      element: badge,
      index,
      width: Math.ceil(badge.getBoundingClientRect().width)
    }));

    // First-fit decreasing: prioritize wider badges.
    items.sort((a, b) => b.width - a.width);

    const rows = [];

    items.forEach(item => {
      let bestRow = -1;
      let smallestRemaining = Infinity;

      rows.forEach((row, index) => {
        const needed = item.width + (row.items.length ? gap : 0);
        const remaining = width - row.used - needed;

        if (remaining >= 0 && remaining < smallestRemaining) {
          smallestRemaining = remaining;
          bestRow = index;
        }
      });

      if (bestRow === -1) {
        rows.push({
          used: item.width,
          items: [item]
        });
      } else {
        const row = rows[bestRow];
        row.used += item.width + gap;
        row.items.push(item);
      }
    });

    let order = 0;

    rows.forEach(row => {
      row.items.forEach(item => {
        item.element.style.order = order++;
      });
    });
  }

  function initialize(container) {
    if (instances.has(container)) return;

    let frame = null;

    const update = () => {
      if (frame !== null) cancelAnimationFrame(frame);

      frame = requestAnimationFrame(() => {
        frame = null;
        packBadges(container);
      });
    };

    const observer = new ResizeObserver(update);
    observer.observe(container);

    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(container, {
      childList: true
    });

    instances.set(container, {
      observer,
      mutationObserver
    });

    update();
  }

  function initializeAll() {
    document.querySelectorAll(selectors).forEach(initialize);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAll);
  } else {
    initializeAll();
  }

  document.addEventListener("shopify:section:load", initializeAll);
})();


