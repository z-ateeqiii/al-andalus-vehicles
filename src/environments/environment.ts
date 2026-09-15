/**
 * Public configuration. Committing this file is correct.
 *
 * The Firebase web config and the Cloudinary cloud name + unsigned preset are
 * public by design — every visitor's browser receives them. Security comes
 * from `firestore.rules` and the upload preset's own restrictions, never from
 * hiding these values (CLAUDE.md §5).
 *
 * The Firebase Admin SDK and any Cloudinary API secret must never appear here.
 */
export const environment = {
  production: true,

  firebase: {
    apiKey: 'AIzaSyAHB0b1y4rfNMdoN08W3vx2A2L2TNczfBc',
    authDomain: 'al-andalus-vehicles.firebaseapp.com',
    projectId: 'al-andalus-vehicles',
    storageBucket: 'al-andalus-vehicles.firebasestorage.app',
    messagingSenderId: '559309677123',
    appId: '1:559309677123:web:14425c82a3a13580176af6',
    // No measurementId: Google Analytics is not used. Firestore and Auth only.
  },

  cloudinary: {
    cloudName: 'qzbv9p86',
    uploadPreset: 'al_andalus_unsigned',
    folder: 'al-andalus',
  },

  /**
   * Fallback only. The live number comes from `settings/showroom` so the owner
   * can change it without a deploy — never read this from a component.
   */
  /**
   * Last-resort origin for canonical URLs and the sitemap. At runtime the
   * real host is taken from the request, so this only matters if that is
   * unavailable. Set it to the production domain once it exists.
   */
  siteUrl: 'https://al-andalus-vehicles.vercel.app',

  whatsappNumber: '201276364094',
} as const;
