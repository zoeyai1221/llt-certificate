const profiles = {
  learner: {
    firstName: "Maria",
    fullName: "Maria Rodriguez",
    title: "Certificate of Achievement",
    sessions: 18,
    hours: 27,
    countries: 12,
    places: ["Mexico", "India", "United States", "Kenya", "Philippines"],
    summary:
      "Your commitment helped build a welcoming space for practice, confidence, and connection.",
    certificate:
      "In recognition of completing 18 English Conversation sessions, totaling 27 hours of participation during the 2025-2026 program year.",
  },
  volunteer: {
    firstName: "Sarah",
    fullName: "Sarah Chen",
    title: "Certificate of Appreciation",
    sessions: 24,
    hours: 36,
    countries: 15,
    places: ["United States", "Afghanistan", "Brazil", "Ukraine", "Vietnam"],
    summary:
      "Your service created space for learners to practice English, build confidence, and feel welcomed.",
    certificate:
      "In appreciation of 24 volunteer conversation sessions, contributing 36 hours of service to support English learners during the 2025-2026 program year.",
  },
};

const metrics = document.querySelectorAll(".metric strong");
const lines = document.querySelectorAll("[data-line]");
const toast = document.querySelector("#toast");
const scrollCue = document.querySelector("#scroll-cue");
let currentProfileKey = "learner";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function animateCount(element, value) {
  const duration = 850;
  const startedAt = performance.now();

  function tick(now) {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(value * eased);

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

function drawConnections() {
  lines.forEach((line, index) => {
    line.classList.remove("draw");
    window.setTimeout(() => line.classList.add("draw"), 140 * index);
  });
}

function renderProfile(profileKey) {
  currentProfileKey = profileKey;
  const profile = profiles[profileKey];

  document.querySelector("#person-name").textContent = profile.firstName;
  document.querySelector("#summary-text").textContent = profile.summary;
  document.querySelector("#certificate-name").textContent = profile.fullName;
  document.querySelector(".certificate-kicker").textContent = profile.title;
  document.querySelector("#certificate-body").textContent = profile.certificate;

  const values = [profile.sessions, profile.hours, profile.countries];
  metrics.forEach((metric, index) => animateCount(metric, values[index]));

  document.querySelector("#country-list").innerHTML = profile.places
    .map((place) => `<span>${place}</span>`)
    .join("");

  drawConnections();
}

document.querySelector("#download-button").addEventListener("click", () => {
  const profile = profiles[currentProfileKey];
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
  <rect width="1200" height="1500" fill="#fffdf8"/>
  <rect x="80" y="80" width="1040" height="1340" fill="#fff8eb" stroke="#c89b3c" stroke-width="6"/>
  <rect x="120" y="120" width="960" height="1260" fill="none" stroke="#c89b3c" stroke-width="3"/>
  <text x="600" y="285" text-anchor="middle" fill="#8a4f5e" font-family="Georgia, serif" font-size="38" font-weight="700">${escapeXml(profile.title)}</text>
  <text x="600" y="520" text-anchor="middle" fill="#214e45" font-family="Georgia, serif" font-size="86" font-weight="700">${escapeXml(profile.fullName)}</text>
  <foreignObject x="235" y="610" width="730" height="260">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; color: #65716d; font-size: 34px; line-height: 1.55; text-align: center;">
      ${escapeXml(profile.certificate)}
    </div>
  </foreignObject>
  <circle cx="600" cy="930" r="88" fill="none" stroke="#c89b3c" stroke-width="6"/>
  <text x="600" y="947" text-anchor="middle" fill="#c89b3c" font-family="Georgia, serif" font-size="44" font-weight="700">LLT</text>
  <line x1="200" y1="1215" x2="460" y2="1215" stroke="#214e45" stroke-width="2"/>
  <line x1="740" y1="1215" x2="1000" y2="1215" stroke="#214e45" stroke-width="2"/>
  <text x="330" y="1265" text-anchor="middle" fill="#65716d" font-family="Arial, sans-serif" font-size="24">Founder Signature</text>
  <text x="870" y="1265" text-anchor="middle" fill="#65716d" font-family="Arial, sans-serif" font-size="24">Program Year 2025-2026</text>
</svg>`;

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${profile.fullName.toLowerCase().replaceAll(" ", "-")}-llt-certificate.svg`;
  link.click();
  URL.revokeObjectURL(url);

  toast.textContent = "Certificate downloaded";
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1700);
});

function scrollToMore() {
  const target = document.querySelector("#impact-summary");
  const offset = target.getBoundingClientRect().top + window.scrollY - 24;
  window.scrollTo({ top: offset, behavior: "smooth" });
}

window.scrollToMore = scrollToMore;
scrollCue.addEventListener("click", scrollToMore);

function updateScrollCue() {
  scrollCue.classList.toggle("hidden", window.scrollY > 90);
}

window.addEventListener("scroll", updateScrollCue, { passive: true });
updateScrollCue();

const requestedProfile = new URLSearchParams(window.location.search).get("profile");
renderProfile(profiles[requestedProfile] ? requestedProfile : "learner");
