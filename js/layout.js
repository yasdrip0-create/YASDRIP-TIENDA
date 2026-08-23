/* ============================================================
   Inserta el menú de navegación y el pie de página en cada
   html. Reemplaza a includes/header.php e includes/footer.php
   (aquí no existe "require" del lado del servidor, así que se
   inyecta el mismo HTML con JavaScript).
   ============================================================ */

function renderHeader(paginaActual = "") {
  const cont = document.getElementById("site-header");
  if (!cont) return;
  const total = totalCarritoCount();
  const usuario = usuarioActual();
  const categorias = typeof categoriasDisponibles === 'function' ? categoriasDisponibles() : [];

  const dropdownCategorias = categorias.map(cat =>
    `<a href="productos.html?cat=${encodeURIComponent(cat)}">${cat}</a>`
  ).join("");

  const inicial = usuario ? usuario.nombre.trim().charAt(0).toUpperCase() : '';
  const cuentaHtml = usuario
    ? `
      <div class="account-menu">
        <button class="account-btn account-btn-in" id="accountBtn">
          <span class="account-avatar">${inicial}</span>
          <span class="account-name">${usuario.nombre.split(' ')[0]}</span>
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="account-dropdown" id="accountDropdown">
          <div class="account-dropdown-hi">
            <span class="account-avatar account-avatar-lg">${inicial}</span>
            <div>
              <div class="account-dropdown-name">${usuario.nombre}</div>
              <div class="account-dropdown-sub">Voltage Club ⚡</div>
            </div>
          </div>
          <a href="#" id="btnCerrarSesion" class="logout-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
            <span>Cerrar sesión</span>
          </a>
        </div>
      </div>`
    : `
      <a href="login.html" class="account-btn">
        <svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>
        <span class="account-name">Iniciar sesión</span>
      </a>`;

  cont.innerHTML = `
    <div class="topbar">
      <span>⚡ DRIP PARA GENTE QUE YA TRAE SU PROPIA ENERGÍA — ENVÍOS A TODA COLOMBIA</span>
    </div>
    ${!usuario ? `
    <div class="subbar">
      <span>Regístrate o inicia sesión para desbloquear tu Voltage Club</span>
      <a href="login.html">Entrar →</a>
    </div>` : ''}
    <nav class="nav">
      <a href="index.html" class="nav-logo">
        <span class="logo-mark">⚡</span><span class="logo-text display">YAS<em>DRIP</em></span>
      </a>
      <div class="nav-links">
        <div class="nav-drop">
          <a href="productos.html" class="${paginaActual === 'productos' ? 'active' : ''}">Colección ▾</a>
          <div class="nav-drop-panel">${dropdownCategorias}</div>
        </div>
        <a href="servicios.html" class="${paginaActual === 'servicios' ? 'active' : ''}">Servicio al cliente</a>
        <a href="index.html#club">Voltage Club</a>
      </div>
      <div class="nav-right">
        <button class="icon-only-btn" id="searchBtn" aria-label="Buscar">
          <svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        </button>
        ${cuentaHtml}
        <a class="cart-pill" href="carrito.html">
          <svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
          <span id="cartCount" class="cart-count">${total}</span>
        </a>
      </div>
    </nav>

    <div class="search-overlay" id="searchOverlay">
      <div class="search-box">
        <svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" id="searchInput" placeholder="Busca por nombre… ej: Buso Volt, Gorra, Cargo" autocomplete="off">
        <button class="search-close" id="searchClose" aria-label="Cerrar">✕</button>
      </div>
      <div class="search-results" id="searchResults"></div>
    </div>
  `;

  const accBtn = document.getElementById('accountBtn');
  const accDrop = document.getElementById('accountDropdown');
  if (accBtn && accDrop) {
    accBtn.addEventListener('click', () => accDrop.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!accBtn.contains(e.target) && !accDrop.contains(e.target)) accDrop.classList.remove('open');
    });
  }
  const btnCerrar = document.getElementById('btnCerrarSesion');
  if (btnCerrar) {
    btnCerrar.addEventListener('click', (e) => {
      e.preventDefault();
      btnCerrar.classList.add('logging-out');
      setTimeout(() => {
        cerrarSesion();
        window.location.href = 'login.html';
      }, 260);
    });
  }

  initSearch();
}

/* ============================================================
   BUSCADOR GLOBAL
   Disponible en toda página que tenga #site-header. Filtra
   PRODUCTS por nombre/categoría en vivo y al hacer clic o Enter
   lleva a productos.html?buscar=<id>, donde ese producto se
   resalta y hace scroll automático hacia él.
   ============================================================ */
