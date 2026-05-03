const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse/lib/pdf-parse.js");
const cors = require("cors");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

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

    const data = await pdfParse(req.file.buffer);
    const texto = data.text;

    if (!texto || texto.trim().length < 10) {
      return res.status(400).json({ error: "No se pudo extraer texto del PDF. El archivo puede estar escaneado como imagen." });
    }

    res.json({
      texto: texto.trim(),
      paginas: data.numpages,
      nombre: req.file.originalname,
    });
  } catch (error) {
    console.error("Error al procesar PDF:", error);
    res.status(500).json({ error: "Error al procesar el PDF. Intentá con otro archivo." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LexAR Server corriendo en puerto ${PORT}`);
});