<script>
  import { onMount } from "svelte";
  import maplibregl from "maplibre-gl";
  import Papa from "papaparse";
  import { basemapStyle } from "./lib/basemap/index.js";
  import "maplibre-gl/dist/maplibre-gl.css";

  // --- STATE ---
  let mapContainer = $state();
  let map = $state();
  let allPlaces = $state([]);
  let markers = [];
  let visualMode = $state("domein");

  let selectedPlace = $state(null);
  let activeMarkerElement = $state(null);
  let showHeatmap = $state(false);
  let enlargedImage = $state(null);

  function getGeojsonData() {
    return {
      type: "FeatureCollection",
      features: allPlaces.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
        properties: {
          koepel: p.koepels ? p.koepels.split(";")[0].trim() : "default",
        },
      })),
    };
  }

  // Functie om de heatmap laag te updaten/aanmaken
  function updateHeatmap() {
    if (!map) return;

    if (!map.isStyleLoaded()) {
      map.once("load", updateHeatmap);
      return;
    }

    if (!showHeatmap) {
      if (map.getLayer("koepel-heatmap")) map.removeLayer("koepel-heatmap");
      if (map.getSource("places-source")) map.removeSource("places-source");
      return;
    }

    if (!map.getSource("places-source")) {
      map.addSource("places-source", {
        type: "geojson",
        data: getGeojsonData(),
      });
    } else {
      map.getSource("places-source").setData(getGeojsonData());
    }

    if (!map.getLayer("koepel-heatmap")) {
      map.addLayer({
        id: "koepel-heatmap",
        type: "heatmap",
        source: "places-source",
        maxzoom: 15,
        paint: {
          "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            1,
            15,
            3,
          ],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(93, 105, 251, 0)",
            0.2,
            "#B9D4B3",
            0.4,
            "#FFB703",
            0.6,
            "#E76F51",
            0.8,
            "#6C5B7B",
            1,
            "#5d69fb",
          ],
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            15,
            15,
            40,
          ],
          "heatmap-opacity": 0.7,
        },
      });
    }
  }

  function handleVisualToggle(mode) {
    visualMode = visualMode === mode ? "default" : mode;
  }

  const DOMEIN_COLORS = {
    Werken: "#D4D4D4",
    Werkplaats: "#A1A1A1",
    Cultuur: "#5d69fb",
    Groen: "#2D6A4F",
    Voedsel: "#E76F51",
    Circulair: "#6C5B7B",
    Energie: "#FFB703",
    Klimaat: "#4EA8DE",
    Zorg: "#E63946",
    Educatie: "#B5A900",
    Wonen: "#D81B60",
    Community: "#0081A7",
    Mobiliteit: "#9A031E",
    default: "#5d69fb",
  };

  const DOMEIN_ICONS = {
    Werken: "ph-briefcase",
    Werkplaats: "ph-hammer",
    Cultuur: "ph-paint-brush-broad",
    Groen: "ph-tree",
    Voedsel: "ph-fork-knife",
    Circulair: "ph-recycle",
    Energie: "ph-lightning",
    Klimaat: "ph-cloud-sun",
    Zorg: "ph-heartbeat",
    Educatie: "ph-graduation-cap",
    Wonen: "ph-house",
    Community: "ph-users-three",
    Mobiliteit: "ph-car",
    default: "ph-map-pin",
  };

  const GEBIED_COLORS = {
    // Originele lijst & M4H clusters
    "Bospolder-Tussendijken": "#F3B1A5", // Soft Terra/Rose
    "Keilekwartier/M4H": "#A2C3DB", // Dusty Sky Blue
    Delfshaven: "#B9D4B3", // Sage Green
    Keilewerf: "#8EB8C2", // Muted Teal
    Middelland: "#F6D6AD", // Warm Apricot
    "Nieuw-Mathenesse": "#A7BCC9", // Cool Steel
    "Nieuwe Westen": "#DBB1BC", // Antique Mauve
    "Oud-Mathenesse": "#C8CDA9", // Pale Olive
    "Oude Westen": "#EAD9C1", // Sandstone
    Schiehaven: "#B6B6B2", // Ash Grey
    Schiemond: "#C9BCE2", // Pale Lavender

    // Nieuwe wijken uit de uitgebreide lijst
    Agniesebuurt: "#F9E2AF", // Pale Canary
    Afrikaanderwijk: "#D2E0BF", // Light Moss
    Blijdorp: "#B0D7D1", // Mint Frost
    Carnisse: "#E8C1A0", // Peach Sorbet
    Centrum: "#D1D1D1", // Silver Cloud
    Crooswijk: "#F2C6DE", // Cotton Candy
    "De Esch": "#A9D1E6", // Baby Blue
    "Eiland van Brienenoord": "#98C9A3", // Willow Green
    Feijenoord: "#E5B9B5", // Dusty Rose
    Hillesluis: "#E6E2B1", // Straw
    Hoogkwartier: "#C1D3FE", // Periwinkle
    Katendrecht: "#FBC4AB", // Apricot Pink
    "Kralingen-Crooswijk": "#D8E2DC", // Linen
    Mathenesse: "#DEE2FF", // Lavender Mist
    Noordereiland: "#BEE1E6", // Ice Blue
    "Oud-Charlois": "#E2ECE9", // Mint Cream
    Pendrecht: "#D6E2E9", // Cloud
    "Prins Alexander": "#FAD2E1", // Soft Pink
    Rotterdam: "#E9ECEF", // Light Slate
    "Rotterdam-Noord": "#C9ADA7", // Rosy Brown
    Struisenburg: "#F6BD60", // Muted Orange
    Tarwewijk: "#ADC178", // Sage
    Vreewijk: "#A3C4BC", // Eucalyptus
    Zevenkamp: "#D4A373", // Tan
    Zomerhofkwartier: "#FFDAC1", // Shell

    // Terugvaloptie
    default: "#C1C8FF", // Pastel Brand Purple
  };

  const KOEPEL_COLORS = {
    Welzijnscoalitie: "#5d69fb",
    "Rotterdam Circulair": "#6C5B7B",
    "Energie van Rotterdam": "#FFB703",
    Groen010: "#2D6A4F",
    default: "#C1C8FF",
  };

  let openSections = $state({
    info: false,
    gebied: false,
    domein: false,
    koepel: false,
  });
  function toggleSection(name) {
    openSections[name] = !openSections[name];
  }

  let selectedGebieden = $state([]);
  let selectedDomeinen = $state([]);
  let selectedKoepels = $state([]);
  let linePath = $state("");

  let uniqueGebieden = $derived(
    [...new Set(allPlaces.map((p) => p.gebied))].filter(Boolean).sort(),
  );
  let uniqueKoepels = $derived(
    [...new Set(allPlaces.map((p) => p.koepels))].filter(Boolean).sort(),
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
      const koepelValues = (p.koepels || "").split(";").map((k) => k.trim());
      const matchesKoepel =
        selectedKoepels.length === 0 ||
        koepelValues.some((k) => selectedKoepels.includes(k));
      const placeDomeinen = p.domeinen.split(";").map((d) => d.trim());
      const matchesDomein =
        selectedDomeinen.length === 0 ||
        selectedDomeinen.every((d) => placeDomeinen.includes(d));
      return matchesGebied && matchesKoepel && matchesDomein;
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

    map.on("load", () => updateHeatmap());
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

      // --- ALWAYS USE DOMEIN COLORS FOR ICONS ---
      let iconsHtml = "";
      domeinList.forEach((d) => {
        const iconClass = DOMEIN_ICONS[d] || DOMEIN_ICONS.default;
        const iconColor = DOMEIN_COLORS[d] || DOMEIN_COLORS.default;
        iconsHtml += `<i class="ph ${iconClass}" style="color: ${iconColor};"></i>`;
      });
      el.innerHTML = iconsHtml;

      // --- HANDLE THE BORDER COLOR BASED ON MODE ---
      if (visualMode === "gebied") {
        const gebiedKey = place.gebied || "default";
        const color = GEBIED_COLORS[gebiedKey] || GEBIED_COLORS.default;
        el.style.borderColor = color;
        // Optional: slight background tint to match the pastel border
        el.style.backgroundColor = "#ffffff";
      } else if (visualMode === "koepel") {
        const koepelKey =
          (place.koepels || "").split(";").map((k) => k.trim())[0] || "default";
        const color = KOEPEL_COLORS[koepelKey] || KOEPEL_COLORS.default;
        el.style.borderColor = color;
        el.style.backgroundColor = "#ffffff";
      } else {
        // Default purple-ish border from your original design
        el.style.borderColor = "#737ac6";
        el.style.backgroundColor = "#ffffff";
      }

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (activeMarkerElement)
          activeMarkerElement.classList.remove("active-glow");
        selectedPlace = place;
        activeMarkerElement = el;
        el.classList.add("active-glow");
        const isMobile = window.innerWidth <= 900;

        const sidebarWidth = 280;
        const popupWidth = 600;

        // Only apply horizontal offset on desktop
        const offsetX = isMobile ? 0 : (sidebarWidth - popupWidth) / 2;

        // Optional: small vertical tweak for mobile (since popup is on top)
        const offsetY = isMobile ? -5 : 0;

        map.flyTo({
          center: [place.longitude, place.latitude],
          offset: [offsetX, offsetY],
          essential: true,
          speed: 0.2,
          curve: 1.2,
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

  // Effect dat reageert op de heatmap toggle
  $effect(() => {
    if (!map || allPlaces.length === 0) return;
    // Referencing showHeatmap here makes this effect rerun when the toggle changes.
    const enabled = showHeatmap;
    updateHeatmap();
  });

  // Verberg markers als heatmap aan staat (optioneel, voor rust)
  $effect(() => {
    if (showHeatmap) {
      markers.forEach((m) => (m.getElement().style.opacity = "0.2"));
    } else {
      markers.forEach((m) => (m.getElement().style.opacity = "1"));
    }
  });
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
          <button
            class="image-button"
            onclick={() => (enlargedImage = "Waardebloem.png")}
            title="klik om te vergroten"
            aria-label="Vergroten Waardebloem afbeelding"
          >
            <img
              src="Waardebloem.png"
              alt="Waardebloem"
              style="width: 100%; margin-top: 10px; border-radius: 4px; border: 1px solid rgba(0, 0, 0, 0.05);"
            />
          </button>
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
      <button class="accordion-header" onclick={() => toggleSection("koepel")}>
        <span>Koepels</span>
        <span class="icon">{openSections.koepel ? "−" : "+"}</span>
      </button>
      {#if openSections.koepel}
        <div class="accordion-content">
          <div class="heatmap-toggle-container">
            <span class="toggle-text">Toon heatmap</span>
            <label class="switch">
              <input
                type="checkbox"
                checked={showHeatmap}
                onchange={() => (showHeatmap = !showHeatmap)}
              />
              <span class="slider"></span>
            </label>
          </div>
          <div class="visual-toggle-container">
            <span class="toggle-text">Toon kleuren per koepel</span>
            <label class="switch">
              <input
                type="checkbox"
                checked={visualMode === "koepel"}
                onchange={() => handleVisualToggle("koepel")}
              />
              <span class="slider"></span>
            </label>
          </div>
          <hr class="separator" />
          {#each uniqueKoepels as koepel}
            <label class="filter-item">
              <input
                type="checkbox"
                checked={selectedKoepels.includes(koepel)}
                onchange={() =>
                  (selectedKoepels = toggleFilter(selectedKoepels, koepel))}
              />
              <span class="filter-text">{koepel}</span>
              <span
                class="color-swatch"
                style="background-color: {KOEPEL_COLORS[koepel] ||
                  KOEPEL_COLORS.default}"
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

  {#if enlargedImage}
    <div
      class="image-modal"
      onclick={() => (enlargedImage = null)}
      role="presentation"
    >
      <img src={enlargedImage} alt="Enlarged" class="enlarged-image" />
    </div>
  {/if}

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
    background: #fdfaf0;
    border-right: 1px solid rgba(0, 0, 0, 0.05);
    display: flex;
    flex-direction: column;
    z-index: 10;
    overflow-y: auto;
    scrollbar-gutter: stable;
    font-family: "Helvetica", Arial, sans-serif;
    position: relative;
  }

  /* MOBILE-SPECIFIC OVERRIDES */
  @media (max-width: 900px) {
    .sidebar {
      position: fixed;
      top: auto; /* Remove top pin */
      bottom: 0; /* Pin to bottom */
      left: 0;
      width: 100%;
      height: auto; /* Shrink to titles */
      max-height: 70vh; /* Don't cover whole map */
      border-right: none;
      border-top: 1px solid rgba(0, 0, 0, 0.1);
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
      z-index: 2000;
    }

    /* Hide non-accordion elements on mobile to keep it slim */
    .brand,
    .stats,
    .sidebar-collapse {
      display: none !important;
    }

    .accordion-content {
      max-height: 40vh; /* Limit content height */
      overflow-y: auto;
    }

    .fixed-air-popup {
      top: 16px !important;
      right: unset !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      width: calc(100% - 24px) !important;
      max-width: 360px !important;
    }
  }

  /* --- REST OF YOUR ORIGINAL STYLING --- */
  .brand {
    padding: 24px 20px;
    font-weight: 900;
    font-size: 1.4rem;
    letter-spacing: -0.5px;
    color: #5d69fb;
    background-color: #fdfaf0;
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

  .fixed-air-popup {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 320px;
    background: #fffcf4;
    border-radius: 6px;
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

  .popup-top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background-color: #5d69fb; /* AIR Paars */
    gap: 12px;

    /* Vaste hoogte: 2.8rem voor de tekst + 24px padding = ~68px hoog */
    /* Dit is hoog genoeg voor exact 2 regels tekst */
    min-height: 68px;
    box-sizing: border-box;
  }

  .popup-title {
    margin: 0;
    font-size: 1.1rem;
    color: #ffffff;
    font-weight: 800;
    line-height: 1.2;
    color: #ffffff; /* Wit */
    flex-grow: 1;

    /* Zorgt dat de tekst netjes verdeeld wordt over max 2 regels */
    display: -webkit-box;
    line-clamp: 2;
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
    border: 2px solid #737ac6; /* Paarse omlijning maakt het witte rondje knallend */
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
    border: 2.5px solid #5d69fb;
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

  .image-button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    display: block;
    width: 100%;
  }

  .image-button:hover img {
    opacity: 0.9;
  }

  .image-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3000;
    cursor: pointer;
  }

  .enlarged-image {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
  }
</style>
