import type { RepresentationStyle, ColorScheme } from './ViewerControls'

export type PresetId =
  | 'cartoon-chain'
  | 'surface-hydrophobicity'
  | 'putty-flexibility'
  | 'ghost'

export interface SimplePreset {
  kind:        'simple'
  id:          PresetId
  label:       string
  style:       RepresentationStyle
  colorScheme: ColorScheme
}

export interface GhostPreset {
  kind:  'ghost'
  id:    'ghost'
  label: string
}

export type Preset = SimplePreset | GhostPreset

export const PRESETS: Preset[] = [
  { kind: 'simple', id: 'cartoon-chain',         label: 'Cartoon / Chain',          style: 'cartoon',          colorScheme: 'chain-id'      },
  { kind: 'simple', id: 'surface-hydrophobicity', label: 'Surface / Hydrophobicity', style: 'gaussian-surface', colorScheme: 'hydrophobicity' },
  { kind: 'simple', id: 'putty-flexibility',       label: 'Putty / Flexibility',      style: 'putty',            colorScheme: 'plddt-bands'   },
  { kind: 'ghost',  id: 'ghost',                   label: 'Ghost (Surface + Cartoon)'                                                        },
]
