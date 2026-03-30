<script>
  import { onMount } from "svelte";
  import maplibregl from "maplibre-gl";
  import Papa from "papaparse";
  import jsPDF from "jspdf";
  import html2canvas from "html2canvas";
  import "maplibre-gl/dist/maplibre-gl.css";

  // --- STATE ---
  let mapContainer = $state();
  let map = $state();
  let allPlaces = $state([]);
  let markers = [];
  let visualMode = $state("domein");

  // Nieuwe state voor actieve pop-up en lijn
  let selectedPlace = $state(null);
  let activeMarkerElement = $state(null);
  let linePath = $state("");

  function handleVisualToggle(mode) {
    visualMode = visualMode === mode ? "default" : mode;
  }

  const DOMEIN_COLORS = {
    Werken: "#D4D4D4", // Iets donkerder grijs gemaakt voor leesbaarheid op wit
    "Makers en Werkplaatsen": "#A1A1A1", // Iets donkerder grijs gemaakt
    Cultuur: "#5d69fb",
    Groen: "#2D6A4F", // Donkerder groen voor icoon-contrast op wit
    Voedsel: "#E76F51", // Warmer/donkerder oranje voor icoon-contrast
    Circulair: "#6C5B7B", // Iets donkerder paars/blauw
    Energie: "#FFB703", // Donkerder geel/oranje
    Klimaat: "#4EA8DE", // Iets donkerder blauw
    "Zorg en Welzijn": "#E63946", // Iets donkerder rood
    Educatie: "#B5A900", // Donkerder okergeel
    Wonen: "#D81B60", // Donkerder roze
    default: "#5d69fb",
  };

  const DOMEIN_ICONS = {
    Werken: "ph-briefcase",
    "Makers en Werkplaatsen": "ph-hammer",
    Cultuur: "ph-paint-brush-broad",
    Groen: "ph-tree",
    Voedsel: "ph-fork-knife",
    Circulair: "ph-recycle",
    Energie: "ph-lightning",
    Klimaat: "ph-cloud-sun",
    "Zorg en Welzijn": "ph-heartbeat",
    Educatie: "ph-graduation-cap",
    Wonen: "ph-house",
    default: "ph-map-pin",
  };

  const GEBIED_COLORS = {
    "Bospolder-Tussendijken": "#D68C7A",
    "Keilekwartier/M4H": "#7D9BB2",
    Delfshaven: "#9DB5A2",
    Keilewerf: "#4A707A",
    Midelland: "#E2B07E",
    "Nieuw-Mathenesse": "#5E7D91",
    "Nieuwe Westen": "#C78D9B",
    "Oud Mathenesse": "#A3A380",
    "Oude Westen": "#D8C3A5",
    Schiehaven: "#8E8D8A",
    Schiemond: "#B8A2CF",
    default: "#5d69fb",
  };

  // Bounding box for Rotterdam: [west, south, east, north]
  const ROTTERDAM_BBOX = [3.9, 51.8, 4.8, 52.0];

  let openSections = $state({
    info: false,
    gebied: false,
    domein: false,
    export: false,
  });
  function toggleSection(name) {
    openSections[name] = !openSections[name];
  }

  let selectedGebieden = $state([]);
  let selectedDomeinen = $state([]);

  let uniqueGebieden = $derived(
    [...new Set(allPlaces.map((p) => p.gebied))].filter(Boolean).sort(),
  );
  let uniqueDomeinen = $derived(
    [
      ...new Set(
        allPlaces.flatMap((p) => p.domeinen.split(";").map((d) => d.trim())),
      ),
    ]
      .filter(Boolean)
      .sort(),
  );

  let filteredPlaces = $derived(
    allPlaces.filter((p) => {
      const matchesGebied =
        selectedGebieden.length === 0 || selectedGebieden.includes(p.gebied);
      const placeDomeinen = p.domeinen.split(";").map((d) => d.trim());
      const matchesDomein =
        selectedDomeinen.length === 0 ||
        // Require that the place contains ALL selected domeinen (AND semantics)
        selectedDomeinen.every((d) => placeDomeinen.includes(d));
      return matchesGebied && matchesDomein;
    }),
  );

  onMount(async () => {
    const response = await fetch("initiatieven.csv");
    const csvString = await response.text();
    Papa.parse(csvString, {
      header: true,
      dynamicTyping: true,
      complete: (results) => {
        allPlaces = results.data.filter((p) => p.latitude && p.longitude);
        initMap();
      },
    });
  });

  function initMap() {
    map = new maplibregl.Map({
      container: mapContainer,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [4.47, 51.915],
      zoom: 12.5,
      attributionControl: false,
      fadeDuration: 0,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left",
    );
    map.addControl(new maplibregl.ScaleControl(), "bottom-right");
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false, showZoom: true }),
      "bottom-right",
    );

    map.on("move", updateLine);
  }

  function updateLine() {
    if (!selectedPlace || !map) {
      linePath = "";
      return;
    }

    const pos = map.project([selectedPlace.longitude, selectedPlace.latitude]);
    const startX = pos.x;
    const startY = pos.y;

    const endX = window.innerWidth - 300 - 20;
    const endY = 20 + 100;

    linePath = `M ${startX} ${startY} L ${endX} ${endY}`;
  }

  function closePopup() {
    if (activeMarkerElement)
      activeMarkerElement.classList.remove("active-glow");
    selectedPlace = null;
    activeMarkerElement = null;
    linePath = "";
  }

  $effect(() => {
    if (!map) return;
    markers.forEach((m) => m.remove());
    markers = [];

    filteredPlaces.forEach((place) => {
      const el = document.createElement("div");
      el.className = "air-marker";

      const domeinList = place.domeinen.split(";").map((d) => d.trim());

      // --- NIEUW: Alle icoontjes van de domeinen verzamelen en kleuren ---
      let iconsHtml = "";

      domeinList.forEach((d) => {
        const iconClass = DOMEIN_ICONS[d] || DOMEIN_ICONS.default;
        const iconColor =
          visualMode === "domein"
            ? DOMEIN_COLORS[d] || DOMEIN_COLORS.default
            : "#1a1a1a";
        iconsHtml += `<i class="ph ${iconClass}" style="color: ${iconColor};"></i>`;
      });

      el.innerHTML = iconsHtml;

      // De bolletjes zijn nu ALTIJD wit (of meekleurend met gebied)
      if (visualMode === "gebied") {
        const gebiedKey = place.gebied || "default";
        el.style.background = GEBIED_COLORS[gebiedKey] || GEBIED_COLORS.default;
        // Bij gebiedsweergave maken we de iconen binnenin even wit voor het contrast
        el.querySelectorAll("i").forEach((i) => (i.style.color = "#ffffff"));
      } else {
        el.style.background = "#ffffff";
      }

      el.addEventListener("click", (e) => {
        e.stopPropagation();

        if (activeMarkerElement)
          activeMarkerElement.classList.remove("active-glow");

        selectedPlace = place;
        activeMarkerElement = el;
        el.classList.add("active-glow");

        map.flyTo({
          center: [place.longitude, place.latitude],
          essential: true,
          speed: 0.1,
          curve: 0,
        });
      });

      const m = new maplibregl.Marker({ element: el })
        .setLngLat([place.longitude, place.latitude])
        .addTo(map);
      markers.push(m);
    });
  });

  function toggleFilter(list, value) {
    if (list.includes(value)) return list.filter((i) => i !== value);
    return [...list, value];
  }

  async function exportBasemapToPDF() {
    // Create a temporary container for the export map
    const tempContainer = document.createElement("div");
    tempContainer.style.width = "800px";
    tempContainer.style.height = "600px";
    tempContainer.style.position = "absolute";
    tempContainer.style.left = "-9999px";
    document.body.appendChild(tempContainer);

    // Create a new map instance with the basemap only
    const exportMap = new maplibregl.Map({
      container: tempContainer,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      bounds: ROTTERDAM_BBOX,
      attributionControl: false,
      fadeDuration: 0,
    });

    // Wait for the map to load
    await new Promise((resolve) => {
      exportMap.on("load", resolve);
    });

    // Use html2canvas to capture the map
    const canvas = await html2canvas(tempContainer, {
      useCORS: true,
      allowTaint: false,
      width: 800,
      height: 600,
    });

    // Create PDF
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "px",
      format: [800, 600],
    });

    const imgData = canvas.toDataURL("image/png");
    pdf.addImage(imgData, "PNG", 0, 0, 800, 600);

    // Download the PDF
    pdf.save("rotterdam-basemap.pdf");

    // Clean up
    exportMap.remove();
    document.body.removeChild(tempContainer);
  }
