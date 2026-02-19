(function () {
  "use strict";

  const EARTH_RADIUS_KM = 6371;

  function toRadians(deg) {
    return (deg * Math.PI) / 180;
  }

  function toNumber(value) {
    return Number(value);
  }

  function isFiniteNumber(value) {
    return Number.isFinite(toNumber(value));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeName(value) {
    return String(value == null ? "" : value).trim().toLowerCase().replace(/\s+/g, "");
  }

  function haversineDistance(playerPosition, actualPosition) {
    const lat1 = toNumber(playerPosition && playerPosition.lat);
    const lon1 = toNumber(playerPosition && playerPosition.lon);
    const lat2 = toNumber(actualPosition && actualPosition.lat);
    const lon2 = toNumber(actualPosition && actualPosition.lon);

    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) {
      return NaN;
    }

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
  }

  function geoToScreen(lat, lon, projection, transform) {
    const t = transform || d3.zoomIdentity;
    const projected = projection([lon, lat]);
    if (!projected) {
      return { x: NaN, y: NaN };
    }
    const [x, y] = t.apply(projected);
    return { x, y };
  }

  function screenToGeo(x, y, projection, transform) {
    const t = transform || d3.zoomIdentity;
    const [px, py] = t.invert([x, y]);
    const inverted = projection.invert([px, py]);
    if (!inverted) {
      return null;
    }
    const [lon, lat] = inverted;
    return { lat, lon };
  }

  function getFeatureName(feature) {
    if (!feature || !feature.properties) {
      return "";
    }

    const props = feature.properties;
    return (
      props.name ||
      props.NAME ||
      props.NAME_ZH ||
      props.admin ||
      props.sovereignt ||
      props.cn_name ||
      ""
    );
  }

  function shuffleArray(array) {
    const shuffled = Array.isArray(array) ? [...array] : [];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function sampleSize(array, count) {
    if (!Array.isArray(array)) {
      return [];
    }
    const size = clamp(toNumber(count) || 0, 0, array.length);
    return shuffleArray(array).slice(0, size);
  }

  function findFeatureByPoint(lon, lat, features) {
    if (!Array.isArray(features)) {
      return null;
    }
    for (let i = 0; i < features.length; i += 1) {
      const feature = features[i];
      try {
        if (d3.geoContains(feature, [lon, lat])) {
          return feature;
        }
      } catch (err) {
        // ignore invalid geometry
      }
    }
    return null;
  }

  function getPointerPosition(event, svgNode) {
    const [x, y] = d3.pointer(event, svgNode);
    return { x, y };
  }

  function formatDistance(distanceKm) {
    if (!Number.isFinite(distanceKm)) {
      return "-";
    }
    if (distanceKm >= 100) {
      return distanceKm.toFixed(0) + " km";
    }
    if (distanceKm >= 10) {
      return distanceKm.toFixed(1) + " km";
    }
    return distanceKm.toFixed(2) + " km";
  }

  function debounce(fn, delay) {
    let timer = null;
    const wait = Number.isFinite(delay) ? delay : 160;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function renderMap(geojsonData, svgContainer, options) {
    const opts = options || {};
    const container =
      typeof svgContainer === "string"
        ? document.querySelector(svgContainer)
        : svgContainer;

    if (!container) {
      throw new Error("renderMap: container not found");
    }
    if (!geojsonData || !Array.isArray(geojsonData.features)) {
      throw new Error("renderMap: invalid geojson");
    }

    const width = opts.width || container.clientWidth || 960;
    const height = opts.height || container.clientHeight || 600;
    const padding = Number.isFinite(opts.padding) ? opts.padding : 24;
    const zoomable = opts.zoomable !== false;
    const scaleExtent = opts.scaleExtent || [1, 8];

    const host = d3.select(container);
    host.selectAll("*").remove();

    const svg = host
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("aria-label", opts.ariaLabel || "map")
      .style("touch-action", "none");

    const root = svg.append("g").attr("class", "map-root");
    const featureLayer = root.append("g").attr("class", "feature-layer");
    const lineLayer = root.append("g").attr("class", "line-layer");
    const markerLayer = root.append("g").attr("class", "marker-layer");

    const projection = d3
      .geoMercator()
      .fitExtent(
        [
          [padding, padding],
          [width - padding, height - padding],
        ],
        geojsonData
      );

    const path = d3.geoPath().projection(projection);

    const features = featureLayer
      .selectAll("path")
      .data(geojsonData.features)
      .join("path")
      .attr("class", "map-feature")
      .attr("data-name", (d) => getFeatureName(d))
      .attr("d", path);

    let currentTransform = d3.zoomIdentity;
    let zoomBehavior = null;

    if (zoomable) {
      zoomBehavior = d3
        .zoom()
        .scaleExtent(scaleExtent)
        .on("zoom", (event) => {
          currentTransform = event.transform;
          root.attr("transform", currentTransform);
          if (typeof opts.onZoom === "function") {
            opts.onZoom(currentTransform);
          }
        });

      svg.call(zoomBehavior);
      if (opts.disableDoubleClickZoom) {
        svg.on("dblclick.zoom", null);
      }
    }

    function clearOverlays() {
      lineLayer.selectAll("*").remove();
      markerLayer.selectAll("*").remove();
    }

    function drawMarker(marker) {
      const m = marker || {};
      const lat = toNumber(m.lat);
      const lon = toNumber(m.lon);
      if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) {
        return null;
      }

      const projected = projection([lon, lat]);
      if (!projected) {
        return null;
      }

      const r = isFiniteNumber(m.radius) ? Number(m.radius) : 5;
      const klass = m.className || "marker";

      return markerLayer
        .append("circle")
        .attr("class", klass)
        .attr("cx", projected[0])
        .attr("cy", projected[1])
        .attr("r", r);
    }

    function drawLine(from, to, className) {
      const a = from || {};
      const b = to || {};
      if (
        !isFiniteNumber(a.lat) ||
        !isFiniteNumber(a.lon) ||
        !isFiniteNumber(b.lat) ||
        !isFiniteNumber(b.lon)
      ) {
        return null;
      }

      const pa = projection([Number(a.lon), Number(a.lat)]);
      const pb = projection([Number(b.lon), Number(b.lat)]);
      if (!pa || !pb) {
        return null;
      }

      return lineLayer
        .append("line")
        .attr("class", className || "distance-line")
        .attr("x1", pa[0])
        .attr("y1", pa[1])
        .attr("x2", pb[0])
        .attr("y2", pb[1]);
    }

    function resetView() {
      if (zoomable && zoomBehavior) {
        svg.transition().duration(220).call(zoomBehavior.transform, d3.zoomIdentity);
      }
    }

    return {
      svg,
      root,
      features,
      projection,
      path,
      clearOverlays,
      drawMarker,
      drawLine,
      resetView,
      getTransform() {
        return currentTransform;
      },
    };
  }

  window.MapGameUtils = {
    haversineDistance,
    geoToScreen,
    screenToGeo,
    renderMap,
    findFeatureByPoint,
    getFeatureName,
    getPointerPosition,
    shuffleArray,
    sampleSize,
    normalizeName,
    formatDistance,
    debounce,
    clamp,
  };
})();
