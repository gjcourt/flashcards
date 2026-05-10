import { StateProvider } from './state'
import { AppRouter } from './router'

function App() {
  return (
    <StateProvider>
      <AppRouter />
    </StateProvider>
  )
}

export default App
