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
  favoritos: "yasdrip_favoritos",
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
/** A partir de cuántas unidades totales se considera "poco stock"
    (aviso amarillo, antes de llegar a 0 = agotado del todo). */
const STOCK_BAJO_UMBRAL = 3;

/** Nivel de stock de un producto para pintar el aviso correcto en el
    panel: 'agotado' (0 unidades), 'bajo' (quedan pocas, <= umbral) u
    'ok' (stock normal). */
function nivelStockProducto(p) {
  const total = stockTotalProducto(p);
  if (total <= 0) return 'agotado';
  if (total <= STOCK_BAJO_UMBRAL) return 'bajo';
  return 'ok';
}

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

/* ============================================================
   CONFIGURACIÓN DEL "PRÓXIMO DROP" (cuenta regresiva de index.html)
   Igual que el catálogo, vive en Firestore (colección "config",
   documento "drop") para que la fecha y los productos que elijas
   en el panel se vean iguales para todos los visitantes, desde
   cualquier computador o celular — no solo en tu navegador.
   ============================================================ */
let _dropConfigCache = { fecha: null, titulo: '', productos: [] };

/** Carga la config del drop desde Firestore a memoria. Cada página
    que la necesite debe hacer "await cargarConfigDrop()" al iniciar,
    igual que se hace con cargarCatalogo(). Si todavía no existe el
    documento (primera vez), deja los valores por defecto de arriba. */
async function cargarConfigDrop() {
  try {
    const doc = await fbDb.collection('config').doc('drop').get();
    if (doc.exists) {
      _dropConfigCache = { fecha: null, titulo: '', productos: [], ...doc.data() };
    }
  } catch (e) {
    console.error('Error cargando la configuración del drop:', e);
  }
  return _dropConfigCache;
}
/** Lectura sincrónica de la config ya cargada en memoria. */
function getConfigDrop() {
  return _dropConfigCache;
}
/** Guarda (desde el panel admin) la fecha del próximo drop, el título
    y/o la lista de ids de productos que se muestran cuando el tiempo
    se acaba. "cambios" trae solo los campos que se van a actualizar. */
function guardarConfigDropAdmin(cambios) {
  _dropConfigCache = { ..._dropConfigCache, ...cambios };
  fbDb.collection('config').doc('drop').set(_dropConfigCache, { merge: true })
    .catch(e => console.error('Error guardando la configuración del drop en la nube:', e));
  return _dropConfigCache;
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

/* ---------- FAVORITOS / LISTA DE DESEOS ----------
   Guarda, en localStorage del navegador, los ids de los productos
   que el cliente marcó con el corazón (sin comprarlos todavía). */
function getFavoritos() {
  return _leer(LS_KEYS.favoritos);
}
/** true si el producto (por id) ya está en favoritos */
function esFavorito(id) {
  return getFavoritos().some(f => f == id);
}
/** Agrega o quita un producto de favoritos. Devuelve la lista resultante. */
function toggleFavorito(id) {
  const favs = getFavoritos();
  const idx = favs.findIndex(f => f == id);
  if (idx > -1) favs.splice(idx, 1);
  else favs.push(id);
  _guardar(LS_KEYS.favoritos, favs);
  return favs;
}
function totalFavoritosCount() {
  return getFavoritos().length;
}
/** Productos activos del catálogo que el cliente marcó como favoritos. */
function productosFavoritos() {
  const favs = getFavoritos();
  return productosActivos().filter(p => favs.some(f => f == p.id));
}

/* ---------- ORDEN DEL CATÁLOGO ----------
   "orden" puede ser: 'relevancia' (por defecto, el orden del
   catálogo), 'precio_asc', 'precio_desc' o 'nuevo' (los productos
   agregados más recientemente primero — se asume que un id más
   alto se agregó después). */
function ordenarProductos(lista, orden) {
  const copia = lista.slice();
  switch (orden) {
    case 'precio_asc':
      return copia.sort((a, b) => rangoPrecioTallas(a).min - rangoPrecioTallas(b).min);
    case 'precio_desc':
      return copia.sort((a, b) => rangoPrecioTallas(b).min - rangoPrecioTallas(a).min);
    case 'nuevo':
      return copia.sort((a, b) => Number(b.id) - Number(a.id));
    default:
      return copia;
  }
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
    // código corto y fácil de leer para el asunto/cuerpo del correo de
    // confirmación (el número "Pedido #7" del panel admin necesita ver
    // TODOS los pedidos para calcularse, así que aquí usamos algo que
    // sí se puede armar al instante, con lo que ya tenemos a mano).
    const codigoPedido = ref.id.slice(-6).toUpperCase();
    enviarAviso({ tipo: 'pedido_nuevo', pedido: { ...pedido, id: ref.id, codigo_pedido: codigoPedido } });
    return { ...pedido, id: ref.id, codigo_pedido: codigoPedido };
  } catch (e) {
    console.error('Error guardando el pedido en Firestore:', e);
    enviarAviso({ tipo: 'problema', titulo: 'No se pudo guardar un pedido', detalle: String(e && e.message || e) });
    return null;
  }
}

