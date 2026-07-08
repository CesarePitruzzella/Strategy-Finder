import Papa, { type ParseResult } from 'papaparse'
import readXlsxFile from 'read-excel-file/web-worker'
import type { DriverProfile, RaceModel, StintMode, StintOption } from './types'

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

const toMode = (value: string | number | null | undefined): StintMode => {
  const mode = String(value ?? '').trim().toLowerCase()
  if (mode.includes('lico')) {
    return 'LiCo +1'
  }
  if (mode.includes('used')) {
    return 'Used Tyre'
  }
  return 'Push'
}

const normalizeRows = (rows: unknown[][]): Row[] => {
  if (rows.length < 2) {
    return []
  }

  const header = rows[0].map((cell) => String(cell ?? '').trim())

  return rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row) => {
      const mapped: Row = {}
      header.forEach((field, index) => {
        if (field) {
          mapped[field] = (row[index] as string | number | null | undefined) ?? undefined
        }
      })
      return mapped
    })
}

const parseDriverProfiles = (rows: Row[]): DriverProfile[] =>
  rows
    .map((row) => {
      const code = String(getValue(row, ['driver', 'driver code', 'code']) ?? '')
        .trim()
        .toUpperCase()

      return {
        code,
        pushPaceSec: parseDurationToSec(
          getValue(row, ['push pace', 'pushpace', 'push_pace', 'push'])
        ),
        licoPaceSec: parseDurationToSec(
          getValue(row, ['lico pace', 'lico+1 pace', 'licopace', 'lico'])
        ),
      }
    })
    .filter((driver) => driver.code && driver.pushPaceSec > 0 && driver.licoPaceSec > 0)

const parseStints = (rows: Row[]): StintOption[] =>
  rows
    .map((row, index) => {
      const driverCode = String(getValue(row, ['driver', 'driver code', 'code']) ?? '')
        .trim()
        .toUpperCase()
      const mode = toMode(getValue(row, ['mode', 'stint mode', 'profile']))
      const durationSec = parseDurationToSec(
        getValue(row, ['duration', 'stint duration', 'time', 'duration sec'])
      )

      return {
        id: `${driverCode}-${mode}-${index}`,
        driverCode,
        mode,
        durationSec,
        laps: toNumber(getValue(row, ['laps', 'lap count']), 0),
        tyresUsed: toNumber(getValue(row, ['tyres used', 'tires used', 'tyres', 'tires']), 0),
        fuelLiters: toNumber(getValue(row, ['fuel liters', 'fuel', 'fuel l']), 0),
      }
    })
    .filter((stint) => stint.driverCode && stint.durationSec > 0 && stint.laps > 0)

const parseInit = (rows: Row[]) => {
  const keyedValues = new Map<string, number>()

  rows.forEach((row) => {
    const rawKey = getValue(row, ['key', 'name', 'setting'])
    const rawValue = getValue(row, ['value', 'val'])
    const key = String(rawKey ?? '').trim()
    if (!key) {
      return
    }

    const parsedValue = parseDurationToSec(rawValue)
    keyedValues.set(normalizeKey(key), parsedValue || toNumber(rawValue, 0))
  })

  return {
    pitlaneBaselineSec:
      keyedValues.get('pitlanebaseline') ?? keyedValues.get('pitlanebaselineloss') ?? 85,
    fullServiceSec: keyedValues.get('fullservice') ?? 56,
    fuelOnlySec: keyedValues.get('fuelonly') ?? 43,
    tyreOnlySec: keyedValues.get('tyreonly') ?? keyedValues.get('tireonly') ?? 13,
    initialTyres:
      keyedValues.get('racetyres') ?? keyedValues.get('initialtyres') ?? keyedValues.get('tyrepool') ?? 36,
    raceDurationSec:
      keyedValues.get('racedurationsec') ??
      keyedValues.get('raceduration') ??
      keyedValues.get('racetimelimit') ??
      DEFAULT_RACE_DURATION_SEC,
    finalLapAllowanceSec:
      keyedValues.get('finallapallowancesec') ??
      keyedValues.get('finallapallowance') ??
      DEFAULT_FINAL_LAP_ALLOWANCE_SEC,
    maxConsecutiveStintsPerDriver:
      keyedValues.get('maxconsecutivestints') ?? DEFAULT_MAX_CONSECUTIVE_STINTS,
  }
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

const readWorkbookRows = async (file: File) => {
  const sheets = await readXlsxFile(file)
  const bySheet = new Map<string, Row[]>()

  for (const sheet of sheets) {
    bySheet.set(normalizeKey(sheet.sheet), normalizeRows(sheet.data))
  }

  return bySheet
}

const resolveModelFromRows = ({
  driverRows,
  stintRows,
  initRows,
}: {
  driverRows: Row[]
  stintRows: Row[]
  initRows: Row[]
}): RaceModel => {
  const driverProfiles = parseDriverProfiles(driverRows)
  const stintMatrix = parseStints(stintRows)
  const init = parseInit(initRows)

  if (driverProfiles.length === 0) {
    throw new Error('No valid driver profiles found.')
  }

  if (stintMatrix.length === 0) {
    throw new Error('No valid stint matrix rows found.')
  }

  const knownDrivers = new Set(driverProfiles.map((driver) => driver.code))
  const invalidStints = stintMatrix.filter((stint) => !knownDrivers.has(stint.driverCode))
  if (invalidStints.length > 0) {
    throw new Error(`Unknown driver codes in stint matrix: ${invalidStints.map((row) => row.driverCode).join(', ')}`)
  }

  return {
    raceDurationSec: Math.max(init.raceDurationSec, 1),
    finalLapAllowanceSec: Math.max(init.finalLapAllowanceSec, 0),
    maxConsecutiveStintsPerDriver: Math.max(Math.floor(init.maxConsecutiveStintsPerDriver), 1),
    driverProfiles,
    stintMatrix,
    pitRules: {
      pitlaneBaselineSec: Math.max(init.pitlaneBaselineSec, 0),
      fullServiceSec: Math.max(init.fullServiceSec, 0),
      fuelOnlySec: Math.max(init.fuelOnlySec, 0),
      tyreOnlySec: Math.max(init.tyreOnlySec, 0),
      initialTyres: Math.max(Math.floor(init.initialTyres), 0),
    },
  }
}

export const ingestRaceConfiguration = async (file: File): Promise<RaceModel> => {
  const lowerName = file.name.toLowerCase()

  if (lowerName.endsWith('.csv')) {
    const rows = await parseCsv(file)
    return resolveModelFromRows({
      driverRows: rows,
      stintRows: rows,
      initRows: [],
    })
  }

  const bySheet = await readWorkbookRows(file)
  const driverRows = bySheet.get('driverprofiles') ?? bySheet.get('drivers') ?? []
  const stintRows = bySheet.get('stintmatrix') ?? bySheet.get('stints') ?? []
  const initRows = bySheet.get('init') ?? []

  return resolveModelFromRows({
    driverRows,
    stintRows,
    initRows,
  })
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
