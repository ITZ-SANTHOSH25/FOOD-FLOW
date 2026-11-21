/* FOODFLOW — lightweight, dependency-free SVG charts */

const CHART_COLORS = ['#B76E4B', '#777B54', '#C9A227', '#6B7C8A', '#A94F3E', '#9A9E77', '#D9B48F'];

const registry = [];
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    registry.forEach((c) => {
      if (document.body.contains(c.el)) {
        try { c.fn(); } catch (e) { /* ignore */ }
      }
    });
  }, 180);
});

function registerChart(el, fn) {
  registry.push({ el, fn });
  fn();
}

function niceMax(v) {
  if (v <= 0) return 10;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const n = v / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * base;
}

function compactINR(v) {
  if (v >= 10000000) return '₹' + (v / 10000000).toFixed(1) + 'Cr';
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
  if (v >= 1000) return '₹' + Math.round(v / 1000) + 'k';
  return '₹' + Math.round(v);
}

function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/* ---------------- Area / line chart ---------------- */
function areaChart(container, series, opts = {}) {
  registerChart(container, () => {
    const width = Math.max(container.clientWidth || 560, 260);
    const height = opts.height || 252;
    const pad = { t: 16, r: 14, b: 28, l: 46 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const values = series.map((d) => Number(d[opts.valueKey || 'revenue']) || 0);
    const labels = series.map((d) => d[opts.labelKey || 'label']);
    const max = niceMax(Math.max(...values, 1) * 1.12);
    const step = max / 4;
    const x = (i) => pad.l + (series.length === 1 ? innerW / 2 : (innerW / (series.length - 1)) * i);
    const y = (v) => pad.t + innerH - (v / max) * innerH;
    const pts = series.map((d, i) => ({ x: x(i), y: y(Number(d[opts.valueKey || 'revenue']) || 0), d }));

    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const gy = pad.t + (innerH / 4) * i;
      grid += `<line class="chart-grid-line" x1="${pad.l}" y1="${gy}" x2="${width - pad.r}" y2="${gy}"/>`;
      grid += `<text class="chart-axis-label" x="${pad.l - 9}" y="${gy + 3.5}" text-anchor="end">${opts.format ? opts.format(max - step * i) : compactINR(max - step * i)}</text>`;
    }

    const line = smoothPath(pts);
    const area = `${line} L ${pts[pts.length - 1].x} ${pad.t + innerH} L ${pts[0].x} ${pad.t + innerH} Z`;
    const gid = 'ag' + Math.random().toString(36).slice(2, 8);

    let dots = '';
    let zones = '';
    pts.forEach((p, i) => {
      dots += `<circle class="chart-point" cx="${p.x}" cy="${p.y}" r="4" data-i="${i}"/>`;
      const zw = innerW / Math.max(series.length - 1, 1);
      zones += `<rect class="chart-hover-zone" x="${p.x - zw / 2}" y="${pad.t}" width="${zw}" height="${innerH}" data-i="${i}"/>`;
    });

    let xlabels = '';
    labels.forEach((l, i) => {
      xlabels += `<text class="chart-axis-label" x="${x(i)}" y="${height - 8}" text-anchor="middle">${l}</text>`;
    });

    container.innerHTML = `
      <div class="chart-wrap">
        <svg class="chart-svg" viewBox="0 0 ${width} ${height}" height="${height}" role="img" aria-label="${opts.aria || 'Trend chart'}">
          <defs>
            <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#B76E4B" stop-opacity="0.22"/>
              <stop offset="70%" stop-color="#B76E4B" stop-opacity="0.05"/>
              <stop offset="100%" stop-color="#B76E4B" stop-opacity="0"/>
            </linearGradient>
          </defs>
          ${grid}
          <path class="chart-area" d="${area}" fill="url(#${gid})"/>
          <path class="chart-line" d="${line}" style="stroke-dasharray:2000;stroke-dashoffset:2000;animation:drawLine 1.6s cubic-bezier(.22,1,.36,1) forwards"/>
          ${dots}
          ${xlabels}
          ${zones}
        </svg>
        <div class="chart-tooltip" data-tip></div>
      </div>`;

    const tip = container.querySelector('[data-tip]');
    const wrap = container.querySelector('.chart-wrap');
    container.querySelectorAll('.chart-hover-zone').forEach((zone) => {
      zone.addEventListener('mouseenter', () => {
        const i = Number(zone.dataset.i);
        const p = pts[i];
        const val = Number(p.d[opts.valueKey || 'revenue']) || 0;
        tip.innerHTML = `<b>${labels[i]}</b><br>${opts.tooltip ? opts.tooltip(p.d) : compactINR(val)}`;
        tip.style.left = p.x + 'px';
        tip.style.top = p.y + 'px';
        tip.classList.add('show');
        container.querySelectorAll('.chart-point').forEach((c) => (c.style.opacity = 0));
        const dot = container.querySelector(`.chart-point[data-i="${i}"]`);
        if (dot) dot.style.opacity = 1;
      });
      zone.addEventListener('mouseleave', () => {
        tip.classList.remove('show');
        container.querySelectorAll('.chart-point').forEach((c) => (c.style.opacity = 0));
      });
    });
    if (wrap) wrap.style.position = 'relative';
  });
}

