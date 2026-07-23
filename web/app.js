const state = {
  data: null,
  view: "history",
  historyProfile: "profile-a",
  historyDay: 5,
  historyImage: "poster",
  historyCompare: false,
  repeatProfile: "profile-r1",
  repeatRun: 3,
  repeatShow: "new",
  catalogSearch: "",
  catalogSort: "title",
};

const [
  config,
  catalog,
  routine,
  repetition,
  review,
  analysis,
] = await Promise.all([
  loadJson("./data/config.json"),
  loadJson("./data/catalog.json"),
  loadJson("./data/routine-runs.json"),
  loadJson("./data/repetition-runs.json"),
  loadJson("./data/review-cases.json"),
  loadJson("./data/analysis.json"),
]);

state.data = {
  config,
  catalog,
  routine,
  repetition,
  review,
  analysis,
  titles: new Map(catalog.titles.map((item) => [item.id, item])),
  clips: new Map(catalog.clips.map((item) => [item.id, item])),
};

initialize();

function initialize() {
  bindTabs();
  populateSelect("#historyProfile", routine.profiles, "id", "label");
  populateSelect("#historyDay", routine.days, "ordinal", "label");
  populateSelect("#repeatProfile", repetition.profiles, "id", "label");
  populateSelect(
    "#repeatRun",
    Array.from({ length: repetition.runs }, (_, index) => ({ id: index + 1, label: `Run ${index + 1}` })),
    "id",
    "label",
  );
  bindControls();
  renderAll();
}

function bindTabs() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      document.querySelectorAll("[data-view]").forEach((item) => {
        item.setAttribute("aria-selected", String(item === button));
      });
      document.querySelectorAll("[data-panel]").forEach((panel) => {
        const active = panel.dataset.panel === state.view;
        panel.hidden = !active;
        panel.classList.toggle("is-active", active);
      });
      history.replaceState(null, "", `#${state.view}`);
    });
  });
  const requested = location.hash.replace("#", "");
  const requestedButton = document.querySelector(`[data-view="${CSS.escape(requested)}"]`);
  if (requestedButton) requestedButton.click();
}

function bindControls() {
  bindSelect("#historyProfile", "historyProfile", renderHistory);
  bindSelect("#historyDay", "historyDay", renderHistory, Number);
  bindSelect("#repeatProfile", "repeatProfile", renderRepetition);
  bindSelect("#repeatRun", "repeatRun", renderRepetition, Number);
  bindSelect("#catalogSort", "catalogSort", renderCatalog);

  document.querySelectorAll('input[name="historyImage"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.historyImage = input.value;
      renderHistory();
    });
  });
  document.querySelectorAll('input[name="repeatShow"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.repeatShow = input.value;
      renderRepetition();
    });
  });
  document.querySelector("#historyCompare").addEventListener("change", (event) => {
    state.historyCompare = event.currentTarget.checked;
    renderHistory();
  });
  document.querySelector("#catalogSearch").addEventListener("input", (event) => {
    state.catalogSearch = event.currentTarget.value;
    renderCatalog();
  });
  document.querySelector("#settingsToggle").addEventListener("click", (event) => {
    const panel = document.querySelector("#settingsPanel");
    panel.hidden = !panel.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!panel.hidden));
  });
  document.querySelector("#reviewReset").addEventListener("click", () => {
    localStorage.removeItem("recommendation-evaluation-review-decisions");
    renderReview();
  });
  const dialog = document.querySelector("#detailDialog");
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

function renderAll() {
  renderHistory();
  renderRepetition();
  renderCatalog();
  renderIssues();
  renderAnalytics();
  renderReview();
}

