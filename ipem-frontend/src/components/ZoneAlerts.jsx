import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { zoneChanges } from "../zoneChanges";
import "./ZoneAlerts.css";

// Browser notifications when a device's reading moves into yellow or red.
//
// While the site is open in any tab (also in the background), every device's
// latest reading is checked once a minute. A notification is shown only when a
// measurement's zone CHANGES into yellow or red, so a reading that stays red
// does not alert again on every check. Closing the site stops the checks.

const CHECK_EVERY_MS = 60_000;
const STORAGE_KEY = "ipem-zone-alerts";
const ZONE_WORDS = { yellow: "Caution", red: "Out of range" };

const supported = typeof window !== "undefined" && "Notification" in window;

function savedChoice() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function saveChoice(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* storage blocked: the choice lasts until the page reloads */
  }
}

function notify(device, reading, metric, zone, limits, onOpen) {
  const limit = limits?.[metric];
  const unit = limit?.unit ?? "";
  const value = reading[metric];
  const shown = value == null ? "no data" : `${Number(value).toFixed(2)} ${unit}`;
  const bound =
    zone === "red"
      ? value != null && limit?.red_below != null && value < limit.red_below
        ? `below ${limit.red_below} ${unit}`
        : `above ${limit?.red_above} ${unit}`
      : `normal is ${limit?.nominal} ${unit}`;
  const overheating = metric === "temperature" && zone === "red" && limit?.overheat_alert;

  const n = new Notification(
    overheating ? `🔥 ${device.name} is overheating` : `${zone === "red" ? "🔴" : "🟡"} ${device.name}: ${limit?.label ?? metric}`,
    {
      body: `${ZONE_WORDS[zone]}: ${shown} (${bound})`,
      tag: `${device.id}-${metric}`, // a newer alert for the same reading replaces the older one
      requireInteraction: zone === "red",
    },
  );
  n.onclick = () => {
    window.focus();
    onOpen(device.id);
    n.close();
  };
}

function summarize(found, limits) {
  const red = found.filter((f) => f.zone === "red");
  const lines = [...red, ...found.filter((f) => f.zone === "yellow")]
    .slice(0, 4)
    .map((f) => `${f.zone === "red" ? "🔴" : "🟡"} ${f.device.name}: ${limits?.[f.metric]?.label ?? f.metric}`);
  if (found.length > 4) lines.push(`…and ${found.length - 4} more`);
  const n = new Notification(
    red.length ? `🔴 ${red.length} reading${red.length > 1 ? "s" : ""} out of range` : `🟡 ${found.length} reading${found.length > 1 ? "s" : ""} need attention`,
    { body: lines.join("\n"), tag: "zone-summary", requireInteraction: red.length > 0 },
  );
  n.onclick = () => {
    window.focus();
    n.close();
  };
}

export default function ZoneAlerts({ devices, limits, onOpen }) {
  const [permission, setPermission] = useState(supported ? Notification.permission : "unsupported");
  const [wanted, setWanted] = useState(savedChoice);
  const lastZones = useRef({}); // deviceId -> { metric: zone }
  const firstCheck = useRef(true);
  const on = wanted && permission === "granted";

  // Keep the latest callbacks without restarting the timer.
  const openRef = useRef(onOpen);
  const limitsRef = useRef(limits);
  useEffect(() => {
    openRef.current = onOpen;
    limitsRef.current = limits;
  });

  useEffect(() => {
    if (!on || devices.length === 0) return undefined;
    let cancelled = false;

    async function check() {
      const results = await Promise.allSettled(devices.map((d) => api.latest(d.id)));
      if (cancelled) return;
      const found = [];
      results.forEach((result, i) => {
        if (result.status !== "fulfilled") return; // device offline: skip quietly
        const device = devices[i];
        const reading = result.value;
        for (const change of zoneChanges(lastZones.current[device.id], reading.zones)) {
          found.push({ device, reading, ...change });
        }
        lastZones.current[device.id] = reading.zones ?? {};
      });
      if (firstCheck.current) {
        // On page load / turning alerts on: one summary instead of a burst.
        firstCheck.current = false;
        if (found.length) summarize(found, limitsRef.current);
        return;
      }
      for (const f of found) notify(f.device, f.reading, f.metric, f.zone, limitsRef.current, openRef.current);
    }

    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [on, devices]);

  async function turnOn() {
    const result = permission === "granted" ? "granted" : await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      lastZones.current = {}; // report anything already yellow/red once, as a summary
      firstCheck.current = true;
      setWanted(true);
      saveChoice(true);
    }
  }

  function turnOff() {
    setWanted(false);
    saveChoice(false);
  }

  if (permission === "unsupported") {
    return <p className="alerts-note">This browser can’t show notifications.</p>;
  }

  if (permission === "denied") {
    return (
      <p className="alerts-note">
        Alerts are blocked for this site. Allow notifications in your browser’s site settings, then reload.
      </p>
    );
  }

  return (
    <div className="alerts-bar">
      {on ? (
        <>
          <span className="alerts-status on">● Alerts on</span>
          <span className="alerts-help">You’ll get a notification when any device turns yellow or red while this site is open.</span>
          <button className="alerts-button" onClick={turnOff}>Turn off</button>
        </>
      ) : (
        <>
          <span className="alerts-status">Alerts off</span>
          <span className="alerts-help">Get a notification when any device turns yellow or red.</span>
          <button className="alerts-button" onClick={turnOn}>Turn on alerts</button>
        </>
      )}
    </div>
  );
}
