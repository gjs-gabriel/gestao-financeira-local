const sharp = require("sharp");
const path = require("path");

const dir = path.join("docs", "prints");
const files = [
  ["print-painel-graficos.png", "Painel · Fluxo de caixa"],
  ["print-fluxo-anual.png", "Fluxo · Anual 2026"],
  ["print-patrimonio.png", "Patrimônio"],
  ["print-painel.png", "Painel · Evolução do saldo"],
];

const cellW = 900;
const cellH = 560;
const pad = 24;
const labelH = 40;
const cols = 2;
const rows = 2;
const W = cols * cellW + (cols + 1) * pad;
const H = rows * (cellH + labelH) + (rows + 1) * pad + 56;

async function main() {
  const tiles = [];
  for (let i = 0; i < files.length; i++) {
    const [file, label] = files[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (cellW + pad);
    const y = 56 + pad + row * (cellH + labelH + pad);
    const img = await sharp(path.join(dir, file))
      .resize(cellW, cellH, { fit: "cover", position: "top" })
      .png()
      .toBuffer();
    const labelSvg = Buffer.from(
      `<svg width="${cellW}" height="${labelH}"><text x="0" y="28" font-family="Georgia, serif" font-size="22" fill="#0F766E">${label}</text></svg>`,
    );
    tiles.push({ input: img, left: x, top: y + labelH });
    tiles.push({
      input: await sharp(labelSvg).png().toBuffer(),
      left: x,
      top: y,
    });
  }
  const title = Buffer.from(
    `<svg width="${W}" height="56"><text x="${pad}" y="38" font-family="Georgia, serif" font-size="28" font-weight="600" fill="#134E4A">Gestão Financeira · Marina Costa — gráficos</text></svg>`,
  );
  const out = path.join(dir, "graficos-marina-collage.png");
  await sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: { r: 236, g: 245, b: 240 },
    },
  })
    .composite([
      { input: await sharp(title).png().toBuffer(), left: 0, top: 0 },
      ...tiles,
    ])
    .png()
    .toFile(out);
  console.log("OK", path.resolve(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

