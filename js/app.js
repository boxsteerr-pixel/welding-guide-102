(function () {
  "use strict";

  const state = { manual: null, section: "home", query: "", deferredInstallPrompt: null };
  const sectionNames = ["home", "faults", "maintenance", "safety"];
  const riskLabels = { high: "高风险", medium: "注意", low: "一般" };

  function text(value) {
    return document.createTextNode(value == null ? "" : String(value));
  }

  function setText(selector, value) {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  }

  // Route hashes must not match content element IDs: native fragment scrolling hides the header.
  function sectionFromHash() {
    const name = location.hash.replace(/^#(?:section=)?/, "");
    return sectionNames.includes(name) ? name : "home";
  }

  function showSection(name, options) {
    if (!sectionNames.includes(name)) name = "home";
    state.section = name;
    document.querySelectorAll("[data-page]").forEach(function (section) {
      section.classList.toggle("active", section.dataset.page === name);
    });
    document.querySelectorAll("[data-section]").forEach(function (button) {
      const active = button.dataset.section === name;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
    if (!options || !options.fromHistory) history.pushState({ section: name }, "", `#section=${name}`);
    window.scrollTo({ top: 0, behavior: options && options.initial ? "instant" : "smooth" });
    const searchPanel = document.querySelector(".search-panel");
    if (searchPanel) searchPanel.hidden = name !== "home" && name !== "faults";
  }

  function appendList(parent, title, values, ordered) {
    if (!Array.isArray(values) || !values.length) return;
    const heading = document.createElement("h4");
    heading.append(text(title));
    const list = document.createElement(ordered ? "ol" : "ul");
    values.forEach(function (value) {
      const li = document.createElement("li");
      li.append(text(typeof value === "string" ? value : value.text));
      list.append(li);
    });
    parent.append(heading, list);
  }

  function note(value, style) {
    const paragraph = document.createElement("p");
    paragraph.className = `procedure-note procedure-note--${style}`;
    paragraph.textContent = value;
    return paragraph;
  }

  function buildMarks(marks) {
    const layer = document.createElement("span");
    layer.className = "figure-marks";
    layer.setAttribute("aria-hidden", "true");
    for (const [x, y, width, height, kind] of marks || []) {
      const marker = document.createElement("span");
      marker.className = "figure-marker";
      if (kind === "arrow" || kind === "circle") marker.classList.add(`figure-marker--${kind}`);
      Object.assign(marker.style, { left: x + "%", top: y + "%", width: width + "%", height: height + "%" });
      layer.append(marker);
    }
    return layer;
  }

  function buildFigure(figure, stepLabel, item) {
    const asset = state.manual.images[figure.image];
    const element = document.createElement("figure");
    element.className = "procedure-figure";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "figure-preview";
    button.setAttribute("aria-label", `放大：${figure.caption}`);
    const image = document.createElement("img");
    image.src = `./assets/images/emergency/${figure.image}.${asset.format || "jpg"}`;
    image.width = asset.width;
    image.height = asset.height;
    image.loading = "lazy";
    image.decoding = "async";
    image.alt = figure.caption;
    if (asset.flipY) image.classList.add("figure-flip-y");
    button.append(image, buildMarks(figure.marks));
    button.addEventListener("click", function () {
      const procedure = figure.image === "table-annotated-reference" ? item : null;
      openImage(image, false, { button, figure, asset, procedure });
    });
    const caption = document.createElement("figcaption");
    const captionText = document.createElement("span");
    captionText.textContent = `${stepLabel} · ${figure.caption} · 点击放大`;
    caption.append(captionText);
    if (Array.isArray(figure.legend)) {
      const legend = document.createElement("ul");
      legend.className = "figure-legend";
      figure.legend.forEach(function (description) {
        const entry = document.createElement("li");
        entry.textContent = description;
        legend.append(entry);
      });
      caption.append(legend);
    }
    element.append(button, caption);
    return element;
  }

  function action(label, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function focusAt(element) {
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "start" });
  }

  function buildEntry(item) {
    const details = document.createElement("details");
    details.className = "manual-entry";
    details.dataset.risk = item.risk || "medium";
    const summary = document.createElement("summary");
    const risk = document.createElement("span");
    risk.className = `risk ${item.risk || "medium"}`;
    risk.append(text(riskLabels[item.risk] || riskLabels.medium));
    const title = document.createElement("span");
    title.append(text(item.title || "未命名项目"));
    summary.append(title);
    if (item.page) {
      details.id = `procedure-${item.id}`;
      if (item.review) summary.append(risk);
    }

    const body = document.createElement("div");
    body.className = "entry-body";
    if (!item.page) body.append(risk);
    if (item.review) body.append(note("网页核对提示 · " + item.review, "review"));
    if (item.warning) body.append(note("原文提醒 · " + item.warning, "warning"));
    if (item.page) body.append(note(`C102 焊机 · 原件第 ${item.page} 页`, "source"));
    if (item.summary) {
      const paragraph = document.createElement("p");
      paragraph.append(text(item.summary));
      body.append(paragraph);
    }
    appendList(body, item.id === "focus-alignment" ? "原文测试要求" : "检查要点", item.checks, false);
    appendList(body, "停止并上报", item.stopConditions, false);

    if (Array.isArray(item.steps) && item.steps.length) {
      const heading = document.createElement("h4");
      heading.append(text(item.id === "limit-monitor" ? "原文画面说明" : "处置步骤"));
      body.append(heading);
      const stepNav = document.createElement("nav");
      stepNav.className = "procedure-nav";
      stepNav.setAttribute("aria-label", "跳到步骤");
      if (item.page && item.steps.length > 1) body.append(stepNav);
      item.steps.forEach(function (step, index) {
        const card = document.createElement("div");
        card.className = "step-card";
        const strong = document.createElement("strong");
        const label = step.sourceNumber === null ? "原文说明" : `步骤 ${index + 1}`;
        const originalNumber = step.sourceNumber && step.sourceNumber !== String(index + 1) ? `（原文 ${step.sourceNumber}）` : "";
        strong.append(text(step.sourceNumber === null ? step.title : `${label}${originalNumber} · ${step.title || "操作"}`));
        const paragraph = document.createElement("p");
        paragraph.append(text(step.text || ""));
        card.append(strong, paragraph);
        if (step.warning) card.append(note("原文警告 · " + step.warning, "warning"));
        if (step.figures) {
          const figures = document.createElement("div");
          figures.className = `procedure-figures ${step.layout || ""}`;
          step.figures.forEach(function (figure) { figures.append(buildFigure(figure, label, item)); });
          card.append(figures);
        }
        if (step.confirmation) card.append(note(step.confirmation, "confirmation"));
        if (step.image) {
          const image = document.createElement("img");
          image.src = step.image;
          image.alt = step.alt || step.title || item.title || "操作步骤图片";
          image.loading = "lazy";
          image.addEventListener("click", function () { openImage(image); });
          const hint = document.createElement("span");
          hint.className = "image-hint";
          hint.append(text("点击查看大图"));
          card.append(image, hint);
        }
        body.append(card);
        if (item.page && item.steps.length > 1) {
          card.tabIndex = -1;
          const jump = action(label, function () { focusAt(card); });
          jump.setAttribute("aria-label", `${label} · ${step.title}`);
          stepNav.append(jump);
        }
      });
    }
    if (item.page) {
      const navigation = document.createElement("nav");
      navigation.className = "procedure-nav";
      navigation.setAttribute("aria-label", "手顺导航");
      const items = state.manual.faults;
      const index = items.indexOf(item);
      if (index > 0) navigation.append(action("‹ 上一项", function () { showProcedure(items[index - 1].id); }));
      navigation.append(action("返回手顺列表", function () {
        details.open = false;
        focusAt(document.querySelector("#faults-title"));
      }));
      if (index + 1 < items.length) navigation.append(action("下一项 ›", function () { showProcedure(items[index + 1].id); }));
      body.append(navigation);
    }
    details.append(summary, body);
    return details;
  }

  function emptyState() {
    return document.querySelector("#empty-template").content.cloneNode(true);
  }

  function searchableText(item) {
    return JSON.stringify(item).toLocaleLowerCase("zh-CN");
  }

  function showProcedure(id) {
    if (state.query) {
      state.query = "";
      document.querySelector("#search-input").value = "";
      setText("#search-summary", "");
      renderCollection("#fault-list", state.manual.faults);
    }
    const target = document.getElementById(`procedure-${id}`);
    if (target) {
      document.querySelectorAll("#fault-list details[open]").forEach(function (entry) {
        if (entry !== target) entry.open = false;
      });
      target.open = true;
      focusAt(target.querySelector("summary"));
    }
  }

  function renderCollection(selector, items, query) {
    const container = document.querySelector(selector);
    container.replaceChildren();
    const normalizedQuery = (query || "").trim().toLocaleLowerCase("zh-CN");
    const filtered = normalizedQuery ? items.filter(function (item) { return searchableText(item).includes(normalizedQuery); }) : items;
    if (!filtered.length) {
      container.append(emptyState());
      if (normalizedQuery) {
        container.querySelector("h3").textContent = "没有找到匹配异常";
        container.querySelector("p").textContent = "请尝试其他关键词，或清空搜索查看全部项目。";
      }
    }
    else filtered.forEach(function (item) { container.append(buildEntry(item)); });
    return filtered.length;
  }

  function renderManual(manual) {
    state.manual = manual;
    const machine = manual.machine;
    document.title = `${machine.machineName} · ${machine.manualTitle}`;
    setText("#machine-name", machine.machineName);
    setText("#manual-title", machine.manualTitle);
    setText("#machine-state", machine.contentStatus);
    setText("#manual-version", `版本 ${machine.manualVersion} · 更新 ${machine.lastUpdated}`);
    setText("#footer-machine", machine.machineName);
    setText("#footer-version", machine.manualVersion);
    setText("#fault-count", manual.faults.length);
    setText("#maintenance-count", manual.maintenance.length);
    setText("#safety-count", manual.safety.length);
    setText("#procedure-review", manual.reviewNotice);
    setText("#procedure-source", manual.source);

    const notices = document.querySelector("#notices");
    notices.replaceChildren();
    manual.notices.forEach(function (item) {
      const box = document.createElement("div");
      box.className = `notice notice--${item.level || "info"}`;
      const title = document.createElement("strong");
      const body = document.createElement("p");
      title.append(text(item.title));
      body.append(text(item.body));
      box.append(title, body);
      notices.append(box);
    });
    renderCollection("#fault-list", manual.faults, state.query);
    const homeFaults = document.querySelector("#home-faults");
    homeFaults.replaceChildren();
    if (!manual.faults.length) homeFaults.append(emptyState());
    manual.faults.slice(0, 4).forEach(function (item, index) {
      const row = document.createElement("button");
      row.type = "button"; row.className = "fault-row"; row.dataset.entryIndex = index;
      const number = document.createElement("b"); number.append(text(index + 1));
      const copy = document.createElement("span");
      const title = document.createElement("strong"); title.append(text(item.title));
      const summary = document.createElement("small"); summary.append(text(item.summary || "查看处置步骤"));
      copy.append(title, summary);
      const arrow = document.createElement("em"); arrow.setAttribute("aria-hidden", "true"); arrow.append(text("›"));
      row.append(number, copy, arrow); homeFaults.append(row);
    });
    const keywords = document.querySelector("#quick-keywords");
    keywords.replaceChildren();
    const quickKeywords = Array.isArray(manual.quickKeywords) ? manual.quickKeywords : manual.faults.flatMap(function (item) { return Array.isArray(item.keywords) ? item.keywords : []; });
    Array.from(new Set(quickKeywords.filter(function (value) { return typeof value === "string" && value.trim(); }))).slice(0, 16).forEach(function (word) {
      const button = document.createElement("button"); button.type = "button"; button.dataset.keyword = word; button.append(text(word)); keywords.append(button);
    });
    if (!keywords.childNodes.length) keywords.append(text("内容录入后显示快捷关键词"));
    renderCollection("#maintenance-list", manual.maintenance);
    renderCollection("#safety-list", manual.safety);
  }

  async function loadManual() {
    const response = await fetch("./data/manual.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`手册数据读取失败：${response.status}`);
    const manual = await response.json();
    ["faults", "maintenance", "safety", "notices"].forEach(function (key) {
      if (!Array.isArray(manual[key])) throw new Error(`手册数据缺少数组：${key}`);
    });
    if (!manual.machine || !manual.machine.machineId) throw new Error("手册数据缺少设备配置");
    renderManual(manual);
    // Confirm only the version actually loaded and fully rendered, never a clicked link.
    if (window.WeldingUpdates) window.WeldingUpdates.markViewed(manual.machine);
  }

  function showLoadError(error) {
    console.error(error);
    const notices = document.querySelector("#notices");
    notices.innerHTML = "";
    const box = document.createElement("div");
    box.className = "notice";
    const title = document.createElement("strong");
    const body = document.createElement("p");
    title.append(text("手册数据暂时无法读取"));
    body.append(text("请检查网络后刷新；若已安装，可确认离线资源是否完成更新。"));
    box.append(title, body);
    notices.append(box);
  }

  document.addEventListener("click", function (event) {
    const keyword = event.target.closest("[data-keyword]");
    if (keyword) {
      document.querySelector("#search-input").value = keyword.dataset.keyword;
      document.querySelector("#search-form").requestSubmit();
    }
    const entry = event.target.closest("[data-entry-index]");
    if (entry && state.manual) {
      state.query = ""; document.querySelector("#search-input").value = "";
      setText("#search-summary", "");
      renderCollection("#fault-list", state.manual.faults);
      showSection("faults");
      const details = document.querySelectorAll("#fault-list details")[Number(entry.dataset.entryIndex)];
      if (details) { details.open = true; details.scrollIntoView({ behavior:"smooth", block:"start" }); }
    }
    const expansion = event.target.closest("[data-expand]");
    if (expansion) document.querySelectorAll("#fault-list details").forEach(function (entry) { entry.open = expansion.dataset.expand === "true"; });
    const navigation = event.target.closest("[data-section], [data-go]");
    if (navigation) showSection(navigation.dataset.section || navigation.dataset.go);
  });

  document.querySelector("#search-form").addEventListener("submit", function (event) {
    event.preventDefault();
    if (!state.manual) return;
    state.query = document.querySelector("#search-input").value;
    showSection("faults");
    const count = renderCollection("#fault-list", state.manual.faults, state.query);
    setText("#search-summary", state.query.trim() ? `找到 ${count} 项结果` : "");
  });

  document.querySelector("#search-input").addEventListener("input", function (event) {
    if (!event.target.value && state.manual) {
      state.query = "";
      renderCollection("#fault-list", state.manual.faults);
      setText("#search-summary", "");
    }
  });

  window.addEventListener("popstate", function (event) {
    if (event.state && event.state.image && imageContext) return openImage(imageContext.source, true, imageContext.annotation);
    if (!document.querySelector("#image-modal").hidden) return closeImage(false);
    showSection((event.state && event.state.section) || sectionFromHash(), { fromHistory: true });
  });

  const modal = document.querySelector("#image-modal");
  const modalImage = document.querySelector("#modal-image");
  const modalFrame = document.querySelector(".image-modal__frame");
  const modalProcedure = document.querySelector("#image-modal-procedure");
  const annotationToggle = document.querySelector("#toggle-marks");
  const detailZoom = document.querySelector("#zoom-detail");
  let imageContext = null;
  let imageHistoryClosing = false;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragStart = null;
  let pinchStart = null;

  function applyImageTransform() {
    modalFrame.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }

  function resetImage() { scale = 1; offsetX = 0; offsetY = 0; applyImageTransform(); }

  function openImage(source, fromHistory, annotation) {
    imageContext = { source, annotation, x: window.scrollX, y: window.scrollY };
    imageHistoryClosing = false;
    modalImage.src = source.currentSrc || source.src;
    modalImage.alt = source.alt;
    const procedure = annotation && annotation.procedure;
    modal.classList.toggle("image-modal--with-procedure", Boolean(procedure));
    modalProcedure.hidden = !procedure;
    modalProcedure.replaceChildren();
    if (procedure) {
      appendList(modalProcedure, "完整操作步骤", procedure.steps, true);
      if (procedure.warning) {
        const reminder = document.createElement("div");
        reminder.textContent = procedure.warning;
        modalProcedure.append(reminder);
      }
    }
    modalImage.classList.toggle("figure-flip-y", source.classList.contains("figure-flip-y"));
    const asset = annotation && annotation.asset;
    const previousMarks = modalFrame.querySelector(".figure-marks");
    if (previousMarks) previousMarks.remove();
    modalFrame.style.width = asset ? `min(100%, ${asset.width}px, ${(procedure ? 42 : 72) * asset.width / asset.height}vh)` : "";
    modalFrame.classList.toggle("image-modal__frame--annotated", Boolean(asset));
    const marks = annotation && annotation.figure.marks;
    annotationToggle.hidden = detailZoom.hidden = !marks || !marks.length;
    annotationToggle.setAttribute("aria-pressed", "true");
    if (marks && marks.length) modalFrame.append(buildMarks(marks));
    modal.hidden = false;
    modalProcedure.scrollTop = 0;
    document.body.classList.add("modal-open");
    resetImage();
    if (!fromHistory) history.pushState({ image: true, section: state.section }, "", location.href);
    document.querySelector(".image-modal__close").focus({ preventScroll: true });
  }

  function closeImage(useHistory) {
    // Keep the dialog open until popstate, so returning from it never switches sections.
    if (useHistory !== false && history.state && history.state.image) {
      if (!imageHistoryClosing) { imageHistoryClosing = true; history.back(); }
      return;
    }
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    modalImage.removeAttribute("src");
    resetImage();
    imageHistoryClosing = false;
    if (imageContext) {
      const position = imageContext;
      const trigger = position.annotation ? position.annotation.button : position.source;
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
      window.scrollTo({ left: position.x, top: position.y, behavior: "instant" });
      window.requestAnimationFrame(function () {
        if (modal.hidden) window.scrollTo({ left: position.x, top: position.y, behavior: "instant" });
      });
    }
  }

  document.querySelector(".image-modal__close").addEventListener("click", function () { closeImage(); });
  annotationToggle.addEventListener("click", function () {
    const marks = modalFrame.querySelector(".figure-marks");
    marks.hidden = !marks.hidden;
    annotationToggle.setAttribute("aria-pressed", String(!marks.hidden));
  });
  detailZoom.addEventListener("click", function () {
    const marks = imageContext.annotation.figure.marks;
    const left = Math.min(...marks.map(mark => mark[0]));
    const top = Math.min(...marks.map(mark => mark[1]));
    const right = Math.max(...marks.map(mark => mark[0] + mark[2]));
    const bottom = Math.max(...marks.map(mark => mark[1] + mark[3]));
    scale = Math.min(4, 84 / Math.max(right - left, bottom - top));
    scale = Math.max(1, scale);
    offsetX = (.5 - (left + right) / 200) * modalFrame.offsetWidth * scale;
    offsetY = (.5 - (top + bottom) / 200) * modalFrame.offsetHeight * scale;
    applyImageTransform();
  });
  modal.addEventListener("click", function (event) { if (event.target === modal) closeImage(); });
  modal.querySelectorAll("[data-zoom]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (button.dataset.zoom === "reset") return resetImage();
      scale = Math.min(4, Math.max(1, scale + (button.dataset.zoom === "in" ? .4 : -.4)));
      if (scale === 1) { offsetX = 0; offsetY = 0; }
      applyImageTransform();
    });
  });
  modalImage.addEventListener("pointerdown", function (event) {
    if (scale <= 1) return;
    modalImage.setPointerCapture(event.pointerId);
    dragStart = { x: event.clientX - offsetX, y: event.clientY - offsetY };
  });
  modalImage.addEventListener("pointermove", function (event) {
    if (!dragStart) return;
    offsetX = event.clientX - dragStart.x;
    offsetY = event.clientY - dragStart.y;
    applyImageTransform();
  });
  modalImage.addEventListener("pointerup", function () { dragStart = null; });
  modalImage.addEventListener("pointercancel", function () { dragStart = null; });
  modalImage.addEventListener("touchstart", function (event) {
    if (event.touches.length === 2) {
      pinchStart = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY) / scale;
    }
  }, { passive: true });
  modalImage.addEventListener("touchmove", function (event) {
    if (event.touches.length === 2 && pinchStart) {
      const distance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
      scale = Math.min(4, Math.max(1, distance / pinchStart));
      applyImageTransform();
    }
  }, { passive: true });
  modalImage.addEventListener("touchend", function () { pinchStart = null; }, { passive: true });
  modalImage.addEventListener("touchcancel", function () { pinchStart = null; }, { passive: true });
  window.addEventListener("keydown", function (event) {
    if (modal.hidden) return;
    if (event.key === "Escape") closeImage();
    if (event.key === "Tab") {
      const buttons = Array.from(modal.querySelectorAll("button:not([hidden]), #image-modal-procedure:not([hidden])"));
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
  });

  function updateNetworkStatus() {
    const node = document.querySelector("#network-status");
    node.textContent = navigator.onLine ? "在线" : "离线";
    node.classList.toggle("offline", !navigator.onLine);
  }
  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
  updateNetworkStatus();

  const installButton = document.querySelector("#install-button");
  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    installButton.hidden = false;
  });
  installButton.addEventListener("click", async function () {
    if (!state.deferredInstallPrompt) { document.querySelector("#install-hint").hidden = false; return; }
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    installButton.hidden = true;
  });
  window.addEventListener("appinstalled", function () { state.deferredInstallPrompt = null; installButton.hidden = true; });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch(function (error) {
        console.error("设备手册 Service Worker 注册失败", error);
      });
    });
  }

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.addEventListener("hashchange", function () {
    const name = location.hash.replace(/^#(?:section=)?/, "");
    if (!sectionNames.includes(name)) return;
    history.replaceState({ section: name }, "", `#section=${name}`);
    showSection(name, { fromHistory: true, initial: true });
  });
  const initialSection = sectionFromHash();
  history.replaceState({ section: initialSection }, "", `#section=${initialSection}`);
  showSection(initialSection, { fromHistory: true, initial: true });
  window.addEventListener("pageshow", function (event) {
    if (!event.persisted) window.scrollTo({ top: 0, behavior: "instant" });
  });
  loadManual().catch(showLoadError);
})();
