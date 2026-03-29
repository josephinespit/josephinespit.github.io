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
      fadeDuration: 0, // <--- VOEG DEZE REGEL TOE
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

  // Functie om de simpele strakke lijn te berekenen
  function updateLine() {
    if (!selectedPlace || !map) {
      linePath = "";
      return;
    }

    // 1. Zoek de positie van de actieve marker op het scherm (Punt A)
    const pos = map.project([selectedPlace.longitude, selectedPlace.latitude]);
    const startX = pos.x;
    const startY = pos.y;

    // 2. Zoek de positie van de pop-up (Vast op top-right)
    // De pop-up staat op right: 20px, top: 20px en is 300px breed.
    // We trekken de lijn naar het midden van de linkerzijde van de pop-up.
    const endX = window.innerWidth - 300 - 20;
    const endY = 20 + 100; // Ongeveer het midden van de linkerzijde van de pop-up

    // 3. Teken een simpele strakke rechte lijn (M = Move To, L = Line To)
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
      // Klik event voor de marker
      el.addEventListener("click", (e) => {
        e.stopPropagation(); // Voorkom dat de kaart-klik getriggerd wordt

        if (activeMarkerElement)
          activeMarkerElement.classList.remove("active-glow");

        selectedPlace = place;
        activeMarkerElement = el;
        el.classList.add("active-glow");

        // --- NIEUW: Centreer de kaart op de aangeklikte marker ---
        map.flyTo({
          center: [place.longitude, place.latitude],
          essential: true, // Zorgt ervoor dat de animatie ook werkt bij gebruikers met 'reduced motion' instellingen
          speed: 0.1, // Snelheid van de animatie (lager is langzamer)
          curve: 0, // De curve van de vliegbeweging
        });

        // Kleine timeout om te zorgen dat de lijn pas berekend wordt
        // als de kaart op zijn nieuwe plek staat
        // setTimeout(updateLine, 10);
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
    color: #8450ff;
    background-color: #fdfaf0; /* Matcht nu met de paarse balk van de popup! */
    text-align: center;
  }

  .accordion {
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
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
    font-size: 0.7rem;
    letter-spacing: 0.05rem;
    color: #8450ff;
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
    color: #8450ff;
    font-size: 0.85rem;
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
    background-color: #8450ff;
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
    background-color: #8450ff; /* AIR Paars */
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
    color: #8450ff; /* Paars kruisje */
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
    /* transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); */
  }

  :global(.air-marker:hover) {
    width: 22px;
    height: 22px;
    z-index: 1000;
  }

  /* De actieve grotere marker met gloeiende rand */
  :global(.air-marker.active-glow) {
    width: 24px !important;
    height: 24px !important;
    z-index: 1001;
    border-color: #fff;
    box-shadow:
      0 0 0 4px rgba(132, 80, 255, 0.4),
      0 0 15px 8px rgba(132, 80, 255, 0.2),
      0 2px 6px rgba(0, 0, 0, 0.3);
  }
</style>
