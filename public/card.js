/* Spider League share card — renders a 1080x1350 PNG for the group chat. */

const CARD = {
  W: 1080,
  H: 1350,
  PHOTO_H: 660,
  bg: "#0b0d12",
  panel: "#141823",
  line: "#2a3145",
  text: "#eef1f8",
  dim: "#98a1b8",
  venom: "#8ef53f",
  beauty: "#ff5c8a",
  power: "#ffb84d",
  display: "900 %spx 'Arial Black', Arial, sans-serif",
  body: "%spx -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
};

async function drawShareCard(canvas, data) {
  const ctx = canvas.getContext("2d");
  const { W, H, PHOTO_H } = CARD;

  // backdrop
  ctx.fillStyle = CARD.bg;
  ctx.fillRect(0, 0, W, H);

  // photo, cover-cropped
  const img = await loadImage(data.photo);
  drawCover(ctx, img, 0, 0, W, PHOTO_H);

  // fade photo into panel
  const fade = ctx.createLinearGradient(0, PHOTO_H - 160, 0, PHOTO_H);
  fade.addColorStop(0, "rgba(11,13,18,0)");
  fade.addColorStop(1, CARD.bg);
  ctx.fillStyle = fade;
  ctx.fillRect(0, PHOTO_H - 160, W, 160);

  // league banner across the top
  ctx.fillStyle = "rgba(11,13,18,0.72)";
  ctx.fillRect(0, 0, W, 84);
  ctx.fillStyle = CARD.venom;
  ctx.font = display(34);
  ctx.textBaseline = "middle";
  ctx.fillText("🕷 SPIDER LEAGUE", 36, 44);
  ctx.fillStyle = CARD.dim;
  ctx.font = body(24);
  ctx.textAlign = "right";
  ctx.fillText(data.isSpider ? "OFFICIAL SCOUTING REPORT" : "SUBMISSION REJECTED", W - 36, 44);
  ctx.textAlign = "left";

  // grade badge
  const bx = W - 110, by = PHOTO_H - 30;
  ctx.beginPath();
  ctx.arc(bx, by, 74, 0, Math.PI * 2);
  ctx.fillStyle = CARD.bg;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bx, by, 64, 0, Math.PI * 2);
  ctx.fillStyle = data.isSpider ? CARD.venom : "#ff6b6b";
  ctx.shadowColor = data.isSpider ? "rgba(142,245,63,0.7)" : "rgba(255,107,107,0.7)";
  ctx.shadowBlur = 30;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#0c1503";
  ctx.font = display(56);
  ctx.textAlign = "center";
  ctx.fillText(data.isSpider ? data.grade : "✗", bx, by + 4);
  ctx.textAlign = "left";

  // nickname + species
  let y = PHOTO_H + 74;
  ctx.fillStyle = CARD.text;
  ctx.font = display(fitSize(ctx, `“${data.nickname}”`, W - 72, 58, 34, display));
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`“${data.nickname}”`, 36, y);

  y += 44;
  ctx.fillStyle = CARD.dim;
  ctx.font = body(30);
  ctx.fillText(`${data.commonName}  ·  ${data.scientificName}`, 36, y);

  // stat bars
  y += 56;
  y = statBar(ctx, y, "BEAUTY", data.beauty, CARD.beauty);
  y = statBar(ctx, y, "POWER", data.power, CARD.power);

  // scouting report
  y += 26;
  ctx.fillStyle = CARD.venom;
  ctx.fillRect(36, y - 8, 6, 0.1); // anchor; height set after wrapping
  ctx.font = body(30);
  ctx.fillStyle = CARD.text;
  const reportLines = wrap(ctx, `“${data.report}”`, W - 130);
  const reportTop = y - 8;
  for (const line of reportLines.slice(0, 6)) {
    ctx.fillText(line, 74, y + 22);
    y += 44;
  }
  ctx.fillStyle = CARD.venom;
  ctx.fillRect(36, reportTop, 6, y - reportTop + 6);

  // footer
  ctx.fillStyle = CARD.line;
  ctx.fillRect(36, H - 96, W - 72, 2);
  ctx.fillStyle = CARD.dim;
  ctx.font = body(24);
  const credit = [
    data.submitter ? `Scouted by ${data.submitter}` : null,
    data.teamName ? `Signed to ${data.teamName}` : null,
  ].filter(Boolean).join("  ·  ");
  ctx.fillText(credit || "Free agent — unsigned", 36, H - 48);
  ctx.textAlign = "right";
  ctx.fillStyle = CARD.venom;
  ctx.font = display(24);
  ctx.fillText("SPIDERLEAGUE", W - 36, H - 48);
  ctx.textAlign = "left";

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function statBar(ctx, y, label, value, color) {
  const { W } = CARD;
  const barX = 36, barW = W - 72, barH = 26;

  ctx.font = display(28);
  ctx.fillStyle = CARD.dim;
  ctx.fillText(label, barX, y);
  ctx.textAlign = "right";
  ctx.fillStyle = color;
  ctx.font = display(40);
  ctx.fillText(String(value), barX + barW, y + 2);
  ctx.textAlign = "left";

  y += 18;
  roundRect(ctx, barX, y, barW, barH, 13);
  ctx.fillStyle = CARD.panel;
  ctx.fill();
  roundRect(ctx, barX, y, Math.max(barH, barW * (value / 100)), barH, 13);
  ctx.fillStyle = color;
  ctx.fill();

  return y + barH + 40;
}

function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale, sh = h / scale;
  const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const attempt = line ? line + " " + word : word;
    if (ctx.measureText(attempt).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = attempt;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitSize(ctx, text, maxWidth, startSize, minSize, fontFn) {
  let size = startSize;
  ctx.save();
  while (size > minSize) {
    ctx.font = fontFn(size);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  ctx.restore();
  return size;
}

function display(px) {
  return CARD.display.replace("%s", px);
}
function body(px) {
  return CARD.body.replace("%s", px);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
