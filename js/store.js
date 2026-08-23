/* ============================================================
   ALMACENAMIENTO LOCAL (localStorage)
   Reemplaza $_SESSION['carrito'] y las tablas MySQL: pedidos,
   solicitudes_servicio, suscriptores, usuarios.

   Importante: todo esto vive en el navegador de cada visitante.
   Si el mismo cliente entra desde otro celular o borra el
   historial, no va a ver lo mismo. Es igual de "real" que el
   panel admin.html del proyecto de la barbería.
   ============================================================ */

const LS_KEYS = {
  carrito: "yasdrip_carrito",
  pedidos: "yasdrip_pedidos",
  solicitudes: "yasdrip_solicitudes",
  suscriptores: "yasdrip_suscriptores",
  usuarios: "yasdrip_usuarios",
  sesion: "yasdrip_sesion",
  productos: "yasdrip_catalogo",
  admin: "yasdrip_admin",
  sesionAdmin: "yasdrip_sesion_admin",
};

function _leer(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch (e) {
    return [];
  }
}
function _guardar(key, valor) {
  localStorage.setItem(key, JSON.stringify(valor));
}

/* ============================================================
   CATÁLOGO (productos editables por el admin)
   PRODUCTS (definido en js/products.js) es solo el catálogo "de
   fábrica" / semilla. La primera vez que alguien abre la tienda
   en su navegador, se copia a localStorage. Desde ahí el panel
   admin.html puede cambiar precio, % de descuento y stock, y
   esos cambios se reflejan en la tienda sin tocar código.

   Ojo: como no hay servidor, este catálogo vive en el navegador.
   Los cambios que haga el vendedor en admin.html solo se ven en
   ESE navegador/computador. Si abre la tienda desde otro celular,
   ese otro celular no verá los cambios (igual que el resto de la
   demo: carrito, pedidos, usuarios, etc.).
   ============================================================ */
function inicializarCatalogo() {
  if (localStorage.getItem(LS_KEYS.productos)) return;
  const base = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).map(p => ({
    ...p,
    descuento: 0, // % que pone el admin (0 a 90). 0 = sin descuento.
  }));
  _guardar(LS_KEYS.productos, base);
}
function getCatalogo() {
  inicializarCatalogo();
  return _leer(LS_KEYS.productos);
}
function guardarCatalogo(lista) {
  _guardar(LS_KEYS.productos, lista);
}
/** Precio final ya aplicado el % de descuento que puso el admin */
function precioConDescuento(p) {
  const d = Number(p.descuento) || 0;
  const base = Number(p.precio) || 0;
  if (d <= 0) return base;
  return Math.round(base * (1 - d / 100));
}
/** Precio BASE (sin descuento) de una talla específica. Si el admin no le
    puso un precio propio a esa talla, se usa el precio general del producto.
    Así, una camiseta puede costar distinto en S/M que en L/XL. */
function precioBaseTalla(p, talla) {
  const t = p.preciosTalla || {};
  if (talla != null && t[talla] !== undefined && t[talla] !== null && t[talla] !== '') {
    return Number(t[talla]) || 0;
  }
  return Number(p.precio) || 0;
}
/** Precio final de una talla específica, ya con el % de descuento aplicado */
function precioConDescuentoTalla(p, talla) {
  const d = Number(p.descuento) || 0;
  const base = precioBaseTalla(p, talla);
  if (d <= 0) return base;
  return Math.round(base * (1 - d / 100));
}
/** Rango {min,max} de precios finales del producto entre todas sus tallas.
    Si todas las tallas cuestan lo mismo, min === max. */
function rangoPrecioTallas(p) {
  const tallas = p.tallas && p.tallas.length ? p.tallas : [null];
  const finales = tallas.map(t => precioConDescuentoTalla(p, t));
  return { min: Math.min(...finales), max: Math.max(...finales) };
}
/** true si no queda stock de ese producto */
function estaAgotado(p) {
  return Number(p.stock) <= 0;
}
/** Baja 1 unidad de stock por cada prenda que venga en el carrito
    (se llama al confirmar una compra). */
