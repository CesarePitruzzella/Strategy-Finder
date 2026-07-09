import Papa, { type ParseResult } from 'papaparse'
import type { DriverProfile, RaceModel, PitRules, StintMode, StintOption } from './types'

interface Row {
  [key: string]: string | number | null | undefined
}

const DEFAULT_RACE_DURATION_SEC = 12 * 60 * 60
const DEFAULT_FINAL_LAP_ALLOWANCE_SEC = 150
const DEFAULT_MAX_CONSECUTIVE_STINTS = 3

const normalizeKey = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

const parseDurationToSec = (value: string | number | null | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }

  if (typeof value !== 'string') {
    return 0
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return 0
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }

  const parts = trimmed.split(':').map((chunk) => Number(chunk.trim()))
  if (parts.some((part) => Number.isNaN(part) || part < 0)) {
    return 0
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }

  return 0
}

const getValue = (row: Row, aliases: string[]): string | number | null | undefined => {
  const entries = Object.entries(row)
  for (const alias of aliases.map(normalizeKey)) {
    const match = entries.find(([key]) => normalizeKey(key) === alias)
    if (match) {
      return match[1]
    }
  }
  return undefined
}

const toNumber = (value: string | number | null | undefined, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

const parseCsv = async (file: File): Promise<Row[]> => {
  const text = await file.text()
  return new Promise<Row[]>((resolve, reject) => {
    Papa.parse<Row>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (result: ParseResult<Row>) => {
        if (result.errors.length > 0) {
          reject(new Error(result.errors[0].message))
          return
        }
        resolve(result.data)
      },
      error: (error: Error) => reject(error),
    })
  })
}

const normalizeHeaders = (rows: Row[]): string[] =>
  rows.length > 0 ? Object.keys(rows[0]).map((header) => normalizeKey(header)) : []

const requireHeaders = (rows: Row[], requiredHeaders: string[], fileLabel: string): void => {
  const headers = new Set(normalizeHeaders(rows))
  const missing = requiredHeaders.filter((header) => !headers.has(normalizeKey(header)))
  if (missing.length > 0) {
    throw new Error(`${fileLabel} is missing required columns: ${missing.join(', ')}`)
  }
}

const parseDriverProfiles = (rows: Row[]): DriverProfile[] =>
  rows
    .map((row) => {
      const code = String(getValue(row, ['driver', 'driver code', 'code']) ?? '')
        .trim()
        .toUpperCase()

      return {
        code,
        pushPaceSec: parseDurationToSec(getValue(row, ['push pace', 'pushpace', 'push_pace', 'push'])),
        licoPaceSec: parseDurationToSec(getValue(row, ['lico pace', 'lico+1 pace', 'licopace', 'lico'])),
        pushFuelUsageLiters: toNumber(
          getValue(row, ['push fuel usage', 'push fuel', 'pushfuelusage']),
          0
        ),
        licoFuelUsageLiters: toNumber(
          getValue(row, ['lico fuel usage', 'lico fuel', 'licofuelusage']),
          0
        ),
      }
    })
    .filter((driver) =>
      driver.code &&
      driver.pushPaceSec > 0 &&
      driver.licoPaceSec > 0 &&
      driver.pushFuelUsageLiters >= 0 &&
      driver.licoFuelUsageLiters >= 0
    )

const parseRaceConfig = (rows: Row[]): { raceDurationSec: number; pitRules: PitRules } => {
  const firstRow = rows[0]
  if (!firstRow) {
    return {
      raceDurationSec: DEFAULT_RACE_DURATION_SEC,
      pitRules: {
        pitlaneBaselineSec: 20,
        refuelTimeSecPerLiter: 0,
        tyreChangeTimeSec: 12,
        initialTyres: 60,
      },
    }
  }

  return {
    raceDurationSec: Math.max(
      parseDurationToSec(getValue(firstRow, ['race duration', 'duration'])),
      1
    ),
    pitRules: {
      pitlaneBaselineSec: Math.max(toNumber(getValue(firstRow, ['pitlane time']), 20), 0),
      refuelTimeSecPerLiter: Math.max(toNumber(getValue(firstRow, ['refuel time']), 0), 0),
      tyreChangeTimeSec: Math.max(toNumber(getValue(firstRow, ['tyre change time']), 12), 0),
      initialTyres: Math.max(toNumber(getValue(firstRow, ['total new tyres', 'tyres']), 60), 0),
    },
  }
}

const buildStintMatrix = (drivers: DriverProfile[]): StintOption[] => {
  return drivers.flatMap((driver, driverIndex) => {
    const usedTyreFuel = driver.pushFuelUsageLiters
    const stintOptions: Array<{ mode: StintMode; paceSec: number; fuelLiters: number; doubleStinted: boolean }> = [
      { mode: 'Push', paceSec: driver.pushPaceSec, fuelLiters: driver.pushFuelUsageLiters, doubleStinted: false },
      { mode: 'LiCo +1', paceSec: driver.licoPaceSec, fuelLiters: driver.licoFuelUsageLiters, doubleStinted: false },
      { mode: 'Used Tyre', paceSec: driver.pushPaceSec * 1.015, fuelLiters: usedTyreFuel, doubleStinted: true },
    ]

    return stintOptions.map((stint, stintIndex) => {
      return {
        id: `${driver.code}-${stint.mode}-${driverIndex}-${stintIndex}`,
        driverCode: driver.code,
        mode: stint.mode,
        durationSec: stint.paceSec,
        laps: 1,
        tyresUsed: stint.doubleStinted ? 0 : 1,
        fuelLiters: stint.fuelLiters,
      }
    })
  })
}

const resolveModelFromRows = (driverRows: Row[], raceRows: Row[]): RaceModel => {
  requireHeaders(
    driverRows,
    ['driver', 'push pace', 'lico pace', 'push fuel usage', 'lico fuel usage'],
    'Driver CSV'
  )
  requireHeaders(
    raceRows,
    ['total new tyres', 'race duration', 'pitlane time', 'refuel time', 'tyre change time'],
    'Race CSV'
  )

  const driverProfiles = parseDriverProfiles(driverRows)
  const { raceDurationSec, pitRules } = parseRaceConfig(raceRows)
  const stintMatrix = buildStintMatrix(driverProfiles)

  if (driverProfiles.length === 0) {
    throw new Error('No valid driver profiles found.')
  }

  if (stintMatrix.length === 0) {
    throw new Error('No valid stint options could be generated from the driver list.')
  }

  return {
    raceDurationSec,
    finalLapAllowanceSec: DEFAULT_FINAL_LAP_ALLOWANCE_SEC,
    maxConsecutiveStintsPerDriver: DEFAULT_MAX_CONSECUTIVE_STINTS,
    driverProfiles,
    stintMatrix,
    pitRules,
  }
}

export const ingestRaceConfiguration = async (
  driverFile: File,
  raceFile: File
): Promise<RaceModel> => {
  if (!driverFile.name.toLowerCase().endsWith('.csv') || !raceFile.name.toLowerCase().endsWith('.csv')) {
    throw new Error('Both input files must be CSV files.')
  }

  const [driverRows, raceRows] = await Promise.all([parseCsv(driverFile), parseCsv(raceFile)])
  return resolveModelFromRows(driverRows, raceRows)
}

export const formatDuration = (seconds: number): string => {
  const safe = Math.max(Math.round(seconds), 0)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = safe % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`
}
