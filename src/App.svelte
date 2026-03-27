<script>
  import { onMount } from "svelte";
  import maplibregl from "maplibre-gl";
  import Papa from "papaparse";
  import "maplibre-gl/dist/maplibre-gl.css";

  // --- STATE ---
  let mapContainer = $state();
  let map = $state();
  let allPlaces = $state([]);
  let markers = [];
  let visualMode = $state("default");

  function handleVisualToggle(mode) {
    if (visualMode === mode) {
      visualMode = "default";
    } else {
      visualMode = mode;
    }
  }

  const DOMEIN_COLORS = {
    Werken: "#E5E5E5",
    "Makers en Werkplaatsen": "#D4D4D4",
    Cultuur: "#8450FF",
    Groen: "#CDEBC5",
    Voedsel: "#FFD6A5",
    Circulair: "#BDB2FF",
    Energie: "#CAFFBF",
    Klimaat: "#A0C4FF",
    "Zorg en Welzijn": "#FFADAD",
    Educatie: "#FDFFB6",
    Wonen: "#FFC6FF",
    default: "#eeeeee",
  };

  const GEBIED_COLORS = {
    "Bospolder-Tussendijken": "#D68C7A", // Zacht terracotta/baksteen
    "Keilekwartier/M4H": "#7D9BB2", // Staalblauw
    Delfshaven: "#9DB5A2", // Vergrijsd groen
    Keilewerf: "#4A707A", // Diep oceaanblauw
    Midelland: "#E2B07E", // Warm oker
    "Nieuw-Mathenesse": "#5E7D91", // Industrieel grijsblauw
    "Nieuwe Westen": "#C78D9B", // Oudroze
    "Oud Mathenesse": "#A3A380", // Olijfgrijs
    "Oude Westen": "#D8C3A5", // Zand/Beige
    Schiehaven: "#8E8D8A", // Beton-metallic
    Schiemond: "#B8A2CF", // Muted lavendel
    default: "#8450FF",
  };

  let openSections = $state({
    info: true,
    gebied: false,
    domein: true,
  });

  function toggleSection(name) {
    openSections[name] = !openSections[name];
  }

  // Filter States
  let selectedGebieden = $state([]);
  let selectedDomeinen = $state([]);

  // Get unique values for the UI
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

  // Filtered List
  let filteredPlaces = $derived(
    allPlaces.filter((p) => {
      const matchesGebied =
        selectedGebieden.length === 0 || selectedGebieden.includes(p.gebied);
      const placeDomeinen = p.domeinen.split(";").map((d) => d.trim());
      const matchesDomein =
        selectedDomeinen.length === 0 ||
        selectedDomeinen.some((d) => placeDomeinen.includes(d));
      return matchesGebied && matchesDomein;
    }),
  );

  // --- LOGIC ---
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
      center: [4.44, 51.915],
      zoom: 13,
      attributionControl: false,
    });

    // Add Attribution to the bottom LEFT instead
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left",
    );

    map.addControl(new maplibregl.ScaleControl(), "bottom-right");

    // Add Navigation: showZoom: true, showCompass: false
    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: false,
        showZoom: true,
      }),
      "bottom-right",
    );
  }

  $effect(() => {
    if (!map) return;
    markers.forEach((m) => m.remove());
    markers = [];

    filteredPlaces.forEach((place) => {
      const el = document.createElement("div");
      el.className = "air-marker";

      // --- DYNAMIC COLOR LOGIC ---
      if (visualMode === "domein") {
        // Pizza Slice Logic
        const domeinList = place.domeinen.split(";").map((d) => d.trim());
        const colors = domeinList.map(
          (d) => DOMEIN_COLORS[d] || DOMEIN_COLORS.default,
        );

        if (colors.length === 1) {
          el.style.background = colors[0];
        } else {
          const pieceSize = 100 / colors.length;
          const gradientString = colors
            .map(
              (color, i) =>
                `${color} ${i * pieceSize}% ${(i + 1) * pieceSize}%`,
            )
            .join(", ");
          el.style.background = `conic-gradient(${gradientString})`;
        }
      } else if (visualMode === "gebied") {
        // Single color based on Gebied
        const gebiedKey = place.gebied || "default";
        el.style.background = GEBIED_COLORS[gebiedKey] || GEBIED_COLORS.default;
      } else {
        // Default Mode: All markers AIR Purple
        el.style.background = "#8450FF";
      }

      const m = new maplibregl.Marker({ element: el })
        .setLngLat([place.longitude, place.latitude])
        .setPopup(
          new maplibregl.Popup({
            offset: 25,
            closeButton: false,
            className: "air-popup-animation",
          }).setHTML(`
            <div class="air-popup">
              <h3 class="popup-title">${place.name}</h3>
              <div class="popup-info-row"><span class="label">Gebied:</span> ${place.gebied || "Rotterdam"}</div>
              <div class="popup-info-row">
                <span class="label">Domein:</span>
                <div class="popup-tags">
                  ${place.domeinen
                    .split(";")
                    .map((d) => {
                      const color =
                        DOMEIN_COLORS[d.trim()] || DOMEIN_COLORS.default;
                      return `<span class="p-tag" style="background-color: ${color}">${d.trim()}</span>`;
                    })
                    .join("")}
                </div>
              </div>

              <div class="popup-info-row">
                <span class="label">M4H Principes:</span>
                <div class="popup-tags">
                  ${place.m4h_principes
                    .split(";")
                    .map((d) => {
                      const color =
                        DOMEIN_COLORS[d.trim()] || DOMEIN_COLORS.default;
                      return `<span class="p-tag" style="background-color: ${color}">${d.trim()}</span>`;
                    })
                    .join("")}
                </div>
              </div>
              ${place.website ? `<div class="popup-footer"><a href="${place.website}" target="_blank" class="popup-link">Website ↗</a></div>` : ""}
            </div>
          `),
        )
        .addTo(map);
      markers.push(m);
    });
  });

  function toggleFilter(list, value) {
    if (list.includes(value)) return list.filter((i) => i !== value);
    return [...list, value];
  }
