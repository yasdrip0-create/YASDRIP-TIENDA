/* ============================================================
   ALMACENAMIENTO LOCAL (localStorage)
   Reemplaza $_SESSION['carrito'] y las tablas MySQL: pedidos,
   solicitudes_servicio, suscriptores, usuarios.

   Importante: todo esto vive en el navegador de cada visitante.
   Si el mismo cliente entra desde otro celular o borra el
   historial, no va a ver lo mismo. Es igual de "real" que el
   panel admin.html del proyecto de la barbería.
   ============================================================ */

/* URL de tu Google Apps Script (Parte 5 de la guía). Termina en /exec */
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzTBXm-I37O2XS2OiqqgkmrgEDpoImsR3-2HUWFoK9SOzQbHRXhpNBoR6_vbOmGRkT6/exec";

/** Avisa a Google Apps Script (Sheet + Telegram) de un pedido nuevo o de
    un problema. Nunca bloquea la compra: si falla el envío del aviso
    (ej. no configuraste APPS_SCRIPT_URL, o no hay internet), solo se
    registra en la consola y la tienda sigue funcionando normal. */
function enviarAviso(payload) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === "PEGA_AQUI_TU_URL_DE_APPS_SCRIPT") return;
  fetch(APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  }).catch((e) => console.error("No se pudo enviar el aviso:", e));
}

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

   El catálogo ahora vive en Firestore (colección "productos"), no
   en localStorage. Así, un cambio de precio/stock/foto que hagas
   en admin.html desde cualquier computador o celular se ve igual
   en todos lados, incluida la tienda que ven tus clientes.

   Como todo Firestore es asíncrono, cada página lo carga UNA vez
   al abrir (con await cargarCatalogo()) a una copia en memoria
   (_catalogoCache). De ahí en adelante, getCatalogo() y el resto
   de funciones de este bloque leen/escriben esa copia de forma
   normal (sincrónica) y en segundo plano avisan a Firestore del
   cambio, sin bloquear la interfaz. ============================================================ */
let _catalogoCache = [];

/** Carga el catálogo desde Firestore a la memoria (_catalogoCache).
    Si la colección "productos" está vacía (primera vez que se usa
    la tienda), la siembra con el catálogo de fábrica (PRODUCTS, de
    js/products.js). Cada página HTML debe hacer
    "await cargarCatalogo();" al iniciar, ANTES de llamar a
    productosActivos(), buscarProducto(), obtenerProductosAdmin(),
    etc. — si no, esas funciones van a devolver una lista vacía. */
async function cargarCatalogo() {
  try {
    const snap = await fbDb.collection('productos').get();
    if (snap.empty) {
      const base = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).map(p => ({
        ...p,
        descuento: 0, // % que pone el admin (0 a 90). 0 = sin descuento.
      }));
      const batch = fbDb.batch();
      base.forEach(p => {
        const { id, ...datos } = p;
        batch.set(fbDb.collection('productos').doc(String(id)), datos);
      });
      await batch.commit();
      _catalogoCache = base;
    } else {
      _catalogoCache = snap.docs.map(d => {
        const datos = d.data();
        return { ...datos, id: isNaN(d.id) ? d.id : Number(d.id) };
      });
    }
  } catch (e) {
    console.error('Error cargando el catálogo desde Firestore:', e);
    // Si falla internet, al menos que la tienda muestre el catálogo de fábrica
    _catalogoCache = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).map(p => ({ ...p, descuento: 0 }));
  }
  return _catalogoCache;
}
/** Lectura sincrónica del catálogo ya cargado en memoria (ver
    cargarCatalogo más arriba). */
function getCatalogo() {
  return _catalogoCache;
}
/** Guarda en Firestore, en segundo plano, los datos de UN producto.
    No se espera (no bloquea): la pantalla ya se actualizó con el
    cambio en _catalogoCache antes de llamar a esto. */
