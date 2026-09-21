require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const generateRoute = require("./src/routes/generate");
const publishRoute = require("./src/routes/publish");
const studioRoute = require("./src/routes/studio");
const titleRoute = require("./src/routes/title");
const { startTrendsRefresher } = require("./src/services/trendsCache");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve os vídeos gerados
app.use("/output", express.static(path.join(__dirname, "output")));
// tela web simples pra usar o gerador sem precisar de Postman
app.use("/", express.static(path.join(__dirname, "public")));

app.use("/", generateRoute);
app.use("/", publishRoute);
app.use("/", titleRoute);
app.use("/api/studio", studioRoute);

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => {
  console.log(`Motor de vídeo rodando em http://localhost:${PORT}`);
  if (process.env.DISABLE_TRENDS_REFRESH !== "1") startTrendsRefresher();
});

module.exports = app;