// Which zone changes deserve a notification: a measurement moving into yellow
// or red. Staying in the same zone, or improving from red to yellow, does not.
export function zoneChanges(previous, zones) {
  const changes = [];
  for (const [metric, zone] of Object.entries(zones ?? {})) {
    if (zone !== "yellow" && zone !== "red") continue;
    if (previous?.[metric] === zone) continue; // no change
    if (previous?.[metric] === "red" && zone === "yellow") continue; // getting better
    changes.push({ metric, zone });
  }
  return changes;
}
