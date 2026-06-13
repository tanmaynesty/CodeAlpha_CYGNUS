/* ============================================================
   CYGNUS STORE — Main Application JS
   SPA router, API module, cart management, page renderers
   ============================================================ */

// ── Configuration ────────────────────────────────────────────
const API_BASE = '/api';
const CART_STORAGE_KEY = 'cygnus_cart';
const TOKEN_KEY = 'cygnus_token';
const REFRESH_KEY = 'cygnus_refresh';
const USER_KEY = 'cygnus_user';

// ── Utility ──────────────────────────────────────────────────
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD'
  }).format(amount);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Toast Notifications ──────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── API Module ───────────────────────────────────────────────
const api = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  setTokens(access, refresh) {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },

  clearTokens() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  },

  async refreshToken() {
    const refresh = localStorage.getItem(REFRESH_KEY);
    if (!refresh) return false;
    try {
      const res = await fetch(`${API_BASE}/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem(TOKEN_KEY, data.access);
        return true;
      }
    } catch (e) { /* ignore */ }
    this.clearTokens();
    return false;
  },

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res = await fetch(url, { ...options, headers });

    // If 401, try refreshing token
    if (res.status === 401 && token) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.getToken()}`;
        res = await fetch(url, { ...options, headers });
      }
    }

    return res;
  },

  async get(endpoint) {
    const res = await this.request(endpoint);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },

  async post(endpoint, body) {
    const res = await this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw { status: res.status, data };
    return data;
  },

  async put(endpoint, body) {
    const res = await this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw { status: res.status, data };
    return data;
  },

  async delete(endpoint) {
    const res = await this.request(endpoint, { method: 'DELETE' });
    if (res.status === 204) return {};
    return res.json();
  }
};


// ── Auth Module ──────────────────────────────────────────────
const auth = {
  isLoggedIn() {
    return !!api.getToken();
  },

  getUser() {
    try {
      const u = localStorage.getItem(USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  },

  setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  async login(username, password) {
    const data = await api.post('/token/', { username, password });
    api.setTokens(data.access, data.refresh);
    const profile = await api.get('/auth/profile/');
    this.setUser(profile);
    await cart.syncGuestCart();
    updateAuthUI();
    return profile;
  },

  async register(userData) {
    return api.post('/auth/register/', userData);
  },

  logout() {
    api.clearTokens();
    cart.clearServerCart();
    updateAuthUI();
    navigate('/');
    showToast('Logged out successfully', 'info');
  },

  async fetchProfile() {
    if (!this.isLoggedIn()) return null;
    try {
      const profile = await api.get('/auth/profile/');
      this.setUser(profile);
      return profile;
    } catch {
      api.clearTokens();
      return null;
    }
  }
};


// ── Cart Module ──────────────────────────────────────────────
const cart = {
  _items: [],
  _serverCart: null,

  init() {
    this._items = this.loadLocal();
    this.updateBadge();
  },

  loadLocal() {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  },

  saveLocal() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(this._items));
    this.updateBadge();
  },

  getItems() {
    return this._items;
  },

  getTotalItems() {
    return this._items.reduce((sum, item) => sum + item.quantity, 0);
  },

  getTotalPrice() {
    return this._items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  },

  addItem(product, qty = 1) {
    const existing = this._items.find(i => i.id === product.id);
    if (existing) {
      existing.quantity += qty;
    } else {
      this._items.push({
        id: product.id,
        name: product.name,
        price: parseFloat(product.price),
        image: product.image_display || product.image_url || '',
        category: product.category,
        quantity: qty
      });
    }
    this.saveLocal();
    this.updateDrawer();

    if (auth.isLoggedIn()) {
      api.post('/cart/', { product_id: product.id, quantity: qty }).catch(() => { });
    }
  },

  updateQuantity(id, quantity) {
    if (quantity <= 0) {
      this.removeItem(id);
      return;
    }
    const item = this._items.find(i => i.id === id);
    if (item) {
      item.quantity = quantity;
      this.saveLocal();
      this.updateDrawer();
    }
  },

  removeItem(id) {
    this._items = this._items.filter(i => i.id !== id);
    this.saveLocal();
    this.updateDrawer();
  },

  clearCart() {
    this._items = [];
    this.saveLocal();
    this.updateDrawer();
  },

  clearServerCart() {
    this._serverCart = null;
  },

  async syncGuestCart() {
    if (!auth.isLoggedIn() || this._items.length === 0) return;
    try {
      const serverCart = await api.post('/cart/sync/', { items: this._items });
      // Rebuild local cart from server
      this._items = serverCart.items.map(si => ({
        id: si.product.id,
        name: si.product.name,
        price: parseFloat(si.product.price),
        image: si.product.image_display || '',
        category: si.product.category,
        quantity: si.quantity,
        cartItemId: si.id
      }));
      this.saveLocal();
    } catch (e) {
      console.error('Cart sync failed:', e);
    }
  },

  updateBadge() {
    const badge = document.getElementById('cart-badge');
    const total = this.getTotalItems();
    if (badge) {
      badge.textContent = total;
      badge.style.display = total > 0 ? 'flex' : 'none';
    }
  },

  updateDrawer() {
    this.updateBadge();
    const itemsContainer = document.getElementById('drawer-items');
    const footer = document.getElementById('drawer-footer');
    const totalEl = document.getElementById('drawer-total');

    if (!itemsContainer) return;

    if (this._items.length === 0) {
      itemsContainer.innerHTML = `
        <div class="drawer-empty">
          <span class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></span>
          <p>Your cart is empty</p>
        </div>`;
      if (footer) footer.style.display = 'none';
      return;
    }

    itemsContainer.innerHTML = this._items.map(item => `
      <div class="drawer-item">
        <img class="drawer-item-image" src="${item.image}" alt="${item.name}" width="72" height="72" loading="lazy" />
        <div class="drawer-item-info">
          <span class="drawer-item-name">${item.name}</span>
          <span class="drawer-item-price">${formatCurrency(item.price)}</span>
          <div class="drawer-item-actions">
            <button class="drawer-qty-btn" onclick="cart.updateQuantity(${item.id}, ${item.quantity - 1})">−</button>
            <span class="drawer-qty">${item.quantity}</span>
            <button class="drawer-qty-btn" onclick="cart.updateQuantity(${item.id}, ${item.quantity + 1})">+</button>
            <button class="drawer-remove-btn" onclick="cart.removeItem(${item.id})">Remove</button>
          </div>
        </div>
      </div>
    `).join('');

    if (footer) footer.style.display = 'flex';
    if (totalEl) totalEl.textContent = formatCurrency(this.getTotalPrice());
  }
};


