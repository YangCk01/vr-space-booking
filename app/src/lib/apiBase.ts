const localHosts = new Set(["localhost", "127.0.0.1", "::1"])
const devFrontendPorts = new Set(["5175", "5176"])

function getDefaultApiBaseHost() {
  const hostname = window.location.hostname || "localhost"
  const isLocal = localHosts.has(hostname)
  const apiPort = isLocal && devFrontendPorts.has(window.location.port) ? "4001" : "4000"
  return `http://${hostname}:${apiPort}`
}

export const API_BASE_HOST = import.meta.env.VITE_API_BASE_URL || getDefaultApiBaseHost()
export const API_BASE_URL = import.meta.env.VITE_API_URL || `${API_BASE_HOST}/api`
