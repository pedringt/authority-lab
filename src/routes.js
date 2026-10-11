// Routes (#93). Pure, so the tests can check old addresses without a browser.

// Old addresses keep working (#93): each is rewritten to where its page lives
// now, keeping its filters, before anything renders.
export function canonicalHash(hash) {
  const [path, qs = ''] = (hash || '#/overview').slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(qs);
  const at = (p, params) => { const s = params.toString(); return `#/${p}${s ? `?${s}` : ''}`; };
  if (parts[0] === 'tests' && parts.length === 1) { q.set('show', 'tests'); return at('evidence', q); }
  if (parts[0] === 'activity' && parts.length === 1) { q.set('show', 'activity'); return at('records', q); }
  if (parts[0] === 'decisions') return at(['records', ...parts.slice(1)].join('/'), q);
  if (parts[0] === 'capabilities' && parts.length === 2 && ['criteria', 'testing', 'waiting', 'evidence', 'decisions'].includes(q.get('tab'))) {
    const old = q.get('tab');
    const into = { criteria: ['evidence', 'criteria'], testing: ['evidence', 'testing'], waiting: ['decisions', 'waiting'] }[old];
    if (into) { q.set('tab', into[0]); q.set('show', into[1]); return at(parts.join('/'), q); }
  }
  return hash || '#/overview';
}
