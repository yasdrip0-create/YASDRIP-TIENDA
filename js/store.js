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

/* ---------- CARRITO ---------- */
function getCarrito() {
  return _leer(LS_KEYS.carrito);
}
function totalCarritoCount() {
  return getCarrito().length;
}
function agregarAlCarrito(producto, color, talla) {
  const carrito = getCarrito();
  carrito.push({
    id: producto.id,
    nombre: producto.nombre,
    categoria: producto.categoria,
    precio: producto.precio,
    icono: producto.icono,
    color: color || producto.colores[0],
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
function crearPedido(nombreCliente, emailCliente) {
  const carrito = getCarrito();
  if (!carrito.length) return null;
  const pedidos = _leer(LS_KEYS.pedidos);
  const pedido = {
    id: Date.now(),
    nombre_cliente: nombreCliente,
    email_cliente: emailCliente,
    detalle: carrito.map(i => `${i.nombre} (${i.talla})`).join(" | "),
    total: totalCarritoValor(),
    fecha: new Date().toISOString(),
  };
  pedidos.push(pedido);
  _guardar(LS_KEYS.pedidos, pedidos);
  limpiarCarrito();
  return pedido;
}

/* ---------- SOLICITUDES DE SERVICIO (cambios, garantías, quejas) ---------- */
function guardarSolicitud(servicio, nombre, contacto, descripcion) {
  const solicitudes = _leer(LS_KEYS.solicitudes);
  solicitudes.push({
    id: Date.now(),
    servicio,
    nombre,
    contacto,
    descripcion,
    fecha: new Date().toISOString(),
  });
  _guardar(LS_KEYS.solicitudes, solicitudes);
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
