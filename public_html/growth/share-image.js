// Renders a saved review's progress snapshot as a shareable 1080×1350 image.
// Only scores are drawn; reflections and next steps stay private.
const W = 1080, H = 1350, PROJECT_URL = 'github.com/edrisranjbar/lifeos';
const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

// Shorter labels so every name fits its card.
const SHORT = {spirituality: 'Spirituality', relationships: 'Relationships'};

// A dimension's score is its SMART progress, falling back to habit consistency.
const scoreOf = snap => snap?.goalPct ?? snap?.habitPct ?? null;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ring(ctx, cx, cy, radius, width, pct, color) {
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
  if (pct > 0) {
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(pct, 100) / 100); ctx.stroke();
  }
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxWidth) text = text.slice(0, -1);
  return text + '…';
}

export async function renderReviewImage(review, dimensions, dateLabel) {
  await document.fonts?.ready;
  const { t, number } = window.lifeOsI18n;
  const percent = value => t('{value}%', { value: number(value) });
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background with a soft accent glow.
  ctx.fillStyle = '#070a10';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, 900);
  glow.addColorStop(0, 'rgba(57,230,173,.18)'); glow.addColorStop(1, 'rgba(57,230,173,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  const scores = dimensions.map(d => scoreOf(review.snapshot?.[d.id]));
  const measured = scores.filter(s => s !== null);
  const overall = measured.length ? Math.round(measured.reduce((a, b) => a + b, 0) / measured.length) : null;
  const reflected = dimensions.filter(d => review.notes?.[d.id]?.reflection || review.notes?.[d.id]?.next).length;
  const cadence = String(review.cadence || 'weekly');

  // Header.
  const pad = 88;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#39e6ad';
  ctx.font = `700 26px ${FONT}`;
  ctx.letterSpacing = '4px';
  ctx.fillText(t(`MY ${cadence.toUpperCase()} REVIEW`), pad, 150);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#fffaf0';
  ctx.font = `700 76px ${FONT}`;
  ctx.fillText(t('Growing in every'), pad, 250);
  ctx.fillText(t('direction.'), pad, 338);
  ctx.fillStyle = '#94a1b5';
  ctx.font = `400 30px ${FONT}`;
  ctx.fillText(t('{date} · {count} of {total} dimensions reflected', { date: dateLabel, count: number(reflected), total: number(dimensions.length) }), pad, 398);

  // Overall score ring.
  const ocx = W - pad - 110, ocy = 270;
  ring(ctx, ocx, ocy, 98, 18, overall ?? 0, '#39e6ad');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fffaf0';
  ctx.font = `700 64px ${FONT}`;
  ctx.fillText(overall === null ? '—' : number(overall), ocx, ocy + 18);
  ctx.fillStyle = '#94a1b5';
  ctx.font = `500 20px ${FONT}`;
  ctx.fillText(t('OVERALL'), ocx, ocy + 50);
  ctx.textAlign = 'left';

  // Dimension cards: 2 columns × 3 rows.
  const gap = 24, top = 470, cardW = (W - pad * 2 - gap) / 2, cardH = 210;
  dimensions.forEach((d, i) => {
    const x = pad + (i % 2) * (cardW + gap), y = top + Math.floor(i / 2) * (cardH + gap);
    const snap = review.snapshot?.[d.id] || {}, score = scores[i];
    roundRect(ctx, x, y, cardW, cardH, 28);
    ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2; ctx.stroke();

    const cx = x + 36 + 58, cy = y + cardH / 2;
    ring(ctx, cx, cy, 58, 12, score ?? 0, d.color);
    ctx.textAlign = 'center';
    ctx.fillStyle = score === null ? '#94a1b5' : '#fffaf0';
    ctx.font = `700 ${score === null ? 34 : 36}px ${FONT}`;
    ctx.fillText(score === null ? '—' : percent(score), cx, cy + 13);
    ctx.textAlign = 'left';

    const tx = cx + 58 + 32, maxText = x + cardW - tx - 28;
    ctx.fillStyle = d.color;
    ctx.font = `400 30px ${FONT}`;
    ctx.fillText(d.icon, tx, cy - 34);
    ctx.fillStyle = '#fffaf0';
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(fitText(ctx, SHORT[d.id] ? t(SHORT[d.id]) : d.name, maxText), tx, cy + 10);
    ctx.fillStyle = '#94a1b5';
    ctx.font = `400 21px ${FONT}`;
    const parts = [];
    if (snap.habitPct !== null && snap.habitPct !== undefined) parts.push(t('Habits {percent}', { percent: percent(snap.habitPct) }));
    ctx.fillText(fitText(ctx, parts.join(' · ') || t('Not measured yet'), maxText), tx, cy + 48);
  });

  // Footer.
  const fy = H - 92;
  ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(pad, fy - 54); ctx.lineTo(W - pad, fy - 54); ctx.stroke();
  roundRect(ctx, pad, fy - 30, 44, 44, 11);
  ctx.fillStyle = '#39e6ad'; ctx.fill();
  ctx.fillStyle = '#04150f';
  ctx.font = `800 26px ${FONT}`;
  ctx.textAlign = 'center'; ctx.fillText('E', pad + 22, fy + 2); ctx.textAlign = 'left';
  ctx.fillStyle = '#fffaf0';
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(t('Made with Edi Life OS'), pad + 64, fy + 1);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#94a1b5';
  ctx.font = `400 24px ${FONT}`;
  ctx.fillText(PROJECT_URL, W - pad, fy + 1);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error(t('Unable to create the image.'))), 'image/png'));
}

// Share through the system sheet where supported, otherwise download the PNG.
export async function shareReviewImage(review, dimensions, dateLabel) {
  const blob = await renderReviewImage(review, dimensions, dateLabel);
  const file = new File([blob], `life-review-${review.date}.png`, {type: 'image/png'});
  const { t } = window.lifeOsI18n;
  const text = t('My {cadence} life review, made with Edi Life OS — {url}', { cadence: t(review.cadence), url: `https://${PROJECT_URL}` });
  if (navigator.canShare?.({files: [file]})) {
    try { await navigator.share({files: [file], title: t('My life review'), text}); return 'shared'; }
    catch (error) { if (error.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), {href: url, download: file.name});
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
