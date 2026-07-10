/* Interactive learner globe — adapted from zoeyai.github.io Globe.tsx (SolidJS + D3)
   to plain browser JS for the certificate demo. Colors each country by how many
   LLT learners come from there (turquoise -> vivid red, brand palette). */
(function () {
  function init() {
    const container = document.getElementById("globe-map");
    if (!container || typeof d3 === "undefined" || !window.LLT_WORLD) return;

    const counts = window.LLT_COUNTRY_COUNTS || {};
    const totals = window.LLT_COUNTRY_TOTALS || { distinct: 0, learners: 0 };
    const features = window.LLT_WORLD.features;

    // --- brand colours ---
    const OCEAN = "#eef4f6";
    const OCEAN_STROKE = "rgba(9, 17, 70, 0.25)";
    const EMPTY_LAND = "#ffffff";
    const COUNTRY_STROKE = "rgba(9, 17, 70, 0.28)";
    const maxCount = Math.max(1, d3.max(Object.values(counts)) || 1);
    // sqrt scale keeps the long tail of small counts visible
    const color = d3
      .scaleSequential()
      .domain([0, Math.sqrt(maxCount)])
      .interpolator(d3.interpolateRgb("#9fe3dc", "#f0514e"));

    const fillFor = (name) => {
      const c = counts[name];
      return c ? color(Math.sqrt(c)) : EMPTY_LAND;
    };

    // --- populate the summary numbers ---
    const setNum = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value.toLocaleString();
    };
    setNum("globe-country-count", totals.distinct);
    setNum("globe-learner-count", totals.learners);

    // --- sizing ---
    const width = container.clientWidth || 640;
    const height = Math.min(520, Math.round(width * 0.82));
    const sensitivity = 75;

    const projection = d3
      .geoOrthographic()
      .scale(Math.min(width, height) / 2 - 8)
      .center([0, 0])
      .rotate([0, -20])
      .translate([width / 2, height / 2]);

    const initialScale = projection.scale();
    const pathGenerator = d3.geoPath().projection(projection);

    const svg = d3
      .select(container)
      .append("svg")
      .attr("width", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr("aria-label", "Rotating globe highlighting learner countries");

    // ocean sphere
    svg
      .append("circle")
      .attr("fill", OCEAN)
      .attr("stroke", OCEAN_STROKE)
      .attr("stroke-width", 0.6)
      .attr("cx", width / 2)
      .attr("cy", height / 2)
      .attr("r", initialScale);

    const map = svg.append("g");

    const paths = map
      .append("g")
      .attr("class", "globe-countries")
      .selectAll("path")
      .data(features)
      .enter()
      .append("path")
      .attr("d", (d) => pathGenerator(d))
      .style("fill", (d) => fillFor(d.properties.name))
      .style("stroke", COUNTRY_STROKE)
      .style("stroke-width", 0.3)
      .style("opacity", 0.92);

    // --- tooltip ---
    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "globe-tooltip");

    paths
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        const name = d.properties.name;
        const c = counts[name];
        const el = d3.select(this);
        if (!c) el.style("fill", "rgba(38, 188, 174, 0.28)");
        el.style("opacity", 1).style("stroke-width", 0.7);
        tooltip
          .html(
            c
              ? `<strong>${name}</strong><span>${c.toLocaleString()} learner${c === 1 ? "" : "s"}</span>`
              : `<strong>${name}</strong><span>No learners yet</span>`
          )
          .style("opacity", 1)
          .style("left", event.pageX + 12 + "px")
          .style("top", event.pageY - 12 + "px");
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", event.pageX + 12 + "px")
          .style("top", event.pageY - 12 + "px");
      })
      .on("mouseout", function (event, d) {
        d3.select(this)
          .style("fill", fillFor(d.properties.name))
          .style("opacity", 0.92)
          .style("stroke-width", 0.3);
        tooltip.style("opacity", 0);
      });

    // --- interaction: pause on hover, drag to rotate ---
    let isPaused = false;
    let previousMousePosition = null;

    const updatePaths = () =>
      svg.selectAll("g path").attr("d", (d) => pathGenerator(d));

    svg
      .on("mouseenter", () => (isPaused = true))
      .on("mouseleave", () => (isPaused = false))
      .call(
        d3
          .drag()
          .on("start", (event) => {
            isPaused = true;
            previousMousePosition = [event.x, event.y];
          })
          .on("drag", (event) => {
            if (!previousMousePosition) return;
            const rotate = projection.rotate();
            const dx = event.x - previousMousePosition[0];
            const dy = event.y - previousMousePosition[1];
            const k = sensitivity / projection.scale();
            projection.rotate([
              rotate[0] + dx * k,
              Math.max(-90, Math.min(90, rotate[1] - dy * k)),
            ]);
            previousMousePosition = [event.x, event.y];
            updatePaths();
          })
          .on("end", () => (previousMousePosition = null))
      );

    // --- auto rotation ---
    d3.timer(() => {
      if (isPaused) return;
      const rotate = projection.rotate();
      const k = sensitivity / projection.scale();
      projection.rotate([rotate[0] - 1 * k, rotate[1]]);
      updatePaths();
    }, 200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