// ── Cart Drawer ──────────────────────────────────────────────
function openCartDrawer() {
  document.getElementById('cart-drawer').classList.add('open');
  document.getElementById('cart-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  cart.updateDrawer();
}

function closeCartDrawer() {
  document.getElementById('cart-drawer').classList.remove('open');
  document.getElementById('cart-overlay').classList.remove('open');
  document.body.style.overflow = '';
}


// ── Auth Modal ───────────────────────────────────────────────
function openAuthModal(tab = 'login') {
  document.getElementById('auth-modal').classList.add('open');
  document.getElementById('auth-modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  switchAuthTab(tab);
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.remove('open');
  document.getElementById('auth-modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  // Clear errors
  document.getElementById('login-error').textContent = '';
  document.getElementById('register-error').textContent = '';
}

function switchAuthTab(tab) {
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
}

async function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  if (!username || !password) {
    errorEl.textContent = 'Please fill in all fields.';
    return;
  }

  try {
    await auth.login(username, password);
    closeAuthModal();
    showToast(`Welcome back, ${username}!`, 'success');
    // Re-render current page
    handleRoute();
  } catch (e) {
    errorEl.textContent = e.data?.detail || 'Invalid credentials. Please try again.';
  }
}

async function handleRegister() {
  const firstName = document.getElementById('reg-first-name').value.trim();
  const lastName = document.getElementById('reg-last-name').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errorEl = document.getElementById('register-error');

  if (!username || !email || !password) {
    errorEl.textContent = 'Username, email, and password are required.';
    return;
  }

  try {
    await auth.register({
      username, email, password,
      first_name: firstName,
      last_name: lastName
    });
    showToast('Account created! Logging you in...', 'success');
    // Auto-login
    await auth.login(username, password);
    closeAuthModal();
    handleRoute();
  } catch (e) {
    const errors = e.data;
    let msg = '';
    if (errors) {
      for (const [key, val] of Object.entries(errors)) {
        msg += `${Array.isArray(val) ? val.join(', ') : val}\n`;
      }
    }
    errorEl.textContent = msg || 'Registration failed. Please try again.';
  }
}

function handleLogout() {
  auth.logout();
}

function updateAuthUI() {
  const authNav = document.getElementById('auth-nav');
  const userNav = document.getElementById('user-nav');

  if (auth.isLoggedIn()) {
    authNav.classList.remove('active-nav');
    userNav.classList.add('active-nav');
  } else {
    authNav.classList.add('active-nav');
    userNav.classList.remove('active-nav');
  }
}


// ── Mobile Menu ──────────────────────────────────────────────
function toggleMobileMenu() {
  const toggle = document.getElementById('mobile-menu-toggle');
  const links = document.getElementById('nav-links');
  toggle.classList.toggle('open');
  links.classList.toggle('open');
}

function closeMobileMenu() {
  const toggle = document.getElementById('mobile-menu-toggle');
  const links = document.getElementById('nav-links');
  if (toggle) toggle.classList.remove('open');
  if (links) links.classList.remove('open');
}


// ── Router ───────────────────────────────────────────────────
function navigate(path) {
  window.location.hash = '#' + path;
}

function getRoute() {
  const hash = window.location.hash.slice(1) || '/';
  return hash;
}

function handleRoute() {
  const route = getRoute();
  const app = document.getElementById('app');
  closeMobileMenu();
  window.scrollTo(0, 0);

  // Update active nav links
  document.querySelectorAll('.nav-link[data-route]').forEach(link => {
    const linkRoute = link.getAttribute('data-route');
    if (route === linkRoute || (linkRoute === '/products' && route.startsWith('/products'))) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Route matching
  if (route === '/' || route === '') {
    renderHome(app);
  } else if (route === '/products' || route.startsWith('/products?')) {
    renderProducts(app);
  } else if (route.match(/^\/products\/(\d+)$/)) {
    const id = route.match(/^\/products\/(\d+)$/)[1];
    renderProductDetail(app, id);
  } else if (route === '/cart') {
    renderCart(app);
  } else if (route === '/checkout') {
    renderCheckout(app);
  } else if (route === '/orders') {
    renderOrders(app);
  } else if (route === '/about') {
    renderAbout(app);
  } else if (route === '/contact') {
    renderContact(app);
  } else {
    renderNotFound(app);
  }
}

window.addEventListener('hashchange', handleRoute);


// ── Page Renderers ───────────────────────────────────────────

// HOME PAGE
async function renderHome(app) {
  app.innerHTML = `
    <!-- Hero Section -->
    <section class="hero" id="hero-section">
      <div class="hero-bg">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="orb orb-3"></div>
      </div>
      <div class="container">
        <div class="hero-content">
          <span class="hero-tag">The 2026 Studio Collection</span>
          <h1 class="hero-title">
            Sound. <span class="hero-title-accent">Perfected.</span>
          </h1>
          <p class="hero-subtitle">
            Uncompromising audio, precision-crafted wearables, and seamless
            smart home integration. Design philosophy meets engineering excellence.
          </p>
          <div class="hero-cta">
            <a href="#/products" class="btn-primary" id="hero-shop-btn">Shop Collection →</a>
            <a href="#/about" class="btn-secondary" id="hero-about-btn">Our Story</a>
          </div>
          <div class="hero-stats">
            <div class="hero-stat">
              <span class="hero-stat-number">200+</span>
              <span class="hero-stat-label">Premium Products</span>
            </div>
            <div class="hero-stat">
              <span class="hero-stat-number">50K+</span>
              <span class="hero-stat-label">Happy Customers</span>
            </div>
            <div class="hero-stat">
              <span class="hero-stat-number">4.9</span>
              <span class="hero-stat-label">Average Rating</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Featured Products -->
    <section class="featured-section">
      <div class="container">
        <div class="featured-header">
          <div>
            <span class="section-tag">Trending Now</span>
            <h2 class="section-title">Featured Selection</h2>
          </div>
          <a href="#/products" class="view-all-link">View All →</a>
        </div>
        <div class="product-grid" id="featured-products">
          <div class="loading-container" style="min-height: 30vh;">
            <div class="spinner"></div>
          </div>
        </div>
      </div>
    </section>
  `;

  // Load featured products
  try {
    const products = await api.get('/products/');
    const featured = products.slice(0, 8);
    document.getElementById('featured-products').innerHTML = featured.map(p => productCardHTML(p)).join('');
  } catch (e) {
    document.getElementById('featured-products').innerHTML = '<p class="no-products">Failed to load products.</p>';
  }
}


// PRODUCTS PAGE
async function renderProducts(app) {
  // Parse query params from hash
  const hashParts = getRoute().split('?');
  const params = new URLSearchParams(hashParts[1] || '');
  const activeCategory = params.get('category') || 'All';
  const searchQuery = params.get('search') || '';

  app.innerHTML = `
    <section class="products-page">
      <div class="container">
        <div class="section-header">
          <span class="section-tag">Our Collection</span>
          <h1 class="section-title">All Products</h1>
          <p class="section-subtitle">Explore our complete range of precision-crafted technology.</p>
        </div>

        <div class="products-toolbar">
          <div class="category-pills" id="category-pills">
            ${['All', 'Audio', 'Wearables', 'Accessories', 'Smart Home'].map(cat => `
              <button class="category-pill ${cat === activeCategory ? 'active' : ''}"
                      onclick="filterCategory('${cat}')"
                      id="cat-${cat.toLowerCase().replace(' ', '-')}">${cat}</button>
            `).join('')}
          </div>
          <div class="search-bar">
            <span class="search-icon">🔍</span>
            <input type="text" placeholder="Search products..."
                   id="search-input" value="${searchQuery}"
                   oninput="handleSearch(this.value)" />
          </div>
        </div>

        <div class="product-grid" id="products-grid">
          <div class="loading-container" style="min-height: 30vh;">
            <div class="spinner"></div>
          </div>
        </div>
      </div>
    </section>
  `;

  await loadProducts(activeCategory, searchQuery);
}

async function loadProducts(category = 'All', search = '') {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  let url = '/products/?';
  if (category && category !== 'All') url += `category=${encodeURIComponent(category)}&`;
  if (search) url += `search=${encodeURIComponent(search)}&`;

  try {
    const products = await api.get(url);
    if (products.length === 0) {
      grid.innerHTML = '<p class="no-products">No products found matching your criteria.</p>';
    } else {
      grid.innerHTML = products.map((p, i) => productCardHTML(p, i)).join('');
    }
  } catch (e) {
    grid.innerHTML = '<p class="no-products">Failed to load products. Please try again.</p>';
  }
}

function filterCategory(category) {
  const search = document.getElementById('search-input')?.value || '';
  let hash = '#/products';
  const params = [];
  if (category !== 'All') params.push(`category=${encodeURIComponent(category)}`);
  if (search) params.push(`search=${encodeURIComponent(search)}`);
  if (params.length) hash += '?' + params.join('&');
  window.location.hash = hash;
}

const handleSearch = debounce((value) => {
  // Get active category
  const activeBtn = document.querySelector('.category-pill.active');
  const category = activeBtn ? activeBtn.textContent : 'All';
  let hash = '#/products';
  const params = [];
  if (category !== 'All') params.push(`category=${encodeURIComponent(category)}`);
  if (value) params.push(`search=${encodeURIComponent(value)}`);
  if (params.length) hash += '?' + params.join('&');
  window.location.hash = hash;
}, 400);


// PRODUCT DETAIL PAGE
async function renderProductDetail(app, id) {
  app.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <span>Loading product...</span>
    </div>`;

  try {
    const product = await api.get(`/products/${id}/`);
    const stars = '★'.repeat(Math.floor(product.rating)) +
      (product.rating % 1 >= 0.5 ? '½' : '');

    let badgeHTML = '';
    if (product.badge) {
      const cls = product.badge === 'New' ? 'badge-new' :
        product.badge === 'Sale' ? 'badge-sale' : 'badge-best-seller';
      badgeHTML = `<span class="detail-badge ${cls}">${product.badge}</span>`;
    }

    app.innerHTML = `
      <section class="product-detail">
        <div class="container">
          <a href="#/products" class="back-link">← Back to Products</a>
          <div class="product-detail-grid">
            <div class="product-detail-image">
              <img src="${product.image_display}" alt="${product.name}" />
            </div>
            <div class="product-detail-info">
              ${badgeHTML}
              <span class="detail-category">${product.category}</span>
              <h1 class="detail-name">${product.name}</h1>
              <span class="detail-price">${formatCurrency(product.price)}</span>
              <div class="detail-rating">
                <span class="stars">${stars}</span>
                <span>${product.rating} (${product.reviews_count} reviews)</span>
              </div>
              <p class="detail-description">${product.description}</p>

              ${product.features && product.features.length > 0 ? `
                <div class="detail-features">
                  <h3>Features</h3>
                  <ul>
                    ${product.features.map(f => `<li>${f}</li>`).join('')}
                  </ul>
                </div>
              ` : ''}

              <span class="detail-stock ${product.in_stock ? 'stock-in' : 'stock-out'}">
                ${product.in_stock ? '● In Stock' : '● Out of Stock'}
              </span>

              <div class="detail-actions">
                <div class="qty-control">
                  <button onclick="updateDetailQty(-1)">−</button>
                  <span id="detail-qty">1</span>
                  <button onclick="updateDetailQty(1)">+</button>
                </div>
                <button class="btn-add-to-cart" id="btn-add-detail"
                        onclick="addDetailToCart(${product.id})"
                        ${!product.in_stock ? 'disabled' : ''}>
                  ${product.in_stock ? 'Add to Cart' : 'Out of Stock'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;

    // Store product data for cart adding
    window._currentProduct = product;
  } catch (e) {
    app.innerHTML = `
      <div class="loading-container">
        <p>Product not found.</p>
        <a href="#/products" class="btn-primary" style="margin-top:1rem;">Browse Products</a>
      </div>`;
  }
}

function updateDetailQty(delta) {
  const el = document.getElementById('detail-qty');
  if (!el) return;
  let qty = parseInt(el.textContent) + delta;
  if (qty < 1) qty = 1;
  if (qty > 99) qty = 99;
  el.textContent = qty;
}

function addDetailToCart(productId) {
  const qty = parseInt(document.getElementById('detail-qty')?.textContent || '1');
  const product = window._currentProduct;
  if (!product) return;
  cart.addItem(product, qty);
  showToast(`${product.name} added to cart!`, 'success');
  openCartDrawer();
}


// CART PAGE
function renderCart(app) {
  const items = cart.getItems();

  if (items.length === 0) {
    app.innerHTML = `
      <section class="cart-page">
        <div class="container">
          <h1 class="section-title" style="margin-bottom: var(--space-4);">Shopping Cart</h1>
          <div class="cart-page-grid">
            <div class="cart-empty">
              <div class="empty-icon"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div>
              <p>Your cart is empty</p>
              <a href="#/products" class="btn-primary">Start Shopping →</a>
            </div>
          </div>
        </div>
      </section>`;
    return;
  }

  const subtotal = cart.getTotalPrice();
  const shipping = subtotal > 100 ? 0 : 9.99;
  const total = subtotal + shipping;

  app.innerHTML = `
    <section class="cart-page">
      <div class="container">
        <a href="#/products" class="back-link">← Continue Shopping</a>
        <h1 class="section-title" style="margin-bottom: var(--space-8);">Shopping Cart</h1>
        <div class="cart-page-grid">
          <div class="cart-items" id="cart-items-list">
            ${items.map(item => `
              <div class="cart-item" id="cart-item-${item.id}">
                <div class="cart-item-image">
                  <img src="${item.image}" alt="${item.name}" loading="lazy" />
                </div>
                <div class="cart-item-info">
                  <div>
                    <span class="cart-item-category">${item.category}</span>
                    <a href="#/products/${item.id}" class="cart-item-name">${item.name}</a>
                  </div>
                  <div class="cart-item-bottom">
                    <span class="cart-item-price">${formatCurrency(item.price * item.quantity)}</span>
                    <div class="cart-item-qty">
                      <button onclick="updateCartItemQty(${item.id}, ${item.quantity - 1})">−</button>
                      <span>${item.quantity}</span>
                      <button onclick="updateCartItemQty(${item.id}, ${item.quantity + 1})">+</button>
                    </div>
                  </div>
                  <button class="cart-item-remove" onclick="removeCartItem(${item.id})">Remove</button>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="order-summary">
            <h3>Order Summary</h3>
            <div class="summary-row">
              <span>Subtotal (${cart.getTotalItems()} items)</span>
              <span>${formatCurrency(subtotal)}</span>
            </div>
            <div class="summary-row">
              <span>Shipping</span>
              <span>${shipping === 0 ? 'Free' : formatCurrency(shipping)}</span>
            </div>
            ${shipping === 0 ? '' : `
            <div class="summary-row" style="color: var(--color-success); font-size: var(--text-xs);">
              <span>Free shipping on orders over $100</span>
            </div>`}
            <div class="summary-row total">
              <span>Total</span>
              <span>${formatCurrency(total)}</span>
            </div>
            <button class="btn-checkout" onclick="goToCheckout()">
              ${auth.isLoggedIn() ? 'Proceed to Checkout →' : 'Login to Checkout →'}
            </button>
          </div>
        </div>
      </div>
    </section>`;
}

function updateCartItemQty(id, qty) {
  cart.updateQuantity(id, qty);
  renderCart(document.getElementById('app'));
}

function removeCartItem(id) {
  cart.removeItem(id);
  renderCart(document.getElementById('app'));
  showToast('Item removed from cart', 'info');
}

function goToCheckout() {
  if (!auth.isLoggedIn()) {
    openAuthModal('login');
    showToast('Please login to checkout', 'info');
    return;
  }
  navigate('/checkout');
}


// CHECKOUT PAGE
function renderCheckout(app) {
  if (!auth.isLoggedIn()) {
    openAuthModal('login');
    navigate('/cart');
    return;
  }

  const items = cart.getItems();
  if (items.length === 0) {
    navigate('/cart');
    return;
  }

  const subtotal = cart.getTotalPrice();
  const shipping = subtotal > 100 ? 0 : 9.99;
  const total = subtotal + shipping;

  app.innerHTML = `
    <section class="checkout-page">
      <div class="container">
        <a href="#/cart" class="back-link">← Back to Cart</a>
        <h1 class="section-title" style="margin-bottom: var(--space-8);">Checkout</h1>
        <div class="checkout-grid">
          <div class="checkout-form">
            <h3>Shipping Address</h3>
            <div class="form-group">
              <label for="checkout-address">Full Address</label>
              <textarea id="checkout-address" placeholder="Enter your full shipping address (street, city, state, zip code, country)"></textarea>
            </div>
            <div class="form-error" id="checkout-error"></div>
            <button class="btn-primary-full" onclick="placeOrder()">Place Order — ${formatCurrency(total)}</button>
          </div>

          <div class="order-summary">
            <h3>Order Summary</h3>
            ${items.map(item => `
              <div style="display:flex; align-items:center; gap:var(--space-3); margin-bottom:var(--space-3);">
                <img src="${item.image}" alt="${item.name}" style="width:48px;height:48px;border-radius:var(--radius-md);object-fit:cover;" />
                <div style="flex:1;">
                  <div style="font-size:var(--text-sm);font-weight:var(--font-medium);">${item.name}</div>
                  <div style="font-size:var(--text-xs);color:var(--color-text-muted);">Qty: ${item.quantity}</div>
                </div>
                <span style="font-size:var(--text-sm);font-weight:var(--font-semibold);">${formatCurrency(item.price * item.quantity)}</span>
              </div>
            `).join('')}
            <div class="summary-row total" style="margin-top:var(--space-4);padding-top:var(--space-4);border-top:var(--glass-border);">
              <span>Total</span>
              <span>${formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </section>`;
}

async function placeOrder() {
  const address = document.getElementById('checkout-address')?.value.trim();
  const errorEl = document.getElementById('checkout-error');

  if (!address) {
    errorEl.textContent = 'Please enter your shipping address.';
    return;
  }

  try {
    // First sync cart to server
    await api.post('/cart/sync/', { items: cart.getItems() });
    // Then create order
    const order = await api.post('/orders/', { address });
    cart.clearCart();
    showToast(`Order #${order.id} placed successfully!`, 'success');
    navigate('/orders');
  } catch (e) {
    const msg = e.data?.error || 'Failed to place order. Please try again.';
    errorEl.textContent = msg;
    showToast(msg, 'error');
  }
}


// ORDERS PAGE
async function renderOrders(app) {
  if (!auth.isLoggedIn()) {
    openAuthModal('login');
    navigate('/');
    return;
  }

  app.innerHTML = `
    <section class="orders-page">
      <div class="container">
        <h1 class="section-title" style="margin-bottom: var(--space-8);">My Orders</h1>
        <div id="orders-list">
          <div class="loading-container" style="min-height: 30vh;">
            <div class="spinner"></div>
          </div>
        </div>
      </div>
    </section>`;

  try {
    const orders = await api.get('/orders/');
    const listEl = document.getElementById('orders-list');

    if (orders.length === 0) {
      listEl.innerHTML = `
        <div class="cart-empty">
          <div class="empty-icon">📦</div>
          <p>No orders yet</p>
          <a href="#/products" class="btn-primary">Start Shopping →</a>
        </div>`;
      return;
    }

    listEl.innerHTML = orders.map(order => `
      <div class="order-card">
        <div class="order-header">
          <span class="order-id">Order #${order.id}</span>
          <span class="order-status status-${order.status}">${order.status}</span>
        </div>
        <div class="order-items">
          ${order.items.map(item => `
            <div class="order-item">
              <div class="order-item-image">
                <img src="${item.product_image}" alt="${item.product_name}" />
              </div>
              <span class="order-item-name">${item.product_name}</span>
              <span class="order-item-qty">×${item.quantity}</span>
              <span class="order-item-price">${formatCurrency(item.price)}</span>
            </div>
          `).join('')}
        </div>
        <div class="order-footer">
          <span class="order-date">${new Date(order.created_at).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    })}</span>
          <span class="order-total">Total: ${formatCurrency(order.total)}</span>
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('orders-list').innerHTML = '<p class="no-products">Failed to load orders.</p>';
  }
}


// ABOUT PAGE
function renderAbout(app) {
  app.innerHTML = `
    <section class="about-page">
      <div class="container">
        <div class="about-hero">
          <span class="section-tag">Our Story</span>
          <h1>Crafting the Future of <span class="hero-title-accent">Tech</span></h1>
          <br>
          <p>
            At CYGNUS, we believe technology should be beautiful, functional, and intuitive.
            We curate the finest equipment from around the world, bringing you a seamless
            experience that matches the precision of our products.
          </p>
        </div>

        <div class="about-grid">
          <div class="about-card">
            <div class="about-card-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></div>
            <h3>Design Philosophy</h3>
            <p>To democratize access to high-fidelity products through a curated, trustworthy marketplace that prioritizes craftsmanship over quantity.</p>
          </div>
          <div class="about-card">
            <div class="about-card-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>
            <h3>Quality Assurance</h3>
            <p>Every product in our catalog goes through a rigorous 50-point technical assessment. We only carry products that meet our exacting standards.</p>
          </div>
          <div class="about-card">
            <div class="about-card-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
            <h3>Technical Innovation</h3>
            <p>We partner with forward-thinking acoustic and hardware brands who push the boundaries of what's possible. Discover tomorrow's tech today.</p>
          </div>
        </div>

        <div class="about-grid" style="grid-template-columns: repeat(4, 1fr);">
          <div class="about-card">
            <div class="hero-stat-number">200+</div>
            <p style="margin-top: var(--space-2);">Premium Products</p>
          </div>
          <div class="about-card">
            <div class="hero-stat-number">50K+</div>
            <p style="margin-top: var(--space-2);">Happy Customers</p>
          </div>
          <div class="about-card">
            <div class="hero-stat-number">99%</div>
            <p style="margin-top: var(--space-2);">Satisfaction Rate</p>
          </div>
          <div class="about-card">
            <div class="hero-stat-number">24/7</div>
            <p style="margin-top: var(--space-2);">Expert Support</p>
          </div>
        </div>
      </div>
    </section>`;
}


// CONTACT PAGE
function renderContact(app) {
  app.innerHTML = `
    <section class="contact-page" style="padding: var(--space-12) 0;">
      <div class="container">
        <h1 class="section-title">Contact Us</h1>
        <div class="product-detail-grid" style="margin-top: var(--space-8);">
          <div class="contact-info" style="background: var(--color-bg-card); border: 4px solid var(--color-border); padding: var(--space-6); box-shadow: 6px 6px 0 #000;">
            <h3 style="font-family: var(--font-heading); margin-bottom: var(--space-4);">Get in Touch</h3>
            <p style="margin-bottom: var(--space-4);">We'd love to hear from you. Drop us a line or visit our social media links in the footer.</p>
            <p><strong>Email:</strong> tanmaynesty@gmail.com</p>
            <p><strong>Address:</strong> Nagpur City</p>
          </div>
          <div class="contact-form-wrap" style="background: var(--color-bg-primary); border: 4px solid var(--color-border); padding: var(--space-6); box-shadow: 6px 6px 0 #000;">
            <form class="contact-form" onsubmit="submitContactForm(event, this)">
              <div class="form-group">
                <label>Name</label>
                <input type="text" id="contact-name" placeholder="Your Name" required />
              </div>
              <div class="form-group">
                <label>Email</label>
                <input type="email" id="contact-email" placeholder="Your Email" required />
              </div>
              <div class="form-group">
                <label>Message</label>
                <textarea id="contact-message" rows="5" placeholder="Your Message" required style="width: 100%; border: 3px solid var(--color-border); padding: var(--space-3); background: var(--color-bg-glass);"></textarea>
              </div>
              <button type="submit" class="btn-primary-full">Send Message</button>
            </form>
          </div>
        </div>
      </div>
    </section>
  `;
}

async function submitContactForm(event, form) {
  event.preventDefault();
  const name = document.getElementById('contact-name').value;
  const email = document.getElementById('contact-email').value;
  const message = document.getElementById('contact-message').value;

  try {
    await api.post('/contact/', { name, email, message });
    showToast('Message sent! We will get back to you soon.', 'success');
    form.reset();
  } catch (e) {
    showToast('Failed to send message. Please try again.', 'error');
  }
}

// NOT FOUND PAGE
function renderNotFound(app) {
  app.innerHTML = `
    <div class="loading-container" style="flex-direction:column;gap:var(--space-6);">
      <span style="font-size:4rem;opacity:0.3;">404</span>
      <h2 style="font-family:var(--font-heading);font-size:var(--text-2xl);">Page Not Found</h2>
      <p style="color:var(--color-text-muted);">The page you're looking for doesn't exist.</p>
      <a href="#/" class="btn-primary">Go Home →</a>
    </div>`;
}


// ── Product Card HTML ────────────────────────────────────────
function productCardHTML(product, index = 0) {
  let badgeHTML = '';
  if (product.badge) {
    const cls = product.badge === 'New' ? 'badge-new' :
      product.badge === 'Sale' ? 'badge-sale' : 'badge-best-seller';
    badgeHTML = `<span class="badge-tag ${cls}">${product.badge}</span>`;
  }

  return `
    <div class="product-card" style="animation-delay: ${index * 0.05}s;" onclick="navigate('/products/${product.id}')" id="product-card-${product.id}">
      <div class="image-wrap">
        ${badgeHTML}
        <img src="${product.image_display}" alt="${product.name}" loading="lazy" width="400" height="400" />
        ${!product.in_stock ? '<div class="out-of-stock-overlay">Out of Stock</div>' : ''}
        ${product.in_stock ? `
          <button class="quick-add" onclick="event.stopPropagation(); quickAdd(${product.id})" aria-label="Add ${product.name} to cart" id="quick-add-${product.id}">+</button>
        ` : ''}
      </div>
      <div class="product-info">
        <span class="product-category">${product.category}</span>
        <h3 class="product-name">${product.name}</h3>
        <div class="product-meta">
          <span class="product-price">${formatCurrency(product.price)}</span>
          <span class="product-rating">
            <span class="star">★</span>
            ${product.rating} (${product.reviews_count})
          </span>
        </div>
      </div>
    </div>
  `;
}


// ── Quick Add to Cart ────────────────────────────────────────
let _productsCache = [];

async function quickAdd(productId) {
  // Try cache first
  let product = _productsCache.find(p => p.id === productId);

  if (!product) {
    try {
      product = await api.get(`/products/${productId}/`);
      _productsCache.push(product);
    } catch (e) {
      showToast('Failed to add item', 'error');
      return;
    }
  }

  cart.addItem(product);
  showToast(`${product.name} added to cart!`, 'success');
}


// ── Initialize App ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize cart
  cart.init();

  // Check auth state
  updateAuthUI();
  if (auth.isLoggedIn()) {
    auth.fetchProfile();
  }

  // Cache products for quick-add
  try {
    _productsCache = await api.get('/products/');
  } catch (e) { /* ignore */ }

  // Route to current page
  handleRoute();
});
