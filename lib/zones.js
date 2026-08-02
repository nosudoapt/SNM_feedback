import { ZONE_DATA } from "../zones-data.js";

const generalZones = (ZONE_DATA.generalZones || []).map((zone) => ({
  ...zone,
  kind: "general",
  zoneKey: zoneKey(zone.zoneNo),
  searchLabel: `${zone.zoneNo} - ${zone.zoneName}`,
}));

const specialZones = (ZONE_DATA.specialZones || []).map((zone) => ({
  ...zone,
  kind: "special",
  zoneKey: zoneKey(zone.zoneNo),
  searchLabel: `${zone.zoneNo} - ${zone.zoneName}`,
}));

const allZones = [...generalZones, ...specialZones];

export function escapeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalize(value) {
  return escapeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function zoneKey(value) {
  return escapeText(value).toUpperCase().replace(/^0+(?=\d)/, "");
}

export function findZoneByNo(zoneNo) {
  const key = zoneKey(zoneNo);
  return allZones.find((zone) => zone.zoneKey === key) || null;
}

export function searchZones(query, limit = 8) {
  const raw = escapeText(query);
  if (!raw) return [];

  const compact = normalize(raw);
  const key = zoneKey(raw);
  const digitsOnly = /^\d+$/.test(raw);

  return allZones
    .filter((zone) => {
      if (digitsOnly) {
        return zone.zoneKey === key || zone.zoneNo.startsWith(key) || zone.zoneNo.startsWith(raw);
      }

      return (
        normalize(zone.zoneNo).startsWith(compact) ||
        normalize(zone.zoneName).includes(compact) ||
        normalize(zone.searchLabel).includes(compact)
      );
    })
    .slice(0, limit)
    .map((zone) => ({
      zoneNo: zone.zoneNo,
      zoneName: escapeText(zone.zoneName),
      kind: zone.kind,
      searchLabel: zone.searchLabel,
    }));
}

export function getZoneDetails(zoneNo) {
  const zone = findZoneByNo(zoneNo);
  if (!zone) return null;

  if (zone.kind === "special") {
    return {
      kind: "special",
      zoneNo: zone.zoneNo,
      zoneName: escapeText(zone.zoneName),
      sectors: (zone.sectors || []).map((sector) => ({
        sectorNo: sector.sectorNo,
        sectorName: escapeText(sector.sectorName),
        sectorInchargeName: escapeText(sector.sectorInchargeName),
        contactNo: escapeText(sector.contactNo),
      })),
    };
  }

  return {
    kind: "general",
    zoneNo: zone.zoneNo,
    zoneName: escapeText(zone.zoneName),
    zonalInchargeName: escapeText(zone.zonalInchargeName),
    contactNo: escapeText(zone.contactNo),
    whatsappNo: escapeText(zone.whatsappNo),
  };
}

export function getSectorDetails(zoneNo, sectorNo) {
  const zone = findZoneByNo(zoneNo);
  if (!zone || zone.kind !== "special") return null;
  const sector = (zone.sectors || []).find((item) => zoneKey(item.sectorNo) === zoneKey(sectorNo));
  if (!sector) return null;
  return {
    zoneNo: zone.zoneNo,
    zoneName: escapeText(zone.zoneName),
    sectorNo: sector.sectorNo,
    sectorName: escapeText(sector.sectorName),
    sectorInchargeName: escapeText(sector.sectorInchargeName),
    contactNo: escapeText(sector.contactNo),
  };
}

export function listAllZones() {
  return allZones.map((zone) => ({
    zoneNo: zone.zoneNo,
    zoneName: escapeText(zone.zoneName),
    kind: zone.kind,
    searchLabel: zone.searchLabel,
  }));
}
