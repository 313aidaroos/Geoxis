import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

function webglOk() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

function city(place) {
  return String(place || "Stop").split(",")[0].trim();
}

function flatRoute(stops) {
  const wrap = document.createElement("div");
  wrap.className = "h-full w-full bg-surface-0";
  const pins = (stops || []).filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 640 360");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Package route");
  svg.classList.add("h-full", "w-full");
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "640");
  bg.setAttribute("height", "360");
  bg.setAttribute("fill", "#0f1117");
  svg.append(bg);
  const project = (stop) => ({
    x: ((stop.longitude + 180) / 360) * 640,
    y: ((90 - stop.latitude) / 180) * 360,
  });
  if (pins.length >= 2) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "#34d399");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("points", pins.map((s) => {
      const p = project(s);
      return `${p.x},${p.y}`;
    }).join(" "));
    svg.append(line);
  }
  pins.forEach((stop, index) => {
    const p = project(stop);
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(p.x));
    dot.setAttribute("cy", String(p.y));
    dot.setAttribute("r", index === pins.length - 1 ? "6" : "4");
    dot.setAttribute("fill", index === pins.length - 1 ? "#34d399" : "#94a3b8");
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(p.x + 8));
    label.setAttribute("y", String(p.y - 8));
    label.setAttribute("fill", "#e2e8f0");
    label.setAttribute("font-size", "12");
    label.textContent = city(stop.place);
    svg.append(dot, label);
  });
  wrap.append(svg);
  return wrap;
}

let viewer = null;

export async function showPackageRoute(container, stops) {
  const pins = (stops || []).filter((s) => Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)));
  if (!webglOk()) {
    if (viewer) {
      viewer.destroy();
      viewer = null;
    }
    container.replaceChildren(flatRoute(pins));
    return;
  }
  if (!viewer || !container.contains(viewer.cesiumWidget?.container)) {
    container.replaceChildren();
    viewer = new Cesium.Viewer(container, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      imageryProvider: await Cesium.ArcGisMapServerImageryProvider.fromUrl(
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
      ),
    });
    const scene = viewer.scene;
    scene.globe.baseColor = Cesium.Color.fromCssColorString("#0f1117");
    scene.backgroundColor = Cesium.Color.fromCssColorString("#0f1117");
    scene.skyAtmosphere.show = true;
    window.addEventListener("resize", () => viewer?.resize());
  }
  viewer.resize();
  viewer.entities.removeAll();
  const positions = [];
  pins.forEach((stop, index) => {
    const lat = Number(stop.latitude);
    const lon = Number(stop.longitude);
    const position = Cesium.Cartesian3.fromDegrees(lon, lat);
    positions.push(position);
    const current = index === pins.length - 1;
    viewer.entities.add({
      position,
      point: {
        pixelSize: current ? 14 : 8,
        color: Cesium.Color.fromCssColorString(current ? "#34d399" : "#94a3b8"),
        outlineColor: Cesium.Color.fromCssColorString("#0f1117"),
        outlineWidth: 2,
      },
      label: {
        text: current ? `${city(stop.place)} · now` : city(stop.place),
        font: "13px sans-serif",
        fillColor: Cesium.Color.fromCssColorString("#f8fafc"),
        outlineColor: Cesium.Color.fromCssColorString("#0f1117"),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -18),
      },
    });
  });
  if (positions.length >= 2) {
    viewer.entities.add({
      polyline: {
        positions,
        width: 3,
        material: Cesium.Color.fromCssColorString("#34d399"),
        clampToGround: true,
      },
    });
  }
  if (pins.length) {
    viewer.resize();
    await viewer.flyTo(viewer.entities, { duration: 0 });
    viewer.scene.requestRender();
  }
}
