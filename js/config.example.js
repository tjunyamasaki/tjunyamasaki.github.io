/**
 * Copy to config.js for local testing (config.js is gitignored).
 * GitHub Actions writes js/config.js on deploy from repository secrets.
 * Never commit a service account JSON.
 */
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.apiKey !== "YOUR_API_KEY" &&
      firebaseConfig.databaseURL &&
      !firebaseConfig.databaseURL.includes("YOUR_PROJECT")
  );
}
