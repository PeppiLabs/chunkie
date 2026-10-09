# Security

## Reporting a problem

If you find a security problem, such as a leaked key, a malicious dependency, or a way to make the
app run code it should not, please report it privately rather than in a public issue.

On GitHub, open the **Security** tab of this repository and choose **Report a vulnerability**. Only
the maintainers can see the report.

## What this project does and does not hold

Chunkie runs entirely in the browser. It has no backend, no accounts, no database, and uses no API
keys, so there are no credentials in this repository and none should ever be added. A file a
visitor loads stays in their browser tab and is never uploaded.

Every push and pull request is scanned for keys and tokens across the full history, and every pull
request into `main` runs lint, tests, and the build.
