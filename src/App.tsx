import { useMemo, useState } from 'react'
import './App.css'
import { formatDuration, ingestRaceConfiguration } from './raceModel'
import { runOptimizerInWorker } from './optimizerClient'
import type { RaceModel, StrategyResult } from './types'

const DRIVER_COLORS = ['#2f9e44', '#1971c2', '#fab005', '#e8590c', '#9c36b5']

const blockColor = (driverCode: string, map: Map<string, string>): string => {
  const existing = map.get(driverCode)
  if (existing) {
    return existing
  }
  const color = DRIVER_COLORS[map.size % DRIVER_COLORS.length]
  map.set(driverCode, color)
  return color
}

function App() {
  const [model, setModel] = useState<RaceModel | null>(null)
  const [strategies, setStrategies] = useState<StrategyResult[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const driverColorMap = useMemo(() => new Map<string, string>(), [])

  const handleUpload = async (file: File) => {
    setError('')
    setSelectedFile(file.name)
    setStrategies([])

    try {
      const parsedModel = await ingestRaceConfiguration(file)
      setModel(parsedModel)
    } catch (uploadError) {
      setModel(null)
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to parse configuration file.')
    }
  }

  const handleOptimize = async () => {
    if (!model) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await runOptimizerInWorker(model)
      setStrategies(result.strategies)
    } catch (optimizationError) {
      setError(
        optimizationError instanceof Error
          ? optimizationError.message
          : 'Unable to compute strategies from provided race model.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app">
      <header>
        <h1>Strategy Finder</h1>
        <p>Upload your race workbook (Excel or CSV), then compute top three race plans.</p>
      </header>

      <section className="panel">
        <label htmlFor="race-config">Configuration file</label>
        <input
          id="race-config"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              void handleUpload(file)
            }
          }}
        />

        {selectedFile && <p className="meta">Loaded: {selectedFile}</p>}
        {model && (
          <p className="meta">
            Drivers: {model.driverProfiles.length} · Stints: {model.stintMatrix.length} · Tyres:{' '}
            {model.pitRules.initialTyres}
          </p>
        )}

        <button type="button" disabled={!model || loading} onClick={() => void handleOptimize()}>
          {loading ? 'Optimizing…' : 'Run Optimizer (Web Worker)'}
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="results">
        {strategies.map((strategy) => {
          const totalDuration = strategy.totalTimeSec || 1
          return (
            <article key={strategy.id} className="strategy-card">
              <h2>{strategy.label}</h2>
              <p>
                Laps: <strong>{strategy.totalLaps.toFixed(2)}</strong> · Time:{' '}
                <strong>{formatDuration(strategy.totalTimeSec)}</strong> · Pit Stops:{' '}
                <strong>{strategy.pitStops}</strong> · Tyres Left: <strong>{strategy.tyresRemaining}</strong>
              </p>

              <div className="timeline" aria-label={`${strategy.label} timeline`}>
                {strategy.blocks.map((block, index) => (
                  <div
                    key={`${strategy.id}-${index}`}
                    className="block"
                    style={{
                      width: `${Math.max(((block.endSec - block.startSec) / totalDuration) * 100, 1)}%`,
                      backgroundColor: blockColor(block.driverCode, driverColorMap),
                    }}
                    title={`${block.driverCode} ${block.mode} · ${formatDuration(block.endSec - block.startSec)} · ${block.laps.toFixed(2)} laps`}
                  >
                    <span>{block.driverCode}</span>
                    <small>{block.mode}</small>
                  </div>
                ))}
              </div>

              <div className="instructions">
                {strategy.blocks.map((block, index) => (
                  <div key={`${strategy.id}-pit-${index}`} className="instruction-card">
                    <h3>Pit Stop {index + 1}</h3>
                    <p>
                      Service: {block.pit.service} ({Math.round(block.pit.lossSec)}s) · Driver: {block.driverCode}
                    </p>
                    <p>
                      Fuel: {block.fuelLiters}L · Mode: {block.mode} · Tyres Remaining: {block.tyresRemaining}
                    </p>
                    <p>
                      Window: {formatDuration(block.startSec)} → {formatDuration(block.endSec)} · Laps +
                      {block.laps.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}

export default App
