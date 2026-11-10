/** Simple pluggable logger used by the runtime and the Electron UI. */
export function createLogger(sink = (level, msg) => console.log(`[${level}] ${msg}`)) {
  return {
    info: (...args) => sink("info", format(args)),
    warn: (...args) => sink("warn", format(args)),
    error: (...args) => sink("error", format(args)),
    ok: (...args) => sink("ok", format(args)),
  };
}

function format(args) {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}
