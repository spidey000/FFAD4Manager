# AD4 Print Station

Local Adventurer 4 slicing UI, powered by the published `three-slicer` npm packages.

```sh
npm install
npm run build
# From the project root:
ffadv4manager slicer
```

The bridge serves `web/dist` on `http://127.0.0.1:8765`. Uploading is always a separate action after slicing; starting a print requires a second confirmation.