function renderHistory() {
  const items = routine.appearances.filter(
    (item) => item.profileId === state.historyProfile && item.dayOrdinal === state.historyDay,
  );
  const priorTitleIds = new Set(
    routine.appearances
      .filter((item) => item.profileId === state.historyProfile && item.dayOrdinal === state.historyDay - 1)
      .map((item) => item.titleId),
  );
  const overlap = items.filter((item) => priorTitleIds.has(item.titleId)).length;
  const uniqueTitles = new Set(items.map((item) => item.titleId)).size;
  const uniqueClips = new Set(items.map((item) => item.clipId)).size;
  metricStrip("#historySummary", [
    [items.length, "ordered appearances"],
    [uniqueTitles, "unique fictional titles"],
    [uniqueClips, "unique canonical clips"],
    [state.historyDay === 1 ? "N/A" : formatPercent(overlap / items.length), "prior-day title overlap"],
  ]);

  const rail = document.querySelector("#historyRail");
  rail.replaceChildren(
    ...items.map((item) => {
      const title = state.data.titles.get(item.titleId);
      const clip = state.data.clips.get(item.clipId);
      const image = state.historyImage === "poster" ? title.posterPath : clip.screenPath;
      return posterCard(item, title, clip, image, {
        overlap: state.historyCompare && priorTitleIds.has(item.titleId),
        muted: state.historyCompare && !priorTitleIds.has(item.titleId),
      });
    }),
  );
  const status = document.querySelector("#historyComparisonStatus");
  if (!state.historyCompare) status.textContent = "Comparison off";
  else if (state.historyDay === 1) status.textContent = "No prior synthetic day";
  else status.textContent = `${overlap} of ${items.length} titles also appear on Synthetic Day ${state.historyDay - 1}`;
}

function renderRepetition() {
  const items = repetition.appearances.filter(
    (item) => item.profileId === state.repeatProfile && item.run === state.repeatRun,
  );
  const priorIds = new Set(
    repetition.appearances
      .filter((item) => item.profileId === state.repeatProfile && item.run < state.repeatRun)
      .map((item) => item.clipId),
  );
  const repeated = items.filter((item) => priorIds.has(item.clipId)).length;
  const fresh = items.length - repeated;
  metricStrip("#repeatSummary", [
    [items.length, "positions"],
    [repeated, "repeated exact clips"],
    [fresh, "fresh exact clips"],
    [state.repeatRun === 1 ? "Baseline" : formatPercent(repeated / items.length), "progressive recurrence"],
  ]);
  const rail = document.querySelector("#repeatRail");
  rail.replaceChildren(
    ...items.map((item) => {
      const title = state.data.titles.get(item.titleId);
      const clip = state.data.clips.get(item.clipId);
      const isRepeat = priorIds.has(item.clipId);
      const visible = state.repeatShow === "repeats" ? isRepeat : !isRepeat;
      const card = posterCard(item, title, clip, title.posterPath);
      if (!visible) {
        const mask = element("span", `status-mask ${isRepeat ? "is-repeat" : "is-new"}`);
        mask.textContent = isRepeat ? "REPEAT" : "NEW";
        card.append(mask);
      }
      return card;
    }),
  );
}

function renderCatalog() {
  const appearanceCounts = new Map();
  for (const item of [...routine.appearances, ...repetition.appearances]) {
    appearanceCounts.set(item.titleId, (appearanceCounts.get(item.titleId) || 0) + 1);
  }
  const query = state.catalogSearch.trim().toLowerCase();
  const titles = catalog.titles
    .filter((title) => !query || title.title.toLowerCase().includes(query) || title.genre.toLowerCase().includes(query))
    .sort((left, right) => {
      if (state.catalogSort === "clips") return right.clipCount - left.clipCount || left.title.localeCompare(right.title);
      if (state.catalogSort === "exposure") return (appearanceCounts.get(right.id) || 0) - (appearanceCounts.get(left.id) || 0) || left.title.localeCompare(right.title);
      return left.title.localeCompare(right.title);
    });
  metricStrip("#catalogSummary", [
    [catalog.titleCount, "fictional titles"],
    [catalog.canonicalClipCount, "canonical clips"],
    [titles.length, "matching titles"],
    [analysis.counts.exposedTitles, "titles observed in runs"],
  ]);
  const list = document.querySelector("#catalogList");
  list.replaceChildren(
    ...titles.slice(0, 120).map((title) => {
      const row = element("article", "catalog-row");
      row.innerHTML = `
        <img src="${title.posterPath}" alt="" loading="lazy">
        <div><h2>${escapeHtml(title.title)}</h2><p>${escapeHtml(title.genre)} · ${escapeHtml(title.format)} · ${title.year}</p></div>
        <div class="catalog-cell"><strong>${title.clipCount}</strong>canonical clips</div>
        <div class="catalog-cell"><strong>${appearanceCounts.get(title.id) || 0}</strong>observed appearances</div>
        <div class="catalog-cell"><strong>${title.id}</strong>synthetic title ID</div>`;
      return row;
    }),
  );
}

