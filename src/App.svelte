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

  // Nieuwe state voor actieve pop-up en lijn
  let selectedPlace = $state(null);
  let activeMarkerElement = $state(null);
  let linePath = $state("");

  function handleVisualToggle(mode) {
    visualMode = visualMode === mode ? "default" : mode;
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
    default: "#8450FF",
  };

  let openSections = $state({ info: true, gebied: false, domein: true });
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
        selectedDomeinen.some((d) => placeDomeinen.includes(d));
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
      center: [4.44, 51.915],
      zoom: 13,
      attributionControl: false,
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

    // Update de lijnpositie als de kaart beweegt
    map.on("move", updateLine);
  }

  // Functie om de dynamische bezier curve te berekenen
  function updateLine() {
    if (!selectedPlace || !map) {
      linePath = "";
      return;
    }

    // 1. Zoek de positie van de actieve marker op het scherm
    const pos = map.project([selectedPlace.longitude, selectedPlace.latitude]);
    const startX = pos.x;
    const startY = pos.y;

    // 2. Zoek de positie van de pop-up (vast op top-right)
    // De pop-up staat op right: 20px, top: 20px en is 240px breed
    const endX = window.innerWidth - 300 - 20;
    const endY = 20 + 80; // Ongeveer het midden van de linkerzijde van de pop-up

    // 3. Teken een organische curve (dik bij popup, dun bij marker)
    // We tekenen een gesloten vorm (pad heen, boogje, pad terug) om de dikte te faken
    const ctrl1X = startX + (endX - startX) * 0.3;
    const ctrl1Y = startY;
    const ctrl2X = startX + (endX - startX) * 0.7;
    const ctrl2Y = endY;

    // We bouwen een polygoon die taps toeloopt
    linePath = `
      M ${startX} ${startY}
      C ${ctrl1X} ${ctrl1Y}, ${ctrl2X} ${ctrl2Y}, ${endX} ${endY - 6}
      L ${endX} ${endY + 6}
      C ${ctrl2X} ${ctrl2Y}, ${ctrl1X} ${ctrl1Y}, ${startX} ${startY}
      Z
    `;
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

      // Kleurenlogica (ongewijzigd)
      if (visualMode === "domein") {
        const domeinList = place.domeinen.split(";").map((d) => d.trim());
        const colors = domeinList.map(
          (d) => DOMEIN_COLORS[d] || DOMEIN_COLORS.default,
        );
        if (colors.length === 1) el.style.background = colors[0];
        else {
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
        const gebiedKey = place.gebied || "default";
        el.style.background = GEBIED_COLORS[gebiedKey] || GEBIED_COLORS.default;
      } else {
        el.style.background = "#8450FF";
      }

      // Klik event voor de nieuwe custom pop-up
      el.addEventListener("click", (e) => {
        e.stopPropagation(); // Voorkom dat de map klik getriggerd wordt

        if (activeMarkerElement)
          activeMarkerElement.classList.remove("active-glow");

        selectedPlace = place;
        activeMarkerElement = el;
        el.classList.add("active-glow");

        // Kleine timeout om te zorgen dat de DOM is bijgewerkt
        setTimeout(updateLine, 10);
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

  <div class="map-container" bind:this={mapContainer}>
    {#if selectedPlace}
      <svg class="line-overlay">
        <path d={linePath} fill="#8450ff" opacity="0.6" />
      </svg>
    {/if}

    {#if selectedPlace}
      <div
        class="fixed-air-popup"
        onclick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <button class="close-btn" onclick={closePopup}>×</button>
        <div class="air-popup">
          <h3 class="popup-title">{selectedPlace.name}</h3>
          <div class="popup-info-row">
            <span class="label">Gebied:</span>
            {selectedPlace.gebied || "Rotterdam"}
          </div>
          <div class="popup-info-row">
            <span class="label">Domein:</span>
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
          <div class="popup-info-row">
            <span class="label">M4H Principes:</span>
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
          </div>
          {#if selectedPlace.website}
            <div class="popup-footer">
              <a href={selectedPlace.website} target="_blank" class="popup-link"
                >Website ↗</a
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
    background: #fffcf4;
    border-right: 1px solid #e0ddd5;
    display: flex;
    flex-direction: column;
    z-index: 10;
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
  }

  .filter-item {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 8px 0;
    font-size: 0.8rem;
    color: #555;
    cursor: pointer;
  }

  .stats {
    margin-top: auto;
    padding: 20px;
    font-size: 0.75rem;
    color: #888;
    background: #fdfaf0;
  }

  input[type="checkbox"] {
    accent-color: #8450ff;
  }

  .visual-toggle-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
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
    position: relative;
  }

  /* GEFIXEERDE POP-UP RECHTSBOVEN */
  .fixed-air-popup {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 300px; /* Vaste grootte */
    background: white;
    border-radius: 5px;
    border-top: 6px solid #8450ff;
    box-shadow:
      0 10px 25px rgba(0, 0, 0, 0.1),
      5px 5px 0px rgba(132, 80, 255, 0.1);
    z-index: 2000;
    animation: popup-slide-in 0.3s cubic-bezier(0.1, 1, 0.1, 1);
    font-family: "Helvetica", Arial, sans-serif;
  }

  .close-btn {
    position: absolute;
    top: 5px;
    right: 10px;
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: #888;
  }
  .close-btn:hover {
    color: #333;
  }

  .air-popup {
    padding: 16px;
  }

  .popup-title {
    margin: 0 0 15px 0;
    font-size: 1.2rem;
    font-weight: 900;
    line-height: 1.1;
    color: #1a1a1a;
    border-bottom: 1px solid #eee;
    padding-bottom: 10px;
  }

  .popup-info-row {
    font-size: 0.8rem;
    margin-bottom: 10px;
    color: #555;
  }

  .popup-info-row .label {
    font-weight: bold;
    color: #888;
    text-transform: uppercase;
    font-size: 0.7rem;
    display: block;
    margin-bottom: 3px;
  }

  .popup-footer {
    margin-top: 15px;
    padding-top: 10px;
    border-top: 1px dotted #ccc;
  }

  @keyframes popup-slide-in {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /* SVG OVERLAY VOOR DE LIJN */
  .line-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none; /* Klikken gaan door de SVG heen naar de map */
    z-index: 1500;
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
    color: #333;
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
    border-bottom: 1px solid #8450ff;
    padding-bottom: 2px;
    transition: all 0.2s;
  }
  .popup-link:hover {
    color: #8450ff;
    background: #fdfaf0;
  }

  /* MARKERS EN GLOW EFFECT */
  :global(.air-marker) {
    width: 16px;
    height: 16px;
    border: 2px solid white;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  :global(.air-marker:hover) {
    width: 22px;
    height: 22px;
    z-index: 1000;
  }

  /* De actieve grotere marker met gloeiende rand */
  :global(.air-marker.active-glow) {
    width: 26px !important;
    height: 26px !important;
    z-index: 1001;
    border-color: #fff;
    box-shadow:
      0 0 0 4px rgba(132, 80, 255, 0.4),
      0 0 15px 8px rgba(132, 80, 255, 0.2),
      0 2px 6px rgba(0, 0, 0, 0.3);
  }
</style>
