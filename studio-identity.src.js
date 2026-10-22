// Bundled to dist/studio-identity.js by build-site.js. Exposes the Netlify Identity session to the Studio's plain scripts.
import { getUser, login, logout, handleAuthCallback, acceptInvite, updateUser, requestPasswordRecovery, onAuthChange, MissingIdentityError } from '@netlify/identity'

window.StudioIdentity = {
  getUser,
  login,
  logout,
  handleAuthCallback,
  acceptInvite,
  updateUser,
  requestPasswordRecovery,
  onAuthChange,
  isMissing: (error) => error instanceof MissingIdentityError,
}
