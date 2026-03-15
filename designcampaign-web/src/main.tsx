import ReactDOM from 'react-dom/client'
import App from './App'
import '@/styles/globals.css'

// StrictMode intentionally omitted: it double-invokes effects in dev,
// which causes Mol* to call createRoot() twice on the same container.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
