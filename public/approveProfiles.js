import { makeRequest, notice, runWindow, showLoad, token } from "./utility.js";
import { auth } from "./firebase.js";
import { signOut , onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
runWindow("load","");

let allMembers = [];
let classId;

//connectAuthEmulator(auth, "http://localhost:9099");
let currentUser = null;

onAuthStateChanged(auth, async (User) => {
  if (User) {
    currentUser = User;
    loadPendingProfiles();
  } else {
    console.error("No user is signed in.");
    notice("No user is signed in.", "error");
    window.location.href = '/login.html';
  }
});

async function loadPendingProfiles() {
    runWindow("load","");
    try {
      const idToken = await token();
    
      const response = await fetch("/api/getClassMembers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
            category: "notVerified"
        })
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to load class members");
      }
      document.getElementById("classNameHeader").textContent = (data.classMeta.className).toUpperCase();
      classId = data.classMeta.classId;
      allMembers = data.members;
      populateMembersTable(allMembers, data.classMeta.className);
      runWindow('close');
    } catch (error) {
      runWindow("close","");
      console.error("Error:", error);
      notice(error.message, "error");
      runWindow('close');
    }
  }

  
function populateMembersTable(members, className) {
  document.getElementById("dues-table-container").style.display = "block";
  const TableBody = document.getElementById("TableBody");
  document.getElementById("classNameHeader").innerHTML = `Pending requests for class membership of Class ${className.toUpperCase()}`;
      let tableHTML ="";
      
      if (members.length === 0) {
        tableHTML = `
        <tr>
          <td colspan="7" class="empty-state">
            <i class="fas fa-clipboard-list"></i>
            <h3>No Profiles Awaiting verification found!</h3>
          </td>
        </tr>
        `;
      } else {
        members.forEach(member => {
          tableHTML += `
          <tr data-due-id="${member.id}">
            <td>${member.sn}</td>
            <td>${member.id}</td>
            <td>${member.name || 'N/A'}</td>
            <td>${member.phone || 'N/A'}</td>
            <td>${member.registrationDate}</td>
            <td>
              <button class="btn-view" data-id="${member.id}">Confirm Approval</button><br>
              <button class="btn-edit" data-id="${member.id}">Deny Approval</button>
            </td>
          </tr>
          `;
        });
      }
      
      document.getElementById("members-length").innerHTML = `Showing ${members.length} of ${allMembers.length} Members`;
      TableBody.innerHTML = tableHTML;
      runWindow("close","");
      
      // Add event listeners to buttons
      document.querySelectorAll('.btn-view').forEach(btn => {
        btn.addEventListener('click', (e) => approveProfile(e.target.dataset.id, "true"));
      });
      
      document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => approveProfile(e.target.dataset.id, "false"));
      });
  }

  async function approveProfile(id, approve) {
    try{
        const response = await makeRequest("/api/approveProfile", "POST", 
          {
            id: id, 
            approve: approve
          });
        const data = await response.json();
        if(!response.ok){
            notice("An Unexpected error ocurred", "error");
            return;
        }
        notice(data.message,"success");
  }catch(error){
    console.log("An error occured: ", error);
    notice(`Ops! Something went wrong! ${error}`, "error");
  }
}


const toggleSidebar = document.getElementById("toggleSidebar");
const sidebar = document.getElementById("sidebar");
const shade = document.getElementById("shade");

toggleSidebar.addEventListener("click", () => {
  sidebar.classList.toggle("show");
  shade.classList.toggle("visible");
});

shade.addEventListener("click", () => {
  sidebar.classList.remove("show");
  shade.classList.remove("visible");
});


function logout() {
    signOut(auth)
      .then(() => {
        notice("Log Out Successful", "success")
        setTimeout(function(){
            window.location.href = 'login.html';
        }, 2000);
      })
      .catch((error) => {
        // Handle errors
        notice('Error logging out:', "error");
        console.error('Error logging out:', error);
      });
  }

window.logout = logout;