/** Estados posibles de un pedido, en el orden en que avanzan.
    Un pedido que todavía no tiene campo "estado" guardado (los
    que se crearon antes de que existiera esto) se trata como
    "pendiente". */
const ESTADOS_PEDIDO = {
  pendiente:  { label: 'Pendiente',  emoji: '🕓' },
  confirmado: { label: 'Confirmado', emoji: '✅' },
  enviado:    { label: 'Enviado',    emoji: '🚚' },
  entregado:  { label: 'Entregado',  emoji: '📦' },
  cancelado:  { label: 'Cancelado',  emoji: '✕' },
};
function estadoPedido(p) {
  return (p.estado && ESTADOS_PEDIDO[p.estado]) ? p.estado : 'pendiente';
}

/** El id de Firestore (ej: "aB3xY9k...") sirve para buscar el pedido
    exacto en la base de datos, pero no es nada práctico para hablar
    con un cliente ("tu pedido aB3xY9k9..." no dice nada). Esta
    función arma un mapa id -> número corto ("Pedido #1", "#2"...)
    numerando los pedidos del más viejo al más nuevo, para que el
    número de cada pedido no cambie con el tiempo aunque entren
    pedidos nuevos después. Se calcula sobre TODA la lista de
    pedidos (sin filtrar), para que el número sea siempre el mismo
    sin importar qué filtro/orden esté aplicado en la tabla. */
