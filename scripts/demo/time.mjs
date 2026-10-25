export function chicagoParts(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function chicagoDay(date) {
  const parts = chicagoParts(date);
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function addCalendarDays(day, delta) {
  const utc = new Date(Date.UTC(day.year, day.month - 1, day.day + delta));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

export function formatDay(day) {
  const month = String(day.month).padStart(2, "0");
  const date = String(day.day).padStart(2, "0");
  return `${day.year}-${month}-${date}`;
}

export function chicagoInstant(day, hour, minute) {
  for (const offsetHours of [5, 6]) {
    const utc = new Date(Date.UTC(day.year, day.month - 1, day.day, hour + offsetHours, minute));
    const got = chicagoParts(utc);
    if (got.year === day.year && got.month === day.month && got.day === day.day && got.hour === hour && got.minute === minute) {
      return utc;
    }
  }
  throw new Error(`America/Chicago ${formatDay(day)} ${hour}:${minute} is not a real local time`);
}

export function liveSprintWindow(now) {
  const start = new Date(now.getTime() - 25 * 60 * 1000);
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(Math.floor(start.getUTCMinutes() / 5) * 5);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  if (!(start < now && end > now) || end.getTime() - now.getTime() < 30 * 60 * 1000) {
    throw new Error("live sprint window is not inside the finish window");
  }
  return { start, end };
}
