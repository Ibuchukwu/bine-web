import { auth } from "./firebase.js";
import { signOut , onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";

connectAuthEmulator(auth, "http://localhost:9099");
let currentUser = null;

onAuthStateChanged(auth, async (User) => {
  if (User) {
    currentUser = User;
  } else {
    console.error("No user is signed in.");
    notice("No user is signed in.", "error");
    window.location.href = '/login.html';
  }
});

const getUser = () => currentUser;

const token = async function () {
  if (auth.currentUser) {
    return await auth.currentUser.getIdToken(true); // `true` forces refresh
  } else {
    throw new Error("No authenticated user");
  }
};

function logout() {
  signOut(auth)
    .then(() => {
      notice("Log Out Successful", "success")
      setTimeout(function(){
          window.location.href = 'login.html';
      }, 1200);
    })
    .catch((error) => {
      notice('Error logging out:', "error");
      console.error('Error logging out:', error);
    });
}

export { logout, getUser, token};
