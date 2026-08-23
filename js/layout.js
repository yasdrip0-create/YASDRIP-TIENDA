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

  const cuentaHtml = usuario
    ? `
      <div class="account-menu">
        <button class="account-btn" id="accountBtn">
          <svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>
          <span class="account-name">${usuario.nombre.split(' ')[0]}</span>
        </button>
        <div class="account-dropdown" id="accountDropdown">
          <div class="account-dropdown-hi">Hola, ${usuario.nombre} 👋</div>
          <a href="#" id="btnCerrarSesion">↩ Cerrar sesión</a>
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
        ${cuentaHtml}
        <a class="cart-pill" href="carrito.html">
          <svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
          <span id="cartCount" class="cart-count">${total}</span>
        </a>
      </div>
    </nav>
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
      cerrarSesion();
      window.location.href = 'login.html';
    });
  }
}

function renderFooter() {
  const cont = document.getElementById("site-footer");
  if (!cont) return;
  cont.innerHTML = `
    <footer class="footer-contacto">
      <div class="footer-inner">
        <div class="footer-brand">
          <a href="index.html" class="foot-logo display"><span class="logo-mark">⚡</span>YAS<em>DRIP</em></a>
          <p class="footer-slogan">Drip para gente que ya trae su propia energía.</p>
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
            <li><a href="https://instagram.com/yasdrip" target="_blank" rel="noopener">📸 Instagram: @yasdrip</a></li>
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
