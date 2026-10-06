// §10 Tooling routes

export function health(req, res) {
  res.json({ status: 'ok', service: 'slsea-solar-api' });
}
