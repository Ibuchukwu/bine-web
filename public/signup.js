import { notice, runWindow, showLoad } from "./utility.js";
import { onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
import { auth } from "./firebase.js";
let userId;

//connectAuthEmulator(auth, "http://localhost:9099");

onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log(user);
        userId = user.uid;
        if(window.location.pathname == "/setup"){
            updateOptions('university', 'universities');
            try {
                const token = await user.getIdToken();
                const response = await fetch("/api/dashboard", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });
                const data = await response.json();
                if(data.success){
                    window.location.href = "dashboard.html";
                }
            } catch (error) {
                console.error("Error loading Setup Page:", error);
            }
        }
    }else if(window.location.pathname != '/signup'){
        notice("Kindly Sign In", "error");
        setTimeout(() => {
            window.location.href = "./login.html";
        }, 3000);
    }
});//updateOptions('university', 'universities');

function signup(){
    const fname = document.getElementById("fname").value;
    const onames = document.getElementById("onames").value;
    const email = document.getElementById("email").value;
    const phone = document.getElementById("phone").value;
    const regno = document.getElementById("regno").value;
    const password = document.getElementById("password").value;
    const confirm_password = document.getElementById("confirm-password").value; 
    
    let checkRadio = document.querySelector('input[name="role"]:checked');
    const role = checkRadio ? `${checkRadio.value}` : `No Role Selected!`

    if (!checkRadio) {
        notice("No Role Selected! Kindly select a role.", "info");
    }
    if (!confirm_password) {
        notice("Please confirm your password!", "info");
    }
    if (!password) {
        notice("Kindly Create a password!.", "info");
    }
    if (!regno) {
        notice("Please, Input your University Registration / Matriculation Number.", "info");
    }
    if (!phone) {
        notice("Kindly input your Phone Number!", "info");
    }
    if (!email) {
        notice("Kindly input your E-mail!", "info");
    }
    if (!onames) {
        notice("Input your other names!", "info");
    }
    if (!fname) {
        notice("Input your first name", "info");
    }
    if (password !== confirm_password) {
        notice("Passwords doesn't Match!", "info");
    }else{
        showLoad("show", "signup_button");
        const payload = {fname, onames, email, phone, password, regno, role};
        fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({payload})
          })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                notice("Account Creation Successful!", "success");
                showLoad("hide", "signup_button");
                document.getElementById("signup_button").textContent = `Create Account`;
                setTimeout(() => {
                    window.location.href= "login.html";
                }, 2000);
              } else {
                notice(data.message, "error");  // Show any error message from the API
                showLoad("hide", "signup_button");
              }
            })
            .catch(error => {
              console.error('Error:', error);
              notice('An error occurred during signup.', "error");
                showLoad("hide", "signup_button");
            });
        }
    }

/**
 * Fetches, i.e populates the options.. 
 * @param {string} section - Either 'universities', 'faculties' or 'departments', it's simply what to fetch
 * @param {string} setElementId - ID of input selection element to update
 * @returns 
 */
async function updateOptions(setElementId, section) {
    const sectionElement = document.getElementById(setElementId);
    sectionElement.innerHTML = `<option value=''>Loading ${section}...</option>`;
    const user = auth.currentUser;
    if (!user) {
        notice("No user is currently signed in!", "error");
        console.error("Firebase auth.currentUser is null");
        return;
    }
    const payload = {section};
    payload.universityId = document.getElementById("university").value;
    payload.facultyId = document.getElementById("faculty").value;
    payload.departmentId = document.getElementById("department").value;
    const idToken = await user.getIdToken();
    await fetch("/api/getSection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify(payload)
      })
      .then(async res => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Fetch failed");
        }
        return res.json();
      })
      .then(data => {
        sectionElement.innerHTML = "<option value=''>Select...</option>";
        sectionElement.disabled = false;
        if (!data.subSections?.length) {
            sectionElement.innerHTML = section == "faculties" ? "<option value=''> --No faculty found!-- </option>" : "<option value=''> --No department found!-- </option>";
          notice(`No ${section} found under selected parent.`, "error");
          return;
        }
        data.subSections.forEach(sub => {
            const option = document.createElement("option");
            option.value = section == "faculties"  ? sub.facultyId : section == "departments" ? sub.departmentId : section == "classes" ? data.subSections : sub.Id;
            option.textContent = sub.facultyName || sub.departmentName || sub.name;
            sectionElement.appendChild(option);
          });
      })
      .catch(err => {
        console.error(err);
        notice(`Error fetching ${section}: ${err.message}`, "error");
      });
}