function renderIssues() {
  const grouped = groupCounts(review.cases, (item) => item.type);
  metricStrip("#issuesSummary", [
    [review.cases.length, "synthetic cases"],
    [grouped.get("identity-check") || 0, "identity checks"],
    [grouped.get("scene-check") || 0, "scene comparisons"],
    [grouped.get("metadata-check") || 0, "metadata checks"],
  ]);
  document.querySelector("#issuesGrid").replaceChildren(
    ...review.cases.map((item) => {
      const card = element("article", "issue-card");
      card.innerHTML = `
        <img src="${item.screenPath}" alt="" loading="lazy">
        <p class="eyebrow">${escapeHtml(item.type.replace("-", " "))}</p>
        <h2>${escapeHtml(item.label)}</h2>
        <p>${escapeHtml(item.prompt)}</p>
        <code>${escapeHtml(item.id)} · ${escapeHtml(item.clipId)}</code>`;
      return card;
    }),
  );
}

function renderAnalytics() {
  metricStrip("#analyticsMetrics", [
    [`${analysis.headline.routineSpreadPoints.toFixed(0)} pts`, "routine overlap spread"],
    [`${analysis.headline.repetitionSpreadPoints.toFixed(0)} pts`, "Run 3 recurrence spread"],
    [formatPercent(analysis.headline.titleCoverageRate), "catalog title coverage"],
    [analysis.counts.totalAppearances, "total synthetic appearances"],
  ]);
  const settings = document.querySelector("#settingsPanel");
  settings.innerHTML = `<div class="settings-grid">
    ${[
      ["Catalog", `${config.catalog.titleCount} titles · ${config.catalog.clipsPerTitle.min}–${config.catalog.clipsPerTitle.max} clips`],
      ["Routine", `${config.routine.profiles.length} profiles · ${config.routine.days} days · ${config.routine.clipsPerProfilePerDay} clips/day`],
      ["Repetition", `${config.repetition.profiles.length} profiles · ${config.repetition.runs} runs · ${config.repetition.clipsPerRun} clips/run`],
      ["Seed", String(config.seed)],
    ].map(([label, value]) => `<div><strong>${label}</strong><span>${value}</span></div>`).join("")}
  </div>`;

  renderBarChart(
    "#routineChart",
    analysis.routineProfiles.map((item) => ({
      label: item.profileLabel.split(" — ")[1],
      value: item.meanRate,
    })),
  );
  renderBarChart(
    "#repetitionChart",
    analysis.repetitionProfiles.map((item) => ({
      label: item.profileLabel.split(" — ")[1],
      value: item.latestRate,
    })),
  );
}

function renderReview() {
  const decisions = readDecisions();
  const completed = review.cases.filter((item) => decisions[item.id]).length;
  metricStrip("#reviewSummary", [
    [review.cases.length, "total cases"],
    [completed, "resolved locally"],
    [review.cases.length - completed, "remaining"],
    ["0", "network writes"],
  ]);
  document.querySelector("#reviewList").replaceChildren(
    ...review.cases.map((item) => {
      const card = element("article", "review-card");
      card.innerHTML = `
        <img src="${item.screenPath}" alt="" loading="lazy">
        <p class="eyebrow">${escapeHtml(item.type.replace("-", " "))}</p>
        <h2>${escapeHtml(item.title)}</h2>
        <p>${escapeHtml(item.prompt)}</p>
        <div class="review-actions" role="group" aria-label="Decision for ${escapeHtml(item.title)}"></div>`;
      const actions = card.querySelector(".review-actions");
      for (const value of ["confirm", "complete", "abstain"]) {
        const button = element("button");
        button.type = "button";
        button.textContent = capitalize(value);
        button.setAttribute("aria-pressed", String(decisions[item.id] === value));
        button.addEventListener("click", () => {
          const next = readDecisions();
          next[item.id] = value;
          localStorage.setItem("recommendation-evaluation-review-decisions", JSON.stringify(next));
          renderReview();
        });
        actions.append(button);
      }
      return card;
    }),
  );
}

