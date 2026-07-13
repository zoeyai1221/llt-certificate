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

  // Country (registration name) -> ISO 3166-1 alpha-2, for flag emoji.
  const COUNTRY_ISO = {
    China: "CN", Brazil: "BR", Mexico: "MX", Colombia: "CO", "South Korea": "KR",
    Afghanistan: "AF", Venezuela: "VE", Haiti: "HT", Turkey: "TR", Ukraine: "UA",
    Russia: "RU", India: "IN", Ecuador: "EC", Peru: "PE", Japan: "JP", Iran: "IR",
    Vietnam: "VN", "Dominican Republic": "DO", Morocco: "MA", Honduras: "HN",
    Taiwan: "TW", Egypt: "EG", Guatemala: "GT", Cuba: "CU", "Puerto Rico": "PR",
    "El Salvador": "SV", Iraq: "IQ", Nicaragua: "NI", Jordan: "JO", Pakistan: "PK",
    Kyrgyzstan: "KG", Azerbaijan: "AZ", Yemen: "YE", Ethiopia: "ET", Belarus: "BY",
    "Democratic Republic of Congo": "CD", Lebanon: "LB", Spain: "ES", Algeria: "DZ",
    France: "FR", Argentina: "AR", Sudan: "SD", Bangladesh: "BD", Syria: "SY",
    "Costa Rica": "CR", Kazakhstan: "KZ", Nepal: "NP", Chile: "CL", Burma: "MM",
    Thailand: "TH", Cameroon: "CM", Poland: "PL", Bolivia: "BO", Eritrea: "ER",
    Turkmenistan: "TM", Indonesia: "ID", Palestine: "PS", "Saudi Arabia": "SA",
    Libya: "LY", Panama: "PA", Philippines: "PH", "United Kingdom": "GB",
    Israel: "IL", Italy: "IT", "Sri Lanka": "LK", Somalia: "SO", Senegal: "SN",
    Bulgaria: "BG", "Cote d'Ivoire (Ivory Coast)": "CI", "Burkina Faso": "BF",
    Armenia: "AM", "Cabo Verde": "CV", Uzbekistan: "UZ", Angola: "AO", Canada: "CA",
    Mongolia: "MN", Tajikistan: "TJ", Cambodia: "KH", Uruguay: "UY", Tunisia: "TN",
    "Czech Republic": "CZ", Hungary: "HU", Guinea: "GN", Mozambique: "MZ",
    Serbia: "RS", Samoa: "WS", Niger: "NE", "South Africa": "ZA", Finland: "FI",
    Moldova: "MD", Singapore: "SG", Romania: "RO", Mali: "ML", Croatia: "HR",
    Portugal: "PT", Paraguay: "PY", Nigeria: "NG", Kenya: "KE", Zimbabwe: "ZW",
    Albania: "AL", "United Arab Emirates": "AE", Madagascar: "MG", Germany: "DE",
    Mauritania: "MR", Liberia: "LR", "Sierra Leone": "SL", "United States": "US",
  };
  const flagEmoji = (country) => {
    const iso = COUNTRY_ISO[country];
    if (!iso) return "🌍";
    return iso
      .toUpperCase()
      .replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
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
  const HL_LOW = "#c6ece7"; // volunteer country low count (turquoise tint)
  const HL_HIGH = "#f0514e"; // volunteer country high count (vivid red)
  const HOME_COLOR = "#f48a89"; // pastel-red — "you / home"
  const ARC_HOME = "#f26a67"; // learner arc start — a touch redder than the dot
  const LINK_COLOR = "#26bcae"; // turquoise — learner connections

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
    svg.append("defs");
    return svg;
  }

  // A per-arc gradient aligned to the real endpoints: home end = pink ("you"),
  // partner end = turquoise ("the connection"). Returns the gradient's url(#id).
  let gradSeq = 0;
  function arcStroke(svg, home, target) {
    const id = `arcGrad${++gradSeq}`;
    const g = svg
      .select("defs")
      .append("linearGradient")
      .attr("id", id)
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", home[0])
      .attr("y1", home[1])
      .attr("x2", target[0])
      .attr("y2", target[1]);
    g.append("stop").attr("offset", "0%").attr("stop-color", ARC_HOME);
    g.append("stop").attr("offset", "100%").attr("stop-color", LINK_COLOR);
    return `url(#${id})`;
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

  // Home ("you are here") marker: two staggered radar ripples behind a
  // throbbing solid dot.
  function addHomeMarker(layer, x, y) {
    layer
      .append("circle")
      .attr("cx", x)
      .attr("cy", y)
      .attr("r", 8)
      .attr("class", "conn-home-pulse");
    layer
      .append("circle")
      .attr("cx", x)
      .attr("cy", y)
      .attr("r", 8)
      .attr("class", "conn-home-pulse conn-home-pulse-2");
    layer
      .append("circle")
      .attr("cx", x)
      .attr("cy", y)
      .attr("r", 7)
      .attr("class", "conn-home-dot");
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

    // Merge partner cities that land too close together on screen (Google-Maps
    // style clustering) so dense metros (CA / TX / NYC area) stay clickable.
    const CLUSTER_PX = 26;
    const clusters = [];
    cities.forEach((c) => {
      let best = null;
      let bestD = CLUSTER_PX;
      for (const cl of clusters) {
        const d = Math.hypot(cl.x - c.xy[0], cl.y - c.xy[1]);
        if (d < bestD) {
          bestD = d;
          best = cl;
        }
      }
      if (best) {
        best.members.push(c);
        best.sum += c.count;
        best.sx += c.xy[0];
        best.sy += c.xy[1];
        best.x = best.sx / best.members.length;
        best.y = best.sy / best.members.length;
      } else {
        clusters.push({
          members: [c],
          sum: c.count,
          sx: c.xy[0],
          sy: c.xy[1],
          x: c.xy[0],
          y: c.xy[1],
        });
      }
    });

    const scale = d3
      .scaleSqrt()
      .domain([0, Math.max(1, d3.max(clusters, (cl) => cl.sum) || 1)])
      .range([6, 16]);
    const arcLayer = svg.append("g").attr("class", "conn-arcs");
    const dotLayer = svg.append("g").attr("class", "conn-dots");
    const arcPaths = [];

    // One arc from the learner's home city to each cluster.
    if (hubXY) {
      clusters.forEach((cl) => {
        if (Math.hypot(cl.x - hubXY[0], cl.y - hubXY[1]) < 1) return;
        const p = arcLayer
          .append("path")
          .attr("class", "conn-arc")
          .attr("stroke", arcStroke(svg, hubXY, [cl.x, cl.y]))
          .attr("d", arcPath(hubXY, [cl.x, cl.y]))
          .node();
        arcPaths.push(p);
      });
    }

    // Origin country shown as a separate corner card with its flag (off the map).
    if (profile.originCountry) {
      const card = document.createElement("div");
      card.className = "connection-origin-card";
      card.innerHTML = `<span class="origin-line"><span class="origin-flag" aria-hidden="true">${flagEmoji(
        profile.originCountry
      )}</span><span>From <strong>${profile.originCountry}</strong></span></span>`;
      container.appendChild(card);
    }

    // Cluster dots. Hover shows the list of cities inside the cluster.
    const tip = tooltip();
    const clusterTip = (cl) => {
      const lines = cl.members
        .slice()
        .sort((a, b) => b.count - a.count)
        .map((m) => `${m.city}, ${m.state} · ${m.count}`);
      if (cl.members.length === 1) {
        const m = cl.members[0];
        return `<strong>${m.city}, ${m.state}</strong><span>${m.count} partner${
          m.count === 1 ? "" : "s"
        }</span>`;
      }
      const shown = lines.slice(0, 10);
      const more = lines.length - shown.length;
      return (
        `<strong>${cl.members.length} cities · ${cl.sum} partners</strong>` +
        shown.map((l) => `<span>${l}</span>`).join("") +
        (more > 0 ? `<span>+${more} more</span>` : "")
      );
    };

    const clusterG = dotLayer
      .selectAll("g.conn-cluster")
      .data(clusters)
      .enter()
      .append("g")
      .attr("class", "conn-cluster")
      .attr("transform", (cl) => `translate(${cl.x},${cl.y})`)
      .style("cursor", "pointer")
      .on("mouseover", function (event, cl) {
        d3.select(this).select("circle").attr("r", scale(cl.sum) + 3).attr("fill", "#091146");
        d3.select(this).raise();
        tip
          .html(clusterTip(cl))
          .style("opacity", 1)
          .style("left", event.pageX + 12 + "px")
          .style("top", event.pageY - 12 + "px");
      })
      .on("mousemove", function (event) {
        tip
          .style("left", event.pageX + 12 + "px")
          .style("top", event.pageY - 12 + "px");
      })
      .on("mouseout", function (event, cl) {
        d3.select(this).select("circle").attr("r", scale(cl.sum)).attr("fill", null);
        tip.style("opacity", 0);
      });

    clusterG
      .append("circle")
      .attr("r", (cl) => scale(cl.sum))
      .attr("class", "conn-place-dot");
    clusterG
      .filter((cl) => cl.members.length > 1)
      .append("text")
      .attr("class", "conn-cluster-count")
      .attr("dy", "0.32em")
      .text((cl) => cl.members.length);

    // Map every city (incl. those merged into a cluster) to its cluster dot.
    clusterG.each(function (cl) {
      const circle = this.querySelector("circle");
      cl.members.forEach((m) => {
        dotByKey[chipKey(m.city, m.state)] = {
          circle,
          raiseNode: this,
          baseR: scale(cl.sum),
        };
      });
    });

    // Home hub marker + the learner's current-city label (the only map label).
    if (hubXY) {
      addHomeMarker(dotLayer, hubXY[0], hubXY[1]);
      if (profile.homeCity && profile.homeCity.city) {
        dotLayer
          .append("text")
          .attr("x", hubXY[0])
          .attr("y", hubXY[1] - 12)
          .attr("class", "conn-place-label")
          .text(profile.homeCity.city);
      }
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
      `World map showing countries & regions ${profile.firstName} connected with`
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
      // Brand turquoise -> vivid-red gradient (consistent with the rest of the
      // page); keeps the most-connected countries visually "hot".
      const brandId = `connArcBrand${++gradSeq}`;
      const bg = svg
        .select("defs")
        .append("linearGradient")
        .attr("id", brandId)
        .attr("x1", "0%")
        .attr("x2", "100%");
      bg.append("stop").attr("offset", "0%").attr("stop-color", "#26bcae");
      bg.append("stop").attr("offset", "100%").attr("stop-color", "#f0514e");
      const brandStroke = `url(#${brandId})`;
      targets.forEach((t) => {
        const p = arcLayer
          .append("path")
          .attr("class", "conn-arc")
          .attr("stroke", brandStroke)
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

    dots.each(function (t) {
      dotByKey[String(t.country).toLowerCase()] = {
        circle: this,
        raiseNode: this,
        baseR: scale(t.count),
      };
    });

    if (hubXY) {
      addHomeMarker(dotLayer, hubXY[0], hubXY[1]);
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
    const TOP = 12;
    const rows =
      profile.role === "volunteer"
        ? (profile.partnerCountries || [])
            .slice()
            .sort((a, b) => b.count - a.count)
            .map((p) => ({
              label: `${p.country} · ${p.count}`,
              key: String(p.country).toLowerCase(),
            }))
        : (profile.partnerCities || [])
            .slice()
            .sort((a, b) => b.count - a.count)
            .map((c) => ({
              label: `${c.city}, ${c.state} · ${c.count}`,
              key: chipKey(c.city, c.state),
            }));
    const shown = rows.slice(0, TOP);
    const more = rows.length - shown.length;
    list.innerHTML =
      shown
        .map(
          (r) =>
            `<span data-dot-key="${r.key.replace(/"/g, "&quot;")}">${
              r.label
            }</span>`
        )
        .join("") +
      (more > 0 ? `<span class="country-more">+${more} more</span>` : "");

    // Hover a chip -> pop the matching map dot.
    list.querySelectorAll("span[data-dot-key]").forEach((chip) => {
      const key = chip.getAttribute("data-dot-key");
      chip.addEventListener("mouseenter", () => popDot(dotByKey[key], true));
      chip.addEventListener("mouseleave", () => popDot(dotByKey[key], false));
    });
  }

  let activeProfile = null;

  // Links each country-list chip to its map dot, so hovering a chip pops the
  // matching dot. Rebuilt on every render (map renders before the chip list).
  let dotByKey = {};
  const chipKey = (city, state) => `${city}|${state}`.toLowerCase();

  function popDot(entry, on) {
    if (!entry || !entry.circle || typeof d3 === "undefined") return;
    const circle = d3.select(entry.circle);
    circle.interrupt();
    if (on) {
      if (entry.raiseNode) d3.select(entry.raiseNode).raise();
      circle
        .classed("conn-dot-active", true)
        .transition()
        .duration(380)
        .ease(d3.easeBackOut.overshoot(2.6))
        .attr("r", entry.baseR * 1.8);
    } else {
      circle
        .classed("conn-dot-active", false)
        .transition()
        .duration(220)
        .ease(d3.easeCubicOut)
        .attr("r", entry.baseR);
    }
  }

  function render(profile) {
    if (!profile) return;
    activeProfile = profile;
    dotByKey = {};
    const container = document.getElementById("connection-map");
    if (!container || typeof d3 === "undefined") return;
    container.innerHTML = "";

    const title = document.getElementById("connection-title");
    const lede = document.getElementById("connection-lede");
    if (profile.role === "volunteer") {
      if (title) title.textContent = "Conversations across the world";
      if (lede)
        lede.innerHTML = `${profile.firstName} connected with learners from <span class="conn-stat">${
          (profile.partnerCountries || []).length
        }</span> countries &amp; regions around the globe.`;
      renderVolunteer(container, profile);
    } else {
      if (title) title.textContent = "Conversations across the country";
      if (lede)
        lede.innerHTML = `From ${profile.originCountry}, ${
          profile.firstName
        } practiced with partners across <span class="conn-stat">${
          (profile.partnerCities || []).length
        }</span> US cities.`;
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
