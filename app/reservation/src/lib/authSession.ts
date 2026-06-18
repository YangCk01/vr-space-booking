export const AUTH_SESSION_VERSION_KEY = 'reservation:authSessionVersion'
export const AUTH_LOGOUT_EVENT = 'reservation:auth:logout'

export function readAuthSessionVersion() {
  return localStorage.getItem(AUTH_SESSION_VERSION_KEY) || '0'
}

export function bumpAuthSessionVersion() {
  const nextVersion = String(Number(readAuthSessionVersion()) + 1)
  localStorage.setItem(AUTH_SESSION_VERSION_KEY, nextVersion)
  return nextVersion
}

export function emitAuthLogout() {
  window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT))
}
