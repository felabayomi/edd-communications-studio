import { getStore } from '@netlify/blobs'
import images from '../../server/email-images.js'

// Public, absolute HTTPS URLs for hosted images, so email clients can load them without signing in.
const handler = images.createFileHandler({
  getStore: () => getStore({ name: 'email-images', consistency: 'strong' }),
})

export default (req) => handler(req)

export const config = { path: '/email-images/*' }
