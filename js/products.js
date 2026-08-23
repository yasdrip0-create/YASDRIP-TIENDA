/* ============================================================
   CATÁLOGO DE PRODUCTOS
   Esto reemplaza a la tabla "productos" de la base de datos.
   Para agregar, quitar o editar un producto, edita este arreglo.

   colores: lista de códigos HEX
   tallas : lista de tallas disponibles
   icono  : hoodie | tee | cap | pants | jacket | shorts
   badge  : "nuevo" | "pocas" | "vendido" | null
   foto   : foto general del producto (opcional)
   fotos  : foto específica por color, ej: { "#151512": "img/negra.jpg" }
            se sube desde admin.html, columna "Fotos por color".
            Si el cliente hace clic en un color que tiene foto propia,
            la imagen del producto cambia a esa foto.
   ============================================================ */

const PRODUCTS = [
  { id: 1, nombre: "Buso Volt",        categoria: "Busos",       precio: 189900, precio_anterior: 229900, icono: "hoodie", colores: ["#dfe8da", "#151512", "#e7d9ee"], tallas: ["S","M","L","XL"],    badge: "pocas",  stock: 6,  activo: true },
  { id: 2, nombre: "Buso Static",      categoria: "Busos",       precio: 179900, precio_anterior: null,   icono: "hoodie", colores: ["#151512", "#faf9f5", "#eceae3"], tallas: ["S","M","L","XL"],    badge: "nuevo",  stock: 20, activo: true },
  { id: 3, nombre: "Buso Amp",         categoria: "Busos",       precio: 194900, precio_anterior: null,   icono: "hoodie", colores: ["#e7d9ee", "#151512"],             tallas: ["S","M","L","XL"],    badge: null,     stock: 10, activo: true },
  { id: 4, nombre: "Camiseta Bolt",    categoria: "Camisetas",   precio: 79900,  precio_anterior: null,   icono: "tee",    colores: ["#faf9f5", "#151512", "#f3e0da"], tallas: ["S","M","L","XL"],    badge: "nuevo",  stock: 30, activo: true },
  { id: 5, nombre: "Gorra Static",     categoria: "Gorras",      precio: 69900,  precio_anterior: null,   icono: "cap",    colores: ["#151512", "#e7d9ee"],             tallas: ["Única"],              badge: null,     stock: 25, activo: true },
  { id: 6, nombre: "Cargo Circuit",    categoria: "Pantalones",  precio: 159900, precio_anterior: null,   icono: "pants",  colores: ["#151512", "#eceae3"],             tallas: ["28","30","32","34"], badge: "pocas",  stock: 6,  activo: true },
  { id: 7, nombre: "Chaqueta Voltage", categoria: "Chaquetas",   precio: 249900, precio_anterior: 299900, icono: "jacket", colores: ["#151512", "#dfe8da"],             tallas: ["S","M","L","XL"],    badge: "pocas",  stock: 5,  activo: true },
  { id: 8, nombre: "Shorts Drip",      categoria: "Shorts",      precio: 99900,  precio_anterior: null,   icono: "shorts", colores: ["#151512", "#f5ecd6"],             tallas: ["S","M","L","XL"],    badge: null,     stock: 18, activo: true },
];

/** Devuelve solo los productos activos, leyendo el catálogo editable
    (yasdrip_catalogo en localStorage) que el admin puede modificar
    desde admin.html. Si por algún motivo esa función no existe
    todavía, cae de vuelta al catálogo de fábrica PRODUCTS. */
function productosActivos() {
  const lista = typeof getCatalogo === 'function' ? getCatalogo() : PRODUCTS;
  return lista.filter(p => p.activo);
}

/** Busca un producto por id (los ids vienen como string desde el DOM, por eso == ) */
function buscarProducto(id) {
  const lista = typeof getCatalogo === 'function' ? getCatalogo() : PRODUCTS;
  return lista.find(p => p.id == id) || null;
}

/** Lista de categorías presentes en el catálogo, ordenadas alfabéticamente */
function categoriasDisponibles() {
  const set = new Set(productosActivos().map(p => p.categoria));
  return Array.from(set).sort();
}

/* ============================================================
   ZONAS DE ENVÍO
   Costo de envío según dónde queda el municipio/zona del
   cliente. Para agregar o editar zonas, edita este arreglo.
   ============================================================ */
const ZONAS_ENVIO = [
  { id: "medellin",     nombre: "Medellín (zona urbana)",                    costo: 8000  },
  { id: "metro",        nombre: "Área metropolitana (Bello, Itagüí, Envigado, Sabaneta, La Estrella, Copacabana)", costo: 10000 },
  { id: "oriente",      nombre: "Oriente antioqueño (Rionegro, Marinilla, La Ceja, El Retiro)",  costo: 15000 },
  { id: "otro_antioquia", nombre: "Otro municipio de Antioquia",             costo: 18000 },
  { id: "vereda",       nombre: "Vereda / zona rural",                       costo: 20000 },
  { id: "otra_ciudad",  nombre: "Otra ciudad de Colombia",                   costo: 25000 },
];

/** Devuelve la lista completa de zonas de envío disponibles */
function zonasEnvio() {
  return ZONAS_ENVIO;
}

/** Devuelve el costo de envío de una zona por su id (0 si no existe) */
function costoEnvio(zonaId) {
  const zona = ZONAS_ENVIO.find(z => z.id === zonaId);
  return zona ? zona.costo : 0;
}
