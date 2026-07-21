import { useEffect, useRef } from "react";
import type { Airport } from "@/lib/airports";

declare global {
  interface Window {
    google?: any;
    __travelMapInit?: () => void;
  }
}

export type MapLeg = { from: Airport; to: Airport; emitted?: boolean; label?: string };

const SCRIPT_ID = "google-maps-js";
let loadPromise: Promise<void> | null = null;

const loadGoogleMaps = () => {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
    if (!key) return reject(new Error("Google Maps browser key não configurada."));
    window.__travelMapInit = () => resolve();
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__travelMapInit${channel ? `&channel=${channel}` : ""}`;
    s.onerror = () => reject(new Error("Falha ao carregar Google Maps."));
    document.head.appendChild(s);
  });
  return loadPromise;
};

export const TravelMap = ({ legs, height = 420 }: { legs: MapLeg[]; height?: number }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);

  useEffect(() => {
    let alive = true;
    loadGoogleMaps()
      .then(() => {
        if (!alive || !containerRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new window.google.maps.Map(containerRef.current, {
            center: { lat: -15, lng: -50 },
            zoom: 3,
            mapTypeId: "hybrid",
            streetViewControl: false,
            fullscreenControl: true,
            mapTypeControl: true,
          });
        }
      })
      .catch((e) => console.error(e));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    if (!legs.length) return;

    const bounds = new window.google.maps.LatLngBounds();
    const seen = new Set<string>();

    legs.forEach((leg, i) => {
      [leg.from, leg.to].forEach((a) => {
        if (seen.has(a.iata)) return;
        seen.add(a.iata);
        const marker = new window.google.maps.Marker({
          position: { lat: a.lat, lng: a.lng },
          map: mapRef.current,
          title: `${a.iata} — ${a.city}`,
          label: { text: a.iata, color: "#fff", fontSize: "11px", fontWeight: "600" },
        });
        overlaysRef.current.push(marker);
        bounds.extend({ lat: a.lat, lng: a.lng });
      });

      const line = new window.google.maps.Polyline({
        path: [
          { lat: leg.from.lat, lng: leg.from.lng },
          { lat: leg.to.lat, lng: leg.to.lng },
        ],
        geodesic: true,
        strokeColor: leg.emitted ? "#eab308" : "#38bdf8",
        strokeOpacity: 0.9,
        strokeWeight: 2.5,
        icons: [
          {
            icon: { path: (window.google.maps.SymbolPath as any).FORWARD_CLOSED_ARROW, scale: 3 },
            offset: "50%",
          },
        ],
        map: mapRef.current,
      });
      overlaysRef.current.push(line);
      if (leg.label) {
        const iw = new window.google.maps.InfoWindow({
          position: {
            lat: (leg.from.lat + leg.to.lat) / 2,
            lng: (leg.from.lng + leg.to.lng) / 2,
          },
          content: `<div style="font-size:11px;color:#111">${leg.label}${i === 0 ? "" : ""}</div>`,
        });
        overlaysRef.current.push({ setMap: (m: any) => (m ? iw.open(mapRef.current) : iw.close()) });
      }
    });

    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, 80);
  }, [legs]);

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="w-full rounded-lg border border-border bg-muted overflow-hidden"
    />
  );
};
