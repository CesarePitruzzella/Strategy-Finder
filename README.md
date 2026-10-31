# Strategy Finder

Browser-based race strategy optimizer built with React + TypeScript.
Helps the team find the best strategy for a given race, the exact type of data and their structures can be find below

Driver CSV
driver_name,base_lap_time,fuel_per_lap,tire_wear
cesare,92.5,2.1,0.05
driver_2,93.1,2.0,0.04
driver_3,92.8,2.2,0.06

Race CSV
parameter,value
race_duration_minutes,120
fuel_tank_capacity,100
pit_stop_base_time,30
tire_change_time,15
max_stint_duration,45

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

## Road Map
1) fixing the strategy algorithm
2) allowing for more competitive strategies
3) adding excel support