function descontarStockCarrito(carrito) {
  const catalogo = getCatalogo();
  carrito.forEach(item => {
    const p = catalogo.find(x => x.id == item.id);
    if (p) p.stock = Math.max(0, Number(p.stock) - 1);
  });
  guardarCatalogo(catalogo);
}

/* ---------- ADMIN: gestión de inventario, precio y descuentos ---------- */
/** Todos los productos (activos e inactivos), para el panel admin */
function obtenerProductosAdmin() {
  return getCatalogo();
}
/** Edita nombre/precio/descuento/stock/activo de un producto existente.
    "cambios" es un objeto con solo los campos que se van a actualizar. */
function actualizarProductoAdmin(id, cambios) {
  const catalogo = getCatalogo();
  const p = catalogo.find(x => x.id == id);
  if (!p) return null;
  if (cambios.nombre !== undefined) p.nombre = String(cambios.nombre).trim() || p.nombre;
  if (cambios.categoria !== undefined) p.categoria = String(cambios.categoria).trim() || p.categoria;
  if (cambios.precio !== undefined) p.precio = Math.max(0, Number(cambios.precio) || 0);
  if (cambios.descuento !== undefined) p.descuento = Math.min(90, Math.max(0, Number(cambios.descuento) || 0));
  if (cambios.stock !== undefined) p.stock = Math.max(0, Math.floor(Number(cambios.stock) || 0));
  if (cambios.activo !== undefined) p.activo = !!cambios.activo;
  if (cambios.preciosTalla !== undefined) p.preciosTalla = cambios.preciosTalla;
  if (cambios.foto !== undefined) p.foto = cambios.foto;
  guardarCatalogo(catalogo);
  return p;
}
/** Guarda (o borra, si dataUrl es null) la foto de UN color específico
    de un producto. Así, si el mismo buso existe en blanco y negro, cada
    color puede tener su propia foto real y la tienda cambia la imagen
    cuando el cliente hace clic en el color. */
function actualizarFotoColorAdmin(id, color, dataUrl) {
  const catalogo = getCatalogo();
  const p = catalogo.find(x => x.id == id);
  if (!p) return null;
  if (!p.fotos) p.fotos = {};
  if (dataUrl) {
    p.fotos[color] = dataUrl;
  } else {
    delete p.fotos[color];
  }
  guardarCatalogo(catalogo);
  return p;
}
/** Agrega un producto nuevo al catálogo desde el panel admin.
    nuevo.foto (opcional) ya debe venir como dataURL comprimido. */
function agregarProductoAdmin(nuevo) {
  const catalogo = getCatalogo();
  const producto = {
    id: Date.now(),
    nombre: (nuevo.nombre || 'Producto nuevo').trim(),
    categoria: (nuevo.categoria || 'Otros').trim(),
    precio: Math.max(0, Number(nuevo.precio) || 0),
    precio_anterior: null,
    descuento: 0,
    icono: nuevo.icono || 'tee',
    foto: nuevo.foto || null,
    fotos: nuevo.fotos || {}, // foto específica por color, ej: {"#151512": "data:..."}
    preciosTalla: nuevo.preciosTalla || {}, // precio específico por talla, ej: {"L": 89900}
    colores: nuevo.colores && nuevo.colores.length ? nuevo.colores : ['#151512'],
    tallas: nuevo.tallas && nuevo.tallas.length ? nuevo.tallas : ['S', 'M', 'L', 'XL'],
    badge: null,
    stock: Math.max(0, Math.floor(Number(nuevo.stock) || 0)),
    activo: true,
  };
  catalogo.push(producto);
  guardarCatalogo(catalogo);
  return producto;
}
/** Elimina un producto del catálogo por completo */
function eliminarProductoAdmin(id) {
  const catalogo = getCatalogo().filter(p => p.id != id);
  guardarCatalogo(catalogo);
}

