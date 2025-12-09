import { notice, runWindow, showLoad, token } from "./utility.js";
import { auth } from "./firebase.js";
import { signOut , onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
runWindow("load","");

let allMembers = [];
let classId;

connectAuthEmulator(auth, "http://localhost:9099");
let currentUser = null;

onAuthStateChanged(auth, async (User) => {
  if (User) {
    currentUser = User;
    console.log("UID is :", currentUser.uid);
    runWindow("close","");
    loadClassMembers();
  } else {
    console.error("No user is signed in.");
    notice("No user is signed in.", "error");
    window.location.href = '/login.html';
  }
});

runWindow("load", "");      

async function loadClassMembers() {
    try {
      const idToken = await token();
    
      const response = await fetch("/api/getClassMembers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          category: "all"
        })
      });
      const data = await response.json();
      runWindow("load");
      while(!data){
        //waiting for data to return
      }
      if (!data.success) {
        throw new Error(data.error || "Failed to load class members");
      }
      document.getElementById("schoolName").textContent = data.classMeta.universityName;
      document.getElementById("facultyName").textContent = data.classMeta.facultyName;
      document.getElementById("profileDepartmentName").textContent = data.classMeta.departmentName;
      document.getElementById("curClass").textContent = (data.classMeta.className).toUpperCase();
      classId = data.classMeta.classId;
      allMembers = data.members;
      populateMembersTable(allMembers, data.classMeta.className);
    } catch (error) {
      runWindow("close","");
      console.error("Error:", error);
      notice(error.message, "error");
    }
  }
  
  function populateMembersTable(members, className) {
    console.log("Preparing Table...");
    const TableBody = document.getElementById("TableBody");
    document.getElementById("classNameHeader").innerHTML = `Class Members of Class ${className.toUpperCase()}`;
    let tableHTML ="";
    
    if (members.length === 0) {
      tableHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <i class="fas fa-clipboard-list"></i>
          <h3>No Profiles found</h3>
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
          <td>${member.email || 'N/A'}</td>
          <td>${member.registrationDate}</td>
          <td>
            <button class="btn-view" data-id="${member.id}">View</button><br>
            <button class="btn-edit" data-id="${member.id}">Edit</button>
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
      btn.addEventListener('click', (e) => viewMember(e.target.dataset.id));
    });
    
    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => editMember(e.target.dataset.id));
    });
}
  // Example button handlers
  function viewMember(memberId) {
    console.log("View member:", memberId);
    // Implement view functionality
  }
  
  function editMember(memberId) {
    console.log("Edit member:", memberId);
    // Implement edit functionality
  }
  
  async function exportToPDF() {
    showLoad("show", "exportPdfBtn");
    try {
      const idToken = await token();
      const payload = {};
      notice("Generating PDF...", "info");
      
      const response = await fetch("/api/exportClassMembersPdf", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
  
      if (!response.ok) throw new Error("Failed to generate PDF");
  
      // Convert response to Blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ClassMembers_${payload.classId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
  
      notice("PDF downloaded successfully!", "success");
      showLoad("hide", "exportPdfBtn");
    } catch (error) {
      notice(`Export failed: ${error.message}`, "error");
      console.error("Export Error:", error);
    }
  }

  // Search functionality
document.getElementById("searchBtn").addEventListener("click", performSearch);
document.getElementById("searchInput").addEventListener("keypress", function(e) {
  if (e.key === "Enter") {
    performSearch();
  }
});
document.getElementById("clearSearchBtn").addEventListener("click", clearSearch);
document.getElementById("addStudent").addEventListener('click', function(){
  runWindow('open', `
    <div class="modal-content">
      <div class="modal-header">
        <h2 class="modal-title">Create New Student Profile</h2>
      </div>
      <div class="modal-body">
        <form id="createDueForm" class="create-due-form">
          <div class="form-header">
            <h3>Profile Details:</h3>
            <p>Fill in the students' details below to create a new profile</p>
          </div>
          
          <div class="form-grid">
            <!-- Row 1 -->
            <div class="form-group">
                <label for="fname">First Name:</label>
                <input type="text" id="fname" name="fname" required autocomplete="name"><br>
            </div>
            
            <div class="form-group">
                <label for="onames">Other Names (Surname First):</label>
                <input type="text" id="onames" name="onames" required autocomplete="family-name"><br>
            </div>
            
            <div class="form-group">
                <label for="regno">Registration / Matriculation Number:</label>
                <input type="text" id="regno" name="regno" required><br>
            </div>

            <div class="form-group">
                <label for="email">Email Address:</label>
                <input type="email" id="email" name="email" autocomplete="email"><br>
            </div>

            <div class="form-group">
                <label for="phone">Phone Number:</label>
                <input type="tel" id="phone" name="phone" required autocomplete="tel-national"><br> 
            </div>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" id="cancelCreate" onclick="runWindow('close','')">Cancel</button>
        <button class="btn btn-primary" id="createProfile-button" onclick='createProfile()'>Create Profile</button>
      </div>
  </div>`);
});

async function createProfile(){
    const fname = document.getElementById("fname").value;
    const onames = document.getElementById("onames").value;
    const email = document.getElementById("email").value;
    const phone = document.getElementById("phone").value;
    const regno = document.getElementById("regno").value;

    if (!regno) {
        notice("Please, Input your University Registration / Matriculation Number.", "info");
        return;
    }
    if (!phone) {
        notice("Kindly input your Phone Number!", "info");
        return;
    }
    if (!email) {
        notice("Kindly input your E-mail!", "info");
        return;
    }
    if (!onames) {
        notice("Input your other names!", "info");
        return;
    }
    if (!fname) {
        notice("Input your first name", "info");
        return;
    }
    else{
        showLoad("show", "createProfile-button");
        const payload = {fname, onames, email, phone, regno, classId};
        const idToken = await token();
        fetch('/api/createProfile', {
            method: 'POST',
            headers: {
               'Content-Type': 'application/json', 
               "Authorization": `Bearer ${idToken}`
              },
            body: JSON.stringify({payload})
          })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                notice(data.message, "success");
                showLoad("hide", "createProfile-button");
                runWindow('close');
              } else {
                notice(data.message, "error");  // Show any error message from the API
                document.getElementById("createProfile-button").innerHTML = `Create Profile`;
                document.getElementById("createProfile-button").disabled = false;
                showLoad("hide", "createProfile-button");
              }
            })
            .catch(error => {
              console.error('Error:', error);
              notice('An error occurred during profile creation.', "error");
              showLoad("hide", "createProfile-button");
            });
        }
    }

function performSearch() {
  const searchTerm = document.getElementById("searchInput").value.toLowerCase().trim();
  if (!searchTerm) {
    notice("Please enter a search term", "info");
    return;
  }
  
  const filteredMembers = allMembers.filter(member => 
    (member.name && member.name.toLowerCase().includes(searchTerm)) ||
    (member.id && member.id.toLowerCase().includes(searchTerm)) ||
    (member.email && member.email.toLowerCase().includes(searchTerm))
  );
  
  if (filteredMembers.length === 0) {
    notice("No matching records found", "info");
  }
  
  populateMembersTable(filteredMembers, document.getElementById("curClass").textContent);
}

function clearSearch() {
  document.getElementById("searchInput").value = "";
  populateMembersTable(allMembers, document.getElementById("curClass").textContent);
}
  
document.getElementById("exportPdfBtn").addEventListener("click", exportToPDF);

window.runWindow = runWindow;
window.createProfile = createProfile;

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