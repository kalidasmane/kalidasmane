/* VAPT Navigator — application logic (no build step, no external deps) */
(function () {
  "use strict";

  var DATA = window.VAPT_DATA;
  var STORAGE_KEY = "vapt-nav:";

  /* ---------------------------------------------------------------- */
  /* Icons                                                             */
  /* ---------------------------------------------------------------- */
  var ICON_PATHS = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    recon: '<circle cx="10" cy="10" r="6"/><circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none"/><line x1="14.5" y1="14.5" x2="20" y2="20"/>',
    network: '<circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="12" cy="18" r="2.4"/><line x1="8.2" y1="6.8" x2="15.8" y2="6.8"/><line x1="7.4" y1="8.1" x2="10.8" y2="15.9"/><line x1="16.6" y1="8.1" x2="13.2" y2="15.9"/>',
    web: '<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3c3 3 3 15 0 18"/><path d="M12 3c-3 3-3 15 0 18"/>',
    api: '<polyline points="8 6 3 12 8 18"/><polyline points="16 6 21 12 16 18"/>',
    mobile: '<rect x="7" y="2" width="10" height="20" rx="2"/><line x1="10" y1="19" x2="14" y2="19"/>',
    cloud: '<path d="M17.5 19H7.2a4.2 4.2 0 0 1-.5-8.37A6 6 0 0 1 18 10.2 3.6 3.6 0 0 1 17.5 19z"/>',
    ad: '<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="19" r="2.2"/><line x1="12" y1="7.2" x2="12" y2="12"/><line x1="12" y1="12" x2="5" y2="16.8"/><line x1="12" y1="12" x2="19" y2="16.8"/>',
    wireless: '<path d="M4.5 11.5a11 11 0 0 1 15 0"/><path d="M8 15a6.2 6.2 0 0 1 8 0"/><circle cx="12" cy="18.7" r="1.2" fill="currentColor" stroke="none"/>',
    container: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4 7.5 12 12l8-4.5"/><line x1="12" y1="12" x2="12" y2="21"/>',
    glossary: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H12v20H6.5A2.5 2.5 0 0 1 4 19.5v-15z"/><path d="M20 4.5A2.5 2.5 0 0 0 17.5 2H12v20h5.5a2.5 2.5 0 0 0 2.5-2.5v-15z"/>',
    commands: '<rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="6 9 10 12 6 15"/><line x1="12" y1="15" x2="17" y2="15"/>',
    methodology: '<circle cx="5" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="12" r="2"/><line x1="5" y1="7" x2="5" y2="17"/><line x1="6.6" y1="6.3" x2="17.4" y2="10.7"/><line x1="6.6" y1="17.7" x2="17.4" y2="13.3"/>',
    shield: '<path d="M12 2.5l7.5 3.4v5.4c0 5-3.2 8.4-7.5 10.2-4.3-1.8-7.5-5.2-7.5-10.2V5.9L12 2.5z"/>',
    search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    sun: '<circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="4.2" y1="4.2" x2="6" y2="6"/><line x1="18" y1="18" x2="19.8" y2="19.8"/><line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/><line x1="4.2" y1="19.8" x2="6" y2="18"/><line x1="18" y1="6" x2="19.8" y2="4.2"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    close: '<line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>',
    alert: '<path d="M12 3l9.5 16.5H2.5L12 3z"/><line x1="12" y1="9.5" x2="12" y2="14"/><circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none"/>',
    chevron: '<polyline points="6 9 12 15 18 9"/>',
    arrowRight: '<line x1="4" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>',
  };

  function icon(name, cls) {
    var d = ICON_PATHS[name] || ICON_PATHS.shield;
    return (
      '<svg class="icon ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>"
    );
  }

  /* ---------------------------------------------------------------- */
  /* Utilities                                                         */
  /* ---------------------------------------------------------------- */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function getCategory(id) {
    return DATA.categories.filter(function (c) { return c.id === id; })[0];
  }

  function checklistStorageKey(catId) {
    return STORAGE_KEY + "checklist:" + catId;
  }

  function loadChecklistState(catId) {
    try {
      return JSON.parse(localStorage.getItem(checklistStorageKey(catId))) || {};
    } catch (e) {
      return {};
    }
  }

  function saveChecklistState(catId, state) {
    try {
      localStorage.setItem(checklistStorageKey(catId), JSON.stringify(state));
    } catch (e) { /* storage unavailable — ignore */ }
  }

  function checklistTotals(cat) {
    var total = 0;
    cat.checklist.forEach(function (phase) { total += phase.items.length; });
    return total;
  }

  function checklistDone(cat) {
    var state = loadChecklistState(cat.id);
    return Object.keys(state).filter(function (k) { return state[k]; }).length;
  }

  /* ---------------------------------------------------------------- */
  /* Theme                                                              */
  /* ---------------------------------------------------------------- */
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY + "theme"); } catch (e) {}
    var theme = saved || (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", theme);
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute("data-theme");
    var next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(STORAGE_KEY + "theme", next); } catch (e) {}
    renderThemeToggle();
  }

  function renderThemeToggle() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    var isDark = document.documentElement.getAttribute("data-theme") === "dark";
    btn.innerHTML = icon(isDark ? "sun" : "moon") + '<span>' + (isDark ? "Light mode" : "Dark mode") + "</span>";
  }

  /* ---------------------------------------------------------------- */
  /* Layout shell                                                       */
  /* ---------------------------------------------------------------- */
  var NAV_LINKS = [
    { hash: "#/", label: "Dashboard", icon: "dashboard" },
    { hash: "#/methodology", label: "Methodology", icon: "methodology" },
    { hash: "#/commands", label: "Command Library", icon: "commands" },
    { hash: "#/glossary", label: "Glossary", icon: "glossary" },
  ];

  function buildShell() {
    var root = document.getElementById("root");
    root.innerHTML =
      '<div class="app-shell">' +
        '<button class="mobile-nav-toggle" id="mobile-nav-toggle" aria-label="Toggle navigation">' + icon("menu") + "</button>" +
        '<aside class="sidebar" id="sidebar">' +
          '<div class="brand">' +
            '<span class="brand-mark">' + icon("shield") + "</span>" +
            '<div><span class="brand-name">' + escapeHtml(DATA.meta.name) + '</span>' +
            '<span class="brand-sub">VAPT Field Toolkit</span></div>' +
          "</div>" +
          '<div class="side-search">' +
            icon("search") +
            '<input type="text" id="global-search" placeholder="Search domains, commands, terms…" autocomplete="off" />' +
            '<div class="search-results" id="search-results" hidden></div>' +
          "</div>" +
          '<nav class="side-nav" id="side-nav"></nav>' +
          '<div class="side-nav-label">Domains</div>' +
          '<nav class="side-nav" id="side-nav-cats"></nav>' +
          '<button class="theme-toggle" id="theme-toggle"></button>' +
        "</aside>" +
        '<main class="main" id="main"></main>' +
      "</div>";

    var navHtml = NAV_LINKS.map(function (l) {
      return '<a href="' + l.hash + '" class="nav-link" data-hash="' + l.hash + '">' + icon(l.icon) + "<span>" + l.label + "</span></a>";
    }).join("");
    document.getElementById("side-nav").innerHTML = navHtml;

    var catHtml = DATA.categories.map(function (c) {
      var hash = "#/category/" + c.id;
      return '<a href="' + hash + '" class="nav-link" data-hash="' + hash + '">' + icon(c.icon) + "<span>" + escapeHtml(c.name) + "</span></a>";
    }).join("");
    document.getElementById("side-nav-cats").innerHTML = catHtml;

    document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
    renderThemeToggle();

    document.getElementById("mobile-nav-toggle").addEventListener("click", function () {
      document.getElementById("sidebar").classList.toggle("open");
    });

    document.getElementById("sidebar").addEventListener("click", function (e) {
      if (e.target.closest("a.nav-link")) {
        document.getElementById("sidebar").classList.remove("open");
      }
    });

    setupSearch();
  }

  function highlightActiveNav() {
    var hash = window.location.hash || "#/";
    document.querySelectorAll(".nav-link").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-hash") === hash);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Search                                                             */
  /* ---------------------------------------------------------------- */
  function buildSearchIndex() {
    var idx = [];
    DATA.categories.forEach(function (c) {
      idx.push({ type: "Domain", title: c.name, sub: c.tagline, hash: "#/category/" + c.id });
      c.jargon.forEach(function (j) {
        idx.push({ type: "Term", title: j.term, sub: c.name, hash: "#/category/" + c.id + "#jargon" });
      });
      c.commands.forEach(function (cmd) {
        idx.push({ type: "Command", title: cmd.tool, sub: cmd.purpose, hash: "#/category/" + c.id + "#commands" });
      });
    });
    DATA.globalGlossary.forEach(function (g) {
      idx.push({ type: "Term", title: g.term, sub: "Glossary", hash: "#/glossary" });
    });
    return idx;
  }

  var SEARCH_INDEX = null;

  function setupSearch() {
    if (!SEARCH_INDEX) SEARCH_INDEX = buildSearchIndex();
    var input = document.getElementById("global-search");
    var results = document.getElementById("search-results");

    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      if (!q) { results.hidden = true; results.innerHTML = ""; return; }
      var matches = SEARCH_INDEX.filter(function (item) {
        return item.title.toLowerCase().indexOf(q) !== -1 || (item.sub && item.sub.toLowerCase().indexOf(q) !== -1);
      }).slice(0, 8);

      if (!matches.length) {
        results.innerHTML = '<div class="search-empty">No matches</div>';
      } else {
        results.innerHTML = matches.map(function (m) {
          return (
            '<a href="' + m.hash + '" class="search-result">' +
              '<span class="search-tag">' + m.type + "</span>" +
              '<span class="search-title">' + escapeHtml(m.title) + "</span>" +
              '<span class="search-sub">' + escapeHtml(m.sub || "") + "</span>" +
            "</a>"
          );
        }).join("");
      }
      results.hidden = false;
    });

    document.addEventListener("click", function (e) {
      if (!e.target.closest(".side-search")) results.hidden = true;
    });

    results.addEventListener("click", function () {
      input.value = "";
      results.hidden = true;
      document.getElementById("sidebar").classList.remove("open");
    });
  }

  /* ---------------------------------------------------------------- */
  /* Page: Dashboard                                                    */
  /* ---------------------------------------------------------------- */
  function renderDashboard() {
    var totalCommands = 0, totalChecklist = 0, totalDone = 0, totalTerms = DATA.globalGlossary.length;
    DATA.categories.forEach(function (c) {
      totalCommands += c.commands.length;
      totalChecklist += checklistTotals(c);
      totalDone += checklistDone(c);
      totalTerms += c.jargon.length;
    });

    var statsHtml =
      statCard("dashboard", DATA.categories.length, "VAPT Domains") +
      statCard("commands", totalCommands, "Ready-to-run Commands") +
      statCard("methodology", totalChecklist, "Checklist Items") +
      statCard("glossary", totalTerms, "Glossary Terms");

    var progressPct = totalChecklist ? Math.round((totalDone / totalChecklist) * 100) : 0;

    var catCardsHtml = DATA.categories.map(function (c) {
      var done = checklistDone(c), total = checklistTotals(c);
      var pct = total ? Math.round((done / total) * 100) : 0;
      return (
        '<a class="cat-card" href="#/category/' + c.id + '">' +
          '<div class="cat-card-icon">' + icon(c.icon) + "</div>" +
          '<div class="cat-card-body">' +
            "<h3>" + escapeHtml(c.name) + "</h3>" +
            "<p>" + escapeHtml(c.tagline) + "</p>" +
            '<div class="mini-progress"><div class="mini-progress-bar" style="width:' + pct + '%"></div></div>' +
            '<span class="mini-progress-label">' + done + " / " + total + " checklist items</span>" +
          "</div>" +
          icon("arrowRight", "cat-card-arrow") +
        "</a>"
      );
    }).join("");

    setMain(
      '<div class="page">' +
        '<section class="hero">' +
          '<h1>' + escapeHtml(DATA.meta.name) + "</h1>" +
          "<p>" + escapeHtml(DATA.meta.tagline) + "</p>" +
          '<div class="callout callout-warn">' + icon("alert") + "<span>" + escapeHtml(DATA.meta.disclaimer) + "</span></div>" +
        "</section>" +
        '<section class="stat-grid">' + statsHtml + "</section>" +
        '<section class="panel">' +
          '<div class="panel-header"><h2>Overall Checklist Progress</h2><span class="tag">' + progressPct + '%</span></div>' +
          '<div class="mini-progress large"><div class="mini-progress-bar" style="width:' + progressPct + '%"></div></div>' +
        "</section>" +
        '<section>' +
          '<div class="section-heading"><h2>VAPT Domains</h2><a href="#/methodology" class="link-quiet">View full methodology →</a></div>' +
          '<div class="cat-grid">' + catCardsHtml + "</div>" +
        "</section>" +
      "</div>"
    );
  }

  function statCard(iconName, value, label) {
    return (
      '<div class="stat-card">' +
        '<div class="stat-icon">' + icon(iconName) + "</div>" +
        '<div><div class="stat-value">' + value + '</div><div class="stat-label">' + escapeHtml(label) + "</div></div>" +
      "</div>"
    );
  }

  /* ---------------------------------------------------------------- */
  /* Page: Methodology                                                  */
  /* ---------------------------------------------------------------- */
  function renderMethodology() {
    var items = DATA.methodology.map(function (m, i) {
      return (
        '<div class="timeline-item">' +
          '<div class="timeline-marker">' + (i + 1) + "</div>" +
          '<div class="timeline-content">' +
            "<h3>" + escapeHtml(m.phase) + "</h3>" +
            '<p class="timeline-short">' + escapeHtml(m.short) + "</p>" +
            "<p>" + escapeHtml(m.detail) + "</p>" +
          "</div>" +
        "</div>"
      );
    }).join("");

    setMain(
      '<div class="page">' +
        '<header class="page-header">' +
          '<span class="page-icon">' + icon("methodology") + "</span>" +
          '<div><h1>VAPT Methodology</h1><p>The eight-phase lifecycle every domain in this toolkit follows, end to end.</p></div>' +
        "</header>" +
        '<div class="timeline">' + items + "</div>" +
      "</div>"
    );
  }

  /* ---------------------------------------------------------------- */
  /* Page: Glossary                                                    */
  /* ---------------------------------------------------------------- */
  function allGlossaryTerms() {
    var terms = DATA.globalGlossary.map(function (g) { return { term: g.term, def: g.def, source: "General" }; });
    DATA.categories.forEach(function (c) {
      c.jargon.forEach(function (j) { terms.push({ term: j.term, def: j.def, source: c.name }); });
    });
    terms.sort(function (a, b) { return a.term.localeCompare(b.term); });
    return terms;
  }

  function renderGlossary() {
    var terms = allGlossaryTerms();

    function draw(filter) {
      var f = (filter || "").toLowerCase();
      var filtered = terms.filter(function (t) {
        return !f || t.term.toLowerCase().indexOf(f) !== -1 || t.def.toLowerCase().indexOf(f) !== -1;
      });
      var list = document.getElementById("glossary-list");
      if (!filtered.length) {
        list.innerHTML = '<p class="empty-state">No terms match “' + escapeHtml(filter) + '”.</p>';
        return;
      }
      list.innerHTML = filtered.map(function (t) {
        return (
          '<div class="glossary-item">' +
            '<div class="glossary-term">' + escapeHtml(t.term) + '<span class="tag tag-quiet">' + escapeHtml(t.source) + "</span></div>" +
            "<p>" + escapeHtml(t.def) + "</p>" +
          "</div>"
        );
      }).join("");
    }

    setMain(
      '<div class="page">' +
        '<header class="page-header">' +
          '<span class="page-icon">' + icon("glossary") + "</span>" +
          '<div><h1>Jargon Buster</h1><p>Every acronym and term used in this toolkit, explained in plain English.</p></div>' +
        "</header>" +
        '<div class="filter-bar">' + icon("search") + '<input type="text" id="glossary-filter" placeholder="Filter terms…" /></div>' +
        '<div class="glossary-list" id="glossary-list"></div>' +
      "</div>"
    );

    draw("");
    document.getElementById("glossary-filter").addEventListener("input", function (e) { draw(e.target.value); });
  }

  /* ---------------------------------------------------------------- */
  /* Page: Command Library                                             */
  /* ---------------------------------------------------------------- */
  function allCommands() {
    var cmds = [];
    DATA.categories.forEach(function (c) {
      c.commands.forEach(function (cmd) {
        cmds.push({ tool: cmd.tool, purpose: cmd.purpose, syntax: cmd.syntax, catName: c.name, catId: c.id, catIcon: c.icon });
      });
    });
    return cmds;
  }

  function renderCommands() {
    var cmds = allCommands();
    var cats = [{ id: "all", name: "All domains" }].concat(
      DATA.categories.map(function (c) { return { id: c.id, name: c.name }; })
    );

    function draw(filter, catFilter) {
      var f = (filter || "").toLowerCase();
      var filtered = cmds.filter(function (c) {
        var matchesText = !f || c.tool.toLowerCase().indexOf(f) !== -1 || c.purpose.toLowerCase().indexOf(f) !== -1;
        var matchesCat = catFilter === "all" || c.catId === catFilter;
        return matchesText && matchesCat;
      });
      var list = document.getElementById("commands-list");
      if (!filtered.length) {
        list.innerHTML = '<p class="empty-state">No commands match your filter.</p>';
        return;
      }
      list.innerHTML = filtered.map(commandCardHtml).join("");
      bindCopyButtons(list);
    }

    setMain(
      '<div class="page">' +
        '<header class="page-header">' +
          '<span class="page-icon">' + icon("commands") + "</span>" +
          '<div><h1>Command Library</h1><p>' + cmds.length + ' ready-to-run commands across every domain, in one searchable list.</p></div>' +
        "</header>" +
        '<div class="filter-bar">' +
          icon("search") +
          '<input type="text" id="cmd-filter" placeholder="Search tool or purpose…" />' +
          '<select id="cmd-cat-filter">' + cats.map(function (c) { return '<option value="' + c.id + '">' + escapeHtml(c.name) + "</option>"; }).join("") + "</select>" +
        "</div>" +
        '<div class="commands-list" id="commands-list"></div>' +
      "</div>"
    );

    draw("", "all");
    document.getElementById("cmd-filter").addEventListener("input", function () {
      draw(document.getElementById("cmd-filter").value, document.getElementById("cmd-cat-filter").value);
    });
    document.getElementById("cmd-cat-filter").addEventListener("change", function () {
      draw(document.getElementById("cmd-filter").value, document.getElementById("cmd-cat-filter").value);
    });
  }

  function commandCardHtml(cmd) {
    var id = "cmd-" + Math.random().toString(36).slice(2, 9);
    return (
      '<div class="command-card">' +
        '<div class="command-card-header">' +
          '<span class="command-tool">' + escapeHtml(cmd.tool) + "</span>" +
          '<span class="tag tag-quiet">' + icon(cmd.catIcon) + escapeHtml(cmd.catName) + "</span>" +
        "</div>" +
        "<p>" + escapeHtml(cmd.purpose) + "</p>" +
        '<div class="code-block">' +
          '<button class="copy-btn" data-target="' + id + '">' + icon("copy") + "<span>Copy</span></button>" +
          "<pre id=\"" + id + "\">" + escapeHtml(cmd.syntax) + "</pre>" +
        "</div>" +
      "</div>"
    );
  }

  function bindCopyButtons(scope) {
    scope.querySelectorAll(".copy-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pre = document.getElementById(btn.getAttribute("data-target"));
        var text = pre.textContent;
        var done = function () {
          var span = btn.querySelector("span");
          var original = span.textContent;
          span.textContent = "Copied!";
          btn.classList.add("copied");
          setTimeout(function () { span.textContent = original; btn.classList.remove("copied"); }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, done);
        } else {
          done();
        }
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Page: Category detail                                             */
  /* ---------------------------------------------------------------- */
  function renderCategory(id) {
    var cat = getCategory(id);
    if (!cat) { renderNotFound(); return; }

    var jargonHtml = cat.jargon.map(function (j) {
      return (
        '<details class="jargon-chip">' +
          "<summary>" + escapeHtml(j.term) + icon("chevron", "chevron") + "</summary>" +
          "<p>" + escapeHtml(j.def) + "</p>" +
        "</details>"
      );
    }).join("");

    var toolsHtml = cat.tools.map(function (t) {
      return '<div class="tool-chip"><strong>' + escapeHtml(t.name) + "</strong><span>" + escapeHtml(t.use) + "</span></div>";
    }).join("");

    var checklistState = loadChecklistState(cat.id);
    var checklistHtml = cat.checklist.map(function (phase, pi) {
      var itemsHtml = phase.items.map(function (item, ii) {
        var key = pi + "-" + ii;
        var checked = !!checklistState[key];
        return (
          '<li class="checklist-item">' +
            '<label>' +
              '<input type="checkbox" data-key="' + key + '"' + (checked ? " checked" : "") + " />" +
              '<span class="checkbox-visual">' + icon("check") + "</span>" +
              '<span class="checklist-text' + (checked ? " done" : "") + '">' + escapeHtml(item) + "</span>" +
            "</label>" +
          "</li>"
        );
      }).join("");
      return (
        '<div class="checklist-phase">' +
          "<h3>" + escapeHtml(phase.title) + "</h3>" +
          '<ul>' + itemsHtml + "</ul>" +
        "</div>"
      );
    }).join("");

    var commandsHtml = cat.commands.map(function (cmd) {
      var id2 = "cmd-" + Math.random().toString(36).slice(2, 9);
      return (
        '<div class="command-card">' +
          '<div class="command-card-header"><span class="command-tool">' + escapeHtml(cmd.tool) + "</span></div>" +
          "<p>" + escapeHtml(cmd.purpose) + "</p>" +
          '<div class="code-block">' +
            '<button class="copy-btn" data-target="' + id2 + '">' + icon("copy") + "<span>Copy</span></button>" +
            "<pre id=\"" + id2 + "\">" + escapeHtml(cmd.syntax) + "</pre>" +
          "</div>" +
        "</div>"
      );
    }).join("");

    var total = checklistTotals(cat);
    var done = checklistDone(cat);
    var pct = total ? Math.round((done / total) * 100) : 0;

    setMain(
      '<div class="page">' +
        '<header class="page-header">' +
          '<span class="page-icon">' + icon(cat.icon) + "</span>" +
          '<div><h1>' + escapeHtml(cat.name) + "</h1><p>" + escapeHtml(cat.tagline) + "</p></div>" +
        "</header>" +
        '<p class="overview-text">' + escapeHtml(cat.overview) + "</p>" +

        '<section id="jargon">' +
          '<div class="section-heading"><h2>Jargon Buster</h2><span class="tag tag-quiet">' + cat.jargon.length + ' terms</span></div>' +
          '<div class="jargon-grid">' + jargonHtml + "</div>" +
        "</section>" +

        '<section>' +
          '<div class="section-heading"><h2>Methodology Checklist</h2><span class="tag" id="checklist-progress-tag">' + done + " / " + total + "</span></div>" +
          '<div class="mini-progress large"><div class="mini-progress-bar" id="checklist-progress-bar" style="width:' + pct + '%"></div></div>' +
          '<div class="checklist" id="checklist">' + checklistHtml + "</div>" +
        "</section>" +

        '<section id="commands">' +
          '<div class="section-heading"><h2>Command Reference</h2><span class="tag tag-quiet">' + cat.commands.length + ' commands</span></div>' +
          '<div class="commands-list">' + commandsHtml + "</div>" +
        "</section>" +

        '<section>' +
          "<h2>Recommended Tools</h2>" +
          '<div class="tools-grid">' + toolsHtml + "</div>" +
        "</section>" +
      "</div>"
    );

    bindCopyButtons(document.getElementById("main"));

    document.getElementById("checklist").addEventListener("change", function (e) {
      if (e.target.matches('input[type="checkbox"]')) {
        var key = e.target.getAttribute("data-key");
        var state = loadChecklistState(cat.id);
        state[key] = e.target.checked;
        saveChecklistState(cat.id, state);
        e.target.closest("label").querySelector(".checklist-text").classList.toggle("done", e.target.checked);

        var newDone = checklistDone(cat);
        var newPct = total ? Math.round((newDone / total) * 100) : 0;
        document.getElementById("checklist-progress-tag").textContent = newDone + " / " + total;
        document.getElementById("checklist-progress-bar").style.width = newPct + "%";
      }
    });
  }

  function renderNotFound() {
    setMain(
      '<div class="page">' +
        '<div class="empty-state large">' +
          "<h1>Not found</h1><p>That page doesn't exist. <a href=\"#/\">Return to the dashboard</a>.</p>" +
        "</div>" +
      "</div>"
    );
  }

  function setMain(html) {
    var main = document.getElementById("main");
    main.innerHTML = html;
    main.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  /* ---------------------------------------------------------------- */
  /* Router                                                            */
  /* ---------------------------------------------------------------- */
  function route() {
    var hash = window.location.hash || "#/";
    var base = hash.split("#").slice(0, 2).join("#") || "#/";
    var parts = base.replace(/^#\//, "").split("/").filter(Boolean);

    if (!parts.length) {
      renderDashboard();
    } else if (parts[0] === "methodology") {
      renderMethodology();
    } else if (parts[0] === "glossary") {
      renderGlossary();
    } else if (parts[0] === "commands") {
      renderCommands();
    } else if (parts[0] === "category" && parts[1]) {
      renderCategory(parts[1]);
    } else {
      renderNotFound();
    }
    highlightActiveNav();
  }

  /* ---------------------------------------------------------------- */
  /* Init                                                               */
  /* ---------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    buildShell();
    route();
    window.addEventListener("hashchange", route);
  });
})();
