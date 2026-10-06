// §7.12 Audit log: one JSON line per event on standard output
export function audit(event, fields = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));
}
