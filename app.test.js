const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const csv = `BRN,Company Name,Date of Deregistration
8.001E+13,-star Group Limited,2026-08-03
8.001E+13, Alberta Limited,2026-08-03
8.001E+13, Financial Services Ltd,2026-08-03
`;

function loadApp() {
  const source = fs.readFileSync('app.js', 'utf8');
  const elements = new Map();
  const makeElement = id => ({
    id,
    value: '',
    textContent: '',
    hidden: false,
    addEventListener() {},
    focus() {},
  });

  for (const id of ['query', 'date-filter', 'limit', 'results', 'empty', 'results-meta', 'results-title', 'status', 'clear']) {
    elements.set(id, makeElement(id));
  }

  const context = {
    console,
    document: {
      querySelector(selector) {
        return elements.get(selector.replace('#', '')) || null;
      },
    },
    fetch: async () => ({ text: async () => csv }),
    Node: { },
  };

  vm.runInNewContext(source, context);
  return context;
}

test('CSV parsing normalizes BRNs and trims leading punctuation from company names', () => {
  const context = loadApp();
  const records = context.parseCsv(csv);

  assert.equal(records[0].company_name, 'Star Group Limited');
  assert.equal(records[1].company_name, 'Alberta Limited');
  assert.equal(records[2].company_name, 'Financial Services Ltd');
  assert.equal(records[0].brn, '80010000000000');
  assert.equal(records[1].brn, '80010000000000');
  assert.equal(records[2].brn, '80010000000000');
});