/* ---------- CARRITO ---------- */
function getCarrito() {
  return _leer(LS_KEYS.carrito);
}
function totalCarritoCount() {
  return getCarrito().length;
}
function agregarAlCarrito(producto, color, talla) {
  const carrito = getCarrito();
  const colorFinal = color || producto.colores[0];
  carrito.push({
    id: producto.id,
    nombre: producto.nombre,
    categoria: producto.categoria,
    precio: precioConDescuentoTalla(producto, talla),
    icono: producto.icono,
    foto: (producto.fotos && producto.fotos[colorFinal]) || producto.foto || null,
    color: colorFinal,
    talla: talla,
  });
  _guardar(LS_KEYS.carrito, carrito);
  return carrito.length;
}
function eliminarDelCarrito(idx) {
  const carrito = getCarrito();
  carrito.splice(idx, 1);
  _guardar(LS_KEYS.carrito, carrito);
}
/** Quita SOLO una unidad de un producto (mismo id + color + talla) */
function quitarUnidad(id, color, talla) {
  const carrito = getCarrito();
  const idx = carrito.findIndex(it => it.id == id && it.color === color && it.talla === talla);
  if (idx > -1) carrito.splice(idx, 1);
  _guardar(LS_KEYS.carrito, carrito);
  return carrito.length;
}
/** Quita TODAS las unidades de un producto (mismo id + color + talla) */
function eliminarGrupo(id, color, talla) {
  const carrito = getCarrito().filter(it => !(it.id == id && it.color === color && it.talla === talla));
  _guardar(LS_KEYS.carrito, carrito);
  return carrito.length;
}
function limpiarCarrito() {
  _guardar(LS_KEYS.carrito, []);
}
function totalCarritoValor() {
  return getCarrito().reduce((sum, item) => sum + Number(item.precio), 0);
}

/* ---------- PEDIDOS ---------- */
function crearPedido(datosCliente) {
  const carrito = getCarrito();
  if (!carrito.length) return null;
  const pedidos = _leer(LS_KEYS.pedidos);
  const envio = datosCliente.envio || {};
  const subtotal = totalCarritoValor();
  const costoEnvioPedido = Number(envio.costo || 0);
  const pedido = {
    id: Date.now(),
    nombre_cliente: datosCliente.nombre,
    email_cliente: datosCliente.email,
    telefono_cliente: datosCliente.telefono || '',
    metodo_pago: datosCliente.metodoPago || 'contraentrega',
    tarjeta_final: datosCliente.tarjetaFinal || null,
    envio_municipio: envio.municipio || '',
    envio_barrio: envio.barrio || '',
    envio_vereda: envio.vereda || '',
    envio_direccion: envio.direccion || '',
    envio_edificio: envio.edificio || '',
    envio_referencia: envio.referencia || '',
    costo_envio: costoEnvioPedido,
    detalle: carrito.map(i => `${i.nombre} (${i.talla})`).join(" | "),
    subtotal: subtotal,
    total: subtotal + costoEnvioPedido,
    fecha: new Date().toISOString(),
  };
  pedidos.push(pedido);
  _guardar(LS_KEYS.pedidos, pedidos);
  descontarStockCarrito(carrito);
  limpiarCarrito();
  return pedido;
}

/* ---------- SOLICITUDES DE SERVICIO (cambios, garantías, quejas) ----------
   extra puede traer:
     foto:      dataURL (jpeg) ya comprimido, o null
     ubicacion: { lat, lng } capturada por geolocalización, o null
   ambos son opcionales y no rompen las llamadas antiguas. */
function guardarSolicitud(servicio, nombre, contacto, descripcion, extra = {}) {
  const solicitudes = _leer(LS_KEYS.solicitudes);
  solicitudes.push({
    id: Date.now(),
    servicio,
    nombre,
    contacto,
    descripcion,
    foto: extra.foto || null,
    ubicacion: extra.ubicacion || null,
    fecha: new Date().toISOString(),
  });
  _guardar(LS_KEYS.solicitudes, solicitudes);
}

