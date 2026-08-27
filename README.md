# Deregistered Companies Search

Search portal for the deregistered companies register. The browser sends a query to a server-side search service and receives only matching records; the source dataset is never downloaded to the browser.

The source workbook and its `data.csv` export are not included in this repository.

## Security note

GitHub Pages is static and cannot run the server-side search service. Deploy the page and `server.js` together on a private server, configure `DATA_FILE` to point to the local CSV export, and put the service behind HTTPS, authentication, and a firewall. Do not commit `data.csv` or the source workbook.
