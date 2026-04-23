<script>
  import { onMount } from "svelte";
  import maplibregl from "maplibre-gl";
  import Papa from "papaparse";
  import "maplibre-gl/dist/maplibre-gl.css";

  // --- STATE ---
  let mapContainer = $state();
  let map = $state();
  let mapLoaded = $state(false); // Nieuw: houdt bij of we veilig kleuren kunnen updaten
  let allPlaces = $state([]);
  let markers = [];
  let visualMode = $state("domein");

  let hoveredwijkId = $state(null);
  let hoveredwijkName = $state(null);
  let hoverLabelMarker = null;

  let selectedPlace = $state(null);
  let activeMarkerElement = $state(null);
  let enlargedImage = $state(null);
  let wijkCentroids = $state({});
  let wijkLookup = $state({});
  let alleWijken = $state([]);

  // --- MAP OPZETTEN ---
  async function initMap() {
    map = new maplibregl.Map({
      container: mapContainer,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [4.47, 51.915],
      zoom: 12.5,
      attributionControl: false,
    });

    map.on("load", async () => {
      // 1. Voeg de bron toe
      map.addSource("rotterdam-buurten", {
        type: "geojson",
        data: "rotterdam-buurten.json",
      });

      // 2. NIEUW: Voeg een 'fill' laag toe voor de gebieden (standaard transparant)
      map.addLayer(
        {
          id: "wijken-fill",
          type: "fill",
          source: "rotterdam-buurten",
          paint: {
            "fill-color": "transparent",
            "fill-opacity": 0.2, // Transparantie van het ingekleurde vlak
          },
        },
        "watername_ocean",
      );

      map.addLayer(
        {
          id: "wijken-glow",
          type: "line",
          source: "rotterdam-buurten",
          paint: {
            "line-color": "#a78bfa",
            "line-width": 10,
            "line-opacity": 0, // starts hidden
            "line-blur": 6,
          },
        },
        "watername_ocean",
      );

      // 3. Voeg de outline laag toe (bovenop de fill laag)
      map.addLayer(
        {
          id: "wijken-outlines",
          type: "line",
          source: "rotterdam-buurten",
          paint: {
            "line-color": "#5d69fb",
            "line-width": 1.5,
            "line-opacity": 0.2,
          },
        },
        "watername_ocean",
      );
      map.on("mousemove", "wijken-fill", (e) => {
        if (!e.features || !e.features.length) return;
        const feature = e.features[0];
        const wijknaam = feature.properties?.wijknaam;
        if (!wijknaam) return;
        if (hoveredwijkName === wijknaam) return;
        hoveredwijkName = wijknaam;
        showwijkHoverLabel(wijknaam);
      });

      map.on("mouseleave", "wijken-fill", () => {
        hoveredwijkName = null;
        removeHoverLabel();
        map.getCanvas().style.cursor = "";
      });

      map.on("mouseenter", "wijken-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      const geoRes = await fetch("rotterdam-buurten.json");
      const geoData = await geoRes.json();

      const centroids = {};
      const lookup = {};
      geoData.features.forEach((feature) => {
        const name = feature.properties?.wijknaam;
        if (!name) return;
        const centroid = computeCentroidFromGeometry(feature.geometry);
        const area = computeGeometryArea(feature.geometry);
        if (centroid) {
          centroids[name] = centroid;
          lookup[name] = { centroid, area };
        }
      });
      wijkCentroids = centroids;
      wijkLookup = lookup;
      alleWijken = geoData.features
        .map((f) => f.properties?.wijknaam)
        .filter(Boolean);

      mapLoaded = true; // Nu mogen we de kleuren via effecten updaten!
    });
  }

  function showwijkHoverLabel(wijknaam) {
    const position = wijkCentroids[wijknaam];
    if (!position || !map) return;
    if (!hoverLabelMarker) {
      const label = document.createElement("div");
      label.className = "wijk-hover-label";
      hoverLabelMarker = new maplibregl.Marker({
        element: label,
        anchor: "center",
      })
        .setLngLat(position)
        .addTo(map);
    } else {
      hoverLabelMarker.setLngLat(position);
    }
    hoverLabelMarker.getElement().textContent = wijknaam;
  }

  function removeHoverLabel() {
    if (!hoverLabelMarker) return;
    hoverLabelMarker.remove();
    hoverLabelMarker = null;
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
    "Bospolder-Tussendijken": "#F3B1A5",
    "Keilekwartier/M4H": "#A2C3DB",
    Delfshaven: "#B9D4B3",
    Keilewerf: "#8EB8C2",
    Middelland: "#F6D6AD",
    "Nieuw-Mathenesse": "#A7BCC9",
    "Nieuwe Westen": "#DBB1BC",
    "Oud-Mathenesse": "#C8CDA9",
    "Oude Westen": "#EAD9C1",
    Schiehaven: "#B6B6B2",
    Schiemond: "#C9BCE2",
    Agniesewijk: "#F9E2AF",
    Afrikaanderwijk: "#D2E0BF",
    Blijdorp: "#B0D7D1",
    Carnisse: "#E8C1A0",
    Centrum: "#D1D1D1",
    Crooswijk: "#F2C6DE",
    "De Esch": "#A9D1E6",
    "Eiland van Brienenoord": "#98C9A3",
    Feijenoord: "#E5B9B5",
    Hillesluis: "#E6E2B1",
    Hoogkwartier: "#C1D3FE",
    Katendrecht: "#FBC4AB",
    "Kralingen-Crooswijk": "#D8E2DC",
    Mathenesse: "#DEE2FF",
    Noordereiland: "#BEE1E6",
    "Oud-Charlois": "#E2ECE9",
    Pendrecht: "#D6E2E9",
    "Prins Alexander": "#FAD2E1",
    Rotterdam: "#E9ECEF",
    "Rotterdam-Noord": "#C9ADA7",
    Struisenburg: "#F6BD60",
    Tarwewijk: "#ADC178",
    Vreewijk: "#A3C4BC",
    Zevenkamp: "#D4A373",
    Zomerhofkwartier: "#FFDAC1",
    default: "#C1C8FF",
  };

  const KOEPEL_COLORS = {
    Welzijnscoalitie: "#5d69fb",
    "Rotterdam Circulair": "#6C5B7B",
    "Energie van Rotterdam": "#FFB703",
    Groen010: "#2D6A4F",
    default: "#C1C8FF",
  };

  // --- UI STATE ---
  let openSections = $state({
    info: false,
    gebied: false,
    domein: false,
    koepel: false,
    typeInitiatieven: false,
  });

  function toggleSection(name) {
    openSections[name] = !openSections[name];
  }

  let selectedGebieden = $state([]);
  let selectedDomeinen = $state([]);
  let selectedKoepels = $state([]);
  let selectedTypes = $state([]);
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
      const placeType = p.location_type === "area" ? "area" : "point";
      const matchesType =
        selectedTypes.length === 0 || selectedTypes.includes(placeType);
      return matchesGebied && matchesKoepel && matchesDomein && matchesType;
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

  function computeCentroidFromGeometry(geometry) {
    if (!geometry || !geometry.type || !geometry.coordinates) return null;
    if (geometry.type === "Point") return geometry.coordinates;
    if (geometry.type === "Polygon")
      return computePolygonCentroid(geometry.coordinates);
    if (geometry.type === "MultiPolygon") {
      let totalArea = 0;
      let weightedX = 0;
      let weightedY = 0;

      geometry.coordinates.forEach((polygon) => {
        const centroid = computePolygonCentroid(polygon);
        const area = computePolygonArea(polygon[0]);
        if (area && centroid) {
          totalArea += area;
          weightedX += centroid[0] * area;
          weightedY += centroid[1] * area;
        }
      });

      if (totalArea) return [weightedX / totalArea, weightedY / totalArea];
      return null;
    }
    return null;
  }

  function computeGeometryArea(geometry) {
    if (!geometry || !geometry.type || !geometry.coordinates) return 0;
    if (geometry.type === "Polygon") {
      return computePolygonArea(geometry.coordinates[0]);
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.reduce(
        (sum, polygon) => sum + computePolygonArea(polygon[0]),
        0,
      );
    }
    return 0;
  }

  function getAreaInitiativeCentroid(place) {
    const areaNames = (place.gebied || "")
      .split(";")
      .map((name) => name.trim())
      .filter(Boolean);
    if (areaNames.length === 0) return [place.longitude, place.latitude];

    const validAreas = areaNames
      .map((name) => wijkLookup[name])
      .filter(Boolean);
    if (validAreas.length === 0) return [place.longitude, place.latitude];

    let totalArea = 0;
    let weightedLng = 0;
    let weightedLat = 0;

    validAreas.forEach((info) => {
      const centroid = info.centroid;
      const area = info.area || 1;
      if (centroid && Array.isArray(centroid) && centroid.length === 2) {
        weightedLng += centroid[0] * area;
        weightedLat += centroid[1] * area;
        totalArea += area;
      }
    });

    if (totalArea === 0) return [place.longitude, place.latitude];
    return [weightedLng / totalArea, weightedLat / totalArea];
  }

  function computePolygonArea(ring) {
    let area = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
  }

  function computePolygonCentroid(polygon) {
    const ring = polygon[0];
    if (!ring || ring.length === 0) return null;
    let signedArea = 0;
    let cx = 0;
    let cy = 0;

    for (let i = 0; i < ring.length; i += 1) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      const cross = x1 * y2 - x2 * y1;
      signedArea += cross;
      cx += (x1 + x2) * cross;
      cy += (y1 + y2) * cross;
    }

    if (signedArea === 0) return [ring[0][0], ring[0][1]];
    const area = signedArea * 0.5;
    return [cx / (6 * area), cy / (6 * area)];
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
      const isArea = place.location_type === "area";

      // Gebruik specifieke class afhankelijk van punt/gebied
      el.className = isArea ? "air-area-marker" : "air-marker";
      const domeinList = (place.domeinen || "").split(";").map((d) => d.trim());

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

      // --- CLICK EVENT (Voor beide gelijk) ---
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
        const offsetX = isMobile ? 0 : (sidebarWidth - popupWidth) / 2;
        const offsetY = isMobile ? -5 : 0;

        map.flyTo({
          center: [place.longitude, place.latitude],
          offset: [offsetX, offsetY],
          essential: true,
          speed: 0.6,
          curve: 1.2,
          zoom: 14,
        });
      });

      const markerPosition = isArea
        ? getAreaInitiativeCentroid(place)
        : [place.longitude, place.latitude];
      const markerLngLat = new maplibregl.LngLat(
        markerPosition[0] ?? place.longitude,
        markerPosition[1] ?? place.latitude,
      );

      const m = new maplibregl.Marker({ element: el })
        .setLngLat(markerLngLat)
        .addTo(map);
      markers.push(m);
    });
  });

  // Effect to highlight areas when a place is selected
  $effect(() => {
    if (!map || !mapLoaded) return;

    if (!selectedPlace) {
      // Reset to default
      map.setFilter("wijken-fill", null);
      map.setFilter("wijken-outlines", null);
      map.setFilter("wijken-glow", null);
      map.setPaintProperty("wijken-glow", "line-opacity", 0);
      map.setPaintProperty("wijken-fill", "fill-color", "transparent");
      map.setPaintProperty("wijken-fill", "fill-opacity", 0.2);
      map.setPaintProperty("wijken-outlines", "line-color", "#5d69fb");
      map.setPaintProperty("wijken-outlines", "line-width", 1.5);
      map.setPaintProperty("wijken-outlines", "line-opacity", 0.2);
      return;
    }

    // Get the areas for the selected place
    const areaNames = (selectedPlace.gebied || "")
      .split(";")
      .map((name) => name.trim())
      .filter(Boolean);

    if (areaNames.length === 0) {
      // No areas, reset
      map.setFilter("wijken-fill", null);
      map.setFilter("wijken-outlines", null);
      map.setFilter("wijken-glow", null);
      map.setPaintProperty("wijken-glow", "line-opacity", 0);
      map.setPaintProperty("wijken-fill", "fill-color", "transparent");
      map.setPaintProperty("wijken-fill", "fill-opacity", 0.2);
      map.setPaintProperty("wijken-outlines", "line-color", "#5d69fb");
      map.setPaintProperty("wijken-outlines", "line-width", 1.5);
      map.setPaintProperty("wijken-outlines", "line-opacity", 0.2);
      return;
    }

    // Filter to show only the selected areas
    const filter = ["in", "wijknaam", ...areaNames];
    map.setFilter("wijken-fill", filter);
    map.setFilter("wijken-outlines", filter);
    map.setFilter("wijken-glow", filter);

    // Set glowing outline
    map.setPaintProperty("wijken-glow", "line-opacity", 0.8);
    map.setPaintProperty("wijken-outlines", "line-color", "#ffffff");
    map.setPaintProperty("wijken-outlines", "line-width", 2);
    map.setPaintProperty("wijken-outlines", "line-opacity", 1);

    // Set see-through purple fill
    map.setPaintProperty("wijken-fill", "fill-color", "rgba(128, 0, 128, 0.3)");
    map.setPaintProperty("wijken-fill", "fill-opacity", 1);
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
      <button
        class="accordion-header"
        onclick={() => toggleSection("typeInitiatieven")}
      >
        <span>Type initiatieven</span>
        <span class="icon">{openSections.typeInitiatieven ? "−" : "+"}</span>
      </button>
      {#if openSections.typeInitiatieven}
        <div class="accordion-content">
          <label class="filter-item">
            <input
              type="checkbox"
              checked={selectedTypes.includes("point")}
              onchange={() =>
                (selectedTypes = toggleFilter(selectedTypes, "point"))}
            />
            <span class="filter-text">Plekken</span>
          </label>

          <label class="filter-item">
            <input
              type="checkbox"
              checked={selectedTypes.includes("area")}
              onchange={() =>
                (selectedTypes = toggleFilter(selectedTypes, "area"))}
            />
            <span class="filter-text">Koepels</span>
          </label>
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
              {#each (selectedPlace.domeinen || "").split(";") as d}
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

  @media (max-width: 900px) {
    .sidebar {
      position: fixed;
      top: auto;
      bottom: 0;
      left: 0;
      width: 100%;
      height: auto;
      max-height: 70vh;
      border-right: none;
      border-top: 1px solid rgba(0, 0, 0, 0.1);
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
      z-index: 2000;
    }
    .brand,
    .stats,
    .sidebar-collapse {
      display: none !important;
    }
    .accordion-content {
      max-height: 40vh;
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
  .accordion:has(.accordion-content) {
    background: #fdfaf0;
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
    border-radius: 3px;
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
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.05);
  }
  .popup-top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background-color: #5d69fb;
    gap: 12px;
    min-height: 68px;
    box-sizing: border-box;
  }
  .popup-title {
    margin: 0;
    font-size: 1.1rem;
    color: #ffffff;
    font-weight: 800;
    line-height: 1.2;
    flex-grow: 1;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .close-btn {
    background: #ffffff;
    border: none;
    font-size: 22px;
    font-family: Arial, sans-serif;
    cursor: pointer;
    color: #5d69fb;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
    padding: 0;
    flex-shrink: 0;
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

  /* POINT MARKERS (Oude stijl met border) */
  :global(.air-marker) {
    min-width: 26px;
    height: 26px;
    border: 2px solid #737ac6;
    border-radius: 13px;
    cursor: pointer;
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 0 4px;
    box-sizing: border-box;
  }
  :global(.air-marker i) {
    font-size: 14px;
    line-height: 1;
  }
  :global(.air-marker:hover) {
    transform: scale(1.15);
    z-index: 1000;
  }
  :global(.air-marker.active-glow) {
    z-index: 1001;
    border: 2.5px solid #5d69fb;
    box-shadow:
      0 0 0 3px #5d69fb33,
      0 0 15px 8px rgba(132, 80, 255, 0.15),
      0 2px 6px rgba(0, 0, 0, 0.2);
  }

  /* AREA MARKERS (Nieuw: Alleen groot icon in het midden van het gebied) */
  :global(.air-area-marker) {
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s cubic-bezier(0.1, 1, 0.1, 1);
  }
  :global(.air-area-marker:hover) {
    transform: scale(1.2);
    z-index: 1000;
  }
  /* Bij active krijgt het icoon de welbekende paarse glow via een CSS filter op de icon */
  :global(.air-area-marker.active-glow i) {
    filter: drop-shadow(0 0 8px rgba(132, 80, 255, 0.8)) !important;
    transform: scale(1.1);
  }

  :global(.wijk-hover-label) {
    display: inline-block;
    background: rgba(255, 255, 255, 0.6);
    color: #5d69fb;
    font-size: 13px;
    font-weight: 400;
    padding: 5px 5px;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    white-space: nowrap;
    border: 1px solid rgba(0, 0, 0, 0.08);
    pointer-events: none;
    z-index: 20;
  }

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
