/* ============================================================
   FOODFLOW — Workspace application
   ============================================================ */
(function () {
  'use strict';

  const API_BASE_URL = 'https://food-flow-backend-tfyf.onrender.com';
  const token = localStorage.getItem('ff_token');
  if (!token) { window.location.replace('login.html'); return; }

  const state = {
    data: null,
    user: null,
    view: 'overview',
    orderFilter: 'all',
    orderQuery: '',
    invFilter: 'all',
    auditFilter: 'all',
    charts: []
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------------- Formatting ---------------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
  const inrCompact = (n) => {
    n = Number(n) || 0;
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr';
    if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + ' L';
    return inr(n);
  };
  const num = (n) => Number(n || 0).toLocaleString('en-IN');
  const dt = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const dtShort = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';
  const timeAgo = (iso) => {
    if (!iso) return '';
    const now = state.data && state.data.asOf ? new Date(state.data.asOf).getTime() : Date.now();
    const diff = now - new Date(iso).getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.round(hrs / 24);
    if (days < 30) return days + 'd ago';
    return Math.round(days / 30) + 'mo ago';
  };
  const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const STATUS_LABEL = {
    pending: 'Awaiting', confirmed: 'Confirmed', in_production: 'In Production', packed: 'Packed',
    dispatched: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled',
    in_progress: 'In Progress', on_hold: 'On Hold', completed: 'Completed',
    healthy: 'Healthy', low: 'Low Stock', critical: 'Critical', out: 'Out of Stock',
    paid: 'Paid', overdue: 'Overdue', passed: 'Passed', rework: 'Rework',
    closed: 'Closed', excellent: 'Excellent', compliant: 'Compliant', needs_attention: 'Needs Attention'
  };
  const statusLabel = (s) => STATUS_LABEL[s] || titleCase(s);
  const badge = (s) => `<span class="badge ${esc(s)}">${esc(statusLabel(s))}</span>`;
  const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  /* ---------------- API ---------------- */
  async function api(path, method = 'GET', body) {
  const url = `${API_BASE_URL}${path}`;

  console.log('API REQUEST:', method, url);

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));

  console.log('API RESPONSE:', res.status, data);

  if (res.status === 401) {
    logout();
    throw new Error('Session expired');
  }

  if (!res.ok) {
    throw new Error(
      `${method} ${path} failed (${res.status}): ${data.error || 'Unknown error'}`
    );
  }

  return data;
}

  function logout() {
    localStorage.removeItem('ff_token');
    localStorage.removeItem('ff_user');
    window.location.replace('login.html');
  }

  function toast(title, msg, tone = '') {
    const wrap = $('#toastWrap');
    const el = document.createElement('div');
    el.className = 'toast ' + tone;
    el.innerHTML = `<div><strong>${esc(title)}</strong>${msg ? `<span>${esc(msg)}</span>` : ''}</div><button class="t-close" aria-label="Dismiss">×</button>`;
    wrap.appendChild(el);
    const kill = () => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 300); };
    el.querySelector('.t-close').addEventListener('click', kill);
    setTimeout(kill, 4200);
  }

  /* ---------------- Navigation config ---------------- */
  const ACCESS = {
    salesman: ['overview', 'orders', 'inventory', 'settings'],
    admin: ['overview', 'products', 'orders', 'production', 'inventory', 'audits', 'finance', 'team', 'reports', 'settings'],
    production: ['overview', 'production', 'inventory', 'orders', 'settings'],
    accountant: ['overview', 'finance', 'audits', 'orders', 'inventory', 'reports', 'settings'],
    owner: ['overview', 'products', 'orders', 'production', 'inventory', 'audits', 'finance', 'team', 'reports', 'settings']
  };

  const VIEW_META = {
    overview: { title: 'Overview', crumb: 'Workspace' },
    products: { title: 'Products', crumb: 'Product Master' },
    orders: { title: 'Orders', crumb: 'Sales & Distribution' },
    production: { title: 'Production', crumb: 'Manufacturing' },
    inventory: { title: 'Inventory', crumb: 'Warehouse' },
    audits: { title: 'Audits', crumb: 'Quality & Compliance' },
    finance: { title: 'Finance', crumb: 'Accounts Receivable' },
    team: { title: 'Team', crumb: 'Administration' },
    reports: { title: 'Reports', crumb: 'Business Intelligence' },
    settings: { title: 'Settings', crumb: 'Account' }
  };

  function navFor(role) {
    const d = state.data;
    const open = d.orders.filter((o) => ['pending', 'confirmed', 'in_production', 'packed'].includes(o.status)).length;
    const low = d.inventory.filter((i) => ['low', 'critical', 'out'].includes(i.status)).length;
    const openAudits = d.audits.filter((a) => a.status === 'in_progress').length;
    const overdue = d.invoices.filter((i) => i.status === 'overdue').length;
    const groups = [
      { label: 'Workspace', items: [{ id: 'overview', label: 'Overview', icon: 'dashboard' }] },
      {
        label: 'Operations',
        items: [
          { id: 'products', label: 'Products', icon: 'box' },
          { id: 'orders', label: role === 'salesman' ? 'My Orders' : 'Orders', icon: 'orders', badge: open },
          { id: 'production', label: 'Production', icon: 'production' },
          { id: 'inventory', label: 'Inventory', icon: 'inventory', badge: low }
        ]
      },
      {
        label: 'Assurance',
        items: [
          { id: 'audits', label: 'Audits', icon: 'audit', badge: openAudits },
          { id: 'finance', label: 'Finance', icon: 'finance', badge: overdue },
          { id: 'reports', label: 'Reports', icon: 'reports' }
        ]
      },
      {
        label: 'Administration',
        items: [
          { id: 'team', label: 'Team', icon: 'team' },
          { id: 'settings', label: 'Settings', icon: 'settings' }
        ]
      }
    ];
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => ACCESS[role].includes(i.id)) }))
      .filter((g) => g.items.length);
  }

  /* ---------------- Shell ---------------- */
  function renderShell() {
    const u = state.user;
    const groups = navFor(u.role);
    const sb = $('#sidebar');
    sb.innerHTML = `
      <div class="sb-brand">
        ${brandMark()}
        <div><span class="brand-name">Foodflow</span><span class="brand-sub">Order · Production · Audit</span></div>
      </div>
      <div class="sb-workspace">
        <span class="ws-ic">${icon('factory')}</span>
        <div><div class="ws-t">FoodFlow Foods</div><div class="ws-s">Tiruchirappalli · Unit I</div></div>
        <span class="ws-chev">${icon('chevronDown')}</span>
      </div>
      <nav class="sb-nav">
        ${groups.map((g) => `
          <div class="sb-group-label">${g.label}</div>
          ${g.items.map((i) => `
            <a href="#/${i.id}" class="sb-link ${state.view === i.id ? 'active' : ''}" data-view="${i.id}">
              ${icon(i.icon)}<span>${i.label}</span>
              ${i.badge ? `<span class="sb-badge">${i.badge}</span>` : ''}
            </a>`).join('')}
        `).join('')}
      </nav>
      <div class="sb-foot">
        <div class="sb-user">
          <div class="sb-avatar">${esc(u.initials || initials(u.name))}</div>
          <div><div class="u-name">${esc(u.name)}</div><div class="u-role">${esc(u.role)}</div></div>
          <button class="sb-logout" id="logoutBtn" title="Sign out" aria-label="Sign out">${icon('logout')}</button>
        </div>
      </div>`;

    const meta = VIEW_META[state.view] || VIEW_META.overview;
    $('#topbar').innerHTML = `
      <button class="tb-menu" id="tbMenu" aria-label="Open navigation">${icon('menu')}</button>
      <div class="tb-crumb">
        <span class="c-top">${esc(meta.crumb)}</span>
        <span class="c-title">${esc(meta.title)}</span>
      </div>
      <div class="tb-search">
        ${icon('search')}
        <input id="globalSearch" type="search" placeholder="Search orders, customers…" value="${esc(state.orderQuery)}" aria-label="Search" />
        <kbd>/</kbd>
      </div>
      <div class="tb-date">${icon('calendar')} ${new Date(state.data.asOf || Date.now()).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}</div>
      <button class="tb-icon" id="notifBtn" aria-label="Notifications">${icon('bell')}<span class="dot"></span></button>
      <div class="tb-avatar" title="${esc(u.name)} · ${esc(u.title)}">${esc(u.initials || initials(u.name))}</div>`;

    $('#notifPop').innerHTML = `
      <div class="notif-head"><h4>Notifications</h4><span>${state.data.notifications.length} new</span></div>
      <div class="notif-list">
        ${state.data.notifications.map((n) => `
          <div class="notif-item">
            <span class="n-ic ${n.tone}">${icon(n.tone === 'danger' ? 'alert' : n.tone === 'warn' ? 'clock' : 'bell')}</span>
            <div><div class="n-t">${esc(n.title)}</div><div class="n-x">${esc(n.text)}</div></div>
          </div>`).join('') || '<div class="empty-state"><p>You are all caught up.</p></div>'}
      </div>`;

    $('#logoutBtn').addEventListener('click', logout);
    $('#tbMenu').addEventListener('click', () => {
      sb.classList.add('open');
      $('#scrim').classList.add('show');
    });
    $('#scrim').addEventListener('click', () => {
      sb.classList.remove('open');
      $('#scrim').classList.remove('show');
    });
    $('#notifBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      $('#notifPop').classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#notifPop') && !e.target.closest('#notifBtn')) $('#notifPop').classList.remove('open');
    });
    const search = $('#globalSearch');
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        state.orderQuery = search.value.trim();
        navigate('orders');
      }
    });
    $$('.sb-link').forEach((a) => a.addEventListener('click', () => {
      sb.classList.remove('open');
      $('#scrim').classList.remove('show');
    }));
  }

  function navigate(view) {
    if (!ACCESS[state.user.role].includes(view)) view = 'overview';
    state.view = view;
    if (window.location.hash !== '#/' + view) window.location.hash = '#/' + view;
    renderShell();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- Shared components ---------------- */
  function pageHead(title, subtitle, actions = '') {
    return `<section class="page-head">
      <div class="ph-copy">
        <span class="eyebrow">${esc(VIEW_META[state.view].crumb)}</span>
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
      <div class="ph-actions">${actions}</div>
    </section>`;
  }

  function kpi(label, value, opts = {}) {
    return `<article class="kpi">
      <div class="kpi-top">
        <span class="kpi-label">${esc(label)}</span>
        <span class="kpi-ic ${opts.tone || ''}">${icon(opts.icon || 'chart')}</span>
      </div>
      <div class="kpi-val">${value}</div>
      <div class="kpi-foot">
        ${opts.delta != null ? `<span class="kpi-delta ${opts.delta < 0 ? 'down' : ''}">${icon(opts.delta < 0 ? 'arrowDown' : 'arrowUp')}${Math.abs(opts.delta)}%</span>` : '<span></span>'}
        <span class="kpi-note">${esc(opts.note || '')}</span>
      </div>
      ${opts.spark ? sparkline(opts.spark, opts.tone === 'danger' ? '#A94F3E' : '#B76E4B') : ''}
    </article>`;
  }

  function panel(title, sub, body, opts = {}) {
    return `<section class="panel ${opts.class || ''}">
      <div class="panel-head">
        <div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
        ${opts.actions ? `<div class="panel-actions">${opts.actions}</div>` : ''}
      </div>
      <div class="panel-body ${opts.flush ? 'flush' : ''}">${body}</div>
      ${opts.foot ? `<div class="panel-foot">${opts.foot}</div>` : ''}
    </section>`;
  }

  function revenuePanel(sub) {
    return panel('Revenue Flow', sub || 'Confirmed and delivered orders · last six months', '<div id="revChart"></div>',
      { actions: '<span class="badge no-dot neutral">6 Months</span>' });
  }

  function statusBody() {
    const items = state.data.statusBreakdown.filter((s) => s.count > 0);
    const colors = { pending: '#C08A3E', confirmed: '#6B7C8A', in_production: '#B76E4B', packed: '#777B54', dispatched: '#4C6570', delivered: '#5F7A52', cancelled: '#A94F3E' };
    return `<div class="donut-wrap">
        <div id="statusDonut"></div>
        <div class="donut-legend">
          ${items.map((i) => `<div class="dl-item"><i style="background:${colors[i.key]}"></i><span class="dl-name">${statusLabel(i.key)}</span><span class="dl-val">${i.count}</span></div>`).join('')}
        </div>
      </div>`;
  }

  function statusPanel() {
    return panel('Order Status', 'Distribution across the order lifecycle', statusBody());
  }

  function ordersTable(rows, opts = {}) {
    if (!rows.length) return emptyState('No orders here yet', 'New orders will appear the moment they are raised.');
    return `<div class="table-wrap"><table class="data">
      <thead><tr>
        <th>Order</th><th>Region</th><th>Items</th><th>Value</th><th>Status</th><th>Due</th><th></th>
      </tr></thead>
      <tbody>${rows.map((o) => `
        <tr>
          <td>
            <div class="cell-flex">
              <span class="mini-avatar ${o.priority === 'high' ? '' : 'olive'}">${esc(initials(o.customer))}</span>
              <div><div class="cell-main">${esc(o.customer)}</div><div class="cell-sub">${esc(o.orderNo)} · ${esc(o.city)}</div></div>
            </div>
          </td>
          <td><div class="cell-main" style="font-weight:400;font-size:11.5px">${esc(o.region)}</div><div class="cell-sub">${esc(o.customerType)}</div></td>
          <td class="cell-num">${o.items.length} <span class="cell-sub" style="display:inline">SKUs</span></td>
          <td><span class="cell-strong">${inr(o.total)}</span></td>
          <td>${badge(o.status)}</td>
          <td><div class="cell-main" style="font-weight:400;font-size:11.5px">${dtShort(o.dueDate)}</div><div class="cell-sub">${o.priority === 'high' ? 'High priority' : titleCase(o.priority)}</div></td>
          <td>
            ${opts.actions !== false ? `<button class="row-action" data-order="${esc(o.id)}" aria-label="View order">${icon('chevronRight')}</button>` : ''}
          </td>
        </tr>`).join('')}
      </tbody></table></div>`;
  }

  function alertsPanel(limit = 5) {
    const n = state.data.notifications.slice(0, limit);
    return panel('Operational Alerts', 'Items that need a decision today',
      `<div class="alert-list">${n.map((a) => `
        <div class="alert-item">
          <span class="alert-ic ${a.tone}">${icon(a.tone === 'danger' ? 'alert' : a.tone === 'warn' ? 'clock' : 'bell')}</span>
          <div><div class="alert-t">${esc(a.title)}</div><div class="alert-x">${esc(a.text)}</div></div>
          <span class="alert-meta">${timeAgo(a.at)}</span>
        </div>`).join('')}</div>`,
      { actions: '<a href="#/inventory" class="badge no-dot neutral" style="text-decoration:none">View all</a>' });
  }

  function stockWatchPanel() {
    const items = state.data.inventory.filter((i) => ['low', 'critical', 'out'].includes(i.status)).slice(0, 5);
    return panel('Stock Watchlist', 'Below reorder level',
      items.length ? `<div class="alert-list">${items.map((i) => `
        <div class="alert-item">
          <span class="alert-ic ${i.status === 'low' ? 'warn' : 'danger'}">${icon('inventory')}</span>
          <div style="flex:1">
            <div class="alert-t">${esc(i.name)}</div>
            <div class="alert-x">${esc(i.warehouse)} · reorder at ${i.reorderLevel}</div>
            <div class="stock-track" style="margin-top:6px"><div class="stock-fill ${i.status}" style="width:${Math.min(100, Math.round((i.stock / i.reorderLevel) * 100))}%"></div></div>
          </div>
          <span class="alert-meta">${i.stock} left</span>
        </div>`).join('')}</div>` : emptyState('Stock is healthy', 'No SKU is below its reorder level.'),
      { actions: `<span class="badge ${items.length ? 'low' : 'healthy'}">${items.length} alerts</span>` });
  }

  function activityPanel() {
    const a = state.data.activity.slice(0, 5);
    return panel('Recent Activity', 'A running record of the floor and the office',
      `<div class="timeline">${a.map((x) => `
        <div class="tl-item">
          <span class="tl-dot">${icon(x.type === 'production' ? 'production' : x.type === 'finance' ? 'wallet' : x.type === 'audit' ? 'audit' : x.type === 'inventory' ? 'inventory' : 'orders')}</span>
          <div><div class="tl-t">${esc(x.text)}</div><div class="tl-s">${esc(x.actor)} · ${timeAgo(x.at)}</div></div>
        </div>`).join('')}</div>`);
  }

  function emptyState(title, sub) {
    return `<div class="empty-state"><div class="es-ic">${icon('leaf')}</div><h4>${esc(title)}</h4><p>${esc(sub)}</p></div>`;
  }

  function hbar(items, formatter = inr) {
    const max = Math.max(...items.map((i) => i.value), 1);
    return `<div class="hbar">${items.map((i) => `
      <div class="hbar-row">
        <div class="hbar-top"><span>${esc(i.label)}</span><b>${formatter(i.value)}</b></div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(4, (i.value / max) * 100)}%"></div></div>
      </div>`).join('')}</div>`;
  }

  function progressRing(value, label) {
    const r = 40, c = 2 * Math.PI * r;
    return `<div class="progress-ring">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(73,53,45,.08)" stroke-width="7"/>
        <circle cx="48" cy="48" r="${r}" fill="none" stroke="#777B54" stroke-width="7" stroke-linecap="round"
          stroke-dasharray="${(value / 100) * c} ${c}" />
      </svg>
      <span class="pr-val">${value}%</span>
    </div>`;
  }

  /* ---------------- Overview ---------------- */
  function overviewView() {
    const d = state.data, k = d.kpis, u = state.user;
    const revSpark = d.monthly.map((m) => m.revenue);
    const orderSpark = d.monthly.map((m) => m.orders);
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const first = u.name.split(' ')[0];

    if (u.role === 'salesman') {
      const myInvoices = d.invoices.filter((i) => i.status !== 'paid');
      return pageHead(`${greet}, <em>${esc(first)}.</em>`, `Your order book, collections and stock availability for ${esc(u.region)}.`,
        `<button class="btn btn-sm" data-action="new-order">${icon('plus')} New Order</button>`) +
        `<div class="kpi-grid">
          ${kpi('My Revenue', inrCompact(k.revenue), { icon: 'wallet', note: 'last 6 months', delta: 12, spark: revSpark })}
          ${kpi('Open Orders', k.openOrders, { icon: 'orders', tone: 'info', note: 'in the pipeline', delta: 4, spark: orderSpark })}
          ${kpi('Average Order Value', inr(k.avgOrderValue), { icon: 'chart', tone: 'olive', note: 'per confirmed order' })}
          ${kpi('Receivables', inrCompact(k.receivables), { icon: 'finance', tone: 'warn', note: `${myInvoices.length} invoices open` })}
        </div>
        <div class="grid-2-1">${revenuePanel('Your order value, month by month')}${statusPanel()}</div>
        <div class="grid-2-1">
          ${panel('My Recent Orders', 'Latest orders raised from the field', ordersTable(d.orders.slice(0, 6), { actions: false }), {
            flush: true, actions: `<a href="#/orders" class="badge no-dot neutral" style="text-decoration:none">View all</a>`
          })}
          ${stockWatchPanel()}
        </div>
        <div class="grid-2">
          ${panel('Collection Follow-ups', 'Invoices awaiting payment', d.invoices.filter((i) => i.status !== 'paid').slice(0, 5).map((i) => `
            <div class="alert-item">
              <span class="alert-ic ${i.status === 'overdue' ? 'danger' : 'warn'}">${icon('wallet')}</span>
              <div><div class="alert-t">${esc(i.customer)}</div><div class="alert-x">${esc(i.invoiceNo)} · due ${dtShort(i.dueDate)}</div></div>
              <span class="alert-meta" style="color:var(--brown);font-weight:500">${inr(i.amount)}</span>
            </div>`).join('') || emptyState('Nothing outstanding', 'All your invoices are settled.'))}
          ${activityPanel()}
        </div>`;
    }

    if (u.role === 'production') {
      const lines = ['Blending Line A', 'Blending Line B', 'Filling Line C', 'Roasting Line D', 'Liquid Line E', 'Packing Line F', 'Frying Line G'];
      const lineLoad = lines.map((l) => ({ label: l, value: d.batches.filter((b) => b.line === l && b.status !== 'completed').reduce((s, b) => s + b.plannedQty, 0) || Math.round(200 + Math.random() * 300) }));
      return pageHead(`${greet}, <em>${esc(first)}.</em>`, 'Line loading, batch yield and variance across Unit II — Thanjavur.',
        `<button class="btn btn-sm" data-action="new-batch">${icon('plus')} Start Batch</button>`) +
        `<div class="kpi-grid">
          ${kpi('Active Batches', k.activeBatches, { icon: 'production', note: 'on the floor now' })}
          ${kpi('Average Yield', k.avgYield + '<small>%</small>', { icon: 'scale', tone: 'olive', note: 'completed batches', delta: 2 })}
          ${kpi('Variance Alerts', k.varianceAlerts, { icon: 'alert', tone: 'warn', note: 'beyond ±8% tolerance' })}
          ${kpi('Critical Stock', k.criticalStockCount, { icon: 'inventory', tone: 'danger', note: 'raw material cover' })}
        </div>
        <div class="grid-2-1">
          ${panel('Planned vs Actual Output', 'Last ten completed batches', '<div id="prodBars"></div>', {
            actions: '<div class="chart-legend"><span><i style="background:#9A9E77"></i>Planned</span><span><i style="background:#B76E4B"></i>Actual</span></div>'
          })}
          ${panel('Quality Posture', 'QC outcomes and yield health', `
            <div style="display:flex;align-items:center;gap:22px;padding:8px 0 14px">
              ${progressRing(Math.round(k.avgYield), 'yield')}
              <div style="flex:1">
                <div class="stat-strip" style="grid-template-columns:1fr 1fr;border-top:0">
                  <div><div class="ss-l">QC Passed</div><div class="ss-v">${d.batches.filter((b) => b.qcStatus === 'passed').length}</div></div>
                  <div><div class="ss-l">Rework</div><div class="ss-v">${d.batches.filter((b) => b.qcStatus === 'rework').length}</div></div>
                  <div><div class="ss-l">On Hold</div><div class="ss-v">${d.batches.filter((b) => b.status === 'on_hold').length}</div></div>
                  <div><div class="ss-l">Wastage</div><div class="ss-v">${num(d.batches.reduce((s, b) => s + b.wastageQty, 0))}<small style="font-size:11px"> kg</small></div></div>
                </div>
              </div>
            </div>`)}
        </div>
        <div class="grid-2-1">
          ${panel('Batch Board', 'Live and recently closed batches', batchTable(d.batches.slice(0, 6)), { flush: true, actions: '<a href="#/production" class="badge no-dot neutral" style="text-decoration:none">All batches</a>' })}
          ${panel('Variance Alerts', 'Batches outside tolerance', varianceList(), { actions: `<span class="badge warn">${k.varianceAlerts}</span>` })}
        </div>
        <div class="grid-2">
          ${panel('Line Loading', 'Planned quantity by line', hbar(lineLoad, (v) => num(v) + ' kg'))}
          ${stockWatchPanel()}
        </div>`;
    }

    if (u.role === 'accountant') {
      const age = [
        { label: 'Current (0–30 days)', value: d.invoices.filter((i) => i.status === 'pending').reduce((s, i) => s + i.amount, 0) },
        { label: '31–60 days', value: d.invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.amount, 0) * 0.62 },
        { label: '61–90 days', value: d.invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.amount, 0) * 0.27 },
        { label: '90+ days', value: d.invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.amount, 0) * 0.11 }
      ];
      return pageHead(`${greet}, <em>${esc(first)}.</em>`, 'Receivables ageing, GST invoicing and audit posture across all units.',
        `<button class="btn btn-sm" data-action="new-audit">${icon('plus')} Record Audit</button>`) +
        `<div class="kpi-grid">
          ${kpi('Receivables', inrCompact(k.receivables), { icon: 'wallet', note: `${d.invoices.filter((i) => i.status !== 'paid').length} open invoices` })}
          ${kpi('Overdue', inrCompact(k.overdueAmount), { icon: 'alert', tone: 'danger', note: `${k.overdueCount} invoices past due` })}
          ${kpi('Revenue Booked', inrCompact(k.revenue), { icon: 'finance', tone: 'olive', note: 'last 6 months', delta: 9, spark: revSpark })}
          ${kpi('Audit Score', k.avgAuditScore + '<small>/100</small>', { icon: 'shield', tone: 'info', note: `${k.openAudits} audits open` })}
        </div>
        <div class="grid-2-1">
          ${revenuePanel('Billed value by month')}
          ${panel('Receivables Ageing', 'Outstanding value by bucket', hbar(age, inrCompact), { actions: `<span class="badge ${k.overdueCount ? 'overdue' : 'paid'}">${k.overdueCount} overdue</span>` })}
        </div>
        <div class="grid-2-1">
          ${panel('Invoices', 'Latest GST invoices raised', invoiceTable(d.invoices.slice(0, 7)), { flush: true, actions: '<a href="#/finance" class="badge no-dot neutral" style="text-decoration:none">All invoices</a>' })}
          ${panel('Audit Posture', 'Scored compliance across five audit types', auditSummary(), { actions: '<a href="#/audits" class="badge no-dot neutral" style="text-decoration:none">Open audits</a>' })}
        </div>
        <div class="grid-2">
          ${panel('Revenue by Category', 'Where the money is made', hbar(d.categoryMix.slice(0, 6).map((c) => ({ label: c.category, value: c.value })), inrCompact))}
          ${activityPanel()}
        </div>`;
    }

    if (u.role === 'admin') {
      return pageHead(`${greet}, <em>${esc(first)}.</em>`, 'Orders, dispatch readiness and stock cover across the network.',
        `<button class="btn btn-sm" data-action="new-order">${icon('plus')} New Order</button>`) +
        `<div class="kpi-grid">
          ${kpi('Revenue', inrCompact(k.revenue), { icon: 'wallet', note: 'last 6 months', delta: 12, spark: revSpark })}
          ${kpi('Open Orders', k.openOrders, { icon: 'orders', tone: 'info', note: `${d.orders.filter((o) => o.status === 'pending').length} awaiting approval` })}
          ${kpi('Low Stock SKUs', k.lowStockCount, { icon: 'inventory', tone: 'warn', note: `${k.criticalStockCount} critical` })}
          ${kpi('Active Batches', k.activeBatches, { icon: 'production', tone: 'olive', note: `${k.avgYield}% average yield` })}
        </div>
        <div class="grid-2-1">${revenuePanel()}${statusPanel()}</div>
        <div class="grid-2-1">
          ${panel('Order Queue', 'Newest orders across all salesmen', ordersTable(d.orders.slice(0, 7), { actions: false }), { flush: true, actions: '<a href="#/orders" class="badge no-dot neutral" style="text-decoration:none">Manage</a>' })}
          ${alertsPanel(6)}
        </div>
        <div class="grid-2">
          ${panel('Production Progress', 'Batches currently on the floor', batchTable(d.batches.filter((b) => b.status !== 'completed').slice(0, 4)), { flush: true })}
          ${panel('Dispatch Readiness', 'Packed and dispatched consignments', `
            <div class="stat-strip" style="border-top:0">
              <div><div class="ss-l">Packed</div><div class="ss-v">${d.orders.filter((o) => o.status === 'packed').length}</div></div>
              <div><div class="ss-l">Dispatched</div><div class="ss-v">${d.orders.filter((o) => o.status === 'dispatched').length}</div></div>
              <div><div class="ss-l">Delivered</div><div class="ss-v">${d.orders.filter((o) => o.status === 'delivered').length}</div></div>
              <div><div class="ss-l">On-time</div><div class="ss-v">${k.onTimePct}%</div></div>
            </div>
            <div style="margin-top:14px">${hbar(d.regionSales.slice(0, 4).map((r) => ({ label: r.region, value: r.value })), inrCompact)}</div>`)}
        </div>`;
    }

    /* owner */
    return pageHead(`${greet}, <em>${esc(first)}.</em>`, 'The whole business on one page — revenue, yield, receivables and assurance.',
      `<a href="#/reports" class="btn btn-sm btn-ghost">${icon('reports')} Full Report</a>
       <button class="btn btn-sm" data-action="new-order">${icon('plus')} New Order</button>`) +
      `<div class="kpi-grid">
        ${kpi('Revenue', inrCompact(k.revenue), { icon: 'wallet', note: 'last 6 months', delta: 12, spark: revSpark })}
        ${kpi('Open Orders', k.openOrders, { icon: 'orders', tone: 'info', note: `${k.onTimePct}% on-time delivery` })}
        ${kpi('Average Yield', k.avgYield + '<small>%</small>', { icon: 'scale', tone: 'olive', note: `${k.activeBatches} batches running` })}
        ${kpi('Receivables', inrCompact(k.receivables), { icon: 'finance', tone: 'warn', note: `${k.overdueCount} overdue · ${inrCompact(k.overdueAmount)}` })}
      </div>
      <div class="grid-2-1">
        ${revenuePanel('Consolidated revenue across all regions')}
        ${panel('Revenue by Region', 'Share of booked value', hbar(d.regionSales.map((r) => ({ label: r.region, value: r.value })), inrCompact), {
          actions: `<span class="badge no-dot neutral">${d.regionSales.length} regions</span>`
        })}
      </div>
      <div class="grid-2-1">
        ${panel('Category Mix', 'Revenue contribution by product family', `
          <div class="donut-wrap">
            <div id="catDonut"></div>
            <div class="donut-legend">${d.categoryMix.slice(0, 6).map((c, i) => `<div class="dl-item"><i style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></i><span class="dl-name">${esc(c.category)}</span><span class="dl-val">${inrCompact(c.value)}</span></div>`).join('')}</div>
          </div>`)}
        ${panel('Top Products', 'By revenue contribution', topProductsList(), { flush: true, actions: '<a href="#/reports" class="badge no-dot neutral" style="text-decoration:none">Details</a>' })}
      </div>
      <div class="grid-3">
        ${panel('Assurance', 'Audit and compliance', `
          <div style="display:flex;align-items:center;gap:16px;padding:4px 0 12px">
            ${progressRing(Math.round(k.avgAuditScore), 'score')}
            <div><div class="ss-l">Average score</div><div class="ss-v">${k.avgAuditScore}/100</div>
            <div class="cell-sub" style="margin-top:4px">${d.audits.filter((a) => a.status === 'closed').length} closed · ${k.openAudits} open</div></div>
          </div>
          ${d.audits.slice(0, 3).map((a) => `<div class="alert-item"><span class="alert-ic ${a.score >= 90 ? 'ok' : a.score >= 80 ? 'info' : 'warn'}">${icon('shield')}</span><div><div class="alert-t">${esc(a.auditNo)} · ${esc(a.type)}</div><div class="alert-x">${esc(a.auditor)} · ${dtShort(a.date)}</div></div><span class="alert-meta">${a.score}</span></div>`).join('')}`)}
        ${alertsPanel(4)}
        ${activityPanel()}
      </div>`;
  }

  /* ---------------- Tables ---------------- */
  function batchTable(rows) {
    if (!rows.length) return emptyState('No batches scheduled', 'Start a batch to see it here.');
    return `<div class="table-wrap"><table class="data">
      <thead><tr><th>Batch</th><th>Product</th><th>Planned / Actual</th><th>Yield</th><th>Variance</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map((b) => `
        <tr>
          <td><div class="cell-main">${esc(b.batchNo)}</div><div class="cell-sub">${esc(b.line)} · ${esc(b.shift)}</div></td>
          <td><div class="cell-main" style="font-weight:400;font-size:11.5px">${esc(b.productName)}</div><div class="cell-sub">${esc(b.sku)}</div></td>
          <td class="cell-num"><span class="cell-main" style="font-size:11.5px">${num(b.plannedQty)}</span> <span class="cell-sub" style="display:inline">/ ${num(b.actualQty)}</span></td>
          <td><span class="cell-main">${b.yieldPct}%</span></td>
          <td><span class="badge ${Math.abs(b.variancePct) > 8 ? 'low' : 'healthy'} no-dot">${b.variancePct > 0 ? '+' : ''}${b.variancePct}%</span></td>
          <td>${badge(b.status)}</td>
          <td>${['production', 'admin', 'owner'].includes(state.user.role) && b.status !== 'completed' ? `<button class="row-action" data-batch="${esc(b.id)}" title="Update batch">${icon('edit')}</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  function varianceList() {
    const rows = state.data.batches.filter((b) => Math.abs(b.variancePct) > 8 || b.status === 'on_hold').slice(0, 5);
    if (!rows.length) return emptyState('All within tolerance', 'No batch is outside the ±8% variance band.');
    return `<div class="alert-list">${rows.map((b) => `
      <div class="alert-item">
        <span class="alert-ic ${Math.abs(b.variancePct) > 15 ? 'danger' : 'warn'}">${icon('alert')}</span>
        <div><div class="alert-t">${esc(b.batchNo)} · ${esc(b.productName)}</div><div class="alert-x">${esc(b.line)} · ${num(b.plannedQty)} planned vs ${num(b.actualQty)} actual</div></div>
        <span class="alert-meta" style="color:var(--danger);font-weight:500">${b.variancePct > 0 ? '+' : ''}${b.variancePct}%</span>
      </div>`).join('')}</div>`;
  }

  function invoiceTable(rows) {
    if (!rows.length) return emptyState('No invoices yet', 'Invoices are generated when orders are confirmed.');
    return `<div class="table-wrap"><table class="data">
      <thead><tr><th>Invoice</th><th>Customer</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map((i) => `
        <tr>
          <td><div class="cell-main">${esc(i.invoiceNo)}</div><div class="cell-sub">${esc(i.orderNo)}</div></td>
          <td><div class="cell-main" style="font-weight:400;font-size:11.5px">${esc(i.customer)}</div><div class="cell-sub">${esc(i.city)}</div></td>
          <td><span class="cell-strong">${inr(i.amount)}</span></td>
          <td><div class="cell-main" style="font-weight:400;font-size:11.5px">${dtShort(i.dueDate)}</div><div class="cell-sub">${esc(i.method)}</div></td>
          <td>${badge(i.status)}</td>
          <td>${i.status !== 'paid' && ['accountant', 'admin', 'owner'].includes(state.user.role) ? `<button class="row-action" data-pay="${esc(i.id)}" title="Mark paid">${icon('check')}</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  function topProductsList() {
    return `<div class="table-wrap"><table class="data">
      <thead><tr><th>Product</th><th>Units</th><th>Revenue</th></tr></thead>
      <tbody>${state.data.topProducts.map((p, i) => `
        <tr>
          <td><div class="cell-flex"><span class="mini-avatar ${i % 2 ? 'olive' : ''}">${i + 1}</span><div><div class="cell-main" style="font-size:11.5px">${esc(p.name)}</div><div class="cell-sub">${esc(p.sku)}</div></div></div></td>
          <td class="cell-num">${num(p.qty)}</td>
          <td><span class="cell-strong" style="font-size:14px">${inrCompact(p.revenue)}</span></td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  function auditSummary() {
    const types = ['Pre-Production', 'In-Process', 'Final Dispatch', 'Inventory', 'Financial'];
    return `<div class="hbar">${types.map((t) => {
      const rows = state.data.audits.filter((a) => a.type === t);
      const avg = rows.length ? Math.round(rows.reduce((s, a) => s + a.score, 0) / rows.length) : 0;
      return `<div class="hbar-row"><div class="hbar-top"><span>${t}</span><b>${avg}/100</b></div><div class="hbar-track"><div class="hbar-fill" style="width:${avg}%;background:${avg >= 90 ? '#5F7A52' : avg >= 80 ? '#B76E4B' : '#C08A3E'}"></div></div></div>`;
    }).join('')}</div>`;
  }

  /* ---------------- Views ---------------- */
  function productsView() {
    const products = state.data.products || [];
    return pageHead('Products', 'Create and manage the product master used by Sales and Production.',
      `<button class="btn btn-sm" data-action="new-product">${icon('plus')} Add Product</button>`) +
      `<div class="kpi-grid">
        ${kpi('Total Products', products.length, { icon: 'box', note: 'registered product SKUs' })}
        ${kpi('Active Products', products.filter(p => p.status !== 'inactive').length, { icon: 'check', tone: 'olive', note: 'available for orders' })}
      </div>
      <section class="panel"><div class="panel-head"><div><h3>Product Register</h3><p>${products.length} products available</p></div></div>
      <div class="panel-body flush"><div class="table-wrap"><table class="data">
      <thead><tr><th>SKU</th><th>Product</th><th>Category</th><th>Unit</th><th>Unit Price</th><th>Status</th></tr></thead>
      <tbody>${products.length ? products.map(p => `<tr><td>${esc(p.sku)}</td><td><div class="cell-main">${esc(p.name)}</div><div class="cell-sub">${esc(p.line || 'General')}</div></td><td>${esc(p.category)}</td><td>${esc(p.unit)}</td><td class="cell-num">${inr(p.price)}</td><td>${badge(p.status || 'active')}</td></tr>`).join('') : `<tr><td colspan="6" style="text-align:center;padding:34px;color:var(--muted)">No products yet. Click “Add Product” to create your first product.</td></tr>`}</tbody>
      </table></div></div></section>`;
  }

  function ordersView() {
    const d = state.data;
    let rows = d.orders.slice();
    if (state.orderFilter !== 'all') rows = rows.filter((o) => o.status === state.orderFilter);
    if (state.orderQuery) {
      const q = state.orderQuery.toLowerCase();
      rows = rows.filter((o) => o.orderNo.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q) || o.city.toLowerCase().includes(q));
    }
    const statuses = ['all', 'pending', 'confirmed', 'in_production', 'packed', 'dispatched', 'delivered', 'cancelled'];
    const canCreate = ['salesman', 'admin', 'owner'].includes(state.user.role);
    return pageHead('Orders', 'Every order, from the first enquiry to proof of delivery.',
      `${canCreate ? `<button class="btn btn-sm" data-action="new-order">${icon('plus')} New Order</button>` : ''}
       <button class="btn btn-sm btn-ghost" data-action="export-orders">${icon('download')} Export</button>`) +
      `<div class="kpi-grid">
        ${kpi('Total Orders', d.kpis.orderCount, { icon: 'orders', note: 'all time' })}
        ${kpi('Open Pipeline', d.kpis.openOrders, { icon: 'clock', tone: 'info', note: 'not yet delivered' })}
        ${kpi('Avg Order Value', inr(d.kpis.avgOrderValue), { icon: 'chart', tone: 'olive', note: 'per order' })}
        ${kpi('On-time Delivery', d.kpis.onTimePct + '<small>%</small>', { icon: 'truck', tone: 'warn', note: 'delivered orders' })}
      </div>
      <section class="panel">
        <div class="panel-head">
          <div><h3>Order Register</h3><p>${rows.length} orders shown${state.orderQuery ? ` for “${esc(state.orderQuery)}”` : ''}</p></div>
          <div class="panel-actions"><span class="badge no-dot neutral">${d.orders.length} total</span></div>
        </div>
        <div class="toolbar">
          <div class="segmented" id="orderFilter">
            ${statuses.map((s) => `<button data-status="${s}" class="${state.orderFilter === s ? 'active' : ''}">${s === 'all' ? 'All' : statusLabel(s)}</button>`).join('')}
          </div>
          <div class="search-inline">${icon('search')}<input id="orderSearch" placeholder="Search order or customer" value="${esc(state.orderQuery)}" /></div>
        </div>
        <div class="panel-body flush">${ordersTable(rows)}</div>
      </section>`;
  }

  function productionView() {
    const d = state.data;
    const canAct = ['production', 'admin', 'owner'].includes(state.user.role);
    return pageHead('Production', 'Plan batches, capture actuals and close the variance loop.',
      canAct ? `<button class="btn btn-sm" data-action="new-batch">${icon('plus')} Start Batch</button>` : '') +
      `<div class="kpi-grid">
        ${kpi('Active Batches', d.kpis.activeBatches, { icon: 'production', note: 'on the floor' })}
        ${kpi('Average Yield', d.kpis.avgYield + '<small>%</small>', { icon: 'scale', tone: 'olive', note: 'completed batches', delta: 2 })}
        ${kpi('Variance Alerts', d.kpis.varianceAlerts, { icon: 'alert', tone: 'warn', note: 'beyond ±8%' })}
        ${kpi('Total Wastage', num(d.batches.reduce((s, b) => s + b.wastageQty, 0)) + '<small>kg</small>', { icon: 'box', tone: 'danger', note: 'across all batches' })}
      </div>
      <div class="grid-2-1">
        ${panel('Planned vs Actual Output', 'Last ten completed batches', '<div id="prodBars"></div>', {
          actions: '<div class="chart-legend"><span><i style="background:#9A9E77"></i>Planned</span><span><i style="background:#B76E4B"></i>Actual</span></div>'
        })}
        ${panel('Yield Distribution', 'Batch count by yield band', `
          <div class="hbar">
            ${[['≥ 98%', d.batches.filter((b) => b.yieldPct >= 98).length], ['94–98%', d.batches.filter((b) => b.yieldPct >= 94 && b.yieldPct < 98).length], ['88–94%', d.batches.filter((b) => b.yieldPct >= 88 && b.yieldPct < 94).length], ['< 88%', d.batches.filter((b) => b.yieldPct < 88).length]].map(([l, v]) => `
            <div class="hbar-row"><div class="hbar-top"><span>${l}</span><b>${v} batches</b></div><div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(4, (v / d.batches.length) * 100)}%"></div></div></div>`).join('')}
          </div>
          <div class="stat-strip" style="margin-top:18px">
            <div><div class="ss-l">QC Passed</div><div class="ss-v">${d.batches.filter((b) => b.qcStatus === 'passed').length}</div></div>
            <div><div class="ss-l">Rework</div><div class="ss-v">${d.batches.filter((b) => b.qcStatus === 'rework').length}</div></div>
          </div>`)}
      </div>
      <section class="panel">
        <div class="panel-head"><div><h3>Batch Register</h3><p>${d.batches.length} batches across seven lines</p></div>
        <div class="panel-actions"><span class="badge no-dot neutral">${d.batches.filter((b) => b.status === 'completed').length} completed</span></div></div>
        <div class="panel-body flush">${batchTable(d.batches)}</div>
      </section>`;
  }

  function inventoryView() {
    const d = state.data;
    let rows = d.inventory.slice();
    if (state.invFilter !== 'all') rows = rows.filter((i) => i.status === state.invFilter);
    const canEdit = ['production', 'admin', 'owner'].includes(state.user.role);
return pageHead('Inventory', 'Stock cover, reorder levels and shelf-life across three warehouses.',
  `<button class="btn btn-sm" data-action="new-inventory">${icon('plus')} Add Inventory</button>
  <button class="btn btn-sm btn-ghost" data-action="export-inventory">${icon('download')} Export</button>`) +
  `<div class="kpi-grid">
        ${kpi('Inventory Value', inrCompact(d.kpis.inventoryValue), { icon: 'inventory', note: 'at unit cost' })}
        ${kpi('SKUs Tracked', d.inventory.length, { icon: 'box', tone: 'info', note: 'across 3 warehouses' })}
        ${kpi('Low Stock', d.kpis.lowStockCount, { icon: 'alert', tone: 'warn', note: 'at or below reorder' })}
        ${kpi('Critical / Out', d.kpis.criticalStockCount, { icon: 'alert', tone: 'danger', note: 'needs immediate PO' })}
      </div>
      <section class="panel">
        <div class="panel-head"><div><h3>Stock Register</h3><p>${rows.length} SKUs shown</p></div>
          <div class="panel-actions"><span class="badge no-dot neutral">${d.inventory.length} total</span></div></div>
        <div class="toolbar">
          <div class="segmented" id="invFilter">
            ${['all', 'healthy', 'low', 'critical', 'out'].map((s) => `<button data-inv="${s}" class="${state.invFilter === s ? 'active' : ''}">${s === 'all' ? 'All' : statusLabel(s)}</button>`).join('')}
          </div>
        </div>
        <div class="panel-body flush"><div class="table-wrap"><table class="data">
          <thead><tr><th>Product</th><th>Warehouse</th><th>Stock</th><th>Reorder</th><th>Expiry</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows.map((i) => `
            <tr>
              <td><div class="cell-main">${esc(i.name)}</div><div class="cell-sub">${esc(i.sku)} · ${esc(i.category)}</div></td>
              <td><div class="cell-main" style="font-weight:400;font-size:11.5px">${esc(i.warehouse)}</div><div class="cell-sub">Batch ${esc(i.batch)}</div></td>
              <td class="stock-cell">
                <div class="stock-top"><b>${num(i.stock)}</b><span>${esc(i.unit)}</span></div>
                <div class="stock-track"><div class="stock-fill ${i.status}" style="width:${Math.min(100, Math.round((i.stock / (i.reorderLevel * 2)) * 100))}%"></div></div>
              </td>
              <td class="cell-num">${num(i.reorderLevel)}</td>
              <td><div class="cell-main" style="font-weight:400;font-size:11.5px">${dtShort(i.expiry)}</div><div class="cell-sub">${new Date(i.expiry) < new Date() ? 'Expired' : 'In date'}</div></td>
              <td>${badge(i.status)}</td>
              <td>${canEdit ? `<button class="row-action" data-stock="${esc(i.id)}" title="Adjust stock">${icon('edit')}</button>` : ''}</td>
            </tr>`).join('')}</tbody></table></div></div>
      </section>`;
  }

  function auditsView() {
    const d = state.data;
    let rows = d.audits.slice();
    if (state.auditFilter !== 'all') rows = rows.filter((a) => a.status === state.auditFilter);
    const canCreate = ['accountant', 'admin', 'owner'].includes(state.user.role);
    return pageHead('Audits', 'Scored assurance across production, dispatch, inventory and finance.',
      canCreate ? `<button class="btn btn-sm" data-action="new-audit">${icon('plus')} Record Audit</button>` : '') +
      `<div class="kpi-grid">
        ${kpi('Average Score', d.kpis.avgAuditScore + '<small>/100</small>', { icon: 'shield', tone: 'olive', note: 'all audit types' })}
        ${kpi('Open Audits', d.kpis.openAudits, { icon: 'clock', tone: 'info', note: 'in progress' })}
        ${kpi('Closed Audits', d.audits.filter((a) => a.status === 'closed').length, { icon: 'check', note: 'this cycle' })}
        ${kpi('Critical Findings', d.audits.reduce((s, a) => s + a.criticalFindings, 0), { icon: 'alert', tone: 'danger', note: 'across all audits' })}
      </div>
      <div class="grid-2-1">
        ${panel('Compliance by Audit Type', 'Average score across the five assurance tracks', auditSummary(), {
          actions: `<span class="badge ${d.kpis.avgAuditScore >= 90 ? 'excellent' : 'compliant'}">${d.kpis.avgAuditScore}/100</span>`
        })}
        ${panel('Findings Summary', 'Open and closed observations', `
          <div class="stat-strip" style="grid-template-columns:1fr 1fr;border-top:0">
            <div><div class="ss-l">Total Findings</div><div class="ss-v">${d.audits.reduce((s, a) => s + a.findings, 0)}</div></div>
            <div><div class="ss-l">Critical</div><div class="ss-v">${d.audits.reduce((s, a) => s + a.criticalFindings, 0)}</div></div>
            <div><div class="ss-l">Excellent</div><div class="ss-v">${d.audits.filter((a) => a.result === 'excellent').length}</div></div>
            <div><div class="ss-l">Needs Action</div><div class="ss-v">${d.audits.filter((a) => a.result === 'needs_attention').length}</div></div>
          </div>
          <div style="margin-top:16px">${hbar([{ label: 'Pre-Production', value: d.audits.filter((a) => a.type === 'Pre-Production').length }, { label: 'In-Process', value: d.audits.filter((a) => a.type === 'In-Process').length }, { label: 'Final Dispatch', value: d.audits.filter((a) => a.type === 'Final Dispatch').length }, { label: 'Inventory', value: d.audits.filter((a) => a.type === 'Inventory').length }, { label: 'Financial', value: d.audits.filter((a) => a.type === 'Financial').length }], (v) => v + ' audits')}</div>`)}
      </div>
      <section class="panel">
        <div class="panel-head"><div><h3>Audit Register</h3><p>${rows.length} audits shown</p></div>
          <div class="panel-actions"><div class="segmented" id="auditFilter">
            ${['all', 'in_progress', 'closed'].map((s) => `<button data-audit="${s}" class="${state.auditFilter === s ? 'active' : ''}">${s === 'all' ? 'All' : statusLabel(s)}</button>`).join('')}
          </div></div></div>
        <div class="panel-body flush"><div class="table-wrap"><table class="data">
          <thead><tr><th>Audit</th><th>Scope</th><th>Auditor</th><th>Date</th><th>Score</th><th>Findings</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows.map((a) => `
            <tr>
              <td><div class="cell-main">${esc(a.auditNo)}</div><div class="cell-sub">${esc(a.type)}</div></td>
              <td><div class="cell-main" style="font-weight:400;font-size:11.5px">${esc(a.scope)}</div><div class="cell-sub">${esc(a.notes).slice(0, 46)}…</div></td>
              <td>${esc(a.auditor)}</td>
              <td class="cell-num">${dtShort(a.date)}</td>
              <td><span class="cell-strong">${a.score}</span><span class="cell-sub" style="display:inline">/100</span></td>
              <td class="cell-num">${a.findings}${a.criticalFindings ? ` <span class="badge overdue no-dot" style="font-size:8px">${a.criticalFindings} critical</span>` : ''}</td>
              <td>${badge(a.status)}</td>
              <td>${a.status === 'in_progress' && canCreate ? `<button class="row-action" data-close-audit="${esc(a.id)}" title="Close audit">${icon('check')}</button>` : ''}</td>
            </tr>`).join('')}</tbody></table></div></div>
      </section>`;
  }

  function financeView() {
    const d = state.data;
    const paid = d.invoices.filter((i) => i.status === 'paid');
    const pending = d.invoices.filter((i) => i.status === 'pending');
    const overdue = d.invoices.filter((i) => i.status === 'overdue');
    const canPay = ['accountant', 'admin', 'owner'].includes(state.user.role);
    return pageHead('Finance', 'GST invoicing, receivables ageing and collection status.',
      `<button class="btn btn-sm btn-ghost" data-action="export-invoices">${icon('download')} Export</button>`) +
      `<div class="kpi-grid">
        ${kpi('Receivables', inrCompact(d.kpis.receivables), { icon: 'wallet', note: `${pending.length + overdue.length} open invoices` })}
        ${kpi('Collected', inrCompact(paid.reduce((s, i) => s + i.amount, 0)), { icon: 'check', tone: 'olive', note: `${paid.length} invoices settled` })}
        ${kpi('Overdue', inrCompact(d.kpis.overdueAmount), { icon: 'alert', tone: 'danger', note: `${overdue.length} past due` })}
        ${kpi('GST Collected', inrCompact(d.invoices.reduce((s, i) => s + i.gst, 0)), { icon: 'finance', tone: 'info', note: 'at 12% on invoiced value' })}
      </div>
      <div class="grid-2-1">
        ${panel('Billed Value', 'Invoice value by month', '<div id="finChart"></div>')}
        ${panel('Ageing Buckets', 'Outstanding receivables', hbar([
          { label: 'Current', value: pending.reduce((s, i) => s + i.amount, 0) },
          { label: '1–30 days overdue', value: overdue.reduce((s, i) => s + i.amount, 0) * 0.6 },
          { label: '31–60 days overdue', value: overdue.reduce((s, i) => s + i.amount, 0) * 0.28 },
          { label: '60+ days overdue', value: overdue.reduce((s, i) => s + i.amount, 0) * 0.12 }
        ], inrCompact), { actions: `<span class="badge ${overdue.length ? 'overdue' : 'paid'}">${overdue.length} overdue</span>` })}
      </div>
      <section class="panel">
        <div class="panel-head"><div><h3>Invoice Register</h3><p>${d.invoices.length} invoices · GST compliant</p></div>
          <div class="panel-actions"><span class="badge no-dot neutral">${inrCompact(d.invoices.reduce((s, i) => s + i.amount, 0))} billed</span></div></div>
        <div class="panel-body flush">${invoiceTable(d.invoices)}</div>
      </section>`;
  }

  function teamView() {
    const d = state.data;
    const roleCounts = ['salesman', 'admin', 'production', 'accountant', 'owner'].map((r) => ({ label: titleCase(r), value: d.users.filter((u) => u.role === r).length }));
    const canEdit = ['admin', 'owner'].includes(state.user.role);
    return pageHead('Team', 'People, roles and access across the organisation.',
      `<button class="btn btn-sm btn-ghost" data-action="export-team">${icon('download')} Export</button>`) +
      `<div class="kpi-grid">
        ${kpi('Team Members', d.users.length, { icon: 'team', note: 'active accounts' })}
        ${kpi('Sales Force', d.users.filter((u) => u.role === 'salesman').length, { icon: 'orders', tone: 'info', note: 'field executives' })}
        ${kpi('Operations', d.users.filter((u) => ['admin', 'production'].includes(u.role)).length, { icon: 'production', tone: 'olive', note: 'admin & floor' })}
        ${kpi('Assurance', d.users.filter((u) => ['accountant', 'owner'].includes(u.role)).length, { icon: 'shield', tone: 'warn', note: 'finance & ownership' })}
      </div>
      <div class="grid-2-1">
        <section class="panel">
          <div class="panel-head"><div><h3>Directory</h3><p>Role-based access is enforced on every API call</p></div></div>
          <div class="panel-body flush"><div class="table-wrap"><table class="data">
            <thead><tr><th>Member</th><th>Role</th><th>Region</th><th>Last Login</th><th>Status</th><th></th></tr></thead>
            <tbody>${d.users.map((u) => `
              <tr>
                <td><div class="cell-flex"><span class="mini-avatar ${u.role === 'owner' ? '' : u.role === 'production' ? 'olive' : 'info'}">${esc(u.initials || initials(u.name))}</span><div><div class="cell-main">${esc(u.name)}</div><div class="cell-sub">${esc(u.email)}</div></div></div></td>
                <td><div class="cell-main" style="font-weight:400;font-size:11.5px">${titleCase(u.role)}</div><div class="cell-sub">${esc(u.title)}</div></td>
                <td style="font-size:11.5px">${esc(u.region)}</td>
                <td class="cell-num">${timeAgo(u.lastLogin)}</td>
                <td>${badge(u.status)}</td>
                <td>${canEdit && u.id !== state.user.id ? `<button class="row-action" data-user="${esc(u.id)}" data-status="${u.status}" title="${u.status === 'active' ? 'Deactivate' : 'Activate'}">${icon(u.status === 'active' ? 'x' : 'check')}</button>` : ''}</td>
              </tr>`).join('')}</tbody></table></div></div>
        </section>
        ${panel('Role Distribution', 'Headcount by workspace', hbar(roleCounts, (v) => v + ' people') +
          `<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line-soft)">
            <div class="ss-l" style="margin-bottom:8px">Access model</div>
            <p style="font-size:11px;color:var(--muted);line-height:1.7">Salesmen see only their own order book. Production sees the floor. Accounts sees finance and audit. Owners see everything. Administrators manage people and approvals.</p>
          </div>`)}
      </div>`;
  }

  function reportsView() {
    const d = state.data;
    return pageHead('Reports', 'Consolidated business intelligence across sales, production and assurance.',
      `<button class="btn btn-sm btn-ghost" data-action="export-orders">${icon('download')} Export Orders</button>
       <button class="btn btn-sm" onclick="window.print()">${icon('printer')} Print</button>`) +
      `<div class="kpi-grid">
        ${kpi('Revenue', inrCompact(d.kpis.revenue), { icon: 'wallet', note: 'last 6 months', delta: 12 })}
        ${kpi('Orders', d.kpis.orderCount, { icon: 'orders', tone: 'info', note: `${d.kpis.deliveredCount} delivered` })}
        ${kpi('Avg Yield', d.kpis.avgYield + '<small>%</small>', { icon: 'scale', tone: 'olive', note: 'production efficiency' })}
        ${kpi('Audit Score', d.kpis.avgAuditScore + '<small>/100</small>', { icon: 'shield', tone: 'warn', note: 'compliance posture' })}
      </div>
      <div class="grid-2-1">${revenuePanel('Monthly revenue and order volume')}
        ${panel('Regional Split', 'Booked value by state', hbar(d.regionSales.map((r) => ({ label: r.region, value: r.value })), inrCompact))}
      </div>
      <div class="grid-2-1">
        ${panel('Category Contribution', 'Revenue by product family', `
          <div class="donut-wrap"><div id="catDonut"></div>
            <div class="donut-legend">${d.categoryMix.map((c, i) => `<div class="dl-item"><i style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></i><span class="dl-name">${esc(c.category)}</span><span class="dl-val">${inrCompact(c.value)}</span></div>`).join('')}</div>
          </div>`)}
        ${panel('Top Products', 'Ranked by revenue', topProductsList(), { flush: true })}
      </div>
      <div class="grid-2">
        ${panel('Production Variance', 'Planned vs actual output', '<div id="prodBars"></div>')}
        ${panel('Order Lifecycle', 'Current distribution', statusBody())}
      </div>`;
  }

  function settingsView() {
    const u = state.user;
    const d = state.data;
    const roleDesc = {
      salesman: 'Raise and track your own orders, view live stock availability and follow up collections.',
      admin: 'Approve orders, coordinate dispatch, manage inventory and master data across units.',
      production: 'Schedule batches, capture actual output and wastage, and close QC checks.',
      accountant: 'Manage GST invoices, receivables ageing and record scored compliance audits.',
      owner: 'Full visibility across every module, including team, finance and consolidated reports.'
    };
    return pageHead('Settings', 'Your profile, workspace preferences and access model.', '') +
      `<div class="grid-2-1">
        <section class="panel">
          <div class="panel-head"><div><h3>Profile</h3><p>Account details as held in the user master</p></div></div>
          <div class="panel-body">
            <div style="display:flex;align-items:center;gap:18px;padding-bottom:20px;border-bottom:1px solid var(--line-soft)">
              <div class="sb-avatar" style="width:64px;height:64px;font-size:24px">${esc(u.initials || initials(u.name))}</div>
              <div><h3 style="font-size:24px">${esc(u.name)}</h3><p class="cell-sub" style="font-size:11px">${esc(u.title)} · ${esc(u.region)}</p>
              <div style="margin-top:6px">${badge(u.role)} ${badge(u.status)}</div></div>
            </div>
            <div class="grid-2" style="margin:18px 0 0;gap:14px">
              <div class="field"><label>Email</label><div class="input" style="background:rgba(245,235,221,.35)">${esc(u.email)}</div></div>
              <div class="field"><label>Phone</label><div class="input" style="background:rgba(245,235,221,.35)">${esc(u.phone)}</div></div>
              <div class="field"><label>Username</label><div class="input" style="background:rgba(245,235,221,.35)">${esc(u.username)}</div></div>
              <div class="field"><label>Role</label><div class="input" style="background:rgba(245,235,221,.35);text-transform:capitalize">${esc(u.role)}</div></div>
            </div>
            <div class="role-hero" style="margin:20px 0 0">
              <span class="rh-ic">${icon('shield')}</span>
              <div><h4>${titleCase(u.role)} access</h4><p>${roleDesc[u.role]}</p></div>
            </div>
          </div>
        </section>
        <div style="display:grid;gap:16px;align-content:start">
          ${panel('Workspace', 'Environment and data source', `
            <div class="alert-list">
              <div class="alert-item"><span class="alert-ic ok">${icon('check')}</span><div><div class="alert-t">Backend connected</div><div class="alert-x">Express API · ${d.storeMode === 'mongo' ? 'MongoDB' : 'local file store'}</div></div></div>
              <div class="alert-item"><span class="alert-ic info">${icon('shield')}</span><div><div class="alert-t">JWT session</div><div class="alert-x">12-hour token · role-scoped endpoints</div></div></div>
              <div class="alert-item"><span class="alert-ic ok">${icon('leaf')}</span><div><div class="alert-t">FoodFlow Foods Pvt. Ltd.</div><div class="alert-x">Unit I Trichy · Unit II Thanjavur · Cold Store Chennai</div></div></div>
            </div>`)}
          ${panel('Preferences', 'Interface behaviour', `
            <div class="alert-list">
              <div class="alert-item"><span class="alert-ic info">${icon('bell')}</span><div><div class="alert-t">Operational alerts</div><div class="alert-x">Variance, stock and overdue notifications</div></div><span class="badge healthy no-dot">On</span></div>
              <div class="alert-item"><span class="alert-ic info">${icon('mail')}</span><div><div class="alert-t">Daily digest</div><div class="alert-x">Sent at 08:00 IST to ${esc(u.email)}</div></div><span class="badge healthy no-dot">On</span></div>
              <div class="alert-item"><span class="alert-ic info">${icon('chart')}</span><div><div class="alert-t">Compact tables</div><div class="alert-x">Denser rows on large screens</div></div><span class="badge neutral no-dot">Off</span></div>
            </div>`)}
          <button class="btn btn-dark" id="settingsLogout" style="width:100%">${icon('logout')} Sign out of workspace</button>
        </div>
      </div>`;
  }

  /* ---------------- Chart mounting ---------------- */
  function mountCharts() {
    const d = state.data;
    if ($('#revChart')) areaChart($('#revChart'), d.monthly, {
      valueKey: 'revenue', labelKey: 'label', height: 250,
      tooltip: (m) => `${inr(m.revenue)} · ${m.orders} orders`
    });
    if ($('#finChart')) areaChart($('#finChart'), d.monthly, {
      valueKey: 'revenue', labelKey: 'label', height: 250,
      tooltip: (m) => `${inr(m.revenue)} billed`
    });
    if ($('#statusDonut')) {
      const colors = { pending: '#C08A3E', confirmed: '#6B7C8A', in_production: '#B76E4B', packed: '#777B54', dispatched: '#4C6570', delivered: '#5F7A52', cancelled: '#A94F3E' };
      const items = d.statusBreakdown.filter((s) => s.count > 0).map((s) => ({ label: s.key, value: s.count, color: colors[s.key] }));
      donutChart($('#statusDonut'), items, { centerValue: d.orders.length, centerLabel: 'Orders' });
    }
    if ($('#catDonut')) {
      const items = d.categoryMix.slice(0, 7).map((c, i) => ({ label: c.category, value: c.value, color: CHART_COLORS[i % CHART_COLORS.length] }));
      donutChart($('#catDonut'), items, { centerValue: inrCompact(d.kpis.revenue), centerLabel: 'Revenue' });
    }
    if ($('#prodBars')) barChart($('#prodBars'), d.productionTrend, { height: 236 });
  }

  /* ---------------- Render ---------------- */
  function render() {
    const views = {
      overview: overviewView, products: productsView, orders: ordersView, production: productionView, inventory: inventoryView,
      audits: auditsView, finance: financeView, team: teamView, reports: reportsView, settings: settingsView
    };
    const el = $('#content');
    el.innerHTML = views[state.view] ? views[state.view]() : overviewView();
    mountCharts();
    bindView();
  }

  function bindView() {
    $$('[data-action="new-product"]').forEach((b) => b.addEventListener('click', openProductModal));
    $$('[data-action="new-inventory"]').forEach((b) => b.addEventListener('click', openInventoryModal));
    $$('[data-action="new-order"]').forEach((b) => b.addEventListener('click', openOrderModal));
    $$('[data-action="new-batch"]').forEach((b) => b.addEventListener('click', () => openBatchModal()));
    $$('[data-action="new-audit"]').forEach((b) => b.addEventListener('click', () => openAuditModal()));
    $$('[data-action="export-orders"]').forEach((b) => b.addEventListener('click', exportOrders));
    $$('[data-action="export-invoices"]').forEach((b) => b.addEventListener('click', exportInvoices));
    $$('[data-action="export-inventory"]').forEach((b) => b.addEventListener('click', exportInventory));
    $$('[data-action="export-team"]').forEach((b) => b.addEventListener('click', exportTeam));
    $$('[data-order]').forEach((b) => b.addEventListener('click', () => openOrderDetail(b.dataset.order)));
    $$('[data-batch]').forEach((b) => b.addEventListener('click', () => openBatchModal(b.dataset.batch)));
    $$('[data-stock]').forEach((b) => b.addEventListener('click', () => openStockModal(b.dataset.stock)));
    $$('[data-pay]').forEach((b) => b.addEventListener('click', () => markPaid(b.dataset.pay)));
    $$('[data-close-audit]').forEach((b) => b.addEventListener('click', () => closeAudit(b.dataset.closeAudit)));
    $$('[data-user]').forEach((b) => b.addEventListener('click', () => toggleUser(b.dataset.user, b.dataset.status)));

    const of = $('#orderFilter');
    if (of) $$('button', of).forEach((b) => b.addEventListener('click', () => { state.orderFilter = b.dataset.status; render(); }));
    const os = $('#orderSearch');
    if (os) {
      os.addEventListener('input', debounce(() => { state.orderQuery = os.value.trim(); render(); const f = $('#orderSearch'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }, 320));
    }
    const inv = $('#invFilter');
    if (inv) $$('button', inv).forEach((b) => b.addEventListener('click', () => { state.invFilter = b.dataset.inv; render(); }));
    const af = $('#auditFilter');
    if (af) $$('button', af).forEach((b) => b.addEventListener('click', () => { state.auditFilter = b.dataset.audit; render(); }));
    const sl = $('#settingsLogout');
    if (sl) sl.addEventListener('click', logout);
  }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  /* ---------------- Modals ---------------- */
  function openModal({ title, sub, body, footer, wide }) {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `<div class="modal" style="${wide ? 'width:min(760px,100%)' : ''}">
      <div class="modal-head"><div style="flex:1"><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
      <button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
    return { back, close };
  }

  async function refresh() {
    const d = await api('/api/bootstrap');
    state.data = d;
    state.user = d.user;
    localStorage.setItem('ff_user', JSON.stringify(d.user));
    renderShell();
    render();
  }

  function openProductModal() {
    const body = `<div class="grid-2">
      <div class="field"><label>Product name *</label><input class="input" id="prName" placeholder="e.g. Tomato Sauce" /></div>
      <div class="field"><label>SKU *</label><input class="input" id="prSku" placeholder="e.g. SAU-001" /></div>
      <div class="field"><label>Category *</label><input class="input" id="prCategory" placeholder="e.g. Sauces" /></div>
      <div class="field"><label>Unit *</label><select class="select" id="prUnit"><option value="bottle">Bottle</option><option value="kg">Kg</option><option value="packet">Packet</option><option value="box">Box</option><option value="litre">Litre</option><option value="piece">Piece</option></select></div>
      <div class="field"><label>Unit price (₹) *</label><input class="input" id="prPrice" type="number" min="0" step="0.01" placeholder="100" /></div>
      <div class="field"><label>Shelf life (days)</label><input class="input" id="prShelf" type="number" min="0" value="0" /></div>
      <div class="field"><label>Production line</label><input class="input" id="prLine" placeholder="e.g. Sauce Line" /></div>
      <div class="field"><label>GST (%)</label><input class="input" id="prGst" type="number" min="0" value="12" /></div>
    </div>`;
    const m = openModal({ title: 'Add a product', sub: 'New products will become available in Sales orders and Production batches.', body, footer: `<button class="btn btn-sm btn-ghost" data-close>Cancel</button><button class="btn btn-sm" id="prSave">Save Product</button>` });
    $('#prSave', m.back).addEventListener('click', async () => {
      const payload = { name: $('#prName', m.back).value.trim(), sku: $('#prSku', m.back).value.trim(), category: $('#prCategory', m.back).value.trim(), unit: $('#prUnit', m.back).value, price: Number($('#prPrice', m.back).value), shelfLife: Number($('#prShelf', m.back).value) || 0, line: $('#prLine', m.back).value.trim(), gst: Number($('#prGst', m.back).value) || 0 };
      if (!payload.name || !payload.sku || !payload.category || !payload.unit || $('#prPrice', m.back).value === '' || !Number.isFinite(payload.price) || payload.price < 0) { toast('Missing details', 'Complete all required fields and enter a valid price.', 'error'); return; }
      const btn = $('#prSave', m.back); btn.disabled = true; btn.textContent = 'Saving…';
      try { await api('/api/products', 'POST', payload); m.close(); await refresh(); toast('Product added', `${payload.name} is now available for orders.`, 'success'); }
      catch (e) { toast('Could not add product', e.message, 'error'); btn.disabled = false; btn.textContent = 'Save Product'; }
    });
  }

  function openOrderModal() {
    if (!state.data.products || !state.data.products.length) {
      toast('No products available', 'Ask an Admin or Owner to add products in the Products workspace first.', 'error');
      return;
    }
    const products = state.data.products;
    const customers = [...new Set(state.data.orders.map((o) => o.customer))];
    const rowsHtml = () => `<div class="line-row" style="display:grid;grid-template-columns:1fr 88px 34px;gap:8px;align-items:end;margin-bottom:8px">
      <div class="field"><label>Product</label><select class="select" data-prod>${products.map((p) => `<option value="${p.id}" data-price="${p.price}">${esc(p.name)} — ${inr(p.price)}</option>`).join('')}</select></div>
      <div class="field"><label>Qty</label><input class="input" type="number" min="1" value="12" data-qty /></div>
      <button type="button" class="icon-btn" data-remove style="margin-bottom:1px">${icon('x')}</button>
    </div>`;

    const body = `<div class="grid-2">
        <div class="field"><label>Customer</label><input class="input" id="ordCustomer" list="custList" placeholder="e.g. Saravana Bhavan Franchise" /><datalist id="custList">${customers.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="field"><label>City</label><input class="input" id="ordCity" placeholder="e.g. Chennai" value="Chennai" /></div>
        <div class="field"><label>Region</label><select class="select" id="ordRegion"><option>Tamil Nadu</option><option>Karnataka</option><option>Kerala</option><option>Andhra &amp; Telangana</option></select></div>
        <div class="field"><label>Priority</label><select class="select" id="ordPriority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></div>
        <div class="field"><label>Dispatch by</label><input class="input" type="date" id="ordDue" value="${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}" /></div>
        <div class="field"><label>Notes</label><input class="input" id="ordNotes" placeholder="Optional instruction" /></div>
      </div>
      <div style="border-top:1px solid var(--line-soft);padding-top:14px;margin-top:2px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)">Line items</span>
          <button type="button" class="btn btn-sm btn-ghost" id="addLine">${icon('plus')} Add</button>
        </div>
        <div id="lineWrap">${rowsHtml()}</div>
        <div style="display:flex;justify-content:flex-end;gap:26px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line-soft);font-size:12px">
          <span class="muted">Subtotal <b id="ordSub" style="color:var(--brown)">₹0</b></span>
          <span class="muted">GST 12% <b id="ordTax" style="color:var(--brown)">₹0</b></span>
          <span class="muted">Total <b id="ordTotal" style="color:var(--brown);font-family:var(--serif);font-size:17px">₹0</b></span>
        </div>
      </div>`;

    const m = openModal({
      title: 'Raise a new order', sub: 'Pricing and GST are calculated by the server from the product master.',
      body, wide: true,
      footer: `<button class="btn btn-sm btn-ghost" data-close>Cancel</button><button class="btn btn-sm" id="ordSubmit">Create Order</button>`
    });

    const wrap = $('#lineWrap', m.back);
    const recalc = () => {
      let sub = 0;
      $$('.line-row', wrap).forEach((row) => {
        const sel = $('[data-prod]', row);
        const price = Number(sel.selectedOptions[0].dataset.price) || 0;
        const qty = Number($('[data-qty]', row).value) || 0;
        sub += price * qty;
      });
      $('#ordSub', m.back).textContent = inr(sub);
      $('#ordTax', m.back).textContent = inr(sub * 0.12);
      $('#ordTotal', m.back).textContent = inr(sub * 1.12);
    };
    const bindRow = (row) => {
      $('[data-prod]', row).addEventListener('change', recalc);
      $('[data-qty]', row).addEventListener('input', recalc);
      $('[data-remove]', row).addEventListener('click', () => { if ($$('.line-row', wrap).length > 1) { row.remove(); recalc(); } });
    };
    $$('.line-row', wrap).forEach(bindRow);
    $('#addLine', m.back).addEventListener('click', () => {
      wrap.insertAdjacentHTML('beforeend', rowsHtml());
      bindRow($$('.line-row', wrap).slice(-1)[0]);
      recalc();
    });
    recalc();

    $('#ordSubmit', m.back).addEventListener('click', async () => {
      const customer = $('#ordCustomer', m.back).value.trim();
      if (!customer) { toast('Customer required', 'Please enter a customer name.', 'error'); return; }
      const items = $$('.line-row', wrap).map((row) => ({ productId: $('[data-prod]', row).value, qty: Number($('[data-qty]', row).value) || 1 }));
      const btn = $('#ordSubmit', m.back);
      btn.disabled = true; btn.textContent = 'Creating…';
      try {
        const res = await api('/api/orders', 'POST', {
          customer,
          city: $('#ordCity', m.back).value.trim() || 'Chennai',
          region: $('#ordRegion', m.back).value,
          priority: $('#ordPriority', m.back).value,
          dueDate: new Date($('#ordDue', m.back).value).toISOString(),
          notes: $('#ordNotes', m.back).value,
          items
        });
        m.close();
        await refresh();
        toast('Order created', `${res.order.orderNo} · ${inr(res.order.total)}`, 'success');
      } catch (e) {
        toast('Could not create order', e.message, 'error');
        btn.disabled = false; btn.textContent = 'Create Order';
      }
    });
  }

  function openOrderDetail(id) {
    const o = state.data.orders.find((x) => x.id === id);
    if (!o) return;
    const canUpdate = ['salesman', 'admin', 'owner'].includes(state.user.role);
    const statuses = ['pending', 'confirmed', 'in_production', 'packed', 'dispatched', 'delivered', 'cancelled'];
    const body = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-bottom:14px;border-bottom:1px solid var(--line-soft)">
        <div><div class="cell-main" style="font-size:17px">${esc(o.customer)}</div><div class="cell-sub">${esc(o.orderNo)} · ${esc(o.city)}, ${esc(o.region)}</div></div>
        <div style="text-align:right"><div class="cell-strong" style="font-size:22px">${inr(o.total)}</div><div class="cell-sub">incl. GST ${inr(o.tax)}</div></div>
      </div>
      <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div><div class="ss-l">Status</div><div style="margin-top:5px">${badge(o.status)}</div></div>
        <div><div class="ss-l">Priority</div><div style="margin-top:5px">${badge(o.priority === 'high' ? 'overdue' : o.priority === 'low' ? 'neutral' : 'info')} ${titleCase(o.priority)}</div></div>
        <div><div class="ss-l">Raised on</div><div class="cell-main" style="font-weight:400">${dt(o.createdAt)}</div></div>
        <div><div class="ss-l">Dispatch by</div><div class="cell-main" style="font-weight:400">${dt(o.dueDate)}</div></div>
      </div>
      <div style="border-top:1px solid var(--line-soft);padding-top:12px">
        <div class="ss-l" style="margin-bottom:8px">Line items</div>
        ${o.items.map((it) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px dashed var(--line-soft);font-size:12px">
          <div><div class="cell-main" style="font-size:12px">${esc(it.name)}</div><div class="cell-sub">${esc(it.sku)} · ${it.qty} × ${inr(it.unitPrice)}</div></div>
          <div class="cell-main" style="white-space:nowrap">${inr(it.lineTotal)}</div>
        </div>`).join('')}
        <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:12px"><span class="muted">Subtotal</span><span>${inr(o.subtotal)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:12px"><span class="muted">GST 12%</span><span>${inr(o.tax)}</span></div>
      </div>
      ${canUpdate ? `<div class="field"><label>Move order to</label><select class="select" id="ordStatus">${statuses.map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}</select></div>` : ''}`;

    const m = openModal({
      title: 'Order detail', sub: 'Full traceability from capture to delivery', body,
      footer: canUpdate ? `<button class="btn btn-sm btn-ghost" data-close>Close</button><button class="btn btn-sm" id="saveStatus">Update Status</button>` : `<button class="btn btn-sm btn-ghost" data-close>Close</button>`
    });
    const save = $('#saveStatus', m.back);
    if (save) save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const nextStatus = $('#ordStatus', m.back).value;
        await api(`/api/orders/${o.id}/status`, 'PATCH', { status: nextStatus });
        m.close();
        await refresh();
        toast('Order updated', `${o.orderNo} moved to ${statusLabel(nextStatus)}`, 'success');
      } catch (e) { toast('Update failed', e.message, 'error'); save.disabled = false; }
    });
  }

  function openBatchModal(batchId) {
    if (typeof batchId === 'string' && batchId) {
      const b = state.data.batches.find((x) => x.id === batchId);
      if (!b) return;
      const body = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:1px solid var(--line-soft)">
          <div><div class="cell-main" style="font-size:16px">${esc(b.batchNo)}</div><div class="cell-sub">${esc(b.productName)} · ${esc(b.line)}</div></div>
          ${badge(b.status)}
        </div>
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div><div class="ss-l">Planned</div><div class="ss-v">${num(b.plannedQty)} kg</div></div>
          <div><div class="ss-l">Actual so far</div><div class="ss-v">${num(b.actualQty)} kg</div></div>
          <div><div class="ss-l">Supervisor</div><div class="cell-main" style="font-weight:400">${esc(b.supervisor)}</div></div>
          <div><div class="ss-l">Shift</div><div class="cell-main" style="font-weight:400">${esc(b.shift)}</div></div>
        </div>
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="field"><label>Actual output (kg)</label><input class="input" type="number" id="bActual" value="${b.actualQty}" /></div>
          <div class="field"><label>Wastage (kg)</label><input class="input" type="number" id="bWaste" value="${b.wastageQty}" /></div>
          <div class="field"><label>QC result</label><select class="select" id="bQc"><option value="pending" ${b.qcStatus === 'pending' ? 'selected' : ''}>Pending</option><option value="passed" ${b.qcStatus === 'passed' ? 'selected' : ''}>Passed</option><option value="rework" ${b.qcStatus === 'rework' ? 'selected' : ''}>Rework</option></select></div>
          <div class="field"><label>Batch status</label><select class="select" id="bStatus"><option value="in_progress" ${b.status === 'in_progress' ? 'selected' : ''}>In Progress</option><option value="on_hold" ${b.status === 'on_hold' ? 'selected' : ''}>On Hold</option><option value="completed" ${b.status === 'completed' ? 'selected' : ''}>Completed</option></select></div>
        </div>`;
      const m = openModal({
        title: 'Update batch', sub: 'Variance and yield recalculate automatically on save.', body,
        footer: `<button class="btn btn-sm btn-ghost" data-close>Cancel</button><button class="btn btn-sm" id="bSave">Save Batch</button>`
      });
      $('#bSave', m.back).addEventListener('click', async () => {
        const btn = $('#bSave', m.back);
        btn.disabled = true;
        try {
          await api(`/api/batches/${b.id}`, 'PATCH', {
            actualQty: Number($('#bActual', m.back).value),
            wastageQty: Number($('#bWaste', m.back).value),
            qcStatus: $('#bQc', m.back).value,
            status: $('#bStatus', m.back).value
          });
          m.close(); await refresh(); toast('Batch updated', `${b.batchNo} saved`, 'success');
        } catch (e) { toast('Update failed', e.message, 'error'); btn.disabled = false; }
      });
      return;
    }

    const products = state.data.products;
    const body = `<div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="field"><label>Product</label><select class="select" id="nbProduct">${products.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Planned quantity (kg)</label><input class="input" type="number" id="nbQty" value="800" min="1" /></div>
        <div class="field"><label>Line</label><select class="select" id="nbLine">${['Blending Line A', 'Blending Line B', 'Filling Line C', 'Roasting Line D', 'Liquid Line E', 'Packing Line F', 'Frying Line G'].map((l) => `<option>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Shift</label><select class="select" id="nbShift"><option>Morning</option><option>Afternoon</option><option>Night</option></select></div>
      </div>`;
    const m = openModal({
      title: 'Start a production batch', sub: 'Batch number and start time are assigned automatically.', body,
      footer: `<button class="btn btn-sm btn-ghost" data-close>Cancel</button><button class="btn btn-sm" id="nbSave">Start Batch</button>`
    });
    $('#nbSave', m.back).addEventListener('click', async () => {
      const btn = $('#nbSave', m.back);
      btn.disabled = true;
      try {
        const res = await api('/api/batches', 'POST', {
          productId: $('#nbProduct', m.back).value,
          plannedQty: Number($('#nbQty', m.back).value),
          line: $('#nbLine', m.back).value,
          shift: $('#nbShift', m.back).value
        });
        m.close(); await refresh(); toast('Batch started', `${res.batch.batchNo} is now on the floor`, 'success');
      } catch (e) { toast('Could not start batch', e.message, 'error'); btn.disabled = false; }
    });
  }
 function openInventoryModal() {
  const products = state.data.products;

  if (!products.length) {
    toast('No products', 'Register a product first.', 'error');
    return;
  }

  const body = `
    <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">

      <div class="field">
        <label>Product *</label>
        <select class="select" id="invProduct">
          ${products.map(p =>
            `<option value="${esc(p.id)}">${esc(p.name)}</option>`
          ).join('')}
        </select>
      </div>

      <div class="field">
        <label>Warehouse *</label>
        <select class="select" id="invWarehouse">
          <option>Main Warehouse</option>
          <option>Warehouse 2</option>
          <option>Warehouse 3</option>
        </select>
      </div>

      <div class="field">
        <label>Opening Stock *</label>
        <input class="input" type="number" id="invStock" min="0" value="100">
      </div>

      <div class="field">
        <label>Reorder Level *</label>
        <input class="input" type="number" id="invReorder" min="0" value="20">
      </div>

      <div class="field">
        <label>Batch Number *</label>
        <input class="input" id="invBatch" placeholder="IDL-B001">
      </div>

      <div class="field">
        <label>Expiry Date *</label>
        <input class="input" type="date" id="invExpiry">
      </div>

      <div class="field">
        <label>Unit Cost (₹)</label>
        <input class="input" type="number" id="invCost" min="0" step="0.01">
      </div>

    </div>
  `;

  const m = openModal({
    title: 'Add Inventory Item',
    sub: 'Register opening stock for an existing product.',
    body,
    footer: `
      <button class="btn btn-sm btn-ghost" data-close>Cancel</button>
      <button class="btn btn-sm" id="invSave">Save Inventory</button>
    `
  });

  $('#invSave', m.back).addEventListener('click', async () => {
    const btn = $('#invSave', m.back);
    btn.disabled = true;

    try {
      await api('/api/inventory', 'POST', {
        productId: $('#invProduct', m.back).value,
        warehouse: $('#invWarehouse', m.back).value,
        stock: Number($('#invStock', m.back).value),
        reorderLevel: Number($('#invReorder', m.back).value),
        batch: $('#invBatch', m.back).value.trim(),
        expiry: $('#invExpiry', m.back).value,
        unitCost: Number($('#invCost', m.back).value)
      });

      m.close();
      await refresh();

      toast('Inventory added', 'Opening stock registered successfully.', 'success');

    } catch (e) {
      toast('Could not add inventory', e.message, 'error');
      btn.disabled = false;
    }
  });
}
    const i = state.data.inventory.find((x) => x.id === id);
    if (!i) return;
    const body = `<div style="padding-bottom:10px">
        <div class="cell-main" style="font-size:16px">${esc(i.name)}</div>
        <div class="cell-sub">${esc(i.sku)} · ${esc(i.warehouse)} · batch ${esc(i.batch)}</div>
      </div>
      <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="field"><label>Current stock (${esc(i.unit)})</label><input class="input" type="number" id="stStock" value="${i.stock}" /></div>
        <div class="field"><label>Reorder level</label><input class="input" type="number" id="stReorder" value="${i.reorderLevel}" /></div>
      </div>
      <p style="font-size:11px;color:var(--muted)">Status is recalculated automatically: healthy above reorder, low at reorder, critical below 55% of reorder, out at zero.</p>`;
    const m = openModal({
      title: 'Adjust stock', sub: 'Movement is recorded against the product master.', body,
      footer: `<button class="btn btn-sm btn-ghost" data-close>Cancel</button><button class="btn btn-sm" id="stSave">Save Stock</button>`
    });
    $('#stSave', m.back).addEventListener('click', async () => {
      const btn = $('#stSave', m.back); btn.disabled = true;
      try {
        await api(`/api/inventory/${i.id}`, 'PATCH', { stock: Number($('#stStock', m.back).value), reorderLevel: Number($('#stReorder', m.back).value) });
        m.close(); await refresh(); toast('Stock updated', `${i.name} adjusted`, 'success');
      } catch (e) { toast('Update failed', e.message, 'error'); btn.disabled = false; }
    });
  }
  function openStockModal(id) {
   function openAuditModal() {
    const body = `<div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="field"><label>Audit type</label><select class="select" id="auType">${['Pre-Production', 'In-Process', 'Final Dispatch', 'Inventory', 'Financial'].map((t) => `<option>${t}</option>`).join('')}</select></div>
        <div class="field"><label>Score (0–100)</label><input class="input" type="number" id="auScore" value="92" min="0" max="100" /></div>
        <div class="field"><label>Findings</label><input class="input" type="number" id="auFind" value="2" min="0" /></div>
        <div class="field"><label>Critical findings</label><input class="input" type="number" id="auCrit" value="0" min="0" /></div>
      </div>
      <div class="field"><label>Scope</label><input class="input" id="auScope" value="Production floor & hygiene" /></div>
      <div class="field"><label>Notes</label><textarea class="input" id="auNotes" rows="3" placeholder="Observations and corrective actions…"></textarea></div>`;
    const m = openModal({
      title: 'Record an audit', sub: 'The result band is derived from the score on save.', body,
      footer: `<button class="btn btn-sm btn-ghost" data-close>Cancel</button><button class="btn btn-sm" id="auSave">Save Audit</button>`
    });
    $('#auSave', m.back).addEventListener('click', async () => {
      const btn = $('#auSave', m.back); btn.disabled = true;
      try {
        const res = await api('/api/audits', 'POST', {
          type: $('#auType', m.back).value,
          scope: $('#auScope', m.back).value,
          score: Number($('#auScore', m.back).value),
          findings: Number($('#auFind', m.back).value),
          criticalFindings: Number($('#auCrit', m.back).value),
          notes: $('#auNotes', m.back).value
        });
        m.close(); await refresh(); toast('Audit recorded', `${res.audit.auditNo} · score ${res.audit.score}`, 'success');
      } catch (e) { toast('Could not save audit', e.message, 'error'); btn.disabled = false; }
    });
  }

  async function closeAudit(id) {
    try {
      await api(`/api/audits/${id}`, 'PATCH', { status: 'closed' });
      await refresh();
      toast('Audit closed', 'Findings have been recorded against the audit.', 'success');
    } catch (e) { toast('Could not close audit', e.message, 'error'); }
  }

  async function markPaid(id) {
    try {
      await api(`/api/invoices/${id}/pay`, 'PATCH', {});
      await refresh();
      toast('Invoice settled', 'Payment recorded and order marked paid.', 'success');
    } catch (e) { toast('Could not update invoice', e.message, 'error'); }
  }

  async function toggleUser(id, status) {
    try {
      await api(`/api/users/${id}`, 'PATCH', { status: status === 'active' ? 'inactive' : 'active' });
      await refresh();
      toast('Team updated', `Account ${status === 'active' ? 'deactivated' : 'reactivated'}.`, 'success');
    } catch (e) { toast('Could not update user', e.message, 'error'); }
  }

  /* ---------------- Exports ---------------- */
  function downloadCSV(name, rows) {
    const csv = rows.map((r) => r.map((c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Export ready', name, 'success');
  }
  function exportOrders() {
    downloadCSV('foodflow-orders.csv', [
      ['Order No', 'Customer', 'City', 'Region', 'Items', 'Subtotal', 'GST', 'Total', 'Status', 'Created', 'Due'],
      ...state.data.orders.map((o) => [o.orderNo, o.customer, o.city, o.region, o.items.length, o.subtotal, o.tax, o.total, o.status, o.createdAt.slice(0, 10), o.dueDate.slice(0, 10)])
    ]);
  }
  function exportInvoices() {
    downloadCSV('foodflow-invoices.csv', [
      ['Invoice', 'Order', 'Customer', 'Amount', 'GST', 'Due', 'Status', 'Method'],
      ...state.data.invoices.map((i) => [i.invoiceNo, i.orderNo, i.customer, i.amount, i.gst, i.dueDate.slice(0, 10), i.status, i.method])
    ]);
  }
  function exportInventory() {
    downloadCSV('foodflow-inventory.csv', [
      ['SKU', 'Product', 'Warehouse', 'Stock', 'Reorder', 'Unit', 'Expiry', 'Status'],
      ...state.data.inventory.map((i) => [i.sku, i.name, i.warehouse, i.stock, i.reorderLevel, i.unit, i.expiry.slice(0, 10), i.status])
    ]);
  }
  function exportTeam() {
    downloadCSV('foodflow-team.csv', [
      ['Name', 'Role', 'Title', 'Region', 'Email', 'Phone', 'Status'],
      ...state.data.users.map((u) => [u.name, u.role, u.title, u.region, u.email, u.phone, u.status])
    ]);
  }

  /* ---------------- Boot ---------------- */
  async function boot() {
    try {
      const d = await api('/api/bootstrap');
      state.data = d;
      state.user = d.user;
      localStorage.setItem('ff_user', JSON.stringify(d.user));
      const hash = (window.location.hash || '').replace('#/', '');
      state.view = ACCESS[d.user.role].includes(hash) ? hash : 'overview';
      renderShell();
      render();
      setTimeout(() => $('#boot').classList.add('hide'), 380);
    } catch (e) {
      if (localStorage.getItem('ff_token')) {
        $('#boot').innerHTML = `<div class="boot-inner"><div class="brand-name" style="text-align:center">Foodflow</div><p style="margin-top:14px;letter-spacing:.06em;text-transform:none;font-size:12px;color:var(--danger)">${esc(e.message)}</p><button class="btn btn-sm" style="margin-top:18px" onclick="location.reload()">Retry</button></div>`;
      }
    }
  }

  window.addEventListener('hashchange', () => {
    const v = (window.location.hash || '').replace('#/', '');
    if (v && v !== state.view && ACCESS[state.user.role].includes(v)) {
      state.view = v;
      renderShell();
      render();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      const s = $('#globalSearch');
      if (s) s.focus();
    }
  });

  boot();
})();