</script>

<div class="layout">
  <aside class="sidebar">
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
          <div class="visual-toggle-container">
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
          <hr class="separator" />
          {#each uniqueDomeinen as domein}
            <label class="filter-item">
              <input
                type="checkbox"
                checked={selectedDomeinen.includes(domein)}
                onchange={() =>
                  (selectedDomeinen = toggleFilter(selectedDomeinen, domein))}
              />
              <span class="filter-text">{domein}</span>
              <span
                class="color-swatch"
                style="background-color: {DOMEIN_COLORS[domein] ||
                  DOMEIN_COLORS.default}"
              ></span>
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

    <div class="stats">
      <strong>{filteredPlaces.length}</strong> initiatieven getoond
    </div>
  </aside>
  <div class="map-container" bind:this={mapContainer}></div>
</div>

<style>
  :global(#app) {
    margin: 0 !important;
    padding: 0 !important;
    max-width: none !important; /* Vite often limits this to 1280px */
  }

  .layout {
    display: flex;
    width: 100vw;
    height: 100vh;
    position: fixed; /* Fixed is safer than flex for edge-to-edge */
    top: 0;
    left: 0;
  }

  .sidebar {
    width: 280px;
    height: 100%;
    background: #fffcf4;
    border-right: 1px solid #e0ddd5;
    display: flex;
    flex-direction: column;
    z-index: 10;

    /* FIX: Scrollbar aan de buitenkant zonder verspringen */
    overflow-y: auto;
    scrollbar-gutter: stable;
  }

  .brand {
    padding: 20px;
    font-weight: 900;
    font-size: 1.5rem;
    letter-spacing: -1px;
    color: #8450ff;
  }

  .accordion {
    border-bottom: 1px solid #eee;
  }

  .accordion-header {
    width: 100%;
    padding: 15px 20px;
    background: none;
    border: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    font-family: inherit;
    font-weight: bold;
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.05rem;
    color: #8450ff;
  }

  .accordion-header:hover {
    background: #8450ff10;
  }

  .accordion-content {
    padding: 0 20px 20px 20px;
    max-height: none;
  }

  .accordion-content p {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 8px 0;
    font-size: 0.8rem;
    color: #555;
    cursor: pointer;
    justify-content: flex-start;
    text-align: left;
  }

  .filter-item {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 8px 0;
    font-size: 0.8rem;
    color: #555;
    cursor: pointer;
    justify-content: flex-start;
    text-align: left;
  }

  .stats {
    margin-top: auto; /* Pushes to bottom */
    padding: 20px;
    font-size: 0.75rem;
    color: #888;
    background: #fdfaf0;
  }

  /* Custom Checkbox Color */
  input[type="checkbox"] {
    accent-color: #8450ff;
  }

  .visual-toggle-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
    margin-bottom: 5px;
  }

  .toggle-text {
    font-size: 0.75rem;
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
    background-color: #8450ff;
  }

  input:checked + .slider:before {
    transform: translateX(14px);
  }
  .separator {
    border: 0;
    border-top: 1px solid #eee;
    margin: 10px 0;
  }

  .map-container {
    flex-grow: 1;
    height: 100%;
  }

  :global(.maplibregl-popup-content) {
    padding: 0; /* We handle padding inside our div */
    border-radius: 0;
    border-top: 6px solid #8450ff;
    box-shadow: 10px 10px 0px rgba(132, 80, 255, 0.1); /* Architectural shadow */
    font-family: "Helvetica", Arial, sans-serif;
  }

  :global(.air-popup) {
    padding: 16px;
    max-width: 220px;
    text-align: left;
  }

  :global(.popup-header) {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #8450ff;
    font-weight: bold;
    margin-bottom: 8px;
  }

  :global(.popup-title) {
    margin: 0 0 15px 0;
    font-size: 1.2rem;
    font-weight: 900;
    line-height: 1.1;
    color: #1a1a1a;
    border-bottom: 1px solid #eee;
    padding-bottom: 10px;
  }

  :global(.popup-info-row) {
    font-size: 0.8rem;
    margin-bottom: 10px;
    color: #555;
  }

  :global(.popup-info-row .label) {
    font-weight: bold;
    color: #888;
    text-transform: uppercase;
    font-size: 0.7rem;
    display: block;
    margin-bottom: 3px;
  }

  :global(.popup-footer) {
    margin-top: 15px;
    padding-top: 10px;
    border-top: 1px dotted #ccc;
  }

  :global(.air-popup-animation .maplibregl-popup-content) {
    animation: popup-fade-in 0.3s ease-out;
  }

  @keyframes popup-fade-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  :global(.maplibregl-ctrl-bottom-right) {
    right: 20px !important;
    bottom: 20px !important;
  }

  /* Sidebar color square */
  .color-swatch {
    width: 12px;
    height: 12px;
    display: inline-block;
    margin-left: auto;
    border: 1px solid rgba(0, 0, 0, 0.05);
  }

  .filter-text {
    flex-grow: 1;
  }

  /* Popup rectangles */
  :global(.p-tag) {
    font-size: 9px;
    padding: 3px 6px;
    margin-right: 4px;
    margin-bottom: 4px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    text-transform: uppercase;
    font-weight: bold;
    color: #333;
    display: inline-block;
    border-radius: 0; /* Sharp corners */
  }

  :global(.popup-tags) {
    display: flex;
    flex-wrap: wrap;
    margin-top: 8px;
  }

  :global(.popup-link) {
    display: inline-block;
    font-size: 11px;
    color: #333;
    text-decoration: none;
    border-bottom: 1px solid #8450ff;
    padding-bottom: 2px;
    transition: all 0.2s;
  }

  :global(.popup-link:hover) {
    color: #8450ff;
    background: #fdfaf0;
  }

  :global(.air-marker) {
    width: 16px; /* Slightly larger for better slice visibility */
    height: 16px;
    border: 2px solid white;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }

  :global(.air-marker:hover) {
    width: 22px;
    height: 22px;
    z-index: 1000;
    border-color: #fff; /* Keep border white */
    transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    will-change: transform;
  }
</style>
