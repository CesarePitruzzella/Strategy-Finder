# Strategy Finder

Browser-based race strategy optimizer built with React + TypeScript.

## Features

- Excel/CSV ingestion in-browser (`read-excel-file` + `papaparse`)
- Validated JSON race model (drivers, stint matrix, pit rules)
- Web Worker optimizer (forward dynamic programming with dominance pruning)
- Multi-objective top 3 strategy output:
  - Maximum lap pace optimum
  - Minimum pit-stop profile
  - Aggressive sprint / fresh-rubber profile
- Dashboard timeline, pit instructions, and tyre tracking

## Development

```bash
npm install
npm run lint
npm run build
npm run dev
```

## Expected workbook sheets

- `Driver Profiles` (or `Drivers`)
- `Stint Matrix` (or `Stints`)
- `INIT`

CSV ingestion is supported for quick iteration with a single table using compatible column names.
