(function () {
  "use strict";

  const Utils = window.MapGameUtils;
  const APP_VERSION = "v2026.02.20.5";
  const TOTAL_QUESTIONS = 10;

  const MODE_CONFIG = {
    "province-click": {
      title: "省份大挑战",
      scope: "china",
      type: "province",
    },
    "city-click": {
      title: "省会定位",
      scope: "china",
      type: "city",
    },
    "world-province": {
      title: "世界国家挑战",
      scope: "world",
      type: "province",
    },
    "world-city": {
      title: "世界城市定位",
      scope: "world",
      type: "city",
    },
  };

  const state = {
    mode: null,
    currentQuestion: 0,
    totalQuestions: TOTAL_QUESTIONS,
    score: 0,
    accuracy: 0,
    totalDistance: 0,
    currentTarget: null,
    questions: [],
    history: [],
    awaitingAnswer: false,

    dataReady: false,
    data: {
      chinaProvinces: null,
      chinaCities: [],
      worldCountries: null,
      worldCities: [],
    },

    mapContext: null,
    reviewMapContext: null,
    activeGeoJson: null,
    downPoint: null,
    autoNextTimer: null,
    dev: {
      enabled: false,
      logs: [],
      maxLogs: 300,
    },
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    renderVersion();
    bindEvents();
    initDevTools();
    setModeButtonsDisabled(true);
    loadData();
  }

  function cacheElements() {
    els.homePage = document.getElementById("home-page");
    els.gamePage = document.getElementById("game-page");
    els.resultPage = document.getElementById("result-page");

    els.modeButtons = Array.from(
      document.querySelectorAll('#mode-selection button[data-mode]')
    );

    els.loadingText = document.getElementById("loading-text");
    els.errorText = document.getElementById("error-text");

    els.modeTitle = document.getElementById("mode-title");
    els.question = document.getElementById("question");
    els.progress = document.getElementById("progress");
    els.liveScore = document.getElementById("live-score");
    els.feedback = document.getElementById("feedback");

    els.mapContainer = document.getElementById("map-container");
    els.nextBtn = document.getElementById("next-btn");
    els.quitBtn = document.getElementById("quit-btn");

    els.scoreText = document.getElementById("score-text");
    els.details = document.getElementById("details");
    els.mapReview = document.getElementById("map-review");
    els.historyList = document.getElementById("history-list");
    els.restartBtn = document.getElementById("restart-btn");
    els.homeBtn = document.getElementById("home-btn");
    els.homeVersion = document.getElementById("home-version");
    els.gameVersion = document.getElementById("game-version");
    els.resultVersion = document.getElementById("result-version");

    els.devTools = document.getElementById("dev-tools");
    els.devLogOutput = document.getElementById("dev-log-output");
    els.devCopyBtn = document.getElementById("dev-copy-btn");
    els.devClearBtn = document.getElementById("dev-clear-btn");
    els.devToggleBtn = document.getElementById("dev-toggle-btn");
  }

  function bindEvents() {
    els.modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode;
        if (MODE_CONFIG[mode]) {
          startGame(mode);
        }
      });
    });

    els.nextBtn.addEventListener("click", handleNext);
    els.quitBtn.addEventListener("click", showHome);
    els.homeBtn.addEventListener("click", showHome);
    els.restartBtn.addEventListener("click", () => {
      if (state.mode) {
        startGame(state.mode);
      } else {
        showHome();
      }
    });

    if (els.devCopyBtn) {
      els.devCopyBtn.addEventListener("click", copyDevLogs);
    }
    if (els.devClearBtn) {
      els.devClearBtn.addEventListener("click", clearDevLogs);
    }
    if (els.devToggleBtn) {
      els.devToggleBtn.addEventListener("click", () => {
        setDevMode(!state.dev.enabled, true);
      });
    }
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setDevMode(!state.dev.enabled, true);
      }
    });
  }

  function initDevTools() {
    const enabledByQuery = /(?:\?|&)devlog=1(?:&|$)/.test(window.location.search);
    const enabledByStorage = window.localStorage.getItem("map-game-devlog") === "1";
    setDevMode(enabledByQuery || enabledByStorage, false);
  }

  function renderVersion() {
    const text = `版本：${APP_VERSION}`;
    if (els.homeVersion) {
      els.homeVersion.textContent = text;
    }
    if (els.gameVersion) {
      els.gameVersion.textContent = text;
    }
    if (els.resultVersion) {
      els.resultVersion.textContent = text;
    }
  }

  function setDevMode(flag, persist) {
    state.dev.enabled = !!flag;
    if (persist !== false) {
      window.localStorage.setItem("map-game-devlog", state.dev.enabled ? "1" : "0");
    }
    if (els.devTools) {
      els.devTools.classList.toggle("hidden", !state.dev.enabled);
    }
    renderDevLogs();
    if (state.dev.enabled) {
      addDevLog("system", {
        message: "开发日志已开启（可用 Ctrl+Shift+D 开关）",
      });
    }
  }

  function addDevLog(type, payload) {
    if (!state.dev.enabled) {
      return;
    }
    const entry = {
      time: new Date().toISOString(),
      mode: state.mode || null,
      index: state.currentQuestion + 1,
      type,
      payload: payload || {},
    };
    state.dev.logs.push(entry);
    if (state.dev.logs.length > state.dev.maxLogs) {
      state.dev.logs.splice(0, state.dev.logs.length - state.dev.maxLogs);
    }
    renderDevLogs();
  }

  function renderDevLogs() {
    if (!els.devLogOutput) {
      return;
    }
    els.devLogOutput.value = state.dev.logs
      .map((item) => JSON.stringify(item))
      .join("\n");
    els.devLogOutput.scrollTop = els.devLogOutput.scrollHeight;
  }

  async function copyDevLogs() {
    if (!els.devLogOutput) {
      return;
    }
    const text = els.devLogOutput.value || "";
    try {
      await navigator.clipboard.writeText(text);
      setFeedback("开发日志已复制。", "ok");
    } catch (err) {
      els.devLogOutput.focus();
      els.devLogOutput.select();
      document.execCommand("copy");
      setFeedback("开发日志已复制。", "ok");
    }
  }

  function clearDevLogs() {
    state.dev.logs = [];
    renderDevLogs();
    addDevLog("system", { message: "日志已清空" });
  }

  async function loadData() {
    showLoading(true);
    clearError();

    try {
      const [chinaProvinces, chinaCities, worldCountries, worldCities] =
        await Promise.all([
          d3.json("data/china-provinces.geojson"),
          d3.json("data/china-cities.json"),
          d3.json("data/world-countries.geojson"),
          d3.json("data/world-cities.json"),
        ]);

      state.data.chinaProvinces = normalizeGeoJsonOrientation(chinaProvinces);
      state.data.worldCountries = normalizeGeoJsonOrientation(worldCountries);
      state.data.chinaCities = sanitizeChinaCities(chinaCities || []);
      state.data.worldCities = sanitizeWorldCities(worldCities || []);
      state.dataReady = true;

      showLoading(false);
      setModeButtonsDisabled(false);
      showHome();
    } catch (err) {
      console.error(err);
      showLoading(false);
      showError("数据加载失败，请检查 data 目录文件是否完整。");
    }
  }

  function sanitizeChinaCities(list) {
    return (Array.isArray(list) ? list : [])
      .filter((item) => isValidCoord(item.lat) && isValidCoord(item.lon))
      .filter((item) => item && (item.name || item.enName))
      .map((item) => ({
        name: item.name || item.enName,
        enName: item.enName || "",
        lat: Number(item.lat),
        lon: Number(item.lon),
        type: (item.type || "capital").toLowerCase(),
        province: item.province || "",
        country: "China",
      }));
  }

  function normalizeGeoJsonOrientation(geojson) {
    if (!geojson || !Array.isArray(geojson.features)) {
      return geojson;
    }
    const threshold = 2 * Math.PI;
    const features = geojson.features.map((feature) => {
      if (!feature || !feature.geometry) {
        return feature;
      }

      let area = 0;
      try {
        area = d3.geoArea(feature);
      } catch (err) {
        return feature;
      }

      if (!(area > threshold)) {
        return feature;
      }
      return reverseFeatureRings(feature);
    });

    return { ...geojson, features };
  }

  function reverseFeatureRings(feature) {
    const geometry = feature.geometry || {};
    const type = geometry.type;
    let coordinates = geometry.coordinates;

    if (type === "Polygon" && Array.isArray(coordinates)) {
      coordinates = coordinates.map((ring) =>
        Array.isArray(ring) ? [...ring].reverse() : ring
      );
    } else if (type === "MultiPolygon" && Array.isArray(coordinates)) {
      coordinates = coordinates.map((polygon) =>
        Array.isArray(polygon)
          ? polygon.map((ring) => (Array.isArray(ring) ? [...ring].reverse() : ring))
          : polygon
      );
    } else {
      return feature;
    }

    return {
      ...feature,
      geometry: {
        ...geometry,
        coordinates,
      },
    };
  }

  function sanitizeWorldCities(list) {
    return (Array.isArray(list) ? list : [])
      .filter((item) => item && isValidCoord(item.lat) && isValidCoord(item.lon))
      .map((item) => ({
        name: item.name || item.enName || item.country || "未知城市",
        enName: item.enName || "",
        lat: Number(item.lat),
        lon: Number(item.lon),
        type: (item.type || "capital").toLowerCase(),
        province: item.province || "",
        country: item.country || "Unknown",
      }))
      .filter((item) => item.type === "capital" || item.type === "major");
  }

  function isValidCoord(value) {
    return Number.isFinite(Number(value));
  }

  function setModeButtonsDisabled(flag) {
    els.modeButtons.forEach((btn) => {
      btn.disabled = !!flag;
    });
  }

  function showLoading(flag) {
    els.loadingText.classList.toggle("hidden", !flag);
  }

  function showError(message) {
    els.errorText.textContent = message;
    els.errorText.classList.remove("hidden");
  }

  function clearError() {
    els.errorText.textContent = "";
    els.errorText.classList.add("hidden");
  }

  function showPage(pageId) {
    [els.homePage, els.gamePage, els.resultPage].forEach((page) => {
      page.classList.add("hidden");
    });
    document.getElementById(pageId).classList.remove("hidden");
  }

  function showHome() {
    clearAutoNextTimer();
    setFeedback("");
    clearError();
    showPage("home-page");
  }

  function startGame(mode) {
    if (!state.dataReady || !MODE_CONFIG[mode]) {
      return;
    }

    state.mode = mode;
    state.currentQuestion = 0;
    state.totalQuestions = TOTAL_QUESTIONS;
    state.score = 0;
    state.accuracy = 0;
    state.totalDistance = 0;
    state.currentTarget = null;
    state.questions = generateQuestions(mode, TOTAL_QUESTIONS);
    state.totalQuestions = state.questions.length;
    state.history = [];
    state.awaitingAnswer = false;
    clearAutoNextTimer();

    if (!state.questions.length) {
      showError("题库数据不足，无法开始该模式。");
      return;
    }

    showPage("game-page");
    els.modeTitle.textContent = MODE_CONFIG[mode].title;
    addDevLog("game_start", {
      mode,
      title: MODE_CONFIG[mode].title,
      totalQuestions: state.totalQuestions,
    });
    renderGameMap();
    renderQuestion();
  }

  function generateQuestions(mode, count) {
    const size = Number.isFinite(count) ? count : TOTAL_QUESTIONS;

    if (mode === "province-click") {
      const items = (state.data.chinaProvinces.features || [])
        .filter((f) => f && Utils.getFeatureName(f))
        .map((feature) => {
          const center = getFeatureCenter(feature);
          return {
            type: "province",
            name: Utils.getFeatureName(feature),
            prompt: Utils.getFeatureName(feature),
            actualPosition: center,
          };
        });
      return Utils.sampleSize(items, Math.min(size, items.length));
    }

    if (mode === "city-click") {
      const items = state.data.chinaCities
        .filter((c) => c.type === "capital")
        .map((city) => ({
          type: "city",
          name: city.name,
          prompt: `${city.province || city.name}省会（${city.name}）`,
          actualPosition: { lat: city.lat, lon: city.lon },
          cityType: "capital",
          country: "China",
        }));
      return Utils.sampleSize(items, Math.min(size, items.length));
    }

    if (mode === "world-province") {
      const items = (state.data.worldCountries.features || [])
        .filter((f) => f && Utils.getFeatureName(f))
        .map((feature) => {
          const center = getFeatureCenter(feature);
          return {
            type: "province",
            name: Utils.getFeatureName(feature),
            prompt: Utils.getFeatureName(feature),
            actualPosition: center,
          };
        });
      return Utils.sampleSize(items, Math.min(size, items.length));
    }

    if (mode === "world-city") {
      const items = state.data.worldCities.map((city) => {
        const label =
          city.type === "capital"
            ? `${city.country}首都（${city.name}）`
            : `${city.country}主要城市（${city.name}）`;
        return {
          type: "city",
          name: city.name,
          prompt: label,
          actualPosition: { lat: city.lat, lon: city.lon },
          cityType: city.type,
          country: city.country,
        };
      });
      return Utils.sampleSize(items, Math.min(size, items.length));
    }

    return [];
  }

  function getFeatureCenter(feature) {
    const props = feature && feature.properties ? feature.properties : {};
    if (Array.isArray(props.center) && props.center.length >= 2) {
      return { lon: Number(props.center[0]), lat: Number(props.center[1]) };
    }
    const centroid = d3.geoCentroid(feature);
    return { lon: centroid[0], lat: centroid[1] };
  }

  function getMapRenderPreset(scope, isReview) {
    const world = scope === "world";
    return {
      projection: world ? "naturalEarth1" : "equirectangular",
      mapThemeClass: world ? "map-theme-world" : "map-theme-china",
      padding: isReview ? (world ? 10 : 8) : world ? 12 : 10,
      scaleExtent: isReview ? [1, 8] : [1, 12],
      fitBounds: world ? null : [[73.5, 18], [135.1, 53.6]],
    };
  }

  function getChinaOutlineFeature() {
    const world = state.data.worldCountries;
    if (!world || !Array.isArray(world.features)) {
      return null;
    }
    return (
      world.features.find(
        (feature) =>
          Utils.normalizeName(Utils.getFeatureName(feature)) === Utils.normalizeName("China")
      ) || null
    );
  }

  function renderGameMap() {
    const scope = MODE_CONFIG[state.mode].scope;
    const preset = getMapRenderPreset(scope, false);
    const chinaOutline = scope === "china" ? getChinaOutlineFeature() : null;
    state.activeGeoJson =
      scope === "china" ? state.data.chinaProvinces : state.data.worldCountries;

    state.mapContext = Utils.renderMap(state.activeGeoJson, els.mapContainer, {
      zoomable: true,
      scaleExtent: preset.scaleExtent,
      padding: preset.padding,
      projection: preset.projection,
      basemapClass: preset.mapThemeClass,
      outlineClass: preset.mapThemeClass,
      outlineFeature: chinaOutline || state.activeGeoJson,
      featureClass: state.mode === "province-click" ? "map-feature-no-border" : "",
      fitBounds: preset.fitBounds,
      disableDoubleClickZoom: true,
      ariaLabel: "game-map",
    });

    state.mapContext.svg
      .on("pointerdown.answer", onMapPointerDown)
      .on("pointerup.answer", onMapPointerUp);
  }

  function onMapPointerDown(event) {
    state.downPoint = Utils.getPointerPosition(event, state.mapContext.svg.node());
  }

  function onMapPointerUp(event) {
    if (!state.awaitingAnswer || !state.currentTarget || !state.mapContext) {
      return;
    }

    const upPoint = Utils.getPointerPosition(event, state.mapContext.svg.node());
    const downPoint = state.downPoint || upPoint;
    state.downPoint = null;

    const moved = Math.hypot(upPoint.x - downPoint.x, upPoint.y - downPoint.y);
    if (moved > 8) {
      return;
    }

    const modeType = MODE_CONFIG[state.mode].type;
    const geo = Utils.screenToGeo(
      upPoint.x,
      upPoint.y,
      state.mapContext.projection,
      state.mapContext.getTransform()
    );

    if (modeType === "province") {
      const feature = getFeatureFromEvent(event);
      handleProvinceAnswer({
        geo,
        feature,
        screenPoint: upPoint,
      });
    } else {
      if (!geo) {
        setFeedback("请点击地图有效区域。", "warn");
        addDevLog("city_click_invalid", { screenPoint: upPoint });
        return;
      }
      handleCityAnswer(geo);
    }
  }

  function getFeatureFromEvent(event) {
    const rawTarget = event && event.target;
    if (!rawTarget || typeof rawTarget.closest !== "function") {
      return null;
    }
    const pathEl = rawTarget.closest("path.map-feature");
    if (!pathEl) {
      return null;
    }
    return d3.select(pathEl).datum() || null;
  }

  function handleProvinceAnswer(input) {
    const payload = input || {};
    const geo = payload.geo || null;
    const feature = payload.feature || null;
    const screenPoint = payload.screenPoint || null;
    const target = state.currentTarget;
    const clickedName = feature ? Utils.getFeatureName(feature) : null;
    const correct =
      !!clickedName &&
      Utils.normalizeName(clickedName) === Utils.normalizeName(target.name);

    if (correct) {
      state.score += 1;
    }

    state.history.push({
      question: target.name,
      actualPosition: target.actualPosition,
      playerPosition: geo,
      distance: 0,
      clickedName: clickedName || "未命中区域",
      isCorrect: correct,
    });

    addDevLog("province_click", {
      question: target.name,
      clickedName: clickedName || null,
      isCorrect: correct,
      clickGeo: geo,
      clickScreen: screenPoint,
    });

    highlightProvinceResult(target.name, clickedName, correct);

    if (correct) {
      setFeedback("回答正确。", "ok");
      finalizeQuestion();
    } else if (clickedName) {
      setFeedback(`未命中，点击了：${clickedName}。正确答案：${target.name}。`, "error");
      finalizeQuestion({ autoNextMs: 2000 });
    } else {
      setFeedback(`未命中有效行政区。正确答案：${target.name}。`, "error");
      finalizeQuestion({ autoNextMs: 2000 });
    }
  }

  function highlightProvinceResult(targetName, clickedName, correct) {
    const norm = Utils.normalizeName;

    state.mapContext.features
      .classed("feature-target", (d) => norm(Utils.getFeatureName(d)) === norm(targetName))
      .classed(
        "feature-selected",
        (d) => !!clickedName && norm(Utils.getFeatureName(d)) === norm(clickedName)
      )
      .classed(
        "feature-correct",
        (d) => correct && norm(Utils.getFeatureName(d)) === norm(targetName)
      )
      .classed(
        "feature-wrong",
        (d) =>
          !correct &&
          !!clickedName &&
          norm(Utils.getFeatureName(d)) === norm(clickedName)
      );
  }

  function handleCityAnswer(geo) {
    const target = state.currentTarget;
    const distance = Utils.haversineDistance(geo, target.actualPosition);

    if (!Number.isFinite(distance)) {
      setFeedback("坐标计算失败，请重试。", "warn");
      return;
    }

    state.totalDistance += distance;
    if (distance <= 300) {
      state.score += 1;
    }

    state.history.push({
      question: target.prompt,
      actualPosition: target.actualPosition,
      playerPosition: geo,
      distance,
      clickedName: null,
      isCorrect: distance <= 300,
    });

    state.mapContext.clearOverlays();
    state.mapContext.drawLine(geo, target.actualPosition, "distance-line");
    state.mapContext.drawMarker({
      lat: target.actualPosition.lat,
      lon: target.actualPosition.lon,
      className: "target-marker",
      radius: 6,
    });
    state.mapContext.drawMarker({
      lat: geo.lat,
      lon: geo.lon,
      className: "player-marker",
      radius: 5,
    });

    addDevLog("city_click", {
      question: target.prompt,
      targetGeo: target.actualPosition,
      clickGeo: geo,
      distanceKm: Number(distance.toFixed(3)),
      isCorrect: distance <= 300,
    });

    if (distance <= 300) {
      setFeedback(`误差：${Utils.formatDistance(distance)}`, "ok");
      finalizeQuestion();
    } else {
      setFeedback(
        `误差：${Utils.formatDistance(distance)}。正确位置：${target.prompt}。`,
        "warn"
      );
      finalizeQuestion({ autoNextMs: 2000 });
    }
  }

  function finalizeQuestion(options) {
    const opts = options || {};
    const autoNextMs = Number.isFinite(opts.autoNextMs) ? Number(opts.autoNextMs) : 0;
    clearAutoNextTimer();
    state.awaitingAnswer = false;
    updateLiveScore();

    const isLast = state.currentQuestion >= state.totalQuestions - 1;
    els.nextBtn.disabled = false;
    els.nextBtn.textContent = isLast ? "查看结果" : "下一题";

    if (autoNextMs > 0) {
      els.nextBtn.disabled = true;
      els.nextBtn.textContent = isLast ? "2秒后查看结果" : "2秒后自动下一题";
      state.autoNextTimer = window.setTimeout(() => {
        state.autoNextTimer = null;
        handleNext();
      }, autoNextMs);
    }
  }

  function renderQuestion() {
    state.currentTarget = state.questions[state.currentQuestion];
    state.awaitingAnswer = true;

    state.mapContext.clearOverlays();
    state.mapContext.features
      .classed("feature-target", false)
      .classed("feature-selected", false)
      .classed("feature-correct", false)
      .classed("feature-wrong", false);

    const q = state.currentTarget;
    const modeType = MODE_CONFIG[state.mode].type;

    if (modeType === "province") {
      els.question.textContent = `请点击：${q.prompt}`;
    } else {
      els.question.textContent = `请定位：${q.prompt}`;
    }

    els.progress.textContent = `${state.currentQuestion + 1}/${state.totalQuestions}`;
    els.nextBtn.disabled = true;
    els.nextBtn.textContent = "下一题";
    setFeedback("");
    updateLiveScore();

    addDevLog("question", {
      mode: state.mode,
      order: state.currentQuestion + 1,
      total: state.totalQuestions,
      prompt: q.prompt,
      answer: q.name,
    });
  }

  function updateLiveScore() {
    if (MODE_CONFIG[state.mode].type === "province") {
      els.liveScore.textContent = `正确：${state.score}`;
    } else {
      els.liveScore.textContent = `总误差：${Utils.formatDistance(state.totalDistance)}`;
    }
  }

  function handleNext() {
    clearAutoNextTimer();
    if (state.awaitingAnswer) {
      return;
    }

    if (state.currentQuestion >= state.totalQuestions - 1) {
      finishGame();
      return;
    }

    state.currentQuestion += 1;
    renderQuestion();
  }

  function finishGame() {
    clearAutoNextTimer();
    if (MODE_CONFIG[state.mode].type === "province") {
      const correct = state.history.filter((h) => h.isCorrect).length;
      state.accuracy = correct / state.totalQuestions;
      els.scoreText.textContent = getProvinceScore(state.accuracy);

      els.details.innerHTML = [
        `<p>模式：${escapeHtml(MODE_CONFIG[state.mode].title)}</p>`,
        `<p>准确率：${(state.accuracy * 100).toFixed(0)}%</p>`,
        `<p>正确题数：${correct}/${state.totalQuestions}</p>`,
      ].join("");
    } else {
      const avg = state.totalDistance / state.totalQuestions;
      els.scoreText.textContent = getCityScore(state.totalDistance);

      els.details.innerHTML = [
        `<p>模式：${escapeHtml(MODE_CONFIG[state.mode].title)}</p>`,
        `<p>总误差：${Utils.formatDistance(state.totalDistance)}</p>`,
        `<p>平均误差：${Utils.formatDistance(avg)}</p>`,
        `<p>300km 内命中：${state.score}/${state.totalQuestions}</p>`,
      ].join("");
    }

    showPage("result-page");
    renderReviewMap();
    renderHistoryList();
  }

  function clearAutoNextTimer() {
    if (state.autoNextTimer) {
      window.clearTimeout(state.autoNextTimer);
      state.autoNextTimer = null;
    }
  }

  function renderReviewMap() {
    const scope = MODE_CONFIG[state.mode].scope;
    const preset = getMapRenderPreset(scope, true);
    const chinaOutline = scope === "china" ? getChinaOutlineFeature() : null;
    const geojson =
      scope === "china" ? state.data.chinaProvinces : state.data.worldCountries;

    state.reviewMapContext = Utils.renderMap(geojson, els.mapReview, {
      zoomable: true,
      scaleExtent: preset.scaleExtent,
      padding: preset.padding,
      projection: preset.projection,
      basemapClass: preset.mapThemeClass,
      outlineClass: preset.mapThemeClass,
      outlineFeature: chinaOutline || geojson,
      fitBounds: preset.fitBounds,
      disableDoubleClickZoom: true,
      ariaLabel: "review-map",
    });

    if (MODE_CONFIG[state.mode].type === "province") {
      const resultMap = new Map();
      state.history.forEach((h) => {
        resultMap.set(Utils.normalizeName(h.question), !!h.isCorrect);
      });

      state.reviewMapContext.features
        .classed("feature-review-correct", (d) => {
          const name = Utils.normalizeName(Utils.getFeatureName(d));
          return resultMap.get(name) === true;
        })
        .classed("feature-review-wrong", (d) => {
          const name = Utils.normalizeName(Utils.getFeatureName(d));
          return resultMap.get(name) === false;
        });
    } else {
      state.history.forEach((h) => {
        state.reviewMapContext.drawLine(h.playerPosition, h.actualPosition, "distance-line");
        state.reviewMapContext.drawMarker({
          lat: h.actualPosition.lat,
          lon: h.actualPosition.lon,
          className: "target-marker",
          radius: 4,
        });
        state.reviewMapContext.drawMarker({
          lat: h.playerPosition.lat,
          lon: h.playerPosition.lon,
          className: "player-marker",
          radius: 3,
        });
      });
    }
  }

  function renderHistoryList() {
    if (MODE_CONFIG[state.mode].type === "province") {
      const rows = state.history
        .map((item, index) => {
          const result = item.isCorrect ? "正确" : "错误";
          return `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(item.question)}</td>
              <td>${escapeHtml(item.clickedName || "-")}</td>
              <td>${result}</td>
            </tr>
          `;
        })
        .join("");

      els.historyList.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>题目</th>
              <th>你的点击</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      return;
    }

    const rows = state.history
      .map((item, index) => {
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(item.question)}</td>
            <td>${Utils.formatDistance(item.distance)}</td>
          </tr>
        `;
      })
      .join("");

    els.historyList.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>题目</th>
            <th>误差</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function setFeedback(text, type) {
    els.feedback.textContent = text || "";
    els.feedback.classList.remove("feedback-ok", "feedback-warn", "feedback-error");
    if (!text) {
      return;
    }
    if (type === "ok") {
      els.feedback.classList.add("feedback-ok");
      return;
    }
    if (type === "warn") {
      els.feedback.classList.add("feedback-warn");
      return;
    }
    els.feedback.classList.add("feedback-error");
  }

  function getProvinceScore(accuracy) {
    if (accuracy >= 1.0) return "料事如神";
    if (accuracy >= 0.8) return "深不可测";
    if (accuracy >= 0.6) return "出类拔萃";
    if (accuracy >= 0.4) return "马马虎虎";
    return "还得再练练";
  }

  function getCityScore(totalDistance) {
    if (totalDistance < 500) return "料事如神";
    if (totalDistance < 1000) return "深不可测";
    if (totalDistance < 2000) return "出类拔萃";
    if (totalDistance < 5000) return "马马虎虎";
    return "还得再练练";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