/** Comprime una foto (File) a un dataURL jpeg liviano antes de guardarla
    en localStorage. Devuelve una Promise<string|null>. */
function comprimirImagen(file, maxAncho = 900, calidad = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file) { resolve(null); return; }
    if (!file.type || !file.type.startsWith('image/')) {
      reject(new Error('El archivo debe ser una imagen.'));
      return;
    }
    const lector = new FileReader();
    lector.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, maxAncho / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      };
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.src = e.target.result;
    };
    lector.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    lector.readAsDataURL(file);
  });
}

/* ---------- SUSCRIPTORES (Voltage Club) ---------- */
function suscribirVoltageClub(email) {
  const lista = _leer(LS_KEYS.suscriptores);
  if (!lista.includes(email)) {
    lista.push(email);
    _guardar(LS_KEYS.suscriptores, lista);
  }
}

/* ---------- USUARIOS (login / registro) ----------
   Nota: esto es un login "de demostración". Como todo corre en
   el navegador (sin servidor), las contraseñas NO quedan
   protegidas de verdad. Sirve para probar el flujo de la tienda,
   no para datos sensibles reales. */
function registrarUsuario(nombre, correo, contrasena, fechaNacimiento, pais) {
  const usuarios = _leer(LS_KEYS.usuarios);
  if (usuarios.some(u => u.correo === correo)) {
    return { ok: false, msg: "Ese correo ya está registrado." };
  }
  usuarios.push({ id: Date.now(), nombre, correo, contrasena, fechaNacimiento, pais });
  _guardar(LS_KEYS.usuarios, usuarios);
  return { ok: true };
}
function iniciarSesion(usuarioInput, contrasena) {
  const usuarios = _leer(LS_KEYS.usuarios);
  const encontrado = usuarios.find(
    u => (u.correo === usuarioInput) && u.contrasena === contrasena
  );
  if (!encontrado) return { ok: false, msg: "Correo o contraseña incorrectos." };
  _guardar(LS_KEYS.sesion, { id: encontrado.id, nombre: encontrado.nombre });
  return { ok: true };
}
function usuarioActual() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.sesion));
  } catch (e) {
    return null;
  }
}
function cerrarSesion() {
  localStorage.removeItem(LS_KEYS.sesion);
}

/* ---------- SESIÓN DE ADMIN (panel del vendedor) ----------
   Usuario/contraseña por defecto: admin / yasdrip2026
   Se puede cambiar la contraseña desde adentro del panel. */
function inicializarAdmin() {
  if (localStorage.getItem(LS_KEYS.admin)) return;
  _guardar(LS_KEYS.admin, { usuario: "admin", clave: "yasdrip2026" });
}
function loginAdmin(usuario, clave) {
  inicializarAdmin();
  const admin = JSON.parse(localStorage.getItem(LS_KEYS.admin));
  if (admin.usuario === String(usuario).trim() && admin.clave === clave) {
    _guardar(LS_KEYS.sesionAdmin, { ok: true, fecha: Date.now() });
    return { ok: true };
  }
  return { ok: false, msg: "Usuario o contraseña incorrectos." };
}
function sesionAdminActiva() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.sesionAdmin))?.ok === true;
  } catch (e) {
    return false;
  }
}
function cerrarSesionAdmin() {
  localStorage.removeItem(LS_KEYS.sesionAdmin);
}
function cambiarClaveAdmin(actual, nueva) {
  inicializarAdmin();
  const admin = JSON.parse(localStorage.getItem(LS_KEYS.admin));
  if (admin.clave !== actual) return { ok: false, msg: "La contraseña actual no es correcta." };
  if (!nueva || nueva.length < 4) return { ok: false, msg: "La nueva contraseña debe tener al menos 4 caracteres." };
  admin.clave = nueva;
  _guardar(LS_KEYS.admin, admin);
  return { ok: true };
}
