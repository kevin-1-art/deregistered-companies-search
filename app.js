const state = { query: '', date: '', limit: 25, requestId: 0 };
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

function render(records, total) {
  const query = normalize(state.query);
  title.textContent = query || state.date ? 'Search results' : 'Search the register';
  meta.textContent = query || state.date ? `${total.toLocaleString()} matching record${total === 1 ? '' : 's'}` : 'Enter a company name or BRN to search.';
  status.textContent = `${records.length.toLocaleString()} shown`;
  results.innerHTML = records.map(record => `<tr><td>${escapeHtml(record.company_name)}</td><td>${escapeHtml(record.brn)}</td><td>${escapeHtml(record.date_of_deregistration)}</td></tr>`).join('');
  empty.hidden = records.length > 0;
}

async function search() {
  const requestId = ++state.requestId;
  const params = new URLSearchParams({ q: state.query, date: state.date, limit: state.limit });
  status.textContent = 'Searching';
  try {
    const response = await fetch(`search?${params}`);
    if (!response.ok) throw new Error('Search unavailable');
    const payload = await response.json();
    if (requestId === state.requestId) render(payload.results, payload.total);
  } catch (error) {
    if (requestId === state.requestId) { status.textContent = 'Unavailable'; meta.textContent = 'Secure search service is not available.'; results.innerHTML = ''; empty.hidden = false; }
  }
}

queryInput.addEventListener('input', event => { state.query = event.target.value; search(); });
dateInput.addEventListener('change', event => { state.date = event.target.value; search(); });
limitInput.addEventListener('change', event => { state.limit = Number(event.target.value); search(); });
document.querySelector('#clear').addEventListener('click', () => { queryInput.value = ''; dateInput.value = ''; state.query = ''; state.date = ''; results.innerHTML = ''; empty.hidden = true; status.textContent = 'Ready'; meta.textContent = 'Enter a company name or BRN to search.'; queryInput.focus(); });