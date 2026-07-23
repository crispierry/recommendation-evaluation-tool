# Public release boundary

This repository is a synthetic demonstration. Please do not add:

- real recommendation logs or screenshots
- names or identifiers of real viewers
- third-party title catalogs or artwork
- credentials, tokens, local absolute paths, or private operational runbooks
- network dependencies in the built application

Run `npm run audit:public` before sharing a commit. The audit scans the source
and built bundle, validates the asset manifest, rejects source maps and
external runtime requests, and checks the document package.
