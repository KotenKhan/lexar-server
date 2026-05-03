const express = require("express");
const multer = require("multer");
const cors = require("cors");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Health check
app.get("/", (req, res) => {
  res.json({ status: "LexAR Server corriendo OK" });
});

// Extraer texto de PDF
app.post("/extraer-pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió ningún archivo PDF" });
    }

    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = new Uint8Array(req.file.buffer);
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;

    let textoCompleto = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      // Agrupar items por línea usando posición Y
      const lineasMap = {};
      for (const item of content.items) {
        if (!item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        const x = item.transform[4];
        if (!lineasMap[y]) lineasMap[y] = [];
        lineasMap[y].push({ x, texto: item.str });
      }

      // Ordenar líneas de arriba hacia abajo (Y mayor = más arriba en PDF)
      const ysOrdenados = Object.keys(lineasMap)
        .map(Number)
        .sort((a, b) => b - a);

      for (const y of ysOrdenados) {
        const items = lineasMap[y].sort((a, b) => a.x - b.x);
        const linea = items.map(i => i.texto).join(" ").trim();
        if (linea) textoCompleto += linea + "\n";
      }

      textoCompleto += "\n";
    }

    // Limpiar espacios y líneas vacías múltiples
    textoCompleto = textoCompleto
      .replace(/ {2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!textoCompleto || textoCompleto.length < 10) {
      return res.status(400).json({
        error: "No se pudo extraer texto del PDF. El archivo puede estar escaneado como imagen.",
      });
    }

    res.json({
      texto: textoCompleto,
      paginas: pdf.numPages,
      nombre: req.file.originalname,
      caracteres: textoCompleto.length,
    });

  } catch (error) {
    console.error("Error al procesar PDF:", error);
    res.status(500).json({ error: "Error al procesar el PDF. Intentá con otro archivo." });
  }
});

// Buscar artículo o tema en el texto del PDF (sin IA)
app.post("/buscar-en-pdf", async (req, res) => {
  try {
    const { texto, query } = req.body;
    if (!texto || !query) {
      return res.status(400).json({ error: "Falta texto o query" });
    }

    // Buscar artículo por número
    const matchArticulo = query.match(/art[íi]culo?\s*\.?\s*(\d+)/i) ||
                          query.match(/art\.\s*(\d+)/i) ||
                          query.match(/^(\d+)$/);

    if (matchArticulo) {
      const numArt = matchArticulo[1];
      const regex = new RegExp(
        `(Art[íi]culo?[°º\\.\\-\\s]*${numArt}[°º\\.\\s][\\s\\S]*?)(?=Art[íi]culo?[°º\\.\\-\\s]*\\d|CAPÍTULO|TÍTULO|SECCIÓN|$)`,
        "i"
      );
      const match = texto.match(regex);
      if (match) {
        return res.json({ resultado: match[0].trim().slice(0, 3000), tipo: "articulo" });
      }
      return res.json({ resultado: null, tipo: "articulo", mensaje: `No se encontró el artículo ${numArt} en el texto.` });
    }

    // Buscar por palabras clave
    const palabras = query.toLowerCase().split(" ").filter(p => p.length > 3);
    const lineas = texto.split("\n");
    const relevantes = [];

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i].toLowerCase();
      if (palabras.some(p => linea.includes(p))) {
        // Incluir contexto: 2 líneas antes y 2 después
        const inicio = Math.max(0, i - 2);
        const fin = Math.min(lineas.length - 1, i + 5);
        const fragmento = lineas.slice(inicio, fin).join("\n");
        if (!relevantes.includes(fragmento)) {
          relevantes.push(fragmento);
        }
      }
    }

    if (relevantes.length > 0) {
      return res.json({
        resultado: relevantes.slice(0, 5).join("\n\n---\n\n"),
        tipo: "tema",
      });
    }

    return res.json({ resultado: null, tipo: "tema", mensaje: "No se encontraron coincidencias." });

  } catch (error) {
    console.error("Error al buscar:", error);
    res.status(500).json({ error: "Error al buscar en el PDF." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LexAR Server corriendo en puerto ${PORT}`);
});