function mapaNumerosPedido(todosLosPedidos) {
  const ordenadosPorFecha = [...todosLosPedidos].sort((a, b) => {
    const fa = a.fecha ? new Date(a.fecha).getTime() : 0;
    const fb = b.fecha ? new Date(b.fecha).getTime() : 0;
    return fa - fb;
  });
  const mapa = new Map();
  ordenadosPorFecha.forEach((p, i) => mapa.set(p.id, i + 1));
  return mapa;
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

/** Cambia el estado de un pedido (pendiente/confirmado/enviado/
    entregado/cancelado) en Firestore. Lo usa el panel admin desde
    el selector de estado en la tabla de pedidos. Además:
    - guarda quién hizo el cambio y cuándo, en "historial_estados"
      (así queda registro de quién marcó qué, con varios usuarios
      usando el panel).
    - avisa por Telegram (mismo canal que "pedido nuevo"), para
      que el equipo se entere del cambio sin tener que abrir el
      panel a cada rato. */
async function actualizarEstadoPedidoAdmin(id, estado) {
  if (!ESTADOS_PEDIDO[estado]) return { ok: false, msg: 'Estado inválido.' };
  const usuario = usuarioAdminActual() || 'desconocido';
  const entradaHistorial = { estado, usuario, fecha: new Date().toISOString() };
  try {
    await fbDb.collection('pedidos').doc(id).update({
      estado,
      historial_estados: firebase.firestore.FieldValue.arrayUnion(entradaHistorial),
    });
    enviarAviso({ tipo: 'pedido_estado', id, estado, usuario });
    return { ok: true, entradaHistorial };
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }
}

/** Borra un pedido de Firestore por completo. Quien llama a esto ya
    tuvo que confirmar su propia contraseña antes (ver admin.html),
    así que aquí solo se hace el borrado. */
async function eliminarPedidoAdmin(id) {
  try {
    await fbDb.collection('pedidos').doc(id).delete();
    enviarAviso({ tipo: 'pedido_eliminado', id });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
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

/* ============================================================
   SESIÓN DE ADMIN (panel del vendedor) — con USUARIOS EN LA NUBE
   ------------------------------------------------------------
   Ya NO es un solo usuario/contraseña guardado en el navegador.
   Ahora cada persona del equipo tiene su propio usuario, guardado
   en Firestore (colección "admin_usuarios"), así que:

   - Nadie se registra solo: tú (o quien ya tenga acceso al panel)
     creas cada usuario desde la pestaña "Usuarios" del panel.
   - Funciona igual desde cualquier computador o celular, porque
     vive en la nube, no en un navegador en particular.

   CANDADO DE "UNA SESIÓN A LA VEZ" POR USUARIO
   ------------------------------------------------------------
   Cuando alguien entra con un usuario, se guarda un "sesionId" al
   azar en Firestore (colección "admin_sesiones"). Mientras el
   panel sigue abierto, cada ADMIN_LATIDO_MS se manda un "aquí
   sigo" (late) a ese documento. Si otra persona intenta entrar con
   ESE MISMO usuario mientras el candado sigue "vivo" (hubo un
   latido hace menos de ADMIN_SESION_VENCE_MS), se le avisa que la
   cuenta está en uso y no la deja entrar — para que dos personas no
   se pisen los cambios usando la misma cuenta a la vez.

   Si a alguien se le cierra el navegador de golpe (se le apaga el
   computador, por ejemplo) y nunca alcanza a "Cerrar sesión", el
   candado se libera SOLO después de ADMIN_SESION_VENCE_MS sin
   latidos, para que esa cuenta no quede trabada para siempre.

   Esto es aparte y no afecta para nada el inicio de sesión de los
   CLIENTES en login.html (esos usan Firebase Auth, otra cosa). */

const ADMIN_LATIDO_MS = 25000;        // cada cuánto avisa "sigo aquí"
const ADMIN_SESION_VENCE_MS = 70000;  // sin latidos por más de esto = candado libre

/* Código extra que solo debería conocer el desarrollador (o quien
   tú le digas). Se pide, además del usuario y contraseña con los
   que ya se entró al panel, para: crear usuarios nuevos, activar o
   desactivar usuarios, eliminar usuarios, y cambiar la contraseña.
   Así, aunque alguien ya esté adentro del panel viendo inventario y
   pedidos, no puede tocar los usuarios ni las contraseñas sin este
   código aparte.
   OJO: como este es un sitio estático (sin servidor propio), este
   código queda visible para cualquiera que abra el código fuente
   de la página, igual que ya pasa con la contraseña del panel. No
   es una barrera de seguridad real contra alguien que sepa
   programación (es JavaScript que corre en el navegador de quien
   sea, así que cualquiera con las herramientas de desarrollador
   puede llamar a estas funciones directo) — es más bien un candado
   para que un miembro común del equipo no entre a tocar usuarios/
   contraseñas por accidente o sin permiso.

   Antes este código estaba escrito tal cual ("Admin2026**") en este
   archivo público, así que cualquiera que abriera "Ver código
   fuente" en el navegador lo veía a simple vista. Ahora en vez del
   código en texto plano se guarda su "huella" (hash SHA-256): se
   compara la huella de lo que el usuario escribe contra esta huella
   guardada, y de la huella no se puede recuperar el código original.
   Sigue sin ser una protección de nivel bancario (para eso hace
   falta mover esta verificación a un servidor/Cloud Function), pero
   ya nadie puede leer el código mirando el código fuente de la página.

   Para CAMBIAR el código de desarrollador: calcula el SHA-256 del
   código nuevo (por ejemplo, pegándolo en la consola del navegador:
   `crypto.subtle.digest('SHA-256', new TextEncoder().encode('TU_CODIGO_NUEVO')).then(b=>console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))`
   ) y pega el resultado abajo, reemplazando CODIGO_DESARROLLADOR_HASH. */
const CODIGO_DESARROLLADOR_HASH = "95f5e4e4377dd8ede9fee4f9840c9d039a5c5bf953a2db6014c26f11a6070c04";

/** Saca el SHA-256 de un texto y lo devuelve en hexadecimal, para
    comparar códigos/contraseñas sin guardarlos ni compararlos en
    texto plano. */
async function _sha256Hex(texto) {
  const datos = new TextEncoder().encode(String(texto || ""));
  const buffer = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Compara una contraseña ingresada contra la guardada de un usuario
    del panel (campo "claveHash", con el mismo SHA-256 que ya se usa
    arriba para el código de desarrollador). También sabe leer cuentas
    VIEJAS que todavía tengan el campo "clave" en texto plano (de
    antes de este cambio): si coincide, la migra sola a "claveHash" en
    segundo plano y borra el texto plano, sin que nadie tenga que
    tocar Firestore a mano. */
async function _claveUsuarioCoincide(usuarioId, datos, claveIngresada) {
  if (!datos || !claveIngresada) return false;
  if (datos.claveHash) {
    try {
      return (await _sha256Hex(claveIngresada)) === datos.claveHash;
    } catch (e) {
      return false;
    }
  }
  if (datos.clave !== undefined) {
    const coincide = datos.clave === claveIngresada;
    if (coincide) {
      _sha256Hex(claveIngresada).then(hash => {
        fbDb.collection('admin_usuarios').doc(usuarioId).update({
          claveHash: hash,
          clave: firebase.firestore.FieldValue.delete(),
        }).catch(e => console.error('No se pudo migrar la contraseña a hash:', e));
      });
    }
    return coincide;
  }
  return false;
}

async function verificarCodigoDesarrollador(codigo) {
  if (!codigo) return false;
  try {
    return (await _sha256Hex(codigo)) === CODIGO_DESARROLLADOR_HASH;
  } catch (e) {
    return false; // navegador muy viejo sin crypto.subtle, o algo falló: nunca dejar pasar por error
  }
}

/* Contraseña para ENTRAR a la pestaña "Usuarios" (solo para verla).
   Es una contraseña fija (no la de ningún usuario del panel) y
   además solo funciona si quien tiene la sesión abierta ahora mismo
   es el usuario "admin" — a cualquier otro usuario del panel, aunque
   tenga el permiso "usuarios" marcado, este candado no le deja
   pasar. Igual que arriba, se guarda como huella SHA-256, no en
   texto plano. Para cambiarla, calcula el hash del texto nuevo (ver
   instrucciones arriba) y reemplaza CLAVE_ACCESO_USUARIOS_HASH. */
const CLAVE_ACCESO_USUARIOS_HASH = "95f5e4e4377dd8ede9fee4f9840c9d039a5c5bf953a2db6014c26f11a6070c04";

async function verificarAccesoTabUsuarios(clave) {
  if (usuarioAdminActual() !== 'admin' || !clave) return false;
  try {
    return (await _sha256Hex(clave)) === CLAVE_ACCESO_USUARIOS_HASH;
  } catch (e) {
    return false;
  }
}

/* ---------- PERMISOS de cada usuario del panel ----------
   Cada usuario (aparte de usuario/contraseña) guarda un objeto
   "permisos" en Firestore que dice qué pestañas/acciones puede
   tocar dentro del panel:
     inventario      -> ver y editar la pestaña Inventario
     pedidos         -> ver la pestaña Pedidos
     eliminarPedidos -> además de verlos, puede borrar pedidos
                        (pide también su propia contraseña al hacerlo)
     drop            -> ver y editar la pestaña Drop
     usuarios        -> ver la pestaña Usuarios (crear/gestionar
                        a otras personas del panel)
   Quien crea o edita a otro usuario elige estas casillas a mano;
   nadie se las da a sí mismo. */
const PERMISOS_DISPONIBLES = ['inventario', 'pedidos', 'eliminarPedidos', 'drop', 'usuarios'];

function permisosTodosActivos() {
  const p = {};
  PERMISOS_DISPONIBLES.forEach(k => { p[k] = true; });
  return p;
}

function permisosNingunoActivo() {
  const p = {};
  PERMISOS_DISPONIBLES.forEach(k => { p[k] = false; });
  return p;
}

/** Convierte lo que hay guardado en Firestore para un usuario en un
    objeto de permisos completo. Si el usuario es de antes de que
    existiera este sistema (no tiene el campo "permisos" guardado),
    se le da acceso total, para que nadie se quede afuera del panel
    de un día para otro por una actualización. */
function normalizarPermisos(datosUsuario) {
  if (!datosUsuario || !datosUsuario.permisos) return permisosTodosActivos();
  const p = datosUsuario.permisos;
  const out = {};
  PERMISOS_DISPONIBLES.forEach(k => { out[k] = !!p[k]; });
  return out;
}

let _adminHeartbeatTimer = null;

function _generarSesionId() {
  return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Crea el usuario "admin" (contraseña por defecto yasdrip2026) la
    primera vez que se usa el panel, SOLO si todavía no hay ningún
    usuario guardado en Firestore. Así el panel funciona apenas lo
    subes, sin que tengas que crear nada a mano antes. Cámbiale la
    contraseña (o crea tu propio usuario y borra este) desde la
    pestaña "Usuarios" apenas entres la primera vez. */
async function inicializarAdminPorDefecto() {
  try {
    const snap = await fbDb.collection('admin_usuarios').limit(1).get();
    if (!snap.empty) return;
    await fbDb.collection('admin_usuarios').doc('admin').set({
      claveHash: await _sha256Hex('yasdrip2026'),
      activo: true,
      creado: new Date().toISOString(),
      permisos: permisosTodosActivos(),
    });
  } catch (e) {
    console.error('No se pudo crear el usuario admin por defecto:', e);
  }
}

/** Intenta iniciar sesión en el panel. Revisa usuario/contraseña en
    Firestore y, si están bien, revisa que esa cuenta no esté siendo
    usada ya en otro navegador antes de dejar pasar. */
async function loginAdmin(usuarioInput, clave) {
  const usuario = String(usuarioInput || '').trim().toLowerCase();
  if (!usuario || !clave) return { ok: false, msg: 'Escribe usuario y contraseña.' };

  await inicializarAdminPorDefecto();

  let doc;
  try {
    doc = await fbDb.collection('admin_usuarios').doc(usuario).get();
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }
  if (!doc.exists) return { ok: false, msg: 'Usuario o contraseña incorrectos.' };
  const datos = doc.data();
  if (!(await _claveUsuarioCoincide(usuario, datos, clave))) return { ok: false, msg: 'Usuario o contraseña incorrectos.' };
  if (datos.activo === false) return { ok: false, msg: 'Este usuario fue desactivado. Habla con quien administra la tienda.' };

  // ¿ya hay una sesión viva con este usuario en otro lado?
  try {
    const sesionDoc = await fbDb.collection('admin_sesiones').doc(usuario).get();
    if (sesionDoc.exists) {
      const s = sesionDoc.data();
      const vive = s.ultimoLatido && (Date.now() - s.ultimoLatido) < ADMIN_SESION_VENCE_MS;
      if (vive) {
        return { ok: false, msg: 'Esta cuenta ya está siendo usada ahora mismo en otro dispositivo o pestaña. Pide que te creen tu propio usuario, o espera a que la otra persona cierre sesión.' };
      }
    }
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }

  const sesionId = _generarSesionId();
  try {
    await fbDb.collection('admin_sesiones').doc(usuario).set({
      sesionId,
      ultimoLatido: Date.now(),
      dispositivo: (navigator.userAgent || '').slice(0, 120),
      desde: new Date().toISOString(),
    });
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }

  _guardar(LS_KEYS.sesionAdmin, { usuario, sesionId, fecha: Date.now() });
  _iniciarLatidoAdmin(usuario, sesionId);
  return { ok: true };
}

/** Chequeo rápido y local (para que la pantalla no parpadee
    mientras se confirma con Firestore). La confirmación real de que
    la sesión sigue siendo válida pasa en verificarSesionAdmin(). */
function sesionAdminActiva() {
  try {
    return !!JSON.parse(localStorage.getItem(LS_KEYS.sesionAdmin))?.sesionId;
  } catch (e) {
    return false;
  }
}

function usuarioAdminActual() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.sesionAdmin))?.usuario || null;
  } catch (e) {
    return null;
  }
}

/** Confirma contra Firestore que el "sesionId" guardado en este
    navegador sigue siendo el dueño del candado (que nadie más lo
    tomó) y reactiva el latido. Se usa al abrir admin.html. Si la
    sesión ya no es válida, la borra localmente y devuelve false. */
async function verificarSesionAdmin() {
  let local;
  try { local = JSON.parse(localStorage.getItem(LS_KEYS.sesionAdmin) || 'null'); } catch (e) { local = null; }
  if (!local || !local.sesionId) return false;
  try {
    const sesionDoc = await fbDb.collection('admin_sesiones').doc(local.usuario).get();
    if (!sesionDoc.exists || sesionDoc.data().sesionId !== local.sesionId) {
      localStorage.removeItem(LS_KEYS.sesionAdmin);
      return false;
    }
  } catch (e) {
    // sin internet en este momento: deja pasar con lo que ya había
    // guardado localmente, para no botar a alguien solo por un
    // corte de wifi pasajero.
  }
  _iniciarLatidoAdmin(local.usuario, local.sesionId);
  return true;
}

function _iniciarLatidoAdmin(usuario, sesionId) {
  _detenerLatidoAdmin();
  _adminHeartbeatTimer = setInterval(async () => {
    try {
      await fbDb.collection('admin_sesiones').doc(usuario).set(
        { sesionId, ultimoLatido: Date.now() }, { merge: true }
      );
    } catch (e) { /* sin internet: se intenta de nuevo en el próximo latido */ }
  }, ADMIN_LATIDO_MS);
}
function _detenerLatidoAdmin() {
  if (_adminHeartbeatTimer) clearInterval(_adminHeartbeatTimer);
  _adminHeartbeatTimer = null;
}

/** Cierra sesión y libera el candado, para que ese usuario pueda
    volver a entrar (desde este navegador o desde otro). */
async function cerrarSesionAdmin() {
  let local;
  try { local = JSON.parse(localStorage.getItem(LS_KEYS.sesionAdmin) || 'null'); } catch (e) { local = null; }
  _detenerLatidoAdmin();
  localStorage.removeItem(LS_KEYS.sesionAdmin);
  if (local && local.usuario) {
    try {
      const sesionDoc = await fbDb.collection('admin_sesiones').doc(local.usuario).get();
      if (sesionDoc.exists && sesionDoc.data().sesionId === local.sesionId) {
        await fbDb.collection('admin_sesiones').doc(local.usuario).delete();
      }
    } catch (e) { /* no pasa nada si falla: el candado igual se libera solo al vencerse */ }
  }
}

/** Cambia la contraseña del usuario que tiene la sesión abierta ahora mismo. */
async function cambiarClaveAdmin(actual, nueva) {
  const usuario = usuarioAdminActual();
  if (!usuario) return { ok: false, msg: 'Tu sesión ya no es válida, vuelve a entrar.' };
  if (!nueva || nueva.length < 4) return { ok: false, msg: 'La nueva contraseña debe tener al menos 4 caracteres.' };
  try {
    const doc = await fbDb.collection('admin_usuarios').doc(usuario).get();
    if (!doc.exists || !(await _claveUsuarioCoincide(usuario, doc.data(), actual))) {
      return { ok: false, msg: 'La contraseña actual no es correcta.' };
    }
    await fbDb.collection('admin_usuarios').doc(usuario).update({
      claveHash: await _sha256Hex(nueva),
      clave: firebase.firestore.FieldValue.delete(),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }
}

/** Trae los permisos del usuario que tiene la sesión abierta ahora
    mismo, para saber qué pestañas mostrarle y qué botones dejarle
    usar. Si no hay internet en ese instante, se le da acceso total
    (no se le puede pedir a Firestore, así que mejor no dejarlo
    varado sin poder ver nada). */
async function obtenerPermisosUsuarioActual() {
  const usuario = usuarioAdminActual();
  if (!usuario) return permisosTodosActivos();
  try {
    const doc = await fbDb.collection('admin_usuarios').doc(usuario).get();
    return normalizarPermisos(doc.exists ? doc.data() : null);
  } catch (e) {
    return permisosTodosActivos();
  }
}

/** Confirma que "clave" es la contraseña ACTUAL del usuario que
    tiene la sesión abierta ahora mismo (no el código de
    desarrollador). Se usa para acciones sensibles y puntuales,
    como borrar un pedido, sin tener que abrir el modal completo
    de cambiar contraseña. */
async function verificarClaveAdminActual(clave) {
  const usuario = usuarioAdminActual();
  if (!usuario) return false;
  try {
    const doc = await fbDb.collection('admin_usuarios').doc(usuario).get();
    if (!doc.exists) return false;
    return await _claveUsuarioCoincide(usuario, doc.data(), clave);
  } catch (e) {
    return false;
  }
}

/* ---------- GESTIÓN DE USUARIOS DEL PANEL (pestaña "Usuarios") ----------
   Cada usuario nuevo lo crea alguien que YA tiene acceso al panel
   (por eso no hace falta un "superadmin" aparte: para llegar a
   crear usuarios primero hay que haber entrado con uno válido).
   Se puede desactivar a alguien (sin borrar nada, por si vuelve) o
   eliminarlo del todo. */
async function obtenerUsuariosAdminPanel() {
  try {
    const [usuariosSnap, sesionesSnap] = await Promise.all([
      fbDb.collection('admin_usuarios').orderBy('creado').get(),
      fbDb.collection('admin_sesiones').get(),
    ]);
    const sesiones = {};
    sesionesSnap.docs.forEach(d => { sesiones[d.id] = d.data(); });
    return usuariosSnap.docs.map(d => {
      const s = sesiones[d.id];
      const conectado = !!(s && s.ultimoLatido && (Date.now() - s.ultimoLatido) < ADMIN_SESION_VENCE_MS);
      return { usuario: d.id, ...d.data(), conectado };
    });
  } catch (e) {
    console.error('Error leyendo usuarios del panel:', e);
    return [];
  }
}

async function crearUsuarioAdminPanel(usuarioInput, clave, permisos) {
  const usuario = String(usuarioInput || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!/^[a-z0-9._-]{3,24}$/.test(usuario)) {
    return { ok: false, msg: 'El usuario debe tener entre 3 y 24 letras/números (sin espacios ni tildes).' };
  }
  if (!clave || clave.length < 4) return { ok: false, msg: 'La contraseña debe tener al menos 4 caracteres.' };
  try {
    const existe = await fbDb.collection('admin_usuarios').doc(usuario).get();
    if (existe.exists) return { ok: false, msg: 'Ese usuario ya existe.' };
    await fbDb.collection('admin_usuarios').doc(usuario).set({
      claveHash: await _sha256Hex(clave), activo: true, creado: new Date().toISOString(),
      permisos: permisos || permisosNingunoActivo(),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }
}

/** Cambia las casillas de qué puede hacer un usuario en el panel. */
async function actualizarPermisosUsuarioAdminPanel(usuario, permisos) {
  try {
    await fbDb.collection('admin_usuarios').doc(usuario).update({ permisos });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }
}

async function cambiarEstadoUsuarioAdminPanel(usuario, activo) {
  try {
    await fbDb.collection('admin_usuarios').doc(usuario).update({ activo });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }
}

async function eliminarUsuarioAdminPanel(usuario) {
  try {
    await fbDb.collection('admin_usuarios').doc(usuario).delete();
    await fbDb.collection('admin_sesiones').doc(usuario).delete().catch(() => {});
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }
}

/* ============================================================
   MOSTRAR/OCULTAR CONTRASEÑA (el "ojito")
   ------------------------------------------------------------
   Se aplica solo con CSS/JS a CUALQUIER <input type="password">
   de cualquier página (login, registro, panel admin), así que no
   hay que tocar cada formulario a mano.
   ============================================================ */
function _activarOjitos() {
  document.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.dataset.ojitoListo) return;
    input.dataset.ojitoListo = '1';
    const wrap = document.createElement('span');
    wrap.className = 'campo-clave';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pass-toggle';
    btn.tabIndex = -1;
    btn.setAttribute('aria-label', 'Mostrar contraseña');
    btn.textContent = '👁️';
    wrap.appendChild(btn);
    btn.addEventListener('click', () => {
      const mostrar = input.type === 'password';
      input.type = mostrar ? 'text' : 'password';
      btn.textContent = mostrar ? '🙈' : '👁️';
      btn.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
      input.focus();
    });
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _activarOjitos);
} else {
  _activarOjitos();
}
