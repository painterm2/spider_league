/* Spider League share card — renders a 1080x1350 PNG for the group chat. */

const CARD = {
  W: 1080,
  H: 1350,
  PHOTO_H: 600,
  bg: "#16130d",
  panel: "#272115",
  line: "#3a3323",
  text: "#f3edda",
  dim: "#a99e83",
  moss: "#a4bd4e",
  mossDeep: "#6f8433",
  beauty: "#cf7a5a",
  power: "#d9a83e",
  danger: "#c85a41",
  display: "%spx 'Archivo Black', 'Arial Black', Arial, sans-serif",
  body: "%spx Archivo, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  bodyItalic: "italic %spx Archivo, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
};

async function drawShareCard(canvas, data) {
  await document.fonts.ready; // make sure Archivo is available to the canvas

  const ctx = canvas.getContext("2d");
  const { W, H, PHOTO_H } = CARD;

  // backdrop
  ctx.fillStyle = CARD.bg;
  ctx.fillRect(0, 0, W, H);

  // photo, cover-cropped
  const img = await loadImage(data.photo);
  drawCover(ctx, img, 0, 0, W, PHOTO_H);

  // fade photo into panel
  const fade = ctx.createLinearGradient(0, PHOTO_H - 150, 0, PHOTO_H);
  fade.addColorStop(0, "rgba(22,19,13,0)");
  fade.addColorStop(1, CARD.bg);
  ctx.fillStyle = fade;
  ctx.fillRect(0, PHOTO_H - 150, W, 150);

  // league banner across the top
  ctx.fillStyle = "rgba(22,19,13,0.78)";
  ctx.fillRect(0, 0, W, 80);
  ctx.fillStyle = CARD.moss;
  ctx.font = display(30);
  ctx.textBaseline = "middle";
  ctx.fillText("🕷 SPIDER LEAGUE", 36, 42);
  ctx.fillStyle = CARD.dim;
  ctx.font = body(22);
  ctx.textAlign = "right";
  ctx.fillText(data.isSpider ? "OFFICIAL SCOUTING REPORT" : "SUBMISSION REJECTED", W - 36, 42);
  ctx.textAlign = "left";

  // grade badge
  const bx = W - 108, by = PHOTO_H - 26;
  ctx.beginPath();
  ctx.arc(bx, by, 72, 0, Math.PI * 2);
  ctx.fillStyle = CARD.bg;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bx, by, 62, 0, Math.PI * 2);
  ctx.fillStyle = data.isSpider ? CARD.moss : CARD.danger;
  ctx.shadowColor = data.isSpider ? "rgba(164,189,78,0.6)" : "rgba(200,90,65,0.6)";
  ctx.shadowBlur = 26;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#171507";
  ctx.font = display(52);
  ctx.textAlign = "center";
  ctx.fillText(data.isSpider ? data.grade : "✗", bx, by + 4);
  ctx.textAlign = "left";

  // the correspondent's reaction, stamped on extra-scary verdicts
  // (drop your reaction photo at public/img/scared.jpg to enable)
  if (data.extraScary) {
    try {
      const scared = await loadImage("img/scared.jpg");
      const sx = 108, sy = PHOTO_H - 170, r = 62; // fully inside the photo, clear of the nickname
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, r + 8, 0, Math.PI * 2);
      ctx.fillStyle = CARD.bg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.clip();
      drawCover(ctx, scared, sx - r, sy - r, r * 2, r * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.lineWidth = 5;
      ctx.strokeStyle = CARD.danger;
      ctx.stroke();
      // label
      ctx.fillStyle = CARD.danger;
      roundRect(ctx, sx - 76, sy + r + 12, 152, 34, 17);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = display(16);
      ctx.textAlign = "center";
      ctx.fillText("LIVE REACTION", sx, sy + r + 29);
      ctx.textAlign = "left";
    } catch { /* no reaction photo installed — skip */ }
  }

  ctx.textBaseline = "alphabetic";
  let y = PHOTO_H + 78;

  // species name — the headline
  ctx.fillStyle = CARD.text;
  ctx.font = display(fitSize(ctx, data.commonName, W - 72, 54, 30, display));
  ctx.fillText(data.commonName, 36, y);

  // headline quote — the star of the card
  y += 30;
  ctx.font = bodyItalic(34);
  ctx.fillStyle = CARD.power;
  const quoteLines = wrap(ctx, `“${data.quote}”`, W - 72).slice(0, 3);
  for (const line of quoteLines) {
    y += 46;
    ctx.fillText(line, 36, y);
  }
  y += 36;
  ctx.font = body(22);
  ctx.fillStyle = CARD.dim;
  ctx.fillText("— league correspondent, on record", 36, y);

  // scientific name
  y += 48;
  ctx.font = bodyItalic(28);
  ctx.fillStyle = CARD.dim;
  ctx.fillText(data.scientificName, 36, y);

  // stat bars
  y += 52;
  y = statBar(ctx, y, "BEAUTY", data.beauty, CARD.beauty);
  y = statBar(ctx, y, "POWER", data.power, CARD.power);

  // scientific evaluation
  y += 14;
  ctx.font = display(18);
  ctx.fillStyle = CARD.moss;
  ctx.fillText("SPECIMEN EVALUATION", 36, y);
  y += 12;
  ctx.font = body(26);
  ctx.fillStyle = CARD.text;
  const reportLines = wrap(ctx, data.report, W - 72);
  const maxReportY = H - 130;
  for (const line of reportLines) {
    y += 38;
    if (y > maxReportY) break;
    ctx.fillText(line, 36, y);
  }

  // footer
  ctx.fillStyle = CARD.line;
  ctx.fillRect(36, H - 92, W - 72, 2);
  ctx.fillStyle = CARD.dim;
  ctx.font = body(23);
  const credit = [
    data.teamName ? `Team ${data.teamName}` : "Free agent — unsigned",
    data.state ? `found in ${data.state}` : null,
  ].filter(Boolean).join("  ·  ");
  ctx.fillText(credit, 36, H - 44);
  ctx.textAlign = "right";
  ctx.fillStyle = CARD.moss;
  ctx.font = display(23);
  ctx.fillText("SPIDERLEAGUE", W - 36, H - 44);
  ctx.textAlign = "left";

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function statBar(ctx, y, label, value, color) {
  const { W } = CARD;
  const barX = 36, barW = W - 72, barH = 24;

  ctx.font = display(24);
  ctx.fillStyle = CARD.dim;
  ctx.fillText(label, barX, y);
  ctx.textAlign = "right";
  ctx.fillStyle = color;
  ctx.font = display(36);
  ctx.fillText(String(value), barX + barW, y + 2);
  ctx.textAlign = "left";

  y += 16;
  roundRect(ctx, barX, y, barW, barH, 12);
  ctx.fillStyle = CARD.panel;
  ctx.fill();
  roundRect(ctx, barX, y, Math.max(barH, barW * (value / 100)), barH, 12);
  ctx.fillStyle = color;
  ctx.fill();

  return y + barH + 38;
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
function bodyItalic(px) {
  return CARD.bodyItalic.replace("%s", px);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
