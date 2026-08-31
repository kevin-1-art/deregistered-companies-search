const state = { records: [], query: '', date: '', limit: 25 };
const queryInput = document.querySelector('#query');
const dateInput = document.querySelector('#date-filter');
const limitInput = document.querySelector('#limit');
const results = document.querySelector('#results');
const empty = document.querySelector('#empty');
const meta = document.querySelector('#results-meta');
const title = document.querySelector('#results-title');
const status = document.querySelector('#status');

const normalize = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const escapeHtml = value => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const normalizeName = value => String(value || '').replace(/\s+/g, ' ').trim();


function score(record, query) {
  if (!query) return 0;
  const name = normalize(record.company_name);
  const brn = normalize(record.brn);
  if (name === query || brn === query) return 1000;
  if (name.startsWith(query)) return 800 - Math.min(name.length, 200);
  if (name.includes(query) || brn.includes(query)) return 600 - Math.min(name.length, 200);
  let position = 0;
  for (const character of query) { const found = name.indexOf(character, position); if (found < 0) return 0; position = found + 1; }
  return 300;
}

function render() {
  const query = normalize(state.query);
  const matching = state.records.filter(record => !state.date || record.date_of_deregistration === state.date)
    .map(record => ({ record, score: score(record, query) }))
    .filter(item => !query || item.score > 0)
    .sort((a, b) => b.score - a.score || a.record.company_name.localeCompare(b.record.company_name));
  const visible = matching.slice(0, state.limit).map(item => item.record);
  title.textContent = query || state.date ? 'Search results' : 'Search the register';
  meta.textContent = query || state.date ? `${matching.length.toLocaleString()} matching record${matching.length === 1 ? '' : 's'}` : `${state.records.length.toLocaleString()} records loaded`;
  status.textContent = `${visible.length.toLocaleString()} shown`;
  results.innerHTML = visible.map(record => `<tr><td>${escapeHtml(record.company_name)}</td><td>${escapeHtml(record.brn)}</td><td>${escapeHtml(record.date_of_deregistration)}</td></tr>`).join('');
  empty.hidden = visible.length > 0;
}

function parseCsv(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"' && text[index + 1] === '"' && quoted) { value += '"'; index++; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { row.push(value); value = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) { if (character === '\r' && text[index + 1] === '\n') index++; row.push(value); if (row.some(cell => cell.trim())) rows.push(row); row = []; value = ''; }
    else value += character;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = rows.shift().map(header => header.trim().toLowerCase().replaceAll(' ', '_'));
  return rows
    .map(columns => Object.fromEntries(headers.map((header, index) => [header, (columns[index] || '').trim()])))
    .map(record => {
      const companyName = normalizeName(record.company_name || record['company name'] || '');
      if (!companyName || !/[A-Za-z]/.test(companyName)) return null;
      return {
        ...record,
        company_name: companyName,
        brn: String(record.brn || '').trim(),
        date_of_deregistration: normalizeName(record.date_of_deregistration || record['date_of_deregistration'])
      };
    })
    .filter(Boolean);
}

queryInput.addEventListener('input', event => { state.query = event.target.value; render(); });
dateInput.addEventListener('change', event => { state.date = event.target.value; render(); });
limitInput.addEventListener('change', event => { state.limit = Number(event.target.value); render(); });
document.querySelector('#clear').addEventListener('click', () => { queryInput.value = ''; dateInput.value = ''; state.query = ''; state.date = ''; render(); queryInput.focus(); });

fetch('data.csv').then(response => response.text()).then(text => { state.records = parseCsv(text); status.textContent = 'Ready'; render(); }).catch(() => { status.textContent = 'Unavailable'; meta.textContent = 'The data could not be loaded.'; });