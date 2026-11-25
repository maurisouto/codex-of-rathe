# Read the Runes · handoff de marca

Diseño para PR #20, base de integración comunicada: 6bf797ae4aa4e860e4ac58d572a7728c5baf012a. La aprobación editorial anterior se mantiene para ese head. Revisar visualmente el nuevo head una vez integrado.

| Uso | Asset | Tamaño de partida |
| --- | --- | --- |
| Tile del hub | read-the-runes-horizontal.svg | 224–248 px de ancho, escala proporcional |
| Header | read-the-runes-horizontal.svg | 36–40 px de alto, escala proporcional |
| Favicon o icono pequeño independiente | read-the-runes-compact.svg | 24–32 px cuadrados; a 24 px usar solo el emblema. El header conserva el logo horizontal completo a 32–38 px de alto, incluso en móvil. |
| Hero | read-the-runes-hero.svg | 360–440 px de ancho en desktop, 220–280 px en móvil, max-width 100% |
| Una tinta para fondos oscuros | read-the-runes-mono.svg y read-the-runes-compact-mono.svg | Igual que las versiones correspondientes |

SVG vectoriales con transparencia fuera de la marca. El hero tiene una sombra violeta acotada alrededor del sello y un centro oscuro propio. La hoja PNG usa fondos oscuros solo para comprobar contraste. Tratar los SVG como imágenes decorativas con alt vacío cuando haya un único nombre textual adyacente. En el header, si la imagen es el contenido del enlace, usar alt Read the Runes. Conservar un H1 accesible en el hero y evitar duplicar el lettering visible en hub/hero, manteniendo la jerarquía de encabezados. Usar solo los SVG de Runes para sustituir el emblema temporal. Respetar proporciones y el hover/reduced-motion del tile; evitar filtros de recolor globales. Confirmar foco del enlace, recorte, alineación junto a Chronicle/Tome y lectura a 320, 390, 768 y 1280 px. No cambiar los demás logos, las acciones ni las reglas.

Prueba de tamaño: la hoja de contacto incluye ambas versiones compactas rasterizadas realmente a 24×24, más las versiones de hub, header y hero. El anillo, cuatro marcas de eje y núcleo se distinguen a 24 px. El lettering completo se reserva a los tamaños de la tabla.

Procedencia: geometría, núcleo y glifos dibujados para este encargo. La captura del dueño orientó el uso de anillos y luz violeta; los SVG no incorporan píxeles ni trazos de esa captura ni assets oficiales. Lettering de Cinzel, con glifos convertidos a trazados editables y composición propia. Cinzel proviene de https://github.com/google/fonts/tree/main/ofl/cinzel y usa SIL Open Font License 1.1, incluida como Cinzel-OFL.txt. El paquete contiene los vectores de salida y una hoja de inspección. Sin dependencia de fuentes en producción.
