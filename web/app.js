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

const ISSUE_TYPES = {
  "identity-check": {
    title: "Title identity",
    description: "Flags captures whose title treatment is obscured or otherwise difficult to reconcile with the canonical catalog.",
    signal: "Captured frame ↔ canonical title",
    task: "Confirm that the clip belongs to the expected fictional title.",
    artPath: "assets/issue-types/identity-check.webp",
  },
  "scene-check": {
    title: "Possible scene duplication",
    description: "Surfaces visually similar frames that may be distinct clips, alternate edits, or unintended duplicates.",
    signal: "Frame composition ↔ clip identity",
    task: "Compare the evidence and determine whether the scenes are meaningfully distinct.",
    artPath: "assets/issue-types/scene-check.webp",
  },
  "metadata-check": {
    title: "Missing metadata",
    description: "Finds incomplete non-critical fields that prevent a captured clip from being fully reconciled with the title index.",
    signal: "Capture evidence ↔ catalog record",
    task: "Complete the missing field using the available title and clip evidence.",
    artPath: "assets/issue-types/metadata-check.webp",
  },
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
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const view = link.getAttribute("href").slice(1);
      const button = document.querySelector(`[data-view="${CSS.escape(view)}"]`);
      if (!button) return;
      event.preventDefault();
      button.click();
      document.querySelector(`[data-panel="${CSS.escape(view)}"]`).scrollIntoView({ block: "start" });
    });
  });
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
  renderFindings();
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
    [Object.keys(ISSUE_TYPES).length, "issue categories"],
    [review.cases.length, "affected captures"],
    [new Set(review.cases.map((item) => item.titleId)).size, "fictional titles"],
    ["100%", "synthetic evidence"],
  ]);
  document.querySelector("#issuesGrid").replaceChildren(
    ...Object.entries(ISSUE_TYPES).map(([type, issue]) => {
      const cases = review.cases.filter((item) => item.type === type);
      const card = element("article", "issue-card");
      card.dataset.issueType = type;
      card.innerHTML = `
        <img src="${issue.artPath}" alt="${escapeHtml(issue.title)} editorial workflow illustration" loading="lazy">
        <div class="issue-card-copy">
          <div class="issue-card-head">
            <p class="eyebrow">Diagnostic category</p>
            <span>${cases.length} queued</span>
          </div>
          <h2>${escapeHtml(issue.title)}</h2>
          <p>${escapeHtml(issue.description)}</p>
          <dl class="issue-definition">
            <div><dt>Signal</dt><dd>${escapeHtml(issue.signal)}</dd></div>
            <div><dt>Reviewer task</dt><dd>${escapeHtml(issue.task)}</dd></div>
          </dl>
          <div class="affected-titles">
            <strong>Affected fictional titles</strong>
            <ul>${cases.map((item) => `<li>${escapeHtml(item.title)}</li>`).join("")}</ul>
          </div>
        </div>`;
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
      ["RFY", `${config.rfy.profiles.length} profiles · ${config.rfy.titlesPerProfile} titles · first ${config.rfy.shortsWindow} compared`],
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

function renderFindings() {
  const routineRates = analysis.routineProfiles.map((item) => item.latestRate);
  const repetitionRates = analysis.repetitionProfiles.map((item) => item.latestRate);
  const persistentAcrossFiveDays = analysis.routineProfiles.reduce(
    (sum, item) => sum + item.persistentTitles.length,
    0,
  );
  const persistentAcrossRuns = analysis.repetitionProfiles.reduce(
    (sum, item) => sum + item.persistentTitles.length,
    0,
  );

  const summary = [
    `<strong>Day-over-day continuity is profile-specific.</strong> Synthetic Day 5 title overlap ranges from ${formatPercent(Math.min(...routineRates))} to ${formatPercent(Math.max(...routineRates))}; the median is ${formatPercent(analysis.headline.routineLatestMedianRate)}.`,
    `<strong>Exact-clip recurrence separates low and high controlled profiles.</strong> Run 3 ranges from ${formatPercent(Math.min(...repetitionRates))} to ${formatPercent(Math.max(...repetitionRates))}, with a ${analysis.headline.repetitionSpreadPoints.toFixed(0)}-point spread.`,
    `<strong>Adjacent continuity did not become permanent catalog lock-in.</strong> ${persistentAcrossFiveDays === 0 ? "No fictional title appeared in every Top-50 window across all five days." : `${persistentAcrossFiveDays} profile-title combinations appeared across all five daily Top-50 windows.`} Across the controlled study, ${persistentAcrossRuns} profile-title combinations appeared in all three runs.`,
    `<strong>RFY explains only part of the visible stream.</strong> Among the first 30 Synthetic Day 5 recommendations, profile-level alignment with the separate 30-title RFY rail ranges from ${formatPercent(analysis.headline.rfyMinRate)} to ${formatPercent(analysis.headline.rfyMaxRate)}.`,
  ];
  document.querySelector("#findingsExecutiveSummary").innerHTML = summary
    .map((item) => `<p>${item}</p>`)
    .join("");

  metricStrip("#findingsMetrics", [
    [`${formatPercent(Math.min(...routineRates))}–${formatPercent(Math.max(...routineRates))}`, "Day 5 title overlap"],
    [`${formatPercent(Math.min(...repetitionRates))}–${formatPercent(Math.max(...repetitionRates))}`, "Run 3 exact-clip recurrence"],
    [`${formatPercent(analysis.headline.rfyMinRate)}–${formatPercent(analysis.headline.rfyMaxRate)}`, "RFY alignment"],
    [persistentAcrossFiveDays, "Five-day persistent profile-title pairs"],
  ]);

  document.querySelector("#findingsRfyChart").replaceChildren(
    ...analysis.rfyProfiles.map((item) =>
      reportBar(
        profileShortLabel(item.profileLabel),
        item.rate,
        `${item.matchingAppearances} of ${item.shortsWindow}`,
      ),
    ),
  );
  document.querySelector("#findingsRfyDetail").replaceChildren(
    ...analysis.rfyProfiles.map((item) => {
      const card = element("article", "report-detail-card");
      card.innerHTML = `
        <p class="eyebrow">${escapeHtml(profileShortLabel(item.profileLabel))}</p>
        <strong>${item.matchingAppearances} / ${item.shortsWindow}</strong>
        <span>recommendations match ${item.distinctMatchingTitles} distinct RFY titles</span>
        <p>${item.matchingPositions.length
          ? item.matchingPositions
            .map((position) => `${escapeHtml(position.title)} · Short #${position.shortsPosition} / RFY #${position.rfyPosition}`)
            .join("<br>")
          : "No title alignment in the configured window."}</p>`;
      return card;
    }),
  );

  document.querySelector("#findingsRepeatProfiles").replaceChildren(
    ...analysis.repetitionProfiles.map((item) => {
      const card = element("article", "report-profile-card");
      const progression = item.progressive
        .map((run) => `<span><b>R${run.run}</b>${formatPercent(run.rate)}</span>`)
        .join("");
      card.innerHTML = `
        <p class="eyebrow">${escapeHtml(profileShortLabel(item.profileLabel))}</p>
        <strong>${formatPercent(item.latestRate)}</strong>
        <span>Run 3 exact-clip recurrence</span>
        <div class="mini-progression">${progression}</div>
        <p>${item.cumulativeUniqueClips} cumulative unique clips across 60 appearances.</p>`;
      return card;
    }),
  );
  document.querySelector("#findingsRepeatTables").replaceChildren(
    ...analysis.repetitionProfiles.map((profile) =>
      reportTableBlock(
        profileShortLabel(profile.profileLabel),
        ["Rank", "Recurring exact clip", "Frequency", "When shown"],
        profile.topRecurringClips.map((item, index) => [
          String(index + 1),
          `${item.title} · ${item.clipId}`,
          `${item.appearances}× / ${item.runCount} runs`,
          formatRunPositions(item.positions),
        ]),
      ),
    ),
  );
  const persistenceRows = analysis.repetitionTitleLeaders.map((item, index) => [
    String(index + 1),
    profileShortLabel(item.profileLabel),
    item.title,
    `${item.appearances}× / ${item.runCount} runs`,
    formatRunPositions(item.positions),
  ]);
  const persistenceTarget = document.querySelector("#findingsRepeatPersistence");
  persistenceTarget.replaceChildren(
    persistenceRows.length
      ? reportTable(
        ["Rank", "Profile", "Persistent title", "Frequency", "Run positions"],
        persistenceRows,
      )
      : emptyFinding("No fictional title appeared in all three controlled runs."),
  );

  document.querySelector("#findingsContinuityProfiles").replaceChildren(
    ...analysis.routineProfiles.map((item) => {
      const card = element("article", "report-profile-card");
      const comparisons = item.anchorComparisons
        .map(
          (comparison) => `
            <div class="mini-bar">
              <span>${comparison.lookbackDays}d</span>
              <i><b style="width:${comparison.rate * 100}%"></b></i>
              <em>${formatPercent(comparison.rate)}</em>
            </div>`,
        )
        .join("");
      card.innerHTML = `
        <p class="eyebrow">${escapeHtml(profileShortLabel(item.profileLabel))}</p>
        <strong>${formatPercent(item.latestRate)}</strong>
        <span>one-day title overlap</span>
        <div class="mini-bars">${comparisons}</div>
        <p>Day 5 compared with each earlier Top-50 window.</p>`;
      return card;
    }),
  );
  document.querySelector("#findingsContinuityTables").replaceChildren(
    ...analysis.routineProfiles.map((profile) => {
      const exact = profile.persistentTitles;
      const rows = exact.length ? exact : profile.nearestPersistentTitles;
      const block = reportTableBlock(
        profileShortLabel(profile.profileLabel),
        ["Rank", "Title", "Days present", "Appearances", "Daily positions"],
        rows.map((item, index) => [
          String(index + 1),
          item.title,
          `${item.dayCount} / ${config.routine.days}`,
          `${item.appearances}×`,
          formatDayPositions(item.positions),
        ]),
      );
      if (!exact.length) {
        const note = element("p", "empty-note");
        note.textContent = "No title appeared in all five days. Closest persistent titles are shown below.";
        block.insertBefore(note, block.querySelector(".report-table-wrap"));
      }
      return block;
    }),
  );

  document.querySelector("#findingsLimitations").replaceChildren(
    ...analysis.limitations.map((limitation) => {
      const item = document.createElement("li");
      item.textContent = limitation;
      return item;
    }),
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
      const title = state.data.titles.get(item.titleId);
      const issue = ISSUE_TYPES[item.type];
      const card = element("article", "review-card");
      card.dataset.caseId = item.id;
      card.innerHTML = `
        <div class="review-evidence">
          <img class="review-poster" src="${title.posterPath}" alt="${escapeHtml(item.title)} fictional poster artwork" loading="lazy">
          <figure class="review-capture">
            <img src="assets/review-evidence/${item.clipId}.webp" alt="Portrait synthetic clip evidence for ${escapeHtml(item.title)}" loading="lazy">
            <figcaption>Captured clip evidence</figcaption>
          </figure>
        </div>
        <div class="review-case-copy">
          <div class="review-case-head">
            <p class="eyebrow">${escapeHtml(issue.title)}</p>
            <span class="review-status">${decisions[item.id] ? `Resolved · ${escapeHtml(decisions[item.id])}` : "Needs review"}</span>
          </div>
          <h2>${escapeHtml(item.title)}</h2>
          <h3>${escapeHtml(item.label)}</h3>
          <p>${escapeHtml(item.prompt)}</p>
          <dl class="review-metadata">
            <div><dt>Case</dt><dd>${escapeHtml(item.id)}</dd></div>
            <div><dt>Title ID</dt><dd>${escapeHtml(item.titleId)}</dd></div>
            <div><dt>Clip ID</dt><dd>${escapeHtml(item.clipId)}</dd></div>
            <div><dt>Suggested</dt><dd>${escapeHtml(item.suggestedDecision)}</dd></div>
          </dl>
          <div class="review-actions" role="group" aria-label="Decision for ${escapeHtml(item.title)}"></div>
        </div>`;
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
  card.addEventListener("click", () => showDetail(item, title, clip, image));
  return card;
}

function showDetail(item, title, clip, image) {
  const dialog = document.querySelector("#detailDialog");
  const content = document.querySelector("#detailContent");
  const isPoster = image === title.posterPath;
  content.innerHTML = `<div class="detail-layout">
    <img src="${image}" alt="${isPoster ? "Fictional poster artwork" : "Synthetic vertical capture"} for ${escapeHtml(title.title)}">
    <div class="detail-copy">
      <p class="eyebrow">${isPoster ? "Fictional title artwork" : "Synthetic canonical clip"}</p>
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

function reportBar(label, value, detail) {
  const row = element("div", "report-bar-row");
  row.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <i><b style="width:${value * 100}%"></b></i>
    <strong>${formatPercent(value)}</strong>
    <small>${escapeHtml(detail)}</small>`;
  return row;
}

function reportTableBlock(title, headers, rows) {
  const block = element("section", "report-table-block");
  const heading = document.createElement("h4");
  heading.textContent = title;
  block.append(heading, rows.length ? reportTable(headers, rows) : emptyFinding("No qualifying records."));
  return block;
}

function reportTable(headers, rows) {
  const wrap = element("div", "report-table-wrap");
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headers.forEach((header) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = header;
    headRow.append(cell);
  });
  head.append(headRow);
  const body = document.createElement("tbody");
  rows.forEach((row) => {
    const tableRow = document.createElement("tr");
    row.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      tableRow.append(cell);
    });
    body.append(tableRow);
  });
  table.append(head, body);
  wrap.append(table);
  return wrap;
}

function emptyFinding(message) {
  const note = element("p", "empty-note");
  note.textContent = message;
  return note;
}

function formatRunPositions(positions) {
  return positions.map((item) => `R${item.run} #${item.position}`).join(" · ");
}

function formatDayPositions(positions) {
  return positions.map((item) => `Day ${item.day} #${item.position}`).join(" · ");
}

function profileShortLabel(label) {
  return label.split(" — ").at(-1);
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