function posterCard(item, title, clip, image, flags = {}) {
  const card = element("button", "poster-card");
  card.type = "button";
  card.classList.toggle("is-overlap", Boolean(flags.overlap));
  card.classList.toggle("is-muted", Boolean(flags.muted));
  card.innerHTML = `
    <img src="${image}" alt="" loading="lazy">
    <span class="card-copy">
      <small>Position ${item.position} · ${escapeHtml(clip.sceneLabel)}</small>
      <strong>${escapeHtml(title.title)}</strong>
    </span>`;
  card.addEventListener("click", () => showDetail(item, title, clip));
  return card;
}

function showDetail(item, title, clip) {
  const dialog = document.querySelector("#detailDialog");
  const content = document.querySelector("#detailContent");
  content.innerHTML = `<div class="detail-layout">
    <img src="${clip.screenPath}" alt="Synthetic vertical capture for ${escapeHtml(title.title)}">
    <div class="detail-copy">
      <p class="eyebrow">Synthetic canonical clip</p>
      <h2>${escapeHtml(title.title)}</h2>
      <p>${escapeHtml(clip.sceneLabel)} is one of ${title.clipCount} fictional clips associated with this title.</p>
      <dl>
        <dt>Position</dt><dd>${item.position}</dd>
        <dt>Profile</dt><dd>${escapeHtml(item.profileLabel)}</dd>
        <dt>Run</dt><dd>${escapeHtml(item.dayLabel || item.runLabel)}</dd>
        <dt>Title ID</dt><dd>${escapeHtml(title.id)}</dd>
        <dt>Clip ID</dt><dd>${escapeHtml(clip.id)}</dd>
        <dt>Provenance</dt><dd>Deterministic synthetic public run</dd>
      </dl>
    </div>
  </div>`;
  dialog.showModal();
}

function metricStrip(selector, metrics) {
  document.querySelector(selector).replaceChildren(
    ...metrics.map(([value, label]) => {
      const item = element("div", "metric");
      item.innerHTML = `<strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span>`;
      return item;
    }),
  );
}

function renderBarChart(selector, values) {
  const maximum = Math.max(...values.map((item) => item.value), 0.01);
  document.querySelector(selector).replaceChildren(
    ...values.map((item) => {
      const row = element("div", "bar-row");
      row.innerHTML = `
        <span>${escapeHtml(item.label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(item.value / maximum) * 100}%"></span></span>
        <span class="bar-value">${formatPercent(item.value)}</span>`;
      return row;
    }),
  );
}

function populateSelect(selector, items, valueKey, labelKey) {
  const select = document.querySelector(selector);
  select.replaceChildren(
    ...items.map((item) => {
      const option = document.createElement("option");
      option.value = item[valueKey];
      option.textContent = item[labelKey];
      return option;
    }),
  );
}

function bindSelect(selector, key, render, cast = String) {
  const select = document.querySelector(selector);
  select.value = String(state[key]);
  select.addEventListener("change", () => {
    state[key] = cast(select.value);
    render();
  });
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return response.json();
}

function readDecisions() {
  try {
    return JSON.parse(localStorage.getItem("recommendation-evaluation-review-decisions") || "{}");
  } catch {
    return {};
  }
}

function groupCounts(items, keyFor) {
  const result = new Map();
  for (const item of items) {
    const key = keyFor(item);
    result.set(key, (result.get(key) || 0) + 1);
  }
  return result;
}

function element(tag, className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
