function boot(DATA) {
  "use strict";

  var SOUTH = ["CTC/Arena","Carson","Bland Street","East/West Blvd","New Bern","Scaleybark","Woodlawn","Tyvola","Archdale","Arrowood","Sharon Road West","I-485/South Blvd"];
  var NORTH = ["7th Street","9th Street","Parkwood","25th Street","36th Street","Sugar Creek","Old Concord Road","Tom Hunter","University City Blvd","McCullough","JW Clay Blvd/UNC Charlotte","UNC Charlotte-Main"];

  function direction(station) {
    if (SOUTH.indexOf(station) !== -1) return "南 South";
    if (NORTH.indexOf(station) !== -1) return "北 North";
    return "";
  }

  function esc(s) {
    s = (s === undefined || s === null) ? "" : String(s);
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // effective value of a {v, o} field: override wins when set (including explicit "")
  function eff(f) {
    if (!f) return "";
    return (f.o !== null && f.o !== undefined) ? f.o : f.v;
  }
  function isOverridden(f) { return !!f && f.o !== null && f.o !== undefined; }

  var CYCLE = ["Yes", "No", "Unclear"];
  function normalize(val) {
    return /^yes/i.test(val) ? "Yes" : (/^no/i.test(val) ? "No" : "Unclear");
  }
  function nextValue(cur) {
    var idx = CYCLE.indexOf(normalize(cur));
    return CYCLE[(idx + 1) % CYCLE.length];
  }

  function iconFor(val) {
    val = (val || "").trim();
    if (/^yes/i.test(val)) return { cls: "yes", sym: "✓" };
    if (/^no/i.test(val)) return { cls: "no", sym: "✕" };
    return { cls: "unclear", sym: "?" };
  }

  function overallClass(val) {
    val = (val || "").toUpperCase();
    if (val.indexOf("PASS") === 0) return "pass";
    if (val.indexOf("FAIL") === 0) return "fail";
    return "review";
  }

  // ---- working copy (mutated locally by self-edits; published on Save) ----
  var WORK = JSON.parse(JSON.stringify(DATA));
  var dirty = false;
  // extraction hook: lets an external script (e.g. the biweekly refresh pipeline,
  // running this page headlessly in jsdom/puppeteer) read the current full state
  // back out after the page boots, without needing to regex-parse the HTML.
  try { window.__APP_DATA__ = WORK; } catch (e) {}

  var state = { q: "", passFilter: "all", hiddenFilter: "hide", visitedFilter: "all", favFilter: "all", expandedProp: null, expandedUnit: null };

  var FILTER_DEFS = [
    { key: "passFilter", label: "状态", opts: [["all", "全部"], ["pass", "PASS"], ["fail", "FAIL"]] },
    { key: "hiddenFilter", label: "隐藏", opts: [["all", "全部"], ["hide", "未隐藏"], ["only", "已隐藏"]] },
    { key: "visitedFilter", label: "看房", opts: [["all", "全部"], ["yes", "已看房"], ["no", "未看房"]] },
    { key: "favFilter", label: "收藏", opts: [["all", "全部"], ["yes", "已收藏"], ["no", "未收藏"]] }
  ];
  var artifactNs = null;
  var artifactChecked = false;
  var readOnly = false;

  var BONUS_FIELDS = [["parking", "免费停车"], ["locker", "快递柜/包裹柜"], ["gym", "健身房"], ["wifi", "含 Wifi"], ["trash", "垃圾上门"]];
  var TAG_FIELDS = [["wd", "In-unit W/D"], ["den", "Den"], ["balcony", "阳台"], ["closet", "大衣柜/储物"]];

  var STYLE = "\
:root{color-scheme:light dark;--bg:#f4f5f7;--card:#ffffff;--text:#1a1d23;--muted:#6b7280;--border:#e2e4e9;--accent:#2f6fed;--pass:#1a8a4a;--pass-bg:#e5f6ec;--fail:#c0392b;--fail-bg:#fdeceb;--review:#b8860b;--review-bg:#fdf3d9;}\
@media (prefers-color-scheme: dark){:root{--bg:#15171c;--card:#1e2128;--text:#eef0f3;--muted:#9aa1ac;--border:#33363f;--pass-bg:#123a25;--fail-bg:#3a1a17;--review-bg:#3a2f10;}}\
*{box-sizing:border-box;}\
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;-webkit-tap-highlight-color:transparent;}\
#app{max-width:720px;margin:0 auto;padding-bottom:76px;}\
.topbar{position:sticky;top:0;z-index:5;background:var(--bg);padding:12px 14px 8px;border-bottom:1px solid var(--border);}\
.topbar h1{font-size:17px;margin:0 0 4px;}\
.summary{font-size:12.5px;color:var(--muted);margin-bottom:8px;}\
.controls{display:flex;gap:8px;}\
.search{flex:1;padding:9px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:14px;}\
.toggle{padding:9px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:13px;white-space:nowrap;}\
.toggle.on{background:var(--accent);color:#fff;border-color:var(--accent);}\
.filterrow{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:8px;}\
.filtergroup{display:flex;align-items:center;gap:4px;}\
.filterlabel{color:var(--muted);font-size:11px;margin-right:2px;}\
.filterchip{padding:3px 8px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--muted);font-size:11px;cursor:pointer;white-space:nowrap;}\
.filterchip.on{background:var(--accent);color:#fff;border-color:var(--accent);}\
.tourbtn{padding:7px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:12.5px;margin-bottom:8px;}\
.tourbtn.on{color:var(--accent);border-color:var(--accent);}\
.banner{margin:8px 14px;padding:8px 10px;border-radius:8px;font-size:12.5px;background:var(--review-bg);color:var(--review);}\
.list{padding:8px 10px;}\
.prop{border-radius:12px;margin-bottom:10px;overflow:hidden;border:1px solid var(--border);background:var(--card);}\
.prop-head{padding:11px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px;}\
.prop-name{font-weight:600;font-size:15px;}\
.prop-sub{font-size:12px;color:var(--muted);margin-top:2px;}\
.prop-badge{font-size:11.5px;color:var(--muted);white-space:nowrap;}\
.chev{transition:transform .15s;color:var(--muted);}\
.prop.open .chev{transform:rotate(90deg);}\
.propinfo{display:none;padding:0 12px 12px;}\
.prop.open .propinfo{display:block;}\
.chiprow{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;}\
.chip{padding:3px 8px;border-radius:8px;background:var(--bg);border:1px solid var(--border);font-size:11.5px;}\
.chip.yes{color:var(--pass);}\
.chip.no{color:var(--fail);}\
.bonusgrid{display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;margin-bottom:8px;}\
.bonusitem{display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:3px 0;}\
.icon{width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex:none;}\
.icon.yes{background:var(--pass-bg);color:var(--pass);}\
.icon.no{background:var(--fail-bg);color:var(--fail);}\
.icon.unclear{background:var(--review-bg);color:var(--review);}\
.edited{color:var(--accent);font-size:10px;margin-left:2px;}\
.starbtn{font-size:16px;line-height:1;color:var(--muted);padding:2px 4px;cursor:pointer;}\
.starbtn.on{color:#e0a300;}\
.section-label{font-weight:600;color:var(--text);margin:8px 0 4px;display:block;font-size:12px;}\
.notesbox{white-space:pre-wrap;background:var(--bg);border-radius:8px;padding:8px;margin-bottom:8px;line-height:1.5;font-size:12.5px;color:var(--muted);}\
textarea.note-edit{width:100%;min-height:60px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--text);padding:8px;font-size:13px;font-family:inherit;resize:vertical;}\
a.listinglink{color:var(--accent);text-decoration:none;font-size:12px;}\
.units{border-top:1px solid var(--border);}\
.unit{border-top:1px solid var(--border);padding:10px 12px;cursor:pointer;}\
.units>.unit:first-child{border-top:none;}\
.unit-row{display:flex;justify-content:space-between;align-items:center;gap:8px;}\
.unit-main{font-size:13.5px;}\
.unit-code{font-weight:600;}\
.pill{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;}\
.pill.pass{background:var(--pass-bg);color:var(--pass);}\
.pill.fail{background:var(--fail-bg);color:var(--fail);}\
.pill.review{background:var(--review-bg);color:var(--review);}\
.pill.hidden{background:var(--bg);color:var(--muted);}\
.unit.is-hidden{opacity:.55;}\
.prop.is-hidden{opacity:.55;}\
.detail{display:none;margin-top:10px;font-size:12.5px;color:var(--muted);}\
.unit.open .detail{display:block;}\
.hidebtn{padding:7px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:12.5px;margin-top:2px;}\
.hidebtn.unhide{color:var(--accent);border-color:var(--accent);}\
.tagsgrid{display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;margin-bottom:8px;}\
.source{font-size:11px;color:var(--muted);margin-bottom:6px;}\
.empty{text-align:center;color:var(--muted);padding:40px 20px;font-size:13px;}\
.savebar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--border);padding:10px 14px;display:none;align-items:center;justify-content:space-between;gap:10px;z-index:10;box-shadow:0 -2px 10px rgba(0,0,0,.06);}\
.savebar.show{display:flex;}\
.savebar .msg{font-size:12.5px;color:var(--muted);}\
.savebtn{padding:9px 18px;border-radius:10px;border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:600;}\
.savebtn:disabled{opacity:.5;}\
";

  function unitVisible(u) {
    if (state.hiddenFilter === "hide" && u.hidden) return false;
    if (state.hiddenFilter === "only" && !u.hidden) return false;
    if (state.passFilter === "pass" && overallClass(u.overall) !== "pass") return false;
    if (state.passFilter === "fail" && overallClass(u.overall) !== "fail") return false;
    if (state.favFilter === "yes" && !u.favorite) return false;
    if (state.favFilter === "no" && u.favorite) return false;
    return true;
  }

  // units to show for a property: a property hidden as a whole shows all its
  // units when specifically browsing "已隐藏" (so you can see what you blocked),
  // otherwise falls back to the normal per-unit visibility rules.
  function propUnits(p) {
    if (state.hiddenFilter === "only" && p.hidden) return p.units.slice();
    return p.units.filter(unitVisible);
  }

  function renderApp() {
    var root = document.getElementById("app");
    var q = state.q.trim().toLowerCase();
    var filteredProps = WORK.properties.filter(function (p) {
      if (state.visitedFilter === "yes" && !p.toured) return false;
      if (state.visitedFilter === "no" && p.toured) return false;
      if (state.hiddenFilter === "hide" && p.hidden) return false;
      if (state.hiddenFilter === "only" && !p.hidden && !p.units.some(function (u) { return u.hidden; })) return false;
      var us = propUnits(p);
      if (us.length === 0) return false;
      if (!q) return true;
      var hay = (p.name + " " + p.address + " " + p.station + " " + p.units.map(function (u) { return u.unit; }).join(" ")).toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    var totalUnits = WORK.properties.reduce(function (a, p) { return a + (p.hidden ? 0 : p.units.filter(function (u) { return !u.hidden; }).length); }, 0);
    var passCount = WORK.properties.reduce(function (a, p) { return a + (p.hidden ? 0 : p.units.filter(function (u) { return !u.hidden && overallClass(u.overall) === "pass"; }).length); }, 0);
    var hiddenCount = WORK.properties.reduce(function (a, p) { return a + (p.hidden ? p.units.length : p.units.filter(function (u) { return u.hidden; }).length); }, 0);
    var favCount = WORK.properties.reduce(function (a, p) { return a + p.units.filter(function (u) { return u.favorite; }).length; }, 0);

    var html = "<div class='topbar'>";
    html += "<h1>Charlotte 公寓追踪</h1>";
    html += "<div class='summary'>" + WORK.properties.length + " 个楼盘 · " + totalUnits + " 个在租户型 · PASS " + passCount + (favCount ? " · ⭐ " + favCount : "") + (hiddenCount ? " · 已隐藏 " + hiddenCount : "") + " · 更新于 " + esc(WORK.updatedAt) + "</div>";
    html += "<div class='controls'>";
    html += "<input class='search' id='searchbox' placeholder='搜索楼盘 / 地址 / 户型…' value='" + esc(state.q) + "'>";
    html += "</div>";
    html += "<div class='filterrow'>";
    FILTER_DEFS.forEach(function (fd) {
      html += "<div class='filtergroup'><span class='filterlabel'>" + fd.label + "</span>";
      fd.opts.forEach(function (opt) {
        var active = state[fd.key] === opt[0];
        html += "<span class='filterchip" + (active ? " on" : "") + "' data-filterset='" + fd.key + "|" + opt[0] + "'>" + opt[1] + "</span>";
      });
      html += "</div>";
    });
    html += "</div>";
    html += "</div>";

    if (readOnly) html += "<div class='banner'>只读模式：修改无法保存到此视图。</div>";

    html += "<div class='list'>";
    if (filteredProps.length === 0) html += "<div class='empty'>没有匹配的结果</div>";
    filteredProps.forEach(function (p) {
      var us = propUnits(p);
      var isOpen = state.expandedProp === p.name;
      var dir = direction(p.station);
      html += "<div class='prop" + (isOpen ? " open" : "") + (p.hidden ? " is-hidden" : "") + "' data-prop='" + esc(p.name) + "'>";
      html += "<div class='prop-head' data-toggle-prop='" + esc(p.name) + "'>";
      html += "<div><div class='prop-name'>" + esc(p.name) + (dir ? " <span class='prop-badge'>· " + esc(dir) + "</span>" : "") + (p.toured ? " <span class='prop-badge'>· 已看房</span>" : "") + (p.hidden ? " <span class='prop-badge'>· 已隐藏</span>" : "") + "</div>";
      html += "<div class='prop-sub'>" + esc(p.address) + " · " + esc(p.station) + " 步行" + esc(p.walkMin) + "分</div></div>";
      html += "<div style='display:flex;align-items:center;gap:8px;'><span class='prop-badge'>" + us.length + "套</span><span class='chev'>›</span></div>";
      html += "</div>";
      if (isOpen) {
        html += renderPropInfo(p);
        html += "<div class='units'>";
        us.forEach(function (u) {
          var uOpen = state.expandedUnit === u.id;
          var oc = overallClass(u.overall);
          html += "<div class='unit" + (uOpen ? " open" : "") + (u.hidden ? " is-hidden" : "") + "' data-toggle-unit='" + u.id + "'>";
          html += "<div class='unit-row'><div class='unit-main'><span class='starbtn" + (u.favorite ? " on" : "") + "' data-star-toggle='" + u.id + "'>" + (u.favorite ? "★" : "☆") + "</span><span class='unit-code'>" + esc(u.unit) + "</span> · " + esc(u.sqft) + " sqft · $" + esc(u.price) + "</div>";
          html += u.hidden ? "<span class='pill hidden'>已隐藏</span>" : "<span class='pill " + oc + "'>" + esc((u.overall || "").split(" ")[0] || u.overall) + "</span>";
          html += "</div>";
          if (uOpen) html += renderUnitDetail(u);
          html += "</div>";
        });
        html += "</div>";
      }
      html += "</div>";
    });
    html += "</div>";

    html += "<div class='savebar" + (dirty ? " show" : "") + "'><span class='msg' id='savemsg'>有未保存的修改</span><button class='savebtn' id='saveall' " + (readOnly ? "disabled" : "") + ">保存修改</button></div>";

    root.innerHTML = html;
    wireEvents();
    restoreScroll();
  }

  function renderPropInfo(p) {
    var h = "<div class='propinfo'>";
    h += "<div class='chiprow'>";
    h += "<span class='chip " + (/yes/i.test(p.ageOk) ? "yes" : "no") + "'>楼龄 " + esc(p.year) + "</span>";
    h += "<span class='chip'>步行 " + esc(p.walkMin) + " 分 (" + esc(p.walkRating) + ")</span>";
    if (p.gRating) h += "<span class='chip'>Google " + esc(p.gRating) + "★ (" + esc(p.gReviews) + ")</span>";
    h += "</div>";

    h += "<button class='tourbtn" + (p.toured ? " on" : "") + "' data-tour-toggle='" + esc(p.name) + "' " + (readOnly ? "disabled" : "") + " onclick='event.stopPropagation()'>" + (p.toured ? "✓ 已看房 (点击取消)" : "标记为已看房") + "</button> ";
    h += "<button class='hidebtn" + (p.hidden ? " unhide" : "") + "' data-prophide-toggle='" + esc(p.name) + "' " + (readOnly ? "disabled" : "") + " onclick='event.stopPropagation()'>" + (p.hidden ? "取消隐藏，重新追踪此楼盘" : "不再考虑，隐藏此楼盘") + "</button>";

    var bonusCount = 0;
    BONUS_FIELDS.forEach(function (bf) { if (/^yes/i.test(eff(p.bonus[bf[0]]))) bonusCount++; });
    h += "<span class='section-label'>楼盘设施 (" + bonusCount + "/" + BONUS_FIELDS.length + ") — 点击可自行修改</span>";
    h += "<div class='bonusgrid'>";
    BONUS_FIELDS.forEach(function (bf) {
      var f = p.bonus[bf[0]];
      var ic = iconFor(eff(f));
      h += "<div class='bonusitem' data-bonus-toggle='" + esc(p.name) + "|" + bf[0] + "'><span class='icon " + ic.cls + "'>" + ic.sym + "</span>" + bf[1] + (isOverridden(f) ? "<span class='edited'>已修改</span>" : "") + "</div>";
    });
    h += "</div>";

    if (p.notes) {
      h += "<span class='section-label'>调研笔记 / Red Flags</span>";
      h += "<div class='notesbox'>" + esc(p.notes) + "</div>";
    }
    if (p.url) h += "<div style='margin-bottom:8px;'><a class='listinglink' href='" + esc(p.url) + "' target='_blank' rel='noopener' onclick='event.stopPropagation()'>→ 查看官网户型页</a></div>";

    h += "<span class='section-label'>我的楼盘笔记</span>";
    h += "<textarea class='note-edit' data-propnote-for='" + esc(p.name) + "' placeholder='关于这个楼盘的整体印象…' " + (readOnly ? "disabled" : "") + " onclick='event.stopPropagation()'>" + esc(p.myNote) + "</textarea>";
    h += "</div>";
    return h;
  }

  function renderUnitDetail(u) {
    var h = "<div class='detail'>";
    h += "<div class='chiprow'>";
    h += "<span class='chip " + (/yes/i.test(u.sqftOk) ? "yes" : "no") + "'>面积 " + (/yes/i.test(u.sqftOk) ? "✓" : "✕") + "</span>";
    h += "<span class='chip " + (/yes/i.test(u.priceOk) ? "yes" : "no") + "'>价格 " + (/yes/i.test(u.priceOk) ? "✓" : "✕") + "</span>";
    h += "</div>";

    h += "<span class='section-label'>户型标签 — 点击可自行修改</span>";
    h += "<div class='tagsgrid'>";
    TAG_FIELDS.forEach(function (tf) {
      var f = u.tags[tf[0]];
      var ic = iconFor(eff(f));
      h += "<div class='bonusitem' data-tag-toggle='" + u.id + "|" + tf[0] + "'><span class='icon " + ic.cls + "'>" + ic.sym + "</span>" + tf[1] + (isOverridden(f) ? "<span class='edited'>已修改</span>" : "") + "</div>";
    });
    h += "</div>";

    if (u.source) h += "<div class='source'>来源: " + esc(u.source) + "</div>";

    h += "<span class='section-label'>我的看房笔记 (After Visit)</span>";
    h += "<textarea class='note-edit' data-unitnote-for='" + u.id + "' placeholder='看房后记录你的印象…' " + (readOnly ? "disabled" : "") + " onclick='event.stopPropagation()'>" + esc(u.afterVisit) + "</textarea>";
    h += "<button class='hidebtn" + (u.hidden ? " unhide" : "") + "' data-hide-toggle='" + u.id + "' " + (readOnly ? "disabled" : "") + ">" + (u.hidden ? "取消隐藏，重新追踪" : "不再考虑，隐藏此户型") + "</button>";
    h += "</div>";
    return h;
  }

  function findProp(name) {
    for (var i = 0; i < WORK.properties.length; i++) if (WORK.properties[i].name === name) return WORK.properties[i];
    return null;
  }
  function findUnit(id) {
    for (var i = 0; i < WORK.properties.length; i++) {
      var us = WORK.properties[i].units;
      for (var j = 0; j < us.length; j++) if (us[j].id === id) return us[j];
    }
    return null;
  }

  function markDirty() {
    dirty = true;
    var bar = document.querySelector(".savebar");
    if (bar) bar.classList.add("show");
    var btn = document.getElementById("saveall");
    if (btn) btn.disabled = readOnly;
  }

  function wireEvents() {
    var root = document.getElementById("app");

    var sb = document.getElementById("searchbox");
    if (sb) {
      sb.addEventListener("input", function (e) {
        state.q = e.target.value;
        renderApp();
        var again = document.getElementById("searchbox");
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      });
    }
    root.querySelectorAll("[data-filterset]").forEach(function (el) {
      el.addEventListener("click", function () {
        var parts = el.getAttribute("data-filterset").split("|");
        state[parts[0]] = parts[1];
        renderApp();
      });
    });

    root.querySelectorAll("[data-toggle-prop]").forEach(function (el) {
      el.addEventListener("click", function () {
        var name = el.getAttribute("data-toggle-prop");
        state.expandedProp = (state.expandedProp === name) ? null : name;
        if (state.expandedProp !== name) state.expandedUnit = null;
        renderApp();
      });
    });
    root.querySelectorAll("[data-toggle-unit]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (e.target.closest("textarea, button, a, [data-tag-toggle], [data-star-toggle]")) return;
        var id = Number(el.getAttribute("data-toggle-unit"));
        state.expandedUnit = (state.expandedUnit === id) ? null : id;
        renderApp();
      });
    });
    root.querySelectorAll("[data-star-toggle]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        if (readOnly) return;
        var id = Number(el.getAttribute("data-star-toggle"));
        var u = findUnit(id);
        if (!u) return;
        u.favorite = !u.favorite;
        markDirty();
        renderApp();
      });
    });
    root.querySelectorAll("[data-tour-toggle]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        if (readOnly) return;
        var name = el.getAttribute("data-tour-toggle");
        var p = findProp(name);
        if (!p) return;
        p.toured = !p.toured;
        markDirty();
        renderApp();
      });
    });
    root.querySelectorAll("[data-hide-toggle]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        if (readOnly) return;
        var id = Number(el.getAttribute("data-hide-toggle"));
        var u = findUnit(id);
        if (!u) return;
        u.hidden = !u.hidden;
        markDirty();
        renderApp();
      });
    });
    root.querySelectorAll("[data-prophide-toggle]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        if (readOnly) return;
        var name = el.getAttribute("data-prophide-toggle");
        var p = findProp(name);
        if (!p) return;
        p.hidden = !p.hidden;
        markDirty();
        renderApp();
      });
    });
    root.querySelectorAll("[data-bonus-toggle]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        if (readOnly) return;
        var parts = el.getAttribute("data-bonus-toggle").split("|");
        var propName = parts[0], key = parts[1];
        var p = findProp(propName);
        if (!p) return;
        var f = p.bonus[key];
        var nv = nextValue(eff(f));
        f.o = (nv === normalize(f.v)) ? null : nv;
        markDirty();
        renderApp();
      });
    });
    root.querySelectorAll("[data-tag-toggle]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        if (readOnly) return;
        var parts = el.getAttribute("data-tag-toggle").split("|");
        var id = Number(parts[0]), key = parts[1];
        var u = findUnit(id);
        if (!u) return;
        var f = u.tags[key];
        var nv = nextValue(eff(f));
        f.o = (nv === normalize(f.v)) ? null : nv;
        markDirty();
        renderApp();
      });
    });
    root.querySelectorAll("[data-propnote-for]").forEach(function (el) {
      el.addEventListener("input", function () {
        var name = el.getAttribute("data-propnote-for");
        var p = findProp(name);
        if (p) { p.myNote = el.value; markDirty(); }
      });
    });
    root.querySelectorAll("[data-unitnote-for]").forEach(function (el) {
      el.addEventListener("input", function () {
        var id = Number(el.getAttribute("data-unitnote-for"));
        var u = findUnit(id);
        if (u) { u.afterVisit = el.value; markDirty(); }
      });
    });

    var saveBtn = document.getElementById("saveall");
    if (saveBtn) saveBtn.addEventListener("click", function () { saveAll(); });
  }

  function restoreScroll() {
    try {
      var raw = sessionStorage.getItem("apt_scroll_restore");
      if (!raw) return;
      sessionStorage.removeItem("apt_scroll_restore");
      var info = JSON.parse(raw);
      if (info.expandedProp) state.expandedProp = info.expandedProp;
      if (info.expandedUnit !== null && info.expandedUnit !== undefined) state.expandedUnit = info.expandedUnit;
      if (info.y) window.scrollTo(0, info.y);
    } catch (e) {}
  }

  // ---- saving via the artifact capability ----
  function safeStringify(obj) {
    return JSON.stringify(obj).replace(/<\//g, "<\\/");
  }

  function fullDocument(data) {
    var SHELL_HEAD = "<!doctype html>\n<html lang=\"zh\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1\">\n<title>Charlotte 公寓追踪</title>\n<style>" + STYLE + "</style>\n</head>\n<body>\n<div id=\"app\">加载中…</div>\n<script>\n(";
    var TAIL_A = ")(";
    var TAIL_B = ");\n<" + "/script>\n</body>\n</html>";
    return SHELL_HEAD + boot.toString() + TAIL_A + safeStringify(data) + TAIL_B;
  }

  async function ensureArtifact() {
    if (artifactChecked) return artifactNs;
    artifactChecked = true;
    try {
      if (window.claude && typeof window.claude.use === "function") {
        artifactNs = await window.claude.use("artifact");
      }
    } catch (e) { artifactNs = null; }
    return artifactNs;
  }

  async function saveAll() {
    var msg = document.getElementById("savemsg");
    var btn = document.getElementById("saveall");
    var artifact = await ensureArtifact();
    if (!artifact) {
      if (msg) msg.textContent = "此环境不支持保存";
      return;
    }
    if (btn) btn.disabled = true;
    if (msg) msg.textContent = "保存中…";

    WORK.updatedAt = new Date().toISOString().slice(0, 10);

    try {
      sessionStorage.setItem("apt_scroll_restore", JSON.stringify({
        expandedProp: state.expandedProp,
        expandedUnit: state.expandedUnit,
        y: window.scrollY
      }));
    } catch (e) {}

    try {
      await artifact.publish(fullDocument(WORK));
      // on success this view reloads to the new version automatically
    } catch (err) {
      var code = err && err.code;
      if (code === "conflict") return; // view is already reloading to the winner
      if (code === "not_writer" || code === "not_granted" || code === "capability_disabled" || code === "not_declared") {
        readOnly = true;
        renderApp();
        return;
      }
      if (msg) msg.textContent = "保存失败，请重试";
      if (btn) btn.disabled = false;
    }
  }

  // ---- boot ----
  if (!document.getElementById("app")) {
    var d = document.createElement("div");
    d.id = "app";
    document.body.appendChild(d);
  }
  renderApp();
  ensureArtifact();
}
