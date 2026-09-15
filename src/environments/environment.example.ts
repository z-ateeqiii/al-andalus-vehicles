/**
 * Template for `environment.ts`. Copy it, fill in the values for your own
 * Firebase project and Cloudinary account, and commit the result — these are
 * public values (see the note in `environment.ts`).
 *
 * Where each value comes from:
 *
 *   firebase.*          Firebase console → Project settings → Your apps → Web app
 *                       config. Omit `measurementId`; this project does not use
 *                       Google Analytics.
 *   cloudinary.cloudName    Cloudinary dashboard → Product environment cloud name.
 *   cloudinary.uploadPreset Settings → Upload → Upload presets → an *unsigned*
 *                       preset restricted to a single folder.
 *   cloudinary.folder   The folder that preset is restricted to.
 *   whatsappNumber      Fallback only, international format with no `+`.
 *                       The live number lives in `settings/showroom`.
 */
export const environment = {
  production: true,

  firebase: {
    apiKey: 'YOUR_FIREBASE_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT.firebasestorage.app',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID',
  },

  cloudinary: {
    cloudName: 'YOUR_CLOUD_NAME',
    uploadPreset: 'YOUR_UNSIGNED_PRESET',
    folder: 'YOUR_FOLDER',
  },

  /**
   * Last-resort origin for canonical URLs and the sitemap. At runtime the
   * real host is taken from the request, so this only matters if that is
   * unavailable. Set it to the production domain once it exists.
   */
  siteUrl: 'https://al-andalus-vehicles.vercel.app',

  whatsappNumber: '201000000000',
} as const;
