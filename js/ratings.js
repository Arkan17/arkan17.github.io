/* Arkoid — star ratings backed by Firebase Firestore (free Spark plan).
 * Loaded on demand by app.js only when js/ratings-config.js has a config.
 * Data: collection "ratings", one doc per (app, visitor): `${appId}_${uid}`
 *   { appId, uid, stars: 1..5, updatedAt }
 * Visitors are signed in anonymously only when they actually rate.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, serverTimestamp, collection, query, where,
  getAggregateFromServer, average, count,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(window.ARKAN_FIREBASE);
const db = getFirestore(app);
const auth = getAuth(app);
const ratingsCol = collection(db, "ratings");

async function currentUser() {
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
}

/** Average + count for one app (1 aggregation query). */
export async function summary(appId) {
  const snap = await getAggregateFromServer(query(ratingsCol, where("appId", "==", appId)), { avg: average("stars"), n: count() });
  const { avg, n } = snap.data();
  return { avg: n ? avg : 0, n };
}

/** Count per star value, 1..5 (5 small count queries), plus derived avg/total. */
export async function distribution(appId) {
  const dist = {};
  await Promise.all([1, 2, 3, 4, 5].map(async (k) => {
    const snap = await getAggregateFromServer(query(ratingsCol, where("appId", "==", appId), where("stars", "==", k)), { n: count() });
    dist[k] = snap.data().n;
  }));
  const n = Object.values(dist).reduce((a, b) => a + b, 0);
  const avg = n ? Object.entries(dist).reduce((t, [k, c]) => t + k * c, 0) / n : 0;
  return { dist, n, avg };
}

/** Save (or replace) this visitor's rating for an app. */
export async function rate(appId, stars) {
  const user = await currentUser();
  await setDoc(doc(db, "ratings", `${appId}_${user.uid}`), { appId, uid: user.uid, stars, updatedAt: serverTimestamp() });
}