</script>

<div class="layout" onclick={closePopup} role="presentation">
  <aside
    class="sidebar"
    onclick={(e) => e.stopPropagation()}
    role="presentation"
  >
    <div class="brand">Initiatievenkaart</div>

    <div class="accordion">
      <button class="accordion-header" onclick={() => toggleSection("info")}>
        <span>Informatie</span>
        <span class="icon">{openSections.info ? "−" : "+"}</span>
      </button>
      {#if openSections.info}
        <div class="accordion-content">
          <p>Informatie over de initiatieven in Rotterdam.</p>
        </div>
      {/if}
    </div>

    <div class="accordion">
      <button class="accordion-header" onclick={() => toggleSection("domein")}>
        <span>Domein</span>
        <span class="icon">{openSections.domein ? "−" : "+"}</span>
      </button>
      {#if openSections.domein}
        <div class="accordion-content">
          <!-- <div class="visual-toggle-container">
            <span class="toggle-text">Toon kleuren per domein</span>
            <label class="switch">
              <input
                type="checkbox"
                checked={visualMode === "domein"}
                onchange={() => handleVisualToggle("domein")}
              />
              <span class="slider"></span>
            </label>
          </div>
          <hr class="separator" /> -->
          {#each uniqueDomeinen as domein}
            <label class="filter-item">
              <input
                type="checkbox"
                checked={selectedDomeinen.includes(domein)}
                onchange={() =>
                  (selectedDomeinen = toggleFilter(selectedDomeinen, domein))}
              />

              <span class="filter-text">{domein}</span>
              <i
                class="ph {DOMEIN_ICONS[domein] ||
                  DOMEIN_ICONS.default} sidebar-icon"
                style="color: {DOMEIN_COLORS[domein] || DOMEIN_COLORS.default}"
              ></i>
            </label>
          {/each}
        </div>
      {/if}
    </div>

    <div class="accordion">
      <button class="accordion-header" onclick={() => toggleSection("gebied")}>
        <span>Gebied</span>
        <span class="icon">{openSections.gebied ? "−" : "+"}</span>
      </button>
      {#if openSections.gebied}
        <div class="accordion-content">
          <div class="visual-toggle-container">
            <span class="toggle-text">Toon kleuren per gebied</span>
            <label class="switch">
              <input
                type="checkbox"
                checked={visualMode === "gebied"}
                onchange={() => handleVisualToggle("gebied")}
              />
              <span class="slider"></span>
            </label>
          </div>
          <hr class="separator" />
          {#each uniqueGebieden as gebied}
            <label class="filter-item">
              <input
                type="checkbox"
                checked={selectedGebieden.includes(gebied)}
                onchange={() =>
                  (selectedGebieden = toggleFilter(selectedGebieden, gebied))}
              />
              <span class="filter-text">{gebied}</span>
              <span
                class="color-swatch"
                style="background-color: {GEBIED_COLORS[gebied] ||
                  GEBIED_COLORS.default}"
              ></span>
            </label>
          {/each}
        </div>
      {/if}
    </div>

    <div class="accordion">
      <button class="accordion-header" onclick={() => toggleSection("export")}>
        <span>Export</span>
        <span class="icon">{openSections.export ? "−" : "+"}</span>
      </button>
      {#if openSections.export}
        <div class="accordion-content">
          <button onclick={exportBasemapToPDF} class="export-btn">
            Export Basemap to PDF
          </button>
          <p>Exports the Rotterdam basemap (without markers) to a PDF file.</p>
        </div>
      {/if}
    </div>

    <div class="stats">
      <strong>{filteredPlaces.length}</strong> initiatieven getoond
    </div>
  </aside>

  <div class="map-container" bind:this={mapContainer}>
    {#if selectedPlace}
      <div
        class="fixed-air-popup"
        onclick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div class="popup-top-bar">
          <h3 class="popup-title">{selectedPlace.name}</h3>
          <button class="close-btn" onclick={closePopup} aria-label="Sluiten"
            >×</button
          >
        </div>

        <div class="air-popup">
          <div class="popup-info-row">
            <span class="label">Locatie / Gebied</span>
            <span class="popup-value"
              >{selectedPlace.gebied || "Rotterdam"}</span
            >
          </div>

          <div class="popup-info-row">
            <span class="label">Domeinen</span>
            <div class="popup-tags">
              {#each selectedPlace.domeinen.split(";") as d}
                <span
                  class="p-tag"
                  style="background-color: {DOMEIN_COLORS[d.trim()] ||
                    DOMEIN_COLORS.default}"
                >
                  {d.trim()}
                </span>
              {/each}
            </div>
          </div>
          <!-- 
          <div class="popup-info-row">
            <span class="label">M4H Principes</span>
            <div class="popup-tags">
              {#each selectedPlace.m4h_principes.split(";") as d}
                <span
                  class="p-tag"
                  style="background-color: {DOMEIN_COLORS[d.trim()] ||
                    DOMEIN_COLORS.default}"
                >
                  {d.trim()}
                </span>
              {/each}
            </div>
          </div> -->

          {#if selectedPlace.website}
            <div class="popup-footer">
              <a href={selectedPlace.website} target="_blank" class="popup-link"
                >Bezoek website ↗</a
              >
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  :global(#app) {
    margin: 0 !important;
    padding: 0 !important;
    max-width: none !important;
  }

  .layout {
    display: flex;
    width: 100vw;
    height: 100vh;
    position: fixed;
    top: 0;
    left: 0;
  }

  .sidebar {
    width: 280px;
    height: 100%;
    background: #fdfaf0; /* Wit als basis voor een cleanere look */
    border-right: 1px solid rgba(0, 0, 0, 0.05);
    display: flex;
    flex-direction: column;
    z-index: 10;
    overflow-y: auto;
    scrollbar-gutter: stable;
    font-family: "Helvetica", Arial, sans-serif;
  }

  .brand {
    padding: 24px 20px;
    font-weight: 900;
    font-size: 1.4rem;
    letter-spacing: -0.5px;
    color: #5d69fb;
    background-color: #fdfaf0; /* Matcht nu met de paarse balk van de popup! */
    text-align: center;
  }

  .accordion {
    border-bottom: 1px solid #e0ddd5;
    background: #fdfaf0;
    transition: background-color 0.2s ease;
  }

  /* Gekleurde achtergrond als een sectie open staat */
  .accordion:has(.accordion-content) {
    background: #fdfaf0; /* Matcht met de lichte hover-kleur van de popup */
  }

  .accordion-header {
    width: 100%;
    padding: 16px 20px;
    background: none;
    border: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    font-family: inherit;
    font-weight: 800;
    text-transform: uppercase;
    font-size: 0.8rem;
    letter-spacing: 0.05rem;
    color: #5d69fb;
    text-align: left;
  }

  .accordion-header:hover {
    background: rgba(132, 80, 255, 0.05);
  }

  .accordion-header .icon {
    font-size: 1.1rem;
    font-weight: normal;
    color: #999;
  }

  .accordion-content {
    padding: 0 20px 20px 20px;
    text-align: left;
  }

  .accordion-content p {
    font-size: 0.8rem;
    color: #666;
    line-height: 1.4;
    margin: 0;
  }

  .filter-item {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 10px 0;
    font-size: 0.8rem;
    color: #333;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
  }

  .export-btn {
    background-color: #5d69fb;
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.8rem;
    width: 100%;
    margin-bottom: 10px;
  }

  .export-btn:hover {
    background-color: #4a5cfb;
  }

  /* Subtiele hiërarchie-labeling binnen de sidebar content */
  .filter-text {
    flex-grow: 1;
    text-align: left;
  }

  .stats {
    margin-top: auto;
    padding: 16px 20px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.02rem;
    color: #999;
    font-weight: bold;
    background: #fdfaf0;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
  }

  .stats strong {
    color: #5d69fb;
    font-size: 0.85rem;
  }

  input[type="checkbox"] {
    accent-color: #5d69fb;
  }

  .visual-toggle-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
  }

  .toggle-text {
    font-size: 0.75rem;
    font-weight: bold;
    color: #666;
  }

  .switch {
    position: relative;
    display: inline-block;
    width: 34px;
    height: 20px;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #e0ddd5;
    transition: 0.4s;
    border-radius: 20px;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 14px;
    width: 14px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.4s;
    border-radius: 50%;
  }

  input:checked + .slider {
    background-color: #5d69fb;
  }

  input:checked + .slider:before {
    transform: translateX(14px);
  }

  .separator {
    border: 0;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
    margin: 12px 0;
  }

  .color-swatch {
    width: 12px;
    height: 12px;
    display: inline-block;
    border-radius: 3px; /* Matchend met de p-tags uit de popup */
    border: 1px solid rgba(0, 0, 0, 0.1);
  }

  .map-container {
    flex-grow: 1;
    height: 100%;
    position: relative;
  }

  /* GEFIXEERDE POP-UP RECHTSBOVEN */
  .fixed-air-popup {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 320px;
    background: #fffcf4;
    border-radius: 6px; /* Iets scherper voor een strakker effect bij het vierkant */
    box-shadow:
      0 10px 30px rgba(0, 0, 0, 0.1),
      5px 5px 0px rgba(132, 80, 255, 0.15);
    z-index: 2000;
    animation: popup-slide-in 0.3s cubic-bezier(0.1, 1, 0.1, 1);
    font-family: "Helvetica", Arial, sans-serif;
    text-align: left;
    overflow: hidden; /* Cruciaal: houdt de paarse balk binnen de border-radius */
    border: 1px solid rgba(0, 0, 0, 0.05);
  }

  /* Paarse bovenbalk met vaste hoogte */
  .popup-top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center; /* Centreert de knop verticaal ten opzichte van de balk */
    padding: 12px 16px;
    background-color: #5d69fb; /* AIR Paars */
    gap: 12px;

    /* Vaste hoogte: 2.8rem voor de tekst + 24px padding = ~68px hoog */
    /* Dit is hoog genoeg voor exact 2 regels tekst */
    min-height: 68px;
    box-sizing: border-box;
  }

  /* Titel met witte letters in de top bar */
  .popup-title {
    margin: 0;
    font-size: 1.1rem; /* Ietsje kleiner zodat 2 regels gegarandeerd passen */
    font-weight: 800;
    line-height: 1.2;
    color: #ffffff; /* Wit */
    flex-grow: 1;

    /* Zorgt dat de tekst netjes verdeeld wordt over max 2 regels */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Vierkante witte sluitknop (Perfect gecentreerd) */
  .close-btn {
    background: #ffffff;
    border: none;
    font-size: 22px; /* Iets groter kruisje vult het blokje mooier op */
    font-family: Arial, sans-serif; /* Arial heeft een heel symmetrisch kruisje */
    cursor: pointer;
    color: #5d69fb; /* Paars kruisje */
    width: 28px;
    height: 28px;

    /* Flexbox voor perfecte centrering in alle browsers */
    display: flex;
    align-items: center;
    justify-content: center;

    border-radius: 4px;
    transition: all 0.2s;
    padding: 0;
    flex-shrink: 0; /* Voorkomt dat het knopje platgedrukt wordt */

    /* Reset voor vreemde browser-lijnhéritages */
    line-height: 0;
  }

  .close-btn:hover {
    background-color: #fdfaf0;
    color: #1a1a1a;
  }

  .air-popup {
    padding: 16px;
  }

  .popup-info-row {
    margin-bottom: 14px;
  }

  .popup-info-row .label {
    font-weight: bold;
    color: #999;
    text-transform: uppercase;
    font-size: 0.65rem;
    letter-spacing: 0.02rem;
    display: block;
    margin-bottom: 4px;
  }

  .popup-value {
    font-size: 0.85rem;
    color: #333;
    font-weight: 500;
  }

  .popup-footer {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #eee;
  }

  @keyframes popup-slide-in {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  /* SIDEBAR KLEUREN */
  .color-swatch {
    width: 12px;
    height: 12px;
    display: inline-block;
    margin-left: auto;
    border: 1px solid rgba(0, 0, 0, 0.05);
  }
  .filter-text {
    flex-grow: 1;
    text-align: left;
  }

  /* TAGS EN LINKS */
  .p-tag {
    font-size: 9px;
    padding: 3px 6px;
    margin-right: 4px;
    margin-bottom: 4px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    text-transform: uppercase;
    font-weight: bold;
    color: #fdfaf0;
    display: inline-block;
    border-radius: 5px;
  }

  .popup-tags {
    display: flex;
    flex-wrap: wrap;
    margin-top: 8px;
  }

  .popup-link {
    display: inline-block;
    font-size: 11px;
    color: #333;
    text-decoration: none;
    border-bottom: 1px solid #5d69fb;
    padding-bottom: 2px;
    transition: all 0.2s;
  }
  .popup-link:hover {
    color: #5d69fb;
    background: #fdfaf0;
  }

  /* MARKERS EN GLOW EFFECT */
  :global(.air-marker) {
    min-width: 26px; /* Basisbreedte voor 1 icoon */
    height: 26px;
    border: 1px solid #4e56b0; /* Paarse omlijning maakt het witte rondje knallend */
    border-radius: 13px; /* Zorgt dat het een pilvorm wordt als er meer iconen bijkomen */
    cursor: pointer;
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
    background: #ffffff;

    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px; /* Ruimte tussen icoontjes */
    padding: 0 4px;
    box-sizing: border-box;
  }

  :global(.air-marker i) {
    font-size: 14px;
    line-height: 1;
  }

  :global(.air-marker:hover) {
    transform: scale(1.15); /* Subtiel groter maken ipv harde px-verandering */
    z-index: 1000;
  }

  /* Actieve marker */
  :global(.air-marker.active-glow) {
    z-index: 1001;
    border: 1.5px solid #5d69fb;
    box-shadow:
      0 0 0 3px #5d69fb33,
      0 0 15px 8px rgba(132, 80, 255, 0.15),
      0 2px 6px rgba(0, 0, 0, 0.2);
  }

  /* NIEUW: Icoontje in de sidebar */
  :global(.sidebar-icon) {
    font-size: 16px;
    width: 20px;
    text-align: center;
  }
</style>
