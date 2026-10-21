// @ts-nocheck
import { calculateDeliveryMetrics } from './metrics/delivery-metrics';
import { isSourceFresh } from './shared/data-freshness';
import { potentialForecastStatus, forecastTooltip } from './forecast/dashboard-adapter';

export function initDashboard() {'use strict';

  var TODAY = new Date();
  var LEVEL = { c: 'Critical', h: 'High risk', m: 'Moderate', n: 'Normal', u: 'Unrated' };
  var RANK = { c: 0, h: 1, m: 2, n: 3, u: 4 };
  var FILL = { c: 'var(--crit)', h: 'var(--high)', m: 'var(--mod)', n: 'var(--ok)', u: 'var(--grid)' };

  var DEPTS = [];
  var STUCK_DAYS = 7;          // an open item older than this counts as "pending too long"
  var HEALTH_TARGET = 80;
  var TOTAL_PROJECTS = 0;

  var MILESTONES = { c: 0, h: 0, n: 0, u: 0 };

  var VIEWS = {
    '12h': { label: '12 hours', health: ['—', 'historical data unavailable'], off: ['—', 'historical data unavailable', 0], crit: ['—', 'historical data unavailable'], stuck: ['—', 'historical data unavailable'], pot: ['—', 'historical data unavailable'] },
    '7d':  { label: '7 days', health: ['—', 'historical data unavailable'], off: ['—', 'historical data unavailable', 0], crit: ['—', 'historical data unavailable'], stuck: ['—', 'historical data unavailable'], pot: ['—', 'historical data unavailable'] },
    '30d': { label: '30 days', health: ['—', 'historical data unavailable'], off: ['—', 'historical data unavailable', 0], crit: ['—', 'historical data unavailable'], stuck: ['—', 'historical data unavailable'], pot: ['—', 'historical data unavailable'] }
  };

  // ---- How each problem touches the organisation ----
  // type   'client'   = hits a commitment to a named client
  //        'internal' = stays inside one department
  //        'cross'    = one department is holding up another (from → to)
  // area   which part of the organisation the problem hits (one of AREAS)
  // client optional, also set on cross-department problems that end up hurting a client
  var TYPE = { client: 'Client-facing', internal: 'Internal', cross: 'Between departments' };
  var TYPE_SHORT = { client: 'Client', internal: 'Internal', cross: 'Cross-dept' };
  var TYPE_HINT = {
    client: 'A client value is recorded on the Jira issue; business impact is not independently verified',
    internal: 'No client or impacted-department value is recorded on the Jira issue',
    cross: 'The Jira issue has an Impacted department value; a dependency is not confirmed'
  };
  var AREAS = [
    ['Client delivery', 'Deadlines and commitments'],
    ['Revenue', 'Sales and earnings'],
    ['Cost & vendors', 'Spend, contracts, tools'],
    ['Quality', 'Bugs and testing'],
    ['People & capacity', 'Staffing and workload'],
    ['Data & reporting', 'Numbers leaders rely on']
  ];
  var UNCLASSIFIED_AREA = 'Not categorized';
  function impactArea(value, initiative) {
    var explicit = String(value || '').trim();
    var candidate = explicit || String(initiative || '').trim();
    if (!candidate) return UNCLASSIFIED_AREA;
    var known = AREAS.filter(function (area) { return area[0].toLowerCase() === candidate.toLowerCase(); })[0];
    return known ? known[0] : explicit || UNCLASSIFIED_AREA;
  }
  function impactAreas(risks) {
    var known = {};
    var extra = {};
    AREAS.forEach(function (area) { known[area[0]] = true; });
    risks.forEach(function (risk) {
      if (risk.area && risk.area !== UNCLASSIFIED_AREA && !known[risk.area]) extra[risk.area] = true;
    });
    var areas = AREAS.slice();
    Object.keys(extra).sort().forEach(function (area) { areas.push([area, 'Jira impact area']); });
    if (risks.some(function (risk) { return !risk.area || risk.area === UNCLASSIFIED_AREA; })) {
      areas.push([UNCLASSIFIED_AREA, 'Set the Impact area field in Jira']);
    }
    return areas;
  }

  // Current risks. day = days from today until it bites; open = still needs an executive action
  var RISKS = [];

  // Potential risks: not happening yet, expected within 30 days
  var POTENTIAL = [];

  // Pending too long: actions or decisions open for more than STUCK_DAYS. age = days open
  var PENDING = [];

  PENDING.forEach(function (p) { p.day = -p.age; });

  var PLAN = [];

  var DECISIONS = [];

  var NOTIFS = [];

  var NAV = [
    { k: 'dash', label: 'Dashboard', icon: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>', sub: [['Overview', '#top'], ['Impact', '#sec-impact'], ['Departments', '#sec-depts'], ['Timeline', '#sec-timeline']] },
    { k: 'rep', label: 'Reports', icon: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>', sub: [['Weekly brief', '#'], ['Board pack', '#'], ['Executive report', '#']] },
    { k: 'fin', label: 'Finance', icon: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>', sub: [['Budget', '#'], ['Spend', '#']] },
    { k: 'rm', label: 'RM', icon: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="M12 9v4M12 16v.01"/>', sub: [['Risk register', '#'], ['Mitigations', '#']] },
    { k: 'ana', label: 'Analytics', icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>' },
    { k: 'perf', label: 'Performance', icon: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>' }
  ];

  // =====================================================================
  // STATE + HELPERS
  // =====================================================================
  var S = {
    view: '30d', q: '', sev: { c: true, h: true, m: true }, types: { client: true, internal: true, cross: true }, pop: null, wkOpen: {},
    drawer: null, page: null, open: null, sent: false, dec: {}, nav: { dash: true }, chat: false,
    msgs: []
  };
  var DASHBOARD_DATA_AVAILABLE = false;
  var DECISION_DATA_AVAILABLE = false;
  var DEPARTMENT_DATA_AVAILABLE = false;
  var MISSING_JIRA_FIELDS = [];
  var DELIVERY_METRICS = calculateDeliveryMetrics([], TODAY);
  var app = document.getElementById('app'), layer = document.getElementById('layer'), tip = document.getElementById('tip');
  var toastTimer, Z = 1;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dateOf(day) { var d = new Date(TODAY); d.setDate(d.getDate() + day); return d; }
  function fmt(day) { return day === 0 ? 'Today' : dateOf(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function short(day) { return dateOf(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
  function count(list, l) { return list.filter(function (r) { return r.lvl === l; }).length; }
  function bySev(a, b) { return RANK[a.lvl] - RANK[b.lvl] || a.day - b.day; }
  function worst(list) { return list.length ? list.slice().sort(bySev)[0].lvl : 'n'; }
  function matches(r) {
    if (!S.sev[r.lvl]) return false;
    if (r.type && !S.types[r.type]) return false;
    if (!S.q) return true;
    return (r.dept + ' ' + r.project + ' ' + r.risk + ' ' + r.owner + ' ' + (r.client || '') + ' ' + (r.area || '') + ' ' + TYPE[r.type] + ' ' + (r.from || '') + ' ' + (r.to || '')).toLowerCase().indexOf(S.q.toLowerCase()) >= 0;
  }
  function filtered(list) { return list.filter(matches); }

  // ---- problem-type helpers ----
  var TY_ICON = {
    client: '<svg viewBox="0 0 24 24"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/></svg>',
    internal: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>',
    cross: '<svg viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>'
  };
  function deptShort(name) { var d = DEPTS.filter(function (x) { return x.name === name; })[0]; return d ? d.short : name; }
  function tyChip(t, label) { return '<span class="ty ' + t + '">' + TY_ICON[t] + esc(label == null ? TYPE_SHORT[t] : label) + '</span>'; }
  // compact tag used on timeline items and drawer headers
  function typeTag(r) {
    if (r.type === 'client') return tyChip('client', r.client);
    if (r.type === 'cross') return tyChip('cross', deptShort(r.from) + ' → ' + deptShort(r.to));
    return tyChip('internal', 'Internal · ' + deptShort(r.dept));
  }
  // full sentence used inside the drawer
  function typeLine(r) {
    if (r.type === 'client') return tyChip('client') + ' Client field: <b>' + esc(r.client) + '</b> · impact not independently verified';
    if (r.type === 'cross') return tyChip('cross') + ' Department field: <b>' + esc(r.from) + '</b> → <b>' + esc(r.to) + '</b> · dependency not confirmed';
    return tyChip('internal') + ' No client or impacted-department value is recorded';
  }
  function problems() { return filtered(RISKS); }
  function toast(msg) {
    var t = document.querySelector('.toast'); if (t) t.remove();
    t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, 2600);
  }
  // up = worse for risks; for health a fall is worse
  function delta(val, label, worseWhenUp) {
    var n = typeof val === 'number' ? val : parseFloat(val);
    if (Number.isNaN(n)) return '<span class="delta flat">— ' + esc(label) + '</span>';
    var cls = n === 0 ? 'flat' : ((n > 0) === worseWhenUp ? 'bad' : 'good');
    var arrow = n > 0 ? '↗' : n < 0 ? '↘' : '→';
    var txt = typeof val === 'number' ? (val > 0 ? '+' : '') + val : val;
    return '<span class="delta ' + cls + '">' + arrow + ' ' + txt + ' ' + label + '</span>';
  }
  function criticalOpen() { return RISKS.filter(function (r) { return r.lvl === 'c' && r.open; }); }
  function offTrackProjects() {
    var seen = {};
    RISKS.forEach(function (r) {
      if (r.project !== 'Unknown project' && (r.lvl === 'c' || r.blocked)) seen[r.project] = true;
    });
    return Object.keys(seen);
  }
  function healthScore() {
    var total = MILESTONES.c + MILESTONES.h + MILESTONES.n;
    return total ? Math.round((MILESTONES.n + MILESTONES.h * 0.5) / total * 100) : null;
  }

  // ---- charts ----
  function donut(parts, center, sub, size) {
    var r = 52, C = 2 * Math.PI * r, total = parts.reduce(function (a, p) { return a + p[1]; }, 0), off = 0, s = '';
    parts.forEach(function (p) {
      if (!p[1]) return;
      var len = p[1] / total * C;
      s += '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke-width="' + (size || 14) + '" stroke-dasharray="' + Math.max(0, len - 3) + ' ' + C + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 66 66)" style="stroke:' + p[2] + '" data-tip="' + esc(p[0] + ': ' + p[1]) + '"/>';
      off += len;
    });
    return '<svg viewBox="0 0 132 132" role="img" aria-label="' + esc(sub + ' ' + center) + '">' +
      '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke-width="' + (size || 14) + '" style="stroke:var(--grid)"/>' + s +
      (center !== '' ? '<text x="66" y="' + (sub ? 70 : 76) + '" text-anchor="middle" font-size="' + (sub ? 32 : 30) + '" font-weight="700" style="fill:var(--fg)" font-family="IBM Plex Sans, system-ui, sans-serif">' + center + '</text>' : '') +
      (sub ? '<text x="66" y="90" text-anchor="middle" font-size="12" style="fill:var(--muted)" font-family="IBM Plex Sans, system-ui, sans-serif">' + sub + '</text>' : '') + '</svg>';
  }

  // =====================================================================
  // SIDEBAR
  // =====================================================================
  function renderNav() {
    var h = '';
    var pageNav = { weekly: 'rep', board: 'rep', report: 'rep', budget: 'fin', spend: 'fin', register: 'rm', mitig: 'rm' };
    var currentNav = S.page ? pageNav[S.page] || S.page : 'dash';
    NAV.forEach(function (n) {
      var on = n.k === currentNav;
      h += '<button class="nav' + (on ? ' on' : '') + '" data-nav="' + n.k + '"' + (n.sub ? ' aria-expanded="' + !!S.nav[n.k] + '"' : '') + ' title="' + n.label + '">' +
        '<svg class="i" viewBox="0 0 24 24">' + n.icon + '</svg><span class="lbl">' + n.label + '</span>' +
        (n.sub ? '<svg class="i chev" viewBox="0 0 24 24" style="width:16px"><path d="m6 9 6 6 6-6"/></svg>' : '') + '</button>';
      if (n.sub && S.nav[n.k]) h += '<div class="sub">' + n.sub.map(function (x, i) {
        var subPages = { 'Weekly brief': 'weekly', 'Board pack': 'board', 'Executive report': 'report', 'Budget': 'budget', 'Spend': 'spend', 'Risk register': 'register', 'Mitigations': 'mitig' };
        return '<a href="' + x[1] + '"' + (S.page === subPages[x[0]] ? ' class="on"' : '') + '>' + x[0] + '</a>';
      }).join('') + '</div>';
    });
    document.getElementById('menu').innerHTML = h;
  }

  // =====================================================================
  // MAIN PAGE
  // =====================================================================
  // what each colour means, used everywhere so the screen can be read without words
  var ACT = { c: 'Act today', h: 'Act this week', m: 'Watch', n: 'On track' };
  function statusPill(l) { return '<span class="pill ' + l + '">' + ACT[l] + '</span>'; }
  function leadOf(dept) { return DEPTS.filter(function (d) { return d.name === dept; })[0] || { short: dept, lead: '' }; }
  function talkIfIgnored(name, where, ignored) {
    return '<ul class="act2"><li class="talk"><span class="ico" aria-hidden="true">' + ICON.talk + '</span><span>Talk to <b>' + esc(name) + '</b>' + (where ? ' · ' + esc(where) : '') + '</span></li>' +
      '<li class="risk"><span class="ico" aria-hidden="true">' + ICON.warn + '</span><span><b>If ignored:</b> ' + ignored + '</span></li></ul>';
  }
  var ICON = {
    talk: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.01"/></svg>'
  };
  function stuckItems() { return PENDING.filter(function (p) { return p.age > STUCK_DAYS; }); }
  function stakeOpen() { return criticalOpen().reduce(function (a, r) { return a + (r.stake || 0); }, 0); }

  function render() {
    if (S.page) { renderFullPage(); return; }
    var V = VIEWS[S.view];
    var critOpen = criticalOpen(), off = offTrackProjects(), stuck = stuckItems();
    var stake = stakeOpen(), score = healthScore();
    var h = '<div class="maincol">';

    function topDept(list) {
      var c = {}; list.forEach(function (r) { c[r.dept] = (c[r.dept] || 0) + 1; });
      var k = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0];
      return k ? { name: k, n: c[k] } : { name: 'Unassigned', n: 0 };
    }
    function first(list) { return list.slice().sort(function (a, b) { return a.day - b.day || RANK[a.lvl] - RANK[b.lvl]; })[0]; }

    // ---- verdict banner: the 5-second answer ----
    var verdict = !DASHBOARD_DATA_AVAILABLE ? 'n' : critOpen.length ? 'c' : stuck.length ? 'h' : POTENTIAL.length ? 'm' : 'n';
    h += '<section class="verdict v-' + verdict + '" aria-label="Today in one line"><span class="vdot"></span>' +
      '<p><b>' + (!DASHBOARD_DATA_AVAILABLE ? 'Data unavailable' : ACT[verdict]) + ':</b> ' +
      (!DASHBOARD_DATA_AVAILABLE
        ? 'Current Jira data is unavailable; no cached issues are shown.'
        : critOpen.length + ' critical-priority open issues · ' + DELIVERY_METRICS.overdueOpenIssues + ' overdue commitments · ' +
          DELIVERY_METRICS.blockedOpenIssues + ' blocked issues · ' + POTENTIAL.length + ' open issues due in the next 30 days') +
      (function () {
        if (!DASHBOARD_DATA_AVAILABLE) return '<small>Current source data and impact classifications are unavailable.</small>';
        var all = RISKS, cl = {};
        all.forEach(function (r) { if (r.client) cl[r.client] = 1; });
        return '<small>Of ' + all.length + ' problems: ' + ['client', 'internal', 'cross'].map(function (t) {
          return tyChip(t, all.filter(function (r) { return r.type === t; }).length + ' ' + TYPE[t].toLowerCase());
        }).join('') + '<span>· ' + Object.keys(cl).length + ' clients linked to issues</span></small>';
      })() + '</p></section>';

    // ---- row 1: five KPI cards — health, delivery, now, stuck, next ----
    h += '<section class="kpis" id="top" aria-label="Key numbers">';

    var healthAvailable = DASHBOARD_DATA_AVAILABLE && score !== null;
    var hl = !healthAvailable ? 'n' : score >= HEALTH_TARGET ? 'n' : score >= 70 ? 'm' : 'h';
    var drag = topDept(RISKS.filter(function (r) { return r.lvl === 'c'; }));
    h += '<div class="card kpi healthk k-' + hl + '"><div class="ch"><h3>Overall health</h3>' +
      (healthAvailable ? statusPill(hl) : '<span class="pill n">No data</span>') + '</div>' +
      '<p class="def">Priority mix · critical 0, high 0.5, moderate/normal 1 · unrated excluded</p><div class="health">' +
      donut([['Critical', MILESTONES.c, FILL.c], ['High risk', MILESTONES.h, FILL.h], ['Moderate / normal', MILESTONES.n, FILL.n], ['Unrated', MILESTONES.u, FILL.u]], healthAvailable ? score : '—', 'of 100') +
      '<div class="legend">' + [['c', MILESTONES.c], ['h', MILESTONES.h], ['n', MILESTONES.n], ['u', MILESTONES.u]].map(function (x) {
        return '<div><i style="background:' + FILL[x[0]] + '"></i><b>' + x[1] + '</b><span>' + LEVEL[x[0]] + '</span></div>';
      }).join('') + '</div></div>' +
      talkIfIgnored(
        healthAvailable ? leadOf(drag.name).lead : 'No owner assigned',
        healthAvailable ? leadOf(drag.name).short : '',
        healthAvailable ? 'Weighted priority score · historical comparison unavailable' : 'Health cannot be calculated without current Jira issues with known priority'
      ) +
      '<div class="foot">' + delta(V.health[0], V.health[1], false) + '</div></div>';

    var offRisks = off.map(function (n) { return RISKS.filter(function (r) { return r.project === n && (r.lvl === 'c' || r.blocked); }).sort(bySev)[0]; });
    var offTop = topDept(offRisks), offNext = first(offRisks);
    var offPct = DASHBOARD_DATA_AVAILABLE && TOTAL_PROJECTS ? Math.round(off.length / TOTAL_PROJECTS * 100) : null;
    var ol = offPct >= 20 ? 'c' : offPct >= 10 ? 'h' : 'n';
    h += '<button class="card click kpi k-' + ol + '" data-open="offtrack"><div class="ch"><h3>Projects off track</h3>' +
      (offPct === null ? '<span class="pill n">' + (DASHBOARD_DATA_AVAILABLE ? 'No denominator' : 'Unavailable') + '</span>' : statusPill(ol)) + '</div>' +
      '<p class="def">Projects with a critical issue or blocker</p>' +
      '<div class="offtrack">' + donut([['Off track', off.length, FILL.c], ['On track', Math.max(0, TOTAL_PROJECTS - off.length), 'var(--grid)']], DASHBOARD_DATA_AVAILABLE ? off.length : '—', DASHBOARD_DATA_AVAILABLE ? 'of ' + TOTAL_PROJECTS : 'projects') +
      '<span class="cap">' + (offPct === null ? (DASHBOARD_DATA_AVAILABLE ? 'Rate unavailable · no tracked projects' : 'Unavailable') : offPct + '% of tracked projects') + '</span></div>' +
      talkIfIgnored(
        offNext ? leadOf(offTop.name).lead : 'No owner assigned',
        offNext ? offTop.n + ' of ' + off.length + ' in ' + leadOf(offTop.name).short : '',
        offNext ? esc(offNext.project) + (offNext.day < 99999 ? ' due ' + short(offNext.day) : ' has no recorded due date') :
          (DASHBOARD_DATA_AVAILABLE ? 'No projects are currently flagged off track' : 'Project status is unavailable without current Jira data')
      ) +
      '<div class="foot">On-time delivery, last 30 days: ' +
        (DELIVERY_METRICS.onTimeRate === null ? (DASHBOARD_DATA_AVAILABLE ? 'Unavailable · no resolved issues with due dates' : 'Unavailable · Jira data is not current') :
          DELIVERY_METRICS.onTimeRate + '% (' + DELIVERY_METRICS.onTimeResolvedIssues + '/' + DELIVERY_METRICS.eligibleResolvedIssues + ' resolved issues with due dates)') +
        '</div></button>';

    var critNext = first(critOpen), prog = count(RISKS, 'c') - critOpen.length;
    h += '<button class="card click kpi k-' + (critOpen.length ? 'c' : 'n') + '" data-open="critical"><div class="ch"><h3>Critical-priority issues · now</h3>' + (DASHBOARD_DATA_AVAILABLE ? statusPill(critOpen.length ? 'c' : 'n') : '<span class="pill n">Unavailable</span>') + '</div>' +
      '<p class="def">Jira issues with critical priority and an open status</p>' +
      '<div class="big"><span class="n num" style="color:var(--crit-ink)">' + (DASHBOARD_DATA_AVAILABLE ? critOpen.length : '—') + '</span><span class="what">need action</span></div>' +
      '<div class="kviz"><div class="split" role="img" aria-label="' + critOpen.length + ' need action, ' + prog + ' in progress">' +
        '<span style="flex:' + critOpen.length + ';background:var(--crit)" data-tip="' + critOpen.length + ' need action"></span>' +
        (prog ? '<span class="prog" style="flex:' + prog + '" data-tip="' + prog + ' already being fixed"></span>' : '') + '</div>' +
        '<div class="vkey"><span><i style="background:var(--crit)"></i>' + critOpen.length + ' need action</span>' + (prog ? '<span><i class="prog"></i>' + prog + ' being fixed</span>' : '') + '</div></div>' +
      talkIfIgnored(
        critNext ? critNext.owner : 'No owner assigned',
        critNext ? critNext.project : '',
        critNext ? (critNext.dueDate ? 'Due ' + critNext.dueDate : 'No due date recorded') : (DASHBOARD_DATA_AVAILABLE ? 'No critical-priority open issues found' : 'Current Jira data is unavailable')
      ) +
      '<div class="foot">' + delta(V.crit[0], V.crit[1], true) + '</div></button>';

    var oldest = stuck.slice().sort(function (a, b) { return b.age - a.age; })[0];
    var maxAge = oldest ? oldest.age : 1;
    var sl = !stuck.length ? 'n' : maxAge > 14 ? 'c' : 'h';
    h += '<button class="card click kpi k-' + sl + '" data-open="stuck"><div class="ch"><h3>Open issues · aging</h3>' + (DASHBOARD_DATA_AVAILABLE ? statusPill(sl) : '<span class="pill n">Unavailable</span>') + '</div>' +
      '<p class="def">Jira issues created over ' + STUCK_DAYS + ' days ago · age is not blocker duration</p>' +
      '<div class="big"><span class="n num" style="color:var(--' + (sl === 'c' ? 'crit' : 'high') + '-ink)">' + (DASHBOARD_DATA_AVAILABLE ? stuck.length : '—') + '</span><span class="what">aged · overdue ' + (DASHBOARD_DATA_AVAILABLE ? DELIVERY_METRICS.overdueOpenIssues : '—') + '</span></div>' +
      '<div class="kviz ages" role="img" aria-label="How long each item has been open">' +
        stuck.slice().sort(function (a, b) { return b.age - a.age; }).slice(0, 3).map(function (p) {
          return '<div class="age" data-tip="' + esc(p.project + ': ' + p.risk) + '"><span class="an">' + esc(p.project) + '</span><span class="ab"><i style="width:' + Math.min(100, p.age / 28 * 100) + '%;background:' + (p.age > 14 ? 'var(--crit)' : 'var(--high)') + '"></i></span><b>' + p.age + 'd</b></div>';
        }).join('') + '</div>' +
      (oldest ? talkIfIgnored(oldest.owner, oldest.project, oldest.dueDate ? 'Due ' + oldest.dueDate : 'No due date recorded') : '') +
      '<div class="foot">' + (DASHBOARD_DATA_AVAILABLE
        ? 'Blocked issues: ' + DELIVERY_METRICS.blockedOpenIssues + ' · blocked-since age unavailable · missing priority: ' +
          DELIVERY_METRICS.missingPriorityIssues + ' · open without due date: ' + DELIVERY_METRICS.openIssuesMissingDueDate +
          ' · open without owner: ' + DELIVERY_METRICS.openIssuesMissingOwner
        : 'Blocked and aging issue metrics unavailable without current Jira data') + '</div></button>';

    var potNext = first(POTENTIAL);
    var pl = count(POTENTIAL, 'h') ? 'h' : POTENTIAL.length ? 'm' : 'n';
    h += '<button class="card click kpi k-' + pl + '" data-open="potential"><div class="ch"><h3>Due commitments · next</h3>' + (DASHBOARD_DATA_AVAILABLE ? statusPill(pl) : '<span class="pill n">Unavailable</span>') + '</div>' +
      '<p class="def">Open Jira issues due within the next 30 days · not a forecast</p>' +
      '<div class="big"><span class="n num" style="color:var(--high-ink)">' + (DASHBOARD_DATA_AVAILABLE ? POTENTIAL.length : '—') + '</span><span class="what">in 30 days</span></div>' +
      '<div class="kviz"><div class="strip" role="img" aria-label="Open Jira issues due over the next 30 days"><span class="now"></span>' +
        POTENTIAL.map(function (p) { return '<span class="pt" style="left:' + (p.day / 30 * 100) + '%;background:' + FILL[p.lvl] + '" data-tip="' + esc(p.project + ': ' + p.risk + ' · ' + fmt(p.day)) + '"></span>'; }).join('') +
      '</div><div class="strip-lbl"><span>Today</span><span>2 wk</span><span>30 d</span></div></div>' +
      talkIfIgnored(
        potNext ? potNext.owner : 'No owner assigned',
        potNext ? potNext.project + ', ' + short(potNext.day) : '',
        potNext ? 'Jira ' + potNext.key + ' · due ' + potNext.dueDate : (DASHBOARD_DATA_AVAILABLE ? 'No dated open Jira issues due in the next 30 days' : 'Current Jira data is unavailable')
      ) +
      '<div class="foot">' + delta(V.pot[0], V.pot[1], true) + '</div></button>';
    h += '</section>';

    // ---- row 2: impact on the organisation — what kind of problem, what it hits, who it hurts ----
    h += impactSection();

    // ---- row 3: departments, each with its lead and its oldest open item ----
    var anyFilter = S.q || !S.sev.c || !S.sev.h || !S.sev.m || !S.types.client || !S.types.internal || !S.types.cross;
    h += '<div class="sect" id="sec-depts"><h2>Departments</h2><span class="muted">' + (anyFilter ? 'Filtered · ' : '') + 'Colour = most serious open risk · click for projects</span></div><section class="depts" aria-label="Departments">';
    var shown = 0;
    DEPTS.forEach(function (d) {
      var all = RISKS.filter(function (r) { return r.dept === d.name; });
      var list = filtered(all);
      if (S.q && !list.length && d.name.toLowerCase().indexOf(S.q.toLowerCase()) < 0 && d.lead.toLowerCase().indexOf(S.q.toLowerCase()) < 0) return;
      shown++;
      var w = worst(list);
      var headN = count(list, w);
      var headTxt = w === 'c' ? 'critical risks' : w === 'h' ? 'high risks' : w === 'm' ? 'moderate risks' : 'risks';
      var rows = ['c', 'h', 'm'].filter(function (l) { return l !== w; }).map(function (l) {
        var n = count(list, l); return n ? '<div><i style="background:' + FILL[l] + '"></i>' + LEVEL[l] + '<b>' + n + '</b></div>' : '';
      }).join('') + '<div><i style="background:' + FILL.n + '"></i>Normal<b>' + d.normal + '</b></div>';
      var pend = PENDING.filter(function (p) { return p.dept === d.name; }).sort(function (a, b) { return b.age - a.age; })[0];
      h += '<button class="dept' + (list.length ? '' : ' dim') + '" data-dept="' + esc(d.name) + '" style="--lc:' + FILL[w] + '" title="' + esc(d.name) + '">' +
        '<span class="name">' + esc(d.name) + '</span><span class="lead">Lead: <b>' + esc(d.lead) + '</b></span>' +
        '<span class="head"><span class="n num" style="color:' + (w === 'c' ? 'var(--crit-ink)' : w === 'h' ? 'var(--high-ink)' : 'var(--fg)') + '">' + (list.length ? headN : 0) + '</span><span>' + headTxt + '</span></span>' +
        '<span class="mix">' + ['client', 'internal', 'cross'].map(function (t) {
          var n = list.filter(function (r) { return r.type === t; }).length;
          return n ? tyChip(t, n + ' ' + TYPE_SHORT[t].toLowerCase()) : '';
        }).join('') + '</span>' +
        (function () {
          var waits = RISKS.filter(function (r) { return r.type === 'cross' && r.to === d.name && matches(r); }).length;
          var holds = RISKS.filter(function (r) { return r.type === 'cross' && r.from === d.name && matches(r); }).length;
          return (holds || waits) ? '<span class="waits">' + (holds ? 'Tagged as source team: <b>' + holds + '</b>' : '') + (holds && waits ? ' · ' : '') + (waits ? 'Tagged impacted team: <b>' + waits + '</b>' : '') + '</span>' : '';
        })() +
        '<span class="rows">' + rows + '</span>' +
        (pend ? '<span class="oldest ' + (pend.age > 14 ? 'bad' : 'warn') + '"><span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>Oldest open: <b>' + pend.age + ' days</b></span>'
              : '<span class="oldest ok">Nothing pending too long</span>') + '</button>';
    });
    if (!shown) h += '<div class="okbox" style="grid-column:1/-1">' + (DASHBOARD_DATA_AVAILABLE ? 'No departments match this search or the synchronized Jira query returned no issues.' : 'Department metrics are unavailable until Jira synchronizes successfully.') + '</div>';
    h += '</section>';

    // ---- row 3: timeline (overdue → later) ----
    h += '<div class="sect" id="sec-timeline"><h2>Timeline · overdue to later</h2><div class="tkey"><span><i style="background:var(--crit)"></i>Critical</span><span><i style="background:var(--high)"></i>High</span><span><i style="background:var(--mod)"></i>Moderate</span><span><i style="border:1.5px dashed var(--faint)"></i>Expected</span></div></div>' +
      '<section class="card tline" aria-label="Timeline">' + timeline() + '</section>';
    h += '</div>';

    // ---- right rail ----
    h += '<aside class="rail" aria-label="Summary and actions">';
    h += '<section class="card ai"><div class="ch"><h3 style="display:flex;align-items:center;gap:8px"><span class="spark">✦</span>Rule-based insights</h3><span class="insight-mode">Jira issue evidence</span></div><ul class="brief">' +
      (function () {
        if (!DASHBOARD_DATA_AVAILABLE) return '<li><span class="tag t-n">Unavailable</span><span>Current Jira data is unavailable. Cached issues are not used for current insights.</span></li>';
        var all = RISKS, active = RISKS.filter(function (r) { return r.open; }).slice().sort(bySev);
        var oldest = RISKS.filter(function (r) { return r.open && r.age > 0; }).sort(function (a, b) { return b.age - a.age; })[0];
        var upcoming = POTENTIAL.slice().sort(function (a, b) { return a.day - b.day; })[0];
        var byClient = {}, byFrom = {};
        all.forEach(function (r) {
          if (r.client) { var c = byClient[r.client] = byClient[r.client] || { n: 0, critical: 0 }; c.n++; if (r.lvl === 'c') c.critical++; }
          if (r.type === 'cross' && r.from) byFrom[r.from] = (byFrom[r.from] || 0) + 1;
        });
        var topClient = Object.keys(byClient).sort(function (a, b) { return byClient[b].critical - byClient[a].critical || byClient[b].n - byClient[a].n; })[0];
        var topTeam = Object.keys(byFrom).sort(function (a, b) { return byFrom[b] - byFrom[a]; })[0];
        var lines = [];
        if (critOpen.length) lines.push('<li><span class="tag t-c">Now</span><span><b>' + critOpen.length + ' critical-priority open issues</b>' +
          (active[0] ? '; highest priority: ' + esc(active[0].project) + ' — ' + esc(active[0].risk || 'review required') : '') + '.</span></li>');
        if (oldest) lines.push('<li><span class="tag t-h">Aging</span><span><b>' + esc(oldest.project) + '</b> was created ' + oldest.age + ' days ago in ' + esc(oldest.dept) + ' (not blocked duration).</span></li>');
        if (upcoming) lines.push('<li><span class="tag t-m">Due</span><span><b>' + esc(upcoming.project) + '</b> is due in ' + upcoming.day + ' days' + (upcoming.risk ? ': ' + esc(upcoming.risk) : '') + '.</span></li>');
        if (topClient) lines.push('<li><span class="tag t-n">Client</span><span><b>' + esc(topClient) + '</b> has the most linked Jira issues: ' + byClient[topClient].n + ', ' + byClient[topClient].critical + ' critical-priority.</span></li>');
        if (topTeam) lines.push('<li><span class="tag t-n">Teams</span><span><b>' + esc(deptShort(topTeam)) + '</b> appears most often on issues with an Impacted department value (' + byFrom[topTeam] + ').</span></li>');
        return lines.length ? lines.join('') : '<li><span class="tag t-n">Clear</span><span>Jira synchronized successfully; no critical, aging, due, client, or cross-department issue records were found.</span></li>';
      })() +
      '</ul><small class="insight-disclaimer">Deterministic summaries of synchronized Jira fields; not generative AI or a probability forecast.</small></section>';

    h += '<section class="card"><div class="ch"><h3>Recommended executive plan</h3></div><div>' +
      PLAN.map(function (a, i) {
        return '<div class="aitem"><span class="no">' + (i + 1) + '</span><div><div class="t">' + esc(a.text) + '</div><small>' + esc(a.why) + ' · with <b>' + esc(a.owner) + '</b></small></div></div>';
      }).join('') + '</div><button class="btn" type="button" disabled title="No verified assignment integration is configured">Assignment unavailable <span aria-hidden="true">→</span></button></section>';

    var pending = DECISIONS.length;
    h += '<section class="card"><div class="ch"><h3>Decisions awaiting approval</h3><span class="pill ' + (pending ? 'h' : 'n') + '">' + (DASHBOARD_DATA_AVAILABLE ? pending + ' pending' : 'Unavailable') + '</span></div>' +
      DECISIONS.map(function (d) {
        return '<div class="dec"><div class="t">' + esc(d.text) + ' <span class="wait">' + esc(d.status) + '</span></div>' +
          '<div class="muted">' + esc(d.meta) + '</div>' +
          '<div class="muted">Approval age and deadline are unavailable in the connected Jira fields.</div></div>';
      }).join('') +
      (!pending ? '<div class="okbox">' + (DASHBOARD_DATA_AVAILABLE ? 'No pending decisions were found in the configured Jira decision fields.' : 'Approval status is unavailable until Jira synchronizes successfully.') + '</div>' : '') +
      '</section>';
    h += cooRiskCard();   // COO risk intelligence hook
    h += '</aside>';

    app.classList.remove('full-view');
    app.innerHTML = h;
    slideify();
    alignNames();
    if (innerWidth >= 1800 && typeof fit === 'function') requestAnimationFrame(fit);
  }

  // =====================================================================
  // IMPACT ON THE ORGANISATION
  //   1. Impact map: what part of the business each problem hits × what kind of problem it is
  //   2. Clients affected: which clients are exposed, how much is at stake, what is next
  //   3. Between departments: which team is holding up which, and why
  // =====================================================================
  function impactSection() {
    var classificationAvailable = DASHBOARD_DATA_AVAILABLE && !MISSING_JIRA_FIELDS.includes('Client') && !MISSING_JIRA_FIELDS.includes('Impacted department');
    var P = problems().filter(function (risk) { return risk.classificationKnown; }), types = ['client', 'internal', 'cross'];
    var all = P;
    var areas = impactAreas(all);
    var uncategorized = P.filter(function (risk) { return risk.area === UNCLASSIFIED_AREA; }).length;
    var h = '<div class="sect" id="sec-impact"><h2>Impact on the organisation</h2><span class="typekey">' +
      types.map(function (t) { return '<span data-tip="' + esc(TYPE_HINT[t]) + '">' + tyChip(t, TYPE[t]) + '</span>'; }).join('') + '</span></div>' +
      '<section class="imp" aria-label="Impact on the organisation">';

    // ---- 1. impact map ----
    h += '<div class="card mx"><div class="ch"><h3>Jira issue classifications</h3><span class="muted" style="font-size:12px">' + (classificationAvailable ? P.length + ' classified issues' : 'Unavailable') + '</span></div>' +
      '<p class="def">Client and impacted-department fields only; category counts are not proof of business impact' +
      (uncategorized ? ' · ' + uncategorized + ' not categorized; add an Impact area in Jira' : '') + '</p>' +
      '<table class="mxt"><thead><tr><th scope="col"><span class="sr" style="position:absolute;left:-9999px">Area</span></th>' +
      types.map(function (t) {
        var n = P.filter(function (r) { return r.type === t; }).length;
        return '<th scope="col"><button data-type="' + t + '" data-tip="' + esc(TYPE_HINT[t]) + '">' + tyChip(t) + '<b>' + (classificationAvailable ? n : '—') + '</b></button></th>';
      }).join('') + '</tr></thead><tbody>';
    areas.forEach(function (a) {
      h += '<tr><th scope="row" class="rl">' + esc(a[0]) + '<small>' + esc(a[1]) + '</small></th>';
      types.forEach(function (t) {
        var list = P.filter(function (r) { return r.area === a[0] && r.type === t; });
        if (!list.length) { h += '<td><span class="cell z" aria-label="none">–</span></td>'; return; }
        var w = worst(list);
        h += '<td><button class="cell ' + w + '" data-cell="' + esc(a[0]) + '|' + t + '" data-tip="' + esc(a[0] + ' · ' + TYPE[t] + ': ' + list.map(function (r) { return r.project; }).join(', ')) + '">' + list.length + '</button></td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div>';

    // ---- 2. clients affected ----
    var clients = {};
    P.forEach(function (r) { if (r.client) (clients[r.client] = clients[r.client] || []).push(r); });
    var names = Object.keys(clients).sort(function (a, b) {
      var A = clients[a], B = clients[b];
      return RANK[worst(A)] - RANK[worst(B)] || B.length - A.length;
    });
    var totalStake = 0;
    names.forEach(function (n) { clients[n].forEach(function (r) { totalStake += r.stake || 0; }); });
    h += '<div class="card"><div class="ch"><h3>Client-linked Jira issues</h3><span class="pill ' + (names.length ? 'h' : 'n') + '">' + (classificationAvailable ? names.length + ' clients' : 'Unavailable') + '</span></div>';
    if (names.length) {
      var top = names[0], topList = clients[top];
      h += '<p class="callout blue"><b>' + esc(top) + '</b> has the most client-linked Jira issues: ' + topList.length + ' records across ' +
        Object.keys(topList.reduce(function (m, r) { m[r.dept] = 1; if (r.to) m[r.to] = 1; return m; }, {})).length + ' departments.</p>';
    }
    names.forEach(function (n) {
      var list = clients[n].slice().sort(bySev), w = worst(list);
      var dueCount = list.filter(function (r) { return r.open && r.day >= 0 && r.day <= 30; }).length;
      var dated = list.filter(function (r) { return r.dueDate; }).sort(function (a, b) { return a.day - b.day; })[0];
      h += '<button class="cli" data-client="' + esc(n) + '"><span class="dot" style="background:' + FILL[w] + '"></span>' +
        '<span class="nm">' + esc(n) + '</span>' +
        '<span class="amt none">financial impact unavailable</span>' +
        '<small>' + list.length + ' linked issues · ' + dueCount + ' due in 30 days' + (dated ? ' · next due: ' + esc(dated.dueDate) : '') + '</small></button>';
    });
    if (!names.length) h += '<div class="okbox">' + (classificationAvailable ? 'No Jira issues have a client field value.' : 'Client classification is unavailable because the Jira client or impacted-department field is not configured.') + '</div>';
    else h += '<p class="muted" style="font-size:12px;margin-top:6px">Financial exposure is unavailable; no verified financial amount is supplied by the connected Jira fields.</p>';
    h += '</div>';

    // ---- 3. cross-department field tags ----
    var X = P.filter(function (r) { return r.type === 'cross' && r.open; }).sort(bySev);
    var byFrom = {};
    X.forEach(function (r) { byFrom[r.from] = (byFrom[r.from] || 0) + 1; });
    var topFrom = Object.keys(byFrom).sort(function (a, b) { return byFrom[b] - byFrom[a]; })[0];
    h += '<div class="card"><div class="ch"><h3>Cross-department tags</h3><span class="pill ' + (X.length ? 'h' : 'n') + '">' + (DEPARTMENT_DATA_AVAILABLE ? X.length + ' open issues' : 'Unavailable') + '</span></div>' +
      '<p class="def">Jira department fields do not establish a dependency or handoff.</p>';
    if (topFrom) {
      h += '<p class="callout"><b>' + esc(deptShort(topFrom)) + '</b> is recorded on ' + byFrom[topFrom] + ' of ' + X.length + ' open cross-department-tagged issues.</p>';
    }
    X.slice(0, 4).forEach(function (r) {
      h += '<button class="flow" data-ev="' + r.id + '"><span class="fr"><span class="dchip">' + esc(deptShort(r.from)) + '</span><span class="arr" aria-label="holding up">→</span><span class="dchip to">' + esc(deptShort(r.to)) + '</span>' +
        '<span class="pill ' + r.lvl + '" style="font-size:11px;padding:0 7px;margin-left:auto">' + LEVEL[r.lvl] + '</span></span>' +
        '<span class="ft">' + esc(r.project) + ': ' + esc(r.risk) + '</span>' +
        '<small>Jira ' + esc(r.key) + (r.owner ? ' · owner ' + esc(r.owner) : ' · no owner recorded') + '</small></button>';
    });
    if (X.length > 4) h += '<button class="more" data-type="cross" style="margin-top:4px">See all ' + X.length + ' tagged issues</button>';
    if (!X.length) h += '<div class="okbox">' + (DEPARTMENT_DATA_AVAILABLE ? 'No open Jira issues with an Impacted department value were found.' : 'Department handoff data is unavailable; Jira dependency links and accountability data are not retrieved.') + '</div>';
    h += '</div>';

    return h + '</section>';
  }

  // department names reserve two lines only when at least one name actually wraps
  function alignNames() {
    // insight boxes in the KPI row share one height so their tops line up
    var boxes = app.querySelectorAll('.kpis .act2');
    [].forEach.call(boxes, function (b) { b.style.minHeight = ''; });
    var rows = {};
    [].forEach.call(boxes, function (b) { var t = Math.round(b.closest('.kpi').getBoundingClientRect().top); (rows[t] = rows[t] || []).push(b); });
    Object.keys(rows).forEach(function (t) {
      var g = rows[t]; if (g.length < 2) return;
      var mx = Math.max.apply(null, g.map(function (b) { return b.offsetHeight; }));
      g.forEach(function (b) { b.style.minHeight = mx + 'px'; });
    });
    var box = app.querySelector('.depts'); if (!box) return;
    box.classList.add('oneline');
    var wraps = [].some.call(box.querySelectorAll('.name'), function (n) { return n.offsetHeight > parseFloat(getComputedStyle(n).lineHeight) * 1.5; });
    box.classList.toggle('oneline', !wraps);
  }

  // ---- timeline: this week · next week · in 3 weeks · in 3 months · later ----
  var WEEKS = [
    { when: 'Overdue commitments', from: -9999, to: -1, overdue: true },
    { when: 'This week', from: 0, to: 5 },
    { when: 'Next week', from: 6, to: 12 },
    { when: 'In 3 weeks', from: 13, to: 26 },
    { when: 'In 3 months', from: 27, to: 90 },
    { when: 'Later', from: 91, to: 9999 }
  ];
  function timeline() {
    var items = filtered(RISKS).filter(function (r) { return r.day < 99999; })
      .map(function (r) { return { r: r, pot: false }; });
    var h = '<div class="weeks">';
    WEEKS.forEach(function (w, i) {
      var list = items.filter(function (x) { return x.r.day >= w.from && x.r.day <= w.to; }).sort(function (a, b) { return bySev(a.r, b.r); });
      var crit = list.filter(function (x) { return x.r.lvl === 'c'; }).length;
      if (w.overdue) list.sort(function (a, b) { return a.r.day - b.r.day; });
      h += '<div class="wk' + (i === 1 ? ' now' : '') + (w.overdue ? ' late' : '') + '"><div class="rail"><i></i></div>' +
        '<div class="head"><div class="when">' + w.when + '</div><div class="range">' + (w.overdue ? 'open over ' + STUCK_DAYS + ' days' : w.to > 900 ? 'after ' + short(90) : short(w.from) + ' – ' + short(w.to)) + '</div></div>' +
        '<div class="cnt">' + (list.length ? list.length + (list.length === 1 ? ' item' : ' items') + (crit ? ' · ' + crit + ' critical' : '') : '') + '</div><div class="items">';
      if (!list.length) h += '<div class="none">Nothing</div>';
      var shown = S.wkOpen[i] ? list : list.slice(0, 3);
      shown.forEach(function (x) {
        h += '<button class="tk' + (x.pot ? ' pot' : '') + '" data-ev="' + x.r.id + '" style="--kc:' + FILL[x.r.lvl] + '" data-tip="' + esc(LEVEL[x.r.lvl] + ': ' + x.r.risk) + '">' +
          '<b>' + esc(x.r.project) + '</b><small>' + fmt(x.r.day) + '</small><span class="tt">' + (x.r.classificationKnown ? typeTag(x.r) : '') + '</span></button>';
      });
      if (list.length > 3) h += '<button class="more" data-wk="' + i + '">' + (S.wkOpen[i] ? 'Show less' : '+' + (list.length - 3) + ' more') + '</button>';
      h += '</div></div>';
    });
    return h + '</div>';
  }

  // =====================================================================
  // POPOVERS
  // =====================================================================
  function renderPops() {
    ['filter', 'notif', 'cal', 'view', 'profile'].forEach(function (k) {
      var el = document.getElementById('pop-' + k);
      if (S.pop !== k) { el.hidden = true; el.innerHTML = ''; return; }
      el.hidden = false;
      var h = '';
      if (k === 'filter') {
        h = '<h4>Risk level</h4>' + ['c', 'h', 'm'].map(function (l) {
          return '<button class="opt" data-sev="' + l + '"><span class="pill ' + l + '">' + LEVEL[l] + '</span><span>' + (S.sev[l] ? '✓' : '') + '</span></button>';
        }).join('') + '<div class="grp"><h4>Problem type</h4>' + ['client', 'internal', 'cross'].map(function (t) {
          return '<button class="opt" data-ftype="' + t + '">' + tyChip(t, TYPE[t]) + '<span>' + (S.types[t] ? '✓' : '') + '</span></button>';
        }).join('') + '</div><button class="opt" data-sev="all" style="color:var(--accent);font-weight:600">Reset</button>';
      } else if (k === 'notif') {
        h = '<h4>Notifications</h4>' + NOTIFS.map(function (n) {
          return '<div class="notif"><span class="d" style="background:' + (n.lvl === 'p' ? 'var(--accent)' : FILL[n.lvl]) + '"></span><div>' + esc(n.text) + '<small>' + n.when + '</small></div></div>';
        }).join('');
      } else if (k === 'cal') {
        var y = TODAY.getFullYear(), mo = TODAY.getMonth();
        var lead = (new Date(y, mo, 1).getDay() + 6) % 7, days = new Date(y, mo + 1, 0).getDate(), due = {};
        RISKS.forEach(function (r) {
          var d = dateOf(r.day); if (d.getMonth() !== mo) return;
          var k2 = d.getDate(); if (!due[k2] || RANK[r.lvl] < RANK[due[k2]]) due[k2] = r.lvl;
        });
        h = '<h4>October 2026 · due dates</h4><div class="cal">' + ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(function (d) { return '<span class="wd">' + d + '</span>'; }).join('');
        for (var i = 0; i < lead; i++) h += '<span></span>';
        for (var d = 1; d <= days; d++) {
          h += '<span class="' + (d === TODAY.getDate() ? 'today ' : '') + (due[d] ? 'has' : '') + '"' + (due[d] ? ' style="--dc:' + FILL[due[d]] + '" data-tip="Due: ' + LEVEL[due[d]] + '"' : '') + '>' + d + '</span>';
        }
        h += '</div>';
      } else if (k === 'view') {
        h = '<h4>Compare against</h4>' + Object.keys(VIEWS).map(function (v) {
          return '<button class="opt' + (S.view === v ? ' on' : '') + '" data-view="' + v + '">Last ' + VIEWS[v].label + '<span>' + (S.view === v ? '✓' : '') + '</span></button>';
        }).join('');
      } else if (k === 'profile') {
        h = '<div class="profile-menu-user"><span class="avatar">V</span><div><b>Vishva</b><small>Jira dashboard user</small></div></div>' +
          '<button class="opt" data-page="settings"><span>Settings</span><span aria-hidden="true">⚙</span></button>' +
          '<button class="opt" data-page="help"><span>Help center</span><span aria-hidden="true">?</span></button>';
      }
      el.innerHTML = h;
    });
    var off = ['c', 'h', 'm'].filter(function (l) { return !S.sev[l]; }).length +
      ['client', 'internal', 'cross'].filter(function (t) { return !S.types[t]; }).length;
    var fb = document.getElementById('fbadge'); fb.hidden = !off; fb.textContent = off ? off + ' off' : '';
    document.getElementById('viewlbl').textContent = VIEWS[S.view].label;
    var profileButton = document.querySelector('[data-pop="profile"]');
    if (profileButton) profileButton.setAttribute('aria-expanded', String(S.pop === 'profile'));
  }

  // =====================================================================
  // DRAWER
  // =====================================================================
  function riskBlock(r, pot, showDept) {
    var open = S.open === r.id;
    var details = '<dt>Jira issue</dt><dd>' + esc(r.key || r.id) + ' · ' + esc(r.risk) + '</dd>' +
      '<dt>Status</dt><dd>' + esc(r.sourceStatus || 'Unavailable') + '</dd>';
    if (r.department && r.department !== 'Department unavailable' && r.department !== 'Unassigned') details += '<dt>Department</dt><dd>' + esc(r.department) + '</dd>';
    if (r.dueDate) details += '<dt>Due date</dt><dd>' + esc(r.dueDate) + (r.day < 0 ? ' · ' + Math.abs(r.day) + ' days overdue' : '') + '</dd>';
    if (r.age !== null) details += '<dt>Issue age</dt><dd>Created ' + r.age + ' days ago; this is not blocker duration.</dd>';
    if (r.owner) details += '<dt>Owner</dt><dd>' + esc(r.owner) + '</dd>';
    if (r.client) details += '<dt>Client field</dt><dd>' + esc(r.client) + ' · linkage is not proof of business impact.</dd>';
    if (r.customerImpact) details += '<dt>Recorded customer impact</dt><dd>' + esc(r.customerImpact) + '</dd>';
    if (r.mitigation) details += '<dt>Recorded mitigation</dt><dd>' + esc(r.mitigation) + '</dd>';
    if (r.classificationKnown) details += '<dt>Impact area</dt><dd>' + esc(r.area) + '</dd>';
    return '<div class="proj"><button data-toggle="' + r.id + '" aria-expanded="' + open + '"><span>' + esc(r.project) +
      (showDept ? '<small class="muted" style="display:block;font-weight:400">' + esc(r.dept) + '</small>' : '') +
      (r.classificationKnown ? '<span style="display:block;margin-top:4px;font-weight:400">' + typeTag(r) + '</span>' : '') + '</span>' +
      '<span style="display:flex;gap:6px;align-items:center">' + (r.age !== null ? '<span class="pill c">' + r.age + ' d since creation</span>' : '') + (r.lvl === 'c' && r.open ? '<span class="pill p">Needs action</span>' : '') + '<span class="pill ' + r.lvl + '">' + LEVEL[r.lvl] + '</span></span></button>' +
      (open ? '<dl>' + details + '</dl>' : '') + '</div>';
  }
  function renderDrawer() {
    var D = S.drawer;
    if (!D) { layer.innerHTML = ''; return; }
    if (D.type === 'coo') return renderCooDrawer(D);   // COO risk intelligence hook
    var title, sub, list, pot = false, showDept = true;
    if (D.type === 'dept') {
      list = RISKS.filter(function (r) { return r.dept === D.dept; }).sort(bySev); showDept = false;
      title = D.dept; sub = list.length + ' projects at risk · most serious first';
    } else if (D.type === 'critical') {
      list = RISKS.filter(function (r) { return r.lvl === 'c'; }).sort(function (a, b) { return (b.open ? 1 : 0) - (a.open ? 1 : 0) || a.day - b.day; });
      title = 'Critical risks'; sub = criticalOpen().length + ' need action · ' + list.length + ' in total';
    } else if (D.type === 'offtrack') {
      var names = offTrackProjects();
      list = names.map(function (n) { return RISKS.filter(function (r) { return r.project === n && (r.lvl === 'c' || r.blocked); }).sort(bySev)[0]; });
      title = 'Projects off track'; sub = names.length + ' of ' + TOTAL_PROJECTS + ' projects';
    } else if (D.type === 'stuck') {
      list = stuckItems().sort(function (a, b) { return b.age - a.age; });
      title = 'Open issues · aging'; sub = list.length + ' created over ' + STUCK_DAYS + ' days ago · age is not blocker duration';
    } else if (D.type === 'cell') {
      list = RISKS.filter(function (r) { return r.area === D.area && r.type === D.t && matches(r); }).sort(bySev);
      title = D.area; sub = TYPE[D.t] + ' · ' + list.length + ' problems · most serious first';
    } else if (D.type === 'ptype') {
      list = RISKS.filter(function (r) { return r.type === D.t && matches(r); }).sort(bySev);
      title = TYPE[D.t] + ' problems'; sub = TYPE_HINT[D.t] + ' · ' + list.length + ' in total';
    } else if (D.type === 'client') {
      list = RISKS.filter(function (r) { return r.client === D.client && matches(r); }).sort(bySev);
      var cStake = list.reduce(function (s, r) { return s + (r.stake || 0); }, 0);
      var cDepts = Object.keys(list.reduce(function (m, r) { m[deptShort(r.dept)] = 1; if (r.to) m[deptShort(r.to)] = 1; return m; }, {}));
      title = D.client; sub = 'Client · ' + list.length + ' problems' + (cStake ? ' · ≈ ₹' + cStake + ' L at stake' : '') + ' · teams involved: ' + cDepts.join(', ');
    } else {
      list = POTENTIAL.slice().sort(function (a, b) { return a.day - b.day; }); pot = true;
      title = 'Due commitments'; sub = list.length + ' open issues due in the next 30 days · soonest first';
    }
    if (!DASHBOARD_DATA_AVAILABLE) sub = 'Current Jira data is unavailable; cached issues are not shown.';
    var h = '<div class="scrim"><button class="away" data-close aria-label="Close"></button><aside class="drawer" role="dialog" aria-label="' + esc(title) + '">' +
      '<div class="top2"><div><h2>' + esc(title) + '</h2><span class="muted">' + sub + '</span></div><button class="iconbtn" data-close aria-label="Close" style="border:1px solid var(--line)">✕</button></div>';
    if (!list.length) h += '<div class="okbox">' + (DASHBOARD_DATA_AVAILABLE ? 'No matching Jira issues were found.' : 'Unavailable until Jira synchronizes successfully.') + '</div>';
    list.forEach(function (r) { h += riskBlock(r, false, showDept); });
    if (D.type === 'dept') {
      var pend = PENDING.filter(function (p) { return p.dept === D.dept; }).sort(function (a, b) { return b.age - a.age; });
      if (pend.length) { h += '<h3 style="font-size:14px;margin-top:6px">Pending too long</h3>'; pend.forEach(function (r) { h += riskBlock(r, false, false); }); }
      var heldBy = RISKS.filter(function (r) { return r.type === 'cross' && r.to === D.dept && r.dept !== D.dept; }).sort(bySev);
      if (heldBy.length) { h += '<h3 style="font-size:14px;margin-top:6px">Held up by other departments</h3>'; heldBy.forEach(function (r) { h += riskBlock(r, r.id.charAt(0) === 'p', true); }); }
      h = h.replace('<span class="muted">', '<span class="muted">Lead: ' + esc(leadOf(D.dept).lead) + ' · ');
    }
    layer.innerHTML = h + '</aside></div>';
  }

  // =====================================================================
  // AI AGENT
  // =====================================================================
  var PROMPTS = [
    ['Explain overall health', function () {
      var score = healthScore();
      if (score === null) return 'Insufficient data: Jira issue data is unavailable, so overall health cannot be calculated.';
      return 'Rule-based priority score is ' + score + '/100 across ' + (MILESTONES.c + MILESTONES.h + MILESTONES.n) +
        ' Jira issues with known priority (critical=0, high=0.5, moderate/normal=1): ' +
        MILESTONES.c + ' critical, ' + MILESTONES.h + ' high risk and ' + MILESTONES.n + ' moderate or normal. ' +
        MILESTONES.u + ' issues with unknown priority are excluded.';
    }],
    ['Summarize critical risks', function () {
      var items = RISKS.filter(function (r) { return r.priorityKnown && r.lvl === 'c'; }).sort(bySev);
      return items.length
        ? items.map(function (r) { return '• ' + r.key + ' · ' + r.project + ' · ' + r.sourceStatus + (r.open ? ' (open)' : '') + ': ' + r.risk; }).join('\n')
        : (DASHBOARD_DATA_AVAILABLE ? 'No critical-priority Jira issues were found.' : 'Critical issue data is unavailable until Jira synchronizes successfully.');
    }],
    ['Show pending approvals', function () {
      return !DECISION_DATA_AVAILABLE
        ? 'Approval status is unavailable: the Jira COO decision and approver fields are not both configured.'
        : DECISIONS.length ? DECISIONS.map(function (d) { return '• ' + d.text + ' (' + d.status + '; ' + d.meta + ')'; }).join('\n')
          : 'No pending decisions were found in the configured Jira decision fields.';
    }],
    ['Which clients are affected?', function () {
      var c = {};
      RISKS.forEach(function (r) { if (r.client) (c[r.client] = c[r.client] || []).push(r); });
      return Object.keys(c).sort(function (a, b) { return RANK[worst(c[a])] - RANK[worst(c[b])] || c[b].length - c[a].length; }).map(function (n) {
        var l = c[n].slice().sort(bySev), st = l.reduce(function (s, r) { return s + (r.stake || 0); }, 0);
        return '• ' + n + ': ' + l.length + ' problems' + (st ? ', ≈ ₹' + st + ' L at stake' : '') + '. Worst: ' + l[0].project + ' (' + l[0].risk + ')';
      }).join('\n');
    }],
    ['Where are teams blocking each other?', function () {
      return RISKS.filter(function (r) { return r.type === 'cross'; }).sort(bySev).map(function (r) {
        return '• ' + deptShort(r.from) + ' → ' + deptShort(r.to) + ': ' + r.project + ', ' + r.risk + ' (' + r.cause + ')';
      }).join('\n');
    }],
    ['Draft a board update', function () {
      var score = healthScore();
      if (score === null) return 'Insufficient data: a board update cannot be generated until current Jira issues with known priorities are available.';
      var critical = criticalOpen().slice().sort(bySev);
      return 'Draft:\n"Rule-based Jira priority score is ' + score + '/100. ' + critical.length +
        ' critical-priority issues are open across ' + TOTAL_PROJECTS + ' Jira projects; ' + POTENTIAL.length +
        ' open issues have due dates in the next 30 days. This is not a delivery forecast.' +
        (critical.length ? ' Highest-priority record: ' + critical[0].key + ' — ' + critical[0].risk + '.' : '');
    }]
  ];
  function renderChat() {
    var box = document.getElementById('chatbox');
    document.getElementById('bubble').hidden = S.chat || S.bubbleGone;
    if (!S.chat) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="chat" role="dialog" aria-label="Jira issue summary"><div class="hd"><b style="display:flex;gap:8px;align-items:center"><span class="spark">✦</span>Jira issue summary</b><button class="iconbtn" data-act="chat" aria-label="Close summary">✕</button></div>' +
      '<div class="msgs" id="msgs">' + S.msgs.map(function (m) { return '<div class="msg ' + m.who + '">' + esc(m.text) + '</div>'; }).join('') + '</div>' +
      '<div class="chips">' + PROMPTS.map(function (p, i) { return '<button class="chipb" data-ask="' + i + '">' + p[0] + '</button>'; }).join('') + '</div>' +
      '<form id="chatform"><input id="chatin" placeholder="Type a request" autocomplete="off" aria-label="Message"><button class="btn sm" type="submit">Send</button></form></div>';
    var m = document.getElementById('msgs'); m.scrollTop = m.scrollHeight;
  }
  function ask(text, answer) { S.msgs.push({ who: 'me', text: text }); S.msgs.push({ who: 'ai', text: answer }); renderChat(); }
  function freeAnswer(t) {
    var q = t.toLowerCase();
    var coo = cooAnswer(q); if (coo) return coo;   // COO risk intelligence hook
    if (/client|customer/.test(q)) return PROMPTS[3][1]();
    if (/between|cross|block|handoff|depend/.test(q)) return PROMPTS[4][1]();
    var hit = RISKS.filter(function (r) { return q.indexOf(r.project.toLowerCase().split(' ')[0]) >= 0 || q.indexOf(r.dept.toLowerCase().split(' ')[0]) >= 0 || (r.client && q.indexOf(r.client.toLowerCase().split(' ')[0]) >= 0); });
    if (hit.length) return hit.sort(bySev).map(function (r) { return '• ' + r.project + ' (' + LEVEL[r.lvl] + '): ' + r.risk + ' → ' + r.action; }).join('\n');
    if (/health/.test(q)) return PROMPTS[0][1]();
    if (/critical/.test(q)) return PROMPTS[1][1]();
    if (/approv|decision/.test(q)) return PROMPTS[2][1]();
    return 'I can summarize synchronized Jira issue records by project, department, client field, priority, due date, or configured decision status. Historical comparisons, dependency links, finance, and unsupported source fields are unavailable.';
  }

  // =====================================================================
  // BIG SCREENS (scale the whole page up above 1800px)
  // =====================================================================
  var BASE = 1600;
  function fit() {
    var body = document.body, side = document.querySelector('.side');
    var shellEl = document.getElementById('shell');
    body.style.zoom = 1; body.style.width = ''; body.style.margin = ''; side.style.height = ''; shellEl.style.minHeight = '';
    body.classList.remove('big');
    if (innerWidth < 1800) { Z = 1; alignNames(); return; }
    body.classList.add('big');
    // Scale the page up for big screens. Then, if the whole dashboard can fit on one screen
    // without text getting too small (TV on a wall), shrink to fit and widen the layout to use the full width.
    function measure(w) { body.style.width = w + 'px'; alignNames(); return document.querySelector('.top').offsetHeight + app.offsetHeight; }
    var zMax = innerWidth / BASE, z = zMax;
    for (var i = 0; i < 4; i++) {
      var hNeed = measure(innerWidth / z);
      var zFit = innerHeight / hNeed;
      if (zFit >= zMax) { z = zMax; break; }
      if (zFit < 0.8) { z = zMax; break; }           // too much to fit legibly: keep the larger size and scroll
      if (Math.abs(zFit - z) < 0.005) { z = zFit; break; }
      z = zFit;
    }
    Z = z;
    measure(innerWidth / Z);
    body.style.zoom = Z;
    side.style.height = (innerHeight / Z) + 'px';
    shellEl.style.minHeight = (innerHeight / Z) + 'px';
  }


  // =====================================================================
  // COO risk intelligence has no connected source yet; these collections stay empty.
  // =====================================================================

  // ---- shared shape for every new signal ----
  // id, lvl (c/h/m), kind (short label used in COO priority), title, short (one-line reason on the card),
  // dept, project, client?, day (deadline, days from today), sev 1-5, impact 1-5, prob 0-1, esc 1-5 (escalation risk),
  // action, ai: [what is happening, why it matters, what the COO should do], links: ids of existing risks it relates to

  // 1. People & capacity: can the people, skills and hours needed actually be found?
  var peopleCapacityRisks = [];

  // 2. Cross-system truth: Jira = what the team says, Bitbucket = what changed, Confluence = what is written down
  var crossSystemRisks = [];

  // 3. Customer impact radar: problem → project → customer → deadline → SLA / money
  var customerImpactRisks = [];

  // 4. Anomaly & drift: each metric is compared with its own last 8 weeks, not a fixed threshold.
  //    hist = last 8 weekly values, now = this week. Only metrics that break their normal pattern become risks.
  var anomalyRisks = [];

  // 5. Technology risk: only business-critical security and technology issues.
  //    Ranked by Business impact × Severity × Deadline × Exposure (expo 1 = production and client-facing)
  var technologyRisks = [];

  // 6. AI governance: organisational risk from uncontrolled AI use (COO level, not model details)
  var aiGovernanceRisks = [];

  // 7. Technology cost: only unusual spend. prev / cur in ₹ lakh per period; useChg = change in usage or delivery (%)
  var technologyCostRisks = [];

  // 8. Technical debt & legacy: debt tied to the business problem it causes (chain)
  var technicalDebtRisks = [];

  // ---- anomaly detection: compare with the metric's own history ----
  function anomalyStats(m) {
    var n = m.hist.length, mean = m.hist.reduce(function (a, b) { return a + b; }, 0) / n;
    var sd = Math.sqrt(m.hist.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / n) || 0.5;
    var pct = Math.round((m.now - mean) / mean * 100), z = (m.now - mean) / sd;
    var flagged = z >= 3 && pct >= 40;                        // far outside its normal spread AND a material change
    return { mean: mean, sd: sd, pct: pct, z: z, flagged: flagged, lvl: !flagged ? 'n' : pct >= 150 ? 'c' : pct >= 60 ? 'h' : 'm' };
  }
  function rnd1(x) { return Math.round(x * 10) / 10; }
  anomalyRisks.forEach(function (m) {
    var s = anomalyStats(m); m.stats = s; m.lvl = s.lvl;
    if (!s.flagged) return;
    m.kind = 'Anomaly'; m.title = m.metric + ' up ' + s.pct + '%';
    m.short = m.metric + ' +' + s.pct + '% vs normal';
    m.sev = { c: 5, h: 4, m: 3 }[s.lvl]; m.prob = 0.9; m.links = m.links || [];
    m.ai = [m.metric + ' is ' + m.now + ' ' + m.unit.replace(/^\/ /, 'a ') + ' against a normal of ' + rnd1(s.mean) + ' (+' + s.pct + '%), since ' + fmt(m.started) + '.',
      m.bizImpact + '.', m.action + '.'];
  });
  technologyCostRisks.forEach(function (c) {
    c.chg = Math.round((c.cur - c.prev) / c.prev * 100);
    c.short = (c.chg > 0 ? '+' : '') + c.chg + '% cost · usage ' + (c.useChg > 0 ? '+' : '') + c.useChg + '%';
  });

  // ---- unified COO priority (0-100) ----
  // Problem → Severity → Business impact → Deadline → Probability → Escalation risk → Recommended action
  var SEV_OF = { c: 5, h: 4, m: 3, n: 1 };
  function dueF(d) { return d == null ? 0.3 : d <= 0 ? 1 : d <= 3 ? 0.95 : d <= 7 ? 0.85 : d <= 14 ? 0.7 : d <= 30 ? 0.5 : 0.3; }
  function cooScore(x) { return Math.round(100 * (0.30 * x.sev / 5 + 0.25 * x.impact / 5 + 0.15 * dueF(x.day) + 0.15 * x.prob + 0.15 * x.esc / 5)); }
  function techRank(x) { return x.impact * x.sev * dueF(x.day) * x.expo; }
  function dueTxt(d) { return d == null ? 'No date' : d < 0 ? Math.abs(d) + ' d overdue' : d === 0 ? 'Today' : short(d) + ' · ' + d + ' d'; }

  var COO_AREAS = [
    { k: 'people', label: 'People & capacity', data: peopleCapacityRisks, sub: 'Where people, skills or hours are short of what deadlines need' },
    { k: 'customer', label: 'Customer impact', data: customerImpactRisks, sub: 'Internal problems traced to the client, deadline and SLA they hit' },
    { k: 'tech', label: 'Technology risk', data: technologyRisks, sub: 'Business-critical security and technology issues only', note: 'Ranked by Business impact × Severity × Deadline × Exposure' },
    { k: 'anomaly', label: 'Anomalies & drift', data: anomalyRisks, sub: 'Metrics behaving differently from their own normal', note: 'Each metric is compared with its own last 8 weeks, not a fixed limit' },
    { k: 'truth', label: 'Cross-system truth', data: crossSystemRisks, sub: 'Where Jira, Bitbucket and Confluence disagree', note: 'Jira = what the team says · Bitbucket = what changed · Confluence = what is written' },
    { k: 'aigov', label: 'AI governance', data: aiGovernanceRisks, sub: 'AI use without an owner, approval, limits or documentation' },
    { k: 'cost', label: 'Technology cost', data: technologyCostRisks, sub: 'Unusual technology spend, not a finance view' },
    { k: 'debt', label: 'Technical debt', data: technicalDebtRisks, sub: 'Old systems tied to the failures and delays they cause' }
  ];
  function cooArea(k) { return COO_AREAS.filter(function (A) { return A.k === k; })[0]; }
  function cooMatches(x) {
    if (!S.sev[x.lvl]) return false;
    if (!S.q) return true;
    return [x.title, x.kind, x.dept, x.project, x.client, x.metric, x.short].join(' ').toLowerCase().indexOf(S.q.toLowerCase()) >= 0;
  }
  function cooList(A) {
    return [];
  }

  // existing risks enter the same priority list; new signals that point at an existing risk corroborate it instead of duplicating it
  function fromExisting(r) {
    var pot = r.id.charAt(0) === 'p', pend = r.id.charAt(0) === 's';
    var x = { id: r.id, existing: true, lvl: r.lvl, title: r.project + ': ' + r.risk, client: r.client, dept: r.dept,
      kind: pend ? 'Pending too long' : pot ? 'Expected risk' : r.type === 'client' ? 'Client delivery risk' : r.type === 'cross' ? 'Cross-team blocker' : 'Delivery risk',
      sev: SEV_OF[r.lvl], impact: Math.min(5, (r.type === 'client' ? 4 : r.type === 'cross' ? 3 : 2) + (r.stake ? (r.stake >= 10 ? 1 : 0.5) : 0)),
      day: pend ? -r.age : r.day, prob: pot ? 0.6 : pend ? 0.9 : r.open === false ? 0.7 : 1, esc: r.type === 'client' ? 5 : r.type === 'cross' ? 4 : 2, action: r.action };
    x.score = cooScore(x); return x;
  }
  function cooPriority() {
    return [];
  }

  // ---- rail card: compact indicators + top 3 COO priorities ----
  function cooRiskCard() {
    var total = 0, all = [];
    var rows = COO_AREAS.map(function (A) {
      var list = cooList(A), w = list.length ? worst(list) : 'n';
      total += list.length; all = all.concat(list);
      return '<button class="cra" data-coo="' + A.k + '" data-tip="' + esc(A.sub) + '"><span class="dot" style="background:' + FILL[w] + '"></span>' +
        '<span class="nm">' + A.label + '</span><span class="ct">Not assessed</span>' +
        '<small>No connected evidence is available for this assessment</small></button>';
    }).join('');
    var tw = all.length ? worst(all) : 'n';
    var P = cooPriority().slice(0, 3);
    return '<section class="card coo" aria-label="COO risk areas"><div class="ch"><h3>COO risk areas</h3><span class="pill n">Not assessed</span></div>' +
      '<div class="cra-list">' + rows + '</div>' +
      '<div class="prio-h"><span>COO priority</span><span>Unavailable</span></div>' +
      P.map(function (g, i) { return prioRow(g, i); }).join('') +
      '<small class="muted">No supported evidence or calibrated probability is available to rank these assessments.</small>' +
      '<button class="more" data-coo="prio" style="margin-top:4px">Full priority list →</button></section>';
  }
  function prioRow(g, i) {
    var x = g.top;
    var open = x.existing ? ' data-ev="' + x.id + '"' : ' data-coo="' + x.area + '|' + x.id + '"';
    return '<button class="prio"' + open + ' data-tip="' + esc(x.title + (g.areas.length ? ' · also flagged by: ' + g.areas.join(', ') : '')) + '">' +
      '<span class="rk">' + (i + 1) + '</span><span class="dot" style="background:' + FILL[x.lvl] + '"></span>' +
      '<span class="pt2"><b>' + esc(x.title) + '</b><small>' + esc(x.kind) + (g.n > 1 ? ' · ' + g.n + ' signals' : '') + '</small></span>' +
      '<span class="sc ' + x.lvl + '">' + x.score + '</span></button>';
  }

  // ---- drawers (same scrim/drawer/proj pattern as the rest of the dashboard) ----
  function sysRow(name, val) { return '<div class="sys"><span class="sn s-' + name.toLowerCase() + '">' + name + '</span><span>' + esc(val) + '</span></div>'; }
  function chainHtml(steps) { return '<div class="cr-chain">' + steps.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('<i aria-hidden="true">→</i>') + '</div>'; }
  function bars(m) {
    var vals = m.hist.concat([m.now]), mx = Math.max.apply(null, vals), w = 14, gap = 5, H = 44;
    var mean = m.stats.mean, my = H - mean / mx * (H - 2);
    return '<svg class="abars" viewBox="0 0 ' + (vals.length * (w + gap)) + ' ' + H + '" role="img" aria-label="Last 8 weeks and this week">' +
      vals.map(function (v, i) {
        var h = Math.max(3, v / mx * (H - 2)), last = i === vals.length - 1;
        return '<rect x="' + i * (w + gap) + '" y="' + (H - h) + '" width="' + w + '" height="' + h + '" rx="2" style="fill:' + (last ? FILL[m.lvl] : '#C9D8CF') + '"><title>' + (last ? 'This week' : 'Week ' + (i - 8)) + ': ' + v + '</title></rect>';
      }).join('') + '<line x1="0" x2="' + (vals.length * (w + gap)) + '" y1="' + my + '" y2="' + my + '" stroke-dasharray="3 3" style="stroke:var(--faint)"/></svg>';
  }
  function cooFields(A, x) {
    var f = [];
    if (A.k === 'people') f = [['Department', x.dept], ['Utilisation', x.util + '%'], ['Required', x.required], ['Available', x.available], ['Missing skill', x.skill], ['Affected project', x.project], ['Deadline', dueTxt(x.day)], ['Predicted delay', x.delay]];
    if (A.k === 'customer') f = [['Customer', x.client], ['Project', x.project], ['Problem', x.problem], ['Customer deadline', dueTxt(x.day)], ['SLA at risk', x.sla], ['Impact probability', Math.round(x.prob * 100) + '%'], ['Business impact', x.bizImpact], ['Recommended action', x.action]];
    if (A.k === 'tech') f = [['Type', x.type], ['Project', x.project + (x.client ? ' · ' + x.client : '')], ['Exposure', x.exposure], ['Open for', x.age ? x.age + ' days' : 'New'], ['Due', dueTxt(x.day)], ['Rank', 'Impact ' + x.impact + ' × Severity ' + x.sev + ' × Deadline ' + dueF(x.day) + ' × Exposure ' + x.expo + ' = ' + rnd1(techRank(x))]];
    if (A.k === 'anomaly') f = [['Normal', rnd1(x.stats.mean) + ' ' + x.unit + ' (8-week average)'], ['Now', x.now + ' ' + x.unit + ' (+' + x.stats.pct + '%)'], ['Started', fmt(x.started)], ['Project', x.project], ['Department', x.dept], ['Possible cause', x.cause], ['Business impact', x.bizImpact]];
    if (A.k === 'truth') f = [['Item', x.item], ['Project', x.project], ['Business impact', x.bizImpact], ['Investigate', x.investigate]];
    if (A.k === 'aigov') f = [['Initiative', x.initiative], ['Issue', x.issue], ['Data involved', x.data], ['Owner', x.owner], ['Approval', x.approval], ['Department', x.dept]];
    if (A.k === 'cost') f = [['Cost change', (x.chg > 0 ? '+' : '') + x.chg + '%'], ['Previous ' + x.period, '₹' + x.prev + ' L'], ['Current ' + x.period, '₹' + x.cur + ' L'], ['Usage / delivery', (x.useChg > 0 ? '+' : '') + x.useChg + '%'], ['Department · project', x.dept + ' · ' + x.project], ['Possible cause', x.cause], ['Estimated impact', x.estImpact], ['Recommended action', x.action]];
    if (A.k === 'debt') f = [['System', x.project], ['Failures', x.incidents], ['Repeat-fix effort', x.hours ? x.hours + ' hours' : '—'], ['Trend', x.trend], ['Depends on it', x.dependents], ['Next deadline', dueTxt(x.day)]];
    return '<dl>' + f.map(function (p) { return '<dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd>'; }).join('') + '</dl>';
  }
  function cooBlock(A, x) {
    var open = S.open === x.id;
    var sub = [x.client, x.project].filter(Boolean).join(' · ') + (A.k === 'anomaly' ? ' · ' + x.dept : '');
    var h = '<div class="proj"><button data-toggle="' + x.id + '" aria-expanded="' + open + '"><span>' + esc(x.title) +
      '<small class="muted" style="display:block;font-weight:400">' + esc(sub) + '</small></span>' +
      '<span style="display:flex;gap:6px;align-items:center"><span class="sc ' + x.lvl + '" data-tip="COO priority score, 0–100">' + x.score + '</span><span class="pill ' + x.lvl + '">' + LEVEL[x.lvl] + '</span></span></button>';
    if (!open) return h + '</div>';
    h += '<div class="cr-body"><div class="cr-ai"><span class="spark">✦</span><dl>' +
      '<dt>What is happening?</dt><dd>' + esc(x.ai[0]) + '</dd><dt>Why does it matter?</dt><dd>' + esc(x.ai[1]) + '</dd><dt>What should the COO do?</dt><dd><b>' + esc(x.ai[2]) + '</b></dd></dl></div>';
    if (A.k === 'anomaly') h += '<div class="cr-viz">' + bars(x) + '<small>Grey = last 8 weeks · dashed = normal · coloured = this week</small></div>';
    if (A.k === 'truth') h += '<div class="cr-sys">' + sysRow('Jira', x.jira) + sysRow('Bitbucket', x.bitbucket) + sysRow('Confluence', x.confluence) + '</div>';
    if (A.k === 'customer') h += chainHtml([x.problem, x.project, x.client, dueTxt(x.day), x.sla]);
    if (A.k === 'debt') h += chainHtml(x.chain);
    h += cooFields(A, x);
    h += '<div class="cr-chainp">Severity ' + x.sev + '/5 · Impact ' + x.impact + '/5 · ' + dueTxt(x.day) + ' · ' + Math.round(x.prob * 100) + '% likely · Escalation ' + x.esc + '/5 → <b>Priority ' + x.score + '</b></div>';
    var linked = (x.links || []).map(function (id) { return RISKS.concat(POTENTIAL, PENDING).filter(function (r) { return r.id === id; })[0]; }).filter(Boolean);
    if (linked.length) h += '<div class="cr-links">Linked on the dashboard: ' + linked.map(function (r) { return '<button class="more" data-ev="' + r.id + '">' + esc(r.risk) + ' →</button>'; }).join(' ') + '</div>';
    return h + '</div></div>';
  }
  function renderCooDrawer(D) {
    var title, sub, body = '';
    if (D.area === 'prio') {
      var P = cooPriority();
      title = 'COO priority'; sub = P.length ? P.length + ' evidence-backed assessments' : 'Unavailable · required source fields and validated rules are not configured';
      body = P.length ? '' :
        '<p class="callout blue">A defensible priority score cannot be calculated from the connected Jira issue fields. Probability, financial impact, release data, and cross-system evidence are not available.</p>';
      body +=
        P.map(function (g, i) {
          return '<div class="prio-wrap">' + prioRow(g, i) + (g.areas.length ? '<small class="also">' + (g.top.existing ? 'Also flagged by ' : 'Area: ') + esc(g.areas.join(', ')) + '</small>' : '') + '</div>';
        }).join('');
    } else {
      var A = cooArea(D.area), list = cooList(A);
      title = A.label; sub = list.length + (list.length === 1 ? ' risk' : ' risks') + ' · ' + A.sub;
      if (A.note) body += '<p class="callout blue">' + esc(A.note) + '</p>';
      if (!list.length) body += '<div class="okbox">Unavailable: required source records and fields are not connected for this assessment.</div>';
      list.forEach(function (x) { body += cooBlock(A, x); });
      if (A.k === 'anomaly') {
        var ok = A.data.filter(function (m) { return m.lvl === 'n'; });
        body += '<h3 style="font-size:14px;margin-top:6px">Checked · within normal</h3><div class="cr-norm">' + ok.map(function (m) {
          return '<div><span>' + esc(m.metric) + '</span><b>' + m.now + '</b><small>normal ' + rnd1(m.stats.mean) + '</small></div>';
        }).join('') + '</div>';
      }
    }
    layer.innerHTML = '<div class="scrim"><button class="away" data-close aria-label="Close"></button><aside class="drawer coo-drawer" role="dialog" aria-label="' + esc(title) + '">' +
      '<div class="top2"><div><h2>' + esc(title) + '</h2><span class="muted">' + esc(sub) + '</span></div><button class="iconbtn" data-close aria-label="Close" style="border:1px solid var(--line)">✕</button></div>' +
      body + '</aside></div>';
  }
  function openCoo(a) {
    var p = a.split('|'), A = p[0] === 'prio' ? null : cooArea(p[0]);
    S.drawer = { type: 'coo', area: p[0] };
    S.open = p[1] || (A ? (cooList(A)[0] || {}).id : null);
    tip.hidden = true; renderDrawer();
  }

  // ---- AI agent: extra prompts and keyword answers ----
  function cooBrief(k) {
    var A = cooArea(k), list = cooList(A);
    if (!list.length) return A.label + ': unavailable; the required evidence is not retrieved from connected sources.';
    return A.label + ' (' + list.length + '):\n' + list.map(function (x) { return '• ' + x.title + ' → ' + x.ai[2]; }).join('\n');
  }
  PROMPTS.push(['What needs my attention first?', function () {
    return cooPriority().slice(0, 5).map(function (g, i) { return (i + 1) + '. ' + g.top.kind + ' (' + g.top.score + '): ' + g.top.title; }).join('\n');
  }]);
  PROMPTS.push(['Anything unusual this week?', function () { return cooBrief('anomaly'); }]);
  function cooAnswer(q) {
    if (/priorit|attention|top problem/.test(q)) return PROMPTS[PROMPTS.length - 2][1]();
    var map = [[/anomal|unusual|spike|drift|sudden/, 'anomaly'], [/sla|customer impact/, 'customer'], [/capacity|resource|skill|overload|utili/, 'people'],
      [/security|vulnerab|cyber|access|compliance|audit/, 'tech'], [/contradict|mismatch|cross-system|jira vs|doesn.t match/, 'truth'], [/governance|\bai (use|tool|agent)|unapproved/, 'aigov'],
      [/cost|cloud|vendor|spend|overspend/, 'cost'], [/debt|legacy|old system/, 'debt']];
    for (var i = 0; i < map.length; i++) if (map[i][0].test(q)) return cooBrief(map[i][1]);
    return null;
  }
  // ===================== end COO risk intelligence =====================

  // =====================================================================
  // SWIPE LAYOUT (add-on). Runs after every render(): it only MOVES the cards render() already built
  // into two slides, so markup, classes, click handlers and data bindings stay exactly as they were.
  //   Slide 1 "COO priorities"          verdict · 5 KPI cards · plan + decisions · AI summary · COO risk areas
  //   Slide 2 "Organisation & timeline" impact on the organisation · departments · timeline
  // =====================================================================
  var SLIDES = ['COO priorities', 'Organisation & timeline'];
  function mk(tag, cls) { var n = document.createElement(tag); n.className = cls; return n; }
  // SWIPE LAYOUT v2 - replaces the old slideify(). Cards are only MOVED (or one removed), never rebuilt.
  //   Slide 1 "COO priorities":  verdict | 4-5 KPI cards | Impact on the organisation (What the problems hit,
  //                              Clients affected, Between departments) | Department not assigned + COO approvals
  //                              right rail: AI summary, Recommended executive plan (compact), COO risk areas
  //   Slide 2 "Organisation & timeline": Departments (the rest) | timeline
  //   "Recent Bitbucket commits" is removed from the page.
  function slideify() {
    var pg = document.getElementById('pager');
    var main = app.querySelector(':scope > .maincol'), rail = app.querySelector(':scope > .rail');
    if (!main || !rail) { if (pg) pg.hidden = true; return; }       // loading / full-page views keep their own layout
    function railCard(re) {                                          // find a rail card by its heading text
      return [].slice.call(rail.children).filter(function (n) { var h = n.querySelector('h3'); return h && re.test(h.textContent); })[0];
    }
    var commits = railCard(/recent bitbucket commits/i), plan = railCard(/recommended executive plan/i),
        decisions = railCard(/^(COO approvals|Decisions awaiting approval)/i), ai = rail.querySelector('.ai');
    var unassigned = main.querySelector('.depts [data-dept="Unassigned"]');   // "Department not assigned" card (live data only)
    if (commits) commits.remove();                                   // 1. remove Recent Bitbucket commits
    if (plan && ai) ai.after(plan);                                  // 2. plan sits under the AI summary, same narrow width
    var s1 = mk('div', 'page slide s1'), s2 = mk('div', 'page slide s2'), m1 = mk('div', 'maincol'), m2 = mk('div', 'maincol'), pair = mk('div', 'pair');
    [].slice.call(main.children).forEach(function (n) {              // 3. impact section (header + 3 cards) goes to slide 1
      (n.matches('.verdict,.kpis,.imp') || n.id === 'sec-impact' ? m1 : m2).appendChild(n);
    });
    if (unassigned) pair.appendChild(unassigned);                    // 4. Department not assigned ...
    if (decisions) pair.appendChild(decisions);                      //    ... next to the COO approvals card
    if (pair.children.length) m1.appendChild(pair);
    s1.appendChild(m1); s1.appendChild(rail); s2.appendChild(m2);
    var deck = mk('div', 'deck'); deck.appendChild(s1); deck.appendChild(s2);
    app.innerHTML = ''; app.classList.add('swipe'); app.appendChild(deck);
    deck.style.scrollBehavior = 'auto'; deck.scrollLeft = (S.slide || 0) * deck.clientWidth; deck.style.scrollBehavior = '';
    deck.addEventListener('scroll', function () { S.slide = Math.round(deck.scrollLeft / (deck.clientWidth || 1)); markPager(); }, { passive: true });
    if (!pg) {
      pg = mk('nav', 'pager'); pg.id = 'pager'; pg.setAttribute('aria-label', 'Dashboard slides');
      pg.innerHTML = SLIDES.map(function (t, i) { return '<button data-slide="' + i + '">' + t + '</button>'; }).join('');
      pg.addEventListener('click', function (e) { var b = e.target.closest('[data-slide]'); if (b) goSlide(+b.getAttribute('data-slide')); });
      document.body.appendChild(pg);
    }
    pg.hidden = false; markPager();
  }
  function goSlide(i) {
    var deck = app.querySelector('.deck'); if (!deck) return;
    i = Math.max(0, Math.min(SLIDES.length - 1, i));
    deck.scrollTo({ left: i * deck.clientWidth, behavior: 'smooth' });
  }
  function markPager() {
    [].forEach.call(document.querySelectorAll('#pager button'), function (b) { b.classList.toggle('on', +b.getAttribute('data-slide') === (S.slide || 0)); });
  }
  document.addEventListener('keydown', function (e) {     // ← / → also swipe (not while typing or a drawer is open)
    if (e.target.closest && e.target.closest('input,textarea') || S.drawer || S.chat) return;
    if (e.key === 'ArrowRight') goSlide((S.slide || 0) + 1);
    if (e.key === 'ArrowLeft') goSlide((S.slide || 0) - 1);
  });

  // =====================================================================
  // EVENTS
  // =====================================================================
  var shell = document.getElementById('shell');
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button,a,[data-ev]');
    if (S.pop && !e.target.closest('.pop') && !(t && t.hasAttribute('data-pop'))) { S.pop = null; renderPops(); }
    if (!t) return;
    var a;
    if ((a = t.getAttribute('data-pop'))) { S.pop = S.pop === a ? null : a; renderPops(); return; }
    if ((a = t.getAttribute('data-sev'))) { if (a === 'all') { S.sev = { c: true, h: true, m: true }; S.types = { client: true, internal: true, cross: true }; } else S.sev[a] = !S.sev[a]; renderPops(); render(); return; }
    if ((a = t.getAttribute('data-ftype'))) { S.types[a] = !S.types[a]; renderPops(); render(); return; }
    if ((a = t.getAttribute('data-cell'))) { var pr = a.split('|'); S.drawer = { type: 'cell', area: pr[0], t: pr[1] }; S.open = null; tip.hidden = true; renderDrawer(); return; }
    if ((a = t.getAttribute('data-type'))) { S.drawer = { type: 'ptype', t: a }; S.open = null; tip.hidden = true; renderDrawer(); return; }
    if ((a = t.getAttribute('data-client'))) { S.drawer = { type: 'client', client: a }; S.open = null; renderDrawer(); return; }
    if ((a = t.getAttribute('data-view'))) { S.view = a; S.pop = null; renderPops(); render(); return; }
    if ((a = t.getAttribute('data-nav'))) {
      if (NAV.filter(function (n) { return n.k === a; })[0].sub) { S.nav[a] = !S.nav[a]; renderNav(); }
      else toast(t.textContent.trim() + ' is not part of this prototype');
      return;
    }
    if ((a = t.getAttribute('data-stub'))) { toast(a + ' is not part of this prototype'); return; }
    if (t.matches('.sub a') && t.getAttribute('href') === '#') { e.preventDefault(); toast(t.textContent + ' is not part of this prototype'); return; }
    if (t.matches('.sub a')) { shell.classList.remove('menu-open'); return; }
    if ((a = t.getAttribute('data-act'))) {
      if (a === 'collapse') shell.classList.toggle('collapsed');
      if (a === 'menu') shell.classList.toggle('menu-open');
      if (a === 'send') { S.sent = true; render(); toast('Plan sent to ' + PLAN.length + ' owners with due dates'); }
      if (a === 'chat') { S.chat = !S.chat; S.bubbleGone = true; renderChat(); if (S.chat) setTimeout(function () { var i = document.getElementById('chatin'); if (i) i.focus(); }, 0); }
      return;
    }
    if ((a = t.getAttribute('data-decide'))) { S.dec[a] = t.getAttribute('data-v'); render(); toast(S.dec[a] === 'yes' ? 'Approved. The requester has been notified.' : 'Declined. The requester has been notified.'); return; }
    if ((a = t.getAttribute('data-undo'))) { delete S.dec[a]; render(); return; }
    if ((a = t.getAttribute('data-ask'))) { var p = PROMPTS[+a]; ask(p[0], p[1]()); return; }
    if ((a = t.getAttribute('data-wk'))) { S.wkOpen[a] = !S.wkOpen[a]; render(); return; }
    if ((a = t.getAttribute('data-dept'))) { S.drawer = { type: 'dept', dept: a }; S.open = null; renderDrawer(); return; }
    if ((a = t.getAttribute('data-coo'))) { openCoo(a); return; }   // COO risk intelligence hook
    if ((a = t.getAttribute('data-open'))) { S.drawer = { type: a }; S.open = null; renderDrawer(); return; }
    if ((a = t.getAttribute('data-ev'))) {
      var r = RISKS.concat(POTENTIAL, PENDING).filter(function (x) { return x.id === a; })[0];
      S.drawer = a.charAt(0) === 'p' ? { type: 'potential' } : a.charAt(0) === 's' ? { type: 'stuck' } : { type: 'dept', dept: r.dept };
      S.open = a; tip.hidden = true; renderDrawer(); return;
    }
    if ((a = t.getAttribute('data-toggle'))) { S.open = S.open === a ? null : a; renderDrawer(); return; }
    if (t.hasAttribute('data-close')) { S.drawer = null; S.open = null; renderDrawer(); return; }
  });
  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'chatform') return;
    e.preventDefault();
    var v = document.getElementById('chatin').value.trim();
    if (v) { ask(v, freeAnswer(v)); var i = document.getElementById('chatin'); if (i) i.focus(); }
  });
  document.getElementById('q').addEventListener('input', function (e) { S.q = e.target.value.trim(); render(); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (S.drawer) { S.drawer = null; renderDrawer(); }
    else if (S.pop) { S.pop = null; renderPops(); }
    else if (S.chat) { S.chat = false; renderChat(); }
    shell.classList.remove('menu-open');
  });
  document.addEventListener('mouseover', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.getAttribute('data-tip'); tip.hidden = false;
  });
  document.addEventListener('mousemove', function (e) {
    if (tip.hidden) return;
    var x = e.clientX + 14, y = e.clientY + 14, r = tip.getBoundingClientRect();
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.left = (x / Z) + 'px'; tip.style.top = (y / Z) + 'px';
  });
  addEventListener('resize', function () { requestAnimationFrame(function () { alignNames(); fit(); }); });


  // =====================================================================
  // INTERACTIVITY LAYER (additive: wires buttons that were stubs. No markup/layout changes)
  //   Menu pages, Help, Settings, notifications, calendar days, auto-refresh, TV keyboard control.
  // =====================================================================
  S.seen = false; S.auto = false; S.every = 30; S.lastTs = null; var autoTimer;
  var SUBMAP = { 'Weekly brief': 'weekly', 'Board pack': 'board', 'Executive report': 'report', 'Budget': 'budget', 'Spend': 'spend', 'Risk register': 'register', 'Mitigations': 'mitig' };
  var ALL = function () { return RISKS; };
  function stakeBy(key) {
    var m = {}; ALL().forEach(function (r) { var k = r[key]; if (k && r.stake) m[k] = (m[k] || 0) + r.stake; });
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).map(function (k) { return [k, m[k]]; });
  }
  function irow(title, lvl, body, meta) {
    return '<div class="proj" style="padding:12px 14px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><b>' + esc(title) + '</b>' +
      (lvl ? '<span class="pill ' + lvl + '">' + (LEVEL[lvl] || lvl) + '</span>' : '') + '</div>' +
      (body ? '<div style="margin-top:6px">' + esc(body) + '</div>' : '') + (meta ? '<small class="muted" style="display:block;margin-top:4px">' + esc(meta) + '</small>' : '') + '</div>';
  }
  function textBox(t) { return '<div class="proj full-copy"><div>' + esc(t) + '</div><button class="btn" data-copy="' + esc(t).replace(/\n/g, '&#10;') + '">Copy to clipboard</button></div>'; }
  function infoPage(k) {
    var R = ALL().slice().sort(bySev), h = '', title, sub;
    if (k === 'weekly') {
      title = 'Weekly brief';
      var score = healthScore();
      sub = (score === null ? 'Health unavailable' : 'Rule-based priority score ' + score + '/100') +
        (DASHBOARD_DATA_AVAILABLE ? ' · ' + criticalOpen().length + ' critical-priority issues open' : ' · current Jira data unavailable');
      h = textBox(PROMPTS[0][1]() + '\n\nCritical:\n' + PROMPTS[1][1]());
    }
    else if (k === 'board') { title = 'Board pack'; sub = 'Draft from Jira issue fields · validate before distribution'; h = textBox(PROMPTS[5][1]()); }
    else if (k === 'report') {
      title = 'Executive report';
      sub = (DASHBOARD_DATA_AVAILABLE ? 'Current Jira issue fields' : 'Current Jira data unavailable') + ' · generated ' + new Date().toLocaleString();
      var severityCounts = { c: 0, h: 0, m: 0, n: 0 };
      R.forEach(function (risk) { severityCounts[risk.lvl] = (severityCounts[risk.lvl] || 0) + 1; });
      var agedIssues = RISKS.filter(function (risk) { return risk.open && risk.age !== null && risk.age > STUCK_DAYS; }).length;
      var areaRows = impactAreas(RISKS.filter(function (risk) { return risk.classificationKnown; })).map(function (area) {
        var cells = ['client', 'internal', 'cross'].map(function (type) {
          var items = R.filter(function (risk) { return risk.classificationKnown && risk.area === area[0] && risk.type === type; });
          return '<td><span class="report-count ' + (items.length ? 'sev-' + worst(items) : 'sev-zero') + '">' +
            (DASHBOARD_DATA_AVAILABLE && !MISSING_JIRA_FIELDS.includes('Client') && !MISSING_JIRA_FIELDS.includes('Impacted department') ? items.length : '—') +
            '</span></td>';
        }).join('');
        return '<tr><th scope="row">' + esc(area[0]) + '<small>' + esc(area[1]) + '</small></th>' + cells + '</tr>';
      }).join('');
      var departmentRows = DEPTS.map(function (dept) {
        var items = R.filter(function (risk) { return risk.dept === dept.name; });
        var critical = items.filter(function (risk) { return risk.lvl === 'c' && risk.open; }).length;
        return '<tr><th scope="row">' + esc(dept.name) + '</th><td>' + (DASHBOARD_DATA_AVAILABLE ? items.length : '—') + '</td><td>' + (DASHBOARD_DATA_AVAILABLE ? critical : '—') + '</td><td>' +
          (DECISION_DATA_AVAILABLE ? DECISIONS.filter(function (decision) { return items.some(function (issue) { return issue.id === decision.id; }); }).length : 'Unavailable') + '</td></tr>';
      }).join('');
      var riskRows = R.slice(0, 10).map(function (risk) {
        return '<tr><td><span class="report-count sev-' + risk.lvl + '">' + esc(LEVEL[risk.lvl]) + '</span></td><th scope="row">' +
          esc(risk.project) + '<small>' + esc(risk.risk) + '</small></th><td>' + esc(risk.dept) + '</td><td>' +
          esc(risk.owner || 'Not recorded') + '</td><td>' + esc(risk.action || 'Not recorded') + '</td></tr>';
      }).join('');
      h = '<div class="report-actions"><button class="btn" type="button" data-print-report>Download PDF</button><span>Choose “Save as PDF” in the print dialog.</span></div>' +
        '<section class="report-stats" aria-label="Executive summary">' +
          '<div class="report-stat sev-c"><small>Critical-priority open issues</small><b>' + (DASHBOARD_DATA_AVAILABLE ? criticalOpen().length : '—') + '</b></div>' +
          '<div class="report-stat sev-h"><small>High-priority issues</small><b>' + (DASHBOARD_DATA_AVAILABLE ? severityCounts.h : '—') + '</b></div>' +
          '<div class="report-stat sev-m"><small>Open issues created over 7 days ago</small><b>' + (DASHBOARD_DATA_AVAILABLE ? agedIssues : '—') + '</b></div>' +
          '<div class="report-stat sev-n"><small>Open issues due in 30 days</small><b>' + (DASHBOARD_DATA_AVAILABLE ? POTENTIAL.length : '—') + '</b></div>' +
        '</section>' +
        '<section class="report-section"><h2>Jira issue classification by business area</h2><p>Uses configured Jira fields only; this does not establish business impact. Historical and financial comparisons are unavailable.</p>' +
          '<div class="report-table-wrap"><table class="report-table"><thead><tr><th>Business area</th><th>Client-facing</th><th>Internal</th><th>Cross-department</th></tr></thead><tbody>' + areaRows + '</tbody></table></div></section>' +
        '<section class="report-section"><h2>Department summary</h2><div class="report-table-wrap"><table class="report-table"><thead><tr><th>Department</th><th>Risks</th><th>Critical open</th><th>Pending approvals</th></tr></thead><tbody>' + departmentRows + '</tbody></table></div></section>' +
        '<section class="report-section"><h2>Priority risks and mitigations</h2><div class="report-table-wrap"><table class="report-table"><thead><tr><th>Severity</th><th>Risk</th><th>Department</th><th>Owner</th><th>Recommended action</th></tr></thead><tbody>' +
          (riskRows || '<tr><td colspan="5">' + (DASHBOARD_DATA_AVAILABLE ? 'No Jira issues were returned by the synchronized query.' : 'Current Jira data is unavailable; cached issues are not included.') + '</td></tr>') + '</tbody></table></div></section>' +
        '<p class="report-disclaimer">This report reflects the data currently available in the dashboard. Validate owners, dates, and mitigations with the relevant teams before distribution.</p>';
    }
    else if (k === 'budget') { title = 'Budget at stake'; sub = 'Financial source data is not connected'; h = '<div class="okbox">Financial impact is unavailable. Jira does not provide a verified amount in the fields currently retrieved.</div>'; }
    else if (k === 'spend') { title = 'Spend exposure'; sub = 'Finance integration not configured'; h = '<div class="okbox">Spend and budget exposure are unavailable without a verified finance source.</div>'; }
    else if (k === 'register') { title = 'Risk register'; sub = R.length + ' risks · most serious first'; h = R.map(function (r) { return irow(r.project, r.lvl, r.risk, r.dept + ' · ' + (r.owner || '')); }).join(''); }
    else if (k === 'mitig') { title = 'Mitigations'; sub = 'Action and owner per risk'; h = R.map(function (r) { return irow(r.project, r.lvl, r.action, 'Owner: ' + (r.owner || '')); }).join(''); }
    else if (k === 'ana') {
      title = 'Analytics'; sub = 'Problems by level and type';
      h = ['c', 'h', 'm'].map(function (l) { var n = ALL().filter(function (r) { return r.lvl === l; }); return irow(LEVEL[l], l, n.length + ' problems', ['client', 'internal', 'cross'].map(function (t) { return TYPE_SHORT[t] + ' ' + n.filter(function (r) { return r.type === t; }).length; }).join(' · ')); }).join('');
    }
    else if (k === 'perf') {
      title = 'Performance'; sub = 'By department';
      h = DEPTS.map(function (d) { var l = ALL().filter(function (r) { return r.dept === d.name; }); return irow(d.name, worst(l), l.length + ' risks · ' + PENDING.filter(function (p) { return p.dept === d.name; }).length + ' pending too long', 'Lead: ' + d.lead); }).join('');
    }
    else if (k === 'help') {
      title = 'Help center'; sub = 'Dashboard guide, keyboard shortcuts, and data support';
      h = '<section class="help-section"><h2>Using the dashboard</h2><div class="help-grid">' +
        irow('Dashboard', '', 'Use Overview, Impact, Departments, and Timeline to navigate dashboard sections. Click a risk or highlighted impact count to see related records.') +
        irow('Full-page views', '', 'Reports, Finance, Risk Management, Analytics, and Performance open as full pages. Return using Back to dashboard or select Dashboard in navigation.') +
        irow('Executive report', '', 'Open Reports → Executive report and choose Download PDF. In the browser print dialog, select Save as PDF.') +
        irow('Severity colors', '', 'Red = critical, orange = high, amber = moderate, and green = normal/on track. Impact cells show the most serious risk in that group.') +
        '</div></section><section class="help-section"><h2>Keyboard shortcuts</h2><div class="help-grid">' +
        [['← ↑ → ↓', 'Move focus between controls'], ['Enter / Space', 'Activate the focused control'], ['Esc / Backspace', 'Close overlays or return from a full page'], ['1 · 2 · 3', 'Select 12-hour, 7-day, or 30-day view'], ['R', 'Refresh dashboard data'], ['A', 'Toggle auto-refresh'], ['F · N · C', 'Open filters, notifications, or calendar'], ['/', 'Focus search'], ['M', 'Collapse or expand navigation'], ['?', 'Open this Help Center']].map(function (x) { return irow(x[0], '', x[1]); }).join('') +
        '</div></section><section class="help-section"><h2>Data and support</h2><p>Dashboard data comes from configured Jira and other connected sources. Use Sync in the top bar to refresh. If a source is unavailable, ask your Jira site administrator to check app access and integration configuration.</p><p>For data-access issues, contact your Jira site administrator and include the affected project, approximate time, and any error shown in the dashboard.</p></section>';
    }
    else if (k === 'settings') {
      title = 'Settings'; sub = 'Dashboard preferences and connected-service controls';
      h = '<section class="settings-section"><h2>Refresh and data</h2><div class="settings-grid">' +
        '<div class="proj settings-group"><b>Automatic refresh</b><p>Refresh dashboard data while this page is open.</p><div class="settings-actions"><button class="btn2" data-auto="toggle">' + (S.auto ? 'Turn auto-refresh off' : 'Turn auto-refresh on') + '</button>' +
        [15, 30, 60].map(function (s) { return '<button class="btn2' + (S.every === s ? ' selected' : '') + '" data-every="' + s + '"' + (S.every === s ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + s + ' seconds</button>'; }).join('') + '</div></div>' +
        '<div class="proj settings-group"><b>Connected sources</b><p>Manage Jira permissions and connected integrations in Atlassian app settings. Use Sync in the top bar to fetch the latest available data.</p><button class="btn2" data-refresh>Sync data now</button></div>' +
        '</div></section><section class="settings-section"><h2>Dashboard display</h2><div class="settings-grid">' +
        '<div class="proj settings-group"><b>Risk filters</b><p>Restore all severity and problem-type filters.</p><button class="btn2" data-sev="all">Reset filters</button></div>' +
        '<div class="proj settings-group"><b>Navigation</b><p>Choose a compact or expanded sidebar to suit your screen.</p><button class="btn2" data-act="collapse">Toggle sidebar width</button></div>' +
        '</div></section><section class="settings-section"><h2>AI assistant</h2><div class="proj settings-group"><b>Server-managed connection</b><p>AI provider credentials belong in secure server configuration, not in this browser. The provider endpoint and request format will be connected after the server API details are supplied.</p></div></section>';
    }
    return [title, sub, h];
  }
  function dayPage(d) {
    var l = ALL().filter(function (r) { return dateOf(r.day).getDate() === d; }).sort(bySev);
    return ['Due ' + short(d - TODAY.getDate()), l.length + ' items', l.map(function (r) { return irow(r.project, r.lvl, r.risk, r.dept + ' · ' + (r.owner || '')); }).join('') || '<div class="okbox">Nothing due.</div>'];
  }
  function renderFullPage() {
    var pg = document.getElementById('pager');
    if (pg) pg.hidden = true;
    app.classList.remove('swipe');
    var page = infoPage(S.page);
    app.classList.add('full-view');
    document.body.classList.toggle('print-report', S.page === 'report');
    app.innerHTML = '<div class="full-page"><header class="full-page-head"><div><h1>' + esc(page[0]) + '</h1><p>' + esc(page[1]) + '</p></div>' +
      '<button class="btn2" type="button" data-page-home>Back to dashboard</button></header><section class="full-page-grid" aria-label="' + esc(page[0]) + '">' +
      (page[2] || '<div class="okbox">No information is available.</div>') + '</section></div>';
  }
  function goDashboard() {
    S.page = null;
    S.drawer = null;
    S.pop = null;
    document.body.classList.remove('print-report');
    renderNav();
    renderPops();
    render();
  }
  var _rd = renderDrawer;
  renderDrawer = function () {
    var D = S.drawer; if (!D || (D.type !== 'info' && D.type !== 'day')) return _rd();
    var p = D.type === 'info' ? infoPage(D.k) : dayPage(D.d);
    layer.innerHTML = '<div class="scrim"><button class="away" data-close aria-label="Close"></button><aside class="drawer" role="dialog" aria-label="' + esc(p[0]) + '">' +
      '<div class="top2"><div><h2>' + esc(p[0]) + '</h2><span class="muted">' + esc(p[1]) + '</span></div><button class="iconbtn" data-close aria-label="Close" style="border:1px solid var(--line)">✕</button></div>' + p[2] + '</aside></div>';
    var c = layer.querySelector('[data-close].iconbtn'); if (c) c.focus();
  };
  var _rp = renderPops;
  renderPops = function () {
    _rp();
    var nb = document.querySelector('[data-pop="notif"] .dotbadge'); if (nb) nb.hidden = S.seen;
    var n = document.getElementById('pop-notif');
    if (S.pop === 'notif') n.insertAdjacentHTML('beforeend', '<button class="opt" data-markseen style="color:var(--accent);font-weight:600">' + (S.seen ? '✓ All seen' : 'Mark all as seen') + '</button>');
    document.querySelectorAll('#pop-cal .cal .has').forEach(function (el) { el.setAttribute('data-day', el.textContent); el.setAttribute('role', 'button'); el.tabIndex = 0; el.style.cursor = 'pointer'; });
  };
  function refreshNow(quiet) { render(); if (S.drawer) renderDrawer(); if (!quiet) toast('Dashboard refreshed'); }
  function requestSourceSync(quiet) {
    var request = new Event('xone-sync-request', { cancelable: true });
    window.dispatchEvent(request);
    if (!request.defaultPrevented) refreshNow(quiet);
  }
  function setAuto(on) { S.auto = on; clearInterval(autoTimer); if (on) autoTimer = setInterval(function () { requestSourceSync(true); }, S.every * 1000); toast('Auto-refresh ' + (on ? 'on · every ' + S.every + ' s' : 'off')); }
  function openInfo(k) {
    S.page = k;
    S.drawer = null;
    S.open = null;
    S.pop = null;
    var parent = { weekly: 'rep', board: 'rep', report: 'rep', budget: 'fin', spend: 'fin', register: 'rm', mitig: 'rm' }[k];
    if (parent) S.nav[parent] = true;
    shell.classList.remove('menu-open');
    renderNav();
    renderPops();
    render();
  }

  var up = document.querySelector('.updated'); up.setAttribute('role', 'button'); up.tabIndex = 0; up.style.cursor = 'pointer'; up.title = 'Refresh now';

  document.addEventListener('click', function (e) {          // capture: runs before the original handler
    var t = e.target.closest('button,a,[data-day],.updated'); if (!t) return;
    var a, stop = true;
    if (t.hasAttribute('data-page-home')) goDashboard();
    else if (t.hasAttribute('data-page')) openInfo(t.getAttribute('data-page'));
    else if (t.hasAttribute('data-print-report')) window.print();
    else if (t.matches('.updated')) refreshNow();
    else if ((a = t.getAttribute('data-stub'))) openInfo(a === 'Settings' ? 'settings' : 'help');
    else if (t.hasAttribute('data-nav') && t.getAttribute('data-nav') === 'dash') goDashboard();
    else if (t.hasAttribute('data-nav') && ['ana', 'perf'].indexOf(t.getAttribute('data-nav')) >= 0) openInfo(t.getAttribute('data-nav'));
    else if (t.matches('.sub a')) {
      e.preventDefault();
      var subLabel = t.textContent.trim(), target = t.getAttribute('href');
      if (SUBMAP[subLabel]) openInfo(SUBMAP[subLabel]);
      else {
        goDashboard();
        if (target && target.charAt(0) === '#') {
          var section = document.getElementById(target.slice(1));
          if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }
    else if (t.hasAttribute('data-markseen')) { S.seen = true; renderPops(); toast('Notifications marked as seen'); }
    else if ((a = t.getAttribute('data-day'))) { S.drawer = { type: 'day', d: +a }; S.pop = null; renderPops(); renderDrawer(); }
    else if (t.hasAttribute('data-copy')) { var tx = t.getAttribute('data-copy'); try { navigator.clipboard.writeText(tx).then(function () { toast('Copied'); }, function () { toast('Copy blocked by the browser'); }); } catch (x) { toast('Copy blocked by the browser'); } }
    else if (t.hasAttribute('data-auto')) { setAuto(!S.auto); render(); }
    else if ((a = t.getAttribute('data-every'))) { S.every = +a; if (S.auto) setAuto(true); render(); }
    else if (t.hasAttribute('data-refresh')) requestSourceSync();
    else stop = false;
    if (stop) e.stopImmediatePropagation();
  }, true);

  // ---- keyboard / TV remote ----
  function focusables() {
    var root = document.getElementById('layer').firstChild ? document.getElementById('layer') : document;
    return Array.prototype.filter.call(root.querySelectorAll('button:not([disabled]),a[href],input,[tabindex="0"]'), function (el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.classList.contains('away'); });
  }
  function moveFocus(dir) {
    var list = focusables(), cur = document.activeElement, i = list.indexOf(cur);
    if (i < 0) { if (list[0]) list[0].focus(); return; }
    var c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2, best = null, bs = 1e12;
    list.forEach(function (el) {
      if (el === cur) return; var r = el.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
      var main = dir === 'L' ? -x : dir === 'R' ? x : dir === 'U' ? -y : y, cross = (dir === 'L' || dir === 'R') ? Math.abs(y) : Math.abs(x);
      if (main <= 4) return; var s = main + cross * 2; if (s < bs) { bs = s; best = el; }
    });
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
  document.addEventListener('keydown', function (e) {
    var typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var arrows = { ArrowUp: 'U', ArrowDown: 'D' };
    if (arrows[e.key]) { e.preventDefault(); moveFocus(arrows[e.key]); return; }
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement.matches('[role="button"]')) { e.preventDefault(); document.activeElement.click(); return; }
    if (e.key === 'Backspace' && !typing) { if (S.page) { e.preventDefault(); goDashboard(); } else if (S.drawer || S.pop || S.chat) { e.preventDefault(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } return; }
    if (e.key === 'Escape' && S.page) { goDashboard(); return; }
    if (typing) return;
    var k = e.key.toLowerCase(), v = { '1': '12h', '2': '7d', '3': '30d' }[k];
    if (v) { S.view = v; S.pop = null; renderPops(); render(); }
    else if (k === 'r') refreshNow();
    else if (k === 'a') setAuto(!S.auto);
    else if (k === 'f' || k === 'n' || k === 'c') { S.pop = S.pop === { f: 'filter', n: 'notif', c: 'cal' }[k] ? null : { f: 'filter', n: 'notif', c: 'cal' }[k]; renderPops(); }
    else if (k === 'm') shell.classList.toggle('collapsed');
    else if (k === '?') openInfo('help');
    else if (k === '/') { e.preventDefault(); document.getElementById('q').focus(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.activeElement && document.activeElement.id === 'q') document.activeElement.blur(); });

  window.addEventListener('xone-source-data', function (event) {
    var data = event.detail || {};
    var snapshot = data.snapshot;
    var forecast = data.forecast;
    var jiraState = data.state && data.state.jira ? data.state.jira : null;
    var lastJiraSync = jiraState && jiraState.syncedAt || snapshot && snapshot.syncedAt;
    var jiraFresh = isSourceFresh(lastJiraSync);
    var jiraCurrent = Boolean(snapshot && jiraState && jiraFresh && (jiraState.state === 'connected' || jiraState.state === 'partial'));
    var issues = jiraCurrent && Array.isArray(snapshot.jiraIssues) ? snapshot.jiraIssues : [];
    DASHBOARD_DATA_AVAILABLE = jiraCurrent;
    MISSING_JIRA_FIELDS = jiraState && Array.isArray(jiraState.missingFields) ? jiraState.missingFields : [];
    DECISION_DATA_AVAILABLE = jiraCurrent && !MISSING_JIRA_FIELDS.includes('COO decision') && !MISSING_JIRA_FIELDS.includes('COO approver');
    DEPARTMENT_DATA_AVAILABLE = jiraCurrent && !MISSING_JIRA_FIELDS.includes('Department') && !MISSING_JIRA_FIELDS.includes('Impacted department');
    Object.keys(VIEWS).forEach(function (view) {
      VIEWS[view].health = ['—', 'historical data unavailable'];
      VIEWS[view].off = ['—', 'historical data unavailable', 0];
      VIEWS[view].crit = ['—', 'historical data unavailable'];
      VIEWS[view].stuck = ['—', 'historical data unavailable'];
      VIEWS[view].pot = ['—', 'Forecast: ' + potentialForecastStatus(forecast)];
    });
    [
      peopleCapacityRisks,
      crossSystemRisks,
      customerImpactRisks,
      anomalyRisks,
      technologyRisks,
      aiGovernanceRisks,
      technologyCostRisks,
      technicalDebtRisks
    ].forEach(function (items) { items.length = 0; });
    var updatedLabel = document.querySelector('.updated');
    if (updatedLabel) {
      var syncedAt = snapshot && snapshot.syncedAt ? new Date(snapshot.syncedAt) : null;
      updatedLabel.textContent = !jiraCurrent
        ? (jiraState && jiraState.state === 'error' ? 'Unavailable' :
          jiraState && (jiraState.state === 'connected' || jiraState.state === 'partial') && !jiraFresh ? 'Stale' : 'Unavailable')
        : syncedAt && !Number.isNaN(syncedAt.getTime())
          ? jiraState.state === 'partial'
            ? 'Partial'
            : 'Last updated ' + syncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'Not synced';
      updatedLabel.title = syncedAt && !Number.isNaN(syncedAt.getTime())
        ? (jiraCurrent ? 'Last successful Jira sync: ' : 'Last successful Jira sync (cached data not used): ') + syncedAt.toLocaleString() + (jiraState && jiraState.message ? '\n' + jiraState.message : '')
        : (jiraState && jiraState.message) || 'No successful Jira source sync has been recorded';
      updatedLabel.title += '\n' + forecastTooltip(forecast);
      if (jiraState && jiraState.state === 'partial') {
        updatedLabel.title += '\nJira data is partial.';
      }
    }
    var today = new Date();
    TODAY = today;
    DELIVERY_METRICS = calculateDeliveryMetrics(issues, today);
    var departments = {};
    var projects = {};
    RISKS = issues.map(function (issue) {
      var priority = String(issue.priority || '').trim().toLowerCase();
      var priorityKnown = Boolean(priority) && ['unset', 'unknown'].indexOf(priority) < 0;
      var lvl = !priorityKnown ? 'u' : ['blocker', 'critical', 'highest', 'urgent'].indexOf(priority) >= 0 ? 'c'
        : priority === 'high' ? 'h'
          : ['medium', 'normal'].indexOf(priority) >= 0 ? 'm' : 'n';
      var status = String(issue.status || '').trim().toLowerCase();
      var statusKnown = Boolean(status) && ['unknown', 'unset'].indexOf(status) < 0;
      var open = statusKnown && ['done', 'closed', 'resolved', 'complete', 'completed'].indexOf(status) < 0;
      var dept = String(issue.department || (MISSING_JIRA_FIELDS.includes('Department') ? 'Department unavailable' : 'Unassigned')).trim() || 'Unassigned';
      var impactedDepartment = String(issue.impactedDepartment || '').trim();
      var createdAt = issue.createdAt || '';
      var created = createdAt ? new Date(createdAt) : null;
      var age = created && !Number.isNaN(created.getTime())
        ? Math.max(0, Math.floor((today.getTime() - created.getTime()) / 86400000)) : null;
      var dueDate = String(issue.dueDate || '').slice(0, 10);
      var day = 99999;
      if (dueDate) {
        var due = new Date(dueDate + 'T00:00:00');
        if (!Number.isNaN(due.getTime())) {
          day = Math.round((due.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
        }
      }
      departments[dept] = true;
      if (issue.project && issue.project !== 'Unknown') projects[issue.project] = true;
      return {
        id: issue.key,
        key: issue.key,
        priorityKnown: priorityKnown,
        statusKnown: statusKnown,
        sourceStatus: issue.status || '',
        dept: dept,
        project: issue.project && issue.project !== 'Unknown' ? issue.project : 'Unknown project',
        lvl: lvl,
        open: open,
        blocked: status.indexOf('block') >= 0,
        day: day,
        age: age,
        dueDate: dueDate,
        type: impactedDepartment ? 'cross' : issue.client ? 'client' : 'internal',
        classificationKnown: !MISSING_JIRA_FIELDS.includes('Client') && !MISSING_JIRA_FIELDS.includes('Impacted department'),
        from: impactedDepartment ? dept : '',
        to: impactedDepartment,
        area: impactArea(issue.impactArea, issue.deliveryInitiative),
        risk: issue.summary || '',
        cause: '',
        impact: issue.customerImpact || '',
        action: issue.mitigation || '',
        owner: issue.owner || '',
        client: issue.client || '',
        customerImpact: issue.customerImpact || '',
        mitigation: issue.mitigation || '',
        cooDecision: issue.cooDecision || '',
        cooApprover: issue.cooApprover || '',
        approvalDate: issue.approvalDate || '',
        pendingApproval: DECISION_DATA_AVAILABLE && Boolean((issue.cooDecision && !/^(approved|rejected|declined)$/i.test(issue.cooDecision)) || (issue.cooApprover && !issue.cooDecision))
      };
    });
    var names = Object.keys(departments);
    DEPTS = names.map(function (name) {
      return {
        name: name,
        short: name,
        lead: '',
        normal: RISKS.filter(function (issue) { return issue.dept === name && issue.priorityKnown && issue.lvl === 'n'; }).length,
      };
    });
    TOTAL_PROJECTS = Object.keys(projects).length;
    POTENTIAL = RISKS.filter(function (issue) { return issue.open && issue.dueDate && issue.day >= 0 && issue.day <= 30; })
      .map(function (issue) { return Object.assign({}, issue, { id: 'p_' + issue.id }); });
    PENDING = RISKS.filter(function (issue) { return issue.open && issue.age !== null && issue.age > STUCK_DAYS; })
      .map(function (issue) { return Object.assign({}, issue, { id: 's_' + issue.id, day: -issue.age }); });
    PLAN = [];
    DECISIONS = RISKS.filter(function (issue) { return issue.pendingApproval; }).map(function (issue) {
      return {
        id: issue.id,
        text: issue.risk || issue.key,
        meta: 'Decision maker: ' + (issue.cooApprover || issue.owner || 'not recorded') + ' · Jira ' + issue.key,
        status: issue.cooDecision || 'Pending',
      };
    });
    NOTIFS = [];
    MILESTONES = {
      c: RISKS.filter(function (issue) { return issue.priorityKnown && issue.lvl === 'c'; }).length,
      h: RISKS.filter(function (issue) { return issue.priorityKnown && issue.lvl === 'h'; }).length,
      n: RISKS.filter(function (issue) { return issue.priorityKnown && (issue.lvl === 'm' || issue.lvl === 'n'); }).length,
      u: RISKS.filter(function (issue) { return !issue.priorityKnown; }).length,
    };
    S.dec = {};
    S.sent = false;
    var bubble = document.getElementById('bubble');
    if (bubble) bubble.textContent = !DASHBOARD_DATA_AVAILABLE
      ? 'Current Jira metrics are unavailable. Check source synchronization status.'
      : RISKS.length
      ? criticalOpen().length + ' critical risks need action. Ask me for a briefing.'
      : 'Jira synchronized successfully; no issues were returned.';
    S.sev = { c: true, h: true, m: true, n: true };
    S.types = { client: true, internal: true, cross: true };
    renderNav();
    renderPops();
    render();
    renderChat();
    fit();
  });

  RISKS = [];
  POTENTIAL = [];
  PENDING = [];
  PLAN = [];
  DECISIONS = [];
  NOTIFS = [];
  DEPTS = [];
  TOTAL_PROJECTS = 0;
  MILESTONES = { c: 0, h: 0, n: 0, u: 0 };
  [
    peopleCapacityRisks,
    crossSystemRisks,
    customerImpactRisks,
    anomalyRisks,
    technologyRisks,
    aiGovernanceRisks,
    technologyCostRisks,
    technicalDebtRisks
  ].forEach(function (items) { items.length = 0; });
  Object.keys(VIEWS).forEach(function (view) {
    VIEWS[view].health = ['—', 'historical data unavailable'];
    VIEWS[view].off = ['—', 'historical data unavailable', 0];
    VIEWS[view].crit = ['—', 'historical data unavailable'];
    VIEWS[view].stuck = ['—', 'historical data unavailable'];
    VIEWS[view].pot = ['—', 'historical data unavailable'];
  });
  TODAY = new Date();
  DELIVERY_METRICS = calculateDeliveryMetrics([], TODAY);
  renderNav(); renderPops(); render(); renderChat();
  setTimeout(function () { S.bubbleGone = true; renderChat(); }, 7000);
  fit();
}