async function parseSection(section, sectionname, sectionid){
    const universityId = document.getElementById("university").value;
    const facultyId = document.getElementById("faculty").value;

    const sectionName = document.getElementById(sectionname).value;
    const sectionId = (document.getElementById(sectionid).value).toLowerCase();

    if(section == "faculty"){
        if(!sectionName){
            notice("Kindly Input the name of the faculty to be added!", "info");
            return;
        }else if(!sectionId){
            notice("Kindly Input the acronym of the faculty to be added!", "info");
            return;
        }
    }if(section == "department"){
        if(!sectionName){
            notice("Kindly Input the name of the department to be added!", "info");
            return;
        }else if(!sectionId){
            notice("Kindly Input the acronym of the department to be added!", "info");
            return;
        }
    }
    const preContent = `<i class="fa-solid fa-spinner fa-spin-pulse" style="left: 50%; margin: auto;"></i><br><p style="margin: auto;">Adding ${section}</p>`;
    runWindow("show", preContent);
    const payload = { universityId, facultyId, sectionId, sectionName};

    const user = auth.currentUser;
    if (!user) {
        notice("No user is currently signed in!", "error");
        console.error("Firebase auth.currentUser is null");
        return;
    }

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/addSection', {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "authorization": `Bearer ${idToken}`
            },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (data.success) {
            notice(section + " added Successfully!", "success");
            runWindow("close",);
            setTimeout(() => {
                reload();
            }, 3000);
        } else {
            notice(data.message, "error");
        }

    } catch (error) {
        console.error('Error during fetch:', error);
        notice('An error occurred while adding section.', "error");
    }
}

function addSection(section) {
    const university = document.getElementById("university").value;
    if (!university) {
        notice(section == "faculty" ? "Select Your University First" : "Select Your Faculty First", "error");
        return;
    }

    if (section == 'faculty') {
        let pageContent = `
            <div class="modal-content">
                <h3>Add a New Faculty</h3>
                <hr>
                <label for="faculty-name"><b>Faculty Name</b></label>
                <input type="text" id="faculty-name" placeholder="e.g., Faculty of Science" required>
                <label for="faculty-ac"><b>Faculty Acronym</b></label>
                <input type="text" id="faculty-ac" placeholder="e.g., FOS (School Approved)" required>
                <div class="button-group">
                    <button id="add-faculty" onclick="parseSection('faculty','faculty-name', 'faculty-ac')">Add Faculty</button>
                    <button id="cancel" onclick="runWindow('close','')">Cancel</button>
                </div>
            </div>
        `;
        runWindow("open", pageContent);
    } else if (section == 'department') {
        const faculty = document.getElementById("faculty").value;
        if (!faculty) {
            notice("Select Your Faculty First", "error");
            return;
        }
        let pageContent = `
            <div class="modal-content">
                <h3>Add a New Department</h3>
                <hr>
                <label for="department-name"><b>Department Name</b></label>
                <input type="text" id="department-name" placeholder="e.g., Computer Science" required>
                <label for="department-ac"><b>Department Acronym</b></label>
                <input type="text" id="department-ac" placeholder="e.g., CSC (School Approved)" required>
                <div class="button-group">
                    <button id="add-department" onclick="parseSection('department','department-name', 'department-ac')">Add Department</button>
                    <button id="cancel" onclick="runWindow('close','')">Cancel</button>
                </div>
            </div>
        `;
        runWindow("open", pageContent);
    }
}

async function createClass(){
    const universityId = document.getElementById("university").value;
    const facultyId = document.getElementById("faculty").value;
    const departmentId = document.getElementById("department").value;
    const theClass = (document.getElementById("curClass").value).toString().trim();
    
    if (!university) {
        notice("No Univerisity Selected! Kindly select your university.", "info");
    }
    if (!faculty) {
        notice("Please select your Faculty!", "info");
    }
    if (!department) {
        notice("Kindly input your Department!.", "info");
    }
    if (!theClass) {
        notice("Please, Input academic session of your class' admission!", "info");
    }else{
        showLoad("show", "createClass");
        const payload = {universityId, facultyId, departmentId, theClass};
        console.log("Payload:", payload);
        try {
            const user = auth.currentUser;
            if (!user) {
                notice("No user is currently signed in!", "error");
                console.error("Auth.currentUser is null");
                return;
            }
            const idToken = await user.getIdToken();        
            const response = await fetch('/api/createClass', {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "authorization": `Bearer ${idToken}`
                },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (data.success) {
                notice(data.message, "success");
                runWindow("close",);
                setTimeout(() => {
                    window.location.href = "./dashboard.html";
                }, 1000);
            } else {
                notice(data.message, "error");
            }
            showLoad("hide", 'createClass');
        } catch (error) {
            console.error('Error during fetch:', error);
            notice('An error occurred while adding section.', "error");
            showLoad("hide", 'createClass');
        }
    }
}

function reload(){
    window.location.reload();
}
window.reload = reload;
window.parseSection = parseSection;
window.runWindow = runWindow;
window.signup = signup;
window.createClass = createClass;
window.addSection = addSection;
window.updateOptions = updateOptions;