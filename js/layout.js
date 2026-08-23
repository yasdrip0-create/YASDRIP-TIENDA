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
  cont.innerHTML = `
    <nav class="nav">
      <a href="index.html" class="nav-logo">
        <span class="logo-mark">⚡</span><span class="logo-text display">YAS<em>DRIP</em></span>
      </a>
      <div class="nav-links">
        <a href="productos.html" class="${paginaActual === 'productos' ? 'active' : ''}">Colección</a>
        <a href="servicios.html" class="${paginaActual === 'servicios' ? 'active' : ''}">Servicio al cliente</a>
        <a href="index.html#club">Voltage Club</a>
      </div>
      <div class="nav-right">
        <a class="cart-pill" href="carrito.html">
          <svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
          <span id="cartCount" class="cart-count">${total}</span>
        </a>
      </div>
    </nav>
  `;
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
