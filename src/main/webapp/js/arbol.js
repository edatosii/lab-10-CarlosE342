(function (global) {
    "use strict";

    // Geometría Ferrari: bloques rectangulares de 0px de radio y amplio espacio negativo
    var ANCHO = 172, ALTO = 72, SEP_X = 28, SEP_Y = 60, MARGEN = 32;

    // Paleta oficial Ferrari
    var TOKENS = {
        rossoCorsa:    "#da291c",
        rossoScuro:    "#9d2211",
        biancoFerrari: "#ffffff",
        carboneNero:   "#000000",
        notteProfonda: "#181818",
        grafite:       "#303030",
        fumo:          "#8f8f8f",
        piombo:        "#666666"
    };

    // Jerarquía monocromática por rol (el color #da291c se reserva exclusivamente para hover/activo)
    var ESTILOS_NODO = {
        sujeto: {
            fondo: TOKENS.notteProfonda,
            borde: TOKENS.biancoFerrari,
            barraSuperior: TOKENS.biancoFerrari,
            bordePill: TOKENS.biancoFerrari,
            textoPill: TOKENS.biancoFerrari
        },
        ascendiente: {
            fondo: TOKENS.notteProfonda,
            borde: TOKENS.piombo,
            barraSuperior: TOKENS.fumo,
            bordePill: TOKENS.fumo,
            textoPill: TOKENS.fumo
        },
        descendiente: {
            fondo: TOKENS.notteProfonda,
            borde: TOKENS.grafite,
            barraSuperior: TOKENS.piombo,
            bordePill: TOKENS.piombo,
            textoPill: TOKENS.fumo
        }
    };

    var FUENTE_FERRARI = "'FerrariSans', 'Inter', 'Helvetica Neue', 'Arial Narrow', sans-serif";

    function tipo(posicion) {
        if (posicion === "1") return "sujeto";
        return posicion.indexOf(".") >= 0 ? "descendiente" : "ascendiente";
    }

    // ---- 1. Construir los dos árboles a partir de las posiciones -------------------------------
    function construir(miembros) {
        var porPosicion = {};
        miembros.forEach(function (m) { porPosicion[m.posicion] = m; });

        function ascendiente(posicion) {
            var n = Number(posicion);
            var hijos = [];
            [String(2 * n), String(2 * n + 1)].forEach(function (p) {
                if (porPosicion[p]) hijos.push(ascendiente(p));
            });
            return { m: porPosicion[posicion], hijos: hijos };
        }

        function descendiente(posicion) {
            var hijos = miembros.filter(function (m) {
                return m.posicion.indexOf(posicion + ".") === 0 && m.posicion.indexOf(".", posicion.length + 1) < 0;
            }).sort(function (a, b) {
                return Number(a.posicion.split(".").pop()) - Number(b.posicion.split(".").pop());
            }).map(function (m) { return descendiente(m.posicion); });
            return { m: porPosicion[posicion], hijos: hijos };
        }

        var sujeto = porPosicion["1"];
        if (!sujeto) return null;
        var asc = ascendiente("1");
        var desc = descendiente("1");
        return { sujeto: sujeto, asc: asc, desc: desc };
    }

    // ---- 2. Calcular posiciones: cada persona queda centrada sobre sus hijos -------------------
    function medir(nodo) {
        var x = 0;
        nodo.hijos.forEach(function (h) {
            medir(h);
            h.desde = x;
            x += h.ancho + SEP_X;
        });
        if (nodo.hijos.length === 0) {
            nodo.ancho = ANCHO;
            nodo.cx = ANCHO / 2;
        } else {
            nodo.ancho = x - SEP_X;
            var primero = nodo.hijos[0], ultimo = nodo.hijos[nodo.hijos.length - 1];
            nodo.cx = ((primero.desde + primero.cx) + (ultimo.desde + ultimo.cx)) / 2;
        }
    }

    function profundidad(nodo) {
        var max = 0;
        nodo.hijos.forEach(function (h) { max = Math.max(max, 1 + profundidad(h)); });
        return max;
    }

    // Coloca cada nodo en (x, y) absolutas; "sentido" es -1 para ascendientes y +1 para descendientes.
    function colocar(nodo, desdeX, y, sentido, cajas, lineas, padre) {
        nodo.x = desdeX + nodo.cx;
        nodo.y = y;
        cajas.push(nodo);
        if (padre) lineas.push({ de: padre, a: nodo, sentido: sentido });
        nodo.hijos.forEach(function (h) {
            colocar(h, desdeX + h.desde, y + sentido * (ALTO + SEP_Y), sentido, cajas, lineas, nodo);
        });
    }

    // ---- 3. Dibujar con geometría Ferrari (0px cards + 9999px category pill) -------------------
    function recortar(ctx, texto, ancho) {
        var mayus = String(texto || "").toUpperCase();
        if (ctx.measureText(mayus).width <= ancho) return mayus;
        while (mayus.length > 1 && ctx.measureText(mayus + "…").width > ancho) {
            mayus = mayus.slice(0, -1);
        }
        return mayus + "…";
    }

    function anios(m) {
        return m.nacimiento + " — " + (m.fallecimiento == null ? "PRESENTE" : m.fallecimiento);
    }

    function etiqueta(posicion) {
        if (posicion === "1") return "SUJETO · 1";
        return (posicion.indexOf(".") >= 0 ? "D'ABOVILLE " : "AHNENTAFEL ") + posicion;
    }

    // Rectángulo puro de 0px de radio para las tarjetas editoriales
    function rectCero(ctx, x, y, w, h) {
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.closePath();
    }

    // Píldora de radio completo (9999px) exclusivamente para la etiqueta de categoría
    function pillCompleta(ctx, x, y, w, h) {
        var r = h / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    global.dibujarArbol = function (canvas, miembros, opciones) {
        opciones = opciones || {};
        var datos = construir(miembros);
        var ctx = canvas.getContext("2d");
        var cajas = [], lineas = [], seleccionada = null, hoverPosicion = null;

        if (!datos) {
            canvas.width = 360;
            canvas.height = 68;
            ctx.fillStyle = TOKENS.carboneNero;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.font = "400 11px " + FUENTE_FERRARI;
            ctx.fillStyle = TOKENS.fumo;
            ctx.fillText("NO HAY MIEMBROS PARA DIBUJAR.", 16, 38);
            return { seleccionar: function () {} };
        }

        medir(datos.asc);
        medir(datos.desc);
        var alturaAsc = profundidad(datos.asc);
        var alturaDesc = profundidad(datos.desc);

        // El sujeto de los dos árboles es la misma persona: se alinean por su centro.
        var centro = Math.max(datos.asc.cx, datos.desc.cx);
        var ySujeto = MARGEN + alturaAsc * (ALTO + SEP_Y);

        colocar(datos.asc, MARGEN + centro - datos.asc.cx, ySujeto, -1, cajas, lineas, null);

        // La raíz de los descendientes es el mismo sujeto: no se dibuja dos veces.
        var descendientes = [];
        colocar(datos.desc, MARGEN + centro - datos.desc.cx, ySujeto, 1, descendientes, lineas, null);
        descendientes.slice(1).forEach(function (c) { cajas.push(c); });

        var ancho = Math.max(
            MARGEN + centro - datos.asc.cx + datos.asc.ancho,
            MARGEN + centro - datos.desc.cx + datos.desc.ancho
        ) + MARGEN;
        var alto = ySujeto + alturaDesc * (ALTO + SEP_Y) + ALTO + MARGEN;

        var escala = global.devicePixelRatio || 1;
        canvas.width = Math.ceil(ancho * escala);
        canvas.height = Math.ceil(alto * escala);
        canvas.style.width = ancho + "px";
        canvas.style.height = alto + "px";
        canvas.style.maxWidth = "none";

        function pintar() {
            ctx.setTransform(escala, 0, 0, escala, 0, 0);

            // Fondo Carbone Nero (#000000)
            ctx.fillStyle = TOKENS.carboneNero;
            ctx.fillRect(0, 0, ancho, alto);

            // 1. Conectores ortogonales capilares (1px #303030, o #da291c si conecta con el nodo activo)
            lineas.forEach(function (l) {
                var arriba = l.sentido === 1 ? l.de : l.a;
                var abajo = l.sentido === 1 ? l.a : l.de;
                var y1 = arriba.y + ALTO;
                var y2 = abajo.y;
                var ym = (y1 + y2) / 2;

                var activa = (seleccionada && (l.de.m.posicion === seleccionada || l.a.m.posicion === seleccionada)) ||
                             (hoverPosicion && (l.de.m.posicion === hoverPosicion || l.a.m.posicion === hoverPosicion));

                ctx.beginPath();
                ctx.lineWidth = activa ? 1.5 : 1;
                ctx.strokeStyle = activa ? TOKENS.rossoCorsa : TOKENS.grafite;
                ctx.moveTo(arriba.x, y1);
                ctx.lineTo(arriba.x, ym);
                ctx.lineTo(abajo.x, ym);
                ctx.lineTo(abajo.x, y2);
                ctx.stroke();
            });

            // 2. Bloques editoriales de miembros (0px corner radius)
            cajas.forEach(function (c) {
                var est = ESTILOS_NODO[tipo(c.m.posicion)];
                var esSeleccionada = c.m.posicion === seleccionada;
                var esHover = c.m.posicion === hoverPosicion && !esSeleccionada;
                var interactiva = esSeleccionada || esHover;

                var x = c.x - ANCHO / 2;
                var y = c.y;

                // Superficie del nodo (#181818 en reposo, #000000 en estado activo/hover)
                rectCero(ctx, x, y, ANCHO, ALTO);
                ctx.fillStyle = interactiva ? TOKENS.carboneNero : est.fondo;
                ctx.fill();

                // Borde capilar de 1px (cambia a Rosso Corsa #da291c únicamente en hover/selección)
                ctx.lineWidth = esSeleccionada ? 1.5 : 1;
                ctx.strokeStyle = interactiva ? TOKENS.rossoCorsa : est.borde;
                ctx.stroke();

                // Línea superior de acento arquitectónico (2px)
                ctx.fillStyle = interactiva ? TOKENS.rossoCorsa : est.barraSuperior;
                ctx.fillRect(x, y, ANCHO, 2);

                ctx.textAlign = "center";
                if ("letterSpacing" in ctx) {
                    ctx.letterSpacing = "0.06em";
                }

                // Nombre en mayúsculas (12px weight 500, Bianco Ferrari o Rosso Corsa si está activo)
                ctx.font = "500 12px " + FUENTE_FERRARI;
                ctx.fillStyle = esSeleccionada ? TOKENS.rossoCorsa : TOKENS.biancoFerrari;
                ctx.fillText(recortar(ctx, c.m.nombre, ANCHO - 20), c.x, y + 23);

                // Fechas en Fumo (#8f8f8f) a 11px
                if ("letterSpacing" in ctx) {
                    ctx.letterSpacing = "0.083em";
                }
                ctx.font = "400 10.5px " + FUENTE_FERRARI;
                ctx.fillStyle = TOKENS.fumo;
                ctx.fillText(anios(c.m), c.x, y + 40);

                // Category Pill (9999px radius, 1px hairline border, 9px uppercase text)
                var txtPill = etiqueta(c.m.posicion);
                ctx.font = "400 9px " + FUENTE_FERRARI;
                var anchoPill = Math.min(ANCHO - 24, ctx.measureText(txtPill).width + 18);
                var altoPill = 16;
                var xPill = c.x - anchoPill / 2;
                var yPill = y + 48;

                pillCompleta(ctx, xPill, yPill, anchoPill, altoPill);
                ctx.lineWidth = 1;
                ctx.strokeStyle = interactiva ? TOKENS.rossoCorsa : est.bordePill;
                ctx.stroke();

                ctx.fillStyle = interactiva ? TOKENS.rossoCorsa : est.textoPill;
                ctx.fillText(txtPill, c.x, yPill + 11);

                if ("letterSpacing" in ctx) {
                    ctx.letterSpacing = "0px";
                }
            });
        }

        function buscarNodoEnCoordenadas(e) {
            var r = canvas.getBoundingClientRect();
            var px = (e.clientX - r.left) * (ancho / r.width);
            var py = (e.clientY - r.top) * (alto / r.height);
            for (var i = 0; i < cajas.length; i++) {
                var c = cajas[i];
                if (px >= c.x - ANCHO / 2 && px <= c.x + ANCHO / 2 && py >= c.y && py <= c.y + ALTO) {
                    return c;
                }
            }
            return null;
        }

        function seleccionar(posicion) {
            var caja = cajas.filter(function (c) { return c.m.posicion === posicion; })[0];
            if (!caja) return;
            seleccionada = posicion;
            pintar();
            if (opciones.alSeleccionar) opciones.alSeleccionar(caja.m);
        }

        canvas.addEventListener("click", function (e) {
            var c = buscarNodoEnCoordenadas(e);
            if (c) {
                seleccionar(c.m.posicion);
            }
        });

        canvas.addEventListener("mousemove", function (e) {
            var c = buscarNodoEnCoordenadas(e);
            var nuevaHover = c ? c.m.posicion : null;
            canvas.style.cursor = c ? "pointer" : "default";
            if (nuevaHover !== hoverPosicion) {
                hoverPosicion = nuevaHover;
                pintar();
            }
        });

        canvas.addEventListener("mouseleave", function () {
            if (hoverPosicion !== null) {
                hoverPosicion = null;
                pintar();
            }
        });

        pintar();
        return { seleccionar: seleccionar };
    };
})(window);