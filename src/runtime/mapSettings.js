/*! Open Historia — portions (map interaction/display settings) © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// Map interaction/display settings — backed by the account settings cache
// (runtime/accountSettings.js) so they follow the player across devices.
// Consumers subscribe via useMapSetting() below instead of receiving these as
// props threaded through GameUI/main.jsx, mirroring how useCountryDisplayName
// (polityNames.js) sits beside the data it subscribes to.
import { useEffect, useState } from "react";
import { getAccountSettings, patchAccountSettings } from "./accountSettings.js";

// Keys match server/userSettings.js's mapSettings schema exactly.
export const MAP_SETTING_KEYS = {
    hideCountryLabels: "hideCountryLabels",
    disableIdleRotation: "disableIdleRotation",
    reverseScrollZoom: "reverseScrollZoom",
    disablePanInertia: "disablePanInertia",
    zoomSensitivity: "zoomSensitivity",
    borderWidth: "borderWidth",
    featureSize: "featureSize",
    blurSensitiveFlags: "blurSensitiveFlags",
    globeProjection: "globeProjection",
    terrainEnabled: "terrainEnabled",
};

export function getMapSetting(key) {
    return getAccountSettings().mapSettings?.[key];
}

export function setMapSetting(key, value) {
    patchAccountSettings({ mapSettings: { [key]: value } });
}

export function useMapSetting(key) {
    const [value, setValue] = useState(() => getMapSetting(key));

    useEffect(() => {
        setValue(getMapSetting(key));
        const onUpdated = () => setValue(getMapSetting(key));
        window.addEventListener("accountSettings:updated", onUpdated);
        return () => window.removeEventListener("accountSettings:updated", onUpdated);
    }, [key]);

    return value;
}
