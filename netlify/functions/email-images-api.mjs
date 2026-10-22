import { getStore } from '@netlify/blobs'
import { getUser } from '@netlify/identity'
import images from '../../server/email-images.js'

// Authenticated upload (POST) and owner-checked delete (DELETE) for hosted email images.
const handler = images.createApiHandler({
  getStore: () => getStore({ name: 'email-images', consistency: 'strong' }),
  getUser,
  isProduction: () => globalThis.Netlify?.context?.deploy?.context === 'production',
})

export default (req) => handler(req)

export const config = { path: '/api/email-images' }