function _guardarProductoEnNube(producto) {
  const { id, ...datos } = producto;
  fbDb.collection('productos').doc(String(id)).set(datos, { merge: true })
    .catch(e => console.error('Error guardando el producto en la nube:', e));
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
/* ---------- STOCK POR COLOR ----------
   p.stockColores es un objeto opcional { "#hex": cantidad, ... }.
   Si un producto todavía no tiene ese desglose (productos viejos,
   o el admin no lo configuró), se sigue usando p.stock como una
   sola bolsa compartida entre todos los colores — así nada se
   rompe con el catálogo que ya tenías. p.stock SIEMPRE queda
   sincronizado como la suma de todos los colores cuando sí hay
   desglose, para que el resto del código (que ya leía p.stock)
   siga funcionando sin tocar nada más. */

/** Stock disponible de UN color específico de un producto. */
function stockColor(p, color) {
  if (p && p.stockColores && Object.prototype.hasOwnProperty.call(p.stockColores, color)) {
    return Math.max(0, Number(p.stockColores[color]) || 0);
  }
  return Math.max(0, Number(p && p.stock) || 0);
}
/** true si un color específico ya no tiene unidades */
function colorAgotado(p, color) {
  return stockColor(p, color) <= 0;
}
/** Stock total del producto: si hay desglose por talla se usa ese
    (es el más específico para saber qué se está agotando), si no
    hay pero sí hay desglose por color se usa la suma de colores,
    y si no hay ninguno de los dos se usa el número general. */
function stockTotalProducto(p) {
  if (p && p.stockTallas && Object.keys(p.stockTallas).length) {
    return Object.values(p.stockTallas).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
  }
  if (p && p.stockColores && Object.keys(p.stockColores).length) {
    return Object.values(p.stockColores).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
  }
  return Math.max(0, Number(p && p.stock) || 0);
}
/** true si no queda stock de ese producto (en NINGÚN color/talla) */
function estaAgotado(p) {
  return stockTotalProducto(p) <= 0;
}
/** Guarda desde el panel admin el stock de cada color de un producto.
    "stockColores" es un objeto { "#hex": cantidad, ... } con TODOS
    los colores del producto (no solo el que se editó). */
function actualizarStockColoresAdmin(id, stockColores) {
  const p = _catalogoCache.find(x => x.id == id);
  if (!p) return null;
  const limpio = {};
  Object.keys(stockColores).forEach(c => {
    limpio[c] = Math.max(0, Math.floor(Number(stockColores[c]) || 0));
  });
  p.stockColores = limpio;
  p.stock = stockTotalProducto(p);
  _guardarProductoEnNube(p);
  return p;
}

/* ---------- STOCK POR TALLA ----------
   Mismo mecanismo que el stock por color, pero por talla: así
   sabes exactamente cuántas unidades quedan de cada talla exacta
   (S, M, L, 5L, 12, lo que sea que uses). p.stockTallas es un
   objeto opcional { "talla": cantidad, ... }. Es independiente del
   desglose por color: puedes usar uno, el otro, los dos o ninguno
   (y seguir con el número único p.stock). */

/** Stock disponible de UNA talla específica de un producto. */
function stockTalla(p, talla) {
  if (p && p.stockTallas && Object.prototype.hasOwnProperty.call(p.stockTallas, talla)) {
    return Math.max(0, Number(p.stockTallas[talla]) || 0);
  }
  return Math.max(0, Number(p && p.stock) || 0);
}
/** true si una talla específica ya no tiene unidades */
function tallaAgotada(p, talla) {
  return stockTalla(p, talla) <= 0;
}
/** Guarda desde el panel admin el stock de cada talla de un producto.
    "stockTallas" es un objeto { "talla": cantidad, ... } con TODAS
    las tallas del producto (no solo la que se editó). */
function actualizarStockTallasAdmin(id, stockTallas) {
  const p = _catalogoCache.find(x => x.id == id);
  if (!p) return null;
  const limpio = {};
  Object.keys(stockTallas).forEach(t => {
    limpio[t] = Math.max(0, Math.floor(Number(stockTallas[t]) || 0));
  });
  p.stockTallas = limpio;
  p.stock = stockTotalProducto(p);
  _guardarProductoEnNube(p);
  return p;
}
/** Baja 1 unidad de stock por cada prenda que venga en el carrito
    (se llama al confirmar una compra). Descuenta del color exacto
    que se compró si el producto tiene desglose por color, y
    siempre mantiene p.stock (el total) sincronizado. Actualiza la
    memoria local al toque, y en la nube usa incrementos atómicos
    (increment(-1)) para que dos compras casi simultáneas no se
    pisen entre sí. */
function descontarStockCarrito(carrito) {
  carrito.forEach(item => {
    const p = _catalogoCache.find(x => x.id == item.id);
    if (!p) return;
    const cambiosNube = {};
    let tocoAlgunDesglose = false;
    const usaColores = p.stockColores && Object.prototype.hasOwnProperty.call(p.stockColores, item.color);
    if (usaColores) {
      p.stockColores[item.color] = Math.max(0, Number(p.stockColores[item.color]) - 1);
      cambiosNube[`stockColores.${item.color}`] = firebase.firestore.FieldValue.increment(-1);
      tocoAlgunDesglose = true;
    }
    const usaTallas = p.stockTallas && Object.prototype.hasOwnProperty.call(p.stockTallas, item.talla);
    if (usaTallas) {
      p.stockTallas[item.talla] = Math.max(0, Number(p.stockTallas[item.talla]) - 1);
      cambiosNube[`stockTallas.${item.talla}`] = firebase.firestore.FieldValue.increment(-1);
      tocoAlgunDesglose = true;
    }
    p.stock = tocoAlgunDesglose ? stockTotalProducto(p) : Math.max(0, Number(p.stock) - 1);
    cambiosNube.stock = firebase.firestore.FieldValue.increment(-1);
    fbDb.collection('productos').doc(String(item.id)).update(cambiosNube)
      .catch(e => console.error('Error descontando stock en la nube:', e));
  });
}

/* ---------- ADMIN: gestión de inventario, precio y descuentos ---------- */
/** Todos los productos (activos e inactivos), para el panel admin */
function obtenerProductosAdmin() {
  return getCatalogo();
}
/** Edita nombre/precio/descuento/stock/activo de un producto existente.
    "cambios" es un objeto con solo los campos que se van a actualizar. */
function actualizarProductoAdmin(id, cambios) {
  const p = _catalogoCache.find(x => x.id == id);
  if (!p) return null;
  if (cambios.nombre !== undefined) p.nombre = String(cambios.nombre).trim() || p.nombre;
  if (cambios.categoria !== undefined) p.categoria = String(cambios.categoria).trim() || p.categoria;
  if (cambios.precio !== undefined) p.precio = Math.max(0, Number(cambios.precio) || 0);
  if (cambios.descuento !== undefined) p.descuento = Math.min(90, Math.max(0, Number(cambios.descuento) || 0));
  if (cambios.stock !== undefined) p.stock = Math.max(0, Math.floor(Number(cambios.stock) || 0));
  if (cambios.activo !== undefined) p.activo = !!cambios.activo;
  if (cambios.preciosTalla !== undefined) p.preciosTalla = cambios.preciosTalla;
  if (cambios.foto !== undefined) p.foto = cambios.foto;
  _guardarProductoEnNube(p);
  return p;
}
/** Guarda (o borra, si dataUrl es null) la foto de UN color específico
    de un producto. Así, si el mismo buso existe en blanco y negro, cada
    color puede tener su propia foto real y la tienda cambia la imagen
    cuando el cliente hace clic en el color. */
function actualizarFotoColorAdmin(id, color, dataUrl) {
  const p = _catalogoCache.find(x => x.id == id);
  if (!p) return null;
  if (!p.fotos) p.fotos = {};
  if (dataUrl) {
    p.fotos[color] = dataUrl;
  } else {
    delete p.fotos[color];
  }
  _guardarProductoEnNube(p);
  return p;
}
/** Guarda (o borra, si dataUrl es null) la foto DE ESPALDAS de UN
    color específico de un producto. Se usa igual que
    actualizarFotoColorAdmin, pero para la foto trasera: en la
    tienda, el cliente puede pasar el mouse (o tocar en celular)
    sobre la tarjeta del producto para ver esta foto y las tallas
    disponibles, tal como se ve la prenda de espaldas. */
function actualizarFotoTraseraColorAdmin(id, color, dataUrl) {
  const p = _catalogoCache.find(x => x.id == id);
  if (!p) return null;
  if (!p.fotosTrasera) p.fotosTrasera = {};
  if (dataUrl) {
    p.fotosTrasera[color] = dataUrl;
  } else {
    delete p.fotosTrasera[color];
  }
  _guardarProductoEnNube(p);
  return p;
}
/** Agrega un producto nuevo al catálogo desde el panel admin.
    nuevo.foto (opcional) ya debe venir como dataURL comprimido. */
function agregarProductoAdmin(nuevo) {
  const colores = nuevo.colores && nuevo.colores.length ? nuevo.colores : ['#151512'];
  const tallas = nuevo.tallas && nuevo.tallas.length ? nuevo.tallas : ['S', 'M', 'L', 'XL'];
  // Si mandaron stock por color y/o por talla, eso manda; si no,
  // se reparte el "stock inicial" único como una bolsa compartida.
  const stockColores = nuevo.stockColores && Object.keys(nuevo.stockColores).length
    ? nuevo.stockColores
    : {};
  const stockTallas = nuevo.stockTallas && Object.keys(nuevo.stockTallas).length
    ? nuevo.stockTallas
    : {};
  let stockTotal;
  if (Object.keys(stockTallas).length) {
    stockTotal = Object.values(stockTallas).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
  } else if (Object.keys(stockColores).length) {
    stockTotal = Object.values(stockColores).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
  } else {
    stockTotal = Math.max(0, Math.floor(Number(nuevo.stock) || 0));
  }
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
    fotosTrasera: nuevo.fotosTrasera || {}, // foto de espaldas por color
    preciosTalla: nuevo.preciosTalla || {}, // precio específico por talla, ej: {"L": 89900}
    colores: colores,
    tallas: tallas,
    badge: null,
    stock: stockTotal,
    stockColores: stockColores, // {"#hex": cantidad, ...} — vacío = bolsa compartida (stock arriba)
    stockTallas: stockTallas,   // {"talla": cantidad, ...} — vacío = bolsa compartida (stock arriba)
    activo: true,
  };
  _catalogoCache.push(producto);
  _guardarProductoEnNube(producto);
  return producto;
}
/** Elimina un producto del catálogo por completo */
function eliminarProductoAdmin(id) {
  _catalogoCache = _catalogoCache.filter(p => p.id != id);
  fbDb.collection('productos').doc(String(id)).delete()
    .catch(e => console.error('Error eliminando el producto en la nube:', e));
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

/* ---------- PEDIDOS ----------
   Los pedidos ya NO se guardan en localStorage: quedan en
   Firestore (colección "pedidos"), así que tú los ves todos desde
   cualquier computador entrando al panel admin, sin importar
   desde qué celular compró cada cliente. */
async function crearPedido(datosCliente) {
  const carrito = getCarrito();
  if (!carrito.length) return null;
  const envio = datosCliente.envio || {};
  const subtotal = totalCarritoValor();
  const costoEnvioPedido = Number(envio.costo || 0);
  const usuario = usuarioActual();
  const pedido = {
    usuario_uid: usuario ? usuario.id : null,
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
    items: carrito.map(i => ({ nombre: i.nombre, talla: i.talla, color: i.color, precio: i.precio })),
    detalle: carrito.map(i => `${i.nombre} (${i.talla})`).join(" | "),
    subtotal: subtotal,
    total: subtotal + costoEnvioPedido,
    fecha: new Date().toISOString(),
  };
  try {
    const ref = await fbDb.collection('pedidos').add(pedido);
    descontarStockCarrito(carrito);
    limpiarCarrito();
    enviarAviso({ tipo: 'pedido_nuevo', pedido: { ...pedido } });
    return { ...pedido, id: ref.id };
  } catch (e) {
    console.error('Error guardando el pedido en Firestore:', e);
    enviarAviso({ tipo: 'problema', titulo: 'No se pudo guardar un pedido', detalle: String(e && e.message || e) });
    return null;
  }
}

/** Trae todos los pedidos guardados en la nube, del más nuevo al
    más viejo. Lo usa el panel admin. */
async function obtenerPedidosAdmin() {
  try {
    const snap = await fbDb.collection('pedidos').orderBy('fecha', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('Error leyendo pedidos:', e);
    return [];
  }
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
   Ahora las cuentas viven en Firebase Authentication (la nube de
   Google), no en este navegador. Cualquier cliente puede entrar
   desde cualquier celular/computador con el mismo correo y
   contraseña, y ni siquiera nosotros vemos su contraseña real
   (Firebase la protege). Los datos extra (nombre, país, fecha de
   nacimiento) se guardan en Firestore, en la colección "usuarios".

   Todas estas funciones ahora son asíncronas (devuelven una
   Promise), porque hablan con internet. Hay que usar
   await/then() al llamarlas. */

/* Cache en memoria (no en localStorage) para que renderHeader()
   pueda seguir leyendo el usuario de forma sincrónica mientras
   llega la respuesta real de Firebase. */
let _usuarioActualCache = null;
const _listenersSesion = [];

function onCambioSesion(callback) {
  _listenersSesion.push(callback);
}

if (typeof fbAuth !== 'undefined') {
  fbAuth.onAuthStateChanged(async (user) => {
    if (!user) {
      _usuarioActualCache = null;
    } else {
      try {
        const doc = await fbDb.collection('usuarios').doc(user.uid).get();
        const datos = doc.exists ? doc.data() : {};
        _usuarioActualCache = {
          id: user.uid,
          nombre: datos.nombre || user.displayName || user.email,
          correo: user.email,
          fechaNacimiento: datos.fechaNacimiento || null,
          pais: datos.pais || null,
        };
      } catch (e) {
        _usuarioActualCache = { id: user.uid, nombre: user.email, correo: user.email };
      }
    }
    _listenersSesion.forEach(cb => cb(_usuarioActualCache));
  });
}

async function registrarUsuario(nombre, correo, contrasena, fechaNacimiento, pais, telefono = null) {
  try {
    const cred = await fbAuth.createUserWithEmailAndPassword(correo, contrasena);
    await cred.user.updateProfile({ displayName: nombre });
    await fbDb.collection('usuarios').doc(cred.user.uid).set({
      nombre, correo, fechaNacimiento, pais,
      telefono: telefono || null,
      creado: new Date().toISOString(),
    });
    // Guarda también teléfono -> correo en una colección aparte
    // ("telefonos"), para que "¿Olvidaste tu contraseña?" pueda
    // encontrar la cuenta cuando el cliente solo recuerda su
    // número (ver más abajo, sección RECUPERAR CONTRASEÑA).
    if (telefono) {
      try {
        await fbDb.collection('telefonos').doc(telefono).set({ correo });
      } catch (e) {
        console.error('No se pudo guardar el teléfono para recuperación:', e);
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: traducirErrorFirebase(e) };
  }
}

async function iniciarSesion(usuarioInput, contrasena) {
  try {
    await fbAuth.signInWithEmailAndPassword(usuarioInput, contrasena);
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: traducirErrorFirebase(e) };
  }
}

/** Lectura sincrónica (usa la última copia que llegó de Firebase).
    Justo al abrir una página puede devolver null un instante
    mientras Firebase confirma la sesión; por eso layout.js también
    escucha onCambioSesion() para repintar el header apenas llega. */
function usuarioActual() {
  return _usuarioActualCache;
}

function cerrarSesion() {
  return fbAuth.signOut();
}

/* ---------- RECUPERAR CONTRASEÑA ----------
   Dos caminos, según con qué se registró el cliente:

   1) CORREO: se manda directo el correo de restablecimiento de
      Firebase (enviarRecuperacionCorreo). Es un solo paso.

   2) TELÉFONO: primero hay que probar que esa persona SÍ es dueña
      del número (se manda un SMS con código, igual que en el
      registro). Una vez confirmado el código, se busca en la
      colección "telefonos" a qué correo pertenece ese número, y
      se le manda el enlace de restablecimiento a ESE correo (no
      se le entrega la contraseña ni se inicia sesión directo).
      Esto solo encuentra cuentas registradas con teléfono DESPUÉS
      de que se agregó esta función, porque la colección
      "telefonos" se llena en registrarUsuario(). */

/** Manda el correo de restablecimiento de Firebase a un correo
    que el cliente escribe a mano. Por seguridad, Firebase nunca
    revela si el correo existe o no: la llamada "funciona" igual;
    si existe, le llega el enlace. */
async function enviarRecuperacionCorreo(correo) {
  try {
    await fbAuth.sendPasswordResetEmail(correo);
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: traducirErrorFirebase(e) };
  }
}

/** Paso 1 de recuperación por teléfono: manda un SMS con código
    (reutiliza Firebase Phone Auth, igual que el registro).
    recaptchaVerifier lo crea la página (firebase.auth.RecaptchaVerifier).
    Devuelve el confirmationResult para usarlo en el paso 2. */
async function enviarCodigoRecuperacionTelefono(telefono, recaptchaVerifier) {
  try {
    const confirmationResult = await fbAuth.signInWithPhoneNumber(telefono, recaptchaVerifier);
    return { ok: true, confirmationResult };
  } catch (e) {
    console.error('Error enviando SMS de recuperación:', e);
    let msg = 'No se pudo enviar el SMS. Revisa el número e inténtalo de nuevo.';
    if (e && e.code === 'auth/invalid-phone-number') msg = 'Ese número no parece válido.';
    if (e && e.code === 'auth/too-many-requests') msg = 'Demasiados intentos, espera un momento.';
    return { ok: false, msg };
  }
}

/** Paso 2 de recuperación por teléfono: confirma el código SMS,
    busca el correo dueño de ese número, y le manda el enlace de
    restablecimiento a ese correo (nunca lo muestra completo). */
async function confirmarCodigoRecuperacionTelefono(confirmationResult, codigo, telefono) {
  try {
    await confirmationResult.confirm(codigo);
  } catch (e) {
    try { await fbAuth.signOut(); } catch (_) {}
    const msg = e && e.code === 'auth/code-expired'
      ? 'El código expiró, pide uno nuevo.'
      : 'Código incorrecto, inténtalo de nuevo.';
    return { ok: false, msg };
  }
  try {
    const doc = await fbDb.collection('telefonos').doc(telefono).get();
    // El teléfono ya cumplió su función (probar que es suyo); esa
    // sesión temporal por SMS no es la cuenta real del cliente.
    try { await fbAuth.signOut(); } catch (_) {}
    if (!doc.exists || !doc.data().correo) {
      return { ok: false, msg: 'No encontramos ninguna cuenta con ese número. Si te registraste hace tiempo, prueba con la opción "Correo".' };
    }
    const correo = doc.data().correo;
    await fbAuth.sendPasswordResetEmail(correo);
    return { ok: true, correoTapado: taparCorreo(correo) };
  } catch (e) {
    try { await fbAuth.signOut(); } catch (_) {}
    console.error('Error buscando cuenta por teléfono:', e);
    return { ok: false, msg: 'Ocurrió un error buscando tu cuenta. Intenta de nuevo.' };
  }
}

/** Tapa un correo para mostrarlo sin revelarlo completo,
    ej: "juanperez@gmail.com" -> "ju*******@gmail.com" */
function taparCorreo(correo) {
  const partes = String(correo).split('@');
  if (partes.length < 2) return correo;
  const [usuario, dominio] = partes;
  const visible = usuario.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(3, usuario.length - 2))}@${dominio}`;
}

function traducirErrorFirebase(e) {
  const codigo = e && e.code;
  const mapa = {
    'auth/email-already-in-use': 'Ese correo ya está registrado.',
    'auth/invalid-email': 'El correo no es válido.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/user-not-found': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento e intenta de nuevo.',
    'auth/network-request-failed': 'No hay conexión a internet.',
  };
  return mapa[codigo] || 'Ocurrió un error, intenta de nuevo.';
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