/* ---------------- Donut ---------------- */
function donutChart(container, items, opts = {}) {
  registerChart(container, () => {
    const size = opts.size || 168;
    const r = 62;
    const cx = size / 2;
    const cy = size / 2;
    const C = 2 * Math.PI * r;
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    let offset = 0;
    let arcs = '';
    items.forEach((it, idx) => {
      const frac = it.value / total;
      const len = frac * C;
      const color = it.color || CHART_COLORS[idx % CHART_COLORS.length];
      arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="15"
        stroke-dasharray="${len - 2.5} ${C - len + 2.5}" stroke-dashoffset="${-offset}"
        stroke-linecap="round" style="opacity:${it.value ? 1 : 0};transition:stroke-dasharray .9s cubic-bezier(.22,1,.36,1)"/>`;
      offset += len;
    });
    const centerVal = opts.centerValue != null ? opts.centerValue : total;
    const centerLabel = opts.centerLabel || 'Total';
    container.innerHTML = `
      <svg class="donut-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${opts.aria || 'Distribution'}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(73,53,45,.06)" stroke-width="15"/>
        ${arcs}
        <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut-center-val">${centerVal}</text>
        <text x="${cx}" y="${cy + 15}" text-anchor="middle" class="donut-center-lbl">${centerLabel}</text>
      </svg>`;
  });
}

/* ---------------- Grouped bars ---------------- */
function barChart(container, data, opts = {}) {
  registerChart(container, () => {
    const width = Math.max(container.clientWidth || 560, 260);
    const height = opts.height || 240;
    const pad = { t: 14, r: 10, b: 30, l: 40 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const max = niceMax(Math.max(...data.flatMap((d) => [d.planned || 0, d.actual || 0]), 1) * 1.1);
    const groupW = innerW / Math.max(data.length, 1);
    const barW = Math.min(22, groupW * 0.3);
    let bars = '';
    let grid = '';
    for (let i = 0; i <= 3; i++) {
      const gy = pad.t + (innerH / 3) * i;
      grid += `<line class="chart-grid-line" x1="${pad.l}" y1="${gy}" x2="${width - pad.r}" y2="${gy}"/>`;
      grid += `<text class="chart-axis-label" x="${pad.l - 8}" y="${gy + 3.5}" text-anchor="end">${Math.round(max - (max / 3) * i)}</text>`;
    }
    data.forEach((d, i) => {
      const gx = pad.l + groupW * i + groupW / 2;
      const ph = ((d.planned || 0) / max) * innerH;
      const ah = ((d.actual || 0) / max) * innerH;
      bars += `<rect class="chart-bar alt" x="${gx - barW - 2}" y="${pad.t + innerH - ph}" width="${barW}" height="${ph}" rx="3"><title>${d.label} planned: ${d.planned}</title></rect>`;
      bars += `<rect class="chart-bar" x="${gx + 2}" y="${pad.t + innerH - ah}" width="${barW}" height="${ah}" rx="3"><title>${d.label} actual: ${d.actual}</title></rect>`;
      bars += `<text class="chart-axis-label" x="${gx}" y="${height - 9}" text-anchor="middle">${d.label}</text>`;
    });
    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" height="${height}" role="img" aria-label="${opts.aria || 'Planned versus actual'}">
        ${grid}${bars}
      </svg>`;
  });
}

/* ---------------- Sparkline ---------------- */
function sparkline(values, color = '#B76E4B', w = 74, h = 26) {
  if (!values || values.length < 2) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (w / (values.length - 1)) * i,
    y: h - 3 - ((v - min) / range) * (h - 6)
  }));
  const d = smoothPath(pts);
  return `<svg class="kpi-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>
  </svg>`;
}
