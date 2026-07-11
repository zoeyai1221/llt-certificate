/* Role-aware "Global Connection" map for the certificate page.
   - Learner  -> static US map: origin country badge + arcs to the US cities
                 where their conversation partners were.
   - Volunteer-> static world map: US home hub + arcs to the countries of the
                 learners they supported.
   Both are flat, full-view SVG maps (screenshot/print friendly). Data comes
   from the active profile broadcast by app.js via the `llt:profile` event. */
(function () {
  const CITY = window.LLT_CITY_COORDS || {};

  // Display name -> world-geo.js polygon name (only where they differ).
  const COUNTRY_NAME_MAP = {
    "United Kingdom": "England",
    Burma: "Myanmar",
    Palestine: "West Bank",
    "Democratic Republic of Congo": "Democratic Republic of the Congo",
    "Cote d'Ivoire (Ivory Coast)": "Ivory Coast",
    Serbia: "Republic of Serbia",
    "United States": "USA",
  };

  const cityKey = (c) => `${c.city}, ${c.state}`;
  const cityCoord = (c) => CITY[cityKey(c)] || null;

  let centroidCache = null;
  function countryCentroids() {
    if (centroidCache) return centroidCache;
    centroidCache = {};
    (window.LLT_WORLD?.features || []).forEach((f) => {
      centroidCache[f.properties.name] = d3.geoCentroid(f);
    });
    return centroidCache;
  }
  const geoName = (name) => COUNTRY_NAME_MAP[name] || name;

  // Cached US GeoJSON (decoded from topojson once).
  let usGeo = null;
  function usFeatures() {
    if (usGeo) return usGeo;
    const topo = window.LLT_US_TOPO;
    if (!topo || typeof topojson === "undefined") return null;
    usGeo = topojson.feature(topo, topo.objects.states);
    return usGeo;
  }

  // Bowed "flight path" arc between two screen points (control point lifted up).
  function arcPath(a, b) {
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const lift = Math.max(20, Math.min(150, dist * 0.22));
    const cx = (a[0] + b[0]) / 2;
    const cy = Math.min(a[1], b[1]) - lift;
    return `M${a[0]},${a[1]} Q${cx},${cy} ${b[0]},${b[1]}`;
  }

  const LAND = "#eef2f5";
  const LAND_STROKE = "rgba(9, 17, 70, 0.18)";
  const HL_LOW = "#c6ece7"; // low count highlight (turquoise tint)
  const HL_HIGH = "#f0514e"; // high count highlight (vivid red)

  // Shared hover tooltip (created once, lazily).
  let tipSel = null;
  function tooltip() {
    if (!tipSel) tipSel = d3.select("body").append("div").attr("class", "conn-tooltip");
    return tipSel;
  }

  // Live handle to the arc-animation observer so re-renders don't leak observers.
  let arcObserver = null;

  function baseSvg(container, w, h, label) {
    const svg = d3
      .select(container)
      .append("svg")
      .attr("class", "connection-svg")
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("width", "100%")
      .attr("role", "img")
      .attr("aria-label", label);
    const defs = svg.append("defs");
    const grad = defs
      .append("linearGradient")
      .attr("id", "connArc")
      .attr("x1", "0%")
      .attr("x2", "100%");
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#26bcae");
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#f0514e");
    return svg;
  }

  // Replay the arc-drawing animation every time the map scrolls into view.
  function armArcAnimation(section, paths) {
    if (!paths.length) return;
    const reset = () =>
      paths.forEach((p) => {
        const len = p.getTotalLength();
        p.style.transition = "none";
        p.style.strokeDasharray = len;
        p.style.strokeDashoffset = len;
      });
    const play = () => {
      reset();
      void paths[0].getBoundingClientRect(); // force reflow so the transition restarts
      paths.forEach((p, i) => {
        p.style.transition = `stroke-dashoffset 1100ms ease ${i * 110}ms`;
        p.style.strokeDashoffset = 0;
      });
    };

    reset();
    if (arcObserver) arcObserver.disconnect();
    if (!("IntersectionObserver" in window)) return play();
    arcObserver = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) play();
          else reset(); // re-arm so the next scroll-in fires again
        }),
      { threshold: 0.3 }
    );
    arcObserver.observe(section);
  }

  function sizeScale(counts) {
    const max = Math.max(1, d3.max(counts) || 1);
    return d3.scaleSqrt().domain([0, max]).range([4, 13]);
  }

  // ---- Learner: US map with arcs to partner cities ----
  function renderLearner(container, profile) {
    const features = usFeatures();
    if (!features) return;
    const W = 960;
    const H = 520;
    const svg = baseSvg(
      container,
      W,
      H,
      `US map showing cities where ${profile.firstName} practiced`
    );
    const projection = d3.geoAlbersUsa().fitExtent(
      [
        [20, 20],
        [W - 20, H - 40],
      ],
      features
    );
    const path = d3.geoPath().projection(projection);

    svg
      .append("g")
      .selectAll("path")
      .data(features.features)
      .enter()
      .append("path")
      .attr("d", path)
      .attr("fill", LAND)
      .attr("stroke", LAND_STROKE)
      .attr("stroke-width", 0.8);

    const hub = profile.homeCoord || cityCoord(profile.homeCity);
    const hubXY = hub ? projection(hub) : null;

    // Resolve partner cities to points (prefer baked-in coords).
    const cities = (profile.partnerCities || [])
      .map((c) => ({ ...c, coord: c.coord || cityCoord(c) }))
      .filter((c) => {
        if (!c.coord) console.warn("[connections] no coords for", cityKey(c));
        return c.coord;
      })
      .map((c) => ({ ...c, xy: projection(c.coord) }))
      .filter((c) => c.xy);

    const scale = sizeScale(cities.map((c) => c.count));
    const arcLayer = svg.append("g").attr("class", "conn-arcs");
    const dotLayer = svg.append("g").attr("class", "conn-dots");
    const arcPaths = [];

    if (hubXY) {
      cities.forEach((c) => {
        if (c.xy[0] === hubXY[0] && c.xy[1] === hubXY[1]) return;
        const p = arcLayer
          .append("path")
          .attr("class", "conn-arc")
          .attr("d", arcPath(hubXY, c.xy))
          .node();
        arcPaths.push(p);
      });
    }

    // Origin: dashed inbound arc + badge, suggesting arrival from abroad.
    if (hubXY && profile.originCountry) {
      const anchor = [46, Math.max(60, hubXY[1] - 120)];
      const originArc = arcLayer
        .append("path")
        .attr("class", "conn-origin-arc")
        .attr("d", arcPath(anchor, hubXY))
        .node();
      arcPaths.unshift(originArc);
      const badge = svg.append("g").attr("class", "conn-origin-badge");
      badge
        .append("text")
        .attr("x", anchor[0])
        .attr("y", anchor[1] - 14)
        .attr("class", "conn-origin-kicker")
        .text("FROM");
      badge
        .append("text")
        .attr("x", anchor[0])
        .attr("y", anchor[1] + 6)
        .attr("class", "conn-origin-country")
        .text(profile.originCountry);
      badge
        .append("circle")
        .attr("cx", anchor[0])
        .attr("cy", anchor[1] + 22)
        .attr("r", 5)
        .attr("class", "conn-origin-dot");
    }

    // City dots (sized by count) with hover tooltip, + labels.
    const tip = tooltip();
    dotLayer
      .selectAll("circle.conn-place-dot")
      .data(cities)
      .enter()
      .append("circle")
      .attr("cx", (c) => c.xy[0])
      .attr("cy", (c) => c.xy[1])
      .attr("r", (c) => scale(c.count))
      .attr("class", "conn-place-dot")
      .style("cursor", "pointer")
      .on("mouseover", function (event, c) {
        d3.select(this).attr("r", scale(c.count) + 3).attr("fill", "#091146").raise();
        tip
          .html(
            `<strong>${c.city}, ${c.state}</strong><span>${c.count} partner${
              c.count === 1 ? "" : "s"
            }</span>`
          )
          .style("opacity", 1)
          .style("left", event.pageX + 12 + "px")
          .style("top", event.pageY - 12 + "px");
      })
      .on("mousemove", function (event) {
        tip
          .style("left", event.pageX + 12 + "px")
          .style("top", event.pageY - 12 + "px");
      })
      .on("mouseout", function (event, c) {
        d3.select(this).attr("r", scale(c.count)).attr("fill", null);
        tip.style("opacity", 0);
      });

    dotLayer
      .selectAll("text.conn-place-label")
      .data(cities)
      .enter()
      .append("text")
      .attr("x", (c) => c.xy[0])
      .attr("y", (c) => c.xy[1] - scale(c.count) - 5)
      .attr("class", "conn-place-label")
      .text((c) => c.city);

    // Home hub on top.
    if (hubXY) {
      dotLayer
        .append("circle")
        .attr("cx", hubXY[0])
        .attr("cy", hubXY[1])
        .attr("r", 7)
        .attr("class", "conn-home-dot");
    }

    armArcAnimation(document.getElementById("global-connection"), arcPaths);
  }

  // ---- Volunteer: world map with arcs to partner countries ----
  function renderVolunteer(container, profile) {
    const all = window.LLT_WORLD?.features || [];
    if (!all.length) return;
    const W = 960;
    const H = 480;
    // Exclude Antarctica for tighter framing.
    const framed = {
      type: "FeatureCollection",
      features: all.filter((f) => f.properties.name !== "Antarctica"),
    };
    const svg = baseSvg(
      container,
      W,
      H,
      `World map showing countries ${profile.firstName} connected with`
    );
    const projection = d3.geoNaturalEarth1().fitExtent(
      [
        [8, 8],
        [W - 8, H - 8],
      ],
      framed
    );
    const path = d3.geoPath().projection(projection);

    const centroids = countryCentroids();
    const countByGeo = {};
    const displayByGeo = {}; // geo polygon name -> friendly display name
    (profile.partnerCountries || []).forEach((p) => {
      countByGeo[geoName(p.country)] = p.count;
      displayByGeo[geoName(p.country)] = p.country;
    });
    const maxC = Math.max(1, d3.max(Object.values(countByGeo)) || 1);
    const fill = d3
      .scaleSequential()
      .domain([0, Math.sqrt(maxC)])
      .interpolator(d3.interpolateRgb(HL_LOW, HL_HIGH));

    const pathByName = {};
    const countryPaths = svg
      .append("g")
      .selectAll("path")
      .data(framed.features)
      .enter()
      .append("path")
      .attr("d", path)
      .attr("fill", (d) => {
        const c = countByGeo[d.properties.name];
        return c ? fill(Math.sqrt(c)) : LAND;
      })
      .attr("stroke", LAND_STROKE)
      .attr("stroke-width", 0.5)
      .each(function (d) {
        pathByName[d.properties.name] = this;
      });

    // Shared hover behaviour, triggered by BOTH the country polygon and its dot
    // (dots sit on top of the polygons, so small countries are only reachable
    // via the dot).
    const tip = tooltip();
    const highlight = (name, on) => {
      const el = pathByName[name];
      if (!el) return;
      d3.select(el)
        .attr("stroke", on ? "#091146" : LAND_STROKE)
        .attr("stroke-width", on ? 1.2 : 0.5);
      if (on) d3.select(el).raise();
    };
    const showTip = (name, event) => {
      const c = countByGeo[name];
      tip
        .html(
          `<strong>${displayByGeo[name] || name}</strong><span>${c} learner${
            c === 1 ? "" : "s"
          }</span>`
        )
        .style("opacity", 1)
        .style("left", event.pageX + 12 + "px")
        .style("top", event.pageY - 12 + "px");
    };
    const bindHover = (sel, nameOf) =>
      sel
        .style("cursor", "pointer")
        .on("mouseover", function (event, d) {
          const name = nameOf(d);
          highlight(name, true);
          showTip(name, event);
        })
        .on("mousemove", function (event) {
          tip
            .style("left", event.pageX + 12 + "px")
            .style("top", event.pageY - 12 + "px");
        })
        .on("mouseout", function (event, d) {
          highlight(nameOf(d), false);
          tip.style("opacity", 0);
        });

    bindHover(
      countryPaths.filter((d) => countByGeo[d.properties.name]),
      (d) => d.properties.name
    );

    const hub = profile.homeCoord || cityCoord(profile.homeCity);
    const hubXY = hub ? projection(hub) : null;

    const arcLayer = svg.append("g").attr("class", "conn-arcs");
    const dotLayer = svg.append("g").attr("class", "conn-dots");
    const arcPaths = [];

    const targets = (profile.partnerCountries || [])
      .map((p) => ({ ...p, c: centroids[geoName(p.country)] }))
      .filter((p) => {
        if (!p.c) console.warn("[connections] no centroid for", p.country);
        return p.c;
      })
      .map((p) => ({ ...p, xy: projection(p.c) }))
      .filter((p) => p.xy);

    const scale = sizeScale(targets.map((p) => p.count));

    if (hubXY) {
      targets.forEach((t) => {
        const p = arcLayer
          .append("path")
          .attr("class", "conn-arc")
          .attr("d", arcPath(hubXY, t.xy))
          .node();
        arcPaths.push(p);
      });
    }

    const dots = dotLayer
      .selectAll("circle.conn-place-dot")
      .data(targets)
      .enter()
      .append("circle")
      .attr("cx", (t) => t.xy[0])
      .attr("cy", (t) => t.xy[1])
      .attr("r", (t) => scale(t.count))
      .attr("class", "conn-place-dot");
    bindHover(dots, (t) => geoName(t.country));

    if (hubXY) {
      dotLayer
        .append("circle")
        .attr("cx", hubXY[0])
        .attr("cy", hubXY[1])
        .attr("r", 7)
        .attr("class", "conn-home-dot");
      dotLayer
        .append("text")
        .attr("x", hubXY[0])
        .attr("y", hubXY[1] - 12)
        .attr("class", "conn-place-label")
        .text(profile.homeCity.city);
    }

    armArcAnimation(document.getElementById("global-connection"), arcPaths);
  }

  function renderList(profile) {
    const list = document.getElementById("country-list");
    if (!list) return;
    const items =
      profile.role === "volunteer"
        ? (profile.partnerCountries || []).map(
            (p) => `${p.country} · ${p.count}`
          )
        : (profile.partnerCities || []).map(
            (c) => `${c.city}, ${c.state} · ${c.count}`
          );
    list.innerHTML = items.map((t) => `<span>${t}</span>`).join("");
  }

  let activeProfile = null;

  function render(profile) {
    if (!profile) return;
    activeProfile = profile;
    const container = document.getElementById("connection-map");
    if (!container || typeof d3 === "undefined") return;
    container.innerHTML = "";

    const title = document.getElementById("connection-title");
    const lede = document.getElementById("connection-lede");
    if (profile.role === "volunteer") {
      if (title) title.textContent = "Conversations across the world";
      if (lede)
        lede.textContent = `${profile.firstName} connected with learners from ${
          (profile.partnerCountries || []).length
        } countries around the globe.`;
      renderVolunteer(container, profile);
    } else {
      if (title) title.textContent = "Conversations across the country";
      if (lede)
        lede.textContent = `From ${profile.originCountry}, ${
          profile.firstName
        } practiced with partners across ${
          (profile.partnerCities || []).length
        } US cities.`;
      renderLearner(container, profile);
    }
    renderList(profile);
  }

  window.LLTConnections = { render };
  document.addEventListener("llt:profile", (e) => render(e.detail));

  // Re-render on resize (debounced) so the SVG re-fits crisply.
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (!activeProfile) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => render(activeProfile), 200);
  });

  // If app.js already broadcast a profile before this script loaded.
  if (window.LLT_ACTIVE_PROFILE) render(window.LLT_ACTIVE_PROFILE);
})();
