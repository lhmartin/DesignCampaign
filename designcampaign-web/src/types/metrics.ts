export interface MetricResult {
  name: string
  description: string
  values: Map<string, number>  // "chainId:resId" → value
  minValue: number
  maxValue: number
  unit?: string
}

export interface ProteinMetrics {
  name: string
  filePath?: string
  metrics: Record<string, number>  // metric_name → aggregate value
}