function initSearch() {
  const overlay = document.getElementById('searchOverlay');
  const btn = document.getElementById('searchBtn');
  const input = document.getElementById('searchInput');
  const closeBtn = document.getElementById('searchClose');
  const results = document.getElementById('searchResults');
  if (!overlay || !btn || typeof productosActivos !== 'function') return;

  const abrir = () => {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => input.focus(), 60);
  };
  const cerrar = () => {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    input.value = '';
    pintar('');
  };

  function pintar(termino) {
    const t = termino.trim().toLowerCase();
    if (!t) {
      results.innerHTML = `<div class="search-hint">Escribe el nombre de una prenda — "Buso Volt", "Gorra", "Cargo"…</div>`;
      return;
    }
    const lista = productosActivos().filter(p =>
      p.nombre.toLowerCase().includes(t) || p.categoria.toLowerCase().includes(t)
    );
    if (lista.length === 0) {
      results.innerHTML = `<div class="search-hint">No encontramos nada con "${termino}". Prueba con otra palabra 🔍</div>`;
      return;
    }
    results.innerHTML = lista.slice(0, 6).map(p => `
      <a href="productos.html?buscar=${p.id}" class="search-result">
        <div class="search-result-icon" style="background:${p.colores[0]}33">${iconoProducto(p.icono, p.colores[0])}</div>
        <div class="search-result-info">
          <div class="search-result-name">${p.nombre}</div>
          <div class="search-result-cat">${p.categoria}</div>
        </div>
        <div class="search-result-price mono">$${Number(p.precio).toLocaleString('es-CO')}</div>
      </a>`).join('');
  }

  btn.addEventListener('click', abrir);
  closeBtn.addEventListener('click', cerrar);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); abrir(); }
    if (e.key === 'Escape' && overlay.classList.contains('open')) cerrar();
  });
  input.addEventListener('input', () => pintar(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const primero = results.querySelector('.search-result');
      if (primero) window.location.href = primero.getAttribute('href');
    }
  });
  pintar('');
}

function renderFooter() {
  const cont = document.getElementById("site-footer");
  if (!cont) return;
  cont.innerHTML = `
    <footer class="footer-contacto">
      <div class="footer-cta">
        <div class="footer-cta-text">
          <span class="footer-cta-bolt">⚡</span>
          <div>
            <h3>¿Ya tienes tu drip?</h3>
            <p>Métete al Voltage Club y entérate primero de cada caída — antes que se agote.</p>
          </div>
        </div>
        <a href="index.html#club" class="footer-cta-btn">Quiero entrar →</a>
      </div>

      <div class="footer-inner">
        <div class="footer-brand">
          <a href="index.html" class="foot-logo display"><span class="logo-mark">⚡</span>YAS<em>DRIP</em></a>
          <p class="footer-slogan">Drip para gente que ya trae su propia energía.</p>
          <div class="footer-socials">
            <a href="https://www.instagram.com/yas__drip/" target="_blank" rel="noopener" class="social-pill ig">📸 @yas__drip</a>
            <a href="https://tiktok.com/@yasdrip" target="_blank" rel="noopener" class="social-pill tk">🎵 TikTok</a>
            <a href="https://facebook.com/yasdrip" target="_blank" rel="noopener" class="social-pill fb">📘 Facebook</a>
          </div>
        </div>

        <div class="footer-col">
          <h4>CONTÁCTANOS</h4>
          <ul>
            <li><a href="tel:+573239523623">📞 +57 323 952 3623</a></li>
            <li><a href="https://wa.me/573239523623" target="_blank" rel="noopener">💬 WhatsApp: +57 323 952 3623</a></li>
            <li><a href="mailto:contacto@yasdrip.co">✉️ contacto@yasdrip.co</a></li>
            <li>📍 Calle 50 #45-30, Medellín, Colombia</li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>REDES SOCIALES</h4>
          <ul class="redes">
            <li><a href="https://www.instagram.com/yas__drip/" target="_blank" rel="noopener">📸 Instagram: @yas__drip</a></li>
            <li><a href="https://tiktok.com/@yasdrip" target="_blank" rel="noopener">🎵 TikTok: @yasdrip</a></li>
            <li><a href="https://facebook.com/yasdrip" target="_blank" rel="noopener">📘 Facebook: YAS DRIP</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 YAS DRIP — Todos los derechos reservados. <span class="hand">hecho en Medellín ⚡</span></p>
      </div>
    </footer>
  `;
}
